// ══════════════════════════════════════════════════════════
// middleware/errorHandler.js — Global error handling
// ══════════════════════════════════════════════════════════
const logger = require('../utils/logger');
const { sendError } = require('../utils/response');
const { HTTP } = require('../config/constants');

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || HTTP.INTERNAL_ERROR;
  let message = err.message || 'Internal server error';

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = HTTP.BAD_REQUEST;
    const errors = Object.values(err.errors).map(e => ({
      field: e.path, message: e.message,
    }));
    return sendError(res, 'Validation failed', statusCode, errors);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    statusCode = HTTP.CONFLICT;
    const field = Object.keys(err.keyValue)[0];
    message = `${field} already exists`;
    return sendError(res, message, statusCode);
  }

  // Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = HTTP.BAD_REQUEST;
    message = `Invalid ${err.path}: ${err.value}`;
    return sendError(res, message, statusCode);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return sendError(res, 'Invalid token', HTTP.UNAUTHORIZED);
  }
  if (err.name === 'TokenExpiredError') {
    return sendError(res, 'Token expired', HTTP.UNAUTHORIZED);
  }

  // Log unexpected errors with full stack
  if (statusCode >= 500) {
    logger.error(`Unhandled Error: ${message}`, {
      stack: err.stack,
      path: req.path,
      method: req.method,
      userId: req.user?._id,
      body: req.method !== 'GET' ? req.body : undefined,
    });
  }

  return sendError(res, message, statusCode);
};

// ══════════════════════════════════════════════════════════
// middleware/rateLimiter.js — Redis-backed rate limiting
// ══════════════════════════════════════════════════════════
const rateLimit = require('express-rate-limit');
const { RATE_LIMITS } = require('../config/constants');

const createLimiter = (options) => rateLimit({
  ...options,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit hit: ${req.ip} → ${req.path}`);
    res.status(HTTP.TOO_MANY_REQUESTS).json({
      success: false,
      error: { message: 'Too many requests. Please slow down.', code: 429 },
      meta: { timestamp: new Date().toISOString() },
    });
  },
  skip: (req) => process.env.NODE_ENV === 'test', // skip in tests
});

const limiters = {
  general:     createLimiter(RATE_LIMITS.GENERAL),
  auth:        createLimiter(RATE_LIMITS.AUTH),
  otpSend:     createLimiter(RATE_LIMITS.OTP_SEND),
  claimSubmit: createLimiter(RATE_LIMITS.CLAIM_SUBMIT),
  payment:     createLimiter(RATE_LIMITS.PAYMENT),
  webhook:     createLimiter(RATE_LIMITS.WEBHOOK),
};

// ══════════════════════════════════════════════════════════
// middleware/validate.js — Joi request validation
// ══════════════════════════════════════════════════════════
const { sendBadRequest } = require('../utils/response');

/**
 * Validate req.body against a Joi schema
 * Usage: validate(schemas.auth.login)
 */
const validate = (schema, target = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[target], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const errors = error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
      }));
      return sendBadRequest(res, 'Validation failed', errors);
    }

    req[target] = value; // replace with sanitized value
    next();
  };
};

// ══════════════════════════════════════════════════════════
// middleware/audit.js — Request/response audit logging
// ══════════════════════════════════════════════════════════
const SENSITIVE_FIELDS = ['password', 'otp', 'token', 'upiId', 'bankAccount', 'aadhaar'];

const sanitizeBody = (body) => {
  if (!body || typeof body !== 'object') return body;
  return Object.fromEntries(
    Object.entries(body).map(([k, v]) =>
      SENSITIVE_FIELDS.some(f => k.toLowerCase().includes(f))
        ? [k, '[REDACTED]']
        : [k, v]
    )
  );
};

const auditLogger = (req, res, next) => {
  const start = Date.now();
  const originalEnd = res.end;

  res.end = function (...args) {
    const duration = Date.now() - start;
    // Only log mutation endpoints + errors
    if (req.method !== 'GET' || res.statusCode >= 400) {
      logger.info(`${req.method} ${req.path} → ${res.statusCode} [${duration}ms]`, {
        ip: req.ip,
        userId: req.user?._id,
        statusCode: res.statusCode,
        duration,
        body: sanitizeBody(req.body),
        query: req.query,
      });
    }
    originalEnd.apply(res, args);
  };

  next();
};

// ══════════════════════════════════════════════════════════
// middleware/notFound.js — 404 handler
// ══════════════════════════════════════════════════════════
const notFound = (req, res) => {
  sendError(res, `Route ${req.method} ${req.path} not found`, HTTP.NOT_FOUND);
};

module.exports = { errorHandler, limiters, validate, auditLogger, notFound };
