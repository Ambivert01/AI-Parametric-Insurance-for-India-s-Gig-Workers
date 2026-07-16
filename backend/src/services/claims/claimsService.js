const Claim = require('../../models/Claim');
const Policy = require('../../models/Policy');
const TriggerEvent = require('../../models/TriggerEvent');
const User = require('../../models/User');
const { redis, KEYS } = require('../../config/redis');
const { assessClaim } = require('../fraud/fraudService');
const {
  CLAIM_STATUS, FRAUD_TIERS, BUSINESS_RULES, QUEUES, SOCKET_EVENTS,
} = require('../../config/constants');
const { getActivePoliciesInCity } = require('../policy/policyService');
const { getAppealDeadline } = require('../../utils/dateTime');
const logger = require('../../utils/logger');

// Estimated disruption length used for the *instant* payout calculation at
// claim-creation time (the platform pays within minutes — it can't wait for
// the event to end to measure real elapsed time). Previously this was
// `Math.min(6, Math.max(1, 3))`, which is always exactly 3 regardless of
// trigger type or severity — a Level-1 drizzle and a Level-4 cyclone paid
// out identically. Rough but real per-type/severity estimates, grounded in
// each trigger's own configured duration where available.
const DISRUPTION_HOURS_ESTIMATE = {
  HEAVY_RAIN:       { partial: 2, full: 4, extreme: 6 },
  EXTREME_HEAT:     { partial: 3, full: 4, extreme: 6 },
  AQI_SPIKE:        { partial: 4, full: 6, extreme: 8 },
  CYCLONE:          { partial: 3, full: 5, extreme: 8 },
  CURFEW:           { partial: 6, full: 8, extreme: 10 },
  BANDH:            { partial: 6, full: 8, extreme: 10 },
  PLATFORM_OUTAGE:  { partial: 1, full: 2, extreme: 3 },
  TRAFFIC_SHUTDOWN: { partial: 2, full: 3, extreme: 4 },
};
const estimateDisruptionHours = (triggerType, severity) =>
  DISRUPTION_HOURS_ESTIMATE[triggerType]?.[severity] ?? DISRUPTION_HOURS_ESTIMATE[triggerType]?.full ?? 3;


/**
 * Core: Process a confirmed trigger event
 * - Matches active policies in city
 * - Calculates payout for each rider
 * - Runs fraud check
 * - Routes to appropriate tier action
 */
