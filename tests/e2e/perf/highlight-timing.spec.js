/**
 * Perf Spec: highlight render time.
 *
 * Times `HighlighterV2.manager.addHighlight(range, color)` end-to-end —
 * the API call to the resulting `<mark>` mutation. Each iteration highlights
 * a fresh paragraph; one warm-up iteration is discarded.
 *
 * Sampling runs entirely inside the extension's isolated content world via
 * chrome.scripting.executeScript — page.evaluate() runs in the main world
 * and cannot see globalThis.HighlighterV2.
 *
 * Local-only — never runs in CI (see playwright.config.js perf project).
 */

import fs from 'node:fs';
import path from 'node:path';

import { test, expect } from '../fixtures';
import { summarize, writeBaseline, printDelta } from './timingHelpers';

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures/nextjs-article.html');
const FIXTURE_URL = 'https://example.com/perf-highlight-fixture';
const SAMPLE_COUNT = 10;

test('perf: highlight render time', async ({ context, extensionId }) => {
  const fixtureHtml = fs.readFileSync(FIXTURE_PATH, 'utf8');

  const page = await context.newPage();
  await context.route(FIXTURE_URL, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: fixtureHtml,
    });
  });

  await page.goto(FIXTURE_URL);

  // Seed saved-page state so the highlighter init proceeds — same pattern as
  // tests/e2e/specs/highlight.spec.js.
  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/pages/options/options.html`);
  const targetTabId = await optionsPage.evaluate(
    fixtureUrl =>
      new Promise(resolve => {
        chrome.storage.sync.set(
          { notionApiKey: 'notion_test_key', notionDatabaseId: 'test_db_id' },
          () => seedSavedPage(fixtureUrl, resolve)
        );

        function seedSavedPage(url, done) {
          chrome.storage.local.set(
            {
              [`saved_${url}`]: {
                notionPageId: 'perf-fixture-page-id',
                notionUrl: 'https://notion.so/perf-fixture',
                title: 'Perf Fixture',
                savedAt: Date.now(),
                lastVerifiedAt: Date.now(),
              },
            },
            () => resolveTargetTab(done)
          );
        }

        function resolveTargetTab(done) {
          chrome.tabs.query({}, tabs => {
            let target = null;
            for (const t of tabs) {
              if (t.url?.includes('perf-highlight-fixture')) {
                target = t;
                break;
              }
            }
            done(target ? target.id : null);
          });
        }
      }),
    `${FIXTURE_URL}/`
  );
  await optionsPage.close();
  expect(targetTabId).not.toBeNull();

  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }

  // Inject the content bundle and drive `showToolbar` (with retry) so the
  // HighlighterV2 manager is fully wired before we start measuring.
  const injection = await serviceWorker.evaluate(async tabId => {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['dist/content.bundle.js'],
    });
    let result = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      if (attempt > 0) {
        // eslint-disable-next-line promise/param-names
        await new Promise(r => setTimeout(r, 200));
      }
      try {
        result = await chrome.tabs.sendMessage(tabId, { action: 'showToolbar' });
        if (result?.success) {
          break;
        }
      } catch (error) {
        const msg = error?.message ?? '';
        if (!msg.includes('Could not establish connection')) {
          throw error;
        }
      }
    }
    return { ok: Boolean(result?.success), last: result };
  }, targetTabId);
  expect(injection.ok, `showToolbar wiring failed: ${JSON.stringify(injection.last)}`).toBe(true);

  // Collect timing samples in the isolated content world. We collect
  // SAMPLE_COUNT + 1 and discard sample[0] as warm-up.
  const collection = await serviceWorker.evaluate(
    async ({ tabId, totalSamples }) => {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: totalSamples => {
          const v2 = globalThis.HighlighterV2;
          if (!v2?.manager?.addHighlight) {
            return { ok: false, reason: 'HighlighterV2.manager.addHighlight missing' };
          }
          const paragraphs = document.querySelectorAll('article p');
          if (paragraphs.length < totalSamples) {
            return {
              ok: false,
              reason: `need ${totalSamples} paragraphs, fixture has ${paragraphs.length}`,
            };
          }
          const samples = [];
          for (let i = 0; i < totalSamples; i++) {
            const range = document.createRange();
            range.selectNodeContents(paragraphs[i]);
            const t0 = performance.now();
            const id = v2.manager.addHighlight(range, 'yellow');
            const dt = performance.now() - t0;
            if (!id) {
              return { ok: false, reason: `addHighlight returned no id at idx=${i}` };
            }
            samples.push(dt);
          }
          return { ok: true, samples };
        },
        args: [totalSamples],
      });
      return result;
    },
    { tabId: targetTabId, totalSamples: SAMPLE_COUNT + 1 }
  );
  expect(collection.ok, `sample collection failed: ${collection.reason}`).toBe(true);

  // Discard warm-up sample[0].
  const stats = summarize('highlight_render', collection.samples.slice(1));

  printDelta(stats);
  writeBaseline(stats);
});
