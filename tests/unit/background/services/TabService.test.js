/**
 * TabService 單元測試
 */

import { TabService } from '../../../../scripts/background/services/TabService.js';
import Logger from '../../../../scripts/utils/Logger.js';

jest.mock('../../../../scripts/utils/Logger.js', () => ({
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  success: jest.fn(),
}));

jest.mock('../../../../scripts/config/constants.js', () => ({
  TAB_SERVICE: {
    LOADING_TIMEOUT_MS: 1000,
    STATUS_UPDATE_DELAY_MS: 100,
  },
  URL_NORMALIZATION: {
    TRACKING_PARAMS: ['utm_source'],
  },
  HANDLER_CONSTANTS: {
    PAGE_STATUS_CACHE_TTL: 60_000,
  },
}));

// Mock chrome API
globalThis.chrome = {
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
    },
  },
  tabs: {
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onActivated: {
      addListener: jest.fn(),
    },
    onRemoved: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    get: jest.fn(),
  },
};

// Mock Logger
const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  success: jest.fn(),
};

// Mock InjectionService
const mockInjectionService = {
  ensureBundleInjected: jest.fn().mockResolvedValue(true),
  injectWithResponse: jest.fn().mockResolvedValue({ migrated: false }),
  injectHighlightRestore: jest.fn().mockResolvedValue(),
};

