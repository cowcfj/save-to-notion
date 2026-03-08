/**
 * @jest-environment jsdom
 */

import Logger from '../../../../scripts/utils/Logger.js';
import { sanitizeUrlForLogging } from '../../../../scripts/utils/LogSanitizer.js';
import { NextJsExtractor } from '../../../../scripts/content/extractors/NextJsExtractor.js';
import { NEXTJS_CONFIG } from '../../../../scripts/config/extraction.js';

// Mock Logger to avoid cluttering test output
jest.mock('../../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('../../../../scripts/utils/LogSanitizer.js', () => ({
  sanitizeUrlForLogging: jest.fn(url => (url == null ? '[empty-url]' : `safe:${url}`)),
}));

describe('NextJsExtractor', () => {
  let mockDoc;

  beforeEach(() => {
    mockDoc = {
      getElementById: jest.fn(),
      querySelector: jest.fn(),
      querySelectorAll: jest.fn().mockReturnValue([]),
      defaultView: { location: { pathname: '/' } },
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

      const mockJson = {
        props: { initialProps: { pageProps: { article: { title: 'Old Article', blocks: [] } } } },
        asPath: '/%E7%A4%BE%E6%9C%83%E6%96%B0%E8%81%9E/60320801/old-article',
        page: '/article',
      };

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });
      expect(NextJsExtractor.extract(mockDoc)).toBeNull();
    });

    it('should sanitize SPA navigation warning log context keys', () => {
      mockDoc.defaultView.location.pathname = '/new-article';

      const mockJson = {
        props: { initialProps: { pageProps: { article: { title: 'Old Article', blocks: [] } } } },
        asPath: '/old-article',
        page: '/article',
      };

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });
      expect(NextJsExtractor.extract(mockDoc)).toBeNull();

      expect(Logger.warn).toHaveBeenCalledWith('SPA 導航偵測：__NEXT_DATA__.asPath 數據已過時', {
        action: '_validatePagesRouterData',
        page: sanitizeUrlForLogging(mockJson.page),
        asPath: sanitizeUrlForLogging(mockJson.asPath),
        currentPath: sanitizeUrlForLogging(mockDoc.defaultView.location.pathname),
      });
    });

    it('should sanitize SPA home-page log context keys with the same shape', () => {
      mockDoc.defaultView.location.pathname = '/news/article';

      const mockJson = {
        props: { initialProps: { pageProps: { article: { title: 'Home payload', blocks: [] } } } },
        asPath: '/',
        page: '/',
      };

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });
      expect(NextJsExtractor.extract(mockDoc)).toBeNull();

      expect(Logger.info).toHaveBeenCalledWith(
        'SPA 導航偵測：__NEXT_DATA__ 為首頁資料，跳過結構化提取',
        {
          action: '_validatePagesRouterData',
          page: sanitizeUrlForLogging(mockJson.page),
          asPath: sanitizeUrlForLogging(mockJson.asPath),
          currentPath: sanitizeUrlForLogging(mockDoc.defaultView.location.pathname),
        }
      );
    });

    it('should extract normally when asPath matches current URL', () => {
      const path = '/%E7%A4%BE%E6%9C%83%E6%96%B0%E8%81%9E/60320801/article-slug';
      mockDoc.defaultView.location.pathname = path;

      const mockJson = {
        props: {
          initialProps: {
            pageProps: {
              article: {
                title: 'Same Article',
                blocks: [
                  { blockType: 'paragraph', text: 'Para 1' },
                  { blockType: 'paragraph', text: 'Para 2' },
                  { blockType: 'paragraph', text: 'Para 3' },
                ],
              },
            },
          },
        },
        asPath: path,
        page: '/article',
      };

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });
      const result = NextJsExtractor.extract(mockDoc);
      expect(result).not.toBeNull();
      expect(result.metadata.title).toBe('Same Article');
    });

    it('should return null when asPath is missing and title is inconsistent (SPA navigation)', () => {
      // 模擬：無 asPath (如 HK01)，且 document.title 已更新但 article.title 是舊的
      mockDoc.defaultView.location.pathname = '/new-article';
      mockDoc.title = 'New Article Title | HK01';

      const mockJson = {
        props: {
          initialProps: { pageProps: { article: { title: 'Old Stale Article', blocks: [] } } },
        },
        page: '/article',
        // asPath missing
      };

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });
      expect(NextJsExtractor.extract(mockDoc)).toBeNull();
    });

    it('should extract normally when asPath is missing but title matches', () => {
      mockDoc.defaultView.location.pathname = '/current-article';
      mockDoc.title = 'Current Article Title | HK01';

      const mockJson = {
        props: {
          initialProps: {
            pageProps: {
              article: {
                title: 'Current Article Title',
                blocks: [
                  { blockType: 'paragraph', text: 'Para 1' },
                  { blockType: 'paragraph', text: 'Para 2' },
                  { blockType: 'paragraph', text: 'Para 3' },
                ],
              },
            },
          },
        },
        page: '/article',
      };

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });
      const result = NextJsExtractor.extract(mockDoc);
      expect(result).not.toBeNull();
      expect(result.metadata.title).toBe('Current Article Title');
    });

    it('should ignore title check if title contains only short generic words', () => {
      // 短標題容易誤殺，應放行
      mockDoc.defaultView.location.pathname = '/brief';
      mockDoc.title = 'Different Title'; // 即使不匹配

      const mockJson = {
        props: {
          initialProps: {
            pageProps: {
              article: {
                title: 'HK01',
                blocks: [
                  { blockType: 'paragraph', text: 'Para 1' },
                  { blockType: 'paragraph', text: 'Para 2' },
                  { blockType: 'paragraph', text: 'Para 3' },
                ],
              },
            },
          },
        },
        page: '/article',
      };

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });
      expect(NextJsExtractor.extract(mockDoc)).not.toBeNull();
    });

    it('should extract normally when defaultView is not available (title check skipped or defaults)', () => {
      delete mockDoc.defaultView;
      mockDoc.title = 'Same Title';

      const mockJson = {
        props: {
          initialProps: {
            pageProps: {
              article: {
                title: 'Same Title',
                blocks: [
                  { blockType: 'paragraph', text: 'Para 1' },
                  { blockType: 'paragraph', text: 'Para 2' },
                  { blockType: 'paragraph', text: 'Para 3' },
                ],
              },
            },
          },
        },
        page: '/article',
      };

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
  });

  describe('BBC format (_isBbcFormat / _convertBbcBlocks / _extractBbcText)', () => {
    // 模擬 BBC __NEXT_DATA__.props.pageProps.pageData.content.model 結構
    const buildBbcNextData = blocks => ({
      props: {
        pageProps: {
          pageData: {
            content: {
              model: { blocks },
            },
            promo: {
              headlines: { seoHeadline: 'BBC Test Article' },
            },
          },
        },
      },
    });

    it('_isBbcFormat: 應識別 BBC {type, model} 格式', () => {
      const bbcBlocks = [{ type: 'paragraph', model: { text: 'hello' } }];
      expect(NextJsExtractor._isBbcFormat(bbcBlocks)).toBe(true);
    });

    it('_isBbcFormat: 首項為 null 時仍應識別後續 BBC block', () => {
      const bbcBlocks = [null, { type: 'paragraph', model: { text: 'hello' } }];
      expect(NextJsExtractor._isBbcFormat(bbcBlocks)).toBe(true);
    });

    it('_isBbcFormat: 應拒絕標準 {blockType, text} 格式', () => {
      const standardBlocks = [{ blockType: 'paragraph', text: 'hello' }];
      expect(NextJsExtractor._isBbcFormat(standardBlocks)).toBe(false);
    });

    it('應從 BBC 結構提取 heading + paragraph + image', () => {
      const bbcBlocks = [
        {
          type: 'headline',
          model: { blocks: [{ model: { text: '文章標題' } }] },
        },
        {
          type: 'text',
          model: {
            blocks: [
              {
                type: 'paragraph',
                model: {
                  text: '第一段文字',
                  blocks: [{ type: 'fragment', model: { text: '第一段文字', attributes: [] } }],
                },
              },
            ],
          },
        },
        {
          type: 'text',
          model: {
            blocks: [
              {
                type: 'paragraph',
                model: { text: '第二段文字', blocks: [{ model: { text: '第二段文字' } }] },
              },
            ],
          },
        },
        {
          type: 'image',
          model: {
            blocks: [
              {
                type: 'rawImage',
                model: {
                  locator: 'a985/live/test-image.jpg',
                  originCode: 'cpsprodpb',
                  width: 1024,
                  height: 576,
                },
              },
              {
                type: 'caption',
                model: { blocks: [{ model: { text: '圖片說明' } }] },
              },
            ],
          },
        },
      ];

      const mockJson = buildBbcNextData(bbcBlocks);
      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });
      mockDoc.querySelectorAll.mockReturnValue([]);

      const result = NextJsExtractor.extract(mockDoc);

      expect(result).not.toBeNull();
      // headline → heading_1, 2x text → 2 paragraphs, image → image
      expect(result.blocks).toHaveLength(4);
      expect(result.blocks[0].type).toBe('heading_1');
      expect(result.blocks[0].heading_1.rich_text[0].text.content).toBe('文章標題');
      expect(result.blocks[1].type).toBe('paragraph');
      expect(result.blocks[1].paragraph.rich_text[0].text.content).toBe('第一段文字');
      expect(result.blocks[2].type).toBe('paragraph');
      expect(result.blocks[3].type).toBe('image');
      expect(result.blocks[3].image.external.url).toBe(
        'https://ichef.bbci.co.uk/ace/ws/1024/cpsprodpb/a985/live/test-image.jpg.webp'
      );
      expect(result.blocks[3].image.caption[0].text.content).toBe('圖片說明');
      expect(result.metadata.title).toBe('BBC Test Article');
    });

    it('頂層 BBC blocks 首項為 null 時不應讓整體提取失敗', () => {
      const bbcBlocks = [
        null,
        { type: 'headline', model: { blocks: [{ model: { text: '文章標題' } }] } },
        {
          type: 'text',
          model: {
            blocks: [{ type: 'paragraph', model: { text: '第一段文字', blocks: [] } }],
          },
        },
        {
          type: 'text',
          model: {
            blocks: [{ type: 'paragraph', model: { text: '第二段文字', blocks: [] } }],
          },
        },
      ];

      const mockJson = buildBbcNextData(bbcBlocks);
      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });
      mockDoc.querySelectorAll.mockReturnValue([]);

      const result = NextJsExtractor.extract(mockDoc);

      expect(result).not.toBeNull();
      expect(result.metadata.title).toBe('BBC Test Article');
      expect(result.blocks).toHaveLength(3);
      expect(result.blocks[0].type).toBe('heading_1');
    });

    it('byline/relatedContent blocks 應被跳過', () => {
      const bbcBlocks = [
        { type: 'headline', model: { blocks: [{ model: { text: '標題A' } }] } },
        { type: 'byline', model: { blocks: [] } },
        {
          type: 'text',
          model: { blocks: [{ type: 'paragraph', model: { text: 'Para 1', blocks: [] } }] },
        },
        { type: 'relatedContent', model: { blocks: [] } },
        {
          type: 'text',
          model: { blocks: [{ type: 'paragraph', model: { text: 'Para 2', blocks: [] } }] },
        },
        {
          type: 'text',
          model: { blocks: [{ type: 'paragraph', model: { text: 'Para 3', blocks: [] } }] },
        },
      ];

      const mockJson = buildBbcNextData(bbcBlocks);
      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });
      mockDoc.querySelectorAll.mockReturnValue([]);

      const result = NextJsExtractor.extract(mockDoc);
      expect(result).not.toBeNull();
      // byline, relatedContent 各少一個 block
      const types = result.blocks.map(b => b.type);
      expect(types).not.toContain('byline');
      expect(types).not.toContain('relatedContent');
    });

    it('品質門檻：BBC blocks < MIN_VALID_BLOCKS 時回傳 null', () => {
      // 只有 1 個 byline（被跳過），結果 0 blocks → null
      const bbcBlocks = [
        { type: 'byline', model: { blocks: [] } },
        { type: 'relatedContent', model: { blocks: [] } },
      ];

      const mockJson = buildBbcNextData(bbcBlocks);
      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });
      mockDoc.querySelectorAll.mockReturnValue([]);

      const result = NextJsExtractor.extract(mockDoc);
      // 轉換後 0 blocks < 3 → 應回傳 null
      expect(result).toBeNull();
    });

    it('邊界測試：無效或空內容的處理 (分支覆蓋率)', () => {
      const bbcBlocks = [
        // 缺少 type 或 model 的 block
        { type: 'paragraph' },
        { model: { text: 'test' } },
        // 空 headline
        { type: 'headline', model: {} },
        // 空 subheadline
        { type: 'subheadline', model: { blocks: [] } },
        // 即使是 text block 沒內容也不產生 blocks
        { type: 'text', model: { blocks: [{ type: 'paragraph', model: {} }] } },
        // 缺少圖片必要屬性的 image
        { type: 'image', model: { blocks: [{ type: 'rawImage', model: {} }] } },
        // 新增：涵蓋 _extractBbcText model !object (line 1140)
        { type: 'headline', model: null },
        // 新增：涵蓋 subheadline 正常提取 (line 1091)
        {
          type: 'subheadline',
          model: { blocks: [{ type: 'paragraph', model: { text: 'Sub Heading Text' } }] },
        },
        // 新增：涵蓋 _extractBbcText child !object (line 1153)
        {
          type: 'text',
          model: {
            blocks: [null, 'string-is-not-object', { type: 'paragraph', model: { text: '' } }],
          },
        },
        // 新增：涵蓋 switch-case 略過區塊的邏輯 (line 1110)
        { type: 'byline', model: {} },
        // 未知類型的 fallback block: 成功提取 fallback 文字
        { type: 'unknown_type', model: { text: 'fallback_text' } },
        // 未知類型的 fallback block: 提取不出文字
        { type: 'unknown_empty', model: {} },
      ];

      // 只靠以上可能產出 1 個 block，不足品質門檻(3)，所以我們再加個有效片段
      const validBlocks = [
        { type: 'text', model: { blocks: [{ type: 'paragraph', model: { text: 'para 1' } }] } },
        { type: 'text', model: { blocks: [{ type: 'paragraph', model: { text: 'para 2' } }] } },
      ];

      const mockJson = buildBbcNextData([...validBlocks, ...bbcBlocks]);
      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });
      mockDoc.querySelectorAll.mockReturnValue([]);

      const result = NextJsExtractor.extract(mockDoc);
      // 1 個來自 fallback_text, 1 個來自 subheadline, 2 個來自 para 1/2
      expect(result).not.toBeNull();
      expect(result.blocks).toHaveLength(4);
      const texts = result.blocks.map(
        b => b.paragraph?.rich_text[0]?.text?.content || b.heading_2?.rich_text[0]?.text?.content
      );
      expect(texts).toContain('fallback_text');
      expect(texts).toContain('Sub Heading Text');
      expect(texts).toContain('para 1');
      expect(texts).toContain('para 2');
    });
  });

  describe('convertBlocks', () => {
    it('should return empty array for non-array input', () => {
      expect(NextJsExtractor.convertBlocks(null)).toEqual([]);
      expect(NextJsExtractor.convertBlocks(undefined)).toEqual([]);
      expect(NextJsExtractor.convertBlocks({})).toEqual([]);
    });

    it('should return empty array for empty array input', () => {
      expect(NextJsExtractor.convertBlocks([])).toEqual([]);
    });

    it('should convert heading blocks', () => {
      const input = [{ blockType: 'heading_1', text: 'H1' }];
      const output = NextJsExtractor.convertBlocks(input);
      expect(output[0].type).toBe('heading_1');
      expect(output[0].heading_1.rich_text[0].text.content).toBe('H1');
    });

    it('should strip HTML from heading blocks', () => {
      const input = [{ blockType: 'heading_1', text: '<h1>Title <i>Italic</i></h1>' }];
      const output = NextJsExtractor.convertBlocks(input);
      expect(output[0].type).toBe('heading_1');
      expect(output[0].heading_1.rich_text[0].text.content).toBe('Title Italic');
    });

    it('should strip script tags from content', () => {
      const input = [{ blockType: 'paragraph', text: '<script>alert("xss")</script>Hello' }];
      const output = NextJsExtractor.convertBlocks(input);
      expect(output[0].type).toBe('paragraph');
      expect(output[0].paragraph.rich_text[0].text.content).toBe('Hello');
    });

    it('should strip style tags from content', () => {
      const input = [{ blockType: 'paragraph', text: '<style>body { color: red; }</style>Hello' }];
      const output = NextJsExtractor.convertBlocks(input);
      expect(output[0].type).toBe('paragraph');
      expect(output[0].paragraph.rich_text[0].text.content).toBe('Hello');
    });

    it('should strip HTML from quote blocks', () => {
      const input = [{ blockType: 'quote', text: '<blockquote>Quote <b>Bold</b></blockquote>' }];
      const output = NextJsExtractor.convertBlocks(input);
      expect(output[0].type).toBe('quote');
      expect(output[0].quote.rich_text[0].text.content).toBe('Quote Bold');
    });

    it('should strip HTML from paragraph text', () => {
      const input = [{ blockType: 'paragraph', text: '<p>Hello <b>World</b></p>' }];
      const output = NextJsExtractor.convertBlocks(input);
      expect(output[0].type).toBe('paragraph');
      expect(output[0].paragraph.rich_text[0].text.content).toBe('Hello World');
    });

    it('should filter out images without URL', () => {
      const input = [
        { blockType: 'image', image: { url: '' } }, // Empty URL
        { blockType: 'image', image: { cdnUrl: 'https://valid.com' } },
      ];
      const output = NextJsExtractor.convertBlocks(input);
      expect(output).toHaveLength(1);
      expect(output[0].image.external.url).toBe('https://valid.com');
    });

    it('should convert HK01 summary blocks to quotes', () => {
      const input = [
        {
          blockType: 'summary',
          summary: ['Summary line 1', 'Summary line 2'],
        },
      ];
      const output = NextJsExtractor.convertBlocks(input);
      expect(output).toHaveLength(1);
      expect(output[0].type).toBe('quote');
      expect(output[0].quote.rich_text[0].text.content).toBe('Summary line 1\nSummary line 2');
    });

    it('should convert HK01 text blocks (htmlTokens) to paragraphs', () => {
      const input = [
        {
          blockType: 'text',
          htmlTokens: [
            [
              { type: 'text', content: 'Paragraph 1 part A, ' },
              { type: 'text', content: 'part B.' },
            ],
            [{ type: 'text', content: 'Paragraph 2.' }],
          ],
        },
      ];
      const output = NextJsExtractor.convertBlocks(input);
      expect(output).toHaveLength(2);
      expect(output[0].type).toBe('paragraph');
      expect(output[0].paragraph.rich_text[0].text.content).toBe('Paragraph 1 part A, part B.');
      expect(output[1].type).toBe('paragraph');
      expect(output[1].paragraph.rich_text[0].text.content).toBe('Paragraph 2.');
    });

    it('should convert HK01 complex tokens (boldLink, link) to paragraphs', () => {
      const input = [
        {
          blockType: 'text',
          htmlTokens: [
            [
              { type: 'text', content: 'Normal text ' },
              { type: 'boldLink', content: 'Bold Link' },
              { type: 'text', content: ' more text.' },
            ],
          ],
        },
      ];
      const output = NextJsExtractor.convertBlocks(input);
      expect(output).toHaveLength(1);
      expect(output[0].type).toBe('paragraph');
      expect(output[0].paragraph.rich_text[0].text.content).toBe(
        'Normal text Bold Link more text.'
      );
    });

    it('should convert list blocks (fallback to paragraph)', () => {
      const input = [
        { blockType: 'list', items: ['Item 1', 'Item 2'], ordered: false },
        { blockType: 'list', items: ['First', 'Second'], ordered: true },
      ];
      const output = NextJsExtractor.convertBlocks(input);
      expect(output).toHaveLength(4);
      // First list (unordered)
      expect(output[0].type).toBe('bulleted_list_item');
      expect(output[0].bulleted_list_item.rich_text[0].text.content).toBe('Item 1');
      expect(output[1].type).toBe('bulleted_list_item');
      expect(output[1].bulleted_list_item.rich_text[0].text.content).toBe('Item 2');
      // Second list (ordered)
      expect(output[2].type).toBe('numbered_list_item');
      expect(output[2].numbered_list_item.rich_text[0].text.content).toBe('First');
      expect(output[3].type).toBe('numbered_list_item');
      expect(output[3].numbered_list_item.rich_text[0].text.content).toBe('Second');
    });

    it('should convert code blocks (fallback to paragraph)', () => {
      const input = [{ blockType: 'code', text: 'console.log("hello")', language: 'javascript' }];
      const output = NextJsExtractor.convertBlocks(input);
      // Currently falls back to paragraph as 'code' is not explicitly handled in switch
      expect(output).toHaveLength(1);
      expect(output[0].type).toBe('paragraph');
      expect(output[0].paragraph.rich_text[0].text.content).toBe('console.log("hello")');
    });
  });

  describe('_stripHtml', () => {
    it('should handle null or undefined input', () => {
      expect(NextJsExtractor._stripHtml(null)).toBe('');
      expect(NextJsExtractor._stripHtml(undefined)).toBe('');
    });

    it('should remove script tags entirely', () => {
      const html = '<div>Content<script>console.log("bad")</script></div>';
      expect(NextJsExtractor._stripHtml(html)).toBe('Content');
    });
  });
});
