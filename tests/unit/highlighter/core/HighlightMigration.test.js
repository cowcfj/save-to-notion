/**
 * @jest-environment jsdom
 */

import { HighlightMigration } from '../../../../scripts/highlighter/core/HighlightMigration.js';
import Logger from '../../../../scripts/utils/Logger.js';
import { StorageUtil } from '../../../../scripts/highlighter/utils/StorageUtil.js';

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
  debug: jest.fn(),
}));

jest.mock('../../../../scripts/highlighter/utils/StorageUtil.js', () => ({
  StorageUtil: {
    saveHighlights: jest.fn(),
    clearHighlights: jest.fn(),
  },
}));

describe('core/HighlightMigration', () => {
  let migration = null;
  let mockManager = null;

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
    // Reset mocks
    StorageUtil.saveHighlights.mockResolvedValue();
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

  describe('checkAndMigrate', () => {
    test('should skip when normalizeUrl is not available', async () => {
      delete window.normalizeUrl;

      await migration.checkAndMigrate();

      await migration.checkAndMigrate();

      // Should verify calling checkAndMigrate without normalizeUrl is safe
      // and doesn't proceed with migration logic (e.g. accessing storage)
      expect(window.chrome.storage.local.get).not.toHaveBeenCalled();
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
      expect(StorageUtil.saveHighlights).not.toHaveBeenCalled();
    });

    test('should skip migration if already completed', async () => {
      // Setup legacy data (which would normally trigger migration)
      const legacyData = [{ text: 'test', color: 'yellow' }];
      localStorage.setItem('highlights_http://localhost/', JSON.stringify(legacyData));

      // Setup window.chrome with migration flag set to true
      window.chrome = {
        runtime: { id: 'test-id' },
        storage: {
          local: {
            get: jest.fn().mockResolvedValue({
              'migration_completed_http://localhost/': true,
            }),
            set: jest.fn().mockResolvedValue({}),
          },
        },
      };

      await migration.checkAndMigrate();

      // Should verify access but NOT save (skip migration)
      expect(window.chrome.storage.local.get).toHaveBeenCalledWith(
        'migration_completed_http://localhost/'
      );
      expect(StorageUtil.saveHighlights).not.toHaveBeenCalled();
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

      expect(StorageUtil.saveHighlights).toHaveBeenCalled();
    });

    test('should limit localStorage scan and warn when exceeding limit', async () => {
      // Modify limit for testing
      const originalLimit = HighlightMigration.MAX_SCAN_LIMIT;
      HighlightMigration.MAX_SCAN_LIMIT = 5;

      localStorage.clear();

      // Add items exceeding limit
      for (let i = 0; i < 10; i++) {
        localStorage.setItem(`dummy_${i}`, '{}');
      }

      // Verify setup
      expect(localStorage.length).toBe(10);

      await migration.checkAndMigrate();

      expect(Logger.warn).toHaveBeenCalledWith(
        'localStorage 項目超過掃描限制，僅掃描部分項目',
        expect.objectContaining({ action: 'checkAndMigrate' })
      );

      // Restore limit
      HighlightMigration.MAX_SCAN_LIMIT = originalLimit;
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
      expect(StorageUtil.saveHighlights).toHaveBeenCalled();
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
      const saveCall = StorageUtil.saveHighlights.mock.calls[0][1];
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

      expect(StorageUtil.saveHighlights).not.toHaveBeenCalled();
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
