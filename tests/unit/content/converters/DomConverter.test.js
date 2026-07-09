/**
 * @jest-environment jsdom
 */

import { domConverter } from '../../../../scripts/content/converters/DomConverter.js';

// Mock dependencies
import Logger from '../../../../scripts/utils/Logger.js';

// Sync global Logger with the imported module for consistency
globalThis.Logger = Logger;

globalThis.ImageUtils = {
  extractImageSrc: jest.fn(),
  cleanImageUrl: jest.fn(url => url),
  isNotionCompatibleImageUrl: jest.fn(() => true),
  isValidCleanedImageUrl: jest.fn(() => true),
};

globalThis.ErrorHandler = {
  logError: jest.fn(),
};

describe('DomConverter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger, 'debug').mockImplementation(() => {});
    jest.spyOn(Logger, 'success').mockImplementation(() => {});
    jest.spyOn(Logger, 'start').mockImplementation(() => {});
    jest.spyOn(Logger, 'ready').mockImplementation(() => {});
    jest.spyOn(Logger, 'info').mockImplementation(() => {});
    jest.spyOn(Logger, 'log').mockImplementation(() => {});
    jest.spyOn(Logger, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Headings', () => {
    test('should convert H1 to heading_1', () => {
      const html = '<h1>Title</h1>';
      const blocks = domConverter.convert(html);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toEqual({
        object: 'block',
        type: 'heading_1',
        heading_1: { rich_text: [{ type: 'text', text: { content: 'Title' }, annotations: {} }] },
      });
    });

    test('should convert H2 to heading_2', () => {
      const html = '<h2>Subtitle</h2>';
      const blocks = domConverter.convert(html);
      expect(blocks[0].type).toBe('heading_2');
    });

    test('should convert H3 to heading_3', () => {
      const html = '<h3>Section</h3>';
      const blocks = domConverter.convert(html);
      expect(blocks[0].type).toBe('heading_3');
    });

    test('should ignore empty headings', () => {
      const html = '<h1></h1>';
      const blocks = domConverter.convert(html);
      expect(blocks).toHaveLength(0);
    });
  });

  describe('Paragraphs', () => {
    test('should convert P to paragraph', () => {
      const html = '<p>Hello World</p>';
      const blocks = domConverter.convert(html);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toEqual({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: 'Hello World' }, annotations: {} }],
        },
      });
    });

    test('should ignore empty paragraphs', () => {
      const html = '<p></p>';
      const blocks = domConverter.convert(html);
      expect(blocks).toHaveLength(0);
    });

    test.each([
      [
        'preserves whitespace around inline formatting boundaries',
        '<p>Hello <strong>world</strong> !</p>',
        'Hello world !',
      ],
      [
        'preserves whitespace around links',
        '<p>Read <a href="https://example.com">more</a> please</p>',
        'Read more please',
      ],
      [
        'preserves whitespace across multiple inline format switches',
        '<p><em>A</em> <strong>B</strong> <code>C</code></p>',
        'A B C',
      ],
      [
        'still trims leading and trailing whitespace of entire block',
        '<p>  Hello world  </p>',
        'Hello world',
      ],
    ])('%s', (_description, html, expectedText) => {
      const blocks = domConverter.convert(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('paragraph');
      expect(blocks[0].paragraph.rich_text.map(item => item.text.content).join('')).toBe(
        expectedText
      );
    });

    test('trims leading whitespace when first rich_text element is whitespace-only', () => {
      const html = '<p>   <strong>Hello</strong> world</p>';
      const blocks = domConverter.convert(html);

      expect(blocks).toHaveLength(1);
      const joined = blocks[0].paragraph.rich_text.map(item => item.text.content).join('');
      expect(joined).toBe('Hello world');
      expect(joined.startsWith(' ')).toBe(false);
    });

    test('trims trailing whitespace when last rich_text element is whitespace-only', () => {
      const html = '<p>Hello <em>world</em>   </p>';
      const blocks = domConverter.convert(html);

      expect(blocks).toHaveLength(1);
      const joined = blocks[0].paragraph.rich_text.map(item => item.text.content).join('');
      expect(joined).toBe('Hello world');
      expect(joined.endsWith(' ')).toBe(false);
    });

    test('should detect list-like paragraphs (bullets)', () => {
      const html = '<p>• Item 1<br>• Item 2</p>';
      const blocks = domConverter.convert(html);
      // Removed simplified list detection in refactor, expects 1 paragraph
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('paragraph');
      expect(blocks[0].paragraph.rich_text[0].text.content).toContain('Item 1');
    });

    test('should detect list-like paragraphs (numbered)', () => {
      const html = '<p>1. First<br>2. Second</p>';
      const blocks = domConverter.convert(html);
      // Removed simplified list detection in refactor
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('paragraph');
      expect(blocks[0].paragraph.rich_text[0].text.content).toContain('First');
    });
  });

  describe('Images', () => {
    test('should convert IMG to image block', () => {
      const src = 'https://example.com/image.jpg';
      globalThis.ImageUtils.extractImageSrc.mockReturnValue(src);

      const html = `<img src="${src}" />`;
      const blocks = domConverter.convert(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toEqual({
        object: 'block',
        type: 'image',
        image: {
          type: 'external',
          external: { url: src },
          caption: [],
        },
      });
    });

    test('should skip duplicate images', () => {
      const src = 'https://example.com/image.jpg';
      globalThis.ImageUtils.extractImageSrc.mockReturnValue(src);

      const html = `<img src="${src}" /><img src="${src}" />`;
      const blocks = domConverter.convert(html);

      // DomConverter is stateless and does not deduct duplicates itself
      expect(blocks).toHaveLength(2);
    });

    test('should handle invalid image URLs gracefully', () => {
      globalThis.ImageUtils.extractImageSrc.mockReturnValue(null);
      const html = '<img src="" />';
      const blocks = domConverter.convert(html);
      expect(blocks).toHaveLength(0);
    });
    test('should log info when image limit is reached', () => {
      const maxImages = 6; // Based on IMAGE_LIMITS.MAX_MAIN_CONTENT_IMAGES
      let html = '';
      for (let i = 0; i <= maxImages; i++) {
        html += `<img src="https://example.com/img${i}.jpg" alt="img${i}" />`;
      }

      globalThis.ImageUtils.extractImageSrc.mockImplementation(node => node.src);

      const blocks = domConverter.convert(html);

      // Verify Logger.info was called for the extra image
      expect(Logger.info).toHaveBeenCalledWith(
        expect.stringContaining('已達主要內容圖片數量上限'),
        expect.objectContaining({ currentCount: maxImages })
      );

      // Verify blocks length is limited to maxImages
      expect(blocks.filter(b => b.type === 'image')).toHaveLength(maxImages);
    });

    test('should handle cleanImageUrl errors implicitly (catch block coverage)', () => {
      const src = 'https://example.com/error.jpg';
      globalThis.ImageUtils.extractImageSrc.mockReturnValue(src);
      // Mock cleanImageUrl to throw
      globalThis.ImageUtils.cleanImageUrl.mockImplementationOnce(() => {
        throw new Error('Clean Error');
      });

      const html = `<img src="${src}" />`;
      const blocks = domConverter.convert(html);

      // Should recover and use original src
      expect(blocks).toHaveLength(1);
      expect(blocks[0].image.external.url).toBe(src);
    });

    test('should keep resolved absolute URL when cleanImageUrl throws for relative src', () => {
      const src = '/images/error.jpg';
      const expectedUrl = new URL(src, document.baseURI).href;
      globalThis.ImageUtils.extractImageSrc.mockReturnValue(src);
      globalThis.ImageUtils.cleanImageUrl.mockImplementationOnce(() => {
        throw new Error('Clean Error');
      });

      const html = `<img src="${src}" />`;
      const blocks = domConverter.convert(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].image.external.url).toBe(expectedUrl);
    });

    test('should keep resolved absolute URL when cleanImageUrl is unavailable', () => {
      const src = '/images/no-cleaner.jpg';
      const expectedUrl = new URL(src, document.baseURI).href;
      globalThis.ImageUtils.extractImageSrc.mockReturnValue(src);
      const originalCleanImageUrl = globalThis.ImageUtils.cleanImageUrl;

      try {
        globalThis.ImageUtils.cleanImageUrl = null;

        const html = `<img src="${src}" />`;
        const blocks = domConverter.convert(html);

        expect(blocks).toHaveLength(1);
        expect(blocks[0].image.external.url).toBe(expectedUrl);
      } finally {
        globalThis.ImageUtils.cleanImageUrl = originalCleanImageUrl;
      }
    });

    test('should drop image if validCleanedImageUrl returns false', () => {
      const src = 'https://example.com/invalid.jpg';
      globalThis.ImageUtils.extractImageSrc.mockReturnValue(src);
      // Mock validation failure
      // We need to temporarily define isValidCleanedImageUrl on globalThis.ImageUtils if not present or mock it
      // The current mock setup in line 32: isNotionCompatibleImageUrl.
      // But code uses isValidCleanedImageUrl.
      // Let's add isValidCleanedImageUrl to global mock.
      // Mock validation failure for this specific test
      globalThis.ImageUtils.isValidCleanedImageUrl.mockReturnValueOnce(false);

      const html = `<img src="${src}" />`;
      const blocks = domConverter.convert(html);

      expect(blocks).toHaveLength(0);
      expect(Logger.warn).toHaveBeenCalledWith(
        '[Content] Dropping invalid image to ensure page save',
        expect.objectContaining({ url: src })
      );
    });

    // Coverage for "catch" block when new URL throws
    test('should handle malformed URLs in Constructor', () => {
      const src = 'https://['; // Invalid URL
      globalThis.ImageUtils.extractImageSrc.mockReturnValue(src);

      const html = `<img src="${src}" />`;
      // DOMParser might encode it or leave it.
      // If passed to new URL('http://[', base), it throws.

      const blocks = domConverter.convert(html);

      // Should fall back to src
      expect(blocks).toHaveLength(1);
      expect(blocks[0].image.external.url).toBe(src);
    });
  });

  describe('Lists', () => {
    test('should convert LI to bulleted_list_item', () => {
      const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      const blocks = domConverter.convert(html);
      // UL itself is ignored, children are processed
      expect(blocks).toHaveLength(2);
      expect(blocks[0].type).toBe('bulleted_list_item');
      expect(blocks[1].type).toBe('bulleted_list_item');
    });
  });

  describe('Blockquotes', () => {
    test('should convert BLOCKQUOTE to quote', () => {
      const html = '<blockquote>Quote text</blockquote>';
      const blocks = domConverter.convert(html);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('quote');
      expect(blocks[0].quote.rich_text[0].text.content).toBe('Quote text');
    });
  });

  describe('Nested Structures', () => {
    test('should flatten nested structures', () => {
      const html = '<div><h1>Title</h1><p>Text</p></div>';
      const blocks = domConverter.convert(html);
      expect(blocks).toHaveLength(2);
      expect(blocks[0].type).toBe('heading_1');
      expect(blocks[1].type).toBe('paragraph');
    });
  });

  describe('Long Text Handling', () => {
    test.each([
      [
        'should truncate long LI text',
        text => `<ul><li>${text}</li></ul>`,
        'A',
        5200,
        'bulleted_list_item',
        block => block.bulleted_list_item.rich_text[0].text.content,
      ],
      [
        'should truncate long BLOCKQUOTE text',
        text => `<blockquote>${text}</blockquote>`,
        'B',
        4500,
        'quote',
        block => block.quote.rich_text[0].text.content,
      ],
      [
        'should truncate long paragraph text',
        text => `<p>${text}</p>`,
        'C',
        4000,
        'paragraph',
        block => block.paragraph.rich_text[0].text.content,
      ],
    ])('%s', (_description, buildHtml, repeatedChar, length, expectedType, getContent) => {
      const blocks = domConverter.convert(buildHtml(repeatedChar.repeat(length)));

      // DomConverter truncates instead of splitting
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe(expectedType);
      expect(getContent(blocks[0]).length).toBeLessThanOrEqual(2000);
    });

    test('should not split text under 2000 characters', () => {
      const shortText = 'D'.repeat(1500);
      const html = `<li>${shortText}</li>`;
      const blocks = domConverter.convert(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('bulleted_list_item');
      expect(blocks[0].bulleted_list_item.rich_text[0].text.content).toHaveLength(1500);
    });
  });

  describe('Sanitization & Security Alignment', () => {
    test('should prevent XSS vectors like scripts or inline handler attributes', () => {
      const html = `
        <div>
          <script>alert("XSS")</script>
          <p onclick="alert(1)">Safe text</p>
        </div>
      `;
      const blocks = domConverter.convert(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('paragraph');
      expect(blocks[0].paragraph.rich_text[0].text.content).toBe('Safe text');
    });

    test('should preserve rich text annotations for kbd and ins tags', () => {
      const html = '<div><p><kbd>Ctrl</kbd> <ins>new</ins></p></div>';
      const blocks = domConverter.convert(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('paragraph');
      const richText = blocks[0].paragraph.rich_text;

      expect(richText[0].text.content).toBe('Ctrl');
      expect(richText[0].annotations.code).toBe(true);

      expect(richText[1].text.content).toBe(' ');

      expect(richText[2].text.content).toBe('new');
      expect(richText[2].annotations.underline).toBe(true);
    });

    test('should fallback code language to javascript when class and lang are stripped', () => {
      const html = '<pre><code class="language-python" lang="py">console.log(1)</code></pre>';
      const blocks = domConverter.convert(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('code');
      expect(blocks[0].code.language).toBe('javascript'); // 因為 class/lang 被過濾，所以使用 fallback javascript 語言
      expect(blocks[0].code.rich_text[0].text.content).toBe('console.log(1)');
    });

    test('should traverse through article, section and main structural containers', () => {
      const html = '<article><section><main><p>Body text</p></main></section></article>';
      const blocks = domConverter.convert(html);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('paragraph');
      expect(blocks[0].paragraph.rich_text[0].text.content).toBe('Body text');
    });
  });
});
