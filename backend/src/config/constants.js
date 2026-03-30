// GigShield — Constants (Single Source of Truth)
// Never hardcode these values anywhere else in the codebase

// ─── User Roles ──────────────────────────────────────────
const ROLES = {
  RIDER: 'rider',
  ADMIN: 'admin',
  INSURER: 'insurer',
  SUPER_ADMIN: 'super_admin',
};

// ─── Delivery Platforms ──────────────────────────────────
const PLATFORMS = {
  ZOMATO: 'zomato',
  SWIGGY: 'swiggy',
  ZEPTO: 'zepto',
  BLINKIT: 'blinkit',
  AMAZON: 'amazon',
  FLIPKART: 'flipkart',
  DUNZO: 'dunzo',
  BIGBASKET: 'bigbasket',
  OTHER: 'other',
};

// ─── Vehicle Types ────────────────────────────────────────
const VEHICLE_TYPES = {
  BIKE: 'bike',
  BICYCLE: 'bicycle',
  SCOOTER: 'scooter',
  AUTO: 'auto',
  CAR: 'car',
  ON_FOOT: 'on_foot',
};

// ─── Shift Patterns ───────────────────────────────────────
const SHIFT_PATTERNS = {
  MORNING: 'morning',        // 06:00 - 12:00
  AFTERNOON: 'afternoon',    // 12:00 - 18:00
  EVENING: 'evening',        // 18:00 - 00:00
  NIGHT: 'night',            // 00:00 - 06:00
  FULL_DAY: 'full_day',      // 06:00 - 22:00
  SPLIT: 'split',            // custom split
};

// ─── Policy Coverage Tiers ────────────────────────────────
const COVERAGE_TIERS = {
  BASIC: {
    id: 'basic',
    label: 'Basic Shield',
    daily_coverage_inr: 200,
    weekly_max_inr: 800,
    triggers: ['heavy_rain', 'aqi_spike'],
    payout_channel: ['upi'],
    loyalty_pool_multiplier: 0,
  },
  STANDARD: {
    id: 'standard',
    label: 'Standard Shield',
    daily_coverage_inr: 350,
    weekly_max_inr: 1400,
    triggers: ['heavy_rain', 'aqi_spike', 'extreme_heat', 'cyclone', 'curfew', 'platform_outage'],
    payout_channel: ['upi', 'bank_transfer'],
    loyalty_pool_multiplier: 1,
  },
  PRO: {
    id: 'pro',
    label: 'Pro Shield',
    daily_coverage_inr: 500,
    weekly_max_inr: 2000,
    triggers: ['heavy_rain', 'aqi_spike', 'extreme_heat', 'cyclone', 'curfew', 'platform_outage', 'traffic_shutdown'],
    payout_channel: ['upi', 'bank_transfer', 'neft'],
    loyalty_pool_multiplier: 2,
  },
  ELITE: {
    id: 'elite',
    label: 'Elite Shield',
    daily_coverage_inr: 700,
    weekly_max_inr: 2800,
    triggers: ['heavy_rain', 'aqi_spike', 'extreme_heat', 'cyclone', 'curfew', 'platform_outage', 'traffic_shutdown', 'bandh'],
    payout_channel: ['upi', 'bank_transfer', 'neft', 'imps'],
    loyalty_pool_multiplier: 3,
    priority_processing: true,
  },
};

