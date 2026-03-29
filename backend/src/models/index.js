// ══════════════════════════════════════════════════════════
// Payout.js — Payment transaction records
// ══════════════════════════════════════════════════════════
const mongoose = require('mongoose');
const { PAYMENT_STATUS, PAYMENT_CHANNELS } = require('../config/constants');

const PayoutSchema = new mongoose.Schema({
  payoutRef:    { type: String, unique: true, required: true },  // "PAY-20260323-XXXXX"
  claimId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Claim', required: true },
  riderId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  policyId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Policy', required: true },

  amountInr:    { type: Number, required: true, min: 1 },
  channel:      { type: String, enum: Object.values(PAYMENT_CHANNELS), required: true },

  // ─── Gateway Details ────────────────────────────────────
  gateway:      { type: String, enum: ['razorpay', 'stripe', 'internal'], default: 'razorpay' },
  gatewayOrderId:  { type: String },
  gatewayPayoutId: { type: String },
  gatewayStatus:   { type: String },
  gatewayResponse: { type: mongoose.Schema.Types.Mixed, select: false },

  // ─── Recipient ─────────────────────────────────────────
  upiId:           { type: String },                // encrypted
  bankAccount:     { type: String },                // encrypted masked
  ifsc:            { type: String },

  // ─── Status ────────────────────────────────────────────
  status:         { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.PENDING },
  retryCount:     { type: Number, default: 0 },
  maxRetries:     { type: Number, default: 3 },
  failReason:     { type: String },

  initiatedAt:    { type: Date, default: Date.now },
  completedAt:    { type: Date },
  processingMs:   { type: Number },

  // ─── Blockchain ────────────────────────────────────────
  blockchainTxHash: { type: String },
  onChainLogged:    { type: Boolean, default: false },

  idempotencyKey: { type: String, unique: true },
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      delete ret.__v;
      delete ret.upiId;
      delete ret.bankAccount;
      delete ret.gatewayResponse;
      return ret;
    },
  },
});

PayoutSchema.index({ payoutRef: 1 }, { unique: true });
PayoutSchema.index({ riderId: 1, status: 1 });
PayoutSchema.index({ claimId: 1 });
PayoutSchema.index({ gatewayPayoutId: 1 }, { sparse: true });
PayoutSchema.index({ status: 1, retryCount: 1 });
PayoutSchema.index({ idempotencyKey: 1 }, { unique: true });

PayoutSchema.pre('save', function (next) {
  if (this.isNew) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 7).toUpperCase();
    this.payoutRef = `PAY-${date}-${random}`;
  }
  if (this.isModified('completedAt') && this.initiatedAt) {
    this.processingMs = this.completedAt - this.initiatedAt;
  }
  next();
});

const Payout = mongoose.model('Payout', PayoutSchema);

// ══════════════════════════════════════════════════════════
// FraudLog.js — All fraud events and decisions
// ══════════════════════════════════════════════════════════
const FraudLogSchema = new mongoose.Schema({
  riderId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  claimId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Claim' },
  deviceFingerprint: { type: String },
  ipAddress:    { type: String },

  fraudType: {
    type: String,
    enum: [
      'gps_spoof', 'mock_location', 'cell_tower_mismatch',
      'physics_anomaly', 'multi_account', 'ring_attack',
      'claim_burst', 'upi_reuse', 'behavioral_anomaly',
      'account_too_new', 'platform_inactive', 'weather_mismatch',
      'teleport_detected', 'duplicate_claim',
    ],
    required: true,
  },

  score:         { type: Number, required: true },
  tier:          { type: String, enum: ['GREEN', 'YELLOW', 'ORANGE', 'RED'] },
  action:        { type: String },
  details:       { type: mongoose.Schema.Types.Mixed },
  autoResolved:  { type: Boolean, default: true },
  reviewedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewNote:    { type: String },

  // Ring detection
  ringId:        { type: String },                   // links fraud logs from same ring
  ringSize:      { type: Number },
}, {
  timestamps: true,
});

