/**
 * @jest-environment jsdom
 */
/* global document */
import { DataSourceManager } from '../../../pages/options/DataSourceManager.js';
import { UIManager } from '../../../pages/options/UIManager.js';
import { UI_MESSAGES, ERROR_MESSAGES } from '../../../scripts/config/shared/messages.js';

// Mock dependencies
jest.mock('../../../pages/options/UIManager.js');
jest.mock('../../../pages/options/SearchableDatabaseSelector.js');
jest.mock('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    success: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import Logger from '../../../scripts/utils/Logger.js';

// Mock chrome API
globalThis.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    lastError: null,
  },
};

const dataSourceParent = { type: 'data_source_id', data_source_id: 'db-123' };
const databaseParent = { type: 'database_id', database_id: 'db-456' };
const workspaceParent = { type: 'workspace', workspace: true };

const titleProperty = plainText => ({ title: [{ plain_text: plainText }] });
const urlProperty = (url = undefined) => ({
  type: 'url',
  ...(url === undefined ? {} : { url }),
});

const buildPage = ({
  id = 'page-1',
  parent = workspaceParent,
  title = 'Test Page',
  properties = { title: titleProperty(title) },
} = {}) => ({
  object: 'page',
  id,
  parent,
  properties,
});

const buildDataSource = ({
  object = 'data_source',
  id = 'db-1',
  parent = { type: 'workspace' },
  title = 'Regular Database',
  properties = { Title: { type: 'title' } },
} = {}) => ({
  object,
  id,
  parent,
  title: [{ plain_text: title }],
  properties,
});

const mockRuntimeResponse = response => {
  globalThis.chrome.runtime.sendMessage.mockImplementation((_msg, callback) => {
    callback(response);
  });
};

