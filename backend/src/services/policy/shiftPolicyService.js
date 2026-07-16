/**
 * Per-Shift Micro Insurance — Innovation 10
 * Riders activate 6-hour shift coverage for ₹8–₹15
 * GPS geofencing locks zone at activation. Auto-deactivates.
 */
const User = require('../../models/User');
const Policy = require('../../models/Policy');
const { redis, KEYS } = require('../../config/redis');
const { COVERAGE_TIERS, POLICY_STATUS, PAYMENT_STATUS, TRIGGER_TYPES } = require('../../config/constants');
const { getPolicyWeekId, isInPeakHours } = require('../../utils/dateTime');
const { getNearestCity } = require('../../utils/geo');
const logger = require('../../utils/logger');

const SHIFT_DURATION_HOURS = 6;
const SHIFT_PRICE_INR = {
  BASIC: 8,
  STANDARD: 12,
  PRO: 15,
  ELITE: 20,
};
const SHIFT_COVERAGE_MULTIPLIER = 0.75; // shift coverage = 75% of daily coverage

// Active shift key in Redis
const shiftKey = (riderId) => `shift:active:${riderId}`;

/**
 * Get shift insurance quote
 */
const getShiftQuote = async (riderId, lat, lon) => {
  const user = await User.findById(riderId).select('riderProfile loyaltyDiscount').lean();
  if (!user?.riderProfile) {
    throw Object.assign(new Error('Complete your profile first'), { statusCode: 400 });
  }

  // Check no active weekly policy (shift is for riders without weekly) — this
  // used to fetch weeklyPolicy and then never check it, so the message below
  // was dead code and a rider with full weekly cover could still be quoted
  // (and, worse, could actually activate) redundant shift cover.
  const weekId = getPolicyWeekId();
  const weeklyPolicy = await Policy.findOne({ riderId, weekId, policyType: 'WEEKLY', status: POLICY_STATUS.ACTIVE });
  if (weeklyPolicy) {
    throw Object.assign(new Error('You already have an active weekly policy — shift cover is for riders without one'), { statusCode: 409 });
  }

  const nearestCity = getNearestCity(lat, lon);
  const isPeak = isInPeakHours();
  const loyaltyDiscount = user.loyaltyDiscount || 0;

  return Object.fromEntries(
    Object.entries(SHIFT_PRICE_INR).map(([tier, price]) => {
      const discounted = Math.round(price * (1 - loyaltyDiscount));
      const tierConfig = COVERAGE_TIERS[tier];
      return [tier, {
        priceInr: discounted,
        originalPriceInr: price,
        coverageInr: Math.round(tierConfig.daily_coverage_inr * SHIFT_COVERAGE_MULTIPLIER),
        durationHours: SHIFT_DURATION_HOURS,
        city: nearestCity?.name,
        isPeakHour: isPeak,
        triggers: tier === 'BASIC' ? ['heavy_rain', 'aqi_spike'] : tierConfig.triggers,
      }];
    })
  );
};

/**
 * Activate shift insurance
 */
