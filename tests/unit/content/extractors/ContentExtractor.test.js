/**
 * @jest-environment jsdom
 */

// Mock dependencies before require
jest.mock('../../../../scripts/content/extractors/ReadabilityAdapter', () => ({
  readabilityAdapter: {
    parseArticleWithReadability: jest.fn(),
    isContentGood: jest.fn(),
    findContentCmsFallback: jest.fn(),
    extractLargestListFallback: jest.fn(),
  },
}));

jest.mock('../../../../scripts/content/extractors/MetadataExtractor', () => ({
  metadataExtractor: {
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

const { contentExtractor } = require('../../../../scripts/content/extractors/ContentExtractor');
const { readabilityAdapter } = require('../../../../scripts/content/extractors/ReadabilityAdapter');
const { metadataExtractor } = require('../../../../scripts/content/extractors/MetadataExtractor');
const pageComplexityDetector = require('../../../../scripts/utils/pageComplexityDetector');

global.Logger = {
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
    test('should use Readability when selected', async () => {
      // Setup mocks
      pageComplexityDetector.detectPageComplexity.mockReturnValue({});
      pageComplexityDetector.selectExtractor.mockReturnValue({
        extractor: 'readability',
        confidence: 80,
      });

      readabilityAdapter.parseArticleWithReadability.mockReturnValue({
        content: '<div>Article</div>',
        title: 'Title',
      });
      readabilityAdapter.isContentGood.mockReturnValue(true);

      metadataExtractor.extract.mockReturnValue({ title: 'Title' });

      const result = await contentExtractor.extract(document);

      expect(result.content).toBe('<div>Article</div>');
      expect(result.type).toBe('html');
      expect(readabilityAdapter.parseArticleWithReadability).toHaveBeenCalled();
    });

    test('should fallback to CMS content if Readability fails', async () => {
      pageComplexityDetector.detectPageComplexity.mockReturnValue({});
      pageComplexityDetector.selectExtractor.mockReturnValue({ extractor: 'readability' });

      readabilityAdapter.parseArticleWithReadability.mockReturnValue({});
      readabilityAdapter.isContentGood.mockReturnValue(false);
      readabilityAdapter.findContentCmsFallback.mockReturnValue('<div>CMS Content</div>');

      const result = await contentExtractor.extract(document);

      expect(result.content).toBe('<div>CMS Content</div>');
      expect(readabilityAdapter.findContentCmsFallback).toHaveBeenCalled();
    });

    test('should use Technical extraction when selected (extractus)', async () => {
      pageComplexityDetector.detectPageComplexity.mockReturnValue({});
      pageComplexityDetector.selectExtractor.mockReturnValue({ extractor: 'extractus' });

      // Mock DOM for technical content
      document.body.innerHTML = '<div class="markdown-body">Technical Content</div>';

      const result = await contentExtractor.extract(document);

      expect(result.content).toBe('Technical Content');
      expect(result.type).toBe('html');
      // Should NOT call Readability if successful
      expect(readabilityAdapter.parseArticleWithReadability).not.toHaveBeenCalled();
    });

    test('should fallback to Readability if Technical extraction fails', async () => {
      pageComplexityDetector.detectPageComplexity.mockReturnValue({});
      pageComplexityDetector.selectExtractor.mockReturnValue({ extractor: 'extractus' });

      // No technical content in DOM
      document.body.innerHTML = '<div>Normal Content</div>';

      readabilityAdapter.parseArticleWithReadability.mockReturnValue({
        content: '<div>Readability</div>',
      });
      readabilityAdapter.isContentGood.mockReturnValue(true);

      const result = await contentExtractor.extract(document);

      expect(result.content).toBe('<div>Readability</div>');
      expect(readabilityAdapter.parseArticleWithReadability).toHaveBeenCalled();
    });
  });
});
