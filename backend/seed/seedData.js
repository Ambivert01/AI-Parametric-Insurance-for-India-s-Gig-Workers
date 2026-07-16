/**
 * seedData.js — pure data-construction functions for the GigShield demo
 * dataset. Every function here returns a plain JS object shaped exactly
 * like the corresponding Mongoose schema — no DB connection required to
 * build them, which is what lets tests/unit/seedData.test.js validate
 * every one of these against the real schemas (via validateSync())
 * without needing a live MongoDB connection.
 *
 * Narrative: 10 riders across 5 cities and all 4 coverage tiers (+1 shift
 * policy), covering every fraud tier (GREEN/YELLOW/ORANGE/RED), Income
 * Bridge in both outcomes (reconciled success, clawback failure), a
 * referral chain, a KYC-in-progress rider, a device/UPI collusion ring,
 * an unconfirmed (awaiting-corroboration) trigger, an expired/historical
 * trigger, an appeal in progress, and a completely fresh empty-state
 * rider — end to end from registration through blockchain logging.
 */
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
const {
  COVERAGE_TIERS, TRIGGER_TYPES, KYC_STATUS, CLAIM_STATUS, PAYMENT_STATUS,
  PAYMENT_CHANNELS, ROLES,
} = require('../src/config/constants');
const { calculatePremiumFallback } = require('../src/services/policy/policyService');
const { estimateDisruptionHours } = require('../src/services/claims/claimsService');
const { getPolicyWeekId, getCurrentPolicyWeekStart, getCurrentPolicyWeekEnd, getAppealDeadline } = require('../src/utils/dateTime');

const DAY = 24 * 60 * 60 * 1000;
const now = () => new Date();
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const hoursAgo = (n) => new Date(Date.now() - n * 60 * 60 * 1000);

// Deterministic ObjectId from a human-readable label — hex-encodes the
// label's raw bytes (guaranteed valid hex, unlike the label itself, which
// may contain non-hex letters) and pads/truncates to exactly 24 chars.
const id = (label) => new ObjectId((Buffer.from(label).toString('hex') + '0'.repeat(24)).slice(0, 24));

// ─── Rider identity anchors ────────────────────────────────
const RIDER_IDS = {
  ravi:      id('r1ravikumar'),
  priya:     id('r2priyashar'),
  amit:      id('r3amitsingh'),
  sunita:    id('r4sunitadev'),
  mohammed:  id('r5mohammedf'),
  deepak:    id('r6deepakyad'),
  kavita:    id('r7kavitared'),
  sanjay:    id('r8sanjaygup'),
  lakshmi:   id('r9lakshmina'),
  rajesh:    id('r10rajeshpa'),
};
const ADMIN_ID = id('adm1gigshield');
const INSURER_ID = id('ins1partnerco');

// Shared device fingerprint used to demonstrate the S14 device-collusion
// fraud signal (Kavita and Sanjay both "use" the same phone).
const COLLUSION_DEVICE_FINGERPRINT = 'sha256:9f2a7c1e4b8d3f6a0c5e2b7d1a4f8c3e6b9d2a5f8c1e4b7a0d3f6c9e2b5a8d1f';

