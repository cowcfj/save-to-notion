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

globalThis.Logger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

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
  });
});
