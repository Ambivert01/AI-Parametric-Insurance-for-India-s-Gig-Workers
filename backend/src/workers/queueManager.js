// ══════════════════════════════════════════════════════════
// workers/queueManager.js — Bull queue setup
// ══════════════════════════════════════════════════════════
const Bull = require('bull');
const { QUEUES } = require('../config/constants');
const logger = require('../utils/logger');

const queues = {};
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const getQueue = (name) => {
  if (!queues[name]) {
    queues[name] = new Bull(name, REDIS_URL, {
      defaultJobOptions: {
        removeOnComplete: 100,  // keep last 100 completed jobs
        removeOnFail: 200,      // keep last 200 failed jobs
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    });

    // Attach event listeners
    queues[name].on('failed', (job, err) => {
      logger.error(`Queue [${name}] job ${job.id} failed (attempt ${job.attemptsMade}): ${err.message}`);
    });
    queues[name].on('stalled', (job) => {
      logger.warn(`Queue [${name}] job ${job.id} stalled`);
    });
    queues[name].on('completed', (job) => {
      logger.info(`Queue [${name}] job ${job.id} completed`);
    });
  }
  return queues[name];
};

const closeAllQueues = async () => {
  await Promise.all(Object.values(queues).map(q => q.close()));
  logger.info('All queues closed');
};

// ══════════════════════════════════════════════════════════
// workers/fraudWorker.js — Fraud check processor
// ══════════════════════════════════════════════════════════
const startFraudWorker = (io) => {
  const queue = getQueue(QUEUES.FRAUD_CHECK);
  queue.process('check-claim', 5, async (job) => { // concurrency 5
    const { claimId, isRainEvent } = job.data;
    const { runFraudCheckOnClaim } = require('../services/claims/claimsService');
    await runFraudCheckOnClaim(claimId, isRainEvent, io);
    return { claimId, processed: true };
  });
  logger.info('✅ Fraud worker started (concurrency: 5)');
};

// ══════════════════════════════════════════════════════════
// workers/payoutWorker.js — Payment processor
// ══════════════════════════════════════════════════════════
const startPayoutWorker = (io) => {
  const queue = getQueue(QUEUES.PAYOUT);
  queue.process('initiate-payout', 3, async (job) => { // concurrency 3
    const { claimId, riderId, amountInr, channel } = job.data;
    const { initiatePayout } = require('../services/payment/paymentService');
    const payout = await initiatePayout({ claimId, riderId, amountInr, channel });

    if (io) {
      io.to(`rider:${riderId}`).emit('payout:completed', {
        amountInr, payoutRef: payout.payoutRef,
      });
    }
    return { payoutRef: payout.payoutRef };
  });

  // Auto-renewal job
  queue.process('auto-renew', 2, async (job) => {
    const { riderId, tier, weekId } = job.data;
    logger.info(`Processing auto-renewal for rider ${riderId}, week ${weekId}`);
    // In production: charge via stored UPI mandate
    // For now: create pending policy and notify rider
    const { createPolicy } = require('../services/policy/policyService');
    const { sendNotification } = require('../services/notification/notificationService');
    const policy = await createPolicy(riderId, tier, `auto-renew-${weekId}`, true);
    await sendNotification(riderId, 'renewal-reminder', { tier, amountInr: policy.premiumAmountInr });
    return { policyId: policy._id };
  });

  logger.info('✅ Payout worker started (concurrency: 3)');
};

// ══════════════════════════════════════════════════════════
// workers/notificationWorker.js
// ══════════════════════════════════════════════════════════
const startNotificationWorker = () => {
  const queue = getQueue(QUEUES.NOTIFICATION);
  queue.process('*', 10, async (job) => { // concurrency 10, catch all job names
    const { riderId, ...data } = job.data;
    const { sendNotification } = require('../services/notification/notificationService');
    await sendNotification(riderId, job.name, data);
    return { sent: true };
  });
  logger.info('✅ Notification worker started (concurrency: 10)');
};

// ══════════════════════════════════════════════════════════
// workers/claimWorker.js — Trigger→Claim pipeline
// ══════════════════════════════════════════════════════════
const startClaimWorker = (io) => {
  const queue = getQueue(QUEUES.CLAIM_PROCESS);
  queue.process('process-trigger', 2, async (job) => {
    const { triggerId, cityId } = job.data;
    const { processTriggerEvent } = require('../services/claims/claimsService');
    const result = await processTriggerEvent(triggerId, io);
    return result;
  });
  logger.info('✅ Claim worker started (concurrency: 2)');
};

// ══════════════════════════════════════════════════════════
// workers/blockchainWorker.js — On-chain logging
// ══════════════════════════════════════════════════════════
const startBlockchainWorker = () => {
  const queue = getQueue(QUEUES.BLOCKCHAIN_LOG);

  queue.process('log-payout', 1, async (job) => {
    const { claimId, payoutId, riderId, amountInr } = job.data;
    try {
      const { logPayoutOnChain } = require('../services/blockchain/blockchainOracle');
      await logPayoutOnChain({ claimId, payoutId, riderId, amountInr });
    } catch (err) {
      logger.warn(`Blockchain log failed for claim ${claimId}: ${err.message}. Will retry.`);
      throw err; // allow Bull to retry
    }
  });

  queue.process('log-trigger', 1, async (job) => {
    const { triggerId } = job.data;
    try {
      const { logTriggerOnChain } = require('../services/blockchain/blockchainOracle');
      await logTriggerOnChain(triggerId);
    } catch (err) {
      logger.warn(`Blockchain trigger log failed: ${err.message}`);
      throw err;
    }
  });

  logger.info('✅ Blockchain worker started (concurrency: 1)');
};

// ══════════════════════════════════════════════════════════
// workers/analyticsWorker.js
// ══════════════════════════════════════════════════════════
const startAnalyticsWorker = () => {
  const queue = getQueue(QUEUES.ANALYTICS);
  queue.process('daily-snapshot', 1, async () => {
    const { computeDailySnapshot } = require('../services/analytics/analyticsService');
    await computeDailySnapshot();
  });
  logger.info('✅ Analytics worker started');
};

// ══════════════════════════════════════════════════════════
// Start all workers
// ══════════════════════════════════════════════════════════
const startAllWorkers = (io) => {
  startFraudWorker(io);
  startPayoutWorker(io);
  startNotificationWorker();
  startClaimWorker(io);
  startBlockchainWorker();
  startAnalyticsWorker();
  logger.info('🚀 All queue workers running');
};

module.exports = { getQueue, startAllWorkers, closeAllQueues };
