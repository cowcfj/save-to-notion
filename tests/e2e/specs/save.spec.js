import { test, expect } from '../fixtures.js';

const NOTION_PAGES_URL = 'https://api.notion.com/v1/pages';
const EXAMPLE_URL = 'https://example.com';
const OPTIONS_PAGE_PATH = 'pages/options/options.html';
const POPUP_PAGE_PATH = 'pages/popup/popup.html';
const SAVE_TIMEOUT_MS = 30_000;

const getExtensionPageUrl = (extensionId, pagePath) =>
  `chrome-extension://${extensionId}/${pagePath}`;

const mockNotionPageCreation = async context => {
  await context.route(NOTION_PAGES_URL, async route => {
    const request = route.request();
    const postData = request.postDataJSON();

    if (postData.parent && postData.properties) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          object: 'page',
          id: 'mock-page-id',
          url: 'https://www.notion.so/mock-page-id',
          properties: postData.properties,
        }),
      });
      return;
    }

    await route.abort();
  });
};

const seedNotionOptions = async ({ context, extensionId }) => {
  const optionsPage = await context.newPage();
  await optionsPage.goto(getExtensionPageUrl(extensionId, OPTIONS_PAGE_PATH));
  await optionsPage.evaluate(async () => {
    await chrome.storage.sync.set({
      notionApiKey: 'secret_mock_key',
      notionDataSourceId: 'mock-db-id',
      notionDatabaseId: 'mock-db-id',
    });
  });
  await optionsPage.close();
};

const resolveExampleTabId = async ({ context, extensionId }) => {
  const setupPage = await context.newPage();
  await setupPage.goto(getExtensionPageUrl(extensionId, OPTIONS_PAGE_PATH));

  const actualTabId = await setupPage.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const target = tabs.find(tab => tab.url?.includes('example.com'));
    return target ? target.id : null;
  });

  await setupPage.close();
  return actualTabId;
};

const getServiceWorker = async context => {
  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent('serviceworker');
  }
  return worker;
};

const mockActiveExampleTabQuery = async (worker, actualTabId) => {
  await worker.evaluate(mockId => {
    const originalQuery = chrome.tabs.query;
    chrome.tabs.query = function (queryInfo, onQuery) {
      if (queryInfo.active && queryInfo.currentWindow) {
        const mockTab = {
          id: mockId,
          url: 'https://example.com/',
          title: 'Example Domain',
          active: true,
          windowId: 1,
        };
        if (onQuery) {
          onQuery([mockTab]);
        }
        return Promise.resolve([mockTab]);
      }

      if (originalQuery) {
        const result = originalQuery.call(this, queryInfo, onQuery);
        return result ?? Promise.resolve([]);
      }

      if (onQuery) {
        onQuery([]);
      }
      return Promise.resolve([]);
    };
  }, actualTabId);
};

const triggerSavePageFromPopup = async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(getExtensionPageUrl(extensionId, POPUP_PAGE_PATH));
  await popup.waitForLoadState('networkidle');

  const response = await popup.evaluate(timeoutMs => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Save timeout'));
      }, timeoutMs);

      chrome.runtime.sendMessage({ action: 'savePage' }, response => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }, SAVE_TIMEOUT_MS);

  await popup.close();
  return response;
};

test('Should save page to Notion successfully', async ({ page, extensionId, context }) => {
  await mockNotionPageCreation(context);
  await seedNotionOptions({ context, extensionId });

  await page.goto(EXAMPLE_URL);
  await page.bringToFront();

  const actualTabId = await resolveExampleTabId({ context, extensionId });
  expect(
    actualTabId,
    'example.com tab not found: cannot proceed with mocking chrome.tabs.query'
  ).not.toBeNull();

  const worker = await getServiceWorker(context);
  await mockActiveExampleTabQuery(worker, actualTabId);

  const response = await triggerSavePageFromPopup({ context, extensionId });

  expect(response.success).toBe(true);
  expect(response.created).toBe(true);
  expect(typeof response.blockCount).toBe('number');
  expect(response.blockCount).toBeGreaterThanOrEqual(0);
});
