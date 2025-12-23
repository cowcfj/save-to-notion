/**
 * @jest-environment jsdom
 */

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

import {
  createSaveHandlers,
  processContentResult,
} from '../../../../scripts/background/handlers/saveHandlers.js';
import { createHighlightHandlers } from '../../../../scripts/background/handlers/highlightHandlers.js';
import { createMigrationHandlers } from '../../../../scripts/background/handlers/migrationHandlers.js';

// 使用 presetup.js 提供的 global.Logger
const Logger = global.Logger;

describe('actionHandlers 覆蓋率補強', () => {
  // Mock services
  let mockNotionService = null;
  let mockStorageService = null;
  let mockInjectionService = null;
  let mockPageContentService = null;
  let handlers = null;

  beforeEach(() => {
    jest.clearAllMocks();

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
      chrome.tabs.query.mockImplementation((_q, cb) => cb([mockTab]));
      mockStorageService.getConfig.mockResolvedValue(mockConfig);
      mockInjectionService.collectHighlights.mockResolvedValue([]);
      mockPageContentService.extractContent.mockResolvedValue(mockContentResult);
    });

    test('應該在無法獲取 active tab 時失敗', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockImplementation((_q, cb) => cb([]));

      await handlers.savePage({}, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Could not get active tab'),
        })
      );
    });

    test('應該在缺少 API Key 時失敗', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getConfig.mockResolvedValue({});

      await handlers.savePage({}, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('not set') })
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
          error: expect.stringContaining('returned no result'),
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
        expect.objectContaining({ success: false, error: expect.stringContaining('Network error') })
      );
    });
  });

  // === 其他 Handlers 測試 ===

  describe('devLogSink handler', () => {
    test('應該處理 warn, error, info, log 級別日誌', () => {
      const sendResponse = jest.fn();

      handlers.devLogSink({ level: 'warn', message: 'test warn' }, {}, sendResponse);
      expect(Logger.warn).toHaveBeenCalledWith('[ClientLog] test warn');

      handlers.devLogSink({ level: 'error', message: 'test error' }, {}, sendResponse);
      expect(Logger.error).toHaveBeenCalledWith('[ClientLog] test error');

      handlers.devLogSink({ level: 'info', message: 'test info' }, {}, sendResponse);
      expect(Logger.info).toHaveBeenCalledWith('[ClientLog] test info');

      handlers.devLogSink({ message: 'test log' }, {}, sendResponse);
      expect(Logger.log).toHaveBeenCalledWith('[ClientLog] test log');
    });
  });

  describe('checkNotionPageExists handler', () => {
    test('應該在缺少參數時報錯', async () => {
      const sendResponse = jest.fn();
      await handlers.checkNotionPageExists({}, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Page ID is missing'),
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
      chrome.tabs.query.mockImplementation((_q, cb) => cb([]));
      await handlers.startHighlight({}, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    test('應該成功注入並啟動', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockImplementation((_q, cb) => cb([{ id: 1, url: 'http://test.com' }]));
      chrome.tabs.sendMessage.mockImplementation((_id, _msg, cb) => cb({ success: true }));

      await handlers.startHighlight({}, {}, sendResponse);
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
      chrome.tabs.query.mockImplementation((_query, callback) => {
        const tabs = [{ id: 1, url: 'https://example.com' }];
        callback(tabs);
      });
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
  });

  describe('updateHighlights handler', () => {
    test('應該處理完整更新流程', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockImplementation((_q, cb) => cb([{ id: 1, url: 'http://test.com' }]));
      mockStorageService.getConfig.mockResolvedValue({ notionApiKey: 'key' });
      mockStorageService.getSavedPageData.mockResolvedValue({ notionPageId: 'id' });
      mockInjectionService.collectHighlights.mockResolvedValue([{ text: 'hi' }]);
      mockNotionService.updateHighlightsSection.mockResolvedValue({ success: true });

      await handlers.updateHighlights({}, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, highlightCount: 1 })
      );
    });
  });
});