// ═══════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════
const buildUsers = () => [
  // ── 1. Ravi Kumar — the clean happy path: full KYC, BASIC tier,
  //      GREEN auto-approved claim, paid out, blockchain-logged, building
  //      a loyalty streak.
  {
    _id: RIDER_IDS.ravi,
    phone: '9821000001', phoneVerified: true, name: 'Ravi Kumar',
    email: 'ravi.kumar@example.com', role: ROLES.RIDER, isActive: true,
    riderProfile: {
      platform: 'zomato', vehicleType: 'bike', shiftPattern: 'full_day',
      declaredDailyIncome: 600, cityId: 'mumbai', pincode: '400071', zone: 'Kurla',
      isActiveShift: false, avgWeeklyOrders: 145,
    },
    language: 'hi',
    kyc: {
      status: KYC_STATUS.FULL, aadhaarHash: 'hmac:demo:aadhaar:ravi', aadhaarLast4: '4821',
      aadhaarVerifiedAt: daysAgo(60), selfieUrl: 'https://gigshield-kyc.s3.amazonaws.com/selfies/ravi.jpg',
      livenessScore: 94, livenessVerifiedAt: daysAgo(60),
    },
    bankDetails: {
      upiId: 'demo-enc:ravi.kumar@okhdfcbank', verified: true, verifiedAt: daysAgo(59),
      accountHolderName: 'Ravi Kumar',
    },
    devices: [{
      fingerprint: 'sha256:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
      model: 'Redmi Note 12', os: 'Android', osVersion: '13', appVersion: '2.4.1',
      fcmToken: 'demo-fcm-token-ravi', lastSeen: hoursAgo(2),
    }],
    fraudScore: 0, redFlagCount: 0, trustScore: 88,
    riskProfile: { cityId: 'mumbai', incomeBand: 'MEDIUM', incomeBandScore: 0.6, shiftPattern: 'full_day', accountAgeHours: 1460, claimHistoryCount: 1, initialTrustScore: 70, onboardingCompletedAt: daysAgo(60) },
    safeWeekStreak: 3, totalSafeWeeks: 8, loyaltyTier: 'silver', loyaltyDiscount: 0.05,
    walletBalance: 0, referralCode: 'GS-RAVI01', referralCount: 0,
    notificationPrefs: { whatsapp: true, sms: true, push: true, email: false },
    lastLoginAt: hoursAgo(5), lastActiveAt: hoursAgo(2), onboardedAt: daysAgo(60),
  },

  // ── 2. Priya Sharma — STANDARD tier, ORANGE-tier claim, Income Bridge
  //      advance issued then reconciled after successful selfie verification.
  {
    _id: RIDER_IDS.priya,
    phone: '9821000002', phoneVerified: true, name: 'Priya Sharma',
    role: ROLES.RIDER, isActive: true,
    riderProfile: {
      platform: 'swiggy', vehicleType: 'scooter', shiftPattern: 'evening',
      declaredDailyIncome: 550, cityId: 'delhi', pincode: '110019', zone: 'Kalkaji',
      isActiveShift: false, avgWeeklyOrders: 120,
    },
    language: 'hi',
    kyc: {
      status: KYC_STATUS.FULL, aadhaarHash: 'hmac:demo:aadhaar:priya', aadhaarLast4: '7734',
      aadhaarVerifiedAt: daysAgo(45), selfieUrl: 'https://gigshield-kyc.s3.amazonaws.com/selfies/priya.jpg',
      livenessScore: 91, livenessVerifiedAt: daysAgo(45),
    },
    bankDetails: { upiId: 'demo-enc:priya.sharma@okicici', verified: true, verifiedAt: daysAgo(44), accountHolderName: 'Priya Sharma' },
    devices: [{
      fingerprint: 'sha256:2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c',
      model: 'Samsung Galaxy M14', os: 'Android', osVersion: '14', appVersion: '2.4.1',
      fcmToken: 'demo-fcm-token-priya', lastSeen: hoursAgo(1),
    }],
    fraudScore: 0, redFlagCount: 0, trustScore: 75,
    riskProfile: { cityId: 'delhi', incomeBand: 'MEDIUM', incomeBandScore: 0.55, shiftPattern: 'evening', accountAgeHours: 1080, claimHistoryCount: 1, initialTrustScore: 70, onboardingCompletedAt: daysAgo(45) },
    safeWeekStreak: 0, totalSafeWeeks: 5, loyaltyTier: 'none', loyaltyDiscount: 0,
    referralCode: 'GS-PRIYA02',
    notificationPrefs: { whatsapp: true, sms: true, push: true, email: false },
    lastLoginAt: hoursAgo(3), lastActiveAt: hoursAgo(1), onboardedAt: daysAgo(45),
  },

  // ── 3. Amit Singh — PRO tier, RED-tier claim (mock location app
  //      detected), rejected, appeal submitted and pending review.
  {
    _id: RIDER_IDS.amit,
    phone: '9821000003', phoneVerified: true, name: 'Amit Singh',
    role: ROLES.RIDER, isActive: true,
    riderProfile: {
      platform: 'zepto', vehicleType: 'bike', shiftPattern: 'night',
      declaredDailyIncome: 700, cityId: 'chennai', pincode: '600042', zone: 'Velachery',
      isActiveShift: false, avgWeeklyOrders: 98,
    },
    language: 'ta',
    kyc: {
      status: KYC_STATUS.FULL, aadhaarHash: 'hmac:demo:aadhaar:amit', aadhaarLast4: '2290',
      aadhaarVerifiedAt: daysAgo(90), selfieUrl: 'https://gigshield-kyc.s3.amazonaws.com/selfies/amit.jpg',
      livenessScore: 88, livenessVerifiedAt: daysAgo(90),
    },
    bankDetails: { upiId: 'demo-enc:amitsingh@paytm', verified: true, verifiedAt: daysAgo(89), accountHolderName: 'Amit Singh' },
    devices: [{
      fingerprint: 'sha256:3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d',
      model: 'Vivo Y27', os: 'Android', osVersion: '13', appVersion: '2.3.9',
      fcmToken: 'demo-fcm-token-amit', hasMockApps: true, lastSeen: hoursAgo(6),
    }],
    fraudScore: 50, fraudFlags: ['mock_location_app_detected'], redFlagCount: 1, trustScore: 42,
    riskProfile: { cityId: 'chennai', incomeBand: 'HIGH', incomeBandScore: 0.85, shiftPattern: 'night', accountAgeHours: 2200, claimHistoryCount: 1, initialTrustScore: 70, onboardingCompletedAt: daysAgo(90) },
    safeWeekStreak: 0, totalSafeWeeks: 2, loyaltyTier: 'none', loyaltyDiscount: 0,
    referralCode: 'GS-AMIT003',
    notificationPrefs: { whatsapp: true, sms: true, push: false, email: false },
    lastLoginAt: hoursAgo(10), lastActiveAt: hoursAgo(6), onboardedAt: daysAgo(90),
  },

  // ── 4. Sunita Devi — ELITE tier, YELLOW soft-approved claim, gold
  //      loyalty tier with a long streak, referred Mohammed.
  {
    _id: RIDER_IDS.sunita,
    phone: '9821000004', phoneVerified: true, name: 'Sunita Devi',
    role: ROLES.RIDER, isActive: true,
    riderProfile: {
      platform: 'blinkit', vehicleType: 'scooter', shiftPattern: 'morning',
      declaredDailyIncome: 950, cityId: 'bengaluru', pincode: '560068', zone: 'HSR Layout',
      isActiveShift: false, avgWeeklyOrders: 160,
    },
    language: 'kn',
    kyc: {
      status: KYC_STATUS.FULL, aadhaarHash: 'hmac:demo:aadhaar:sunita', aadhaarLast4: '5567',
      aadhaarVerifiedAt: daysAgo(200), selfieUrl: 'https://gigshield-kyc.s3.amazonaws.com/selfies/sunita.jpg',
      livenessScore: 96, livenessVerifiedAt: daysAgo(200),
    },
    bankDetails: { upiId: 'demo-enc:sunitadevi@oksbi', verified: true, verifiedAt: daysAgo(199), accountHolderName: 'Sunita Devi' },
    devices: [{
      fingerprint: 'sha256:4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e',
      model: 'OnePlus Nord CE3', os: 'Android', osVersion: '14', appVersion: '2.4.1',
      fcmToken: 'demo-fcm-token-sunita', lastSeen: hoursAgo(1),
    }],
    fraudScore: 0, redFlagCount: 0, trustScore: 92,
    riskProfile: { cityId: 'bengaluru', incomeBand: 'HIGH', incomeBandScore: 0.9, shiftPattern: 'morning', accountAgeHours: 4800, claimHistoryCount: 1, initialTrustScore: 70, onboardingCompletedAt: daysAgo(200) },
    safeWeekStreak: 11, totalSafeWeeks: 26, loyaltyTier: 'gold', loyaltyDiscount: 0.15,
    walletBalance: 120, referralCode: 'GS-SUNITA4', referralCount: 1,
    notificationPrefs: { whatsapp: true, sms: true, push: true, email: true },
    lastLoginAt: hoursAgo(4), lastActiveAt: hoursAgo(1), onboardedAt: daysAgo(200),
  },

  // ── 5. Mohammed Farhan — referred by Sunita, brand new, KYC in
  //      progress (Aadhaar done, bank not yet), no policy/claims yet.
  {
    _id: RIDER_IDS.mohammed,
    phone: '9821000005', phoneVerified: true, name: 'Mohammed Farhan',
    role: ROLES.RIDER, isActive: true,
    riderProfile: {
      platform: 'blinkit', vehicleType: 'bicycle', shiftPattern: 'afternoon',
      declaredDailyIncome: 350, cityId: 'bengaluru', pincode: '560068', zone: 'HSR Layout',
      isActiveShift: false, avgWeeklyOrders: 40,
    },
    language: 'kn',
    kyc: {
      status: KYC_STATUS.AADHAAR_VERIFIED, aadhaarHash: 'hmac:demo:aadhaar:mohammed', aadhaarLast4: '9012',
      aadhaarVerifiedAt: daysAgo(2),
    },
    devices: [{
      fingerprint: 'sha256:5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f',
      model: 'Realme Narzo 60', os: 'Android', osVersion: '13', appVersion: '2.4.1',
      fcmToken: 'demo-fcm-token-mohammed', lastSeen: hoursAgo(3),
    }],
    fraudScore: 0, redFlagCount: 0, trustScore: 70,
    riskProfile: { cityId: 'bengaluru', incomeBand: 'LOW', incomeBandScore: 0.3, shiftPattern: 'afternoon', accountAgeHours: 48, claimHistoryCount: 0, initialTrustScore: 70, onboardingCompletedAt: daysAgo(2) },
    referredBy: RIDER_IDS.sunita, referralCode: 'GS-MOHAM05',
    notificationPrefs: { whatsapp: true, sms: true, push: true, email: false },
    lastLoginAt: hoursAgo(3), lastActiveAt: hoursAgo(3), onboardedAt: daysAgo(2),
  },

  // ── 6. Deepak Yadav — Micro-Shift Insurance user, shift currently active.
  {
    _id: RIDER_IDS.deepak,
    phone: '9821000006', phoneVerified: true, name: 'Deepak Yadav',
    role: ROLES.RIDER, isActive: true,
    riderProfile: {
      platform: 'amazon', vehicleType: 'bike', shiftPattern: 'split',
      customShiftStart: 8, customShiftEnd: 14,
      declaredDailyIncome: 500, cityId: 'pune', pincode: '411045', zone: 'Hinjewadi',
      isActiveShift: true, lastOrderTime: hoursAgo(1), avgWeeklyOrders: 85,
    },
    language: 'mr',
    kyc: {
      status: KYC_STATUS.FULL, aadhaarHash: 'hmac:demo:aadhaar:deepak', aadhaarLast4: '3345',
      aadhaarVerifiedAt: daysAgo(30), selfieUrl: 'https://gigshield-kyc.s3.amazonaws.com/selfies/deepak.jpg',
      livenessScore: 90, livenessVerifiedAt: daysAgo(30),
    },
    bankDetails: { upiId: 'demo-enc:deepak.yadav@okaxis', verified: true, verifiedAt: daysAgo(29), accountHolderName: 'Deepak Yadav' },
    devices: [{
      fingerprint: 'sha256:6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a',
      model: 'Poco X6', os: 'Android', osVersion: '14', appVersion: '2.4.1',
      fcmToken: 'demo-fcm-token-deepak', lastSeen: hoursAgo(1),
    }],
    fraudScore: 0, redFlagCount: 0, trustScore: 74,
    riskProfile: { cityId: 'pune', incomeBand: 'MEDIUM', incomeBandScore: 0.5, shiftPattern: 'split', accountAgeHours: 720, claimHistoryCount: 0, initialTrustScore: 70, onboardingCompletedAt: daysAgo(30) },
    referralCode: 'GS-DEEPAK6',
    notificationPrefs: { whatsapp: true, sms: true, push: true, email: false },
    lastLoginAt: hoursAgo(1), lastActiveAt: hoursAgo(1), onboardedAt: daysAgo(30),
  },

  // ── 7 & 8. Kavita Reddy + Sanjay Gupta — device & UPI collusion ring.
  //      Same device fingerprint AND same UPI ID. Both RED-tier, rejected.
  {
    _id: RIDER_IDS.kavita,
    phone: '9821000007', phoneVerified: true, name: 'Kavita Reddy',
    role: ROLES.RIDER, isActive: true,
    riderProfile: {
      platform: 'swiggy', vehicleType: 'bike', shiftPattern: 'full_day',
      declaredDailyIncome: 500, cityId: 'mumbai', pincode: '400070', zone: 'Chembur',
      isActiveShift: false, avgWeeklyOrders: 70,
    },
    kyc: {
      status: KYC_STATUS.FULL, aadhaarHash: 'hmac:demo:aadhaar:kavita', aadhaarLast4: '1123',
      aadhaarVerifiedAt: daysAgo(10),
    },
    bankDetails: { upiId: 'demo-enc:shared.collusion@okhdfc', verified: true, verifiedAt: daysAgo(9), accountHolderName: 'K Reddy' },
    devices: [{ fingerprint: COLLUSION_DEVICE_FINGERPRINT, model: 'Redmi 12C', os: 'Android', osVersion: '13', appVersion: '2.4.0', lastSeen: hoursAgo(8) }],
    fraudScore: 50, fraudFlags: ['device_shared_by_1_other_account'], redFlagCount: 1, trustScore: 12,
    riskProfile: { cityId: 'mumbai', incomeBand: 'MEDIUM', incomeBandScore: 0.5, shiftPattern: 'full_day', accountAgeHours: 240, claimHistoryCount: 1, initialTrustScore: 70, onboardingCompletedAt: daysAgo(10) },
    referralCode: 'GS-KAVITA7',
    notificationPrefs: { whatsapp: true, sms: true, push: true, email: false },
    lastLoginAt: hoursAgo(9), lastActiveAt: hoursAgo(8), onboardedAt: daysAgo(10),
  },
  {
    _id: RIDER_IDS.sanjay,
    phone: '9821000008', phoneVerified: true, name: 'Sanjay Gupta',
    role: ROLES.RIDER, isActive: true,
    riderProfile: {
      platform: 'zomato', vehicleType: 'scooter', shiftPattern: 'full_day',
      declaredDailyIncome: 500, cityId: 'mumbai', pincode: '400070', zone: 'Chembur',
      isActiveShift: false, avgWeeklyOrders: 65,
    },
    kyc: {
      status: KYC_STATUS.FULL, aadhaarHash: 'hmac:demo:aadhaar:sanjay', aadhaarLast4: '8890',
      aadhaarVerifiedAt: daysAgo(9),
    },
    bankDetails: { upiId: 'demo-enc:shared.collusion@okhdfc', verified: true, verifiedAt: daysAgo(8), accountHolderName: 'S Gupta' },
    devices: [{ fingerprint: COLLUSION_DEVICE_FINGERPRINT, model: 'Redmi 12C', os: 'Android', osVersion: '13', appVersion: '2.4.0', lastSeen: hoursAgo(8) }],
    fraudScore: 50, fraudFlags: ['device_shared_by_1_other_account'], redFlagCount: 1, trustScore: 12,
    riskProfile: { cityId: 'mumbai', incomeBand: 'MEDIUM', incomeBandScore: 0.5, shiftPattern: 'full_day', accountAgeHours: 216, claimHistoryCount: 1, initialTrustScore: 70, onboardingCompletedAt: daysAgo(9) },
    isUnderReview: true,
    referralCode: 'GS-SANJAY8',
    notificationPrefs: { whatsapp: true, sms: true, push: true, email: false },
    lastLoginAt: hoursAgo(9), lastActiveAt: hoursAgo(8), onboardedAt: daysAgo(9),
  },

  // ── 9. Lakshmi Nair — hold_quick_verify claim that TIMED OUT (no selfie
  //      submitted in the 2hr window). Income Bridge advance had already
  //      gone out — converted to a clawback debt.
  {
    _id: RIDER_IDS.lakshmi,
    phone: '9821000009', phoneVerified: true, name: 'Lakshmi Nair',
    role: ROLES.RIDER, isActive: true,
    riderProfile: {
      platform: 'flipkart', vehicleType: 'bike', shiftPattern: 'evening',
      declaredDailyIncome: 650, cityId: 'delhi', pincode: '110024', zone: 'Lajpat Nagar',
      isActiveShift: false, avgWeeklyOrders: 110,
    },
    kyc: {
      status: KYC_STATUS.FULL, aadhaarHash: 'hmac:demo:aadhaar:lakshmi', aadhaarLast4: '6678',
      aadhaarVerifiedAt: daysAgo(70), selfieUrl: 'https://gigshield-kyc.s3.amazonaws.com/selfies/lakshmi.jpg',
      livenessScore: 89, livenessVerifiedAt: daysAgo(70),
    },
    bankDetails: { upiId: 'demo-enc:lakshmi.nair@oksbi', verified: true, verifiedAt: daysAgo(69), accountHolderName: 'Lakshmi Nair' },
    devices: [{
      fingerprint: 'sha256:7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b',
      model: 'iPhone 13', os: 'iOS', osVersion: '17.4', appVersion: '2.4.1',
      fcmToken: 'demo-fcm-token-lakshmi', lastSeen: hoursAgo(20),
    }],
    fraudScore: 0, redFlagCount: 0, trustScore: 55,
    riskProfile: { cityId: 'delhi', incomeBand: 'MEDIUM', incomeBandScore: 0.6, shiftPattern: 'evening', accountAgeHours: 1700, claimHistoryCount: 1, initialTrustScore: 70, onboardingCompletedAt: daysAgo(70) },
    outstandingAdvanceInr: 188, // full Income Bridge advance, never reconciled — see Lakshmi's claim
    safeWeekStreak: 0, totalSafeWeeks: 6, loyaltyTier: 'none',
    referralCode: 'GS-LAKSH09',
    notificationPrefs: { whatsapp: true, sms: true, push: true, email: false },
    lastLoginAt: hoursAgo(21), lastActiveAt: hoursAgo(20), onboardedAt: daysAgo(70),
  },

  // ── 10. Rajesh Patel — brand new, just purchased first policy, zero
  //       claims yet. The "empty state" demo rider.
  {
    _id: RIDER_IDS.rajesh,
    phone: '9821000010', phoneVerified: true, name: 'Rajesh Patel',
    role: ROLES.RIDER, isActive: true,
    riderProfile: {
      platform: 'dunzo', vehicleType: 'auto', shiftPattern: 'full_day',
      declaredDailyIncome: 450, cityId: 'chennai', pincode: '600020', zone: 'Adyar',
      isActiveShift: false, avgWeeklyOrders: 0,
    },
    kyc: { status: KYC_STATUS.PHONE_VERIFIED },
    devices: [{
      fingerprint: 'sha256:8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c',
      model: 'Samsung Galaxy A15', os: 'Android', osVersion: '14', appVersion: '2.4.1',
      fcmToken: 'demo-fcm-token-rajesh', lastSeen: hoursAgo(0.5),
    }],
    fraudScore: 0, redFlagCount: 0, trustScore: 70,
    riskProfile: { cityId: 'chennai', incomeBand: 'LOW', incomeBandScore: 0.35, shiftPattern: 'full_day', accountAgeHours: 4, claimHistoryCount: 0, initialTrustScore: 70, onboardingCompletedAt: hoursAgo(4) },
    referralCode: 'GS-RAJESH0',
    notificationPrefs: { whatsapp: true, sms: true, push: true, email: false },
    lastLoginAt: hoursAgo(0.5), lastActiveAt: hoursAgo(0.5), onboardedAt: hoursAgo(4),
  },

  // ── Admin & Insurer ──────────────────────────────────────
  {
    _id: ADMIN_ID, phone: '9800000001', phoneVerified: true, name: 'GigShield Ops',
    email: 'ops@gigshield.demo', role: ROLES.ADMIN, isActive: true,
    kyc: { status: KYC_STATUS.FULL }, referralCode: 'GS-ADMIN01',
    notificationPrefs: { whatsapp: false, sms: false, push: true, email: true },
    onboardedAt: daysAgo(365),
  },
  {
    _id: INSURER_ID, phone: '9800000002', phoneVerified: true, name: 'GigShield Insurance Partner',
    email: 'partner@gigshield.demo', role: ROLES.INSURER, isActive: true,
    kyc: { status: KYC_STATUS.FULL }, referralCode: 'GS-INSUR01',
    notificationPrefs: { whatsapp: false, sms: false, push: false, email: true },
    onboardedAt: daysAgo(365),
  },
];

