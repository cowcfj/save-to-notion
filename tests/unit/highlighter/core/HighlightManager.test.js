/**
 * @jest-environment jsdom
 */

// 使用源代碼版本
import { HighlightManager } from '../../../../scripts/highlighter/core/HighlightManager.js';
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

describe('core/HighlightManager', () => {
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
  });

  afterEach(() => {
    if (manager) {
      manager.cleanup();
    }
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

    test('should have all color mappings', () => {
      expect(manager.colors).toHaveProperty('yellow');
      expect(manager.colors).toHaveProperty('green');
      expect(manager.colors).toHaveProperty('blue');
      expect(manager.colors).toHaveProperty('red');
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

    test('should generate unique IDs', () => {
      const div = document.createElement('div');
      div.textContent = 'Test One Test Two';
      document.body.appendChild(div);

      const range1 = document.createRange();
      range1.setStart(div.firstChild, 0);
      range1.setEnd(div.firstChild, 4);

      const range2 = document.createRange();
      range2.setStart(div.firstChild, 9);
      range2.setEnd(div.firstChild, 13);

      const id1 = manager.addHighlight(range1);
      const id2 = manager.addHighlight(range2);

      expect(id1).not.toBe(id2);
    });

    test('should store highlight data', () => {
      const div = document.createElement('div');
      div.textContent = 'Sample Text';
      document.body.appendChild(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 6);

      const id = manager.addHighlight(range, 'green');
      const highlight = manager.highlights.get(id);

      expect(highlight).toBeDefined();
      expect(highlight.text).toBe('Sample');
      expect(highlight.color).toBe('green');
      expect(highlight.rangeInfo).toBeDefined();
      expect(highlight.timestamp).toBeDefined();
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
    });

    test('should return false for non-existent highlight', () => {
      const removed = manager.removeHighlight('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('clearAll', () => {
    test('should clear all highlights', () => {
      const div = document.createElement('div');
      div.textContent = 'One Two Three';
      document.body.appendChild(div);

      const range1 = document.createRange();
      range1.setStart(div.firstChild, 0);
      range1.setEnd(div.firstChild, 3);

      const range2 = document.createRange();
      range2.setStart(div.firstChild, 4);
      range2.setEnd(div.firstChild, 7);

      manager.addHighlight(range1);
      manager.addHighlight(range2);

      expect(manager.highlights.size).toBe(2);

      manager.clearAll();

      expect(manager.highlights.size).toBe(0);
    });
  });

  describe('setColor', () => {
    test('should set valid color', () => {
      manager.setColor('blue');
      expect(manager.currentColor).toBe('blue');
    });

    test('should ignore invalid color', () => {
      const originalColor = manager.currentColor;
      manager.setColor('invalid');
      expect(manager.currentColor).toBe(originalColor);
    });
  });

  describe('getCount', () => {
    test('should return correct count', () => {
      expect(manager.getCount()).toBe(0);

      const div = document.createElement('div');
      div.textContent = 'Test Content';
      document.body.appendChild(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 4);

      manager.addHighlight(range);
      expect(manager.getCount()).toBe(1);
    });
  });

  describe('convertBgColorToName', () => {
    test('should convert hex colors', () => {
      expect(HighlightManager.convertBgColorToName('#fff3cd')).toBe('yellow');
      expect(HighlightManager.convertBgColorToName('#d4edda')).toBe('green');
      expect(HighlightManager.convertBgColorToName('#cce7ff')).toBe('blue');
      expect(HighlightManager.convertBgColorToName('#f8d7da')).toBe('red');
    });

    test('should convert rgb colors', () => {
      expect(HighlightManager.convertBgColorToName('rgb(255, 243, 205)')).toBe('yellow');
      expect(HighlightManager.convertBgColorToName('rgb(212, 237, 218)')).toBe('green');
    });

    test('should return default for unknown color', () => {
      expect(HighlightManager.convertBgColorToName('#unknown')).toBe('yellow');
    });
  });

  describe('collectHighlightsForNotion', () => {
    test('should collect highlight data for export', () => {
      const div = document.createElement('div');
      div.textContent = 'Export Test';
      document.body.appendChild(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 6);

      manager.addHighlight(range, 'red');

      const exported = manager.collectHighlightsForNotion();

      expect(exported).toHaveLength(1);
      expect(exported[0]).toHaveProperty('text', 'Export');
      expect(exported[0]).toHaveProperty('color', 'red');
      expect(exported[0]).toHaveProperty('timestamp');
    });

    test('should return empty array when no highlights', () => {
      const exported = manager.collectHighlightsForNotion();
      expect(exported).toEqual([]);
    });
  });

  describe('rangesOverlap', () => {
    test('should detect overlapping ranges', () => {
      const div = document.createElement('div');
      div.textContent = 'Overlap Test';
      document.body.appendChild(div);

      const range1 = document.createRange();
      range1.setStart(div.firstChild, 0);
      range1.setEnd(div.firstChild, 7);

      const range2 = document.createRange();
      range2.setStart(div.firstChild, 5);
      range2.setEnd(div.firstChild, 10);

      const overlaps = HighlightManager.rangesOverlap(range1, range2);
      expect(overlaps).toBe(true);
    });

    test('should detect non-overlapping ranges', () => {
      const div = document.createElement('div');
      div.textContent = 'No Overlap Test';
      document.body.appendChild(div);

      const range1 = document.createRange();
      range1.setStart(div.firstChild, 0);
      range1.setEnd(div.firstChild, 2);

      const range2 = document.createRange();
      range2.setStart(div.firstChild, 10);
      range2.setEnd(div.firstChild, 15);

      const overlaps = HighlightManager.rangesOverlap(range1, range2);
      expect(overlaps).toBe(false);
    });
  });
});
