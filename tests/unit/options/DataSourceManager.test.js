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
        expect.stringContaining('API Key 無效'),
        'error'
      );
    });

    test('處理網路錯誤', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await dataSourceManager.loadDatabases('secret_test_key');

      expect(mockUiManager.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('Network error'),
        'error'
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

      const filtered = dataSourceManager.filterAndSortResults(results);

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

      const filtered = dataSourceManager.filterAndSortResults(results);

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

      const filtered = dataSourceManager.filterAndSortResults(results);

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

      const filtered = dataSourceManager.filterAndSortResults(results);

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

      expect(dataSourceManager.isSavedWebPage(savedPage)).toBe(true);
    });

    test('不誤判工作區頁面', () => {
      const workspacePage = {
        object: 'page',
        parent: { type: 'workspace', workspace: true },
        properties: {
          title: { title: [{ plain_text: 'Workspace Page' }] },
        },
      };

      expect(dataSourceManager.isSavedWebPage(workspacePage)).toBe(false);
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

      expect(dataSourceManager.hasUrlProperty(database)).toBe(true);
    });

    test('偵測到 data_source 沒有 URL 屬性', () => {
      const database = {
        object: 'data_source',
        properties: {
          Title: { type: 'title' },
        },
      };

      expect(dataSourceManager.hasUrlProperty(database)).toBe(false);
    });
  });
});
