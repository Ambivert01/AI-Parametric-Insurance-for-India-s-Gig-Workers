const Policy = require('../../models/Policy');
const Claim = require('../../models/Claim');
const User = require('../../models/User');
const TriggerEvent = require('../../models/TriggerEvent');
const { Payout, FraudLog, LoyaltyPool, Analytics } = require('../../models/index');
const { redis, KEYS } = require('../../config/redis');
const { POLICY_STATUS, CLAIM_STATUS, PAYMENT_STATUS, CITIES } = require('../../config/constants');
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

  const heuristicResult = Object.entries(byCity).map(([city, data]) => ({
    cityId: city,
    predictedClaims: Math.round(data.counts.reduce((a, b) => a + b, 0) / data.counts.length),
    predictedPayoutInr: Math.round(data.totals.reduce((a, b) => a + b, 0) / data.totals.length),
  })).sort((a, b) => b.predictedClaims - a.predictedClaims);

  // The ML service has a real per-city seasonal model (/ml/predict/zone-risk —
  // actual monthly probability curves, e.g. Mumbai's monsoon peak, adjusted
  // by recent claim trends) that was built and fully working but never once
  // called from Node — this function reimplemented a cruder flat 4-week
  // average instead. Try the real model per city; fall back to the heuristic
  // above (still useful, just less precise) if the ML service is unreachable.
  try {
    const axios = require('axios');
    const activeCounts = await Policy.aggregate([
      { $match: { status: POLICY_STATUS.ACTIVE } },
      { $group: { _id: '$cityId', count: { $sum: 1 } } },
    ]);
    const activeByCity = Object.fromEntries(activeCounts.map((c) => [c._id, c.count]));

    const mlResults = await Promise.all(
      Object.keys(CITIES).map(async (cityId) => {
        const lower = cityId.toLowerCase();
        try {
          const { data } = await axios.post(
            `${process.env.ML_SERVICE_URL}/api/v1/ml/predict/zone-risk`,
            {
              cityId: lower,
              activePolicies: activeByCity[lower] || 0,
              historicalClaimsLast4Weeks: byCity[lower]?.counts || [],
            },
            { headers: { 'x-service-secret': process.env.ML_SERVICE_SECRET }, timeout: 3000 }
          );
          return {
            cityId: lower,
            predictedClaims: data.predictedClaimsNextWeek,
            predictedPayoutInr: data.expectedPayoutInr,
            riskLevel: data.riskLevel,
            confidence: data.confidence,
          };
        } catch {
          return null;
        }
      })
    );

    const validResults = mlResults.filter(Boolean).sort((a, b) => b.predictedClaims - a.predictedClaims);
    if (validResults.length) return validResults;
  } catch (err) {
    logger.warn(`ML zone-risk prediction unavailable, using heuristic fallback: ${err.message}`);
  }

  return heuristicResult;
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

