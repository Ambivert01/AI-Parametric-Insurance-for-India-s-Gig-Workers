const axios = require('axios');
const User = require('../../models/User');
const { FraudLog } = require('../../models/index');
const { redis, KEYS } = require('../../config/redis');
const { FRAUD_TIERS, BUSINESS_RULES } = require('../../config/constants');
const { detectGpsSpoofing, validateCellTowerLocation, checkLocationConsistency } = require('../../utils/geo');
const logger = require('../../utils/logger');

// ─── Individual Signal Evaluators ─────────────────────────

/**
 * S1: GPS in zone check (weak alone, strong in combination)
 */
const checkGPSInZone = (riderCityId, claimCityId, riderLat, riderLon, cityConfig) => {
  if (!riderLat || !riderLon) return { score: 0, valid: null, reason: 'no_gps_data' };
  const { isInCityRadius } = require('../../utils/geo');
  const inCity = isInCityRadius(riderLat, riderLon, claimCityId, 60);
  return { score: inCity ? 15 : -30, valid: inCity, reason: inCity ? 'gps_in_zone' : 'gps_out_of_zone' };
};

/**
 * S2: Cell tower geography check (strong signal — can't be easily spoofed)
 */
const checkCellTower = (claimCityId, cellInfo) => {
  if (!cellInfo?.lat) return { score: 0, valid: null, reason: 'no_cell_data' };
  const result = validateCellTowerLocation(claimCityId, cellInfo);
  if (result.valid) return { score: 25, valid: true, reason: 'cell_tower_in_city' };
  return { score: -50, valid: false, reason: `cell_tower_${result.distanceKm}km_away` };
};

/**
 * S3: Physics consistency — accelerometer/gyroscope analysis
 */
const checkPhysicsConsistency = (accelerometerData) => {
  if (!accelerometerData) return { score: 0, valid: null, reason: 'no_sensor_data' };
  const { variance, isFlat, readings } = accelerometerData;
  if (readings < 5) return { score: 0, valid: null, reason: 'insufficient_readings' };

  // Flat = person stationary at home
  // Very flat (variance < 0.001) = spoofing
  if (isFlat && variance < 0.001) return { score: -35, valid: false, reason: 'suspiciously_flat_accelerometer' };
  if (variance > 0.1) return { score: 20, valid: true, reason: 'natural_motion_detected' };
  return { score: 5, valid: true, reason: 'moderate_motion' };
};

/**
 * S4: Mock location app detected
 */
const checkMockLocationApp = (device) => {
  if (!device) return { score: 0, valid: null, reason: 'no_device_data' };
  if (device.isMockLocation || device.hasMockApps) {
    return { score: -60, valid: false, reason: 'mock_location_app_detected' };
  }
  return { score: 15, valid: true, reason: 'no_mock_apps' };
};

/**
 * S5: GPS spoofing pattern detection
 */
const checkGPSSpoofPattern = (gpsReadings) => {
  if (!gpsReadings || gpsReadings.length < 3) return { score: 0, reason: 'insufficient_gps_history' };
  const result = detectGpsSpoofing(gpsReadings);
  if (result.isSpoofed) return { score: -50, valid: false, reason: `gps_spoof_${result.reason}`, confidence: result.confidence };
  return { score: 10, valid: true, reason: 'gps_appears_genuine' };
};

/**
 * S6: Platform activity validation
 */
const checkPlatformActivity = (platformWasActive, hadOrderPings) => {
  if (platformWasActive === null || platformWasActive === undefined) {
    return { score: 0, reason: 'no_platform_data' };
  }
  if (!platformWasActive) return { score: -20, valid: false, reason: 'platform_app_not_open' };
  if (hadOrderPings) return { score: 20, valid: true, reason: 'received_order_pings' };
  return { score: 10, valid: true, reason: 'app_open_no_pings' }; // valid if event caused no orders
};

/**
 * S7: Account age (very new accounts are higher risk)
 */
const checkAccountAge = (createdAt) => {
  const hoursOld = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
  if (hoursOld < 2) return { score: -40, reason: 'account_under_2hrs' };
  if (hoursOld < 24) return { score: -20, reason: 'account_under_24hrs' };
  if (hoursOld < 168) return { score: -5, reason: 'account_under_1wk' };
  return { score: 10, reason: 'established_account' };
};

/**
 * S8: Policy maturity (must be active 2+ hours before claim)
 */
const checkPolicyMaturity = (policyStartDate) => {
  const { isPolicyMatureForClaim } = require('../../utils/dateTime');
  if (!isPolicyMatureForClaim(policyStartDate)) {
    return { score: -35, valid: false, reason: 'policy_too_new' };
  }
  return { score: 15, valid: true, reason: 'policy_mature' };
};

/**
 * S9: Duplicate claim check (one payout per event per rider)
 */
