/**
 * Shared setup steps for perf specs: seed storage, mock Notion API,
 * and mock chrome.tabs.query so that `savePage` resolves against
 * a deterministic stand-in for the active tab.
 *
 * Returns the recorded `targetTabId` so callers can reuse it.
 */

import { expect } from '@playwright/test';

export async function seedStorageAndMockNotionApi({ context, extensionId }) {
  await context.route('https://api.notion.com/v1/pages', async route => {
    const post = route.request().postDataJSON();
    if (post?.parent && post?.properties) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          object: 'page',
          id: 'mock-page-id',
          url: 'https://www.notion.so/mock-page-id',
          properties: post.properties,
        }),
      });
    } else {
      await route.abort();
    }
  });

  const optionsUrl = `chrome-extension://${extensionId}/pages/options/options.html`;
  const optionsPage = await context.newPage();
  await optionsPage.goto(optionsUrl);
  await optionsPage.evaluate(async () => {
    await chrome.storage.sync.set({
      notionApiKey: 'secret_mock_key',
      notionDataSourceId: 'mock-db-id',
      notionDatabaseId: 'mock-db-id',
    });
  });
  await optionsPage.close();
}

export async function resolveTargetTabIdAndMockQuery({ context, extensionId, urlSubstring }) {
  const optionsUrl = `chrome-extension://${extensionId}/pages/options/options.html`;
  const setupPage = await context.newPage();
  await setupPage.goto(optionsUrl);

  const tabId = await setupPage.evaluate(
    sub =>
      new Promise(resolve => {
        chrome.tabs.query({}, tabs => {
          let target = null;
          for (const t of tabs) {
            if (t.url?.includes(sub)) {
              target = t;
              break;
            }
          }
          resolve(target ? target.id : null);
        });
      }),
    urlSubstring
  );

  await setupPage.close();
  expect(tabId, `tab not found for substring "${urlSubstring}"`).not.toBeNull();

  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent('serviceworker');
  }

  await worker.evaluate(
    ({ mockId, mockUrl }) => {
      const original = chrome.tabs.query;
      chrome.tabs.query = function (queryInfo, onQuery) {
        if (queryInfo.active && queryInfo.currentWindow) {
          const mockTab = {
            id: mockId,
            url: mockUrl,
            title: 'Perf Fixture',
            active: true,
            windowId: 1,
          };
          if (onQuery) {
            onQuery([mockTab]);
          }
          return Promise.resolve([mockTab]);
        }
        if (original) {
          const result = original.call(this, queryInfo, onQuery);
          return result ?? Promise.resolve([]);
        }
        if (onQuery) {
          onQuery([]);
        }
        return Promise.resolve([]);
      };
    },
    { mockId: tabId, mockUrl: `https://example.com/?perf=${urlSubstring}` }
  );

  return tabId;
}

/**
 * Trigger savePage from a popup page (simulates a real user clicking Save).
 * Returns the response object from the background handler.
 *
 * Clears `chrome.storage.local` before each trigger so every iteration walks
 * the "first save" code path; without this, subsequent iterations would walk
 * the page-recreation path and hit Notion endpoints we have not mocked.
 */
export async function triggerSavePage({ context, extensionId }) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/pages/popup/popup.html`);
  await popup.waitForLoadState('networkidle');

  await popup.evaluate(
    () =>
      new Promise(resolve => {
        chrome.storage.local.clear(() => resolve(undefined));
      })
  );

  const response = await popup.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('savePage timeout')), 30_000);
        chrome.runtime.sendMessage({ action: 'savePage' }, r => {
          clearTimeout(t);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(r);
          }
        });
      })
  );

  await popup.close();
  return response;
}
