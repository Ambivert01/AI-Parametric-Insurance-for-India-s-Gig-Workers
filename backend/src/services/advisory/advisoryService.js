/**
 * AI Advisory System — doc 35_AI_ADVISORY (PROJECT_DOCUMENTATION §35)
 *
 * "Rather than reacting after disruptions occur, the AI Advisory System
 * continuously analyzes future conditions and proactively guides workers."
 *
 * This was 0% implemented — GigShield only ever reacted to triggers that
 * had already fired. This uses the OpenWeather 5-day/3-hour forecast (same
 * API key already configured for current-conditions polling) plus current
 * AQI to warn riders about what's coming in their own city, in time to act
 * on it — matching the doc's own worked examples almost verbatim.
 *
 * Honest scope note: "Government Notifications" and "Platform Status" are
 * listed as AI inputs in the doc but have no available data source (same
 * constraint as the trigger engine's manual-injection-only types) — this
 * only covers what's genuinely predictable from weather/AQI data.
 */
const axios = require('axios');
const User = require('../../models/User');
const { redis, KEYS } = require('../../config/redis');
const { CITIES, TRIGGER_TYPES } = require('../../config/constants');
const { fetchAQIData } = require('../trigger-engine/triggerService');
const { getRiskAssessmentAndRecommendation } = require('../policy/policyService');
const logger = require('../../utils/logger');

const SHIFT_WINDOWS = {
  morning: [6, 12], afternoon: [12, 18], evening: [18, 24],
  night: [0, 6], full_day: [6, 22], split: [6, 22],
};

const fetchForecast = async (cityId) => {
  const city = CITIES[cityId.toUpperCase()];
  if (!city) return null;

  const cacheKey = `forecast:${cityId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await axios.get(
      `${process.env.OPENWEATHER_BASE_URL}/forecast`,
      {
        params: {
          lat: city.lat, lon: city.lon,
          appid: process.env.OPENWEATHER_API_KEY,
          units: 'metric',
        },
        timeout: 8000,
      }
    );

    const result = (data.list || []).slice(0, 16).map((entry) => ({ // next 48h, 3h steps
      at: entry.dt_txt,
      hour: new Date(entry.dt * 1000).getHours(),
      rainfall3h: entry.rain?.['3h'] || 0,
      feelsLike: entry.main?.feels_like || 0,
      windSpeed: entry.wind?.speed || 0,
      weatherMain: entry.weather?.[0]?.main || '',
      pop: entry.pop || 0, // probability of precipitation, 0-1
    }));

    await redis.set(cacheKey, result, 30 * 60); // forecasts don't change minute to minute
    return result;
  } catch (err) {
    logger.error(`Forecast API failed for ${cityId}: ${err.message}`);
    return null;
  }
};

const timeLabel = (dtText, hour) => {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${suffix}`;
};

const shiftOverlapsHour = (shiftPattern, hour) => {
  const window = SHIFT_WINDOWS[shiftPattern];
  if (!window) return true; // unknown pattern — don't under-warn
  const [start, end] = window;
  if (start <= end) return hour >= start && hour < end;
  return hour >= start || hour < end; // wraps midnight (e.g. night 0-6 already handled, evening 18-24 handled)
};

