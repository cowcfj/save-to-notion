import { createHighlightHandlers } from '../../../../scripts/background/handlers/highlightHandlers.js';
import { ERROR_MESSAGES } from '../../../../scripts/config/shared/messages.js';
import { RUNTIME_ACTIONS } from '../../../../scripts/config/shared/runtimeActions.js';
import { CONTENT_BRIDGE_ACTIONS } from '../../../../scripts/config/runtimeActions/contentBridgeActions.js';
import { isRestrictedInjectionUrl } from '../../../../scripts/background/services/InjectionService.js';
import {
  validateContentScriptRequest,
  validateInternalRequest,
} from '../../../../scripts/utils/securityUtils.js';
import { sanitizeApiError } from '../../../../scripts/utils/ApiErrorSanitizer.js';
import { ErrorHandler } from '../../../../scripts/utils/ErrorHandler.js';
const { ErrorHandler: ActualErrorHandler } = jest.requireActual(
  '../../../../scripts/utils/ErrorHandler.js'
);
import { normalizeUrl } from '../../../../scripts/utils/urlUtils.js';
import { getActiveNotionToken, ensureNotionApiKey } from '../../../../scripts/utils/notionAuth.js';
import { sanitizeUrlForLogging } from '../../../../scripts/utils/LogSanitizer.js';

