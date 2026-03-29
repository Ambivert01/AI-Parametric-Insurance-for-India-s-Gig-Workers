const { verifyAccessToken } = require('../utils/crypto');
const { redis, KEYS } = require('../config/redis');
const User = require('../models/User');
const { sendUnauthorized, sendForbidden } = require('../utils/response');
const logger = require('../utils/logger');
const { ROLES } = require('../config/constants');

/**
 * Authenticate: verify JWT, check blacklist, attach user to req
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return sendUnauthorized(res, 'No token provided');
    }

    const token = authHeader.split(' ')[1];

    // 1. Verify signature + expiry
    const { valid, payload, error } = verifyAccessToken(token);
    if (!valid) {
      return sendUnauthorized(res, error === 'jwt expired' ? 'Token expired' : 'Invalid token');
    }

    // 2. Check blacklist (logged-out tokens)
    const isBlacklisted = await redis.exists(KEYS.blacklist(token));
    if (isBlacklisted) {
      return sendUnauthorized(res, 'Token revoked');
    }

    // 3. Load user (use cache first)
    const cached = await redis.get(KEYS.session(payload.userId));
    let user;
    if (cached) {
      user = cached;
    } else {
      user = await User.findById(payload.userId)
        .select('-bankDetails.upiId -bankDetails.bankAccount -locationHistory')
        .lean();
      if (user) await redis.set(KEYS.session(payload.userId), user, 3600);
    }

    if (!user) return sendUnauthorized(res, 'User not found');
    if (!user.isActive) return sendUnauthorized(res, 'Account deactivated');
    if (user.isBlocked) return sendForbidden(res, `Account blocked: ${user.blockedReason || 'policy violation'}`);

    // 4. Attach to request
    req.user = user;
    req.token = token;

    // Update last active (fire-and-forget — don't await)
    User.findByIdAndUpdate(user._id, { lastActiveAt: new Date() }).exec().catch(() => {});

    next();
  } catch (err) {
    logger.error(`Auth middleware error: ${err.message}`);
    return sendUnauthorized(res, 'Authentication failed');
  }
};

/**
 * Authorize: check role(s)
 * Usage: authorize(ROLES.ADMIN, ROLES.INSURER)
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) return sendUnauthorized(res);
    if (!roles.includes(req.user.role)) {
      logger.audit('ACCESS_DENIED', req.user._id, {
        requiredRoles: roles,
        userRole: req.user.role,
        path: req.path,
      });
      return sendForbidden(res, `This action requires: ${roles.join(' or ')}`);
    }
    next();
  };
};

/**
 * Soft auth: attach user if token present, but don't fail if missing
 * Used for endpoints that behave differently for authenticated users
 */
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();
  try {
    await authenticate(req, res, next);
  } catch {
    next(); // silently skip auth errors
  }
};

/**
 * KYC guard: ensure rider has at least phone + bank verified
 */
const requirePayoutKYC = (req, res, next) => {
  const user = req.user;
  if (!user.bankDetails?.verified) {
    return sendForbidden(res, 'Please complete bank/UPI verification before receiving payouts');
  }
  next();
};

/**
 * Block banned devices: prevent banned device fingerprints
 */
const checkDeviceBan = async (req, res, next) => {
  const fingerprint = req.headers['x-device-fingerprint'];
  if (!fingerprint) return next();

  const banned = await redis.sismember('banned:devices', fingerprint);
  if (banned) {
    logger.fraud('unknown', 100, 'banned_device_attempted_access', { fingerprint, ip: req.ip });
    return sendForbidden(res, 'This device has been restricted');
  }
  next();
};

module.exports = { authenticate, authorize, optionalAuth, requirePayoutKYC, checkDeviceBan };
