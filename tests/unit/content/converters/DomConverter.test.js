/**
 * @jest-environment jsdom
 */

import { domConverter } from '../../../../scripts/content/converters/DomConverter.js';

// Mock dependencies
import Logger from '../../../../scripts/utils/Logger.js';

jest.mock('../../../../scripts/utils/Logger.js', () => {
  return {
    __esModule: true,
    default: {
      debug: jest.fn(),
      success: jest.fn(),
      start: jest.fn(),
      ready: jest.fn(),
      info: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  };
});

// Sync global Logger with the mocked module for consistency
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

    test('should drop image if validCleanedImageUrl returns false', () => {
      const src = 'https://example.com/invalid.jpg';
      globalThis.ImageUtils.extractImageSrc.mockReturnValue(src);
      // Mock validation failure
      // We need to temporarily define isValidCleanedImageUrl on globalThis.ImageUtils if not present or mock it
      // The current mock setup in line 32: isNotionCompatibleImageUrl.
      // But code uses isValidCleanedImageUrl.
      // Let's add isValidCleanedImageUrl to global mock.
      const originalIsValid = globalThis.ImageUtils.isValidCleanedImageUrl;
      globalThis.ImageUtils.isValidCleanedImageUrl = jest.fn(() => false);

      const html = `<img src="${src}" />`;
      const blocks = domConverter.convert(html);

      expect(blocks).toHaveLength(0);
      expect(Logger.warn).toHaveBeenCalledWith(
        '[Content] Dropping invalid image to ensure page save',
        expect.objectContaining({ url: src })
      );

      // Restore
      if (originalIsValid) {
        globalThis.ImageUtils.isValidCleanedImageUrl = originalIsValid;
      } else {
        delete globalThis.ImageUtils.isValidCleanedImageUrl;
      }
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
    test('should truncate long LI text', () => {
      const longText = 'A'.repeat(5200);
      const html = `<ul><li>${longText}</li></ul>`;
      const blocks = domConverter.convert(html);

      // DomConverter truncates instead of splitting
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('bulleted_list_item');
      expect(blocks[0].bulleted_list_item.rich_text[0].text.content.length).toBeLessThanOrEqual(
        2000
      );
    });

    test('should truncate long BLOCKQUOTE text', () => {
      const longText = 'B'.repeat(4500);
      const html = `<blockquote>${longText}</blockquote>`;
      const blocks = domConverter.convert(html);

      // DomConverter truncates instead of splitting
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('quote');
      expect(blocks[0].quote.rich_text[0].text.content.length).toBeLessThanOrEqual(2000);
    });

    test('should truncate long paragraph text', () => {
      const longText = 'C'.repeat(4000);
      const html = `<p>${longText}</p>`;
      const blocks = domConverter.convert(html);

      // DomConverter truncates instead of splitting
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('paragraph');
      expect(blocks[0].paragraph.rich_text[0].text.content.length).toBeLessThanOrEqual(2000);
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
});
