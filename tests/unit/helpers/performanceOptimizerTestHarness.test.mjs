import os from 'node:os';
import { afterEach, describe, expect, jest, test } from '@jest/globals';

describe('performanceOptimizerTestHarness', () => {
  const originalCwd = process.cwd();

  afterEach(() => {
    process.chdir(originalCwd);
    jest.resetModules();
  });

  test('PERFORMANCE_HTML_FIXTURE should load independently of Jest cwd', async () => {
    jest.resetModules();
    process.chdir(os.tmpdir());

    const { PERFORMANCE_HTML_FIXTURE } =
      await import('../../helpers/performanceOptimizerTestHarness.js');

    expect(PERFORMANCE_HTML_FIXTURE).toContain('<h1>Article Title</h1>');
    expect(PERFORMANCE_HTML_FIXTURE).toContain('id="test-id"');
  });
});
