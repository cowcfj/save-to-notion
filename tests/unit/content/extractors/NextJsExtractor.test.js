/**
 * @jest-environment jsdom
 */

import { NextJsExtractor } from '../../../../scripts/content/extractors/NextJsExtractor.js';
import { NEXTJS_CONFIG } from '../../../../scripts/config/extraction.js';

// Mock Logger to avoid cluttering test output
jest.mock('../../../../scripts/utils/Logger.js', () => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
}));

describe('NextJsExtractor', () => {
  let mockDoc;

  beforeEach(() => {
    mockDoc = {
      getElementById: jest.fn(),
      querySelector: jest.fn(),
      querySelectorAll: jest.fn().mockReturnValue([]),
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

    it('should return null if JSON content is too large', () => {
      const longString = 'a'.repeat(NEXTJS_CONFIG.MAX_JSON_SIZE + 1);
      mockDoc.querySelector.mockReturnValue({ textContent: longString });
      expect(NextJsExtractor.extract(mockDoc)).toBeNull();
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
        ],
      };

      // Construct deep object: props.initialProps.pageProps.article
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
      expect(result.blocks).toHaveLength(2);
      expect(result.blocks[0].type).toBe('paragraph');
      expect(result.blocks[1].type).toBe('image');
      expect(result.blocks[1].image.external.url).toBe('https://example.com/img.jpg');
    });

    it('should include teaser as summary block if present', () => {
      const mockArticle = {
        title: 'Teaser Test',
        teaser: ['This is a teaser summary.'],
        blocks: [{ blockType: 'paragraph', text: 'Existing content' }],
      };

      const mockJson = {
        props: { initialProps: { pageProps: { article: mockArticle } } },
      };

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });
      const result = NextJsExtractor.extract(mockDoc);

      expect(result).not.toBeNull();
      expect(result.blocks).toHaveLength(2);
      expect(result.blocks[0].type).toBe('quote');
      expect(result.blocks[0].quote.rich_text[0].text.content).toBe('This is a teaser summary.');
      expect(result.blocks[1].type).toBe('paragraph');
    });

    it('should return null if no article data found in JSON', () => {
      const mockJson = { props: { pageProps: { otherData: {} } } };
      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });

      expect(NextJsExtractor.extract(mockDoc)).toBeNull();
    });

    it('should handle article with content but no blocks', () => {
      const mockArticle = {
        title: 'Content Only',
        content: 'Some content',
        // no blocks
      };

      const mockJson = { props: { pageProps: { article: mockArticle } } };
      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(mockJson) });

      const result = NextJsExtractor.extract(mockDoc);
      expect(result).not.toBeNull();
      expect(result.blocks).toEqual([]); // blocks should be empty array
      expect(result.metadata.title).toBe('Content Only');
    });

    it('should handle JSON parse error gracefully', () => {
      mockDoc.querySelector.mockReturnValue({ textContent: '{ invalid json ' });
      expect(NextJsExtractor.extract(mockDoc)).toBeNull();
    });

    it('should extract content from App Router fragments using heuristic search', () => {
      mockDoc.querySelector.mockReturnValue(null);
      const articleData = {
        title: 'App Router Title',
        blocks: [{ blockType: 'paragraph', text: 'Content' }],
      };
      // Mock App Router fragment: self.__next_f.push([1, articleData])
      const fragment = JSON.stringify([1, articleData], null, 2);

      mockDoc.querySelectorAll.mockReturnValue([
        { textContent: `self.__next_f.push(${fragment})` },
      ]);

      const result = NextJsExtractor.extract(mockDoc);
      expect(result).not.toBeNull();
      expect(result.metadata.title).toBe('App Router Title');
      expect(result.blocks).toHaveLength(1);
    });

    it('should use heuristic search when standard paths fail', () => {
      const deepData = {
        someWrapper: {
          nested: {
            unknownKey: {
              title: 'Heuristic Title',
              blocks: [{ blockType: 'paragraph', text: 'Found me' }],
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
      // Mock Yahoo RSC structure with body field
      const longContent = 'A'.repeat(201);
      const yahooArticle = {
        title: 'Yahoo Test',
        body: `<p>${longContent}</p>`,
        // These should be excluded by heuristic search
        postArticleStream: [{ title: 'Ad 1' }],
        recommendedContentsResp: [{ title: 'Ad 2' }],
      };

      // Mock finding this via heuristic search (simulating deep nesting)
      const deepYahooData = {
        someWrapper: {
          ...yahooArticle,
        },
      };

      mockDoc.querySelector.mockReturnValue({ textContent: JSON.stringify(deepYahooData) });
      mockDoc.querySelectorAll.mockReturnValue([]);

      const result = NextJsExtractor.extract(mockDoc);

      expect(result).not.toBeNull();
      expect(result.metadata.title).toBe('Yahoo Test');
      // Should extract body content as a paragraph block
      // Note: _stripHtml removes tags, so we expect just the content
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].paragraph.rich_text[0].text.content).toBe(longContent);
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
