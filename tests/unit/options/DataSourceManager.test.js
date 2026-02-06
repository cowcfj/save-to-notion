/**
 * @jest-environment jsdom
 */
/* global document */
import { DataSourceManager } from '../../../scripts/options/DataSourceManager.js';
import { UIManager } from '../../../scripts/options/UIManager.js';
import { UI_MESSAGES, ERROR_MESSAGES } from '../../../scripts/config/messages.js';

// Mock dependencies
jest.mock('../../../scripts/options/UIManager.js');
jest.mock('../../../scripts/options/SearchableDatabaseSelector.js');

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
    globalThis.Logger = {
      debug: jest.fn(),
      success: jest.fn(),
      start: jest.fn(),
      ready: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    };

    // Reset chrome mock
    globalThis.chrome.runtime.sendMessage.mockReset();
    globalThis.chrome.runtime.lastError = null;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    delete globalThis.Logger;
  });

  describe('loadDataSources', () => {
    test('處理 401 認證錯誤', async () => {
      globalThis.chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback({ success: false, error: 'Unauthorized' });
      });

      await dataSourceManager.loadDataSources('invalid_key');

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining(ERROR_MESSAGES.PATTERNS['API Key']),
        'error'
      );
    });

    test('處理網路錯誤', async () => {
      globalThis.chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback({ success: false, error: 'Network error' });
      });

      await dataSourceManager.loadDataSources('secret_test_key');

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining(ERROR_MESSAGES.PATTERNS['Network error'].split('，')[0]),
        'error'
      );
    });

    test('帶有 query 參數時發送正確的請求主體', async () => {
      globalThis.chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback({ success: true, data: { results: [] } });
      });

      await dataSourceManager.loadDataSources('secret_test_key', 'test_query');

      // 驗證 sendMessage 被調用且包含 query 參數
      expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'searchNotion',
          query: 'test_query',
        }),
        expect.any(Function)
      );
    });

    test('無 query 參數時使用時間排序', async () => {
      globalThis.chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback({ success: true, data: { results: [] } });
      });

      await dataSourceManager.loadDataSources('secret_test_key');

      expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'searchNotion',
          sort: {
            direction: 'descending',
            timestamp: 'last_edited_time',
          },
        }),
        expect.any(Function)
      );
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
      expect(filtered).toHaveLength(1);
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

      expect(filtered).toHaveLength(1);
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

      expect(filtered).toHaveLength(2);
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

  describe('loadDataSources - additional error handling', () => {
    test('處理 403 權限錯誤', async () => {
      globalThis.chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback({ success: false, error: 'Forbidden' });
      });

      await dataSourceManager.loadDataSources('permission_denied_key');

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('無法存取'), // 簡化匹配，甚至可以用 constants
        'error'
      );
    });

    test('處理其他 HTTP 錯誤', async () => {
      globalThis.chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback({ success: false, error: 'Internal Server Error' });
      });

      await dataSourceManager.loadDataSources('test_key');

      // sanitizeApiError 會正確識別 Internal Server Error 為服務不可用錯誤
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining(ERROR_MESSAGES.PATTERNS['Internal Server Error']),
        'error'
      );
    });

    test('處理無內容的 503 錯誤', async () => {
      globalThis.chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback({ success: false, error: 'Service Unavailable' });
      });

      await dataSourceManager.loadDataSources('test_key');

      // 應自動識別為 Internal Server Error 並翻譯
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining(ERROR_MESSAGES.PATTERNS['Internal Server Error']),
        'error'
      );
    });

    test('處理空結果', async () => {
      globalThis.chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback({ success: true, data: { results: [] } });
      });

      const result = await dataSourceManager.loadDataSources('test_key');

      expect(result).toEqual([]);
      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining(UI_MESSAGES.DATA_SOURCE.NO_DATA_SOURCE_FOUND),
        'error'
      );
    });

    test('搜尋模式下空結果顯示 info 訊息', async () => {
      globalThis.chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback({ success: true, data: { results: [] } });
      });

      await dataSourceManager.loadDataSources('test_key', 'nonexistent');

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining(UI_MESSAGES.DATA_SOURCE.NO_RESULT('nonexistent')),
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

      globalThis.chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback({ success: true, data: { results: mockResults } });
      });

      const result = await dataSourceManager.loadDataSources('test_key');

      expect(result).toHaveLength(1);
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

      globalThis.chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
        callback({ success: true, data: { results: mockResults } });
      });

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
