/**
 * @jest-environment jsdom
 */

import Logger from '../../../../scripts/utils/Logger.js';
import {
  HighlightStorage,
  RestoreManager,
} from '../../../../scripts/highlighter/core/HighlightStorage.js';
import { StorageUtil } from '../../../../scripts/highlighter/utils/StorageUtil.js';

jest.mock('../../../../scripts/highlighter/utils/StorageUtil.js', () => ({
  StorageUtil: {
    saveHighlights: jest.fn(),
    loadHighlights: jest.fn(),
    clearHighlights: jest.fn(),
  },
}));

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
      restoreLocalHighlight: jest.fn(),
      clearAll: jest.fn(),
    };

    // 創建 mock toolbar
    mockToolbar = {
      hide: jest.fn(),
    };

    storage = new HighlightStorage(mockManager, mockToolbar);

    // Mock window objects
    globalThis.normalizeUrl = jest.fn(url => url);

    // Reset mocks
    StorageUtil.saveHighlights.mockResolvedValue();
    StorageUtil.clearHighlights.mockResolvedValue();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    delete globalThis.__NOTION_STABLE_URL__;
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
        timestamp: 12_345,
        rangeInfo: { startPath: 'mock' },
      });

      await storage.save();

      expect(StorageUtil.saveHighlights).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          highlights: expect.arrayContaining([expect.objectContaining({ id: 'h1', text: 'Test' })]),
        })
      );
    });

    test('should clear highlights when empty', async () => {
      // 空的 highlights Map
      await storage.save();

      expect(StorageUtil.clearHighlights).toHaveBeenCalled();
    });

    test('should handle save errors gracefully', async () => {
      mockManager.highlights.set('h1', { id: 'h1', text: 'Test' });
      StorageUtil.saveHighlights.mockRejectedValue(new Error('Save failed'));

      await storage.save();

      // Ensure error is logged
      expect(Logger.error).toHaveBeenCalledWith(
        '[HighlightStorage] 保存標註失敗:',
        expect.any(Error)
      );
    });

    test('should use global stable URL if available', async () => {
      globalThis.__NOTION_STABLE_URL__ = 'https://stable.url';
      mockManager.highlights.set('h1', { id: 'h1', text: 'Test' });

      await storage.save();

      expect(StorageUtil.saveHighlights).toHaveBeenCalledWith(
        'https://stable.url',
        expect.anything()
      );

      delete globalThis.__NOTION_STABLE_URL__;
    });
  });

  describe('restore', () => {
    test('should load highlights from StorageUtil and restore them', async () => {
      const mockData = [
        { id: 'h1', text: 'test1', color: 'yellow' },
        { id: 'h2', text: 'test2', color: 'green' },
      ];
      StorageUtil.loadHighlights.mockResolvedValue(mockData);
      mockManager.restoreLocalHighlight = jest.fn().mockReturnValue(true);
      mockManager.clearAll = jest.fn();

      const result = await storage.restore();

      expect(StorageUtil.loadHighlights).toHaveBeenCalled();
      expect(mockManager.clearAll).toHaveBeenCalledWith({ skipStorage: true });
      expect(mockManager.restoreLocalHighlight).toHaveBeenCalledTimes(2);
      expect(result).toBe(true);
      expect(storage.isRestored).toBe(true);
    });

    test('should return false when no highlights found', async () => {
      StorageUtil.loadHighlights.mockResolvedValue([]);

      const result = await storage.restore();

      expect(result).toBe(false);
      expect(mockManager.restoreLocalHighlight).not.toHaveBeenCalled();
    });

    test('should return false when manager is null', async () => {
      storage.manager = null;
      const result = await storage.restore();
      expect(result).toBe(false);
    });

    test('should handle restore errors gracefully', async () => {
      StorageUtil.loadHighlights.mockRejectedValue(new Error('Load failed'));
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
        timestamp: 12_345,
        range: {},
      });
      mockManager.highlights.set('h2', {
        id: 'h2',
        text: 'Another',
        color: 'green',
        timestamp: 12_346,
        range: {},
      });

      const collected = storage.collectForNotion();

      expect(collected).toHaveLength(2);
      expect(collected[0]).toEqual({
        text: 'Test text',
        color: 'yellow',
        timestamp: 12_345,
      });
      expect(collected[1]).toEqual({
        text: 'Another',
        color: 'green',
        timestamp: 12_346,
      });
    });

    test('should return empty array when no highlights', () => {
      const collected = storage.collectForNotion();

      expect(collected).toEqual([]);
    });

    test('should return empty array if manager or highlights missing', () => {
      // Test missing manager
      const storageNoManager = new HighlightStorage();
      expect(storageNoManager.collectForNotion()).toEqual([]);

      // Test missing highlights
      storage.manager.highlights = null;
      expect(storage.collectForNotion()).toEqual([]);

      // Test invalid highlights (not iterable)
      storage.manager.highlights = {};
      expect(storage.collectForNotion()).toEqual([]);
    });

    test('should map highlights correctly and exclude extra properties', () => {
      const mockHighlight = { text: 't', color: 'c', timestamp: 123, other: 'ignored' };
      mockManager.highlights.set('h1', mockHighlight);

      const result = storage.collectForNotion();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        text: 't',
        color: 'c',
        timestamp: 123,
      });
      // Verify 'other' property is not included
      expect(result[0]).not.toHaveProperty('other');
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

      // Ensure error is logged
      expect(Logger.error).toHaveBeenCalledWith(
        expect.stringContaining('隱藏工具欄時出錯'),
        expect.any(Error)
      );
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