// ═══════════════════════════════════════════════════════════
// TRIGGER EVENTS
// ═══════════════════════════════════════════════════════════
const EVENT_IDS = {
  mumbaiRain:    id('evt1mumbairain'),
  delhiAqi:      id('evt2delhiaqi'),
  chennaiCyclone:id('evt3chennaicyc'),
  bengaluruHeat: id('evt4bengaluru'),
  mumbaiRain2:   id('evt5mumbairain2'),
  puneCurfew:    id('evt6punecurfew'),
};

const buildTriggerEvents = () => [
  // ── EVT1: HEAVY_RAIN in Mumbai — high confidence (corroborated by
  //      season), confirmed, auto-detected by the polling cycle. Backs
  //      Ravi's GREEN auto-approved claim.
  {
    _id: EVENT_IDS.mumbaiRain, eventId: 'EVT-DEMO-MUMRAIN1',
    triggerType: 'HEAVY_RAIN', cityId: 'mumbai', centerLat: 19.0760, centerLon: 72.8777, radiusKm: 25,
    triggerValue: 68, triggerUnit: 'mm/6hr', threshold: 50, severity: 'full',
    payoutPercent: TRIGGER_TYPES.HEAVY_RAIN.payout_percent, confidence: 88,
    primarySource: { source: 'openweathermap', value: 68, unit: 'mm/6hr', fetchedAt: daysAgo(2) },
    isVerified: true, verifiedAt: daysAgo(2),
    status: 'confirmed', detectedAt: daysAgo(2), confirmedAt: daysAgo(2),
    affectedPoliciesCount: 3, claimsInitiated: 1, claimsApproved: 1, totalPayoutInr: 100,
    blockchainTxHash: '0x' + 'a1'.repeat(32), onChainNetwork: 'mock', loggedOnChain: true,
    pollingCycleId: 'cycle-demo-1',
  },

  // ── EVT2: AQI_SPIKE in Delhi — high confidence, confirmed. Backs both
  //      Priya's ORANGE (Income Bridge success) and Lakshmi's ORANGE
  //      (Income Bridge clawback) claims.
  {
    _id: EVENT_IDS.delhiAqi, eventId: 'EVT-DEMO-DELAQI01',
    triggerType: 'AQI_SPIKE', cityId: 'delhi', centerLat: 28.7041, centerLon: 77.1025, radiusKm: 25,
    triggerValue: 462, triggerUnit: 'AQI', threshold: 400, severity: 'full',
    payoutPercent: TRIGGER_TYPES.AQI_SPIKE.payout_percent, confidence: 91,
    primarySource: { source: 'aqicn', value: 462, unit: 'AQI', fetchedAt: daysAgo(1) },
    isVerified: true, verifiedAt: daysAgo(1),
    status: 'confirmed', detectedAt: daysAgo(1), confirmedAt: daysAgo(1),
    affectedPoliciesCount: 2, claimsInitiated: 2, claimsApproved: 1, totalPayoutInr: 451, // 263 Priya (reconciled) + 188 Lakshmi (advance-only, later clawed back)
    blockchainTxHash: '0x' + 'b2'.repeat(32), onChainNetwork: 'mock', loggedOnChain: true,
    pollingCycleId: 'cycle-demo-2',
  },

  // ── EVT3: CYCLONE in Chennai — built from wind-speed data (Phase 1),
  //      high confidence, confirmed. Backs Amit's RED rejected claim.
  {
    _id: EVENT_IDS.chennaiCyclone, eventId: 'EVT-DEMO-CHECYC01',
    triggerType: 'CYCLONE', cityId: 'chennai', centerLat: 13.0827, centerLon: 80.2707, radiusKm: 25,
    triggerValue: 71, triggerUnit: 'km/h wind', threshold: 40, severity: 'full',
    payoutPercent: TRIGGER_TYPES.CYCLONE.imd_orange_percent, confidence: 79,
    primarySource: { source: 'openweathermap', value: 71, unit: 'km/h wind', fetchedAt: daysAgo(3) },
    isVerified: true, verifiedAt: daysAgo(3),
    status: 'confirmed', detectedAt: daysAgo(3), confirmedAt: daysAgo(3),
    affectedPoliciesCount: 1, claimsInitiated: 1, claimsApproved: 0,
    pollingCycleId: 'cycle-demo-3',
  },

  // ── EVT4: EXTREME_HEAT in Bengaluru — historical/resolved (status
  //      'expired'), demonstrating a fully closed-out lifecycle. Backs
  //      Sunita's YELLOW soft-approved claim.
  {
    _id: EVENT_IDS.bengaluruHeat, eventId: 'EVT-DEMO-BLRHEAT1',
    triggerType: 'EXTREME_HEAT', cityId: 'bengaluru', centerLat: 12.9716, centerLon: 77.5946, radiusKm: 25,
    triggerValue: 44.2, triggerUnit: '°C (feels like)', threshold: 42, severity: 'full',
    payoutPercent: TRIGGER_TYPES.EXTREME_HEAT.payout_percent, confidence: 75,
    primarySource: { source: 'openweathermap', value: 44.2, unit: '°C (feels like)', fetchedAt: daysAgo(6) },
    isVerified: true, verifiedAt: daysAgo(6),
    status: 'expired', detectedAt: daysAgo(6), confirmedAt: daysAgo(6),
    expiredAt: daysAgo(5), durationHours: 5,
    affectedPoliciesCount: 1, claimsInitiated: 1, claimsApproved: 1, totalPayoutInr: 350,
    blockchainTxHash: '0x' + 'c3'.repeat(32), onChainNetwork: 'mock', loggedOnChain: true,
    pollingCycleId: 'cycle-demo-4',
  },

  // ── EVT5: HEAVY_RAIN in Mumbai (separate day/event from EVT1) — backs
  //      the Kavita/Sanjay collusion-ring RED claims, both rejected.
  {
    _id: EVENT_IDS.mumbaiRain2, eventId: 'EVT-DEMO-MUMRAIN2',
    triggerType: 'HEAVY_RAIN', cityId: 'mumbai', centerLat: 19.0760, centerLon: 72.8777, radiusKm: 25,
    triggerValue: 55, triggerUnit: 'mm/6hr', threshold: 50, severity: 'full',
    payoutPercent: TRIGGER_TYPES.HEAVY_RAIN.payout_percent, confidence: 82,
    primarySource: { source: 'openweathermap', value: 55, unit: 'mm/6hr', fetchedAt: hoursAgo(20) },
    isVerified: true, verifiedAt: hoursAgo(20),
    status: 'confirmed', detectedAt: hoursAgo(20), confirmedAt: hoursAgo(20),
    affectedPoliciesCount: 2, claimsInitiated: 2, claimsApproved: 0,
    claimBurstDetected: true, burstCount: 2, burstWindowMinutes: 4,
    pollingCycleId: 'cycle-demo-5',
  },

  // ── EVT6: CURFEW in Pune — manual-injection-only type (doc §4 "Manual
  //      Override" — no free live data source exists for curfews).
  //      Only 1 of the 2 sources CURFEW's own config requires has reported
  //      it so far, so this sits at 'detected' with medium confidence,
  //      genuinely awaiting corroboration rather than auto-proceeding —
  //      demonstrating the Phase 1 confidence-gating behavior directly.
  //      No claims yet — that's the point of this one.
  {
    _id: EVENT_IDS.puneCurfew, eventId: 'EVT-DEMO-PUNCURF1',
    triggerType: 'CURFEW', cityId: 'pune', centerLat: 18.5204, centerLon: 73.8567, radiusKm: 25,
    affectedPincodes: ['411045', '411057'],
    triggerValue: 1, triggerUnit: 'event', threshold: 1, severity: 'full',
    payoutPercent: TRIGGER_TYPES.CURFEW.payout_percent, confidence: 50,
    primarySource: { source: 'manual_injection', value: 1, fetchedAt: hoursAgo(1) },
    isVerified: false,
    status: 'detected', detectedAt: hoursAgo(1),
    notes: 'sources: ops_manual (awaiting 1 more corroborating source per CURFEW.min_sources_to_confirm)',
  },
];

