/**
 * @jest-environment jsdom
 */

import {
  serializeRange,
  deserializeRange,
  restoreRangeWithRetry,
  findRangeByTextContent,
  validateRange,
} from '../../../../scripts/highlighter/core/Range.js';

// Mock dependencies
jest.mock('../../../../scripts/highlighter/utils/path.js', () => ({
  getNodePath: jest.fn(),
  getNodeByPath: jest.fn(),
}));

jest.mock('../../../../scripts/highlighter/utils/textSearch.js', () => ({
  ...jest.requireActual('../../../../scripts/highlighter/utils/textSearch.js'),
  findTextInPage: jest.fn(),
}));

jest.mock('../../../../scripts/highlighter/utils/domStability.js', () => ({
  waitForDOMStability: jest.fn(),
}));

describe('Range Module Coverage Tests', () => {
  let pathUtils = null;
  let textSearchUtils = null;
  let domStabilityUtils = null;

  beforeEach(() => {
    document.body.innerHTML = '';
    pathUtils = require('../../../../scripts/highlighter/utils/path.js');
    textSearchUtils = require('../../../../scripts/highlighter/utils/textSearch.js');
    domStabilityUtils = require('../../../../scripts/highlighter/utils/domStability.js');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('serializeRange', () => {
    test('should serialize range correctly', () => {
      const div = document.createElement('div');
      div.textContent = 'Test content';
      document.body.append(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 4);

      pathUtils.getNodePath
        .mockReturnValueOnce([{ type: 'element', tag: 'div', index: 0 }])
        .mockReturnValueOnce([{ type: 'element', tag: 'div', index: 0 }]);

      const serialized = serializeRange(range);

      expect(serialized).toEqual({
        startContainerPath: [{ type: 'element', tag: 'div', index: 0 }],
        startOffset: 0,
        endContainerPath: [{ type: 'element', tag: 'div', index: 0 }],
        endOffset: 4,
        prefix: '',
        suffix: ' content',
      });
      expect(pathUtils.getNodePath).toHaveBeenCalledTimes(2);
    });

    test('should extract element-node prefix when toReversed is unavailable', () => {
      const toReversedDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'toReversed');
      const article = document.createElement('article');
      article.innerHTML = '<span>Lead context </span><span>Target</span><span> tail</span>';
      document.body.append(article);

      Object.defineProperty(Array.prototype, 'toReversed', {
        configurable: true,
        value: undefined,
        writable: true,
      });

      try {
        const range = document.createRange();
        range.setStart(article, 1);
        range.setEnd(article, 2);

        pathUtils.getNodePath
          .mockReturnValueOnce([{ type: 'element', tag: 'article', index: 0 }])
          .mockReturnValueOnce([{ type: 'element', tag: 'article', index: 0 }]);

        const serialized = serializeRange(range);

        expect(serialized.prefix).toBe('Lead context ');
        expect(serialized.suffix).toBe(' tail');
      } finally {
        Object.defineProperty(Array.prototype, 'toReversed', toReversedDescriptor);
      }
    });
  });

  describe('deserializeRange', () => {
    test('should deserialize range successfully', () => {
      const div = document.createElement('div');
      div.textContent = 'Test content';
      document.body.append(div);

      const rangeInfo = {
        startContainerPath: [{ type: 'element', tag: 'div', index: 0 }],
        startOffset: 0,
        endContainerPath: [{ type: 'element', tag: 'div', index: 0 }],
        endOffset: 4,
      };

      pathUtils.getNodeByPath.mockReturnValue(div.firstChild);

      const range = deserializeRange(rangeInfo, 'Test');

      expect(range).not.toBeNull();
      expect(range.toString()).toBe('Test');
    });

    test('should return null if rangeInfo is null', () => {
      const range = deserializeRange(null, 'Test');
      expect(range).toBeNull();
    });

    test('should return null if nodes cannot be found', () => {
      const rangeInfo = {
        startContainerPath: [{ type: 'element', tag: 'div', index: 0 }],
        startOffset: 0,
        endContainerPath: [{ type: 'element', tag: 'div', index: 0 }],
        endOffset: 4,
      };

      pathUtils.getNodeByPath.mockReturnValue(null);

      const range = deserializeRange(rangeInfo, 'Test');
      expect(range).toBeNull();
    });

    test('should return null if text does not match', () => {
      const div = document.createElement('div');
      div.textContent = 'Test content';
      document.body.append(div);

      const rangeInfo = {
        startContainerPath: [{ type: 'element', tag: 'div', index: 0 }],
        startOffset: 0,
        endContainerPath: [{ type: 'element', tag: 'div', index: 0 }],
        endOffset: 4,
      };

      pathUtils.getNodeByPath.mockReturnValue(div.firstChild);

      const range = deserializeRange(rangeInfo, 'Wrong');
      expect(range).toBeNull();
    });

    test('should handle errors gracefully', () => {
      const rangeInfo = {
        startContainerPath: [{ type: 'element', tag: 'div', index: 0 }],
        startOffset: 0,
        endContainerPath: [{ type: 'element', tag: 'div', index: 0 }],
        endOffset: 4,
      };

      pathUtils.getNodeByPath.mockImplementation(() => {
        throw new Error('Test error');
      });

      const range = deserializeRange(rangeInfo, 'Test');
      expect(range).toBeNull();
    });
  });

  describe('restoreRangeWithRetry', () => {
    test('should restore range on first try', async () => {
      const div = document.createElement('div');
      div.textContent = 'Test content';
      document.body.append(div);

      const rangeInfo = {
        startContainerPath: [{ type: 'element', tag: 'div', index: 0 }],
        startOffset: 0,
        endContainerPath: [{ type: 'element', tag: 'div', index: 0 }],
        endOffset: 4,
      };

      pathUtils.getNodeByPath.mockReturnValue(div.firstChild);

      const range = await restoreRangeWithRetry(rangeInfo, 'Test', 3);

      expect(range).not.toBeNull();
      expect(range.toString()).toBe('Test');
    });

    test('should retry and succeed after DOM stabilizes', async () => {
      const div = document.createElement('div');
      div.textContent = 'Test content';
      document.body.append(div);

      const rangeInfo = {
        startContainerPath: [{ type: 'element', tag: 'div', index: 0 }],
        startOffset: 0,
        endContainerPath: [{ type: 'element', tag: 'div', index: 0 }],
        endOffset: 4,
      };

      // First call fails, second succeeds
      pathUtils.getNodeByPath
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(null)
        .mockReturnValue(div.firstChild);

      domStabilityUtils.waitForDOMStability.mockResolvedValue(true);

      const range = await restoreRangeWithRetry(rangeInfo, 'Test', 3);

      expect(range).not.toBeNull();
      expect(domStabilityUtils.waitForDOMStability).toHaveBeenCalled();
    });

    test('should use text search as fallback', async () => {
      const div = document.createElement('div');
      div.textContent = 'Test content';
      document.body.append(div);

      const rangeInfo = {
        startContainerPath: [{ type: 'element', tag: 'div', index: 0 }],
        startOffset: 0,
        endContainerPath: [{ type: 'element', tag: 'div', index: 0 }],
        endOffset: 4,
      };

      pathUtils.getNodeByPath.mockReturnValue(null);
      domStabilityUtils.waitForDOMStability.mockResolvedValue(false);

      const fallbackRange = document.createRange();
      fallbackRange.setStart(div.firstChild, 0);
      fallbackRange.setEnd(div.firstChild, 4);
      textSearchUtils.findTextInPage.mockReturnValue(fallbackRange);

      const range = await restoreRangeWithRetry(rangeInfo, 'Test', 3);

      expect(range).not.toBeNull();
      expect(textSearchUtils.findTextInPage).toHaveBeenCalledWith('Test', {
        prefix: undefined,
        suffix: undefined,
      });
    });

    test('should restore an element-container range through final text search fallback', async () => {
      const article = document.createElement('article');
      article.innerHTML = [
        '<p>Outside previous Target.</p>',
        '<span>before </span>',
        '<span>Target</span>',
        '<span> after</span>',
        '<p>Outside next Target.</p>',
      ].join('');
      document.body.append(article);

      const selectedRange = document.createRange();
      selectedRange.setStart(article, 2);
      selectedRange.setEnd(article, 3);

      pathUtils.getNodePath
        .mockReturnValueOnce([{ type: 'element', tag: 'article', index: 0 }])
        .mockReturnValueOnce([{ type: 'element', tag: 'article', index: 0 }]);
      const rangeInfo = serializeRange(selectedRange);

      const fallbackRange = document.createRange();
      fallbackRange.setStart(article.children[2].firstChild, 0);
      fallbackRange.setEnd(article.children[2].firstChild, 'Target'.length);

      pathUtils.getNodeByPath.mockReturnValue(null);
      domStabilityUtils.waitForDOMStability.mockResolvedValue(false);
      textSearchUtils.findTextInPage.mockReturnValue(fallbackRange);

      const restoredRange = await restoreRangeWithRetry(rangeInfo, 'Target', 1);

      expect(restoredRange).toBe(fallbackRange);
      expect(restoredRange.toString()).toBe('Target');
    });

    test('should pass serialized prefix and suffix to final text search fallback', async () => {
      const article = document.createElement('article');
      article.innerHTML = [
        '<p>Outside previous Target.</p>',
        '<span>before </span>',
        '<span>Target</span>',
        '<span> after</span>',
        '<p>Outside next Target.</p>',
      ].join('');
      document.body.append(article);

      const selectedRange = document.createRange();
      selectedRange.setStart(article, 2);
      selectedRange.setEnd(article, 3);

      pathUtils.getNodePath
        .mockReturnValueOnce([{ type: 'element', tag: 'article', index: 0 }])
        .mockReturnValueOnce([{ type: 'element', tag: 'article', index: 0 }]);
      const rangeInfo = serializeRange(selectedRange);

      pathUtils.getNodeByPath.mockReturnValue(null);
      domStabilityUtils.waitForDOMStability.mockResolvedValue(false);
      textSearchUtils.findTextInPage.mockReturnValue(null);

      await restoreRangeWithRetry(rangeInfo, 'Target', 1);

      expect(textSearchUtils.findTextInPage).toHaveBeenCalledWith('Target', {
        prefix: 'before ',
        suffix: ' after',
      });
    });

    test('should return null after all retries fail', async () => {
      const rangeInfo = {
        startContainerPath: [{ type: 'element', tag: 'div', index: 0 }],
        startOffset: 0,
        endContainerPath: [{ type: 'element', tag: 'div', index: 0 }],
        endOffset: 4,
      };

      pathUtils.getNodeByPath.mockReturnValue(null);
      domStabilityUtils.waitForDOMStability.mockResolvedValue(false);
      textSearchUtils.findTextInPage.mockReturnValue(null);

      const range = await restoreRangeWithRetry(rangeInfo, 'Test', 3);

      expect(range).toBeNull();
    });

    test('should not attempt DOM stability or text search when maxRetries is zero', async () => {
      const rangeInfo = {
        startContainerPath: [{ type: 'element', tag: 'div', index: 0 }],
        startOffset: 0,
        endContainerPath: [{ type: 'element', tag: 'div', index: 0 }],
        endOffset: 4,
        prefix: 'before',
        suffix: 'after',
      };

      pathUtils.getNodeByPath.mockReturnValue(null);

      const range = await restoreRangeWithRetry(rangeInfo, 'Test', 0);

      expect(range).toBeNull();
      expect(domStabilityUtils.waitForDOMStability).not.toHaveBeenCalled();
      expect(textSearchUtils.findTextInPage).not.toHaveBeenCalled();
    });
  });

  describe('findRangeByTextContent', () => {
    test('should find range by text', () => {
      const mockRange = document.createRange();
      textSearchUtils.findTextInPage.mockReturnValue(mockRange);

      const range = findRangeByTextContent('Test text');

      expect(range).toBe(mockRange);
      expect(textSearchUtils.findTextInPage).toHaveBeenCalledWith('Test text', {});
    });

    test('should return null for empty text', () => {
      const range = findRangeByTextContent('');
      expect(range).toBeNull();
    });

    test('should return null for non-string input', () => {
      const range = findRangeByTextContent(null);
      expect(range).toBeNull();
    });
  });

  describe('validateRange', () => {
    test('should validate range with correct text', () => {
      const div = document.createElement('div');
      div.textContent = 'Test content';
      document.body.append(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 4);

      const isValid = validateRange(range, 'Test');
      expect(isValid).toBe(true);
    });

    test('should return false for incorrect text', () => {
      const div = document.createElement('div');
      div.textContent = 'Test content';
      document.body.append(div);

      const range = document.createRange();
      range.setStart(div.firstChild, 0);
      range.setEnd(div.firstChild, 4);

      const isValid = validateRange(range, 'Wrong');
      expect(isValid).toBe(false);
    });

    test('should return false for null range', () => {
      const isValid = validateRange(null, 'Test');
      expect(isValid).toBe(false);
    });

    test('should handle errors gracefully', () => {
      const invalidRange = {
        toString: () => {
          throw new Error('Test error');
        },
      };

      const isValid = validateRange(invalidRange, 'Test');
      expect(isValid).toBe(false);
    });
  });
});