const processTriggerEvent = async (triggerId, io = null) => {
  const triggerEvent = await TriggerEvent.findById(triggerId);
  if (!triggerEvent) throw new Error(`TriggerEvent ${triggerId} not found`);

  // Mark as verifying
  triggerEvent.status = 'verifying';
  await triggerEvent.save();

  // Get all active policies with this trigger type in affected city — narrowed
  // to the trigger's affectedPincodes when the event is localized (e.g. an
  // admin-confirmed curfew covering specific pincodes). Weather/AQI events
  // stay city-wide, which is appropriate — a 25km rain cell genuinely covers
  // most of a metro's delivery zone. Previously EVERY trigger type matched
  // every active policy in the city with no geographic narrowing at all.
  let activePolicies = await getActivePoliciesInCity(
    triggerEvent.cityId,
    triggerEvent.triggerType.toLowerCase()
  );

  if (triggerEvent.affectedPincodes?.length) {
    activePolicies = activePolicies.filter((p) =>
      !p.riderId?.riderProfile?.pincode || triggerEvent.affectedPincodes.includes(p.riderId.riderProfile.pincode)
    );
  }

  if (!activePolicies.length) {
    triggerEvent.status = 'confirmed';
    triggerEvent.confirmedAt = new Date();
    triggerEvent.affectedPoliciesCount = 0;
    await triggerEvent.save();
    logger.info(`No active policies for event ${triggerEvent.eventId} in ${triggerEvent.cityId}`);
    return { processed: 0 };
  }

  triggerEvent.status = 'confirmed';
  triggerEvent.isVerified = true;
  triggerEvent.confirmedAt = new Date();
  triggerEvent.affectedPoliciesCount = activePolicies.length;
  await triggerEvent.save();

  const isRainEvent = triggerEvent.triggerType === 'HEAVY_RAIN';
  const disruptionHours = estimateDisruptionHours(triggerEvent.triggerType, triggerEvent.severity);
  const disruptionFraction = Math.min(1, disruptionHours / 8);

  const results = { created: 0, skipped: 0, errors: 0 };
  const { getQueue } = require('../../workers/queueManager');

  for (const policy of activePolicies) {
    try {
      const riderId = policy.riderId._id.toString();

      // Idempotency: one claim per rider per event
      const lockKey = KEYS.claimLock(riderId, triggerEvent._id.toString());
      const alreadyProcessing = await redis.exists(lockKey);
      if (alreadyProcessing) { results.skipped++; continue; }
      await redis.set(lockKey, '1', BUSINESS_RULES.CLAIM_COOLING_HOURS * 3600);

      // Calculate payout
      const basePayoutInr = Math.round(
        policy.tierDetails.dailyCoverageInr
        * disruptionFraction
        * (triggerEvent.payoutPercent / 100)
      );

      // Cap at remaining weekly cover
      const remainingCover = policy.tierDetails.weeklyMaxInr - policy.totalPayoutInr;
      const finalPayoutInr = Math.min(basePayoutInr, remainingCover, policy.tierDetails.weeklyMaxInr * BUSINESS_RULES.MAX_PAYOUT_AS_PERCENT_OF_WEEKLY);

      if (finalPayoutInr <= 0) { results.skipped++; continue; }

      // Create claim record
      const claim = new Claim({
        riderId,
        policyId: policy._id,
        eventId: triggerEvent._id,
        triggerType: triggerEvent.triggerType,
        triggerValue: triggerEvent.triggerValue,
        cityId: triggerEvent.cityId,
        dailyCoverageInr: policy.tierDetails.dailyCoverageInr,
        weeklyMaxInr: policy.tierDetails.weeklyMaxInr,
        disruptionHours,
        disruptionFraction,
        basePayoutInr,
        finalPayoutInr,
        status: CLAIM_STATUS.FRAUD_SCREENING,
        detectedAt: new Date(),
      });

      await claim.save();
      triggerEvent.claimsInitiated++;

      // Emit real-time update to admin
      if (io) {
        io.to('admins').emit(SOCKET_EVENTS.CLAIM_UPDATED, {
          claimId: claim.claimId,
          status: CLAIM_STATUS.FRAUD_SCREENING,
          riderId,
        });
      }

      // Queue fraud check
      await getQueue(QUEUES.FRAUD_CHECK).add('check-claim', {
        claimId: claim._id.toString(),
        isRainEvent,
        priority: policy.tierDetails.priorityProcessing ? 1 : 5,
      }, { priority: policy.tierDetails.priorityProcessing ? 1 : 5 });

      results.created++;
    } catch (err) {
      logger.error(`Claim creation failed for policy ${policy._id}: ${err.message}`);
      results.errors++;
    }
  }

  await triggerEvent.save();
  logger.claim(triggerId, 'TRIGGER_PROCESSED', null, results);
  return results;
};

/**
 * Run fraud assessment on a claim and route it
 */
// Income Bridge advance — a conservative fraction of the estimated payout,
// gated on trigger confidence being very high (this releases real money
// ahead of identity verification, so the bar is deliberately higher than
// the general "high confidence" band used for auto-detection elsewhere).
const INCOME_BRIDGE_CONFIDENCE_THRESHOLD = 85;
const INCOME_BRIDGE_ADVANCE_FRACTION = 0.5;

const issueIncomeBridgeAdvance = async (claim, io = null) => {
  try {
    const triggerEvent = await TriggerEvent.findById(claim.eventId).select('confidence').lean();
    if (!triggerEvent || triggerEvent.confidence < INCOME_BRIDGE_CONFIDENCE_THRESHOLD) return;

    const advanceInr = Math.round(claim.finalPayoutInr * INCOME_BRIDGE_ADVANCE_FRACTION);
    if (advanceInr <= 0) return;

    claim.advanceInr = advanceInr;
    claim.advanceStatus = 'issued';
    claim.advanceIssuedAt = new Date();
    await claim.save();

    const { getQueue } = require('../../workers/queueManager');
    await getQueue(QUEUES.PAYOUT).add('initiate-payout', {
      claimId: claim._id.toString(),
      riderId: claim.riderId.toString(),
      amountInr: advanceInr,
      channel: 'upi',
      isAdvance: true,
    });

    await getQueue(QUEUES.NOTIFICATION).add('income-bridge-advance', {
      riderId: claim.riderId.toString(), claimId: claim._id.toString(),
      advanceInr, remainingInr: claim.finalPayoutInr - advanceInr,
    });

    if (io) {
      io.to(`rider:${claim.riderId}`).emit(SOCKET_EVENTS.CLAIM_UPDATED, {
        claimId: claim.claimId, status: claim.status,
        advanceInr, message: `₹${advanceInr} advance sent while we confirm your claim`,
      });
    }

    logger.claim(claim._id.toString(), 'INCOME_BRIDGE_ADVANCE_ISSUED', claim.riderId.toString(), { advanceInr, confidence: triggerEvent.confidence });
  } catch (err) {
    // Advance is a bonus on top of the normal flow — never let it block
    // the underlying claim from proceeding to verification.
    logger.error(`Income Bridge advance failed for claim ${claim._id}: ${err.message}`);
  }
};

