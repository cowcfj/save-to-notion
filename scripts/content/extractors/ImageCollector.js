/**
 * ImageCollector - 圖片收集器
 *
 * 職責:
 * - 收集頁面中的特色圖片 (Featured Image)
 * - 收集內容區域的補充圖片
 * - 執行多策略圖片搜索 (Content -> Article -> Expansion)
 * - 處理圖片驗證、去重和批次處理
 */

import Logger from '../../utils/Logger.js';
import ImageUtils from '../../utils/imageUtils.js';
import { ErrorHandler } from '../../errorHandling/ErrorHandler.js';
import { batchProcess, batchProcessWithRetry } from '../../performance/PerformanceOptimizer.js';

import { cachedQuery } from './ReadabilityAdapter.js';
import {
  FEATURED_IMAGE_SELECTORS,
  ARTICLE_SELECTORS,
  EXCLUSION_SELECTORS,
} from '../../config/selectors.js';
import { IMAGE_VALIDATION_CONSTANTS } from '../../config/constants.js';

class ImageCollector {
  /**
   * 嘗試收集特色/封面圖片
   * @returns {string|null} 圖片 URL 或 null
   */
  /**
   * 嘗試收集特色/封面圖片
   * @returns {string|null} 圖片 URL 或 null
   */
  static collectFeaturedImage() {
    Logger.log('🎯 Attempting to collect featured/hero image...');

    for (const selector of FEATURED_IMAGE_SELECTORS) {
      try {
        const img = cachedQuery(selector, document, { single: true });
        if (img) {
          const src = ImageUtils.extractImageSrc(img);
          // 使用 ImageUtils 進行驗證
          const isValid = ImageUtils.isValidImageUrl && ImageUtils.isValidImageUrl(src);

          if (src && isValid) {
            Logger.log(`✓ Found featured image via selector: ${selector}`);
            Logger.log(`  Image URL: ${src}`);
            return src;
          }
        }
      } catch (error) {
        if (typeof ErrorHandler !== 'undefined') {
          ErrorHandler.logError({
            type: 'dom_error',
            context: `featured image selector: ${selector}`,
            originalError: error,
            timestamp: Date.now(),
          });
        } else {
          Logger.warn(`Error checking selector ${selector}:`, error);
        }
      }
    }

    Logger.log('✗ No featured image found');
    return null;
  }

