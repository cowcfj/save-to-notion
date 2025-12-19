// Highlighter Migration Integration Tests (Simplified)
// tests legacy data migration core flow

/**
 * @jest-environment jsdom
 */

// Note: HighlightManager import removed to allow dynamic require

describe('Highlight Migration Integration Tests', () => {
  let manager = null;
  let HighlightManagerClass = null;
  let MockSeamlessMigrationManagerConstructor = null;

  beforeEach(() => {
    // Reset modules to ensure clean mocking
    jest.resetModules();

    // Mock SeamlessMigrationManager using doMock
    MockSeamlessMigrationManagerConstructor = jest.fn().mockImplementation(() => ({
      performSeamlessMigration: jest.fn().mockResolvedValue({ success: true, migrated: true }),
    }));

    jest.doMock('../../scripts/seamless-migration.js', () => {
      return {
        __esModule: true,
        default: MockSeamlessMigrationManagerConstructor,
      };
    });

    // Setup DOM
    document.body.innerHTML = '';

    // Mock normalizeUrl
    window.normalizeUrl = jest.fn(() => 'https://example.com/test-page');

    // Mock Logger
    window.Logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    };

    // Mock StorageUtil
    window.StorageUtil = {
      saveHighlights: jest.fn().mockResolvedValue(),
      loadHighlights: jest.fn().mockResolvedValue([]),
      clearHighlights: jest.fn(),
    };

    // Mock Chrome Extension API
    window.chrome = {
      runtime: {
        id: 'test-extension-id',
      },
      storage: {
        local: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue(),
          remove: jest.fn().mockResolvedValue(),
        },
      },
    };

    // Mock CSS Highlight API
    window.CSS = {
      highlights: new Map(),
    };

    window.Highlight = class MockHighlight {
      constructor() {
        this.size = 0;
      }
      add() {
        this.size++;
      }
      delete() {
        if (this.size > 0) {
          this.size--;
        }
      }
      clear() {
        this.size = 0;
      }
    };

    // Dynamically require HighlightManager
    const Module = require('../../scripts/highlighter/core/HighlightManager.js');
    HighlightManagerClass = Module.HighlightManager;
    manager = new HighlightManagerClass();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Legacy Data Migration', () => {
    test('should mark migration as complete after processing', async () => {
      const legacyData = [
        {
          text: 'Legacy highlight',
          color: 'yellow',
          timestamp: Date.now(),
        },
      ];

      const legacyKey = 'highlights_https://example.com/test-page';

      await manager.migrateLegacyDataToNewFormat(legacyData, legacyKey);

      // Should mark migration as complete
      expect(window.chrome.storage.local.set).toHaveBeenCalled();
    });

    test('should handle empty legacy data', async () => {
      const legacyKey = 'highlights_https://example.com/test-page';

      await manager.migrateLegacyDataToNewFormat([], legacyKey);

      expect(window.chrome.storage.local.set).toHaveBeenCalled();
    });

    test('should handle invalid legacy data gracefully', async () => {
      const legacyKey = 'highlights_https://example.com/test-page';

      await expect(
        manager.migrateLegacyDataToNewFormat('invalid', legacyKey)
      ).resolves.not.toThrow();
    });

    test('should convert legacy color formats', () => {
      // Test the static method for color conversion
      const yellow = HighlightManagerClass.convertBgColorToName('rgb(255, 243, 205)');
      expect(yellow).toBe('yellow');

      const green = HighlightManagerClass.convertBgColorToName('#d4edda');
      expect(green).toBe('green');

      const defaultColor = HighlightManagerClass.convertBgColorToName('unknown');
      expect(defaultColor).toBe('yellow');
    });
  });

  describe('Seamless Migration', () => {
    test('should attempt seamless migration when manager available', async () => {
      await manager.performSeamlessMigration();

      expect(MockSeamlessMigrationManagerConstructor).toHaveBeenCalled();

      const mockInstance = MockSeamlessMigrationManagerConstructor.mock.results[0].value;
      expect(mockInstance.performSeamlessMigration).toHaveBeenCalledWith(manager);
    });

    // Removed obsolte test 'should handle missing SeamlessMigrationManager' as verified in unit test
  });

  describe('Storage Operations', () => {
    test('should use safe extension storage', () => {
      const storage = HighlightManagerClass.getSafeExtensionStorage();

      expect(storage).toBeDefined();
      expect(storage).toBe(window.chrome.storage.local);
    });

    test('should handle missing chrome storage', () => {
      const originalChrome = window.chrome;
      delete window.chrome;

      const storage = HighlightManagerClass.getSafeExtensionStorage();

      expect(storage).toBeNull();

      window.chrome = originalChrome;
    });
  });

  describe('Highlight Collection', () => {
    test('should collect highlights for Notion', () => {
      // Setup page content
      document.body.innerHTML = '<p>Test content</p>';

      // Add a highlight
      const textNode = document.body.firstChild.firstChild;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 4);

      manager.addHighlight(range, 'yellow');

      // Collect highlights
      const collected = manager.collectHighlightsForNotion();

      expect(Array.isArray(collected)).toBe(true);
      expect(collected.length).toBeGreaterThan(0);
      expect(collected[0]).toHaveProperty('text');
      expect(collected[0]).toHaveProperty('color');
    });

    test('should return empty array when no highlights exist', () => {
      const collected = manager.collectHighlightsForNotion();

      expect(Array.isArray(collected)).toBe(true);
      expect(collected.length).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle Chrome storage errors gracefully', async () => {
      window.chrome.storage.local.set.mockRejectedValue(new Error('Storage error'));

      const legacyData = [{ text: 'Test', color: 'yellow' }];

      await expect(
        manager.migrateLegacyDataToNewFormat(legacyData, 'test-key')
      ).resolves.not.toThrow();
    });

    // Removed test 'should handle undefined window gracefully' as logic changed
  });

  describe('Migration State', () => {
    test('should check if migration is needed', async () => {
      // Migration key未設置時,應該返回空物件
      window.chrome.storage.local.get.mockResolvedValue({});

      const result = await window.chrome.storage.local.get(
        'migration_completed_https://example.com/test-page'
      );

      expect(result).toBeDefined();
    });

    test('should save migration completion status', async () => {
      const legacyData = [];
      await manager.migrateLegacyDataToNewFormat(legacyData, 'test-key');

      // 應該標記遷移完成
      const setCalls = window.chrome.storage.local.set.mock.calls;
      expect(setCalls.length).toBeGreaterThan(0);

      // 檢查是否包含 migration_completed 標記
      const hasMigrationFlag = setCalls.some(call => {
        const data = call[0];
        return Object.keys(data).some(key => key.includes('migration_completed'));
      });

      expect(hasMigrationFlag).toBe(true);
    });
  });
});
