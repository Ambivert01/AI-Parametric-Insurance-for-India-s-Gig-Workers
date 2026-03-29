const mongoose = require('mongoose');
const logger = require('../utils/logger');

const MONGO_OPTIONS = {
  maxPoolSize: 20,           // max 20 concurrent connections
  minPoolSize: 5,            // keep 5 alive always
  socketTimeoutMS: 45000,    // close sockets after 45s inactivity
  connectTimeoutMS: 10000,   // give up connecting after 10s
  serverSelectionTimeoutMS: 5000,
  heartbeatFrequencyMS: 10000,
  retryWrites: true,
  w: 'majority',             // wait for majority write acknowledgement
};

let retryCount = 0;
const MAX_RETRIES = 5;

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, MONGO_OPTIONS);
    retryCount = 0;
    logger.info(`MongoDB connected: ${conn.connection.host} [Pool: ${MONGO_OPTIONS.maxPoolSize}]`);
    return conn;
  } catch (err) {
    retryCount++;
    logger.error(`MongoDB connection failed (attempt ${retryCount}/${MAX_RETRIES}): ${err.message}`);
    if (retryCount < MAX_RETRIES) {
      const delay = Math.min(1000 * 2 ** retryCount, 30000); // exponential backoff, max 30s
      logger.info(`Retrying in ${delay / 1000}s...`);
      await new Promise(r => setTimeout(r, delay));
      return connectDB();
    }
    logger.error('Max MongoDB retry attempts reached. Exiting.');
    process.exit(1);
  }
};

// Connection event listeners
mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected. Attempting reconnect...');
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
  logger.error(`MongoDB error: ${err.message}`);
});

// Graceful shutdown
const disconnectDB = async () => {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed gracefully');
};

module.exports = { connectDB, disconnectDB };
