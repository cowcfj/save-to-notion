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

import { test, expect } from '../fixtures.js';
import { summarize, writeBaseline, printDelta } from './timingHelpers.js';

const FIXTURE_PATH = path.resolve(process.cwd(), 'tests/e2e/perf/fixtures/nextjs-article.html');
const FIXTURE_URL = 'https://example.com/perf-highlight-fixture';
const SAMPLE_COUNT = 10;
const OPTIONS_PAGE_PATH = 'pages/options/options.html';
const SHOW_TOOLBAR_RETRY_COUNT = 15;
const SHOW_TOOLBAR_RETRY_DELAY_MS = 200;

const getOptionsPageUrl = extensionId => `chrome-extension://${extensionId}/${OPTIONS_PAGE_PATH}`;

const readFixtureHtml = () => fs.readFileSync(FIXTURE_PATH, 'utf8');

const routeFixturePage = async context => {
  const fixtureHtml = readFixtureHtml();
  await context.route(FIXTURE_URL, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: fixtureHtml,
    });
  });
};

const openFixturePage = async context => {
  const page = await context.newPage();
  await page.goto(FIXTURE_URL);
  return page;
};

async function seedSavedPageAndResolveTabIdInOptionsPage(fixtureUrl) {
  await chrome.storage.sync.set({
    notionApiKey: 'notion_test_key',
    notionDatabaseId: 'test_db_id',
  });

  await chrome.storage.local.set({
    [`saved_${fixtureUrl}`]: {
      notionPageId: 'perf-fixture-page-id',
      notionUrl: 'https://notion.so/perf-fixture',
      title: 'Perf Fixture',
      savedAt: Date.now(),
      lastVerifiedAt: Date.now(),
    },
  });

  const tabs = await chrome.tabs.query({});
  const target = tabs.find(tab => tab.url?.includes('perf-highlight-fixture'));
  return target ? target.id : null;
}

const seedSavedPageAndResolveTabId = async ({ context, extensionId }) => {
  const optionsPage = await context.newPage();
  await optionsPage.goto(getOptionsPageUrl(extensionId));
  const targetTabId = await optionsPage.evaluate(
    seedSavedPageAndResolveTabIdInOptionsPage,
    `${FIXTURE_URL}/`
  );
  await optionsPage.close();
  return targetTabId;
};

const getServiceWorker = async context => {
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }
  return serviceWorker;
};

async function ensureHighlighterReadyInTab({ tabId, retryCount, retryDelayMs }) {
  const isMissingContentScriptConnection = error => {
    const message = error?.message ?? '';
    return message.includes('Could not establish connection');
  };

  const getBundleReadyStatus = async () => {
    try {
      const ping = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
      return ping?.status === 'bundle_ready';
    } catch (error) {
      if (isMissingContentScriptConnection(error)) {
        return false;
      }
      throw error;
    }
  };

  const ensureContentBundle = async () => {
    if (await getBundleReadyStatus()) {
      return;
    }
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['dist/content.bundle.js'],
    });
  };

  const waitForRetry = async attempt => {
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  };

  const sendShowToolbarMessage = async () => {
    try {
      return await chrome.tabs.sendMessage(tabId, { action: 'showToolbar' });
    } catch (error) {
      if (isMissingContentScriptConnection(error)) {
        return null;
      }
      throw error;
    }
  };

  const requestToolbarWithRetry = async () => {
    let last = null;
    for (let attempt = 0; attempt < retryCount; attempt++) {
      await waitForRetry(attempt);
      last = await sendShowToolbarMessage();
      if (last?.success) {
        return last;
      }
    }
    return last;
  };

  await ensureContentBundle();
  const result = await requestToolbarWithRetry();
  return { ok: Boolean(result?.success), last: result };
}

const ensureHighlighterReady = async (serviceWorker, targetTabId) => {
  return serviceWorker.evaluate(ensureHighlighterReadyInTab, {
    tabId: targetTabId,
    retryCount: SHOW_TOOLBAR_RETRY_COUNT,
    retryDelayMs: SHOW_TOOLBAR_RETRY_DELAY_MS,
  });
};

const collectHighlightSamples = async (serviceWorker, targetTabId) => {
  return serviceWorker.evaluate(
    async ({ tabId, totalSamples }) => {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: totalSamples => {
          const getHighlightManager = () => {
            const manager = globalThis.HighlighterV2?.manager;
            if (!manager?.addHighlight) {
              throw new Error('HighlighterV2.manager.addHighlight missing');
            }
            return manager;
          };

          const getFixtureParagraphs = () => {
            const paragraphs = [...document.querySelectorAll('article p')];
            if (paragraphs.length < totalSamples) {
              throw new Error(`need ${totalSamples} paragraphs, fixture has ${paragraphs.length}`);
            }
            return paragraphs;
          };

          const measureHighlight = (manager, paragraph, index) => {
            const range = document.createRange();
            range.selectNodeContents(paragraph);
            const t0 = performance.now();
            const id = manager.addHighlight(range, 'yellow');
            const dt = performance.now() - t0;
            if (!id) {
              throw new Error(`addHighlight returned no id at idx=${index}`);
            }
            return dt;
          };

          try {
            const manager = getHighlightManager();
            const paragraphs = getFixtureParagraphs();
            const samples = paragraphs
              .slice(0, totalSamples)
              .map((paragraph, index) => measureHighlight(manager, paragraph, index));
            return { ok: true, samples };
          } catch (error) {
            return { ok: false, reason: error.message };
          }
        },
        args: [totalSamples],
      });
      return result;
    },
    { tabId: targetTabId, totalSamples: SAMPLE_COUNT + 1 }
  );
};

const summarizeHighlightSamples = collection =>
  summarize('highlight_render', collection.samples.slice(1));

test('perf: highlight render time', async ({ context, extensionId }) => {
  await routeFixturePage(context);
  await openFixturePage(context);

  const targetTabId = await seedSavedPageAndResolveTabId({ context, extensionId });
  expect(targetTabId).not.toBeNull();

  const serviceWorker = await getServiceWorker(context);
  const injection = await ensureHighlighterReady(serviceWorker, targetTabId);
  expect(injection.ok, `showToolbar wiring failed: ${JSON.stringify(injection.last)}`).toBe(true);

  // Collect timing samples in the isolated content world. We collect
  // SAMPLE_COUNT + 1 and discard sample[0] as warm-up.
  const collection = await collectHighlightSamples(serviceWorker, targetTabId);
  expect(collection.ok, `sample collection failed: ${collection.reason}`).toBe(true);

  const stats = summarizeHighlightSamples(collection);
  printDelta(stats);
  writeBaseline(stats);
});
