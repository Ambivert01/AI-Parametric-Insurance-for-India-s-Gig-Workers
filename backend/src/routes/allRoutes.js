// ══════════════════════════════════════════════════════════
// routes/policy.routes.js
// ══════════════════════════════════════════════════════════
const express = require('express');
const Joi = require('joi');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { validate, limiters } = require('../middleware/index');
const {
  getPremiumQuote, createPolicy, activatePolicy,
  getActivePolicyForRider,
} = require('../services/policy/policyService');
const { createPremiumOrder, verifyPremiumPayment } = require('../services/payment/paymentService');
const { sendSuccess, sendNotFound, sendBadRequest } = require('../utils/response');
const { ROLES, COVERAGE_TIERS } = require('../config/constants');

// GET /api/v1/policies/quote?tier=STANDARD
router.get('/quote', authenticate, async (req, res, next) => {
  try {
    const tier = (req.query.tier || 'STANDARD').toUpperCase();
    if (!COVERAGE_TIERS[tier]) return sendBadRequest(res, 'Invalid tier');
    const quote = await getPremiumQuote(req.user._id, tier);
    sendSuccess(res, quote);
  } catch (err) { next(err); }
});

// POST /api/v1/policies — Create policy + Razorpay order
router.post('/', authenticate, limiters.payment,
  validate(Joi.object({
    tier: Joi.string().valid(...Object.keys(COVERAGE_TIERS)).required(),
    isAutoRenew: Joi.boolean().default(false),
  })),
  async (req, res, next) => {
    try {
      const { tier, isAutoRenew } = req.body;
      // Get quote first to get amount
      const quote = await getPremiumQuote(req.user._id, tier.toUpperCase());
      // Create Razorpay order
      const order = await createPremiumOrder(req.user._id, 'temp', quote.premiumAmountInr);
      // Create policy record (pending payment)
      const policy = await createPolicy(req.user._id, tier, order.orderId, isAutoRenew);
      sendSuccess(res, { policy, paymentOrder: order }, 201);
    } catch (err) { next(err); }
  }
);

// POST /api/v1/policies/:id/confirm-payment
router.post('/:id/confirm-payment', authenticate,
  validate(Joi.object({
    paymentId: Joi.string().required(),
    signature: Joi.string().required(),
    orderId: Joi.string().required(),
  })),
  async (req, res, next) => {
    try {
      const { paymentId, signature, orderId } = req.body;
      const valid = await verifyPremiumPayment(orderId, paymentId, signature);
      if (!valid) return sendBadRequest(res, 'Payment verification failed');
      const policy = await activatePolicy(req.params.id, paymentId);
      sendSuccess(res, { policy });
    } catch (err) { next(err); }
  }
);

// GET /api/v1/policies/active
router.get('/active', authenticate, async (req, res, next) => {
  try {
    const policy = await getActivePolicyForRider(req.user._id);
    if (!policy) return sendSuccess(res, null);
    sendSuccess(res, policy);
  } catch (err) { next(err); }
});

// GET /api/v1/policies — Policy history
router.get('/', authenticate, async (req, res, next) => {
  try {
    const Policy = require('../models/Policy');
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    const [policies, total] = await Promise.all([
      Policy.find({ riderId: req.user._id }).sort({ createdAt: -1 }).skip(skip).limit(+limit).lean(),
      Policy.countDocuments({ riderId: req.user._id }),
    ]);
    const { sendPaginated } = require('../utils/response');
    sendPaginated(res, policies, total, page, limit);
  } catch (err) { next(err); }
});

// POST /api/v1/policies/auto-renew — Toggle auto-renewal
router.patch('/auto-renew', authenticate,
  validate(Joi.object({ enabled: Joi.boolean().required() })),
  async (req, res, next) => {
    try {
      const Policy = require('../models/Policy');
      const { getPolicyWeekId } = require('../utils/dateTime');
      const policy = await Policy.findOneAndUpdate(
        { riderId: req.user._id, weekId: getPolicyWeekId(), status: 'active' },
        { $set: { isAutoRenew: req.body.enabled } },
        { new: true }
      );
      if (!policy) return sendNotFound(res, 'Active policy');
      sendSuccess(res, { isAutoRenew: policy.isAutoRenew });
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════
// routes/claims.routes.js
// ══════════════════════════════════════════════════════════
const claimsRouter = express.Router();
const { submitAppeal, getRiderClaims } = require('../services/claims/claimsService');

// GET /api/v1/claims
claimsRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const result = await getRiderClaims(req.user._id, +page, +limit);
    const { sendPaginated } = require('../utils/response');
    sendPaginated(res, result.claims, result.total, result.page, result.limit);
  } catch (err) { next(err); }
});

