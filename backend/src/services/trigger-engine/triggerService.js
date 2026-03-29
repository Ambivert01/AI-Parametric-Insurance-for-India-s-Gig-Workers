const axios = require('axios');
const TriggerEvent = require('../../models/TriggerEvent');
const { redis, KEYS } = require('../../config/redis');
const { TRIGGER_TYPES, CITIES, SOCKET_EVENTS, QUEUES } = require('../../config/constants');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

// ─── API Fetchers ─────────────────────────────────────────

const fetchWeatherData = async (cityId) => {
  const city = CITIES[cityId.toUpperCase()];
  if (!city) return null;

  // Check cache first
  const cached = await redis.get(KEYS.weatherCache(cityId));
  if (cached) return cached;

  try {
    const { data } = await axios.get(
      `${process.env.OPENWEATHER_BASE_URL}/weather`,
      {
        params: {
          lat: city.lat, lon: city.lon,
          appid: process.env.OPENWEATHER_API_KEY,
          units: 'metric',
        },
        timeout: 8000,
      }
    );

    const result = {
      rainfall1h: data.rain?.['1h'] || 0,
      rainfall3h: data.rain?.['3h'] || 0,
      temperature: data.main?.temp || 0,
      feelsLike: data.main?.feels_like || 0,
      humidity: data.main?.humidity || 0,
      windSpeed: data.wind?.speed || 0,
      weatherMain: data.weather?.[0]?.main || '',
      alert: data.alerts?.[0] || null,
      source: 'openweathermap',
      fetchedAt: new Date().toISOString(),
    };

    await redis.set(KEYS.weatherCache(cityId), result, 15 * 60);
    return result;
  } catch (err) {
    logger.error(`Weather API failed for ${cityId}: ${err.message}`);
    return null;
  }
};

const fetchAQIData = async (cityId) => {
  const city = CITIES[cityId.toUpperCase()];
  if (!city) return null;

  const cached = await redis.get(KEYS.aqiCache(cityId));
  if (cached) return cached;

  try {
    // Using aqicn.org (World Air Quality Index) — free API
    const { data } = await axios.get(
      `https://api.waqi.info/feed/geo:${city.lat};${city.lon}/`,
      {
        params: { token: process.env.AQICN_API_KEY },
        timeout: 8000,
      }
    );

    if (data.status !== 'ok') return null;

    const result = {
      aqi: data.data?.aqi || 0,
      pm25: data.data?.iaqi?.pm25?.v || 0,
      pm10: data.data?.iaqi?.pm10?.v || 0,
      station: data.data?.city?.name,
      source: 'aqicn',
      fetchedAt: new Date().toISOString(),
    };

    await redis.set(KEYS.aqiCache(cityId), result, 15 * 60);
    return result;
  } catch (err) {
    logger.error(`AQI API failed for ${cityId}: ${err.message}`);
    return null;
  }
};

const fetchIMDAlert = async (cityId) => {
  // In production: scrape IMD or use their API
  // For hackathon: return mock data based on date/season
  const month = new Date().getMonth() + 1;
  const city = CITIES[cityId.toUpperCase()];
  if (!city) return null;

  return {
    hasAlert: false,
    alertLevel: null, // 'yellow', 'orange', 'red'
    alertType: null,
    description: null,
    source: 'imd_mock',
    fetchedAt: new Date().toISOString(),
  };
};

// ─── Trigger Evaluation ───────────────────────────────────

const evaluateWeatherTrigger = async (cityId, weatherData) => {
  const events = [];
  const RAIN = TRIGGER_TYPES.HEAVY_RAIN;

  // Extrapolate 6hr from 3hr reading
  const rainfall6h = (weatherData.rainfall3h || 0) * 2;
  const rainfallRate = weatherData.rainfall1h || 0;

  // Full trigger: 50mm/6hr
  if (rainfall6h >= RAIN.threshold_mm_per_6hr) {
    events.push({
      triggerType: 'HEAVY_RAIN',
      triggerValue: rainfall6h,
      triggerUnit: 'mm/6hr',
      threshold: RAIN.threshold_mm_per_6hr,
      severity: 'full',
      payoutPercent: RAIN.payout_percent,
    });
  }
  // Partial trigger: 30-50mm range
  else if (rainfall6h >= 30) {
    events.push({
      triggerType: 'HEAVY_RAIN',
      triggerValue: rainfall6h,
      triggerUnit: 'mm/6hr',
      threshold: 30,
      severity: 'partial',
      payoutPercent: RAIN.secondary_percent,
    });
  }

  // Instant rate trigger (heavy rate even if cumulative not there yet)
  if (rainfallRate >= RAIN.threshold_mm_rate && events.length === 0) {
    events.push({
      triggerType: 'HEAVY_RAIN',
      triggerValue: rainfallRate,
      triggerUnit: 'mm/hr',
      threshold: RAIN.threshold_mm_rate,
      severity: 'partial',
      payoutPercent: 70,
    });
  }

  // Extreme heat
  const HEAT = TRIGGER_TYPES.EXTREME_HEAT;
  if (weatherData.feelsLike >= HEAT.threshold_feels_like_c) {
    events.push({
      triggerType: 'EXTREME_HEAT',
      triggerValue: weatherData.feelsLike,
      triggerUnit: '°C (feels like)',
      threshold: HEAT.threshold_feels_like_c,
      severity: 'full',
      payoutPercent: HEAT.payout_percent,
    });
  }

  return events;
};