const runFraudCheckOnClaim = async (claimId, isRainEvent = false, io = null) => {
  const claim = await Claim.findById(claimId).populate('policyId riderId');
  if (!claim) throw new Error(`Claim ${claimId} not found`);

  const rider = claim.riderId;
  const policy = claim.policyId;
  const triggerGeo = await TriggerEvent.findById(claim.eventId).select('centerLat centerLon radiusKm').lean();

  // Run fraud assessment
  const fraudResult = await assessClaim({
    riderId: rider._id.toString(),
    policyId: policy._id.toString(),
    eventId: claim.eventId.toString(),
    cityId: claim.cityId,
    triggerType: claim.triggerType,
    triggerValue: claim.triggerValue,
    riderLat: claim.riderLat,
    riderLon: claim.riderLon,
    triggerCenterLat: triggerGeo?.centerLat,
    triggerCenterLon: triggerGeo?.centerLon,
    triggerRadiusKm: triggerGeo?.radiusKm,
    riderCellTower: claim.riderCellTower,
    accelerometerData: claim.accelerometerData,
    gpsReadings: claim.gpsReadings,
    platformWasActive: claim.platformWasActive,
    hadOrderPings: claim.hadOrderPings,
    policyStartDate: policy.startDate,
    isRainEvent,
  });

  claim.fraudCheck = fraudResult;
  claim.mlFraudScore = fraudResult.score;
  claim.fraudCheckedAt = new Date();

  const { getQueue } = require('../../workers/queueManager');

  switch (fraudResult.action) {
    case 'auto_approve':
      claim.status = CLAIM_STATUS.APPROVED;
      claim.approvedAt = new Date();
      await claim.save();
      await getQueue(QUEUES.PAYOUT).add('initiate-payout', {
        claimId: claim._id.toString(),
        riderId: rider._id.toString(),
        amountInr: claim.finalPayoutInr,
        channel: policy.tierDetails.payoutChannels?.[0] || 'upi',
      });
      logger.claim(claimId, 'AUTO_APPROVED', rider._id.toString(), { score: fraudResult.score });
      break;

    case 'approve_soft_verify':
      claim.status = CLAIM_STATUS.APPROVED;
      claim.approvedAt = new Date();
      await claim.save();
      // Payout immediately, then send soft verification prompt
      await getQueue(QUEUES.PAYOUT).add('initiate-payout', {
        claimId: claim._id.toString(), riderId: rider._id.toString(),
        amountInr: claim.finalPayoutInr, channel: 'upi',
      });
      await getQueue(QUEUES.NOTIFICATION).add('soft-verify-prompt', {
        riderId: rider._id.toString(), claimId: claim._id.toString(),
      });
      break;

    case 'hold_quick_verify':
      claim.status = CLAIM_STATUS.PENDING_VERIFICATION;
      await claim.save();
      await getQueue(QUEUES.NOTIFICATION).add('request-selfie', {
        riderId: rider._id.toString(), claimId: claim._id.toString(),
        amountInr: claim.finalPayoutInr, holdTimeoutHours: 2,
      });
      // Income Bridge (doc §40): the fraud tier wants selfie confirmation
      // that THIS rider was affected, but that's a separate question from
      // whether the disruption itself is real — which the trigger's own
      // confidence score already answers independently. When that
      // confidence is very high, release a partial advance now instead of
      // making the rider wait the full 2-hour hold for money they're very
      // likely owed regardless.
      await issueIncomeBridgeAdvance(claim, io);
      break;

    case 'reject_appeal':
      claim.status = CLAIM_STATUS.REJECTED;
      claim.rejectedAt = new Date();
      claim.rejectReason = fraudResult.reasons.join('; ');
      claim.appealDeadline = getAppealDeadline(new Date());
      await claim.save();
      await getQueue(QUEUES.NOTIFICATION).add('claim-rejected', {
        riderId: rider._id.toString(), claimId: claim._id.toString(),
        reason: 'verification_failed',
        appealDeadline: claim.appealDeadline,
      });
      break;
  }

  if (io) {
    io.to(`rider:${rider._id}`).emit(SOCKET_EVENTS.CLAIM_UPDATED, {
      claimId: claim.claimId, status: claim.status,
      amountInr: claim.finalPayoutInr,
    });
  }

  return claim;
};

/**
 * Approve claim after selfie verification (ORANGE tier)
 */
