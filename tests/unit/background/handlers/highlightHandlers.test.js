import { createHighlightHandlers } from '../../../../scripts/background/handlers/highlightHandlers.js';
import { ERROR_MESSAGES } from '../../../../scripts/config/messages.js';
import { RUNTIME_ACTIONS } from '../../../../scripts/config/runtimeActions.js';
import { isRestrictedInjectionUrl } from '../../../../scripts/background/services/InjectionService.js';
import {
  validateContentScriptRequest,
  sanitizeApiError,
  validateInternalRequest,
} from '../../../../scripts/utils/securityUtils.js';
import { ErrorHandler } from '../../../../scripts/utils/ErrorHandler.js';
import { normalizeUrl } from '../../../../scripts/utils/urlUtils.js';
import { getActiveNotionToken, ensureNotionApiKey } from '../../../../scripts/utils/notionAuth.js';
import { sanitizeUrlForLogging } from '../../../../scripts/utils/LogSanitizer.js';

jest.mock('../../../../scripts/utils/Logger.js');
jest.mock('../../../../scripts/background/services/InjectionService.js');
jest.mock('../../../../scripts/utils/securityUtils.js');
jest.mock('../../../../scripts/utils/ErrorHandler.js');
jest.mock('../../../../scripts/utils/urlUtils.js');
jest.mock('../../../../scripts/utils/notionAuth.js');

