/**
 * @jest-environment jsdom
 */

/* global chrome */
/* eslint jest/expect-expect: ["warn", { "assertFunctionNames": ["expect", "expectResponseContaining", "expectFailureResponse"] }] */

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
  computeStableUrl: jest.fn(() => null),
  resolveStorageUrl: jest.fn(url => url),
}));

jest.mock('../../../../scripts/background/utils/BlockBuilder.js', () => ({
  buildHighlightBlocks: jest.fn(highlights =>
    highlights.map(highlight => ({ type: 'quote', quote: { text: highlight.text } }))
  ),
}));

jest.mock('../../../../scripts/background/utils/highlightStyleMerger.js', () => {
  const actual = jest.requireActual('../../../../scripts/background/utils/highlightStyleMerger.js');
  return {
    __esModule: true,
    ...actual,
    mergeHighlightsWithStyle: jest.fn(blocks => blocks),
  };
});

jest.mock('../../../../scripts/background/services/InjectionService.js', () => ({
  isRestrictedInjectionUrl: jest.fn(url => url?.startsWith('chrome://')),
}));

function mockSecurityFailure(error) {
  return { success: false, error };
}

function mockResolveSender(sender) {
  return sender ?? {};
}

function mockIsWrongExtension(sender) {
  const { id } = mockResolveSender(sender);
  return id !== 'mock-ext-id';
}

function mockIsTabSenderOutsideExtension(sender) {
  const { tab, url = '' } = mockResolveSender(sender);

  if (!tab) {
    return false;
  }

  return !url.startsWith('chrome-extension://');
}

function mockMissingTabContext(sender) {
  return !sender?.tab?.id;
}

function mockEvaluateSecurityRules(sender, rules) {
  const failedRule = rules.find(({ rejects }) => rejects(sender));
  return failedRule ? mockSecurityFailure(failedRule.error) : null;
}

function mockCreateSenderValidator(rules) {
  return jest.fn(sender => mockEvaluateSecurityRules(sender, rules));
}

function mockCreateSecurityUtilsMock() {
  const errorMessages = {
    internalOnly: '拒絕訪問：此操作僅限擴充功能內部調用',
    contentScriptOnly: '拒絕訪問：僅限本擴充功能的 content script 調用',
    tabContextRequired: '拒絕訪問：此操作必須在標籤頁上下文中調用',
    privilegedOnly: '拒絕訪問',
  };

  return {
    validateInternalRequest: mockCreateSenderValidator([
      { rejects: mockIsWrongExtension, error: errorMessages.internalOnly },
      { rejects: mockIsTabSenderOutsideExtension, error: errorMessages.internalOnly },
    ]),
    validateContentScriptRequest: mockCreateSenderValidator([
      { rejects: mockIsWrongExtension, error: errorMessages.contentScriptOnly },
      { rejects: mockMissingTabContext, error: errorMessages.tabContextRequired },
    ]),
    validatePrivilegedRequest: mockCreateSenderValidator([
      { rejects: mockIsWrongExtension, error: errorMessages.privilegedOnly },
    ]),
    isValidNotionUrl: jest.fn(() => true),
  };
}

jest.mock('../../../../scripts/utils/securityUtils.js', () => mockCreateSecurityUtilsMock());

jest.mock('../../../../scripts/utils/LogSanitizer.js', () => ({
  sanitizeUrlForLogging: jest.fn(url => url),
}));

jest.mock('../../../../scripts/utils/ApiErrorSanitizer.js', () => ({
  sanitizeApiError: jest.fn(err => (err instanceof Error ? err.message : String(err))),
}));

// 引入測試所需模組
import { ErrorHandler } from '../../../../scripts/utils/ErrorHandler.js';
import { ERROR_MESSAGES } from '../../../../scripts/config/shared/messages.js';
import { RUNTIME_ACTIONS } from '../../../../scripts/config/shared/runtimeActions.js';
import { validateContentScriptRequest } from '../../../../scripts/utils/securityUtils.js';
import { getActiveNotionToken, ensureNotionApiKey } from '../../../../scripts/utils/notionAuth.js';
import { buildHighlightBlocks } from '../../../../scripts/background/utils/BlockBuilder.js';
import { mergeHighlightsWithStyle } from '../../../../scripts/background/utils/highlightStyleMerger.js';

const MOCK_EXTENSION_ID = 'mock-ext-id';
const DEFAULT_TAB_ID = 1;
const EXAMPLE_URL = 'https://example.com';
const TEST_PAGE_TITLE = 'Test Page';
const TEST_API_KEY = 'secret-key';
const VALID_API_KEY = 'key';
const PAGE_STATUS_API_KEY = 'test-key';
const NOTION_DATABASE_ID = 'db-123';
const DEFAULT_PROFILE_ID = 'default';
const DEFAULT_PROFILE_NAME = 'Default';
const DEFAULT_HIGHLIGHT_STYLE = 'COLOR_SYNC';
const NEW_PAGE_ID = 'new-page-id';
const NEW_NOTION_URL = 'notion.so/new';
const EXISTING_PAGE_ID = 'existing-id';
const SAVED_PAGE_ID = 'page-123';
const SIMPLE_PAGE_ID = 'id';
const RESTRICTED_EXTENSIONS_URL = 'chrome://extensions/';
const RESTRICTED_EXTENSIONS_ORIGIN = 'chrome://extensions';
const CHROME_SETTINGS_URL = 'chrome://settings';
const HTTP_TEST_URL = 'http://test.com';
const WRONG_EXTENSION_ID = 'wrong-id';

