const Policy = require('../../models/Policy');
const Claim = require('../../models/Claim');
const User = require('../../models/User');
const TriggerEvent = require('../../models/TriggerEvent');
const { Payout, FraudLog, LoyaltyPool, Analytics } = require('../../models/index');
const { redis, KEYS } = require('../../config/redis');
const { POLICY_STATUS, CLAIM_STATUS, PAYMENT_STATUS } = require('../../config/constants');
const { getPolicyWeekId } = require('../../utils/dateTime');
const logger = require('../../utils/logger');

// ─── Admin Dashboard Stats ────────────────────────────────
const getAdminDashboard = async () => {
  const cached = await redis.get(KEYS.dashboardStats());
  if (cached) return cached;

  const weekId = getPolicyWeekId();
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1);

  const [
    activePolicies,
    todayPayouts,
    todayPremiums,
    pendingClaims,
    todayFraud,
    triggerEvents,
    liveRiders,
    weeklyStats,
    cityBreakdown,
    tierBreakdown,
  ] = await Promise.all([
    Policy.countDocuments({ status: POLICY_STATUS.ACTIVE }),

    Payout.aggregate([
      { $match: { status: PAYMENT_STATUS.COMPLETED, completedAt: { $gte: startOfDay } } },
      { $group: { _id: null, total: { $sum: '$amountInr' }, count: { $sum: 1 } } },
    ]),

    Policy.aggregate([
      { $match: { weekId, status: PAYMENT_STATUS.COMPLETED } },
      { $group: { _id: null, total: { $sum: '$premiumAmountInr' } } },
    ]),

    Claim.countDocuments({ status: { $in: [CLAIM_STATUS.FRAUD_SCREENING, CLAIM_STATUS.PENDING_VERIFICATION] } }),

    FraudLog.countDocuments({ createdAt: { $gte: startOfDay } }),

    TriggerEvent.find({ status: 'confirmed', detectedAt: { $gte: startOfWeek } })
      .select('triggerType cityId detectedAt claimsInitiated totalPayoutInr')
      .sort({ detectedAt: -1 })
      .limit(10)
      .lean(),

    User.countDocuments({ 'riderProfile.isActiveShift': true }),

    Policy.aggregate([
      { $match: { weekId } },
      { $group: {
        _id: '$status',
        count: { $sum: 1 },
        premiumTotal: { $sum: '$premiumAmountInr' },
      }},
    ]),

    Policy.aggregate([
      { $match: { status: POLICY_STATUS.ACTIVE } },
      { $group: { _id: '$cityId', count: { $sum: 1 }, premiumTotal: { $sum: '$premiumAmountInr' } } },
      { $sort: { count: -1 } },
    ]),

    Policy.aggregate([
      { $match: { status: POLICY_STATUS.ACTIVE } },
      { $group: { _id: '$tier', count: { $sum: 1 } } },
    ]),
  ]);

  // ─── Loss Ratio calculation ────────────────────────────
  const totalPremium = todayPremiums[0]?.total || 0;
  const totalPayouts = todayPayouts[0]?.total || 0;
  const lossRatio = totalPremium > 0 ? (totalPayouts / totalPremium) : 0;

  // ─── Avg processing time ──────────────────────────────
  const avgProcessing = await Claim.aggregate([
    { $match: { status: CLAIM_STATUS.PAYOUT_COMPLETED, totalProcessingMs: { $exists: true } } },
    { $group: { _id: null, avg: { $avg: '$totalProcessingMs' } } },
  ]);

  const loyaltyPool = await LoyaltyPool.findOne({ weekId }).lean();

  const dashboard = {
    summary: {
      activePolicies,
      liveRiders,
      pendingClaims,
      todayPayoutsInr: totalPayouts,
      todayPayoutsCount: todayPayouts[0]?.count || 0,
      weeklyPremiumInr: totalPremium,
      lossRatio: Math.round(lossRatio * 100) / 100,
      avgClaimProcessingMs: Math.round(avgProcessing[0]?.avg || 0),
      loyaltyPoolBalanceInr: loyaltyPool?.balanceInr || 0,
    },
    fraud: {
      todayAlerts: todayFraud,
    },
    recentTriggers: triggerEvents,
    weeklyPolicies: weeklyStats,
    cityBreakdown,
    tierBreakdown,
    generatedAt: new Date().toISOString(),
  };

  await redis.set(KEYS.dashboardStats(), dashboard, 5 * 60); // 5 min cache
  return dashboard;
};

