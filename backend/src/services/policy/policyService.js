const axios = require('axios');
const Policy = require('../../models/Policy');
const User = require('../../models/User');
const { Payout, LoyaltyPool } = require('../../models/index');
const { redis, KEYS } = require('../../config/redis');
const {
  COVERAGE_TIERS, POLICY_STATUS, PAYMENT_STATUS, BUSINESS_RULES,
  QUEUES, TRIGGER_TYPES,
} = require('../../config/constants');
const {
  getCurrentPolicyWeekStart, getCurrentPolicyWeekEnd,
  getNextPolicyWeekStart, getPolicyWeekId, getSeasonalMultiplier,
} = require('../../utils/dateTime');
const logger = require('../../utils/logger');

// ─── Call Python ML service for premium ──────────────────
const getPremiumFromML = async (riderData) => {
  try {
    const response = await axios.post(
      `${process.env.ML_SERVICE_URL}/api/v1/premium/calculate`,
      riderData,
      {
        headers: { 'x-service-secret': process.env.ML_SERVICE_SECRET },
        timeout: 5000,
      }
    );
    return response.data.data;
  } catch (err) {
    logger.warn(`ML service unavailable, using fallback pricing: ${err.message}`);
    return null;
  }
};

// ─── Fallback premium calculation (no ML) ────────────────
const calculatePremiumFallback = (cityId, tier, platform, month) => {
  const tierConfig = COVERAGE_TIERS[tier];
  const base = tierConfig.daily_coverage_inr * 0.12; // 12% of daily coverage as base
  const seasonal = getSeasonalMultiplier(new Date(), cityId);

  // Zone risk: hardcoded known high-risk zones
  const highRisk = ['mumbai', 'kolkata', 'delhi', 'chennai'];
  const zoneRisk = highRisk.includes(cityId?.toLowerCase()) ? 1.2 : 1.0;

  return {
    basePremium: Math.round(base),
    riskScore: 0.5,
    seasonalMultiplier: seasonal,
    zoneRiskMultiplier: zoneRisk,
    loyaltyDiscount: 0,
    finalPremium: Math.round(base * seasonal * zoneRisk),
    mlModelVersion: 'fallback_v1',
  };
};

// ══════════════════════════════════════════════════════════
// Policy Service
// ══════════════════════════════════════════════════════════

/**
 * Get premium quote for a rider + tier (no policy created yet)
 */
const getPremiumQuote = async (userId, tier) => {
  const user = await User.findById(userId).lean();
  if (!user?.riderProfile) {
    throw Object.assign(new Error('Complete your profile before getting a quote'), { statusCode: 400 });
  }

  const tierConfig = COVERAGE_TIERS[tier];
  if (!tierConfig) {
    throw Object.assign(new Error(`Invalid tier: ${tier}`), { statusCode: 400 });
  }

  // Check if rider already has an active policy this week
  const weekId = getPolicyWeekId();
  const existing = await Policy.findOne({ riderId: userId, weekId, status: POLICY_STATUS.ACTIVE });
  if (existing) {
    throw Object.assign(new Error('You already have an active policy this week'), { statusCode: 409 });
  }

  const riderData = {
    cityId: user.riderProfile.cityId,
    platform: user.riderProfile.platform,
    vehicleType: user.riderProfile.vehicleType,
    shiftPattern: user.riderProfile.shiftPattern,
    declaredDailyIncome: user.riderProfile.declaredDailyIncome,
    tier,
    safeWeekStreak: user.safeWeekStreak,
    avgWeeklyOrders: user.riderProfile.avgWeeklyOrders,
  };

  // Try ML service first
  let premiumData = await getPremiumFromML(riderData);
  if (!premiumData) {
    premiumData = calculatePremiumFallback(riderData.cityId, tier, riderData.platform);
  }

  // Apply loyalty discount
  const loyaltyDiscount = user.loyaltyDiscount || 0;
  premiumData.loyaltyDiscount = loyaltyDiscount;
  premiumData.finalPremium = Math.round(premiumData.finalPremium * (1 - loyaltyDiscount));

  const weekStart = getCurrentPolicyWeekStart();
  const weekEnd = getCurrentPolicyWeekEnd();

  return {
    tier,
    tierDetails: tierConfig,
    premiumBreakdown: premiumData,
    premiumAmountInr: premiumData.finalPremium,
    coverage: {
      dailyInr: tierConfig.daily_coverage_inr,
      weeklyMaxInr: tierConfig.weekly_max_inr,
      triggers: tierConfig.triggers,
    },
    period: {
      weekId,
      startDate: weekStart.toDate(),
      endDate: weekEnd.toDate(),
    },
    autoRenewAvailable: true,
  };
};

/**
 * Create a policy after payment is initiated
 */
