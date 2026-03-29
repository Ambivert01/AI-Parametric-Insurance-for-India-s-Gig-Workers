const cron = require('node-cron');
const logger = require('../utils/logger');

let _io = null;

/**
 * Register all scheduled cron jobs
 * Called once at server startup
 */
const startCronJobs = (io) => {
  _io = io;

  // ─── 1. Trigger Engine: every 15 minutes ────────────────
  cron.schedule('*/15 * * * *', async () => {
    try {
      const { runPollingCycle } = require('../services/trigger-engine/triggerService');
      await runPollingCycle(_io);
    } catch (err) {
      logger.error(`Trigger polling cron failed: ${err.message}`);
    }
  }, { timezone: 'Asia/Kolkata' });

  // ─── 2. Lapse unpaid policies: every 30 minutes ─────────
  cron.schedule('*/30 * * * *', async () => {
    try {
      const { lapseUnpaidPolicies } = require('../services/policy/policyService');
      await lapseUnpaidPolicies();
    } catch (err) {
      logger.error(`Policy lapse cron failed: ${err.message}`);
    }
  }, { timezone: 'Asia/Kolkata' });

  // ─── 3. Auto-renewals: Sunday 8 PM IST ──────────────────
  cron.schedule('0 20 * * 0', async () => {
    try {
      const { processAutoRenewals } = require('../services/policy/policyService');
      await processAutoRenewals();
    } catch (err) {
      logger.error(`Auto-renewal cron failed: ${err.message}`);
    }
  }, { timezone: 'Asia/Kolkata' });

  // ─── 4. Renewal reminders: Sunday 6 PM IST ──────────────
  cron.schedule('0 18 * * 0', async () => {
    try {
      const Policy = require('../models/Policy');
      const { POLICY_STATUS } = require('../config/constants');
      const { sendBulkNotification } = require('../services/notification/notificationService');
      const { getPolicyWeekId } = require('../utils/dateTime');

      const activePolicies = await Policy.find({
        weekId: getPolicyWeekId(),
        status: POLICY_STATUS.ACTIVE,
        isAutoRenew: false, // only manual-renew riders get reminder
      }).select('riderId tier premiumAmountInr').lean();

      if (activePolicies.length > 0) {
        const notifications = activePolicies.map(p =>
          require('../services/notification/notificationService').sendNotification(
            p.riderId.toString(), 'renewal-reminder', { tier: p.tier, amountInr: p.premiumAmountInr }
          )
        );
        await Promise.allSettled(notifications);
        logger.info(`Renewal reminders sent to ${activePolicies.length} riders`);
      }
    } catch (err) {
      logger.error(`Renewal reminder cron failed: ${err.message}`);
    }
  }, { timezone: 'Asia/Kolkata' });

  // ─── 5. Daily analytics snapshot: midnight IST ──────────
  cron.schedule('0 0 * * *', async () => {
    try {
      const { getQueue } = require('../workers/queueManager');
      const { QUEUES } = require('../config/constants');
      await getQueue(QUEUES.ANALYTICS).add('daily-snapshot', {}, { delay: 5000 });
    } catch (err) {
      logger.error(`Analytics cron failed: ${err.message}`);
    }
  }, { timezone: 'Asia/Kolkata' });

  // ─── 6. Loyalty pool weekly close + carry-forward: Monday 6 AM ─
  cron.schedule('0 6 * * 1', async () => {
    try {
      const { LoyaltyPool } = require('../models/index');
      const { getPolicyWeekId } = require('../utils/dateTime');
      const moment = require('moment-timezone');
      const lastWeekId = getPolicyWeekId(
        moment().tz('Asia/Kolkata').subtract(1, 'week').toDate()
      );

      const pool = await LoyaltyPool.findOne({ weekId: lastWeekId, isClosed: false });
      if (pool) {
        const carryForward = Math.round(pool.balanceInr * 0.3); // 30% carries forward
        pool.carryForwardInr = carryForward;
        pool.isClosed = true;
        pool.closedAt = new Date();
        await pool.save();

        // Seed new week's pool with carry-forward
        const thisWeekId = getPolicyWeekId();
        await LoyaltyPool.findOneAndUpdate(
          { weekId: thisWeekId },
          { $inc: { balanceInr: carryForward, contributionsInr: carryForward } },
          { upsert: true }
        );
        logger.info(`Loyalty pool closed for ${lastWeekId}, carry-forward: ₹${carryForward}`);
      }
    } catch (err) {
      logger.error(`Loyalty pool cron failed: ${err.message}`);
    }
  }, { timezone: 'Asia/Kolkata' });

  // ─── 7. Safe week streak + loyalty tier update: Monday 6:05 AM ─
  cron.schedule('5 6 * * 1', async () => {
    try {
      const User = require('../models/User');
      const Claim = require('../models/Claim');
      const { CLAIM_STATUS, LOYALTY_DISCOUNTS } = require('../config/constants');
      const { getPolicyWeekId } = require('../utils/dateTime');
      const moment = require('moment-timezone');

      const lastWeekId = getPolicyWeekId(
        moment().tz('Asia/Kolkata').subtract(1, 'week').toDate()
      );

      // Find riders who had active policy last week with no claims
      const Policy = require('../models/Policy');
      const activeLast = await Policy.find({ weekId: lastWeekId, status: 'active' })
        .select('riderId').lean();
      const riderIds = activeLast.map(p => p.riderId.toString());

      const claimedRiders = new Set(
        (await Claim.find({
          riderId: { $in: riderIds },
          status: CLAIM_STATUS.PAYOUT_COMPLETED,
          createdAt: { $gte: new Date(Date.now() - 8 * 24 * 3600000) },
        }).select('riderId').lean()).map(c => c.riderId.toString())
      );

      for (const riderId of riderIds) {
        if (claimedRiders.has(riderId)) {
          // Reset streak
          await User.findByIdAndUpdate(riderId, { $set: { safeWeekStreak: 0 } });
        } else {
          // Increment streak
          const user = await User.findByIdAndUpdate(
            riderId,
            { $inc: { safeWeekStreak: 1, totalSafeWeeks: 1 } },
            { new: true }
          );

          // Update loyalty tier + discount
          const milestone = LOYALTY_DISCOUNTS.slice().reverse()
            .find(m => user.safeWeekStreak >= m.weeks);
          if (milestone) {
            await User.findByIdAndUpdate(riderId, {
              $set: { loyaltyDiscount: milestone.discount, loyaltyTier: milestone.label.toLowerCase().replace(' ', '_') },
            });
            if (LOYALTY_DISCOUNTS.map(m => m.weeks).includes(user.safeWeekStreak)) {
              const { sendNotification } = require('../services/notification/notificationService');
              await sendNotification(riderId, 'streak-milestone', {
                weeks: user.safeWeekStreak,
                discount: milestone.discount,
              });
            }
          }
        }
      }

      logger.info(`Streak update completed for ${riderIds.length} riders`);
    } catch (err) {
      logger.error(`Streak cron failed: ${err.message}`);
    }
  }, { timezone: 'Asia/Kolkata' });

  // ─── 8. Clear expired cache: every 6 hours ────────────────
  cron.schedule('0 */6 * * *', async () => {
    try {
      const { redis } = require('../config/redis');
      const weatherCleared = await redis.flushPattern('weather:*');
      const aqiCleared = await redis.flushPattern('aqi:*');
      logger.info(`Cache cleared: weather=${weatherCleared}, aqi=${aqiCleared} keys`);
    } catch (err) {
      logger.error(`Cache clear cron failed: ${err.message}`);
    }
  });

  logger.info('📅 All cron jobs registered');
};

module.exports = { startCronJobs };
