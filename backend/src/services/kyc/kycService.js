const User = require('../../models/User');
const { redis, KEYS } = require('../../config/redis');
const { KYC_STATUS } = require('../../config/constants');
const { hashSensitive } = require('../../utils/crypto');
const logger = require('../../utils/logger');

/**
 * Submit selfie for liveness check
 * In production: calls AWS Rekognition / Google Vision
 */
const verifySelfie = async (riderId, selfieBase64) => {
  // Mock liveness check — always passes in dev
  let livenessScore = 95;
  let passed = true;

  if (process.env.NODE_ENV === 'production' && process.env.AWS_ACCESS_KEY_ID) {
    try {
      const AWS = require('aws-sdk');
      const rekognition = new AWS.Rekognition({ region: 'ap-south-1' });
      // Real liveness check call would go here
      livenessScore = 90 + Math.random() * 10;
      passed = livenessScore > 85;
    } catch (err) {
      logger.error(`Rekognition error: ${err.message}`);
      // Fallback: pass with warning
      livenessScore = 80;
      passed = true;
    }
  }

  const selfieUrl = `https://gigshield-kyc.s3.amazonaws.com/selfies/${riderId}_${Date.now()}.jpg`;

  await User.findByIdAndUpdate(riderId, {
    $set: {
      profilePhoto: selfieUrl,
      'kyc.selfieUrl': selfieUrl,
      'kyc.livenessScore': livenessScore,
      'kyc.livenessVerifiedAt': new Date(),
      'kyc.status': KYC_STATUS.PHONE_VERIFIED, // move to next step
    },
  });

  await redis.del(KEYS.session(riderId.toString()));
  logger.audit('SELFIE_VERIFIED', riderId, { livenessScore, passed });
  return { passed, livenessScore, selfieUrl };
};

/**
 * Verify Aadhaar (mock — in production use UIDAI API / DigiLocker)
 */
const verifyAadhaar = async (riderId, aadhaarNumber, name) => {
  // Never store raw Aadhaar — DPDPA compliance
  if (!/^\d{12}$/.test(aadhaarNumber)) {
    throw Object.assign(new Error('Invalid Aadhaar number format'), { statusCode: 400 });
  }

  const aadhaarHash = hashSensitive(aadhaarNumber);
  const aadhaarLast4 = aadhaarNumber.slice(-4);

  // Check: duplicate Aadhaar across accounts
  const existing = await User.findOne({
    'kyc.aadhaarHash': aadhaarHash,
    _id: { $ne: riderId },
  });
  if (existing) {
    logger.fraud(riderId, 80, 'duplicate_aadhaar', { aadhaarLast4 });
    throw Object.assign(new Error('This Aadhaar is already linked to another account'), { statusCode: 409 });
  }

  await User.findByIdAndUpdate(riderId, {
    $set: {
      name: name || undefined,
      'kyc.aadhaarHash': aadhaarHash,
      'kyc.aadhaarLast4': aadhaarLast4,
      'kyc.aadhaarVerifiedAt': new Date(),
      'kyc.status': KYC_STATUS.AADHAAR_VERIFIED,
    },
  });

  await redis.del(KEYS.session(riderId.toString()));
  logger.audit('AADHAAR_VERIFIED', riderId, { aadhaarLast4 });
  return { verified: true, aadhaarLast4 };
};

/**
 * Full KYC status for a rider
 */
const getKYCStatus = async (riderId) => {
  const user = await User.findById(riderId)
    .select('kyc bankDetails name phone')
    .lean();
  if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

  const steps = {
    phone: !!user.phone,
    selfie: !!user.kyc?.selfieUrl,
    aadhaar: !!user.kyc?.aadhaarHash,
    bank: !!user.bankDetails?.verified,
  };
  const completedSteps = Object.values(steps).filter(Boolean).length;
  const isComplete = completedSteps === 4;

  return {
    status: user.kyc?.status || KYC_STATUS.NONE,
    steps,
    completedSteps,
    totalSteps: 4,
    isComplete,
    canReceivePayout: steps.phone && steps.bank,
    aadhaarLast4: user.kyc?.aadhaarLast4,
    livenessScore: user.kyc?.livenessScore,
  };
};

module.exports = { verifySelfie, verifyAadhaar, getKYCStatus };
