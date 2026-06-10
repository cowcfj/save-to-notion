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

function recreateInjectedFunction(func) {
  const source = func.toString();
  // npm run test:coverage 時 Istanbul 會在 source 注入 module-scope 的 cov_xxx
  // counter 變數；透過 new Function 重新 eval（模擬 chrome.scripting.executeScript
  // 序列化邊界）時這些變數不在 scope 內，會 throw ReferenceError。偵測 source
  // 中的 cov_xxx identifier 並注入 no-op Proxy stub，counter 呼叫變成無作用。
  // stub 需支援 function call、任意 property access、`++` 之類的 primitive coercion。
  const covVars = [...new Set(source.match(/cov_[a-zA-Z0-9_$]+/g) || [])];
  const covStubAssignments = covVars.map(name => `${name} = __covStub`).join(', ');
  const stubPrelude =
    covVars.length > 0
      ? `const __covStub = new Proxy(function () { return __covStub; }, {
         get: (_t, prop) => {
           if (prop === Symbol.toPrimitive || prop === 'valueOf') return () => 0;
           if (prop === 'toString') return () => '0';
           return __covStub;
         },
         set: () => true,
       });
       var ${covStubAssignments};\n`
      : '';
  // eslint-disable-next-line sonarjs/code-eval -- test-only Chrome executeScript serialization boundary simulation
  return new Function(`${stubPrelude}return (${source});`)();
}

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
  start: jest.fn(),
};

