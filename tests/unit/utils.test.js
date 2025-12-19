/**
 * @jest-environment jsdom
 */

// Mock chrome API
const mockChrome = {
  storage: {
    local: {
      set: jest.fn(),
      get: jest.fn(),
      remove: jest.fn(),
    },
  },
  runtime: {
    id: 'mock-extension-id',
    lastError: null,
    sendMessage: jest.fn((payload, sendResponse) => {
      if (typeof sendResponse === 'function') {
        sendResponse();
      }
    }),
    getManifest: jest.fn(() => ({ version_name: 'dev' })),
  },
};

// 在測試開始前設置全局 chrome 對象
global.chrome = mockChrome;

// 啟用前端 Logger 的開發模式（通過 Manifest mock）
// window.__FORCE_LOG__ 不再使用

// 重置模塊緩存並重新加載模組
jest.resetModules();
require('../../scripts/utils/Logger.js');
require('../../scripts/utils/StorageUtil.js');

describe('StorageUtil', () => {
  beforeEach(() => {
    // 清理 mock
    jest.clearAllMocks();
    mockChrome.runtime.lastError = null;

    // 清理 localStorage
    localStorage.clear();
  });

  describe('saveHighlights', () => {
    test('應該成功保存標註到 chrome.storage', async () => {
      mockChrome.storage.local.set.mockImplementation((data, done) => {
        done();
      });

      const result = await window.StorageUtil.saveHighlights('https://example.com/page', [
        { text: 'test highlight' },
      ]);

      expect(mockChrome.storage.local.set).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    test('應該在 chrome.storage 失敗時回退到 localStorage', async () => {
      mockChrome.storage.local.set.mockImplementation((data, done) => {
        mockChrome.runtime.lastError = { message: 'Storage failed' };
        done();
      });

      await window.StorageUtil.saveHighlights('https://example.com/page', [
        { text: 'test highlight' },
      ]);

      expect(localStorage.getItem('highlights_https://example.com/page')).toBeTruthy();
    });

    test('應該處理 chrome.storage 不可用的情況', async () => {
      // 模擬 chrome.storage 不可用
      const originalChrome = global.chrome;
      global.chrome = undefined;

      await window.StorageUtil.saveHighlights('https://example.com/page', [
        { text: 'test highlight' },
      ]);

      expect(localStorage.getItem('highlights_https://example.com/page')).toBeTruthy();

      // 恢復 chrome 對象
      global.chrome = originalChrome;
    });
  });

  describe('loadHighlights', () => {
    test('應該從 chrome.storage 加載標註', async () => {
      mockChrome.storage.local.get.mockImplementation((keys, done) => {
        const data = {
          'highlights_https://example.com/page': [{ text: 'test highlight' }],
        };
        done(data);
      });

      const result = await window.StorageUtil.loadHighlights('https://example.com/page');
      expect(result).toEqual([{ text: 'test highlight' }]);
    });

    test('應該處理舊格式數據（數組）', async () => {
      mockChrome.storage.local.get.mockImplementation((keys, done) => {
        const data = {
          'highlights_https://example.com/page': [{ text: 'old format' }],
        };
        done(data);
      });

      const result = await window.StorageUtil.loadHighlights('https://example.com/page');
      expect(result).toEqual([{ text: 'old format' }]);
    });

    test('應該處理新格式數據（對象）', async () => {
      mockChrome.storage.local.get.mockImplementation((keys, done) => {
        const data = {
          'highlights_https://example.com/page': {
            url: 'https://example.com/page',
            highlights: [{ text: 'new format' }],
          },
        };
        done(data);
      });

      const result = await window.StorageUtil.loadHighlights('https://example.com/page');
      expect(result).toEqual([{ text: 'new format' }]);
    });

    test('應該在 chrome.storage 無數據時回退到 localStorage', async () => {
      mockChrome.storage.local.get.mockImplementation((keys, done) => {
        done({});
      });

      localStorage.setItem(
        'highlights_https://example.com/page',
        JSON.stringify([{ text: 'localStorage highlight' }])
      );

      const result = await window.StorageUtil.loadHighlights('https://example.com/page');
      expect(result).toEqual([{ text: 'localStorage highlight' }]);
    });

    test('應該處理 chrome.storage 不可用的情況', async () => {
      // 模擬 chrome.storage 不可用
      const originalChrome = global.chrome;
      global.chrome = undefined;

      localStorage.setItem(
        'highlights_https://example.com/page',
        JSON.stringify([{ text: 'localStorage highlight' }])
      );

      const result = await window.StorageUtil.loadHighlights('https://example.com/page');
      expect(result).toEqual([{ text: 'localStorage highlight' }]);

      // 恢復 chrome 對象
      global.chrome = originalChrome;
    });
  });

  describe('clearHighlights', () => {
    test('應該清除 chrome.storage 和 localStorage 中的標註', async () => {
      mockChrome.storage.local.remove.mockImplementation((keys, callback) => {
        callback();
      });

      localStorage.setItem(
        'highlights_https://example.com/page',
        JSON.stringify([{ text: 'test highlight' }])
      );

      await window.StorageUtil.clearHighlights('https://example.com/page');

      expect(mockChrome.storage.local.remove).toHaveBeenCalled();
      expect(localStorage.getItem('highlights_https://example.com/page')).toBeNull();
    });

    test('應該處理 chrome.storage 不可用的情況', async () => {
      // 模擬 chrome.storage 不可用
      const originalChrome = global.chrome;
      global.chrome = { storage: undefined };

      localStorage.setItem(
        'highlights_https://example.com/page',
        JSON.stringify([{ text: 'test highlight' }])
      );

      await window.StorageUtil.clearHighlights('https://example.com/page');

      expect(localStorage.getItem('highlights_https://example.com/page')).toBeNull();

      // 恢復 chrome 對象
      global.chrome = originalChrome;
    });
  });
});

describe('Logger', () => {
  beforeEach(() => {
    // 每個測試重置 sendMessage，避免前序呼叫的影響
    mockChrome.runtime.sendMessage.mockClear();
  });

  test('應該正確記錄 debug 信息（透過背景 sink）', () => {
    window.Logger.debug('test message', 'arg1', 'arg2');
    expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'devLogSink',
        level: 'debug',
        message: 'test message',
        args: ['arg1', 'arg2'],
      }),
      expect.any(Function)
    );
  });

  test('應該正確記錄 info 信息（透過背景 sink）', () => {
    window.Logger.info('test message', 'arg1');
    expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'devLogSink',
        level: 'info',
        message: 'test message',
        args: ['arg1'],
      }),
      expect.any(Function)
    );
  });

  test('應該正確記錄 warn 信息（透過背景 sink）', () => {
    window.Logger.warn('test message');
    expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'devLogSink',
        level: 'warn',
        message: 'test message',
      }),
      expect.any(Function)
    );
  });

  test('應該正確記錄 error 信息（透過背景 sink）', () => {
    window.Logger.error('test message', 'error');
    expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'devLogSink',
        level: 'error',
        message: 'test message',
        args: ['error'],
      }),
      expect.any(Function)
    );
  });
});
