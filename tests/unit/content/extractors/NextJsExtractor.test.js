/**
 * @jest-environment jsdom
 */

import Logger from '../../../../scripts/utils/Logger.js';
import { sanitizeUrlForLogging } from '../../../../scripts/utils/LogSanitizer.js';
import { NextJsExtractor } from '../../../../scripts/content/extractors/NextJsExtractor.js';
import { NEXTJS_CONFIG } from '../../../../scripts/config/shared/content.js';
import yahooNewsRscFixture from '../../../fixtures/json/nextjs-rsc-yahoo-news.json';

// Mock Logger to avoid cluttering test output
jest.mock('../../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
    success: jest.fn(),
  },
}));

jest.mock('../../../../scripts/utils/LogSanitizer.js', () => ({
  sanitizeUrlForLogging: jest.fn((url, baseOrigin = 'http://localhost') => {
    if (url == null || url === '') {
      return '[empty-url]';
    }

    const hasScheme = /^[a-zA-Z][\w+.-]*:/.test(url);
    const isRelative = /^(?:[/?#]|\.\.?\/)/.test(url) || (!hasScheme && url.includes('/'));

    if (hasScheme) {
      return new URL(url).toString();
    }

    if (isRelative) {
      return new URL(url, baseOrigin || 'http://localhost').toString();
    }

    return '[invalid-url]';
  }),
}));

describe('NextJsExtractor', () => {
  let mockDoc;

  // 建立 Pages Router __NEXT_DATA__ payload；callers 可選擇性疊加 asPath / page / 額外欄位
  const buildPagesRouterData = (article, extra = {}) => ({
    props: { initialProps: { pageProps: { article } } },
    ...extra,
  });

  // 建立首頁 stale __NEXT_DATA__ (用於 _fetchNextData fallback / router-component 測試)
  const buildStaleNextData = (overrides = {}) => ({
    page: '/',
    asPath: '/',
    buildId: 'build123',
    props: { initialProps: { pageProps: {} } },
    ...overrides,
  });

  // 建立 doc.defaultView.next.router.components map；route 預設 '/article'
  const buildRouterComponents = componentsMap => ({
    router: { components: componentsMap },
  });

  // pageProps wrapper：用於 components map 內的 component value
  const buildRouterComponentValue = pageProps => ({
    props: { initialProps: { pageProps } },
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockDoc = {
      getElementById: jest.fn(),
      querySelector: jest.fn(),
      querySelectorAll: jest.fn().mockReturnValue([]),
      defaultView: { location: { origin: 'https://example.com', pathname: '/' } },
    };
  });

  describe('detect', () => {
    it('should return true if __NEXT_DATA__ script exists', () => {
      mockDoc.querySelector.mockReturnValue({}); // Mock finding the element
      expect(NextJsExtractor.detect(mockDoc)).toBe(true);
      expect(mockDoc.querySelector).toHaveBeenCalledWith('#__NEXT_DATA__');
    });

    it('should return false if __NEXT_DATA__ script does not exist', () => {
      mockDoc.querySelector.mockReturnValue(null);
      // Ensure querySelectorAll returns empty to avoid accidental App Router detection
      mockDoc.querySelectorAll.mockReturnValue([]);
      expect(NextJsExtractor.detect(mockDoc)).toBe(false);
    });

    it('should return true if App Router script exists', () => {
      mockDoc.querySelector.mockReturnValue(null);
      mockDoc.querySelectorAll.mockReturnValue([
        { textContent: 'self.__next_f.push([1, "r:data"])' },
      ]);
      expect(NextJsExtractor.detect(mockDoc)).toBe(true);
    });
  });

  describe('extract', () => {
    it('should return null if script tag is missing', () => {
      mockDoc.querySelector.mockReturnValue(null);
      expect(NextJsExtractor.extract(mockDoc)).toBeNull();
    });

    it('should return null when asPath does not match current URL (SPA navigation)', () => {
      // 模擬 SPA 導航：asPath 是舊文章，pathname 是新文章
      mockDoc.defaultView.location.pathname =
        '/%E7%A4%BE%E6%9C%83%E6%96%B0%E8%81%9E/60321104/new-article';

      const mockJson = buildPagesRouterData(
        { title: 'Old Article', blocks: [] },
        {
          asPath: '/%E7%A4%BE%E6%9C%83%E6%96%B0%E8%81%9E/60320801/old-article',
          page: '/article',
        }
      );

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });
      expect(NextJsExtractor.extract(mockDoc)).toBeNull();
    });

    it('should sanitize SPA navigation warning log context keys', () => {
      mockDoc.defaultView.location.pathname = '/new-article';

      const mockJson = buildPagesRouterData(
        { title: 'Old Article', blocks: [] },
        { asPath: '/old-article', page: '/article' }
      );

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });
      expect(NextJsExtractor.extract(mockDoc)).toBeNull();

      expect(Logger.warn).toHaveBeenCalledWith('SPA 導航偵測：__NEXT_DATA__.asPath 數據已過時', {
        action: '_validatePagesRouterData',
        page: sanitizeUrlForLogging(mockJson.page, mockDoc.defaultView.location.origin),
        asPath: sanitizeUrlForLogging(mockJson.asPath, mockDoc.defaultView.location.origin),
        currentPath: sanitizeUrlForLogging(
          mockDoc.defaultView.location.pathname,
          mockDoc.defaultView.location.origin
        ),
      });
    });

    it('should sanitize SPA home-page log context keys with the same shape', () => {
      mockDoc.defaultView.location.pathname = '/news/article';

      const mockJson = buildPagesRouterData(
        { title: 'Home payload', blocks: [] },
        { asPath: '/', page: '/' }
      );

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });
      expect(NextJsExtractor.extract(mockDoc)).toBeNull();

      expect(Logger.info).toHaveBeenCalledWith(
        'SPA 導航偵測：__NEXT_DATA__ 為首頁資料，跳過結構化提取',
        {
          action: '_validatePagesRouterData',
          page: sanitizeUrlForLogging(mockJson.page, mockDoc.defaultView.location.origin),
          asPath: sanitizeUrlForLogging(mockJson.asPath, mockDoc.defaultView.location.origin),
          currentPath: sanitizeUrlForLogging(
            mockDoc.defaultView.location.pathname,
            mockDoc.defaultView.location.origin
          ),
        }
      );
    });

    it('should extract normally when asPath matches current URL', () => {
      const path = '/%E7%A4%BE%E6%9C%83%E6%96%B0%E8%81%9E/60320801/article-slug';
      mockDoc.defaultView.location.pathname = path;

      const mockJson = buildPagesRouterData(
        {
          title: 'Same Article',
          blocks: [
            { blockType: 'paragraph', text: 'Para 1' },
            { blockType: 'paragraph', text: 'Para 2' },
            { blockType: 'paragraph', text: 'Para 3' },
          ],
        },
        { asPath: path, page: '/article' }
      );

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });
      const result = NextJsExtractor.extract(mockDoc);
      expect(result).not.toBeNull();
      expect(result.metadata.title).toBe('Same Article');
    });

    it('should return null when asPath is missing and title is inconsistent (SPA navigation)', () => {
      // 模擬：無 asPath (如 HK01)，且 document.title 已更新但 article.title 是舊的
      mockDoc.defaultView.location.pathname = '/new-article';
      mockDoc.title = 'New Article Title | HK01';

      const mockJson = buildPagesRouterData(
        { title: 'Old Stale Article', blocks: [] },
        { page: '/article' }
        // asPath missing
      );

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });
      expect(NextJsExtractor.extract(mockDoc)).toBeNull();
    });

    it('should extract normally when asPath is missing but title matches', () => {
      mockDoc.defaultView.location.pathname = '/current-article';
      mockDoc.title = 'Current Article Title | HK01';

      const mockJson = buildPagesRouterData(
        {
          title: 'Current Article Title',
          blocks: [
            { blockType: 'paragraph', text: 'Para 1' },
            { blockType: 'paragraph', text: 'Para 2' },
            { blockType: 'paragraph', text: 'Para 3' },
          ],
        },
        { page: '/article' }
      );

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });
      const result = NextJsExtractor.extract(mockDoc);
      expect(result).not.toBeNull();
      expect(result.metadata.title).toBe('Current Article Title');
    });

    it('should ignore title check if title contains only short generic words', () => {
      // 短標題容易誤殺，應放行
      mockDoc.defaultView.location.pathname = '/brief';
      mockDoc.title = 'Different Title'; // 即使不匹配

      const mockJson = buildPagesRouterData(
        {
          title: 'HK01',
          blocks: [
            { blockType: 'paragraph', text: 'Para 1' },
            { blockType: 'paragraph', text: 'Para 2' },
            { blockType: 'paragraph', text: 'Para 3' },
          ],
        },
        { page: '/article' }
      );

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });
      expect(NextJsExtractor.extract(mockDoc)).not.toBeNull();
    });

    it('should extract normally when defaultView is not available (title check skipped or defaults)', () => {
      delete mockDoc.defaultView;
      mockDoc.title = 'Same Title';

      const mockJson = buildPagesRouterData(
        {
          title: 'Same Title',
          blocks: [
            { blockType: 'paragraph', text: 'Para 1' },
            { blockType: 'paragraph', text: 'Para 2' },
            { blockType: 'paragraph', text: 'Para 3' },
          ],
        },
        { page: '/article' }
      );

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });
      expect(NextJsExtractor.extract(mockDoc)).not.toBeNull();
    });

    it('should return null if JSON content is too large', () => {
      const longString = 'a'.repeat(NEXTJS_CONFIG.MAX_JSON_SIZE + 1);
      mockDoc.querySelector.mockReturnValue({ textContent: longString });
      expect(NextJsExtractor.extract(mockDoc)).toBeNull();
    });

    it('should split long text into multiple chunks', () => {
      const longText = 'a'.repeat(3000); // Exceeds 2000 limit
      const mockArticle = {
        title: 'Long Text',
        blocks: [
          { blockType: 'paragraph', text: longText },
          { blockType: 'paragraph', text: 'Short para 2' },
          { blockType: 'paragraph', text: 'Short para 3' },
        ],
      };

      const mockJson = { props: { initialProps: { pageProps: { article: mockArticle } } } };
      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });

      const result = NextJsExtractor.extract(mockDoc);
      expect(result).not.toBeNull();
      expect(result.blocks).toHaveLength(3);
      const chunks = result.blocks[0].paragraph.rich_text;
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].text.content.length).toBeLessThanOrEqual(2000);
      expect(chunks.map(c => c.text.content).join('')).toBe(longText); // Combined content should match original
    });

    it('should handle author as string', () => {
      const mockArticle = {
        title: 'String Author',
        author: 'Jane Doe',
        blocks: [
          { blockType: 'paragraph', text: 'Para 1' },
          { blockType: 'paragraph', text: 'Para 2' },
          { blockType: 'paragraph', text: 'Para 3' },
        ],
      };
      const mockJson = { props: { initialProps: { pageProps: { article: mockArticle } } } };
      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });

      const result = NextJsExtractor.extract(mockDoc);
      expect(result).not.toBeNull();
      expect(result.metadata.byline).toBe('Jane Doe');
    });

    it('should extract content correctly from valid Next.js data (Deep nested path)', () => {
      const mockArticle = {
        title: 'Test Title',
        description: 'Test Excerpt',
        author: { name: 'Test Author' },
        blocks: [
          { blockType: 'paragraph', text: 'Hello Next.js' },
          {
            blockType: 'image',
            image: { cdnUrl: 'https://example.com/img.jpg', caption: 'Test Cap' },
          },
          { blockType: 'paragraph', text: 'Third paragraph' },
        ],
      };

      const mockJson = {
        props: {
          initialProps: {
            pageProps: {
              article: mockArticle,
            },
          },
        },
      };

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });

      const result = NextJsExtractor.extract(mockDoc);

      expect(result).not.toBeNull();
      expect(result.type).toBe('nextjs');
      expect(result.metadata.title).toBe('Test Title');
      expect(result.metadata.byline).toBe('Test Author');
      expect(result.blocks).toHaveLength(3);
      expect(result.blocks[0].type).toBe('paragraph');
      expect(result.blocks[1].type).toBe('image');
      expect(result.blocks[1].image.external.url).toBe('https://example.com/img.jpg');
    });

    it('should include teaser as summary block if present', () => {
      const mockArticle = {
        title: 'Teaser Test',
        teaser: ['This is a teaser summary.'],
        blocks: [
          { blockType: 'paragraph', text: 'Existing content 1' },
          { blockType: 'paragraph', text: 'Existing content 2' },
          { blockType: 'paragraph', text: 'Existing content 3' },
        ],
      };

      const mockJson = {
        props: { initialProps: { pageProps: { article: mockArticle } } },
      };

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });
      const result = NextJsExtractor.extract(mockDoc);

      expect(result).not.toBeNull();
      expect(result.blocks).toHaveLength(4); // teaser + 3 paragraphs
      expect(result.blocks[0].type).toBe('quote');
      expect(result.blocks[0].quote.rich_text[0].text.content).toBe('This is a teaser summary.');
      expect(result.blocks[1].type).toBe('paragraph');
    });

    it('should return null if no article data found in JSON', () => {
      const mockJson = { props: { pageProps: { otherData: {} } } };
      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });

      expect(NextJsExtractor.extract(mockDoc)).toBeNull();
    });

    it('should return null for article with 0 blocks (回退到 Readability)', () => {
      // MIN_VALID_BLOCKS 品質門檻：blocks 不足時 NextJsExtractor 回傳 null，
      // 由 ContentExtractor 回退到 Readability 提取。
      const mockArticle = {
        title: 'Content Only',
        content: 'Some content',
        // 無 blocks — 符合品質門檻不足的情況
      };

      const mockJson = { props: { pageProps: { article: mockArticle } } };
      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });

      const result = NextJsExtractor.extract(mockDoc);
      // 0 blocks < MIN_VALID_BLOCKS(3)，應回傳 null
      expect(result).toBeNull();
    });

    it('should handle JSON parse error gracefully', () => {
      mockDoc.querySelector.mockReturnValue({ textContent: '{ invalid json ' });
      expect(NextJsExtractor.extract(mockDoc)).toBeNull();
    });

    it('should extract content from App Router fragments using heuristic search', () => {
      mockDoc.querySelector.mockReturnValue(null);
      const articleData = {
        title: 'App Router Title',
        blocks: [
          { blockType: 'paragraph', text: 'Content 1' },
          { blockType: 'paragraph', text: 'Content 2' },
          { blockType: 'paragraph', text: 'Content 3' },
        ],
      };
      const fragment = JSON.stringify([1, articleData], null, 2);

      mockDoc.querySelectorAll.mockReturnValue([
        { textContent: `self.__next_f.push(${fragment})` },
      ]);

      const result = NextJsExtractor.extract(mockDoc);
      expect(result).not.toBeNull();
      expect(result.metadata.title).toBe('App Router Title');
      expect(result.blocks).toHaveLength(3);
    });

    it('should use heuristic search when standard paths fail', () => {
      const deepData = {
        someWrapper: {
          nested: {
            unknownKey: {
              title: 'Heuristic Title',
              blocks: [
                { blockType: 'paragraph', text: 'Found me 1' },
                { blockType: 'paragraph', text: 'Found me 2' },
                { blockType: 'paragraph', text: 'Found me 3' },
              ],
            },
          },
        },
      };
      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(deepData) });
      mockDoc.querySelectorAll.mockReturnValue([]);

      const result = NextJsExtractor.extract(mockDoc);
      expect(result).not.toBeNull();
      expect(result.metadata.title).toBe('Heuristic Title');
    });

    it('should extract Yahoo News App Router content correctly', () => {
      // Yahoo body 字段：整個 body HTML 作為一個 block 推入
      // 不足 MIN_VALID_BLOCKS(3)，自動回退到 Readability
      const longContent = 'A'.repeat(201);
      const yahooArticle = {
        title: 'Yahoo Test',
        body: `<p>${longContent}</p>`,
        postArticleStream: [{ title: 'Ad 1' }],
        recommendedContentsResp: [{ title: 'Ad 2' }],
      };

      const deepYahooData = { someWrapper: { ...yahooArticle } };

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(deepYahooData) });
      mockDoc.querySelectorAll.mockReturnValue([]);

      const result = NextJsExtractor.extract(mockDoc);

      // body 只推入 1 個 block → 不足 MIN_VALID_BLOCKS(3) → 回傳 null
      // ContentExtractor 會回退到 Readability 提取
      expect(result).toBeNull();
    });

    it('should extract Yahoo News App Router content with storyAtoms correctly', () => {
      // Mock Yahoo RSC structure with storyAtoms
      const yahooArticle = {
        title: 'Yahoo Atoms',
        storyAtoms: [
          { type: 'text', content: '<p>Para 1</p>', tagName: 'p' },
          { type: 'image', url: 'img.jpg', caption: 'Img 1' },
          { type: 'text', content: '<h2>Heading</h2>', tagName: 'h2' },
        ],
        // Excluded
        recommended: [],
      };

      const deepYahooData = { wrapper: yahooArticle };

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(deepYahooData) });
      mockDoc.querySelectorAll.mockReturnValue([]);

      const result = NextJsExtractor.extract(mockDoc);

      expect(result).not.toBeNull();
      expect(result.metadata.title).toBe('Yahoo Atoms');
      expect(result.blocks).toHaveLength(3);
      expect(result.blocks[0].type).toBe('paragraph');
      expect(result.blocks[0].paragraph.rich_text[0].text.content).toBe('Para 1');
      expect(result.blocks[1].type).toBe('image');
      expect(result.blocks[2].type).toBe('heading_2');
    });

    it('should extract Yahoo News from RSC fixture (multi-line + wrapper)', () => {
      const fixture = yahooNewsRscFixture;

      mockDoc.querySelector.mockReturnValue(null);
      mockDoc.querySelectorAll.mockReturnValue([{ textContent: fixture.scriptContent }]);

      const result = NextJsExtractor.extract(mockDoc);
      expect(result).not.toBeNull();
      expect(result.blocks).toHaveLength(3);
      expect(result.blocks[0].type).toBe('paragraph');
      expect(result.blocks[0].paragraph.rich_text[0].text.content).toBe('This is paragraph 1.');
      expect(result.blocks[1].type).toBe('image');
      expect(result.blocks[1].image.external.url).toBe('https://example.com/test.jpg');
    });

    it('should ignore malformed RSC chunks but extract from valid ones in same script', () => {
      const scriptWithMixed =
        'self.__next_f.push([1, "1:I[\\\"noise\\\"]\\n2:{\\\"malformed\\\"\\n3:{\\\"someNoise\\\":true}\\n4:[\\\"$\\\", \\\"$L2a\\\", null, {\\\"storyAtoms\\\":[{\\\"type\\\":\\\"text\\\",\\\"content\\\":\\\"<p>Recovered paragraph 1.</p>\\\",\\\"tagName\\\":\\\"p\\\"},{\\\"type\\\":\\\"text\\\",\\\"content\\\":\\\"<p>Recovered paragraph 2.</p>\\\",\\\"tagName\\\":\\\"p\\\"},{\\\"type\\\":\\\"text\\\",\\\"content\\\":\\\"<p>Recovered paragraph 3.</p>\\\",\\\"tagName\\\":\\\"p\\\"}]}]\\n"])';
      mockDoc.querySelector.mockReturnValue(null);
      mockDoc.querySelectorAll.mockReturnValue([{ textContent: scriptWithMixed }]);

      const result = NextJsExtractor.extract(mockDoc);
      expect(result).not.toBeNull();
      expect(result.blocks).toHaveLength(3);
      expect(result.blocks[0].paragraph.rich_text[0].text.content).toBe('Recovered paragraph 1.');
    });
  });

  describe('extractAsync', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('stale 時優先從 router 組件提取，不呼叫 fetch', async () => {
      // 模擬：__NEXT_DATA__ 為首頁資料 (stale)，router.components 有最新文章數據
      mockDoc.defaultView.location.origin = 'https://www.hk01.com';
      mockDoc.defaultView.location.pathname = '/news/60330394/abc';
      mockDoc.defaultView.location.href = 'https://www.hk01.com/news/60330394/abc';
      mockDoc.title = 'Router Article | HK01';

      // __NEXT_DATA__ 為首頁 (stale)
      const staleJson = buildStaleNextData();
      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(staleJson) });

      // 模擬 window.next.router.components 含有最新文章數據
      mockDoc.defaultView.next = buildRouterComponents({
        '/article': buildRouterComponentValue({
          article: {
            title: 'Router Article',
            blocks: [
              { blockType: 'paragraph', text: 'Para 1 from router' },
              { blockType: 'paragraph', text: 'Para 2 from router' },
              { blockType: 'paragraph', text: 'Para 3 from router' },
            ],
          },
        }),
      });

      globalThis.fetch = jest.fn(); // 不應被呼叫

      const result = await NextJsExtractor.extractAsync(mockDoc);

      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result.metadata.title).toBe('Router Article');
      expect(result.blocks.length).toBeGreaterThanOrEqual(3);
    });

    it('router 數據標題不匹配時回退到 _fetchNextData', async () => {
      // 模擬：router.components 有過時數據，document.title 是新文章
      mockDoc.defaultView.location.origin = 'https://www.hk01.com';
      mockDoc.defaultView.location.pathname = '/news/new-article';
      mockDoc.defaultView.location.href = 'https://www.hk01.com/news/new-article';
      mockDoc.title = 'Correct New Article | HK01'; // 與 router 數據的標題不符

      // __NEXT_DATA__ 為首頁 (stale)
      const staleJson = {
        page: '/',
        buildId: 'build456',
        props: { initialProps: { pageProps: {} } },
      };
      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(staleJson) });

      // router 含有舊文章的數據（標題與 document.title 不符）
      mockDoc.defaultView.next = buildRouterComponents({
        '/article': buildRouterComponentValue({
          article: {
            title: 'Old Stale Router Article',
            blocks: [
              { blockType: 'paragraph', text: 'Old 1' },
              { blockType: 'paragraph', text: 'Old 2' },
              { blockType: 'paragraph', text: 'Old 3' },
            ],
          },
        }),
      });

      // fetch 回傳正確的新文章數據
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          pageProps: {
            article: {
              title: 'Correct New Article',
              blocks: [
                { blockType: 'paragraph', text: 'New 1' },
                { blockType: 'paragraph', text: 'New 2' },
                { blockType: 'paragraph', text: 'New 3' },
              ],
            },
          },
        }),
      });

      const result = await NextJsExtractor.extractAsync(mockDoc);

      // 應回退到 fetch 並取得正確數據
      expect(globalThis.fetch).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result.metadata.title).toBe('Correct New Article');
    });

    it('stale 時嘗試使用 _next/data 並成功提取', async () => {
      mockDoc.defaultView.location.origin = 'https://www.hk01.com';
      mockDoc.defaultView.location.pathname = '/news/60330394/abc';
      mockDoc.defaultView.location.href = 'https://www.hk01.com/news/60330394/abc';

      const mockJson = buildStaleNextData();

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });

      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          pageProps: {
            article: {
              title: 'OK',
              blocks: [
                { blockType: 'paragraph', text: 'One' },
                { blockType: 'paragraph', text: 'Two' },
                { blockType: 'paragraph', text: 'Three' },
              ],
            },
          },
        }),
      });

      const result = await NextJsExtractor.extractAsync(mockDoc);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://www.hk01.com/_next/data/build123/news/60330394/abc.json',
        expect.any(Object)
      );
      expect(result).not.toBeNull();
      expect(result.metadata.title).toBe('OK');
      expect(result.blocks.length).toBeGreaterThanOrEqual(3);
    });

    it('stale fallback 建立的 _next/data 請求不應包含頁面 query 或 hash', async () => {
      mockDoc.defaultView.location.origin = 'https://www.hk01.com';
      mockDoc.defaultView.location.pathname = '/news/60330394/abc';
      mockDoc.defaultView.location.href =
        'https://www.hk01.com/news/60330394/abc?token=attacker-controlled#section-1';

      const mockJson = buildStaleNextData();

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });

      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          pageProps: {
            article: {
              title: 'Query Stripped',
              blocks: [
                { blockType: 'paragraph', text: 'One' },
                { blockType: 'paragraph', text: 'Two' },
                { blockType: 'paragraph', text: 'Three' },
              ],
            },
          },
        }),
      });

      await NextJsExtractor.extractAsync(mockDoc);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://www.hk01.com/_next/data/build123/news/60330394/abc.json',
        expect.any(Object)
      );
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch.mock.calls[0][0]).not.toContain('?');
      expect(globalThis.fetch.mock.calls[0][0]).not.toContain('#');
    });

    it('stale 時 _next/data 失敗只記錄 debug 診斷，不記錄 warn', async () => {
      mockDoc.defaultView.location.origin = 'https://www.hk01.com';
      mockDoc.defaultView.location.pathname = '/news/60330394/abc';
      mockDoc.defaultView.location.href = 'https://www.hk01.com/news/60330394/abc';

      const mockJson = buildStaleNextData();

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });

      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await NextJsExtractor.extractAsync(mockDoc);

      expect(result).toBeNull();
      expect(Logger.debug).toHaveBeenCalledWith('Next.js data 取得失敗', {
        action: '_fetchNextData',
        status: 404,
        url: 'https://www.hk01.com/_next/data/build123/news/60330394/abc.json',
      });
      expect(Logger.warn).not.toHaveBeenCalledWith('Next.js data 取得失敗', expect.any(Object));
    });
  });

  describe('_getRouterComponentData', () => {
    it('優先使用符合當前 route 的 component，而不是第一個非空 component', () => {
      mockDoc.defaultView.location.pathname = '/news/current-article';
      mockDoc.defaultView.next = {
        router: {
          pathname: '/news/[slug]',
          asPath: '/news/current-article',
          components: {
            '/': buildRouterComponentValue({
              article: { title: 'Home Payload', blocks: [{ blockType: 'paragraph' }] },
            }),
            '/news/[slug]': buildRouterComponentValue({
              article: { title: 'Current Article', blocks: [{ blockType: 'paragraph' }] },
            }),
          },
        },
      };

      const result = NextJsExtractor._getRouterComponentData(mockDoc);

      expect(result).not.toBeNull();
      expect(result.props.pageProps.article.title).toBe('Current Article');
    });

    it('找不到匹配 route key 時回退到第一個非空 component', () => {
      mockDoc.defaultView.location.pathname = '/unknown/path';
      mockDoc.defaultView.next = buildRouterComponents({
        '/article': buildRouterComponentValue({
          article: { title: 'Fallback OK', blocks: [] },
        }),
      });

      const result = NextJsExtractor._getRouterComponentData(mockDoc);

      expect(result).not.toBeNull();
      expect(result.props.pageProps.article.title).toBe('Fallback OK');
    });

    it('僅提供 router.route 時仍可匹配正確 component', () => {
      mockDoc.defaultView.location.pathname = '/news/current-article';
      mockDoc.defaultView.next = {
        router: {
          route: '/news/[slug]',
          components: {
            '/': buildRouterComponentValue({ home: true }),
            '/news/[slug]': buildRouterComponentValue({
              article: { title: 'Route Match', blocks: [] },
            }),
          },
        },
      };

      const result = NextJsExtractor._getRouterComponentData(mockDoc);

      expect(result).not.toBeNull();
      expect(result.props.pageProps.article.title).toBe('Route Match');
    });

    it('應從 router.components 成功提取 pageProps', () => {
      // 設定 doc.defaultView.next.router.components 含有正確 pageProps
      mockDoc.defaultView.next = buildRouterComponents({
        '/article': buildRouterComponentValue({
          article: { title: 'Router Test', blocks: [] },
        }),
      });

      const result = NextJsExtractor._getRouterComponentData(mockDoc);

      expect(result).not.toBeNull();
      expect(result.props.pageProps.article.title).toBe('Router Test');
    });

    it('window.next 不存在時應返回 null', () => {
      // mockDoc.defaultView 沒有 next 屬性
      const result = NextJsExtractor._getRouterComponentData(mockDoc);
      expect(result).toBeNull();
    });

    it('router.components 為空物件時應返回 null', () => {
      mockDoc.defaultView.next = buildRouterComponents({});

      const result = NextJsExtractor._getRouterComponentData(mockDoc);
      expect(result).toBeNull();
    });

    it('pageProps 為空物件時應跳過並返回 null', () => {
      mockDoc.defaultView.next = buildRouterComponents({
        '/article': buildRouterComponentValue({}), // 空的 pageProps
      });

      const result = NextJsExtractor._getRouterComponentData(mockDoc);
      expect(result).toBeNull();
    });

    it('存取 router 過程拋出異常時應記錄 debug 並安全返回 null', () => {
      // 設定一個會讓存取拋異常的 getter
      const error = new Error('permission denied');
      const badDefaultView = {};
      Object.defineProperty(badDefaultView, 'next', {
        get() {
          throw error;
        },
      });
      const badDoc = { ...mockDoc, defaultView: badDefaultView };

      const result = NextJsExtractor._getRouterComponentData(badDoc);
      expect(result).toBeNull();
      expect(Logger.debug).toHaveBeenCalledWith(
        'NextJsExtractor._getRouterComponentData 讀取失敗',
        {
          action: 'NextJsExtractor._getRouterComponentData',
          error,
        }
      );
    });
  });

  describe('_buildNextDataUrl', () => {
    it('root path 會轉為 /index.json', () => {
      const url = NextJsExtractor._buildNextDataUrl('https://www.hk01.com', '/', 'build123');
      expect(url).toBe('https://www.hk01.com/_next/data/build123/index.json');
    });

    it('使用驗證後的 origin 與 pathname 建立 _next/data URL', () => {
      const url = NextJsExtractor._buildNextDataUrl(
        'https://www.hk01.com',
        '/news/60330394/abc',
        'build123'
      );

      expect(url).toBe('https://www.hk01.com/_next/data/build123/news/60330394/abc.json');
    });

    it('拒絕非 http/https origin', () => {
      const url = NextJsExtractor._buildNextDataUrl(
        'javascript:alert(1)',
        '/news/60330394/abc',
        'build123'
      );

      expect(url).toBeNull();
    });

    it('拒絕不以斜線開頭的 pathname', () => {
      const url = NextJsExtractor._buildNextDataUrl(
        'https://www.hk01.com',
        'news/60330394/abc',
        'build123'
      );

      expect(url).toBeNull();
    });
  });

  describe('_resolvePageOriginAndPath', () => {
    let originalLocation;

    beforeEach(() => {
      originalLocation = globalThis.location;
    });

    afterEach(() => {
      globalThis.location = originalLocation;
    });

    it('優先使用 doc.defaultView.location', () => {
      const mockDocWithDefaultView = {
        defaultView: {
          location: {
            origin: 'https://defaultview.com',
            pathname: '/path/defaultview',
          },
        },
        location: {
          origin: 'https://doc-location.com',
          pathname: '/path/doc-location',
        },
      };

      const result = NextJsExtractor._resolvePageOriginAndPath(mockDocWithDefaultView);
      expect(result.origin).toBe('https://defaultview.com');
      expect(result.pathname).toBe('/path/defaultview');
    });

    it('在無 defaultView 時回退到 doc.location', () => {
      const mockDocWithoutDefaultView = {
        location: {
          origin: 'https://doc-location.com',
          pathname: '/path/doc-location',
        },
      };

      const result = NextJsExtractor._resolvePageOriginAndPath(mockDocWithoutDefaultView);
      expect(result.origin).toBe('https://doc-location.com');
      expect(result.pathname).toBe('/path/doc-location');
    });

    it('在無 doc.location 時回退到 globalThis.location', () => {
      const mockEmptyDoc = {};

      const result = NextJsExtractor._resolvePageOriginAndPath(mockEmptyDoc);
      expect(result.origin).toBe('http://localhost');
      expect(result.pathname).toBe('/');
    });
  });
});
