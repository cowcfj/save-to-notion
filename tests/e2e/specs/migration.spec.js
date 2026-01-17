import { test, expect } from '../fixtures';

test.describe('Migration Handlers E2E Tests', () => {
  test.beforeEach(async ({ context, extensionId }) => {
    // 設置必要的 API Key 和資料庫 ID 以通過驗證
    const optionsUrl = `chrome-extension://${extensionId}/options/options.html`;
    const optionsPage = await context.newPage();
    await optionsPage.goto(optionsUrl);
    await optionsPage.evaluate(async () => {
      await chrome.storage.sync.set({
        notionApiKey: 'secret_mock_key',
        notionDataSourceId: 'mock-db-id',
      });
    });
    await optionsPage.close();
  });

  test('should handle migration_get_pending correctly', async ({ context, extensionId }) => {
    const popupUrl = `chrome-extension://${extensionId}/popup/popup.html`;
    const page = await context.newPage();
    await page.goto(popupUrl);

    // 1. 注入模擬數據
    const testUrl = 'https://example.com/migration-test';
    await page.evaluate(async url => {
      const data = {
        url,
        highlights: [{ id: 'h1', text: 'test', needsRangeInfo: true }],
      };
      await chrome.storage.local.set({ [`highlights_${url}`]: data });
    }, testUrl);

    // 2. 呼叫 migration_get_pending
    const response = await page.evaluate(() => {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'migration_get_pending' }, resolve);
      });
    });

    expect(response.success).toBe(true);
    expect(response.items.length).toBeGreaterThan(0);
    const item = response.items.find(i => i.url === testUrl);
    expect(item).toBeDefined();
    expect(item.pendingCount).toBe(1);

    await page.close();
  });

  test('should handle migration_delete correctly', async ({ context, extensionId }) => {
    const popupUrl = `chrome-extension://${extensionId}/popup/popup.html`;
    const page = await context.newPage();
    await page.goto(popupUrl);

    const testUrl = 'https://example.com/delete-test';
    // 1. 設置數據
    await page.evaluate(async url => {
      await chrome.storage.local.set({ [`highlights_${url}`]: [{ id: '1' }] });
    }, testUrl);

    // 2. 呼叫刪除
    const response = await page.evaluate(url => {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'migration_delete', url }, resolve);
      });
    }, testUrl);

    expect(response.success).toBe(true);

    // 3. 驗證已刪除
    const storageData = await page.evaluate(async url => {
      const res = await chrome.storage.local.get(`highlights_${url}`);
      return res[`highlights_${url}`];
    }, testUrl);

    expect(storageData).toBeUndefined();
    await page.close();
  });

  test('should handle migration_batch correctly', async ({ context, extensionId }) => {
    const popupUrl = `chrome-extension://${extensionId}/popup/popup.html`;
    const page = await context.newPage();
    await page.goto(popupUrl);

    const urls = ['https://a.com', 'https://b.com'];

    // 注入舊數據格式 (僅陣列)
    await page.evaluate(async testUrls => {
      for (const url of testUrls) {
        await chrome.storage.local.set({ [`highlights_${url}`]: [{ id: '1', text: 'old' }] });
      }
    }, urls);

    // 執行批量遷移
    const response = await page.evaluate(testUrls => {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'migration_batch', urls: testUrls }, resolve);
      });
    }, urls);

    expect(response.success).toBe(true);
    expect(response.results.success).toBe(2);

    // 驗證數據已轉換為新格式物件並標記 needsRangeInfo
    const checkResult = await page.evaluate(async url => {
      const res = await chrome.storage.local.get(`highlights_${url}`);
      return res[`highlights_${url}`];
    }, urls[0]);

    expect(checkResult.url).toBe(urls[0]);
    expect(checkResult.highlights[0].needsRangeInfo).toBe(true);

    await page.close();
  });

  test('should handle migration_batch_delete correctly', async ({ context, extensionId }) => {
    const popupUrl = `chrome-extension://${extensionId}/popup/popup.html`;
    const page = await context.newPage();
    await page.goto(popupUrl);

    const urls = ['https://delete1.com', 'https://delete2.com'];
    await page.evaluate(async testUrls => {
      for (const url of testUrls) {
        await chrome.storage.local.set({ [`highlights_${url}`]: [{ id: '1' }] });
      }
    }, urls);

    const response = await page.evaluate(testUrls => {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'migration_batch_delete', urls: testUrls }, resolve);
      });
    }, urls);

    expect(response.success).toBe(true);
    expect(response.count).toBe(2);

    const storageData = await page.evaluate(testUrls => {
      const keys = testUrls.map(url => `highlights_${url}`);
      return chrome.storage.local.get(keys);
    }, urls);
    expect(Object.keys(storageData).length).toBe(0);
    await page.close();
  });

  test('should handle migration_delete_failed correctly', async ({ context, extensionId }) => {
    const popupUrl = `chrome-extension://${extensionId}/popup/popup.html`;
    const page = await context.newPage();
    await page.goto(popupUrl);

    const testUrl = 'https://example.com/failed-test';
    await page.evaluate(async url => {
      await chrome.storage.local.set({
        [`highlights_${url}`]: {
          url,
          highlights: [
            { id: 'h1', text: 'good' },
            { id: 'h2', text: 'bad', migrationFailed: true },
          ],
        },
      });
    }, testUrl);

    const response = await page.evaluate(url => {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'migration_delete_failed', url }, resolve);
      });
    }, testUrl);

    expect(response.success).toBe(true);
    expect(response.deletedCount).toBe(1);

    const checkResult = await page.evaluate(async url => {
      const res = await chrome.storage.local.get(`highlights_${url}`);
      return res[`highlights_${url}`];
    }, testUrl);
    expect(checkResult.highlights.length).toBe(1);
    expect(checkResult.highlights[0].id).toBe('h1');
    await page.close();
  });
});
