/**
 * @jest-environment jsdom
 */

import {
  isNonEmptyString,
  isValidRange,
  isCollapsedRange,
  isValidColor,
  isValidUrl,
  isValidHighlightId,
  isValidHighlightData,
} from '../../../../scripts/highlighter/utils/validation.js';

describe('Validation Utils Coverage Tests', () => {
  describe('isNonEmptyString', () => {
    test('should return true for non-empty string', () => {
      expect(isNonEmptyString('hello')).toBe(true);
      expect(isNonEmptyString('  test  ')).toBe(true);
    });

    test('should return false for empty string', () => {
      expect(isNonEmptyString('')).toBe(false);
      expect(isNonEmptyString('   ')).toBe(false);
    });

    test('should return false for non-string values', () => {
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString()).toBe(false);
      expect(isNonEmptyString(123)).toBe(false);
      expect(isNonEmptyString({})).toBe(false);
      expect(isNonEmptyString([])).toBe(false);
    });
  });

  describe('isValidRange', () => {
    test('should return true for valid Range object', () => {
      const range = document.createRange();
      expect(isValidRange(range)).toBe(true);
    });

    test('should return false for null or undefined', () => {
      expect(isValidRange(null)).toBe(false);
      expect(isValidRange()).toBe(false);
    });

    test('should return false for non-Range objects', () => {
      expect(isValidRange({})).toBe(false);
      expect(isValidRange('range')).toBe(false);
      expect(isValidRange(123)).toBe(false);
    });

    test('should return false for object without required properties', () => {
      expect(isValidRange({ startContainer: {} })).toBe(false);
      expect(isValidRange({ endContainer: {} })).toBe(false);
      expect(isValidRange({ startContainer: {}, endContainer: {} })).toBe(false);
    });

    test('should return true for object with all required Range properties', () => {
      const mockRange = {
        startContainer: {},
        endContainer: {},
        cloneRange: jest.fn(),
      };
      expect(isValidRange(mockRange)).toBe(true);
    });
  });

  describe('isCollapsedRange', () => {
    test('should return true for collapsed range', () => {
      const range = document.createRange();
      // New range is collapsed by default
      expect(isCollapsedRange(range)).toBe(true);
    });

    test('should return false for non-collapsed range', () => {
      const div = document.createElement('div');
      div.textContent = 'Test';
      document.body.appendChild(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 2);

      expect(isCollapsedRange(range)).toBe(false);
    });

    test('should return true for invalid range', () => {
      expect(isCollapsedRange(null)).toBe(true);
      expect(isCollapsedRange()).toBe(true);
      expect(isCollapsedRange({})).toBe(true);
    });
  });

  describe('isValidColor', () => {
    test('should return true for valid colors', () => {
      expect(isValidColor('yellow')).toBe(true);
      expect(isValidColor('green')).toBe(true);
      expect(isValidColor('blue')).toBe(true);
      expect(isValidColor('red')).toBe(true);
    });

    test('should return false for invalid colors', () => {
      expect(isValidColor('purple')).toBe(false);
      expect(isValidColor('orange')).toBe(false);
      expect(isValidColor('black')).toBe(false);
      expect(isValidColor('')).toBe(false);
    });

    test('should return false for non-string values', () => {
      expect(isValidColor(null)).toBe(false);
      expect(isValidColor()).toBe(false);
      expect(isValidColor(123)).toBe(false);
    });
  });

  describe('isValidUrl', () => {
    test('should return true for valid URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://test.com/path')).toBe(true);
      expect(isValidUrl('https://example.com:8080/path?query=value')).toBe(true);
    });

    test('should return false for invalid URLs', () => {
      expect(isValidUrl('not a url')).toBe(false);
      expect(isValidUrl('ftp://invalid')).toBe(true); // ftp is valid URL scheme
      expect(isValidUrl('://invalid')).toBe(false);
    });

    test('should return false for empty or whitespace strings', () => {
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl('   ')).toBe(false);
    });

    test('should return false for non-string values', () => {
      expect(isValidUrl(null)).toBe(false);
      expect(isValidUrl()).toBe(false);
      expect(isValidUrl(123)).toBe(false);
    });
  });

  describe('isValidHighlightId', () => {
    test('should return true for valid highlight IDs', () => {
      expect(isValidHighlightId('h1')).toBe(true);
      expect(isValidHighlightId('h123')).toBe(true);
      expect(isValidHighlightId('h999999')).toBe(true);
    });

    test('should return false for invalid highlight IDs', () => {
      expect(isValidHighlightId('1')).toBe(false);
      expect(isValidHighlightId('h')).toBe(false);
      expect(isValidHighlightId('ha1')).toBe(false);
      expect(isValidHighlightId('h1a')).toBe(false);
      expect(isValidHighlightId('highlight-1')).toBe(false);
    });

    test('should return false for empty or non-string values', () => {
      expect(isValidHighlightId('')).toBe(false);
      expect(isValidHighlightId(null)).toBe(false);
      expect(isValidHighlightId()).toBe(false);
      expect(isValidHighlightId(123)).toBe(false);
    });
  });

  describe('isValidHighlightData', () => {
    test('should return true for valid highlight data', () => {
      const data = {
        id: 'h1',
        text: 'Test text',
        color: 'yellow',
      };
      expect(isValidHighlightData(data)).toBe(true);
    });

    test('should return false for null or undefined', () => {
      expect(isValidHighlightData(null)).toBe(false);
      expect(isValidHighlightData()).toBe(false);
    });

    test('should return false for non-object values', () => {
      expect(isValidHighlightData('string')).toBe(false);
      expect(isValidHighlightData(123)).toBe(false);
      expect(isValidHighlightData([])).toBe(false);
    });

    test('should return false for invalid ID', () => {
      const data = {
        id: 'invalid',
        text: 'Test text',
        color: 'yellow',
      };
      expect(isValidHighlightData(data)).toBe(false);
    });

    test('should return false for empty text', () => {
      const data = {
        id: 'h1',
        text: '',
        color: 'yellow',
      };
      expect(isValidHighlightData(data)).toBe(false);
    });

    test('should return false for invalid color', () => {
      const data = {
        id: 'h1',
        text: 'Test text',
        color: 'purple',
      };
      expect(isValidHighlightData(data)).toBe(false);
    });

    test('should return false for missing properties', () => {
      expect(isValidHighlightData({ id: 'h1', text: 'test' })).toBe(false);
      expect(isValidHighlightData({ id: 'h1', color: 'yellow' })).toBe(false);
      expect(isValidHighlightData({ text: 'test', color: 'yellow' })).toBe(false);
    });
  });
});