const buildAdvisories = (forecast, aqi, riderProfile) => {
  const advisories = [];
  const RAIN = TRIGGER_TYPES.HEAVY_RAIN;
  const HEAT = TRIGGER_TYPES.EXTREME_HEAT;
  const CYCLONE = TRIGGER_TYPES.CYCLONE;

  // Look at the next 48h in 3h steps for the first entry that crosses a
  // meaningful threshold — the doc's example is exactly this shape
  // ("Heavy rainfall expected after 2 PM. Start your shift earlier.").
  for (const step of forecast) {
    if (step.rainfall3h >= RAIN.threshold_mm_per_6hr / 2) {
      advisories.push({
        type: 'weather_alert',
        icon: '🌧️',
        headline: `Heavy rainfall expected around ${timeLabel(step.at, step.hour)}`,
        recommendation: shiftOverlapsHour(riderProfile.shiftPattern, step.hour)
          ? 'This overlaps your usual shift — consider starting earlier or ending before it hits.'
          : 'Outside your usual shift window, but plan extra travel time if you\'re out.',
        severity: step.rainfall3h >= RAIN.threshold_mm_per_6hr ? 'high' : 'medium',
      });
      break; // one rain advisory is enough — don't spam every 3h block
    }
  }

  for (const step of forecast) {
    if (step.feelsLike >= HEAT.threshold_feels_like_c - 3) {
      advisories.push({
        type: 'heat_alert',
        icon: '🌡️',
        headline: `Feels-like temperature reaching ${Math.round(step.feelsLike)}°C around ${timeLabel(step.at, step.hour)}`,
        recommendation: 'Avoid extended outdoor work during peak heat — hydrate and take shade breaks.',
        severity: step.feelsLike >= HEAT.threshold_feels_like_c ? 'high' : 'medium',
      });
      break;
    }
  }

  const stormStep = forecast.find((s) => (s.windSpeed * 3.6) >= 40 || ['Thunderstorm', 'Squall'].includes(s.weatherMain));
  if (stormStep) {
    advisories.push({
      type: 'storm_alert',
      icon: '🌀',
      headline: `Stormy conditions possible around ${timeLabel(stormStep.at, stormStep.hour)}`,
      recommendation: 'Keep an eye on conditions — consider rescheduling non-urgent deliveries.',
      severity: (stormStep.windSpeed * 3.6) >= 62 ? 'high' : 'medium',
    });
  }

  if (aqi && aqi.aqi >= TRIGGER_TYPES.AQI_SPIKE.threshold_aqi_partial) {
    advisories.push({
      type: 'aqi_alert',
      icon: '😷',
      headline: `Air quality is currently ${aqi.aqi} AQI`,
      recommendation: aqi.aqi >= TRIGGER_TYPES.AQI_SPIKE.threshold_aqi_full
        ? 'Avoid outdoor work between 12 PM and 4 PM if possible — wear a mask.'
        : 'Consider a mask during peak traffic hours.',
      severity: aqi.aqi >= TRIGGER_TYPES.AQI_SPIKE.threshold_aqi_full ? 'high' : 'medium',
    });
  }

  return advisories;
};

const getAdvisoryForRider = async (riderId) => {
  const user = await User.findById(riderId).select('riderProfile').lean();
  if (!user?.riderProfile?.cityId) {
    throw Object.assign(new Error('Complete your profile to get personalized advisories'), { statusCode: 400 });
  }

  const { cityId, shiftPattern } = user.riderProfile;
  const [forecast, aqi] = await Promise.all([
    fetchForecast(cityId),
    fetchAQIData(cityId),
  ]);

  const advisories = forecast ? buildAdvisories(forecast, aqi, { shiftPattern }) : [];

  // Tier-mismatch upsell — matches the doc's "Upgrade Flood Protection for
  // ₹6 this week" example: if there's a real predicted risk this rider's
  // current tier doesn't even cover, surface it honestly rather than
  // generically pushing an upgrade.
  let upgradeSuggestion = null;
  const highSeverityTypes = [];
  if (advisories.some((a) => a.type === 'storm_alert')) highSeverityTypes.push('cyclone');
  if (advisories.some((a) => a.type === 'heat_alert')) highSeverityTypes.push('extreme_heat');

  if (highSeverityTypes.length) {
    try {
      const { getActivePolicyForRider } = require('../policy/policyService');
      const activePolicy = await getActivePolicyForRider(riderId);
      const coveredTriggers = activePolicy?.tierDetails?.triggers || [];
      const uncoveredTypes = highSeverityTypes.filter((t) => !coveredTriggers.includes(t));

      if (uncoveredTypes.length) {
        const rec = await getRiskAssessmentAndRecommendation(riderId);
        upgradeSuggestion = {
          headline: `${uncoveredTypes.join(' & ')} risk detected — your current plan doesn't cover this`,
          recommendedTier: rec.recommendedTier,
          weeklyPriceInr: rec.tiers[rec.recommendedTier]?.premiumAmountInr,
        };
      }
    } catch {
      // no active policy / profile incomplete / ML unavailable — skip upsell, advisories still valid
    }
  }

  return { advisories, upgradeSuggestion, generatedAt: new Date().toISOString() };
};

module.exports = { getAdvisoryForRider, fetchForecast };