// ═══════════════════════════════════════════════════════════
// POLICIES
// ═══════════════════════════════════════════════════════════
// tierDetails mapping matches policyService.js's real createPolicy exactly
// (COVERAGE_TIERS' snake_case fields -> the schema's camelCase fields).
const mapTierDetails = (tier) => {
  const c = COVERAGE_TIERS[tier];
  return {
    dailyCoverageInr: c.daily_coverage_inr,
    weeklyMaxInr: c.weekly_max_inr,
    triggers: c.triggers,
    payoutChannels: c.payout_channel,
    priorityProcessing: c.priority_processing || false,
  };
};

// Real premium calculation (Phase 0's fallback formula — genuinely
// personalized by city/shift/income, not a placeholder), with loyalty
// discount applied the same way getPremiumQuote/createPolicy do.
const buildPremium = (cityId, tier, platform, income, shift, loyaltyDiscount = 0, date = now()) => {
  const p = calculatePremiumFallback(cityId, tier, platform, income, shift, date);
  p.loyaltyDiscount = loyaltyDiscount;
  p.finalPremium = Math.round(p.finalPremium * (1 - loyaltyDiscount));
  return p;
};

const POLICY_IDS = {
  ravi: id('pol1ravikumar'), priya: id('pol2priyashar'), amit: id('pol3amitsingh'),
  sunita: id('pol4sunitadev'), mohammed: id('pol5mohammedf'), deepak: id('pol6deepakshift'),
  kavita: id('pol7kavitared'), sanjay: id('pol8sanjaygup'), lakshmi: id('pol9lakshmina'),
  rajesh: id('pol10rajeshpa'),
};

const weekId = getPolicyWeekId();
const weekStart = getCurrentPolicyWeekStart().toDate();
const weekEnd = getCurrentPolicyWeekEnd().toDate();

