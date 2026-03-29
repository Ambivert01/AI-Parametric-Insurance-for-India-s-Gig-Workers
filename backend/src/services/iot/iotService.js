/**
 * IoT Sensor Service — Innovation 6
 * Ingests hyper-local sensor data (flood sensors, AQI monitors)
 * deployed at delivery hotspots. Mock MQTT implementation for Phase 2.
 */
const TriggerEvent = require('../../models/TriggerEvent');
const { redis } = require('../../config/redis');
const { TRIGGER_TYPES, CITIES, QUEUES } = require('../../config/constants');
const logger = require('../../utils/logger');

// Sensor registry — in production: stored in DB
const SENSOR_REGISTRY = {
  'SENSOR-MUM-001': { city: 'mumbai', zone: 'Dharavi', lat: 19.0396, lon: 72.8553, type: 'flood_level' },
  'SENSOR-MUM-002': { city: 'mumbai', zone: 'Andheri W', lat: 19.1244, lon: 72.8446, type: 'rainfall' },
  'SENSOR-MUM-003': { city: 'mumbai', zone: 'Bandra', lat: 19.0544, lon: 72.8402, type: 'aqi' },
  'SENSOR-DEL-001': { city: 'delhi', zone: 'Connaught Place', lat: 28.6315, lon: 77.2167, type: 'aqi' },
  'SENSOR-DEL-002': { city: 'delhi', zone: 'Dwarka', lat: 28.5921, lon: 77.0460, type: 'aqi' },
  'SENSOR-BLR-001': { city: 'bengaluru', zone: 'Koramangala', lat: 12.9352, lon: 77.6245, type: 'rainfall' },
};

/**
 * Ingest a reading from an IoT sensor
 * In production: received via MQTT broker (AWS IoT Core / HiveMQ)
 */
const ingestSensorReading = async (sensorId, reading) => {
  const sensor = SENSOR_REGISTRY[sensorId];
  if (!sensor) {
    logger.warn(`Unknown sensor: ${sensorId}`);
    return { accepted: false, reason: 'unknown_sensor' };
  }

  const { value, unit, timestamp = new Date().toISOString() } = reading;

  // Cache the reading (15 min TTL like API data)
  const cacheKey = `iot:${sensorId}:${sensor.type}`;
  await redis.set(cacheKey, { sensorId, value, unit, city: sensor.city, zone: sensor.zone, lat: sensor.lat, lon: sensor.lon, timestamp }, 15 * 60);

  logger.info(`IoT reading: sensor=${sensorId} type=${sensor.type} value=${value}${unit} zone=${sensor.zone}`);

  // Evaluate trigger conditions
  const triggered = await evaluateIoTTrigger(sensor, value, unit, timestamp);
  return { accepted: true, triggered, sensor };
};

const evaluateIoTTrigger = async (sensor, value, unit, timestamp) => {
  let shouldTrigger = false;
  let triggerType = null;
  let triggerValue = value;

  if (sensor.type === 'flood_level' && value >= 30) {
    // 30cm standing water = work-halting flood
    shouldTrigger = true;
    triggerType = 'HEAVY_RAIN';
    triggerValue = value;
  } else if (sensor.type === 'rainfall' && value >= 50) {
    shouldTrigger = true;
    triggerType = 'HEAVY_RAIN';
    triggerValue = value;
  } else if (sensor.type === 'aqi' && value >= 400) {
    shouldTrigger = true;
    triggerType = 'AQI_SPIKE';
    triggerValue = value;
  }

  if (!shouldTrigger) return { fired: false };

  // Check: is there already a recent confirmed trigger for this city/type?
  const recent = await TriggerEvent.findOne({
    cityId: sensor.city,
    triggerType,
    detectedAt: { $gte: new Date(Date.now() - 6 * 3600000) },
    status: { $in: ['confirmed', 'detected'] },
  });

  if (recent) {
    // Existing trigger — just log the IoT reading as secondary source
    await TriggerEvent.findByIdAndUpdate(recent._id, {
      $set: { 'secondarySource': {
        source: `iot_${sensor.type}`,
        value: triggerValue,
        unit,
        fetchedAt: new Date().toISOString(),
      }},
    });
    return { fired: false, reason: 'trigger_already_active', existingEventId: recent.eventId };
  }

  // NEW trigger from IoT — create event
  const triggerEvent = new TriggerEvent({
    cityId: sensor.city,
    triggerType,
    triggerValue,
    triggerUnit: unit,
    threshold: triggerType === 'HEAVY_RAIN' ? 50 : 400,
    severity: 'full',
    payoutPercent: 100,
    primarySource: {
      source: `iot_sensor_${sensor.type}`,
      value: triggerValue,
      unit,
      fetchedAt: timestamp,
    },
    zone: sensor.zone,
    centerLat: sensor.lat,
    centerLon: sensor.lon,
    radiusKm: 5, // IoT sensors cover 5km radius (more precise than API)
    isVerified: false, // still needs API cross-check
    status: 'detected',
  });

  await triggerEvent.save();

  const { getQueue } = require('../../workers/queueManager');
  await getQueue(QUEUES.CLAIM_PROCESS).add('process-trigger', {
    triggerId: triggerEvent._id.toString(),
    cityId: sensor.city,
    source: 'iot',
  });

  logger.trigger(`IOT_${triggerType}`, sensor.city, triggerValue);
  return { fired: true, eventId: triggerEvent.eventId, zone: sensor.zone };
};

/**
 * Get all active sensor readings for a city
 */
const getCitySensorReadings = async (cityId) => {
  const cityKey = cityId.toLowerCase();
  const readings = [];
  for (const [sensorId, sensor] of Object.entries(SENSOR_REGISTRY)) {
    if (sensor.city === cityKey) {
      const cacheKey = `iot:${sensorId}:${sensor.type}`;
      const reading = await redis.get(cacheKey);
      readings.push({
        sensorId,
        ...sensor,
        lastReading: reading || null,
        status: reading ? 'online' : 'offline',
      });
    }
  }
  return readings;
};

/**
 * Get all registered sensors (admin view)
 */
const getAllSensors = () => {
  return Object.entries(SENSOR_REGISTRY).map(([id, s]) => ({ sensorId: id, ...s }));
};

/**
 * Simulate IoT reading (for demo injection)
 */
const simulateSensorEvent = async (cityId, type, value) => {
  const sensor = Object.entries(SENSOR_REGISTRY).find(
    ([, s]) => s.city === cityId.toLowerCase() && s.type === type
  );
  if (!sensor) throw new Error(`No ${type} sensor found for ${cityId}`);
  return ingestSensorReading(sensor[0], { value, unit: type === 'aqi' ? 'AQI' : 'mm', timestamp: new Date().toISOString() });
};

module.exports = { ingestSensorReading, getCitySensorReadings, getAllSensors, simulateSensorEvent };
