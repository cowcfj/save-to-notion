/**
 * @jest-environment jsdom
 */
/* global document */
import { jest } from '@jest/globals';
import { UIManager } from '../../../pages/options/UIManager.js';
import { UI_MESSAGES, ERROR_MESSAGES } from '../../../scripts/config/shared/messages.js';
import Logger from '../../../scripts/utils/Logger.js';
import {
  buildDataSource,
  buildPage,
  dataSourceParent,
  databaseParent,
  mockRuntimeResponse,
  titleProperty,
  urlProperty,
} from './optionsDataSourceTestHarness.js';

// Setup common mocks that work across ESM and CJS
const mockPopulateDataSources = jest.fn();
const mockConstructor = jest.fn().mockImplementation(function () {
  this.populateDataSources = mockPopulateDataSources;
});

// For native ESM
jest.unstable_mockModule('../../../pages/options/SearchableDatabaseSelector.js', () => ({
  SearchableDatabaseSelector: mockConstructor,
}));

// For CommonJS
jest.mock('../../../pages/options/SearchableDatabaseSelector.js', () => {
  const mockPopulateDataSourcesInner = jest.fn();
  const mockConstructorInner = jest.fn().mockImplementation(function () {
    this.populateDataSources = mockPopulateDataSourcesInner;
  });
  return {
    SearchableDatabaseSelector: mockConstructorInner,
  };
});

let SearchableDatabaseSelector;
let DataSourceManager;

// Mock chrome API
globalThis.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    lastError: null,
  },
};

