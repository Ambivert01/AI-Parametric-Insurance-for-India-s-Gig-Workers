const geolib = require('geolib');
const { CITIES } = require('../config/constants');

/**
 * Check if coordinates are within a radius of a city center
 * @param {number} lat - rider latitude
 * @param {number} lon - rider longitude
 * @param {string} cityId - city from CITIES constant
 * @param {number} radiusKm - radius in kilometers
 */
const isInCityRadius = (lat, lon, cityId, radiusKm = 50) => {
  const city = CITIES[cityId.toUpperCase()];
  if (!city) return false;
  const distMeters = geolib.getDistance(
    { latitude: lat, longitude: lon },
    { latitude: city.lat, longitude: city.lon }
  );
  return distMeters <= radiusKm * 1000;
};

/**
 * Get nearest city for given coordinates
 */
const getNearestCity = (lat, lon) => {
  let nearest = null;
  let minDist = Infinity;
  for (const [key, city] of Object.entries(CITIES)) {
    const dist = geolib.getDistance(
      { latitude: lat, longitude: lon },
      { latitude: city.lat, longitude: city.lon }
    );
    if (dist < minDist) {
      minDist = dist;
      nearest = { ...city, distanceKm: Math.round(dist / 1000) };
    }
  }
  return nearest;
};

/**
 * Check if two GPS coordinates are consistent (not teleporting)
 * @param {Object} prev - { lat, lon, timestamp }
 * @param {Object} curr - { lat, lon, timestamp }
 * @returns {Object} { valid, speedKmh, distanceKm }
 */
const checkLocationConsistency = (prev, curr) => {
  if (!prev || !curr) return { valid: true, speedKmh: 0, distanceKm: 0 };

  const distanceM = geolib.getDistance(
    { latitude: prev.lat, longitude: prev.lon },
    { latitude: curr.lat, longitude: curr.lon }
  );
  const distanceKm = distanceM / 1000;

  const timeDiffMs = new Date(curr.timestamp) - new Date(prev.timestamp);
  const timeDiffHr = timeDiffMs / (1000 * 60 * 60);
  const speedKmh = timeDiffHr > 0 ? distanceKm / timeDiffHr : 0;

  // A delivery rider cannot travel > 120 kmh (bike/scooter)
  // If they jumped > 50km in < 5 minutes — teleportation
  const isTeleport = distanceKm > 50 && timeDiffMs < 5 * 60 * 1000;
  const isUnrealisticSpeed = speedKmh > 120;

  return {
    valid: !isTeleport && !isUnrealisticSpeed,
    speedKmh: Math.round(speedKmh),
    distanceKm: Math.round(distanceKm * 100) / 100,
    isTeleport,
    isUnrealisticSpeed,
  };
};

/**
 * Detect GPS spoofing based on signal characteristics
 * Real GPS has natural jitter; spoofed GPS is suspiciously stable
 * @param {Array} readings - array of { lat, lon, accuracy, timestamp }
 * @returns {Object} { isSpoofed, confidence, reason }
 */
const detectGpsSpoofing = (readings) => {
  if (!readings || readings.length < 3) {
    return { isSpoofed: false, confidence: 0, reason: 'insufficient_data' };
  }

  const lats = readings.map(r => r.lat);
  const lons = readings.map(r => r.lon);
  const accuracies = readings.map(r => r.accuracy || 10);

  // Calculate variance — real GPS has natural jitter of ~3-8m
  const latVariance = calculateVariance(lats);
  const lonVariance = calculateVariance(lons);
  const totalVarianceDeg = latVariance + lonVariance;

  // Perfect GPS lock (variance < 0.000001 degrees ≈ 0.1m) is suspicious
  // Real GPS drifts: 0.00005+ degrees (≈ 5m) minimum jitter
  const suspiciouslyStable = totalVarianceDeg < 0.0000001;

  // Perfect accuracy (all readings exactly the same) = spoofed
  const allSameLocation = lats.every(l => l === lats[0]) && lons.every(l => l === lons[0]);

  // Unrealistically high accuracy consistently
  const avgAccuracy = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
  const unrealisticAccuracy = avgAccuracy < 2; // sub-2m accuracy is rare in urban India

  const spoofSignals = [suspiciouslyStable, allSameLocation, unrealisticAccuracy].filter(Boolean).length;
  const isSpoofed = spoofSignals >= 2;
  const confidence = (spoofSignals / 3) * 100;

  return {
    isSpoofed,
    confidence: Math.round(confidence),
    reason: isSpoofed
      ? [
          suspiciouslyStable && 'no_natural_gps_jitter',
          allSameLocation && 'identical_coordinates',
          unrealisticAccuracy && 'unrealistic_accuracy',
        ].filter(Boolean).join(',')
      : 'normal',
  };
};

/**
 * Check if a cell tower location matches claimed GPS zone
 * @param {string} cityId - claimed city
 * @param {Object} cellInfo - { mcc, mnc, cellId, lat, lon } from OpenCelliD
 */
const validateCellTowerLocation = (cityId, cellInfo) => {
  if (!cellInfo || !cellInfo.lat || !cellInfo.lon) {
    return { valid: null, reason: 'no_cell_data' }; // no data → neutral
  }
  const inCity = isInCityRadius(cellInfo.lat, cellInfo.lon, cityId, 80); // 80km radius for city
  return {
    valid: inCity,
    distanceKm: inCity ? 0 : Math.round(
      geolib.getDistance(
        { latitude: cellInfo.lat, longitude: cellInfo.lon },
        { latitude: CITIES[cityId.toUpperCase()]?.lat, longitude: CITIES[cityId.toUpperCase()]?.lon }
      ) / 1000
    ),
    reason: inCity ? 'tower_in_city' : 'tower_outside_city',
  };
};

// ─── Math helpers ──────────────────────────────────────────
const calculateVariance = (arr) => {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
};

/**
 * Create a geofence polygon from a city center + radius
 * Returns bounding box for quick DB spatial queries
 */
const getCityBoundingBox = (cityId, radiusKm = 50) => {
  const city = CITIES[cityId.toUpperCase()];
  if (!city) return null;
  return geolib.getBoundsOfDistance(
    { latitude: city.lat, longitude: city.lon },
    radiusKm * 1000
  );
};

/**
 * Convert address/pincode string to lat/lon using Google Geocoding
 * (fallback to city center if geocoding fails)
 */
const geocodeAddress = async (address, cityId) => {
  // In production: call Google Geocoding API
  // For now: return city center as fallback
  const city = CITIES[cityId?.toUpperCase()] || CITIES.MUMBAI;
  return {
    lat: city.lat + (Math.random() - 0.5) * 0.1, // slight randomization for demo
    lon: city.lon + (Math.random() - 0.5) * 0.1,
    source: 'city_fallback',
  };
};

module.exports = {
  isInCityRadius,
  getNearestCity,
  checkLocationConsistency,
  detectGpsSpoofing,
  validateCellTowerLocation,
  getCityBoundingBox,
  geocodeAddress,
  calculateVariance,
};
