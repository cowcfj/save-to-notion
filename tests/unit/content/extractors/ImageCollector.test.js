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
jest.mock('../../../../scripts/config/extraction', () => ({
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
    MIN_IMAGES_FOR_ARTICLE_SEARCH: 3,
    MAX_IMAGES_FROM_ARTICLE_SEARCH: 5,
    BATCH_PROCESS_THRESHOLD: 5,
  },
  PERFORMANCE_OPTIMIZER: {
    MAX_NEXT_DATA_SIZE: 5_000_000,
  },
  FEATURED_IMAGE_SELECTORS: ['meta[property="og:image"]', '.featured-image img'],
  IMAGE_SELECTORS: ['img'],
  GALLERY_SELECTORS: ['.gallery img'],
  EXCLUSION_SELECTORS: ['.ad img'],
}));

jest.mock('../../../../scripts/config/messages', () => ({
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

const trackedSpies = [];
const trackSpy = (...args) => {
  const spy = jest.spyOn(...args);
  trackedSpies.push(spy);
  return spy;
};

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
    while (trackedSpies.length > 0) {
      trackedSpies.pop().mockRestore();
    }
    jest.clearAllMocks();
  });

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
      trackSpy(ImageCollector, 'processImageForCollection').mockImplementation(img => ({
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
      // The implementation checks: if (allImages.length > IMAGE_LIMITS.BATCH_PROCESS_THRESHOLD) for batch.
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
      trackSpy(ImageCollector, 'processImageForCollection').mockImplementation(img => ({
        object: 'block',
        type: 'image',
        image: { external: { url: img.src } },
      }));

      // Mock batchProcessWithRetry (since > BATCH_PROCESS_THRESHOLD images triggers batch)
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
      trackSpy(ImageCollector, 'processImageForCollection').mockImplementation(img => ({
        object: 'block',
        type: 'image',
        image: { external: { url: img.src } },
        _meta: { width: img.naturalWidth },
      }));

      const searchSpy = trackSpy(ImageCollector, '_collectFromNextJsData');

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

      const searchSpy = trackSpy(ImageCollector, '_collectFromNextJsData');

      // Mock processImageForCollection to bypass size checks for the fake image
      trackSpy(ImageCollector, 'processImageForCollection').mockImplementation(img => ({
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
      const searchSpy = trackSpy(ImageCollector, '_collectFromNextJsData');

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
      // Create 6 images to trigger batch processing (> BATCH_PROCESS_THRESHOLD)
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
      trackSpy(ImageCollector, 'processImageForCollection').mockImplementation(img => ({
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
      trackSpy(document, 'querySelector').mockImplementation(() => {
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
      trackSpy(document, 'querySelector').mockReturnValue(null);

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
      // 設置 6 張圖片以觸發批次處理 (> BATCH_PROCESS_THRESHOLD)
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
      const seqSpy = trackSpy(ImageCollector, 'processImagesSequentially');

      // Mock processImageForCollection for sequential fallback
      trackSpy(ImageCollector, 'processImageForCollection').mockImplementation(img => ({
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

      trackSpy(ImageCollector, '_collectFromFeatured').mockReturnValue(null);
      trackSpy(ImageCollector, '_collectFromContent').mockReturnValue([]);
      trackSpy(ImageCollector, '_collectFromArticle').mockImplementation(() => {});
      trackSpy(ImageCollector, '_collectFromExpansion').mockImplementation(() => {});
      trackSpy(ImageCollector, '_collectFromNextJsData').mockImplementation(() => {});
      trackSpy(ImageCollector, '_processImages').mockImplementation(() => {});

      // 模擬 cachedQuery 拋出錯誤以觸發圖集收集報錯分支
      cachedQuery.mockImplementation(() => {
        throw new Error('Gallery Error');
      });

      await ImageCollector.collectAdditionalImages(contentElement);

      expect(Logger.warn).toHaveBeenCalledWith('圖集收集錯誤', expect.any(Object));
    });

    test('_collectFromGalleries should collect unique image blocks natively', () => {
      const mockImg1 = document.createElement('img');
      mockImg1.src = 'https://example.com/gallery1.jpg'; // 下一步補上有效的 mock 尺寸

      Object.defineProperty(mockImg1, 'naturalWidth', { value: 800 });
      Object.defineProperty(mockImg1, 'naturalHeight', { value: 600 });

      const mockImg2 = document.createElement('img');
      mockImg2.src = 'https://example.com/gallery1.jpg'; // 重複圖片

      Object.defineProperty(mockImg2, 'naturalWidth', { value: 800 });
      Object.defineProperty(mockImg2, 'naturalHeight', { value: 600 });

      cachedQuery.mockReturnValue([mockImg1, mockImg2]);

      // 移除 spy，直接覆蓋到第 169 行並呼叫 processImageForCollection
      extractImageSrc
        .mockReturnValueOnce('https://example.com/gallery1.jpg')
        .mockReturnValueOnce('https://example.com/gallery1.jpg');

      const results = ImageCollector._collectFromGalleries('https://example.com/already.jpg');

      expect(results).toHaveLength(1);
    });
  });

  describe('collectAdditionalImages extra coverage', () => {
    test('should skip collection when main content images are sufficient', async () => {
      // Mock _collectFromFeatured
      trackSpy(ImageCollector, '_collectFromFeatured').mockReturnValue(null);
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
      trackSpy(ImageCollector, '_collectFromFeatured').mockReturnValue(null);
      trackSpy(ImageCollector, '_collectFromContent').mockReturnValue([]);
      trackSpy(ImageCollector, '_collectFromArticle').mockImplementation(() => {});
      trackSpy(ImageCollector, '_collectFromNextJsData').mockImplementation(() => {});

      const expansionSpy = trackSpy(ImageCollector, '_collectFromExpansion').mockImplementation(
        images => {
          const img = document.createElement('img');
          img.src = 'https://example.com/expansion.jpg';
          images.push(img);
        }
      );

      // Mock process images to return what we found
      trackSpy(ImageCollector, '_processImages').mockImplementation(
        (inputImages, _, outputImages) => {
          inputImages.forEach(img => {
            outputImages.push({
              object: 'block',
              type: 'image',
              image: { external: { url: img.src } },
            });
          });
        }
      );

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

  describe('_collectFromArticle and _collectFromExpansion', () => {
    test('_collectFromArticle should gather images natively', () => {
      const mockImg1 = document.createElement('img');
      const articleEl = document.createElement('article');
      articleEl.append(mockImg1);

      cachedQuery.mockReturnValueOnce(articleEl).mockReturnValueOnce([mockImg1]);

      const allImages = [];
      ImageCollector._collectFromArticle(allImages);

      expect(allImages).toHaveLength(1);
    });

    test('_collectFromExpansion should expand search excluding ads', () => {
      const mockImg1 = document.createElement('img'); // valid
      const mockImg2 = document.createElement('img'); // inside ad
      const adEl = document.createElement('div');
      adEl.className = 'ad';
      adEl.append(mockImg2);

      cachedQuery.mockImplementation(selector => {
        if (selector === 'img') {
          return [mockImg1, mockImg2];
        }
        if (selector === '.ad img') {
          return [mockImg2];
        }
        return [];
      });

      const allImages = [];
      ImageCollector._collectFromExpansion(allImages);

      expect(allImages).toHaveLength(1);
      expect(allImages[0]).toBe(mockImg1);
    });
  });

  describe('_processImages native batch behaviors', () => {
    test('processImagesSequentially should handle duplicate log', () => {
      const img1 = document.createElement('img');
      const processedUrls = new Set(['https://example.com/seen.jpg']);

      trackSpy(ImageCollector, 'processImageForCollection').mockImplementation(() => {
        return { image: { external: { url: 'https://example.com/seen.jpg' } } };
      });

      const additionalImages = [];
      ImageCollector.processImagesSequentially([img1], null, additionalImages, processedUrls);

      expect(additionalImages).toHaveLength(0);
      expect(Logger.log).toHaveBeenCalledWith('跳過重複的圖片 URL', expect.any(Object));
    });

    test('_processImages native batch behaviors success case', async () => {
      const allImages = Array.from({ length: 6 }, () => {
        const img = document.createElement('img');
        img.src = 'https://example.com/b1.jpg';
        Object.defineProperty(img, 'naturalWidth', { value: 800 });
        Object.defineProperty(img, 'naturalHeight', { value: 600 });
        return img;
      });
      const additionalImages = [
        { image: { external: { url: 'https://example.com/existing.jpg' } } },
      ];

      extractImageSrc.mockReturnValue('https://example.com/b1.jpg');
      isValidCleanedImageUrl.mockReturnValue(true);
      batchProcessWithRetry.mockImplementation(async (items, processFn) => {
        const results = items.map(item => processFn(item));
        return { results, meta: {} };
      });

      await ImageCollector._processImages(
        allImages,
        'https://example.com/feat.jpg',
        additionalImages
      );
      // 目前已有 1 張既有圖片，這裡只新增一次 b1（其餘 5 張已去重）。
      expect(additionalImages).toHaveLength(2); // 既有圖片 + b1
    });

    test('_processImages handles simple batch fallback if retry throws', async () => {
      // 透過覆寫實作，確保會走到錯誤處理分支
      batchProcessWithRetry.mockRejectedValue(new Error('Batch Failed'));
      const seqSpy = trackSpy(ImageCollector, 'processImagesSequentially');

      const allImages = Array.from({ length: 6 }).fill(document.createElement('img'));
      await ImageCollector._processImages(allImages, 'https://example.com/feat.jpg', []);

      expect(Logger.warn).toHaveBeenCalledWith(
        '批次處理失敗 (Retry)，回退到順序處理',
        expect.any(Object)
      );
      expect(seqSpy).toHaveBeenCalled();
    });
  });
});
