/**
 * @jest-environment node
 */

// Mock Logger and securityUtils
jest.mock('../../../scripts/utils/Logger.js', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../../scripts/utils/securityUtils.js', () => ({
  sanitizeUrlForLogging: jest.fn(url => url),
}));

jest.mock('../../../scripts/config/shared/content.js', () => ({
  EMBEDDED_URL_ENCODED_HTTP_PROTOCOL_REGEX: /https?%3A%2F%2F/i,
  IMAGE_VALIDATION: {
    MAX_RECURSION_DEPTH: 5,
    MAX_URL_LENGTH: 2000,
    SRCSET_WIDTH_MULTIPLIER: 1000,
  },
}));

// Mock SrcsetParser as it might not be defined
global.SrcsetParser = undefined;

const imageUtils = require('../../../scripts/utils/imageUtils.js');
const { extractBestUrlFromSrcset } = imageUtils;
const Logger = require('../../../scripts/utils/Logger.js');

describe('extractBestUrlFromSrcset - Maximized Coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.SrcsetParser = undefined;
  });

  describe('Primary logic and Fallback', () => {
    test('should use fallback logic when no metrics are provided', () => {
      const srcset = 'https://example.com/1.jpg, https://example.com/2.jpg';
      const result = extractBestUrlFromSrcset(srcset);
      expect(result).toBe('https://example.com/2.jpg');
    });

    test('should skip entries with 0 metric and find the one with positive metric', () => {
      const srcset = 'https://example.com/0.jpg 0w, https://example.com/1.jpg 100w, https://example.com/00.jpg 0x';
      const result = extractBestUrlFromSrcset(srcset);
      expect(result).toBe('https://example.com/1.jpg');
    });

    test('should handle srcset with all zero metrics by using fallback to the last valid entry', () => {
      const srcset = 'https://example.com/a.jpg 0w, https://example.com/b.jpg 0x';
      const result = extractBestUrlFromSrcset(srcset);
      expect(result).toBe('https://example.com/b.jpg');
    });

    test('fallback logic should skip empty entries and break correctly', () => {
      const srcset = 'https://example.com/1.jpg, , https://example.com/2.jpg, ,';
      const result = extractBestUrlFromSrcset(srcset);
      expect(result).toBe('https://example.com/2.jpg');
    });

    test('should handle data: URLs by skipping them in _parseSrcsetEntry', () => {
      // data: URLs are skipped in _parseSrcsetEntry and fallback logic (if they are the only thing)
      const srcset = 'data:image/png;base64,xxxx 100w, https://example.com/real.jpg 200w';
      const result = extractBestUrlFromSrcset(srcset);
      expect(result).toBe('https://example.com/real.jpg');
    });

    test('should return data: URL in fallback if only data: URLs are present', () => {
      const srcset = 'data:image/png;base64,xxxx 100w';
      const result = extractBestUrlFromSrcset(srcset);
      expect(result).toBe('data:image/png;base64,xxxx');
    });

    test('should handle entries without URL in split', () => {
        // This exercises "if (!url || url.startsWith('data:'))" return null
        const srcset = ' , https://example.com/1.jpg';
        const result = extractBestUrlFromSrcset(srcset);
        expect(result).toBe('https://example.com/1.jpg');
    });
  });

  describe('SrcsetParser Integration', () => {
    test('should use SrcsetParser if available and successful', () => {
      global.SrcsetParser = {
        parse: jest.fn().mockReturnValue('https://example.com/best-from-parser.jpg'),
      };
      const srcset = 'https://example.com/1.jpg 1x, https://example.com/2.jpg 2x';
      const result = extractBestUrlFromSrcset(srcset);
      expect(result).toBe('https://example.com/best-from-parser.jpg');
      expect(global.SrcsetParser.parse).toHaveBeenCalledWith(srcset, expect.any(Object));
    });

    test('should fallback to manual parsing if SrcsetParser.parse returns null', () => {
      global.SrcsetParser = {
        parse: jest.fn().mockReturnValue(null),
      };
      const srcset = 'https://example.com/fallback.jpg 1x';
      const result = extractBestUrlFromSrcset(srcset);
      expect(result).toBe('https://example.com/fallback.jpg');
    });

    test('should log error and fallback to manual parsing if SrcsetParser.parse throws', () => {
      global.SrcsetParser = {
        parse: jest.fn().mockImplementation(() => {
          throw new Error('Parser crashed');
        }),
      };
      const srcset = 'https://example.com/safe.jpg 1x';
      const result = extractBestUrlFromSrcset(srcset);
      expect(result).toBe('https://example.com/safe.jpg');
      expect(Logger.error).toHaveBeenCalledWith('SrcsetParser 失敗', expect.objectContaining({
        error: 'Parser crashed'
      }));
    });
  });

  describe('Edge Cases for extractBestUrlFromSrcset', () => {
    test('should return null for non-string input', () => {
      expect(extractBestUrlFromSrcset(null)).toBeNull();
      expect(extractBestUrlFromSrcset(undefined)).toBeNull();
      expect(extractBestUrlFromSrcset(123)).toBeNull();
    });

    test('should return null for empty string', () => {
      expect(extractBestUrlFromSrcset('')).toBeNull();
    });

    test('should handle single x descriptor', () => {
        const srcset = 'https://example.com/image.jpg 2x';
        const result = extractBestUrlFromSrcset(srcset);
        expect(result).toBe('https://example.com/image.jpg');
    });

    test('should handle mixed descriptors and pick best', () => {
        const srcset = 'https://e.com/1.jpg 100w, https://e.com/2.jpg 2x';
        // 100w -> 100000
        // 2x -> 2
        const result = extractBestUrlFromSrcset(srcset);
        expect(result).toBe('https://e.com/1.jpg');
    });
  });
});
