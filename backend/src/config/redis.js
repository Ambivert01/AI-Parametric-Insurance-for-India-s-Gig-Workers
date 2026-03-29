const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient = null;
let subscriberClient = null;

const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASS,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 10) {
      logger.error('Redis max retries reached');
      return null; // stop retrying
    }
    return Math.min(times * 100, 3000); // retry delay in ms
  },
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) return true;
    return false;
  },
  enableOfflineQueue: true,
  lazyConnect: false,
};

const getRedisClient = () => {
  if (!redisClient) {
    redisClient = new Redis(REDIS_CONFIG);

    redisClient.on('connect', () => logger.info('✅ Redis connected'));
    redisClient.on('error', (err) => logger.error(`Redis error: ${err.message}`));
    redisClient.on('close', () => logger.warn('⚠️  Redis connection closed'));
    redisClient.on('reconnecting', (ms) => logger.info(`Redis reconnecting in ${ms}ms`));
  }
  return redisClient;
};

// Dedicated subscriber client (cannot be shared with regular client)
const getSubscriberClient = () => {
  if (!subscriberClient) {
    subscriberClient = new Redis(REDIS_CONFIG);
    subscriberClient.on('connect', () => logger.info('✅ Redis subscriber connected'));
    subscriberClient.on('error', (err) => logger.error(`Redis subscriber error: ${err.message}`));
  }
  return subscriberClient;
};

// ─── Key helpers ─────────────────────────────────────────────────────────────
const KEYS = {
  session:        (userId)    => `session:${userId}`,
  blacklist:      (token)     => `blacklist:${token}`,
  otpAttempts:    (phone)     => `otp:attempts:${phone}`,
  otpCode:        (phone)     => `otp:code:${phone}`,
  rateLimit:      (ip, route) => `rl:${ip}:${route}`,
  triggerCache:   (zone, type)=> `trigger:${zone}:${type}`,
  weatherCache:   (zone)      => `weather:${zone}`,
  aqiCache:       (zone)      => `aqi:${zone}`,
  policyCount:    (zone)      => `policy:count:${zone}`,
  claimLock:      (riderId, eventId) => `claim:lock:${riderId}:${eventId}`,
  fraudScore:     (riderId)   => `fraud:score:${riderId}`,
  dashboardStats: ()          => `dashboard:stats:global`,
  loyaltyPool:    ()          => `loyalty:pool:balance`,
};

// ─── Common Redis operations ───────────────────────────────────────────────
const redis = {
  get: async (key) => {
    const val = await getRedisClient().get(key);
    if (!val) return null;
    try { return JSON.parse(val); } catch { return val; }
  },
  set: async (key, value, ttlSeconds = null) => {
    const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (ttlSeconds) {
      return getRedisClient().set(key, serialized, 'EX', ttlSeconds);
    }
    return getRedisClient().set(key, serialized);
  },
  del: async (...keys) => getRedisClient().del(...keys),
  exists: async (key) => getRedisClient().exists(key),
  incr: async (key) => getRedisClient().incr(key),
  expire: async (key, ttl) => getRedisClient().expire(key, ttl),
  ttl: async (key) => getRedisClient().ttl(key),
  hget: async (hash, field) => getRedisClient().hget(hash, field),
  hset: async (hash, field, value) => getRedisClient().hset(hash, field, value),
  hgetall: async (hash) => getRedisClient().hgetall(hash),
  sadd: async (key, ...members) => getRedisClient().sadd(key, ...members),
  smembers: async (key) => getRedisClient().smembers(key),
  sismember: async (key, member) => getRedisClient().sismember(key, member),
  publish: async (channel, message) => getRedisClient().publish(channel, JSON.stringify(message)),
  flushPattern: async (pattern) => {
    const client = getRedisClient();
    const keys = await client.keys(pattern);
    if (keys.length > 0) await client.del(...keys);
    return keys.length;
  },
};

const disconnectRedis = async () => {
  if (redisClient) await redisClient.quit();
  if (subscriberClient) await subscriberClient.quit();
  logger.info('Redis connections closed gracefully');
};

module.exports = { getRedisClient, getSubscriberClient, redis, KEYS, disconnectRedis };
