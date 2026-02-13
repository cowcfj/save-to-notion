/**
 * Background.js require-style 整合測試
 *
 * 目標：
 * - 真正 require `scripts/background.js` 以納入覆蓋率（非僅測試 testable 包裝）
 * - 透過事件發射器模擬 onInstalled/onMessage，覆蓋初始化與訊息處理路徑
 */

// 簡單事件工具：保存 listener 並允許 _emit 觸發
import { flushPromises, setupChromeMock } from '../../helpers/integration-test-helper.js';

describe('scripts/background.js require integration', () => {
  let originalChrome = null;
  let originalFetch = null;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();

    // 保存原始全域
    originalChrome = globalThis.chrome;
    originalFetch = globalThis.fetch;

    // 建立可觸發的 Chrome 模擬
    const { chromeMock } = setupChromeMock(
      {},
      {
        notionApiKey: 'test-key',
      }
    );

    // Customize for this test
    chromeMock.runtime.id = 'test-id';
    chromeMock.tabs.query = jest.fn((queryInfo, sendTabs) => {
      const result = [
        { id: 1, url: 'https://example.com/article', title: 'Article', active: true },
      ];
      if (sendTabs) {
        sendTabs(result);
      }
      return Promise.resolve(result);
    });
    chromeMock.tabs.create = jest.fn(createProps => Promise.resolve({ id: 99, ...createProps }));
    chromeMock.tabs.sendMessage = jest.fn((tabId, message, optionsOrCallback, callback) => {
      // Handle optional options argument
      let cb = callback;
      if (typeof optionsOrCallback === 'function') {
        cb = optionsOrCallback;
      }

      const response = { success: true };
      if (cb) {
        cb(response);
      }
      return Promise.resolve(response);
    });

    globalThis.chrome = chromeMock;

    // 全域 fetch mock（避免網路）
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ archived: false, results: [] }),
        text: () => Promise.resolve('ok'),
      })
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    // 還原全域
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  });

  test('onInstalled(update) 會顯示更新通知並傳送版本訊息', async () => {
    // 設置 tabs.get 返回已完成狀態（模擬頁面快速載入）
    chrome.tabs.get = jest.fn(() => Promise.resolve({ id: 99, status: 'complete' }));

    // 載入背景腳本（會註冊事件 listener）
    jest.isolateModules(() => {
      const bg = require('../../../scripts/background.js');
      // 清理 interval 以避免 open handles
      bg._test?.clearCleanupInterval();
    });

    // 觸發安裝事件（更新場景）
    // 使用次版本升級（2.8.x -> 2.9.5）以命中顯示更新通知的條件
    chrome.runtime.onInstalled._emit({ reason: 'update', previousVersion: '2.8.5' });

    // 等待異步操作完成
    await flushPromises();

    // 應開啟更新通知頁
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: expect.stringContaining('update-notification/update-notification.html'),
      active: true,
    });

    // 頁面載入完成後應發送版本訊息（事件驅動，不再使用 setTimeout）
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        type: 'UPDATE_INFO',
        previousVersion: '2.8.5',
        currentVersion: '2.9.5',
      })
    );
  });

  test('onMessage(openNotionPage) 會開新分頁並回傳成功', async () => {
    jest.isolateModules(() => {
      const bg = require('../../../scripts/background.js');
      // 清理 interval 以避免 open handles
      bg._test?.clearCleanupInterval();
    });

    // 預先寫入 storage 以通過 handleOpenNotionPage 的檢查
    await new Promise(resolve => {
      chrome.storage.local.set(
        {
          'saved_https://www.notion.so/test': {
            notionUrl: 'https://www.notion.so/test',
            notionPageId: 'test-page-id',
          },
        },
        resolve
      );
    });

    const sendResponse = jest.fn();
    const sender = { id: 'test-id', url: 'chrome-extension://test-id/popup.html' };
    chrome.runtime.onMessage._emit(
      { action: 'openNotionPage', url: 'https://www.notion.so/test' },
      sender,
      sendResponse
    );

    // getPreloaderData 內部使用 Promise.race + setTimeout 超時機制
    // 在 fake timers 下需要推進計時器讓超時（或 sendMessage 回調）完成
    await flushPromises(10);
    jest.advanceTimersByTime(1000);
    await flushPromises(10);

    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://www.notion.so/test' });

    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  // 備註：checkPageStatus 路徑較重，已由其他單元測試覆蓋。
  // 這裡側重於初始化（onInstalled）與開頁動作（openNotionPage）的真實路徑，以增進 scripts 覆蓋率。

  test('onMessage(exportDebugLogs) should handle async export and return structured response', async () => {
    const mockExportLogs = jest.fn().mockReturnValue({
      filename: 'test.json',
      content: '{}',
      mimeType: 'application/json',
      count: 0,
    });

    jest.isolateModules(() => {
      // Mock LogExporter specifically for this isolation
      jest.doMock('../../../scripts/utils/LogExporter.js', () => ({
        LogExporter: {
          exportLogs: mockExportLogs,
        },
      }));

      // Require background to register listeners with mocked dependencies
      const bg = require('../../../scripts/background.js');
      bg._test?.clearCleanupInterval();
    });

    const sendResponse = jest.fn();
    const sender = { id: 'test-id' };

    // Emit message
    chrome.runtime.onMessage._emit(
      { action: 'exportDebugLogs', format: 'json' },
      sender,
      sendResponse
    );

    await flushPromises();

    // Expect exportLogs to be called
    expect(mockExportLogs).toHaveBeenCalledWith({ format: 'json' });

    // Expect successful structured response
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: {
        filename: 'test.json',
        content: '{}',
        mimeType: 'application/json',
        count: 0,
      },
    });
  });

  test('onMessage(exportDebugLogs) should handle errors gracefully', async () => {
    const mockExportLogs = jest.fn().mockImplementation(() => {
      throw new Error('Export failed');
    });

    jest.isolateModules(() => {
      jest.doMock('../../../scripts/utils/LogExporter.js', () => ({
        LogExporter: {
          exportLogs: mockExportLogs,
        },
      }));

      const bg = require('../../../scripts/background.js');
      bg._test?.clearCleanupInterval();
    });

    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit(
      { action: 'exportDebugLogs', format: 'json' },
      { id: 'test-id' },
      sendResponse
    );

    await flushPromises();

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: '操作失敗，請稍後再試。如問題持續，請查看擴充功能設置',
      })
    );
  });
});
