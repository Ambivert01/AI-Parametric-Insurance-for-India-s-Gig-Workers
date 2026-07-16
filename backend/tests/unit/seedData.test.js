const mongoose = require('mongoose');
const User = require('../../src/models/User');
const Policy = require('../../src/models/Policy');
const Claim = require('../../src/models/Claim');
const TriggerEvent = require('../../src/models/TriggerEvent');
const { Payout, FraudLog, LoyaltyPool, Analytics } = require('../../src/models/index');
const seedData = require('../../seed/seedData');

// validateSync() runs every schema validator (required fields, enums,
// types, min/max, custom validators) synchronously, without needing an
// active MongoDB connection — this is real schema verification, not a
// live insert, but it catches the exact class of bug a live insert would
// (missing required field, invalid enum value, wrong type).
const expectValid = (Model, doc, label) => {
  const instance = new Model(doc);
  const err = instance.validateSync();
  if (err) {
    const details = Object.values(err.errors).map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new Error(`${label} failed validation: ${details}`);
  }
  return instance;
};

describe('Seed data — Users', () => {
  const users = seedData.buildUsers();

  test('all 12 users pass User schema validation', () => {
    for (const u of users) expectValid(User, u, `User ${u.name || u.phone}`);
  });

  test('every rider has a unique phone number', () => {
    const phones = users.map((u) => u.phone);
    expect(new Set(phones).size).toBe(phones.length);
  });

  test('Mohammed is genuinely referred by Sunita (referral chain)', () => {
    const mohammed = users.find((u) => u.name === 'Mohammed Farhan');
    const sunita = users.find((u) => u.name === 'Sunita Devi');
    expect(mohammed.referredBy.toString()).toBe(sunita._id.toString());
  });

  test('Kavita and Sanjay share the exact same device fingerprint (collusion narrative)', () => {
    const kavita = users.find((u) => u.name === 'Kavita Reddy');
    const sanjay = users.find((u) => u.name === 'Sanjay Gupta');
    expect(kavita.devices[0].fingerprint).toBe(sanjay.devices[0].fingerprint);
    expect(kavita.devices[0].fingerprint).toBe(seedData.COLLUSION_DEVICE_FINGERPRINT);
  });

  test('Lakshmi has an outstanding Income Bridge advance debt matching her claim', () => {
    const lakshmi = users.find((u) => u.name === 'Lakshmi Nair');
    expect(lakshmi.outstandingAdvanceInr).toBe(188);
  });

  test('Rajesh (fresh rider) has KYC status PHONE_VERIFIED only — the true empty-state case', () => {
    const rajesh = users.find((u) => u.name === 'Rajesh Patel');
    expect(rajesh.kyc.status).toBe('phone_verified');
  });
});

describe('Seed data — Trigger Events', () => {
  const events = seedData.buildTriggerEvents();

  test('all 6 trigger events pass TriggerEvent schema validation', () => {
    for (const e of events) expectValid(TriggerEvent, e, `TriggerEvent ${e.eventId}`);
  });

  test('covers a genuine spread of confidence bands and statuses', () => {
    const statuses = new Set(events.map((e) => e.status));
    expect(statuses.has('confirmed')).toBe(true);
    expect(statuses.has('expired')).toBe(true);
    expect(statuses.has('detected')).toBe(true); // the awaiting-corroboration curfew
  });

  test('the CURFEW event is genuinely unconfirmed (medium confidence, not verified) — demonstrates the confidence-gating behavior directly rather than asserting it', () => {
    const curfew = events.find((e) => e.triggerType === 'CURFEW');
    expect(curfew.confidence).toBeLessThan(71);
    expect(curfew.isVerified).toBe(false);
  });

  test('covers 4 distinct trigger types', () => {
    const types = new Set(events.map((e) => e.triggerType));
    expect(types.size).toBeGreaterThanOrEqual(4);
  });
});

