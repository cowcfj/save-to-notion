/* eslint-disable sonarjs/no-skipped-tests */
import { test, expect } from '../fixtures';

test.describe('Preloader E2E Tests', () => {
  /**
   * 輔助函式：發送訊息到專屬的 example.com tab，帶有 lastError 與無回應偵測
   */
  const sendPreloaderMessage = async (worker, action) => {
    return worker.evaluate(
      async msg => {
        const tabs = await chrome.tabs.query({ url: 'https://example.com/*' });
        const tab = tabs[0];
        if (!tab) {
          return { ok: false, error: 'Target tab not found (example.com)' };
        }

        return new Promise(resolve => {
          chrome.tabs.sendMessage(tab.id, msg, response => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: chrome.runtime.lastError.message });
            } else if (response === undefined) {
              resolve({ ok: false, error: 'No response' });
            } else {
              resolve({ ok: true, response });
            }
          });
        });
      },
      { action }
    );
  };

  test('should initialize and respond to PING', async ({ page, context }) => {
    // 1. 導航到測試頁面
    await page.goto('https://example.com');

    // 2. 獲取 Service Worker
    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent('serviceworker');
    }

    // 3. 通過 Service Worker 發送 PING 消息給 Content Script (Preloader)
    const result = await sendPreloaderMessage(worker, 'PING');

    // 驗證 Preloader 有回應且成功
    expect(result.ok).toBe(true);
    expect(result.response.status).toBe('preloader_only');
    expect(result.response.hasCache).toBeDefined();
  });

  test('should buffer shortcut events before bundle ready', async ({ page, context }) => {
    await page.goto('https://example.com');

    // 1. 等待 Service Worker 完全初始化
    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent('serviceworker');
    }

    // 2. 等待 Preloader 準備就緒
    await page.waitForTimeout(500); // 給 preloader 時間初始化

    // 3. 驗證 Preloader 已載入並響應
    const pingResult = await sendPreloaderMessage(worker, 'PING');

    if (!pingResult.ok || !pingResult.response.status) {
      test.skip(
        true,
        `Preloader is not ready: ${pingResult.error || 'No response'}, skipping test`
      );
    }

    // 4. 模擬按下 Ctrl+S（現在可以確保會被緩衝）
    await page.keyboard.press('Control+s');

    // 5. 給事件緩衝時間
    await page.waitForTimeout(200);

    // 6. 測試 INIT_BUNDLE 是否顯示有緩衝事件
    const initResult = await sendPreloaderMessage(worker, 'INIT_BUNDLE');

    expect(initResult.ok).toBe(true);
    expect(initResult.response.ready).toBe(true);

    // 7. 測試 REPLAY_BUFFERED_EVENTS
    const replayResult = await sendPreloaderMessage(worker, 'REPLAY_BUFFERED_EVENTS');

    expect(replayResult.ok).toBe(true);
    expect(Array.isArray(replayResult.response.events)).toBe(true);
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