describe('TabService', () => {
  let service = null;

  beforeEach(() => {
    service = new TabService({
      logger: mockLogger,
      injectionService: mockInjectionService,
      normalizeUrl: url => url,
      getSavedPageData: jest.fn().mockResolvedValue(null),
      isRestrictedUrl: url => url.includes('chrome://'),
      isRecoverableError: err => {
        const msg = typeof err === 'string' ? err : err?.message || '';
        return msg.includes('Cannot access');
      },
      // 注入 mock 依賴
      checkPageExists: jest.fn().mockResolvedValue(true),
      getApiKey: jest.fn().mockResolvedValue('test-api-key'),
      clearPageState: jest.fn().mockResolvedValue(),
      setSavedPageData: jest.fn().mockResolvedValue(),
    });

    // 初始化全局 chrome.runtime
    chrome.runtime = { lastError: null };

    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultService = new TabService();
      expect(defaultService.logger).toBe(Logger);
      expect(typeof defaultService.normalizeUrl).toBe('function');
      expect(typeof defaultService.getSavedPageData).toBe('function');
    });

    it('should accept custom options', () => {
      expect(service.logger).toBe(mockLogger);
      expect(service.injectionService).toBe(mockInjectionService);
    });
  });

  describe('updateTabStatus', () => {
    it('should skip invalid URLs', async () => {
      await service.updateTabStatus(1, null);
      await service.updateTabStatus(1, '');
      await service.updateTabStatus(1, 'ftp://example.com');

      expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
    });

    it('should skip restricted URLs', async () => {
      await service.updateTabStatus(1, 'chrome://extensions');

      expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
    });

    it('should set badge for saved pages', async () => {
      service.getSavedPageData = jest.fn().mockResolvedValue({
        pageId: '123',
        notionPageId: 'notion-123',
        lastVerifiedAt: Date.now(), // 確保在 TTL 內
      });
      chrome.storage.local.get.mockImplementation(_keys => Promise.resolve({}));

      await service.updateTabStatus(1, 'https://example.com');

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '✓', tabId: 1 });
      expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
        color: '#48bb78',
        tabId: 1,
      });
    });

    it('should clear badge for unsaved pages', async () => {
      service.getSavedPageData = jest.fn().mockResolvedValue(null);
      chrome.storage.local.get.mockImplementation(_keys => Promise.resolve({}));

      await service.updateTabStatus(1, 'https://example.com');

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 1 });
    });

    it('should inject bundle for auto-restore when highlights exist', async () => {
      // Mock highlights 存在
      service.getSavedPageData = jest.fn().mockResolvedValue(null);
      chrome.storage.local.get.mockImplementation(_keys =>
        Promise.resolve({ 'highlights_https://example.com': [{ id: '1' }] })
      );

      // Mock tab get 返回 complete 狀態
      chrome.tabs.get.mockImplementation(_tabId =>
        Promise.resolve({ id: 1, status: 'complete', url: 'https://example.com' })
      );

      await service.updateTabStatus(1, 'https://example.com');

      // 驗證使用 ensureBundleInjected 而非 injectHighlighter
      expect(mockInjectionService.ensureBundleInjected).toHaveBeenCalledWith(1);
    });

    it('should call migrateLegacyHighlights when no highlights exist', async () => {
      service.getSavedPageData = jest.fn().mockResolvedValue(null);
      chrome.storage.local.get.mockImplementation(_keys => Promise.resolve({}));

      const migrateSpy = jest.spyOn(service, 'migrateLegacyHighlights').mockResolvedValue();

      await service.updateTabStatus(1, 'https://example.com');

      expect(migrateSpy).toHaveBeenCalledWith(
        1,
        'https://example.com',
        'highlights_https://example.com'
      );
    });

    it('should handle ensureBundleInjected rejection gracefully', async () => {
      // Arrange: 模擬 highlights 存在
      service.getSavedPageData = jest.fn().mockResolvedValue(null);
      chrome.storage.local.get.mockImplementation(_keys =>
        Promise.resolve({ 'highlights_https://example.com': [{ id: '1' }] })
      );

      chrome.tabs.get.mockImplementation(_tabId => {
        chrome.runtime = { lastError: null };
        return Promise.resolve({ id: 1, status: 'complete', url: 'https://example.com' });
      });

      // Arrange: 模擬注入失敗
      const injectionError = new Error('Bundle injection failed');
      mockInjectionService.ensureBundleInjected.mockRejectedValue(injectionError);

      // Act
      await service.updateTabStatus(1, 'https://example.com');

      // Assert: 錯誤被記錄
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[TabService] Error updating tab status'),
        expect.objectContaining({ error: injectionError })
      );

      // Assert: ensureBundleInjected 被調用
      expect(mockInjectionService.ensureBundleInjected).toHaveBeenCalledWith(1);
    });

    it('should handle errors gracefully', async () => {
      // 確保 getSavedPageData 拋出錯誤
      service.getSavedPageData = jest.fn().mockRejectedValue(new Error('Storage error'));

      await service.updateTabStatus(1, 'https://example.com');

      expect(mockLogger.error).toHaveBeenCalled();
    });

    describe('Automatic Verification', () => {
      it('should verify with Notion when cache is expired', async () => {
        const expiredData = {
          notionPageId: 'page-123',
          lastVerifiedAt: Date.now() - 70_000, // 超過 60s
        };
        service.getSavedPageData = jest.fn().mockResolvedValue(expiredData);
        service.checkPageExists = jest.fn().mockResolvedValue(true);

        await service.updateTabStatus(1, 'https://example.com');

        expect(service.checkPageExists).toHaveBeenCalledWith('page-123', 'test-api-key');
        expect(service.setSavedPageData).toHaveBeenCalledWith(
          'https://example.com',
          expect.objectContaining({ lastVerifiedAt: expect.any(Number) })
        );
      });

      it('should clear local state if Notion page is deleted', async () => {
        const expiredData = {
          notionPageId: 'page-123',
          lastVerifiedAt: Date.now() - 70_000,
        };
        service.getSavedPageData = jest.fn().mockResolvedValue(expiredData);
        service.checkPageExists = jest.fn().mockResolvedValue(false); // 模擬已刪除

        await service.updateTabStatus(1, 'https://example.com');

        expect(service.clearPageState).toHaveBeenCalledWith('https://example.com');
        expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 1 });
      });

      it('should fallback to cached status if verification fails', async () => {
        const expiredData = {
          pageId: '123',
          notionPageId: 'page-123',
          lastVerifiedAt: Date.now() - 70_000,
        };
        service.getSavedPageData = jest.fn().mockResolvedValue(expiredData);
        service.checkPageExists = jest.fn().mockRejectedValue(new Error('Notion API Error'));

        await service.updateTabStatus(1, 'https://example.com');

        expect(mockLogger.warn).toHaveBeenCalled();
        // 依然顯示勾勾
        expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '✓', tabId: 1 });
      });
    });
  });

  describe('setupListeners', () => {
    it('should register tab update listener', () => {
      service.setupListeners();

      expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
    });

    it('should register tab activation listener', () => {
      service.setupListeners();

      expect(chrome.tabs.onActivated.addListener).toHaveBeenCalled();
    });
  });

  describe('migrateLegacyHighlights', () => {
    beforeEach(() => {
      chrome.tabs.get.mockResolvedValue({ id: 1, url: 'https://example.com', status: 'complete' });
    });

    it('should skip if normUrl is missing', async () => {
      await service.migrateLegacyHighlights(1, null, 'key');

      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockInjectionService.injectWithResponse).not.toHaveBeenCalled();
    });

    it('should skip if storageKey is missing', async () => {
      await service.migrateLegacyHighlights(1, 'https://example.com', null);

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should skip non-http URLs', async () => {
      await service.migrateLegacyHighlights(1, 'ftp://example.com', 'key');

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should skip if tab is invalid', async () => {
      chrome.tabs.get.mockRejectedValue(new Error('Tab not found'));

      await service.migrateLegacyHighlights(1, 'https://example.com', 'key');

      expect(mockInjectionService.injectWithResponse).not.toHaveBeenCalled();
    });

    it('should skip if tab shows error page', async () => {
      chrome.tabs.get.mockResolvedValue({ url: 'chrome-error://chromewebdata' });

      await service.migrateLegacyHighlights(1, 'https://example.com', 'key');

      expect(mockInjectionService.injectWithResponse).not.toHaveBeenCalled();
    });

    it('should save migrated data to storage', async () => {
      mockInjectionService.injectWithResponse.mockResolvedValue({
        migrated: true,
        data: [{ id: '1', text: 'highlight' }],
        foundKey: 'highlights_old',
      });
      chrome.storage.local.set.mockImplementation(_data => Promise.resolve());

      await service.migrateLegacyHighlights(
        1,
        'https://example.com',
        'highlights_https://example.com'
      );

      expect(mockInjectionService.injectWithResponse).toHaveBeenCalled();
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        'highlights_https://example.com': [{ id: '1', text: 'highlight' }],
      });
      expect(mockInjectionService.injectHighlightRestore).toHaveBeenCalledWith(1);
    });

    it('should handle recoverable errors gracefully', async () => {
      mockInjectionService.injectWithResponse.mockRejectedValue(
        new Error('Cannot access contents of page')
      );

      await service.migrateLegacyHighlights(
        1,
        'https://example.com',
        'highlights_https://example.com'
      );

      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockLogger.warn.mock.calls[0][0]).toMatch(
        /Migration skipped due to recoverable error:?/
      );
    });

    it('should log non-recoverable errors', async () => {
      mockInjectionService.injectWithResponse.mockRejectedValue(new Error('Unknown error'));

      await service.migrateLegacyHighlights(
        1,
        'https://example.com',
        'highlights_https://example.com'
      );

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('waitForTabCompilation', () => {
    // Helper to flush potential microtasks.
    // We need to wait for the async _waitForTabCompilation method to proceed past its
    // initial `await chrome.tabs.get()` and register the event listeners.
    // A single await might not be enough depending on the internal promise chain.
    const flushMicrotasks = async () => {
      await Promise.resolve();
      await Promise.resolve();
    };

    it('應該在標籤頁已完成載入時直接返回', async () => {
      chrome.tabs.get.mockResolvedValue({ id: 1, status: 'complete' });
      const res = await service._waitForTabCompilation(1);
      expect(res.status).toBe('complete');
    });

    it('應該在已有待處理監聽器時返回 null', async () => {
      service.pendingListeners.set(1, {});
      chrome.tabs.get.mockResolvedValue({ id: 1, status: 'loading' });
      const res = await service._waitForTabCompilation(1);
      expect(res).toBeNull();
    });

    it('應該處理標籤頁更新事件', async () => {
      chrome.tabs.get.mockResolvedValue({ id: 1, status: 'loading' });

      let updateCallback;
      chrome.tabs.onUpdated.addListener.mockImplementation(cb => {
        updateCallback = cb;
      });

      const promise = service._waitForTabCompilation(1);

      // 等待非同步操作推進到監聽器註冊階段
      await flushMicrotasks();

      // 觸發更新
      if (typeof updateCallback === 'function') {
        updateCallback(1, { status: 'complete' });
      }

      const res = await promise;
      expect(res.status).toBe('complete');
    });

    it('應該處理標籤頁移除事件', async () => {
      chrome.tabs.get.mockResolvedValue({ id: 1, status: 'loading' });

      let removeCallback;
      chrome.tabs.onRemoved.addListener.mockImplementation(cb => {
        removeCallback = cb;
      });

      const promise = service._waitForTabCompilation(1);

      // 等待非同步操作推進到監聽器註冊階段
      await flushMicrotasks();

      // 觸發移除
      if (typeof removeCallback === 'function') {
        removeCallback(1);
      }

      const res = await promise;
      expect(res).toBeNull();
    });

    it('應該在超時後返回 null', async () => {
      jest.useFakeTimers();
      try {
        chrome.tabs.get.mockResolvedValue({ id: 1, status: 'loading' });

        const promise = service._waitForTabCompilation(1);

        // 等待非同步操作推進到內部 Promise 建立
        await flushMicrotasks();

        jest.advanceTimersByTime(11_000); // 大於 10s

        const res = await promise;
        expect(res).toBeNull();
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('timeout'));
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('Concurrency & Edge Cases', () => {
    it('updateTabStatus 應該防止並發處理同一個標籤頁 (Line 62)', async () => {
      service.processingTabs.set(1, Date.now());
      await service.updateTabStatus(1, 'https://example.com');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('already being processed')
      );
    });

    it('migrateLegacyHighlights 應該處理腳本回報的錯誤 (Line 277)', async () => {
      chrome.tabs.get.mockResolvedValue({ id: 1, url: 'https://example.com' });
      mockInjectionService.injectWithResponse.mockResolvedValue({ error: 'Injected script fail' });

      await service.migrateLegacyHighlights(1, 'https://example.com', 'key');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Migration script reported error'),
        expect.anything()
      );
    });
  });
});
