/**
 * @jest-environment jsdom
 */

/* global chrome */

/* skipcq: JS-0255
 * Chrome 擴展 API 使用 chrome.runtime.lastError 而非 error-first callback 模式，
 * 因此 mock 實作中的 callback 第一個參數是資料而非錯誤
 */

/**
 * actionHandlers.js 覆蓋率補強測試
 *
 * 針對 createActionHandlers 中的各種 handler 進行測試，包含 savePage 核心流程與其他輔助 handlers
 */

// Logger.module.js 已刪除，使用 presetup.js 提供的 global.Logger

jest.mock('../../../../scripts/utils/urlUtils.js', () => ({
  normalizeUrl: jest.fn(url => url),
}));

jest.mock('../../../../scripts/background/utils/BlockBuilder.js', () => ({
  buildHighlightBlocks: jest.fn(highlights =>
    highlights.map(highlight => ({ type: 'quote', quote: { text: highlight.text } }))
  ),
}));

jest.mock('../../../../scripts/background/services/InjectionService.js', () => ({
  isRestrictedInjectionUrl: jest.fn(url => url?.startsWith('chrome://')),
}));

// 引入測試所需模組
import { ErrorHandler } from '../../../../scripts/utils/ErrorHandler.js';
import { ERROR_MESSAGES } from '../../../../scripts/config/constants.js';

jest.mock('../../../../scripts/config/constants.js', () => {
  const original = jest.requireActual('../../../../scripts/config/constants.js');
  return {
    __esModule: true,
    ...original,
    HANDLER_CONSTANTS: {
      ...original.HANDLER_CONSTANTS,
      BUNDLE_READY_RETRY_DELAY: 1,
      BUNDLE_READY_MAX_RETRIES: 2,
      CHECK_DELAY: 1,
      IMAGE_RETRY_DELAY: 1,
      PAGE_STATUS_CACHE_TTL: 1000,
    },
  };
});

// Mock chrome API
global.chrome = {
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
    create: jest.fn(),
  },
  runtime: {
    lastError: null,
  },
};

// 使用 presetup.js 提供的 global.Logger（若需要可在測試中透過 global.Logger 存取）

// ES Module 導入 - 在 jest.mock 後執行
import {
  createSaveHandlers,
  processContentResult,
} from '../../../../scripts/background/handlers/saveHandlers.js';
import { createHighlightHandlers } from '../../../../scripts/background/handlers/highlightHandlers.js';
import { createMigrationHandlers } from '../../../../scripts/background/handlers/migrationHandlers.js';

