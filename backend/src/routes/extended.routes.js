const express = require('express');
const Joi = require('joi');
const { authenticate, authorize, optionalAuth } = require('../middleware/auth');
const { validate, limiters } = require('../middleware/index');
const { sendSuccess, sendNotFound, sendBadRequest, sendPaginated } = require('../utils/response');
const { ROLES } = require('../config/constants');

// ══════════════════════════════════════════════════════════
// COMMUNITY ROUTER
// ══════════════════════════════════════════════════════════
const communityRouter = express.Router();
const {
  getCommunityStats, getLoyaltyPoolStats,
  getWalletBalance, redeemWalletBalance,
  applyReferralCode, getReferralStats,
  getNotificationHistory, markNotificationsRead,
} = require('../services/community/communityService');

// GET /api/v1/community/stats?cityId=mumbai&platform=zomato
communityRouter.get('/stats', authenticate, async (req, res, next) => {
  try {
    const { cityId, platform } = req.query;
    const city = cityId || req.user.riderProfile?.cityId;
    const stats = await getCommunityStats(city, platform);
    sendSuccess(res, stats);
  } catch (err) { next(err); }
});

// GET /api/v1/community/pool
communityRouter.get('/pool', authenticate, async (req, res, next) => {
  try {
    const stats = await getLoyaltyPoolStats(req.query.weekId);
    sendSuccess(res, stats);
  } catch (err) { next(err); }
});