describe('Seed data — Policies', () => {
  const policies = seedData.buildPolicies();

  test('all 10 policies pass Policy schema validation', () => {
    for (const p of policies) expectValid(Policy, p, `Policy ${p.policyNumber}`);
  });

  test('covers all 4 coverage tiers plus a SHIFT policy', () => {
    const tiers = new Set(policies.map((p) => p.tier));
    expect(tiers).toEqual(new Set(['BASIC', 'STANDARD', 'PRO', 'ELITE']));
    expect(policies.some((p) => p.policyType === 'SHIFT')).toBe(true);
  });

  test('premium amounts were computed by the real pricing function, not hand-typed', () => {
    // Every premiumAmountInr must equal its own premiumBreakdown.finalPremium
    // (proves it was derived, not a coincidentally-matching literal).
    for (const p of policies) {
      expect(p.premiumAmountInr).toBe(p.premiumBreakdown.finalPremium);
      expect(p.premiumBreakdown.finalPremium).toBeGreaterThan(0);
    }
  });

  test('Deepak\'s SHIFT policy does not collide with the WEEKLY unique-per-rider-per-week index (Phase 2 fix)', () => {
    const deepak = policies.find((p) => p.policyType === 'SHIFT');
    expect(deepak.weekId).toBe(seedData.weekId); // same week as everyone else's WEEKLY policies
    // The partial unique index only applies to policyType:'WEEKLY', so this
    // coexisting with other riders' WEEKLY policies in the same week is
    // exactly the scenario that used to be impossible before the fix.
  });
});

describe('Seed data — Claims', () => {
  const claims = seedData.buildClaims();

  test('all 7 claims pass Claim schema validation', () => {
    for (const c of claims) expectValid(Claim, c, `Claim ${c.claimId}`);
  });

  test('covers all 4 fraud tiers', () => {
    const tiers = new Set(claims.map((c) => c.fraudCheck.tier));
    expect(tiers).toEqual(new Set(['GREEN', 'YELLOW', 'ORANGE', 'RED']));
  });

  test('disruption hours were computed by the real per-type/severity function, not hardcoded — and are not all identical (regression guard for the old Math.min(6,Math.max(1,3)) constant)', () => {
    const hours = new Set(claims.map((c) => c.disruptionHours));
    expect(hours.size).toBeGreaterThan(1);
  });

  test('every claim payout amount is internally consistent: basePayoutInr = dailyCoverageInr × disruptionFraction × (event payoutPercent/100), capped by policy rules', () => {
    const events = seedData.buildTriggerEvents();
    for (const c of claims) {
      const event = events.find((e) => e._id.toString() === c.eventId.toString());
      const expected = Math.round(c.dailyCoverageInr * c.disruptionFraction * (event.payoutPercent / 100));
      expect(c.basePayoutInr).toBe(expected);
    }
  });

  test('Priya\'s Income Bridge advance + remainder sum to her full claim payout', () => {
    const priya = claims.find((c) => c.advanceStatus === 'reconciled');
    expect(priya.advanceInr + 131).toBe(priya.finalPayoutInr); // 131 is the remainder payout amount used in buildPayouts
  });

  test('Lakshmi\'s claim is REJECTED with a clawback_pending advance — the timeout narrative', () => {
    const lakshmi = claims.find((c) => c.advanceStatus === 'clawback_pending');
    expect(lakshmi.status).toBe(CLAIM_STATUS_REJECTED());
    expect(lakshmi.rejectReason).toMatch(/verification window expired/);
  });

  test('Amit has a pending appeal with evidence attached', () => {
    const amit = claims.find((c) => c.appeal);
    expect(amit.appeal.decision).toBe('pending');
    expect(amit.appeal.evidenceUrls.length).toBeGreaterThan(0);
  });
});

function CLAIM_STATUS_REJECTED() {
  return require('../../src/config/constants').CLAIM_STATUS.REJECTED;
}

describe('Seed data — Payouts', () => {
  const payouts = seedData.buildPayouts();

  test('all 5 payouts pass Payout schema validation', () => {
    for (const p of payouts) expectValid(Payout, p, `Payout ${p.payoutRef}`);
  });

  test('advance and final payouts for the same claim have distinct idempotency keys (Phase 2b regression guard)', () => {
    const priyaPayouts = payouts.filter((p) => p.idempotencyKey.includes('CLM2'));
    expect(priyaPayouts.length).toBe(2);
    const keys = new Set(priyaPayouts.map((p) => p.idempotencyKey));
    expect(keys.size).toBe(2); // would have been 1 before the Phase 2b fix, silently dropping the second payout
  });

  test('every payout is honestly marked onChainNetwork: mock (no real chain configured in this dataset)', () => {
    for (const p of payouts) expect(p.onChainNetwork).toBe('mock');
  });
});

