/**
 * @jest-environment jsdom
 */

import { StyleManager } from '../../../../scripts/highlighter/core/StyleManager.js';
import { VALID_STYLES, COLORS, TEXT_COLORS } from '../../../../scripts/highlighter/utils/color.js';

// Mock dependencies
jest.mock('../../../../scripts/highlighter/utils/dom.js', () => ({
  supportsHighlightAPI: jest.fn(() => true),
}));

jest.mock('../../../../scripts/utils/Logger.js', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
}));

describe('core/StyleManager', () => {
  let styleManager = null;

  beforeEach(() => {
    document.body.innerHTML = '';

    // 模擬 browser Highlight API
    globalThis.CSS = {
      highlights: {
        set: jest.fn(),
        get: jest.fn(),
        delete: jest.fn(),
        clear: jest.fn(),
      },
    };

    // Mock Highlight constructor
    globalThis.Highlight = jest.fn().mockImplementation(() => ({
      add: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
    }));
    // Make it look like native code
    globalThis.Highlight.toString = () => 'function Highlight() { [native code] }';

    styleManager = new StyleManager();
  });

  afterEach(() => {
    if (styleManager) {
      styleManager.cleanup();
    }
    // 清理樣式元素
    const style = document.querySelector('#notion-highlight-styles');
    if (style) {
      style.remove();
    }
  });

  describe('constructor', () => {
    test('should initialize with default styleMode (background)', () => {
      expect(styleManager.styleMode).toBe('background');
    });

    test('should accept custom styleMode option', () => {
      const customManager = new StyleManager({ styleMode: 'text' });
      expect(customManager.styleMode).toBe('text');
    });

    test('should initialize with COLORS and TEXT_COLORS', () => {
      expect(styleManager.colors).toEqual(COLORS);
      expect(styleManager.textColors).toEqual(TEXT_COLORS);
    });

    test('should initialize highlightObjects as empty object', () => {
      expect(styleManager.highlightObjects).toEqual({});
    });
  });

  describe('initialize', () => {
    test('should create Highlight objects for each color', () => {
      styleManager.initialize();

      Object.keys(COLORS).forEach(color => {
        expect(styleManager.highlightObjects[color]).toBeDefined();
      });
    });

    test('should register highlights to CSS.highlights', () => {
      styleManager.initialize();

      Object.keys(COLORS).forEach(color => {
        expect(CSS.highlights.set).toHaveBeenCalledWith(`notion-${color}`, expect.anything());
      });
    });

    test('should inject styles after initialization', () => {
      styleManager.initialize();

      const style = document.querySelector('#notion-highlight-styles');
      expect(style).toBeTruthy();
    });

    test('should skip initialization if Highlight is not native', () => {
      globalThis.Highlight.toString = () => 'function Highlight() { polyfill }';

      styleManager.initialize();

      expect(Object.keys(styleManager.highlightObjects)).toHaveLength(0);
    });
  });

  describe('injectStyles', () => {
    test('should inject style element into head', () => {
      styleManager.injectStyles();

      const style = document.querySelector('#notion-highlight-styles');
      expect(style).not.toBeNull();
      expect(document.head.contains(style)).toBe(true);
    });

    test('should set correct css for background mode', () => {
      styleManager.styleMode = 'background';
      styleManager.injectStyles();

      const style = document.querySelector('#notion-highlight-styles');
      expect(style.textContent).toContain('background-color:');
      expect(style.textContent).toContain('color: black');
    });

    test('should set correct css for text mode', () => {
      styleManager.styleMode = 'text';
      styleManager.injectStyles();

      const style = document.querySelector('#notion-highlight-styles');
      expect(style.textContent).toContain('background-color: transparent');
    });

    test('should set correct css for underline mode', () => {
      styleManager.styleMode = 'underline';
      styleManager.injectStyles();

      const style = document.querySelector('#notion-highlight-styles');
      expect(style.textContent).toContain('text-decoration: underline');
      expect(style.textContent).toContain('text-decoration-color:');
    });

    test('should update existing style element', () => {
      styleManager.injectStyles();
      const style1 = document.querySelector('#notion-highlight-styles');
      expect(style1.dataset.styleMode).toBe('background');

      styleManager.styleMode = 'text';
      styleManager.injectStyles();
      const style2 = document.querySelector('#notion-highlight-styles');
      expect(style2.dataset.styleMode).toBe('text');
    });

    test('should not duplicate style elements', () => {
      styleManager.injectStyles();
      styleManager.injectStyles();

      const styles = document.querySelectorAll('#notion-highlight-styles');
      expect(styles).toHaveLength(1);
    });
  });

  describe('updateMode', () => {
    test('should update valid style mode', () => {
      styleManager.updateMode('text');
      expect(styleManager.styleMode).toBe('text');
    });

    test('should ignore invalid style mode', () => {
      const originalMode = styleManager.styleMode;
      styleManager.updateMode('invalid-mode');
      expect(styleManager.styleMode).toBe(originalMode);
    });

    test('should not reinject styles if mode is unchanged', () => {
      const spy = jest.spyOn(styleManager, 'injectStyles');
      styleManager.updateMode('background'); // default is background
      expect(spy).not.toHaveBeenCalled();
    });

    test('should reinject styles if mode changes', () => {
      styleManager.injectStyles(); // Initial injection
      const spy = jest.spyOn(styleManager, 'injectStyles');
      styleManager.updateMode('underline');
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('getHighlightObject', () => {
    test('should return highlight object for valid color', () => {
      styleManager.initialize();

      const obj = styleManager.getHighlightObject('yellow');
      expect(obj).toBeDefined();
    });

    test('should return undefined for invalid color', () => {
      styleManager.initialize();

      const obj = styleManager.getHighlightObject('invalid-color');
      expect(obj).toBeUndefined();
    });
  });

  describe('getStyleMode', () => {
    test('should return current style mode', () => {
      expect(styleManager.getStyleMode()).toBe('background');

      styleManager.updateMode('text');
      expect(styleManager.getStyleMode()).toBe('text');
    });
  });

  describe('clearAllHighlights', () => {
    test('should call clear on all highlight objects', () => {
      styleManager.initialize();

      styleManager.clearAllHighlights();

      Object.values(styleManager.highlightObjects).forEach(highlight => {
        expect(highlight.clear).toHaveBeenCalled();
      });
    });
  });

  describe('cleanup', () => {
    test('should remove style element', () => {
      styleManager.injectStyles();
      expect(document.querySelector('#notion-highlight-styles')).toBeTruthy();

      styleManager.cleanup();
      expect(document.querySelector('#notion-highlight-styles')).toBeNull();
    });

    test('should delete highlights from CSS.highlights', () => {
      styleManager.initialize();
      styleManager.cleanup();

      Object.keys(COLORS).forEach(color => {
        expect(CSS.highlights.delete).toHaveBeenCalledWith(`notion-${color}`);
      });
    });

    test('should clear highlightObjects', () => {
      styleManager.initialize();
      expect(Object.keys(styleManager.highlightObjects).length).toBeGreaterThan(0);

      styleManager.cleanup();
      expect(styleManager.highlightObjects).toEqual({});
    });
  });

  describe('VALID_STYLES integration', () => {
    test('should support all valid styles', () => {
      VALID_STYLES.forEach(style => {
        styleManager.updateMode(style);
        expect(styleManager.styleMode).toBe(style);
      });
    });
  });
});
