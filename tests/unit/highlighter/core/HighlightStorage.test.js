/**
 * @jest-environment jsdom
 */

import {
  HighlightStorage,
  RestoreManager,
} from '../../../../scripts/highlighter/core/HighlightStorage.js';

jest.mock('../../../../scripts/utils/Logger.js', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
}));

describe('core/HighlightStorage', () => {
  let storage = null;
  let mockManager = null;
  let mockToolbar = null;

  beforeEach(() => {
    jest.useFakeTimers();

    // 創建 mock manager
    mockManager = {
      highlights: new Map(),
      forceRestoreHighlights: jest.fn().mockResolvedValue(true),
    };

    // 創建 mock toolbar
    mockToolbar = {
      hide: jest.fn(),
    };

    storage = new HighlightStorage(mockManager, mockToolbar);

    // Mock window objects
    window.normalizeUrl = jest.fn(url => url);
    window.StorageUtil = {
      saveHighlights: jest.fn().mockResolvedValue(),
      clearHighlights: jest.fn().mockResolvedValue(),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should store manager and toolbar references', () => {
      expect(storage.manager).toBe(mockManager);
      expect(storage.toolbar).toBe(mockToolbar);
    });

    test('should initialize with default values', () => {
      expect(storage.HIDE_TOOLBAR_DELAY_MS).toBe(500);
      expect(storage.isRestored).toBe(false);
    });
  });

  describe('save', () => {
    test('should save highlights to StorageUtil', async () => {
      mockManager.highlights.set('h1', {
        id: 'h1',
        color: 'yellow',
        text: 'Test',
        timestamp: 12345,
        rangeInfo: { startPath: 'mock' },
      });

      await storage.save();

      expect(window.StorageUtil.saveHighlights).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          highlights: expect.arrayContaining([expect.objectContaining({ id: 'h1', text: 'Test' })]),
        })
      );
    });

    test('should clear highlights when empty', async () => {
      // 空的 highlights Map
      await storage.save();

      expect(window.StorageUtil.clearHighlights).toHaveBeenCalled();
    });

    test('should skip when StorageUtil is not available', async () => {
      delete window.StorageUtil;

      await storage.save();

      // 不應該拋出錯誤
    });

    test('should handle save errors gracefully', async () => {
      mockManager.highlights.set('h1', { id: 'h1', text: 'Test' });
      window.StorageUtil.saveHighlights.mockRejectedValue(new Error('Save failed'));

      await storage.save();

      // 不應該拋出錯誤
    });
  });

  describe('restore', () => {
    test('should call forceRestoreHighlights on manager', async () => {
      await storage.restore();

      expect(mockManager.forceRestoreHighlights).toHaveBeenCalled();
    });

    test('should return true on successful restore', async () => {
      const result = await storage.restore();

      expect(result).toBe(true);
      expect(storage.isRestored).toBe(true);
    });

    test('should return false when manager is null', async () => {
      storage.manager = null;

      const result = await storage.restore();

      expect(result).toBe(false);
    });

    test('should return false when forceRestoreHighlights is not available', async () => {
      delete mockManager.forceRestoreHighlights;

      const result = await storage.restore();

      expect(result).toBe(false);
    });

    test('should return false when restore fails', async () => {
      mockManager.forceRestoreHighlights.mockResolvedValue(false);

      const result = await storage.restore();

      expect(result).toBe(false);
    });

    test('should handle restore errors gracefully', async () => {
      mockManager.forceRestoreHighlights.mockRejectedValue(new Error('Restore failed'));

      const result = await storage.restore();

      expect(result).toBe(false);
    });
  });

  describe('collectForNotion', () => {
    test('should collect highlight data for Notion', () => {
      mockManager.highlights.set('h1', {
        id: 'h1',
        text: 'Test text',
        color: 'yellow',
        timestamp: 12345,
        range: {},
      });
      mockManager.highlights.set('h2', {
        id: 'h2',
        text: 'Another',
        color: 'green',
        timestamp: 12346,
        range: {},
      });

      const collected = storage.collectForNotion();

      expect(collected).toHaveLength(2);
      expect(collected[0]).toEqual({
        text: 'Test text',
        color: 'yellow',
        timestamp: 12345,
      });
      expect(collected[1]).toEqual({
        text: 'Another',
        color: 'green',
        timestamp: 12346,
      });
    });

    test('should return empty array when no highlights', () => {
      const collected = storage.collectForNotion();

      expect(collected).toEqual([]);
    });
  });

  describe('hideToolbarAfterRestore', () => {
    test('should hide toolbar after delay', () => {
      storage.hideToolbarAfterRestore();

      expect(mockToolbar.hide).not.toHaveBeenCalled();

      jest.advanceTimersByTime(500);

      expect(mockToolbar.hide).toHaveBeenCalled();
    });

    test('should not throw when toolbar is null', () => {
      storage.toolbar = null;

      expect(() => storage.hideToolbarAfterRestore()).not.toThrow();
    });

    test('should handle hide errors gracefully', () => {
      mockToolbar.hide.mockImplementation(() => {
        throw new Error('Hide failed');
      });

      storage.hideToolbarAfterRestore();
      jest.advanceTimersByTime(500);

      // 不應該拋出錯誤
    });
  });

  describe('hasRestored', () => {
    test('should return restore status', () => {
      expect(storage.hasRestored()).toBe(false);

      storage.isRestored = true;

      expect(storage.hasRestored()).toBe(true);
    });
  });

  describe('RestoreManager alias', () => {
    test('should export RestoreManager as alias', () => {
      expect(RestoreManager).toBe(HighlightStorage);
    });
  });
});
