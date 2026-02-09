/**
 * @jest-environment jsdom
 */

// Mock ReadabilityAdapter before importing ImageCollector
jest.mock('../../../../scripts/content/extractors/ReadabilityAdapter', () => ({
  cachedQuery: jest.fn(),
}));

// Mock PerformanceOptimizer
jest.mock('../../../../scripts/performance/PerformanceOptimizer', () => ({
  batchProcess: jest.fn(),
  batchProcessWithRetry: jest.fn(),
}));

jest.mock('../../../../scripts/utils/ErrorHandler.js', () => ({
  ErrorHandler: {
    logError: jest.fn(),
  },
}));

// Mock NextJsExtractor
jest.mock('../../../../scripts/content/extractors/NextJsExtractor.js', () => ({
  NextJsExtractor: {
    detect: jest.fn(),
    extract: jest.fn(),
  },
}));

import { ImageCollector } from '../../../../scripts/content/extractors/ImageCollector.js';
import { cachedQuery } from '../../../../scripts/content/extractors/ReadabilityAdapter.js';
import { batchProcessWithRetry } from '../../../../scripts/performance/PerformanceOptimizer.js';
import { NextJsExtractor } from '../../../../scripts/content/extractors/NextJsExtractor.js';

// Mock Logger
jest.mock('../../../../scripts/utils/Logger.js', () => ({
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
}));

import Logger from '../../../../scripts/utils/Logger.js';
// Also set global for consistency if any code relies on global Logger
globalThis.Logger = Logger;

// Mock constants
jest.mock('../../../../scripts/config/constants', () => ({
  IMAGE_VALIDATION_CONSTANTS: {
    MAX_URL_LENGTH: 2000,
    MIN_IMAGE_WIDTH: 550,
    MIN_IMAGE_HEIGHT: 350,
  },
  IMAGE_LIMITS: {
    MAX_MAIN_CONTENT_IMAGES: 6,
    MAX_ADDITIONAL_IMAGES: 2,
    MAIN_CONTENT_SUFFICIENT_THRESHOLD: 2,
    MAX_GALLERY_IMAGES: 6,
  },
  PERFORMANCE_OPTIMIZER: {
    MAX_NEXT_DATA_SIZE: 5_000_000,
  },
  ERROR_TYPES: {
    EXTRACTION_FAILED: 'extraction_failed',
    INVALID_URL: 'invalid_url',
    NETWORK_ERROR: 'network_error',
    PARSING_ERROR: 'parsing_error',
    PERFORMANCE_WARNING: 'performance_warning',
    DOM_ERROR: 'dom_error',
    VALIDATION_ERROR: 'validation_error',
    TIMEOUT_ERROR: 'timeout_error',
    STORAGE: 'storage',
    NOTION_API: 'notion_api',
    INJECTION: 'injection',
    PERMISSION: 'permission',
    INTERNAL: 'internal',
  },
}));

// Mock ImageUtils module
jest.mock('../../../../scripts/utils/imageUtils.js', () => ({
  __esModule: true,
  extractImageSrc: jest.fn(),
  cleanImageUrl: jest.fn(url => url),
  isValidImageUrl: jest.fn(() => true),
  isValidCleanedImageUrl: jest.fn(() => true),
  default: {
    // Keep default for potential legacy access elsewhere (if any)
    extractImageSrc: jest.fn(),
    cleanImageUrl: jest.fn(url => url),
    isValidImageUrl: jest.fn(() => true),
    isValidCleanedImageUrl: jest.fn(() => true),
  },
}));

import {
  extractImageSrc,
  cleanImageUrl,
  isValidImageUrl,
  isValidCleanedImageUrl,
} from '../../../../scripts/utils/imageUtils.js';

// Global mock not needed for ImageCollector but might be used by other parts if they fallback
globalThis.ImageUtils = {
  extractImageSrc,
  cleanImageUrl,
  isValidImageUrl,
  isValidCleanedImageUrl,
};

// Import ErrorHandler to use in tests
import { ErrorHandler } from '../../../../scripts/utils/ErrorHandler.js';

// globalThis.ErrorHandler was likely for legacy support or incomplete mocking
// We can keep it if needed but prefer module mock
globalThis.ErrorHandler = ErrorHandler;

