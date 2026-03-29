const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { TTL } = require('../config/constants');

const ALGORITHM = 'aes-256-gcm';
const ENCODING = 'hex';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'), 'hex');

// ─── AES-256-GCM Encryption ───────────────────────────────
const encrypt = (text) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(String(text), 'utf8', ENCODING);
  encrypted += cipher.final(ENCODING);
  const authTag = cipher.getAuthTag().toString(ENCODING);
  return `${iv.toString(ENCODING)}:${authTag}:${encrypted}`;
};

const decrypt = (encryptedText) => {
  try {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, ENCODING);
    const authTag = Buffer.from(authTagHex, ENCODING);
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, ENCODING, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null; // tampered or invalid
  }
};

// ─── Hashing ──────────────────────────────────────────────
const hashPassword = async (password) => {
  const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  return bcrypt.hash(password, rounds);
};

const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

const hashData = (data) => {
  return crypto.createHash('sha256').update(String(data)).digest('hex');
};

const hashSensitive = (data) => {
  // one-way hash for storing sensitive identifiers (Aadhaar last 4, etc.)
  const salt = process.env.ENCRYPTION_KEY?.slice(0, 16) || 'gigshield_salt__';
  return crypto.createHmac('sha256', salt).update(String(data)).digest('hex');
};

// ─── Device Fingerprint ───────────────────────────────────
/**
 * Generate a stable device fingerprint from client signals
 * Used for multi-account detection
 */
const generateDeviceFingerprint = (deviceData) => {
  const { deviceModel, osVersion, screenRes, timezone, userAgent } = deviceData;
  const raw = [deviceModel, osVersion, screenRes, timezone, userAgent]
    .filter(Boolean)
    .join('|')
    .toLowerCase();
  return crypto.createHash('sha256').update(raw).digest('hex');
};

// ─── JWT ──────────────────────────────────────────────────
const generateAccessToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '15m',
    issuer: 'gigshield',
    audience: 'gigshield-api',
  });
};

const generateRefreshToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d',
    issuer: 'gigshield',
    audience: 'gigshield-api',
  });
};

const verifyAccessToken = (token) => {
  try {
    return {
      valid: true,
      payload: jwt.verify(token, process.env.JWT_SECRET, {
        issuer: 'gigshield',
        audience: 'gigshield-api',
      }),
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
};

const verifyRefreshToken = (token) => {
  try {
    return {
      valid: true,
      payload: jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
        issuer: 'gigshield',
        audience: 'gigshield-api',
      }),
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
};

const decodeTokenUnsafe = (token) => {
  // decode without verifying — only for extracting user info after expiry
  return jwt.decode(token);
};

// ─── Secure random tokens ─────────────────────────────────
const generateOTP = (length = 6) => {
  // Cryptographically secure OTP
  const buffer = crypto.randomBytes(4);
  const num = buffer.readUInt32BE(0);
  return String(num % Math.pow(10, length)).padStart(length, '0');
};

const generateToken = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

const generateIdempotencyKey = (prefix = '') => {
  return `${prefix}${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
};

// ─── Signature verification (for webhooks) ────────────────
const verifyWebhookSignature = (payload, signature, secret) => {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
};

// ─── Mask sensitive data for logs ─────────────────────────
const maskPhone = (phone) => {
  if (!phone) return '';
  const s = String(phone);
  return s.length > 4 ? `${'*'.repeat(s.length - 4)}${s.slice(-4)}` : '****';
};

const maskAccount = (acc) => {
  if (!acc) return '';
  const s = String(acc);
  return s.length > 4 ? `${'*'.repeat(s.length - 4)}${s.slice(-4)}` : '****';
};

module.exports = {
  encrypt, decrypt,
  hashPassword, comparePassword, hashData, hashSensitive,
  generateDeviceFingerprint,
  generateAccessToken, generateRefreshToken,
  verifyAccessToken, verifyRefreshToken, decodeTokenUnsafe,
  generateOTP, generateToken, generateIdempotencyKey,
  verifyWebhookSignature,
  maskPhone, maskAccount,
};
