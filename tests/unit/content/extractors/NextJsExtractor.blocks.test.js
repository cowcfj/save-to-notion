/**
 * @jest-environment jsdom
 */

import { NextJsExtractor } from '../../../../scripts/content/extractors/NextJsExtractor.js';
import bbcNewsBlocksFixture from '../../../fixtures/json/bbc-news-blocks.json';

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

describe('NextJsExtractor Block Conversion', () => {
  let mockDoc;

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

  beforeEach(() => {
    jest.clearAllMocks();

    mockDoc = {
      getElementById: jest.fn(),
      querySelector: jest.fn(),
      querySelectorAll: jest.fn().mockReturnValue([]),
      defaultView: { location: { origin: 'https://example.com', pathname: '/' } },
    };
  });

  describe('BBC format (_isBbcFormat / _convertBbcBlocks / _extractBbcText)', () => {
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
      const fixture = bbcNewsBlocksFixture;
      const mockJson = buildBbcNextData(fixture.blocks);
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

    it('articleData.blocks 為空陣列時應回退使用 content.model.blocks 的 BBC 內容', () => {
      const bbcBlocks = [
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

      const mockJson = {
        props: {
          pageProps: {
            pageData: {
              blocks: [],
              content: { model: { blocks: bbcBlocks } },
              promo: { headlines: { seoHeadline: 'BBC Test Article' } },
            },
          },
        },
      };

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
        // 涵蓋 _extractBbcText model !object
        { type: 'headline', model: null },
        // 涵蓋 subheadline 正常提取
        {
          type: 'subheadline',
          model: { blocks: [{ type: 'paragraph', model: { text: 'Sub Heading Text' } }] },
        },
        // 涵蓋 _extractBbcText child !object
        {
          type: 'text',
          model: {
            blocks: [null, 'string-is-not-object', { type: 'paragraph', model: { text: '' } }],
          },
        },
        // 涵蓋 switch-case 略過區塊的邏輯
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

    it('should skip malformed block items', () => {
      const input = [null, undefined, 'bad-block', { blockType: 'paragraph', text: 'Valid' }];
      const output = NextJsExtractor.convertBlocks(input);

      expect(output).toHaveLength(1);
      expect(output[0].type).toBe('paragraph');
      expect(output[0].paragraph.rich_text[0].text.content).toBe('Valid');
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
