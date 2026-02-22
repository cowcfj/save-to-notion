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

        // 2. 透過標準擴充功能訊息機制觸發 UI (取代在 Main World 中呼叫)
        // 使用重試邏輯等待 notionHighlighter 初始化完成（監聽器已同步就緒，但物件需非同步建立）
        let showToolbarResult = null;
        for (let attempt = 0; attempt < 10; attempt++) {
          if (attempt > 0) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          try {
            showToolbarResult = await chrome.tabs.sendMessage(tabId, { action: 'showToolbar' });
            if (showToolbarResult?.success) {
              break;
            }
          } catch {
            // 連線尚未就緒，繼續重試
          }
        }
        if (!showToolbarResult?.success) {
          throw new Error(
            `showToolbar failed after retries: ${showToolbarResult?.error ?? 'no response'}`
          );
        }

        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }, targetTabId);

    if (!injectionResult.success) {
      throw new Error(`Injection failed: ${injectionResult.error}`);
    }

    // 4. 驗證工具列存在
    await page.waitForSelector('#notion-highlighter-v2', {
      timeout: 5000,
      state: 'attached',
    });

    const isToolbarPresent = await page.evaluate(() => {
      return Boolean(document.querySelector('#notion-highlighter-v2'));
    });

    expect(isToolbarPresent).toBe(true);
  });
});
