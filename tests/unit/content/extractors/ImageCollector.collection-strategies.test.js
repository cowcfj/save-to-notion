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
  batchProcessWithRetry,
  NextJsExtractor,
  Logger,
  ErrorHandler,
  extractImageSrc,
  isValidCleanedImageUrl,
  isTemporaryImageUrl,
} = imageCollectorTestModules;

describe('ImageCollector collection strategies', () => {
  setupImageCollectorTestLifecycle();

  describe('collectAdditionalImages', () => {
    test('should collect images from content element', async () => {
      const contentElement = document.createElement('div');
      const mockImg1 = document.createElement('img');
      mockImg1.src = 'https://example.com/1.jpg';
      const mockImg2 = document.createElement('img');
      mockImg2.src = 'https://example.com/2.jpg';

      cachedQuery.mockImplementation((selector, context) => {
        if (context === contentElement && selector === 'img') {
          return [mockImg1, mockImg2];
        }
        return [];
      });

      extractImageSrc.mockImplementation(img => (img ? img.src : null));

      trackSpy(ImageCollector, 'processImageForCollection').mockImplementation(img => ({
        object: 'block',
        type: 'image',
        image: { external: { url: img.src } },
      }));

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

      expect(result.images).toHaveLength(2);
      expect(result.coverImage).toBeNull();
      expect(result.images[0].image.external.url).toBe('https://example.com/1.jpg');
    });

    test('should limit images to MAX_ADDITIONAL_IMAGES', async () => {
      const contentElement = document.createElement('div');
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

      trackSpy(ImageCollector, 'processImageForCollection').mockImplementation(img => ({
        object: 'block',
        type: 'image',
        image: { external: { url: img.src } },
      }));

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
      expect(result.images).toHaveLength(2);
      expect(result.coverImage).toBeNull();
    });

    test('should collect images from Next.js data (scoped to article)', async () => {
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

      trackSpy(ImageCollector, 'processImageForCollection').mockImplementation(img => ({
        object: 'block',
        type: 'image',
        image: { external: { url: img.src } },
        _meta: { width: img.naturalWidth },
      }));

      const searchSpy = trackSpy(ImageCollector, '_collectFromNextJsData');

      const result = await ImageCollector.collectAdditionalImages(contentElement);

      expect(searchSpy).toHaveBeenCalled();
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

      trackSpy(ImageCollector, 'processImageForCollection').mockImplementation(img => ({
        object: 'block',
        type: 'image',
        image: { external: { url: img.src } },
      }));

      const result = await ImageCollector.collectAdditionalImages(contentElement, {
        nextJsBlocks: mockBlocks,
      });

      expect(searchSpy).toHaveBeenCalledWith(expect.any(Array), mockBlocks);
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
      expect(Logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Next.js Data'),
        expect.objectContaining({ action: 'collectAdditionalImages' })
      );
    });

    test('should deduplicate images in batch processing results', async () => {
      const contentElement = document.createElement('div');
      const urls = [
        'https://example.com/1.jpg',
        'https://example.com/2.jpg',
        'https://example.com/3.jpg',
        'https://example.com/1.jpg',
        'https://example.com/2.jpg',
        'https://example.com/3.jpg',
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

      trackSpy(ImageCollector, 'processImageForCollection').mockImplementation(img => ({
        object: 'block',
        type: 'image',
        image: { external: { url: img.src } },
      }));

      batchProcessWithRetry.mockResolvedValue({
        results: urls.map(url => ({
          object: 'block',
          type: 'image',
          image: { external: { url } },
        })),
        meta: {},
      });

      const result = await ImageCollector.collectAdditionalImages(contentElement);

      expect(result.images).toHaveLength(2);
      const uniqueUrls = new Set(result.images.map(img => img.image.external.url));
      expect(uniqueUrls.size).toBe(2);
      expect(uniqueUrls.has('https://example.com/1.jpg')).toBe(true);
      expect(uniqueUrls.has('https://example.com/2.jpg')).toBe(true);
    });
  });

  describe('Error Handling and Fallbacks', () => {
    test('collectFeaturedImage should handle meta query errors', () => {
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
      trackSpy(document, 'querySelector').mockReturnValue(null);

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

      batchProcessWithRetry.mockRejectedValue(new Error('Batch Failed'));

      const seqSpy = trackSpy(ImageCollector, 'processImagesSequentially');

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

      cachedQuery.mockImplementation(() => {
        throw new Error('Gallery Error');
      });

      await ImageCollector.collectAdditionalImages(contentElement);

      expect(Logger.warn).toHaveBeenCalledWith('圖集收集錯誤', expect.any(Object));
    });

    test('_collectFromGalleries should collect unique image blocks natively', () => {
      const mockImg1 = document.createElement('img');
      mockImg1.src = 'https://example.com/gallery1.jpg';

      Object.defineProperty(mockImg1, 'naturalWidth', { value: 800 });
      Object.defineProperty(mockImg1, 'naturalHeight', { value: 600 });

      const mockImg2 = document.createElement('img');
      mockImg2.src = 'https://example.com/gallery1.jpg';

      Object.defineProperty(mockImg2, 'naturalWidth', { value: 800 });
      Object.defineProperty(mockImg2, 'naturalHeight', { value: 600 });

      cachedQuery.mockReturnValue([mockImg1, mockImg2]);

      extractImageSrc
        .mockReturnValueOnce('https://example.com/gallery1.jpg')
        .mockReturnValueOnce('https://example.com/gallery1.jpg');

      const results = ImageCollector._collectFromGalleries('https://example.com/already.jpg');

      expect(results).toHaveLength(1);
    });

    test('_collectFromGalleries should keep temporary image placeholder blocks', () => {
      const patreonUrl = 'https://example.patreonusercontent.com/temp-gallery.jpg';
      const mockImg = document.createElement('img');
      mockImg.src = patreonUrl;
      mockImg.alt = 'Gallery temp image';

      cachedQuery.mockReturnValue([mockImg]);
      extractImageSrc.mockReturnValue(patreonUrl);
      isTemporaryImageUrl.mockReturnValue(true);

      const results = ImageCollector._collectFromGalleries(null);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(
        expect.objectContaining({
          type: 'paragraph',
          _meta: expect.objectContaining({
            placeholder: true,
            originalSrc: patreonUrl,
          }),
        })
      );
    });
  });

  describe('collectAdditionalImages extra coverage', () => {
    test('should skip collection when main content images are sufficient', async () => {
      trackSpy(ImageCollector, '_collectFromFeatured').mockReturnValue(null);
      const contentElement = document.createElement('div');
      const minImages = 2;

      const result = await ImageCollector.collectAdditionalImages(contentElement, {
        mainContentImageCount: minImages + 1,
      });

      expect(result.images).toHaveLength(0);
      expect(result.metrics).toBeDefined();
      expect(result.metrics.candidateCount).toBe(0);
      expect(result.metrics.hasCoverImage).toBe(false);
      expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0);
      expect(Logger.log).toHaveBeenCalledWith(
        '主內容圖片充足，跳過額外收集',
        expect.objectContaining({ mainCount: minImages + 1 })
      );
    });

    test('should return metrics with correct field types on successful collection', async () => {
      trackSpy(ImageCollector, '_collectFromFeatured').mockReturnValue(
        'https://example.com/cover.jpg'
      );
      trackSpy(ImageCollector, '_collectFromContent').mockReturnValue([]);
      trackSpy(ImageCollector, '_collectFromArticle').mockImplementation(() => {});
      trackSpy(ImageCollector, '_collectFromExpansion').mockImplementation(() => {});
      trackSpy(ImageCollector, '_collectFromNextJsData').mockImplementation(() => {});
      trackSpy(ImageCollector, '_resolveUnknownSizes').mockResolvedValue({
        attempted: 0,
        succeeded: 0,
      });
      trackSpy(ImageCollector, '_processImages').mockImplementation(() => {});

      const contentElement = document.createElement('div');
      const result = await ImageCollector.collectAdditionalImages(contentElement);

      const { metrics } = result;
      expect(metrics).toBeDefined();

      for (const key of [
        'candidateCount',
        'urlValidCount',
        'unknownSizeCount',
        'sizeResolveAttempted',
        'sizeResolveSuccess',
        'filteredBySize',
        'finalCount',
        'durationMs',
      ]) {
        expect(typeof metrics[key]).toBe('number');
      }

      expect(typeof metrics.hasCoverImage).toBe('boolean');
      expect(metrics.hasCoverImage).toBe(true);
      expect(metrics.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('should track url-valid and size-filtered metrics accurately', async () => {
      const contentElement = document.createElement('div');
      const validImg = document.createElement('img');
      validImg.src = 'https://example.com/valid.jpg';
      Object.defineProperty(validImg, 'naturalWidth', { value: 800 });
      Object.defineProperty(validImg, 'naturalHeight', { value: 600 });

      const smallImg = document.createElement('img');
      smallImg.src = 'https://example.com/small.jpg';
      Object.defineProperty(smallImg, 'naturalWidth', { value: 320 });
      Object.defineProperty(smallImg, 'naturalHeight', { value: 200 });

      const invalidImg = document.createElement('img');
      invalidImg.src = 'https://example.com/invalid.jpg';
      Object.defineProperty(invalidImg, 'naturalWidth', { value: 900 });
      Object.defineProperty(invalidImg, 'naturalHeight', { value: 700 });

      trackSpy(ImageCollector, '_collectFromFeatured').mockReturnValue(null);
      trackSpy(ImageCollector, '_collectFromContent').mockReturnValue([
        validImg,
        smallImg,
        invalidImg,
      ]);
      trackSpy(ImageCollector, '_collectFromNextJsData').mockImplementation(() => {});
      trackSpy(ImageCollector, '_collectFromGalleries').mockReturnValue([]);

      extractImageSrc.mockImplementation(img => img.src);
      isValidCleanedImageUrl.mockImplementation(url => url !== 'https://example.com/invalid.jpg');

      const result = await ImageCollector.collectAdditionalImages(contentElement);

      expect(result.images).toHaveLength(1);
      expect(result.images[0].image.external.url).toBe('https://example.com/valid.jpg');
      expect(result.metrics.candidateCount).toBe(3);
      expect(result.metrics.urlValidCount).toBe(2);
      expect(result.metrics.filteredBySize).toBe(1);
      expect(result.metrics.finalCount).toBe(1);
    });

    test('should fallback to expansion when no images found', async () => {
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
      NextJsExtractor.extract.mockReturnValue(null);
      const allImages = [];

      ImageCollector._collectFromNextJsData(allImages);
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
      const mockImg1 = document.createElement('img');
      const mockImg2 = document.createElement('img');
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

    test('_collectFromExpansion should request iterable exclusion results from cachedQuery', () => {
      const mockImg1 = document.createElement('img');
      const mockImg2 = document.createElement('img');
      const adEl = document.createElement('div');
      adEl.className = 'ad';
      adEl.append(mockImg2);

      cachedQuery.mockImplementation((selector, _context, options = {}) => {
        if (selector === 'img') {
          return [mockImg1, mockImg2];
        }
        if (selector === '.ad img') {
          return options.all ? [mockImg2] : mockImg2;
        }
        return [];
      });

      const allImages = [];
      expect(() => ImageCollector._collectFromExpansion(allImages)).not.toThrow();

      expect(cachedQuery).toHaveBeenCalledWith('.ad img', document, { all: true });
      expect(allImages).toHaveLength(1);
      expect(allImages[0]).toBe(mockImg1);
    });

    test('_collectFromExpansion should use configured expansion limit', () => {
      const imgs = Array.from({ length: 4 }, () => document.createElement('img'));

      cachedQuery.mockImplementation(selector => {
        if (selector === 'img') {
          return imgs;
        }
        return [];
      });

      const allImages = [];
      ImageCollector._collectFromExpansion(allImages);

      expect(allImages).toHaveLength(3);
    });
  });
});