const createPolicy = async (userId, tier, paymentOrderId, isAutoRenew = false) => {
  const user = await User.findById(userId).lean();
  if (!user?.riderProfile) {
    throw Object.assign(new Error('Profile incomplete'), { statusCode: 400 });
  }

  const weekId = getPolicyWeekId();
  const tierConfig = COVERAGE_TIERS[tier];
  const weekStart = getCurrentPolicyWeekStart();
  const weekEnd = getCurrentPolicyWeekEnd();

  // Prevent duplicate
  const existing = await Policy.findOne({ riderId: userId, weekId });
  if (existing) {
    if (existing.status === POLICY_STATUS.PENDING_PAYMENT) {
      existing.paymentId = paymentOrderId;
      await existing.save();
      return existing;
    }
    throw Object.assign(new Error('Policy for this week already exists'), { statusCode: 409 });
  }

  const riderData = {
    cityId: user.riderProfile.cityId,
    platform: user.riderProfile.platform,
    vehicleType: user.riderProfile.vehicleType,
    shiftPattern: user.riderProfile.shiftPattern,
    declaredDailyIncome: user.riderProfile.declaredDailyIncome,
    tier,
    safeWeekStreak: user.safeWeekStreak,
  };

  let premiumData = await getPremiumFromML(riderData);
  if (!premiumData) {
    premiumData = calculatePremiumFallback(riderData.cityId, tier, riderData.platform);
  }

  const loyaltyDiscount = user.loyaltyDiscount || 0;
  premiumData.loyaltyDiscount = loyaltyDiscount;
  premiumData.finalPremium = Math.round(premiumData.finalPremium * (1 - loyaltyDiscount));

  const policy = new Policy({
    riderId: userId,
    tier: tier.toUpperCase(),
    tierDetails: {
      dailyCoverageInr: tierConfig.daily_coverage_inr,
      weeklyMaxInr: tierConfig.weekly_max_inr,
      triggers: tierConfig.triggers,
      payoutChannels: tierConfig.payout_channel,
      priorityProcessing: tierConfig.priority_processing || false,
    },
    weekId,
    startDate: weekStart.toDate(),
    endDate: weekEnd.toDate(),
    isAutoRenew,
    cityId: user.riderProfile.cityId,
    zone: user.riderProfile.zone,
    pincode: user.riderProfile.pincode,
    premiumBreakdown: premiumData,
    premiumAmountInr: premiumData.finalPremium,
    paymentId: paymentOrderId,
    status: POLICY_STATUS.PENDING_PAYMENT,
    paymentStatus: PAYMENT_STATUS.PENDING,
  });

  await policy.save();
  logger.claim(policy._id.toString(), 'POLICY_CREATED', userId, { tier, weekId });
  return policy;
};

/**
 * Activate policy after confirmed payment
 */
const activatePolicy = async (policyId, paymentRef) => {
  const policy = await Policy.findById(policyId);
  if (!policy) throw Object.assign(new Error('Policy not found'), { statusCode: 404 });

  policy.status = POLICY_STATUS.ACTIVE;
  policy.paymentStatus = PAYMENT_STATUS.COMPLETED;
  policy.paymentRef = paymentRef;
  policy.paidAt = new Date();
  await policy.save();

  // Invalidate policy count cache for this zone
  await redis.del(KEYS.policyCount(policy.cityId));

  logger.claim(policyId, 'POLICY_ACTIVATED', policy.riderId.toString(), { weekId: policy.weekId });
  return policy;
};

/**
 * Get active policy for a rider this week
 */
const getActivePolicyForRider = async (riderId) => {
  const weekId = getPolicyWeekId();
  return Policy.findOne({
    riderId,
    weekId,
    status: POLICY_STATUS.ACTIVE,
  }).populate('riderId', 'name phone riderProfile').lean();
};

/**
 * Get all active policies in a city for trigger matching
 */
const getActivePoliciesInCity = async (cityId, triggerType) => {
  return Policy.find({
    cityId,
    status: POLICY_STATUS.ACTIVE,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() },
    'tierDetails.triggers': triggerType,
  }).populate('riderId', 'name phone riderProfile devices notificationPrefs bankDetails').lean();
};

/**
 * Process auto-renewals for next week (run Sunday evening)
 */
const processAutoRenewals = async () => {
  const nextWeekId = getPolicyWeekId(getNextPolicyWeekStart().toDate());
  logger.info(`Processing auto-renewals for week ${nextWeekId}`);

  const autoRenewPolicies = await Policy.find({
    isAutoRenew: true,
    status: POLICY_STATUS.ACTIVE,
    weekId: getPolicyWeekId(), // current week
  }).populate('riderId').lean();

  const results = { initiated: 0, failed: 0 };
  for (const policy of autoRenewPolicies) {
    try {
      // Check if next week policy already exists
      const existing = await Policy.findOne({ riderId: policy.riderId._id, weekId: nextWeekId });
      if (existing) continue;

      // Enqueue payment job (actual payment via Bull worker)
      const { getQueue } = require('../../workers/queueManager');
      await getQueue(QUEUES.PAYOUT).add('auto-renew', {
        riderId: policy.riderId._id.toString(),
        tier: policy.tier,
        weekId: nextWeekId,
        previousPolicyId: policy._id.toString(),
      });
      results.initiated++;
    } catch (err) {
      logger.error(`Auto-renewal failed for rider ${policy.riderId._id}: ${err.message}`);
      results.failed++;
    }
  }

  logger.info(`Auto-renewals: initiated=${results.initiated}, failed=${results.failed}`);
  return results;
};

/**
 * Handle policy lapse when payment not received
 */
const lapseUnpaidPolicies = async () => {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  const result = await Policy.updateMany(
    { status: POLICY_STATUS.PENDING_PAYMENT, createdAt: { $lt: thirtyMinAgo } },
    { $set: { status: POLICY_STATUS.LAPSED } }
  );
  if (result.modifiedCount > 0) {
    logger.info(`Lapsed ${result.modifiedCount} unpaid policies`);
  }
  return result.modifiedCount;
};

module.exports = {
  getPremiumQuote,
  createPolicy,
  activatePolicy,
  getActivePolicyForRider,
  getActivePoliciesInCity,
  processAutoRenewals,
  lapseUnpaidPolicies,
};