const buildPolicies = () => [
  {
    _id: POLICY_IDS.ravi, riderId: RIDER_IDS.ravi, policyNumber: 'GS-DEMO-RAVI001',
    tier: 'BASIC', policyType: 'WEEKLY', tierDetails: mapTierDetails('BASIC'),
    weekId, startDate: weekStart, endDate: weekEnd, isAutoRenew: true,
    cityId: 'mumbai', zone: 'Kurla', pincode: '400071',
    premiumBreakdown: buildPremium('mumbai', 'BASIC', 'zomato', 600, 'full_day', 0.05),
    premiumAmountInr: 0, // set below after premiumBreakdown computed
    paymentStatus: PAYMENT_STATUS.COMPLETED, paidAt: daysAgo(3),
    status: 'active', claimsCount: 1, totalPayoutInr: 100, lastClaimAt: daysAgo(2),
    loyaltyPoolContributed: true, loyaltyPoolAmountInr: 0,
    blockchainTxHash: '0x' + 'p1'.repeat(32),
  },
  {
    _id: POLICY_IDS.priya, riderId: RIDER_IDS.priya, policyNumber: 'GS-DEMO-PRIYA002',
    tier: 'STANDARD', policyType: 'WEEKLY', tierDetails: mapTierDetails('STANDARD'),
    weekId, startDate: weekStart, endDate: weekEnd, isAutoRenew: false,
    cityId: 'delhi', zone: 'Kalkaji', pincode: '110019',
    premiumBreakdown: buildPremium('delhi', 'STANDARD', 'swiggy', 550, 'evening', 0),
    premiumAmountInr: 0,
    paymentStatus: PAYMENT_STATUS.COMPLETED, paidAt: daysAgo(4),
    status: 'active', claimsCount: 1, totalPayoutInr: 263, lastClaimAt: daysAgo(1),
    loyaltyPoolContributed: true, loyaltyPoolAmountInr: 0,
    blockchainTxHash: '0x' + 'p2'.repeat(32),
  },
  {
    _id: POLICY_IDS.amit, riderId: RIDER_IDS.amit, policyNumber: 'GS-DEMO-AMIT0003',
    tier: 'PRO', policyType: 'WEEKLY', tierDetails: mapTierDetails('PRO'),
    weekId, startDate: weekStart, endDate: weekEnd, isAutoRenew: true,
    cityId: 'chennai', zone: 'Velachery', pincode: '600042',
    premiumBreakdown: buildPremium('chennai', 'PRO', 'zepto', 700, 'night', 0),
    premiumAmountInr: 0,
    paymentStatus: PAYMENT_STATUS.COMPLETED, paidAt: daysAgo(5),
    status: 'active', claimsCount: 1, totalPayoutInr: 0, lastClaimAt: daysAgo(3),
    blockchainTxHash: '0x' + 'p3'.repeat(32),
  },
  {
    _id: POLICY_IDS.sunita, riderId: RIDER_IDS.sunita, policyNumber: 'GS-DEMO-SUNITA04',
    tier: 'ELITE', policyType: 'WEEKLY', tierDetails: mapTierDetails('ELITE'),
    weekId, startDate: weekStart, endDate: weekEnd, isAutoRenew: true,
    cityId: 'bengaluru', zone: 'HSR Layout', pincode: '560068',
    premiumBreakdown: buildPremium('bengaluru', 'ELITE', 'blinkit', 950, 'morning', 0.15),
    premiumAmountInr: 0,
    paymentStatus: PAYMENT_STATUS.COMPLETED, paidAt: daysAgo(6),
    status: 'active', claimsCount: 1, totalPayoutInr: 350, lastClaimAt: daysAgo(6),
    loyaltyPoolContributed: true, loyaltyPoolAmountInr: 0,
    blockchainTxHash: '0x' + 'p4'.repeat(32),
  },
  {
    _id: POLICY_IDS.mohammed, riderId: RIDER_IDS.mohammed, policyNumber: 'GS-DEMO-MOHAM005',
    tier: 'BASIC', policyType: 'WEEKLY', tierDetails: mapTierDetails('BASIC'),
    weekId, startDate: weekStart, endDate: weekEnd, isAutoRenew: false,
    cityId: 'bengaluru', zone: 'HSR Layout', pincode: '560068',
    premiumBreakdown: buildPremium('bengaluru', 'BASIC', 'blinkit', 350, 'afternoon', 0),
    premiumAmountInr: 0,
    paymentStatus: PAYMENT_STATUS.COMPLETED, paidAt: daysAgo(2),
    status: 'active', claimsCount: 0, totalPayoutInr: 0,
  },
  {
    _id: POLICY_IDS.deepak, riderId: RIDER_IDS.deepak, policyNumber: 'GS-DEMO-DEEPAK06',
    tier: 'STANDARD', policyType: 'SHIFT', tierDetails: mapTierDetails('STANDARD'),
    weekId, startDate: hoursAgo(2), endDate: hoursAgo(-4), isAutoRenew: false,
    cityId: 'pune', zone: 'Hinjewadi', pincode: '411045',
    premiumBreakdown: buildPremium('pune', 'STANDARD', 'amazon', 500, 'split', 0),
    premiumAmountInr: 0,
    paymentStatus: PAYMENT_STATUS.COMPLETED, paidAt: hoursAgo(2),
    status: 'active', claimsCount: 0, totalPayoutInr: 0,
  },
  {
    _id: POLICY_IDS.kavita, riderId: RIDER_IDS.kavita, policyNumber: 'GS-DEMO-KAVITA07',
    tier: 'STANDARD', policyType: 'WEEKLY', tierDetails: mapTierDetails('STANDARD'),
    weekId, startDate: weekStart, endDate: weekEnd, isAutoRenew: false,
    cityId: 'mumbai', zone: 'Chembur', pincode: '400070',
    premiumBreakdown: buildPremium('mumbai', 'STANDARD', 'swiggy', 500, 'full_day', 0),
    premiumAmountInr: 0,
    paymentStatus: PAYMENT_STATUS.COMPLETED, paidAt: daysAgo(9),
    status: 'active', claimsCount: 1, totalPayoutInr: 0, lastClaimAt: hoursAgo(20),
  },
  {
    _id: POLICY_IDS.sanjay, riderId: RIDER_IDS.sanjay, policyNumber: 'GS-DEMO-SANJAY08',
    tier: 'STANDARD', policyType: 'WEEKLY', tierDetails: mapTierDetails('STANDARD'),
    weekId, startDate: weekStart, endDate: weekEnd, isAutoRenew: false,
    cityId: 'mumbai', zone: 'Chembur', pincode: '400070',
    premiumBreakdown: buildPremium('mumbai', 'STANDARD', 'zomato', 500, 'full_day', 0),
    premiumAmountInr: 0,
    paymentStatus: PAYMENT_STATUS.COMPLETED, paidAt: daysAgo(8),
    status: 'active', claimsCount: 1, totalPayoutInr: 0, lastClaimAt: hoursAgo(20),
  },
  {
    _id: POLICY_IDS.lakshmi, riderId: RIDER_IDS.lakshmi, policyNumber: 'GS-DEMO-LAKSH009',
    tier: 'PRO', policyType: 'WEEKLY', tierDetails: mapTierDetails('PRO'),
    weekId, startDate: weekStart, endDate: weekEnd, isAutoRenew: false,
    cityId: 'delhi', zone: 'Lajpat Nagar', pincode: '110024',
    premiumBreakdown: buildPremium('delhi', 'PRO', 'flipkart', 650, 'evening', 0),
    premiumAmountInr: 0,
    paymentStatus: PAYMENT_STATUS.COMPLETED, paidAt: daysAgo(1),
    status: 'active', claimsCount: 1, totalPayoutInr: 188, lastClaimAt: hoursAgo(23), // advance-only — claim rejected before reconciliation
  },
  {
    _id: POLICY_IDS.rajesh, riderId: RIDER_IDS.rajesh, policyNumber: 'GS-DEMO-RAJESH10',
    tier: 'BASIC', policyType: 'WEEKLY', tierDetails: mapTierDetails('BASIC'),
    weekId, startDate: weekStart, endDate: weekEnd, isAutoRenew: false,
    cityId: 'chennai', zone: 'Adyar', pincode: '600020',
    premiumBreakdown: buildPremium('chennai', 'BASIC', 'dunzo', 450, 'full_day', 0),
    premiumAmountInr: 0,
    paymentStatus: PAYMENT_STATUS.COMPLETED, paidAt: hoursAgo(3),
    status: 'active', claimsCount: 0, totalPayoutInr: 0,
  },
].map((p) => ({ ...p, premiumAmountInr: p.premiumBreakdown.finalPremium })); // finalize amount from the computed breakdown

