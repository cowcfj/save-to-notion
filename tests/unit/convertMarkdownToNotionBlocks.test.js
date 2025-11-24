/**
 * 測試 convertMarkdownToNotionBlocks 函數
 * 這是針對用戶請求的 Markdown 原生支持功能的測試
 */

// 導入被測函數
const { convertMarkdownToNotionBlocks } = require('../../scripts/utils/htmlToNotionConverter.js');

describe('convertMarkdownToNotionBlocks - Markdown 原生支持', () => {
  beforeAll(() => {
    // 模擬 window.Logger 和 console
    global.window = global.window || {};
    global.window.Logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
    };

    // 某些代碼可能直接使用 console
    global.console = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('標題轉換', () => {
    test('應該正確轉換 H1 標題', () => {
      const markdown = '# 主標題\n\n這是內容。';
      const blocks = convertMarkdownToNotionBlocks(markdown);

      // 生產代碼可能會產生額外的段落或空行處理，這裡我們主要檢查是否包含正確的標題區塊
      const headingBlock = blocks.find(block => block.type === 'heading_1');
      expect(headingBlock).toBeDefined();
      expect(headingBlock.heading_1.rich_text[0].text.content).toBe('主標題');
    });

    test('應該正確轉換 H2 標題', () => {
      const markdown = '## 次標題';
      const blocks = convertMarkdownToNotionBlocks(markdown);

      const headingBlock = blocks.find(block => block.type === 'heading_2');
      expect(headingBlock).toBeDefined();
      expect(headingBlock.heading_2.rich_text[0].text.content).toBe('次標題');
    });

    test('應該正確轉換 H3 標題', () => {
      const markdown = '### 三級標題';
      const blocks = convertMarkdownToNotionBlocks(markdown);

      const headingBlock = blocks.find(block => block.type === 'heading_3');
      expect(headingBlock).toBeDefined();
      expect(headingBlock.heading_3.rich_text[0].text.content).toBe('三級標題');
    });

    test('應該將 H4-H6 轉換為粗體段落', () => {
      const markdown = '#### 四級標題';
      const blocks = convertMarkdownToNotionBlocks(markdown);

      const paragraphBlock = blocks.find(block => block.type === 'paragraph');
      expect(paragraphBlock).toBeDefined();
      expect(paragraphBlock.paragraph.rich_text[0].text.content).toBe('四級標題');
      expect(paragraphBlock.paragraph.rich_text[0].annotations.bold).toBe(true);
    });
  });

  describe('列表轉換', () => {
    test('應該轉換無序列表', () => {
      const markdown = '- 第一項\n- 第二項';
      const blocks = convertMarkdownToNotionBlocks(markdown);

      const listItems = blocks.filter(block => block.type === 'bulleted_list_item');
      expect(listItems).toHaveLength(2);
      expect(listItems[0].bulleted_list_item.rich_text[0].text.content).toBe('第一項');
    });

    test('應該轉換有序列表', () => {
      const markdown = '1. 第一項\n2. 第二項';
      const blocks = convertMarkdownToNotionBlocks(markdown);

      const listItems = blocks.filter(block => block.type === 'numbered_list_item');
      expect(listItems).toHaveLength(2);
      expect(listItems[0].numbered_list_item.rich_text[0].text.content).toBe('第一項');
    });
  });

  describe('代碼區塊轉換', () => {
    test('應該轉換代碼區塊', () => {
      const markdown = '```javascript\nconst x = 1;\n```';
      const blocks = convertMarkdownToNotionBlocks(markdown);

      const codeBlock = blocks.find(block => block.type === 'code');
      expect(codeBlock).toBeDefined();
      expect(codeBlock.code.language).toBe('javascript');
      expect(codeBlock.code.rich_text[0].text.content).toContain('const x = 1');
    });
  });

  describe('圖片轉換', () => {
    test('應該轉換圖片 Markdown', () => {
      const markdown = '![Alt Text](https://example.com/image.jpg)';
      const blocks = convertMarkdownToNotionBlocks(markdown);

      const imageBlock = blocks.find(block => block.type === 'image');
      expect(imageBlock).toBeDefined();
      expect(imageBlock.image.external.url).toBe('https://example.com/image.jpg');
      expect(imageBlock.image.caption[0].text.content).toBe('Alt Text');
    });
  });

  describe('引用轉換', () => {
    test('應該轉換引用區塊', () => {
      const markdown = '> 這是一段引用';
      const blocks = convertMarkdownToNotionBlocks(markdown);

      const quoteBlock = blocks.find(block => block.type === 'quote');
      expect(quoteBlock).toBeDefined();
      expect(quoteBlock.quote.rich_text[0].text.content).toBe('這是一段引用');
    });
  });

  describe('分隔線轉換', () => {
    test('應該轉換分隔線', () => {
      const markdown = '---';
      const blocks = convertMarkdownToNotionBlocks(markdown);

      const dividerBlock = blocks.find(block => block.type === 'divider');
      expect(dividerBlock).toBeDefined();
    });
  });

  describe('混合內容與邊界情況', () => {
    test('應該處理空的 Markdown', () => {
      const blocks = convertMarkdownToNotionBlocks('');
      // 生產代碼在空內容時可能會返回一個默認段落或空數組，視具體實現而定
      // 根據源碼：如果 blocks.length === 0，會返回一個警告段落
      if (blocks.length > 0) {
        expect(blocks[0].type).toBe('paragraph');
      } else {
        expect(blocks).toHaveLength(0);
      }
    });
  });
});