describe('highlightHandlers', () => {
  let handlers;
  let mockServices;

  beforeEach(() => {
    jest.resetAllMocks();
    getActiveNotionToken.mockResolvedValue({ token: 'key1', mode: 'manual' });
    ensureNotionApiKey.mockResolvedValue('key1');

    // Default mock behaviors for utilities
    validateContentScriptRequest.mockReturnValue(null);
    validateInternalRequest.mockReturnValue(null);
    isRestrictedInjectionUrl.mockReturnValue(false);
    normalizeUrl.mockImplementation(url => url);

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
        checkPageExists: jest.fn(),
      },
      storageService: {
        getHighlighterState: jest.fn(),
        setHighlighterState: jest.fn(),
        getSavedPageData: jest.fn(),
        getHighlights: jest.fn().mockResolvedValue([{ id: 'h1' }, { id: 'h2' }]),
        getConfig: jest.fn(),
        updateHighlights: jest.fn(),
        clearNotionState: jest.fn(),
        clearNotionStateWithRetry: jest.fn().mockResolvedValue({ cleared: true, attempts: 1 }),
      },
      tabService: {
        getStableUrl: jest.fn().mockResolvedValue('https://example.com/stable'),
        getPreloaderData: jest.fn().mockResolvedValue(null),
        confirmRemotePageMissing: jest
          .fn()
          .mockReturnValue({ shouldDelete: false, deletionPending: true }),
        resetRemotePageMissingState: jest
          .fn()
          .mockReturnValue({ shouldDelete: false, deletionPending: false }),
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
        clearPageHighlights: jest.fn(),
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

      await handlers[RUNTIME_ACTIONS.UPDATE_REMOTE_HIGHLIGHTS](request, sender, sendResponse);

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

    it('highlight section retryable failure 應返回可重試的友善訊息', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };
      const request = { highlights: [{ text: 'test' }] };
      const { ErrorHandler: ActualErrorHandler } = jest.requireActual(
        '../../../../scripts/utils/ErrorHandler.js'
      );

      ErrorHandler.formatUserMessage.mockImplementation(error =>
        ActualErrorHandler.formatUserMessage(error)
      );

      mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'key1' });
      mockServices.storageService.getSavedPageData.mockResolvedValue({ notionPageId: 'page1' });
      mockServices.notionService.updateHighlightsSection.mockResolvedValue({
        success: false,
        error: 'highlight_section_delete_incomplete',
        details: { phase: 'delete_highlight_section', retryable: true },
      });

      await handlers.syncHighlights(request, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: '標註同步未完成，請稍後再試',
        })
      );
    });

    it('第一次命中 object_not_found 時應保留本地 notion 綁定並回傳 PAGE_DELETION_PENDING', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };
      const request = { highlights: [{ text: 'test' }] };

      mockServices.storageService.getSavedPageData.mockResolvedValue({ notionPageId: 'page1' });
      mockServices.notionService.updateHighlightsSection.mockResolvedValue({
        success: false,
        error: 'object_not_found',
        details: { phase: 'fetch_blocks' },
      });

      await handlers.syncHighlights(request, sender, sendResponse);

      expect(mockServices.tabService.confirmRemotePageMissing).toHaveBeenCalledWith('page1');
      expect(mockServices.storageService.clearNotionState).not.toHaveBeenCalled();
      expect(mockServices.storageService.clearNotionStateWithRetry).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errorCode: 'PAGE_DELETION_PENDING',
        })
      );
    });

    it('第二次命中 object_not_found 時應清除本地 notion 綁定並回傳 PAGE_DELETED', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };
      const request = { highlights: [{ text: 'test' }] };

      mockServices.storageService.getSavedPageData.mockResolvedValue({ notionPageId: 'page1' });
      mockServices.storageService.clearNotionStateWithRetry.mockResolvedValue({
        cleared: true,
        attempts: 1,
      });
      mockServices.tabService.confirmRemotePageMissing.mockReturnValue({
        shouldDelete: true,
        deletionPending: false,
      });
      mockServices.notionService.updateHighlightsSection.mockResolvedValue({
        success: false,
        error: 'object_not_found',
        details: { phase: 'fetch_blocks' },
      });

      await handlers.syncHighlights(request, sender, sendResponse);

      expect(mockServices.tabService.confirmRemotePageMissing).toHaveBeenCalledWith('page1');
      expect(mockServices.storageService.clearNotionStateWithRetry).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          source: 'highlightHandlers.performHighlightUpdate',
          expectedPageId: 'page1',
        })
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errorCode: 'PAGE_DELETED',
        })
      );
    });

    it('cleanup retry 最終失敗時仍應回傳 PAGE_DELETED', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };
      const request = { highlights: [{ text: 'test' }] };

      mockServices.storageService.getSavedPageData.mockResolvedValue({ notionPageId: 'page1' });
      mockServices.storageService.clearNotionStateWithRetry.mockResolvedValue({
        cleared: false,
        attempts: 2,
        error: new Error('storage unavailable'),
      });
      mockServices.tabService.confirmRemotePageMissing.mockReturnValue({
        shouldDelete: true,
        deletionPending: false,
      });
      mockServices.notionService.updateHighlightsSection.mockResolvedValue({
        success: false,
        error: 'object_not_found',
        details: { phase: 'fetch_blocks' },
      });

      await handlers.syncHighlights(request, sender, sendResponse);

      expect(mockServices.storageService.clearNotionStateWithRetry).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          source: 'highlightHandlers.performHighlightUpdate',
          expectedPageId: 'page1',
        })
      );
      // Re-arm: confirmRemotePageMissing 被呼叫兩次（初始確認 + 清除失敗後 re-arm）
      expect(mockServices.tabService.confirmRemotePageMissing).toHaveBeenCalledTimes(2);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errorCode: 'PAGE_DELETED',
        })
      );
    });

    it('cleanup skipped 時不應回傳 PAGE_DELETED 或重新標記 deletionPending', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };
      const request = { highlights: [{ text: 'test' }] };

      mockServices.storageService.getSavedPageData.mockResolvedValue({ notionPageId: 'page1' });
      mockServices.storageService.clearNotionStateWithRetry.mockResolvedValue({
        cleared: false,
        skipped: true,
        reason: 'pageId_mismatch',
        attempts: 1,
        recovered: false,
      });
      mockServices.tabService.confirmRemotePageMissing.mockReturnValue({
        shouldDelete: true,
        deletionPending: false,
      });
      mockServices.notionService.updateHighlightsSection.mockResolvedValue({
        success: false,
        error: 'object_not_found',
        details: { phase: 'fetch_blocks' },
      });

      await handlers.syncHighlights(request, sender, sendResponse);

      expect(mockServices.storageService.clearNotionStateWithRetry).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          source: 'highlightHandlers.performHighlightUpdate',
          expectedPageId: 'page1',
        })
      );
      expect(mockServices.tabService.confirmRemotePageMissing).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: ERROR_MESSAGES.USER_MESSAGES.CHECK_PAGE_EXISTENCE_FAILED,
        })
      );
      expect(sendResponse).not.toHaveBeenCalledWith(
        expect.objectContaining({
          errorCode: 'PAGE_DELETED',
        })
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

    it('應該處理缺少 sender.tab 的情況', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: null };
      const request = { highlights: [{ text: 'test' }] };

      await handlers.syncHighlights(request, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB,
        })
      );
      expect(mockServices.storageService.getConfig).not.toHaveBeenCalled();
      expect(mockServices.storageService.getSavedPageData).not.toHaveBeenCalled();
      expect(mockServices.notionService.updateHighlightsSection).not.toHaveBeenCalled();
    });

    it('應該處理缺少 sender.tab.url 的情況', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1 } }; // Missing url
      const request = { highlights: [{ text: 'test' }] };

      await handlers.syncHighlights(request, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB,
        })
      );
      expect(mockServices.storageService.getConfig).not.toHaveBeenCalled();
      expect(mockServices.storageService.getSavedPageData).not.toHaveBeenCalled();
      expect(mockServices.notionService.updateHighlightsSection).not.toHaveBeenCalled();
    });
  });

  describe('startHighlight', () => {
    it('應該成功顯示已注入的高亮工具（使用 showHighlighter 而非 toggleHighlighter）', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id' };

      globalThis.chrome.tabs.sendMessage.mockImplementation((id, msg, cb) => cb({ success: true }));

      await handlers.startHighlight({}, sender, sendResponse);

      expect(globalThis.chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        { action: RUNTIME_ACTIONS.SHOW_HIGHLIGHTER },
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

      expect(globalThis.Logger.warn).toHaveBeenCalledWith(
        '發送顯示訊息失敗，嘗試注入腳本',
        expect.objectContaining({
          action: 'startHighlight',
          error: expect.any(Error),
        })
      );
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
          error: ERROR_MESSAGES.USER_MESSAGES.BUNDLE_INIT_TIMEOUT,
        })
      );
    });

    it('should handle missing API key in performHighlightUpdate', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };

      ensureNotionApiKey.mockRejectedValueOnce(
        new Error(ERROR_MESSAGES.TECHNICAL.API_KEY_NOT_CONFIGURED)
      );

      await handlers[RUNTIME_ACTIONS.UPDATE_REMOTE_HIGHLIGHTS]({}, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: ERROR_MESSAGES.TECHNICAL.API_KEY_NOT_CONFIGURED,
        })
      );
    });

    it('should handle collection failure in updateHighlights', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };

      mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'key1' });
      mockServices.injectionService.collectHighlights.mockRejectedValue(
        new Error('Collection failed')
      );

      await handlers[RUNTIME_ACTIONS.UPDATE_REMOTE_HIGHLIGHTS](
        { highlights: [] },
        sender,
        sendResponse
      );

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

      await handlers[RUNTIME_ACTIONS.UPDATE_REMOTE_HIGHLIGHTS](
        { highlights: [] },
        sender,
        sendResponse
      );

      expect(mockServices.storageService.getSavedPageData).toHaveBeenCalledTimes(2);
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should sync successfully when preloader fails (stableUrl equals originalUrl) but storage finds data', async () => {
      // Setup - Simulate Preloader failure causing stableUrl fall back to originalUrl
      const fullPath = 'https://example.com/full-path';
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: fullPath } };
      const request = { highlights: [{ text: 'test' }] };

      mockServices.tabService.resolveTabUrl.mockResolvedValue({
        stableUrl: fullPath,
        originalUrl: fullPath,
        migrated: false,
      });

      // Mock required config & services
      mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });
      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page-123',
        title: 'Saved Page',
      });
      mockServices.notionService.updateHighlightsSection.mockResolvedValue({ success: true });

      // Execution
      await handlers.syncHighlights(request, sender, sendResponse);

      // Verification
      expect(mockServices.storageService.getSavedPageData).toHaveBeenCalledTimes(1);
      expect(mockServices.storageService.getSavedPageData).toHaveBeenCalledWith(fullPath);
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

    it('應該傳遞 content script 回報的 showHighlighter 失敗結果', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };

      globalThis.chrome.tabs.sendMessage.mockImplementation((id, msg, cb) => {
        if (msg.action === 'PING') {
          cb({ status: 'bundle_ready' });
        } else if (msg.action === 'showHighlighter') {
          cb({ success: false, error: 'Highlighter not initialized' });
        }
      });

      mockServices.injectionService.ensureBundleInjected.mockResolvedValue();

      await handlers.USER_ACTIVATE_SHORTCUT({}, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        response: {
          success: false,
          error: 'Highlighter not initialized',
        },
      });
    });
  });

  describe('Coverage Improvements (Base)', () => {
    it('USER_ACTIVATE_SHORTCUT 應該處理安全性驗證失敗', async () => {
      validateContentScriptRequest.mockReturnValue({
        success: false,
        error: '安全性驗證失敗',
      });

      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id', tab: { id: 1, url: 'https://example.com' } };

      await handlers.USER_ACTIVATE_SHORTCUT({}, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: '安全性驗證失敗' })
      );
      expect(mockServices.injectionService.ensureBundleInjected).not.toHaveBeenCalled();
    });

    it('USER_ACTIVATE_SHORTCUT 應該處理受限 URL', async () => {
      isRestrictedInjectionUrl.mockReturnValue(true);
      const sendResponse = jest.fn();
      const blockedUrl = 'https://example.com/article?token=secret123&utm_source=test';
      const sender = { id: 'test-id', tab: { id: 1, url: blockedUrl } };

      await handlers.USER_ACTIVATE_SHORTCUT({}, sender, sendResponse);

      expect(globalThis.Logger.warn).toHaveBeenCalledWith(
        '受限頁面無法使用標註',
        expect.objectContaining({
          url: sanitizeUrlForLogging(blockedUrl),
        })
      );
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

  describe('startHighlight 安全性驗證', () => {
    it('應該拒絕非內部調用', async () => {
      validateInternalRequest.mockReturnValue({
        success: false,
        error: '拒絕訪問',
      });

      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id', tab: { id: 1, url: 'https://example.com' } };

      await handlers.startHighlight({}, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: '拒絕訪問' })
      );
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
      expect(mockServices.injectionService.injectHighlighter).not.toHaveBeenCalled();
    });
  });

  describe('UPDATE_HIGHLIGHTS', () => {
    it('應該成功更新標註', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };
      const request = { url: 'https://example.com', highlights: [{ text: 'hl1' }] };

      mockServices.storageService.updateHighlights.mockResolvedValue();

      await handlers.UPDATE_HIGHLIGHTS(request, sender, sendResponse);

      expect(mockServices.storageService.updateHighlights).toHaveBeenCalledWith(
        'https://example.com',
        [{ text: 'hl1' }]
      );
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('應該處理缺少參數的情況', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };
      const request = { url: 'https://example.com' }; // Missing highlights

      await handlers.UPDATE_HIGHLIGHTS(request, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'INVALID_REQUEST' }),
        })
      );
    });

    it('應該處理 updateHighlights 失敗', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };
      const request = { url: 'https://example.com', highlights: [] };

      mockServices.storageService.updateHighlights.mockRejectedValue(new Error('Update failed'));

      await handlers.UPDATE_HIGHLIGHTS(request, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
        })
      );
    });
  });

  describe('CLEAR_HIGHLIGHTS', () => {
    it('應該拒絕無效的 content script 請求', async () => {
      const validationError = {
        success: false,
        error: 'content script 驗證失敗',
      };
      validateContentScriptRequest.mockReturnValueOnce(validationError);

      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };
      const request = { url: 'https://example.com' };

      await handlers[RUNTIME_ACTIONS.CLEAR_HIGHLIGHTS](request, sender, sendResponse);

      expect(validateContentScriptRequest).toHaveBeenCalledWith(sender);
      expect(validateInternalRequest).not.toHaveBeenCalled();
      expect(mockServices.storageService.updateHighlights).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(validationError);
    });

    it('應該拒絕無效的 popup/internal 請求', async () => {
      const validationError = {
        success: false,
        error: 'internal 驗證失敗',
      };
      validateInternalRequest.mockReturnValueOnce(validationError);

      const sendResponse = jest.fn();
      const sender = { id: 'test-id' };
      const request = { url: 'https://example.com', tabId: 1 };

      await handlers[RUNTIME_ACTIONS.CLEAR_HIGHLIGHTS](request, sender, sendResponse);

      expect(validateInternalRequest).toHaveBeenCalledWith(sender);
      expect(validateContentScriptRequest).not.toHaveBeenCalled();
      expect(mockServices.storageService.updateHighlights).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(validationError);
    });

    it('應該成功清除標註', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };
      const request = { url: 'https://example.com' };

      mockServices.storageService.updateHighlights.mockResolvedValue();

      await handlers[RUNTIME_ACTIONS.CLEAR_HIGHLIGHTS](request, sender, sendResponse);

      expect(mockServices.storageService.updateHighlights).toHaveBeenCalledWith(
        'https://example.com',
        []
      );
      expect(mockServices.injectionService.clearPageHighlights).toHaveBeenCalledWith(1);
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        clearedCount: 2,
        visualCleared: true,
      });
    });

    it('頁面視覺清除失敗時仍應回報 storage 清除成功', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };
      const request = { url: 'https://example.com' };

      mockServices.storageService.updateHighlights.mockResolvedValue();
      mockServices.injectionService.clearPageHighlights.mockRejectedValueOnce(
        new Error('Visual cleanup failed')
      );

      await handlers[RUNTIME_ACTIONS.CLEAR_HIGHLIGHTS](request, sender, sendResponse);

      expect(mockServices.storageService.updateHighlights).toHaveBeenCalledWith(
        'https://example.com',
        []
      );
      expect(mockServices.injectionService.clearPageHighlights).toHaveBeenCalledWith(1);
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        clearedCount: 2,
        visualCleared: false,
      });
    });

    it('應該允許 popup/internal sender 清除標註並清頁面高亮', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id' };
      const request = { url: 'https://example.com', tabId: 1 };

      mockServices.storageService.updateHighlights.mockResolvedValue();

      await handlers[RUNTIME_ACTIONS.CLEAR_HIGHLIGHTS](request, sender, sendResponse);

      expect(validateInternalRequest).toHaveBeenCalledWith(sender);
      expect(mockServices.storageService.updateHighlights).toHaveBeenCalledWith(
        'https://example.com',
        []
      );
      expect(mockServices.injectionService.clearPageHighlights).toHaveBeenCalledWith(1);
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        clearedCount: 2,
        visualCleared: true,
      });
    });

    it('應該處理缺少 url 的情況', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };
      const request = {};

      await handlers[RUNTIME_ACTIONS.CLEAR_HIGHLIGHTS](request, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'INVALID_REQUEST' }),
        })
      );
    });

    it('應該處理清除失敗', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };
      const request = { url: 'https://example.com' };

      mockServices.storageService.updateHighlights.mockRejectedValue(new Error('Clear failed'));

      await handlers[RUNTIME_ACTIONS.CLEAR_HIGHLIGHTS](request, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
        })
      );
    });
  });
});