const evaluateAQITrigger = async (cityId, aqiData) => {
  const events = [];
  const AQI = TRIGGER_TYPES.AQI_SPIKE;

  if (aqiData.aqi >= AQI.threshold_aqi_full) {
    events.push({
      triggerType: 'AQI_SPIKE',
      triggerValue: aqiData.aqi,
      triggerUnit: 'AQI',
      threshold: AQI.threshold_aqi_full,
      severity: 'full',
      payoutPercent: AQI.payout_percent,
    });
  } else if (aqiData.aqi >= AQI.threshold_aqi_partial) {
    events.push({
      triggerType: 'AQI_SPIKE',
      triggerValue: aqiData.aqi,
      triggerUnit: 'AQI',
      threshold: AQI.threshold_aqi_partial,
      severity: 'partial',
      payoutPercent: AQI.secondary_percent,
    });
  }

  return events;
};

// ─── Main: Run one full polling cycle ─────────────────────

const runPollingCycle = async (io = null) => {
  const cycleId = `cycle-${Date.now()}-${uuidv4().slice(0, 8)}`;
  logger.info(`▶ Trigger engine cycle started: ${cycleId}`);

  const results = { detected: 0, confirmed: 0, errors: 0 };
  const cityIds = Object.keys(CITIES);

  for (const cityId of cityIds) {
    try {
      // 1. Fetch all data in parallel
      const [weather, aqi, imdAlert] = await Promise.allSettled([
        fetchWeatherData(cityId),
        fetchAQIData(cityId),
        fetchIMDAlert(cityId),
      ]);

      const weatherData = weather.status === 'fulfilled' ? weather.value : null;
      const aqiData = aqi.status === 'fulfilled' ? aqi.value : null;

      // 2. Evaluate all trigger conditions
      const detectedEvents = [];
      if (weatherData) {
        const weatherEvents = await evaluateWeatherTrigger(cityId, weatherData);
        detectedEvents.push(...weatherEvents.map(e => ({ ...e, primarySource: { source: weatherData.source, value: e.triggerValue, unit: e.triggerUnit, fetchedAt: weatherData.fetchedAt } })));
      }
      if (aqiData) {
        const aqiEvents = await evaluateAQITrigger(cityId, aqiData);
        detectedEvents.push(...aqiEvents.map(e => ({ ...e, primarySource: { source: aqiData.source, value: e.triggerValue, unit: e.triggerUnit, fetchedAt: aqiData.fetchedAt } })));
      }

      // 3. Persist and queue each event
      for (const eventData of detectedEvents) {
        // Check if same event already detected in last 6hr (dedup)
        const recentEvent = await TriggerEvent.findOne({
          cityId,
          triggerType: eventData.triggerType,
          detectedAt: { $gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
          status: { $in: ['detected', 'verifying', 'confirmed'] },
        });

        if (recentEvent) continue; // already tracking this event

        const triggerEvent = new TriggerEvent({
          cityId,
          triggerType: eventData.triggerType,
          triggerValue: eventData.triggerValue,
          triggerUnit: eventData.triggerUnit,
          threshold: eventData.threshold,
          severity: eventData.severity,
          payoutPercent: eventData.payoutPercent,
          primarySource: eventData.primarySource,
          status: 'detected',
          pollingCycleId: cycleId,
        });

        await triggerEvent.save();
        results.detected++;
        logger.trigger(eventData.triggerType, cityId, eventData.triggerValue);

        // Emit to admin dashboard in real-time
        if (io) {
          io.to('admins').emit(SOCKET_EVENTS.TRIGGER_FIRED, {
            eventId: triggerEvent.eventId,
            type: eventData.triggerType,
            city: cityId,
            value: eventData.triggerValue,
          });
        }

        // Queue for claim matching
        const { getQueue } = require('../../workers/queueManager');
        await getQueue(QUEUES.CLAIM_PROCESS).add('process-trigger', {
          triggerId: triggerEvent._id.toString(),
          cityId,
        }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
      }
    } catch (err) {
      logger.error(`Trigger engine error for ${cityId}: ${err.message}`);
      results.errors++;
    }
  }

  logger.info(`◼ Trigger cycle complete: detected=${results.detected}, errors=${results.errors}`);
  return results;
};

// ─── Manual trigger injection (for demo/testing) ──────────
const injectManualTrigger = async (cityId, triggerType, triggerValue, io = null) => {
  const triggerConfig = TRIGGER_TYPES[triggerType];
  if (!triggerConfig) throw new Error(`Unknown trigger type: ${triggerType}`);

  const triggerEvent = new TriggerEvent({
    cityId,
    triggerType,
    triggerValue,
    triggerUnit: triggerConfig.threshold_mm_per_6hr ? 'mm/6hr' : 'AQI',
    threshold: triggerConfig.threshold_mm_per_6hr || triggerConfig.threshold_aqi_full,
    severity: 'full',
    payoutPercent: 100,
    primarySource: {
      source: 'manual_injection',
      value: triggerValue,
      fetchedAt: new Date().toISOString(),
    },
    isVerified: true,
    verifiedAt: new Date(),
    status: 'confirmed',
  });

  await triggerEvent.save();
  logger.trigger(`MANUAL_${triggerType}`, cityId, triggerValue);

  if (io) {
    io.to('admins').emit(SOCKET_EVENTS.TRIGGER_FIRED, {
      eventId: triggerEvent.eventId,
      type: triggerType,
      city: cityId,
      value: triggerValue,
      manual: true,
    });
  }

  const { getQueue } = require('../../workers/queueManager');
  await getQueue(QUEUES.CLAIM_PROCESS).add('process-trigger', {
    triggerId: triggerEvent._id.toString(),
    cityId,
  });

  return triggerEvent;
};

module.exports = { runPollingCycle, injectManualTrigger, fetchWeatherData, fetchAQIData };
