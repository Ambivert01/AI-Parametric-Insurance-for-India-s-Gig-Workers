const { FRAUD_TIERS } = require('../../src/config/constants');

describe('FRAUD_TIERS semantics — regression guard for the inverted-color bug', () => {
  // The admin UI bug (Phase 1) happened because a consumer assumed "higher
  // score = more suspicious" when the actual convention here is the
  // opposite: this is a TRUST score (0 = fraudulent, 100 = trustworthy).
  // These tests pin that convention down so it can't silently flip again
  // without a test failing.

  test('GREEN (the safe/auto-approve tier) is the HIGHEST score band', () => {
    expect(FRAUD_TIERS.GREEN.min).toBeGreaterThan(FRAUD_TIERS.YELLOW.min);
    expect(FRAUD_TIERS.YELLOW.min).toBeGreaterThan(FRAUD_TIERS.ORANGE.min);
    expect(FRAUD_TIERS.ORANGE.min).toBeGreaterThan(FRAUD_TIERS.RED.min);
  });

  test('GREEN maps to auto_approve and RED maps to reject_appeal — not the other way round', () => {
    expect(FRAUD_TIERS.GREEN.action).toBe('auto_approve');
    expect(FRAUD_TIERS.RED.action).toBe('reject_appeal');
  });

  test('bands are contiguous with no gaps or overlaps across the full 0-100 range', () => {
    const bands = [FRAUD_TIERS.RED, FRAUD_TIERS.ORANGE, FRAUD_TIERS.YELLOW, FRAUD_TIERS.GREEN];
    expect(bands[0].min).toBe(0);
    expect(bands[bands.length - 1].max).toBe(100);
    for (let i = 0; i < bands.length - 1; i++) {
      expect(bands[i + 1].min).toBe(bands[i].max + 1);
    }
  });

  // A helper any consumer (admin UI, reports, etc.) SHOULD use instead of
  // hand-rolling its own threshold comparison — this is what the color
  // logic should have called instead of `score > 70 ? red : ...`.
  const tierForScore = (score) => Object.entries(FRAUD_TIERS).find(
    ([, t]) => score >= t.min && score <= t.max
  )?.[0];

  test('a score of 85 (should read as safe) resolves to GREEN, not RED', () => {
    expect(tierForScore(85)).toBe('GREEN');
  });

  test('a score of 10 (should read as risky) resolves to RED, not GREEN', () => {
    expect(tierForScore(10)).toBe('RED');
  });
});
