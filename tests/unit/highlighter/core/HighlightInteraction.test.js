/**
 * @jest-environment jsdom
 */

import { HighlightInteraction } from '../../../../scripts/highlighter/core/HighlightInteraction.js';

describe('core/HighlightInteraction', () => {
  let interaction;
  let mockManager;

  beforeEach(() => {
    document.body.innerHTML = '';

    // 創建 mock manager
    mockManager = {
      highlights: new Map(),
      removeHighlight: jest.fn(),
    };

    interaction = new HighlightInteraction(mockManager);
  });

  describe('constructor', () => {
    test('should store manager reference', () => {
      expect(interaction.manager).toBe(mockManager);
    });
  });

  describe('handleClick', () => {
    test('should return false if no modifier key pressed', () => {
      const event = {
        ctrlKey: false,
        metaKey: false,
        clientX: 100,
        clientY: 100,
      };

      const handled = interaction.handleClick(event);
      expect(handled).toBe(false);
    });

    test('should return false if Ctrl pressed but no highlight at point', () => {
      document.caretRangeFromPoint = jest.fn(() => null);

      const event = {
        ctrlKey: true,
        metaKey: false,
        clientX: 100,
        clientY: 100,
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
      };

      const handled = interaction.handleClick(event);
      expect(handled).toBe(false);
      expect(mockManager.removeHighlight).not.toHaveBeenCalled();
    });

    test('should remove highlight on Ctrl+Click', () => {
      const div = document.createElement('div');
      div.textContent = 'Click to remove';
      document.body.appendChild(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 5);

      // 添加 mock highlight
      mockManager.highlights.set('h1', {
        id: 'h1',
        range,
        color: 'yellow',
        text: 'Click',
      });

      // Mock caretRangeFromPoint to return a range within the highlight
      document.caretRangeFromPoint = jest.fn(() => {
        const caretRange = document.createRange();
        caretRange.setStart(div.firstChild, 2);
        caretRange.setEnd(div.firstChild, 2);
        return caretRange;
      });

      const event = {
        ctrlKey: true,
        metaKey: false,
        clientX: 50,
        clientY: 10,
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
      };

      const handled = interaction.handleClick(event);
      expect(handled).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(mockManager.removeHighlight).toHaveBeenCalledWith('h1');
    });

    test('should work with metaKey (Mac)', () => {
      const div = document.createElement('div');
      div.textContent = 'Mac click';
      document.body.appendChild(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 3);

      mockManager.highlights.set('h1', {
        id: 'h1',
        range,
        color: 'yellow',
        text: 'Mac',
      });

      document.caretRangeFromPoint = jest.fn(() => {
        const caretRange = document.createRange();
        caretRange.setStart(div.firstChild, 1);
        caretRange.setEnd(div.firstChild, 1);
        return caretRange;
      });

      const event = {
        ctrlKey: false,
        metaKey: true,
        clientX: 50,
        clientY: 10,
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
      };

      const handled = interaction.handleClick(event);
      expect(handled).toBe(true);
      expect(mockManager.removeHighlight).toHaveBeenCalledWith('h1');
    });
  });

  describe('getHighlightAtPoint', () => {
    test('should return null when no highlight at point', () => {
      document.caretRangeFromPoint = jest.fn(() => null);
      const foundId = interaction.getHighlightAtPoint(100, 100);
      expect(foundId).toBeNull();
    });

    test('should return highlight ID at clicked point', () => {
      const div = document.createElement('div');
      div.textContent = 'Click test';
      document.body.appendChild(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 5);

      mockManager.highlights.set('h1', {
        id: 'h1',
        range,
        color: 'yellow',
        text: 'Click',
      });

      document.caretRangeFromPoint = jest.fn(() => {
        const caretRange = document.createRange();
        caretRange.setStart(div.firstChild, 2);
        caretRange.setEnd(div.firstChild, 2);
        return caretRange;
      });

      const foundId = interaction.getHighlightAtPoint(50, 10);
      expect(foundId).toBe('h1');
    });

    test('should skip highlights without range', () => {
      mockManager.highlights.set('h1', {
        id: 'h1',
        range: null, // no range
        color: 'yellow',
        text: 'Test',
      });

      document.caretRangeFromPoint = jest.fn(() => document.createRange());

      const foundId = interaction.getHighlightAtPoint(50, 10);
      expect(foundId).toBeNull();
    });

    test('should handle errors gracefully', () => {
      document.caretRangeFromPoint = jest.fn(() => {
        throw new Error('Test error');
      });

      const foundId = interaction.getHighlightAtPoint(50, 10);
      expect(foundId).toBeNull();
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
      range2.setEnd(div.firstChild, 12);

      const overlaps = HighlightInteraction.rangesOverlap(range1, range2);
      expect(overlaps).toBe(true);
    });

    test('should detect non-overlapping ranges', () => {
      const div = document.createElement('div');
      div.textContent = 'Non Overlapping';
      document.body.appendChild(div);

      const range1 = document.createRange();
      range1.setStart(div.firstChild, 0);
      range1.setEnd(div.firstChild, 3);

      const range2 = document.createRange();
      range2.setStart(div.firstChild, 10);
      range2.setEnd(div.firstChild, 15);

      const overlaps = HighlightInteraction.rangesOverlap(range1, range2);
      expect(overlaps).toBe(false);
    });

    test('should handle errors gracefully', () => {
      // 使用無效的 range
      const invalidRange = {};
      const validRange = document.createRange();

      const overlaps = HighlightInteraction.rangesOverlap(invalidRange, validRange);
      expect(overlaps).toBe(false);
    });

    test('should detect contained ranges', () => {
      const div = document.createElement('div');
      div.textContent = 'Container';
      document.body.appendChild(div);

      const outerRange = document.createRange();
      outerRange.setStart(div.firstChild, 0);
      outerRange.setEnd(div.firstChild, 9);

      const innerRange = document.createRange();
      innerRange.setStart(div.firstChild, 2);
      innerRange.setEnd(div.firstChild, 6);

      const overlaps = HighlightInteraction.rangesOverlap(outerRange, innerRange);
      expect(overlaps).toBe(true);
    });
  });
});
