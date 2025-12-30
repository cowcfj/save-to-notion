/**
 * @jest-environment jsdom
 */

import { HighlightMigration } from '../../../../scripts/highlighter/core/HighlightMigration.js';

// Mock dependencies
jest.mock('../../../../scripts/highlighter/core/Range.js', () => ({
  serializeRange: jest.fn(() => ({
    startPath: 'mock',
    startOffset: 0,
    endPath: 'mock',
    endOffset: 5,
  })),
}));

jest.mock('../../../../scripts/highlighter/utils/textSearch.js', () => ({
  findTextInPage: jest.fn(),
}));

jest.mock('../../../../scripts/utils/Logger.js', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
}));

describe('core/HighlightMigration', () => {
  let migration;
  let mockManager;

  beforeEach(() => {
    // 創建 mock manager
    mockManager = {
      nextId: 1,
    };

    migration = new HighlightMigration(mockManager);

    // 清理 localStorage
    localStorage.clear();

    // Mock window objects
    window.normalizeUrl = jest.fn(url => url);
    window.StorageUtil = {
      saveHighlights: jest.fn().mockResolvedValue(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('constructor', () => {
    test('should store manager reference', () => {
      expect(migration.manager).toBe(mockManager);
    });
  });

  describe('convertBgColorToName', () => {
    test('should convert hex colors', () => {
      expect(HighlightMigration.convertBgColorToName('#fff3cd')).toBe('yellow');
      expect(HighlightMigration.convertBgColorToName('#d4edda')).toBe('green');
      expect(HighlightMigration.convertBgColorToName('#cce7ff')).toBe('blue');
      expect(HighlightMigration.convertBgColorToName('#f8d7da')).toBe('red');
    });

    test('should convert rgb colors', () => {
      expect(HighlightMigration.convertBgColorToName('rgb(255, 243, 205)')).toBe('yellow');
      expect(HighlightMigration.convertBgColorToName('rgb(212, 237, 218)')).toBe('green');
      expect(HighlightMigration.convertBgColorToName('rgb(204, 231, 255)')).toBe('blue');
      expect(HighlightMigration.convertBgColorToName('rgb(248, 215, 218)')).toBe('red');
    });

    test('should return default for unknown color', () => {
      expect(HighlightMigration.convertBgColorToName('#unknown')).toBe('yellow');
      expect(HighlightMigration.convertBgColorToName('rgb(0, 0, 0)')).toBe('yellow');
    });
  });

  describe('checkAndMigrate', () => {
    test('should skip when normalizeUrl is not available', async () => {
      delete window.normalizeUrl;

      await migration.checkAndMigrate();

      // Should not throw
    });

    test('should skip when no legacy data exists', async () => {
      window.chrome = {
        runtime: { id: 'test-id' },
        storage: {
          local: {
            get: jest.fn().mockResolvedValue({}),
            set: jest.fn().mockResolvedValue({}),
          },
        },
      };

      await migration.checkAndMigrate();

      // Should not call StorageUtil.saveHighlights
      expect(window.StorageUtil.saveHighlights).not.toHaveBeenCalled();
    });

    test('should find legacy data with possible keys', async () => {
      const legacyData = [{ text: 'test', color: 'yellow' }];
      localStorage.setItem('highlights_http://localhost/', JSON.stringify(legacyData));

      window.chrome = {
        runtime: { id: 'test-id' },
        storage: {
          local: {
            get: jest.fn().mockResolvedValue({}),
            set: jest.fn().mockResolvedValue({}),
          },
        },
      };

      const { findTextInPage } = require('../../../../scripts/highlighter/utils/textSearch.js');
      findTextInPage.mockReturnValue(document.createRange());

      await migration.checkAndMigrate();

      expect(window.StorageUtil.saveHighlights).toHaveBeenCalled();
    });
  });

  describe('migrateToNewFormat', () => {
    beforeEach(() => {
      window.chrome = {
        runtime: { id: 'test-id' },
        storage: {
          local: {
            get: jest.fn().mockResolvedValue({}),
            set: jest.fn().mockResolvedValue({}),
          },
        },
      };
    });

    test('should migrate object items with text property', async () => {
      const { findTextInPage } = require('../../../../scripts/highlighter/utils/textSearch.js');
      findTextInPage.mockReturnValue(document.createRange());

      const legacyData = [{ text: 'test content', color: 'green' }];

      await migration.migrateToNewFormat(legacyData, 'old_key');

      expect(findTextInPage).toHaveBeenCalledWith('test content');
      expect(window.StorageUtil.saveHighlights).toHaveBeenCalled();
    });

    test('should migrate string items', async () => {
      const { findTextInPage } = require('../../../../scripts/highlighter/utils/textSearch.js');
      findTextInPage.mockReturnValue(document.createRange());

      const legacyData = ['simple text'];

      await migration.migrateToNewFormat(legacyData, 'old_key');

      expect(findTextInPage).toHaveBeenCalledWith('simple text');
    });

    test('should convert bgColor to color name', async () => {
      const { findTextInPage } = require('../../../../scripts/highlighter/utils/textSearch.js');
      findTextInPage.mockReturnValue(document.createRange());

      const legacyData = [{ text: 'test', bgColor: '#d4edda' }];

      await migration.migrateToNewFormat(legacyData, 'old_key');

      // 驗證調用時的顏色應該是 green
      const saveCall = window.StorageUtil.saveHighlights.mock.calls[0][1];
      expect(saveCall.highlights[0].color).toBe('green');
    });

    test('should skip empty text items', async () => {
      const { findTextInPage } = require('../../../../scripts/highlighter/utils/textSearch.js');

      const legacyData = [{ text: '' }, { text: '   ' }];

      await migration.migrateToNewFormat(legacyData, 'old_key');

      expect(findTextInPage).not.toHaveBeenCalled();
    });

    test('should handle failed text search gracefully', async () => {
      const { findTextInPage } = require('../../../../scripts/highlighter/utils/textSearch.js');
      findTextInPage.mockReturnValue(null); // Text not found

      const legacyData = [{ text: 'not found' }];

      await migration.migrateToNewFormat(legacyData, 'old_key');

      expect(window.StorageUtil.saveHighlights).not.toHaveBeenCalled();
    });

    test('should remove old key after successful migration', async () => {
      const { findTextInPage } = require('../../../../scripts/highlighter/utils/textSearch.js');
      findTextInPage.mockReturnValue(document.createRange());

      localStorage.setItem('old_key', JSON.stringify([{ text: 'test' }]));

      const legacyData = [{ text: 'test' }];

      await migration.migrateToNewFormat(legacyData, 'old_key');

      expect(localStorage.getItem('old_key')).toBeNull();
    });

    test('should increment nextId for each migrated item', async () => {
      const { findTextInPage } = require('../../../../scripts/highlighter/utils/textSearch.js');
      findTextInPage.mockReturnValue(document.createRange());

      mockManager.nextId = 5;
      const legacyData = [{ text: 'one' }, { text: 'two' }];

      await migration.migrateToNewFormat(legacyData, 'old_key');

      expect(mockManager.nextId).toBe(7);
    });
  });
});
