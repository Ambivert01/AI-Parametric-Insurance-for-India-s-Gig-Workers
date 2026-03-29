const moment = require('moment-timezone');
const { BUSINESS_RULES, SEASONAL_MULTIPLIERS } = require('../config/constants');

const IST = 'Asia/Kolkata';

/**
 * Get current time in IST
 */
const nowIST = () => moment().tz(IST);

/**
 * Get start of current policy week (Monday 6 AM IST)
 */
const getCurrentPolicyWeekStart = () => {
  const now = moment().tz(IST);
  const dayOfWeek = now.isoWeekday(); // 1=Mon, 7=Sun
  const daysToMonday = dayOfWeek - 1;
  const monday = now.clone().subtract(daysToMonday, 'days').startOf('day').add(6, 'hours');

  // If we're before Monday 6 AM this week, go back to previous Monday
  if (now.isBefore(monday)) {
    return monday.subtract(7, 'days');
  }
  return monday;
};

/**
 * Get end of current policy week (Sunday 11:59:59 PM IST)
 */
const getCurrentPolicyWeekEnd = () => {
  const weekStart = getCurrentPolicyWeekStart();
  return weekStart.clone().add(7, 'days').subtract(1, 'second');
};

/**
 * Get start of next policy week
 */
const getNextPolicyWeekStart = () => {
  return getCurrentPolicyWeekStart().add(7, 'days');
};

/**
 * Check if a timestamp falls within current policy week
 */
const isInCurrentPolicyWeek = (timestamp) => {
  const t = moment(timestamp).tz(IST);
  return t.isBetween(getCurrentPolicyWeekStart(), getCurrentPolicyWeekEnd(), null, '[]');
};

/**
 * Get policy week identifier string (e.g. "2026-W12")
 */
const getPolicyWeekId = (date = new Date()) => {
  const m = moment(date).tz(IST);
  return `${m.isoWeekYear()}-W${String(m.isoWeek()).padStart(2, '0')}`;
};

/**
 * Get seasonal premium multiplier for a given date
 */
const getSeasonalMultiplier = (date = new Date(), cityId = null) => {
  const month = moment(date).tz(IST).month() + 1; // 1-12
  let multiplier = SEASONAL_MULTIPLIERS[month] || 1.0;

  // City-specific adjustments
  if (cityId) {
    const city = cityId.toLowerCase();
    // Chennai gets extra cyclone risk in Oct-Dec
    if (['chennai', 'kolkata'].includes(city) && [10, 11, 12].includes(month)) {
      multiplier += 0.05;
    }
    // Delhi gets extra AQI risk Nov-Jan
    if (['delhi'].includes(city) && [11, 12, 1].includes(month)) {
      multiplier += 0.05;
    }
    // Mumbai monsoon peak
    if (['mumbai'].includes(city) && [6, 7, 8, 9].includes(month)) {
      multiplier += 0.05;
    }
  }

  return Math.round(multiplier * 100) / 100;
};

/**
 * Check if current time is within peak delivery hours
 */
const isInPeakHours = (timestamp = new Date()) => {
  const hour = moment(timestamp).tz(IST).hour();
  return (hour >= 11 && hour < 14) || (hour >= 19 && hour < 23);
};

/**
 * Get disruption duration in hours between two timestamps
 */
const getDisruptionHours = (startTime, endTime = new Date()) => {
  const start = moment(startTime);
  const end = moment(endTime);
  return Math.max(0, end.diff(start, 'hours', true));
};

/**
 * Format duration in human readable form
 */
const formatDuration = (ms) => {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
};

/**
 * Get expiry time for OTP with buffer
 */
const getOTPExpiry = (minutes = 10) => {
  return moment().tz(IST).add(minutes, 'minutes').toDate();
};

/**
 * Check if rider has been on policy long enough to claim
 * (must be active >= 2 hours before first claim)
 */
const isPolicyMatureForClaim = (policyCreatedAt) => {
  const minHours = BUSINESS_RULES.MIN_POLICY_ACTIVE_HOURS_FOR_CLAIM;
  const hoursSinceActivation = moment().diff(moment(policyCreatedAt), 'hours', true);
  return hoursSinceActivation >= minHours;
};

/**
 * Get appeal deadline for a rejected claim
 */
const getAppealDeadline = (rejectedAt) => {
  return moment(rejectedAt).add(BUSINESS_RULES.APPEAL_WINDOW_HOURS, 'hours').toDate();
};

module.exports = {
  nowIST, IST,
  getCurrentPolicyWeekStart,
  getCurrentPolicyWeekEnd,
  getNextPolicyWeekStart,
  isInCurrentPolicyWeek,
  getPolicyWeekId,
  getSeasonalMultiplier,
  isInPeakHours,
  getDisruptionHours,
  formatDuration,
  getOTPExpiry,
  isPolicyMatureForClaim,
  getAppealDeadline,
};
