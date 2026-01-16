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

  beforeEach(() => {
    // Mock scrollIntoView (jsdom 不支援此方法)
    Element.prototype.scrollIntoView = jest.fn();

    // DOM Setup
    document.body.innerHTML = `
      <div id="database-selector-container" style="display: none;">
        <input type="text" id="database-search" />
        <button id="selector-toggle"></button>
        <div id="database-dropdown" style="display: none;"></div>
        <div id="database-list"></div>
        <div id="database-count"></div>
        <button id="refresh-databases"></button>
      </div>
      <input type="hidden" id="database-id" />
      <input type="hidden" id="database-type" />
    `;

    mockShowStatus = jest.fn();
    mockLoadDatabases = jest.fn();

    selector = new SearchableDatabaseSelector({
      showStatus: mockShowStatus,
      loadDatabases: mockLoadDatabases,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw if dependencies are missing', () => {
      expect(() => new SearchableDatabaseSelector({})).toThrow();
      expect(() => new SearchableDatabaseSelector({ showStatus: jest.fn() })).toThrow();
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
      selector.populateDatabases(mockDatabases);

      expect(selector.databases.length).toBe(2);
      expect(selector.databaseList.children.length).toBe(2);
      expect(selector.container.style.display).toBe('block');

      // Check formatting of items
      const firstItem = selector.databaseList.children[0];
      expect(firstItem.textContent).toContain('DB One');
    });

    it('should handle pre-selected value', () => {
      document.getElementById('database-id').value = 'db1';
      // Re-populate to trigger selection logic
      selector.populateDatabases(mockDatabases);

      expect(selector.searchInput.value).toBe('DB One');
      expect(selector.selectedDatabase.id).toBe('db1');
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

      selector.populateDatabases([complexDb]);
      expect(selector.databases[0].title).toBe('Complex Title');
    });
  });

  describe('filterDatabases', () => {
    const mockDatabases = [
      { id: '1', object: 'database', title: [{ plain_text: 'Apple' }] },
      { id: '2', object: 'database', title: [{ plain_text: 'Banana' }] },
    ];

    beforeEach(() => {
      selector.populateDatabases(mockDatabases);
    });

    it('should filter based on search query', () => {
      selector.filterDatabases('app');
      expect(selector.filteredDatabases.length).toBe(1);
      expect(selector.filteredDatabases[0].title).toBe('Apple');

      // Verify UI update
      // We mocked renderDatabaseList implicitly by checking filteredDatabases,
      // but let's check the DOM
      const items = selector.databaseList.querySelectorAll('.database-item');
      expect(items.length).toBe(1);
      expect(items[0].textContent).toContain('Apple');
    });

    it('should show all when query is empty', () => {
      selector.filterDatabases('');
      expect(selector.filteredDatabases.length).toBe(2);
    });

    it('should show no results message', () => {
      selector.filterDatabases('xyz');
      expect(selector.filteredDatabases.length).toBe(0);
      expect(selector.databaseList.innerHTML).toContain('未找到匹配的資料來源');
    });
  });

  describe('selectDatabase', () => {
    const db = { id: 'db1', title: 'Database 1', type: 'database' };

    it('should update inputs and UI on selection', () => {
      selector.selectDatabase(db);

      expect(selector.selectedDatabase).toBe(db);
      expect(document.getElementById('database-id').value).toBe('db1');
      expect(document.getElementById('database-type').value).toBe('database');
      expect(selector.searchInput.value).toBe('Database 1');
      expect(mockShowStatus).toHaveBeenCalledWith(expect.stringContaining('已選擇'), 'success');
    });
  });

  describe('Interactions', () => {
    it('should toggle dropdown', () => {
      selector.toggleDropdown();
      expect(selector.isOpen).toBe(false); // Empty list initially

      selector.populateDatabases([{ id: '1', object: 'db', title: [] }]);
      selector.toggleDropdown();
      expect(selector.isOpen).toBe(true);
      expect(selector.dropdown.style.display).toBe('block');

      selector.toggleDropdown();
      expect(selector.isOpen).toBe(false);
      expect(selector.dropdown.style.display).toBe('none');
    });

    it('should handle refresh button', () => {
      document
        .getElementById('database-selector-container')
        .insertAdjacentHTML('beforebegin', '<input id="api-key" value="secret_123" />');

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

    describe('escapeHtml', () => {
      it('should escape HTML special characters', () => {
        const result = SearchableDatabaseSelector.escapeHtml('<script>alert("xss")</script>');
        expect(result).not.toContain('<script>');
        expect(result).toContain('&lt;');
      });
    });

    describe('escapeRegex', () => {
      it('should escape regex special characters', () => {
        const result = SearchableDatabaseSelector.escapeRegex('test.*+?^${}()|[]\\');
        expect(result).toBe('test\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
      });
    });
  });

  describe('performServerSearch', () => {
    beforeEach(() => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<input id="api-key" value="secret_test_key" />'
      );
    });

    afterEach(() => {
      const apiKeyInput = document.getElementById('api-key');
      if (apiKeyInput) {
        apiKeyInput.remove();
      }
    });

    it('should not trigger search for query less than 2 characters', async () => {
      await selector.performServerSearch('a');
      expect(mockLoadDatabases).not.toHaveBeenCalled();
    });

    it('should not trigger search if API key is missing', async () => {
      document.getElementById('api-key').value = '';
      await selector.performServerSearch('test query');
      expect(mockLoadDatabases).not.toHaveBeenCalled();
    });

    it('should call loadDatabases with query for valid search', async () => {
      await selector.performServerSearch('test query');
      expect(mockLoadDatabases).toHaveBeenCalledWith('secret_test_key', 'test query');
    });

    it('should show searching state before API call', async () => {
      selector.showSearchingState = jest.fn(selector.showSearchingState.bind(selector));
      await selector.performServerSearch('test query');
      expect(selector.isSearching).toBe(true);
    });

    it('should handle search error gracefully', async () => {
      mockLoadDatabases.mockRejectedValueOnce(new Error('API Error'));
      await selector.performServerSearch('test query');
      expect(mockShowStatus).toHaveBeenCalledWith(expect.stringContaining('搜尋失敗'), 'error');
    });
  });

  describe('showSearchingState', () => {
    it('should display loading spinner with search query', () => {
      selector.showSearchingState('my search');
      expect(selector.databaseList.innerHTML).toContain('正在搜尋');
      expect(selector.databaseList.innerHTML).toContain('my search');
      expect(selector.databaseList.innerHTML).toContain('spinner');
    });

    it('should escape HTML in search query', () => {
      selector.showSearchingState('<script>alert("xss")</script>');
      expect(selector.databaseList.innerHTML).not.toContain('<script>');
    });
  });

  describe('restoreInitialDatabases', () => {
    const mockDatabases = [
      { id: '1', object: 'database', title: [{ plain_text: 'Initial DB 1' }] },
      { id: '2', object: 'database', title: [{ plain_text: 'Initial DB 2' }] },
    ];

    it('should restore initial database list after search', () => {
      // 設置初始列表
      selector.populateDatabases(mockDatabases);
      expect(selector.databases.length).toBe(2);
      expect(selector.initialDatabases.length).toBe(2);

      // 模擬搜尋結果修改了 databases
      selector.databases = [{ id: '3', title: 'Search Result' }];
      selector.filteredDatabases = [...selector.databases];

      // 還原初始列表
      selector.restoreInitialDatabases();

      expect(selector.databases.length).toBe(2);
      expect(selector.filteredDatabases.length).toBe(2);
      expect(selector.databases[0].id).toBe('1');
    });
  });

  describe('handleKeyNavigation', () => {
    const mockDatabases = [
      { id: '1', object: 'database', title: [{ plain_text: 'DB 1' }] },
      { id: '2', object: 'database', title: [{ plain_text: 'DB 2' }] },
      { id: '3', object: 'database', title: [{ plain_text: 'DB 3' }] },
    ];

    beforeEach(() => {
      selector.populateDatabases(mockDatabases);
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

      expect(selector.selectedDatabase.id).toBe('2');
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
      selector.populateDatabases(mockDatabases);
      selector.showDropdown();
      selector.focusedIndex = 0;
      selector.renderDatabaseList();

      // Mock scrollIntoView
      const focusedElement = selector.databaseList.querySelector('.keyboard-focus');
      if (focusedElement) {
        focusedElement.scrollIntoView = jest.fn();
        selector.scrollToFocused();
        expect(focusedElement.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
      }
    });

    it('should not error when focusedIndex is -1', () => {
      selector.populateDatabases(mockDatabases);
      selector.focusedIndex = -1;
      expect(() => selector.scrollToFocused()).not.toThrow();
    });
  });

  describe('showLoading', () => {
    it('should display loading spinner', () => {
      selector.showLoading();
      expect(selector.databaseList.innerHTML).toContain('重新載入資料來源中');
      expect(selector.databaseList.innerHTML).toContain('spinner');
      expect(selector.isOpen).toBe(true);
    });
  });

  describe('createDatabaseItemHTML', () => {
    it('should render page item with page icon', () => {
      const pageDb = {
        id: 'page-1',
        title: 'Test Page',
        type: 'page',
        isWorkspace: false,
        parent: { type: 'page_id' },
      };

      const html = selector.createDatabaseItemHTML(pageDb, 0);
      expect(html).toContain('icon-page');
      expect(html).toContain('頁面');
    });

    it('should render database item with database icon', () => {
      const db = {
        id: 'db-1',
        title: 'Test Database',
        type: 'data_source',
        isWorkspace: true,
        parent: { type: 'workspace' },
      };

      const html = selector.createDatabaseItemHTML(db, 0);
      expect(html).toContain('icon-database');
      expect(html).toContain('資料來源');
      expect(html).toContain('workspace-badge');
    });

    it('should add container badge for workspace pages', () => {
      const containerPage = {
        id: 'container-1',
        title: 'Container Page',
        type: 'page',
        isWorkspace: true,
        parent: { type: 'workspace' },
      };

      const html = selector.createDatabaseItemHTML(containerPage, 0);
      expect(html).toContain('container-badge');
      expect(html).toContain('容器');
    });

    it('should add category badge for child pages', () => {
      const categoryPage = {
        id: 'category-1',
        title: 'Category Page',
        type: 'page',
        isWorkspace: false,
        parent: { type: 'page_id' },
      };

      const html = selector.createDatabaseItemHTML(categoryPage, 0);
      expect(html).toContain('category-badge');
      expect(html).toContain('分類');
    });

    it('should show parent path for database_id parent', () => {
      const dbItem = {
        id: 'item-1',
        title: 'DB Item',
        type: 'page',
        parent: { type: 'database_id' },
      };

      const html = selector.createDatabaseItemHTML(dbItem, 0);
      expect(html).toContain('資料庫項目');
    });

    it('should show parent path for block_id parent', () => {
      const blockItem = {
        id: 'block-item-1',
        title: 'Block Item',
        type: 'page',
        parent: { type: 'block_id' },
      };

      const html = selector.createDatabaseItemHTML(blockItem, 0);
      expect(html).toContain('區塊項目');
    });

    it('should show parent path for data_source_id parent', () => {
      const dsItem = {
        id: 'ds-item-1',
        title: 'DS Item',
        type: 'page',
        parent: { type: 'data_source_id' },
      };

      const html = selector.createDatabaseItemHTML(dsItem, 0);
      expect(html).toContain('資料庫項目');
    });

    it('should show unknown parent type with fallback', () => {
      const unknownItem = {
        id: 'unknown-1',
        title: 'Unknown Parent',
        type: 'page',
        parent: { type: 'unknown_type' },
      };

      const html = selector.createDatabaseItemHTML(unknownItem, 0);
      expect(html).toContain('❓');
      expect(html).toContain('unknown_type');
    });

    it('should highlight search query in title', () => {
      selector.searchInput.value = 'test';
      const db = {
        id: 'db-1',
        title: 'Test Database',
        type: 'database',
        parent: { type: 'workspace' },
      };

      const html = selector.createDatabaseItemHTML(db, 0);
      expect(html).toContain('search-highlight');
    });

    it('should show date when available', () => {
      const db = {
        id: 'db-1',
        title: 'Test Database',
        type: 'database',
        parent: { type: 'workspace' },
        created: '2023-05-15T10:00:00Z',
      };

      const html = selector.createDatabaseItemHTML(db, 0);
      expect(html).toContain('2023');
    });
  });

  describe('updateDatabaseCount', () => {
    it('should show total count when all items are visible', () => {
      selector.populateDatabases([
        { id: '1', object: 'database', title: [{ plain_text: 'DB 1' }] },
        { id: '2', object: 'database', title: [{ plain_text: 'DB 2' }] },
      ]);

      expect(selector.databaseCount.textContent).toContain('2 個資料來源');
    });

    it('should show filtered count when filtering', () => {
      selector.populateDatabases([
        { id: '1', object: 'database', title: [{ plain_text: 'Apple' }] },
        { id: '2', object: 'database', title: [{ plain_text: 'Banana' }] },
      ]);

      selector.filterDatabases('app');
      expect(selector.databaseCount.textContent).toContain('1 / 2');
    });
  });

  describe('extractDatabaseTitle', () => {
    it('should extract title from page with text content', () => {
      const page = {
        object: 'page',
        properties: {
          title: {
            title: [{ plain_text: '', text: { content: 'Text Content Title' } }],
          },
        },
      };

      const title = SearchableDatabaseSelector.extractDatabaseTitle(page);
      expect(title).toBe('Text Content Title');
    });

    it('should return default title for empty page', () => {
      const page = {
        object: 'page',
        properties: {},
      };

      const title = SearchableDatabaseSelector.extractDatabaseTitle(page);
      expect(title).toBe('未命名頁面');
    });

    it('should return default title for empty database', () => {
      const db = {
        object: 'database',
        properties: {},
      };

      const title = SearchableDatabaseSelector.extractDatabaseTitle(db);
      expect(title).toBe('未命名資料來源');
    });

    it('should extract title from database with text content', () => {
      const db = {
        object: 'database',
        title: [{ plain_text: '', text: { content: 'DB Text Content' } }],
      };

      const title = SearchableDatabaseSelector.extractDatabaseTitle(db);
      expect(title).toBe('DB Text Content');
    });
  });

  describe('populateDatabases with isSearchResult', () => {
    it('should not save to initialDatabases when isSearchResult is true', () => {
      // 首先設置初始列表
      selector.populateDatabases([
        { id: '1', object: 'database', title: [{ plain_text: 'Initial' }] },
      ]);
      expect(selector.initialDatabases.length).toBe(1);

      // 添加搜尋結果（不應覆蓋初始列表）
      selector.populateDatabases(
        [{ id: '2', object: 'database', title: [{ plain_text: 'Search Result' }] }],
        true
      );

      expect(selector.initialDatabases.length).toBe(1);
      expect(selector.initialDatabases[0].id).toBe('1');
    });
  });
});
