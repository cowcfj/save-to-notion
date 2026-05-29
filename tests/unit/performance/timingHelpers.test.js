import { measureN, summarize } from '../../e2e/perf/timingHelpers.js';

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

  test('measureN rejects non-positive sample counts before running work', async () => {
    const work = jest.fn();

    await expect(measureN('invalid_sample_count', work, 0)).rejects.toThrow(
      'measureN requires n to be greater than 0'
    );
    expect(work).not.toHaveBeenCalled();
  });
});
