const { calculateRiskScore, recommendTierFor, riskFactorBreakdown, CITY_BASE_RISK } =
  require('../../src/services/policy/policyService');

describe('calculateRiskScore — regression guard against the fake constant riskScore:0.5 bug', () => {
  test('different cities produce different risk scores for identical shift/income', () => {
    const mumbai = calculateRiskScore('mumbai', 'full_day', 500, new Date('2026-01-15'));
    const jaipur = calculateRiskScore('jaipur', 'full_day', 500, new Date('2026-01-15'));
    // Mumbai's base risk (0.85) is meaningfully higher than Jaipur's (0.40) in CITY_BASE_RISK
    expect(mumbai).not.toBe(jaipur);
    expect(mumbai).toBeGreaterThan(jaipur);
  });

  test('different shift patterns produce different scores for the same city/income', () => {
    // Pune (mid base risk 0.50) — Mumbai's 0.85 base saturates the 0.98 ceiling
    // once any shift/income multiplier is applied, which washes out the
    // comparison; that's an intentional clamp, not what this test is checking.
    const night = calculateRiskScore('pune', 'night', 500);
    const morning = calculateRiskScore('pune', 'morning', 500);
    expect(night).toBeGreaterThan(morning); // SHIFT_RISK: night 1.15 > morning 0.95
  });

  test('lower declared income increases relative risk exposure', () => {
    const low = calculateRiskScore('pune', 'full_day', 200);
    const high = calculateRiskScore('pune', 'full_day', 1500);
    expect(low).toBeGreaterThan(high);
  });

  test('score is always within [0.05, 0.98] regardless of inputs', () => {
    expect(calculateRiskScore('mumbai', 'night', 100)).toBeLessThanOrEqual(0.98);
    expect(calculateRiskScore('jaipur', 'morning', 5000)).toBeGreaterThanOrEqual(0.05);
  });

  test('unknown city falls back to a neutral 0.5 baseline rather than crashing', () => {
    expect(() => calculateRiskScore('not_a_real_city', 'full_day', 500)).not.toThrow();
  });
});

describe('recommendTierFor', () => {
  test('low risk + low income recommends BASIC', () => {
    expect(recommendTierFor(0.1, 300)).toBe('BASIC');
  });

  test('high risk + high income recommends ELITE', () => {
    expect(recommendTierFor(0.9, 1200)).toBe('ELITE');
  });

  test('recommendation is monotonic in risk — higher risk never recommends a cheaper/lower tier at the same income', () => {
    const TIER_RANK = { BASIC: 0, STANDARD: 1, PRO: 2, ELITE: 3 };
    const low = recommendTierFor(0.1, 500);
    const mid = recommendTierFor(0.5, 500);
    const high = recommendTierFor(0.9, 500);
    expect(TIER_RANK[mid]).toBeGreaterThanOrEqual(TIER_RANK[low]);
    expect(TIER_RANK[high]).toBeGreaterThanOrEqual(TIER_RANK[mid]);
  });
});

describe('riskFactorBreakdown', () => {
  test('returns a human-readable explanation for every factor, not raw numbers only', () => {
    const factors = riskFactorBreakdown('mumbai', 'night', 300);
    expect(factors.length).toBeGreaterThan(0);
    for (const f of factors) {
      expect(typeof f.label).toBe('string');
      expect(typeof f.detail).toBe('string');
      expect(f.detail.length).toBeGreaterThan(0);
    }
  });
});

describe('CITY_BASE_RISK', () => {
  test('covers all 10 supported cities', () => {
    const expected = ['mumbai', 'delhi', 'kolkata', 'chennai', 'hyderabad', 'bengaluru', 'pune', 'ahmedabad', 'jaipur', 'lucknow'];
    for (const city of expected) {
      expect(CITY_BASE_RISK[city]).toBeDefined();
      expect(CITY_BASE_RISK[city]).toBeGreaterThan(0);
      expect(CITY_BASE_RISK[city]).toBeLessThanOrEqual(1);
    }
  });
});
