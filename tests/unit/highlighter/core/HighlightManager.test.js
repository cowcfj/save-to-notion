/**
 * @jest-environment jsdom
 */

import { HighlightManager } from '../../../../scripts/highlighter/core/HighlightManager.js';
import Logger from '../../../../scripts/utils/Logger.js';
// Mock dependencies
jest.mock('../../../../scripts/highlighter/utils/dom.js', () => ({
  supportsHighlightAPI: jest.fn(() => true),
}));

jest.mock('../../../../scripts/utils/Logger.js', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../../../scripts/highlighter/core/Range.js', () => ({
  serializeRange: jest.fn(),
  deserializeRange: jest.fn(),
  findRangeByTextContent: jest.fn(),
}));

describe('core/HighlightManager', () => {
  let manager;
  let mockStyleManager;
  let mockStorage;
  let mockInteraction;
  let mockMigration;

  beforeEach(() => {
    document.body.innerHTML = '';

    // Mock sub-modules
    mockStyleManager = {
      initialize: jest.fn(),
      injectStyles: jest.fn(),
      updateMode: jest.fn(),
      getHighlightObject: jest.fn().mockReturnValue({
        add: jest.fn(),
        delete: jest.fn(),
        clear: jest.fn(),
      }),
      clearAllHighlights: jest.fn(),
      cleanup: jest.fn(),
    };

    mockStorage = {
      save: jest.fn(),
      restore: jest.fn(),
      collectForNotion: jest.fn().mockReturnValue([]),
    };

    mockInteraction = {
      handleClick: jest.fn(),
      getHighlightAtPoint: jest.fn(),
    };

    mockMigration = {
      checkAndMigrate: jest.fn(),
      migrateToNewFormat: jest.fn(),
    };

    manager = new HighlightManager();
    manager.setDependencies({
      styleManager: mockStyleManager,
      storage: mockStorage,
      interaction: mockInteraction,
      migration: mockMigration,
    });
  });

  afterEach(() => {
    if (manager) {
      manager.cleanup();
    }
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    test('should create manager with default values', () => {
      expect(manager.currentColor).toBe('yellow');
      expect(manager.nextId).toBe(1);
      expect(manager.highlights.size).toBe(0);
    });

    test('should accept custom default color', () => {
      const customManager = new HighlightManager({ defaultColor: 'blue' });
      expect(customManager.currentColor).toBe('blue');
    });

    test('should initialize sub-modules', async () => {
      await manager.initialize();

      expect(mockStyleManager.initialize).toHaveBeenCalled();
      expect(mockMigration.checkAndMigrate).toHaveBeenCalled();
      expect(mockStorage.restore).toHaveBeenCalled();
    });

    test('should skip restore when initialized with skipRestore', async () => {
      await manager.initialize(true);

      expect(mockStorage.restore).not.toHaveBeenCalled();
    });
  });

  describe('addHighlight', () => {
    test('should add a highlight with valid range', () => {
      const div = document.createElement('div');
      div.textContent = 'Hello World';
      document.body.appendChild(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 5);

      const id = manager.addHighlight(range, 'yellow');

      expect(id).not.toBe(null);
      expect(id).toMatch(/^h\d+$/);
      expect(manager.highlights.size).toBe(1);

      // Verify style delegation
      expect(mockStyleManager.getHighlightObject).toHaveBeenCalledWith('yellow');
      const highlightObj = mockStyleManager.getHighlightObject('yellow');
      expect(highlightObj.add).toHaveBeenCalledWith(range);
    });

    test('should return null for collapsed range', () => {
      const div = document.createElement('div');
      div.textContent = 'Test';
      document.body.appendChild(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 0);

      const id = manager.addHighlight(range);
      expect(id).toBe(null);
    });

    test('should return null for empty or whitespace-only range', () => {
      const div = document.createElement('div');
      div.textContent = '   ';
      document.body.appendChild(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 3);

      const id = manager.addHighlight(range);
      expect(id).toBe(null);
    });

    test('should fallback to currentColor when styleManager returns no style', () => {
      // 設置 styleManager 返回 undefined（模擬無效顏色）
      mockStyleManager.getHighlightObject.mockReturnValueOnce(undefined);

      const div = document.createElement('div');
      div.textContent = 'Test text';
      document.body.appendChild(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 4);

      const id = manager.addHighlight(range, 'invalid-color');

      expect(id).not.toBeNull();
      // 驗證使用回退顏色存儲
      const highlight = manager.highlights.get(id);
      expect(highlight.color).toBe('yellow'); // currentColor 預設值
      // 驗證警告被記錄
      expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid color'));
    });
  });

  describe('removeHighlight', () => {
    test('should remove existing highlight', () => {
      const div = document.createElement('div');
      div.textContent = 'Test';
      document.body.appendChild(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 4);

      const id = manager.addHighlight(range);
      expect(manager.highlights.size).toBe(1);

      const removed = manager.removeHighlight(id);
      expect(removed).toBe(true);
      expect(manager.highlights.size).toBe(0);

      // Verify delegation
      expect(mockStyleManager.getHighlightObject).toHaveBeenCalled();
      expect(mockStorage.save).toHaveBeenCalled();
    });

    test('should return false for non-existent highlight', () => {
      const removed = manager.removeHighlight('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('clearAll', () => {
    test('should clear all highlights', () => {
      const div = document.createElement('div');
      div.textContent = 'Test';
      document.body.appendChild(div);
      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 3);

      manager.addHighlight(range);
      expect(manager.highlights.size).toBe(1);

      manager.clearAll();

      expect(manager.highlights.size).toBe(0);
      expect(mockStyleManager.clearAllHighlights).toHaveBeenCalled();
      expect(mockStorage.save).toHaveBeenCalled();
    });
  });

  describe('Delegation Tests', () => {
    test('handleDocumentClick should delegate to interaction', () => {
      const event = {};
      mockInteraction.handleClick.mockReturnValue(true);

      const result = manager.handleDocumentClick(event);

      expect(mockInteraction.handleClick).toHaveBeenCalledWith(event);
      expect(result).toBe(true);
    });

    test('getHighlightAtPoint should delegate to interaction', () => {
      mockInteraction.getHighlightAtPoint.mockReturnValue('h1');

      const result = manager.getHighlightAtPoint(100, 100);

      expect(mockInteraction.getHighlightAtPoint).toHaveBeenCalledWith(100, 100);
      expect(result).toBe('h1');
    });

    test('saveToStorage should delegate to storage', async () => {
      await manager.saveToStorage();
      expect(mockStorage.save).toHaveBeenCalled();
    });

    test('restoreHighlights should delegate to storage', async () => {
      await manager.restoreHighlights();
      expect(mockStorage.restore).toHaveBeenCalled();
    });

    test('collectHighlightsForNotion should delegate to storage', () => {
      const mockResult = [{ text: 'test' }];
      mockStorage.collectForNotion.mockReturnValue(mockResult);

      const result = manager.collectHighlightsForNotion();

      expect(mockStorage.collectForNotion).toHaveBeenCalled();
      expect(result).toBe(mockResult);
    });

    test('updateStyleMode should delegate to styleManager', () => {
      manager.updateStyleMode('text');
      expect(mockStyleManager.updateMode).toHaveBeenCalledWith('text');
    });
  });

  describe('Static Methods', () => {
    test('should handle rangesOverlap safely with invalid input', () => {
      // 異常路徑：空物件觸發 catch → false
      expect(HighlightManager.rangesOverlap({}, {})).toBe(false);
    });

    test('should detect overlapping ranges correctly', () => {
      // 建立真實 DOM 結構
      const div = document.createElement('div');
      div.textContent = 'Hello World Test';
      document.body.appendChild(div);

      const textNode = div.firstChild;

      // Range 1: "Hello"（0-5）
      const range1 = document.createRange();
      range1.setStart(textNode, 0);
      range1.setEnd(textNode, 5);

      // Range 2: "lo Wo"（3-8）— 與 Range 1 重疊
      const range2 = document.createRange();
      range2.setStart(textNode, 3);
      range2.setEnd(textNode, 8);

      expect(HighlightManager.rangesOverlap(range1, range2)).toBe(true);

      // 清理
      document.body.removeChild(div);
    });

    test('should detect non-overlapping ranges correctly', () => {
      const div = document.createElement('div');
      div.textContent = 'Hello World Test';
      document.body.appendChild(div);

      const textNode = div.firstChild;

      // Range 1: "Hello"（0-5）
      const range1 = document.createRange();
      range1.setStart(textNode, 0);
      range1.setEnd(textNode, 5);

      // Range 2: "Test"（12-16）— 與 Range 1 不重疊
      const range2 = document.createRange();
      range2.setStart(textNode, 12);
      range2.setEnd(textNode, 16);

      expect(HighlightManager.rangesOverlap(range1, range2)).toBe(false);

      // 清理
      document.body.removeChild(div);
    });
  });

  describe('Dependency Injection Errors', () => {
    let emptyManager;

    beforeEach(() => {
      emptyManager = new HighlightManager();
      // Not calling setDependencies
    });

    afterEach(() => {
      emptyManager.cleanup();
      jest.clearAllMocks();
    });

    test('initialize should handle missing dependencies safely', async () => {
      await emptyManager.initialize();
      // Should not throw
      expect(true).toBe(true);
    });

    test('handleDocumentClick should return false and warn when interaction missing', () => {
      const result = emptyManager.handleDocumentClick({});
      expect(result).toBe(false);
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('handleDocumentClick called but interaction not injected')
      );
    });

    test('getHighlightAtPoint should return null and warn when interaction missing', () => {
      const result = emptyManager.getHighlightAtPoint(0, 0);
      expect(result).toBe(null);
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('getHighlightAtPoint called but interaction not injected')
      );
    });

    test('applyHighlightAPI should return false and warn when styleManager missing', () => {
      const range = document.createRange();
      const result = emptyManager.applyHighlightAPI(range, 'yellow');
      expect(result).toBe(false);
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('applyHighlightAPI called but styleManager not injected')
      );
    });

    test('collectHighlightsForNotion should return empty array and warn when storage missing', () => {
      const result = emptyManager.collectHighlightsForNotion();
      expect(result).toEqual([]);
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('collectHighlightsForNotion called but storage not injected')
      );
    });
  });

  describe('restoreLocalHighlight', () => {
    test('should restore highlight from valid item', () => {
      const item = {
        id: 'h1',
        text: 'test',
        color: 'yellow',
        rangeInfo: { startContainer: [], endContainer: [] }, // simplified mock
      };

      // Mock deserializeRange
      const mockRange = document.createRange();
      require('../../../../scripts/highlighter/core/Range.js').deserializeRange.mockReturnValue(
        mockRange
      );

      const result = manager.restoreLocalHighlight(item);

      expect(result).toBe(true);
      expect(manager.highlights.size).toBe(1);
      expect(mockStyleManager.getHighlightObject).toHaveBeenCalledWith('yellow');
    });

    test('should return false if range creation fails', () => {
      const item = { id: 'h1', text: 'test' };
      require('../../../../scripts/highlighter/core/Range.js').deserializeRange.mockReturnValue(
        null
      );
      require('../../../../scripts/highlighter/core/Range.js').findRangeByTextContent.mockReturnValue(
        null
      );

      const result = manager.restoreLocalHighlight(item);
      expect(result).toBe(false);
    });
  });
});
