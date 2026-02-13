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

jest.mock('../../../../scripts/utils/urlUtils.js', () => ({
  resolveStorageUrl: jest.fn(url => url),
  buildStableUrlFromNextData: jest.fn(),
  hasSameOrigin: jest.fn(),
  normalizeUrl: jest.fn(url => url),
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
    sendMessage: jest.fn(),
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
  describe('Coverage Improvements', () => {
    it('_waitForTabCompilation should return null if chrome.tabs.get fails', async () => {
      chrome.tabs.get.mockRejectedValue(new Error('Get tab failed'));
      const res = await service._waitForTabCompilation(999);
      expect(res).toBeNull();
    });

    it('_waitForTabCompilation should return null if tab is discarded', async () => {
      chrome.tabs.get.mockResolvedValue({ id: 999, discarded: true });
      const res = await service._waitForTabCompilation(999);
      expect(res).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('discarded'));
    });

    it('updateTabStatus should log specific message for "No tab with id" error', async () => {
      service._verifyAndUpdateStatus = jest
        .fn()
        .mockRejectedValue(new Error('No tab with id: 999'));
      await service.updateTabStatus(999, 'https://example.com');
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Tab closed/missing'));
    });

    it('updateTabStatus should log specific message for "The tab was closed" error', async () => {
      service._verifyAndUpdateStatus = jest
        .fn()
        .mockRejectedValue(new Error('The tab was closed.'));
      await service.updateTabStatus(999, 'https://example.com');
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Tab closed/missing'));
    });
  });
  describe('Stable URL Fallback Logic', () => {
    test('應正確執行回退查找 (Stable URL Miss -> Original URL Hit)', async () => {
      /**
       * 此測試旨在驗證 _updateTabStatusInternal 的「雙查/回退」邏輯：
       * 當為頁面計算出穩定 URL (Stable URL) 時，應優先查詢該 URL 的標註；
       * 若穩定 URL 下無數據，應回退到原始 URL (Original URL) 查詢，以確保向後兼容。
       */
      const mockTabId = 999;
      const mockRawUrl = 'https://example.com/?slug=test';
      const mockStableUrl = 'https://example.com/stable';
      const mockOriginalUrl = 'https://example.com/';

      // 1. Mock 外部工具函數以模擬 Phase 1 為該頁面生成了不同的穩定 URL
      const { resolveStorageUrl } = require('../../../../scripts/utils/urlUtils.js');
      const originalResolve = resolveStorageUrl.getMockImplementation();
      resolveStorageUrl.mockReturnValue(mockStableUrl);

      // 2. 配置 service 的 URL 標準化行為
      service.normalizeUrl = jest.fn().mockReturnValue(mockOriginalUrl);

      // 3. Mock 外部儲存 API：穩定 URL 為空，原始 URL 有數據
      chrome.storage.local.get.mockImplementation(async keys => {
        if (keys.includes(`highlights_${mockStableUrl}`)) {
          return {};
        }
        if (keys.includes(`highlights_${mockOriginalUrl}`)) {
          return { [`highlights_${mockOriginalUrl}`]: [{ text: 'fallback-highlight' }] };
        }
        return {};
      });

      // 4. Mock 其他無關此測試邏輯的內部步驟，以隔離並專注於回退邏輯檢測
      service.getPreloaderData = jest.fn().mockResolvedValue(null);
      service._verifyAndUpdateStatus = jest.fn().mockResolvedValue();
      service._waitForTabCompilation = jest.fn().mockResolvedValue({ id: mockTabId });
      service.injectionService = { ensureBundleInjected: jest.fn().mockResolvedValue() };

      // 5. 執行測試
      await service._updateTabStatusInternal(mockTabId, mockRawUrl);

      // 6. 驗證：儲存 API 應該被呼叫了兩次（一次穩定，一次原始）
      expect(chrome.storage.local.get).toHaveBeenCalledWith([`highlights_${mockStableUrl}`]);
      expect(chrome.storage.local.get).toHaveBeenCalledWith([`highlights_${mockOriginalUrl}`]);

      // 驗證最終成功觸發了注入
      expect(service.injectionService.ensureBundleInjected).toHaveBeenCalledWith(mockTabId);

      // 清理環境
      if (originalResolve) {
        resolveStorageUrl.mockImplementation(originalResolve);
      }
    });
  });

  describe('getPreloaderData', () => {
    it('應該成功獲取 Preloader 數據', async () => {
      const mockData = { shortlink: 'https://example.com/p=1', nextRouteInfo: null };
      chrome.tabs.sendMessage.mockImplementation((_tabId, _msg, cb) => cb(mockData));

      const result = await service.getPreloaderData(1);
      expect(result).toEqual(mockData);
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        { action: 'PING' },
        expect.any(Function)
      );
    });

    it('應該在超時後返回 null', async () => {
      jest.useFakeTimers();
      try {
        chrome.tabs.sendMessage.mockImplementation(() => {
          // 不調用 callback，模擬無響應
        });

        const promise = service.getPreloaderData(1);
        jest.advanceTimersByTime(1000); // 超過 500ms
        const result = await promise;

        expect(result).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });

    it('應該在 runtime.lastError 時返回 null', async () => {
      chrome.tabs.sendMessage.mockImplementation((_tabId, _msg, cb) => {
        chrome.runtime.lastError = { message: 'Port closed' };
        cb();
      });

      const result = await service.getPreloaderData(1);
      expect(result).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get preloader data')
      );

      // 測試結束後清理，避免污染後續測試
      delete chrome.runtime.lastError;
    });

    it('應該在 sendMessage 拋出異常時返回 null', async () => {
      chrome.tabs.sendMessage.mockImplementation(() => {
        throw new Error('API Error');
      });

      const result = await service.getPreloaderData(1);
      expect(result).toBeNull();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get preloader data')
      );
    });

    describe('Coverage Improvements (Edge Cases)', () => {
      test('應正確處理 getPreloaderData 返回 null 的情況 (回退到 normalizeUrl)', async () => {
        service.getPreloaderData = jest.fn().mockResolvedValue(null);
        // Ensure normalizeUrl uses default behavior or specific mock
        service.normalizeUrl = jest.fn(url => url);

        const url = 'https://example.com/test';
        // resolveStorageUrl util will return normalizeUrl(url) if preloaderData is null
        // We need to ensure resolveStorageUrl is not mocked to return something else from previous tests OR restore it
        // The previous test mocked resolveStorageUrl, so we must ensure it's restored.
        // The previous test does restore it in 'finally' logical block (lines 635-637 of original file)

        const result = await service.resolveTabUrl(999, url);

        expect(result.stableUrl).toBe(url); // resolveStorageUrl fallback
        expect(result.originalUrl).toBe(url);
        expect(result.hasStableUrl).toBe(false);
      });

      test('應正確執行 _verifyAndUpdateStatus 的回退查詢邏輯 (Stable URL Miss -> Original URL Hit)', async () => {
        const tabId = 999;
        const normUrl = 'https://example.com/stable';
        const fallbackUrl = 'https://example.com/';

        // Setup mocks
        service.getSavedPageData = jest
          .fn()
          .mockResolvedValueOnce(null) // First call for normUrl returns null
          .mockResolvedValueOnce({ notionPageId: 'page-123', lastVerifiedAt: Date.now() }); // Second call for fallbackUrl returns data

        service._updateBadgeStatus = jest.fn().mockResolvedValue();

        // Execute private method
        await service._verifyAndUpdateStatus(tabId, normUrl, fallbackUrl);

        // Verify
        expect(service.getSavedPageData).toHaveBeenNthCalledWith(1, normUrl);
        expect(service.getSavedPageData).toHaveBeenNthCalledWith(2, fallbackUrl);
        expect(service._updateBadgeStatus).toHaveBeenCalledWith(
          tabId,
          expect.objectContaining({ notionPageId: 'page-123' })
        );
      });
    });
  });

  describe('LIFECYCLE & LISTENERS', () => {
    it('應該處理 chrome.tabs.onActivated 事件', async () => {
      chrome.tabs.get.mockResolvedValue({ id: 10, url: 'https://example.com/activated' });

      service.setupListeners();
      const activatedCallback = chrome.tabs.onActivated.addListener.mock.calls[0][0];

      await activatedCallback({ tabId: 10, windowId: 1 });

      // 驗證 updateTabStatus 被呼叫
      expect(chrome.tabs.get).toHaveBeenCalledWith(10);
    });

    it('應該在 chrome.tabs.onActivated 失敗時靜默處理', async () => {
      chrome.tabs.get.mockRejectedValue(new Error('Tab not found'));

      service.setupListeners();
      const activatedCallback = chrome.tabs.onActivated.addListener.mock.calls[0][0];

      await expect(activatedCallback({ tabId: 999, windowId: 1 })).resolves.not.toThrow();
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('應該處理 chrome.tabs.onUpdated 事件', () => {
      jest.useFakeTimers();
      service.setupListeners();
      const updatedCallback = chrome.tabs.onUpdated.addListener.mock.calls[0][0];

      updatedCallback(1, { status: 'complete' }, { id: 1, url: 'https://example.com/updated' });

      // 推進時間：等待 STATUS_UPDATE_DELAY_MS (100ms) 觸發延遲更新
      jest.advanceTimersByTime(200);

      // 驗證延遲後的行為
      expect(chrome.tabs.sendMessage).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });
});