jest.mock('../../../../scripts/utils/Logger.js');
jest.mock('../../../../scripts/background/services/InjectionService.js');
jest.mock('../../../../scripts/utils/securityUtils.js');
jest.mock('../../../../scripts/utils/ApiErrorSanitizer.js');
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
    ErrorHandler.formatUserMessage.mockImplementation(ActualErrorHandler.formatUserMessage);

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

    it('應該處理 syncHighlights 失敗 (API 錯誤) 並透傳下游 errorCode (ADR 0007)', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };
      const request = { highlights: [{ text: 'test' }] };

      mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'key1' });
      mockServices.storageService.getSavedPageData.mockResolvedValue({ notionPageId: 'page1' });
      mockServices.notionService.updateHighlightsSection.mockResolvedValue({
        success: false,
        error: 'Sync failed',
        errorCode: 'highlight_sync_failed',
      });

      await handlers.syncHighlights(request, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errorCode: 'highlight_sync_failed',
        })
      );
    });

    it('highlight section retryable failure 應返回可重試的友善訊息', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };
      const request = { highlights: [{ text: 'test' }] };

      mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'key1' });
      mockServices.storageService.getSavedPageData.mockResolvedValue({ notionPageId: 'page1' });
      mockServices.notionService.updateHighlightsSection.mockResolvedValue({
        success: false,
        error: 'HIGHLIGHT_SECTION_DELETE_INCOMPLETE',
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
        error: 'OBJECT_NOT_FOUND',
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
        error: 'OBJECT_NOT_FOUND',
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
        error: 'OBJECT_NOT_FOUND',
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
      expect(globalThis.Logger.error).toHaveBeenCalledWith(
        '清除本地 Notion 狀態失敗',
        expect.objectContaining({
          action: 'performHighlightUpdate',
          url: 'https://example.com/',
          attempts: 2,
          error: expect.any(Error),
          result: 'cleanup_failed',
        })
      );
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
        error: 'OBJECT_NOT_FOUND',
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

    it('savedData 缺 notionPageId 時 envelope 應帶 errorCode: PAGE_NOT_SAVED (ADR 0007)', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };
      const request = { highlights: [{ text: 'test' }] };

      mockServices.storageService.getSavedPageData.mockResolvedValue(null);

      await handlers.syncHighlights(request, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          errorCode: 'PAGE_NOT_SAVED',
        })
      );
      expect(mockServices.notionService.updateHighlightsSection).not.toHaveBeenCalled();
    });

    it('應該處理缺少 sender.tab 的情況', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: null };
      const request = { highlights: [{ text: 'test' }] };

      await handlers.syncHighlights(request, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: ERROR_MESSAGES.PATTERNS[ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB],
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
          error: ERROR_MESSAGES.PATTERNS[ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB],
        })
      );
      expect(mockServices.storageService.getConfig).not.toHaveBeenCalled();
      expect(mockServices.storageService.getSavedPageData).not.toHaveBeenCalled();
      expect(mockServices.notionService.updateHighlightsSection).not.toHaveBeenCalled();
    });
  });

  describe('startHighlight', () => {
    it('沒有 active tab 時應回傳 NO_ACTIVE_TAB 且不記錄 generic error', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id' };

      globalThis.chrome.tabs.query.mockResolvedValueOnce([]);

      await handlers.startHighlight({}, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: ERROR_MESSAGES.PATTERNS[ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB],
          errorCode: ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB,
        })
      );
      expect(mockServices.injectionService.ensureBundleInjected).not.toHaveBeenCalled();
      expect(globalThis.Logger.error).not.toHaveBeenCalledWith(
        '啟動高亮工具時出錯',
        expect.any(Object)
      );
    });

    it('應該透過 ACTIVATE_FLOATING_RAIL_HIGHLIGHT 啟動已注入的高亮工具', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id' };

      mockServices.injectionService.ensureBundleInjected.mockResolvedValue(true);

      globalThis.chrome.tabs.sendMessage.mockImplementation((id, msg, cb) => {
        if (msg.action === 'PING') {
          cb({ status: 'bundle_ready' });
        } else {
          cb({ success: true });
        }
      });

      await handlers.startHighlight({}, sender, sendResponse);

      expect(mockServices.injectionService.ensureBundleInjected).toHaveBeenCalledWith(1);
      expect(globalThis.chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        { action: RUNTIME_ACTIONS.ACTIVATE_FLOATING_RAIL_HIGHLIGHT, sessionOverride: true },
        expect.any(Function)
      );
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('如果 Bundle 初始化超時，應回傳 BUNDLE_INIT_TIMEOUT 錯誤且不發送啟動訊息', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id' };

      mockServices.injectionService.ensureBundleInjected.mockResolvedValue(true);

      // 模擬 PING 永遠回傳 error 導致超時
      globalThis.chrome.tabs.sendMessage.mockImplementation((id, msg, cb) => {
        if (msg.action === 'PING') {
          globalThis.chrome.runtime.lastError = { message: 'Timeout' };
          cb(null);
          globalThis.chrome.runtime.lastError = null;
        } else {
          cb({ success: true });
        }
      });

      await handlers.startHighlight({}, sender, sendResponse);

      expect(mockServices.injectionService.ensureBundleInjected).toHaveBeenCalledWith(1);
      expect(globalThis.chrome.tabs.sendMessage).not.toHaveBeenCalledWith(
        1,
        { action: RUNTIME_ACTIONS.ACTIVATE_FLOATING_RAIL_HIGHLIGHT },
        expect.any(Function)
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: ERROR_MESSAGES.USER_MESSAGES.BUNDLE_INIT_TIMEOUT,
        })
      );
    });

    it('如果 Bundle 初始化超時且 injection service 支援 cleanup，應先清理半初始化 bundle', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id' };

      mockServices.injectionService.ensureBundleInjected.mockResolvedValue(true);
      mockServices.injectionService.removeBundle = jest.fn().mockResolvedValue();

      globalThis.chrome.tabs.sendMessage.mockImplementation((_id, msg, cb) => {
        if (msg.action === 'PING') {
          globalThis.chrome.runtime.lastError = { message: 'Timeout' };
          cb(null);
          globalThis.chrome.runtime.lastError = null;
        }
      });

      await handlers.startHighlight({}, sender, sendResponse);

      expect(mockServices.injectionService.removeBundle).toHaveBeenCalledWith(1);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: ERROR_MESSAGES.USER_MESSAGES.BUNDLE_INIT_TIMEOUT,
        })
      );
    });

    it('如果 Bundle 初始化超時且 cleanup 失敗，應記錄 cleanup error 並維持 timeout 回應', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id' };
      const cleanupError = new Error('cleanup failed');

      mockServices.injectionService.ensureBundleInjected.mockResolvedValue(true);
      mockServices.injectionService.cleanupInjectedBundle = jest
        .fn()
        .mockRejectedValue(cleanupError);

      globalThis.chrome.tabs.sendMessage.mockImplementation((_id, msg, cb) => {
        if (msg.action === 'PING') {
          globalThis.chrome.runtime.lastError = { message: 'Timeout' };
          cb(null);
          globalThis.chrome.runtime.lastError = null;
        }
      });

      await handlers.startHighlight({}, sender, sendResponse);

      expect(mockServices.injectionService.cleanupInjectedBundle).toHaveBeenCalledWith(1);
      expect(globalThis.Logger.error).toHaveBeenCalledWith(
        'Bundle 初始化超時後清理失敗',
        expect.objectContaining({
          action: 'startHighlight',
          tabId: 1,
          error: cleanupError.message,
        })
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: ERROR_MESSAGES.USER_MESSAGES.BUNDLE_INIT_TIMEOUT,
        })
      );
    });

    it('如果 Bundle 初始化超時且沒有 cleanup API，應記錄半初始化狀態警告', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id' };

      mockServices.injectionService.ensureBundleInjected.mockResolvedValue(true);

      globalThis.chrome.tabs.sendMessage.mockImplementation((_id, msg, cb) => {
        if (msg.action === 'PING') {
          globalThis.chrome.runtime.lastError = { message: 'Timeout' };
          cb(null);
          globalThis.chrome.runtime.lastError = null;
        }
      });

      await handlers.startHighlight({}, sender, sendResponse);

      expect(globalThis.Logger.warn).toHaveBeenCalledWith(
        'Bundle 初始化超時且無可用 cleanup API，可能留下半初始化 bundle',
        expect.objectContaining({
          action: 'startHighlight',
          tabId: 1,
          state: 'half_initialized_bundle',
        })
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: ERROR_MESSAGES.USER_MESSAGES.BUNDLE_INIT_TIMEOUT,
        })
      );
    });

    it('[REGRESSION] 當 content script 初始化 Floating Rail 失敗時，應直接回傳 content script 的中文錯誤資訊，不應呼叫 injectHighlighter()', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id' };

      // Mock ensureBundleInjected 成功
      mockServices.injectionService.ensureBundleInjected.mockResolvedValue(true);

      // Mock PING 為 bundle_ready，但 ACTIVATE_FLOATING_RAIL_HIGHLIGHT 回傳失敗與中文錯誤
      globalThis.chrome.tabs.sendMessage.mockImplementation((id, msg, cb) => {
        if (msg.action === 'PING') {
          cb({ status: 'bundle_ready' });
        } else if (msg.action === RUNTIME_ACTIONS.ACTIVATE_FLOATING_RAIL_HIGHLIGHT) {
          cb({ success: false, error: '浮動側欄初始化失敗' });
        }
      });

      await handlers.startHighlight({}, sender, sendResponse);

      // 應呼叫 ensureBundleInjected，但不應呼叫 injectHighlighter
      expect(mockServices.injectionService.ensureBundleInjected).toHaveBeenCalledWith(1);
      expect(mockServices.injectionService.injectHighlighter).not.toHaveBeenCalled();

      // 應直接轉發 content script 回傳的錯誤
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '浮動側欄初始化失敗',
      });
    });
  });

  describe('SHOW_FLOATING_RAIL', () => {
    it('[REGRESSION] preloader 觸發時應注入 bundle 並轉發 content bridge action 到目前 tab', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };

      mockServices.injectionService.ensureBundleInjected.mockResolvedValue(true);
      globalThis.chrome.tabs.sendMessage.mockImplementation((id, msg, cb) => {
        if (msg.action === RUNTIME_ACTIONS.PING) {
          cb({ status: 'bundle_ready' });
          return;
        }
        cb({ success: true });
      });

      await handlers.SHOW_FLOATING_RAIL(
        { action: RUNTIME_ACTIONS.SHOW_FLOATING_RAIL },
        sender,
        sendResponse
      );

      expect(mockServices.injectionService.ensureBundleInjected).toHaveBeenCalledWith(1);
      expect(globalThis.chrome.tabs.sendMessage).toHaveBeenCalledWith(
        1,
        { action: CONTENT_BRIDGE_ACTIONS.SHOW_FLOATING_RAIL },
        expect.any(Function)
      );
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
        } else if (msg.action === RUNTIME_ACTIONS.ACTIVATE_FLOATING_RAIL_HIGHLIGHT) {
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
          error: ERROR_MESSAGES.PATTERNS[ERROR_MESSAGES.TECHNICAL.API_KEY_NOT_CONFIGURED],
        })
      );
    });

    it('UPDATE_REMOTE_HIGHLIGHTS catch fallback 應帶 errorCode: INTERNAL_ERROR (ADR 0007)', async () => {
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
          errorCode: 'INTERNAL_ERROR',
        })
      );
    });

    it('UPDATE_REMOTE_HIGHLIGHTS 沒有 active tab 時應回傳 NO_ACTIVE_TAB errorCode', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id' };

      globalThis.chrome.tabs.query.mockResolvedValueOnce([]);

      await handlers[RUNTIME_ACTIONS.UPDATE_REMOTE_HIGHLIGHTS]({}, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: ERROR_MESSAGES.PATTERNS[ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB],
          errorCode: ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB,
        })
      );
      expect(mockServices.injectionService.collectHighlights).not.toHaveBeenCalled();
      expect(globalThis.Logger.error).not.toHaveBeenCalledWith(
        '更新標註時出錯',
        expect.any(Object)
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

    it('should handle ACTIVATE_FLOATING_RAIL_HIGHLIGHT message failure in USER_ACTIVATE_SHORTCUT', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };

      globalThis.chrome.tabs.sendMessage.mockImplementation((id, msg, cb) => {
        if (msg.action === 'PING') {
          cb({ status: 'bundle_ready' });
        } else if (msg.action === RUNTIME_ACTIONS.ACTIVATE_FLOATING_RAIL_HIGHLIGHT) {
          globalThis.chrome.runtime.lastError = { message: 'Communication error' };
          cb(null);
          globalThis.chrome.runtime.lastError = null;
        }
      });

      mockServices.injectionService.ensureBundleInjected.mockResolvedValue();

      await handlers.USER_ACTIVATE_SHORTCUT({}, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('應該傳遞 content script 回報的 ACTIVATE_FLOATING_RAIL_HIGHLIGHT 失敗結果', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 1, url: 'https://example.com' } };

      globalThis.chrome.tabs.sendMessage.mockImplementation((id, msg, cb) => {
        if (msg.action === 'PING') {
          cb({ status: 'bundle_ready' });
        } else if (msg.action === RUNTIME_ACTIONS.ACTIVATE_FLOATING_RAIL_HIGHLIGHT) {
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

  describe('toast 推送（sync failure → SHOW_TOAST）', () => {
    it('SYNC_HIGHLIGHTS auth 失敗 → 應推送 SYNC_FAILED_AUTH toast', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 7, url: 'https://example.com' } };
      const request = { highlights: [{ text: 'test' }] };

      mockServices.storageService.getSavedPageData.mockResolvedValue({ notionPageId: 'page1' });
      mockServices.notionService.updateHighlightsSection.mockResolvedValue({
        success: false,
        error: 'unauthorized',
        errorCode: 'UNAUTHORIZED',
      });

      await handlers.syncHighlights(request, sender, sendResponse);

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          action: 'SHOW_TOAST',
          messageKey: 'SYNC_FAILED_AUTH',
          level: 'error',
        })
      );
    });

    it('SYNC_HIGHLIGHTS HIGHLIGHT_SECTION_DELETE_INCOMPLETE → 不推送 toast', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 7, url: 'https://example.com' } };
      const request = { highlights: [{ text: 'test' }] };

      mockServices.storageService.getSavedPageData.mockResolvedValue({ notionPageId: 'page1' });
      mockServices.notionService.updateHighlightsSection.mockResolvedValue({
        success: false,
        error: 'partial',
        errorCode: 'HIGHLIGHT_SECTION_DELETE_INCOMPLETE',
      });

      await handlers.syncHighlights(request, sender, sendResponse);

      expect(chrome.tabs.sendMessage).not.toHaveBeenCalledWith(
        7,
        expect.objectContaining({ action: 'SHOW_TOAST' })
      );
    });

    it('performHighlightUpdate 應透傳 errorCode 欄位至 response', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-id', tab: { id: 7, url: 'https://example.com' } };
      const request = { highlights: [{ text: 'test' }] };

      mockServices.storageService.getSavedPageData.mockResolvedValue({ notionPageId: 'page1' });
      mockServices.notionService.updateHighlightsSection.mockResolvedValue({
        success: false,
        error: 'rate limited',
        errorCode: 'RATE_LIMITED',
      });

      await handlers.syncHighlights(request, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ errorCode: 'RATE_LIMITED' })
      );
    });
  });
});