// GET /api/v1/community/leaderboard
communityRouter.get('/leaderboard', authenticate, async (req, res, next) => {
  try {
    const User = require('../models/User');
    const top = await User.find({ safeWeekStreak: { $gt: 0 }, role: 'rider' })
      .select('name safeWeekStreak loyaltyTier riderProfile.platform riderProfile.cityId')
      .sort({ safeWeekStreak: -1 })
      .limit(20)
      .lean();
    // Anonymize — show first name + city only
    const masked = top.map((u, i) => ({
      rank: i + 1,
      displayName: u.name.split(' ')[0] + ' ' + (u.riderProfile?.cityId || ''),
      safeWeekStreak: u.safeWeekStreak,
      loyaltyTier: u.loyaltyTier,
    }));
    sendSuccess(res, masked);
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════
// WALLET ROUTER
// ══════════════════════════════════════════════════════════
const walletRouter = express.Router();

// GET /api/v1/wallet/balance
walletRouter.get('/balance', authenticate, async (req, res, next) => {
  try {
    const balance = await getWalletBalance(req.user._id);
    sendSuccess(res, balance);
  } catch (err) { next(err); }
});

// POST /api/v1/wallet/redeem
walletRouter.post('/redeem', authenticate,
  validate(Joi.object({
    amountInr: Joi.number().min(10).max(500).required(),
    purpose: Joi.string().valid('premium_discount', 'cash').default('premium_discount'),
  })),
  async (req, res, next) => {
    try {
      const result = await redeemWalletBalance(req.user._id, req.body.amountInr, req.body.purpose);
      sendSuccess(res, result);
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════
// REFERRAL ROUTER
// ══════════════════════════════════════════════════════════
const referralRouter = express.Router();

// GET /api/v1/referral
referralRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const stats = await getReferralStats(req.user._id);
    sendSuccess(res, stats);
  } catch (err) { next(err); }
});

// POST /api/v1/referral/apply
referralRouter.post('/apply', authenticate,
  validate(Joi.object({ code: Joi.string().min(4).max(20).required() })),
  async (req, res, next) => {
    try {
      const result = await applyReferralCode(req.user._id, req.body.code);
      sendSuccess(res, result);
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════
// NOTIFICATIONS ROUTER
// ══════════════════════════════════════════════════════════
const notificationsRouter = express.Router();

// GET /api/v1/notifications
notificationsRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const history = await getNotificationHistory(req.user._id, req.query.limit || 20);
    sendSuccess(res, history);
  } catch (err) { next(err); }
});

// PATCH /api/v1/notifications/read
notificationsRouter.patch('/read', authenticate, async (req, res, next) => {
  try {
    await markNotificationsRead(req.user._id);
    sendSuccess(res, { marked: true });
  } catch (err) { next(err); }
});

// PATCH /api/v1/notifications/prefs
notificationsRouter.patch('/prefs', authenticate,
  validate(Joi.object({
    whatsapp: Joi.boolean(),
    sms: Joi.boolean(),
    push: Joi.boolean(),
    email: Joi.boolean(),
  })),
  async (req, res, next) => {
    try {
      const User = require('../models/User');
      const { redis, KEYS } = require('../config/redis');
      const user = await User.findByIdAndUpdate(
        req.user._id,
        { $set: { notificationPrefs: req.body } },
        { new: true }
      );
      await redis.del(KEYS.session(req.user._id.toString()));
      sendSuccess(res, { notificationPrefs: user.notificationPrefs });
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════
// KYC ROUTER
// ══════════════════════════════════════════════════════════
const kycRouter = express.Router();
const { verifySelfie, verifyAadhaar, getKYCStatus } = require('../services/kyc/kycService');

// GET /api/v1/kyc/status
kycRouter.get('/status', authenticate, async (req, res, next) => {
  try {
    const status = await getKYCStatus(req.user._id);
    sendSuccess(res, status);
  } catch (err) { next(err); }
});

// POST /api/v1/kyc/selfie
kycRouter.post('/selfie', authenticate,
  validate(Joi.object({ imageBase64: Joi.string().min(100).required() })),
  async (req, res, next) => {
    try {
      const result = await verifySelfie(req.user._id, req.body.imageBase64);
      sendSuccess(res, result);
    } catch (err) { next(err); }
  }
);

// POST /api/v1/kyc/aadhaar
kycRouter.post('/aadhaar', authenticate,
  validate(Joi.object({
    aadhaarNumber: Joi.string().length(12).pattern(/^\d+$/).required(),
    name: Joi.string().min(2).max(100).optional(),
  })),
  async (req, res, next) => {
    try {
      const result = await verifyAadhaar(req.user._id, req.body.aadhaarNumber, req.body.name);
      sendSuccess(res, result);
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════
// CLAIMS — selfie upload for orange tier
// ══════════════════════════════════════════════════════════
const claimsExtRouter = express.Router();
const { approveAfterSelfieVerification } = require('../services/claims/claimsService');
const axios = require('axios');

// POST /api/v1/claims/:id/selfie
claimsExtRouter.post('/:id/selfie', authenticate,
  validate(Joi.object({ imageBase64: Joi.string().min(100).required() })),
  async (req, res, next) => {
    try {
      // Call ML service for rain detection
      let selfieHasRain = false;
      try {
        const mlRes = await axios.post(
          `${process.env.ML_SERVICE_URL}/api/v1/ml/detect/rain-in-image`,
          { imageBase64: req.body.imageBase64 },
          { headers: { 'x-service-secret': process.env.ML_SERVICE_SECRET }, timeout: 5000 }
        );
        selfieHasRain = mlRes.data.data?.hasRain || false;
      } catch (e) {
        selfieHasRain = true; // if ML unavailable, pass selfie (don't penalize)
      }

      const selfieUrl = `https://gigshield-kyc.s3.amazonaws.com/selfies/claim_${req.params.id}_${Date.now()}.jpg`;
      const claim = await approveAfterSelfieVerification(req.params.id, selfieUrl, selfieHasRain);
      sendSuccess(res, { claim, selfieHasRain, message: selfieHasRain ? 'Rain detected — payout processing' : 'Selfie received — under manual review' });
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════
// PER-SHIFT ROUTER
// ══════════════════════════════════════════════════════════
const shiftRouter = express.Router();
const {
  getShiftQuote, activateShift, getActiveShift, deactivateShift,
} = require('../services/policy/shiftPolicyService');

// GET /api/v1/policies/shift/quote?lat=19.1&lon=72.8
shiftRouter.get('/quote', authenticate, async (req, res, next) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) return sendBadRequest(res, 'lat and lon required');
    const quote = await getShiftQuote(req.user._id, parseFloat(lat), parseFloat(lon));
    sendSuccess(res, quote);
  } catch (err) { next(err); }
});

// POST /api/v1/policies/shift/activate
shiftRouter.post('/activate', authenticate, limiters.payment,
  validate(Joi.object({
    tier: Joi.string().valid('BASIC', 'STANDARD', 'PRO', 'ELITE').required(),
    lat: Joi.number().required(),
    lon: Joi.number().required(),
    paymentRef: Joi.string().optional(),
  })),
  async (req, res, next) => {
    try {
      const { tier, lat, lon, paymentRef = `mock_shift_${Date.now()}` } = req.body;
      const result = await activateShift(req.user._id, tier, lat, lon, paymentRef);
      sendSuccess(res, result, 201);
    } catch (err) { next(err); }
  }
);

// GET /api/v1/policies/shift/active
shiftRouter.get('/active', authenticate, async (req, res, next) => {
  try {
    const shift = await getActiveShift(req.user._id);
    sendSuccess(res, shift);
  } catch (err) { next(err); }
});

// DELETE /api/v1/policies/shift/active
shiftRouter.delete('/active', authenticate, async (req, res, next) => {
  try {
    const result = await deactivateShift(req.user._id);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════
// IoT ROUTER
// ══════════════════════════════════════════════════════════
const iotRouter = express.Router();
const { ingestSensorReading, getCitySensorReadings, getAllSensors, simulateSensorEvent } = require('../services/iot/iotService');

// POST /api/v1/iot/reading — from IoT devices (uses device token)
iotRouter.post('/reading',
  validate(Joi.object({
    sensorId: Joi.string().required(),
    value: Joi.number().required(),
    unit: Joi.string().required(),
    timestamp: Joi.string().isoDate().optional(),
  })),
  async (req, res, next) => {
    try {
      // Simple device auth via shared token
      const token = req.headers['x-iot-token'];
      if (token !== process.env.IOT_DEVICE_TOKEN && process.env.NODE_ENV === 'production') {
        return res.status(401).json({ error: 'Invalid IoT token' });
      }
      const result = await ingestSensorReading(req.body.sensorId, req.body);
      sendSuccess(res, result);
    } catch (err) { next(err); }
  }
);

// GET /api/v1/iot/sensors/:cityId
iotRouter.get('/sensors/:cityId', optionalAuth, async (req, res, next) => {
  try {
    const readings = await getCitySensorReadings(req.params.cityId);
    sendSuccess(res, readings);
  } catch (err) { next(err); }
});

// POST /api/v1/iot/simulate — admin only, for demo
iotRouter.post('/simulate', authenticate, authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(Joi.object({
    cityId: Joi.string().required(),
    type: Joi.string().valid('flood_level', 'rainfall', 'aqi').required(),
    value: Joi.number().required(),
  })),
  async (req, res, next) => {
    try {
      const result = await simulateSensorEvent(req.body.cityId, req.body.type, req.body.value);
      sendSuccess(res, result);
    } catch (err) { next(err); }
  }
);

// ══════════════════════════════════════════════════════════
// PUBLIC ROUTER — no auth required
// ══════════════════════════════════════════════════════════
const publicRouter = express.Router();

// GET /api/v1/public/map — public disruption map (Innovation 12)
publicRouter.get('/map', async (req, res, next) => {
  try {
    const TriggerEvent = require('../models/TriggerEvent');
    const { redis, KEYS } = require('../config/redis');
    const { CITIES } = require('../config/constants');

    const activeEvents = await TriggerEvent.find({
      status: 'confirmed',
      detectedAt: { $gte: new Date(Date.now() - 6 * 3600000) },
    }).select('triggerType cityId triggerValue triggerUnit detectedAt payoutPercent').lean();

    // Add city coordinates
    const eventsWithCoords = activeEvents.map((e) => ({
      ...e,
      lat: CITIES[e.cityId?.toUpperCase()]?.lat,
      lon: CITIES[e.cityId?.toUpperCase()]?.lon,
      cityName: CITIES[e.cityId?.toUpperCase()]?.name,
    }));

    // Platform stats (non-sensitive)
    const Policy = require('../models/Policy');
    const totalActive = await Policy.countDocuments({ status: 'active' });

    sendSuccess(res, {
      activeEvents: eventsWithCoords,
      platformStats: {
        totalActivePolicies: totalActive,
        citiesCovered: Object.keys(CITIES).length,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) { next(err); }
});

// GET /api/v1/public/stats — public platform stats for landing page
publicRouter.get('/stats', async (req, res, next) => {
  try {
    const { redis } = require('../config/redis');
    const cached = await redis.get('public:stats');
    if (cached) return sendSuccess(res, cached);

    const User = require('../models/User');
    const { Payout } = require('../models/index');
    const { PAYMENT_STATUS } = require('../config/constants');

    const [totalRiders, totalPayouts] = await Promise.all([
      User.countDocuments({ role: 'rider', isActive: true }),
      Payout.aggregate([
        { $match: { status: PAYMENT_STATUS.COMPLETED } },
        { $group: { _id: null, total: { $sum: '$amountInr' }, count: { $sum: 1 } } },
      ]),
    ]);

    const stats = {
      totalRidersProtected: totalRiders,
      totalPayoutsCount: totalPayouts[0]?.count || 0,
      totalPayoutsInr: totalPayouts[0]?.total || 0,
      platformsSupported: 8,
      citiesActive: 10,
      avgPayoutMinutes: 12,
    };

    await redis.set('public:stats', stats, 30 * 60); // 30 min cache
    sendSuccess(res, stats);
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════
// ADMIN EXTENDED ROUTER
// ══════════════════════════════════════════════════════════
const adminExtRouter = express.Router();
adminExtRouter.use(authenticate, authorize(ROLES.ADMIN, ROLES.INSURER, ROLES.SUPER_ADMIN));

// GET /api/v1/admin/users
adminExtRouter.get('/users', async (req, res, next) => {
  try {
    const User = require('../models/User');
    const { page = 1, limit = 20, search, cityId, isBlocked } = req.query;
    const filter = { role: 'rider' };
    if (cityId) filter['riderProfile.cityId'] = cityId;
    if (isBlocked !== undefined) filter.isBlocked = isBlocked === 'true';
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search } },
    ];
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-bankDetails.upiId -bankDetails.bankAccount -locationHistory')
        .sort({ createdAt: -1 }).skip(skip).limit(+limit).lean(),
      User.countDocuments(filter),
    ]);
    sendPaginated(res, users, total, page, limit);
  } catch (err) { next(err); }
});

// PATCH /api/v1/admin/users/:id/block
adminExtRouter.patch('/users/:id/block',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(Joi.object({
    block: Joi.boolean().required(),
    reason: Joi.string().max(200).optional(),
  })),
  async (req, res, next) => {
    try {
      const User = require('../models/User');
      const { redis, KEYS } = require('../config/redis');
      const user = await User.findByIdAndUpdate(
        req.params.id,
        {
          $set: {
            isBlocked: req.body.block,
            blockedReason: req.body.reason,
            blockedAt: req.body.block ? new Date() : null,
          },
        },
        { new: true }
      );
      if (!user) return sendNotFound(res, 'User');
      await redis.del(KEYS.session(req.params.id));
      sendSuccess(res, { isBlocked: user.isBlocked });
    } catch (err) { next(err); }
  }
);

// GET /api/v1/admin/loyalty-pool
adminExtRouter.get('/loyalty-pool', async (req, res, next) => {
  try {
    const { LoyaltyPool } = require('../models/index');
    const pools = await LoyaltyPool.find().sort({ weekId: -1 }).limit(12).lean();
    const allTime = await LoyaltyPool.aggregate([
      { $group: { _id: null, totalContrib: { $sum: '$contributionsInr' }, totalDisbursed: { $sum: '$disbursedInr' } } },
    ]);
    sendSuccess(res, { pools, allTime: allTime[0] || {} });
  } catch (err) { next(err); }
});

// GET /api/v1/admin/analytics/export
adminExtRouter.get('/analytics/export', async (req, res, next) => {
  try {
    const { type = 'weekly', weekId } = req.query;
    const Claim = require('../models/Claim');
    const Policy = require('../models/Policy');
    const { CLAIM_STATUS, POLICY_STATUS } = require('../config/constants');

    const claims = await Claim.find(weekId ? { weekId } : {})
      .select('claimId riderId cityId triggerType finalPayoutInr status fraudCheck.score createdAt')
      .populate('riderId', 'name phone riderProfile.platform')
      .lean();

    // Convert to CSV-friendly format
    const rows = claims.map(c => ({
      claimId: c.claimId,
      riderPhone: c.riderId?.phone,
      platform: c.riderId?.riderProfile?.platform,
      city: c.cityId,
      triggerType: c.triggerType,
      payoutInr: c.finalPayoutInr,
      status: c.status,
      fraudScore: c.fraudCheck?.score,
      date: new Date(c.createdAt).toISOString().slice(0, 10),
    }));

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=gigshield_export_${Date.now()}.json`);
    res.json({ data: rows, count: rows.length, exportedAt: new Date().toISOString() });
  } catch (err) { next(err); }
});

// GET /api/v1/admin/health/apis — External API health check
adminExtRouter.get('/health/apis', async (req, res, next) => {
  try {
    const axios = require('axios');
    const { CITIES } = require('../config/constants');

    const checks = await Promise.allSettled([
      axios.get(`https://api.openweathermap.org/data/2.5/weather?lat=19.07&lon=72.87&appid=${process.env.OPENWEATHER_API_KEY}`, { timeout: 5000 }),
      axios.get(`https://api.waqi.info/feed/mumbai/?token=${process.env.AQICN_API_KEY}`, { timeout: 5000 }),
      axios.get(`${process.env.ML_SERVICE_URL}/health`, { timeout: 3000 }),
    ]);

    const [weather, aqi, ml] = checks;
    sendSuccess(res, {
      openweathermap: weather.status === 'fulfilled' ? 'ok' : 'error',
      aqicn: aqi.status === 'fulfilled' ? 'ok' : 'error',
      mlService: ml.status === 'fulfilled' ? 'ok' : 'error',
      checkedAt: new Date().toISOString(),
    });
  } catch (err) { next(err); }
});

module.exports = {
  communityRouter, walletRouter, referralRouter,
  notificationsRouter, kycRouter, claimsExtRouter,
  shiftRouter, iotRouter, publicRouter, adminExtRouter,
};
