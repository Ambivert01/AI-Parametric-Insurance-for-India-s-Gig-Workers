const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

// ─── Custom log format ─────────────────────────────────────
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `[${timestamp}] [${level.toUpperCase().padEnd(5)}] ${message}`;
    if (Object.keys(meta).length > 0) log += ` | ${JSON.stringify(meta)}`;
    if (stack) log += `\n${stack}`;
    return log;
  })
);

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// ─── Transports ────────────────────────────────────────────
const transports = [
  // Console — colored in dev, plain in prod
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize({ all: true }),
      logFormat
    ),
    silent: process.env.NODE_ENV === 'test',
  }),

  // Rotating file — all logs
  new winston.transports.File({
    filename: path.join(logDir, 'gigshield.log'),
    format: jsonFormat,
    maxsize: 10 * 1024 * 1024,  // 10MB
    maxFiles: 14,               // keep 14 files (2 weeks)
    tailable: true,
  }),

  // Separate error log
  new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    format: jsonFormat,
    maxsize: 10 * 1024 * 1024,
    maxFiles: 30,
    tailable: true,
  }),

  // Audit log for security events
  new winston.transports.File({
    filename: path.join(logDir, 'audit.log'),
    format: jsonFormat,
    maxsize: 50 * 1024 * 1024,
    maxFiles: 90,
    tailable: true,
  }),
];

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports,
  exitOnError: false,
});

// ─── Child logger for scoped logging ──────────────────────
logger.child = (meta) => logger.child(meta);

// ─── Structured loggers for specific domains ──────────────
logger.audit = (action, userId, details = {}) => {
  logger.info(`AUDIT: ${action}`, { userId, action, ...details, audit: true });
};

logger.fraud = (riderId, score, reason, details = {}) => {
  logger.warn(`FRAUD: score=${score} rider=${riderId}`, { riderId, score, reason, ...details, fraud: true });
};

logger.trigger = (type, zone, value) => {
  logger.info(`TRIGGER: ${type} in ${zone} [value=${value}]`, { type, zone, value, trigger: true });
};

logger.claim = (claimId, status, riderId, details = {}) => {
  logger.info(`CLAIM: ${claimId} → ${status}`, { claimId, status, riderId, ...details, claim: true });
};

logger.payment = (paymentId, amount, status, details = {}) => {
  logger.info(`PAYMENT: ${paymentId} ₹${amount} → ${status}`, { paymentId, amount, status, ...details, payment: true });
};

module.exports = logger;
