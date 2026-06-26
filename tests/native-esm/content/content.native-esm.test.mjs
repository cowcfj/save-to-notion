/**
 * @jest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const loggerMock = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  ready: jest.fn(),
  start: jest.fn(),
  success: jest.fn(),
  warn: jest.fn(),
};

const parseArticleWithReadabilityMock = jest.fn();
const isContentGoodMock = jest.fn();
const findContentCmsFallbackMock = jest.fn();
const extractLargestListFallbackMock = jest.fn();
const metadataExtractMock = jest.fn();
const markdownExtractMock = jest.fn();
const detectPageComplexityMock = jest.fn();
const selectExtractorMock = jest.fn();
const waitForDOMStabilityMock = jest.fn();
const sanitizeArticleHtmlMock = jest.fn(html => html);
const isTitleConsistentMock = jest.fn(() => true);

await jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
  default: loggerMock,
}));

await jest.unstable_mockModule('../../../scripts/utils/LogSanitizer.js', () => ({
  sanitizeUrlForLogging: jest.fn(url => url),
}));

await jest.unstable_mockModule('../../../scripts/utils/contentUtils.js', () => ({
  isTitleConsistent: isTitleConsistentMock,
}));

await jest.unstable_mockModule('../../../scripts/content/sanitizers/htmlSanitizer.js', () => ({
  sanitizeArticleHtml: sanitizeArticleHtmlMock,
}));

await jest.unstable_mockModule('../../../scripts/content/extractors/ReadabilityAdapter.js', () => ({
  extractLargestListFallback: extractLargestListFallbackMock,
  findContentCmsFallback: findContentCmsFallbackMock,
  isContentGood: isContentGoodMock,
  parseArticleWithReadability: parseArticleWithReadabilityMock,
}));

await jest.unstable_mockModule('../../../scripts/content/extractors/MetadataExtractor.js', () => ({
  MetadataExtractor: {
    extract: metadataExtractMock,
  },
}));

await jest.unstable_mockModule('../../../scripts/content/extractors/MarkdownExtractor.js', () => ({
  MarkdownExtractor: {
    extract: markdownExtractMock,
  },
}));

await jest.unstable_mockModule('../../../scripts/utils/pageComplexityDetector.js', () => ({
  detectPageComplexity: detectPageComplexityMock,
  selectExtractor: selectExtractorMock,
}));

await jest.unstable_mockModule('../../../scripts/highlighter/utils/domStability.js', () => ({
  waitForDOMStability: waitForDOMStabilityMock,
}));

const { ContentExtractor } = await import('../../../scripts/content/extractors/ContentExtractor.js');
const { NextJsExtractor } = await import('../../../scripts/content/extractors/NextJsExtractor.js');
const { domConverter } = await import('../../../scripts/content/converters/DomConverter.js');

globalThis.Logger = loggerMock;
globalThis.ImageUtils = {
  cleanImageUrl: jest.fn(url => url),
  extractImageSrc: jest.fn(node => node?.getAttribute?.('src') || ''),
  isNotionCompatibleImageUrl: jest.fn(() => true),
  isValidCleanedImageUrl: jest.fn(() => true),
};

await import('../../../scripts/content/converters/ContentBridge.js');

function createParagraphBlock(content) {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content } }],
    },
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.title = 'Native ESM Document';
  parseArticleWithReadabilityMock.mockReturnValue({
    content: '<article><h1>Native ESM</h1><p>Body</p></article>',
    title: 'Readable Article',
  });
  isContentGoodMock.mockReturnValue(true);
  findContentCmsFallbackMock.mockReturnValue(null);
  extractLargestListFallbackMock.mockReturnValue(null);
  metadataExtractMock.mockReturnValue({
    siteIcon: 'https://example.com/icon.png',
    title: 'Native ESM Document',
  });
  markdownExtractMock.mockReturnValue(null);
  detectPageComplexityMock.mockReturnValue({ score: 12, type: 'article' });
  selectExtractorMock.mockReturnValue({ confidence: 93, extractor: 'readability' });
  waitForDOMStabilityMock.mockResolvedValue(true);
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('content native ESM diagnostics', () => {
  test('ContentExtractor executes the standard Readability path with mocked boundary deps', () => {
    const result = ContentExtractor.extract(document);

    expect(detectPageComplexityMock).toHaveBeenCalledWith(document);
    expect(parseArticleWithReadabilityMock).toHaveBeenCalledWith(document);
    expect(metadataExtractMock).toHaveBeenCalledWith(
      document,
      expect.objectContaining({ title: 'Readable Article' })
    );
    expect(result).toMatchObject({
      content: '<article><h1>Native ESM</h1><p>Body</p></article>',
      debug: {
        complexity: { score: 12, type: 'article' },
        selection: { confidence: 93, extractor: 'readability' },
      },
      metadata: {
        siteIcon: 'https://example.com/icon.png',
        title: 'Native ESM Document',
      },
      type: 'html',
    });
  });

  test('NextJsExtractor detects pages-router and app-router markers without CJS fallback', () => {
    document.body.innerHTML = '<script id="__NEXT_DATA__" type="application/json">{}</script>';
    expect(NextJsExtractor.detect(document)).toBe(true);

    document.body.innerHTML = '<script>self.__next_f.push([1,"payload"])</script>';
    expect(NextJsExtractor.detect(document)).toBe(true);

    document.body.innerHTML = '<main>No framework marker</main>';
    expect(NextJsExtractor.detect(document)).toBe(false);
    expect(NextJsExtractor._isAsPathMatch('/article?x=1', '/article')).toBe(true);
    expect(NextJsExtractor._buildNextDataUrl('https://example.com', '/post/', 'build-id')).toBe(
      'https://example.com/_next/data/build-id/post.json'
    );
  });

  test('DomConverter converts sanitized HTML into Notion blocks through native ESM', () => {
    const blocks = domConverter.convert('<h1>Title</h1><p>Body</p>');

    expect(sanitizeArticleHtmlMock).toHaveBeenCalledWith('<h1>Title</h1><p>Body</p>');
    expect(blocks.map(block => block.type)).toEqual(['heading_1', 'paragraph']);
    expect(blocks[0].heading_1.rich_text[0].text.content).toBe('Title');
    expect(blocks[1].paragraph.rich_text[0].text.content).toBe('Body');
  });

  test('ContentBridge exposes browser globals and inserts metadata blocks', () => {
    const htmlConverter = {
      convert: jest.fn(() => [createParagraphBlock('Body')]),
    };

    const result = globalThis.bridgeContentToBlocks(
      {
        content: '<p>Body</p>',
        metadata: {
          featuredImage: 'https://example.com/cover.png',
          favicon: 'https://example.com/favicon.ico',
          title: 'Bridge Title',
        },
        rawArticle: null,
        type: 'html',
      },
      { htmlConverter, includeFeaturedImage: true, includeTitle: true }
    );

    expect(htmlConverter.convert).toHaveBeenCalledWith('<p>Body</p>');
    expect(result.title).toBe('Bridge Title');
    expect(result.siteIcon).toBe('https://example.com/favicon.ico');
    expect(result.blocks.map(block => block.type)).toEqual(['image', 'heading_1', 'paragraph']);
    expect(result.blocks[0].image.external.url).toBe('https://example.com/cover.png');
  });
});
