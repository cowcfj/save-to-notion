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

import { ImageCollector } from '../../../../scripts/content/extractors/ImageCollector.js';
import { cachedQuery } from '../../../../scripts/content/extractors/ReadabilityAdapter.js';
import { batchProcessWithRetry } from '../../../../scripts/performance/PerformanceOptimizer.js';

// Mock Globals
globalThis.Logger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock ImageUtils module
jest.mock('../../../../scripts/utils/imageUtils.js', () => ({
  __esModule: true,
  extractImageSrc: jest.fn(),
  cleanImageUrl: jest.fn(url => url),
  isValidImageUrl: jest.fn(() => true),
  isNotionCompatibleImageUrl: jest.fn(() => true),
  default: {
    // Keep default for potential legacy access elsewhere (if any)
    extractImageSrc: jest.fn(),
    cleanImageUrl: jest.fn(url => url),
    isValidImageUrl: jest.fn(() => true),
    isNotionCompatibleImageUrl: jest.fn(() => true),
  },
}));

import {
  extractImageSrc,
  cleanImageUrl,
  isValidImageUrl,
  isNotionCompatibleImageUrl,
} from '../../../../scripts/utils/imageUtils.js';

// Global mock not needed for ImageCollector but might be used by other parts if they fallback
globalThis.ImageUtils = {
  extractImageSrc,
  cleanImageUrl,
  isValidImageUrl,
  isNotionCompatibleImageUrl,
};

globalThis.ErrorHandler = {
  logError: jest.fn(),
};

describe('ImageCollector', () => {
  beforeEach(() => {
    jest.resetAllMocks(); // Use reset instead of clear to reset implementations
    document.body.innerHTML = '';

    // Default mocks
    globalThis.Logger.log.mockImplementation(() => undefined);
    globalThis.Logger.warn.mockImplementation(() => undefined);
    globalThis.Logger.error.mockImplementation(() => undefined);

    extractImageSrc.mockReturnValue(null);
    cleanImageUrl.mockImplementation(url => url);
    isValidImageUrl.mockReturnValue(true);
    isNotionCompatibleImageUrl.mockReturnValue(true);

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
      ImageUtils.extractImageSrc.mockReturnValue('https://example.com/featured.jpg');

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
      ImageUtils.extractImageSrc.mockReturnValue('https://example.com/featured.jpg');

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
      Object.defineProperty(mockImg, 'naturalWidth', { value: 100 });
      Object.defineProperty(mockImg, 'naturalHeight', { value: 50 });

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
      const originalProcess = ImageCollector.processImageForCollection;
      ImageCollector.processImageForCollection = jest.fn(img => ({
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

      const results = await ImageCollector.collectAdditionalImages(contentElement);

      // Depending on implementation, it might use batch or sequential.
      // If batch is used, it returns the mocked batch results.
      // If sequential is used (e.g. < 5 images), it processes them.
      // In this test setup, we have 2 images.
      // The implementation checks: if (allImages.length > 5) for batch.
      // So with 2 images, it will use sequential processing.
      // batchProcessWithRetry won't be called.

      expect(results).toHaveLength(2);
      expect(results[0].image.external.url).toBe('https://example.com/1.jpg');

      // Restore original method
      ImageCollector.processImageForCollection = originalProcess;
    });

    test('should fallback to sequential processing if batch fails', async () => {
      // Setup
      const contentElement = document.createElement('div');
      // Create 6 images to trigger batch processing (> 5)
      const mockImgs = Array.from({ length: 6 })
        .fill(0)
        .map((_, idx) => {
          const img = document.createElement('img');
          img.src = `https://example.com/${idx}.jpg`;
          return img;
        });

      cachedQuery.mockImplementation((selector, context) => {
        if (context === contentElement) {
          return mockImgs;
        }
        return [];
      });

      extractImageSrc.mockImplementation(img => (img ? img.src : null));

      // Mock batchProcessWithRetry to return null results (simulating failure)
      batchProcessWithRetry.mockResolvedValue({
        results: null,
        meta: { lastError: new Error('Batch failed') },
      });

      // Mock processImageForCollection
      const originalProcess = ImageCollector.processImageForCollection;
      ImageCollector.processImageForCollection = jest.fn().mockReturnValue({
        object: 'block',
        type: 'image',
        image: { external: { url: 'url' } },
      });

      // Spy on sequential
      const seqSpy = jest.spyOn(ImageCollector, 'processImagesSequentially');

      await ImageCollector.collectAdditionalImages(contentElement);

      expect(seqSpy).toHaveBeenCalled();

      // Restore mocked methods
      ImageCollector.processImageForCollection = originalProcess;
      seqSpy.mockRestore();
    });
  });
});
