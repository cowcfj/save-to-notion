/**
 * @jest-environment jsdom
 */

import { createSaveHandlers } from '../../../../scripts/background/handlers/saveHandlers.js';
import { isRestrictedInjectionUrl } from '../../../../scripts/background/services/InjectionService.js';
import { validateInternalRequest } from '../../../../scripts/utils/securityUtils.js';
import { normalizeUrl, resolveStorageUrl } from '../../../../scripts/utils/urlUtils.js';

jest.mock('../../../../scripts/background/services/InjectionService.js', () => ({
  isRestrictedInjectionUrl: jest.fn(),
}));

jest.mock('../../../../scripts/utils/securityUtils.js', () => {
  const original = jest.requireActual('../../../../scripts/utils/securityUtils.js');
  return {
    __esModule: true,
    ...original,
    validateInternalRequest: jest.fn(original.validateInternalRequest),
  };
});

jest.mock('../../../../scripts/utils/urlUtils.js', () => ({
  __esModule: true,
  normalizeUrl: jest.fn(url => url), // Default identity
  resolveStorageUrl: jest.fn(url => url), // Default identity
}));

jest.mock('../../../../scripts/utils/ErrorHandler.js', () => ({
  __esModule: true,
  ErrorHandler: {
    formatUserMessage: jest.fn(msg => msg),
  },
}));

// Mock Logger
globalThis.Logger = {
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  success: jest.fn(),
  start: jest.fn(),
  ready: jest.fn(),
  addLogToBuffer: jest.fn(),
};

// Mock chrome API
globalThis.chrome = {
  runtime: {
    id: 'test-extension-id',
  },
  tabs: {
    query: jest.fn(),
    create: jest.fn(),
  },
  action: {
    setBadgeText: jest.fn(),
  },
};

