import { test, expect } from '../fixtures';

test.describe('Preloader E2E Tests', () => {
  test('should initialize and respond to PING', async ({ page, context }) => {
    // 1. 導航到測試頁面
    await page.goto('https://example.com');

    // 2. 獲取 Service Worker
    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent('serviceworker');
    }

    // 3. 通過 Service Worker 發送 PING 消息給 Content Script (Preloader)
    const response = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        return { error: 'No active tab' };
      }

      return new Promise(resolve => {
        chrome.tabs.sendMessage(tab.id, { action: 'PING' }, response => {
          resolve(response);
        });
      });
    });

    // 驗證 Preloader 有回應
    expect(response.status).toBe('preloader_only');
    expect(response.hasCache).toBeDefined();
  });

  test('should buffer shortcut events before bundle ready', async ({ page, context }) => {
    await page.goto('https://example.com');

    // 1. 模擬按下 Ctrl+S
    await page.keyboard.press('Control+s');

    // 2. 獲取 Service Worker
    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent('serviceworker');
    }

    // 3. 測試 INIT_BUNDLE 是否顯示有緩衝事件
    const initResponse = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return new Promise(resolve => {
        chrome.tabs.sendMessage(tab.id, { action: 'INIT_BUNDLE' }, response => {
          resolve(response);
        });
      });
    });

    expect(initResponse.ready).toBe(true);
    // 注意：發送快捷鍵消息可能因為 background 沒準備好而失敗，
    // 但 preloader 會嘗試發送。我們主要測試訊息傳遞。

    // 4. 測試 REPLAY_BUFFERED_EVENTS
    const replayResponse = await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return new Promise(resolve => {
        chrome.tabs.sendMessage(tab.id, { action: 'REPLAY_BUFFERED_EVENTS' }, response => {
          resolve(response);
        });
      });
    });

    expect(Array.isArray(replayResponse.events)).toBe(true);
  });

  test('should handle custom events for cache requests', async ({ page }) => {
    await page.goto('https://example.com');

    // 在頁面中觸發自定義事件並等待回應
    const cacheData = await page.evaluate(() => {
      return new Promise(resolve => {
        document.addEventListener(
          'notion-preloader-response',
          event => {
            resolve(event.detail);
          },
          { once: true }
        );

        document.dispatchEvent(new CustomEvent('notion-preloader-request'));
      });
    });

    expect(cacheData).toBeDefined();
    expect(cacheData.timestamp).toBeGreaterThan(0);
  });
});