const activateShift = async (riderId, tier, lat, lon, paymentRef) => {
  const existing = await redis.get(shiftKey(riderId));
  if (existing) {
    // redis.get already JSON-parses — existing is an object here, not a
    // string, so calling JSON.parse(existing) on it throws instead of
    // returning the friendly 409 message this was clearly meant to give.
    throw Object.assign(new Error('You already have an active shift. It expires in ' +
      Math.ceil((existing.expiresAt - Date.now()) / 3600000) + ' hours'), { statusCode: 409 });
  }

  // Same weekly-conflict rule as getShiftQuote — this had no check at all,
  // so a rider with an active weekly policy could activate a shift and hit
  // a MongoDB duplicate-key error on save (WEEKLY policies are unique per
  // rider per week).
  const weekId = getPolicyWeekId();
  const weeklyPolicy = await Policy.findOne({ riderId, weekId, policyType: 'WEEKLY', status: POLICY_STATUS.ACTIVE });
  if (weeklyPolicy) {
    throw Object.assign(new Error('You already have an active weekly policy — shift cover is for riders without one'), { statusCode: 409 });
  }

  const nearestCity = getNearestCity(lat, lon);
  if (!nearestCity) throw Object.assign(new Error('Unable to detect city'), { statusCode: 400 });

  const tierConfig = COVERAGE_TIERS[tier.toUpperCase()];
  if (!tierConfig) throw Object.assign(new Error('Invalid tier'), { statusCode: 400 });

  const expiresAt = Date.now() + SHIFT_DURATION_HOURS * 3600000;
  const shiftData = {
    riderId: riderId.toString(),
    tier: tier.toUpperCase(),
    cityId: nearestCity.id,
    lat, lon,
    activatedAt: new Date().toISOString(),
    expiresAt,
    coverageInr: Math.round(tierConfig.daily_coverage_inr * SHIFT_COVERAGE_MULTIPLIER),
    priceInr: SHIFT_PRICE_INR[tier.toUpperCase()],
    triggers: tierConfig.triggers,
    paymentRef,
    type: 'SHIFT',
  };

  // Store in Redis (auto-expires with shift)
  await redis.set(shiftKey(riderId), shiftData, SHIFT_DURATION_HOURS * 3600);

  // Also create a lightweight policy record
  const shiftPolicy = new Policy({
    riderId,
    tier: tier.toUpperCase(),
    policyType: 'SHIFT',
    tierDetails: {
      dailyCoverageInr: shiftData.coverageInr,
      weeklyMaxInr: shiftData.coverageInr,
      triggers: shiftData.triggers,
      payoutChannels: ['upi'],
    },
    weekId,
    startDate: new Date(),
    endDate: new Date(expiresAt),
    cityId: nearestCity.id,
    lat, lon,
    premiumBreakdown: { basePremium: shiftData.priceInr, riskScore: 0.5, seasonalMultiplier: 1, zoneRiskMultiplier: 1, finalPremium: shiftData.priceInr, mlModelVersion: 'shift_v1' },
    premiumAmountInr: shiftData.priceInr,
    paymentId: paymentRef,
    paymentRef,
    paidAt: new Date(),
    status: POLICY_STATUS.ACTIVE,
    paymentStatus: PAYMENT_STATUS.COMPLETED,
  });
  await shiftPolicy.save();

  logger.info(`Shift insurance activated: rider=${riderId} tier=${tier} city=${nearestCity.id} expires=${new Date(expiresAt).toISOString()}`);

  const { sendNotification } = require('../notification/notificationService');
  await sendNotification(riderId, 'policy-activated', {
    tier: `${tier} (Shift)`,
    weekId: 'this shift',
    amountInr: shiftData.priceInr,
  });

  return { ...shiftData, policyId: shiftPolicy._id };
};

/**
 * Get active shift status
 */
const getActiveShift = async (riderId) => {
  const shift = await redis.get(shiftKey(riderId));
  if (!shift) return null;
  return {
    ...shift,
    remainingMinutes: Math.max(0, Math.ceil((shift.expiresAt - Date.now()) / 60000)),
    isExpired: Date.now() > shift.expiresAt,
  };
};

/**
 * Deactivate shift early (rider ends shift)
 */
const deactivateShift = async (riderId) => {
  const shift = await redis.get(shiftKey(riderId));
  if (!shift) return { wasActive: false };
  await redis.del(shiftKey(riderId));
  logger.info(`Shift deactivated early: rider=${riderId}`);
  return { wasActive: true, activatedAt: shift.activatedAt };
};

/**
 * Get active shift policies in a city (for trigger matching). Note:
 * getActivePoliciesInCity() in policyService already matches shift policies
 * too (it has no policyType filter), so this is only needed when something
 * specifically wants shift-only results — e.g. an admin breakdown view.
 */
const getActiveShiftPoliciesInCity = async (cityId, triggerType) => {
  const query = {
    cityId,
    policyType: 'SHIFT',
    status: POLICY_STATUS.ACTIVE,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() },
  };
  if (triggerType) query['tierDetails.triggers'] = triggerType;
  return Policy.find(query)
    .populate('riderId', 'name phone riderProfile devices notificationPrefs bankDetails')
    .lean();
};

module.exports = {
  getShiftQuote,
  activateShift,
  getActiveShift,
  deactivateShift,
  getActiveShiftPoliciesInCity,
};
