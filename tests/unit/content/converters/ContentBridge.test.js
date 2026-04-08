/**
 * ContentBridge 單元測試
 */
const {
  bridgeContentToBlocks,
  createTextBlocks,
  createFallbackResult,
} = require('../../../../scripts/content/converters/ContentBridge.js');
const { TEXT_PROCESSING } = require('../../../../scripts/config/index.js');

describe('ContentBridge', () => {
  // Mock Logger
  beforeAll(() => {
    globalThis.Logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      success: jest.fn(),
      start: jest.fn(),
      ready: jest.fn(),
    };
    globalThis.document = {
      title: 'Test Document',
      createElement: jest.fn(() => ({
        innerHTML: '',
        textContent: '',
        innerText: '',
      })),
    };
  });

  afterAll(() => {
    delete globalThis.Logger;
    delete globalThis.document;
  });

  describe('bridgeContentToBlocks', () => {
    test('應處理空輸入並返回回退結果', () => {
      const result = bridgeContentToBlocks(null);

      expect(result).toHaveProperty('title', 'Untitled');
      expect(result).toHaveProperty('blocks');
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].paragraph.rich_text[0].text.content).toContain('No content');
      expect(result).toHaveProperty('siteIcon', null);
    });

    test('應正確提取標題', () => {
      const extractedContent = {
        content: '<p>Test</p>',
        type: 'html',
        metadata: { title: 'Custom Title' },
      };

      const mockConverter = {
        convert: jest.fn(() => [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: { rich_text: [{ type: 'text', text: { content: 'Test' } }] },
          },
        ]),
      };

      const result = bridgeContentToBlocks(extractedContent, { htmlConverter: mockConverter });

      expect(result.title).toBe('Custom Title');
    });

    test('應從 rawArticle 回退標題', () => {
      const extractedContent = {
        content: '<p>Test</p>',
        type: 'html',
        metadata: {},
        rawArticle: { title: 'Article Title' },
      };

      const mockConverter = {
        convert: jest.fn(() => []),
      };

      const result = bridgeContentToBlocks(extractedContent, { htmlConverter: mockConverter });

      expect(result.title).toBe('Article Title');
    });

    test('應調用 HTML 轉換器處理 HTML 內容', () => {
      const mockBlocks = [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [] } }];
      const mockConverter = {
        convert: jest.fn(() => mockBlocks),
      };

      const extractedContent = {
        content: '<p>Hello World</p>',
        type: 'html',
        metadata: { title: 'Test' },
      };

      const result = bridgeContentToBlocks(extractedContent, { htmlConverter: mockConverter });

      expect(mockConverter.convert).toHaveBeenCalledWith('<p>Hello World</p>');
      expect(result.blocks).toEqual(mockBlocks);
    });

    test('應在 blocks 開頭插入封面圖', () => {
      const mockBlocks = [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [] } }];
      const mockConverter = {
        convert: jest.fn(() => [...mockBlocks]),
      };

      const extractedContent = {
        content: '<p>Content</p>',
        type: 'html',
        metadata: {
          title: 'Test',
          featuredImage: 'https://example.com/image.jpg',
        },
      };

      const result = bridgeContentToBlocks(extractedContent, {
        htmlConverter: mockConverter,
        includeFeaturedImage: true,
      });

      expect(result.blocks[0].type).toBe('image');
      expect(result.blocks[0].image.external.url).toBe('https://example.com/image.jpg');
      expect(result.blocks).toHaveLength(2);
    });

    test('應跳過重複的封面圖', () => {
      const featuredImageUrl = 'https://example.com/image.jpg';
      const mockBlocks = [
        {
          object: 'block',
          type: 'image',
          image: { external: { url: featuredImageUrl } },
        },
      ];
      const mockConverter = {
        convert: jest.fn(() => [...mockBlocks]),
      };

      const extractedContent = {
        content: '<p>Content</p>',
        type: 'html',
        metadata: {
          title: 'Test',
          featuredImage: featuredImageUrl,
        },
      };

      const result = bridgeContentToBlocks(extractedContent, {
        htmlConverter: mockConverter,
        includeFeaturedImage: true,
      });

      // 應該只有原本的一個 image block，不應重複添加
      expect(result.blocks).toHaveLength(1);
    });

    test('應正確提取 siteIcon', () => {
      const mockConverter = {
        convert: jest.fn(() => []),
      };

      const extractedContent = {
        content: '<p>Test</p>',
        type: 'html',
        metadata: {
          title: 'Test',
          siteIcon: 'https://example.com/icon.png',
        },
      };

      const result = bridgeContentToBlocks(extractedContent, { htmlConverter: mockConverter });

      expect(result.siteIcon).toBe('https://example.com/icon.png');
    });

    test('應回退到 favicon 當 siteIcon 不存在', () => {
      const mockConverter = {
        convert: jest.fn(() => []),
      };

      const extractedContent = {
        content: '<p>Test</p>',
        type: 'html',
        metadata: {
          title: 'Test',
          favicon: 'https://example.com/favicon.ico',
        },
      };

      const result = bridgeContentToBlocks(extractedContent, { htmlConverter: mockConverter });

      expect(result.siteIcon).toBe('https://example.com/favicon.ico');
    });

    test('應在轉換器拋出錯誤時使用回退處理', () => {
      const mockConverter = {
        convert: jest.fn(() => {
          throw new Error('Conversion failed');
        }),
      };

      // Mock document.createElement 更完整
      const originalCreateElement = globalThis.document.createElement;
      globalThis.document.createElement = jest.fn(() => ({
        innerHTML: '',
        get textContent() {
          return 'Fallback text content';
        },
        innerText: 'Fallback text content',
      }));

      const extractedContent = {
        content: '<p>Test</p>',
        type: 'html',
        metadata: { title: 'Test' },
      };

      const result = bridgeContentToBlocks(extractedContent, { htmlConverter: mockConverter });

      expect(result.blocks.length).toBeGreaterThanOrEqual(1);
      expect(Logger.error).toHaveBeenCalled();

      globalThis.document.createElement = originalCreateElement;
    });

    test('應在空 blocks 結果時創建回退區塊', () => {
      const mockConverter = {
        convert: jest.fn(() => []),
      };

      const extractedContent = {
        content: '<p>Test</p>',
        type: 'html',
        metadata: { title: 'Test' },
      };

      const result = bridgeContentToBlocks(extractedContent, { htmlConverter: mockConverter });

      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].type).toBe('paragraph');
    });

    test('應禁用封面圖插入當 includeFeaturedImage 為 false', () => {
      const mockBlocks = [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [] } }];
      const mockConverter = {
        convert: jest.fn(() => [...mockBlocks]),
      };

      const extractedContent = {
        content: '<p>Content</p>',
        type: 'html',
        metadata: {
          title: 'Test',
          featuredImage: 'https://example.com/image.jpg',
        },
      };

      const result = bridgeContentToBlocks(extractedContent, {
        htmlConverter: mockConverter,
        includeFeaturedImage: false,
      });

      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].type).toBe('paragraph');
    });

    test('includeTitle 應插入合法的 notion block shape', () => {
      const extractedContent = {
        content: '<p>Body</p>',
        type: 'html',
        metadata: { title: 'Heading Title' },
      };

      const mockConverter = {
        convert: jest.fn(() => [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: { rich_text: [{ type: 'text', text: { content: 'Body' } }] },
          },
        ]),
      };

      const result = bridgeContentToBlocks(extractedContent, {
        htmlConverter: mockConverter,
        includeTitle: true,
      });

      expect(result.blocks[0]).toEqual(
        expect.objectContaining({
          object: 'block',
          type: 'heading_1',
        })
      );

      // 驗證 heading_1 的 rich_text 內容
      expect(result.blocks[0].heading_1.rich_text).toEqual([
        {
          type: 'text',
          text: { content: 'Heading Title' },
        },
      ]);
    });

    test('應截斷超過最大 rich_text 長度的標題', () => {
      const longTitle = 'A'.repeat(TEXT_PROCESSING.MAX_RICH_TEXT_LENGTH + 500);
      const mockBlocks = [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [] } }];
      const mockConverter = {
        convert: jest.fn(() => mockBlocks),
      };

      const extractedContent = {
        content: '<p>Test content</p>',
        type: 'html',
        metadata: { title: longTitle },
      };

      const result = bridgeContentToBlocks(extractedContent, {
        htmlConverter: mockConverter,
        includeTitle: true,
      });

      // 驗證標題被截斷為 rich_text 上限
      expect(result.blocks[0].type).toBe('heading_1');
      expect(result.blocks[0].heading_1.rich_text[0].text.content).toHaveLength(
        TEXT_PROCESSING.MAX_RICH_TEXT_LENGTH
      );
      expect(result.blocks[0].heading_1.rich_text[0].text.content).toBe(
        'A'.repeat(TEXT_PROCESSING.MAX_RICH_TEXT_LENGTH)
      );
    });

    test('應處理 null 標題', () => {
      const mockBlocks = [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [] } }];
      const mockConverter = {
        convert: jest.fn(() => mockBlocks),
      };

      const extractedContent = {
        content: '<p>Test content</p>',
        type: 'html',
        metadata: { title: null },
      };

      const result = bridgeContentToBlocks(extractedContent, {
        htmlConverter: mockConverter,
        includeTitle: true,
      });

      // 驗證不會因為 null 標題而崩潰
      expect(result.blocks[0].type).toBe('paragraph'); // 沒有插入標題
    });

    test('應處理 undefined 標題', () => {
      const mockBlocks = [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [] } }];
      const mockConverter = {
        convert: jest.fn(() => mockBlocks),
      };

      const extractedContent = {
        content: '<p>Test content</p>',
        type: 'html',
        metadata: { title: undefined },
      };

      const result = bridgeContentToBlocks(extractedContent, {
        htmlConverter: mockConverter,
        includeTitle: true,
      });

      expect(result.blocks[0].type).toBe('paragraph');
    });

    test('應使用截斷後的標題避免重複插入 heading_1', () => {
      const longTitle = 'A'.repeat(TEXT_PROCESSING.MAX_RICH_TEXT_LENGTH + 50);
      const truncatedTitle = longTitle.slice(0, TEXT_PROCESSING.MAX_RICH_TEXT_LENGTH);
      const mockBlocks = [
        {
          object: 'block',
          type: 'heading_1',
          heading_1: {
            rich_text: [{ type: 'text', text: { content: truncatedTitle } }],
          },
        },
      ];
      const mockConverter = {
        convert: jest.fn(() => [...mockBlocks]),
      };

      const extractedContent = {
        content: '<p>Test content</p>',
        type: 'html',
        metadata: { title: longTitle },
      };

      const result = bridgeContentToBlocks(extractedContent, {
        htmlConverter: mockConverter,
        includeTitle: true,
      });

      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].type).toBe('heading_1');
      expect(result.blocks[0].heading_1.rich_text[0].text.content).toBe(truncatedTitle);
    });

    test('應在遇到未知內容類型時使用回退處理', () => {
      const extractedContent = {
        content: '<p>Unknown</p>',
        type: 'unknown',
        metadata: { title: 'Test' },
      };
      const result = bridgeContentToBlocks(extractedContent);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].type).toBe('paragraph');
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('未知內容類型'),
        expect.objectContaining({ type: 'unknown' })
      );
    });

    test('應在使用全局 ConverterFactory 時處理轉換', () => {
      const extractedContent = {
        content: '<p>Global</p>',
        type: 'html',
        metadata: { title: 'Test' },
      };

      const mockConverter = {
        convert: jest.fn(() => [
          { object: 'block', type: 'paragraph', paragraph: { rich_text: [] } },
        ]),
      };

      globalThis.ConverterFactory = {
        getConverter: jest.fn(() => mockConverter),
      };

      const result = bridgeContentToBlocks(extractedContent);
      expect(globalThis.ConverterFactory.getConverter).toHaveBeenCalledWith('html');
      expect(mockConverter.convert).toHaveBeenCalledWith('<p>Global</p>');
      expect(result.blocks).toHaveLength(1);

      delete globalThis.ConverterFactory;
    });

    test('當轉換器不可用時應回退到純文本', () => {
      const extractedContent = {
        content: '<p>Global</p>',
        type: 'html',
        metadata: { title: 'Test' },
      };

      globalThis.ConverterFactory = {
        getConverter: jest.fn(() => null),
      };

      const result = bridgeContentToBlocks(extractedContent);
      expect(result.blocks[0].type).toBe('paragraph');
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('轉換器不可用'),
        expect.any(Object)
      );

      delete globalThis.ConverterFactory;
    });
  });

  describe('createTextBlocks', () => {
    beforeEach(() => {
      // Mock document.createElement 返回可設置 innerHTML 的對象
      globalThis.document.createElement = jest.fn(() => {
        const elem = {
          _innerHTML: '',
          _textContent: '',
          get innerHTML() {
            return this._innerHTML;
          },
          set innerHTML(val) {
            this._innerHTML = val;
            // 模擬瀏覽器行為：設置 innerHTML 後更新 textContent
            // 使用安全的字串處理方法來移除 HTML 標籤，避免 ReDoS 風險
            let result = '';
            let inTag = false;
            for (const char of val) {
              if (char === '<') {
                inTag = true;
              } else if (char === '>') {
                inTag = false;
              } else if (!inTag) {
                result += char;
              }
            }
            this._textContent = result;
          },
          get textContent() {
            return this._textContent;
          },
          get innerText() {
            return this._textContent;
          },
        };
        return elem;
      });
    });

    test('應處理空輸入', () => {
      const result = createTextBlocks(null);
      expect(result).toEqual([]);
    });

    test('應處理非字串輸入', () => {
      const result = createTextBlocks(123);
      expect(result).toEqual([]);
    });

    test('應處理只有空白的字串', () => {
      const result = createTextBlocks('   ');
      expect(result).toHaveLength(0);
    });

    test('應將純文本轉換為段落區塊', () => {
      const result = createTextBlocks('Hello World');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('paragraph');
      expect(result[0].paragraph.rich_text[0].text.content).toBe('Hello World');
    });

    test('應按雙換行分割為多個段落', () => {
      const result = createTextBlocks('First paragraph\n\nSecond paragraph');
      expect(result).toHaveLength(2);
      expect(result[0].paragraph.rich_text[0].text.content).toBe('First paragraph');
      expect(result[1].paragraph.rich_text[0].text.content).toBe('Second paragraph');
    });

    test('應跳過只包含空白內容的段落', () => {
      // 模擬分割後有一些空字串或僅含空白的段落片段
      const result = createTextBlocks('First\n\n   \n\nSecond');
      expect(result).toHaveLength(2);
      expect(result[0].paragraph.rich_text[0].text.content).toBe('First');
      expect(result[1].paragraph.rich_text[0].text.content).toBe('Second');
    });

    test('應移除 HTML 標籤', () => {
      const result = createTextBlocks('<p>Hello</p><strong>World</strong>');
      expect(result).toHaveLength(1);
      expect(result[0].paragraph.rich_text[0].text.content).not.toContain('<');
    });

    test('應處理超長段落並分割', () => {
      const longText = 'A'.repeat(2500);
      const result = createTextBlocks(longText);
      expect(result.length).toBeGreaterThan(1);
      expect(result[0].paragraph.rich_text[0].text.content.length).toBeLessThanOrEqual(2000);
    });
  });

  describe('createFallbackResult', () => {
    test('應創建正確格式的回退結果', () => {
      const result = createFallbackResult('Test Title', 'Test message');

      expect(result).toEqual({
        title: 'Test Title',
        blocks: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content: 'Test message' } }],
            },
          },
        ],
        siteIcon: null,
      });
    });
  });

  describe('extractAndBridge', () => {
    const { extractAndBridge } = require('../../../../scripts/content/converters/ContentBridge.js');

    afterEach(() => {
      delete globalThis.ContentExtractor;
    });

    test('當 ContentExtractor 未載入時，應返回回退結果', () => {
      const doc = { title: 'Test Document Title' };
      const result = extractAndBridge(doc);

      expect(result.title).toBe('Test Document Title');
      expect(result.blocks[0].paragraph.rich_text[0].text.content).toContain('not available');
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('未載入'),
        expect.any(Object)
      );
    });

    test('當 ContentExtractor 成功提取時，應調用 bridgeContentToBlocks', () => {
      const doc = { title: 'Test Document Title' };
      const extractedContent = {
        content: '<p>Extracted</p>',
        type: 'html',
        metadata: { title: 'Extracted Title' },
      };

      globalThis.ContentExtractor = {
        extract: jest.fn(() => extractedContent),
      };

      const options = { includeTitle: false };

      const result = extractAndBridge(doc, options);

      expect(globalThis.ContentExtractor.extract).toHaveBeenCalledWith(doc);
      expect(result.title).toBe('Extracted Title');
      expect(result.blocks[0].paragraph.rich_text[0].text.content).toContain('Extracted');
    });
  });
});
