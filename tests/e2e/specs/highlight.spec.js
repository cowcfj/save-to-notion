import { test, expect } from '../fixtures';

test.describe('Highlighting Feature', () => {
  test('should inject highlighter script via direct Service Worker injection', async ({
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
              lastVerifiedAt: Date.now(),
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

    // 獲取 Service Worker
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker');
    }

    // === 方案A：直接在Service Worker中注入腳本 ===
    // 繞過startHighlight訊息處理器，直接呼叫chrome.scripting.executeScript()
    const injectionResult = await serviceWorker.evaluate(async tabId => {
      try {
        // 1. 注入 content.bundle.js
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['dist/content.bundle.js'],
        });

        // 2. 輪詢等待初始化並顯示工具列
        const checkAndShow = async () => {
          const result = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              if (window.notionHighlighter && window.HighlighterV2) {
                window.notionHighlighter.show();
                return {
                  ready: true,
                  hasToolbar: Boolean(document.getElementById('notion-highlighter-v2')),
                };
              }
              return { ready: false };
            },
          });
          return result[0]?.result;
        };

        // 等待最多5秒
        for (let i = 0; i < 50; i++) {
          const status = await checkAndShow();
          if (status?.ready) {
            return { success: true, status };
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        return { success: false, error: 'Timeout waiting for highlighter initialization' };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }, targetTabId);

    if (!injectionResult.success) {
      throw new Error(`Injection failed: ${injectionResult.error}`);
    }

    // 3. 驗證工具列存在
    await page.waitForSelector('#notion-highlighter-v2', {
      timeout: 5000,
      state: 'attached',
    });

    const isToolbarPresent = await page.evaluate(() => {
      return Boolean(document.getElementById('notion-highlighter-v2'));
    });

    expect(isToolbarPresent).toBe(true);
  });
});
