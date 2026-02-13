import { createHighlightHandlers } from '../../../../scripts/background/handlers/highlightHandlers.js';
import { isRestrictedInjectionUrl } from '../../../../scripts/background/services/InjectionService.js';
import {
  validateContentScriptRequest,
  sanitizeApiError,
  validateInternalRequest,
} from '../../../../scripts/utils/securityUtils.js';
import { ErrorHandler } from '../../../../scripts/utils/ErrorHandler.js';
import { normalizeUrl, resolveStorageUrl } from '../../../../scripts/utils/urlUtils.js';

jest.mock('../../../../scripts/utils/Logger.js');
jest.mock('../../../../scripts/background/services/InjectionService.js');
jest.mock('../../../../scripts/utils/securityUtils.js');
jest.mock('../../../../scripts/utils/ErrorHandler.js');
jest.mock('../../../../scripts/utils/urlUtils.js');

describe('highlightHandlers', () => {
  let handlers;
  let mockServices;

  beforeEach(() => {
    jest.resetAllMocks();

    // Default mock behaviors for utilities
    validateContentScriptRequest.mockReturnValue(null);
    validateInternalRequest.mockReturnValue(null);
    isRestrictedInjectionUrl.mockReturnValue(false);
    normalizeUrl.mockImplementation(url => url);
    resolveStorageUrl.mockImplementation(url => url);

    // Fix ErrorHandler mock
    ErrorHandler.formatUserMessage.mockImplementation(msg => msg);

    // Fix sanitizeApiError mock
    sanitizeApiError.mockImplementation(err =>
      typeof err === 'string' ? err : err.message || 'unknown_error'
    );

    mockServices = {
      notionService: {
        updateHighlights: jest.fn(),
        syncHighlights: jest.fn(),
        updateHighlightsSection: jest.fn(),
      },
      storageService: {
        getHighlighterState: jest.fn(),
        setHighlighterState: jest.fn(),
        getSavedPageData: jest.fn(),
        getConfig: jest.fn(),
      },
      tabService: {
        getStableUrl: jest.fn().mockResolvedValue('https://example.com/stable'),
        getPreloaderData: jest.fn().mockResolvedValue(null),
        resolveTabUrl: jest.fn().mockImplementation((_tabId, url) =>
          Promise.resolve({
            stableUrl: url,
            originalUrl: url,
            migrated: false,
          })
        ),
      },
      injectionService: {
        ensureBundleInjected: jest.fn(),
        injectHighlighter: jest.fn(),
        collectHighlights: jest.fn(),
      },
      migrationService: {
        migrateStorageKey: jest.fn().mockResolvedValue(false),
      },
    };

    // Mock global chrome
    globalThis.chrome = {
      runtime: { id: 'test-id', lastError: null },
      tabs: {
        sendMessage: jest.fn(),
        query: jest.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
      },
      action: { setBadgeText: jest.fn() },
    };

    handlers = createHighlightHandlers(mockServices);
  });

  afterEach(() => {
    delete globalThis.chrome;
    jest.restoreAllMocks();
  });

  describe('updateHighlights', () => {
    it('應該成功更新高亮', async () => {
      const sendResponse = jest.fn();
      const sender = { tab: { id: 1, url: 'https://example.com' } };
      const request = { highlights: [], notionPageId: 'page1' };

      // Mock dependencies for performHighlightUpdate
      mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'key1' });
      mockServices.storageService.getSavedPageData.mockResolvedValue({ notionPageId: 'page1' });
      mockServices.injectionService.collectHighlights.mockResolvedValue([{ text: 'hi' }]);
      mockServices.notionService.updateHighlightsSection.mockResolvedValue({ success: true });

      await handlers.updateHighlights(request, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('syncHighlights', () => {
    it('應該成功同步高亮', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };
      const request = { highlights: [{ text: 'test' }] };

      mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'key1' });
      mockServices.storageService.getSavedPageData.mockResolvedValue({ notionPageId: 'page1' });
      mockServices.notionService.updateHighlightsSection.mockResolvedValue({ success: true });

      await handlers.syncHighlights(request, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('應該處理 syncHighlights 失敗 (API 錯誤)', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };
      const request = { highlights: [{ text: 'test' }] };

      mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'key1' });
      mockServices.storageService.getSavedPageData.mockResolvedValue({ notionPageId: 'page1' });
      mockServices.notionService.updateHighlightsSection.mockResolvedValue({
        success: false,
        error: 'Sync failed',
      });

      await handlers.syncHighlights(request, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Sync failed' })
      );
    });

    it('應該在沒有新高亮時直接返回成功', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };
      const request = { highlights: [] }; // Empty

      await handlers.syncHighlights(request, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          highlightCount: 0,
        })
      );
    });
  });

  describe('startHighlight', () => {
    it('應該成功切換已注入的高亮工具', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id' };

      globalThis.chrome.tabs.sendMessage.mockImplementation((id, msg, cb) => cb({ success: true }));

      await handlers.startHighlight({}, sender, sendResponse);

      expect(globalThis.chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        { action: 'toggleHighlighter' },
        expect.any(Function)
      );
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('如果切換失敗應該注入高亮工具', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id' };

      globalThis.chrome.tabs.sendMessage.mockImplementation((id, msg, cb) => {
        globalThis.chrome.runtime.lastError = { message: 'No listener' };
        cb(null);
        globalThis.chrome.runtime.lastError = null;
      });

      mockServices.injectionService.injectHighlighter.mockResolvedValue({ initialized: true });

      await handlers.startHighlight({}, sender, sendResponse);

      expect(mockServices.injectionService.injectHighlighter).toHaveBeenCalledWith(1);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('Coverage Improvements (Extended)', () => {
    it('should retry in ensureBundleReady and eventually succeed', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };

      // Mock chrome.tabs.sendMessage for PING retries
      let count = 0;
      globalThis.chrome.tabs.sendMessage.mockImplementation((id, msg, cb) => {
        if (msg.action === 'PING') {
          count++;
          if (count < 2) {
            globalThis.chrome.runtime.lastError = { message: 'Not ready' };
            cb(null);
            globalThis.chrome.runtime.lastError = null;
          } else {
            cb({ status: 'bundle_ready' });
          }
        } else if (msg.action === 'showHighlighter') {
          cb({ success: true });
        }
      });

      mockServices.injectionService.ensureBundleInjected.mockResolvedValue();

      await handlers.USER_ACTIVATE_SHORTCUT({}, sender, sendResponse);

      expect(count).toBe(2);
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should fail in ensureBundleReady if timeout reached', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };

      // Always return error for PING
      globalThis.chrome.tabs.sendMessage.mockImplementation((id, msg, cb) => {
        if (msg.action === 'PING') {
          globalThis.chrome.runtime.lastError = { message: 'Timeout' };
          cb(null);
          globalThis.chrome.runtime.lastError = null;
        }
      });

      mockServices.injectionService.ensureBundleInjected.mockResolvedValue();

      await handlers.USER_ACTIVATE_SHORTCUT({}, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('初始化超時'),
        })
      );
    });

    it('should handle missing API key in performHighlightUpdate', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };

      mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: null });

      await handlers.updateHighlights({}, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringMatching(/API Key/) })
      );
    });

    it('should handle collection failure in updateHighlights', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };

      mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'key1' });
      mockServices.injectionService.collectHighlights.mockRejectedValue(
        new Error('Collection failed')
      );

      await handlers.updateHighlights({ highlights: [] }, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Collection failed'),
        })
      );
    });

    it('should use original URL if stable URL data not found (Double Check logic)', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com/stable-path' } };

      mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'key1' });

      mockServices.notionService.updateHighlightsSection.mockResolvedValue({ success: true });
      mockServices.injectionService.collectHighlights.mockResolvedValue([{ text: 'test' }]);

      // First call (stable URL) returns null, second call (original URL) returns data
      mockServices.storageService.getSavedPageData
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ notionPageId: 'page_orig' });

      // Update tabService mock to simulate divergent URLs
      mockServices.tabService.resolveTabUrl.mockResolvedValue({
        stableUrl: 'https://example.com/stable-url',
        originalUrl: 'https://example.com/original-url',
        migrated: false,
      });

      await handlers.updateHighlights({ highlights: [] }, sender, sendResponse);

      expect(mockServices.storageService.getSavedPageData).toHaveBeenCalledTimes(2);
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should handle showHighlighter message failure in USER_ACTIVATE_SHORTCUT', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };

      globalThis.chrome.tabs.sendMessage.mockImplementation((id, msg, cb) => {
        if (msg.action === 'PING') {
          cb({ status: 'bundle_ready' });
        } else if (msg.action === 'showHighlighter') {
          globalThis.chrome.runtime.lastError = { message: 'Communication error' };
          cb(null);
          globalThis.chrome.runtime.lastError = null;
        }
      });

      mockServices.injectionService.ensureBundleInjected.mockResolvedValue();

      await handlers.USER_ACTIVATE_SHORTCUT({}, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });
  });

  describe('Coverage Improvements (Base)', () => {
    it('USER_ACTIVATE_SHORTCUT 應該處理受限 URL', async () => {
      isRestrictedInjectionUrl.mockReturnValue(true);
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'chrome://extensions' } };

      await handlers.USER_ACTIVATE_SHORTCUT({}, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('USER_ACTIVATE_SHORTCUT 應該處理缺少分頁上下文', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: null };

      await handlers.USER_ACTIVATE_SHORTCUT({}, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) })
      );
    });

    it('USER_ACTIVATE_SHORTCUT 應該處理 Bundle 注入失敗', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };

      mockServices.injectionService.ensureBundleInjected.mockRejectedValue(
        new Error('Bundle error')
      );

      await handlers.USER_ACTIVATE_SHORTCUT({}, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });
  });
});
