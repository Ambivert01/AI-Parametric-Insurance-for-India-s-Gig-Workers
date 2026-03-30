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
const { getDisruptionHours, getAppealDeadline } = require('../../utils/dateTime');
const logger = require('../../utils/logger');


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

  // Get all active policies with this trigger type in affected city
  const activePolicies = await getActivePoliciesInCity(
    triggerEvent.cityId,
    triggerEvent.triggerType.toLowerCase()
  );

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
  const disruptionHours = Math.min(6, Math.max(1, 3)); // estimated 3hr disruption default
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
const runFraudCheckOnClaim = async (claimId, isRainEvent = false, io = null) => {
  const claim = await Claim.findById(claimId).populate('policyId riderId');
  if (!claim) throw new Error(`Claim ${claimId} not found`);

  const rider = claim.riderId;
  const policy = claim.policyId;

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
    const { getQueue } = require('../../workers/queueManager');
    await getQueue(QUEUES.PAYOUT).add('initiate-payout', {
      claimId: claim._id.toString(),
      riderId: claim.riderId.toString(),
      amountInr: claim.finalPayoutInr,
      channel: 'upi',
    });
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

module.exports = {
  processTriggerEvent,
  runFraudCheckOnClaim,
  approveAfterSelfieVerification,
  submitAppeal,
  getRiderClaims,
};
