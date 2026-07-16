/**
 * seed.js — populates a MongoDB database with the full GigShield demo
 * dataset: 10 riders + admin + insurer, covering registration through
 * KYC (every stage), all 4 coverage tiers + a shift policy, 6 trigger
 * events (every confidence/status combination the trigger engine
 * produces), all 4 fraud tiers, Income Bridge in both outcomes, a
 * referral chain, a device/UPI collusion ring, an appeal in progress,
 * loyalty pool history, and a week of analytics snapshots.
 *
 * Usage:
 *   node seed/seed.js            # seed (fails if data already exists)
 *   node seed/seed.js --clear    # wipe all collections first, then seed
 *
 * Requires MONGO_URI in the environment (see .env.example).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const User = require('../src/models/User');
const Policy = require('../src/models/Policy');
const Claim = require('../src/models/Claim');
const TriggerEvent = require('../src/models/TriggerEvent');
const { Payout, FraudLog, LoyaltyPool, Analytics } = require('../src/models/index');

const seedData = require('./seedData');

const shouldClear = process.argv.includes('--clear');

const COLLECTIONS = [
  { name: 'Users', Model: User, build: seedData.buildUsers },
  { name: 'Trigger Events', Model: TriggerEvent, build: seedData.buildTriggerEvents },
  { name: 'Policies', Model: Policy, build: seedData.buildPolicies },
  { name: 'Claims', Model: Claim, build: seedData.buildClaims },
  { name: 'Payouts', Model: Payout, build: seedData.buildPayouts },
  { name: 'Fraud Logs', Model: FraudLog, build: seedData.buildFraudLogs },
  { name: 'Loyalty Pools', Model: LoyaltyPool, build: seedData.buildLoyaltyPools },
  { name: 'Analytics Snapshots', Model: Analytics, build: seedData.buildAnalyticsSnapshots },
];

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI is not set. Copy .env.example to .env and fill it in first.');
    process.exit(1);
  }

  console.log(`Connecting to ${process.env.MONGO_URI.replace(/\/\/.*@/, '//***@')}...`);
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected.\n');

  if (shouldClear) {
    console.log('🗑  --clear flag set — wiping existing data in these collections...');
    for (const { name, Model } of COLLECTIONS) {
      const { deletedCount } = await Model.deleteMany({});
      console.log(`   ${name}: removed ${deletedCount} existing document(s)`);
    }
    console.log();
  }

  const summary = [];

  for (const { name, Model, build } of COLLECTIONS) {
    const docs = build();
    try {
      // insertMany with ordered:true (default) so we stop at the first
      // real problem instead of silently skipping bad documents.
      const inserted = await Model.insertMany(docs, { ordered: true });
      console.log(`✅ ${name}: inserted ${inserted.length}`);
      summary.push({ name, count: inserted.length, ok: true });
    } catch (err) {
      console.error(`❌ ${name}: FAILED — ${err.message}`);
      if (err.code === 11000) {
        console.error('   (duplicate key — data may already exist. Re-run with --clear to wipe first.)');
      }
      summary.push({ name, count: 0, ok: false, error: err.message });
      // Stop here — later collections reference these _ids, so continuing
      // after a failure would just cascade into confusing errors.
      break;
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log('SEED SUMMARY');
  console.log('─'.repeat(60));
  for (const s of summary) {
    console.log(`  ${s.ok ? '✅' : '❌'} ${s.name.padEnd(24)} ${s.ok ? s.count : 'FAILED'}`);
  }

  const allOk = summary.every((s) => s.ok);
  if (allOk) {
    console.log('\n🎉 Demo dataset seeded successfully.\n');
    console.log('Try logging in as:');
    console.log('  Rider (happy path):     phone 9821000001 (Ravi Kumar)');
    console.log('  Rider (Income Bridge):  phone 9821000002 (Priya Sharma)');
    console.log('  Rider (fraud/appeal):   phone 9821000003 (Amit Singh)');
    console.log('  Rider (fresh/empty):    phone 9821000010 (Rajesh Patel)');
    console.log('  Admin:                  phone 9800000001 (GigShield Ops)');
    console.log('(OTP is mocked in dev — check server logs for the code, or use 000000 if MOCK_OTP is enabled.)\n');
  } else {
    console.log('\n⚠️  Seeding stopped early — see errors above.\n');
  }

  await mongoose.disconnect();
  process.exit(allOk ? 0 : 1);
};

run().catch((err) => {
  console.error('Fatal error while seeding:', err);
  process.exit(1);
});
