/**
 * @jest-environment jsdom
 */

import { createSaveHandlers } from '../../../../scripts/background/handlers/saveHandlers.js';

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
});
