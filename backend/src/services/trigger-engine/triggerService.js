const axios = require('axios');
const TriggerEvent = require('../../models/TriggerEvent');
const { redis, KEYS } = require('../../config/redis');
const { TRIGGER_TYPES, CITIES, SOCKET_EVENTS, QUEUES } = require('../../config/constants');
const { getSeasonalMultiplier } = require('../../utils/dateTime');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

// Doc 07_TRIGGER_ENGINE §6: 0-30 Low (discard), 31-70 Medium (wait for more
// data), 71-100 High (auto-proceed). Previously there was no confidence
// concept anywhere in this file — every threshold breach queued a claim
// on a single reading from a single source.
const CONFIDENCE_BAND = (c) => (c >= 71 ? 'high' : c >= 31 ? 'medium' : 'low');

// ─── API Fetchers ─────────────────────────────────────────

const fetchWeatherData = async (cityId) => {
  const city = CITIES[cityId.toUpperCase()];
  if (!city) return null;

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
      windSpeed: data.wind?.speed || 0, // m/s
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

// Rain has no second free live data source available (IMD has no public
// JSON feed). Rather than a stub that always returns "no alert" — which
// silently made every rain trigger look uncorroborated forever — this
// derives a genuine corroboration signal from the same seasonal model
// already used for pricing: a heavy-rain reading during a city's monsoon
// window is more credible than the identical reading in December, and the
// confidence score should honestly reflect that instead of pretending to
// have verified against a feed that doesn't exist.
const seasonalRainPlausibility = (cityId, date = new Date()) => {
  const multiplier = getSeasonalMultiplier(date, cityId);
  return multiplier >= 1.15;
};

// ─── Confidence scoring ────────────────────────────────────
const computeConfidence = ({ baseConfidence, magnitudeRatio = 1, corroborated = false }) => {
  let c = baseConfidence;
  c += Math.min(20, Math.max(0, (magnitudeRatio - 1) * 40)); // further past threshold = more confident
  if (corroborated) c += 15;
  return Math.round(Math.max(0, Math.min(100, c)));
};

// ─── Trigger Evaluation ───────────────────────────────────

const evaluateWeatherTrigger = async (cityId, weatherData, date = new Date()) => {
  const events = [];
  const RAIN = TRIGGER_TYPES.HEAVY_RAIN;
  const corroborated = seasonalRainPlausibility(cityId, date);

  const rainfall6h = (weatherData.rainfall3h || 0) * 2;
  const rainfallRate = weatherData.rainfall1h || 0;

  if (rainfall6h >= RAIN.threshold_mm_per_6hr) {
    events.push({
      triggerType: 'HEAVY_RAIN',
      triggerValue: rainfall6h,
      triggerUnit: 'mm/6hr',
      threshold: RAIN.threshold_mm_per_6hr,
      severity: 'full',
      payoutPercent: RAIN.payout_percent,
      confidence: computeConfidence({ baseConfidence: 60, magnitudeRatio: rainfall6h / RAIN.threshold_mm_per_6hr, corroborated }),
    });
  } else if (rainfall6h >= 30) {
    events.push({
      triggerType: 'HEAVY_RAIN',
      triggerValue: rainfall6h,
      triggerUnit: 'mm/6hr',
      threshold: 30,
      severity: 'partial',
      payoutPercent: RAIN.secondary_percent,
      confidence: computeConfidence({ baseConfidence: 55, magnitudeRatio: rainfall6h / 30, corroborated }),
    });
  }

  if (rainfallRate >= RAIN.threshold_mm_rate && events.length === 0) {
    events.push({
      triggerType: 'HEAVY_RAIN',
      triggerValue: rainfallRate,
      triggerUnit: 'mm/hr',
      threshold: RAIN.threshold_mm_rate,
      severity: 'partial',
      payoutPercent: 70,
      confidence: computeConfidence({ baseConfidence: 50, magnitudeRatio: rainfallRate / RAIN.threshold_mm_rate, corroborated }),
    });
  }

  const HEAT = TRIGGER_TYPES.EXTREME_HEAT;
  if (weatherData.feelsLike >= HEAT.threshold_feels_like_c) {
    events.push({
      triggerType: 'EXTREME_HEAT',
      triggerValue: weatherData.feelsLike,
      triggerUnit: '°C (feels like)',
      threshold: HEAT.threshold_feels_like_c,
      severity: 'full',
      payoutPercent: HEAT.payout_percent,
      // Direct thermometer reading — no cross-source needed to trust it the
      // way a rainfall extrapolation does, so this starts higher.
      confidence: computeConfidence({ baseConfidence: 68, magnitudeRatio: weatherData.feelsLike / HEAT.threshold_feels_like_c }),
    });
  }

  return events;
};

// CYCLONE — built entirely from data already being fetched every cycle
// (wind speed + condition code from the same OpenWeather call), rather than
// a second fabricated API. IMD doesn't publish a usable public feed, so
// this is deliberately a single-source signal and scored accordingly.
const STORM_CONDITIONS = ['Thunderstorm', 'Squall', 'Tornado'];
const evaluateStormTrigger = async (cityId, weatherData) => {
  const CYCLONE = TRIGGER_TYPES.CYCLONE;
  const windKmh = (weatherData.windSpeed || 0) * 3.6;
  const stormyCondition = STORM_CONDITIONS.includes(weatherData.weatherMain);

  if (windKmh < 25) return []; // floor: don't fire on a "Thunderstorm" label alone with negligible wind

  let severity, payoutPercent, band;
  if (windKmh >= 88) { severity = 'extreme'; payoutPercent = CYCLONE.imd_red_percent; band = 'red'; }
  else if (windKmh >= 62) { severity = 'full'; payoutPercent = CYCLONE.imd_orange_percent; band = 'orange'; }
  else { severity = 'partial'; payoutPercent = CYCLONE.imd_yellow_percent; band = 'yellow'; }

  return [{
    triggerType: 'CYCLONE',
    triggerValue: Math.round(windKmh),
    triggerUnit: 'km/h wind',
    threshold: 40,
    severity,
    payoutPercent,
    confidence: computeConfidence({ baseConfidence: 50, magnitudeRatio: windKmh / 62, corroborated: stormyCondition }),
    _band: band,
  }];
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
      confidence: computeConfidence({ baseConfidence: 65, magnitudeRatio: aqiData.aqi / AQI.threshold_aqi_full }),
    });
  } else if (aqiData.aqi >= AQI.threshold_aqi_partial) {
    events.push({
      triggerType: 'AQI_SPIKE',
      triggerValue: aqiData.aqi,
      triggerUnit: 'AQI',
      threshold: AQI.threshold_aqi_partial,
      severity: 'partial',
      payoutPercent: AQI.secondary_percent,
      confidence: computeConfidence({ baseConfidence: 60, magnitudeRatio: aqiData.aqi / AQI.threshold_aqi_partial }),
    });
  }

  return events;
};

