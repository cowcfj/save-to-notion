/**
 * @jest-environment jsdom
 */

/* skipcq: JS-0255 */

/**
 * migrationHandlers.js 單元測試
 *
 * 重點測試安全性驗證邏輯 validatePrivilegedRequest
 */

import { createMigrationHandlers } from '../../../../scripts/background/handlers/migrationHandlers.js';

// Mock Logger
global.Logger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock chrome API
global.chrome = {
  runtime: {
    id: 'test-extension-id',
    lastError: null,
  },
  tabs: {
    query: jest.fn(),
    create: jest.fn(),
    remove: jest.fn(),
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
      hasListener: jest.fn(),
    },
    get: jest.fn(),
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
    },
  },
  scripting: {
    executeScript: jest.fn(),
  },
};

const defaultSender = {
  id: 'test-extension-id',
  url: 'chrome-extension://test-extension-id/popup.html',
};

describe('migrationHandlers', () => {
  let handlers = null;
  let mockServices = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockServices = {}; // 目前 migrationHandlers 不依賴具體 services
    handlers = createMigrationHandlers(mockServices);
  });

  describe('validatePrivilegedRequest Security Checks', () => {
    // 應該允許的請求場景
    describe.each([
      {
        scenario: '來自 Popup/Background (無 tab 對象)',
        sender: {
          id: 'test-extension-id',
          // tab undefined
        },
      },
      {
        scenario: '來自 Options Page (在 Tab 中打開)',
        sender: {
          id: 'test-extension-id',
          tab: { id: 123 },
          url: 'chrome-extension://test-extension-id/options.html',
        },
      },
    ])('應該允許: $scenario', ({ sender }) => {
      test('安全性檢查通過', async () => {
        const sendResponse = jest.fn();
        const request = { url: 'https://example.com' };

        chrome.storage.local.get.mockResolvedValue({});

        await handlers.migration_execute(request, sender, sendResponse);

        // 正面斷言：驗證成功路徑被執行
        // 如果安全性檢查通過，應該會調用 storage.local.get 來查詢數據
        expect(chrome.storage.local.get).toHaveBeenCalled();

        // 負面斷言：確認沒有返回拒絕訪問錯誤
        expect(sendResponse).not.toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
        );
      });
    });

    // 應該拒絕的請求場景
    describe.each([
      {
        scenario: '來自 Content Script',
        sender: {
          id: 'test-extension-id',
          tab: { id: 456 },
          url: 'https://malicious-site.com',
        },
      },
      {
        scenario: '來自其他擴充功能',
        sender: {
          id: 'other-extension-id',
        },
      },
      {
        scenario: '來自 Content Script (sender.url 為網頁 URL)',
        sender: {
          id: 'test-extension-id',
          tab: { id: 789 },
          url: 'https://google.com',
        },
      },
    ])('應該拒絕: $scenario', ({ sender }) => {
      test('安全性檢查失敗', async () => {
        const sendResponse = jest.fn();
        const request = { url: 'https://example.com' };

        await handlers.migration_execute(request, sender, sendResponse);

        expect(sendResponse).toHaveBeenCalledWith(
          expect.objectContaining({ error: '拒絕訪問：此操作僅限擴充功能內部調用' })
        );
      });
    });
  });

  describe('migration_delete', () => {
    test('應該成功刪除現有數據', async () => {
      const url = 'https://example.com/data';
      const sendResponse = jest.fn();

      chrome.storage.local.get.mockResolvedValue({ [`highlights_${url}`]: [{ id: '1' }] });
      chrome.storage.local.remove.mockResolvedValue();

      await handlers.migration_delete({ url }, defaultSender, sendResponse);

      expect(chrome.storage.local.remove).toHaveBeenCalledWith(`highlights_${url}`);
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('數據不存在時應返回成功訊息', async () => {
      const url = 'https://example.com/no-data';
      const sendResponse = jest.fn();

      chrome.storage.local.get.mockResolvedValue({});

      await handlers.migration_delete({ url }, defaultSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ message: '數據不存在，無需刪除' })
      );
    });
  });

  describe('migration_batch', () => {
    test('應該成功批量遷移數據並轉換格式', async () => {
      const urls = ['https://a.com', 'https://b.com'];
      const sendResponse = jest.fn();

      chrome.storage.local.get.mockImplementation(key => {
        if (key === 'highlights_https://a.com') {
          return Promise.resolve({ 'highlights_https://a.com': [{ id: '1' }] });
        }
        if (key === 'highlights_https://b.com') {
          return Promise.resolve({ 'highlights_https://b.com': [{ id: '2' }] });
        }
        return Promise.resolve({});
      });

      await handlers.migration_batch({ urls }, defaultSender, sendResponse);

      expect(chrome.storage.local.set).toHaveBeenCalledTimes(2);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          results: expect.objectContaining({ success: 2 }),
        })
      );
    });

    test('應該拒絕無效的 URLs', async () => {
      const urls = ['invalid-url'];
      const sendResponse = jest.fn();

      await handlers.migration_batch({ urls }, defaultSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('拒絕訪問') })
      );
    });
  });

  describe('migration_get_pending', () => {
    test('應該正確回收待處理和失敗的項目', async () => {
      const sendResponse = jest.fn();
      chrome.storage.local.get.mockResolvedValue({
        'highlights_https://pending.com': { highlights: [{ id: 'p1', needsRangeInfo: true }] },
        'highlights_https://failed.com': { highlights: [{ id: 'f1', migrationFailed: true }] },
        other_key: 'random',
      });

      await handlers.migration_get_pending({}, defaultSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          totalPages: 1,
          totalPending: 1,
          totalFailed: 1,
        })
      );
    });
  });

  describe('migration_delete_failed', () => {
    test('應該只刪除標記為失敗的標註', async () => {
      const url = 'https://example.com/mixed';
      const sendResponse = jest.fn();
      const existingData = {
        url,
        highlights: [
          { id: 'good', text: 'ok' },
          { id: 'bad', migrationFailed: true },
        ],
      };

      chrome.storage.local.get.mockResolvedValue({ [`highlights_${url}`]: existingData });

      await handlers.migration_delete_failed({ url }, defaultSender, sendResponse);

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [`highlights_${url}`]: expect.objectContaining({
            highlights: [{ id: 'good', text: 'ok' }],
          }),
        })
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, deletedCount: 1 })
      );
    });
  });

  describe('migration_batch_delete', () => {
    test('應該成功批量刪除多個 URL 的數據', async () => {
      const urls = ['https://del1.com', 'https://del2.com'];
      const sendResponse = jest.fn();

      await handlers.migration_batch_delete({ urls }, defaultSender, sendResponse);

      expect(chrome.storage.local.remove).toHaveBeenCalledWith([
        'highlights_https://del1.com',
        'highlights_https://del2.com',
      ]);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, count: 2 })
      );
    });
  });

  describe('migration_execute (Unit Mock)', () => {
    test('應該處理無數據需要遷移的情況', async () => {
      const url = 'https://example.com/empty';
      const sendResponse = jest.fn();
      chrome.storage.local.get.mockResolvedValue({});

      await handlers.migration_execute({ url }, defaultSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ message: '無數據需要遷移' })
      );
    });

    test('應該處理分頁加載成功後的腳本注入流程', async () => {
      const url = 'https://example.com/full';
      const sendResponse = jest.fn();

      // 1. Storage 有數據
      chrome.storage.local.get.mockResolvedValue({ [`highlights_${url}`]: [{ id: '1' }] });

      // 2. Mock Tab 操作
      chrome.tabs.query.mockResolvedValue([]); // 無現成分頁
      chrome.tabs.create.mockResolvedValue({ id: 999 });
      chrome.tabs.get.mockResolvedValue({ id: 999, status: 'complete' });

      // 3. Mock Scripting
      chrome.scripting.executeScript.mockResolvedValueOnce([]); // 注入檔案
      chrome.scripting.executeScript.mockResolvedValueOnce([{ result: { ready: true } }]); // 準備就緒檢查
      chrome.scripting.executeScript.mockResolvedValueOnce([
        {
          result: { statistics: { newHighlightsCreated: 5 } },
        },
      ]); // 執行遷移

      await handlers.migration_execute({ url }, defaultSender, sendResponse);

      expect(chrome.tabs.create).toHaveBeenCalled();
      expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(3);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, count: 5 })
      );
      expect(chrome.tabs.remove).toHaveBeenCalledWith(999);
    });

    test('應該優雅處理分頁清理失敗', async () => {
      const url = 'https://example.com/cleanup-fail';
      const sendResponse = jest.fn();

      // Ensure data exists so logic proceeds to tab creation
      chrome.storage.local.get.mockResolvedValue({ [`highlights_${url}`]: [{ id: '1' }] });
      chrome.tabs.query.mockResolvedValue([]); // Force create new tab

      chrome.tabs.create.mockResolvedValue({ id: 888 });
      chrome.tabs.get.mockResolvedValue({ id: 888, status: 'complete' });

      // Mock cleanup failure
      chrome.tabs.remove.mockRejectedValue(new Error('Tab closed'));

      // Mock executeScript to avoid errors during execution phase causing early exit before cleanup
      // Inject:
      chrome.scripting.executeScript.mockResolvedValueOnce([]);
      // Ready check:
      chrome.scripting.executeScript.mockResolvedValueOnce([{ result: { ready: true } }]);
      // Execute:
      chrome.scripting.executeScript.mockResolvedValueOnce([{ result: { success: true } }]);

      await handlers.migration_execute({ url }, defaultSender, sendResponse);

      // 驗證即使清理失敗，主流程也是成功的
      // 重點是代碼執行沒有崩潰
      expect(chrome.tabs.remove).toHaveBeenCalledWith(888);
      expect(sendResponse).toHaveBeenCalled();
    });

    test('應該處理腳本就緒檢查時的錯誤', async () => {
      const url = 'https://example.com/script-fail';
      const sendResponse = jest.fn();

      chrome.storage.local.get.mockResolvedValue({ [`highlights_${url}`]: [{ id: '1' }] });
      chrome.tabs.query.mockResolvedValue([{ id: 777 }]); // Use existing tab

      // Inject script success
      chrome.scripting.executeScript.mockResolvedValueOnce([]);

      // ready check fails once then succeeds
      chrome.scripting.executeScript.mockRejectedValueOnce(new Error('Context invalid'));
      chrome.scripting.executeScript.mockResolvedValueOnce([{ result: { ready: true } }]);

      // migrate succeeds
      chrome.scripting.executeScript.mockResolvedValueOnce([{ result: { success: true } }]);

      await handlers.migration_execute({ url }, defaultSender, sendResponse);

      expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(4); // Inject + 2 checks + execute
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });
});
