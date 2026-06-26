/**
 * @jest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const loggerMock = {
  debug: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
};

const sanitizeUrlForLoggingMock = jest.fn(url => `[safe]${url}`);
const extractImageSrcMock = jest.fn(node => node?.getAttribute?.('src') || node?.src || '');
const cleanImageUrlMock = jest.fn(url => String(url || '').replace(/\?.*$/, ''));
const isTemporaryImageUrlMock = jest.fn(() => false);
const batchProcessMock = jest.fn(async (items, worker) => Promise.all(items.map(worker)));
const batchProcessWithRetryMock = jest.fn(async (items, worker) => ({
  results: await Promise.all(items.map(worker)),
}));

await jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
  default: loggerMock,
}));

await jest.unstable_mockModule('../../../scripts/utils/LogSanitizer.js', () => ({
  sanitizeUrlForLogging: sanitizeUrlForLoggingMock,
}));

await jest.unstable_mockModule('../../../scripts/utils/contentUtils.js', () => ({
  isTitleConsistent: jest.fn(() => false),
}));

await jest.unstable_mockModule('../../../scripts/utils/urlUtils.js', () => ({
  isRootUrl: jest.fn(url => url === 'https://example.com/'),
}));

await jest.unstable_mockModule('../../../scripts/utils/imageUtils.js', () => ({
  IMAGE_ATTRIBUTES: ['data-src', 'src'],
  cleanImageUrl: cleanImageUrlMock,
  extractImageSrc: extractImageSrcMock,
  isValidCleanedImageUrl: jest.fn(url => String(url || '').startsWith('https://')),
  isValidImageUrl: jest.fn(url => String(url || '').startsWith('http')),
}));

await jest.unstable_mockModule('../../../scripts/utils/temporaryImageUrl.js', () => ({
  isTemporaryImageUrl: isTemporaryImageUrlMock,
}));

await jest.unstable_mockModule('../../../scripts/utils/ErrorHandler.js', () => ({
  ErrorHandler: {
    logError: jest.fn(),
  },
}));

await jest.unstable_mockModule('../../../scripts/performance/PerformanceOptimizer.js', () => ({
  batchProcess: batchProcessMock,
  batchProcessWithRetry: batchProcessWithRetryMock,
}));

globalThis.Logger = loggerMock;

const { ConverterFactory } = await import('../../../scripts/content/converters/ConverterFactory.js');
const { ImageCollector } = await import('../../../scripts/content/extractors/ImageCollector.js');
const { MarkdownExtractor } = await import('../../../scripts/content/extractors/MarkdownExtractor.js');
const { MetadataExtractor } = await import('../../../scripts/content/extractors/MetadataExtractor.js');
const {
  cachedQuery,
  isContentGood,
} = await import('../../../scripts/content/extractors/ReadabilityAdapter.js');
const {
  findArticleData,
  getAppRouterData,
  getPagesRouterData,
  parseAppRouterScript,
} = await import('../../../scripts/content/extractors/NextJsDataResolver.js');
const { convertBbcBlocks, isBbcFormat } = await import(
  '../../../scripts/content/extractors/blocks/BbcBlockConverter.js'
);
const { convertStoryAtoms } = await import(
  '../../../scripts/content/extractors/blocks/StoryAtomsConverter.js'
);
const { buildTemporaryImagePlaceholderBlock } = await import(
  '../../../scripts/content/extractors/temporaryImagePlaceholder.js'
);
const {
  sanitizeAiOutputHtml,
  sanitizeArticleHtml,
  sanitizeHtmlToText,
} = await import('../../../scripts/content/sanitizers/htmlSanitizer.js');
const { CONTENT_BRIDGE_ACTIONS } = await import(
  '../../../scripts/config/runtimeActions/contentBridgeActions.js'
);
const { HIGHLIGHTER_ACTIONS } = await import(
  '../../../scripts/config/runtimeActions/highlighterActions.js'
);
const {
  activateFloatingRailHighlighting,
  createContentRuntimeMessageHandler,
} = await import('../../../scripts/content/runtimeMessageHandlers.js');

const richTextChunkBuilder = text => [{ type: 'text', text: { content: text } }];
const stripHtml = html => String(html || '').replaceAll(/<[^>]+>/g, '');

beforeEach(() => {
  globalThis.Logger = loggerMock;
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.title = 'Native ESM Content';
  jest.clearAllMocks();
  cleanImageUrlMock.mockImplementation(url => String(url || '').replace(/\?.*$/, ''));
  extractImageSrcMock.mockImplementation(node => node?.getAttribute?.('src') || node?.src || '');
  isTemporaryImageUrlMock.mockReturnValue(false);
});

afterEach(() => {
  delete globalThis.Logger;
});

describe('remaining content native ESM diagnostics', () => {
  test('content converters, sanitizers, and markdown extraction execute real source modules', () => {
    document.body.innerHTML = `
      <article class="markdown-body">
        <h1>Native ESM</h1>
        <script>alert("xss")</script>
        <pre><code>const ok = true;</code></pre>
      </article>
    `;

    const converter = ConverterFactory.getConverter('markdown');
    expect(converter).toEqual(expect.objectContaining({ convert: expect.any(Function) }));

    const markdownResult = MarkdownExtractor.extract(document);
    expect(markdownResult).toEqual(
      expect.objectContaining({
        rawArticle: expect.objectContaining({ byline: 'MarkdownExtractor' }),
        type: 'html',
      })
    );
    expect(markdownResult.content).toContain('Native ESM');
    expect(markdownResult.content).not.toContain('<script>');

    expect(sanitizeArticleHtml('<p onclick="x()">Safe</p><script>x()</script>')).toBe(
      '<p>Safe</p>'
    );
    expect(sanitizeAiOutputHtml('<a href="javascript:alert(1)">bad</a>')).toEqual({
      html: '<a>bad</a>',
      success: true,
    });
    expect(sanitizeHtmlToText('<p>Tom &amp; Jerry</p>')).toBe('Tom & Jerry');
  });

  test('metadata, featured image, BBC, StoryAtoms, and placeholder helpers execute', () => {
    document.head.innerHTML = `
      <title>Native ESM Content</title>
      <meta name="author" content="Reporter">
      <meta name="description" content="Summary">
      <meta property="og:image" content="https://example.com/cover.jpg?utm=1">
      <link rel="apple-touch-icon" sizes="180x180" href="/apple.png">
    `;
    document.body.innerHTML = `
      <main>
        <div class="featured-image">
          <img src="https://example.com/cover.jpg?utm=1" width="600" height="400">
        </div>
      </main>
    `;

    const metadata = MetadataExtractor.extract(document, { title: 'Readable', byline: 'Writer' });
    expect(metadata).toEqual(
      expect.objectContaining({
        author: 'Writer',
        description: 'Summary',
        featuredImage: 'https://example.com/cover.jpg?utm=1',
        title: 'Native ESM Content',
      })
    );
    expect(ImageCollector.collectFeaturedImage()).toBe('https://example.com/cover.jpg');

    const bbcBlocks = [
      { type: 'headline', model: { text: 'BBC title' } },
      {
        type: 'text',
        model: { blocks: [{ type: 'paragraph', model: { text: 'BBC body' } }] },
      },
    ];
    expect(isBbcFormat(bbcBlocks)).toBe(true);
    expect(convertBbcBlocks(bbcBlocks, { richTextChunkBuilder }).map(block => block.type)).toEqual(
      ['heading_1', 'paragraph']
    );

    const storyBlocks = convertStoryAtoms(
      [
        { type: 'text', tagName: 'h2', content: '<strong>Story heading</strong>' },
        { type: 'image', url: 'https://example.com/story.jpg', caption: 'Caption' },
      ],
      { richTextChunkBuilder, stripHtml }
    );
    expect(storyBlocks.map(block => block.type)).toEqual(['heading_2', 'image']);
    expect(buildTemporaryImagePlaceholderBlock('blob:https://example.com/id', { alt: 'Cover' }))
      .toEqual(expect.objectContaining({ type: 'paragraph' }));
  });

  test('Next.js data resolver and Readability helper paths execute under jsdom', () => {
    document.body.innerHTML = String.raw`
      <script id="__NEXT_DATA__" type="application/json">
        {"props":{"pageProps":{"article":{"content":"body"}}}}
      </script>
      <script>self.__next_f.push([1,"3:{\"content\":\"app body\"}\n"])</script>
      <main><p>${'x'.repeat(400)}</p></main>
    `;

    expect(getPagesRouterData(document)).toEqual(
      expect.objectContaining({ props: expect.any(Object) })
    );
    expect(getAppRouterData(document)).toEqual(
      expect.objectContaining({ appRouterFragments: expect.any(Array) })
    );
    expect(
      parseAppRouterScript(String.raw`self.__next_f.push([1,"3:{\"body\":\"rsc\"}\n"])`)
    ).toEqual([{ body: 'rsc' }]);
    expect(findArticleData({ props: { pageProps: { article: { content: 'body' } } } })).toEqual({
      content: 'body',
    });
    expect(cachedQuery('main', document, { single: true }).tagName).toBe('MAIN');
    expect(isContentGood({ content: `<p>${'x'.repeat(400)}</p>` })).toBe(true);
  });

  test('content runtime router dispatches ping, stable URL, highlight DOM, and activation actions', async () => {
    const rail = { activateHighlighting: jest.fn() };
    const revealFloatingRail = jest.fn(() => Promise.resolve());
    await activateFloatingRailHighlighting(rail, { revealFloatingRail });
    expect(rail.activateHighlighting).toHaveBeenCalled();

    let stableUrl = null;
    const manager = { removeHighlight: jest.fn(() => true) };
    const toast = { show: jest.fn() };
    const handler = createContentRuntimeMessageHandler({
      getHighlighterRuntime: () => ({ manager, toast }),
      getPreloaderCache: () => ({ nextRouteInfo: { path: '/article' }, shortlink: 'https://ex.am/p' }),
      getStableUrl: () => stableUrl,
      isBundleReady: () => true,
      logger: loggerMock,
      revealFloatingRail,
      setStableUrl: url => {
        stableUrl = url;
      },
      withAvailableFloatingRail: (sendResponse, callback) => {
        callback?.(rail);
        sendResponse({ success: true });
      },
    });

    const pingResponse = jest.fn();
    expect(handler({ action: CONTENT_BRIDGE_ACTIONS.PING }, {}, pingResponse)).toBe(true);
    expect(pingResponse).toHaveBeenCalledWith(
      expect.objectContaining({ hasCache: true, status: 'bundle_ready' })
    );

    const setResponse = jest.fn();
    expect(
      handler(
        { action: CONTENT_BRIDGE_ACTIONS.SET_STABLE_URL, stableUrl: 'https://example.com/post' },
        {},
        setResponse
      )
    ).toBe(true);
    expect(setResponse).toHaveBeenCalledWith({ success: true });

    const removeResponse = jest.fn();
    expect(
      handler(
        { action: HIGHLIGHTER_ACTIONS.REMOVE_HIGHLIGHT_DOM, highlightId: 'h1' },
        {},
        removeResponse
      )
    ).toBe(true);
    expect(manager.removeHighlight).toHaveBeenCalledWith('h1');
    expect(removeResponse).toHaveBeenCalledWith({ success: true });

    expect(
      handler({ action: CONTENT_BRIDGE_ACTIONS.SHOW_TOAST, level: 'error', messageKey: 'X' }, {}, jest.fn())
    ).toBe(false);
    expect(toast.show).toHaveBeenCalledWith('X', { level: 'error' });
  });
});
