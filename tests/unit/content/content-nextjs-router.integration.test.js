/**
 * @jest-environment jsdom
 */

jest.mock('../../../scripts/content/extractors/ReadabilityAdapter.js', () => ({
  parseArticleWithReadability: jest.fn(),
  isContentGood: jest.fn(() => false),
  findContentCmsFallback: jest.fn(() => null),
  extractLargestListFallback: jest.fn(() => null),
}));

jest.mock('../../../scripts/content/extractors/MetadataExtractor.js', () => ({
  MetadataExtractor: {
    extract: jest.fn(() => ({
      title: 'Document Title',
      url: 'https://example.com/news/current',
      author: null,
      description: null,
      favicon: null,
      siteIcon: null,
      featuredImage: null,
    })),
  },
}));

jest.mock('../../../scripts/content/extractors/MarkdownExtractor.js', () => ({
  MarkdownExtractor: {
    extract: jest.fn(() => null),
  },
}));

jest.mock('../../../scripts/utils/pageComplexityDetector.js', () => ({
  detectPageComplexity: jest.fn(() => ({})),
  selectExtractor: jest.fn(() => ({ extractor: 'readability', confidence: 0 })),
}));

jest.mock('../../../scripts/highlighter/utils/domStability.js', () => ({
  waitForDOMStability: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../scripts/utils/Logger.js', () => ({
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

const { ContentExtractor } = require('../../../scripts/content/extractors/ContentExtractor.js');

describe('ContentExtractor Next.js router integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    document.title = 'Current Article | Site';
    globalThis.history.replaceState({}, '', '/news/current');
    delete globalThis.next;
    globalThis.fetch = jest.fn();
  });

  afterEach(() => {
    delete globalThis.next;
    delete globalThis.fetch;
  });

  test('extractAsync 在 stale next-data 情境下使用當前 router component', async () => {
    const nextScript = document.createElement('script');
    nextScript.id = '__NEXT_DATA__';
    nextScript.type = 'application/json';
    nextScript.textContent = JSON.stringify({
      page: '/',
      asPath: '/',
      buildId: 'build-1',
      props: {
        initialProps: {
          pageProps: {},
        },
      },
    });
    document.body.append(nextScript);

    globalThis.next = {
      router: {
        pathname: '/news/[slug]',
        components: {
          '/': {
            props: {
              initialProps: {
                pageProps: {
                  home: true,
                },
              },
            },
          },
          '/news/[slug]': {
            props: {
              initialProps: {
                pageProps: {
                  article: {
                    title: 'Current Article',
                    blocks: [
                      { blockType: 'paragraph', text: 'P1' },
                      { blockType: 'paragraph', text: 'P2' },
                      { blockType: 'paragraph', text: 'P3' },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = await ContentExtractor.extractAsync(document);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result.type).toBe('nextjs');
    expect(result.metadata.title).toBe('Current Article');
    expect(result.blocks).toHaveLength(3);
  });
});