// ─── Trigger Event Types ──────────────────────────────────
const TRIGGER_TYPES = {
  HEAVY_RAIN: {
    id: 'heavy_rain',
    label: 'Heavy Rain / Flood',
    threshold_mm_per_6hr: 50,         // IMD "Heavy Rain" = 64.5mm/day → 50mm/6hr
    threshold_mm_rate: 7.5,            // mm/hr for instant trigger
    payout_percent: 100,
    secondary_percent: 60,             // 30-50mm range
  },
  AQI_SPIKE: {
    id: 'aqi_spike',
    label: 'Severe Air Quality',
    threshold_aqi_full: 400,           // Hazardous — full payout
    threshold_aqi_partial: 300,        // Very Poor — 60% payout
    min_duration_hours: 4,
    payout_percent: 100,
    secondary_percent: 60,
  },
  EXTREME_HEAT: {
    id: 'extreme_heat',
    label: 'Extreme Heat',
    threshold_feels_like_c: 45,        // Real-feel °C (WHO outdoor worker guideline)
    min_duration_hours: 3,
    payout_percent: 100,
  },
  CYCLONE: {
    id: 'cyclone',
    label: 'Cyclone / Storm Warning',
    imd_yellow_percent: 50,
    imd_orange_percent: 75,
    imd_red_percent: 100,
  },
  CURFEW: {
    id: 'curfew',
    label: 'Curfew / Section 144',
    min_sources_to_confirm: 2,
    payout_percent: 100,
  },
  PLATFORM_OUTAGE: {
    id: 'platform_outage',
    label: 'Platform App Outage',
    min_duration_minutes: 30,
    peak_hours_only: true,             // Only 11AM-2PM and 7PM-11PM
    peak_windows: [
      { start: 11, end: 14 },
      { start: 19, end: 23 },
    ],
    payout_percent: 100,
  },
  TRAFFIC_SHUTDOWN: {
    id: 'traffic_shutdown',
    label: 'Road / Traffic Shutdown',
    congestion_index_threshold: 85,    // % congestion
    min_duration_minutes: 120,
    payout_percent: 75,
  },
  BANDH: {
    id: 'bandh',
    label: 'Bandh / Strike',
    payout_percent: 100,
  },
};

// ─── Policy Status ────────────────────────────────────────
const POLICY_STATUS = {
  ACTIVE: 'active',
  LAPSED: 'lapsed',
  CANCELLED: 'cancelled',
  PENDING_PAYMENT: 'pending_payment',
  EXPIRED: 'expired',
};

// ─── Claim Status ─────────────────────────────────────────
const CLAIM_STATUS = {
  DETECTED: 'detected',           // trigger fired, matching in progress
  FRAUD_SCREENING: 'fraud_screening',
  PENDING_VERIFICATION: 'pending_verification',  // orange tier — needs selfie
  APPROVED: 'approved',
  REJECTED: 'rejected',
  APPEAL_PENDING: 'appeal_pending',
  APPEAL_APPROVED: 'appeal_approved',
  APPEAL_REJECTED: 'appeal_rejected',
  PAYOUT_INITIATED: 'payout_initiated',
  PAYOUT_COMPLETED: 'payout_completed',
  PAYOUT_FAILED: 'payout_failed',
};

// ─── Fraud Score Tiers ────────────────────────────────────
const FRAUD_TIERS = {
  GREEN:  { min: 70, max: 100, action: 'auto_approve',       label: 'Green'  },
  YELLOW: { min: 45, max: 69,  action: 'approve_soft_verify', label: 'Yellow' },
  ORANGE: { min: 20, max: 44,  action: 'hold_quick_verify',   label: 'Orange' },
  RED:    { min: 0,  max: 19,  action: 'reject_appeal',       label: 'Red'    },
};

// ─── Payment Channels ─────────────────────────────────────
const PAYMENT_CHANNELS = {
  UPI: 'upi',
  BANK_TRANSFER: 'bank_transfer',
  NEFT: 'neft',
  IMPS: 'imps',
  WALLET: 'wallet',
};

// ─── Payment Status ───────────────────────────────────────
const PAYMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
};

// ─── Verification Stages ──────────────────────────────────
const KYC_STATUS = {
  NONE: 'none',
  PHONE_VERIFIED: 'phone_verified',
  AADHAAR_PENDING: 'aadhaar_pending',
  AADHAAR_VERIFIED: 'aadhaar_verified',
  BANK_VERIFIED: 'bank_verified',
  FULL: 'full',
};