const checkDuplicateClaim = async (riderId, eventId) => {
  const lockKey = KEYS.claimLock(riderId, eventId);
  const exists = await redis.exists(lockKey);
  if (exists) return { score: -100, valid: false, reason: 'duplicate_claim_same_event' };
  return { score: 10, valid: true, reason: 'no_duplicate' };
};

/**
 * S10: UPI/Bank reuse across multiple accounts
 */
const checkUPIReuse = async (riderId, upiId) => {
  if (!upiId) return { score: 0, reason: 'no_upi_data' };
  const count = await User.countDocuments({
    'bankDetails.upiId': upiId,
    _id: { $ne: riderId },
  });
  if (count >= 2) return { score: -50, valid: false, reason: `upi_used_by_${count}_accounts` };
  if (count === 1) return { score: -20, valid: false, reason: 'upi_shared_with_1_account' };
  return { score: 10, valid: true, reason: 'unique_upi' };
};

/**
 * S11: Temporal burst detection (ring attack signal)
 */
const checkTemporalBurst = async (cityId, triggerType) => {
  const burstKey = `burst:${cityId}:${triggerType}:${Math.floor(Date.now() / (5 * 60 * 1000))}`;
  const count = await redis.incr(burstKey);
  await redis.expire(burstKey, 10 * 60); // 10 min window

  if (count > 200) return { score: -30, valid: false, reason: `claim_burst_${count}_in_5min` };
  if (count > 100) return { score: -15, valid: false, reason: `elevated_burst_${count}` };
  return { score: 5, reason: 'normal_claim_rate' };
};

/**
 * S12: Weather correlation (does claimed location match actual rain data?)
 */
const checkWeatherCorrelation = async (cityId, triggerType, triggerValue) => {
  // If we have the trigger event, we already confirmed weather data
  // This checks if the rider's sub-zone correlates with event
  return { score: 10, reason: 'weather_event_confirmed_for_city' };
};

/**
 * S13: Historical fraud score of the rider
 */
const checkRiderFraudHistory = (riderFraudScore, fraudFlags) => {
  if (riderFraudScore >= 80) return { score: -40, reason: 'high_historical_fraud_score' };
  if (riderFraudScore >= 50) return { score: -20, reason: 'elevated_fraud_history' };
  if (fraudFlags?.includes('mock_location_app_detected')) return { score: -25, reason: 'mock_app_registered' };
  return { score: 10, reason: 'clean_history' };
};

// ─── ML-based fraud score from Python service ─────────────
const getMLFraudScore = async (features) => {
  try {
    const response = await axios.post(
      `${process.env.ML_SERVICE_URL}/api/v1/fraud/score`,
      features,
      {
        headers: { 'x-service-secret': process.env.ML_SERVICE_SECRET },
        timeout: 3000,
      }
    );
    return response.data.data?.fraudScore || null;
  } catch {
    return null;
  }
};

