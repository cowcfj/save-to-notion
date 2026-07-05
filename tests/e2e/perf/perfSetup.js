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
    if (isMockNotionPagePost(post)) {
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

  await withOptionsPage({ context, extensionId }, optionsPage =>
    optionsPage.evaluate(async () => {
      await chrome.storage.sync.set({
        notionApiKey: 'secret_mock_key',
        notionDataSourceId: 'mock-db-id',
        notionDatabaseId: 'mock-db-id',
      });
    })
  );
}

export async function resolveTargetTabIdAndMockQuery({ context, extensionId, urlSubstring }) {
  const tabId = await resolveTargetTabId({ context, extensionId, urlSubstring });
  expect(tabId, `tab not found for substring "${urlSubstring}"`).not.toBeNull();

  const worker = await getExtensionServiceWorker(context);
  await worker.evaluate(installMockTabsQuery, {
    mockId: tabId,
    mockUrl: `https://example.com/?perf=${urlSubstring}`,
  });

  return tabId;
}

function isMockNotionPagePost(post) {
  if (!post) {
    return false;
  }

  return [post.parent, post.properties].every(Boolean);
}

async function withOptionsPage({ context, extensionId }, callback) {
  const optionsUrl = `chrome-extension://${extensionId}/pages/options/options.html`;
  const optionsPage = await context.newPage();
  await optionsPage.goto(optionsUrl);

  try {
    return await callback(optionsPage);
  } finally {
    await optionsPage.close();
  }
}

async function resolveTargetTabId({ context, extensionId, urlSubstring }) {
  return withOptionsPage({ context, extensionId }, setupPage =>
    setupPage.evaluate(findTabIdByUrlSubstring, urlSubstring)
  );
}

function findTabIdByUrlSubstring(substring) {
  return new Promise(resolve => {
    chrome.tabs.query({}, tabs => {
      const target = tabs.find(tab => tab.url?.includes(substring));
      resolve(target ? target.id : null);
    });
  });
}

async function getExtensionServiceWorker(context) {
  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent('serviceworker');
  }

  return worker;
}

function installMockTabsQuery({ mockId, mockUrl }) {
  const original = chrome.tabs.query;
  chrome.tabs.query = function (queryInfo, onQuery) {
    if (isActiveCurrentWindowQuery(queryInfo)) {
      return resolveMockTabQuery(onQuery, buildMockTab(mockId, mockUrl));
    }

    if (original) {
      return queryOriginalTabs(original, this, queryInfo, onQuery);
    }

    return resolveEmptyTabs(onQuery);
  };

  function isActiveCurrentWindowQuery(queryInfo) {
    return [queryInfo.active, queryInfo.currentWindow].every(Boolean);
  }

  function buildMockTab(mockTabId, tabUrl) {
    return {
      id: mockTabId,
      url: tabUrl,
      title: 'Perf Fixture',
      active: true,
      windowId: 1,
    };
  }

  function resolveMockTabQuery(onQuery, mockTab) {
    if (onQuery) {
      onQuery([mockTab]);
    }

    return Promise.resolve([mockTab]);
  }

  function queryOriginalTabs(originalQuery, queryThis, queryInfo, onQuery) {
    const result = originalQuery.call(queryThis, queryInfo, onQuery);
    return result ?? Promise.resolve([]);
  }

  function resolveEmptyTabs(onQuery) {
    if (onQuery) {
      onQuery([]);
    }

    return Promise.resolve([]);
  }
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
