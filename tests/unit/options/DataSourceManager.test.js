/**
 * @jest-environment jsdom
 */
/* global document */
import { DataSourceManager } from '../../../scripts/options/DataSourceManager.js';
import { UIManager } from '../../../scripts/options/UIManager.js';

// Mock dependencies
jest.mock('../../../scripts/options/UIManager.js');
jest.mock('../../../scripts/options/SearchableDatabaseSelector.js');

// Mock fetch globally
global.fetch = jest.fn();

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

    dataSourceManager = new DataSourceManager(mockUiManager);
    dataSourceManager.init();

    // Mock Logger
    window.Logger = {
      info: jest.fn(),
      error: jest.fn(),
    };

    // Reset fetch mock
    global.fetch.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    delete window.Logger;
  });

  describe('loadDatabases', () => {
    test('處理 401 認證錯誤', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Unauthorized' }),
      });

      await dataSourceManager.loadDatabases('invalid_key');

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('請先在設定頁面配置 Notion API Key'),
        'error'
      );
    });

    test('處理網路錯誤', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await dataSourceManager.loadDatabases('secret_test_key');

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('網路連線異常'),
        'error'
      );
    });

    test('帶有 query 參數時發送正確的請求主體', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      await dataSourceManager.loadDatabases('secret_test_key', 'test_query');

      // 驗證 fetch 被調用且包含 query 參數
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.notion.com/v1/search',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(String),
        })
      );

      // 解析請求主體並驗證
      const callArgs = global.fetch.mock.calls[0][1];
      const requestBody = JSON.parse(callArgs.body);

      expect(requestBody.query).toBe('test_query');
      expect(requestBody.sort).toBeUndefined(); // 有 query 時不應該有 sort
    });

    test('無 query 參數時使用時間排序', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      await dataSourceManager.loadDatabases('secret_test_key');

      const callArgs = global.fetch.mock.calls[0][1];
      const requestBody = JSON.parse(callArgs.body);

      expect(requestBody.query).toBeUndefined();
      expect(requestBody.sort).toEqual({
        direction: 'descending',
        timestamp: 'last_edited_time',
      });
    });
  });

  describe('filterAndSortResults', () => {
    test('優先排序工作區頁面', () => {
      const results = [
        {
          object: 'data_source',
          id: 'db-1',
          parent: { type: 'page_id' },
          title: [{ plain_text: 'Database' }],
          properties: {},
        },
        {
          object: 'page',
          id: 'page-1',
          parent: { type: 'workspace', workspace: true },
          properties: { title: { title: [{ plain_text: 'Workspace Page' }] } },
        },
      ];

      const filtered = DataSourceManager.filterAndSortResults(results);

      expect(filtered[0].id).toBe('page-1'); // Workspace page 優先
    });

    test('過濾掉已保存的網頁（parent 為 data_source_id 且有 URL）', () => {
      const results = [
        {
          object: 'page',
          id: 'page-1',
          parent: { type: 'data_source_id', data_source_id: 'db-123' },
          properties: {
            title: { title: [{ plain_text: 'Saved Web Page' }] },
            URL: { type: 'url', url: 'https://example.com' },
          },
        },
        {
          object: 'page',
          id: 'page-2',
          parent: { type: 'workspace', workspace: true },
          properties: { title: { title: [{ plain_text: 'Workspace Page' }] } },
        },
      ];

      const filtered = DataSourceManager.filterAndSortResults(results);

      // page-1 應該被過濾掉（因為 parent 是 data_source_id 且有 URL 屬性）
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('page-2');
    });

    test('保留一般頁面（不是已保存的網頁）', () => {
      const results = [
        {
          object: 'page',
          id: 'page-1',
          parent: { type: 'page_id', page_id: 'parent-123' },
          properties: {
            title: { title: [{ plain_text: 'Category Page' }] },
          },
        },
      ];

      const filtered = DataSourceManager.filterAndSortResults(results);

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('page-1');
    });

    test('保留有 URL 屬性的資料庫並優先排序', () => {
      const results = [
        {
          object: 'data_source',
          id: 'db-1',
          parent: { type: 'workspace' },
          title: [{ plain_text: 'Regular Database' }],
          properties: {
            Title: { type: 'title' },
          },
        },
        {
          object: 'data_source',
          id: 'db-2',
          parent: { type: 'workspace' },
          title: [{ plain_text: 'URL Database' }],
          properties: {
            Title: { type: 'title' },
            URL: { type: 'url' },
          },
        },
      ];

      const filtered = DataSourceManager.filterAndSortResults(results);

      expect(filtered.length).toBe(2);
      expect(filtered[0].id).toBe('db-2'); // URL database 優先
    });
  });

  describe('isSavedWebPage', () => {
    test('識別已保存的網頁', () => {
      const savedPage = {
        object: 'page',
        parent: { type: 'data_source_id', data_source_id: 'db-123' },
        properties: {
          Title: { title: [{ plain_text: 'Example' }] },
          URL: { type: 'url', url: 'https://example.com' },
        },
      };

      expect(DataSourceManager.isSavedWebPage(savedPage)).toBe(true);
    });

    test('不誤判工作區頁面', () => {
      const workspacePage = {
        object: 'page',
        parent: { type: 'workspace', workspace: true },
        properties: {
          title: { title: [{ plain_text: 'Workspace Page' }] },
        },
      };

      expect(DataSourceManager.isSavedWebPage(workspacePage)).toBe(false);
    });
  });

  describe('hasUrlProperty', () => {
    test('偵測到 data_source 有 URL 屬性', () => {
      const database = {
        object: 'data_source',
        properties: {
          Title: { type: 'title' },
          URL: { type: 'url' },
        },
      };

      expect(DataSourceManager.hasUrlProperty(database)).toBe(true);
    });

    test('偵測到 data_source 沒有 URL 屬性', () => {
      const database = {
        object: 'data_source',
        properties: {
          Title: { type: 'title' },
        },
      };

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

  describe('handleDatabaseSelect', () => {
    test('選擇資料來源時更新 database-id 輸入框', () => {
      dataSourceManager.elements.databaseSelect.innerHTML =
        '<option value="db-123">Test DB</option>';
      dataSourceManager.elements.databaseSelect.value = 'db-123';

      dataSourceManager.handleDatabaseSelect();

      expect(document.getElementById('database-id').value).toBe('db-123');
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        '資料來源已選擇，請點擊保存設置',
        'info'
      );
    });

    test('未選擇時不更新', () => {
      dataSourceManager.elements.databaseSelect.value = '';

      dataSourceManager.handleDatabaseSelect();

      expect(document.getElementById('database-id').value).toBe('');
      expect(mockUiManager.showStatus).not.toHaveBeenCalled();
    });
  });

  describe('loadDatabases - additional error handling', () => {
    test('處理 403 權限錯誤', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ message: 'Forbidden' }),
      });

      await dataSourceManager.loadDatabases('permission_denied_key');

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('無法存取此頁面內容'),
        'error'
      );
    });

    test('處理其他 HTTP 錯誤', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'Internal Server Error' }),
      });

      await dataSourceManager.loadDatabases('test_key');

      // sanitizeApiError 會正確識別 Internal Server Error 為服務不可用錯誤
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('Notion 服務暫時不可用'),
        'error'
      );
    });

    test('處理空結果', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      const result = await dataSourceManager.loadDatabases('test_key');

      expect(result).toEqual([]);
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('未找到任何保存目標'),
        'error'
      );
    });

    test('搜尋模式下空結果顯示 info 訊息', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      await dataSourceManager.loadDatabases('test_key', 'nonexistent');

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('未找到 "nonexistent"'),
        'info'
      );
    });

    test('成功返回資料來源列表', async () => {
      const mockResults = [
        {
          object: 'page',
          id: 'page-1',
          parent: { type: 'workspace' },
          properties: { title: { title: [{ plain_text: 'Test Page' }] } },
        },
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: mockResults }),
      });

      const result = await dataSourceManager.loadDatabases('test_key');

      expect(result.length).toBe(1);
    });

    test('過濾後無可用資料來源時顯示錯誤', async () => {
      // 所有結果都是已保存的網頁，應被過濾掉
      const mockResults = [
        {
          object: 'page',
          id: 'saved-page-1',
          parent: { type: 'data_source_id', data_source_id: 'db-123' },
          properties: {
            title: { title: [{ plain_text: 'Saved Page' }] },
            URL: { type: 'url', url: 'https://example.com' },
          },
        },
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: mockResults }),
      });

      await dataSourceManager.loadDatabases('test_key');

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('未找到可用的保存目標'),
        'error'
      );
    });
  });

  describe('filterAndSortResults - preserveOrder', () => {
    test('preserveOrder 為 true 時保留原始順序', () => {
      const results = [
        {
          object: 'page',
          id: 'page-1',
          parent: { type: 'page_id' },
          properties: { title: { title: [{ plain_text: 'First' }] } },
        },
        {
          object: 'page',
          id: 'page-2',
          parent: { type: 'workspace' },
          properties: { title: { title: [{ plain_text: 'Second' }] } },
        },
      ];

      const filtered = DataSourceManager.filterAndSortResults(results, 100, true);

      // 應保留原始順序，不因類型重排
      expect(filtered[0].id).toBe('page-1');
      expect(filtered[1].id).toBe('page-2');
    });

    test('preserveOrder 為 false 時按類型排序', () => {
      const results = [
        {
          object: 'page',
          id: 'page-1',
          parent: { type: 'page_id' },
          properties: { title: { title: [{ plain_text: 'Category Page' }] } },
        },
        {
          object: 'page',
          id: 'page-2',
          parent: { type: 'workspace' },
          properties: { title: { title: [{ plain_text: 'Workspace Page' }] } },
        },
      ];

      const filtered = DataSourceManager.filterAndSortResults(results, 100, false);

      // workspace 頁面應排在前面
      expect(filtered[0].id).toBe('page-2');
      expect(filtered[1].id).toBe('page-1');
    });

    test('分類頁面排在工作區頁面之後', () => {
      const results = [
        {
          object: 'page',
          id: 'other-1',
          parent: { type: 'block_id' },
          properties: { title: { title: [{ plain_text: 'Other Page' }] } },
        },
        {
          object: 'page',
          id: 'category-1',
          parent: { type: 'page_id' },
          properties: { title: { title: [{ plain_text: 'Category Page' }] } },
        },
        {
          object: 'page',
          id: 'workspace-1',
          parent: { type: 'workspace' },
          properties: { title: { title: [{ plain_text: 'Workspace Page' }] } },
        },
      ];

      const filtered = DataSourceManager.filterAndSortResults(results, 100, false);

      expect(filtered[0].id).toBe('workspace-1');
      expect(filtered[1].id).toBe('category-1');
      expect(filtered[2].id).toBe('other-1');
    });
  });

  describe('isSavedWebPage - additional cases', () => {
    test('data_source_id 父級但無 URL 屬性不判定為已保存網頁', () => {
      const page = {
        object: 'page',
        parent: { type: 'data_source_id', data_source_id: 'db-123' },
        properties: {
          Title: { title: [{ plain_text: 'Just a Page' }] },
          Notes: { type: 'rich_text' },
        },
      };

      expect(DataSourceManager.isSavedWebPage(page)).toBe(false);
    });

    test('非頁面物件返回 false', () => {
      const database = {
        object: 'data_source',
        parent: { type: 'data_source_id' },
        properties: {
          URL: { type: 'url' },
        },
      };

      expect(DataSourceManager.isSavedWebPage(database)).toBe(false);
    });

    test('URL 屬性名稱包含小寫 url 時識別為已保存網頁', () => {
      const page = {
        object: 'page',
        parent: { type: 'data_source_id', data_source_id: 'db-123' },
        properties: {
          Title: { title: [{ plain_text: 'Saved Article' }] },
          pageurl: { type: 'rich_text' }, // 名稱包含 url
        },
      };

      expect(DataSourceManager.isSavedWebPage(page)).toBe(true);
    });
  });
});
