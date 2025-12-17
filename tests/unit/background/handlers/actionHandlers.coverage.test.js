/**
 * @jest-environment jsdom
 */

/**
 * actionHandlers.js 覆蓋率補強測試
 *
 * 針對 createActionHandlers 中的各種 handler 進行測試
 */

// Mock dependencies
jest.mock('../../../../scripts/utils/Logger.module.js', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

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
  createActionHandlers,
  processContentResult,
} from '../../../../scripts/background/handlers/actionHandlers.js';

describe('actionHandlers 覆蓋率補強', () => {
  // Mock services
  let mockNotionService;
  let mockStorageService;
  let mockInjectionService;
  let mockPageContentService;
  let handlers;

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

    handlers = createActionHandlers({
      notionService: mockNotionService,
      storageService: mockStorageService,
      injectionService: mockInjectionService,
      pageContentService: mockPageContentService,
    });
  });

  describe('processContentResult', () => {
    test('應該在沒有標註時返回原始 blocks', () => {
      const result = processContentResult({ title: 'Test', blocks: [{ type: 'paragraph' }] }, []);

      expect(result.title).toBe('Test');
      expect(result.blocks).toHaveLength(1);
    });

    test('應該在有標註時添加 highlight blocks', () => {
      const result = processContentResult({ title: 'Test', blocks: [] }, [
        { text: 'highlight 1' },
        { text: 'highlight 2' },
      ]);

      expect(result.blocks).toHaveLength(2);
    });

    test('應該處理 null/undefined 輸入', () => {
      const result = processContentResult(null, null);

      expect(result.title).toBe('Untitled');
      expect(result.blocks).toEqual([]);
      expect(result.siteIcon).toBeNull();
    });
  });

  describe('devLogSink handler', () => {
    test('應該處理 warn 級別日誌', () => {
      const sendResponse = jest.fn();

      handlers.devLogSink({ level: 'warn', message: 'test warning' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('應該處理 error 級別日誌', () => {
      const sendResponse = jest.fn();

      handlers.devLogSink({ level: 'error', message: 'test error' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('應該處理 info 級別日誌', () => {
      const sendResponse = jest.fn();

      handlers.devLogSink({ level: 'info', message: 'test info' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('應該處理默認 log 級別', () => {
      const sendResponse = jest.fn();

      handlers.devLogSink({ message: 'test log' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('應該處理帶有 args 的日誌', () => {
      const sendResponse = jest.fn();

      handlers.devLogSink(
        { level: 'log', message: 'test', args: ['arg1', 'arg2'] },
        {},
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('checkNotionPageExists handler', () => {
    test('應該在缺少 pageId 時返回錯誤', async () => {
      const sendResponse = jest.fn();

      await handlers.checkNotionPageExists({}, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Page ID is missing',
      });
    });

    test('應該在缺少 API Key 時返回錯誤', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getConfig.mockResolvedValue({});

      await handlers.checkNotionPageExists({ pageId: '123' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Notion API Key not configured',
      });
    });

    test('應該成功檢查頁面存在性', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });
      mockNotionService.checkPageExists.mockResolvedValue(true);

      await handlers.checkNotionPageExists({ pageId: '123' }, {}, sendResponse);

      expect(mockNotionService.setApiKey).toHaveBeenCalledWith('test-key');
      expect(sendResponse).toHaveBeenCalledWith({ success: true, exists: true });
    });
  });

  describe('openNotionPage handler', () => {
    test('應該在缺少 URL 時返回錯誤', async () => {
      const sendResponse = jest.fn();

      await handlers.openNotionPage({}, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'No URL provided',
      });
    });

    test('應該在頁面未保存時返回錯誤', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getSavedPageData.mockResolvedValue(null);

      await handlers.openNotionPage({ url: 'https://example.com' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '此頁面尚未保存到 Notion，請先點擊「保存頁面」',
      });
    });

    test('應該在沒有 notionPageId 時返回錯誤', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getSavedPageData.mockResolvedValue({});

      await handlers.openNotionPage({ url: 'https://example.com' }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '此頁面尚未保存到 Notion，請先點擊「保存頁面」',
      });
    });

    test('應該生成 Notion URL 當只有 pageId 時', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page-id-123',
      });
      chrome.tabs.create.mockImplementation((_opts, callback) => {
        callback({ id: 1 });
      });

      await handlers.openNotionPage({ url: 'https://example.com' }, {}, sendResponse);

      expect(chrome.tabs.create).toHaveBeenCalledWith(
        { url: 'https://www.notion.so/pageid123' },
        expect.any(Function)
      );
    });
  });

  describe('startHighlight handler', () => {
    test('應該在無法獲取 active tab 時返回錯誤', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockImplementation((_query, callback) => callback([]));

      await handlers.startHighlight({}, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Could not get active tab.',
      });
    });

    test('應該在受限頁面返回錯誤', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockImplementation((_query, callback) =>
        callback([{ id: 1, url: 'chrome://settings' }])
      );

      await handlers.startHighlight({}, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '此頁面不支援標註功能（系統頁面或受限網址）',
      });
    });

    test('應該在 toggleHighlighter 成功時返回成功', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockImplementation((_query, callback) =>
        callback([{ id: 1, url: 'https://example.com' }])
      );
      chrome.tabs.sendMessage.mockImplementation((_tabId, _msg, callback) => {
        callback({ success: true });
      });

      await handlers.startHighlight({}, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('應該在 sendMessage 失敗時嘗試注入', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockImplementation((_query, callback) =>
        callback([{ id: 1, url: 'https://example.com' }])
      );
      chrome.tabs.sendMessage.mockImplementation((_tabId, _msg, callback) => {
        chrome.runtime.lastError = { message: 'No receiving end' };
        callback();
        chrome.runtime.lastError = null;
      });
      mockInjectionService.injectHighlighter.mockResolvedValue({ initialized: true });

      await handlers.startHighlight({}, {}, sendResponse);

      expect(mockInjectionService.injectHighlighter).toHaveBeenCalledWith(1);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('syncHighlights handler', () => {
    beforeEach(() => {
      chrome.tabs.query.mockImplementation((_query, callback) =>
        callback([{ id: 1, url: 'https://example.com' }])
      );
    });

    test('應該在沒有標註時返回成功消息', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });
      mockStorageService.getSavedPageData.mockResolvedValue({ notionPageId: 'page-123' });

      await handlers.syncHighlights({ highlights: [] }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        message: '沒有新標註需要同步',
        highlightCount: 0,
      });
    });

    test('應該在頁面未保存時返回錯誤', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });
      mockStorageService.getSavedPageData.mockResolvedValue(null);

      await handlers.syncHighlights({ highlights: [] }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '頁面尚未保存到 Notion，請先點擊「保存頁面」',
      });
    });

    test('應該成功同步標註', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });
      mockStorageService.getSavedPageData.mockResolvedValue({ notionPageId: 'page-123' });
      mockNotionService.updateHighlightsSection.mockResolvedValue({ success: true });

      await handlers.syncHighlights({ highlights: [{ text: 'test highlight' }] }, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        highlightCount: 1,
        message: '成功同步 1 個標註',
      });
    });
  });

  describe('checkPageStatus handler', () => {
    test('應該在無法獲取 tab 時返回錯誤', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockImplementation((_query, callback) => callback([]));

      await handlers.checkPageStatus({}, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Could not get active tab.',
      });
    });

    test('應該在頁面未保存時返回 isSaved: false', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockImplementation((_query, callback) =>
        callback([{ id: 1, url: 'https://example.com' }])
      );
      mockStorageService.getSavedPageData.mockResolvedValue(null);

      await handlers.checkPageStatus({}, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        isSaved: false,
      });
    });

    test('應該在緩存有效時返回本地狀態', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockImplementation((_query, callback) =>
        callback([{ id: 1, url: 'https://example.com' }])
      );
      mockStorageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page-123',
        notionUrl: 'https://notion.so/page-123',
        title: 'Test Page',
        lastVerifiedAt: Date.now(), // 剛剛驗證過
      });

      await handlers.checkPageStatus({}, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        isSaved: true,
        notionPageId: 'page-123',
        notionUrl: 'https://notion.so/page-123',
        title: 'Test Page',
      });
    });
  });

  describe('updateHighlights handler', () => {
    test('應該在缺少 API Key 時返回錯誤', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockImplementation((_query, callback) =>
        callback([{ id: 1, url: 'https://example.com' }])
      );
      mockStorageService.getConfig.mockResolvedValue({});

      await handlers.updateHighlights({}, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'API Key is not set.',
      });
    });

    test('應該在頁面未保存時返回錯誤', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockImplementation((_query, callback) =>
        callback([{ id: 1, url: 'https://example.com' }])
      );
      mockStorageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });
      mockStorageService.getSavedPageData.mockResolvedValue(null);

      await handlers.updateHighlights({}, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Page not saved yet. Please save the page first.',
      });
    });

    test('應該成功更新標註', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockImplementation((_query, callback) =>
        callback([{ id: 1, url: 'https://example.com' }])
      );
      mockStorageService.getConfig.mockResolvedValue({ notionApiKey: 'test-key' });
      mockStorageService.getSavedPageData.mockResolvedValue({ notionPageId: 'page-123' });
      mockInjectionService.collectHighlights.mockResolvedValue([{ text: 'highlight' }]);
      mockNotionService.updateHighlightsSection.mockResolvedValue({ success: true });

      await handlers.updateHighlights({}, {}, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        highlightsUpdated: true,
        highlightCount: 1,
      });
    });
  });
});
