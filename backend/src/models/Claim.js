const mongoose = require('mongoose');
const { CLAIM_STATUS, FRAUD_TIERS } = require('../config/constants');

const FraudCheckResultSchema = new mongoose.Schema({
  score:                { type: Number, required: true, min: 0, max: 100 },
  tier:                 { type: String, enum: ['GREEN', 'YELLOW', 'ORANGE', 'RED'] },
  action:               { type: String },

  // Individual signal scores
  signals: {
    gpsInZone:          { type: Number, default: 0 },  // contribution to trust score
    cellTowerMatch:     { type: Number, default: 0 },
    physicsConsistency: { type: Number, default: 0 },
    mockLocationDetected: { type: Boolean, default: false },
    platformActivity:   { type: Number, default: 0 },
    deviceRegistered:   { type: Boolean, default: false },
    accountAge:         { type: Number, default: 0 },
    policyMaturity:     { type: Number, default: 0 },
    behavioralAnomaly:  { type: Number, default: 0 },
    claimBurst:         { type: Number, default: 0 },
    duplicateClaim:     { type: Boolean, default: false },
    networkCluster:     { type: Number, default: 0 },
    upiReuse:           { type: Boolean, default: false },
    gpsSpoof:           { type: Number, default: 0 },
    weatherCorrelation: { type: Number, default: 0 },
  },

  reasons:              { type: [String], default: [] },
  mlModelVersion:       { type: String },
  checkedAt:            { type: Date, default: Date.now },
  rainAdaptive:         { type: Boolean, default: false }, // thresholds loosened due to rain
}, { _id: false });

const AppealSchema = new mongoose.Schema({
  submittedAt:    { type: Date, default: Date.now },
  reason:         { type: String, required: true },
  evidenceUrls:   { type: [String], default: [] },   // selfie, screenshots
  reviewedAt:     { type: Date },
  reviewedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  decision:       { type: String, enum: ['approved', 'rejected', 'pending'], default: 'pending' },
  decisionReason: { type: String },
  goodwillCreditInr: { type: Number, default: 0 },
}, { _id: false });

const ClaimSchema = new mongoose.Schema({
  // ─── Identity ──────────────────────────────────────────
  claimId:     { type: String, unique: true, required: true },  // "CLM-20260323-XXXXX"
  riderId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  policyId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Policy', required: true },
  eventId:     { type: mongoose.Schema.Types.ObjectId, ref: 'TriggerEvent', required: true },

  // ─── Trigger Info (denormalized for speed) ─────────────
  triggerType:  { type: String, required: true },
  triggerValue: { type: Number, required: true },
  cityId:       { type: String, required: true },

  // ─── Payout Calculation ────────────────────────────────
  dailyCoverageInr:    { type: Number, required: true },
  weeklyMaxInr:        { type: Number, required: true },
  disruptionHours:     { type: Number, required: true },
  disruptionFraction:  { type: Number, required: true },  // 0-1, hours/8 work hours
  basePayoutInr:       { type: Number, required: true },
  loyaltyBonusInr:     { type: Number, default: 0 },
  finalPayoutInr:      { type: Number, required: true },
  weeklyCapApplied:    { type: Boolean, default: false },

  // ─── Rider State at Event ─────────────────────────────
  riderLat:         { type: Number },
  riderLon:         { type: Number },
  riderCellTower: {
    mcc: Number, mnc: Number, cellId: Number,
    lat: Number, lon: Number,
  },
  accelerometerData: {
    variance: Number, isFlat: Boolean, readings: { type: Number, default: 0 },
  },
  gpsReadings:      { type: mongoose.Schema.Types.Mixed, select: false }, // raw GPS points
  platformWasActive: { type: Boolean },
  hadOrderPings:     { type: Boolean },

  // ─── Fraud Assessment ─────────────────────────────────
  fraudCheck:   { type: FraudCheckResultSchema },
  mlFraudScore: { type: Number },                   // from Python ML service

  // ─── Status Flow ──────────────────────────────────────
  status: {
    type: String,
    enum: Object.values(CLAIM_STATUS),
    default: CLAIM_STATUS.DETECTED,
    index: true,
  },
  statusHistory: [{
    status:    { type: String },
    timestamp: { type: Date, default: Date.now },
    reason:    { type: String },
    actorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  }],

  // ─── Verification ─────────────────────────────────────
  selfieUrl:          { type: String },              // for ORANGE tier — photo verification
  selfieHasRain:      { type: Boolean },             // AI rain detection result
  selfieVerifiedAt:   { type: Date },
  manualReviewNote:   { type: String },
  reviewedBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt:         { type: Date },

  // ─── Payout Reference ─────────────────────────────────
  paymentId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Payout' },

  // ─── Appeal ───────────────────────────────────────────
  appeal:       { type: AppealSchema },
  appealDeadline: { type: Date },

  // ─── Blockchain ────────────────────────────────────────
  blockchainTxHash: { type: String },
  loggedOnChain:    { type: Boolean, default: false },

  // ─── Timing SLA ───────────────────────────────────────
  detectedAt:         { type: Date, default: Date.now },
  fraudCheckedAt:     { type: Date },
  approvedAt:         { type: Date },
  payoutInitiatedAt:  { type: Date },
  payoutCompletedAt:  { type: Date },
  totalProcessingMs:  { type: Number },              // end-to-end latency

  rejectedAt:   { type: Date },
  rejectReason: { type: String },

}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      delete ret.__v;
      delete ret.gpsReadings;
      return ret;
    },
  },
});

// ─── Indexes ──────────────────────────────────────────────
ClaimSchema.index({ claimId: 1 }, { unique: true });
ClaimSchema.index({ riderId: 1, status: 1 });
ClaimSchema.index({ riderId: 1, eventId: 1 }, { unique: true }); // one claim per rider per event
ClaimSchema.index({ policyId: 1 });
ClaimSchema.index({ eventId: 1, status: 1 });
ClaimSchema.index({ status: 1, detectedAt: -1 });
ClaimSchema.index({ cityId: 1, detectedAt: -1 });
ClaimSchema.index({ loggedOnChain: 1, status: 1 });

// ─── Pre-save ─────────────────────────────────────────────
ClaimSchema.pre('save', function (next) {
  if (this.isNew) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 7).toUpperCase();
    this.claimId = `CLM-${date}-${random}`;
  }

  // Track status changes
  if (this.isModified('status')) {
    this.statusHistory.push({ status: this.status, timestamp: new Date() });
  }

  // Compute total processing time when payout completes
  if (this.isModified('payoutCompletedAt') && this.detectedAt) {
    this.totalProcessingMs = this.payoutCompletedAt - this.detectedAt;
  }

  next();
});

module.exports = mongoose.model('Claim', ClaimSchema);
