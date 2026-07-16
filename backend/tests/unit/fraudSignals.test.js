const { checkWeatherCorrelation, checkRiderFraudHistory, mapReasonToType } =
  require('../../src/services/fraud/fraudService');

describe('checkWeatherCorrelation — regression guard for the S12 stub bug', () => {
  test('is NOT a stub — output actually depends on its inputs', () => {
    // Regression guard: the old version always returned {score:10} regardless
    // of any parameter, and didn't even reference its own arguments.
    const inside = checkWeatherCorrelation(19.076, 72.877, 19.076, 72.877, 25);
    const farAway = checkWeatherCorrelation(28.6, 77.2, 19.076, 72.877, 25); // Delhi vs Mumbai coords
    expect(inside.score).not.toBe(farAway.score);
  });

  test('rider inside the trigger radius scores positively', () => {
    const result = checkWeatherCorrelation(19.08, 72.88, 19.076, 72.877, 25);
    expect(result.valid).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  test('rider far outside the trigger radius scores negatively', () => {
    const result = checkWeatherCorrelation(28.6, 77.2, 19.076, 72.877, 25);
    expect(result.valid).toBe(false);
    expect(result.score).toBeLessThan(0);
  });

  test('missing location data returns a neutral score, not a crash', () => {
    expect(() => checkWeatherCorrelation(null, null, 19.076, 72.877, 25)).not.toThrow();
    expect(checkWeatherCorrelation(null, null, 19.076, 72.877, 25).score).toBe(0);
  });
});

describe('checkRiderFraudHistory — regression guard for unreachable thresholds', () => {
  test('redFlagCount >= 3 triggers the repeat-offender penalty regardless of fraudScore', () => {
    const result = checkRiderFraudHistory(35, [], 3);
    expect(result.reason).toBe('repeat_offender_3plus_red_flags');
    expect(result.score).toBeLessThan(0);
  });

  test('fraudScore >= 50 is reachable and triggers the elevated-history penalty', () => {
    // Regression guard: the old >=50 threshold was mathematically unreachable
    // because fraudScore was always recorded as Math.min(100, trustScore+20)
    // where trustScore was already clamped to <=15 by the RED hard-override —
    // capping the field at ~35 forever. Now the recording logic floors a RED
    // flag at 50, so this branch is genuinely reachable.
    const result = checkRiderFraudHistory(50, [], 0);
    expect(result.reason).toBe('elevated_fraud_history');
  });

  test('a clean rider with no history gets no penalty', () => {
    const result = checkRiderFraudHistory(0, [], 0);
    expect(result.score).toBeGreaterThan(0);
    expect(result.reason).toBe('clean_history');
  });
});

describe('mapReasonToType — must only return values valid for the FraudLog schema enum', () => {
  const VALID_ENUM = [
    'gps_spoof', 'mock_location', 'cell_tower_mismatch',
    'physics_anomaly', 'multi_account', 'ring_attack',
    'claim_burst', 'upi_reuse', 'behavioral_anomaly',
    'account_too_new', 'platform_inactive', 'weather_mismatch',
    'teleport_detected', 'duplicate_claim',
  ];

  test('device collusion and weather-radius-mismatch reasons map to valid existing enum values', () => {
    // Regression guard: these were briefly mapped to 'device_collusion' and
    // 'location_mismatch', neither of which exist in the FraudLog schema's
    // strict enum — every fraud log entry for these signal types would have
    // silently failed validation and never been saved (swallowed by the
    // existing .catch(()=>{}) no-op at the call site).
    expect(VALID_ENUM).toContain(mapReasonToType('device_shared_by_2_other_accounts'));
    expect(VALID_ENUM).toContain(mapReasonToType('far_outside_trigger_radius_120km'));
  });

  test('every known reason prefix maps to a value in the valid enum', () => {
    const sampleReasons = [
      'gps_spoof_teleport', 'mock_location_app_detected', 'cell_tower_50km_away',
      'duplicate_claim_same_event', 'claim_burst_250_in_5min', 'upi_used_by_3_accounts',
      'device_shared_by_1_other_account', 'far_outside_trigger_radius_80km',
      'platform_app_not_open', 'suspiciously_flat_accelerometer', 'account_under_2hrs',
    ];
    for (const reason of sampleReasons) {
      expect(VALID_ENUM).toContain(mapReasonToType(reason));
    }
  });
});
