const { estimateDisruptionHours, INCOME_BRIDGE_CONFIDENCE_THRESHOLD, INCOME_BRIDGE_ADVANCE_FRACTION } =
  require('../../src/services/claims/claimsService');

describe('estimateDisruptionHours', () => {
  test('is NOT the old hardcoded constant of 3 for every type/severity', () => {
    // Regression guard: Math.min(6, Math.max(1, 3)) always evaluated to 3
    // regardless of input. Prove that at least some combinations differ.
    const values = new Set([
      estimateDisruptionHours('HEAVY_RAIN', 'partial'),
      estimateDisruptionHours('HEAVY_RAIN', 'full'),
      estimateDisruptionHours('CYCLONE', 'extreme'),
      estimateDisruptionHours('PLATFORM_OUTAGE', 'partial'),
    ]);
    expect(values.size).toBeGreaterThan(1);
  });

  test('extreme severity is always >= full severity is always >= partial, per type', () => {
    for (const type of ['HEAVY_RAIN', 'EXTREME_HEAT', 'AQI_SPIKE', 'CYCLONE', 'CURFEW', 'BANDH', 'PLATFORM_OUTAGE', 'TRAFFIC_SHUTDOWN']) {
      const partial = estimateDisruptionHours(type, 'partial');
      const full = estimateDisruptionHours(type, 'full');
      const extreme = estimateDisruptionHours(type, 'extreme');
      expect(full).toBeGreaterThanOrEqual(partial);
      expect(extreme).toBeGreaterThanOrEqual(full);
    }
  });

  test('unknown trigger type falls back to a sane default rather than crashing', () => {
    expect(() => estimateDisruptionHours('NOT_A_REAL_TYPE', 'full')).not.toThrow();
    expect(estimateDisruptionHours('NOT_A_REAL_TYPE', 'full')).toBe(3);
  });

  test('every value is a positive number', () => {
    for (const type of ['HEAVY_RAIN', 'EXTREME_HEAT', 'AQI_SPIKE', 'CYCLONE', 'CURFEW', 'BANDH', 'PLATFORM_OUTAGE', 'TRAFFIC_SHUTDOWN']) {
      for (const sev of ['partial', 'full', 'extreme']) {
        expect(estimateDisruptionHours(type, sev)).toBeGreaterThan(0);
      }
    }
  });
});

describe('Income Bridge constants', () => {
  test('confidence threshold is higher than the general "high confidence" band (71) — releasing money ahead of identity verification should be a stricter bar', () => {
    expect(INCOME_BRIDGE_CONFIDENCE_THRESHOLD).toBeGreaterThan(71);
  });

  test('advance fraction is a genuine partial amount, not the full payout', () => {
    expect(INCOME_BRIDGE_ADVANCE_FRACTION).toBeGreaterThan(0);
    expect(INCOME_BRIDGE_ADVANCE_FRACTION).toBeLessThan(1);
  });
});