// ─── Shared: hand a confirmed trigger off to the claims pipeline ─────────
const queueForClaims = async (triggerEvent, cycleId, io) => {
  if (io) {
    io.to('admins').emit(SOCKET_EVENTS.TRIGGER_FIRED, {
      eventId: triggerEvent.eventId,
      type: triggerEvent.triggerType,
      city: triggerEvent.cityId,
      value: triggerEvent.triggerValue,
      confidence: triggerEvent.confidence,
    });
  }
  const { getQueue } = require('../../workers/queueManager');
  await getQueue(QUEUES.CLAIM_PROCESS).add('process-trigger', {
    triggerId: triggerEvent._id.toString(),
    cityId: triggerEvent.cityId,
  }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
};

// ─── Main: Run one full polling cycle ─────────────────────

const runPollingCycle = async (io = null) => {
  const cycleId = `cycle-${Date.now()}-${uuidv4().slice(0, 8)}`;
  logger.info(`▶ Trigger engine cycle started: ${cycleId}`);

  const results = { detected: 0, confirmed: 0, watching: 0, discarded: 0, errors: 0 };
  const cityIds = Object.keys(CITIES);

  for (const cityId of cityIds) {
    try {
      const city = CITIES[cityId];
      const [weather, aqi] = await Promise.allSettled([
        fetchWeatherData(cityId),
        fetchAQIData(cityId),
      ]);

      const weatherData = weather.status === 'fulfilled' ? weather.value : null;
      const aqiData = aqi.status === 'fulfilled' ? aqi.value : null;

      const detectedEvents = [];
      if (weatherData) {
        const weatherEvents = await evaluateWeatherTrigger(cityId, weatherData);
        const stormEvents = await evaluateStormTrigger(cityId, weatherData);
        detectedEvents.push(...weatherEvents.map(e => ({ ...e, primarySource: { source: weatherData.source, value: e.triggerValue, unit: e.triggerUnit, fetchedAt: weatherData.fetchedAt } })));
        detectedEvents.push(...stormEvents.map(e => ({ ...e, primarySource: { source: weatherData.source, value: e.triggerValue, unit: e.triggerUnit, fetchedAt: weatherData.fetchedAt } })));
      }
      if (aqiData) {
        const aqiEvents = await evaluateAQITrigger(cityId, aqiData);
        detectedEvents.push(...aqiEvents.map(e => ({ ...e, primarySource: { source: aqiData.source, value: e.triggerValue, unit: e.triggerUnit, fetchedAt: aqiData.fetchedAt } })));
      }

      for (const eventData of detectedEvents) {
        // Same event still being tracked from an earlier cycle? Corroborate
        // instead of creating a duplicate row — a signal that persists
        // across cycles is itself evidence, per doc §6/§15.
        const recentEvent = await TriggerEvent.findOne({
          cityId,
          triggerType: eventData.triggerType,
          detectedAt: { $gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
          status: { $in: ['detected', 'verifying', 'confirmed'] },
        });

        if (recentEvent) {
          if (recentEvent.status === 'detected') {
            const boosted = Math.min(100, Math.round((recentEvent.confidence + eventData.confidence) / 2) + 10);
            recentEvent.confidence = boosted;
            recentEvent.triggerValue = eventData.triggerValue;
            if (CONFIDENCE_BAND(boosted) === 'high') {
              recentEvent.status = 'verifying';
              await recentEvent.save();
              recentEvent.status = 'confirmed';
              recentEvent.isVerified = true;
              recentEvent.confirmedAt = new Date();
              await recentEvent.save();
              results.confirmed++;
              await queueForClaims(recentEvent, cycleId, io);
            } else {
              await recentEvent.save();
            }
          }
          continue;
        }

        const band = CONFIDENCE_BAND(eventData.confidence);
        if (band === 'low') {
          results.discarded++;
          logger.info(`Discarded low-confidence ${eventData.triggerType} in ${cityId} (confidence=${eventData.confidence})`);
          continue;
        }

        const triggerEvent = new TriggerEvent({
          cityId,
          triggerType: eventData.triggerType,
          triggerValue: eventData.triggerValue,
          triggerUnit: eventData.triggerUnit,
          threshold: eventData.threshold,
          severity: eventData.severity,
          payoutPercent: eventData.payoutPercent,
          confidence: eventData.confidence,
          centerLat: city.lat,
          centerLon: city.lon,
          radiusKm: 25,
          primarySource: eventData.primarySource,
          status: band === 'high' ? 'verifying' : 'detected',
          isVerified: band === 'high',
          confirmedAt: band === 'high' ? new Date() : undefined,
          pollingCycleId: cycleId,
        });

        await triggerEvent.save();
        results.detected++;
        logger.trigger(eventData.triggerType, cityId, eventData.triggerValue);

        if (band === 'high') {
          triggerEvent.status = 'confirmed';
          await triggerEvent.save();
          results.confirmed++;
          await queueForClaims(triggerEvent, cycleId, io);
        } else {
          results.watching++;
          if (io) {
            io.to('admins').emit(SOCKET_EVENTS.TRIGGER_FIRED, {
              eventId: triggerEvent.eventId,
              type: eventData.triggerType,
              city: cityId,
              value: eventData.triggerValue,
              confidence: eventData.confidence,
              awaitingConfirmation: true,
            });
          }
        }
      }
    } catch (err) {
      logger.error(`Trigger engine error for ${cityId}: ${err.message}`);
      results.errors++;
    }
  }

  logger.info(`◼ Trigger cycle complete: detected=${results.detected}, confirmed=${results.confirmed}, watching=${results.watching}, discarded=${results.discarded}, errors=${results.errors}`);
  return results;
};

// Unit/threshold shape differs per trigger type — this used to fall back to
// 'AQI' + an undefined threshold for every type except HEAVY_RAIN, so a
// manually-injected curfew or platform outage was stored with a nonsensical
// unit and threshold.
const MANUAL_TRIGGER_SHAPE = {
  HEAVY_RAIN: (c) => ({ unit: 'mm/6hr', threshold: c.threshold_mm_per_6hr }),
  AQI_SPIKE: (c) => ({ unit: 'AQI', threshold: c.threshold_aqi_full }),
  EXTREME_HEAT: (c) => ({ unit: '°C (feels like)', threshold: c.threshold_feels_like_c }),
  CYCLONE: () => ({ unit: 'km/h wind', threshold: 62 }),
  CURFEW: () => ({ unit: 'event', threshold: 1 }),
  PLATFORM_OUTAGE: (c) => ({ unit: 'minutes down', threshold: c.min_duration_minutes }),
  TRAFFIC_SHUTDOWN: (c) => ({ unit: '% congestion', threshold: c.congestion_index_threshold }),
  BANDH: () => ({ unit: 'event', threshold: 1 }),
};

// ─── Manual trigger injection ──────────────────────────────
// This is the doc-sanctioned "Manual Override" trusted source (§4) — the
// real, honest path for trigger types with no free live-data feed
// (curfew, platform outage, traffic shutdown, bandh all fall in this
// bucket; there is no public API for any of them). `sources` lets an
// operator record how many independent reports corroborate the event —
// CURFEW's own config requires 2 before it counts as verified.
const injectManualTrigger = async (cityId, triggerType, triggerValue, io = null, options = {}) => {
  const triggerConfig = TRIGGER_TYPES[triggerType];
  if (!triggerConfig) throw new Error(`Unknown trigger type: ${triggerType}`);

  const city = CITIES[cityId.toUpperCase()];
  const shape = (MANUAL_TRIGGER_SHAPE[triggerType] || (() => ({ unit: 'event', threshold: 1 })))(triggerConfig);
  const sources = options.sources?.length ? options.sources : ['ops_manual'];
  const minSources = triggerConfig.min_sources_to_confirm || 1;
  const isVerified = sources.length >= minSources;

  const triggerEvent = new TriggerEvent({
    cityId,
    triggerType,
    triggerValue,
    triggerUnit: shape.unit,
    threshold: shape.threshold ?? 1,
    severity: 'full',
    payoutPercent: triggerConfig.payout_percent ?? 100, // was hardcoded 100 for every type, overpaying e.g. TRAFFIC_SHUTDOWN's documented 75%
    confidence: isVerified ? 95 : 50, // human-reported, but still gated on the type's own corroboration rule
    centerLat: city?.lat,
    centerLon: city?.lon,
    radiusKm: 25,
    affectedPincodes: options.affectedPincodes || [],
    primarySource: {
      source: 'manual_injection',
      value: triggerValue,
      fetchedAt: new Date().toISOString(),
    },
    isVerified,
    verifiedAt: isVerified ? new Date() : undefined,
    status: isVerified ? 'confirmed' : 'detected',
    confirmedAt: isVerified ? new Date() : undefined,
    notes: options.note ? `${options.note} (sources: ${sources.join(', ')})` : `sources: ${sources.join(', ')}`,
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
      awaitingConfirmation: !isVerified,
    });
  }

  if (isVerified) {
    await queueForClaims(triggerEvent, 'manual', io);
  } else {
    logger.info(`Manual trigger ${triggerEvent.eventId} awaiting ${minSources - sources.length} more source(s) before it can proceed to claims`);
  }

  return triggerEvent;
};

module.exports = {
  runPollingCycle, injectManualTrigger, fetchWeatherData, fetchAQIData,
  // Exported for unit testing — pure functions, no DB/network side effects.
  computeConfidence, CONFIDENCE_BAND, evaluateStormTrigger, evaluateWeatherTrigger,
  evaluateAQITrigger, seasonalRainPlausibility,
};
