import { test } from 'node:test';
import assert from 'node:assert/strict';
import { concentrationPoints, CONCENTRATION_SERIES } from '../src/concentration.js';

test('concentrationPoints gives a top-4 and a top-10 point per year, in year order', () => {
  const rows = [{ year: 2025, top4: 0.587, top10: 0.775, carriers: 295 }, { year: '1990', top4: '0.506', top10: 0.823, carriers: 218 }];
  assert.deepEqual(concentrationPoints(rows), [
    { year: 1990, series: CONCENTRATION_SERIES[0], share: 0.506 },
    { year: 1990, series: CONCENTRATION_SERIES[1], share: 0.823 },
    { year: 2025, series: CONCENTRATION_SERIES[0], share: 0.587 },
    { year: 2025, series: CONCENTRATION_SERIES[1], share: 0.775 },
  ]);
});

test('concentrationPoints skips rows without numbers', () => {
  assert.deepEqual(concentrationPoints([{ year: 2000, top4: null, top10: 0.5 }]), [{ year: 2000, series: 'Top 10 airlines', share: 0.5 }]);
});