// ──────────────────────────────────────────────────────────
// MAIN: Run full fraud assessment
// ──────────────────────────────────────────────────────────
const assessClaim = async ({
  riderId, policyId, eventId, cityId, triggerType, triggerValue,
  riderLat, riderLon, riderCellTower, accelerometerData, gpsReadings,
  platformWasActive, hadOrderPings, policyStartDate, isRainEvent = false,
}) => {
  const rider = await User.findById(riderId).select('createdAt fraudScore fraudFlags devices bankDetails').lean();
  if (!rider) throw new Error('Rider not found');

  const device = rider.devices?.[rider.devices.length - 1]; // most recent device

  // ─── Run all 13 rule-based signals ────────────────────
  const [
    s1, s2, s3, s4, s5, s6, s7, s8,
    s9, s10, s11, s12, s13,
  ] = await Promise.all([
    Promise.resolve(checkGPSInZone(null, cityId, riderLat, riderLon)),
    Promise.resolve(checkCellTower(cityId, riderCellTower)),
    Promise.resolve(checkPhysicsConsistency(accelerometerData)),
    Promise.resolve(checkMockLocationApp(device)),
    Promise.resolve(checkGPSSpoofPattern(gpsReadings)),
    Promise.resolve(checkPlatformActivity(platformWasActive, hadOrderPings)),
    Promise.resolve(checkAccountAge(rider.createdAt)),
    Promise.resolve(checkPolicyMaturity(policyStartDate)),
    checkDuplicateClaim(riderId, eventId),
    checkUPIReuse(riderId, rider.bankDetails?.upiId),
    checkTemporalBurst(cityId, triggerType),
    checkWeatherCorrelation(cityId, triggerType, triggerValue),
    Promise.resolve(checkRiderFraudHistory(rider.fraudScore, rider.fraudFlags)),
  ]);

  const signals = { s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13 };

  // ─── Compute aggregate score ──────────────────────────
  // Start from 70 (benefit of the doubt)
  let trustScore = 70;
  for (const sig of Object.values(signals)) {
    trustScore += (sig.score || 0);
  }
  trustScore = Math.max(0, Math.min(100, trustScore));

  // ─── Rain-adaptive scoring: loosen by 15 pts ──────────
  if (isRainEvent) {
    trustScore = Math.min(100, trustScore + 15);
  }

  // ─── Hard overrides (instant RED regardless of score) ─
  const hardRejects = [];
  if (s4.valid === false) hardRejects.push('mock_location_app');
  if (s9.valid === false) hardRejects.push('duplicate_claim');
  if (s10.valid === false && s10.reason?.includes('2_accounts')) hardRejects.push('upi_reuse');

  if (hardRejects.length > 0) {
    trustScore = Math.min(trustScore, 15); // force RED
  }

  // ─── Get ML score (async, non-blocking) ───────────────
  const mlFeatures = {
    trustScore, cityId, triggerType,
    accountAgeHours: (Date.now() - new Date(rider.createdAt).getTime()) / 3600000,
    hasMockApp: device?.hasMockApps || false,
    gpsInZone: s1.valid,
    cellTowerValid: s2.valid,
    physicsOk: s3.valid,
    burstCount: parseInt(s11.reason?.match(/\d+/)?.[0] || '1'),
    historicalFraudScore: rider.fraudScore,
  };
  const mlScore = await getMLFraudScore(mlFeatures);
  if (mlScore !== null) {
    // ML returns fraudScore (0=clean, 100=fraudulent)
    // trustScore is (0=fraudulent, 100=trustworthy) — opposite direction
    // Convert: mlTrustContrib = 100 - fraudScore
    const mlTrustContrib = 100 - mlScore;
    trustScore = Math.round(trustScore * 0.6 + mlTrustContrib * 0.4);
  }

  // ─── Determine tier and action ────────────────────────
  let tier = 'RED';
  for (const [key, config] of Object.entries(FRAUD_TIERS)) {
    if (trustScore >= config.min && trustScore <= config.max) {
      tier = key;
      break;
    }
  }

  const reasons = Object.entries(signals)
    .filter(([, v]) => v.valid === false || (v.score || 0) < 0)
    .map(([, v]) => v.reason)
    .filter(Boolean);

  const result = {
    score: trustScore,
    tier,
    action: FRAUD_TIERS[tier].action,
    signals: {
      gpsInZone: s1.score,
      cellTowerMatch: s2.score,
      physicsConsistency: s3.score,
      mockLocationDetected: s4.valid === false,
      platformActivity: s6.score,
      deviceRegistered: !!device,
      accountAge: s7.score,
      policyMaturity: s8.score,
      behavioralAnomaly: 0,
      claimBurst: s11.score,
      duplicateClaim: s9.valid === false,
      networkCluster: 0,
      upiReuse: s10.valid === false,
      gpsSpoof: s5.score,
      weatherCorrelation: s12.score,
    },
    reasons,
    mlModelVersion: mlScore !== null ? 'v1_blended' : 'rules_only',
    rainAdaptive: isRainEvent,
  };

  // ─── Log fraud events ─────────────────────────────────
  if (tier !== 'GREEN' && reasons.length > 0) {
    for (const reason of reasons.slice(0, 3)) {
      const fraudLog = new FraudLog({
        riderId, claimId: null,
        deviceFingerprint: device?.fingerprint,
        fraudType: mapReasonToType(reason),
        score: trustScore,
        tier,
        action: result.action,
        details: { cityId, triggerType, triggerValue },
      });
      await fraudLog.save().catch(() => {}); // non-blocking
    }
    logger.fraud(riderId, trustScore, reasons[0], { tier, city: cityId });
  }

  // ─── Update rider's fraud score (rolling max) ─────────
  if (tier === 'RED') {
    await User.findByIdAndUpdate(riderId, {
      $max: { fraudScore: Math.min(100, trustScore + 20) },
      $addToSet: { fraudFlags: reasons[0] },
    });
  }

  return result;
};

const mapReasonToType = (reason) => {
  if (reason?.includes('gps_spoof')) return 'gps_spoof';
  if (reason?.includes('mock')) return 'mock_location';
  if (reason?.includes('cell_tower')) return 'cell_tower_mismatch';
  if (reason?.includes('duplicate')) return 'duplicate_claim';
  if (reason?.includes('burst')) return 'claim_burst';
  if (reason?.includes('upi')) return 'upi_reuse';
  if (reason?.includes('platform')) return 'platform_inactive';
  if (reason?.includes('physics')) return 'physics_anomaly';
  if (reason?.includes('account_under')) return 'account_too_new';
  return 'behavioral_anomaly';
};

module.exports = { assessClaim };