  /**
   * 處理單張圖片以進行收集
   * @param {Element} img - 圖片元素
   * @param {number} index - 索引
   * @param {string} featuredImage - 已找到的特色圖片 URL (用於去重)
   * @returns {Object|null} 圖片對象或 null
   */
  static processImageForCollection(img, index, featuredImage) {
    const src = ImageUtils.extractImageSrc(img);
    if (!src) {
      Logger.log(`✗ No src found for image ${index + 1}`);
      return null;
    }

    try {
      // 1. 清理 URL
      const absoluteUrl = new URL(src, document.baseURI).href;
      const cleanedUrl = ImageUtils.cleanImageUrl(absoluteUrl);

      // 2. 檢查是否與特色圖片重複
      if (featuredImage && cleanedUrl === featuredImage) {
        Logger.log(`ℹ️ Skipping duplicate featured image: ${cleanedUrl}`);
        return null;
      }

      // 3. 驗證圖片
      // 使用 ImageUtils.isNotionCompatibleImageUrl 如果可用，否則回退到 isValidImageUrl
      const isCompatible = ImageUtils.isNotionCompatibleImageUrl
        ? ImageUtils.isNotionCompatibleImageUrl(cleanedUrl)
        : ImageUtils.isValidImageUrl && ImageUtils.isValidImageUrl(cleanedUrl);

      if (!isCompatible) {
        Logger.log(`✗ Invalid or incompatible image: ${cleanedUrl}`);
        return null;
      }

      // 4. 檢查尺寸 (如果 ImageUtils 有 getSize 或類似方法，或者我們需要加載圖片檢查)
      // 這裡簡化處理，假設 ImageUtils.isValidImageUrl 已經做了一些檢查
      // 原代碼中有檢查 naturalWidth/Height，但在 content.js 中這部分邏輯似乎被簡化了或依賴 ImageUtils
      // 讓我們檢查 content.js 的 processImageForCollection (我之前看過)
      // 原代碼有檢查 img.naturalWidth < 200 等。我應該加上。

      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        if (
          img.naturalWidth < IMAGE_VALIDATION_CONSTANTS.MIN_IMAGE_WIDTH ||
          img.naturalHeight < IMAGE_VALIDATION_CONSTANTS.MIN_IMAGE_HEIGHT
        ) {
          Logger.log(`✗ Image too small: ${img.naturalWidth}x${img.naturalHeight}`);
          return null;
        }
      }

      return {
        object: 'block',
        type: 'image',
        image: {
          type: 'external',
          external: { url: cleanedUrl },
        },
        // 添加元數據供後續處理使用
        _meta: {
          originalSrc: src,
          width: img.naturalWidth,
          height: img.naturalHeight,
          alt: img.alt || '',
        },
      };
    } catch (error) {
      Logger.warn(`Failed to process image ${src}:`, error);
      return null;
    }
  }

  /**
   * 順序處理圖片列表
   */
  static processImagesSequentially(images, featuredImage, additionalImages) {
    images.forEach((img, index) => {
      const result = ImageCollector.processImageForCollection(img, index, featuredImage);
      if (result) {
        additionalImages.push(result);
      }
    });
  }

  /**
   * 收集頁面中的所有相關圖片
   * @param {Element} contentElement - 主要內容元素
   * @returns {Promise<Array>} 圖片對象數組
   */
  static async collectAdditionalImages(contentElement) {
    const additionalImages = [];

    // 策略 0: 優先查找封面圖/特色圖片
    Logger.log('=== Image Collection Strategy 0: Featured Image ===');
    const featuredImage = ImageCollector.collectFeaturedImage();
    if (featuredImage) {
      additionalImages.push({
        object: 'block',
        type: 'image',
        image: {
          type: 'external',
          external: { url: featuredImage },
        },
      });
      Logger.log('✓ Featured image added as first image');
    }

    // 策略 1: 從指定的內容元素收集
    Logger.log('=== Image Collection Strategy 1: Content Element ===');
    let allImages = [];
    if (contentElement) {
      const imgElements = cachedQuery('img', contentElement, { all: true });
      allImages = Array.from(imgElements);
      Logger.log(`Found ${allImages.length} images in content element`);
    }

    // 策略 2: 如果內容元素圖片少，從整個頁面的文章區域收集
    Logger.log('=== Image Collection Strategy 2: Article Regions ===');
    if (allImages.length < 3) {
      for (const selector of ARTICLE_SELECTORS) {
        const articleElement = cachedQuery(selector, document, { single: true });
        if (articleElement) {
          const imgElements = cachedQuery('img', articleElement, { all: true });
          const articleImages = Array.from(imgElements);
          Logger.log(`Found ${articleImages.length} images in ${selector}`);

          articleImages.forEach(img => {
            if (!allImages.includes(img)) {
              allImages.push(img);
            }
          });
          if (allImages.length >= 5) {
            break;
          }
        }
      }
    }

    // 策略 3: 如果仍然沒有圖片（< 1張），謹慎地擴展搜索
    Logger.log('=== Image Collection Strategy 3: Selective Expansion ===');
    if (allImages.length < 1) {
      Logger.log('Very few images found, attempting selective expansion...');

      const imgElements = cachedQuery('img', document, { all: true });
      const docImages = Array.from(imgElements);

      const filteredImages = docImages.filter(img => {
        for (const selector of EXCLUSION_SELECTORS) {
          const excludeElements = cachedQuery(selector, document);
          for (const excludeEl of excludeElements) {
            if (excludeEl.contains(img)) {
              return false;
            }
          }
        }
        return true;
      });

      let addedFromExpansion = 0;
      filteredImages.forEach(img => {
        if (!allImages.includes(img) && addedFromExpansion < 10) {
          allImages.push(img);
          addedFromExpansion++;
        }
      });
    }

    Logger.log(`Total images to process: ${allImages.length}`);

    // 使用批處理優化
    if (typeof batchProcess !== 'undefined' && allImages.length > 5) {
      Logger.log(`🚀 Using batch processing for ${allImages.length} images`);

      if (typeof batchProcessWithRetry === 'function') {
        const { results } = await batchProcessWithRetry(
          allImages,
          (img, index) => ImageCollector.processImageForCollection(img, index, featuredImage),
          { maxAttempts: 3, isResultSuccessful: result => Boolean(result?.image?.external?.url) }
        );
        if (results) {
          results.forEach(result => result && additionalImages.push(result));
        } else {
          ImageCollector.processImagesSequentially(allImages, featuredImage, additionalImages);
        }
      } else {
        // Fallback to simple batch
        try {
          const results = await batchProcess(allImages, (img, index) =>
            ImageCollector.processImageForCollection(img, index, featuredImage)
          );
          results.forEach(result => result && additionalImages.push(result));
        } catch (_error) {
          ImageCollector.processImagesSequentially(allImages, featuredImage, additionalImages);
        }
      }
    } else {
      ImageCollector.processImagesSequentially(allImages, featuredImage, additionalImages);
    }

    Logger.log(`Successfully collected ${additionalImages.length} valid images`);
    return additionalImages;
  }
}

const imageCollector = new ImageCollector();

export { ImageCollector, imageCollector };
