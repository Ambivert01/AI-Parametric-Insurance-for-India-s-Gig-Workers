const axios = require('axios');
const { Payout } = require('../../models/index');
const Claim = require('../../models/Claim');
const Policy = require('../../models/Policy');
const User = require('../../models/User');
const { redis, KEYS } = require('../../config/redis');
const {
  PAYMENT_STATUS, PAYMENT_CHANNELS, CLAIM_STATUS,
  BUSINESS_RULES, QUEUES, SOCKET_EVENTS,
} = require('../../config/constants');
const { generateIdempotencyKey, encrypt, decrypt } = require('../../utils/crypto');
const logger = require('../../utils/logger');

// ─── Razorpay client (lazy init) ─────────────────────────
let _razorpay = null;
const getRazorpay = () => {
  if (!_razorpay) {
    const Razorpay = require('razorpay');
    _razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return _razorpay;
};

// ─── Mock payout for dev/test ─────────────────────────────
const mockPayout = async (amount, upiId, purpose) => {
  await new Promise(r => setTimeout(r, 500)); // simulate latency
  return {
    id: `mock_payout_${Date.now()}`,
    status: 'processed',
    amount: amount * 100, // paise
    utr: `UTR${Date.now()}`,
    mode: 'UPI',
  };
};

// ──────────────────────────────────────────────────────────
// CREATE RAZORPAY ORDER (for premium payment)
// ──────────────────────────────────────────────────────────
const createPremiumOrder = async (riderId, policyId, amountInr) => {
  const idempotencyKey = generateIdempotencyKey('ORDER');

  const orderOptions = {
    amount: amountInr * 100, // convert to paise
    currency: 'INR',
    receipt: `GS-PREM-${policyId}`,
    notes: {
      riderId: riderId.toString(),
      policyId: policyId.toString(),
      type: 'weekly_premium',
    },
  };

  if (process.env.NODE_ENV === 'production') {
    const order = await getRazorpay().orders.create(orderOptions);
    return { orderId: order.id, amount: amountInr, currency: 'INR', key: process.env.RAZORPAY_KEY_ID };
  }

  // Dev mock
  return {
    orderId: `order_mock_${Date.now()}`,
    amount: amountInr,
    currency: 'INR',
    key: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock',
  };
};

// ──────────────────────────────────────────────────────────
// VERIFY PAYMENT (webhook / client callback)
// ──────────────────────────────────────────────────────────
const verifyPremiumPayment = async (orderId, paymentId, signature) => {
  if (process.env.NODE_ENV !== 'production') {
    return true; // skip verification in dev
  }
  const crypto = require('crypto');
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return expected === signature;
};

// ──────────────────────────────────────────────────────────
// INITIATE PAYOUT (claim payout to rider's UPI/bank)
// ──────────────────────────────────────────────────────────
const initiatePayout = async ({ claimId, riderId, amountInr, channel }) => {
  const claim = await Claim.findById(claimId);
  const rider = await User.findById(riderId)
    .select('bankDetails name phone notificationPrefs')
    .lean();

  if (!claim || !rider) throw new Error('Claim or rider not found');
  if (!rider.bankDetails?.verified) {
    throw Object.assign(new Error('Rider bank details not verified'), { statusCode: 400 });
  }

  // Idempotency: prevent double payout
  const idempotencyKey = generateIdempotencyKey(`PAY-${claimId}`);
  const existing = await Payout.findOne({ idempotencyKey });
  if (existing) {
    logger.warn(`Duplicate payout attempt for claim ${claimId}`);
    return existing;
  }

  const upiId = rider.bankDetails.upiId; // stored encrypted

  // Create payout record
  const payout = new Payout({
    claimId: claim._id,
    riderId: rider._id || riderId,
    policyId: claim.policyId,
    amountInr,
    channel: PAYMENT_CHANNELS.UPI,
    gateway: 'razorpay',
    upiId: encrypt(upiId || 'mock@upi'),
    status: PAYMENT_STATUS.PROCESSING,
    idempotencyKey,
  });
  await payout.save();

  // Update claim status
  claim.status = CLAIM_STATUS.PAYOUT_INITIATED;
  claim.paymentId = payout._id;
  claim.payoutInitiatedAt = new Date();
  await claim.save();

  let gatewayResponse;
  try {
    if (process.env.NODE_ENV === 'production' && process.env.RAZORPAY_KEY_ID) {
      // Real Razorpay payout
      gatewayResponse = await getRazorpay().payouts.create({
        account_number: process.env.RAZORPAY_PAYOUT_ACCOUNT,
        amount: amountInr * 100,
        currency: 'INR',
        mode: 'UPI',
        purpose: 'payout',
        fund_account: {
          account_type: 'vpa',
          vpa: { address: upiId },
          contact: {
            name: rider.name,
            contact: rider.phone,
            type: 'customer',
          },
        },
        queue_if_low_balance: true,
        reference_id: payout.payoutRef,
        narration: `GigShield Claim ${claim.claimId}`,
      });
    } else {
      // Mock payout
      gatewayResponse = await mockPayout(amountInr, upiId, `GigShield Claim ${claim.claimId}`);
    }

    // Success
    payout.gatewayPayoutId = gatewayResponse.id;
    payout.gatewayStatus = gatewayResponse.status;
    payout.status = PAYMENT_STATUS.COMPLETED;
    payout.completedAt = new Date();
    await payout.save();

    // Update claim
    claim.status = CLAIM_STATUS.PAYOUT_COMPLETED;
    claim.payoutCompletedAt = new Date();
    claim.totalProcessingMs = claim.payoutCompletedAt - claim.detectedAt;
    await claim.save();

    // Update policy payout total
    await Policy.findByIdAndUpdate(claim.policyId, {
      $inc: { claimsCount: 1, totalPayoutInr: amountInr },
      $max: { lastClaimAt: new Date() },
    });

    // Update rider safe week streak (reset on claim)
    await User.findByIdAndUpdate(riderId, { $set: { safeWeekStreak: 0 } });

    logger.payment(payout.payoutRef, amountInr, 'completed', { claimId, riderId });

    // Queue notifications
    const { getQueue } = require('../../workers/queueManager');
    await getQueue(QUEUES.NOTIFICATION).add('payout-success', {
      riderId: riderId.toString(),
      claimId: claimId.toString(),
      amountInr,
      payoutRef: payout.payoutRef,
      utr: gatewayResponse.utr || gatewayResponse.id,
      triggerType: claim.triggerType,
    });

    // Queue blockchain logging
    await getQueue(QUEUES.BLOCKCHAIN_LOG).add('log-payout', {
      claimId: claimId.toString(),
      payoutId: payout._id.toString(),
      riderId: riderId.toString(),
      amountInr,
    });

    return payout;

  } catch (err) {
    logger.error(`Payout failed for claim ${claimId}: ${err.message}`);

    payout.status = PAYMENT_STATUS.FAILED;
    payout.failReason = err.message;
    payout.retryCount += 1;
    await payout.save();

    claim.status = CLAIM_STATUS.PAYOUT_FAILED;
    await claim.save();

    // If retries remaining → re-queue
    if (payout.retryCount < payout.maxRetries) {
      const { getQueue } = require('../../workers/queueManager');
      const delay = Math.pow(2, payout.retryCount) * 30000; // 30s, 60s, 120s
      await getQueue(QUEUES.PAYOUT).add('initiate-payout', {
        claimId: claimId.toString(), riderId: riderId.toString(), amountInr, channel,
      }, { delay, attempts: 1 });
      logger.warn(`Payout retry ${payout.retryCount}/${payout.maxRetries} queued for ${claimId}`);
    }

    throw err;
  }
};

// ──────────────────────────────────────────────────────────
// BANK ACCOUNT VERIFICATION (Penny Drop)
// ──────────────────────────────────────────────────────────
const verifyBankAccount = async (riderId, upiId) => {
  // In production: use Razorpay Fund Account Validation API
  // For now: mock successful verification
  await User.findByIdAndUpdate(riderId, {
    $set: {
      'bankDetails.upiId': encrypt(upiId),
      'bankDetails.verified': true,
      'bankDetails.verifiedAt': new Date(),
    },
  });
  await redis.del(KEYS.session(riderId.toString()));
  logger.audit('BANK_VERIFIED', riderId, { method: 'upi' });
  return { verified: true, method: 'upi' };
};

// ──────────────────────────────────────────────────────────
// GET PAYOUT HISTORY
// ──────────────────────────────────────────────────────────
const getPayoutHistory = async (riderId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  const [payouts, total] = await Promise.all([
    Payout.find({ riderId, status: PAYMENT_STATUS.COMPLETED })
      .sort({ completedAt: -1 })
      .skip(skip).limit(limit)
      .populate('claimId', 'claimId triggerType cityId')
      .lean(),
    Payout.countDocuments({ riderId, status: PAYMENT_STATUS.COMPLETED }),
  ]);

  // Mask sensitive data before returning
  const masked = payouts.map(p => ({ ...p, upiId: undefined, bankAccount: undefined }));
  return { payouts: masked, total, page, limit };
};

// ──────────────────────────────────────────────────────────
// HANDLE RAZORPAY WEBHOOK
// ──────────────────────────────────────────────────────────
const handleRazorpayWebhook = async (event, payload) => {
  logger.info(`Razorpay webhook: ${event}`);

  switch (event) {
    case 'payment.captured': {
      const { order_id, id: paymentId, amount } = payload.payment.entity;
      // Find policy with this order ID and activate it
      const Policy = require('../../models/Policy');
      const policy = await Policy.findOne({ paymentId: order_id });
      if (policy) {
        const { activatePolicy } = require('../policy/policyService');
        await activatePolicy(policy._id.toString(), paymentId);

        const { getQueue } = require('../../workers/queueManager');
        await getQueue(QUEUES.NOTIFICATION).add('policy-activated', {
          riderId: policy.riderId.toString(),
          policyId: policy._id.toString(),
          tier: policy.tier,
          weekId: policy.weekId,
          amountInr: amount / 100,
        });
      }
      break;
    }
    case 'payout.processed': {
      const { id: payoutId, status } = payload.payout.entity;
      await Payout.findOneAndUpdate(
        { gatewayPayoutId: payoutId },
        { $set: { gatewayStatus: status, status: PAYMENT_STATUS.COMPLETED, completedAt: new Date() } }
      );
      break;
    }
    case 'payout.failed': {
      const { id: payoutId, failure_reason } = payload.payout.entity;
      await Payout.findOneAndUpdate(
        { gatewayPayoutId: payoutId },
        { $set: { gatewayStatus: 'failed', status: PAYMENT_STATUS.FAILED, failReason: failure_reason } }
      );
      break;
    }
  }
};

module.exports = {
  createPremiumOrder, verifyPremiumPayment,
  initiatePayout, verifyBankAccount,
  getPayoutHistory, handleRazorpayWebhook,
};
