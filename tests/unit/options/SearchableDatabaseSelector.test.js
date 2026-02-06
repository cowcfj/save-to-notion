/**
 * SearchableDatabaseSelector Unit Tests
 *
 * Tests for the searchable dropdown component for selecting Notion databases
 */

import { SearchableDatabaseSelector } from '../../../scripts/options/SearchableDatabaseSelector';
// Mock Logger
jest.mock('../../../scripts/utils/Logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

describe('SearchableDatabaseSelector', () => {
  let selector = null;
  let mockShowStatus = null;
  let mockLoadDatabases = null;
  let mockGetApiKey = null;

  beforeEach(() => {
    // Mock scrollIntoView (jsdom 不支援此方法)
    Element.prototype.scrollIntoView = jest.fn();

    // DOM Setup
    document.body.innerHTML = `
      <div id="database-selector-container" style="display: none;">
        <input type="text" id="database-search" />
        <button id="selector-toggle"></button>
        <div id="database-dropdown" style="display: none;"></div>
        <div id="data-source-list"></div>
        <div id="data-source-count"></div>
        <button id="refresh-databases"></button>
      </div>
      <input type="hidden" id="database-id" />
      <input type="hidden" id="database-type" />
    `;

    mockShowStatus = jest.fn();
    mockLoadDatabases = jest.fn();
    mockGetApiKey = jest.fn(() => 'mock_api_key');

    selector = new SearchableDatabaseSelector({
      showStatus: mockShowStatus,
      loadDataSources: mockLoadDatabases,
      getApiKey: mockGetApiKey,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw if dependencies are missing', () => {
      expect(() => new SearchableDatabaseSelector({})).toThrow();
      expect(() => new SearchableDatabaseSelector({ showStatus: jest.fn() })).toThrow();
      expect(
        () => new SearchableDatabaseSelector({ showStatus: jest.fn(), loadDataSources: jest.fn() })
      ).toThrow('getApiKey');
    });

    it('should initialize elements', () => {
      expect(selector.container).toBeTruthy();
      expect(selector.searchInput).toBeTruthy();
    });
  });

  describe('populateDatabases', () => {
    const mockDatabases = [
      { id: 'db1', object: 'database', title: [{ plain_text: 'DB One' }] },
      {
        id: 'page1',
        object: 'page',
        properties: { title: { title: [{ plain_text: 'Page One' }] } },
      },
    ];

    it('should populate list and handle empty/loading states', () => {
      selector.populateDataSources(mockDatabases);

      expect(selector.dataSources).toHaveLength(2);
      expect(selector.dataSourceList.children).toHaveLength(2);
      expect(selector.container.style.display).toBe('block');

      // Check formatting of items
      const firstItem = selector.dataSourceList.children[0];
      expect(firstItem.textContent).toContain('DB One');
    });

    it('should handle pre-selected value', () => {
      document.querySelector('#database-id').value = 'db1';
      // Re-populate to trigger selection logic
      selector.populateDataSources(mockDatabases);

      expect(selector.searchInput.value).toBe('DB One');
      expect(selector.selectedDataSource.id).toBe('db1');
    });

    it('should extract title from properties if top-level title is missing', () => {
      const complexDb = {
        id: 'db-complex',
        object: 'database',
        // no top-level title array
        properties: {
          Name: {
            type: 'title',
            title: [{ plain_text: 'Complex Title' }],
          },
          Tags: { type: 'multi_select' },
        },
      };

      selector.populateDataSources([complexDb]);
      expect(selector.dataSources[0].title).toBe('Complex Title');
    });
  });

  describe('filterDatabases', () => {
    const mockDatabases = [
      { id: '1', object: 'database', title: [{ plain_text: 'Apple' }] },
      { id: '2', object: 'database', title: [{ plain_text: 'Banana' }] },
    ];

    beforeEach(() => {
      selector.populateDataSources(mockDatabases);
    });

    it('should filter based on search query', () => {
      selector.filterDataSourcesLocally('app');
      expect(selector.filteredDataSources).toHaveLength(1);
      expect(selector.filteredDataSources[0].title).toBe('Apple');

      // Verify UI update
      // We mocked renderDataSourceList implicitly by checking filteredDataSources,
      // but let's check the DOM
      const items = selector.dataSourceList.querySelectorAll('.database-item');
      expect(items).toHaveLength(1);
      expect(items[0].textContent).toContain('Apple');
    });

    it('should show all when query is empty', () => {
      selector.filterDataSourcesLocally('');
      expect(selector.filteredDataSources).toHaveLength(2);
    });

    it('should show no results message', () => {
      selector.filterDataSourcesLocally('xyz');
      expect(selector.filteredDataSources).toHaveLength(0);
      expect(selector.dataSourceList.innerHTML).toContain('未找到匹配的資料來源');
    });
  });

  describe('selectDatabase', () => {
    const db = { id: 'db1', title: 'Database 1', type: 'database' };

    it('should update inputs and UI on selection', () => {
      selector.selectDataSource(db);

      expect(selector.selectedDataSource).toBe(db);
      expect(document.querySelector('#database-id').value).toBe('db1');
      expect(document.querySelector('#database-type').value).toBe('database');
      expect(selector.searchInput.value).toBe('Database 1');
      expect(mockShowStatus).toHaveBeenCalledWith(expect.stringContaining('已選擇'), 'success');
    });
  });

  describe('Interactions', () => {
    it('should toggle dropdown', () => {
      selector.toggleDropdown();
      expect(selector.isOpen).toBe(false); // Empty list initially

      selector.populateDataSources([{ id: '1', object: 'db', title: [] }]);
      selector.toggleDropdown();
      expect(selector.isOpen).toBe(true);
      expect(selector.dropdown.style.display).toBe('block');

      selector.toggleDropdown();
      expect(selector.isOpen).toBe(false);
      expect(selector.dropdown.style.display).toBe('none');
    });

    it('should handle refresh button', () => {
      mockGetApiKey.mockReturnValue('secret_123');

      selector.refreshButton.click();
      expect(mockLoadDatabases).toHaveBeenCalledWith('secret_123');
    });
  });

  describe('Static Helpers', () => {
    describe('formatDate', () => {
      it('should return empty string for invalid date', () => {
        const result = SearchableDatabaseSelector.formatDate('invalid-date-string');
        // new Date('invalid') is "Invalid Date", toLocaleDateString might behave differently or throw depending on environment
        // The implementation has a try-catch, so we expect empty string or fallback in case of error.
        // If new Date('invalid') results in "Invalid Date" object, toLocaleDateString throws RangeError.
        expect(result).toBe('');
      });

      it('should format valid date', () => {
        // Mock locale if necessary or check loosely
        const result = SearchableDatabaseSelector.formatDate('2023-01-01T12:00:00Z');
        expect(result).toContain('2023');
      });
    });
  });

  describe('performServerSearch', () => {
    beforeEach(() => {
      mockGetApiKey.mockReturnValue('secret_test_key');
    });

    it('should not trigger search for query less than 2 characters', async () => {
      await selector.performServerSearch('a');
      expect(mockLoadDatabases).not.toHaveBeenCalled();
    });

    it('should not trigger search if API key is missing', async () => {
      mockGetApiKey.mockReturnValue('');
      await selector.performServerSearch('test query');
      expect(mockLoadDatabases).not.toHaveBeenCalled();
    });

    it('should call loadDatabases with query for valid search', async () => {
      await selector.performServerSearch('test query');
      expect(mockLoadDatabases).toHaveBeenCalledWith('secret_test_key', 'test query');
    });

    it('should show searching state before API call', async () => {
      const showSearchingStateSpy = jest.spyOn(selector, 'showSearchingState');
      await selector.performServerSearch('test query');

      // showSearchingState 應該被調用
      expect(showSearchingStateSpy).toHaveBeenCalledWith('test query');
      // finally 後 isSearching 應該被重置為 false
      expect(selector.isSearching).toBe(false);

      showSearchingStateSpy.mockRestore();
    });

    it('should handle search error gracefully', async () => {
      mockLoadDatabases.mockRejectedValueOnce(new Error('API Error'));
      await selector.performServerSearch('test query');
      expect(mockShowStatus).toHaveBeenCalledWith(expect.stringContaining('搜尋失敗'), 'error');
      // 即使出錯，isSearching 也應該被重置
      expect(selector.isSearching).toBe(false);
    });

    it('should handle error without message property', async () => {
      mockLoadDatabases.mockRejectedValueOnce({});
      await selector.performServerSearch('test query');
      expect(mockShowStatus).toHaveBeenCalledWith('搜尋失敗: 未知錯誤', 'error');
    });
  });

  describe('showSearchingState', () => {
    it('should display loading spinner with search query', () => {
      selector.showSearchingState('my search');
      expect(selector.dataSourceList.innerHTML).toContain('正在搜尋');
      expect(selector.dataSourceList.innerHTML).toContain('my search');
      expect(selector.dataSourceList.innerHTML).toContain('spinner');
    });

    it('should escape HTML in search query', () => {
      selector.showSearchingState('<script>alert("xss")</script>');
      expect(selector.dataSourceList.innerHTML).not.toContain('<script>');
    });
  });

  describe('restoreInitialDatabases', () => {
    const mockDatabases = [
      { id: '1', object: 'database', title: [{ plain_text: 'Initial DB 1' }] },
      { id: '2', object: 'database', title: [{ plain_text: 'Initial DB 2' }] },
    ];

    it('should restore initial database list after search', () => {
      // 設置初始列表
      selector.populateDataSources(mockDatabases);
      expect(selector.dataSources).toHaveLength(2);
      expect(selector.initialDataSources).toHaveLength(2);

      // 模擬搜尋結果修改了 dataSources
      selector.dataSources = [{ id: '3', title: 'Search Result' }];
      selector.filteredDataSources = [...selector.dataSources];

      // 還原初始列表
      selector.restoreInitialDataSources();

      expect(selector.dataSources).toHaveLength(2);
      expect(selector.filteredDataSources).toHaveLength(2);
      expect(selector.dataSources[0].id).toBe('1');
    });
  });

  describe('handleKeyNavigation', () => {
    const mockDatabases = [
      { id: '1', object: 'database', title: [{ plain_text: 'DB 1' }] },
      { id: '2', object: 'database', title: [{ plain_text: 'DB 2' }] },
      { id: '3', object: 'database', title: [{ plain_text: 'DB 3' }] },
    ];

    beforeEach(() => {
      selector.populateDataSources(mockDatabases);
    });

    it('should open dropdown on ArrowDown when closed', () => {
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      event.preventDefault = jest.fn();
      selector.handleKeyNavigation(event);
      expect(selector.isOpen).toBe(true);
    });

    it('should open dropdown on Enter when closed', () => {
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      event.preventDefault = jest.fn();
      selector.handleKeyNavigation(event);
      expect(selector.isOpen).toBe(true);
    });

    it('should navigate down with ArrowDown when open', () => {
      selector.showDropdown();
      selector.focusedIndex = 0;

      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      event.preventDefault = jest.fn();
      selector.handleKeyNavigation(event);

      expect(selector.focusedIndex).toBe(1);
    });

    it('should not go below last item with ArrowDown', () => {
      selector.showDropdown();
      selector.focusedIndex = 2; // 最後一個

      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      event.preventDefault = jest.fn();
      selector.handleKeyNavigation(event);

      expect(selector.focusedIndex).toBe(2); // 保持不變
    });

    it('should navigate up with ArrowUp when open', () => {
      selector.showDropdown();
      selector.focusedIndex = 1;

      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      event.preventDefault = jest.fn();
      selector.handleKeyNavigation(event);

      expect(selector.focusedIndex).toBe(0);
    });

    it('should not go above -1 with ArrowUp', () => {
      selector.showDropdown();
      selector.focusedIndex = -1;

      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      event.preventDefault = jest.fn();
      selector.handleKeyNavigation(event);

      expect(selector.focusedIndex).toBe(-1);
    });

    it('should select focused item on Enter when open', () => {
      selector.showDropdown();
      selector.focusedIndex = 1;

      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      event.preventDefault = jest.fn();
      selector.handleKeyNavigation(event);

      expect(selector.selectedDataSource.id).toBe('2');
    });

    it('should close dropdown on Escape', () => {
      selector.showDropdown();
      expect(selector.isOpen).toBe(true);

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      event.preventDefault = jest.fn();
      selector.handleKeyNavigation(event);

      expect(selector.isOpen).toBe(false);
    });

    it('should ignore other keys when open', () => {
      selector.showDropdown();
      const initialIndex = selector.focusedIndex;

      const event = new KeyboardEvent('keydown', { key: 'a' });
      event.preventDefault = jest.fn();
      selector.handleKeyNavigation(event);

      expect(selector.focusedIndex).toBe(initialIndex);
    });
  });

  describe('scrollToFocused', () => {
    const mockDatabases = [
      { id: '1', object: 'database', title: [{ plain_text: 'DB 1' }] },
      { id: '2', object: 'database', title: [{ plain_text: 'DB 2' }] },
    ];

    it('should call scrollIntoView on focused element', () => {
      selector.populateDataSources(mockDatabases);
      selector.showDropdown();
      selector.focusedIndex = 0;
      selector.renderDataSourceList();

      // Mock scrollIntoView
      const focusedElement = selector.dataSourceList.querySelector('.keyboard-focus');
      if (focusedElement) {
        focusedElement.scrollIntoView = jest.fn();
        selector.scrollToFocused();
        expect(focusedElement.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
      }
    });

    it('should not error when focusedIndex is -1', () => {
      selector.populateDataSources(mockDatabases);
      selector.focusedIndex = -1;
      expect(() => selector.scrollToFocused()).not.toThrow();
    });
  });

  describe('showLoading', () => {
    it('should display loading spinner', () => {
      selector.showLoading();
      expect(selector.dataSourceList.innerHTML).toContain('重新載入資料來源中');
      expect(selector.dataSourceList.innerHTML).toContain('spinner');
      expect(selector.isOpen).toBe(true);
    });
  });

  describe('createDatabaseItem', () => {
    it('should render page item with page icon', () => {
      const pageDb = {
        id: 'page-1',
        title: 'Test Page',
        type: 'page',
        isWorkspace: false,
        parent: { type: 'page_id' },
      };

      const element = selector.createDataSourceItem(pageDb, 0);
      expect(element.outerHTML).toContain('頁面');
      expect(element.outerHTML).toContain('Test Page');
      // 檢查是否存在 SVG 圖標
      expect(element.querySelector('svg')).toBeTruthy();
    });

    it('should render database item with database icon', () => {
      const db = {
        id: 'db-1',
        title: 'Test Database',
        type: 'data_source',
        isWorkspace: true,
        parent: { type: 'workspace' },
      };

      const element = selector.createDataSourceItem(db, 0);
      expect(element.outerHTML).toContain('資料來源');
      expect(element.outerHTML).toContain('Test Database');
      expect(element.outerHTML).toContain('workspace-badge');
    });

    it('should show workspace badge for workspace pages', () => {
      const containerPage = {
        id: 'container-1',
        title: 'Container Page',
        type: 'page',
        isWorkspace: true,
        parent: { type: 'workspace' },
      };

      const element = selector.createDataSourceItem(containerPage, 0);
      expect(element.outerHTML).toContain('workspace-badge');
      expect(element.outerHTML).toContain('工作區');
    });

    it('should render child page with correct parent info', () => {
      const categoryPage = {
        id: 'category-1',
        title: 'Category Page',
        type: 'page',
        isWorkspace: false,
        parent: { type: 'page_id' },
      };

      const element = selector.createDataSourceItem(categoryPage, 0);
      expect(element.outerHTML).toContain('子頁面');
    });

    it('should show parent path for database_id parent', () => {
      const dbItem = {
        id: 'item-1',
        title: 'DB Item',
        type: 'page',
        parent: { type: 'database_id' },
      };

      const element = selector.createDataSourceItem(dbItem, 0);
      expect(element.outerHTML).toContain('資料庫項目');
    });

    it('should show parent path for block_id parent', () => {
      const blockItem = {
        id: 'block-item-1',
        title: 'Block Item',
        type: 'page',
        parent: { type: 'block_id' },
      };

      const element = selector.createDataSourceItem(blockItem, 0);
      expect(element.outerHTML).toContain('區塊項目');
    });

    it('should show parent path for data_source_id parent', () => {
      const dsItem = {
        id: 'ds-item-1',
        title: 'DS Item',
        type: 'page',
        parent: { type: 'data_source_id' },
      };

      const element = selector.createDataSourceItem(dsItem, 0);
      expect(element.outerHTML).toContain('資料庫項目');
    });

    it('should show unknown parent type with fallback', () => {
      const unknownItem = {
        id: 'unknown-1',
        title: 'Unknown Parent',
        type: 'page',
        parent: { type: 'unknown_type' },
      };

      const element = selector.createDataSourceItem(unknownItem, 0);
      expect(element.textContent).toContain('❓');
      expect(element.outerHTML).toContain('unknown_type');
    });

    it('should highlight search query in title', () => {
      selector.searchInput.value = 'test';
      const db = {
        id: 'db-1',
        title: 'Test Database',
        type: 'database',
        parent: { type: 'workspace' },
      };

      const element = selector.createDataSourceItem(db, 0);
      expect(element.outerHTML).toContain('search-highlight');
      const highlight = element.querySelector('.search-highlight');
      expect(highlight.textContent.toLowerCase()).toBe('test');
    });
  });

  describe('updateDataSourceCount', () => {
    it('should show total count when all items are visible', () => {
      selector.populateDataSources([
        { id: '1', object: 'database', title: [{ plain_text: 'DB 1' }] },
        { id: '2', object: 'database', title: [{ plain_text: 'DB 2' }] },
      ]);

      expect(selector.dataSourceCount.textContent).toContain('2 個保存目標');
    });

    it('should show filtered count when filtering', () => {
      selector.populateDataSources([
        { id: '1', object: 'database', title: [{ plain_text: 'Apple' }] },
        { id: '2', object: 'database', title: [{ plain_text: 'Banana' }] },
      ]);

      selector.filterDataSourcesLocally('app');
      expect(selector.dataSourceCount.textContent).toContain('1 / 2');
    });
  });

  describe('extractDataSourceTitle', () => {
    it('should extract title from page with text content', () => {
      const page = {
        object: 'page',
        properties: {
          title: {
            title: [{ plain_text: '', text: { content: 'Text Content Title' } }],
          },
        },
      };

      const title = SearchableDatabaseSelector.extractDataSourceTitle(page);
      expect(title).toBe('Text Content Title');
    });

    it('should return default title for empty page', () => {
      const page = {
        object: 'page',
        properties: {},
      };

      const title = SearchableDatabaseSelector.extractDataSourceTitle(page);
      expect(title).toBe('未命名頁面');
    });

    it('should return default title for empty database', () => {
      const db = {
        object: 'database',
        properties: {},
      };

      const title = SearchableDatabaseSelector.extractDataSourceTitle(db);
      expect(title).toBe('未命名資料來源');
    });

    it('should extract title from database with text content', () => {
      const db = {
        object: 'database',
        title: [{ plain_text: '', text: { content: 'DB Text Content' } }],
      };

      const title = SearchableDatabaseSelector.extractDataSourceTitle(db);
      expect(title).toBe('DB Text Content');
    });
  });

  describe('populateDataSources with isSearchResult', () => {
    it('should not save to initialDataSources when isSearchResult is true', () => {
      // 首先設置初始列表
      selector.populateDataSources([
        { id: '1', object: 'database', title: [{ plain_text: 'Initial' }] },
      ]);
      expect(selector.initialDataSources).toHaveLength(1);

      // 添加搜尋結果（不應覆蓋初始列表）
      selector.populateDataSources(
        [{ id: '2', object: 'database', title: [{ plain_text: 'Search Result' }] }],
        true
      );

      expect(selector.initialDataSources).toHaveLength(1);
      expect(selector.initialDataSources[0].id).toBe('1');
    });
  });
});