describe('ImageCollector', () => {
  beforeEach(() => {
    // jest.resetAllMocks() clears all mocks including their implementations.
    // We must restore default implementations below to ensure tests start with a clean state.
    jest.resetAllMocks();
    document.body.innerHTML = '';

    // Default mocks
    globalThis.Logger.log.mockImplementation(() => undefined);
    globalThis.Logger.warn.mockImplementation(() => undefined);
    globalThis.Logger.error.mockImplementation(() => undefined);

    extractImageSrc.mockReturnValue(null);
    cleanImageUrl.mockImplementation(url => url);
    isValidImageUrl.mockReturnValue(true);
    isValidCleanedImageUrl.mockReturnValue(true);

    // Default cachedQuery mock
    cachedQuery.mockImplementation((selector, context, options) => {
      if (options?.all) {
        return [];
      }
      return null;
    });

    // Default batchProcessWithRetry mock (success case by default to avoid breaking other tests)
    batchProcessWithRetry.mockResolvedValue({
      results: [],
      meta: {},
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('collectFeaturedImage', () => {
    test('should return valid featured image src', () => {
      const mockImg = document.createElement('img');
      mockImg.src = 'https://example.com/featured.jpg';

      cachedQuery.mockImplementation((selector, context, options) => {
        if (options?.single) {
          return mockImg;
        }
        return null;
      });
      extractImageSrc.mockReturnValue('https://example.com/featured.jpg');

      const result = ImageCollector.collectFeaturedImage();
      expect(result).toBe('https://example.com/featured.jpg');
      expect(cachedQuery).toHaveBeenCalled();
    });

    test('should return null if no featured image found', () => {
      cachedQuery.mockReturnValue(null);
      const result = ImageCollector.collectFeaturedImage();
      expect(result).toBeNull();
    });
  });

  describe('processImageForCollection', () => {
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
  });

  describe('collectAdditionalImages', () => {
    test('should collect images from content element', async () => {
      const contentElement = document.createElement('div');
      const mockImg1 = document.createElement('img');
      mockImg1.src = 'https://example.com/1.jpg';
      const mockImg2 = document.createElement('img');
      mockImg2.src = 'https://example.com/2.jpg';

      // Mock cachedQuery to return images when queried on contentElement
      cachedQuery.mockImplementation((selector, context) => {
        if (context === contentElement && selector === 'img') {
          return [mockImg1, mockImg2];
        }
        return []; // Return empty array for other 'all' queries (like featured image selectors if any)
      });

      // Ensure collectFeaturedImage returns null
      extractImageSrc.mockImplementation(img => (img ? img.src : null));

      // Mock processImageForCollection to return valid results
      // Use spyOn to allow automatic restoration
      jest.spyOn(ImageCollector, 'processImageForCollection').mockImplementation(img => ({
        object: 'block',
        type: 'image',
        image: { external: { url: img.src } },
      }));

      // Mock batchProcessWithRetry to return the processed results
      batchProcessWithRetry.mockResolvedValue({
        results: [
          {
            object: 'block',
            type: 'image',
            image: { external: { url: 'https://example.com/1.jpg' } },
          },
          {
            object: 'block',
            type: 'image',
            image: { external: { url: 'https://example.com/2.jpg' } },
          },
        ],
        meta: {},
      });

      const result = await ImageCollector.collectAdditionalImages(contentElement);

      // Depending on implementation, it might use batch or sequential.
      // If batch is used, it returns the mocked batch results.
      // If sequential is used (e.g. < 5 images), it processes them.
      // In this test setup, we have 2 images.
      // The implementation checks: if (allImages.length > 5) for batch.
      // So with 2 images, it will use sequential processing.
      // batchProcessWithRetry won't be called.

      // 新返回結構包含 images 和 coverImage
      expect(result.images).toHaveLength(2);
      expect(result.coverImage).toBeNull();
      expect(result.images[0].image.external.url).toBe('https://example.com/1.jpg');

      // Restore is handled by afterEach
    });

    test('should limit images to MAX_ADDITIONAL_IMAGES', async () => {
      const contentElement = document.createElement('div');
      // Create 6 images (exceeding limit of 2)
      for (let i = 0; i < 6; i++) {
        const img = document.createElement('img');
        img.src = `https://example.com/${i}.jpg`;
        contentElement.append(img);
      }

      cachedQuery.mockImplementation((selector, context, options) => {
        if (options?.single) {
          return null;
        }
        if (selector === 'img') {
          return Array.from(contentElement.querySelectorAll('img'));
        }
        return [];
      });
      extractImageSrc.mockImplementation(img => img.src);

      // Mock processImageForCollection to always return success
      jest.spyOn(ImageCollector, 'processImageForCollection').mockImplementation(img => ({
        object: 'block',
        type: 'image',
        image: { external: { url: img.src } },
      }));

      // Mock batchProcessWithRetry (since > 5 images triggers batch)
      batchProcessWithRetry.mockResolvedValue({
        results: Array.from({ length: 6 })
          .fill(0)
          .map((_, i) => ({
            object: 'block',
            type: 'image',
            image: { external: { url: `https://example.com/${i}.jpg` } },
          })),
        meta: {},
      });

      const result = await ImageCollector.collectAdditionalImages(contentElement);
      // Mocked IMAGE_LIMITS.MAX_ADDITIONAL_IMAGES is 2
      expect(result.images).toHaveLength(2);
      expect(result.coverImage).toBeNull();
    });

    test('should collect images from Next.js data (scoped to article)', async () => {
      // Setup Next.js return data
      const mockBlocks = [
        {
          type: 'image',
          image: {
            external: { url: 'https://example.com/main.jpg' },
            caption: [],
          },
        },
        {
          type: 'image',
          image: {
            external: { url: 'https://example.com/gallery1.jpg' },
            caption: [],
          },
        },
      ];

      NextJsExtractor.detect.mockReturnValue(true);
      NextJsExtractor.extract.mockReturnValue({
        blocks: mockBlocks,
        metadata: { title: 'Test' },
      });

      const contentElement = document.createElement('div');

      // Mock processImageForCollection
      jest.spyOn(ImageCollector, 'processImageForCollection').mockImplementation(img => ({
        object: 'block',
        type: 'image',
        image: { external: { url: img.src } },
        _meta: { width: img.naturalWidth },
      }));

      const searchSpy = jest.spyOn(ImageCollector, '_collectFromNextJsData');

      const result = await ImageCollector.collectAdditionalImages(contentElement);

      expect(searchSpy).toHaveBeenCalled();

      // 新返回結構包含 images 和 coverImage
      // Expected: main.jpg + gallery1.jpg
      // Total = 2
      expect(result.images).toHaveLength(2);
      expect(result.coverImage).toBeNull();

      const img1 = result.images.find(r => r.image.external.url === 'https://example.com/main.jpg');
      expect(img1).toBeDefined();
      expect(NextJsExtractor.detect).toHaveBeenCalled();
      expect(NextJsExtractor.extract).toHaveBeenCalled();

      const img2 = result.images.find(
        r => r.image.external.url === 'https://example.com/gallery1.jpg'
      );
      expect(img2).toBeDefined();

      // Verify correct images are present

      // Cleanup
    });

    test('should use provided Next.js blocks without re-extracting', async () => {
      const mockBlocks = [
        {
          type: 'image',
          image: { external: { url: 'https://example.com/provided.jpg' } },
        },
      ];
      const contentElement = document.createElement('div');

      const searchSpy = jest.spyOn(ImageCollector, '_collectFromNextJsData');

      // Mock processImageForCollection to bypass size checks for the fake image
      jest.spyOn(ImageCollector, 'processImageForCollection').mockImplementation(img => ({
        object: 'block',
        type: 'image',
        image: { external: { url: img.src } },
      }));

      // Call collectAdditionalImages with nextJsBlocks option
      const result = await ImageCollector.collectAdditionalImages(contentElement, {
        nextJsBlocks: mockBlocks,
      });

      expect(searchSpy).toHaveBeenCalledWith(expect.any(Array), mockBlocks);

      // Verify NextJsExtractor.extract was NOT called
      expect(NextJsExtractor.extract).not.toHaveBeenCalled();

      const img = result.images.find(
        r => r.image.external.url === 'https://example.com/provided.jpg'
      );
      expect(img).toBeDefined();
    });

    test('should handle empty Next.js extraction result', async () => {
      NextJsExtractor.detect.mockReturnValue(true);
      NextJsExtractor.extract.mockReturnValue(null);

      const contentElement = document.createElement('div');
      const searchSpy = jest.spyOn(ImageCollector, '_collectFromNextJsData');

      await ImageCollector.collectAdditionalImages(contentElement);

      expect(searchSpy).toHaveBeenCalled();

      // Should log debug message
      expect(Logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Next.js Data'),
        expect.objectContaining({ action: 'collectAdditionalImages' })
      );
    });

    test('should deduplicate images in batch processing results', async () => {
      const contentElement = document.createElement('div');
      // Create 6 images to trigger batch processing (> 5)
      // 3 unique URLs repeated twice
      const urls = [
        'https://example.com/1.jpg',
        'https://example.com/2.jpg',
        'https://example.com/3.jpg',
        'https://example.com/1.jpg', // Duplicate
        'https://example.com/2.jpg', // Duplicate
        'https://example.com/3.jpg', // Duplicate
      ];

      urls.forEach(url => {
        const img = document.createElement('img');
        img.src = url;
        contentElement.append(img);
      });

      cachedQuery.mockImplementation((selector, context, options) => {
        if (options?.single) {
          return null;
        }
        if (selector === 'img') {
          return Array.from(contentElement.querySelectorAll('img'));
        }
        return [];
      });
      extractImageSrc.mockImplementation(img => img.src);

      // Mock processImageForCollection to always return success
      jest.spyOn(ImageCollector, 'processImageForCollection').mockImplementation(img => ({
        object: 'block',
        type: 'image',
        image: { external: { url: img.src } },
      }));

      // Mock batchProcessWithRetry
      batchProcessWithRetry.mockResolvedValue({
        results: urls.map(url => ({
          object: 'block',
          type: 'image',
          image: { external: { url } },
        })),
        meta: {},
      });

      const result = await ImageCollector.collectAdditionalImages(contentElement);

      // Should filter out duplicates, expecting only 3 unique images
      // BUT MAX_ADDITIONAL_IMAGES is 2, so it will be truncated to 2
      expect(result.images).toHaveLength(2);
      const uniqueUrls = new Set(result.images.map(img => img.image.external.url));
      expect(uniqueUrls.size).toBe(2);
      expect(uniqueUrls.has('https://example.com/1.jpg')).toBe(true);
      expect(uniqueUrls.has('https://example.com/2.jpg')).toBe(true);
      // 3.jpg is truncated due to limit 2
    });
  });

  describe('Error Handling and Fallbacks', () => {
    test('collectFeaturedImage should handle meta query errors', () => {
      // 模擬 meta 查詢拋出錯誤
      jest.spyOn(document, 'querySelector').mockImplementation(() => {
        throw new Error('Meta Error');
      });
      const result = ImageCollector.collectFeaturedImage();
      expect(result).toBeNull();
      expect(Logger.warn).toHaveBeenCalledWith(
        '解析 meta 圖片出錯',
        expect.objectContaining({ error: 'Meta Error' })
      );
    });

    test('collectFeaturedImage should handle DOM query errors', () => {
      // 模擬 meta 查詢返回 null，以便進入 DOM 查詢
      jest.spyOn(document, 'querySelector').mockReturnValue(null);

      // 模擬 cachedQuery 拋出錯誤
      cachedQuery.mockImplementation(() => {
        throw new Error('DOM Error');
      });

      const result = ImageCollector.collectFeaturedImage();
      expect(result).toBeNull();
      expect(ErrorHandler.logError).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'dom_error', originalError: expect.any(Error) })
      );
    });

    test('collectAdditionalImages should fallback to sequential processing on batch error', async () => {
      // 設置 6 張圖片以觸發批次處理 (> 5)
      const contentElement = document.createElement('div');
      for (let i = 0; i < 6; i++) {
        const img = document.createElement('img');
        img.src = `https://example.com/${i}.jpg`;
        contentElement.append(img);
      }

      cachedQuery.mockImplementation((sel, _ctx) => {
        if (sel === 'img') {
          return Array.from(contentElement.querySelectorAll('img'));
        }
        return [];
      });

      // 模擬批次處理失敗
      batchProcessWithRetry.mockRejectedValue(new Error('Batch Failed'));

      // 監控順序處理函數
      const seqSpy = jest.spyOn(ImageCollector, 'processImagesSequentially');

      // Mock processImageForCollection for sequential fallback
      jest.spyOn(ImageCollector, 'processImageForCollection').mockImplementation(img => ({
        object: 'block',
        type: 'image',
        image: { external: { url: img.src } },
      }));

      await ImageCollector.collectAdditionalImages(contentElement);

      expect(Logger.warn).toHaveBeenCalledWith(
        '批次處理失敗 (Retry)，回退到順序處理',
        expect.objectContaining({ error: 'Batch Failed' })
      );
      expect(seqSpy).toHaveBeenCalled();
    });

    test('collectAdditionalImages should handle gallery collection errors', async () => {
      const contentElement = document.createElement('div');

      // Spy on internal methods to skip them ensure we get to gallery collection
      // 策略 0-4 全部跳過
      jest.spyOn(ImageCollector, '_collectFromFeatured').mockReturnValue(null);
      jest.spyOn(ImageCollector, '_collectFromContent').mockReturnValue([]);
      jest.spyOn(ImageCollector, '_collectFromArticle').mockImplementation(() => {});
      jest.spyOn(ImageCollector, '_collectFromExpansion').mockImplementation(() => {});
      jest.spyOn(ImageCollector, '_collectFromNextJsData').mockImplementation(() => {});
      jest.spyOn(ImageCollector, '_processImages').mockImplementation(() => {});

      // 模擬 cachedQuery 針對圖集選擇器拋出錯誤
      cachedQuery.mockImplementation(() => {
        throw new Error('Gallery Error');
      });

      // 確保不會因錯誤崩潰
      await ImageCollector.collectAdditionalImages(contentElement);

      expect(Logger.warn).toHaveBeenCalledWith('圖集收集錯誤', expect.any(Object));
    });
  });

  describe('collectAdditionalImages extra coverage', () => {
    test('should skip collection when main content images are sufficient', async () => {
      // Mock _collectFromFeatured
      jest.spyOn(ImageCollector, '_collectFromFeatured').mockReturnValue(null);
      const contentElement = document.createElement('div');
      const minImages = 2; // from mocked constants

      const result = await ImageCollector.collectAdditionalImages(contentElement, {
        mainContentImageCount: minImages + 1,
      });

      expect(result.images).toHaveLength(0);
      expect(Logger.log).toHaveBeenCalledWith(
        '主內容圖片充足，跳過額外收集',
        expect.objectContaining({ mainCount: minImages + 1 })
      );
    });

    test('should fallback to expansion when no images found', async () => {
      // Mock internal methods to simulate finding nothing initially
      jest.spyOn(ImageCollector, '_collectFromFeatured').mockReturnValue(null);
      jest.spyOn(ImageCollector, '_collectFromContent').mockReturnValue([]);
      jest.spyOn(ImageCollector, '_collectFromArticle').mockImplementation(() => {});
      jest.spyOn(ImageCollector, '_collectFromNextJsData').mockImplementation(() => {});

      const expansionSpy = jest
        .spyOn(ImageCollector, '_collectFromExpansion')
        .mockImplementation(images => {
          const img = document.createElement('img');
          img.src = 'https://example.com/expansion.jpg';
          images.push(img);
        });

      // Mock process images to return what we found
      jest
        .spyOn(ImageCollector, '_processImages')
        .mockImplementation((inputImages, _, outputImages) => {
          inputImages.forEach(img => {
            outputImages.push({
              object: 'block',
              type: 'image',
              image: { external: { url: img.src } },
            });
          });
        });

      const contentElement = document.createElement('div');
      const result = await ImageCollector.collectAdditionalImages(contentElement);

      expect(expansionSpy).toHaveBeenCalled();
      expect(result.images).toHaveLength(1);
      expect(result.images[0].image.external.url).toBe('https://example.com/expansion.jpg');
    });
  });

  describe('_collectFromNextJsData coverage', () => {
    test('should return early if detection fails', () => {
      NextJsExtractor.detect.mockReturnValue(false);
      const allImages = [];

      ImageCollector._collectFromNextJsData(allImages);

      expect(NextJsExtractor.detect).toHaveBeenCalled();
      expect(NextJsExtractor.extract).not.toHaveBeenCalled();
      expect(allImages).toHaveLength(0);
    });

    test('should return early if blocks are invalid', () => {
      NextJsExtractor.detect.mockReturnValue(true);
      NextJsExtractor.extract.mockReturnValue({ blocks: 'not-an-array' });
      const allImages = [];

      ImageCollector._collectFromNextJsData(allImages);

      expect(allImages).toHaveLength(0);
    });

    test('should handle undefined result correctly', () => {
      NextJsExtractor.detect.mockReturnValue(true);
      NextJsExtractor.extract.mockReturnValue(null); // Return null specifically
      const allImages = [];

      ImageCollector._collectFromNextJsData(allImages);
      // Should log "Next.js Data 提取結果為空"
      expect(Logger.log).toHaveBeenCalledWith(
        'Next.js Data 提取結果為空',
        expect.objectContaining({ action: 'collectAdditionalImages' })
      );
    });
  });
});