describe('DataSourceManager', () => {
  let dataSourceManager = null;
  let mockUiManager = null;
  const loadDataSourcesWithMockedResponse = async ({ apiKey = 'test_key', query, response }) => {
    mockRuntimeResponse(globalThis.chrome.runtime.sendMessage, response);
    return dataSourceManager.loadDataSources(apiKey, query);
  };

  beforeAll(async () => {
    const sdsModule = await import('../../../pages/options/SearchableDatabaseSelector.js');
    SearchableDatabaseSelector = sdsModule.SearchableDatabaseSelector;
    const dsmModule = await import('../../../pages/options/DataSourceManager.js');
    DataSourceManager = dsmModule.DataSourceManager;
  });

  beforeEach(() => {
    // DOM Setup
    document.body.innerHTML = `
      <select id="database-select"></select>
      <input id="database-id" type="hidden" />
    `;

    jest.spyOn(Logger, 'info').mockImplementation(() => {});
    jest.spyOn(Logger, 'error').mockImplementation(() => {});
    jest.spyOn(Logger, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger, 'debug').mockImplementation(() => {});
    jest.spyOn(Logger, 'start').mockImplementation(() => {});
    jest.spyOn(Logger, 'success').mockImplementation(() => {});
    jest.spyOn(Logger, 'ready').mockImplementation(() => {});

    mockUiManager = new UIManager();
    mockUiManager.showStatus = jest.fn();

    dataSourceManager = new DataSourceManager(mockUiManager, () => 'test-api-key');
    dataSourceManager.init();

    // Reset chrome mock
    globalThis.chrome.runtime.sendMessage.mockReset();
    globalThis.chrome.runtime.lastError = null;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
    // 確保每次測試後都恢復真實計時器，防止 fake timers 洩漏
    jest.useRealTimers();
  });

  describe('loadDataSources', () => {
    test('無 API Key 時返回空陣列且不發送請求', async () => {
      const result = await dataSourceManager.loadDataSources('');
      expect(result).toEqual([]);
      expect(globalThis.chrome.runtime.sendMessage).not.toHaveBeenCalled();
      expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('未提供 API Key'));
    });

    test.each([
      {
        name: '處理 401 認證錯誤',
        apiKey: 'invalid_key',
        response: {
          success: false,
          error: 'Unauthorized',
        },
        expectedMessage: ERROR_MESSAGES.PATTERNS.API_KEY_NOT_CONFIGURED,
        expectedType: 'error',
      },
      {
        name: '處理網路錯誤',
        apiKey: 'secret_test_key',
        response: {
          success: false,
          error: 'Network error',
        },
        expectedMessage: '網路連線異常',
        expectedType: 'error',
      },
    ])('$name', async ({ apiKey, response, expectedMessage, expectedType }) => {
      await loadDataSourcesWithMockedResponse({
        apiKey,
        response,
      });

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining(expectedMessage),
        expectedType
      );
    });

    test('處理 chrome.runtime.sendMessage 超時', async () => {
      jest.useFakeTimers();

      globalThis.chrome.runtime.sendMessage.mockImplementation(() => {
        // 不調用 callback 以模擬超時
      });

      const promise = dataSourceManager.loadDataSources('test_key');

      // 快轉時間觸發超時
      jest.advanceTimersByTime(30_000 + 100);

      const result = await promise;

      expect(result).toEqual([]);
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('請求超時'),
        'error'
      );
    });

    test('處理 chrome.runtime.lastError', async () => {
      globalThis.chrome.runtime.sendMessage.mockImplementation((_msg, callback) => {
        globalThis.chrome.runtime.lastError = { message: 'Message port closed' };
        callback();
      });

      await dataSourceManager.loadDataSources('test_key');

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        // 'Message port closed' 會被 sanitizeApiError 歸類為 'UNKNOWN_ERROR'
        expect.stringContaining('發生未知錯誤'),
        'error'
      );
    });

    test('帶有 query 參數時發送正確的請求主體', async () => {
      mockRuntimeResponse(globalThis.chrome.runtime.sendMessage, {
        success: true,
        data: { results: [] },
      });

      await dataSourceManager.loadDataSources('secret_test_key', 'test_query');

      // 驗證 sendMessage 被調用且包含 query 參數
      expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'searchNotion',
          searchParams: expect.objectContaining({
            query: 'test_query',
          }),
        }),
        expect.any(Function)
      );
    });

    test('無 query 參數時使用時間排序', async () => {
      mockRuntimeResponse(globalThis.chrome.runtime.sendMessage, {
        success: true,
        data: { results: [] },
      });

      await dataSourceManager.loadDataSources('secret_test_key');

      expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'searchNotion',
          searchParams: expect.objectContaining({
            sort: {
              direction: 'descending',
              timestamp: 'last_edited_time',
            },
          }),
        }),
        expect.any(Function)
      );
    });
  });

  describe('filterAndSortResults', () => {
    test('優先排序工作區頁面', () => {
      const results = [
        buildDataSource({ object: 'database', title: 'Database', properties: {} }),
        buildPage({ id: 'page-1', title: 'Workspace Page' }),
      ];

      const filtered = DataSourceManager.filterAndSortResults(results);

      expect(filtered[0].id).toBe('page-1'); // Workspace page 優先
    });

    test('過濾掉已保存的網頁（parent 為 data_source_id 且有 URL）', () => {
      const results = [
        buildPage({
          id: 'page-1',
          parent: dataSourceParent,
          title: 'Saved Web Page',
          properties: {
            title: titleProperty('Saved Web Page'),
            URL: urlProperty('https://example.com'),
          },
        }),
        buildPage({ id: 'page-2', title: 'Workspace Page' }),
      ];

      const filtered = DataSourceManager.filterAndSortResults(results);

      // page-1 應該被過濾掉（因為 parent 是 data_source_id 且有 URL 屬性）
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('page-2');
    });

    test('保留一般頁面（不是已保存的網頁）', () => {
      const results = [
        buildPage({
          id: 'page-1',
          parent: { type: 'page_id', page_id: 'parent-123' },
          title: 'Category Page',
        }),
      ];

      const filtered = DataSourceManager.filterAndSortResults(results);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('page-1');
    });

    test('保留有 URL 屬性的資料庫並優先排序', () => {
      const results = [
        buildDataSource({ id: 'db-1' }),
        buildDataSource({
          object: 'database',
          id: 'db-2',
          title: 'URL Database',
          properties: {
            Title: { type: 'title' },
            URL: urlProperty(),
          },
        }),
      ];

      const filtered = DataSourceManager.filterAndSortResults(results);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].id).toBe('db-2'); // URL database 優先
    });
  });

  describe('isSavedWebPage', () => {
    test.each([
      {
        name: '識別已保存的網頁',
        parent: dataSourceParent,
        title: 'Example',
      },
      {
        name: '識別屬於 database_id 父級的已保存網頁',
        parent: databaseParent,
        title: 'DB Child Page',
      },
    ])('$name', ({ parent, title }) => {
      const savedPage = buildPage({
        parent,
        properties: {
          Title: titleProperty(title),
          URL: urlProperty('https://example.com'),
        },
      });

      expect(DataSourceManager.isSavedWebPage(savedPage)).toBe(true);
    });

    test('不誤判工作區頁面', () => {
      const workspacePage = buildPage({ title: 'Workspace Page' });

      expect(DataSourceManager.isSavedWebPage(workspacePage)).toBe(false);
    });
  });

  describe('hasUrlProperty', () => {
    test.each([
      ['偵測到 data_source 有 URL 屬性', 'data_source'],
      ['偵測到 database (Notion API 格式) 有 URL 屬性', 'database'],
    ])('%s', (_name, object) => {
      const database = buildDataSource({
        object,
        properties: {
          Title: { type: 'title' },
          URL: urlProperty(),
        },
      });

      expect(DataSourceManager.hasUrlProperty(database)).toBe(true);
    });

    test('偵測到 data_source 沒有 URL 屬性', () => {
      const database = buildDataSource();

      expect(DataSourceManager.hasUrlProperty(database)).toBe(false);
    });

    test('非 data_source 物件返回 false', () => {
      const page = {
        object: 'page',
        properties: {
          URL: { type: 'url' },
        },
      };

      expect(DataSourceManager.hasUrlProperty(page)).toBe(false);
    });

    test('沒有 properties 的 data_source 返回 false', () => {
      const database = {
        object: 'data_source',
      };

      expect(DataSourceManager.hasUrlProperty(database)).toBe(false);
    });
  });

  describe('loadDataSources - additional error handling', () => {
    test.each([
      {
        name: '處理 403 權限錯誤',
        apiKey: 'permission_denied_key',
        response: {
          success: false,
          error: 'Forbidden',
        },
        expectedMessage: '無法存取',
        expectedType: 'error',
      },
      {
        name: '處理其他 HTTP 錯誤',
        response: {
          success: false,
          error: 'Internal Server Error',
        },
        expectedMessage: ERROR_MESSAGES.PATTERNS.INTERNAL_SERVER_ERROR,
        expectedType: 'error',
      },
      {
        name: '處理 503 錯誤（對應到 Internal Server Error 訊息）',
        response: {
          success: false,
          error: 'Service Unavailable',
        },
        expectedMessage: ERROR_MESSAGES.PATTERNS.INTERNAL_SERVER_ERROR,
        expectedType: 'error',
      },
    ])('$name', async ({ apiKey, response, expectedMessage, expectedType }) => {
      await loadDataSourcesWithMockedResponse({
        apiKey,
        response,
      });

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining(expectedMessage),
        expectedType
      );
    });

    test.each([
      {
        name: '處理空結果',
        response: {
          success: true,
          data: { results: [] },
        },
        expectedMessage: UI_MESSAGES.DATA_SOURCE.NO_DATA_SOURCE_FOUND,
        expectedType: 'error',
        query: undefined,
      },
      {
        name: '搜尋模式下空結果顯示 info 訊息',
        response: {
          success: true,
          data: { results: [] },
        },
        expectedMessage: UI_MESSAGES.DATA_SOURCE.NO_RESULT('nonexistent'),
        expectedType: 'info',
        query: 'nonexistent',
      },
    ])('$name', async ({ response, expectedMessage, expectedType, query }) => {
      const result = await loadDataSourcesWithMockedResponse({
        response,
        query,
      });

      expect(result).toEqual([]);
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining(expectedMessage),
        expectedType
      );
    });

    test('成功返回資料來源列表', async () => {
      const mockResults = [buildPage({ title: 'Test Page' })];

      mockRuntimeResponse(globalThis.chrome.runtime.sendMessage, {
        success: true,
        data: { results: mockResults },
      });

      const result = await dataSourceManager.loadDataSources('test_key');

      expect(result).toHaveLength(1);
    });

    test('過濾後無可用資料來源時顯示錯誤', async () => {
      // 所有結果都是已保存的網頁，應被過濾掉
      const mockResults = [
        buildPage({
          id: 'saved-page-1',
          parent: dataSourceParent,
          title: 'Saved Page',
          properties: {
            title: titleProperty('Saved Page'),
            URL: urlProperty('https://example.com'),
          },
        }),
      ];

      mockRuntimeResponse(globalThis.chrome.runtime.sendMessage, {
        success: true,
        data: { results: mockResults },
      });

      await dataSourceManager.loadDataSources('test_key');

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining(UI_MESSAGES.DATA_SOURCE.NO_DATA_SOURCE_FOUND),
        'error'
      );
    });
  });

  describe('filterAndSortResults - preserveOrder', () => {
    test.each([
      {
        name: 'preserveOrder 為 true 時保留原始順序',
        preserveOrder: true,
        expectedIds: ['page-1', 'page-2'],
      },
      {
        name: 'preserveOrder 為 false 時按類型排序',
        preserveOrder: false,
        expectedIds: ['page-2', 'page-1'],
      },
    ])('$name', ({ preserveOrder, expectedIds }) => {
      const results = [
        buildPage({
          id: 'page-1',
          parent: { type: 'page_id' },
          title: 'Category Page',
        }),
        buildPage({ id: 'page-2', title: 'Workspace Page' }),
      ];

      const filtered = DataSourceManager.filterAndSortResults(results, 100, preserveOrder);

      expect(filtered.map(({ id }) => id)).toEqual(expectedIds);
    });

    test('分類頁面排在工作區頁面之後', () => {
      const results = [
        buildPage({
          id: 'other-1',
          parent: { type: 'block_id' },
          title: 'Other Page',
        }),
        buildPage({
          id: 'category-1',
          parent: { type: 'page_id' },
          title: 'Category Page',
        }),
        buildPage({ id: 'workspace-1', title: 'Workspace Page' }),
      ];

      const filtered = DataSourceManager.filterAndSortResults(results, 100, false);

      expect(filtered[0].id).toBe('workspace-1');
      expect(filtered[1].id).toBe('category-1');
      expect(filtered[2].id).toBe('other-1');
    });
  });

  describe('isSavedWebPage - additional cases', () => {
    test.each([
      {
        name: 'data_source_id 父級但無 URL 屬性不判定為已保存網頁',
        properties: {
          Title: titleProperty('Just a Page'),
          Notes: { type: 'rich_text' },
        },
      },
      {
        name: '避免誤判：僅憑屬性名稱包含 "url" 不應被識別為已保存網頁',
        properties: {
          Title: titleProperty('Saved Article'),
          pageurl: { type: 'rich_text' },
        },
      },
    ])('$name', ({ properties }) => {
      const page = buildPage({
        parent: dataSourceParent,
        properties,
      });

      expect(DataSourceManager.isSavedWebPage(page)).toBe(false);
    });

    test('非頁面物件返回 false', () => {
      const database = buildDataSource({
        parent: { type: 'data_source_id' },
        properties: {
          URL: urlProperty(),
        },
      });

      expect(DataSourceManager.isSavedWebPage(database)).toBe(false);
    });
  });

  describe('populateDataSourceSelect', () => {
    let SearchableDatabaseSelectorMock;

    beforeEach(() => {
      SearchableDatabaseSelectorMock = SearchableDatabaseSelector;
      SearchableDatabaseSelectorMock.mockClear();
    });

    const expectDataSourceSelectPopulation = ({
      dataSources,
      isSearchResult,
      expectedStatusMessage,
    }) => {
      dataSourceManager.populateDataSourceSelect(dataSources, isSearchResult);

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(expectedStatusMessage, 'success');

      const mockInstance = SearchableDatabaseSelectorMock.mock.instances[0];
      expect(mockInstance.populateDataSources).toHaveBeenCalledWith(dataSources, isSearchResult);
    };

    test('使用注入的 getApiKey 函式建立 SearchableDatabaseSelector', () => {
      const customGetApiKey = () => 'custom-key';
      const manager = new DataSourceManager(mockUiManager, customGetApiKey);

      const mockData = [{ id: 'db-1', object: 'database' }];
      manager.populateDataSourceSelect(mockData);

      expect(SearchableDatabaseSelectorMock).toHaveBeenCalledTimes(1);
      const constructorConfig = SearchableDatabaseSelectorMock.mock.calls[0][0];
      expect(constructorConfig.getApiKey()).toBe('custom-key');
    });

    test('無注入 getApiKey 時，應拋出 TypeError', () => {
      expect(() => new DataSourceManager(mockUiManager, null)).toThrow(TypeError);

      expect(() => new DataSourceManager(mockUiManager)).toThrow(
        'DataSourceManager 需要 getApiKey 函式'
      );
    });

    test.each([
      {
        name: '非搜尋結果且資料來源非空時，顯示成功載入狀態並填充 selector',
        dataSources: [{ id: 'db-1', object: 'database' }],
        isSearchResult: false,
        expectedStatusMessage: UI_MESSAGES.DATA_SOURCE.LOAD_SUCCESS(1),
      },
      {
        name: '搜尋結果且資料來源非空時，顯示尋獲數量狀態',
        dataSources: [
          { id: 'db-1', object: 'database' },
          { id: 'db-2', object: 'database' },
        ],
        isSearchResult: true,
        expectedStatusMessage: UI_MESSAGES.DATA_SOURCE.FOUND_COUNT(2),
      },
    ])('$name', ({ dataSources, isSearchResult, expectedStatusMessage }) => {
      expect.hasAssertions();

      expectDataSourceSelectPopulation({
        dataSources,
        isSearchResult,
        expectedStatusMessage,
      });
    });

    test('防禦性檢查：資料來源為空時，顯示無資料來源錯誤狀態', () => {
      dataSourceManager.populateDataSourceSelect([], false);

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        UI_MESSAGES.DATA_SOURCE.NO_DATA_SOURCE_FOUND,
        'error'
      );
    });
  });
});