// ─── Indian Cities & Zones ────────────────────────────────
const CITIES = {
  MUMBAI: { id: 'mumbai', name: 'Mumbai', state: 'Maharashtra', lat: 19.0760, lon: 72.8777, timezone: 'Asia/Kolkata' },
  DELHI: { id: 'delhi', name: 'Delhi', state: 'Delhi', lat: 28.7041, lon: 77.1025, timezone: 'Asia/Kolkata' },
  BENGALURU: { id: 'bengaluru', name: 'Bengaluru', state: 'Karnataka', lat: 12.9716, lon: 77.5946, timezone: 'Asia/Kolkata' },
  HYDERABAD: { id: 'hyderabad', name: 'Hyderabad', state: 'Telangana', lat: 17.3850, lon: 78.4867, timezone: 'Asia/Kolkata' },
  CHENNAI: { id: 'chennai', name: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lon: 80.2707, timezone: 'Asia/Kolkata' },
  PUNE: { id: 'pune', name: 'Pune', state: 'Maharashtra', lat: 18.5204, lon: 73.8567, timezone: 'Asia/Kolkata' },
  KOLKATA: { id: 'kolkata', name: 'Kolkata', state: 'West Bengal', lat: 22.5726, lon: 88.3639, timezone: 'Asia/Kolkata' },
  AHMEDABAD: { id: 'ahmedabad', name: 'Ahmedabad', state: 'Gujarat', lat: 23.0225, lon: 72.5714, timezone: 'Asia/Kolkata' },
  JAIPUR: { id: 'jaipur', name: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lon: 75.7873, timezone: 'Asia/Kolkata' },
  LUCKNOW: { id: 'lucknow', name: 'Lucknow', state: 'Uttar Pradesh', lat: 26.8467, lon: 80.9462, timezone: 'Asia/Kolkata' },
};

// ─── Seasonal Risk Multipliers ────────────────────────────
const SEASONAL_MULTIPLIERS = {
  // month (1-12): multiplier
  1:  1.0,  // Jan — baseline
  2:  1.0,  // Feb — baseline
  3:  1.05, // Mar — heat begins
  4:  1.1,  // Apr — heat
  5:  1.15, // May — peak heat (north India)
  6:  1.25, // Jun — monsoon starts
  7:  1.3,  // Jul — peak monsoon
  8:  1.3,  // Aug — peak monsoon
  9:  1.25, // Sep — monsoon + cyclone east
  10: 1.15, // Oct — AQI north India
  11: 1.2,  // Nov — AQI peak (Delhi)
  12: 1.1,  // Dec — cyclone south
};

// ─── Loyalty Streak Discounts ─────────────────────────────
const LOYALTY_DISCOUNTS = [
  { weeks: 4,  discount: 0.05, label: 'Silver Rider' },
  { weeks: 8,  discount: 0.10, label: 'Gold Rider' },
  { weeks: 12, discount: 0.15, label: 'Elite Rider' },
  { weeks: 24, discount: 0.20, label: 'Legend Rider' },
];

// ─── Rate Limits ──────────────────────────────────────────
const RATE_LIMITS = {
  GENERAL: { windowMs: 15 * 60 * 1000, max: 100 },         // 100 req/15min
  AUTH: { windowMs: 15 * 60 * 1000, max: 10 },             // 10 auth/15min
  OTP_SEND: { windowMs: 60 * 1000, max: 3 },               // 3 OTP/min
  CLAIM_SUBMIT: { windowMs: 60 * 60 * 1000, max: 5 },      // 5 claims/hr
  PAYMENT: { windowMs: 60 * 60 * 1000, max: 10 },          // 10 payment/hr
  WEBHOOK: { windowMs: 60 * 1000, max: 50 },               // 50 webhooks/min
};

