/**
 * BlockBuilder 單元測試
 *
 * 測試 Notion 區塊構建工具函數
 */

const {
  MAX_TEXT_LENGTH,
  createRichText,
  createParagraph,
  createHeading,
  createImage,
  createCodeBlock,
  createBulletItem,
  createNumberedItem,
  createQuote,
  createDivider,
  buildHighlightBlocks,
  textToParagraphs,
  createFallbackBlocks,
  isValidBlock,
} = require('../../../../scripts/background/utils/BlockBuilder');

describe('BlockBuilder', () => {
  describe('createRichText', () => {
    test('should create basic rich text object', () => {
      const result = createRichText('Hello World');
      expect(result.type).toBe('text');
      expect(result.text.content).toBe('Hello World');
    });

    test('should truncate text to MAX_TEXT_LENGTH', () => {
      const longText = 'a'.repeat(3000);
      const result = createRichText(longText);
      expect(result.text.content.length).toBe(MAX_TEXT_LENGTH);
    });

    test('should add color annotation', () => {
      const result = createRichText('Colored text', { color: 'blue' });
      expect(result.annotations.color).toBe('blue');
    });

    test('should add link', () => {
      const result = createRichText('Link text', { link: 'https://example.com' });
      expect(result.text.link.url).toBe('https://example.com');
    });

    test('should add multiple annotations', () => {
      const result = createRichText('Styled text', {
        bold: true,
        italic: true,
        code: true,
      });
      expect(result.annotations.bold).toBe(true);
      expect(result.annotations.italic).toBe(true);
      expect(result.annotations.code).toBe(true);
    });

    test('should handle empty content', () => {
      const result = createRichText('');
      expect(result.text.content).toBe('');
    });

    test('should handle null content', () => {
      const result = createRichText(null);
      expect(result.text.content).toBe('');
    });
  });

  describe('createParagraph', () => {
    test('should create paragraph block', () => {
      const result = createParagraph('Test paragraph');
      expect(result.object).toBe('block');
      expect(result.type).toBe('paragraph');
      expect(result.paragraph.rich_text[0].text.content).toBe('Test paragraph');
    });

    test('should pass options to rich text', () => {
      const result = createParagraph('Bold text', { bold: true });
      expect(result.paragraph.rich_text[0].annotations.bold).toBe(true);
    });
  });

  describe('createHeading', () => {
    test('should create heading_1 block', () => {
      const result = createHeading('Title', 1);
      expect(result.type).toBe('heading_1');
      expect(result.heading_1.rich_text[0].text.content).toBe('Title');
    });

    test('should create heading_2 block by default', () => {
      const result = createHeading('Subtitle');
      expect(result.type).toBe('heading_2');
    });

    test('should create heading_3 block', () => {
      const result = createHeading('Section', 3);
      expect(result.type).toBe('heading_3');
    });

    test('should clamp level to valid range', () => {
      const result1 = createHeading('Test', 0);
      expect(result1.type).toBe('heading_1');

      const result2 = createHeading('Test', 5);
      expect(result2.type).toBe('heading_3');
    });
  });

  describe('createImage', () => {
    test('should create image block with external URL', () => {
      const result = createImage('https://example.com/image.png');
      expect(result.type).toBe('image');
      expect(result.image.type).toBe('external');
      expect(result.image.external.url).toBe('https://example.com/image.png');
    });

    test('should add caption when provided', () => {
      const result = createImage('https://example.com/image.png', 'Image caption');
      expect(result.image.caption[0].text.content).toBe('Image caption');
    });

    test('should not add caption when empty', () => {
      const result = createImage('https://example.com/image.png', '');
      expect(result.image.caption).toBeUndefined();
    });
  });

  describe('createCodeBlock', () => {
    test('should create code block with default language', () => {
      const result = createCodeBlock('const x = 1;');
      expect(result.type).toBe('code');
      expect(result.code.language).toBe('plain text');
      expect(result.code.rich_text[0].text.content).toBe('const x = 1;');
    });

    test('should create code block with specified language', () => {
      const result = createCodeBlock('print("hello")', 'python');
      expect(result.code.language).toBe('python');
    });
  });

  describe('createBulletItem', () => {
    test('should create bulleted list item', () => {
      const result = createBulletItem('List item');
      expect(result.type).toBe('bulleted_list_item');
      expect(result.bulleted_list_item.rich_text[0].text.content).toBe('List item');
    });
  });

  describe('createNumberedItem', () => {
    test('should create numbered list item', () => {
      const result = createNumberedItem('Numbered item');
      expect(result.type).toBe('numbered_list_item');
      expect(result.numbered_list_item.rich_text[0].text.content).toBe('Numbered item');
    });
  });

  describe('createQuote', () => {
    test('should create quote block', () => {
      const result = createQuote('Famous quote');
      expect(result.type).toBe('quote');
      expect(result.quote.rich_text[0].text.content).toBe('Famous quote');
    });
  });

  describe('createDivider', () => {
    test('should create divider block', () => {
      const result = createDivider();
      expect(result.object).toBe('block');
      expect(result.type).toBe('divider');
      expect(result.divider).toEqual({});
    });
  });

  describe('buildHighlightBlocks', () => {
    test('should return empty array for empty highlights', () => {
      expect(buildHighlightBlocks([])).toEqual([]);
      expect(buildHighlightBlocks(null)).toEqual([]);
    });

    test('should create heading and highlight paragraphs', () => {
      const highlights = [
        { text: 'First highlight', color: 'yellow' },
        { text: 'Second highlight', color: 'blue' },
      ];

      const result = buildHighlightBlocks(highlights);

      expect(result.length).toBe(3);
      expect(result[0].type).toBe('heading_3');
      expect(result[0].heading_3.rich_text[0].text.content).toBe('📝 頁面標記');
      expect(result[1].paragraph.rich_text[0].text.content).toBe('First highlight');
      expect(result[2].paragraph.rich_text[0].annotations.color).toBe('blue');
    });

    test('should use custom title', () => {
      const highlights = [{ text: 'Test' }];
      const result = buildHighlightBlocks(highlights, 'Custom Title');
      expect(result[0].heading_3.rich_text[0].text.content).toBe('Custom Title');
    });

    test('should split long highlight text into multiple blocks', () => {
      const longText = 'a'.repeat(2500);
      const highlights = [{ text: longText, color: 'yellow' }];
      const result = buildHighlightBlocks(highlights);

      // 1 heading + 2 paragraphs for the split text
      expect(result.length).toBe(3);
      expect(result[1].paragraph.rich_text[0].text.content.length).toBe(MAX_TEXT_LENGTH);
      expect(result[2].paragraph.rich_text[0].text.content.length).toBe(500);
      expect(result[2].paragraph.rich_text[0].annotations.color).toBe('yellow');
    });
  });

  describe('textToParagraphs', () => {
    test('should split text into paragraph blocks', () => {
      const text = 'First paragraph.\n\nSecond paragraph with more content.';
      const result = textToParagraphs(text);

      expect(result.length).toBe(2);
      expect(result[0].paragraph.rich_text[0].text.content).toBe('First paragraph.');
      expect(result[1].paragraph.rich_text[0].text.content).toBe(
        'Second paragraph with more content.'
      );
    });

    test('should filter paragraphs by minimum length', () => {
      const text = 'Short.\n\nThis is a longer paragraph that should pass the filter.';
      const result = textToParagraphs(text, { minLength: 15 });

      expect(result.length).toBe(1);
    });

    test('should return empty array for invalid input', () => {
      expect(textToParagraphs(null)).toEqual([]);
      expect(textToParagraphs('')).toEqual([]);
    });
  });

  describe('createFallbackBlocks', () => {
    test('should create fallback paragraph with default message', () => {
      const result = createFallbackBlocks();
      expect(result.length).toBe(1);
      expect(result[0].paragraph.rich_text[0].text.content).toBe('Content extraction failed.');
    });

    test('should create fallback paragraph with custom message', () => {
      const result = createFallbackBlocks('Custom error message');
      expect(result[0].paragraph.rich_text[0].text.content).toBe('Custom error message');
    });
  });

  describe('isValidBlock', () => {
    test('should return true for valid blocks', () => {
      expect(isValidBlock(createParagraph('Test'))).toBe(true);
      expect(isValidBlock(createHeading('Title'))).toBe(true);
      expect(isValidBlock(createDivider())).toBe(true);
    });

    test('should return false for invalid inputs', () => {
      expect(isValidBlock(null)).toBe(false);
      // skipcq: JS-0356 - Intentionally testing undefined input handling
      expect(isValidBlock()).toBe(false);
      expect(isValidBlock({})).toBe(false);
      expect(isValidBlock({ object: 'block' })).toBe(false);
      expect(isValidBlock({ type: 'paragraph' })).toBe(false);
    });
  });
});
