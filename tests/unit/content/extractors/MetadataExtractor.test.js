/**
 * @jest-environment jsdom
 */

import { MetadataExtractor } from '../../../../scripts/content/extractors/MetadataExtractor.js';

describe('MetadataExtractor', () => {
  beforeEach(() => {
    document.title = '';
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  describe('extractTitle', () => {
    test('should prioritize Readability title', () => {
      document.title = 'Doc Title';
      const result = MetadataExtractor.extractTitle(document, { title: 'Readability Title' });
      expect(result).toBe('Readability Title');
    });

    test('should fallback to document title', () => {
      document.title = 'Doc Title';
      const result = MetadataExtractor.extractTitle(document, {});
      expect(result).toBe('Doc Title');
    });

    test('should fallback to default if no title', () => {
      const result = MetadataExtractor.extractTitle(document, {});
      expect(result).toBe('Untitled Page');
    });
  });

  describe('extractAuthor', () => {
    test('should prioritize Readability byline', () => {
      const result = MetadataExtractor.extractAuthor(document, { byline: 'John Doe' });
      expect(result).toBe('John Doe');
    });

    test('should extract from meta name="author"', () => {
      const meta = document.createElement('meta');
      meta.name = 'author';
      meta.content = 'Jane Doe';
      document.head.appendChild(meta);

      const result = MetadataExtractor.extractAuthor(document, {});
      expect(result).toBe('Jane Doe');
    });

    test('should extract from meta property="article:author"', () => {
      const meta = document.createElement('meta');
      meta.setAttribute('property', 'article:author');
      meta.content = 'Author Name';
      document.head.appendChild(meta);

      const result = MetadataExtractor.extractAuthor(document, {});
      expect(result).toBe('Author Name');
    });
  });

  describe('extractDescription', () => {
    test('should prioritize Readability excerpt', () => {
      const result = MetadataExtractor.extractDescription(document, { excerpt: 'Short summary' });
      expect(result).toBe('Short summary');
    });

    test('should extract from meta name="description"', () => {
      const meta = document.createElement('meta');
      meta.name = 'description';
      meta.content = 'Meta description';
      document.head.appendChild(meta);

      const result = MetadataExtractor.extractDescription(document, {});
      expect(result).toBe('Meta description');
    });
  });

  describe('extractFavicon', () => {
    test('should extract from link rel="icon"', () => {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = 'https://example.com/favicon.ico';
      document.head.appendChild(link);

      const result = MetadataExtractor.extractFavicon(document);
      expect(result).toBe('https://example.com/favicon.ico');
    });

    test('should fallback to default favicon.ico', () => {
      const result = MetadataExtractor.extractFavicon(document);
      expect(result).toMatch(/\/favicon\.ico$/);
    });
  });

  describe('parseSizeString', () => {
    test('should parse "180x180" format', () => {
      expect(MetadataExtractor.parseSizeString('180x180')).toBe(180);
    });

    test('should return 999 for "any" (SVG)', () => {
      expect(MetadataExtractor.parseSizeString('any')).toBe(999);
      expect(MetadataExtractor.parseSizeString('ANY')).toBe(999);
    });

    test('should handle numeric strings', () => {
      expect(MetadataExtractor.parseSizeString('256')).toBe(256);
    });

    test('should return 0 for empty/invalid input', () => {
      expect(MetadataExtractor.parseSizeString('')).toBe(0);
      expect(MetadataExtractor.parseSizeString(null)).toBe(0);
    });
  });

  describe('selectBestIcon', () => {
    test('should return null for empty candidates', () => {
      expect(MetadataExtractor.selectBestIcon([])).toBeNull();
    });

    test('should return single candidate', () => {
      const candidates = [
        { url: 'https://example.com/icon.png', priority: 1, size: 180, type: '' },
      ];
      const result = MetadataExtractor.selectBestIcon(candidates);
      expect(result.url).toBe('https://example.com/icon.png');
    });

    test('should prefer SVG over PNG', () => {
      const candidates = [
        { url: 'https://example.com/icon.png', priority: 1, size: 180, type: 'image/png' },
        { url: 'https://example.com/icon.svg', priority: 2, size: 0, type: 'image/svg+xml' },
      ];
      const result = MetadataExtractor.selectBestIcon(candidates);
      expect(result.url).toBe('https://example.com/icon.svg');
    });

    test('should prefer larger size when format is same', () => {
      const candidates = [
        { url: 'https://example.com/icon-32.png', priority: 1, size: 32, type: 'image/png' },
        { url: 'https://example.com/icon-180.png', priority: 2, size: 180, type: 'image/png' },
      ];
      const result = MetadataExtractor.selectBestIcon(candidates);
      expect(result.url).toBe('https://example.com/icon-180.png');
    });
  });

  describe('isValidImageUrl', () => {
    test('should return true for http/https URLs', () => {
      expect(MetadataExtractor.isValidImageUrl('https://example.com/image.png')).toBe(true);
      expect(MetadataExtractor.isValidImageUrl('http://example.com/image.jpg')).toBe(true);
    });

    test('should return false for invalid URLs', () => {
      expect(MetadataExtractor.isValidImageUrl('')).toBe(false);
      expect(MetadataExtractor.isValidImageUrl(null)).toBe(false);
      expect(MetadataExtractor.isValidImageUrl('ftp://example.com/file')).toBe(false);
      expect(MetadataExtractor.isValidImageUrl('data:image/png;base64,...')).toBe(false);
    });
  });

  describe('extractImageSrc', () => {
    test('should extract from src attribute', () => {
      const img = document.createElement('img');
      img.src = 'https://example.com/image.png';
      document.body.appendChild(img);

      const result = MetadataExtractor.extractImageSrc(img);
      expect(result).toBe('https://example.com/image.png');
    });

    test('should extract from data-src (lazy loading)', () => {
      const img = document.createElement('img');
      img.setAttribute('data-src', 'https://example.com/lazy.png');
      document.body.appendChild(img);

      const result = MetadataExtractor.extractImageSrc(img);
      expect(result).toBe('https://example.com/lazy.png');
    });

    test('should skip data: URLs', () => {
      const img = document.createElement('img');
      img.src = 'data:image/png;base64,abc123';
      document.body.appendChild(img);

      const result = MetadataExtractor.extractImageSrc(img);
      expect(result).toBeNull();
    });
  });

  describe('isAvatarImage', () => {
    test('should detect avatar by class name', () => {
      const img = document.createElement('img');
      img.className = 'author-avatar';
      expect(MetadataExtractor.isAvatarImage(img)).toBe(true);
    });

    test('should detect avatar by parent class', () => {
      const div = document.createElement('div');
      div.className = 'profile-container';
      const img = document.createElement('img');
      div.appendChild(img);
      document.body.appendChild(div);

      expect(MetadataExtractor.isAvatarImage(img)).toBe(true);
    });

    test('should not flag large images as avatars', () => {
      const img = document.createElement('img');
      img.className = 'hero-image';
      // Mock dimensions (jsdom doesn't render, so naturalWidth/height are 0)
      Object.defineProperty(img, 'naturalWidth', { value: 800, configurable: true });
      Object.defineProperty(img, 'naturalHeight', { value: 600, configurable: true });

      expect(MetadataExtractor.isAvatarImage(img)).toBe(false);
    });
  });

  describe('extractSiteIcon', () => {
    test('should extract apple-touch-icon', () => {
      const link = document.createElement('link');
      link.rel = 'apple-touch-icon';
      link.href = 'https://example.com/apple-touch-icon.png';
      link.setAttribute('sizes', '180x180');
      document.head.appendChild(link);

      const result = MetadataExtractor.extractSiteIcon(document);
      expect(result).toBe('https://example.com/apple-touch-icon.png');
    });

    test('should fallback to favicon.ico', () => {
      const result = MetadataExtractor.extractSiteIcon(document);
      expect(result).toMatch(/\/favicon\.ico$/);
    });
  });

  describe('extractFeaturedImage', () => {
    test('should extract featured image from common selectors', () => {
      document.body.innerHTML = `
        <article>
          <div class="featured-image">
            <img src="https://example.com/hero.jpg" alt="Hero">
          </div>
        </article>
      `;

      const result = MetadataExtractor.extractFeaturedImage(document);
      expect(result).toBe('https://example.com/hero.jpg');
    });

    test('should skip avatar images', () => {
      document.body.innerHTML = `
        <article>
          <div class="author-avatar">
            <img src="https://example.com/avatar.jpg" alt="Author">
          </div>
          <div class="featured-image">
            <img src="https://example.com/hero.jpg" alt="Hero">
          </div>
        </article>
      `;

      const result = MetadataExtractor.extractFeaturedImage(document);
      expect(result).toBe('https://example.com/hero.jpg');
    });

    test('should return null if no featured image found', () => {
      document.body.innerHTML = '<article><p>No images here</p></article>';
      const result = MetadataExtractor.extractFeaturedImage(document);
      expect(result).toBeNull();
    });
  });
});