// ─── Executive Dashboard (doc §45) ────────────────────────
// "Designed for insurance leadership, investors, senior management —
// instead of operational details, high-level business intelligence."
//
// Built on top of the daily Analytics snapshots (computeDailySnapshot,
// now actually scheduled — see cronJobs.js) for trend data, plus live
// aggregations for current-state totals. A few doc-listed metrics have no
// real data source anywhere in the system (Customer Satisfaction, AI Model
// Accuracy against ground truth, Recommendation Adoption, Operating Cost)
// — these are returned with `available: false` rather than a fabricated
// number, so this dashboard never shows leadership a number nobody can
// actually back up.
const getExecutiveDashboard = async () => {
  const cacheKey = 'executive:dashboard';
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  const { ROLES } = require('../../config/constants');
  const now = new Date();
  const period30Start = new Date(now - 30 * 24 * 3600000);
  const period60Start = new Date(now - 60 * 24 * 3600000);
  const weekId = getPolicyWeekId();
  const prevWeekId = getPolicyWeekId(new Date(now - 7 * 24 * 3600000));

  const [
    totalWorkers, activeRiderIds,
    newRegs30, newRegsPrev30,
    premium30, payouts30,
    heatmap, forecast,
    triggerFrequency,
    autoRenewCount, activePolicyCount,
    thisWeekRiderIds, prevWeekRiderIds,
    claims30ByTier, claimsRejected30, fraudLossClaims,
    manualInvestigations,
  ] = await Promise.all([
    User.countDocuments({ role: ROLES.RIDER }),
    Policy.distinct('riderId', { status: POLICY_STATUS.ACTIVE }),

    User.countDocuments({ role: ROLES.RIDER, createdAt: { $gte: period30Start } }),
    User.countDocuments({ role: ROLES.RIDER, createdAt: { $gte: period60Start, $lt: period30Start } }),

    Policy.aggregate([
      { $match: { paidAt: { $gte: period30Start } } },
      { $group: { _id: null, total: { $sum: '$premiumAmountInr' } } },
    ]),
    Payout.aggregate([
      { $match: { status: PAYMENT_STATUS.COMPLETED, completedAt: { $gte: period30Start } } },
      { $group: { _id: null, total: { $sum: '$amountInr' } } },
    ]),

    getRiskHeatmap(),
    getPredictedClaims(),

    TriggerEvent.aggregate([
      { $match: { detectedAt: { $gte: period30Start }, status: { $in: ['confirmed'] } } },
      { $group: { _id: '$triggerType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),

    Policy.countDocuments({ status: POLICY_STATUS.ACTIVE, isAutoRenew: true }),
    Policy.countDocuments({ status: POLICY_STATUS.ACTIVE }),

    Policy.distinct('riderId', { weekId }),
    prevWeekId ? Policy.distinct('riderId', { weekId: prevWeekId }) : Promise.resolve([]),

    Claim.aggregate([
      { $match: { createdAt: { $gte: period30Start }, 'fraudCheck.tier': { $exists: true } } },
      { $group: { _id: '$fraudCheck.tier', count: { $sum: 1 } } },
    ]),
    Claim.countDocuments({ createdAt: { $gte: period30Start }, status: CLAIM_STATUS.REJECTED }),
    Claim.aggregate([
      { $match: { createdAt: { $gte: period30Start }, status: CLAIM_STATUS.REJECTED, 'fraudCheck.tier': 'RED' } },
      { $group: { _id: null, total: { $sum: '$finalPayoutInr' }, count: { $sum: 1 } } },
    ]),
    Claim.countDocuments({ status: CLAIM_STATUS.PENDING_VERIFICATION }),
  ]);

  const premiumRevenue = premium30[0]?.total || 0;
  const totalPayouts = payouts30[0]?.total || 0;
  const lossRatio = premiumRevenue > 0 ? Math.round((totalPayouts / premiumRevenue) * 100) / 100 : 0;
  // Pure underwriting margin (premium minus claims paid) — explicitly not
  // "gross margin" in the accounting sense, since operating costs (server
  // infra, payment gateway fees, staff) aren't tracked anywhere in this
  // system and folding them in would be a guess dressed up as a number.
  const underwritingMarginPercent = premiumRevenue > 0
    ? Math.round(((premiumRevenue - totalPayouts) / premiumRevenue) * 10000) / 100
    : 0;

  const monthlyGrowthPercent = newRegsPrev30 > 0
    ? Math.round(((newRegs30 - newRegsPrev30) / newRegsPrev30) * 10000) / 100
    : (newRegs30 > 0 ? 100 : 0);

  const retainedRiders = prevWeekRiderIds.length
    ? thisWeekRiderIds.filter((id) => prevWeekRiderIds.some((p) => p.toString() === id.toString())).length
    : null;
  const retentionRatePercent = retainedRiders !== null && prevWeekRiderIds.length > 0
    ? Math.round((retainedRiders / prevWeekRiderIds.length) * 10000) / 100
    : null;

  const tierCounts = Object.fromEntries(claims30ByTier.map((t) => [t._id, t.count]));
  const totalClaims30 = Object.values(tierCounts).reduce((a, b) => a + b, 0);
  const autoApprovalRatePercent = totalClaims30 > 0
    ? Math.round(((tierCounts.GREEN || 0) / totalClaims30) * 10000) / 100
    : 0;
  const fraudPreventionRatePercent = totalClaims30 > 0
    ? Math.round((((tierCounts.ORANGE || 0) + (tierCounts.RED || 0)) / totalClaims30) * 10000) / 100
    : 0;

  const highRiskCities = heatmap.filter((c) => c.riskLevel === 'high');
  const activePoliciesInHighRiskCities = highRiskCities.reduce((sum, c) => sum + c.activePolicies, 0);
  const climateExposurePercent = activePolicyCount > 0
    ? Math.round((activePoliciesInHighRiskCities / activePolicyCount) * 10000) / 100
    : 0;

  const dashboard = {
    growth: {
      totalWorkers,
      activeWorkers: activeRiderIds.length,
      newRegistrations30d: newRegs30,
      monthlyGrowthPercent,
    },
    financial: {
      premiumRevenue30dInr: premiumRevenue,
      totalPayouts30dInr: totalPayouts,
      lossRatio,
      underwritingMarginPercent,
      operatingCost: { available: false, note: 'Not tracked anywhere in the system — no cost-accounting data source exists.' },
    },
    risk: {
      highRiskCities: highRiskCities.map((c) => ({ cityId: c.cityId, name: c.name, riskScore: c.riskScore })),
      triggerFrequency30d: triggerFrequency.map((t) => ({ triggerType: t._id, count: t.count })),
      claimForecastNextPeriod: forecast.slice(0, 5),
      climateExposurePercent,
    },
    customer: {
      policyRenewalRatePercent: activePolicyCount > 0 ? Math.round((autoRenewCount / activePolicyCount) * 10000) / 100 : 0,
      retentionRatePercent,
      churnRatePercent: retentionRatePercent !== null ? Math.round((100 - retentionRatePercent) * 100) / 100 : null,
      customerSatisfaction: { available: false, note: 'No CSAT/NPS survey mechanism exists in the product yet.' },
    },
    ai: {
      autoApprovalRatePercent,
      fraudPreventionRatePercent,
      modelAccuracy: { available: false, note: 'No ground-truth-labeled outcome data exists to score fraud/risk model accuracy against.' },
      recommendationAdoption: { available: false, note: 'Policies don\'t currently record whether the AI-recommended tier was the one purchased — needs a tracking field added at purchase time.' },
    },
    fraud: {
      fraudLossPreventedInr: fraudLossClaims[0]?.total || 0,
      fraudBlockedClaimsCount: fraudLossClaims[0]?.count || 0,
      suspiciousClaims30d: (tierCounts.ORANGE || 0) + (tierCounts.RED || 0),
      manualInvestigationsOpen: manualInvestigations,
      claimsRejected30d: claimsRejected30,
    },
    geographic: heatmap.map((c) => ({
      cityId: c.cityId, name: c.name, lat: c.lat, lon: c.lon,
      activePolicies: c.activePolicies, riskScore: c.riskScore, riskLevel: c.riskLevel,
    })),
    generatedAt: new Date().toISOString(),
  };

  await redis.set(cacheKey, dashboard, 15 * 60); // 15 min cache — this is a heavier query set than the operational dashboard
  return dashboard;
};

// ─── Real weekly trend (backs the admin dashboard chart, which was
//     previously rendering Math.random() on every load) ──────────────────
const getWeeklyTrend = async () => {
  const { Analytics } = require('../../models/index');
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600000);
    days.push(d.toISOString().slice(0, 10));
  }

  const snapshots = await Analytics.find({ type: 'daily', period: { $in: days } }).lean();
  const byPeriod = Object.fromEntries(snapshots.map((s) => [s.period, s.metrics]));

  const dayLabel = (isoDate) => new Date(isoDate).toLocaleDateString('en-US', { weekday: 'short' });

  return days.map((period) => ({
    day: dayLabel(period),
    date: period,
    claims: byPeriod[period]?.claimsInitiated ?? 0,
    policies: byPeriod[period]?.newPolicies ?? 0,
    hasData: !!byPeriod[period],
  }));
};

module.exports = {
  getAdminDashboard, getRiderDashboard,
  getRiskHeatmap, getPredictedClaims,
  computeDailySnapshot, getExecutiveDashboard,
  getWeeklyTrend,
};
