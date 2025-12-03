/**
 * @jest-environment jsdom
 */

const { metadataExtractor } = require('../../../../scripts/content/extractors/MetadataExtractor');

describe('MetadataExtractor', () => {
  beforeEach(() => {
    document.title = '';
    document.head.innerHTML = '';
    // Reset location mock if needed (jsdom handles location partially)
  });

  describe('extractTitle', () => {
    test('should prioritize Readability title', () => {
      document.title = 'Doc Title';
      const result = metadataExtractor.extractTitle(document, { title: 'Readability Title' });
      expect(result).toBe('Readability Title');
    });

    test('should fallback to document title', () => {
      document.title = 'Doc Title';
      const result = metadataExtractor.extractTitle(document, {});
      expect(result).toBe('Doc Title');
    });

    test('should fallback to default if no title', () => {
      const result = metadataExtractor.extractTitle(document, {});
      expect(result).toBe('Untitled Page');
    });
  });

  describe('extractAuthor', () => {
    test('should prioritize Readability byline', () => {
      const result = metadataExtractor.extractAuthor(document, { byline: 'John Doe' });
      expect(result).toBe('John Doe');
    });

    test('should extract from meta name="author"', () => {
      const meta = document.createElement('meta');
      meta.name = 'author';
      meta.content = 'Jane Doe';
      document.head.appendChild(meta);

      const result = metadataExtractor.extractAuthor(document, {});
      expect(result).toBe('Jane Doe');
    });

    test('should extract from meta property="article:author"', () => {
      const meta = document.createElement('meta');
      meta.setAttribute('property', 'article:author');
      meta.content = 'Author Name';
      document.head.appendChild(meta);

      const result = metadataExtractor.extractAuthor(document, {});
      expect(result).toBe('Author Name');
    });
  });

  describe('extractDescription', () => {
    test('should prioritize Readability excerpt', () => {
      const result = metadataExtractor.extractDescription(document, { excerpt: 'Short summary' });
      expect(result).toBe('Short summary');
    });

    test('should extract from meta name="description"', () => {
      const meta = document.createElement('meta');
      meta.name = 'description';
      meta.content = 'Meta description';
      document.head.appendChild(meta);

      const result = metadataExtractor.extractDescription(document, {});
      expect(result).toBe('Meta description');
    });
  });

  describe('extractFavicon', () => {
    test('should extract from link rel="icon"', () => {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = 'https://example.com/favicon.ico';
      document.head.appendChild(link);

      const result = metadataExtractor.extractFavicon(document);
      expect(result).toBe('https://example.com/favicon.ico');
    });

    test('should fallback to default favicon.ico', () => {
      // jsdom location defaults to about:blank or similar, need to handle origin
      // Assuming jsdom environment setup or default
      // If location.origin is 'null' or empty, URL constructor might fail or behave differently
      // Let's mock location if possible or just check relative

      // In jsdom, location.origin is usually 'null' if not set.
      // But we can check if it returns a string ending in /favicon.ico
      const result = metadataExtractor.extractFavicon(document);
      expect(result).toMatch(/\/favicon\.ico$/);
    });
  });
});
