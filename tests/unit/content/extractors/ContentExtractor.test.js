/**
 * @jest-environment jsdom
 */

// Mock dependencies before require
jest.mock('../../../../scripts/content/extractors/ReadabilityAdapter', () => {
  const parseArticleWithReadability = jest.fn();
  const isContentGood = jest.fn();
  const findContentCmsFallback = jest.fn();
  const extractLargestListFallback = jest.fn();

  return {
    parseArticleWithReadability,
    isContentGood,
    findContentCmsFallback,
    extractLargestListFallback,
    readabilityAdapter: {
      parseArticleWithReadability,
      isContentGood,
      findContentCmsFallback,
      extractLargestListFallback,
    },
    __esModule: true,
  };
});

jest.mock('../../../../scripts/content/extractors/MetadataExtractor', () => ({
  MetadataExtractor: {
    extract: jest.fn(),
  },
}));

jest.mock('../../../../scripts/content/extractors/NextJsExtractor', () => ({
  NextJsExtractor: {
    detect: jest.fn(),
    extract: jest.fn(),
  },
}));

// Mock pageComplexityDetector
jest.mock(
  '../../../../scripts/utils/pageComplexityDetector',
  () => ({
    detectPageComplexity: jest.fn(),
    selectExtractor: jest.fn(),
  }),
  { virtual: true }
);

const { ContentExtractor } = require('../../../../scripts/content/extractors/ContentExtractor');
const {
  parseArticleWithReadability,
  isContentGood,
  findContentCmsFallback,
  extractLargestListFallback,
} = require('../../../../scripts/content/extractors/ReadabilityAdapter');
const { MetadataExtractor } = require('../../../../scripts/content/extractors/MetadataExtractor');
const pageComplexityDetector = require('../../../../scripts/utils/pageComplexityDetector');

jest.mock('../../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    success: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
    info: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const Logger = require('../../../../scripts/utils/Logger.js').default;
globalThis.Logger = Logger;

describe('ContentExtractor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('extract', () => {
    test('should use Readability when selected', () => {
      // Setup mocks
      pageComplexityDetector.detectPageComplexity.mockReturnValue({});
      pageComplexityDetector.selectExtractor.mockReturnValue({
        extractor: 'readability',
        confidence: 80,
      });

      parseArticleWithReadability.mockReturnValue({
        content: '<div>Article</div>',
        title: 'Title',
      });
      isContentGood.mockReturnValue(true);

      MetadataExtractor.extract.mockReturnValue({ title: 'Title' });

      const result = ContentExtractor.extract(document);

      expect(result.content).toBe('<div>Article</div>');
      expect(result.type).toBe('html');
      expect(parseArticleWithReadability).toHaveBeenCalled();
    });

    test('should fallback to CMS content if Readability fails', () => {
      pageComplexityDetector.detectPageComplexity.mockReturnValue({});
      pageComplexityDetector.selectExtractor.mockReturnValue({ extractor: 'readability' });

      parseArticleWithReadability.mockReturnValue({});
      isContentGood.mockReturnValue(false);
      findContentCmsFallback.mockReturnValue('<div>CMS Content</div>');

      const result = ContentExtractor.extract(document);

      expect(result.content).toBe('<div>CMS Content</div>');
      expect(findContentCmsFallback).toHaveBeenCalled();
    });

    test('should fallback to List content if CMS fallback fails', () => {
      pageComplexityDetector.detectPageComplexity.mockReturnValue({});
      pageComplexityDetector.selectExtractor.mockReturnValue({ extractor: 'readability' });

      parseArticleWithReadability.mockReturnValue({});
      isContentGood.mockReturnValue(false);
      findContentCmsFallback.mockReturnValue(null);
      extractLargestListFallback.mockReturnValue('<ul><li>List Content</li></ul>');

      const result = ContentExtractor.extract(document);

      expect(result.content).toBe('<ul><li>List Content</li></ul>');
      expect(extractLargestListFallback).toHaveBeenCalled();
    });

    test('should use Technical extraction when selected (extractus)', () => {
      pageComplexityDetector.detectPageComplexity.mockReturnValue({});
      pageComplexityDetector.selectExtractor.mockReturnValue({ extractor: 'extractus' });

      // Mock DOM for technical content
      document.body.innerHTML = '<div class="markdown-body">Technical Content</div>';

      const result = ContentExtractor.extract(document);

      expect(result.content).toBe('Technical Content');
      expect(result.type).toBe('html');
      // Should NOT call Readability if successful
      expect(parseArticleWithReadability).not.toHaveBeenCalled();
    });

    test('should fallback to Readability if Technical extraction fails', () => {
      pageComplexityDetector.detectPageComplexity.mockReturnValue({});
      pageComplexityDetector.selectExtractor.mockReturnValue({ extractor: 'extractus' });

      // No technical content in DOM
      document.body.innerHTML = '<div>Normal Content</div>';

      parseArticleWithReadability.mockReturnValue({
        content: '<div>Readability</div>',
      });
      isContentGood.mockReturnValue(true);

      const result = ContentExtractor.extract(document);

      expect(result.content).toBe('<div>Readability</div>');
      expect(parseArticleWithReadability).toHaveBeenCalled();
    });

    test('should handle Next.js detection errors gracefully', () => {
      // Mock NextJsExtractor to throw
      const { NextJsExtractor } = require('../../../../scripts/content/extractors/NextJsExtractor');
      NextJsExtractor.detect.mockImplementationOnce(() => {
        throw new Error('Next.js Error');
      });

      // Mock standard extraction flow
      pageComplexityDetector.detectPageComplexity.mockReturnValue({});
      pageComplexityDetector.selectExtractor.mockReturnValue({
        extractor: 'readability',
      });
      parseArticleWithReadability.mockReturnValue({ content: 'Fallback' });
      isContentGood.mockReturnValue(true);

      const result = ContentExtractor.extract(document);

      expect(result.content).toBe('Fallback');
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Next.js detection/extraction failed'),
        expect.objectContaining({ error: 'Next.js Error' })
      );
    });

    test('should handle Readability parsing errors gracefully in extractReadability', () => {
      // This tests the try-catch block inside extractReadability
      pageComplexityDetector.detectPageComplexity.mockReturnValue({});
      pageComplexityDetector.selectExtractor.mockReturnValue({ extractor: 'readability' });

      // Mock parseArticleWithReadability to throw
      parseArticleWithReadability.mockImplementationOnce(() => {
        throw new Error('Readability Error');
      });

      // Should attempt fallback
      findContentCmsFallback.mockReturnValue('CMS Fallback');

      const result = ContentExtractor.extract(document);

      expect(result.content).toBe('CMS Fallback');
      expect(Logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Readability 解析失敗'),
        expect.any(Object)
      );
    });
  });
});
