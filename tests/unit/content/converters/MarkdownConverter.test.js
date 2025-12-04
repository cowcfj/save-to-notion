/**
 * @jest-environment jsdom
 */

import { markdownConverter } from '../../../../scripts/content/converters/MarkdownConverter.js';

// Mock TurndownService
class MockTurndownService {
  constructor(options) {
    this.options = options;
    this.rules = {};
  }
  use(_plugin) {
    return this;
  }
  addRule(name, rule) {
    this.rules[name] = rule;
  }
  turndown(_html) {
    // Use this.options to silence unused warning if needed, or just ignore
    const _opts = this.options;
    return '# Mock Markdown Title\n\nParagraph text.';
  }
}

global.TurndownService = MockTurndownService;
global.turndownPluginGfm = { gfm: {} };
global.Logger = { warn: jest.fn() };

describe('MarkdownConverter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton instance state if needed, but it's stateless mostly except turndownService instance
    markdownConverter.turndownService = null;
  });

  describe('convertMarkdown', () => {
    test('should convert headings', () => {
      const md = '# H1\n## H2\n### H3';
      const blocks = markdownConverter.convertMarkdown(md);
      expect(blocks).toHaveLength(3);
      expect(blocks[0].type).toBe('heading_1');
      expect(blocks[1].type).toBe('heading_2');
      expect(blocks[2].type).toBe('heading_3');
    });

    test('should convert lists', () => {
      const md = '- Item 1\n* Item 2\n1. Ordered';
      const blocks = markdownConverter.convertMarkdown(md);
      expect(blocks).toHaveLength(3);
      expect(blocks[0].type).toBe('bulleted_list_item');
      expect(blocks[1].type).toBe('bulleted_list_item');
      expect(blocks[2].type).toBe('numbered_list_item');
    });

    test('should convert code blocks', () => {
      const md = '```js\nconsole.log("hi");\n```';
      const blocks = markdownConverter.convertMarkdown(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('code');
      expect(blocks[0].code.language).toBe('javascript');
      expect(blocks[0].code.rich_text[0].text.content).toBe('console.log("hi");');
    });

    test('should convert images', () => {
      const md = '![Alt](https://example.com/img.jpg)';
      const blocks = markdownConverter.convertMarkdown(md);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('image');
      expect(blocks[0].image.external.url).toBe('https://example.com/img.jpg');
    });
  });

  describe('convertHtml', () => {
    test('should use TurndownService to convert HTML', () => {
      const html = '<h1>Title</h1><p>Text</p>';
      const blocks = markdownConverter.convertHtml(html);

      // Based on MockTurndownService output
      expect(blocks).toHaveLength(2);
      expect(blocks[0].type).toBe('heading_1');
      expect(blocks[0].heading_1.rich_text[0].text.content).toBe('Mock Markdown Title');
    });

    test('should return empty array if TurndownService missing', () => {
      const originalTurndown = global.TurndownService;
      global.TurndownService = undefined;

      const blocks = markdownConverter.convertHtml('<div></div>');
      expect(blocks).toEqual([]);
      expect(global.Logger.warn).toHaveBeenCalled();

      global.TurndownService = originalTurndown;
    });
  });
});