// ═══════════════════════════════════════════════════════════
// CLAIMS
// ═══════════════════════════════════════════════════════════
const CLAIM_IDS = {
  ravi: id('clm1ravikumar'), priya: id('clm2priyashar'), amit: id('clm3amitsingh'),
  sunita: id('clm4sunitadev'), kavita: id('clm5kavitared'), sanjay: id('clm6sanjaygup'),
  lakshmi: id('clm7lakshmina'),
};

const buildClaims = () => [
  // ── Ravi — GREEN tier, auto-approved, paid in full, blockchain-logged.
  {
    _id: CLAIM_IDS.ravi, claimId: 'CLM-DEMO-RAVI0001',
    riderId: RIDER_IDS.ravi, policyId: POLICY_IDS.ravi, eventId: EVENT_IDS.mumbaiRain,
    triggerType: 'HEAVY_RAIN', triggerValue: 68, cityId: 'mumbai',
    dailyCoverageInr: 200, weeklyMaxInr: 800,
    disruptionHours: estimateDisruptionHours('HEAVY_RAIN', 'full'), disruptionFraction: 0.5,
    basePayoutInr: 100, finalPayoutInr: 100,
    riderLat: 19.078, riderLon: 72.879,
    riderCellTower: { mcc: 404, mnc: 45, cellId: 118231, lat: 19.077, lon: 72.878 },
    accelerometerData: { variance: 0.14, isFlat: false, readings: 42 },
    platformWasActive: true, hadOrderPings: true,
    fraudCheck: {
      score: 87, tier: 'GREEN', action: 'auto_approve',
      signals: { gpsInZone: 10, cellTowerMatch: 15, physicsConsistency: 20, platformActivity: 15, accountAge: 15, policyMaturity: 10, weatherCorrelation: 10 },
      reasons: ['clean_history', 'inside_trigger_radius', 'natural_motion_detected'],
      mlModelVersion: 'v1', checkedAt: daysAgo(2), rainAdaptive: true,
    },
    mlFraudScore: 87,
    status: CLAIM_STATUS.PAYOUT_COMPLETED,
    statusHistory: [
      { status: 'detected', timestamp: daysAgo(2) },
      { status: 'fraud_screening', timestamp: daysAgo(2) },
      { status: 'approved', timestamp: daysAgo(2) },
      { status: 'payout_initiated', timestamp: daysAgo(2) },
      { status: 'payout_completed', timestamp: daysAgo(2) },
    ],
    blockchainTxHash: '0x' + 'e1'.repeat(32), onChainNetwork: 'mock', loggedOnChain: true,
    detectedAt: daysAgo(2), fraudCheckedAt: daysAgo(2), approvedAt: daysAgo(2),
    payoutInitiatedAt: daysAgo(2), payoutCompletedAt: daysAgo(2), totalProcessingMs: 47000,
  },

  // ── Priya — ORANGE tier. Income Bridge advance (₹132) issued instantly
  //      (trigger confidence 91 ≥ 85), then selfie verified successfully
  //      and the ₹131 remainder paid out — advanceStatus 'reconciled'.
  {
    _id: CLAIM_IDS.priya, claimId: 'CLM-DEMO-PRIYA002',
    riderId: RIDER_IDS.priya, policyId: POLICY_IDS.priya, eventId: EVENT_IDS.delhiAqi,
    triggerType: 'AQI_SPIKE', triggerValue: 462, cityId: 'delhi',
    dailyCoverageInr: 350, weeklyMaxInr: 1400,
    disruptionHours: estimateDisruptionHours('AQI_SPIKE', 'full'), disruptionFraction: 0.75,
    basePayoutInr: 263, finalPayoutInr: 263,
    advanceInr: 132, advanceStatus: 'reconciled', advanceIssuedAt: daysAgo(1),
    riderLat: 28.706, riderLon: 77.101,
    riderCellTower: { mcc: 404, mnc: 10, cellId: 224019, lat: 28.705, lon: 77.100 },
    accelerometerData: { variance: 0.09, isFlat: false, readings: 30 },
    platformWasActive: true, hadOrderPings: false,
    selfieUrl: 'https://gigshield-claims.s3.amazonaws.com/selfies/priya-clm2.jpg',
    selfieHasRain: false, selfieVerifiedAt: hoursAgo(20),
    fraudCheck: {
      score: 35, tier: 'ORANGE', action: 'hold_quick_verify',
      signals: { gpsInZone: 10, cellTowerMatch: 15, physicsConsistency: 5, platformActivity: -10, accountAge: 15, policyMaturity: 10, weatherCorrelation: 10 },
      reasons: ['no_order_pings_during_window', 'inside_trigger_radius'],
      mlModelVersion: 'v1', checkedAt: daysAgo(1),
    },
    mlFraudScore: 35,
    status: CLAIM_STATUS.PAYOUT_COMPLETED,
    statusHistory: [
      { status: 'detected', timestamp: daysAgo(1) },
      { status: 'fraud_screening', timestamp: daysAgo(1) },
      { status: 'pending_verification', timestamp: daysAgo(1) },
      { status: 'approved', timestamp: hoursAgo(20) },
      { status: 'payout_completed', timestamp: hoursAgo(19) },
    ],
    blockchainTxHash: '0x' + 'e2'.repeat(32), onChainNetwork: 'mock', loggedOnChain: true,
    detectedAt: daysAgo(1), fraudCheckedAt: daysAgo(1), approvedAt: hoursAgo(20),
    payoutInitiatedAt: hoursAgo(19), payoutCompletedAt: hoursAgo(19), totalProcessingMs: 18000000,
  },

  // ── Amit — RED tier, mock-location app detected, rejected. Appeal
  //      submitted, still pending review.
  {
    _id: CLAIM_IDS.amit, claimId: 'CLM-DEMO-AMIT0003',
    riderId: RIDER_IDS.amit, policyId: POLICY_IDS.amit, eventId: EVENT_IDS.chennaiCyclone,
    triggerType: 'CYCLONE', triggerValue: 71, cityId: 'chennai',
    dailyCoverageInr: 500, weeklyMaxInr: 2000,
    disruptionHours: estimateDisruptionHours('CYCLONE', 'full'), disruptionFraction: 0.625,
    basePayoutInr: 234, finalPayoutInr: 234,
    riderLat: 13.5, riderLon: 80.6, // notably off from the event center — part of the fraud signal
    riderCellTower: { mcc: 404, mnc: 20, cellId: 331209, lat: 13.09, lon: 80.27 },
    accelerometerData: { variance: 0.0004, isFlat: true, readings: 38 },
    platformWasActive: false, hadOrderPings: false,
    fraudCheck: {
      score: 12, tier: 'RED', action: 'reject_appeal',
      signals: { gpsInZone: -30, cellTowerMatch: -20, physicsConsistency: -35, mockLocationDetected: true, platformActivity: -15, accountAge: 15, policyMaturity: 10, weatherCorrelation: -30 },
      reasons: ['mock_location_app_detected', 'suspiciously_flat_accelerometer', 'far_outside_trigger_radius_58km'],
      mlModelVersion: 'v1', checkedAt: daysAgo(3),
    },
    mlFraudScore: 12,
    status: CLAIM_STATUS.APPEAL_PENDING,
    statusHistory: [
      { status: 'detected', timestamp: daysAgo(3) },
      { status: 'fraud_screening', timestamp: daysAgo(3) },
      { status: 'rejected', timestamp: daysAgo(3), reason: 'mock_location_app_detected; suspiciously_flat_accelerometer; far_outside_trigger_radius_58km' },
      { status: 'appeal_pending', timestamp: daysAgo(2) },
    ],
    rejectedAt: daysAgo(3), rejectReason: 'mock_location_app_detected; suspiciously_flat_accelerometer; far_outside_trigger_radius_58km',
    appealDeadline: getAppealDeadline(daysAgo(3)),
    appeal: {
      submittedAt: daysAgo(2), reason: 'I was actually delivering during the cyclone, my phone GPS was just glitching near a mall with bad signal. Please review my order history.',
      evidenceUrls: ['https://gigshield-claims.s3.amazonaws.com/appeals/amit-order-screenshot.jpg'],
      decision: 'pending',
    },
    onChainNetwork: 'mock',
    detectedAt: daysAgo(3), fraudCheckedAt: daysAgo(3),
  },

  // ── Sunita — YELLOW tier, soft-verified, paid immediately in full.
  {
    _id: CLAIM_IDS.sunita, claimId: 'CLM-DEMO-SUNITA04',
    riderId: RIDER_IDS.sunita, policyId: POLICY_IDS.sunita, eventId: EVENT_IDS.bengaluruHeat,
    triggerType: 'EXTREME_HEAT', triggerValue: 44.2, cityId: 'bengaluru',
    dailyCoverageInr: 700, weeklyMaxInr: 2800,
    disruptionHours: estimateDisruptionHours('EXTREME_HEAT', 'full'), disruptionFraction: 0.5,
    basePayoutInr: 350, finalPayoutInr: 350,
    riderLat: 12.973, riderLon: 77.596,
    riderCellTower: { mcc: 404, mnc: 40, cellId: 445102, lat: 12.972, lon: 77.595 },
    accelerometerData: { variance: 0.06, isFlat: false, readings: 24 },
    platformWasActive: true, hadOrderPings: true,
    fraudCheck: {
      score: 58, tier: 'YELLOW', action: 'approve_soft_verify',
      signals: { gpsInZone: 10, cellTowerMatch: 15, physicsConsistency: 5, platformActivity: 10, accountAge: 15, policyMaturity: 10, weatherCorrelation: 10 },
      reasons: ['moderate_motion', 'inside_trigger_radius'],
      mlModelVersion: 'v1', checkedAt: daysAgo(6),
    },
    mlFraudScore: 58,
    status: CLAIM_STATUS.PAYOUT_COMPLETED,
    statusHistory: [
      { status: 'detected', timestamp: daysAgo(6) },
      { status: 'fraud_screening', timestamp: daysAgo(6) },
      { status: 'approved', timestamp: daysAgo(6) },
      { status: 'payout_completed', timestamp: daysAgo(6) },
    ],
    blockchainTxHash: '0x' + 'e4'.repeat(32), onChainNetwork: 'mock', loggedOnChain: true,
    detectedAt: daysAgo(6), fraudCheckedAt: daysAgo(6), approvedAt: daysAgo(6),
    payoutInitiatedAt: daysAgo(6), payoutCompletedAt: daysAgo(6), totalProcessingMs: 62000,
  },

  // ── Kavita & Sanjay — device + UPI collusion ring. Both RED, both
  //      rejected, no appeal (deliberately — this is the fraud-ring
  //      narrative, not a wrongly-flagged genuine rider).
  {
    _id: CLAIM_IDS.kavita, claimId: 'CLM-DEMO-KAVITA05',
    riderId: RIDER_IDS.kavita, policyId: POLICY_IDS.kavita, eventId: EVENT_IDS.mumbaiRain2,
    triggerType: 'HEAVY_RAIN', triggerValue: 55, cityId: 'mumbai',
    dailyCoverageInr: 350, weeklyMaxInr: 1400,
    disruptionHours: estimateDisruptionHours('HEAVY_RAIN', 'full'), disruptionFraction: 0.5,
    basePayoutInr: 175, finalPayoutInr: 175,
    riderLat: 19.05, riderLon: 72.90,
    accelerometerData: { variance: 0.11, isFlat: false, readings: 20 },
    platformWasActive: true, hadOrderPings: true,
    fraudCheck: {
      score: 10, tier: 'RED', action: 'reject_appeal',
      signals: { gpsInZone: 10, cellTowerMatch: 15, physicsConsistency: 5, platformActivity: 10, accountAge: -20, policyMaturity: -15, duplicateClaim: false, networkCluster: -50, upiReuse: true },
      reasons: ['device_shared_by_1_other_account', 'upi_used_by_2_accounts'],
      mlModelVersion: 'v1', checkedAt: hoursAgo(20),
    },
    mlFraudScore: 10,
    status: CLAIM_STATUS.REJECTED,
    statusHistory: [
      { status: 'detected', timestamp: hoursAgo(20) },
      { status: 'fraud_screening', timestamp: hoursAgo(20) },
      { status: 'rejected', timestamp: hoursAgo(20), reason: 'device_shared_by_1_other_account; upi_used_by_2_accounts' },
    ],
    rejectedAt: hoursAgo(20), rejectReason: 'device_shared_by_1_other_account; upi_used_by_2_accounts',
    appealDeadline: getAppealDeadline(hoursAgo(20)),
    onChainNetwork: 'mock',
    detectedAt: hoursAgo(20), fraudCheckedAt: hoursAgo(20),
  },
  {
    _id: CLAIM_IDS.sanjay, claimId: 'CLM-DEMO-SANJAY06',
    riderId: RIDER_IDS.sanjay, policyId: POLICY_IDS.sanjay, eventId: EVENT_IDS.mumbaiRain2,
    triggerType: 'HEAVY_RAIN', triggerValue: 55, cityId: 'mumbai',
    dailyCoverageInr: 350, weeklyMaxInr: 1400,
    disruptionHours: estimateDisruptionHours('HEAVY_RAIN', 'full'), disruptionFraction: 0.5,
    basePayoutInr: 175, finalPayoutInr: 175,
    riderLat: 19.05, riderLon: 72.90,
    accelerometerData: { variance: 0.10, isFlat: false, readings: 18 },
    platformWasActive: true, hadOrderPings: true,
    fraudCheck: {
      score: 10, tier: 'RED', action: 'reject_appeal',
      signals: { gpsInZone: 10, cellTowerMatch: 15, physicsConsistency: 5, platformActivity: 10, accountAge: -20, policyMaturity: -15, duplicateClaim: false, networkCluster: -50, upiReuse: true },
      reasons: ['device_shared_by_1_other_account', 'upi_used_by_2_accounts'],
      mlModelVersion: 'v1', checkedAt: hoursAgo(20),
    },
    mlFraudScore: 10,
    status: CLAIM_STATUS.REJECTED,
    statusHistory: [
      { status: 'detected', timestamp: hoursAgo(20) },
      { status: 'fraud_screening', timestamp: hoursAgo(20) },
      { status: 'rejected', timestamp: hoursAgo(20), reason: 'device_shared_by_1_other_account; upi_used_by_2_accounts' },
    ],
    rejectedAt: hoursAgo(20), rejectReason: 'device_shared_by_1_other_account; upi_used_by_2_accounts',
    appealDeadline: getAppealDeadline(hoursAgo(20)),
    onChainNetwork: 'mock',
    detectedAt: hoursAgo(20), fraudCheckedAt: hoursAgo(20),
  },

  // ── Lakshmi — ORANGE tier. Income Bridge advance (₹188) issued
  //      instantly, but the 2-hour selfie-verification window expired
  //      with no response — claim rejected, advance converted to a
  //      clawback debt (advanceStatus 'clawback_pending', matching
  //      User.outstandingAdvanceInr = 188).
  {
    _id: CLAIM_IDS.lakshmi, claimId: 'CLM-DEMO-LAKSH007',
    riderId: RIDER_IDS.lakshmi, policyId: POLICY_IDS.lakshmi, eventId: EVENT_IDS.delhiAqi,
    triggerType: 'AQI_SPIKE', triggerValue: 462, cityId: 'delhi',
    dailyCoverageInr: 500, weeklyMaxInr: 2000,
    disruptionHours: estimateDisruptionHours('AQI_SPIKE', 'full'), disruptionFraction: 0.75,
    basePayoutInr: 375, finalPayoutInr: 375,
    advanceInr: 188, advanceStatus: 'clawback_pending', advanceIssuedAt: daysAgo(1),
    riderLat: 28.55, riderLon: 77.25,
    riderCellTower: { mcc: 404, mnc: 10, cellId: 224088, lat: 28.56, lon: 77.24 },
    accelerometerData: { variance: 0.07, isFlat: false, readings: 22 },
    platformWasActive: true, hadOrderPings: false,
    fraudCheck: {
      score: 30, tier: 'ORANGE', action: 'hold_quick_verify',
      signals: { gpsInZone: -10, cellTowerMatch: 15, physicsConsistency: 5, platformActivity: -10, accountAge: 15, policyMaturity: 10, weatherCorrelation: -10 },
      reasons: ['just_outside_trigger_radius_31km', 'no_order_pings_during_window'],
      mlModelVersion: 'v1', checkedAt: daysAgo(1),
    },
    mlFraudScore: 30,
    status: CLAIM_STATUS.REJECTED,
    statusHistory: [
      { status: 'detected', timestamp: daysAgo(1) },
      { status: 'fraud_screening', timestamp: daysAgo(1) },
      { status: 'pending_verification', timestamp: daysAgo(1) },
      { status: 'rejected', timestamp: hoursAgo(23), reason: 'Selfie verification window expired without a response' },
    ],
    rejectedAt: hoursAgo(23), rejectReason: 'Selfie verification window expired without a response',
    appealDeadline: getAppealDeadline(hoursAgo(23)),
    onChainNetwork: 'mock',
    detectedAt: daysAgo(1), fraudCheckedAt: daysAgo(1),
  },
];

