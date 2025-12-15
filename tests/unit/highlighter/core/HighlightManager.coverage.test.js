/**
 * @jest-environment jsdom
 */

import { HighlightManager } from '../../../../scripts/highlighter/core/HighlightManager.js';

// Mock dependencies
jest.mock('../../../../scripts/highlighter/core/Range.js', () => ({
  serializeRange: jest.fn(() => ({
    startContainerPath: [],
    startOffset: 0,
    endContainerPath: [],
    endOffset: 0,
    text: 'mock',
  })),
  restoreRangeWithRetry: jest.fn(),
}));

jest.mock('../../../../scripts/highlighter/utils/dom.js', () => ({
  supportsHighlightAPI: jest.fn(() => true),
}));

jest.mock('../../../../scripts/highlighter/utils/textSearch.js', () => ({
  findTextInPage: jest.fn(),
}));

describe('HighlightManager Coverage Tests', () => {
  let manager = null;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = '';

    // Mock window.chrome
    window.chrome = {
      runtime: { id: 'mock-id' },
      storage: {
        local: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue({}),
          remove: jest.fn().mockResolvedValue({}),
        },
      },
    };

    // Mock CSS Highlight API
    window.Highlight = jest.fn().mockImplementation(() => ({
      add: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
    }));
    window.Highlight.toString = () => 'function Highlight() { [native code] }';

    window.CSS = {
      highlights: {
        set: jest.fn(),
        delete: jest.fn(),
        clear: jest.fn(),
      },
    };

    // Mock Logger
    window.Logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    manager = new HighlightManager();
  });

  afterEach(() => {
    if (manager) {
      manager.cleanup();
    }
    jest.clearAllMocks();
  });

  test('should initialize correctly', () => {
    expect(manager).toBeDefined();
    expect(manager.highlights).toBeInstanceOf(Map);
    expect(manager.currentColor).toBe('yellow');
  });

  test('should add highlight', () => {
    const div = document.createElement('div');
    div.textContent = 'Test Content';
    document.body.appendChild(div);

    const range = document.createRange();
    range.setStart(div.firstChild, 0);
    range.setEnd(div.firstChild, 4);

    const id = manager.addHighlight(range);
    expect(id).toBeTruthy();
    expect(manager.highlights.size).toBe(1);
  });

  describe('initialize', () => {
    test('should call migration and restore methods', async () => {
      manager.checkAndMigrateLegacyData = jest.fn();
      manager.restoreHighlights = jest.fn();
      manager.performSeamlessMigration = jest.fn();

      await manager.initialize();

      expect(manager.checkAndMigrateLegacyData).toHaveBeenCalled();
      expect(manager.restoreHighlights).toHaveBeenCalled();
      expect(manager.performSeamlessMigration).toHaveBeenCalled();
    });
  });

  describe('initializeHighlightStyles', () => {
    test('should register highlights when API is supported', () => {
      // Already called in constructor

      // Should register for each color (yellow, green, blue, red)
      expect(window.CSS.highlights.set).toHaveBeenCalledTimes(4);
      expect(window.CSS.highlights.set).toHaveBeenCalledWith('notion-yellow', expect.any(Object));
    });

    test('should inject style element', () => {
      manager.initializeHighlightStyles();
      const style = document.getElementById('notion-highlight-styles');
      expect(style).toBeTruthy();
      expect(style.textContent).toContain('::highlight(notion-yellow)');
    });
  });

  describe('applyTraditionalHighlight', () => {
    test('should create span element when API is not supported', () => {
      // Mock supportsHighlightAPI to return false
      const domUtils = require('../../../../scripts/highlighter/utils/dom.js');
      domUtils.supportsHighlightAPI.mockReturnValue(false);

      const div = document.createElement('div');
      div.textContent = 'Fallback Test';
      document.body.appendChild(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 8);

      const id = manager.addHighlight(range, 'green');

      const span = document.querySelector(`span[data-highlight-id="${id}"]`);
      expect(span).toBeTruthy();
      expect(span.className).toBe('simple-highlight');
      expect(span.style.backgroundColor).toBeDefined();

      // Reset mock
      domUtils.supportsHighlightAPI.mockReturnValue(true);
    });
  });

  describe('removeHighlight', () => {
    test('should remove highlight via API', () => {
      const div = document.createElement('div');
      div.textContent = 'Remove Test';
      document.body.appendChild(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 6);

      const id = manager.addHighlight(range);
      const highlightObj = manager.highlightObjects.yellow;

      manager.removeHighlight(id);

      expect(manager.highlights.has(id)).toBe(false);
      expect(highlightObj.delete).toHaveBeenCalled();
    });

    test('should remove highlight via DOM (traditional)', () => {
      // Mock supportsHighlightAPI to return false
      const domUtils = require('../../../../scripts/highlighter/utils/dom.js');
      domUtils.supportsHighlightAPI.mockReturnValue(false);

      const div = document.createElement('div');
      div.textContent = 'Remove DOM Test';
      document.body.appendChild(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 6);

      const id = manager.addHighlight(range);
      const span = document.querySelector(`span[data-highlight-id="${id}"]`);
      expect(span).toBeTruthy();

      manager.removeHighlight(id);

      const spanAfter = document.querySelector(`span[data-highlight-id="${id}"]`);
      expect(spanAfter).toBeNull();
      expect(div.textContent).toBe('Remove DOM Test'); // Content preserved

      // Reset mock
      domUtils.supportsHighlightAPI.mockReturnValue(true);
    });
  });

  describe('saveToStorage', () => {
    test('should save highlights to window.StorageUtil', async () => {
      window.StorageUtil = {
        saveHighlights: jest.fn().mockResolvedValue(),
        clearHighlights: jest.fn().mockResolvedValue(),
        loadHighlights: jest.fn().mockResolvedValue([]),
      };

      const div = document.createElement('div');
      div.textContent = 'Storage Test';
      document.body.appendChild(div);
      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 4);

      manager.addHighlight(range);

      await manager.saveToStorage();

      expect(window.StorageUtil.saveHighlights).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          highlights: expect.arrayContaining([expect.objectContaining({ text: 'Stor' })]),
        })
      );
    });
  });

  describe('restoreHighlights', () => {
    test('should restore highlights from storage', async () => {
      window.StorageUtil = {
        loadHighlights: jest.fn().mockResolvedValue([
          {
            id: 'h1',
            text: 'Restore',
            color: 'yellow',
            rangeInfo: {
              startContainerPath: [],
              startOffset: 0,
              endContainerPath: [],
              endOffset: 7,
            },
          },
        ]),
        saveHighlights: jest.fn(),
      };

      const RangeUtils = require('../../../../scripts/highlighter/core/Range.js');
      const div = document.createElement('div');
      div.textContent = 'Restore Test';
      document.body.appendChild(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 7);

      RangeUtils.restoreRangeWithRetry.mockResolvedValue(range);

      await manager.restoreHighlights();

      expect(manager.highlights.size).toBe(1);
      expect(manager.highlights.get('h1').text).toBe('Restore');
    });
  });

  describe('clearAll', () => {
    test('should clear all highlights via API and remain functional', () => {
      const div = document.createElement('div');
      div.textContent = 'Content to clear and reuse';
      document.body.appendChild(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 7);

      manager.addHighlight(range);
      expect(manager.highlights.size).toBe(1);

      // 保留 highlightObjects 引用
      const yellowHighlight = manager.highlightObjects.yellow;

      manager.clearAll();

      // 驗證清除成功
      expect(manager.highlights.size).toBe(0);
      expect(yellowHighlight.clear).toHaveBeenCalled();

      // 驗證 clearAll 後仍可添加新標註（功能正常）
      const range2 = document.createRange();
      range2.setStart(div.firstChild, 10);
      range2.setEnd(div.firstChild, 15);

      const newId = manager.addHighlight(range2);
      expect(newId).toBeTruthy();
      expect(manager.highlights.size).toBe(1);

      // 驗證 Highlight API 對象仍然可用
      expect(manager.highlightObjects.yellow).toBeDefined();
      expect(manager.highlightObjects.yellow.add).toHaveBeenCalled();
    });
  });

  describe('getHighlightAtPoint', () => {
    test('should return highlight ID at clicked point', () => {
      const div = document.createElement('div');
      div.textContent = 'Click test';
      document.body.appendChild(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 5);

      const id = manager.addHighlight(range);

      // Mock caretRangeFromPoint
      document.caretRangeFromPoint = jest.fn(() => {
        const caretRange = document.createRange();
        caretRange.setStart(div.firstChild, 2);
        caretRange.setEnd(div.firstChild, 2);
        return caretRange;
      });

      const foundId = manager.getHighlightAtPoint(100, 100);
      expect(foundId).toBe(id);
    });

    test('should return null when no highlight at point', () => {
      document.caretRangeFromPoint = jest.fn(() => null);
      const foundId = manager.getHighlightAtPoint(100, 100);
      expect(foundId).toBeNull();
    });
  });

  describe('handleDocumentClick', () => {
    test('should remove highlight on Ctrl+Click', () => {
      const div = document.createElement('div');
      div.textContent = 'Click to remove';
      document.body.appendChild(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 5);

      const id = manager.addHighlight(range);

      // Mock getHighlightAtPoint
      manager.getHighlightAtPoint = jest.fn(() => id);

      const event = {
        ctrlKey: true,
        clientX: 100,
        clientY: 100,
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
      };

      const handled = manager.handleDocumentClick(event);

      expect(handled).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(manager.highlights.has(id)).toBe(false);
    });

    test('should not handle click without ctrl/meta key', () => {
      const event = {
        ctrlKey: false,
        metaKey: false,
        clientX: 100,
        clientY: 100,
      };

      const handled = manager.handleDocumentClick(event);
      expect(handled).toBe(false);
    });
  });

  describe('setColor', () => {
    test('should set valid color', () => {
      manager.setColor('blue');
      expect(manager.currentColor).toBe('blue');
    });

    test('should ignore invalid color', () => {
      const before = manager.currentColor;
      manager.setColor('purple');
      expect(manager.currentColor).toBe(before);
    });
  });

  describe('getSafeExtensionStorage', () => {
    test('should return storage when in extension context', () => {
      const storage = HighlightManager.getSafeExtensionStorage();
      expect(storage).toBe(window.chrome.storage.local);
    });

    test('should return null when chrome runtime is not available', () => {
      const originalChrome = window.chrome;
      window.chrome = {};

      const storage = HighlightManager.getSafeExtensionStorage();
      expect(storage).toBeNull();

      window.chrome = originalChrome;
    });
  });

  describe('collectHighlightsForNotion', () => {
    test('should export highlight data', () => {
      const div = document.createElement('div');
      div.textContent = 'Export data';
      document.body.appendChild(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 6);

      manager.addHighlight(range, 'red');

      const exported = manager.collectHighlightsForNotion();
      expect(exported).toHaveLength(1);
      expect(exported[0].text).toBe('Export');
      expect(exported[0].color).toBe('red');
      expect(exported[0].timestamp).toBeDefined();
    });
  });

  describe('performSeamlessMigration', () => {
    test('should call SeamlessMigrationManager when available', async () => {
      const mockMigrationManager = {
        performSeamlessMigration: jest.fn().mockResolvedValue({ success: true }),
      };

      window.SeamlessMigrationManager = jest.fn(() => mockMigrationManager);
      window.StorageUtil = {
        saveHighlights: jest.fn().mockResolvedValue(),
      };

      await manager.performSeamlessMigration();

      expect(mockMigrationManager.performSeamlessMigration).toHaveBeenCalledWith(manager);
    });
  });
});