describe('DataSourceManager', () => {
  let dataSourceManager = null;
  let mockUiManager = null;

  beforeEach(() => {
    // DOM Setup
    document.body.innerHTML = `
      <select id="database-select"></select>
      <input id="database-id" type="hidden" />
    `;

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
    jest.clearAllMocks();
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

    test('處理 401 認證錯誤', async () => {
      mockRuntimeResponse({ success: false, error: 'Unauthorized' });

      await dataSourceManager.loadDataSources('invalid_key');

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining(ERROR_MESSAGES.PATTERNS.API_KEY_NOT_CONFIGURED),
        'error'
      );
    });

    test('處理網路錯誤', async () => {
      mockRuntimeResponse({ success: false, error: 'Network error' });

      await dataSourceManager.loadDataSources('secret_test_key');

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('網路連線異常'),
        'error'
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
      mockRuntimeResponse({ success: true, data: { results: [] } });

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
      mockRuntimeResponse({ success: true, data: { results: [] } });

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
    test('識別已保存的網頁', () => {
      const savedPage = buildPage({
        parent: dataSourceParent,
        properties: {
          Title: { title: [{ plain_text: 'Example' }] },
          URL: urlProperty('https://example.com'),
        },
      });

      expect(DataSourceManager.isSavedWebPage(savedPage)).toBe(true);
    });

    test('識別屬於 database_id 父級的已保存網頁', () => {
      const savedPage = buildPage({
        parent: databaseParent,
        properties: {
          Title: { title: [{ plain_text: 'DB Child Page' }] },
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
    test('偵測到 data_source 有 URL 屬性', () => {
      const database = buildDataSource({
        properties: {
          Title: { type: 'title' },
          URL: urlProperty(),
        },
      });

      expect(DataSourceManager.hasUrlProperty(database)).toBe(true);
    });

    test('偵測到 database (Notion API 格式) 有 URL 屬性', () => {
      const database = buildDataSource({
        object: 'database',
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
    test('處理 403 權限錯誤', async () => {
      mockRuntimeResponse({ success: false, error: 'Forbidden' });

      await dataSourceManager.loadDataSources('permission_denied_key');

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('無法存取'), // 簡化匹配，甚至可以用 constants
        'error'
      );
    });

    test('處理其他 HTTP 錯誤', async () => {
      mockRuntimeResponse({ success: false, error: 'Internal Server Error' });

      await dataSourceManager.loadDataSources('test_key');

      // sanitizeApiError 會正確識別 Internal Server Error 為服務不可用錯誤
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining(ERROR_MESSAGES.PATTERNS.INTERNAL_SERVER_ERROR),
        'error'
      );
    });

    test('處理 503 錯誤（對應到 Internal Server Error 訊息）', async () => {
      mockRuntimeResponse({ success: false, error: 'Service Unavailable' });

      await dataSourceManager.loadDataSources('test_key');

      // sanitizeApiError 將 503 Service Unavailable 歸類為 Internal Server Error 群組
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining(ERROR_MESSAGES.PATTERNS.INTERNAL_SERVER_ERROR),
        'error'
      );
    });

    test('處理空結果', async () => {
      mockRuntimeResponse({ success: true, data: { results: [] } });

      const result = await dataSourceManager.loadDataSources('test_key');

      expect(result).toEqual([]);
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining(UI_MESSAGES.DATA_SOURCE.NO_DATA_SOURCE_FOUND),
        'error'
      );
    });

    test('搜尋模式下空結果顯示 info 訊息', async () => {
      mockRuntimeResponse({ success: true, data: { results: [] } });

      await dataSourceManager.loadDataSources('test_key', 'nonexistent');

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining(UI_MESSAGES.DATA_SOURCE.NO_RESULT('nonexistent')),
        'info'
      );
    });

    test('成功返回資料來源列表', async () => {
      const mockResults = [buildPage({ title: 'Test Page' })];

      mockRuntimeResponse({ success: true, data: { results: mockResults } });

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

      mockRuntimeResponse({ success: true, data: { results: mockResults } });

      await dataSourceManager.loadDataSources('test_key');

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining(UI_MESSAGES.DATA_SOURCE.NO_DATA_SOURCE_FOUND),
        'error'
      );
    });
  });

  describe('filterAndSortResults - preserveOrder', () => {
    test('preserveOrder 為 true 時保留原始順序', () => {
      const results = [
        buildPage({
          id: 'page-1',
          parent: { type: 'page_id' },
          title: 'First',
        }),
        buildPage({ id: 'page-2', title: 'Second' }),
      ];

      const filtered = DataSourceManager.filterAndSortResults(results, 100, true);

      // 應保留原始順序，不因類型重排
      expect(filtered[0].id).toBe('page-1');
      expect(filtered[1].id).toBe('page-2');
    });

    test('preserveOrder 為 false 時按類型排序', () => {
      const results = [
        buildPage({
          id: 'page-1',
          parent: { type: 'page_id' },
          title: 'Category Page',
        }),
        buildPage({ id: 'page-2', title: 'Workspace Page' }),
      ];

      const filtered = DataSourceManager.filterAndSortResults(results, 100, false);

      // workspace 頁面應排在前面
      expect(filtered[0].id).toBe('page-2');
      expect(filtered[1].id).toBe('page-1');
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
    test('data_source_id 父級但無 URL 屬性不判定為已保存網頁', () => {
      const page = buildPage({
        parent: dataSourceParent,
        properties: {
          Title: { title: [{ plain_text: 'Just a Page' }] },
          Notes: { type: 'rich_text' },
        },
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

    test('避免誤判：僅憑屬性名稱包含 "url" 不應被識別為已保存網頁', () => {
      const page = buildPage({
        parent: dataSourceParent,
        properties: {
          Title: { title: [{ plain_text: 'Saved Article' }] },
          pageurl: { type: 'rich_text' }, // 名稱包含 url 但類型不是 url
        },
      });

      expect(DataSourceManager.isSavedWebPage(page)).toBe(false);
    });
  });

  describe('populateDataSourceSelect', () => {
    let SearchableDatabaseSelectorMock;

    beforeEach(() => {
      SearchableDatabaseSelectorMock = jest.requireMock(
        '../../../pages/options/SearchableDatabaseSelector.js'
      ).SearchableDatabaseSelector;
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

    test('無注入 getApiKey 時，fallback 到 DOM 查詢（且有 API Key）', () => {
      const manager = new DataSourceManager(mockUiManager, null);

      const input = document.createElement('input');
      input.id = 'api-key';
      input.value = 'dom-api-key';
      document.body.append(input);

      try {
        const mockData = [{ id: 'db-1', object: 'database' }];
        manager.populateDataSourceSelect(mockData);

        expect(SearchableDatabaseSelectorMock).toHaveBeenCalledTimes(1);
        const constructorConfig = SearchableDatabaseSelectorMock.mock.calls[0][0];

        const apiKey = constructorConfig.getApiKey();
        expect(apiKey).toBe('dom-api-key');
        expect(Logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Fallback to DOM query for API Key')
        );
      } finally {
        input.remove();
      }
    });

    test('無注入 getApiKey 且 DOM 中無 #api-key 時，fallback 返回空字串', () => {
      const manager = new DataSourceManager(mockUiManager, null);
      const mockData = [{ id: 'db-1', object: 'database' }];
      manager.populateDataSourceSelect(mockData);

      const constructorConfig = SearchableDatabaseSelectorMock.mock.calls[0][0];
      const apiKey = constructorConfig.getApiKey();
      expect(apiKey).toBe('');
    });

    test('非搜尋結果且資料來源非空時，顯示成功載入狀態並填充 selector', () => {
      expect.hasAssertions();

      const mockData = [{ id: 'db-1', object: 'database' }];
      expectDataSourceSelectPopulation({
        dataSources: mockData,
        isSearchResult: false,
        expectedStatusMessage: UI_MESSAGES.DATA_SOURCE.LOAD_SUCCESS(1),
      });
    });

    test('搜尋結果且資料來源非空時，顯示尋獲數量狀態', () => {
      expect.hasAssertions();

      const mockData = [
        { id: 'db-1', object: 'database' },
        { id: 'db-2', object: 'database' },
      ];
      expectDataSourceSelectPopulation({
        dataSources: mockData,
        isSearchResult: true,
        expectedStatusMessage: UI_MESSAGES.DATA_SOURCE.FOUND_COUNT(2),
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