// ═══════════════════════════════════════════════════════════
// PAYOUTS
// ═══════════════════════════════════════════════════════════
const buildPayouts = () => [
  {
    payoutRef: 'PAY-DEMO-RAVI00001', claimId: CLAIM_IDS.ravi, riderId: RIDER_IDS.ravi, policyId: POLICY_IDS.ravi,
    amountInr: 100, channel: PAYMENT_CHANNELS.UPI, gateway: 'razorpay',
    gatewayPayoutId: 'demo_pout_ravi001', upiId: 'demo-enc:ravi.kumar@okhdfcbank',
    status: PAYMENT_STATUS.COMPLETED, payoutType: 'final',
    initiatedAt: daysAgo(2), completedAt: daysAgo(2), processingMs: 4200,
    blockchainTxHash: '0x' + 'e1'.repeat(32), onChainNetwork: 'mock', onChainLogged: true,
    idempotencyKey: 'PAY-DEMO-CLM1-final',
  },
  // Priya — advance, then final (remainder) once selfie verified.
  {
    payoutRef: 'PAY-DEMO-PRIYA0001', claimId: CLAIM_IDS.priya, riderId: RIDER_IDS.priya, policyId: POLICY_IDS.priya,
    amountInr: 132, channel: PAYMENT_CHANNELS.UPI, gateway: 'razorpay',
    gatewayPayoutId: 'demo_pout_priya_adv', upiId: 'demo-enc:priya.sharma@okicici',
    status: PAYMENT_STATUS.COMPLETED, payoutType: 'advance',
    initiatedAt: daysAgo(1), completedAt: daysAgo(1), processingMs: 3800,
    blockchainTxHash: '0x' + 'e2'.repeat(32), onChainNetwork: 'mock', onChainLogged: true,
    idempotencyKey: 'PAY-DEMO-CLM2-advance',
  },
  {
    payoutRef: 'PAY-DEMO-PRIYA0002', claimId: CLAIM_IDS.priya, riderId: RIDER_IDS.priya, policyId: POLICY_IDS.priya,
    amountInr: 131, channel: PAYMENT_CHANNELS.UPI, gateway: 'razorpay',
    gatewayPayoutId: 'demo_pout_priya_fin', upiId: 'demo-enc:priya.sharma@okicici',
    status: PAYMENT_STATUS.COMPLETED, payoutType: 'final',
    initiatedAt: hoursAgo(19), completedAt: hoursAgo(19), processingMs: 4100,
    blockchainTxHash: '0x' + 'e2'.repeat(32).slice(0, 63) + 'f', onChainNetwork: 'mock', onChainLogged: true,
    idempotencyKey: 'PAY-DEMO-CLM2-final',
  },
  {
    payoutRef: 'PAY-DEMO-SUNITA001', claimId: CLAIM_IDS.sunita, riderId: RIDER_IDS.sunita, policyId: POLICY_IDS.sunita,
    amountInr: 350, channel: PAYMENT_CHANNELS.UPI, gateway: 'razorpay',
    gatewayPayoutId: 'demo_pout_sunita01', upiId: 'demo-enc:sunitadevi@oksbi',
    status: PAYMENT_STATUS.COMPLETED, payoutType: 'final',
    initiatedAt: daysAgo(6), completedAt: daysAgo(6), processingMs: 3600,
    blockchainTxHash: '0x' + 'e4'.repeat(32), onChainNetwork: 'mock', onChainLogged: true,
    idempotencyKey: 'PAY-DEMO-CLM4-final',
  },
  // Lakshmi — advance only. No 'final' payout was ever created because the
  // claim was rejected before reconciliation; the advance itself is
  // reflected as a debt on her User.outstandingAdvanceInr, not reversed
  // here (a UPI transfer can't be silently un-sent).
  {
    payoutRef: 'PAY-DEMO-LAKSH0001', claimId: CLAIM_IDS.lakshmi, riderId: RIDER_IDS.lakshmi, policyId: POLICY_IDS.lakshmi,
    amountInr: 188, channel: PAYMENT_CHANNELS.UPI, gateway: 'razorpay',
    gatewayPayoutId: 'demo_pout_lakshmi_adv', upiId: 'demo-enc:lakshmi.nair@oksbi',
    status: PAYMENT_STATUS.COMPLETED, payoutType: 'advance',
    initiatedAt: daysAgo(1), completedAt: daysAgo(1), processingMs: 4500,
    blockchainTxHash: '0x' + 'e7'.repeat(32), onChainNetwork: 'mock', onChainLogged: true,
    idempotencyKey: 'PAY-DEMO-CLM7-advance',
  },
];

