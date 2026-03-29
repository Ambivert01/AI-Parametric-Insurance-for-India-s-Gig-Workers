const mongoose = require('mongoose');
const { POLICY_STATUS, COVERAGE_TIERS, TRIGGER_TYPES, PAYMENT_STATUS } = require('../config/constants');
const { getPolicyWeekId } = require('../utils/dateTime');

const PremiumBreakdownSchema = new mongoose.Schema({
  basePremium:         { type: Number, required: true },
  riskScore:           { type: Number, required: true, min: 0, max: 1 },
  seasonalMultiplier:  { type: Number, required: true },
  zoneRiskMultiplier:  { type: Number, required: true },
  loyaltyDiscount:     { type: Number, default: 0 },         // fractional
  platformDiscount:    { type: Number, default: 0 },
  referralDiscount:    { type: Number, default: 0 },
  finalPremium:        { type: Number, required: true },
  mlModelVersion:      { type: String, default: 'v1' },
  calculatedAt:        { type: Date, default: Date.now },
}, { _id: false });

const PolicySchema = new mongoose.Schema({
  // ─── Identity ──────────────────────────────────────────
  riderId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  policyNumber:  { type: String, unique: true, required: true },  // GS-2026-XXXXXXXX

  // ─── Coverage ─────────────────────────────────────────
  tier:          { type: String, required: true, enum: Object.keys(COVERAGE_TIERS) },
  tierDetails: {
    dailyCoverageInr:  { type: Number, required: true },
    weeklyMaxInr:      { type: Number, required: true },
    triggers:          { type: [String], required: true },
    payoutChannels:    { type: [String], required: true },
    priorityProcessing: { type: Boolean, default: false },
  },

  // ─── Period ────────────────────────────────────────────
  weekId:        { type: String, required: true },   // "2026-W12"
  startDate:     { type: Date, required: true },
  endDate:       { type: Date, required: true },
  isAutoRenew:   { type: Boolean, default: false },

  // ─── Location at policy creation ──────────────────────
  cityId:        { type: String, required: true },
  zone:          { type: String },
  pincode:       { type: String },
  lat:           { type: Number },
  lon:           { type: Number },

  // ─── Premium ───────────────────────────────────────────
  premiumBreakdown: { type: PremiumBreakdownSchema, required: true },
  premiumAmountInr: { type: Number, required: true },

  // ─── Payment ───────────────────────────────────────────
  paymentStatus:    { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.PENDING },
  paymentId:        { type: String },                // Razorpay/Stripe order ID
  paymentRef:       { type: String },                // transaction reference
  paidAt:           { type: Date },

  // ─── Status ────────────────────────────────────────────
  status:           { type: String, enum: Object.values(POLICY_STATUS), default: POLICY_STATUS.PENDING_PAYMENT },

  // ─── Usage ─────────────────────────────────────────────
  claimsCount:       { type: Number, default: 0 },
  totalPayoutInr:    { type: Number, default: 0 },
  remainingCoverInr: { type: Number },               // weeklyMax - totalPayout
  lastClaimAt:       { type: Date },

  // ─── Loyalty Pool Contribution ─────────────────────────
  loyaltyPoolContributed: { type: Boolean, default: false },
  loyaltyPoolAmountInr:   { type: Number, default: 0 },

  // ─── Blockchain ────────────────────────────────────────
  blockchainTxHash: { type: String },               // on-chain policy creation tx
  onChainPolicyId:  { type: String },

  // ─── Metadata ─────────────────────────────────────────
  cancelledAt:    { type: Date },
  cancelReason:   { type: String },
  renewedFromId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Policy' },
}, {
  timestamps: true,
  toJSON: { virtuals: true, transform: (doc, ret) => { delete ret.__v; return ret; } },
});

// ─── Indexes ──────────────────────────────────────────────
PolicySchema.index({ riderId: 1, weekId: 1 }, { unique: true }); // one policy per rider per week
PolicySchema.index({ riderId: 1, status: 1 });
PolicySchema.index({ cityId: 1, status: 1 });                    // for trigger matching
PolicySchema.index({ cityId: 1, status: 1, 'tierDetails.triggers': 1 }); // compound for trigger engine
PolicySchema.index({ policyNumber: 1 }, { unique: true });
PolicySchema.index({ weekId: 1, status: 1 });
PolicySchema.index({ paymentId: 1 }, { sparse: true });
PolicySchema.index({ startDate: 1, endDate: 1, status: 1 });

// ─── Virtuals ─────────────────────────────────────────────
PolicySchema.virtual('isCurrentlyActive').get(function () {
  const now = new Date();
  return this.status === POLICY_STATUS.ACTIVE
    && this.startDate <= now
    && this.endDate >= now;
});

PolicySchema.virtual('remainingDays').get(function () {
  const now = new Date();
  const msLeft = this.endDate - now;
  return Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
});

// ─── Pre-save ─────────────────────────────────────────────
PolicySchema.pre('save', function (next) {
  if (this.isNew) {
    // Generate unique policy number: GS-2026-XXXXXXXX
    const year = new Date().getFullYear();
    const random = Math.random().toString(36).substring(2, 10).toUpperCase();
    this.policyNumber = `GS-${year}-${random}`;

    // Set remaining cover
    this.remainingCoverInr = this.tierDetails.weeklyMaxInr;
  }

  // Update remaining cover
  if (this.isModified('totalPayoutInr')) {
    this.remainingCoverInr = Math.max(0, this.tierDetails.weeklyMaxInr - this.totalPayoutInr);
  }

  next();
});

module.exports = mongoose.model('Policy', PolicySchema);
