/**
 * @jest-environment jsdom
 */

import { HighlightManager } from '../../../../scripts/highlighter/core/HighlightManager.js';
import { TEXT_COLORS } from '../../../../scripts/highlighter/utils/color.js';

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

describe('core/HighlightManager (Style Mode)', () => {
  let manager = null;

  beforeEach(() => {
    document.body.innerHTML = '';

    // 模擬 browser Highlight API
    global.CSS = {
      highlights: {
        set: jest.fn(),
        get: jest.fn(),
        delete: jest.fn(),
        clear: jest.fn(),
      },
    };

    // Mock Highlight constructor
    global.Highlight = jest.fn().mockImplementation(() => ({
      add: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
    }));

    manager = new HighlightManager();
    // 確保初始樣式已注入 (雖然構造函數會調用 initializeHighlightStyles，但 injectHighlightStyles 是在之後的邏輯)
    // 實際上源碼構造函數只調用 initializeHighlightStyles，這會創建 Highlight 對象
    // injectHighlightStyles 是顯式調用的 (通常在 initialize 中，但這裡是單元測試，需手動調用)
    manager.injectHighlightStyles();
  });

  afterEach(() => {
    if (manager) {
      manager.cleanup();
    }
    // 清理 inject 產生的 style
    const style = document.getElementById('notion-highlight-styles');
    if (style) {
      style.remove();
    }
  });

  describe('initialization', () => {
    test('should initialize with default styleMode (background)', () => {
      expect(manager.styleMode).toBe('background');
    });

    test('should accept custom styleMode option', () => {
      const customManager = new HighlightManager({ styleMode: 'text' });
      expect(customManager.styleMode).toBe('text');
    });
  });

  describe('updateStyleMode', () => {
    test('should update valid style mode', () => {
      manager.updateStyleMode('text');
      expect(manager.styleMode).toBe('text');
    });

    test('should ignore invalid style mode', () => {
      const originalMode = manager.styleMode;
      manager.updateStyleMode('invalid-mode');
      expect(manager.styleMode).toBe(originalMode);
    });

    test('should not reinject styles if mode is unchanged', () => {
      const spy = jest.spyOn(manager, 'injectHighlightStyles');
      manager.updateStyleMode('background'); // default is background
      expect(spy).not.toHaveBeenCalled();
    });

    test('should reinject styles if mode changes', () => {
      const spy = jest.spyOn(manager, 'injectHighlightStyles');
      manager.updateStyleMode('underline');
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('injectHighlightStyles', () => {
    test('should inject style element into head', () => {
      manager.injectHighlightStyles();
      const style = document.getElementById('notion-highlight-styles');
      expect(style).not.toBeNull();
      expect(document.head.contains(style)).toBe(true);
    });

    test('should set correct css for background mode', () => {
      manager.updateStyleMode('background');
      const style = document.getElementById('notion-highlight-styles');
      // background mode 應包含 background-color 和 color: black
      expect(style.textContent).toContain('background-color:');
      expect(style.textContent).toContain('color: black');
    });

    test('should set correct css for text mode', () => {
      manager.updateStyleMode('text');
      const style = document.getElementById('notion-highlight-styles');
      // text mode 應背景透明並設定 color
      expect(style.textContent).toContain('background-color: transparent');
      expect(style.textContent).toContain('color:');
      // 確保不含 color: black (除了可能被覆蓋的部分，重點是邏輯分支)
      // 這裡檢查是否使用了 TEXT_COLORS (較深色)
      // 由於 TEXT_COLORS 是內部引用，我們可以檢查生成的樣式内容特徵
    });

    test('should set correct css for underline mode', () => {
      manager.updateStyleMode('underline');
      const style = document.getElementById('notion-highlight-styles');
      expect(style.textContent).toContain('text-decoration: underline');
      expect(style.textContent).toContain('text-decoration-color:');
    });

    test('should update existing style element', () => {
      manager.injectHighlightStyles();
      manager.injectHighlightStyles();
      // const style1 = document.getElementById('notion-highlight-styles');

      manager.updateStyleMode('text');
      const style2 = document.getElementById('notion-highlight-styles');

      // 應該是同一個 ID 或是被替換了（取決於實作，這裡是 remove 後 create）
      // 檢查 dataset.styleMode
      expect(style2.dataset.styleMode).toBe('text');
    });
  });

  describe('TEXT_COLORS validation', () => {
    test('should have defined text colors', () => {
      expect(manager.textColors).toEqual(TEXT_COLORS);
      expect(Object.keys(manager.textColors)).toEqual(
        expect.arrayContaining(['yellow', 'green', 'blue', 'red'])
      );
    });
  });
});
