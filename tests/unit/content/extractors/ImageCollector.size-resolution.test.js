/**
 * @jest-environment jsdom
 */

import {
  imageCollectorTestModules,
  setupImageCollectorTestLifecycle,
  trackSpy,
} from './ImageCollectorTestSetup.js';

const { ImageCollector, Logger, extractImageSrc } = imageCollectorTestModules;

describe('ImageCollector size resolution', () => {
  setupImageCollectorTestLifecycle();

  describe('_resolveUnknownSizes', () => {
    test('should skip when all images have known dimensions', async () => {
      const img = document.createElement('img');
      Object.defineProperty(img, 'naturalWidth', { value: 800 });
      Object.defineProperty(img, 'naturalHeight', { value: 600 });

      const result = await ImageCollector._resolveUnknownSizes([img]);

      expect(result).toEqual({ attempted: 0, succeeded: 0 });
    });

    test('should resolve unknown-size images and write dataset', async () => {
      const img = document.createElement('img');
      img.src = 'https://example.com/lazy.jpg';
      // naturalWidth/naturalHeight default to 0 in jsdom

      extractImageSrc.mockReturnValue('https://example.com/lazy.jpg');

      // Mock _resolveImageSize to return resolved dimensions
      trackSpy(ImageCollector, '_resolveImageSize').mockResolvedValue({
        width: 1024,
        height: 768,
      });

      const result = await ImageCollector._resolveUnknownSizes([img]);

      expect(result).toEqual({ attempted: 1, succeeded: 1 });
      expect(img.dataset.resolvedWidth).toBe('1024');
      expect(img.dataset.resolvedHeight).toBe('768');
    });

    test('should handle resolve failure gracefully (timeout/load error)', async () => {
      const img = document.createElement('img');
      img.src = 'https://example.com/broken.jpg';

      extractImageSrc.mockReturnValue('https://example.com/broken.jpg');

      trackSpy(ImageCollector, '_resolveImageSize').mockRejectedValue(new Error('timeout'));

      const result = await ImageCollector._resolveUnknownSizes([img]);

      expect(result).toEqual({ attempted: 1, succeeded: 0 });
      expect(img.dataset.resolvedWidth).toBeUndefined();
      expect(img.dataset.resolvedHeight).toBeUndefined();
      expect(Logger.log).toHaveBeenCalledWith(
        '尺寸解析失敗',
        expect.objectContaining({ action: '_resolveUnknownSizes' })
      );
    });

    test('should filter resolved-but-small images in processImageForCollection', () => {
      const img = document.createElement('img');
      img.src = 'https://example.com/small-resolved.jpg';
      // Simulate resolved dimensions that are too small
      img.dataset.resolvedWidth = '200';
      img.dataset.resolvedHeight = '150';

      extractImageSrc.mockReturnValue('https://example.com/small-resolved.jpg');

      const result = ImageCollector.processImageForCollection(img, 0, null);

      expect(result).toBeNull();
      expect(Logger.log).toHaveBeenCalledWith(
        '圖片尺寸太小',
        expect.objectContaining({ width: 200, height: 150 })
      );
    });

    test('should pass resolved-and-large images in processImageForCollection', () => {
      const img = document.createElement('img');
      img.src = 'https://example.com/large-resolved.jpg';
      img.dataset.resolvedWidth = '1024';
      img.dataset.resolvedHeight = '768';

      extractImageSrc.mockReturnValue('https://example.com/large-resolved.jpg');

      const result = ImageCollector.processImageForCollection(img, 0, null);

      expect(result).toBeDefined();
      expect(result.image.external.url).toBe('https://example.com/large-resolved.jpg');
    });

    test('should skip images without src in _resolveUnknownSizes', async () => {
      const img = document.createElement('img');
      // No src set, extractImageSrc returns null
      extractImageSrc.mockReturnValue(null);

      const resolveSpy = trackSpy(ImageCollector, '_resolveImageSize');

      const result = await ImageCollector._resolveUnknownSizes([img]);

      expect(result).toEqual({ attempted: 1, succeeded: 0 });
      expect(resolveSpy).not.toHaveBeenCalled();
    });

    test('should respect total budget and stop early', async () => {
      const imgs = Array.from({ length: 3 }, () => {
        const img = document.createElement('img');
        img.src = 'https://example.com/img.jpg';
        return img;
      });

      extractImageSrc.mockReturnValue('https://example.com/img.jpg');

      // Mock performance.now to simulate budget exhaustion
      let callCount = 0;
      jest.spyOn(performance, 'now').mockImplementation(() => {
        callCount++;
        // First call (budgetStart): 0
        // Subsequent calls: simulate time passing beyond budget (5000ms)
        return callCount <= 1 ? 0 : 6000;
      });

      const resolveSpy = trackSpy(ImageCollector, '_resolveImageSize').mockResolvedValue({
        width: 800,
        height: 600,
      });

      await ImageCollector._resolveUnknownSizes(imgs);

      // _resolveImageSize should not be called because budget is exhausted
      // after the first performance.now() check inside the map callback
      expect(resolveSpy).not.toHaveBeenCalled();

      performance.now.mockRestore();
    });

    test('should stop launching new resolves after budget is exhausted mid-run', async () => {
      const firstImg = document.createElement('img');
      firstImg.src = 'https://example.com/first.jpg';
      const secondImg = document.createElement('img');
      secondImg.src = 'https://example.com/second.jpg';

      extractImageSrc.mockImplementation(img => img.src);

      let currentTime = 0;
      const nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => currentTime);
      const resolveSpy = trackSpy(ImageCollector, '_resolveImageSize').mockImplementation(src => {
        if (src === 'https://example.com/first.jpg') {
          return Promise.resolve().then(() => {
            currentTime = 6000;
            return { width: 800, height: 600 };
          });
        }

        return Promise.resolve({ width: 800, height: 600 });
      });

      const result = await ImageCollector._resolveUnknownSizes([firstImg, secondImg]);

      expect(result).toEqual({ attempted: 2, succeeded: 1 });
      expect(resolveSpy).toHaveBeenCalledTimes(1);
      expect(firstImg.dataset.resolvedWidth).toBe('800');
      expect(firstImg.dataset.resolvedHeight).toBe('600');
      expect(secondImg.dataset.resolvedWidth).toBeUndefined();
      expect(secondImg.dataset.resolvedHeight).toBeUndefined();

      nowSpy.mockRestore();
    });

    test('should wait for previous resolve to settle before launching the next image', async () => {
      const firstImg = document.createElement('img');
      firstImg.src = 'https://example.com/first.jpg';
      const secondImg = document.createElement('img');
      secondImg.src = 'https://example.com/second.jpg';

      extractImageSrc.mockImplementation(img => img.src);

      let firstSettled = false;
      trackSpy(ImageCollector, '_resolveImageSize').mockImplementation(src => {
        if (src === 'https://example.com/first.jpg') {
          return Promise.resolve().then(() => {
            firstSettled = true;
            return { width: 800, height: 600 };
          });
        }

        return Promise.resolve(
          firstSettled ? { width: 640, height: 480 } : { width: 0, height: 0 }
        );
      });

      const result = await ImageCollector._resolveUnknownSizes([firstImg, secondImg]);

      expect(result).toEqual({ attempted: 2, succeeded: 2 });
      expect(firstImg.dataset.resolvedWidth).toBe('800');
      expect(firstImg.dataset.resolvedHeight).toBe('600');
      expect(secondImg.dataset.resolvedWidth).toBe('640');
      expect(secondImg.dataset.resolvedHeight).toBe('480');
    });
  });

  describe('_resolveImageSize', () => {
    let OriginalImage;
    let createdImages;

    class FakeImage {
      constructor() {
        this.listeners = {
          load: new Set(),
          error: new Set(),
        };
        this.naturalWidth = 0;
        this.naturalHeight = 0;
        createdImages.push(this);
      }

      addEventListener(type, handler) {
        this.listeners[type].add(handler);
      }

      removeEventListener(type, handler) {
        this.listeners[type].delete(handler);
      }

      emit(type) {
        this.listeners[type].forEach(handler => handler());
      }

      set src(value) {
        this._src = value;
      }

      get src() {
        return this._src;
      }
    }

    beforeEach(() => {
      // 恢復這這個區塊的真實實作，因為在外層被 mock 了
      if (ImageCollector._resolveImageSize.mockRestore) {
        ImageCollector._resolveImageSize.mockRestore();
      }
      OriginalImage = globalThis.Image;
      createdImages = [];
      globalThis.Image = FakeImage;
      jest.useFakeTimers();
    });

    afterEach(() => {
      globalThis.Image = OriginalImage;
      jest.useRealTimers();
    });

    test('should clear timeout and listeners after successful image load', async () => {
      const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');

      const promise = ImageCollector._resolveImageSize('https://example.com/success.jpg', 3000);
      const img = createdImages[0];
      img.naturalWidth = 800;
      img.naturalHeight = 600;

      img.emit('load');

      await expect(promise).resolves.toEqual({ width: 800, height: 600 });
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
      expect(img.listeners.load.size).toBe(0);
      expect(img.listeners.error.size).toBe(0);
    });

    test('should clear timeout and listeners after image load failure', async () => {
      const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');

      const promise = ImageCollector._resolveImageSize('https://example.com/fail.jpg', 3000);
      const img = createdImages[0];

      img.emit('error');

      await expect(promise).rejects.toThrow('load failed');
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
      expect(img.listeners.load.size).toBe(0);
      expect(img.listeners.error.size).toBe(0);
    });

    test('should clear listeners when timeout fires first', async () => {
      const promise = ImageCollector._resolveImageSize('https://example.com/timeout.jpg', 3000);
      const img = createdImages[0];

      jest.advanceTimersByTime(3000);

      await expect(promise).rejects.toThrow('timeout');
      expect(img.listeners.load.size).toBe(0);
      expect(img.listeners.error.size).toBe(0);
    });
  });
});