FraudLogSchema.index({ riderId: 1, createdAt: -1 });
FraudLogSchema.index({ fraudType: 1, createdAt: -1 });
FraudLogSchema.index({ tier: 1, autoResolved: 1 });
FraudLogSchema.index({ ringId: 1 }, { sparse: true });
FraudLogSchema.index({ deviceFingerprint: 1 });

const FraudLog = mongoose.model('FraudLog', FraudLogSchema);

// ══════════════════════════════════════════════════════════
// LoyaltyPool.js — Community mutual pool
// ══════════════════════════════════════════════════════════
const LoyaltyPoolSchema = new mongoose.Schema({
  weekId:              { type: String, required: true, unique: true },
  balanceInr:          { type: Number, default: 0 },
  contributionsInr:    { type: Number, default: 0 },  // total added this week
  disbursedInr:        { type: Number, default: 0 },  // total paid out this week
  contributors:        { type: Number, default: 0 },  // unique riders who contributed
  beneficiaries:       { type: Number, default: 0 },  // riders who received bonus
  carryForwardInr:     { type: Number, default: 0 },  // rolled to next week
  isClosed:            { type: Boolean, default: false },
  closedAt:            { type: Date },
  blockchainTxHash:    { type: String },
  onChainLogged:       { type: Boolean, default: false },
}, { timestamps: true });

LoyaltyPoolSchema.index({ weekId: 1 }, { unique: true });

const LoyaltyPool = mongoose.model('LoyaltyPool', LoyaltyPoolSchema);

// ══════════════════════════════════════════════════════════
// Analytics.js — Pre-aggregated metrics for dashboards
// ══════════════════════════════════════════════════════════
const AnalyticsSchema = new mongoose.Schema({
  type:       { type: String, required: true }, // 'daily', 'weekly', 'city', 'trigger'
  period:     { type: String, required: true }, // '2026-03-23', '2026-W12', 'mumbai'
  cityId:     { type: String },

  metrics: {
    // Policies
    activePolicies:     { type: Number, default: 0 },
    newPolicies:        { type: Number, default: 0 },
    renewals:           { type: Number, default: 0 },
    lapses:             { type: Number, default: 0 },
    autoRenewEnabled:   { type: Number, default: 0 },
    premiumCollectedInr: { type: Number, default: 0 },

    // Claims
    triggerEvents:      { type: Number, default: 0 },
    claimsInitiated:    { type: Number, default: 0 },
    claimsApproved:     { type: Number, default: 0 },
    claimsRejected:     { type: Number, default: 0 },
    appealsSubmitted:   { type: Number, default: 0 },
    appealsApproved:    { type: Number, default: 0 },

    // Payouts
    totalPayoutInr:     { type: Number, default: 0 },
    avgPayoutInr:       { type: Number, default: 0 },
    avgProcessingMs:    { type: Number, default: 0 },

    // Financials
    lossRatio:          { type: Number, default: 0 }, // payouts/premiums
    loyaltyPoolBalance: { type: Number, default: 0 },

    // Fraud
    fraudAttempts:      { type: Number, default: 0 },
    fraudBlocked:       { type: Number, default: 0 },
    fraudBlockedInr:    { type: Number, default: 0 },
    ringAttacksDetected:{ type: Number, default: 0 },

    // Users
    totalRiders:        { type: Number, default: 0 },
    newRiders:          { type: Number, default: 0 },
    churnedRiders:      { type: Number, default: 0 },
    platformBreakdown:  { type: mongoose.Schema.Types.Mixed },
    tierBreakdown:      { type: mongoose.Schema.Types.Mixed },
  },

  computedAt: { type: Date, default: Date.now },
}, { timestamps: true });

AnalyticsSchema.index({ type: 1, period: 1 }, { unique: true });
AnalyticsSchema.index({ type: 1, cityId: 1, period: 1 });

const Analytics = mongoose.model('Analytics', AnalyticsSchema);

module.exports = { Payout, FraudLog, LoyaltyPool, Analytics };
