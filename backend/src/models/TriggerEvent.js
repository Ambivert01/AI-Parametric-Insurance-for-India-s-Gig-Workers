const mongoose = require('mongoose');
const { TRIGGER_TYPES } = require('../config/constants');

const DataSourceSchema = new mongoose.Schema({
  source:    { type: String, required: true },        // 'openweathermap', 'cpcb', etc.
  value:     { type: mongoose.Schema.Types.Mixed },   // raw value (mm, aqi, °C, etc.)
  unit:      { type: String },
  rawResponse: { type: mongoose.Schema.Types.Mixed, select: false }, // full API response
  ipfsHash:  { type: String },                        // IPFS hash of raw data for audit
  fetchedAt: { type: Date, default: Date.now },
  apiStatus: { type: Number },                        // HTTP status of API call
}, { _id: false });

const TriggerEventSchema = new mongoose.Schema({
  // ─── Event Identity ────────────────────────────────────
  eventId:     { type: String, unique: true, required: true },  // "EVT-20260323-XXXXX"
  triggerType: {
    type: String,
    required: true,
    enum: Object.keys(TRIGGER_TYPES),
  },

  // ─── Location ─────────────────────────────────────────
  cityId:      { type: String, required: true },
  zone:        { type: String },
  affectedPincodes: { type: [String], default: [] },
  centerLat:   { type: Number },
  centerLon:   { type: Number },
  radiusKm:    { type: Number, default: 25 },

  // ─── Trigger Values ────────────────────────────────────
  triggerValue:   { type: Number, required: true },   // the actual measured value
  triggerUnit:    { type: String },                   // mm, AQI, °C, etc.
  threshold:      { type: Number, required: true },   // threshold that was breached
  severity:       { type: String, enum: ['partial', 'full', 'extreme'], default: 'full' },
  payoutPercent:  { type: Number, required: true },   // 60 or 100

  // ─── Data Sources ─────────────────────────────────────
  primarySource:   { type: DataSourceSchema, required: true },
  secondarySource: { type: DataSourceSchema },
  isVerified:      { type: Boolean, default: false }, // both sources confirmed
  verifiedAt:      { type: Date },

  // ─── Lifecycle ────────────────────────────────────────
  status: {
    type: String,
    enum: ['detected', 'verifying', 'confirmed', 'disputed', 'expired', 'false_positive'],
    default: 'detected',
  },
  detectedAt:     { type: Date, default: Date.now },
  confirmedAt:    { type: Date },
  expiredAt:      { type: Date },                    // when the event condition ended
  durationHours:  { type: Number },                  // how long it lasted

  // ─── Claims Impact ────────────────────────────────────
  affectedPoliciesCount: { type: Number, default: 0 },
  claimsInitiated:       { type: Number, default: 0 },
  claimsApproved:        { type: Number, default: 0 },
  totalPayoutInr:        { type: Number, default: 0 },

  // ─── Ring Detection ────────────────────────────────────
  claimBurstDetected: { type: Boolean, default: false },
  burstCount:         { type: Number, default: 0 },
  burstWindowMinutes: { type: Number },

  // ─── Blockchain ────────────────────────────────────────
  blockchainTxHash: { type: String },
  onChainEventId:   { type: String },
  loggedOnChain:    { type: Boolean, default: false },

  // ─── Metadata ─────────────────────────────────────────
  pollingCycleId: { type: String },   // which cron run detected this
  notes:          { type: String },
}, {
  timestamps: true,
  toJSON: { transform: (doc, ret) => { delete ret.__v; return ret; } },
});

// ─── Indexes ──────────────────────────────────────────────
TriggerEventSchema.index({ eventId: 1 }, { unique: true });
TriggerEventSchema.index({ cityId: 1, triggerType: 1, status: 1 });
TriggerEventSchema.index({ cityId: 1, detectedAt: -1 });
TriggerEventSchema.index({ status: 1, isVerified: 1 });
TriggerEventSchema.index({ detectedAt: -1 });
TriggerEventSchema.index({ loggedOnChain: 1, status: 1 });  // for blockchain oracle backfill

// ─── Pre-save ─────────────────────────────────────────────
TriggerEventSchema.pre('save', function (next) {
  if (this.isNew && !this.eventId) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 7).toUpperCase();
    this.eventId = `EVT-${date}-${random}`;
  }
  next();
});

module.exports = mongoose.model('TriggerEvent', TriggerEventSchema);
