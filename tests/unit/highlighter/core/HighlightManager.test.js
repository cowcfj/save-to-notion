/**
 * @jest-environment jsdom
 */

import { HighlightManager } from '../../../../scripts/highlighter/core/HighlightManager.js';
import Logger from '../../../../scripts/utils/Logger.js';
import { restoreRangeWithRetry } from '../../../../scripts/highlighter/core/Range.js';
// Mock dependencies
jest.mock('../../../../scripts/highlighter/utils/dom.js', () => ({
  supportsHighlightAPI: jest.fn(() => true),
}));

jest.mock('../../../../scripts/utils/Logger.js', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
    debug: jest.fn(),
    success: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
  };
  return {
    __esModule: true,
    default: mockLogger,
    ...mockLogger,
  };
});

jest.mock('../../../../scripts/highlighter/core/Range.js', () => ({
  serializeRange: jest.fn(),
  restoreRangeWithRetry: jest.fn(),
}));

describe('core/HighlightManager', () => {
  let manager = null;
  let mockStyleManager = null;
  let mockStorage = null;
  let mockInteraction = null;
  let mockMigration = null;

  function createTextRange(text, start = 0, end = text.length) {
    const div = document.createElement('div');
    div.textContent = text;
    document.body.append(div);

    const range = document.createRange();
    range.setStart(div.firstChild, start);
    range.setEnd(div.firstChild, end);
    return range;
  }

  function withChromeApi(chromeApi, assertion) {
    const originalChrome = globalThis.chrome;
    globalThis.chrome = chromeApi;

    try {
      return assertion();
    } finally {
      globalThis.chrome = originalChrome;
    }
  }

  function createRestoreItem(overrides = {}) {
    return {
      id: 'h1',
      text: 'test',
      color: 'yellow',
      rangeInfo: { startContainer: [], endContainer: [] },
      ...overrides,
    };
  }

  function mockRestoredRange() {
    const range = document.createRange();
    jest.mocked(restoreRangeWithRetry).mockResolvedValue(range);
    return range;
  }

  function createOwnedExtensionHost(id, ownerDatasetKey) {
    const host = document.createElement('div');
    host.id = id;
    host.dataset[ownerDatasetKey] = 'true';
    document.body.append(host);
    return host;
  }

  function createComposedPathEvent(...elements) {
    return { composedPath: () => elements };
  }

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
    test('should return null when range is missing', () => {
      expect(manager.addHighlight(null)).toBeNull();
      expect(manager.highlights.size).toBe(0);
    });

    test('should add a highlight with valid range', () => {
      const div = document.createElement('div');
      div.textContent = 'Hello World';
      document.body.append(div);

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
      document.body.append(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 0);

      const id = manager.addHighlight(range);
      expect(id).toBe(null);
    });

    test('should return null for empty or whitespace-only range', () => {
      const div = document.createElement('div');
      div.textContent = '   ';
      document.body.append(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 3);

      const id = manager.addHighlight(range);
      expect(id).toBe(null);
    });

    test('should fallback to currentColor when styleManager returns no style', () => {
      // 設置 styleManager 返回 undefined（模擬無效顏色）
      mockStyleManager.getHighlightObject.mockReturnValueOnce();

      const div = document.createElement('div');
      div.textContent = 'Test text';
      document.body.append(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 4);

      const id = manager.addHighlight(range, 'invalid-color');

      expect(id).not.toBeNull();
      // 驗證使用回退顏色存儲
      const highlight = manager.highlights.get(id);
      expect(highlight.color).toBe('yellow'); // currentColor 預設值
      // 驗證警告被記錄
      expect(Logger.warn).toHaveBeenCalledWith(
        '顏色無效，回退到預設顏色',
        expect.objectContaining({ action: 'addHighlight' })
      );
    });

    test('should not advance nextId or keep stale entry when highlight addition returns false', () => {
      jest.spyOn(manager, 'applyHighlightAPI').mockReturnValue(false);

      const div = document.createElement('div');
      div.textContent = 'Retry Test';
      document.body.append(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 5);

      const initialId = manager.nextId;

      // 第一次嘗試添加，失敗
      const id1 = manager.addHighlight(range, 'yellow');
      expect(id1).toBeNull();

      expect(manager.highlights.size).toBe(0);
      expect(manager.nextId).toBe(initialId);

      manager.applyHighlightAPI.mockRestore();
      mockStyleManager.getHighlightObject.mockReturnValue({ add: jest.fn() });

      const id2 = manager.addHighlight(range, 'yellow');
      expect(id2).toBe(`h${initialId}`);
      expect(manager.nextId).toBe(initialId + 1);
    });

    test('should not advance nextId or keep stale entry when applyHighlightAPI throws', () => {
      jest.spyOn(manager, 'applyHighlightAPI').mockImplementation(() => {
        throw new Error('styleManager failure');
      });

      const range = createTextRange('Throw Test');
      const initialId = manager.nextId;

      const id = manager.addHighlight(range, 'yellow');

      expect(id).toBeNull();
      expect(manager.highlights.size).toBe(0);
      expect(manager.nextId).toBe(initialId);
      expect(Logger.error).toHaveBeenCalledWith(
        '添加標註失敗',
        expect.objectContaining({ action: 'addHighlight' })
      );

      manager.applyHighlightAPI.mockRestore();
    });

    test('should not create highlight when styleManager is missing', () => {
      const noStyleManager = new HighlightManager();
      const range = createTextRange('Missing style manager');
      const initialId = noStyleManager.nextId;

      const id = noStyleManager.addHighlight(range, 'yellow');

      expect(id).toBeNull();
      expect(noStyleManager.highlights.size).toBe(0);
      expect(noStyleManager.nextId).toBe(initialId);

      noStyleManager.cleanup();
    });

    test.each([
      ['empty color', '', 'blue'],
      ['non-string color', { name: 'yellow' }, 'blue'],
      ['string color', 'green', 'green'],
    ])('should resolve %s without styleManager', (_caseName, requestedColor, expectedColor) => {
      const noStyleManager = new HighlightManager({ defaultColor: 'blue' });
      jest.spyOn(noStyleManager, 'applyHighlightAPI').mockReturnValue(true);

      const id = noStyleManager.addHighlight(createTextRange('No style manager'), requestedColor);

      expect(id).toBe('h1');
      expect(noStyleManager.highlights.get(id)?.color).toBe(expectedColor);

      noStyleManager.cleanup();
      noStyleManager.applyHighlightAPI.mockRestore();
    });
  });

  describe('rail highlight interaction', () => {
    test('startHighlighting should update color when already active', () => {
      manager.startHighlighting('yellow');
      const initialHandler = manager.selectionHandler;

      manager.startHighlighting('blue');

      expect(manager.currentColor).toBe('blue');
      expect(manager.selectionHandler).toBe(initialHandler);
    });

    test('selection mouseup guard should ignore events when inactive', () => {
      expect(manager._shouldIgnoreSelectionMouseUp({ composedPath: () => [] })).toBe(true);
    });

    test('[REGRESSION] startHighlighting 應從目前 selection 建立標註並清除選取', () => {
      jest.useFakeTimers();
      try {
        const div = document.createElement('div');
        div.textContent = 'Hello World';
        document.body.append(div);

        const range = document.createRange();
        range.setStart(div.firstChild, 0);
        range.setEnd(div.firstChild, 5);

        const removeAllRanges = jest.fn();
        jest.spyOn(globalThis, 'getSelection').mockReturnValue({
          isCollapsed: false,
          toString: () => 'Hello',
          getRangeAt: () => range,
          removeAllRanges,
        });

        manager.startHighlighting('green');
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        jest.advanceTimersByTime(20);

        expect(manager.currentColor).toBe('green');
        expect(manager.highlights.size).toBe(1);
        expect(mockStyleManager.getHighlightObject).toHaveBeenCalledWith('green');
        expect(mockStorage.save).toHaveBeenCalled();
        expect(removeAllRanges).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    test('[REGRESSION] startHighlighting 應使用 mouseup 當下的 range snapshot', () => {
      jest.useFakeTimers();
      try {
        const div = document.createElement('div');
        div.textContent = 'Hello World';
        document.body.append(div);

        const range = document.createRange();
        range.setStart(div.firstChild, 0);
        range.setEnd(div.firstChild, 5);

        const removeAllRanges = jest.fn();
        const activeSelection = {
          isCollapsed: false,
          toString: () => 'Hello',
          getRangeAt: () => range,
          removeAllRanges,
        };
        const collapsedSelection = {
          isCollapsed: true,
          toString: () => '',
          getRangeAt: jest.fn(() => {
            throw new Error('Selection was cleared');
          }),
          removeAllRanges: jest.fn(),
        };
        let currentSelection = activeSelection;
        jest.spyOn(globalThis, 'getSelection').mockImplementation(() => currentSelection);

        manager.startHighlighting('green');
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        currentSelection = collapsedSelection;
        jest.advanceTimersByTime(20);

        expect(manager.highlights.size).toBe(1);
        const highlight = [...manager.highlights.values()][0];
        expect(highlight.text).toBe('Hello');
        expect(mockStyleManager.getHighlightObject).toHaveBeenCalledWith('green');
        expect(mockStorage.save).toHaveBeenCalled();
        expect(removeAllRanges).toHaveBeenCalled();
        expect(collapsedSelection.getRangeAt).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    test('[REGRESSION] stopHighlighting 後不再處理 selection mouseup', () => {
      jest.useFakeTimers();
      try {
        const div = document.createElement('div');
        div.textContent = 'Hello World';
        document.body.append(div);

        const range = document.createRange();
        range.setStart(div.firstChild, 0);
        range.setEnd(div.firstChild, 5);

        jest.spyOn(globalThis, 'getSelection').mockReturnValue({
          isCollapsed: false,
          toString: () => 'Hello',
          getRangeAt: () => range,
          removeAllRanges: jest.fn(),
        });

        manager.startHighlighting('yellow');
        manager.stopHighlighting();
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        jest.advanceTimersByTime(20);

        expect(manager.highlights.size).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    });

    test('startHighlighting 應忽略 extension UI mouseup 且不讀取 selection', () => {
      const getSelection = jest.spyOn(globalThis, 'getSelection').mockReturnValue({
        isCollapsed: false,
        toString: () => 'Ignored',
        getRangeAt: jest.fn(),
        removeAllRanges: jest.fn(),
      });
      const host = document.createElement('div');
      host.id = 'notion-floating-rail-host';
      host.dataset.railOwner = 'true';
      document.body.append(host);

      const event = new MouseEvent('mouseup', { bubbles: true });
      Object.defineProperty(event, 'composedPath', {
        value: () => [host],
      });

      manager.startHighlighting('yellow');
      document.dispatchEvent(event);

      expect(getSelection).not.toHaveBeenCalled();
      expect(manager.highlights.size).toBe(0);

      getSelection.mockRestore();
    });

    test('startHighlighting 應忽略缺少、collapsed 或空白 selection', () => {
      const addHighlight = jest.spyOn(manager, 'addHighlight');
      const getSelection = jest.spyOn(globalThis, 'getSelection');

      for (const selection of [
        null,
        {
          isCollapsed: true,
          toString: () => 'Ignored',
          getRangeAt: jest.fn(),
          removeAllRanges: jest.fn(),
        },
        {
          isCollapsed: false,
          toString: () => '   ',
          getRangeAt: jest.fn(),
          removeAllRanges: jest.fn(),
        },
      ]) {
        getSelection.mockReturnValue(selection);
        manager.startHighlighting('yellow');
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        manager.stopHighlighting();
      }

      expect(addHighlight).not.toHaveBeenCalled();

      getSelection.mockRestore();
      addHighlight.mockRestore();
    });

    test('startHighlighting 應在 selection range 複製失敗時記錄錯誤並忽略', () => {
      const getSelection = jest.spyOn(globalThis, 'getSelection').mockReturnValue({
        isCollapsed: false,
        toString: () => 'Broken selection',
        getRangeAt: jest.fn(() => {
          throw new Error('range unavailable');
        }),
        removeAllRanges: jest.fn(),
      });

      manager.startHighlighting('yellow');
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      expect(manager.highlights.size).toBe(0);
      expect(Logger.error).toHaveBeenCalledWith(
        '添加標註失敗',
        expect.objectContaining({ action: 'railSelectionHandler' })
      );

      getSelection.mockRestore();
    });

    test('startHighlighting 應在 addHighlight 拋錯時記錄錯誤並保留 selection', () => {
      const removeAllRanges = jest.fn();
      const range = createTextRange('Add failure');
      const getSelection = jest.spyOn(globalThis, 'getSelection').mockReturnValue({
        isCollapsed: false,
        toString: () => 'Add failure',
        getRangeAt: () => range,
        removeAllRanges,
      });
      jest.spyOn(manager, 'addHighlight').mockImplementation(() => {
        throw new Error('add failed');
      });

      manager.startHighlighting('yellow');
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      expect(removeAllRanges).not.toHaveBeenCalled();
      expect(Logger.error).toHaveBeenCalledWith(
        '添加標註失敗',
        expect.objectContaining({ action: 'railSelectionHandler' })
      );

      getSelection.mockRestore();
      manager.addHighlight.mockRestore();
    });

    test('setHighlightColor 應更新目前標註顏色', () => {
      manager.setHighlightColor('blue');

      expect(manager.currentColor).toBe('blue');
    });
  });

  describe('removeHighlight', () => {
    test('should remove existing highlight', () => {
      const div = document.createElement('div');
      div.textContent = 'Test';
      document.body.append(div);

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
      document.body.append(div);
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
      document.body.append(div);

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
      div.remove();
    });

    test('should treat touching boundaries as non-overlapping', () => {
      const div = document.createElement('div');
      div.textContent = 'Boundary Touch Test';
      document.body.append(div);

      const textNode = div.firstChild;

      const range1 = document.createRange();
      range1.setStart(textNode, 0);
      range1.setEnd(textNode, 5);

      const range2 = document.createRange();
      range2.setStart(textNode, 5);
      range2.setEnd(textNode, 10);

      expect(HighlightManager.rangesOverlap(range1, range2)).toBe(false);

      div.remove();
    });

    test('should return symmetric result when range order is swapped', () => {
      const div = document.createElement('div');
      div.textContent = 'Symmetric Overlap Test';
      document.body.append(div);

      const textNode = div.firstChild;

      const firstRange = document.createRange();
      firstRange.setStart(textNode, 2);
      firstRange.setEnd(textNode, 9);

      const secondRange = document.createRange();
      secondRange.setStart(textNode, 6);
      secondRange.setEnd(textNode, 12);

      const forward = HighlightManager.rangesOverlap(firstRange, secondRange);
      const reverse = HighlightManager.rangesOverlap(secondRange, firstRange);

      expect(forward).toBe(true);
      expect(reverse).toBe(true);
      expect(forward).toBe(reverse);

      div.remove();
    });

    test('should detect non-overlapping ranges correctly', () => {
      const div = document.createElement('div');
      div.textContent = 'Hello World Test';
      document.body.append(div);

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
      div.remove();
    });

    test('getSafeExtensionStorage should return null outside extension runtime', () => {
      withChromeApi(undefined, () => {
        expect(HighlightManager.getSafeExtensionStorage()).toBeNull();
      });
    });

    test.each([
      ['runtime', { storage: { local: { get: jest.fn() } } }],
      ['storage', { runtime: { id: 'extension-id' } }],
    ])(
      'getSafeExtensionStorage should return null when chrome.%s is missing',
      (_field, chromeApi) => {
        withChromeApi(chromeApi, () => {
          expect(HighlightManager.getSafeExtensionStorage()).toBeNull();
        });
      }
    );

    test.each([
      ['missing runtime.id', { runtime: {}, storage: { local: { get: jest.fn() } } }],
      ['empty runtime.id', { runtime: { id: '' }, storage: { local: { get: jest.fn() } } }],
    ])('getSafeExtensionStorage should return null when %s', (_caseName, chromeApi) => {
      withChromeApi(chromeApi, () => {
        expect(HighlightManager.getSafeExtensionStorage()).toBeNull();
      });
    });

    test('getSafeExtensionStorage should return chrome.storage.local inside extension runtime', () => {
      const localStorageArea = { get: jest.fn() };
      withChromeApi(
        {
          runtime: { id: 'extension-id' },
          storage: { local: localStorageArea },
        },
        () => {
          expect(HighlightManager.getSafeExtensionStorage()).toBe(localStorageArea);
        }
      );
    });
  });

  describe('Dependency Injection Errors', () => {
    let emptyManager = null;

    beforeEach(() => {
      emptyManager = new HighlightManager();
      // Not calling setDependencies
    });

    afterEach(() => {
      emptyManager.cleanup();
      jest.clearAllMocks();
    });

    test('initialize should log error and abort when dependencies missing', async () => {
      await emptyManager.initialize();

      // Should catch the error internally and log it
      expect(Logger.error).toHaveBeenCalledWith(
        '初始化失敗',
        expect.objectContaining({ action: 'initialize' })
      );
    });

    test('handleDocumentClick should throw error when interaction missing', () => {
      expect(() => {
        emptyManager.handleDocumentClick({});
      }).toThrow('handleDocumentClick called but interaction not injected');
    });

    test('getHighlightAtPoint should throw error when interaction missing', () => {
      expect(() => {
        emptyManager.getHighlightAtPoint(0, 0);
      }).toThrow('getHighlightAtPoint called but interaction not injected');
    });

    test('applyHighlightAPI should throw error when styleManager missing', () => {
      const range = document.createRange();
      expect(() => {
        emptyManager.applyHighlightAPI(range, 'yellow');
      }).toThrow('applyHighlightAPI called but styleManager not injected');
    });

    test('collectHighlightsForNotion should throw error when storage missing', () => {
      expect(() => {
        emptyManager.collectHighlightsForNotion();
      }).toThrow('collectHighlightsForNotion called but storage not injected');
    });

    test('updateStyleMode should throw error when styleManager missing', () => {
      expect(() => {
        emptyManager.updateStyleMode('text');
      }).toThrow('updateStyleMode called but styleManager not injected');
    });

    test('saveToStorage should throw error when storage missing', async () => {
      await expect(emptyManager.saveToStorage()).rejects.toThrow(
        'saveToStorage called but storage not injected'
      );
    });

    test('restoreHighlights should throw error when storage missing', async () => {
      await expect(emptyManager.restoreHighlights()).rejects.toThrow(
        'restoreHighlights called but storage not injected'
      );
    });

    test('injectHighlightStyles should throw error when styleManager missing', () => {
      expect(() => {
        emptyManager.injectHighlightStyles();
      }).toThrow('injectHighlightStyles called but styleManager not injected');
    });

    test('initializeHighlightStyles should throw error when styleManager missing', () => {
      expect(() => {
        emptyManager.initializeHighlightStyles();
      }).toThrow('initializeHighlightStyles called but styleManager not injected');
    });
  });

  describe('restoreLocalHighlight', () => {
    test('should restore highlight from valid item', async () => {
      const item = createRestoreItem();
      mockRestoredRange();

      const result = await manager.restoreLocalHighlight(item);

      expect(result).toBe(true);
      expect(restoreRangeWithRetry).toHaveBeenCalledWith(item.rangeInfo, item.text);
      expect(manager.highlights.size).toBe(1);
      expect(mockStyleManager.getHighlightObject).toHaveBeenCalledWith('yellow');
    });

    test('should auto-generate ID when item.id is undefined', async () => {
      const item = createRestoreItem({
        id: undefined,
        text: 'auto-id test',
        color: 'blue',
      });
      mockRestoredRange();

      const initialNextId = manager.nextId;
      const result = await manager.restoreLocalHighlight(item);

      expect(result).toBe(true);
      expect(manager.highlights.size).toBe(1);
      expect(manager.highlights.has(`h${initialNextId}`)).toBe(true);
      expect(manager.nextId).toBe(initialNextId + 1);
      expect(mockStyleManager.getHighlightObject).toHaveBeenCalledWith('blue');
    });

    test('should return false if range creation fails', async () => {
      const item = createRestoreItem();
      jest.mocked(restoreRangeWithRetry).mockResolvedValue(null);

      const result = await manager.restoreLocalHighlight(item);
      expect(result).toBe(false);
    });

    test('should rollback highlight when applyHighlightAPI returns false', async () => {
      const item = createRestoreItem({
        id: 'h5',
        text: 'rollback test',
        color: 'invalid-color',
      });
      mockRestoredRange();
      jest.spyOn(manager, 'applyHighlightAPI').mockReturnValue(false);

      const result = await manager.restoreLocalHighlight(item);

      expect(result).toBe(false);
      expect(manager.highlights.size).toBe(0);

      manager.applyHighlightAPI.mockRestore();
    });

    test('should retry with fallback color when original color cannot be applied', async () => {
      const item = createRestoreItem({
        id: 'h8',
        text: 'fallback test',
        color: 'blue',
      });
      mockRestoredRange();

      jest
        .spyOn(manager, 'applyHighlightAPI')
        .mockImplementationOnce(() => false)
        .mockImplementationOnce(() => true);

      const result = await manager.restoreLocalHighlight(item);

      expect(result).toBe(true);
      expect(manager.highlights.get('h8')?.color).toBe('yellow');

      manager.applyHighlightAPI.mockRestore();
    });

    test('should rebuild style objects and retry when initial attempts fail', async () => {
      const item = createRestoreItem({
        id: 'h9',
        text: 'rebuild style test',
        color: 'blue',
      });
      mockRestoredRange();

      jest
        .spyOn(manager, 'applyHighlightAPI')
        .mockImplementationOnce(() => false)
        .mockImplementationOnce(() => false)
        .mockImplementationOnce(() => true);

      const result = await manager.restoreLocalHighlight(item);

      expect(result).toBe(true);
      expect(mockStyleManager.initialize).toHaveBeenCalled();

      manager.applyHighlightAPI.mockRestore();
    });

    test('should cleanup stale entry when applyHighlightAPI throws', async () => {
      const item = createRestoreItem({
        id: 'h7',
        text: 'throw test',
        color: 'yellow',
      });
      mockRestoredRange();
      jest.spyOn(manager, 'applyHighlightAPI').mockImplementation(() => {
        throw new Error('styleManager failure');
      });

      const result = await manager.restoreLocalHighlight(item);

      expect(result).toBe(false);
      expect(manager.highlights.size).toBe(0);

      manager.applyHighlightAPI.mockRestore();
    });

    test('should cancel restore when styles cannot be reinitialized', async () => {
      const item = createRestoreItem({
        id: 'h10',
        text: 'no reinitialize test',
        color: 'blue',
      });
      mockRestoredRange();
      mockStyleManager.initialize = undefined;
      jest.spyOn(manager, 'applyHighlightAPI').mockReturnValue(false);

      const result = await manager.restoreLocalHighlight(item);

      expect(result).toBe(false);
      expect(manager.highlights.has('h10')).toBe(false);

      manager.applyHighlightAPI.mockRestore();
    });

    test('should cleanup restored entry when restore flow throws after ID resolution', async () => {
      const item = createRestoreItem({
        id: 'h11',
        text: 'cleanup throw test',
        color: 'yellow',
      });
      mockRestoredRange();
      jest.spyOn(manager, '_applyHighlightWithRestoreFallback').mockImplementation(() => {
        throw new Error('unexpected restore failure');
      });

      const result = await manager.restoreLocalHighlight(item);

      expect(result).toBe(false);
      expect(manager.highlights.has('h11')).toBe(false);
      expect(Logger.warn).toHaveBeenCalledWith(
        '恢復標註失敗',
        expect.objectContaining({ action: 'restoreLocalHighlight', id: 'h11' })
      );

      manager._applyHighlightWithRestoreFallback.mockRestore();
    });
  });

  describe('toast integration', () => {
    let mockToast;

    beforeEach(() => {
      mockToast = {
        show: jest.fn(),
        hide: jest.fn(),
        cleanup: jest.fn(),
      };
      manager.setDependencies({
        styleManager: mockStyleManager,
        storage: mockStorage,
        interaction: mockInteraction,
        migration: mockMigration,
        toast: mockToast,
      });
    });

    test('removeHighlight 成功應觸發 success toast', () => {
      const div = document.createElement('div');
      div.textContent = 'Toast remove test';
      document.body.append(div);
      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 5);

      const id = manager.addHighlight(range);
      mockToast.show.mockClear();

      const removed = manager.removeHighlight(id);

      expect(removed).toBe(true);
      expect(mockToast.show).toHaveBeenCalledWith('HIGHLIGHT_DELETED', { level: 'success' });
    });

    test('removeHighlight 失敗（不存在的 id）不應觸發 toast', () => {
      manager.removeHighlight('non-existent');
      expect(mockToast.show).not.toHaveBeenCalled();
    });

    test('addHighlight 視覺回滾時應觸發 error toast', () => {
      jest.spyOn(manager, 'applyHighlightAPI').mockReturnValue(false);

      const div = document.createElement('div');
      div.textContent = 'Rollback test';
      document.body.append(div);
      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 8);

      const id = manager.addHighlight(range);

      expect(id).toBeNull();
      expect(mockToast.show).toHaveBeenCalledWith('HIGHLIGHT_FAILED', { level: 'error' });

      manager.applyHighlightAPI.mockRestore();
    });

    test('addHighlight 成功時不應觸發 toast', () => {
      const div = document.createElement('div');
      div.textContent = 'Success path';
      document.body.append(div);
      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 7);

      manager.addHighlight(range);
      expect(mockToast.show).not.toHaveBeenCalled();
    });

    test('未注入 toast 時 remove/add 路徑應 silent，不報錯', () => {
      manager.setDependencies({
        styleManager: mockStyleManager,
        storage: mockStorage,
        interaction: mockInteraction,
        migration: mockMigration,
      });

      const div = document.createElement('div');
      div.textContent = 'No toast';
      document.body.append(div);
      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 4);

      const id = manager.addHighlight(range);
      expect(() => manager.removeHighlight(id)).not.toThrow();
    });
  });

  describe('_isExtensionUiEvent allowlist', () => {
    test('應認可帶 owner 標記的 #notion-toast-host', () => {
      const host = createOwnedExtensionHost('notion-toast-host', 'toastOwner');
      const event = createComposedPathEvent(host);

      expect(HighlightManager._isExtensionUiEvent(event)).toBe(true);
    });

    test('應認可帶 owner 標記的 #notion-toast-host 後代元素（closest 路徑）', () => {
      const host = createOwnedExtensionHost('notion-toast-host', 'toastOwner');
      const child = document.createElement('span');
      host.append(child);

      const event = createComposedPathEvent(child);

      expect(HighlightManager._isExtensionUiEvent(event)).toBe(true);
    });

    test('應認可既有 #notion-floating-rail-host 與 #notion-highlighter-host（regression）', () => {
      const railHost = createOwnedExtensionHost('notion-floating-rail-host', 'railOwner');
      expect(HighlightManager._isExtensionUiEvent(createComposedPathEvent(railHost))).toBe(true);

      const toolbarHost = createOwnedExtensionHost('notion-highlighter-host', 'highlighterOwner');
      expect(HighlightManager._isExtensionUiEvent(createComposedPathEvent(toolbarHost))).toBe(true);
    });

    test('應認可 Floating Rail dynamic host id 與後代元素', () => {
      const railHost = createOwnedExtensionHost(
        'notion-floating-rail-host-extension-id',
        'railOwner'
      );
      const child = document.createElement('span');
      railHost.append(child);

      expect(HighlightManager._isExtensionUiEvent(createComposedPathEvent(railHost))).toBe(true);
      expect(HighlightManager._isExtensionUiEvent(createComposedPathEvent(child))).toBe(true);
    });

    test('應拒絕同 ID 但缺少 owner 標記的 host 頁面元素', () => {
      const railHostCollision = document.createElement('div');
      railHostCollision.id = 'notion-floating-rail-host-extension-id';
      document.body.append(railHostCollision);

      const toolbarHostCollision = document.createElement('div');
      toolbarHostCollision.id = 'notion-highlighter-host';
      document.body.append(toolbarHostCollision);

      expect(
        HighlightManager._isExtensionUiEvent({ composedPath: () => [railHostCollision] })
      ).toBe(false);
      expect(
        HighlightManager._isExtensionUiEvent({ composedPath: () => [toolbarHostCollision] })
      ).toBe(false);
    });

    test('應拒絕非 extension UI 元素', () => {
      const div = document.createElement('div');
      div.id = 'random-page-element';
      document.body.append(div);

      expect(HighlightManager._isExtensionUiEvent({ composedPath: () => [div] })).toBe(false);
    });

    test('應在 event 缺少 composedPath 時回傳 false', () => {
      expect(HighlightManager._isExtensionUiEvent({})).toBe(false);
    });
  });
});