describe('actionHandlers 覆蓋率補強', () => {
  // Mock services
  let mockNotionService = null;
  let mockStorageService = null;
  let mockInjectionService = null;
  let mockPageContentService = null;
  let handlers = null;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Logger 為非調試模式
    global.Logger = {
      debugEnabled: false,
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      log: jest.fn(),
      debug: jest.fn(),
    };

    mockNotionService = {
      setApiKey: jest.fn(),
      checkPageExists: jest.fn(),
      updateHighlightsSection: jest.fn(),
      refreshPageContent: jest.fn(),
      createPage: jest.fn(),
      buildPageData: jest.fn(() => ({
        pageData: {},
        validBlocks: [],
      })),
    };

    mockStorageService = {
      getConfig: jest.fn(),
      getSavedPageData: jest.fn(),
      setSavedPageData: jest.fn(),
      clearPageState: jest.fn(),
    };

    mockInjectionService = {
      injectHighlighter: jest.fn(),
      inject: jest.fn(),
      collectHighlights: jest.fn(),
    };

    mockPageContentService = {
      extractContent: jest.fn(),
    };

    // Manually aggregate handlers to mimic background.js behavior
    handlers = {
      ...createSaveHandlers({
        notionService: mockNotionService,
        storageService: mockStorageService,
        injectionService: mockInjectionService,
        pageContentService: mockPageContentService,
      }),
      ...createHighlightHandlers({
        notionService: mockNotionService,
        storageService: mockStorageService,
        injectionService: mockInjectionService,
      }),
      ...createMigrationHandlers({
        notionService: mockNotionService,
        storageService: mockStorageService,
        // migrationHandlers 不需要 injectionService 參數
      }),
    };
  });

  afterEach(() => {
    chrome.runtime.lastError = null;
  });

  describe('processContentResult', () => {
    test('應該在沒有標註時返回原始 blocks', () => {
      const result = processContentResult({ title: 'Test', blocks: [{ type: 'paragraph' }] }, []);
      expect(result.title).toBe('Test');
      expect(result.blocks).toHaveLength(1);
    });

    test('應該在有標註時添加 highlight blocks', () => {
      const result = processContentResult({ title: 'Test', blocks: [] }, [{ text: 'highlight 1' }]);
      expect(result.blocks).toHaveLength(1);
    });

    test('應該處理 null/undefined 輸入', () => {
      const result = processContentResult(null, null);
      expect(result.title).toBe('Untitled');
      expect(result.blocks).toEqual([]);
      expect(result.siteIcon).toBeNull();
    });
  });

  // === savePage 流程測試 (核心邏輯) ===
  describe('savePage Handler (Core Logic)', () => {
    const mockTab = { id: 1, url: 'https://example.com', title: 'Test Page' };
    const mockConfig = {
      notionApiKey: 'secret-key',
      notionDataSourceId: 'db-123',
    };
    const mockContentResult = {
      title: 'Test Page',
      blocks: [{ type: 'paragraph' }],
      siteIcon: 'icon.png',
    };

    beforeEach(() => {
      // Default successful setup
      chrome.tabs.query.mockResolvedValue([mockTab]);
      mockStorageService.getConfig.mockResolvedValue(mockConfig);
      mockInjectionService.collectHighlights.mockResolvedValue([]);
      mockPageContentService.extractContent.mockResolvedValue(mockContentResult);
    });

    test('應該在受限頁面（如 chrome://extensions/）返回明確錯誤訊息', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'chrome://extensions/' }]);

      await handlers.savePage({}, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: ERROR_MESSAGES.USER_MESSAGES.SAVE_NOT_SUPPORTED_RESTRICTED_PAGE,
        })
      );
    });

    test('應該在無法獲取 active tab 時失敗', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockResolvedValue([]);

      await handlers.savePage({}, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB),
        })
      );
    });

    test('應該在缺少 API Key 時失敗', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getConfig.mockResolvedValue({});

      await handlers.savePage({}, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.MISSING_API_KEY),
        })
      );
    });

    test('應該在有 API Key 但缺少 Data Source ID 時失敗', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getConfig.mockResolvedValue({ notionApiKey: 'valid-key' });

      await handlers.savePage({}, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.MISSING_DATA_SOURCE),
        })
      );
    });

    test('應該在內容提取失敗時失敗', async () => {
      const sendResponse = jest.fn();
      mockPageContentService.extractContent.mockRejectedValue(new Error('Extract failed'));

      await handlers.savePage({}, {}, sendResponse);
      // 修正斷言：當 extract 拋出異常時，會返回 'Content extraction script returned no result.'
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: ERROR_MESSAGES.USER_MESSAGES.CONTENT_EXTRACTION_FAILED,
        })
      );
    });

    // 測試 determineAndExecuteSaveAction：新頁面流程
    test('新頁面：應該調用 createPage', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getSavedPageData.mockResolvedValue(null); // No saved data
      mockNotionService.createPage.mockResolvedValue({
        success: true,
        pageId: 'new-page-id',
        url: 'notion.so/new',
      });

      await handlers.savePage({}, {}, sendResponse);

      expect(mockNotionService.createPage).toHaveBeenCalled();
      expect(mockStorageService.setSavedPageData).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({ notionPageId: 'new-page-id' })
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, created: true })
      );
    });

    // 測試 determineAndExecuteSaveAction：已有頁面流程 - 更新標註
    test('已有頁面：有新標註時應該調用 updateHighlightsSection', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getSavedPageData.mockResolvedValue({ notionPageId: 'existing-id' });
      mockNotionService.checkPageExists.mockResolvedValue(true);
      mockInjectionService.collectHighlights.mockResolvedValue([{ text: 'new highlight' }]);
      mockNotionService.updateHighlightsSection.mockResolvedValue({ success: true });

      await handlers.savePage({}, {}, sendResponse);

      expect(mockNotionService.updateHighlightsSection).toHaveBeenCalledWith(
        'existing-id',
        expect.any(Array)
      );
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ highlightsUpdated: true })
      );
    });

    // 測試 determineAndExecuteSaveAction：已有頁面流程 - 刷新內容
    test('已有頁面：無新標註時應該調用 refreshPageContent', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getSavedPageData.mockResolvedValue({ notionPageId: 'existing-id' });
      mockNotionService.checkPageExists.mockResolvedValue(true);
      mockInjectionService.collectHighlights.mockResolvedValue([]); // No highlights
      mockNotionService.refreshPageContent.mockResolvedValue({ success: true });

      await handlers.savePage({}, {}, sendResponse);

      expect(mockNotionService.refreshPageContent).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ updated: true }));
    });

    // 測試 determineAndExecuteSaveAction：頁面已刪除
    test('已有頁面但 Notion 中已刪除：應該重新創建頁面', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getSavedPageData.mockResolvedValue({ notionPageId: 'deleted-id' });
      mockNotionService.checkPageExists.mockResolvedValue(false); // Page deleted
      mockNotionService.createPage.mockResolvedValue({ success: true, pageId: 'new-id' });

      await handlers.savePage({}, {}, sendResponse);

      expect(mockStorageService.clearPageState).toHaveBeenCalled();
      expect(mockNotionService.createPage).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ created: true, recreated: true })
      );
    });

    test('檢查頁面存在性失敗時應報錯', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getSavedPageData.mockResolvedValue({ notionPageId: 'id' });
      mockNotionService.checkPageExists.mockResolvedValue(null); // Network error

      await handlers.savePage({}, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: ERROR_MESSAGES.USER_MESSAGES.CHECK_PAGE_EXISTENCE_FAILED,
        })
      );
    });

    test('應該在收到 Notion 圖片驗證錯誤時嘗試排除圖片並重試', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getSavedPageData.mockResolvedValue(null);

      // 第一次嘗試失敗 (Image validation error)
      mockNotionService.createPage.mockResolvedValueOnce({
        success: false,
        error: 'validation error: image block',
      });

      // 重試成功
      mockNotionService.createPage.mockResolvedValueOnce({
        success: true,
        pageId: 'retry-page-id',
        url: 'notion.so/retry',
      });

      // 使用 fake timers 來控制重試延遲
      jest.useFakeTimers();

      try {
        // 調用 savePage
        const savePromise = handlers.savePage({}, {}, sendResponse);

        // 使用 runAllTimersAsync 來處理異步 timers
        await jest.runAllTimersAsync();

        // 等待 promise 完成
        await savePromise;

        expect(mockNotionService.createPage).toHaveBeenCalledTimes(2);
        // 第一次調用包含 blocks
        expect(mockNotionService.createPage.mock.calls[0][1].allBlocks).toBeDefined();
        // 第二次調用應該設置 excludeImages
        expect(mockNotionService.buildPageData).toHaveBeenCalledWith(
          expect.objectContaining({ excludeImages: true })
        );
        // 第二次調用是重試成功
        expect(sendResponse).toHaveBeenCalledWith(
          expect.objectContaining({ success: true, created: true })
        );
      } finally {
        jest.useRealTimers();
      }
    });

    /**
     * [補強測試] 驗證頁面已被刪除時的重建流程
     * 覆蓋 saveHandlers.js:245-265
     */
    test('頁面已刪除時應清理狀態並重新創建', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getSavedPageData.mockResolvedValue({ notionPageId: 'deleted-id' });
      mockNotionService.checkPageExists.mockResolvedValue(false); // 頁面已刪除
      mockNotionService.createPage.mockResolvedValue({ success: true, pageId: 'new-id' });

      await handlers.savePage({}, {}, sendResponse);

      expect(mockStorageService.clearPageState).toHaveBeenCalled();
      expect(mockInjectionService.injectHighlighter).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ created: true, recreated: true })
      );
    });
  });

  // === 其他 Handlers 測試 ===

  describe('devLogSink handler', () => {
    test('應該處理 warn, error, info, log 級別日誌', () => {
      const sendResponse = jest.fn();

      // 測試 warn 級別
      handlers.devLogSink({ level: 'warn', message: 'test warn' }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });

      sendResponse.mockClear();

      // 測試 error 級別
      handlers.devLogSink({ level: 'error', message: 'test error' }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });

      sendResponse.mockClear();

      // 測試 info 級別
      handlers.devLogSink({ level: 'info', message: 'test info' }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });

      sendResponse.mockClear();

      // 測試 log 級別（預設）
      handlers.devLogSink({ message: 'test log' }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('應該處理帶有 args 的日誌', () => {
      const sendResponse = jest.fn();

      handlers.devLogSink(
        { level: 'log', message: 'test with args', args: ['arg1', 'arg2'] },
        {},
        sendResponse
      );
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('應該處理空消息', () => {
      const sendResponse = jest.fn();

      handlers.devLogSink({ level: 'log' }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('checkNotionPageExists handler', () => {
    test('應該在缺少參數時報錯', async () => {
      const sendResponse = jest.fn();
      await handlers.checkNotionPageExists({}, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.MISSING_PAGE_ID),
        })
      );
    });

    test('應該正常工作', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getConfig.mockResolvedValue({ notionApiKey: 'key' });
      mockNotionService.checkPageExists.mockResolvedValue(true);
      await handlers.checkNotionPageExists({ pageId: '123' }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({ success: true, exists: true });
    });

    test('應該在 API Key 未設置時報錯', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getConfig.mockResolvedValue({}); // No API Key

      await handlers.checkNotionPageExists({ pageId: '123' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/Notion API Key/), // Match partial string to handle formatting
        })
      );
    });
  });

  describe('openNotionPage handler', () => {
    test('應該處理未保存頁面', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getSavedPageData.mockResolvedValue(null);
      await handlers.openNotionPage({ url: 'http://test.com' }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    test('應該打開 Notion 頁面', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getSavedPageData.mockResolvedValue({ notionPageId: 'page-123' });
      chrome.tabs.create.mockImplementation((opts, cb) => cb({ id: 1 }));

      await handlers.openNotionPage({ url: 'http://test.com' }, {}, sendResponse);
      // Notion URL 會移除連字符
      expect(chrome.tabs.create).toHaveBeenCalledWith(
        expect.objectContaining({ url: expect.stringContaining('page123') }),
        expect.any(Function)
      );
    });
  });

  describe('startHighlight handler', () => {
    test('應該處理無法獲取 tab', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockResolvedValue([]);
      await handlers.startHighlight({}, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    test('應該成功注入並啟動', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'http://test.com' }]);
      chrome.tabs.sendMessage.mockImplementation((_id, _msg, cb) => cb({ success: true }));

      await handlers.startHighlight({}, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('當 sendMessage 失敗時應該回退到 injectHighlighter', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'http://test.com' }]);

      // Mock sendMessage 失敗 (例如腳本未加載)
      chrome.tabs.sendMessage.mockImplementation((_id, _msg, cb) => {
        chrome.runtime.lastError = { message: 'Receiving end does not exist' };
        cb(); // 當有 lastError 時，callback 不應傳遞參數
      });

      mockInjectionService.injectHighlighter.mockResolvedValue({ initialized: true });

      await handlers.startHighlight({}, {}, sendResponse);

      expect(mockInjectionService.injectHighlighter).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('syncHighlights handler', () => {
    test('應該在頁面未保存時報錯', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getConfig.mockResolvedValue({ notionApiKey: 'key' });
      mockStorageService.getSavedPageData.mockResolvedValue(null);
      await handlers.syncHighlights({ highlights: [] }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    test('應該成功同步', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getConfig.mockResolvedValue({ notionApiKey: 'key' });
      mockStorageService.getSavedPageData.mockResolvedValue({ notionPageId: 'id' });
      mockNotionService.updateHighlightsSection.mockResolvedValue({ success: true });

      await handlers.syncHighlights({ highlights: [{ text: 'hi' }] }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('checkPageStatus handler', () => {
    test('應該在緩存有效時返回本地狀態', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      // 必須 mock config，因為 checkPageStatus 會獲取 config
      mockStorageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });
      mockStorageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page-123',
        notionUrl: 'https://notion.so/page-123',
        title: 'Start',
        lastVerifiedAt: Date.now(),
      });

      await handlers.checkPageStatus({}, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ isSaved: true, title: 'Start' })
      );
    });

    test('應該在 API 檢查返回 null 時進行重試', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      mockStorageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });
      // 緩存過期
      mockStorageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page-123',
        lastVerifiedAt: 0,
      });

      // 第一次返回 null (失敗)
      mockNotionService.checkPageExists.mockResolvedValueOnce(null);
      // 第二次返回 true (成功)
      mockNotionService.checkPageExists.mockResolvedValueOnce(true);

      await handlers.checkPageStatus({}, {}, sendResponse);

      expect(mockNotionService.checkPageExists).toHaveBeenCalledTimes(2);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, isSaved: true })
      );
    });
    test('checkPageStatus 在重試後仍返回 null 應暫時假設本地狀態正確', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      mockStorageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });
      mockStorageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page-123',
        lastVerifiedAt: 0,
      });

      // 一直返回 null
      mockNotionService.checkPageExists.mockResolvedValue(null);

      await handlers.checkPageStatus({}, {}, sendResponse);

      expect(mockNotionService.checkPageExists).toHaveBeenCalledTimes(2);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, isSaved: true })
      );
    });
  });

  describe('updateHighlights handler', () => {
    test('應該處理完整更新流程', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'http://test.com' }]);
      mockStorageService.getConfig.mockResolvedValue({ notionApiKey: 'key' });
      mockStorageService.getSavedPageData.mockResolvedValue({ notionPageId: 'id' });
      mockInjectionService.collectHighlights.mockResolvedValue([{ text: 'hi' }]);
      mockNotionService.updateHighlightsSection.mockResolvedValue({ success: true });

      await handlers.updateHighlights({}, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, highlightCount: 1 })
      );
    });

    test('應該在 API Key 未設置時報錯', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'http://test.com' }]);
      mockStorageService.getConfig.mockResolvedValue({}); // No API Key

      await handlers.updateHighlights({}, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/Notion API Key|configured/),
        })
      );
    });
  });

  // === USER_ACTIVATE_SHORTCUT (HighlightHandlers) 測試 ===
  describe('USER_ACTIVATE_SHORTCUT handler', () => {
    const mockSender = { id: 'mock-ext-id', tab: { id: 1, url: 'https://example.com' } };

    beforeEach(() => {
      chrome.runtime.id = 'mock-ext-id';
    });

    test('應該在安全性驗證失敗時拒絕', async () => {
      const sendResponse = jest.fn();
      // 模擬非 content script 請求 (缺少 tab)
      await handlers.USER_ACTIVATE_SHORTCUT({}, { id: 'wrong-id' }, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('拒絕訪問') })
      );
    });

    test('應該處理缺少標籤頁上下文', async () => {
      const sendResponse = jest.fn();
      await handlers.USER_ACTIVATE_SHORTCUT({}, { id: 'mock-ext-id' }, sendResponse);
      // 觸發 validateContentScriptRequest 失敗
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('必須在標籤頁上下文中調用'),
        })
      );
    });

    test('應該在受限頁面返回錯誤', async () => {
      const sendResponse = jest.fn();
      const restrictedSender = { id: 'mock-ext-id', tab: { id: 1, url: 'chrome://extensions' } };
      await handlers.USER_ACTIVATE_SHORTCUT({}, restrictedSender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: ERROR_MESSAGES.USER_MESSAGES.HIGHLIGHT_NOT_SUPPORTED,
        })
      );
    });

    test('應該處理 Bundle 注入失敗', async () => {
      const sendResponse = jest.fn();
      mockInjectionService.ensureBundleInjected = jest
        .fn()
        .mockRejectedValue(new Error('Injection failed'));

      await handlers.USER_ACTIVATE_SHORTCUT({}, mockSender, sendResponse);

      // sanitizeApiError('Injection failed') -> 'Invalid request'
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.any(String) })
      );
    });

    // 已在 highlightHandlers.minimal.test.js 補完覆蓋率，移除此處不穩定的測試

    test('應該在顯示高亮工具失敗時返回錯誤', async () => {
      const sendResponse = jest.fn();
      mockInjectionService.ensureBundleInjected = jest.fn().mockResolvedValue();

      chrome.tabs.sendMessage.mockImplementation((id, msg, cb) => {
        if (msg.action === 'PING') {
          cb({ status: 'bundle_ready' });
        } else if (msg.action === 'showHighlighter') {
          chrome.runtime.lastError = { message: 'Internal error' };
          cb(); // 當有 lastError 時，callback 不應傳遞參數
        }
      });

      await handlers.USER_ACTIVATE_SHORTCUT({}, mockSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.any(String) })
      );
    });
  });

  describe('startHighlight handler (Security)', () => {
    test('應該在安全性驗證失敗時拒絕', async () => {
      const sendResponse = jest.fn();
      // 模擬非內部請求 (有 tab 但 URL 不對)
      const evilSender = { id: 'mock-ext-id', tab: { id: 1, url: 'https://evil.com' } };
      await handlers.startHighlight({}, evilSender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('拒絕訪問') })
      );
    });

    test('應該在受限頁面返回錯誤', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'chrome://settings' }]);
      await handlers.startHighlight({}, { id: 'mock-ext-id' }, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: ERROR_MESSAGES.USER_MESSAGES.HIGHLIGHT_NOT_SUPPORTED,
        })
      );
    });
  });
});
