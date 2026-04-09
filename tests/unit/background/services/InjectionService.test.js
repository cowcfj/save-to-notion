import {
  InjectionService,
  isRestrictedInjectionUrl,
  isRecoverableInjectionError,
  getRuntimeErrorMessage,
} from '../../../../scripts/background/services/InjectionService.js';

jest.mock('../../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    success: jest.fn(),
    debug: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
  },
}));

import Logger from '../../../../scripts/utils/Logger.js';

// NOTE: We have two mocks for Logger here:
// 1. Module-level mock (jest.mock above): Intercepts direct imports of Logger in other files (e.g., helpers).
// 2. mockLogger (const below): Injected into InjectionService constructor for direct verification of service logic.
// Both are needed because the service uses dependency injection, but some static utils might import Logger directly.

// Mock chrome API
globalThis.chrome = {
  scripting: {
    executeScript: jest.fn(),
  },
  tabs: {
    sendMessage: jest.fn(),
  },
  runtime: {
    lastError: null,
  },
};

// Mock Logger
const mockLogger = {
  log: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
};

describe('InjectionService', () => {
  let service = null;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InjectionService({ logger: mockLogger });
    chrome.runtime.lastError = null;
  });

  describe('isRestrictedInjectionUrl', () => {
    it('should return true for chrome:// urls', () => {
      expect(isRestrictedInjectionUrl('chrome://extensions')).toBe(true);
    });

    it('should return true for file:// urls (local PDF, etc.)', () => {
      expect(isRestrictedInjectionUrl('file:///path/to/document.pdf')).toBe(true);
    });

    it('should return true for webstore urls', () => {
      expect(isRestrictedInjectionUrl('https://chrome.google.com/webstore/detail/xyz')).toBe(true);
      expect(isRestrictedInjectionUrl('https://chromewebstore.google.com/detail/xyz')).toBe(true);
    });

    it('should return false for normal urls', () => {
      expect(isRestrictedInjectionUrl('https://example.com')).toBe(false);
    });

    it('should return true for empty url', () => {
      expect(isRestrictedInjectionUrl('')).toBe(true);
      expect(isRestrictedInjectionUrl(null)).toBe(true);
    });
  });

  describe('isRecoverableInjectionError', () => {
    it('should identify recoverable errors', () => {
      expect(isRecoverableInjectionError('Cannot access contents of page')).toBe(true);
      expect(isRecoverableInjectionError('The tab was closed')).toBe(true);
      expect(isRecoverableInjectionError('The extensions gallery cannot be scripted.')).toBe(true);
    });

    it('should identify non-recoverable errors', () => {
      expect(isRecoverableInjectionError('SyntaxError: unexpected token')).toBe(false);
      expect(isRecoverableInjectionError('Unknown error')).toBe(false);
    });
  });

  describe('injectAndExecute', () => {
    it('should inject files successfully', async () => {
      chrome.scripting.executeScript.mockImplementation((opts, verifyResult) => verifyResult([]));

      await service.injectAndExecute(1, ['file.js']);

      expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
        expect.objectContaining({
          target: { tabId: 1 },
          files: ['file.js'],
        }),
        expect.any(Function)
      );
    });

    it('should execute function successfully', async () => {
      chrome.scripting.executeScript.mockImplementation((opts, verifyResult) =>
        verifyResult([{ result: 'foo' }])
      );

      const func = () => 'foo';
      const result = await service.injectAndExecute(1, [], func, { returnResult: true });

      expect(result).toBe('foo');
      expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
        expect.objectContaining({
          target: { tabId: 1 },
          func,
        }),
        expect.any(Function)
      );
    });

    it('should handle injection errors', async () => {
      chrome.runtime.lastError = { message: 'Injection failed' };
      chrome.scripting.executeScript.mockImplementation((opts, cb) => cb());

      await expect(service.injectAndExecute(1, ['file.js'])).rejects.toThrow('Injection failed');
    });

    it('應在注入失敗時於日誌 context 中包含 stack trace', async () => {
      const injectionError = new Error('Injection failed');
      injectionError.stack =
        'Error: Injection failed\n    at inject (InjectionService.test.js:1:1)';
      chrome.runtime.lastError = injectionError;
      chrome.scripting.executeScript.mockImplementation((opts, cb) => cb());

      await expect(service.injectAndExecute(1, ['file.js'])).rejects.toThrow('Injection failed');

      const injectErrorCall = mockLogger.error.mock.calls.find(
        ([, context]) => context?.action === 'injectAndExecute'
      );

      expect(injectErrorCall).toBeDefined();
      expect(injectErrorCall[0]).toContain('Script injection failed: Injection failed');
      expect(injectErrorCall[1]).toEqual(
        expect.objectContaining({
          action: 'injectAndExecute',
          files: ['file.js'],
          error: expect.any(Error),
        })
      );
    });

    it('should resolve recoverable errors without throwing', async () => {
      chrome.runtime.lastError = { message: 'Cannot access contents of page' };
      chrome.scripting.executeScript.mockImplementation((opts, cb) => cb());

      await expect(service.injectAndExecute(1, ['file.js'])).resolves.toBeUndefined();
      // Default logErrors is true, recoverable error should log debug instead of warn
      expect(mockLogger.debug).toHaveBeenCalled();
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('injectHighlighter', () => {
    it('should inject highlighter bundle', async () => {
      chrome.scripting.executeScript.mockImplementation((opts, verifyResult) => verifyResult([]));

      // Mock window for the callback function (note: this is tricky since callback runs in node context for this test)
      // For this test, we just check executeScript is called with correct file

      // We skip testing the callback logic here since it relies on window/setTimeout which is hard to unit test in isolation without jsdom setup for 'func' execution context simulation
      // Integrating executeScript callback logic testing usually requires more complex mocking.
      // We will assume injectAndExecute covers the mechanism.

      await service.injectHighlighter(1);

      expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
        expect.objectContaining({
          files: ['dist/content.bundle.js'],
        }),
        expect.any(Function)
      );
    });
  });

  describe('ensureBundleInjected', () => {
    it('應在 Bundle 已存在時不重複注入', async () => {
      // Arrange: Bundle 已存在（返回 bundle_ready）
      chrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
        chrome.runtime.lastError = undefined;
        callback({ status: 'bundle_ready' });
      });
      chrome.runtime.lastError = null;

      // Act
      const result = await service.ensureBundleInjected(1);

      // Assert
      expect(result).toBe(true);
      expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
      expect(mockLogger.success).toHaveBeenCalledWith(
        expect.stringContaining('Bundle already exists'),
        expect.anything()
      );
    });

    it('應在僅有 Preloader 時注入 Bundle', async () => {
      // Arrange: 僅 Preloader（返回 preloader_only）
      chrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
        chrome.runtime.lastError = undefined;
        callback({ status: 'preloader_only' });
      });
      chrome.scripting.executeScript.mockImplementation((opts, callback) => {
        chrome.runtime.lastError = undefined;
        callback();
      });
      chrome.runtime.lastError = null;

      // Act
      const result = await service.ensureBundleInjected(1);

      // Assert
      expect(result).toBe(true);
      expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
        expect.objectContaining({
          files: ['dist/content.bundle.js'],
        }),
        expect.any(Function)
      );
    });

    it('應在權限受限頁面時返回 false', async () => {
      // PING 請求根本就無法送達（sendMessage 靜默失敗）
      // → 流程繼續嘗試注入，注入也遇到可恢復錯誤 → 返回 false
      chrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
        // PING 失敗：用 resolve(null)（新行為）
        chrome.runtime.lastError = { message: 'Cannot access contents of page' };
        callback();
      });
      // 注入也遇到可恢復錯誤（模擬頁面權限受限）
      chrome.scripting.executeScript.mockImplementation((opts, cb) => {
        chrome.runtime.lastError = { message: 'Cannot access contents of page' };
        cb();
      });

      // Act
      const result = await service.ensureBundleInjected(1);

      // Assert
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Bundle injection skipped'),
        expect.objectContaining({ error: expect.anything() })
      );
    });

    it('應在 PING 超時時執行注入 (Timeout path)', async () => {
      jest.useFakeTimers();
      try {
        // Arrange: sendMessage 不回應
        chrome.tabs.sendMessage.mockImplementation(() => {});
        chrome.scripting.executeScript.mockImplementation((opts, cb) => {
          chrome.runtime.lastError = null;
          cb();
        });

        const promise = service.ensureBundleInjected(1);

        // Fast-forward PING timeout
        jest.advanceTimersByTime(2500);

        const result = await promise;
        expect(result).toBe(true);
        expect(chrome.scripting.executeScript).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
    it('應在 PING 觸發 receiving end does not exist 時返回 false (可恢復錯誤)', async () => {
      chrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
        chrome.runtime.lastError = { message: 'Receiving end does not exist' };
        callback();
      });

      // The try/catch around Promise.race will catch this if the Promise throws?
      // Wait, Promise.race currently resolves with null if chrome.runtime.lastError is present.
      // Ah! If it resolves with null, it will proceed to inject!
      // But we can simulate `chrome.scripting.executeScript` also throwing `Receiving end does not exist`
      chrome.scripting.executeScript.mockImplementation((opts, cb) => {
        chrome.runtime.lastError = { message: 'Receiving end does not exist' };
        cb();
      });

      const result = await service.ensureBundleInjected(1);

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Bundle injection skipped'),
        expect.objectContaining({
          action: 'ensureBundleInjected',
          error: expect.anything(),
        })
      );
    });

    it('應在 PING 拋出一般錯誤時往外拋出異常', async () => {
      // For coverage of the non-recoverable error in ensureBundleInjected
      chrome.tabs.sendMessage.mockImplementation(() => {
        throw new Error('Fatal Native Error');
      });

      await expect(service.ensureBundleInjected(1)).rejects.toThrow('Fatal Native Error');
    });

    it('應在 injectAndExecute 內部拋出不可恢復異常時向外拋出', async () => {
      chrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
        chrome.runtime.lastError = { message: 'Cannot access contents of page' };
        callback();
      });
      chrome.scripting.executeScript.mockImplementation((opts, cb) => {
        chrome.runtime.lastError = { message: 'Fatal Extension Error' };
        cb();
      });

      await expect(service.ensureBundleInjected(1)).rejects.toThrow('Fatal Extension Error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Bundle injection failed'),
        expect.any(Object)
      );
    });
  });

  describe('Edge Case Utilities', () => {
    it('isRestrictedInjectionUrl 應處理無法解析的 URL 字符串', () => {
      // 傳入無法被 new URL() 解析的字串，應觸發 catch 區塊並返回 true
      const result = isRestrictedInjectionUrl('not-a-url');
      expect(result).toBe(true);
      expect(Logger.warn).toHaveBeenCalled();
    });

    describe('getRuntimeErrorMessage', () => {
      it('應該處理各種錯誤對象類型', () => {
        expect(getRuntimeErrorMessage(null)).toBe('');
        expect(getRuntimeErrorMessage('string error')).toBe('string error');
        expect(getRuntimeErrorMessage({ message: 'obj error' })).toBe('obj error');

        // Trigger stringify failure (circular reference)
        const circular = {};
        circular.self = circular;
        const msg = getRuntimeErrorMessage(circular);
        expect(msg).toContain('Runtime Error');
        expect(Logger.warn).toHaveBeenCalled();
      });
    });
  });

  describe('_resolveHighlighterPath', () => {
    it('應直接回傳預設 bundle 路徑並寫入快取', async () => {
      const path = await service._resolveHighlighterPath();
      expect(path).toBe('dist/content.bundle.js');
      expect(service._highlighterPath).toBe('dist/content.bundle.js');
    });

    it('應在已有快取時直接回傳快取值', async () => {
      service._highlighterPath = 'cached/path.js';
      const cachedPath = await service._resolveHighlighterPath();
      expect(cachedPath).toBe('cached/path.js');
    });
  });

  describe('injectWithResponse', () => {
    it('應該在僅注入文件時返回成功標記', async () => {
      chrome.scripting.executeScript.mockImplementation((opts, cb) => cb());
      const result = await service.injectWithResponse(1, null, ['test.js']);
      expect(result).toEqual([{ result: { success: true } }]);
    });

    it('應該在拋出異常時記錄錯誤並返回 null', async () => {
      chrome.scripting.executeScript.mockImplementationOnce((opts, cb) => {
        chrome.runtime.lastError = { message: 'Fatal' };
        cb();
      });

      // We expect it to return null because of the try-catch in injectWithResponse
      const result = await service.injectWithResponse(1, () => {});
      expect(result).toBeNull();
      // 錯誤訊息應嵌入到日誌字串中，不再是 [object Object]
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('injectWithResponse failed: Fatal'),
        expect.objectContaining({
          action: 'injectWithResponse',
          error: expect.any(Error),
        })
      );
    });

    it('應在 injectWithResponse 失敗時於日誌 context 中包含 stack trace', async () => {
      const runtimeError = new Error('Fatal');
      runtimeError.stack = 'Error: Fatal\n    at injectWithResponse (InjectionService.test.js:1:1)';

      chrome.scripting.executeScript.mockImplementationOnce((opts, cb) => {
        chrome.runtime.lastError = runtimeError;
        cb();
      });

      const result = await service.injectWithResponse(1, () => {});
      expect(result).toBeNull();

      const injectWithResponseErrorCall = mockLogger.error.mock.calls.find(
        ([, context]) => context?.action === 'injectWithResponse'
      );

      expect(injectWithResponseErrorCall).toBeDefined();
      expect(injectWithResponseErrorCall[0]).toContain('injectWithResponse failed: Fatal');
      expect(injectWithResponseErrorCall[1]).toEqual(
        expect.objectContaining({
          action: 'injectWithResponse',
          error: expect.any(Error),
        })
      );
    });

    it('應該只觸發一條 ERROR 日誌而非三條', async () => {
      chrome.scripting.executeScript.mockImplementationOnce((opts, cb) => {
        chrome.runtime.lastError = { message: 'Fatal' };
        cb();
      });

      await service.injectWithResponse(1, () => {});
      // 除了 injectWithResponse 的 catch 外，injectAndExecute 內部設有 logErrors: false
      // 因此整個失敗流程只應產生一條 error 日誌
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('Business Operations Wrappers', () => {
    it('collectHighlights 應該觸發無文件的注射並回傳陣列', async () => {
      chrome.scripting.executeScript.mockImplementation((opts, cb) => {
        cb([{ result: ['highlight1'] }]);
      });
      const result = await service.collectHighlights(1);
      expect(result).toEqual(['highlight1']);
    });

    it('clearPageHighlights 應該觸發無文件的注射', async () => {
      chrome.scripting.executeScript.mockImplementation((opts, cb) => {
        cb([{ result: null }]);
      });
      await expect(service.clearPageHighlights(1)).resolves.not.toThrow();
      expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
        expect.objectContaining({
          func: expect.any(Function),
          target: expect.objectContaining({ tabId: 1 }),
        }),
        expect.any(Function)
      );
    });

    it('injectHighlightRestore 應該注入特定的腳本', async () => {
      chrome.scripting.executeScript.mockImplementation((opts, cb) => cb([]));
      await service.injectHighlightRestore(1);
      expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
        expect.objectContaining({ files: ['scripts/highlight-restore.js'] }),
        expect.any(Function)
      );
    });

    it('inject 應該觸發函數執行且不可返回結果，遇錯即拋', async () => {
      chrome.scripting.executeScript.mockImplementation((opts, cb) => {
        chrome.runtime.lastError = { message: 'Fatal crash' };
        cb();
      });

      await expect(service.inject(1, () => {})).rejects.toThrow('Fatal crash');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[Injection] inject failed'),
        expect.any(Object)
      );
    });
  });
});
