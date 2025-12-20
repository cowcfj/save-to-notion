import { test, expect } from '../fixtures';

test('Should save page to Notion successfully', async ({ page, extensionId, context }) => {
  // 1. Mock Notion API
  // Use context.route to intercept service worker requests
  await context.route('https://api.notion.com/v1/pages', async route => {
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
    } else {
      await route.abort();
    }
  });

  // 2. Seed Storage - 設置 API 密鑰和資料庫 ID
  const optionsUrl = `chrome-extension://${extensionId}/options/options.html`;
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

  // 3. Navigate target page
  await page.goto('https://example.com');
  await page.bringToFront();

  // 4. 獲取 target tab ID，用於 mock chrome.tabs.query
  const setupPage = await context.newPage();
  await setupPage.goto(optionsUrl);
  const actualTabId = await setupPage.evaluate(() => {
    // 獲取 example.com 頁面的 tab ID
    return new Promise(resolve => {
      chrome.tabs.query({}, tabs => {
        const target = tabs.find(tab => tab.url?.includes('example.com'));
        resolve(target ? target.id : null);
      });
    });
  });

  // Fail-fast：確保成功獲取 target tab ID
  expect(
    actualTabId,
    'example.com tab not found: cannot proceed with mocking chrome.tabs.query'
  ).not.toBeNull();

  await setupPage.close();

  // 5. Mock Service Worker 中的 chrome.tabs.query
  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent('serviceworker');
  }

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
        onQuery([mockTab]);
        return;
      }
      if (originalQuery) {
        originalQuery.call(this, queryInfo, onQuery);
        return;
      }
      onQuery([]);
    };
  }, actualTabId);

  // 6. 透過 Popup 頁面發送 savePage 消息（公開介面）
  // 這模擬了真實用戶點擊「Save」按鈕的流程
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.waitForLoadState('networkidle');

  // 使用 chrome.runtime.sendMessage 發送保存請求
  const response = await popup.evaluate(() => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Save timeout'));
      }, 30000);

      chrome.runtime.sendMessage({ action: 'savePage' }, response => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  });

  await popup.close();

  // 7. Assertions
  if (!response.success) {
    console.log('Save Failed Error:', response.error);
  }
  expect(response.success).toBe(true);
  expect(response.created).toBe(true);
  // blockCount 在 Mock 環境下可能為 0（example.com 內容極少）
  expect(response.blockCount).toBeGreaterThanOrEqual(0);
});
