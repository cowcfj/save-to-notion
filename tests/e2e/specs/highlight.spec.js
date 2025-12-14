import { test, expect } from '../fixtures';

test.describe('Highlighting Feature', () => {
  test('should inject highlighter script when clicking "Start Highlighting"', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto('https://example.com');

    // 0. 初始化 Extension Storage State & 獲取 Target Tab ID
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options/options.html`);

    const targetTabId = await optionsPage.evaluate(async () => {
      const mockUrl = 'https://example.com/';
      const mockPageId = 'test-page-id';

      // 1. Set API Config
      await new Promise(resolve => {
        chrome.storage.sync.set(
          {
            notionApiKey: 'secret_test_key',
            notionDatabaseId: 'test_db_id',
          },
          resolve
        );
      });

      // 2. Set Saved Page State
      await new Promise(resolve => {
        chrome.storage.local.set(
          {
            [`saved_${mockUrl}`]: {
              notionPageId: mockPageId,
              notionUrl: 'https://notion.so/test-page',
              title: 'Example Domain',
              savedAt: Date.now(),
              lastVerifiedAt: Date.now(), // Ensure it's fresh to avoid API check
            },
          },
          resolve
        );
      });

      // 3. Get the ID of the target page (example.com)
      return new Promise(resolve => {
        chrome.tabs.query({}, tabs => {
          const target = tabs.find(tab => tab.url?.includes('example.com'));
          resolve(target ? target.id : null);
        });
      });
    });
    await optionsPage.close();

    expect(targetTabId).not.toBeNull();

    // 4. Mock chrome.tabs.query IN BACKGROUND SERVICE WORKER
    // 這是關鍵：checkPageStatus 是在 Background 運行的，它需要"看到" example.com 是 active tab
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker');
    }

    await serviceWorker.evaluate(mockId => {
      // 保存原始引用
      const originalQuery = chrome.tabs.query;

      // 覆寫 query 方法
      chrome.tabs.query = function (queryInfo, callback) {
        // Background Script 查找 active tab
        if (queryInfo.active && queryInfo.currentWindow) {
          const mockTab = {
            id: mockId,
            url: 'https://example.com/',
            title: 'Example Domain',
            active: true,
            windowId: 1,
          };

          callback([mockTab]);
          return;
        }
        if (originalQuery) {
          originalQuery.call(this, queryInfo, callback);
          return;
        }

        callback([]);
      };
    }, targetTabId);

    // 1. 打開 Popup
    const popup = await context.newPage();

    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await popup.waitForLoadState('networkidle');

    // 2. 點擊 "Start Highlighting" 按鈕
    const highlightBtn = popup.locator('#highlight-button');
    await expect(highlightBtn).toBeVisible();
    await highlightBtn.click();

    // 3. 驗證頁面是否注入了標註腳本
    // 等待腳本執行
    await page.waitForTimeout(500);

    // 3. 驗證頁面是否注入了標註腳本
    // 檢查 Toolbar 容器是否存在於 DOM 中
    // 這是最準確的方法，因為 Content Scripts 的 window 對象與頁面 context 隔離，
    // 但它們共享 DOM。Highlighter V2 會注入 #notion-highlighter-v2 容器。
    const isToolbarPresent = await page.evaluate(() => {
      return Boolean(document.getElementById('notion-highlighter-v2'));
    });

    expect(isToolbarPresent).toBe(true);
  });
});
