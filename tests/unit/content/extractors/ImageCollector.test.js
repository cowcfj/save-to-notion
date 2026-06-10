/**
 * @jest-environment jsdom
 */

import {
  imageCollectorTestModules,
  setupImageCollectorTestLifecycle,
  trackSpy,
} from './ImageCollectorTestSetup.js';

const {
  ImageCollector,
  cachedQuery,
  Logger,
  extractImageSrc,
  cleanImageUrl,
  isValidCleanedImageUrl,
} = imageCollectorTestModules;

describe('ImageCollector', () => {
  setupImageCollectorTestLifecycle();

  describe('collectFeaturedImage', () => {
    const MALFORMED_FEATURED_IMAGE_URL = 'malformed_url_without_protocol?token=secret';
    const INVALID_DOCUMENT_BASE_URI = 'invalid-base-uri';
    const SANITIZED_INVALID_IMAGE_URL = '[invalid-url]';

    const withInvalidDocumentBaseURI = runTest => {
      const originalBaseURI = document.baseURI;
      Object.defineProperty(document, 'baseURI', {
        value: INVALID_DOCUMENT_BASE_URI,
        configurable: true,
      });

      try {
        return runTest();
      } finally {
        Object.defineProperty(document, 'baseURI', {
          value: originalBaseURI,
          configurable: true,
        });
      }
    };

    const expectMalformedFeaturedImageWarning = expectedContext => {
      expect(Logger.warn).toHaveBeenCalledWith(
        '無效的圖片 URL',
        expect.objectContaining({
          action: 'collectFeaturedImage',
          ...expectedContext,
          url: SANITIZED_INVALID_IMAGE_URL,
        })
      );
      expect(JSON.stringify(Logger.warn.mock.calls)).not.toContain(MALFORMED_FEATURED_IMAGE_URL);
    };

    test('should return valid featured image src (DOM fallback)', () => {
      const mockImg = document.createElement('img');
      mockImg.src = 'https://example.com/featured.jpg';

      cachedQuery.mockImplementation((selector, context, options) => {
        if (selector.includes('meta')) {
          return null;
        }
        if (options?.single) {
          return mockImg;
        }
        return null;
      });
      extractImageSrc.mockReturnValue('https://example.com/featured.jpg');

      const result = ImageCollector.collectFeaturedImage();
      expect(result).toBe('https://example.com/featured.jpg');
    });

    test('should skip sidebar images (DOM fallback)', () => {
      const mockAside = document.createElement('aside');
      const mockImg = document.createElement('img');
      mockImg.src = 'https://example.com/sidebar.jpg';
      mockAside.append(mockImg); // 元素符合跳過規則

      cachedQuery.mockImplementation((selector, context, options) => {
        if (selector.includes('meta')) {
          return null;
        }
        if (options?.single) {
          return mockImg;
        }
        return null;
      });

      const result = ImageCollector.collectFeaturedImage();
      expect(result).toBeNull();
      expect(Logger.log).toHaveBeenCalledWith(
        '跳過側邊欄圖片',
        expect.objectContaining({
          action: 'collectFeaturedImage',
          selector: '.featured-image img',
        })
      );
    });

    test('should return null when extractImageSrc is missing (DOM fallback)', () => {
      const mockImg = document.createElement('img');
      extractImageSrc.mockReturnValue(null); // 無效的 src

      cachedQuery.mockImplementation((selector, context, options) => {
        if (selector.includes('meta')) {
          return null;
        }
        if (options?.single) {
          return mockImg;
        }
        return null;
      });

      const result = ImageCollector.collectFeaturedImage();
      expect(result).toBeNull();
    });

    test('should return valid featured image src (Meta success)', () => {
      const mockMeta = document.createElement('meta');
      mockMeta.content = 'https://example.com/meta-featured.jpg';

      trackSpy(document, 'querySelector').mockImplementation(selector => {
        if (selector === 'meta[property="og:image"]') {
          return mockMeta;
        }
        return null;
      });

      const result = ImageCollector.collectFeaturedImage();
      expect(result).toBe('https://example.com/meta-featured.jpg');
    });

    test('should return null if no featured image found', () => {
      trackSpy(document, 'querySelector').mockReturnValue(null);
      cachedQuery.mockReturnValue(null);
      const result = ImageCollector.collectFeaturedImage();
      expect(result).toBeNull();
    });

    test.each([
      {
        label: 'DOM featured image 遇到 malformed URL 時應回傳 null 且記錄 sanitized URL',
        setupImageSource: () => {
          const mockImg = document.createElement('img');
          cachedQuery.mockImplementation((_selector, _context, options) => {
            if (options?.single) {
              return mockImg;
            }
            return null;
          });
          extractImageSrc.mockReturnValue(MALFORMED_FEATURED_IMAGE_URL);
        },
        collectFeaturedImage: () => ImageCollector._collectFeaturedFromDOM(),
        expectedLogContext: {
          source: 'dom',
          selector: '.featured-image img',
        },
      },
      {
        label: 'meta featured image 遇到 malformed URL 時應回傳 null 且記錄 sanitized URL',
        setupImageSource: () => {
          const mockMeta = document.createElement('meta');
          mockMeta.content = MALFORMED_FEATURED_IMAGE_URL;
          trackSpy(document, 'querySelector').mockImplementation(selector => {
            if (selector === 'meta[property="og:image"]') {
              return mockMeta;
            }
            return null;
          });
        },
        collectFeaturedImage: () => ImageCollector._collectFeaturedFromMeta(),
        expectedLogContext: {
          source: 'meta[property="og:image"]',
        },
      },
    ])('$label', ({ setupImageSource, collectFeaturedImage, expectedLogContext }) => {
      withInvalidDocumentBaseURI(() => {
        setupImageSource();

        const result = collectFeaturedImage();

        expect(result).toBeNull();
        expectMalformedFeaturedImageWarning(expectedLogContext);
      });
    });
  });

  describe('processImageForCollection', () => {
    test('should return null when extractImageSrc returns null', () => {
      const mockImg = document.createElement('img');
      mockImg.src = 'https://example.com/test.jpg';

      extractImageSrc.mockReturnValue(null);

      const result = ImageCollector.processImageForCollection(mockImg, 0, null);
      expect(result).toBeNull();
    });

    test('should process valid image', () => {
      const mockImg = document.createElement('img');
      mockImg.src = 'https://example.com/img.jpg';
      Object.defineProperty(mockImg, 'naturalWidth', { value: 800 });
      Object.defineProperty(mockImg, 'naturalHeight', { value: 600 });

      extractImageSrc.mockReturnValue('https://example.com/img.jpg');

      const result = ImageCollector.processImageForCollection(mockImg, 0, null);

      expect(result).toEqual({
        object: 'block',
        type: 'image',
        image: {
          type: 'external',
          external: { url: 'https://example.com/img.jpg' },
        },
        _meta: expect.any(Object),
      });
    });

    test('should skip duplicate featured image', () => {
      const mockImg = document.createElement('img');
      mockImg.src = 'https://example.com/featured.jpg';
      extractImageSrc.mockReturnValue('https://example.com/featured.jpg');

      const result = ImageCollector.processImageForCollection(
        mockImg,
        0,
        'https://example.com/featured.jpg'
      );
      expect(result).toBeNull();
    });

    test('should skip small images', () => {
      const mockImg = document.createElement('img');
      mockImg.src = 'https://example.com/small.jpg';
      Object.defineProperty(mockImg, 'naturalWidth', { value: 500 });
      Object.defineProperty(mockImg, 'naturalHeight', { value: 300 });

      extractImageSrc.mockReturnValue('https://example.com/small.jpg');

      const result = ImageCollector.processImageForCollection(mockImg, 0, null);
      expect(result).toBeNull();
    });

    test('should handle cleanImageUrl errors', () => {
      cleanImageUrl.mockImplementation(() => {
        throw new Error('Process Error');
      });

      extractImageSrc.mockReturnValue('https://example.com/test.jpg');

      const img = document.createElement('img');
      const result = ImageCollector.processImageForCollection(img, 0);

      expect(result).toBeNull();
      expect(Logger.warn).toHaveBeenCalledWith(
        '處理圖片失敗',
        expect.objectContaining({ error: 'Process Error' })
      );
    });

    test('processImageForCollection should log and return null when src is missing', () => {
      const mockImg = document.createElement('img');
      extractImageSrc.mockReturnValue(null);

      const result = ImageCollector.processImageForCollection(mockImg, 0, null);

      expect(result).toBeNull();
      expect(Logger.log).toHaveBeenCalledWith('圖片缺少 src 屬性', expect.any(Object));
    });

    test('processImageForCollection should return null and log when image has invalid clean URL', () => {
      const mockImg = document.createElement('img');
      mockImg.src = 'https://example.com/invalid.jpg';

      extractImageSrc.mockReturnValue('https://example.com/invalid.jpg');
      isValidCleanedImageUrl.mockReturnValue(false);

      const result = ImageCollector.processImageForCollection(mockImg, 0, null);

      expect(result).toBeNull();
      expect(Logger.log).toHaveBeenCalledWith('無效或不相容的圖片 URL', expect.any(Object));
    });

    test('processImageForCollection should allow image with unknown dimensions (0x0)', () => {
      const mockImg = document.createElement('img');
      mockImg.src = 'https://example.com/unknown.jpg';
      extractImageSrc.mockReturnValue('https://example.com/unknown.jpg');

      const result = ImageCollector.processImageForCollection(mockImg, 0, null);

      expect(result).toBeDefined();
      expect(result.image.external.url).toBe('https://example.com/unknown.jpg');
      expect(Logger.log).toHaveBeenCalledWith('圖片尺寸未知 (0)，跳過尺寸檢查', expect.any(Object));
    });
  });
});
