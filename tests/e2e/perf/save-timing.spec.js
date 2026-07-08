/**
 * Perf Spec: end-to-end save round-trip on example.com.
 *
 * Establishes the "boring page" baseline. Compare against extract-timing
 * (NextJs fixture) to estimate the marginal cost of NextJsExtractor on
 * structured Next.js pages.
 *
 * Local-only — never runs in CI (see playwright.config.js perf project).
 */

import { test, expect } from '../fixtures';
import { measureN, writeBaseline, printDelta } from './timingHelpers';
import {
  seedStorageAndMockNotionApi,
  resolveTargetTabIdAndMockQuery,
  triggerSavePage,
} from './perfSetup';

test('perf: save round-trip on example.com', async ({ page, context, extensionId }) => {
  await seedStorageAndMockNotionApi({ context, extensionId });

  await page.goto('https://example.com');
  await page.bringToFront();

  await resolveTargetTabIdAndMockQuery({
    context,
    extensionId,
    urlSubstring: 'example.com',
  });

  const stats = await measureN(
    'save_round_trip_example_com',
    async () => {
      const response = await triggerSavePage({ context, extensionId });
      expect(response.success, `savePage failed: ${response?.error ?? 'no error'}`).toBe(true);
    },
    10
  );

  printDelta(stats);
  writeBaseline(stats);
});