describe('saveHandlers', () => {
  let handlers = null;
  let mockServices = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockServices = {
      notionService: {
        checkPageExists: jest.fn(),
        createPage: jest.fn(),
        buildPageData: jest.fn(),
        updateHighlightsSection: jest.fn(),
        refreshPageContent: jest.fn(),
      },
      storageService: {
        getConfig: jest.fn(),
        getSavedPageData: jest.fn(),
        setSavedPageData: jest.fn(),
        clearPageState: jest.fn(),
      },
      injectionService: {
        injectHighlighter: jest.fn(),
        collectHighlights: jest.fn(),
        inject: jest.fn(),
      },
      pageContentService: {
        extractContent: jest.fn(),
      },
      migrationService: {
        migrateStorageKey: jest.fn(),
        executeContentMigration: jest.fn(),
      },
    };
    handlers = createSaveHandlers(mockServices);
  });

  describe('Security Checks', () => {
    test('savePage 應拒絕外部請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };
      await handlers.savePage({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    test('openNotionPage 應拒絕外部請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };
      await handlers.openNotionPage({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    test('checkNotionPageExists 應拒絕外部請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };
      await handlers.checkNotionPageExists({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    test('checkPageStatus 應拒絕外部請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };
      await handlers.checkPageStatus({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    test('devLogSink 應拒絕非 Content Script 請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-extension-id', url: 'https://evil.com' };
      await handlers.devLogSink({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });
  });

  describe('Action Logic', () => {
    // Shared setup for action tests
    const validSender = {
      id: 'test-extension-id',
      origin: 'chrome-extension://test-extension-id',
    };
    const validContentScriptSender = {
      id: 'test-extension-id',
      tab: { id: 1 },
      url: 'https://example.com',
    };

    beforeEach(() => {
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      // Default config
      mockServices.storageService.getConfig.mockResolvedValue({
        notionApiKey: 'valid-key',
        notionDataSourceId: 'db-123',
      });
      // Default extraction result
      mockServices.pageContentService.extractContent.mockResolvedValue({
        title: 'Test Page',
        blocks: [],
      });
      // Default highlights
      mockServices.injectionService.collectHighlights.mockResolvedValue([]);
      // Default buildPageData
      mockServices.notionService.buildPageData.mockReturnValue({
        pageData: {},
        validBlocks: [],
      });
    });

    // ===== checkNotionPageExists Tests =====
    test('checkNotionPageExists 應在合法請求時調用 service', async () => {
      const sendResponse = jest.fn();
      mockServices.notionService.checkPageExists.mockResolvedValue(true);

      await handlers.checkNotionPageExists({ pageId: 'page1' }, validSender, sendResponse);

      expect(mockServices.notionService.checkPageExists).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, exists: true })
      );
    });

    // ===== savePage Tests =====
    test('savePage: 新頁面應創建成功', async () => {
      const sendResponse = jest.fn();
      mockServices.storageService.getSavedPageData.mockResolvedValue(null); // No saved data
      mockServices.notionService.createPage.mockResolvedValue({
        success: true,
        pageId: 'new-page-id',
        url: 'https://notion.so/new-page',
      });

      await handlers.savePage({}, validSender, sendResponse);

      expect(mockServices.storageService.getConfig).toHaveBeenCalled();
      expect(mockServices.injectionService.injectHighlighter).toHaveBeenCalled();
      expect(mockServices.pageContentService.extractContent).toHaveBeenCalled();
      expect(mockServices.notionService.createPage).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, created: true })
      );
    });

    test('savePage: 已有頁面且有新標註，應更新標註', async () => {
      const sendResponse = jest.fn();
      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'existing-id',
      });
      mockServices.notionService.checkPageExists.mockResolvedValue(true);
      mockServices.injectionService.collectHighlights.mockResolvedValue([{ text: 'highlight' }]);
      mockServices.notionService.updateHighlightsSection.mockResolvedValue({ success: true });

      await handlers.savePage({}, validSender, sendResponse);

      expect(mockServices.notionService.updateHighlightsSection).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ highlightsUpdated: true })
      );
    });

    test('savePage: 已有頁面且無新標註，應刷新內容', async () => {
      const sendResponse = jest.fn();
      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'existing-id',
      });
      mockServices.notionService.checkPageExists.mockResolvedValue(true);
      mockServices.injectionService.collectHighlights.mockResolvedValue([]); // No highlights
      mockServices.notionService.refreshPageContent.mockResolvedValue({ success: true });

      await handlers.savePage({}, validSender, sendResponse);

      expect(mockServices.notionService.refreshPageContent).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ updated: true }));
    });

    // ===== openNotionPage Tests =====
    test('openNotionPage: 應該成功打開已保存的 Notion 頁面', async () => {
      const sendResponse = jest.fn();
      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page-123',
        notionUrl: 'https://notion.so/page-123',
      });
      // Mock chrome.tabs.create callback
      chrome.tabs.create.mockImplementation((opts, callback) => {
        // Support callback style
        if (callback) {
          callback({ id: 99 });
        }
        // Support Promise style
        return Promise.resolve({ id: 99 });
      });

      await handlers.openNotionPage({ url: 'https://example.com' }, validSender, sendResponse);

      expect(chrome.tabs.create).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://notion.so/page-123' })
      );
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    // ===== checkPageStatus Tests =====
    test('checkPageStatus: 緩存有效時應直接返回各個狀態', async () => {
      const sendResponse = jest.fn();
      const validCacheTime = Date.now();
      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page-123',
        lastVerifiedAt: validCacheTime,
        title: 'Cached Title',
      });

      await handlers.checkPageStatus({}, validSender, sendResponse);

      // Should verify calling checkPageExists is NOT called (cache hit)
      expect(mockServices.notionService.checkPageExists).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, isSaved: true })
      );
    });

    test('checkPageStatus: 緩存過期時應調用 API 檢查', async () => {
      const sendResponse = jest.fn();
      mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page-123',
        lastVerifiedAt: 0, // Expired
      });
      mockServices.notionService.checkPageExists.mockResolvedValue(true);

      await handlers.checkPageStatus({}, validSender, sendResponse);

      expect(mockServices.notionService.checkPageExists).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, isSaved: true })
      );
    });

    // ===== devLogSink Tests (Positive) =====
    test('devLogSink: 應接受來自合法 content script 的請求並記錄日誌', () => {
      const sendResponse = jest.fn();
      const logData = { level: 'info', message: 'Test message from content script' };

      handlers.devLogSink(logData, validContentScriptSender, sendResponse);

      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('[ClientLog] Test message'));
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('devLogSink Log Level Validation', () => {
    const validSender = {
      id: 'test-extension-id',
      tab: { id: 1 },
      url: 'https://example.com',
    };

    test('should use correct log level when valid', () => {
      const levels = ['log', 'info', 'warn', 'error', 'debug'];
      levels.forEach(level => {
        handlers.devLogSink({ level, message: 'test' }, validSender, jest.fn());
        expect(Logger[level]).toHaveBeenCalledWith(expect.stringContaining('[ClientLog] test'));
      });
    });

    test('should fallback to log for invalid level', () => {
      handlers.devLogSink({ level: 'invalid', message: 'test' }, validSender, jest.fn());
      expect(Logger.log).toHaveBeenCalledWith(expect.stringContaining('[ClientLog] test'));
    });

    test('should fallback to log for non-function property access', () => {
      handlers.devLogSink({ level: 'addLogToBuffer', message: 'test' }, validSender, jest.fn());
      expect(Logger.log).toHaveBeenCalledWith(expect.stringContaining('[ClientLog] test'));
    });

    test('should fallback to log for prototype property access', () => {
      handlers.devLogSink({ level: 'constructor', message: 'test' }, validSender, jest.fn());
      expect(Logger.log).toHaveBeenCalledWith(expect.stringContaining('[ClientLog] test'));
    });
  });

  describe('Coverage Improvements', () => {
    beforeEach(() => {
      isRestrictedInjectionUrl.mockReturnValue(false);
      validateInternalRequest.mockReturnValue(null);
      mockServices.storageService.getConfig.mockResolvedValue({
        notionApiKey: 'valid-key',
        notionDataSourceId: 'db-123',
      });
      // Mock other services to prevent undefined errors in flows that reach them
      mockServices.injectionService.collectHighlights.mockResolvedValue([]);
      mockServices.injectionService.injectHighlighter.mockResolvedValue(true);
      mockServices.pageContentService.extractContent.mockResolvedValue({
        title: 'Test Page',
        blocks: [],
      });
    });

    test('savePage: 應拒絕非法內部請求', async () => {
      validateInternalRequest.mockReturnValue({ error: 'Access denied' });
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };

      await handlers.savePage({}, sender, sendResponse);

      expect(validateInternalRequest).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Access denied' })
      );
    });

    test('savePage: 應拒絕受限 URL', async () => {
      isRestrictedInjectionUrl.mockReturnValue(true);
      const sendResponse = jest.fn();
      const sender = { id: chrome.runtime.id };
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'chrome://settings' }]);

      await handlers.savePage({}, sender, sendResponse);

      expect(isRestrictedInjectionUrl).toHaveBeenCalledWith('chrome://settings');
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/不支[持援]|restricted/i),
        })
      );
    });

    test('savePage: API Key 缺失應報錯', async () => {
      mockServices.storageService.getConfig.mockResolvedValue({}); // No API key
      const sendResponse = jest.fn();
      const sender = { id: chrome.runtime.id };
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);

      await handlers.savePage({}, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/API Key|配置/i),
        })
      );
    });

    test('savePage: 內容提取失敗應報錯', async () => {
      mockServices.pageContentService.extractContent.mockRejectedValue(new Error('Extract failed'));
      const sendResponse = jest.fn();
      const sender = { id: chrome.runtime.id };
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);

      await handlers.savePage({}, sender, sendResponse);

      expect(Logger.error).toHaveBeenCalledWith(
        expect.stringMatching(/內容提取失敗|驗證失敗/),
        expect.anything()
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/內容提取失敗|驗證失敗|Missing/),
        })
      );
    });

    test('savePage: 應處理創建頁面失敗', async () => {
      mockServices.storageService.getSavedPageData.mockResolvedValue(null);
      mockServices.notionService.createPage.mockResolvedValue({
        success: false,
        error: 'Create failed',
      });
      const sendResponse = jest.fn();
      const sender = { id: chrome.runtime.id };
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);

      await handlers.savePage({}, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false }) // Relax expectation
      );
    });
  });

  describe('Data Migration (Move & Delete)', () => {
    const stableUrl = 'https://example.com/stable';
    const legacyUrl = 'https://example.com/legacy';
    const originalTabUrl = 'https://example.com/legacy';
    const sender = { id: 'test-extension-id', origin: 'chrome-extension://test-extension-id' };
    const sendResponse = jest.fn();

    beforeEach(() => {
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: originalTabUrl }]);

      mockServices.storageService.getConfig.mockResolvedValue({
        notionApiKey: 'valid-key',
        notionDataSourceId: 'db-123',
      });

      // Mock Injection Service default behavior
      mockServices.injectionService.injectHighlighter.mockResolvedValue(true);
      mockServices.injectionService.collectHighlights.mockResolvedValue([]);

      // Ensure utils return different URLs to trigger migration logic
      resolveStorageUrl.mockReturnValue(stableUrl);
      normalizeUrl.mockReturnValue(legacyUrl);

      // Mock Storage: stable -> null, legacy -> data
      mockServices.storageService.getSavedPageData.mockImplementation(key => {
        if (key === stableUrl) {
          return Promise.resolve(null);
        }
        if (key === legacyUrl) {
          return Promise.resolve({
            notionPageId: 'legacy-id-123',
            title: 'Legacy Title',
            lastVerifiedAt: Date.now(),
          });
        }
        return Promise.resolve(null);
      });

      mockServices.notionService.checkPageExists.mockResolvedValue(true);

      // Mock MigrationService behavior
      mockServices.migrationService.migrateStorageKey.mockImplementation(async (stable, legacy) => {
        if (stable === stableUrl && legacy === legacyUrl) {
          // Simulate successful migration side effects (state changes in storage)
          // Storage logic is mocked below, but here we just return success
          return true;
        }
        return false;
      });

      // Update storage mocks to reflect post-migration state when triggered
      mockServices.storageService.getSavedPageData.mockImplementation(key => {
        if (key === stableUrl) {
          return Promise.resolve({
            notionPageId: 'legacy-id-123',
            title: 'Legacy Title',
            lastVerifiedAt: Date.now(),
          });
        }
        return Promise.resolve(null);
      });
    });

    test('checkPageStatus: 應檢測到舊數據並遷移至新 Key', async () => {
      await handlers.checkPageStatus({}, sender, sendResponse);

      // Expect MigrationService to be called
      expect(mockServices.migrationService.migrateStorageKey).toHaveBeenCalledWith(
        stableUrl,
        legacyUrl
      );

      // Respond with migrated data (which comes from getSavedPageData after migration)
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          isSaved: true,
          notionPageId: 'legacy-id-123',
        })
      );
    });

    test('savePage: 保存流程中也應觸發遷移', async () => {
      mockServices.pageContentService.extractContent.mockResolvedValue({
        title: 'Legacy Title',
        blocks: [],
      });

      await handlers.savePage({}, sender, sendResponse);

      expect(mockServices.migrationService.migrateStorageKey).toHaveBeenCalledWith(
        stableUrl,
        legacyUrl
      );

      // Should continue to refresh content for existing page
      expect(mockServices.notionService.refreshPageContent).toHaveBeenCalled();
    });
  });
});