// GET /api/v1/claims/:id
claimsRouter.get('/:id', authenticate, async (req, res, next) => {
  try {
    const Claim = require('../models/Claim');
    const claim = await Claim.findOne({ _id: req.params.id, riderId: req.user._id })
      .populate('eventId', 'triggerType triggerValue cityId detectedAt')
      .lean();
    if (!claim) return sendNotFound(res, 'Claim');
    sendSuccess(res, claim);
  } catch (err) { next(err); }
});

// POST /api/v1/claims/:id/appeal
claimsRouter.post('/:id/appeal', authenticate,
  validate(Joi.object({
    reason: Joi.string().min(20).max(1000).required(),
    evidenceUrls: Joi.array().items(Joi.string().uri()).max(5).default([]),
  })),
  async (req, res, next) => {
    try {
      const claim = await submitAppeal(req.params.id, req.user._id, req.body.reason, req.body.evidenceUrls);
      sendSuccess(res, { claim, message: 'Appeal submitted. We\'ll review within 4 hours.' });
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════
// routes/payment.routes.js
// ══════════════════════════════════════════════════════════
const paymentRouter = express.Router();
const { verifyBankAccount, getPayoutHistory } = require('../services/payment/paymentService');

// POST /api/v1/payments/verify-bank
paymentRouter.post('/verify-bank', authenticate,
  validate(Joi.object({ upiId: Joi.string().min(5).max(100).required() })),
  async (req, res, next) => {
    try {
      const result = await verifyBankAccount(req.user._id, req.body.upiId);
      sendSuccess(res, result);
    } catch (err) { next(err); }
  }
);

// GET /api/v1/payments/history
paymentRouter.get('/history', authenticate, async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const result = await getPayoutHistory(req.user._id, +page, +limit);
    const { sendPaginated } = require('../utils/response');
    sendPaginated(res, result.payouts, result.total, result.page, result.limit);
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════
// routes/analytics.routes.js (Rider-facing)
// ══════════════════════════════════════════════════════════
const analyticsRouter = express.Router();
const { getRiderDashboard } = require('../services/analytics/analyticsService');

// GET /api/v1/analytics/dashboard
analyticsRouter.get('/dashboard', authenticate, async (req, res, next) => {
  try {
    const data = await getRiderDashboard(req.user._id.toString());
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════
// routes/admin.routes.js
// ══════════════════════════════════════════════════════════
const adminRouter = express.Router();
const { getAdminDashboard, getRiskHeatmap, getPredictedClaims } = require('../services/analytics/analyticsService');
const { injectManualTrigger } = require('../services/trigger-engine/triggerService');

// All admin routes require ADMIN or INSURER role
adminRouter.use(authenticate, authorize(ROLES.ADMIN, ROLES.INSURER, ROLES.SUPER_ADMIN));

// GET /api/v1/admin/dashboard
adminRouter.get('/dashboard', async (req, res, next) => {
  try {
    const data = await getAdminDashboard();
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

// GET /api/v1/admin/heatmap
adminRouter.get('/heatmap', async (req, res, next) => {
  try {
    const data = await getRiskHeatmap();
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

// GET /api/v1/admin/predictions
adminRouter.get('/predictions', async (req, res, next) => {
  try {
    const data = await getPredictedClaims();
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

// GET /api/v1/admin/triggers
adminRouter.get('/triggers', async (req, res, next) => {
  try {
    const TriggerEvent = require('../models/TriggerEvent');
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    const [events, total] = await Promise.all([
      TriggerEvent.find().sort({ detectedAt: -1 }).skip(skip).limit(+limit).lean(),
      TriggerEvent.countDocuments(),
    ]);
    const { sendPaginated } = require('../utils/response');
    sendPaginated(res, events, total, page, limit);
  } catch (err) { next(err); }
});

// POST /api/v1/admin/triggers/inject — Demo: manual trigger injection
adminRouter.post('/triggers/inject',
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN),
  validate(Joi.object({
    cityId: Joi.string().required(),
    triggerType: Joi.string().required(),
    triggerValue: Joi.number().required(),
  })),
  async (req, res, next) => {
    try {
      const { cityId, triggerType, triggerValue } = req.body;
      const event = await injectManualTrigger(cityId, triggerType, triggerValue, req.app.get('io'));
      sendSuccess(res, event, 201);
    } catch (err) { next(err); }
  }
);

// GET /api/v1/admin/claims — All claims with filters
adminRouter.get('/claims', async (req, res, next) => {
  try {
    const Claim = require('../models/Claim');
    const { status, cityId, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (cityId) filter.cityId = cityId;
    const skip = (page - 1) * limit;
    const [claims, total] = await Promise.all([
      Claim.find(filter).sort({ detectedAt: -1 }).skip(skip).limit(+limit)
        .populate('riderId', 'name phone')
        .lean(),
      Claim.countDocuments(filter),
    ]);
    const { sendPaginated } = require('../utils/response');
    sendPaginated(res, claims, total, page, limit);
  } catch (err) { next(err); }
});

// PATCH /api/v1/admin/claims/:id/review — Manual review decision
adminRouter.patch('/claims/:id/review',
  validate(Joi.object({
    decision: Joi.string().valid('approve', 'reject').required(),
    note: Joi.string().max(500),
  })),
  async (req, res, next) => {
    try {
      const Claim = require('../models/Claim');
      const { CLAIM_STATUS, QUEUES } = require('../config/constants');
      const { getQueue } = require('../workers/queueManager');
      const claim = await Claim.findById(req.params.id);
      if (!claim) return sendNotFound(res, 'Claim');

      if (req.body.decision === 'approve') {
        claim.status = CLAIM_STATUS.APPROVED;
        claim.approvedAt = new Date();
        claim.reviewedBy = req.user._id;
        claim.manualReviewNote = req.body.note;
        await claim.save();
        await getQueue(QUEUES.PAYOUT).add('initiate-payout', {
          claimId: claim._id.toString(),
          riderId: claim.riderId.toString(),
          amountInr: claim.finalPayoutInr,
          channel: 'upi',
        });
      } else {
        claim.status = CLAIM_STATUS.REJECTED;
        claim.rejectedAt = new Date();
        claim.rejectReason = req.body.note || 'Manual review decision';
        claim.reviewedBy = req.user._id;
        await claim.save();
      }
      sendSuccess(res, { claimId: claim.claimId, status: claim.status });
    } catch (err) { next(err); }
  }
);

// GET /api/v1/admin/fraud-logs
adminRouter.get('/fraud-logs', async (req, res, next) => {
  try {
    const { FraudLog } = require('../models/index');
    const { page = 1, limit = 20, tier } = req.query;
    const filter = tier ? { tier } : {};
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      FraudLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(+limit)
        .populate('riderId', 'name phone fraudScore').lean(),
      FraudLog.countDocuments(filter),
    ]);
    const { sendPaginated } = require('../utils/response');
    sendPaginated(res, logs, total, page, limit);
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════
// routes/webhook.routes.js
// ══════════════════════════════════════════════════════════
const webhookRouter = express.Router();
const { handleRazorpayWebhook } = require('../services/payment/paymentService');
const { verifyWebhookSignature } = require('../utils/crypto');

// POST /api/v1/webhooks/razorpay
webhookRouter.post('/razorpay',
  express.raw({ type: 'application/json' }), // raw body for signature verification
  async (req, res, next) => {
    try {
      const signature = req.headers['x-razorpay-signature'];
      const isValid = verifyWebhookSignature(req.body, signature, process.env.RAZORPAY_WEBHOOK_SECRET);
      if (!isValid) return res.status(400).json({ error: 'Invalid signature' });

      const event = req.headers['x-razorpay-event-id']
        ? JSON.parse(req.body.toString()).event
        : req.body.event;
      const payload = JSON.parse(req.body.toString()).payload;

      await handleRazorpayWebhook(event, payload);
      res.json({ received: true });
    } catch (err) { next(err); }
  }
);

// Export all routers
module.exports = {
  policyRouter: router,
  claimsRouter,
  paymentRouter,
  analyticsRouter,
  adminRouter,
  webhookRouter,
};