const approveAfterSelfieVerification = async (claimId, selfieUrl, selfieHasRain) => {
  const claim = await Claim.findById(claimId).populate('policyId');
  if (!claim) throw new Error('Claim not found');

  claim.selfieUrl = selfieUrl;
  claim.selfieHasRain = selfieHasRain;
  claim.selfieVerifiedAt = new Date();

  if (selfieHasRain) {
    claim.status = CLAIM_STATUS.APPROVED;
    claim.approvedAt = new Date();
    const remainingInr = claim.finalPayoutInr - (claim.advanceInr || 0);
    if (claim.advanceInr > 0) claim.advanceStatus = 'reconciled';
    await claim.save();
    if (remainingInr > 0) {
      const { getQueue } = require('../../workers/queueManager');
      await getQueue(QUEUES.PAYOUT).add('initiate-payout', {
        claimId: claim._id.toString(),
        riderId: claim.riderId.toString(),
        amountInr: remainingInr,
        channel: 'upi',
      });
    }
    return claim;
  } else {
    // No rain visible → manual review
    claim.status = CLAIM_STATUS.PENDING_VERIFICATION;
  }

  await claim.save();
  return claim;
};

/**
 * Submit appeal for a rejected claim
 */
const submitAppeal = async (claimId, riderId, reason, evidenceUrls = []) => {
  const claim = await Claim.findOne({ _id: claimId, riderId });
  if (!claim) throw new Error('Claim not found');
  if (claim.status !== CLAIM_STATUS.REJECTED) {
    throw Object.assign(new Error('Only rejected claims can be appealed'), { statusCode: 400 });
  }
  if (new Date() > claim.appealDeadline) {
    throw Object.assign(new Error('Appeal window has closed (72 hours)'), { statusCode: 400 });
  }
  if (claim.appeal?.submittedAt) {
    throw Object.assign(new Error('Appeal already submitted'), { statusCode: 409 });
  }

  claim.appeal = { reason, evidenceUrls, submittedAt: new Date() };
  claim.status = CLAIM_STATUS.APPEAL_PENDING;
  await claim.save();

  const { getQueue } = require('../../workers/queueManager');
  await getQueue(QUEUES.NOTIFICATION).add('appeal-received', {
    riderId, claimId: claim._id.toString(),
    manualReviewSLAHours: BUSINESS_RULES.MANUAL_REVIEW_SLA_HOURS,
  });

  return claim;
};

/**
 * Get claim history for a rider
 */
const getRiderClaims = async (riderId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  const [claims, total] = await Promise.all([
    Claim.find({ riderId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('eventId', 'triggerType triggerValue cityId detectedAt')
      .lean(),
    Claim.countDocuments({ riderId }),
  ]);
  return { claims, total, page, limit };
};

/**
 * Resolve claims that have sat in PENDING_VERIFICATION past their selfie
 * hold window with no selfie ever submitted. Previously nothing enforced
 * `holdTimeoutHours` at all — it was passed into a notification payload and
 * never read again, so an unresponsive rider's claim just stayed in limbo
 * indefinitely. Meant to run on a schedule (see cronJobs.js).
 */
const HOLD_TIMEOUT_HOURS = 2;
const expirePendingVerificationClaims = async () => {
  const cutoff = new Date(Date.now() - HOLD_TIMEOUT_HOURS * 3600000);
  const stuck = await Claim.find({
    status: CLAIM_STATUS.PENDING_VERIFICATION,
    selfieUrl: { $exists: false },
    fraudCheckedAt: { $lte: cutoff },
  });

  let resolved = 0;
  for (const claim of stuck) {
    claim.status = CLAIM_STATUS.REJECTED;
    claim.rejectedAt = new Date();
    claim.rejectReason = 'Selfie verification window expired without a response';
    claim.appealDeadline = getAppealDeadline(new Date());

    if (claim.advanceInr > 0 && claim.advanceStatus === 'issued') {
      // Money already moved on this one — convert to a recoverable debt
      // rather than pretending it can be silently reversed.
      claim.advanceStatus = 'clawback_pending';
      await User.findByIdAndUpdate(claim.riderId, { $inc: { outstandingAdvanceInr: claim.advanceInr } });
    }

    await claim.save();
    const { getQueue } = require('../../workers/queueManager');
    await getQueue(QUEUES.NOTIFICATION).add('claim-rejected', {
      riderId: claim.riderId.toString(), claimId: claim._id.toString(),
      reason: 'verification_timeout',
      appealDeadline: claim.appealDeadline,
    });
    resolved++;
  }

  if (resolved) logger.info(`Expired ${resolved} unverified claim(s) past their selfie hold window`);
  return { resolved };
};

module.exports = {
  processTriggerEvent,
  runFraudCheckOnClaim,
  approveAfterSelfieVerification,
  submitAppeal,
  getRiderClaims,
  expirePendingVerificationClaims,
  // Exported for unit testing — pure functions/constants.
  estimateDisruptionHours,
  issueIncomeBridgeAdvance,
  INCOME_BRIDGE_CONFIDENCE_THRESHOLD,
  INCOME_BRIDGE_ADVANCE_FRACTION,
};