// ═══════════════════════════════════════════════════════════
// FRAUD LOGS
// ═══════════════════════════════════════════════════════════
const buildFraudLogs = () => [
  {
    riderId: RIDER_IDS.amit, claimId: CLAIM_IDS.amit, score: 12, tier: 'RED',
    fraudType: 'mock_location', signals: { gpsInZone: -30, physicsConsistency: -35, mockLocationDetected: true },
    action: 'reject_appeal', autoResolved: true, createdAt: daysAgo(3),
  },
  {
    riderId: RIDER_IDS.kavita, claimId: CLAIM_IDS.kavita, score: 10, tier: 'RED',
    fraudType: 'multi_account', signals: { networkCluster: -50, upiReuse: true },
    action: 'reject_appeal', autoResolved: true, ringId: 'RING-DEMO-001',
    linkedRiderIds: [RIDER_IDS.sanjay], createdAt: hoursAgo(20),
  },
  {
    riderId: RIDER_IDS.sanjay, claimId: CLAIM_IDS.sanjay, score: 10, tier: 'RED',
    fraudType: 'multi_account', signals: { networkCluster: -50, upiReuse: true },
    action: 'reject_appeal', autoResolved: true, ringId: 'RING-DEMO-001',
    linkedRiderIds: [RIDER_IDS.kavita], createdAt: hoursAgo(20),
  },
];

// ═══════════════════════════════════════════════════════════
// LOYALTY POOL — previous week (closed, carried forward) + current
// (open), matching the Phase 5 GigShieldLoyaltyPool.sol WeekClosed fix
// (real cumulative contributions, not a contributor headcount).
// ═══════════════════════════════════════════════════════════
const buildLoyaltyPools = () => {
  const prevWeekNum = parseInt(weekId.split('-W')[1], 10) - 1;
  const currWeekNum = parseInt(weekId.split('-W')[1], 10);
  return [
    {
      weekId: `${weekId.split('-W')[0]}-W${String(prevWeekNum).padStart(2, '0')}`,
      weekNumber: prevWeekNum,
      contributionsInr: 4820, contributorsCount: 214,
      disbursementsInr: 3100, beneficiariesCount: 9,
      carryForwardInr: 1720,
      isClosed: true, closedAt: daysAgo(7),
      blockchainTxHash: '0x' + 'f1'.repeat(32), onChainLogged: true,
    },
    {
      weekId, weekNumber: currWeekNum,
      contributionsInr: 3560, contributorsCount: 198,
      disbursementsInr: 1050, beneficiariesCount: 3,
      carryForwardInr: 0,
      isClosed: false,
    },
  ];
};

// ═══════════════════════════════════════════════════════════
// ANALYTICS — 7 daily snapshots feeding the Admin + Executive dashboards'
// trend charts (this is also what the Phase 7 fix wires computeDailySnapshot
// into a real cron for, going forward from whenever the seed is run).
// ═══════════════════════════════════════════════════════════
const buildAnalyticsSnapshots = () => {
  const snapshots = [];
  const dailyClaims = [3, 5, 2, 6, 4, 7, 3]; // 7 days, oldest first
  const dailyPolicies = [12, 15, 9, 18, 14, 20, 11];
  for (let i = 0; i < 7; i++) {
    const dayOffset = 6 - i; // oldest (6 days ago) first
    const period = daysAgo(dayOffset).toISOString().slice(0, 10);
    snapshots.push({
      type: 'daily', period, cityId: null,
      metrics: {
        newPolicies: dailyPolicies[i], newRiders: Math.round(dailyPolicies[i] * 0.4),
        claimsInitiated: dailyClaims[i], claimsApproved: Math.max(0, dailyClaims[i] - 1),
        claimsRejected: 1, totalPayoutInr: dailyClaims[i] * 180,
        premiumCollectedInr: dailyPolicies[i] * 65, fraudAttempts: dailyClaims[i] > 4 ? 2 : 1,
        lossRatio: Math.round((dailyClaims[i] * 180) / Math.max(1, dailyPolicies[i] * 65) * 100) / 100,
      },
      computedAt: daysAgo(dayOffset),
    });
  }
  return snapshots;
};

module.exports = {
  RIDER_IDS, ADMIN_ID, INSURER_ID, EVENT_IDS, POLICY_IDS, CLAIM_IDS,
  COLLUSION_DEVICE_FINGERPRINT, weekId, weekStart, weekEnd,
  buildUsers, buildTriggerEvents, buildPolicies, buildClaims,
  buildPayouts, buildFraudLogs, buildLoyaltyPools, buildAnalyticsSnapshots,
};