jest.mock('../../../../scripts/config/shared/core.js', () => {
  const original = jest.requireActual('../../../../scripts/config/shared/core.js');
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

jest.mock('../../../../scripts/utils/notionAuth.js', () => ({
  getActiveNotionToken: jest.fn(),
  ensureNotionApiKey: jest.fn(),
}));

// Mock chrome API
globalThis.chrome = {
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn().mockReturnValue(Promise.resolve()),
    create: jest.fn(),
  },
  storage: {
    sync: {
      // _runSaveFlow 需要讀取 highlightContentStyle 設定
      get: jest.fn().mockResolvedValue({ highlightContentStyle: DEFAULT_HIGHLIGHT_STYLE }),
    },
  },
  runtime: {
    id: MOCK_EXTENSION_ID,
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

function createDefaultProfile(overrides = {}) {
  return {
    id: DEFAULT_PROFILE_ID,
    name: DEFAULT_PROFILE_NAME,
    notionDataSourceId: NOTION_DATABASE_ID,
    notionDataSourceType: 'database',
    ...overrides,
  };
}

function createDefaultConfig(overrides = {}) {
  return {
    notionApiKey: TEST_API_KEY,
    notionDataSourceId: NOTION_DATABASE_ID,
    ...overrides,
  };
}

function createMockTab(overrides = {}) {
  return {
    id: DEFAULT_TAB_ID,
    url: EXAMPLE_URL,
    title: TEST_PAGE_TITLE,
    ...overrides,
  };
}

function createTabContext(url = EXAMPLE_URL, overrides = {}) {
  return {
    id: DEFAULT_TAB_ID,
    url,
    ...overrides,
  };
}

function createContentResult(overrides = {}) {
  return {
    extractionStatus: 'success',
    title: TEST_PAGE_TITLE,
    blocks: [{ type: 'paragraph' }],
    siteIcon: 'icon.png',
    ...overrides,
  };
}

function createPageSuccess(overrides = {}) {
  return {
    success: true,
    pageId: NEW_PAGE_ID,
    url: NEW_NOTION_URL,
    ...overrides,
  };
}

function createSavedPageData(overrides = {}) {
  return {
    notionPageId: EXISTING_PAGE_ID,
    destinationProfileId: DEFAULT_PROFILE_ID,
    ...overrides,
  };
}

function createInternalSender(overrides = {}) {
  return {
    id: MOCK_EXTENSION_ID,
    ...overrides,
  };
}

function createContentScriptSender(overrides = {}) {
  return {
    id: MOCK_EXTENSION_ID,
    tab: { id: DEFAULT_TAB_ID, url: EXAMPLE_URL },
    url: EXAMPLE_URL,
    ...overrides,
  };
}

function createNotionServiceMock() {
  return {
    setApiKey: jest.fn(),
    checkPageExists: jest.fn(),
    updateHighlightsSection: jest.fn(),
    refreshPageContent: jest.fn(),
    createPage: jest.fn(),
    buildPageData: jest.fn(() => ({
      pageData: {},
    })),
  };
}

function createStorageServiceMock() {
  return {
    getConfig: jest.fn(),
    getSavedPageData: jest.fn(),
    setSavedPageData: jest.fn(),
    clearPageState: jest.fn(),
    clearNotionState: jest.fn(),
    clearNotionStateWithRetry: jest.fn().mockResolvedValue({ cleared: true, attempts: 1 }),
    setUrlAlias: jest.fn().mockResolvedValue(),
    removeSavedPageData: jest.fn().mockResolvedValue(),
  };
}

function createInjectionServiceMock() {
  return {
    injectHighlighter: jest.fn(),
    ensureBundleInjected: jest.fn().mockResolvedValue(true),
    inject: jest.fn(),
    collectHighlights: jest.fn().mockResolvedValue([]),
  };
}

function createTabServiceMock() {
  return {
    getPreloaderData: jest.fn().mockResolvedValue(null),
    confirmRemotePageMissing: jest
      .fn()
      .mockReturnValue({ shouldDelete: false, deletionPending: false }),
    resetRemotePageMissingState: jest
      .fn()
      .mockReturnValue({ shouldDelete: false, deletionPending: false }),
    consumeDeletionConfirmation: jest
      .fn()
      .mockReturnValue({ shouldDelete: false, deletionPending: false }),
    resolveTabUrl: jest.fn().mockImplementation((_tabId, url) =>
      Promise.resolve({
        stableUrl: url,
        originalUrl: url,
        migrated: false,
      })
    ),
  };
}

function createMigrationServiceMock() {
  return {
    migrateStorageKey: jest.fn().mockResolvedValue(false),
  };
}

function createDestinationProfileResolverMock() {
  return {
    resolveProfileForSave: jest.fn().mockResolvedValue(createDefaultProfile()),
    setLastUsedProfile: jest.fn().mockResolvedValue(),
  };
}

function createActionHandlerBundle(services) {
  return {
    ...createSaveHandlers(services),
    ...createHighlightHandlers(services),
    ...createMigrationHandlers(services),
  };
}

function expectResponseContaining(sendResponse, partialResponse) {
  expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining(partialResponse));
}

function expectFailureResponse(sendResponse, error) {
  expectResponseContaining(sendResponse, { success: false, error });
}

describe('actionHandlers 覆蓋率補強', () => {
  // Mock services
  let mockNotionService = null;
  let mockStorageService = null;
  let mockInjectionService = null;
  let mockPageContentService = null;
  let mockTabService = null;
  let mockMigrationService = null;
  let mockDestinationProfileResolver = null;
  let handlers = null;
  const internalSender = createInternalSender();
  const csSender = createContentScriptSender();

  beforeEach(() => {
    jest.clearAllMocks();
    getActiveNotionToken.mockResolvedValue({ token: TEST_API_KEY, mode: 'manual' });
    ensureNotionApiKey.mockResolvedValue(TEST_API_KEY);

    mockNotionService = createNotionServiceMock();
    mockStorageService = createStorageServiceMock();
    mockInjectionService = createInjectionServiceMock();
    mockPageContentService = { extractContent: jest.fn() };
    mockTabService = createTabServiceMock();
    mockMigrationService = createMigrationServiceMock();
    mockDestinationProfileResolver = createDestinationProfileResolverMock();

    handlers = createActionHandlerBundle({
      notionService: mockNotionService,
      storageService: mockStorageService,
      injectionService: mockInjectionService,
      pageContentService: mockPageContentService,
      tabService: mockTabService,
      migrationService: mockMigrationService,
      destinationProfileResolver: mockDestinationProfileResolver,
    });
  });

  afterEach(() => {
    chrome.runtime.lastError = null;
  });

  function arrangeMissingApiKeyConfig() {
    mockStorageService.getConfig.mockResolvedValue({});
    getActiveNotionToken.mockResolvedValueOnce({ token: null, mode: null });
  }

  function arrangeExistingRemotePage({ highlights, pageId = EXISTING_PAGE_ID } = {}) {
    mockStorageService.getSavedPageData.mockResolvedValue(
      createSavedPageData({ notionPageId: pageId })
    );
    mockNotionService.checkPageExists.mockResolvedValue(true);
    mockInjectionService.collectHighlights.mockResolvedValue(highlights);
  }

  function arrangeDeletedRemotePage({ pageId = 'deleted-id', createdPageId = 'new-id' } = {}) {
    mockStorageService.getSavedPageData.mockResolvedValue(
      createSavedPageData({ notionPageId: pageId })
    );
    mockNotionService.checkPageExists.mockResolvedValue(false);
    mockTabService.confirmRemotePageMissing.mockReturnValue({
      shouldDelete: true,
      deletionPending: false,
    });
    mockNotionService.createPage.mockResolvedValue(createPageSuccess({ pageId: createdPageId }));
  }

  function arrangeSavedPageForRemoteHighlightUpdate() {
    chrome.tabs.query.mockResolvedValue([createTabContext(HTTP_TEST_URL)]);
    mockStorageService.getConfig.mockResolvedValue({ notionApiKey: VALID_API_KEY });
    mockStorageService.getSavedPageData.mockResolvedValue({ notionPageId: SIMPLE_PAGE_ID });
    mockNotionService.updateHighlightsSection.mockResolvedValue({ success: true });
  }

  function arrangeExpiredPageStatusCheck() {
    chrome.tabs.query.mockResolvedValue([createTabContext()]);
    mockStorageService.getConfig.mockResolvedValue({ notionApiKey: PAGE_STATUS_API_KEY });
    mockStorageService.getSavedPageData.mockResolvedValue({
      notionPageId: SAVED_PAGE_ID,
      lastVerifiedAt: 0,
    });
  }

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
      const { CONTENT_QUALITY } = require('../../../../scripts/config/shared/content.js');
      expect(result.title).toBe(CONTENT_QUALITY.DEFAULT_PAGE_TITLE);
      expect(result.blocks).toEqual([]);
      expect(result.siteIcon).toBeNull();
    });

    test('有標註時 processContentResult 應呼叫 buildHighlightBlocks 並合併結果', () => {
      const rawResult = { title: 'Test', blocks: [] };
      const highlights = [{ text: 'highlight 1' }];

      const result = processContentResult(rawResult, highlights);

      expect(buildHighlightBlocks).toHaveBeenCalledWith(highlights);
      // buildHighlightBlocks 為 jest.mock，返回 [{ type: 'quote', quote: { text: ... } }]
      // 因此 mergedBlocks 應包含 1 個 highlight block
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].type).toBe('quote');
    });
  });

  // === savePage 流程測試 (核心邏輯) ===
  describe('savePage Handler (Core Logic)', () => {
    const mockTab = createMockTab();
    const mockConfig = createDefaultConfig();
    const mockContentResult = createContentResult();

    beforeEach(() => {
      // Default successful setup
      chrome.tabs.query.mockResolvedValue([mockTab]);
      mockStorageService.getConfig.mockResolvedValue(mockConfig);
      mockInjectionService.collectHighlights.mockResolvedValue([]);
      mockPageContentService.extractContent.mockResolvedValue(mockContentResult);
    });

    test('非法 highlightContentStyle 應回退 COLOR_SYNC', async () => {
      const sendResponse = jest.fn();
      chrome.storage.sync.get.mockResolvedValueOnce({ highlightContentStyle: 'INVALID_STYLE' });
      mockStorageService.getSavedPageData.mockResolvedValue(null);
      mockNotionService.createPage.mockResolvedValue(createPageSuccess());

      await handlers.savePage({}, internalSender, sendResponse);

      expect(mergeHighlightsWithStyle).toHaveBeenCalled();
      const styleKey = mergeHighlightsWithStyle.mock.calls[0][2];
      expect(styleKey).toBe(DEFAULT_HIGHLIGHT_STYLE);
    });

    test('應該在受限頁面（如 chrome://extensions/）返回明確錯誤訊息', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockResolvedValue([createMockTab({ url: RESTRICTED_EXTENSIONS_URL })]);

      await handlers.savePage({}, internalSender, sendResponse);
      expectFailureResponse(
        sendResponse,
        ERROR_MESSAGES.USER_MESSAGES.SAVE_NOT_SUPPORTED_RESTRICTED_PAGE
      );
    });

    test('應該在無法獲取 active tab 時失敗', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockResolvedValue([]);

      await handlers.savePage({}, internalSender, sendResponse);
      expectFailureResponse(
        sendResponse,
        ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB)
      );
    });

    test('應該在缺少 API Key 時失敗', async () => {
      const sendResponse = jest.fn();
      arrangeMissingApiKeyConfig();

      await handlers.savePage({}, internalSender, sendResponse);
      expectFailureResponse(
        sendResponse,
        ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.MISSING_API_KEY)
      );
    });

    test('應該在有 API Key 但缺少 Data Source ID 時失敗', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getConfig.mockResolvedValue({ notionApiKey: 'valid-key' });
      mockDestinationProfileResolver.resolveProfileForSave.mockRejectedValue(
        new Error('尚未設定保存目標')
      );

      await handlers.savePage({}, internalSender, sendResponse);
      expectFailureResponse(sendResponse, '尚未設定保存目的地，請先到設定頁完成設定。');
    });

    test('應該在內容提取失敗時失敗', async () => {
      const sendResponse = jest.fn();
      mockPageContentService.extractContent.mockRejectedValue(new Error('Extract failed'));

      await handlers.savePage({}, internalSender, sendResponse);
      // 修正斷言：當 extract 拋出異常時，會返回 'Content extraction script returned no result.'
      expectFailureResponse(sendResponse, ERROR_MESSAGES.USER_MESSAGES.CONTENT_EXTRACTION_FAILED);
    });

    // 測試 determineAndExecuteSaveAction：新頁面流程
    test('新頁面：應該調用 createPage', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getSavedPageData.mockResolvedValue(null); // No saved data
      mockNotionService.createPage.mockResolvedValue(createPageSuccess());

      await handlers.savePage({}, internalSender, sendResponse);

      expect(mockNotionService.createPage).toHaveBeenCalled();
      expect(mockStorageService.setSavedPageData).toHaveBeenCalledWith(
        EXAMPLE_URL,
        expect.objectContaining({ notionPageId: NEW_PAGE_ID })
      );
      expectResponseContaining(sendResponse, { success: true, created: true });
    });

    test('新頁面保存成功時，PAGE_SAVE_HINT 失敗不應中斷主流程', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getSavedPageData.mockResolvedValue(null);
      mockNotionService.createPage.mockResolvedValue(createPageSuccess());
      chrome.tabs.sendMessage.mockReturnValueOnce(Promise.reject(new Error('hint failed')));

      await handlers.savePage({}, internalSender, sendResponse);
      await Promise.resolve();

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        DEFAULT_TAB_ID,
        expect.objectContaining({ action: 'PAGE_SAVE_HINT', isSaved: true })
      );
      expectResponseContaining(sendResponse, { success: true, created: true });
    });

    test('setUrlAlias 失敗時應忽略錯誤並保持成功回應', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getSavedPageData.mockResolvedValue(null);
      mockStorageService.setUrlAlias.mockRejectedValue(new Error('alias failed'));
      mockNotionService.createPage.mockResolvedValue(
        createPageSuccess({ pageId: 'alias-page-id', url: 'notion.so/alias' })
      );
      mockTabService.resolveTabUrl.mockResolvedValue({
        stableUrl: `${EXAMPLE_URL}/stable`,
        originalUrl: `${EXAMPLE_URL}/original`,
        migrated: false,
      });

      await handlers.savePage({}, internalSender, sendResponse);

      expect(mockStorageService.setUrlAlias).toHaveBeenCalledWith(
        `${EXAMPLE_URL}/original`,
        `${EXAMPLE_URL}/stable`
      );
      expectResponseContaining(sendResponse, { success: true, created: true });
    });

    test('清理 originalUrl 舊資料失敗時應忽略錯誤並保持成功回應', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getSavedPageData
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ notionPageId: 'old-page-id' });
      mockStorageService.removeSavedPageData.mockRejectedValue(new Error('cleanup failed'));
      mockNotionService.createPage.mockResolvedValue(createPageSuccess());
      mockTabService.resolveTabUrl.mockResolvedValue({
        stableUrl: `${EXAMPLE_URL}/stable-cleanup`,
        originalUrl: `${EXAMPLE_URL}/original-cleanup`,
        migrated: false,
      });

      await handlers.savePage({}, internalSender, sendResponse);

      expect(mockStorageService.removeSavedPageData).toHaveBeenCalledWith(
        `${EXAMPLE_URL}/original-cleanup`
      );
      expectResponseContaining(sendResponse, { success: true, created: true });
    });

    // 測試 determineAndExecuteSaveAction：已有頁面流程 - 更新標註
    test('已有頁面：有新標註時應該調用 updateHighlightsSection', async () => {
      const sendResponse = jest.fn();
      arrangeExistingRemotePage({ highlights: [{ text: 'new highlight' }] });
      mockNotionService.updateHighlightsSection.mockResolvedValue({ success: true });

      await handlers.savePage({}, internalSender, sendResponse);

      expect(mockNotionService.updateHighlightsSection).toHaveBeenCalledWith(
        EXISTING_PAGE_ID,
        expect.any(Array),
        { apiKey: TEST_API_KEY }
      );
      expectResponseContaining(sendResponse, { highlightsUpdated: true });
    });

    test('已有頁面：標註更新失敗時應走統一錯誤回應', async () => {
      const sendResponse = jest.fn();
      arrangeExistingRemotePage({ highlights: [{ text: 'new highlight' }] });
      mockNotionService.updateHighlightsSection.mockResolvedValue({
        success: false,
        error: 'Update failed',
        details: { phase: 'updateHighlightsSection' },
      });

      await handlers.savePage({}, internalSender, sendResponse);

      expectFailureResponse(
        sendResponse,
        expect.stringContaining('在 updateHighlightsSection 階段')
      );
    });

    // 測試 determineAndExecuteSaveAction：已有頁面流程 - 刷新內容
    test('已有頁面：無新標註時應該調用 refreshPageContent', async () => {
      const sendResponse = jest.fn();
      arrangeExistingRemotePage({ highlights: [] });
      mockNotionService.refreshPageContent.mockResolvedValue({ success: true });

      await handlers.savePage({}, internalSender, sendResponse);

      expect(mockNotionService.refreshPageContent).toHaveBeenCalled();
      expectResponseContaining(sendResponse, { updated: true });
    });

    // 測試 determineAndExecuteSaveAction：頁面已刪除
    test('已有頁面但 Notion 中已刪除：應該重新創建頁面', async () => {
      const sendResponse = jest.fn();
      arrangeDeletedRemotePage();

      await handlers.savePage({}, internalSender, sendResponse);

      expect(mockStorageService.clearNotionStateWithRetry).toHaveBeenCalled();
      expect(mockNotionService.createPage).toHaveBeenCalled();
      expectResponseContaining(sendResponse, { created: true, recreated: true });
    });

    test('檢查頁面存在性失敗時應報錯', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getSavedPageData.mockResolvedValue(
        createSavedPageData({ notionPageId: 'id' })
      );
      mockNotionService.checkPageExists.mockResolvedValue(null); // Network error

      await handlers.savePage({}, internalSender, sendResponse);
      expectFailureResponse(sendResponse, ERROR_MESSAGES.USER_MESSAGES.CHECK_PAGE_EXISTENCE_FAILED);
    });

    /**
     * [補強測試] 驗證頁面已被刪除時的重建流程
     * 覆蓋 saveHandlers.js:245-265
     */
    test('頁面已刪除時應清理狀態並重新創建', async () => {
      const sendResponse = jest.fn();
      arrangeDeletedRemotePage();

      await handlers.savePage({}, internalSender, sendResponse);

      expect(mockStorageService.clearNotionStateWithRetry).toHaveBeenCalled();
      expect(mockInjectionService.injectHighlighter).toHaveBeenCalled();
      expectResponseContaining(sendResponse, { created: true, recreated: true });
    });
  });

  describe('SAVE_PAGE_FROM_TOOLBAR Handler', () => {
    const mockContentResult = createContentResult();

    beforeEach(() => {
      mockStorageService.getConfig.mockResolvedValue(createDefaultConfig());
      mockInjectionService.collectHighlights.mockResolvedValue([]);
      mockPageContentService.extractContent.mockResolvedValue(mockContentResult);
    });

    test('應該在不是 Content Script 的情況下拒絕', async () => {
      const sendResponse = jest.fn();
      await handlers.SAVE_PAGE_FROM_TOOLBAR({}, createInternalSender(), sendResponse);
      expectFailureResponse(sendResponse, expect.stringContaining('必須在標籤頁上下文中'));
    });

    test('應該在缺少 sender.tab 時回傳 NO_ACTIVE_TAB 友善訊息', async () => {
      const sendResponse = jest.fn();
      validateContentScriptRequest.mockReturnValueOnce(null);

      await handlers.SAVE_PAGE_FROM_TOOLBAR({}, createInternalSender(), sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB),
      });
    });

    test('應該在 sender.tab.url 為空字串時回傳 NO_ACTIVE_TAB 並提前中止', async () => {
      const sendResponse = jest.fn();

      await handlers.SAVE_PAGE_FROM_TOOLBAR(
        {},
        createContentScriptSender({ tab: { id: DEFAULT_TAB_ID, url: '' }, url: undefined }),
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB),
      });
      expect(mockStorageService.getConfig).not.toHaveBeenCalled();
      expect(mockTabService.resolveTabUrl).not.toHaveBeenCalled();
    });

    test('SAVE_PAGE_FROM_TOOLBAR 應該在受限頁面返回錯誤', async () => {
      const sendResponse = jest.fn();
      await handlers.SAVE_PAGE_FROM_TOOLBAR(
        {},
        createContentScriptSender({
          tab: { id: DEFAULT_TAB_ID, url: RESTRICTED_EXTENSIONS_URL },
          url: undefined,
        }),
        sendResponse
      );
      expectFailureResponse(
        sendResponse,
        ERROR_MESSAGES.USER_MESSAGES.SAVE_NOT_SUPPORTED_RESTRICTED_PAGE
      );
    });

    test('應該在缺少 API Key 時失敗', async () => {
      const sendResponse = jest.fn();
      arrangeMissingApiKeyConfig();
      await handlers.SAVE_PAGE_FROM_TOOLBAR({}, csSender, sendResponse);
      expectFailureResponse(
        sendResponse,
        ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.MISSING_API_KEY)
      );
    });

    test('應該在有 API Key 但缺少 Data Source ID 時失敗', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getConfig.mockResolvedValue({ notionApiKey: 'valid-key' });
      mockDestinationProfileResolver.resolveProfileForSave.mockRejectedValue(
        new Error('尚未設定保存目標')
      );
      await handlers.SAVE_PAGE_FROM_TOOLBAR({}, csSender, sendResponse);
      expectFailureResponse(sendResponse, '尚未設定保存目的地，請先到設定頁完成設定。');
    });

    test('正常保存新頁面', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getSavedPageData.mockResolvedValue(null);
      mockNotionService.createPage.mockResolvedValue(createPageSuccess());

      await handlers.SAVE_PAGE_FROM_TOOLBAR({}, csSender, sendResponse);

      expect(mockNotionService.createPage).toHaveBeenCalled();
      expectResponseContaining(sendResponse, { success: true, created: true });
    });

    test('保存時內容提取失敗', async () => {
      const sendResponse = jest.fn();
      mockPageContentService.extractContent.mockRejectedValue(new Error('Extract failed'));
      await handlers.SAVE_PAGE_FROM_TOOLBAR({}, csSender, sendResponse);

      expectFailureResponse(sendResponse, ERROR_MESSAGES.USER_MESSAGES.CONTENT_EXTRACTION_FAILED);
    });
  });

  describe('SAVE_PAGE_FROM_RAIL Handler', () => {
    const mockContentResult = createContentResult();

    beforeEach(() => {
      mockStorageService.getConfig.mockResolvedValue(createDefaultConfig());
      mockInjectionService.collectHighlights.mockResolvedValue([]);
      mockPageContentService.extractContent.mockResolvedValue(mockContentResult);
    });

    test('應該在不是 Content Script 的情況下拒絕', async () => {
      const sendResponse = jest.fn();
      await handlers.SAVE_PAGE_FROM_RAIL({}, createInternalSender(), sendResponse);
      expectFailureResponse(sendResponse, expect.stringContaining('必須在標籤頁上下文中'));
    });

    test('應該在缺少 sender.tab 時回傳 NO_ACTIVE_TAB 友善訊息', async () => {
      const sendResponse = jest.fn();
      validateContentScriptRequest.mockReturnValueOnce(null);

      await handlers.SAVE_PAGE_FROM_RAIL({}, createInternalSender(), sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB),
      });
    });

    test('正常保存新頁面', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getSavedPageData.mockResolvedValue(null);
      mockNotionService.createPage.mockResolvedValue(createPageSuccess());

      await handlers.SAVE_PAGE_FROM_RAIL({}, csSender, sendResponse);

      expect(mockNotionService.createPage).toHaveBeenCalled();
      expectResponseContaining(sendResponse, { success: true, created: true });
    });
  });

  // === 其他 Handlers 測試 ===

  describe('devLogSink handler', () => {
    test('應該處理 warn, error, info, log 級別日誌', () => {
      const sendResponse = jest.fn();

      // 測試 warn 級別
      handlers.devLogSink({ level: 'warn', message: 'test warn' }, csSender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });

      sendResponse.mockClear();

      // 測試 error 級別
      handlers.devLogSink({ level: 'error', message: 'test error' }, csSender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });

      sendResponse.mockClear();

      // 測試 info 級別
      handlers.devLogSink({ level: 'info', message: 'test info' }, csSender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });

      sendResponse.mockClear();

      // 測試 log 級別（預設）
      handlers.devLogSink({ message: 'test log' }, csSender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('應該處理帶有 args 的日誌', () => {
      const sendResponse = jest.fn();

      handlers.devLogSink(
        { level: 'log', message: 'test with args', args: ['arg1', 'arg2'] },
        csSender,
        sendResponse
      );
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('應該處理空消息', () => {
      const sendResponse = jest.fn();

      handlers.devLogSink({ level: 'log' }, csSender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('checkNotionPageExists handler', () => {
    test('應該在缺少參數時報錯', async () => {
      const sendResponse = jest.fn();
      await handlers.checkNotionPageExists({}, internalSender, sendResponse);
      expectFailureResponse(
        sendResponse,
        ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.MISSING_PAGE_ID)
      );
    });

    test('應該正常工作', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getConfig.mockResolvedValue({ notionApiKey: VALID_API_KEY });
      mockNotionService.checkPageExists.mockResolvedValue(true);
      await handlers.checkNotionPageExists({ pageId: '123' }, internalSender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({ success: true, exists: true });
    });

    test('應該在 API Key 未設置時報錯', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getConfig.mockResolvedValue({}); // No API Key
      ensureNotionApiKey.mockRejectedValueOnce(new Error(ERROR_MESSAGES.TECHNICAL.MISSING_API_KEY));
      const formattedMessage = ErrorHandler.formatUserMessage(
        ERROR_MESSAGES.TECHNICAL.MISSING_API_KEY
      );

      await handlers.checkNotionPageExists({ pageId: '123' }, internalSender, sendResponse);

      expectFailureResponse(sendResponse, formattedMessage);
    });
  });

  describe('openNotionPage handler', () => {
    test('應該處理未保存頁面', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getSavedPageData.mockResolvedValue(null);
      await handlers.openNotionPage({ url: HTTP_TEST_URL }, internalSender, sendResponse);
      expectResponseContaining(sendResponse, { success: false });
    });

    test('應該打開 Notion 頁面', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getSavedPageData.mockResolvedValue({ notionPageId: SAVED_PAGE_ID });
      chrome.tabs.create.mockResolvedValue({ id: DEFAULT_TAB_ID });

      await handlers.openNotionPage({ url: HTTP_TEST_URL }, internalSender, sendResponse);
      // Notion URL 會移除連字符
      expect(chrome.tabs.create).toHaveBeenCalledWith(
        expect.objectContaining({ url: expect.stringContaining('page123') })
      );
    });
  });

  describe('startHighlight handler', () => {
    test('應該處理無法獲取 tab', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockResolvedValue([]);
      await handlers.startHighlight({}, internalSender, sendResponse);
      expectResponseContaining(sendResponse, { success: false });
    });

    test('應該成功注入並啟動', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockResolvedValue([createTabContext(HTTP_TEST_URL)]);
      chrome.tabs.sendMessage.mockImplementation((_id, msg, cb) => {
        if (msg.action === 'PING') {
          cb({ status: 'bundle_ready' });
          return;
        }
        cb({ success: true });
      });

      await handlers.startHighlight({}, internalSender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('當啟動訊息失敗時應該回傳錯誤且不回退到 legacy injectHighlighter', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockResolvedValue([createTabContext(HTTP_TEST_URL)]);

      chrome.tabs.sendMessage.mockImplementation((_id, msg, cb) => {
        if (msg.action === 'PING') {
          cb({ status: 'bundle_ready' });
          return;
        }
        chrome.runtime.lastError = { message: 'Receiving end does not exist' };
        cb();
        chrome.runtime.lastError = null;
      });

      mockInjectionService.injectHighlighter.mockResolvedValue({ initialized: true });

      await handlers.startHighlight({}, internalSender, sendResponse);

      expect(mockInjectionService.injectHighlighter).not.toHaveBeenCalled();
      expectFailureResponse(sendResponse, expect.any(String));
    });
  });

  describe('syncHighlights handler', () => {
    test('應該在頁面未保存時報錯', async () => {
      const sendResponse = jest.fn();
      mockStorageService.getConfig.mockResolvedValue({ notionApiKey: VALID_API_KEY });
      mockStorageService.getSavedPageData.mockResolvedValue(null);
      // highlights must not be empty to trigger saved check
      await handlers.syncHighlights(
        { highlights: [{ text: 'some highlight' }] },
        csSender,
        sendResponse
      );
      expectResponseContaining(sendResponse, { success: false });
    });

    test('應該成功同步', async () => {
      const sendResponse = jest.fn();
      arrangeSavedPageForRemoteHighlightUpdate();

      await handlers.syncHighlights({ highlights: [{ text: 'hi' }] }, csSender, sendResponse);
      expectResponseContaining(sendResponse, { success: true, count: 1, highlightCount: 1 });
    });
  });

  describe('checkPageStatus handler', () => {
    test('應該在緩存有效時返回本地狀態', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockResolvedValue([createTabContext()]);
      // 必須 mock config，因為 checkPageStatus 會獲取 config
      mockStorageService.getConfig.mockResolvedValue({ notionApiKey: PAGE_STATUS_API_KEY });
      mockStorageService.getSavedPageData.mockResolvedValue({
        notionPageId: SAVED_PAGE_ID,
        notionUrl: `https://notion.so/${SAVED_PAGE_ID}`,
        title: 'Start',
        lastVerifiedAt: Date.now(),
      });

      await handlers.checkPageStatus({}, internalSender, sendResponse);
      expectResponseContaining(sendResponse, { isSaved: true, title: 'Start' });
    });

    test('應該在 API 檢查返回 null 時進行重試', async () => {
      const sendResponse = jest.fn();
      arrangeExpiredPageStatusCheck();
      mockNotionService.checkPageExists.mockResolvedValueOnce(null);
      mockNotionService.checkPageExists.mockResolvedValueOnce(true);

      await handlers.checkPageStatus({}, internalSender, sendResponse);

      expect(mockNotionService.checkPageExists).toHaveBeenCalledTimes(2);
      expectResponseContaining(sendResponse, { success: true, isSaved: true });
    });
    test('checkPageStatus 在重試後仍返回 null 應暫時假設本地狀態正確', async () => {
      const sendResponse = jest.fn();
      arrangeExpiredPageStatusCheck();
      mockNotionService.checkPageExists.mockResolvedValue(null);

      await handlers.checkPageStatus({}, internalSender, sendResponse);

      expect(mockNotionService.checkPageExists).toHaveBeenCalledTimes(2);
      expectResponseContaining(sendResponse, { success: true, isSaved: true });
    });

    test('當 migratedFromOldKey 為 true 時應略過 TTL 快取並驗證頁面存在性', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockResolvedValue([createTabContext()]);
      mockStorageService.getConfig.mockResolvedValue({ notionApiKey: PAGE_STATUS_API_KEY });

      // 設定快取仍在有效期內（TTL = 1000ms，lastVerifiedAt = 現在 - 500ms）
      const now = Date.now();
      mockStorageService.getSavedPageData.mockResolvedValue({
        notionPageId: SAVED_PAGE_ID,
        notionUrl: `https://notion.so/${SAVED_PAGE_ID}`,
        title: 'Migrated Page',
        lastVerifiedAt: now - 500, // 快取仍有效
      });

      // Mock resolveTabUrl 返回 migrated: true
      mockTabService.resolveTabUrl.mockResolvedValue({
        stableUrl: EXAMPLE_URL,
        originalUrl: EXAMPLE_URL,
        migrated: true, // 關鍵：剛完成遷移
      });

      // Mock API 驗證返回頁面存在
      mockNotionService.checkPageExists.mockResolvedValue(true);

      await handlers.checkPageStatus({}, internalSender, sendResponse);

      // 驗證：即使快取有效，仍應呼叫 checkPageExists（略過快取）
      expect(mockNotionService.checkPageExists).toHaveBeenCalled();
      expectResponseContaining(sendResponse, {
        success: true,
        isSaved: true,
        notionPageId: SAVED_PAGE_ID,
      });
    });
  });

  describe('updateHighlights handler', () => {
    test('應該處理完整更新流程', async () => {
      const sendResponse = jest.fn();
      arrangeSavedPageForRemoteHighlightUpdate();
      mockInjectionService.collectHighlights.mockResolvedValue([{ text: 'hi' }]);

      await handlers[RUNTIME_ACTIONS.UPDATE_REMOTE_HIGHLIGHTS]({}, internalSender, sendResponse);
      expectResponseContaining(sendResponse, { success: true, highlightCount: 1 });
    });

    test('應該在 API Key 未設置時報錯', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockResolvedValue([createTabContext(HTTP_TEST_URL)]);
      mockStorageService.getConfig.mockResolvedValue({}); // No API Key
      ensureNotionApiKey.mockRejectedValueOnce(new Error(ERROR_MESSAGES.TECHNICAL.MISSING_API_KEY));
      const formattedMessage = ErrorHandler.formatUserMessage(
        ERROR_MESSAGES.TECHNICAL.MISSING_API_KEY
      );

      mockStorageService.getSavedPageData.mockResolvedValue({ notionPageId: SIMPLE_PAGE_ID });
      await handlers[RUNTIME_ACTIONS.UPDATE_REMOTE_HIGHLIGHTS]({}, internalSender, sendResponse);

      expectFailureResponse(sendResponse, formattedMessage);
    });
  });

  // === USER_ACTIVATE_SHORTCUT (HighlightHandlers) 測試 ===
  describe('USER_ACTIVATE_SHORTCUT handler', () => {
    const mockSender = createContentScriptSender();

    beforeEach(() => {
      chrome.runtime.id = MOCK_EXTENSION_ID;
    });

    test('應該在安全性驗證失敗時拒絕', async () => {
      const sendResponse = jest.fn();
      // 模擬非 content script 請求 (缺少 tab)
      await handlers.USER_ACTIVATE_SHORTCUT({}, { id: WRONG_EXTENSION_ID }, sendResponse);
      expectFailureResponse(sendResponse, expect.stringContaining('拒絕訪問'));
    });

    test('應該處理缺少標籤頁上下文', async () => {
      const sendResponse = jest.fn();
      await handlers.USER_ACTIVATE_SHORTCUT({}, createInternalSender(), sendResponse);
      // 觸發 validateContentScriptRequest 失敗
      expectFailureResponse(sendResponse, expect.stringContaining('必須在標籤頁上下文中調用'));
    });

    test('應該在受限頁面返回錯誤', async () => {
      const sendResponse = jest.fn();
      const restrictedSender = createContentScriptSender({
        tab: { id: DEFAULT_TAB_ID, url: RESTRICTED_EXTENSIONS_ORIGIN },
        url: undefined,
      });
      await handlers.USER_ACTIVATE_SHORTCUT({}, restrictedSender, sendResponse);
      expectFailureResponse(sendResponse, ERROR_MESSAGES.USER_MESSAGES.HIGHLIGHT_NOT_SUPPORTED);
    });

    test('應該處理 Bundle 注入失敗', async () => {
      const sendResponse = jest.fn();
      mockInjectionService.ensureBundleInjected = jest
        .fn()
        .mockRejectedValue(new Error('Injection failed'));

      await handlers.USER_ACTIVATE_SHORTCUT({}, mockSender, sendResponse);

      // sanitizeApiError('Injection failed') -> 'Invalid request'
      expectFailureResponse(sendResponse, expect.any(String));
    });

    // 已在 highlightHandlers.minimal.test.js 補完覆蓋率，移除此處不穩定的測試

    test('應該在顯示高亮工具失敗時返回錯誤', async () => {
      const sendResponse = jest.fn();
      mockInjectionService.ensureBundleInjected = jest.fn().mockResolvedValue();

      chrome.tabs.sendMessage.mockImplementation((id, msg, cb) => {
        if (msg.action === 'PING') {
          cb({ status: 'bundle_ready' });
        } else if (msg.action === 'ACTIVATE_FLOATING_RAIL_HIGHLIGHT') {
          chrome.runtime.lastError = { message: 'Internal error' };
          cb(); // 當有 lastError 時，callback 不應傳遞參數
        }
      });

      await handlers.USER_ACTIVATE_SHORTCUT({}, mockSender, sendResponse);

      expectFailureResponse(sendResponse, expect.any(String));
    });
  });

  describe('startHighlight handler (Security)', () => {
    test('應該在安全性驗證失敗時拒絕', async () => {
      const sendResponse = jest.fn();
      // 模擬非內部請求 (有 tab 但 URL 不對)
      const evilSender = createContentScriptSender({
        tab: { id: DEFAULT_TAB_ID, url: 'https://evil.com' },
        url: undefined,
      });
      await handlers.startHighlight({}, evilSender, sendResponse);
      expectFailureResponse(sendResponse, expect.stringContaining('拒絕訪問'));
    });

    test('應該在受限頁面返回錯誤', async () => {
      const sendResponse = jest.fn();
      chrome.tabs.query.mockResolvedValue([createTabContext(CHROME_SETTINGS_URL)]);
      await handlers.startHighlight({}, createInternalSender(), sendResponse);
      expectFailureResponse(sendResponse, ERROR_MESSAGES.USER_MESSAGES.HIGHLIGHT_NOT_SUPPORTED);
    });
  });
});
