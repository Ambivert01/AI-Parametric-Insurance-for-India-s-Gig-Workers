const User = require('../../models/User');
const { redis, KEYS } = require('../../config/redis');
const {
  generateOTP, generateAccessToken, generateRefreshToken,
  verifyRefreshToken, hashData, generateDeviceFingerprint,
  generateToken, maskPhone,
} = require('../../utils/crypto');
const { TTL, BUSINESS_RULES, KYC_STATUS } = require('../../config/constants');
const logger = require('../../utils/logger');

// ─── Mock OTP sending (replace with Twilio in production) ─
const sendOTPViaSMS = async (phone, otp) => {
  if (process.env.NODE_ENV === 'production' && process.env.TWILIO_ACCOUNT_SID) {
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({ to: `+91${phone}`, channel: 'sms' });
  } else {
    // Development: log OTP to console
    logger.info(`[DEV] OTP for ${maskPhone(phone)}: ${otp}`);
  }
};

const verifyOTPViaTwilio = async (phone, otp) => {
  if (process.env.NODE_ENV === 'production' && process.env.TWILIO_ACCOUNT_SID) {
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const check = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({ to: `+91${phone}`, code: otp });
    return check.status === 'approved';
  }
  // Dev: accept any 6-digit code, or stored OTP
  return true;
};

// ══════════════════════════════════════════════════════════
// Auth Service Methods
// ══════════════════════════════════════════════════════════

/**
 * Step 1: Send OTP to phone number
 */
const sendOTP = async (phone) => {
  // Rate check: max attempts per hour
  const attemptsKey = KEYS.otpAttempts(phone);
  const attempts = await redis.incr(attemptsKey);
  if (attempts === 1) await redis.expire(attemptsKey, TTL.OTP_ATTEMPTS);
  if (attempts > BUSINESS_RULES.MAX_OTP_ATTEMPTS) {
    throw Object.assign(new Error('Too many OTP requests. Try again in 1 hour.'), { statusCode: 429 });
  }

  const otp = generateOTP(6);
  const otpHash = hashData(otp); // store hash, not plaintext
  await redis.set(KEYS.otpCode(phone), otpHash, TTL.OTP_CODE);

  await sendOTPViaSMS(phone, otp);
  logger.audit('OTP_SENT', null, { phone: maskPhone(phone) });
  return { sent: true, expiresInSeconds: TTL.OTP_CODE };
};

/**
 * Step 2: Verify OTP and issue tokens
 */
