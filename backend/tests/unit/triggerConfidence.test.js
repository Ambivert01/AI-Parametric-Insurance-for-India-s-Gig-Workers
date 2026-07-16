const {
  computeConfidence, CONFIDENCE_BAND, evaluateStormTrigger,
  evaluateWeatherTrigger, evaluateAQITrigger,
} = require('../../src/services/trigger-engine/triggerService');

describe('CONFIDENCE_BAND', () => {
  test('bands match doc §6 exactly: 0-30 Low, 31-70 Medium, 71-100 High', () => {
    expect(CONFIDENCE_BAND(0)).toBe('low');
    expect(CONFIDENCE_BAND(30)).toBe('low');
    expect(CONFIDENCE_BAND(31)).toBe('medium');
    expect(CONFIDENCE_BAND(70)).toBe('medium');
    expect(CONFIDENCE_BAND(71)).toBe('high');
    expect(CONFIDENCE_BAND(100)).toBe('high');
  });
});

describe('computeConfidence', () => {
  test('reading exactly at threshold (magnitudeRatio=1) returns just the base confidence', () => {
    expect(computeConfidence({ baseConfidence: 60, magnitudeRatio: 1, corroborated: false })).toBe(60);
  });

  test('a reading further past threshold increases confidence', () => {
    const atThreshold = computeConfidence({ baseConfidence: 60, magnitudeRatio: 1, corroborated: false });
    const doubleThreshold = computeConfidence({ baseConfidence: 60, magnitudeRatio: 2, corroborated: false });
    expect(doubleThreshold).toBeGreaterThan(atThreshold);
  });

  test('magnitude bonus is capped at +20 (a 10x threshold breach is not 10x more confident)', () => {
    const huge = computeConfidence({ baseConfidence: 50, magnitudeRatio: 100, corroborated: false });
    expect(huge).toBeLessThanOrEqual(70); // 50 base + 20 cap
  });

  test('corroboration adds a flat +15', () => {
    const uncorroborated = computeConfidence({ baseConfidence: 50, magnitudeRatio: 1, corroborated: false });
    const corroborated = computeConfidence({ baseConfidence: 50, magnitudeRatio: 1, corroborated: true });
    expect(corroborated - uncorroborated).toBe(15);
  });

  test('never exceeds 100 or goes below 0', () => {
    expect(computeConfidence({ baseConfidence: 95, magnitudeRatio: 5, corroborated: true })).toBeLessThanOrEqual(100);
    expect(computeConfidence({ baseConfidence: 0, magnitudeRatio: 1, corroborated: false })).toBeGreaterThanOrEqual(0);
  });
});

describe('evaluateStormTrigger (CYCLONE) — built from wind speed + condition, no second API', () => {
  test('calm weather produces no event', async () => {
    const events = await evaluateStormTrigger('mumbai', { windSpeed: 2, weatherMain: 'Clear' }); // 7.2 km/h
    expect(events).toHaveLength(0);
  });

  test('a "Thunderstorm" label alone with negligible wind does not fire (regression guard)', async () => {
    // This was a real bug caught during implementation: the original condition
    // fired on weatherMain === 'Thunderstorm' regardless of wind speed.
    const events = await evaluateStormTrigger('mumbai', { windSpeed: 1, weatherMain: 'Thunderstorm' }); // 3.6 km/h
    expect(events).toHaveLength(0);
  });

  test('25-40 km/h with a storm label produces a partial/yellow event', async () => {
    const events = await evaluateStormTrigger('mumbai', { windSpeed: 10, weatherMain: 'Thunderstorm' }); // 36 km/h
    expect(events).toHaveLength(1);
    expect(events[0].severity).toBe('partial');
  });

  test('62+ km/h produces a full/orange event', async () => {
    const events = await evaluateStormTrigger('mumbai', { windSpeed: 18, weatherMain: 'Squall' }); // 64.8 km/h
    expect(events).toHaveLength(1);
    expect(events[0].severity).toBe('full');
  });

  test('88+ km/h produces an extreme/red event', async () => {
    const events = await evaluateStormTrigger('mumbai', { windSpeed: 26, weatherMain: 'Squall' }); // 93.6 km/h
    expect(events).toHaveLength(1);
    expect(events[0].severity).toBe('extreme');
  });

  test('severity strictly increases with wind speed (no band overlap)', async () => {
    const partial = (await evaluateStormTrigger('mumbai', { windSpeed: 10, weatherMain: 'Thunderstorm' }))[0];
    const full = (await evaluateStormTrigger('mumbai', { windSpeed: 18, weatherMain: 'Squall' }))[0];
    const extreme = (await evaluateStormTrigger('mumbai', { windSpeed: 26, weatherMain: 'Squall' }))[0];
    expect(partial.payoutPercent).toBeLessThan(full.payoutPercent);
    expect(full.payoutPercent).toBeLessThan(extreme.payoutPercent);
  });
});

describe('evaluateWeatherTrigger — HEAVY_RAIN / EXTREME_HEAT', () => {
  test('no rain, mild temperature produces no events', async () => {
    const events = await evaluateWeatherTrigger('pune', { rainfall1h: 0, rainfall3h: 0, feelsLike: 28 });
    expect(events).toHaveLength(0);
  });

  test('heavy sustained rainfall produces a full-severity HEAVY_RAIN event', async () => {
    const events = await evaluateWeatherTrigger('mumbai', { rainfall1h: 5, rainfall3h: 40, feelsLike: 28 }); // 80mm/6hr
    const rain = events.find((e) => e.triggerType === 'HEAVY_RAIN');
    expect(rain).toBeDefined();
    expect(rain.severity).toBe('full');
  });

  test('extreme feels-like temperature produces an EXTREME_HEAT event', async () => {
    const events = await evaluateWeatherTrigger('delhi', { rainfall1h: 0, rainfall3h: 0, feelsLike: 48 });
    const heat = events.find((e) => e.triggerType === 'EXTREME_HEAT');
    expect(heat).toBeDefined();
  });

  test('every event carries a confidence score in range', async () => {
    const events = await evaluateWeatherTrigger('mumbai', { rainfall1h: 5, rainfall3h: 40, feelsLike: 48 });
    for (const e of events) {
      expect(e.confidence).toBeGreaterThanOrEqual(0);
      expect(e.confidence).toBeLessThanOrEqual(100);
    }
  });
});

describe('evaluateAQITrigger', () => {
  test('good AQI produces no event', async () => {
    const events = await evaluateAQITrigger('delhi', { aqi: 80 });
    expect(events).toHaveLength(0);
  });

  test('AQI above the full threshold produces a full-severity event', async () => {
    const events = await evaluateAQITrigger('delhi', { aqi: 450 });
    expect(events[0].severity).toBe('full');
  });
});