describe('InjectionService', () => {
  let service = null;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InjectionService({ logger: mockLogger });
    chrome.runtime.lastError = null;
  });

  afterEach(() => {
    delete globalThis.HighlighterV2;
    delete globalThis.notionHighlighter;
    delete globalThis.__NOTION_RAIL_READY__;
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

    it('應在注入失敗時只記錄脫敏後的短錯誤訊息', async () => {
      const injectionError = new Error('Injection failed');
      injectionError.stack =
        'Error: Injection failed for https://private.example.com/path?token=secret_abc&keep=value\n    at https://private.example.com/script.js?access_token=abc:1:1';
      injectionError.message =
        'Injection failed for https://private.example.com/path?token=secret_abc&keep=value with Bearer secret_abc';
      chrome.runtime.lastError = injectionError;
      chrome.scripting.executeScript.mockImplementation((opts, cb) => cb());

      await expect(service.injectAndExecute(1, ['file.js'])).rejects.toThrow('Injection failed');

      const injectErrorCall = mockLogger.error.mock.calls.find(
        ([, context]) => context?.action === 'injectAndExecute'
      );

      expect(injectErrorCall).toBeDefined();
      expect(injectErrorCall[0]).toContain('Script injection failed: Error: Injection failed');
      expect(injectErrorCall[1]).toEqual(
        expect.objectContaining({
          action: 'injectAndExecute',
          result: 'failure',
          files: ['file.js'],
          error: expect.stringContaining('[URL]'),
        })
      );
      expect(JSON.stringify(injectErrorCall)).not.toContain('private.example.com');
      expect(JSON.stringify(injectErrorCall)).not.toContain('secret_abc');
      expect(JSON.stringify(injectErrorCall)).not.toContain('access_token=abc');
      expect(JSON.stringify(injectErrorCall)).not.toContain('\n    at ');
    });

    it('should resolve recoverable errors without throwing', async () => {
      chrome.runtime.lastError = { message: 'Cannot access contents of page' };
      chrome.scripting.executeScript.mockImplementation((opts, cb) => cb());

      await expect(service.injectAndExecute(1, ['file.js'])).resolves.toBeUndefined();
      // Default logErrors is true, recoverable error should log debug instead of warn
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('File injection skipped'),
        expect.objectContaining({
          action: 'injectAndExecute',
          result: 'skipped',
        })
      );
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

    it('[REGRESSION] 注入後應啟動 Floating Rail 而不是 legacy toolbar', async () => {
      const railShow = jest.fn();
      const activateHighlighting = jest.fn();
      const toolbarShow = jest.fn();
      globalThis.HighlighterV2 = {
        rail: {
          show: railShow,
          activateHighlighting,
        },
      };
      globalThis.notionHighlighter = { show: toolbarShow };

      chrome.scripting.executeScript.mockImplementation(async (opts, verifyResult) => {
        if (opts.files) {
          verifyResult([]);
          return;
        }

        const injectedFunc = recreateInjectedFunction(opts.func);
        const result = await injectedFunc();
        verifyResult([{ result }]);
      });

      const result = await service.injectHighlighter(1);

      expect(result).toEqual({ initialized: true, highlightCount: 0 });
      expect(railShow).toHaveBeenCalled();
      expect(activateHighlighting).toHaveBeenCalledWith();
      expect(toolbarShow).not.toHaveBeenCalled();
    });

    it('[REGRESSION] rail readiness promise reject 時應回退為未初始化狀態', async () => {
      globalThis.__NOTION_RAIL_READY__ = Promise.reject(new Error('Rail init failed'));

      chrome.scripting.executeScript.mockImplementation(async (opts, verifyResult) => {
        if (opts.files) {
          verifyResult([]);
          return;
        }

        try {
          const injectedFunc = recreateInjectedFunction(opts.func);
          const result = await injectedFunc();
          verifyResult([{ result }]);
        } catch (error) {
          chrome.runtime.lastError = error;
          verifyResult([]);
        }
      });

      await expect(service.injectHighlighter(1)).resolves.toEqual({
        initialized: false,
        highlightCount: 0,
      });
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
        expect.objectContaining({
          action: 'ensureBundleInjected',
          result: 'success',
        })
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

    it('未傳入 logger 時應使用專案 Logger fallback', async () => {
      const serviceWithDefaultLogger = new InjectionService();
      chrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
        chrome.runtime.lastError = undefined;
        callback({ status: 'preloader_only' });
      });
      chrome.scripting.executeScript.mockImplementation((opts, callback) => {
        chrome.runtime.lastError = undefined;
        callback();
      });

      await serviceWithDefaultLogger.ensureBundleInjected(1);

      expect(Logger.start).toHaveBeenCalledWith(
        expect.stringContaining('Injecting Content Bundle'),
        expect.objectContaining({
          action: 'ensureBundleInjected',
          result: 'started',
          tabId: 1,
        })
      );
      expect(Logger.success).toHaveBeenCalledWith(
        expect.stringContaining('Content Bundle injected'),
        expect.objectContaining({
          action: 'ensureBundleInjected',
          result: 'success',
          tabId: 1,
        })
      );
    });

    it('應在權限受限頁面時返回 false', async () => {
      // PING 請求根本就無法送達，應直接分類為 unreachable，不再繼續注入。
      chrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
        chrome.runtime.lastError = { message: 'Cannot access contents of page' };
        callback();
      });

      // Act
      const result = await service.ensureBundleInjected(1);

      // Assert
      expect(result).toBe(false);
      expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('PING failed with recoverable error'),
        expect.objectContaining({
          action: 'ensureBundleInjected',
          result: 'failure',
          error: expect.stringContaining('Cannot access contents of page'),
        })
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

      const result = await service.ensureBundleInjected(1);

      expect(result).toBe(false);
      expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('PING failed with recoverable error'),
        expect.objectContaining({
          action: 'ensureBundleInjected',
          result: 'failure',
          error: expect.stringContaining('Receiving end does not exist'),
        })
      );
    });

    it('應在 PING 拋出一般錯誤時往外拋出異常', async () => {
      // 覆蓋 ensureBundleInjected 中不可恢復錯誤的測試路徑
      chrome.tabs.sendMessage.mockImplementation(() => {
        throw new Error('Fatal Native Error');
      });

      await expect(service.ensureBundleInjected(1)).rejects.toThrow('Fatal Native Error');
    });

    it('應在 PING 回傳不可恢復 lastError 時向外拋出', async () => {
      chrome.tabs.sendMessage.mockImplementation((tabId, message, callback) => {
        chrome.runtime.lastError = { message: 'Fatal Ping Error' };
        callback();
      });

      await expect(service.ensureBundleInjected(1)).rejects.toThrow('Fatal Ping Error');
      expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
    });
  });

  describe('Edge Case Utilities', () => {
    it('isRestrictedInjectionUrl 應處理無法解析的 URL 字符串且不記錄 raw URL', () => {
      // 傳入無法被 new URL() 解析的字串，應觸發 catch 區塊並返回 true
      const rawUrl = 'not-a-url?token=secret';
      const result = isRestrictedInjectionUrl(rawUrl);
      expect(result).toBe(true);
      expect(Logger.warn).toHaveBeenCalledWith(
        '[Injection:Utils] Failed to parse URL when checking restrictions',
        expect.objectContaining({
          action: 'isRestrictedInjectionUrl',
          url: '[invalid-url]',
          error: expect.any(String),
        })
      );
      expect(JSON.stringify(Logger.warn.mock.calls)).not.toContain(rawUrl);
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

    it('應該在拋出異常時記錄脫敏後的錯誤並返回 null', async () => {
      chrome.scripting.executeScript.mockImplementationOnce((opts, cb) => {
        chrome.runtime.lastError = {
          message: 'Fatal https://example.com/private?token=secret_abc',
        };
        cb();
      });

      // We expect it to return null because of the try-catch in injectWithResponse
      const result = await service.injectWithResponse(1, () => {});
      expect(result).toBeNull();
      // 錯誤訊息應嵌入到日誌字串中，不再是 [object Object]
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('injectWithResponse failed: Error: Fatal [URL]'),
        expect.objectContaining({
          action: 'injectWithResponse',
          result: 'failure',
          error: expect.stringContaining('[URL]'),
        })
      );
      expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain('secret_abc');
      expect(JSON.stringify(mockLogger.error.mock.calls)).not.toContain('example.com');
    });

    it('應在 injectWithResponse 失敗時避免記錄 raw stack trace', async () => {
      const runtimeError = new Error('Fatal');
      runtimeError.stack =
        'Error: Fatal https://example.com/private?token=secret_abc\n    at https://example.com/script.js?access_token=abc:1:1';
      runtimeError.message = 'Fatal https://example.com/private?token=secret_abc';

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
      expect(injectWithResponseErrorCall[0]).toContain(
        'injectWithResponse failed: Error: Fatal [URL]'
      );
      expect(injectWithResponseErrorCall[1]).toEqual(
        expect.objectContaining({
          action: 'injectWithResponse',
          result: 'failure',
          error: expect.stringContaining('[URL]'),
        })
      );
      expect(JSON.stringify(injectWithResponseErrorCall)).not.toContain('example.com');
      expect(JSON.stringify(injectWithResponseErrorCall)).not.toContain('secret_abc');
      expect(JSON.stringify(injectWithResponseErrorCall)).not.toContain('\n    at ');
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
    it('activateFloatingRailInPage 應在序列化後仍可獨立執行（無外部閉包依賴）', async () => {
      const railShow = jest.fn();
      const activateHighlighting = jest.fn();
      globalThis.HighlighterV2 = {
        rail: { show: railShow, activateHighlighting },
        manager: { getCount: () => 3 },
      };

      chrome.scripting.executeScript.mockImplementation(async (opts, verifyResult) => {
        if (opts.files) {
          verifyResult([]);
          return;
        }
        // 透過 recreateInjectedFunction 模擬 Chrome executeScript 的序列化邊界，
        // 確認 opts.func 真的可獨立執行而不依賴外部閉包。
        const recreated = recreateInjectedFunction(opts.func);
        const result = await recreated();
        verifyResult([{ result }]);
      });

      const result = await service.injectHighlighter(1);

      expect(result).toEqual({ initialized: true, highlightCount: 3 });
      expect(railShow).toHaveBeenCalled();
      expect(activateHighlighting).toHaveBeenCalledWith();
    });

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
      await expect(service.clearPageHighlights(1)).resolves.toBe(false);
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
        expect.objectContaining({
          action: 'inject',
          result: 'failure',
          error: 'Error: Fatal crash',
        })
      );
    });
  });
});
