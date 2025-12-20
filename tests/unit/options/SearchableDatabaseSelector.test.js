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
  let selector;
  let mockShowStatus;
  let mockLoadDatabases;

  beforeEach(() => {
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
});
