const mongoose = require('mongoose');
const { ROLES, PLATFORMS, VEHICLE_TYPES, SHIFT_PATTERNS, KYC_STATUS, CITIES } = require('../config/constants');

const LocationSchema = new mongoose.Schema({
  lat:       { type: Number, required: true },
  lon:       { type: Number, required: true },
  accuracy:  { type: Number, default: 10 },    // meters
  timestamp: { type: Date, default: Date.now },
  source:    { type: String, enum: ['gps', 'cell', 'wifi', 'manual'], default: 'gps' },
}, { _id: false });

const DeviceSchema = new mongoose.Schema({
  fingerprint:     { type: String, required: true },   // sha256 of device signals
  model:           { type: String },
  os:              { type: String },
  osVersion:       { type: String },
  appVersion:      { type: String },
  fcmToken:        { type: String },                   // Firebase push token
  isMockLocation:  { type: Boolean, default: false },  // detected mock location app
  hasMockApps:     { type: Boolean, default: false },  // mock location apps installed
  lastSeen:        { type: Date, default: Date.now },
  ipAddress:       { type: String },
  userAgent:       { type: String },
}, { _id: false });

const BankDetailsSchema = new mongoose.Schema({
  upiId:           { type: String },                   // stored encrypted
  bankAccount:     { type: String },                   // stored encrypted (masked for display)
  ifsc:            { type: String },
  bankName:        { type: String },
  accountHolderName: { type: String },
  verified:        { type: Boolean, default: false },
  verifiedAt:      { type: Date },
  pennyDropRef:    { type: String },                   // Razorpay penny drop reference
}, { _id: false });

const KYCSchema = new mongoose.Schema({
  status:          { type: String, enum: Object.values(KYC_STATUS), default: KYC_STATUS.PHONE_VERIFIED },
  aadhaarHash:     { type: String },                   // HMAC of Aadhaar number — never store raw
  aadhaarLast4:    { type: String },
  aadhaarVerifiedAt: { type: Date },
  selfieUrl:       { type: String },                   // S3 URL
  livenessScore:   { type: Number },                   // 0-100 from AWS Rekognition
  livenessVerifiedAt: { type: Date },
  digiLockerRef:   { type: String },
}, { _id: false });

const RiderProfileSchema = new mongoose.Schema({
  platform:        { type: String, enum: Object.values(PLATFORMS), required: true },
  platformRiderId: { type: String },                   // ID on Zomato/Swiggy if available
  vehicleType:     { type: String, enum: Object.values(VEHICLE_TYPES), required: true },
  shiftPattern:    { type: String, enum: Object.values(SHIFT_PATTERNS), required: true },
  customShiftStart: { type: Number },                  // hour (0-23) if SPLIT
  customShiftEnd:  { type: Number },
  declaredDailyIncome: { type: Number, required: true, min: 100, max: 5000 }, // INR
  cityId:          { type: String, required: true },
  pincode:         { type: String },
  zone:            { type: String },                   // sub-zone within city
  currentLocation: { type: LocationSchema },
  locationHistory: { type: [LocationSchema], default: [], select: false }, // last 24hr GPS readings
  isActiveShift:   { type: Boolean, default: false },  // currently working?
  lastOrderTime:   { type: Date },                     // last delivery completion
  avgWeeklyOrders: { type: Number, default: 0 },
}, { _id: false });

const UserSchema = new mongoose.Schema({
  // ─── Core Identity ─────────────────────────────────────
  phone:         { type: String, required: true, unique: true, trim: true },
  phoneVerified: { type: Boolean, default: false },
  name:          { type: String, required: true, trim: true, maxlength: 100 },
  email:         { type: String, trim: true, lowercase: true, sparse: true },
  role:          { type: String, enum: Object.values(ROLES), default: ROLES.RIDER },
  isActive:      { type: Boolean, default: true },
  isBlocked:     { type: Boolean, default: false },
  blockedReason: { type: String },
  blockedAt:     { type: Date },

  // ─── Profile ───────────────────────────────────────────
  riderProfile:  { type: RiderProfileSchema },         // only for RIDER role
  language:      { type: String, default: 'hi', enum: ['hi', 'en', 'mr', 'ta', 'te', 'kn', 'bn'] },
  profilePhoto:  { type: String },                     // S3 URL

  // ─── KYC ──────────────────────────────────────────────
  kyc:           { type: KYCSchema, default: () => ({}) },
  bankDetails:   { type: BankDetailsSchema },

  // ─── Device & Security ────────────────────────────────
  devices:       { type: [DeviceSchema], default: [] },
  fraudScore:    { type: Number, default: 0, min: 0, max: 100 },
  fraudFlags:    { type: [String], default: [] },       // list of fraud signals detected
  isUnderReview: { type: Boolean, default: false },

  // ─── Loyalty & Rewards ────────────────────────────────
  safeWeekStreak:     { type: Number, default: 0 },    // consecutive weeks with no claim
  totalSafeWeeks:     { type: Number, default: 0 },
  loyaltyTier:        { type: String, default: 'none', enum: ['none', 'silver', 'gold', 'elite', 'legend'] },
  loyaltyDiscount:    { type: Number, default: 0 },    // fractional discount (0.05 = 5%)
  walletBalance:      { type: Number, default: 0 },    // GigShield credits (INR)
  referralCode:       { type: String, unique: true, sparse: true },
  referredBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  referralCount:      { type: Number, default: 0 },

  // ─── Notifications ────────────────────────────────────
  notificationPrefs: {
    whatsapp:    { type: Boolean, default: true },
    sms:         { type: Boolean, default: true },
    push:        { type: Boolean, default: true },
    email:       { type: Boolean, default: false },
  },

  // ─── Timestamps ───────────────────────────────────────
  lastLoginAt:   { type: Date },
  lastActiveAt:  { type: Date },
  onboardedAt:   { type: Date },
}, {
  timestamps: true,
  toJSON: { virtuals: true, transform: (doc, ret) => {
    delete ret.__v;
    delete ret.bankDetails?.upiId;   // never expose in JSON
    delete ret.bankDetails?.bankAccount;
    delete ret.locationHistory;
    return ret;
  }},
});

// ─── Indexes ──────────────────────────────────────────────
UserSchema.index({ phone: 1 }, { unique: true });
UserSchema.index({ role: 1, isActive: 1 });
UserSchema.index({ 'riderProfile.cityId': 1, 'riderProfile.platform': 1 });
UserSchema.index({ 'riderProfile.isActiveShift': 1, 'riderProfile.cityId': 1 });
UserSchema.index({ 'devices.fingerprint': 1 });
UserSchema.index({ referralCode: 1 }, { sparse: true });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ 'bankDetails.upiId': 1 }, { sparse: true });  // fraud: upi reuse detection

// ─── Virtuals ─────────────────────────────────────────────
UserSchema.virtual('isFullyKYC').get(function () {
  return this.kyc?.status === KYC_STATUS.FULL;
});

UserSchema.virtual('canReceivePayout').get(function () {
  return this.kyc?.status !== KYC_STATUS.NONE
    && this.bankDetails?.verified === true
    && !this.isBlocked;
});

// ─── Pre-save hooks ───────────────────────────────────────
UserSchema.pre('save', function (next) {
  if (this.isNew) {
    // Generate unique referral code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    this.referralCode = 'GS-' + Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
    this.onboardedAt = new Date();
  }
  next();
});

module.exports = mongoose.model('User', UserSchema);
