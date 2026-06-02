/**
 * @jest-environment jsdom
 */

import {
  imageCollectorTestModules,
  setupImageCollectorTestLifecycle,
  trackSpy,
} from './ImageCollectorTestSetup.js';

const { ImageCollector, batchProcessWithRetry, Logger, extractImageSrc, isValidCleanedImageUrl } =
  imageCollectorTestModules;

describe('ImageCollector process images', () => {
  setupImageCollectorTestLifecycle();

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
    const additionalImages = [{ image: { external: { url: 'https://example.com/existing.jpg' } } }];

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
    expect(additionalImages).toHaveLength(2);
  });

  test('_processImages handles simple batch fallback if retry throws', async () => {
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
