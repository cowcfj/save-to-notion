/**
 * Perf Spec: save round-trip against a synthetic Next.js fixture.
 *
 * The fixture HTML at fixtures/nextjs-article.html embeds a ~35KB
 * `__NEXT_DATA__` JSON blob, forcing NextJsExtractor down its full
 * structured-data path. The diff against save-timing.spec.js (example.com)
 * approximates the wall-clock cost added by NextJsExtractor.
 *
 * Local-only — never runs in CI (see playwright.config.js perf project).
 */

import fs from 'node:fs';
import path from 'node:path';

import { test, expect } from '../fixtures';
import { measureN, writeBaseline, printDelta } from './timingHelpers';
import {
  seedStorageAndMockNotionApi,
  resolveTargetTabIdAndMockQuery,
  triggerSavePage,
} from './perfSetup';

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures/nextjs-article.html');
const FIXTURE_URL = 'https://example.com/perf-nextjs-fixture';

test('perf: save round-trip on Next.js fixture', async ({ page, context, extensionId }) => {
  await seedStorageAndMockNotionApi({ context, extensionId });

  // Serve the fixture under a real https origin so content_scripts inject.
  // We reuse example.com because manifest grants https://*/* — any host works.

  const fixtureHtml = fs.readFileSync(FIXTURE_PATH, 'utf8');
  await context.route(FIXTURE_URL, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: fixtureHtml,
    });
  });

  await page.goto(FIXTURE_URL);
  await page.bringToFront();
  await expect(page.locator('#__NEXT_DATA__')).toHaveCount(1);

  await resolveTargetTabIdAndMockQuery({
    context,
    extensionId,
    urlSubstring: 'perf-nextjs-fixture',
  });

  const stats = await measureN(
    'save_round_trip_nextjs_fixture',
    async () => {
      const response = await triggerSavePage({ context, extensionId });
      expect(response.success, `savePage failed: ${response?.error ?? 'no error'}`).toBe(true);
    },
    10
  );

  printDelta(stats);
  writeBaseline(stats);
});
