/**
 * @jest-environment jsdom
 */

import { HighlightInteraction } from '../../../../scripts/highlighter/core/HighlightInteraction.js';

describe('core/HighlightInteraction', () => {
  let interaction = null;
  let mockManager = null;

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
      const div = document.createElement('div');
      div.textContent = 'No hit';
      document.body.append(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 2);
      range.getClientRects = jest.fn(() => [{ left: 0, right: 10, top: 0, bottom: 10 }]);

      mockManager.highlights.set('h1', {
        id: 'h1',
        range,
        color: 'yellow',
        text: 'No',
      });

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
      document.body.append(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 5);
      range.getClientRects = jest.fn(() => [{ left: 0, right: 100, top: 0, bottom: 20 }]);

      // 添加 mock highlight
      mockManager.highlights.set('h1', {
        id: 'h1',
        range,
        color: 'yellow',
        text: 'Click',
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
      document.body.append(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 3);
      range.getClientRects = jest.fn(() => [{ left: 0, right: 100, top: 0, bottom: 20 }]);

      mockManager.highlights.set('h1', {
        id: 'h1',
        range,
        color: 'yellow',
        text: 'Mac',
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
      const div = document.createElement('div');
      div.textContent = 'No hit';
      document.body.append(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 2);
      range.getClientRects = jest.fn(() => [{ left: 0, right: 10, top: 0, bottom: 10 }]);

      mockManager.highlights.set('h1', {
        id: 'h1',
        range,
        color: 'yellow',
        text: 'No',
      });

      const foundId = interaction.getHighlightAtPoint(100, 100);
      expect(foundId).toBeNull();
    });

    test('should return highlight ID at clicked point', () => {
      const div = document.createElement('div');
      div.textContent = 'Click test';
      document.body.append(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 5);
      range.getClientRects = jest.fn(() => [{ left: 0, right: 100, top: 0, bottom: 20 }]);

      mockManager.highlights.set('h1', {
        id: 'h1',
        range,
        color: 'yellow',
        text: 'Click',
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

      const foundId = interaction.getHighlightAtPoint(50, 10);
      expect(foundId).toBeNull();
    });

    test('should handle errors gracefully', () => {
      const div = document.createElement('div');
      div.textContent = 'Error case';
      document.body.append(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 2);
      range.getClientRects = jest.fn(() => {
        throw new Error('Test error');
      });

      mockManager.highlights.set('h1', {
        id: 'h1',
        range,
        color: 'yellow',
        text: 'Er',
      });

      const foundId = interaction.getHighlightAtPoint(50, 10);
      expect(foundId).toBeNull();
    });
  });

  describe('rangesOverlap', () => {
    test('should detect overlapping ranges', () => {
      const div = document.createElement('div');
      div.textContent = 'Overlap Test';
      document.body.append(div);

      const range1 = document.createRange();
      range1.setStart(div.firstChild, 0);
      range1.setEnd(div.firstChild, 7);

      const range2 = document.createRange();
      range2.setStart(div.firstChild, 5);
      range2.setEnd(div.firstChild, 12);

      const overlaps = HighlightInteraction.rangesOverlap(range1, range2);
      expect(overlaps).toBe(true);
    });

    test('should treat touching boundaries as non-overlapping', () => {
      const div = document.createElement('div');
      div.textContent = 'Boundary Touch';
      document.body.append(div);

      const range1 = document.createRange();
      range1.setStart(div.firstChild, 0);
      range1.setEnd(div.firstChild, 5);

      const range2 = document.createRange();
      range2.setStart(div.firstChild, 5);
      range2.setEnd(div.firstChild, 10);

      const overlaps = HighlightInteraction.rangesOverlap(range1, range2);
      expect(overlaps).toBe(false);
    });

    test('should return symmetric result when range order is swapped', () => {
      const div = document.createElement('div');
      div.textContent = 'Symmetric Test';
      document.body.append(div);

      const firstRange = document.createRange();
      firstRange.setStart(div.firstChild, 1);
      firstRange.setEnd(div.firstChild, 8);

      const secondRange = document.createRange();
      secondRange.setStart(div.firstChild, 5);
      secondRange.setEnd(div.firstChild, 12);

      const forward = HighlightInteraction.rangesOverlap(firstRange, secondRange);
      const reverse = HighlightInteraction.rangesOverlap(secondRange, firstRange);

      expect(forward).toBe(true);
      expect(reverse).toBe(true);
      expect(forward).toBe(reverse);
    });

    test('should detect non-overlapping ranges', () => {
      const div = document.createElement('div');
      div.textContent = 'Non Overlapping';
      document.body.append(div);

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
      document.body.append(div);

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