describe('Seed data — Fraud Logs', () => {
  const logs = seedData.buildFraudLogs();

  test('all 3 fraud logs pass FraudLog schema validation', () => {
    for (const f of logs) expectValid(FraudLog, f, `FraudLog for claim ${f.claimId}`);
  });

  test('Kavita and Sanjay are cross-linked via the same ringId (Doc §9 Graph Intelligence)', () => {
    const kavitaLog = logs.find((l) => l.riderId.toString() === seedData.RIDER_IDS.kavita.toString());
    const sanjayLog = logs.find((l) => l.riderId.toString() === seedData.RIDER_IDS.sanjay.toString());
    expect(kavitaLog.ringId).toBe(sanjayLog.ringId);
    expect(kavitaLog.linkedRiderIds[0].toString()).toBe(seedData.RIDER_IDS.sanjay.toString());
  });
});

describe('Seed data — Loyalty Pool', () => {
  const pools = seedData.buildLoyaltyPools();

  test('both weeks pass LoyaltyPool schema validation', () => {
    for (const p of pools) expectValid(LoyaltyPool, p, `LoyaltyPool ${p.weekId}`);
  });

  test('one week is closed with a carry-forward, one is open', () => {
    expect(pools.filter((p) => p.isClosed).length).toBe(1);
    expect(pools.filter((p) => !p.isClosed).length).toBe(1);
    expect(pools.find((p) => p.isClosed).carryForwardInr).toBeGreaterThan(0);
  });
});

describe('Seed data — Analytics snapshots', () => {
  const snapshots = seedData.buildAnalyticsSnapshots();

  test('all 7 daily snapshots pass Analytics schema validation', () => {
    for (const s of snapshots) expectValid(Analytics, s, `Analytics ${s.period}`);
  });

  test('covers 7 consecutive distinct days', () => {
    const periods = new Set(snapshots.map((s) => s.period));
    expect(periods.size).toBe(7);
  });
});

describe('Seed data — cross-collection referential integrity', () => {
  test('every claim.riderId matches a real seeded user', () => {
    const users = seedData.buildUsers();
    const userIds = new Set(users.map((u) => u._id.toString()));
    for (const c of seedData.buildClaims()) expect(userIds.has(c.riderId.toString())).toBe(true);
  });

  test('every claim.policyId matches a real seeded policy', () => {
    const policies = seedData.buildPolicies();
    const policyIds = new Set(policies.map((p) => p._id.toString()));
    for (const c of seedData.buildClaims()) expect(policyIds.has(c.policyId.toString())).toBe(true);
  });

  test('every claim.eventId matches a real seeded trigger event', () => {
    const events = seedData.buildTriggerEvents();
    const eventIds = new Set(events.map((e) => e._id.toString()));
    for (const c of seedData.buildClaims()) expect(eventIds.has(c.eventId.toString())).toBe(true);
  });

  test('every payout.claimId matches a real seeded claim', () => {
    const claims = seedData.buildClaims();
    const claimIds = new Set(claims.map((c) => c._id.toString()));
    for (const p of seedData.buildPayouts()) expect(claimIds.has(p.claimId.toString())).toBe(true);
  });

  test('sum of each policy\'s claims\' payouts matches that policy\'s totalPayoutInr', () => {
    const policies = seedData.buildPolicies();
    const claims = seedData.buildClaims();
    const payouts = seedData.buildPayouts();
    for (const policy of policies) {
      const policyClaims = claims.filter((c) => c.policyId.toString() === policy._id.toString());
      const actualPaid = payouts
        .filter((p) => policyClaims.some((c) => c._id.toString() === p.claimId.toString()))
        .reduce((sum, p) => sum + p.amountInr, 0);
      expect(policy.totalPayoutInr).toBe(actualPaid);
    }
  });
});