// ─── TTL Values (seconds) ─────────────────────────────────
const TTL = {
  JWT_ACCESS: 15 * 60,                // 15 min
  JWT_REFRESH: 7 * 24 * 60 * 60,     // 7 days
  OTP_CODE: 10 * 60,                  // 10 min
  OTP_ATTEMPTS: 60 * 60,             // 1 hour window
  WEATHER_CACHE: 15 * 60,            // 15 min
  AQI_CACHE: 15 * 60,                // 15 min
  SESSION_CACHE: 60 * 60,            // 1 hour
  DASHBOARD_STATS: 5 * 60,           // 5 min
  CLAIM_LOCK: 60 * 60,               // 1 hr per event per rider (idempotency)
  TOKEN_BLACKLIST: 7 * 24 * 60 * 60, // match refresh token lifetime
};

// ─── Business Rules ───────────────────────────────────────
const BUSINESS_RULES = {
  MIN_POLICY_ACTIVE_HOURS_FOR_CLAIM: 2,
  MAX_PAYOUT_AS_PERCENT_OF_WEEKLY: 0.60,
  CLAIM_COOLING_HOURS: 48,
  POLICY_WEEK_START_DAY: 1,                // Monday
  POLICY_WEEK_START_HOUR: 6,              // 6 AM
  FRAUD_AUTO_REJECT_SCORE: 90,
  FRAUD_MANUAL_REVIEW_SCORE: 45,
  MAX_OTP_ATTEMPTS: 5,
  PENNY_DROP_AMOUNT_PAISE: 100,            // ₹1 for bank verification
  APPEAL_WINDOW_HOURS: 72,
  MANUAL_REVIEW_SLA_HOURS: 4,
  GOODWILL_CREDIT_FALSE_POSITIVE_INR: 50,
  APOLOGY_CREDIT_DELAY_INR: 20,
  REFERRAL_CREDIT_INR: 20,
  LOYALTY_POOL_CONTRIBUTION_PERCENT: 0.10, // 10% of unclaimed premiums
};

// ─── HTTP Status Codes ────────────────────────────────────
const HTTP = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
};

// ─── Queue Names ──────────────────────────────────────────
const QUEUES = {
  FRAUD_CHECK: 'fraud-check',
  PAYOUT: 'payout',
  NOTIFICATION: 'notification',
  CLAIM_PROCESS: 'claim-process',
  BLOCKCHAIN_LOG: 'blockchain-log',
  EMAIL: 'email',
  KYC_VERIFY: 'kyc-verify',
  PREMIUM_CALC: 'premium-calc',
  ANALYTICS: 'analytics',
};

// ─── Socket.IO Events ─────────────────────────────────────
const SOCKET_EVENTS = {
  TRIGGER_FIRED: 'trigger:fired',
  CLAIM_UPDATED: 'claim:updated',
  PAYOUT_COMPLETED: 'payout:completed',
  DASHBOARD_UPDATE: 'dashboard:update',
  FRAUD_ALERT: 'fraud:alert',
  POLICY_ACTIVATED: 'policy:activated',
};

const SUPPORTED_CITIES = [
  "mumbai",
  "delhi",
  "bengaluru",
  "hyderabad",
  "chennai",
  "kolkata",
  "pune",
  "ahmedabad",
  "jaipur",
  "lucknow"
];

module.exports = {
  ROLES, PLATFORMS, VEHICLE_TYPES, SHIFT_PATTERNS,
  COVERAGE_TIERS, TRIGGER_TYPES, POLICY_STATUS, CLAIM_STATUS,
  FRAUD_TIERS, PAYMENT_CHANNELS, PAYMENT_STATUS, KYC_STATUS,
  CITIES, SEASONAL_MULTIPLIERS, LOYALTY_DISCOUNTS,
  RATE_LIMITS, TTL, BUSINESS_RULES, HTTP, QUEUES, SOCKET_EVENTS, SUPPORTED_CITIES,
};
