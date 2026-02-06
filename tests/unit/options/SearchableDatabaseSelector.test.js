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

import Logger from '../../../scripts/utils/Logger';

describe('SearchableDatabaseSelector', () => {
  let selector = null;
  let mockShowStatus = null;
  let mockLoadDataSources = null;
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
    mockLoadDataSources = jest.fn();
    mockGetApiKey = jest.fn(() => 'mock_api_key');

    selector = new SearchableDatabaseSelector({
      showStatus: mockShowStatus,
      loadDataSources: mockLoadDataSources,
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

  describe('populateDataSources', () => {
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
      expect(mockLoadDataSources).toHaveBeenCalledWith('secret_123');
    });
  });

  describe('Static Helpers', () => {
    describe('formatDate', () => {
      it('should return empty string for invalid date', () => {
        const result = SearchableDatabaseSelector.formatDate('invalid-date-string');
        expect(result).toBe('');
      });

      it('should format valid date', () => {
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
      expect(mockLoadDataSources).not.toHaveBeenCalled();
    });

    it('should not trigger search if API key is missing', async () => {
      mockGetApiKey.mockReturnValue('');
      await selector.performServerSearch('test query');
      expect(mockLoadDataSources).not.toHaveBeenCalled();
    });

    it('should call loadDataSources with query for valid search', async () => {
      await selector.performServerSearch('test query');
      expect(mockLoadDataSources).toHaveBeenCalledWith('secret_test_key', 'test query');
    });

    it('should show searching state before API call', async () => {
      const showSearchingStateSpy = jest.spyOn(selector, 'showSearchingState');
      await selector.performServerSearch('test query');

      expect(showSearchingStateSpy).toHaveBeenCalledWith('test query');
      expect(selector.isSearching).toBe(false);

      showSearchingStateSpy.mockRestore();
    });

    it('should handle search error gracefully', async () => {
      mockLoadDataSources.mockRejectedValueOnce(new Error('API Error'));
      await selector.performServerSearch('test query');
      expect(mockShowStatus).toHaveBeenCalledWith(expect.stringContaining('搜尋失敗'), 'error');
      expect(selector.isSearching).toBe(false);
    });

    it('should handle error without message property', async () => {
      mockLoadDataSources.mockRejectedValueOnce({});
      await selector.performServerSearch('test query');
      expect(mockShowStatus).toHaveBeenCalledWith('搜尋失敗: 發生未知錯誤，請稍後再試', 'error');
    });
  });

  describe('showSearchingState', () => {
    it('should display loading spinner with search query', () => {
      selector.showSearchingState('my search');
      expect(selector.dataSourceList.innerHTML).toContain('正在搜尋');
      expect(selector.dataSourceList.innerHTML).toContain('my search');
      expect(selector.dataSourceList.innerHTML).toContain('spinner');
    });

    it('should handle special characters in search query', () => {
      selector.showSearchingState('<script>alert("xss")</script>');
      // DOM textContent automatically handles escaping
      expect(selector.dataSourceList.textContent).toContain('<script>');
    });
  });

  describe('restoreInitialDataSources', () => {
    const mockDatabases = [
      { id: '1', object: 'database', title: [{ plain_text: 'Initial DB 1' }] },
      { id: '2', object: 'database', title: [{ plain_text: 'Initial DB 2' }] },
    ];

    it('should restore initial database list after search', () => {
      selector.populateDataSources(mockDatabases);
      expect(selector.initialDataSources).toHaveLength(2);

      selector.dataSources = [{ id: '3', title: 'Search Result' }];
      selector.filteredDataSources = [...selector.dataSources];

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

    it('should navigate up with ArrowUp when open', () => {
      selector.showDropdown();
      selector.focusedIndex = 1;

      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      event.preventDefault = jest.fn();
      selector.handleKeyNavigation(event);

      expect(selector.focusedIndex).toBe(0);
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
  });

  describe('Edge Cases & UI Logic', () => {
    it('initializeElements 應該在找不到容器時記錄錯誤 (Line 64)', () => {
      document.body.innerHTML = ''; // 清空 DOM
      const selector = new SearchableDatabaseSelector({
        showStatus: mockShowStatus,
        loadDataSources: mockLoadDataSources,
        getApiKey: mockGetApiKey,
      });
      expect(selector).toBeDefined();
      expect(Logger.error).toHaveBeenCalledWith(
        expect.stringContaining('找不到 #database-selector-container')
      );
    });

    it('_handleSearchInput 應該處理空查詢並還原初始列表 (Line 76-80)', () => {
      selector.populateDataSources([
        { id: '1', object: 'database', title: [{ plain_text: 'DB 1' }] },
      ]);
      selector.dataSources = [{ id: '2', title: 'Search Result' }]; // 模擬搜尋狀態

      const event = { target: { value: '' } };
      selector._handleSearchInput(event);

      expect(selector.dataSources).toHaveLength(1);
      expect(selector.isOpen).toBe(true);
    });

    it('performServerSearch 應該在 API Key 缺失時記錄警告 (Line 204)', async () => {
      mockGetApiKey.mockReturnValue(null);
      await selector.performServerSearch('query');
      expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('缺少 API Key'));
    });

    it('_createHighlightedText 應該處理 regex 拋出的錯誤 (Line 410)', () => {
      const fragment = SearchableDatabaseSelector._createHighlightedText('text', '[');
      expect(fragment.textContent).toBe('text');
    });

    it('destroy 應該移除元件監聽器 (Line 592-611)', () => {
      const searchInput = selector.searchInput;
      const removeEventListenerSpy = jest.spyOn(searchInput, 'removeEventListener');
      const documentRemoveSpy = jest.spyOn(document, 'removeEventListener');

      selector.destroy();

      expect(removeEventListenerSpy).toHaveBeenCalled();
      expect(documentRemoveSpy).toHaveBeenCalledWith('click', expect.any(Function));
      expect(selector.searchTimeout).toBeNull();
    });
  });
});