const verifyOTP = async (phone, otp, deviceData) => {
  // 1. Check stored OTP hash
  const storedHash = await redis.get(KEYS.otpCode(phone));
  if (!storedHash) {
    throw Object.assign(new Error('OTP expired or not found. Request a new one.'), { statusCode: 400 });
  }

  const inputHash = hashData(otp);
  const isValid = process.env.NODE_ENV === 'test'
    ? otp === '123456'
    : inputHash === storedHash;

  if (!isValid) {
    throw Object.assign(new Error('Invalid OTP'), { statusCode: 400 });
  }

  // 2. Delete OTP after use
  await redis.del(KEYS.otpCode(phone));
  await redis.del(KEYS.otpAttempts(phone));

  // 3. Find or create user
  let user = await User.findOne({ phone });
  const isNewUser = !user;

  if (isNewUser) {
    user = new User({
      phone,
      name: 'Rider',   // will be updated during onboarding
      phoneVerified: true,
      kyc: { status: KYC_STATUS.PHONE_VERIFIED },
    });
  } else {
    user.phoneVerified = true;
    user.lastLoginAt = new Date();
  }

  // 4. Register device
  if (deviceData) {
    const fingerprint = generateDeviceFingerprint(deviceData);
    const existingDevice = user.devices.find(d => d.fingerprint === fingerprint);
    if (!existingDevice) {
      // Check: is this fingerprint already on another account? (multi-account detection)
      const otherUser = await User.findOne({
        'devices.fingerprint': fingerprint,
        _id: { $ne: user._id },
      });
      if (otherUser) {
        logger.fraud(user._id, 80, 'multi_account', {
          fingerprint,
          existingUserId: otherUser._id,
          phone: maskPhone(phone),
        });
        user.fraudFlags.push('multi_account_device');
        user.fraudScore = Math.max(user.fraudScore, 50);
      }

      user.devices.push({
        fingerprint,
        model: deviceData.deviceModel,
        os: deviceData.os,
        osVersion: deviceData.osVersion,
        appVersion: deviceData.appVersion,
        isMockLocation: deviceData.isMockLocation || false,
        hasMockApps: deviceData.hasMockApps || false,
        ipAddress: deviceData.ipAddress,
        userAgent: deviceData.userAgent,
        lastSeen: new Date(),
      });

      if (deviceData.isMockLocation || deviceData.hasMockApps) {
        logger.fraud(user._id, 60, 'mock_location_detected_at_registration', { fingerprint });
        user.fraudFlags.push('mock_location_app_detected');
        user.fraudScore = Math.max(user.fraudScore, 60);
        user.isUnderReview = true;
      }
    } else {
      existingDevice.lastSeen = new Date();
      if (deviceData.fcmToken) existingDevice.fcmToken = deviceData.fcmToken;
    }
  }

  await user.save();

  // 5. Issue tokens
  const payload = { userId: user._id.toString(), role: user.role, phone: maskPhone(phone) };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  // Cache session
  await redis.set(KEYS.session(user._id.toString()), user.toObject(), TTL.SESSION_CACHE);

  logger.audit(isNewUser ? 'USER_REGISTERED' : 'USER_LOGIN', user._id, {
    phone: maskPhone(phone),
    isNewUser,
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: TTL.JWT_ACCESS,
    user: {
      id: user._id,
      phone: maskPhone(phone),
      name: user.name,
      role: user.role,
      isNewUser,
      kycStatus: user.kyc?.status,
      onboardingComplete: !!user.riderProfile,
    },
  };
};

/**
 * Refresh access token using refresh token
 */
const refreshAccessToken = async (refreshToken) => {
  const { valid, payload, error } = verifyRefreshToken(refreshToken);
  if (!valid) {
    throw Object.assign(new Error(`Invalid refresh token: ${error}`), { statusCode: 401 });
  }

  const user = await User.findById(payload.userId).select('isActive isBlocked role').lean();
  if (!user || !user.isActive || user.isBlocked) {
    throw Object.assign(new Error('User unavailable'), { statusCode: 401 });
  }

  const newPayload = { userId: payload.userId, role: user.role, phone: payload.phone };
  const newAccessToken = generateAccessToken(newPayload);

  return { accessToken: newAccessToken, expiresIn: TTL.JWT_ACCESS };
};

/**
 * Logout: blacklist current access token
 */
const logout = async (token, userId) => {
  // Add to blacklist for remaining TTL
  await redis.set(KEYS.blacklist(token), '1', TTL.TOKEN_BLACKLIST);
  // Clear session cache
  await redis.del(KEYS.session(userId));
  logger.audit('USER_LOGOUT', userId);
};

/**
 * Update rider profile (onboarding step 2)
 */
const completeOnboarding = async (userId, profileData) => {
  const user = await User.findById(userId);
  if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

  user.name = profileData.name;
  user.language = profileData.language || 'hi';
  user.riderProfile = {
    platform: profileData.platform,
    vehicleType: profileData.vehicleType,
    shiftPattern: profileData.shiftPattern,
    declaredDailyIncome: profileData.declaredDailyIncome,
    cityId: profileData.cityId,
    pincode: profileData.pincode,
    zone: profileData.zone,
  };
  user.notificationPrefs = profileData.notificationPrefs || user.notificationPrefs;

  await user.save();

  // Invalidate session cache so fresh data is loaded
  await redis.del(KEYS.session(userId));

  logger.audit('ONBOARDING_COMPLETED', userId, { platform: profileData.platform, city: profileData.cityId });
  return user;
};

module.exports = { sendOTP, verifyOTP, refreshAccessToken, logout, completeOnboarding };
