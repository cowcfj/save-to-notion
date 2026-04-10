/**
 * BlockBuilder 單元測試
 *
 * 測試 Notion 區塊構建工具函數
 */

const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('@babel/core');

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
  splitTextForHighlight,
  textToParagraphs,
  createFallbackBlocks,
  isValidBlock,
} = require('../../../../scripts/background/utils/BlockBuilder');
const {
  NOTION_CODE_LANGUAGE_PLAIN_TEXT,
} = require('../../../../scripts/config/notionCodeLanguages.js');

const blockBuilderPath = path.resolve(
  __dirname,
  '../../../../scripts/background/utils/BlockBuilder.js'
);

function loadBlockBuilderInVm() {
  const source = fs.readFileSync(blockBuilderPath, 'utf8');
  const transformed = transformSync(source, {
    filename: blockBuilderPath,
    sourceType: 'unambiguous',
    presets: [['@babel/preset-env', { targets: { node: 'current' }, modules: 'commonjs' }]],
  });

  const module = { exports: {} };
  const localRequire = Module.createRequire(blockBuilderPath);
  const dirname = path.dirname(blockBuilderPath);
  const context = vm.createContext({
    console,
    process,
    globalThis: {},
    exports: module.exports,
    module,
    require: localRequire,
    __filename: blockBuilderPath,
    __dirname: dirname,
  });

  // Intentional VM-based execution for isolated NaN parameter testing (SonarQube: sonarjs/code-eval)
   
  const wrapper = new vm.Script(
    `(function (exports, require, module, __filename, __dirname) { ${transformed.code}\n})`,
    {
      filename: blockBuilderPath,
    }
  ).runInContext(context, { timeout: 1000 });

  wrapper(module.exports, localRequire, module, blockBuilderPath, dirname);

  return { context, exports: module.exports };
}

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
      expect(result.text.content).toHaveLength(MAX_TEXT_LENGTH);
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
      expect(result.code.language).toBe(NOTION_CODE_LANGUAGE_PLAIN_TEXT);
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

  describe('splitTextForHighlight', () => {
    test('應該在標點符號處智能分割', () => {
      // maxLength = 1000. 讓第二個 '。' 落在 (500, 1000) 區間內
      // 5 + 800 + 1 = 806
      const longText = `這是一個。${'a'.repeat(800)}。${'b'.repeat(500)}`;
      const chunks = splitTextForHighlight(longText, 1000);

      // chunks[0] should be split at the second '。' (index 805, length 806)
      expect(chunks[0]).toHaveLength(806);
      expect(chunks[0].endsWith('。')).toBe(true);
      expect(chunks[1]).toBe('b'.repeat(500));
    });

    test('應該在換行處優先分割', () => {
      // 確保總長度超過 1000，且第二個 \n 在 500 之後
      const longText = `第一段\n${'a'.repeat(800)}\n第二段${'b'.repeat(300)}`;
      const chunks = splitTextForHighlight(longText, 1000);

      expect(chunks[0]).toBe(`第一段\n${'a'.repeat(800)}`);
      expect(chunks[1]).toBe(`第二段${'b'.repeat(300)}`);
    });

    test('找不到標點時應在空格處分割', () => {
      const longText = `${'a'.repeat(600)} ${'b'.repeat(600)}`;
      const chunks = splitTextForHighlight(longText, 1000);

      expect(chunks[0]).toBe('a'.repeat(600));
      expect(chunks[1]).toBe('b'.repeat(600));
    });

    test('什麼都找不到時應強制分割', () => {
      const longText = 'a'.repeat(2000);
      const chunks = splitTextForHighlight(longText, 1000);

      expect(chunks[0]).toHaveLength(1000);
      expect(chunks[1]).toHaveLength(1000);
    });

    test('應該處理 null 或空字符串', () => {
      expect(splitTextForHighlight(null)).toEqual(['']);
      expect(splitTextForHighlight('')).toEqual(['']);
    });

    test('maxLength 小於等於 0 時應安全回退並返回原文', () => {
      expect(splitTextForHighlight('需要保留的文字', 0)).toEqual(['需要保留的文字']);
      expect(splitTextForHighlight('需要保留的文字', -5)).toEqual(['需要保留的文字']);
    });

    test('maxLength 為 NaN 時應安全回退並返回原文', () => {
      const { context, exports } = loadBlockBuilderInVm();
      context.__splitTextForHighlight = exports.splitTextForHighlight;

      // Intentional VM-based execution for isolated NaN parameter testing (SonarQube: sonarjs/code-eval)
       
      new vm.Script(
        "globalThis.__result = __splitTextForHighlight('需要保留的文字', Number.NaN);"
      ).runInContext(context, {
        timeout: 1000,
      });

      expect(context.globalThis.__result).toEqual(['需要保留的文字']);
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

      expect(result).toHaveLength(3);
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
      expect(result).toHaveLength(3);
      expect(result[1].paragraph.rich_text[0].text.content).toHaveLength(MAX_TEXT_LENGTH);
      expect(result[2].paragraph.rich_text[0].text.content).toHaveLength(500);
      expect(result[2].paragraph.rich_text[0].annotations.color).toBe('yellow');
    });
  });

  describe('textToParagraphs', () => {
    test('should split text into paragraph blocks', () => {
      const text = 'First paragraph.\n\nSecond paragraph with more content.';
      const result = textToParagraphs(text);

      expect(result).toHaveLength(2);
      expect(result[0].paragraph.rich_text[0].text.content).toBe('First paragraph.');
      expect(result[1].paragraph.rich_text[0].text.content).toBe(
        'Second paragraph with more content.'
      );
    });

    test('should filter paragraphs by minimum length', () => {
      const text = 'Short.\n\nThis is a longer paragraph that should pass the filter.';
      const result = textToParagraphs(text, { minLength: 15 });

      expect(result).toHaveLength(1);
    });

    test('should return empty array for invalid input', () => {
      expect(textToParagraphs(null)).toEqual([]);
      expect(textToParagraphs('')).toEqual([]);
    });
  });

  describe('createFallbackBlocks', () => {
    test('should create fallback paragraph with default message', () => {
      const result = createFallbackBlocks();
      expect(result).toHaveLength(1);
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
      expect(isValidBlock()).toBe(false);
      expect(isValidBlock({})).toBe(false);
      expect(isValidBlock({ object: 'block' })).toBe(false);
      expect(isValidBlock({ type: 'paragraph' })).toBe(false);
    });
  });
});