// ─── Rider Dashboard Stats ────────────────────────────────
const getRiderDashboard = async (riderId) => {
  const weekId = getPolicyWeekId();

  const [policy, recentClaims, allTimePayouts, rider] = await Promise.all([
    Policy.findOne({ riderId, weekId, status: POLICY_STATUS.ACTIVE }).lean(),

    Claim.find({ riderId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('eventId', 'triggerType cityId detectedAt')
      .lean(),

    Payout.aggregate([
      { $match: { riderId: require('mongoose').Types.ObjectId.createFromHexString(riderId.toString()), status: PAYMENT_STATUS.COMPLETED } },
      { $group: { _id: null, total: { $sum: '$amountInr' }, count: { $sum: 1 } } },
    ]),

    User.findById(riderId).select('safeWeekStreak loyaltyTier loyaltyDiscount walletBalance riderProfile').lean(),
  ]);

  // Current zone risk (from cache)
  const zoneRisk = rider?.riderProfile?.cityId
    ? await redis.get(KEYS.triggerCache(rider.riderProfile.cityId, 'risk_score')) || 'moderate'
    : 'moderate';

  return {
    activePolicy: policy ? {
      tier: policy.tier,
      weekId: policy.weekId,
      premiumInr: policy.premiumAmountInr,
      dailyCoverageInr: policy.tierDetails.dailyCoverageInr,
      weeklyMaxInr: policy.tierDetails.weeklyMaxInr,
      remainingCoverInr: policy.remainingCoverInr,
      claimsCount: policy.claimsCount,
      totalPayoutInr: policy.totalPayoutInr,
      startDate: policy.startDate,
      endDate: policy.endDate,
      isAutoRenew: policy.isAutoRenew,
    } : null,
    totalProtectedInr: allTimePayouts[0]?.total || 0,
    totalClaimsCount: allTimePayouts[0]?.count || 0,
    recentClaims,
    loyalty: {
      safeWeekStreak: rider?.safeWeekStreak || 0,
      tier: rider?.loyaltyTier || 'none',
      discountPercent: Math.round((rider?.loyaltyDiscount || 0) * 100),
      walletBalanceInr: rider?.walletBalance || 0,
    },
    zoneRisk,
    generatedAt: new Date().toISOString(),
  };
};

// ─── Risk Heatmap for Admin ───────────────────────────────
const getRiskHeatmap = async () => {
  const { CITIES } = require('../../config/constants');
  const heatmap = [];

  for (const [, city] of Object.entries(CITIES)) {
    const [activeCount, weekClaims, weatherCache] = await Promise.all([
      Policy.countDocuments({ cityId: city.id, status: POLICY_STATUS.ACTIVE }),
      Claim.countDocuments({ cityId: city.id, createdAt: { $gte: new Date(Date.now() - 7 * 24 * 3600000) } }),
      redis.get(KEYS.weatherCache(city.id)),
    ]);

    const riskScore = Math.min(100, weekClaims * 10 + (weatherCache?.rainfall3h || 0));

    heatmap.push({
      cityId: city.id,
      name: city.name,
      lat: city.lat,
      lon: city.lon,
      activePolicies: activeCount,
      weekClaims,
      riskScore,
      riskLevel: riskScore > 70 ? 'high' : riskScore > 40 ? 'medium' : 'low',
      currentWeather: weatherCache ? {
        rainfall3h: weatherCache.rainfall3h,
        feelsLike: weatherCache.feelsLike,
        weatherMain: weatherCache.weatherMain,
      } : null,
    });
  }

  return heatmap.sort((a, b) => b.riskScore - a.riskScore);
};

// ─── Predicted Claims for Next Week ──────────────────────
const getPredictedClaims = async () => {
  // Simple heuristic: use last 4 weeks' claim rates by city
  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 3600000);

  const historical = await Claim.aggregate([
    { $match: { createdAt: { $gte: fourWeeksAgo }, status: CLAIM_STATUS.PAYOUT_COMPLETED } },
    { $group: {
      _id: { cityId: '$cityId', week: { $isoWeek: '$createdAt' } },
      count: { $sum: 1 },
      totalInr: { $sum: '$finalPayoutInr' },
    }},
  ]);

  // Group by city and compute average
  const byCity = {};
  for (const h of historical) {
    const city = h._id.cityId;
    if (!byCity[city]) byCity[city] = { counts: [], totals: [] };
    byCity[city].counts.push(h.count);
    byCity[city].totals.push(h.totalInr);
  }

  return Object.entries(byCity).map(([city, data]) => ({
    cityId: city,
    predictedClaims: Math.round(data.counts.reduce((a, b) => a + b, 0) / data.counts.length),
    predictedPayoutInr: Math.round(data.totals.reduce((a, b) => a + b, 0) / data.totals.length),
  })).sort((a, b) => b.predictedClaims - a.predictedClaims);
};

// ─── Compute and persist daily analytics snapshot ─────────
const computeDailySnapshot = async () => {
  const today = new Date().toISOString().slice(0, 10);
  const startOfDay = new Date(today);
  const endOfDay = new Date(today + 'T23:59:59.999Z');

  const [
    newPolicies, lapses,
    claimsInitiated, claimsApproved, claimsRejected,
    payouts, fraud,
    newRiders,
  ] = await Promise.all([
    Policy.countDocuments({ createdAt: { $gte: startOfDay, $lte: endOfDay } }),
    Policy.countDocuments({ status: POLICY_STATUS.LAPSED, updatedAt: { $gte: startOfDay, $lte: endOfDay } }),
    Claim.countDocuments({ detectedAt: { $gte: startOfDay, $lte: endOfDay } }),
    Claim.countDocuments({ approvedAt: { $gte: startOfDay, $lte: endOfDay } }),
    Claim.countDocuments({ rejectedAt: { $gte: startOfDay, $lte: endOfDay } }),
    Payout.aggregate([
      { $match: { completedAt: { $gte: startOfDay, $lte: endOfDay }, status: PAYMENT_STATUS.COMPLETED } },
      { $group: { _id: null, total: { $sum: '$amountInr' }, count: { $sum: 1 } } },
    ]),
    FraudLog.countDocuments({ createdAt: { $gte: startOfDay, $lte: endOfDay } }),
    User.countDocuments({ createdAt: { $gte: startOfDay, $lte: endOfDay } }),
  ]);

  const premiums = await Policy.aggregate([
    { $match: { paidAt: { $gte: startOfDay, $lte: endOfDay } } },
    { $group: { _id: null, total: { $sum: '$premiumAmountInr' } } },
  ]);

  const totalPayouts = payouts[0]?.total || 0;
  const totalPremiums = premiums[0]?.total || 0;

  await Analytics.findOneAndUpdate(
    { type: 'daily', period: today },
    { $set: {
      'metrics.newPolicies': newPolicies,
      'metrics.lapses': lapses,
      'metrics.claimsInitiated': claimsInitiated,
      'metrics.claimsApproved': claimsApproved,
      'metrics.claimsRejected': claimsRejected,
      'metrics.totalPayoutInr': totalPayouts,
      'metrics.premiumCollectedInr': totalPremiums,
      'metrics.lossRatio': totalPremiums > 0 ? totalPayouts / totalPremiums : 0,
      'metrics.fraudAttempts': fraud,
      'metrics.newRiders': newRiders,
      computedAt: new Date(),
    }},
    { upsert: true, new: true }
  );

  logger.info(`Daily analytics snapshot computed for ${today}`);
};

module.exports = {
  getAdminDashboard, getRiderDashboard,
  getRiskHeatmap, getPredictedClaims,
  computeDailySnapshot,
};
