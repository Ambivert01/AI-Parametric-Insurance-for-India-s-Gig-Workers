require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');

const { connectDB } = require('./config/database');
const { getRedisClient } = require('./config/redis');
const logger = require('./utils/logger');
const { errorHandler, notFound, auditLogger, limiters } = require('./middleware/index');
const { authenticate } = require('./middleware/auth');
const { startAllWorkers } = require('./workers/queueManager');
const { startCronJobs } = require('./jobs/cronJobs');

const app = express();
const server = http.createServer(app);

// ─── Socket.IO ────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Socket authentication + room management
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) return next(new Error('Authentication required'));

    const { verifyAccessToken } = require('./utils/crypto');
    const { valid, payload } = verifyAccessToken(token);
    if (!valid) return next(new Error('Invalid token'));

    socket.userId = payload.userId;
    socket.userRole = payload.role;
    next();
  } catch (err) {
    next(new Error('Socket authentication failed'));
  }
});

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.userId} [${socket.userRole}]`);

  // Join personal room
  socket.join(`rider:${socket.userId}`);

  // Admins join admin room for real-time dashboard
  if (['admin', 'insurer', 'super_admin'].includes(socket.userRole)) {
    socket.join('admins');
  }

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.userId}`);
  });
});

// Make io available across the app
app.set('io', io);

// ─── Trust proxy (for correct IP behind Nginx) ────────────
app.set('trust proxy', 1);

// ─── Core Middleware ──────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: (origin, callback) => {
    const allowed = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    if (!origin || allowed.includes(origin)) callback(null, true);
    else callback(new Error('CORS: origin not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-fingerprint', 'x-idempotency-key'],
}));

app.use(compression());

// Parse JSON — but NOT for webhook routes (they need raw body)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/v1/webhooks')) return next();
  express.json({ limit: '10mb' })(req, res, next);
});
app.use((req, res, next) => {
  if (req.path.startsWith('/api/v1/webhooks')) return next();
  express.urlencoded({ extended: true, limit: '10mb' })(req, res, next);
});

// HTTP request logging
app.use(morgan(
  process.env.NODE_ENV === 'production'
    ? ':remote-addr :method :url :status :response-time ms'
    : 'dev',
  { stream: { write: (msg) => logger.http(msg.trim()) } }
));

// Audit logging for mutations
app.use(auditLogger);

// General rate limit
app.use('/api/', limiters.general);

// ─── Health Check (no auth) ───────────────────────────────
app.get('/health', async (req, res) => {
  const mongoState = require('mongoose').connection.readyState;
  let redisOk = false;
  try {
    await getRedisClient().ping();
    redisOk = true;
  } catch {}

  const status = mongoState === 1 && redisOk ? 'healthy' : 'degraded';
  res.status(status === 'healthy' ? 200 : 503).json({
    status,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    services: {
      mongodb: mongoState === 1 ? 'connected' : 'disconnected',
      redis: redisOk ? 'connected' : 'disconnected',
    },
  });
});

// ─── API Routes ───────────────────────────────────────────
app.use('/api/v1', require('./routes/index'));

// ─── 404 & Error handlers ─────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Startup ──────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    // 1. Database
    await connectDB();

    // 2. Redis (verify connection)
    await getRedisClient().ping();
    logger.info('✅ Redis ready');

    // 3. Start server
    server.listen(PORT, () => {
      logger.info(`🚀 GigShield API running on port ${PORT} [${process.env.NODE_ENV}]`);
    });

    // 4. Start background workers
    startAllWorkers(io);

    // 5. Start cron jobs
    startCronJobs(io);

    logger.info('✅ GigShield backend fully operational');
  } catch (err) {
    logger.error(`💀 Startup failed: ${err.message}`);
    process.exit(1);
  }
};

// ─── Graceful shutdown ────────────────────────────────────
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    const { disconnectDB } = require('./config/database');
    const { disconnectRedis } = require('./config/redis');
    const { closeAllQueues } = require('./workers/queueManager');
    await Promise.allSettled([disconnectDB(), disconnectRedis(), closeAllQueues()]);
    logger.info('All connections closed. Goodbye 👋');
    process.exit(0);
  });
  setTimeout(() => { logger.error('Force exit after 30s'); process.exit(1); }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error(`Unhandled Rejection: ${reason}`));
process.on('uncaughtException', (err) => { logger.error(`Uncaught Exception: ${err.message}`); process.exit(1); });

if (require.main === module) start();

module.exports = { app, server, io };
