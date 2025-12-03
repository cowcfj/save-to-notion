/**
 * @jest-environment jsdom
 */

// Mock ReadabilityAdapter before importing ImageCollector
jest.mock('../../../../scripts/content/extractors/ReadabilityAdapter', () => ({
  cachedQuery: jest.fn(),
}));

const { imageCollector } = require('../../../../scripts/content/extractors/ImageCollector');
const { cachedQuery } = require('../../../../scripts/content/extractors/ReadabilityAdapter');

// Mock Globals
global.Logger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

global.ImageUtils = {
  extractImageSrc: jest.fn(),
  cleanImageUrl: jest.fn(url => url),
  isValidImageUrl: jest.fn(() => true),
  isNotionCompatibleImageUrl: jest.fn(() => true),
};

global.ErrorHandler = {
  logError: jest.fn(),
};

global.batchProcess = jest.fn();
global.batchProcessWithRetry = jest.fn();

describe('ImageCollector', () => {
  beforeEach(() => {
    jest.resetAllMocks(); // Use reset instead of clear to reset implementations
    document.body.innerHTML = '';

    // Default mocks
    global.Logger.log.mockImplementation(() => {});
    global.Logger.warn.mockImplementation(() => {});
    global.Logger.error.mockImplementation(() => {});

    global.ImageUtils.extractImageSrc.mockReturnValue(null);
    global.ImageUtils.cleanImageUrl.mockImplementation(url => url);
    global.ImageUtils.isValidImageUrl.mockReturnValue(true);
    global.ImageUtils.isNotionCompatibleImageUrl.mockReturnValue(true);

    // Default cachedQuery mock
    cachedQuery.mockImplementation((selector, context, options) => {
      if (options && options.all) {
        return [];
      }
      return null;
    });
  });

  describe('collectFeaturedImage', () => {
    test('should return valid featured image src', () => {
      const mockImg = document.createElement('img');
      mockImg.src = 'https://example.com/featured.jpg';

      cachedQuery.mockImplementation((selector, context, options) => {
        if (options && options.single) {
          return mockImg;
        }
        return null;
      });
      global.ImageUtils.extractImageSrc.mockReturnValue('https://example.com/featured.jpg');

      const result = imageCollector.collectFeaturedImage();
      expect(result).toBe('https://example.com/featured.jpg');
      expect(cachedQuery).toHaveBeenCalled();
    });

    test('should return null if no featured image found', () => {
      cachedQuery.mockReturnValue(null);
      const result = imageCollector.collectFeaturedImage();
      expect(result).toBeNull();
    });
  });

  describe('processImageForCollection', () => {
    test('should process valid image', () => {
      const mockImg = document.createElement('img');
      mockImg.src = 'https://example.com/img.jpg';
      Object.defineProperty(mockImg, 'naturalWidth', { value: 800 });
      Object.defineProperty(mockImg, 'naturalHeight', { value: 600 });

      global.ImageUtils.extractImageSrc.mockReturnValue('https://example.com/img.jpg');

      const result = imageCollector.processImageForCollection(mockImg, 0, null);

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
      global.ImageUtils.extractImageSrc.mockReturnValue('https://example.com/featured.jpg');

      const result = imageCollector.processImageForCollection(
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

      global.ImageUtils.extractImageSrc.mockReturnValue('https://example.com/small.jpg');

      const result = imageCollector.processImageForCollection(mockImg, 0, null);
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
      global.ImageUtils.extractImageSrc.mockImplementation(img => (img ? img.src : null));

      // Mock processImageForCollection behavior via spy
      const processSpy = jest.spyOn(imageCollector, 'processImageForCollection');
      processSpy.mockImplementation(img => ({
        object: 'block',
        type: 'image',
        image: { external: { url: img.src } },
      }));

      const results = await imageCollector.collectAdditionalImages(contentElement);

      expect(results).toHaveLength(2);
      expect(results[0].image.external.url).toBe('https://example.com/1.jpg');
    });

    test('should fallback to sequential processing if batch fails', async () => {
      // Setup
      const contentElement = document.createElement('div');
      const mockImgs = Array(6)
        .fill(0)
        .map((_, i) => {
          const img = document.createElement('img');
          img.src = `https://example.com/${i}.jpg`;
          return img;
        });

      cachedQuery.mockImplementation((selector, context) => {
        if (context === contentElement) {
          return mockImgs;
        }
        return [];
      });

      global.ImageUtils.extractImageSrc.mockImplementation(img => (img ? img.src : null));

      // Mock batchProcessWithRetry to be undefined to force fallback to batchProcess
      const originalBatchRetry = global.batchProcessWithRetry;
      global.batchProcessWithRetry = undefined;

      global.batchProcess = jest.fn().mockRejectedValue(new Error('Batch failed'));

      // Spy on sequential
      const seqSpy = jest.spyOn(imageCollector, 'processImagesSequentially');
      // Spy on processImageForCollection to return valid result
      jest.spyOn(imageCollector, 'processImageForCollection').mockReturnValue({
        object: 'block',
        type: 'image',
        image: { external: { url: 'url' } },
      });

      await imageCollector.collectAdditionalImages(contentElement);

      expect(seqSpy).toHaveBeenCalled();

      // Restore
      global.batchProcessWithRetry = originalBatchRetry;
    });
  });
});
