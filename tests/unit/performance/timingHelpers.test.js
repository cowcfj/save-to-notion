import { summarize } from '../../e2e/perf/timingHelpers.js';

describe('perf timing helpers', () => {
  test('summarize returns zero stats for empty samples', () => {
    const stats = summarize('empty_samples', []);

    expect(stats).toEqual({
      name: 'empty_samples',
      n: 0,
      median_ms: 0,
      p95_ms: 0,
      samples: [],
    });
  });
});
