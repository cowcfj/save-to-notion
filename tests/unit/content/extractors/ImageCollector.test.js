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
