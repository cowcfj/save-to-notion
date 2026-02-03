/**
 * ImageCollector - 圖片收集器
 *
 * 職責:
 * - 收集頁面中的特色圖片 (Featured Image)
 * - 收集內容區域的補充圖片
 * - 執行多策略圖片搜索 (Content -> Article -> Expansion)
 * - 處理圖片驗證、去重和批次處理
 */

// ImageUtils Named Imports
import {
  extractImageSrc,
  isValidImageUrl,
  cleanImageUrl,
  isNotionCompatibleImageUrl,
} from '../../utils/imageUtils.js';
import { sanitizeUrlForLogging } from '../../utils/securityUtils.js';
import Logger from '../../utils/Logger.js';

// Remove legacy getter
// const getImageUtils = ...
import { ErrorHandler } from '../../utils/ErrorHandler.js';
import { batchProcess, batchProcessWithRetry } from '../../performance/PerformanceOptimizer.js';

import { cachedQuery } from './ReadabilityAdapter.js';
import {
  FEATURED_IMAGE_SELECTORS,
  ARTICLE_SELECTORS,
  EXCLUSION_SELECTORS,
} from '../../config/selectors.js';
import { IMAGE_VALIDATION_CONSTANTS } from '../../config/constants.js';

const ImageCollector = {
  /**
   * 嘗試收集特色/封面圖片
   *
   * @returns {string|null} 圖片 URL 或 null
   */
  collectFeaturedImage() {
    Logger.log('嘗試收集特色/封面圖片', { action: 'collectFeaturedImage' });

    for (const selector of FEATURED_IMAGE_SELECTORS) {
      try {
        const img = cachedQuery(selector, document, { single: true });
        if (img) {
          const src = extractImageSrc?.(img);
          // 使用 ImageUtils 進行驗證
          const isValid = isValidImageUrl?.(src);

          if (src && isValid) {
            Logger.log('找到特色圖片', {
              action: 'collectFeaturedImage',
              selector,
              url: sanitizeUrlForLogging(src),
            });
            return src;
          }
        }
      } catch (error) {
        if (ErrorHandler === undefined) {
          Logger.warn('檢查選擇器出錯', {
            action: 'collectFeaturedImage',
            selector,
            error: error.message,
          });
        } else {
          ErrorHandler.logError({
            type: 'dom_error',
            context: `featured image selector: ${selector}`,
            originalError: error,
            timestamp: Date.now(),
          });
        }
      }
    }

    Logger.log('未找到特色圖片', { action: 'collectFeaturedImage' });
    return null;
  },

  /**
   * 處理單張圖片以進行收集
   *
   * @param {Element} img - 圖片元素
   * @param {number} index - 索引
   * @param {string} featuredImage - 已找到的特色圖片 URL (用於去重)
   * @returns {object | null} 圖片對象或 null
   */
  processImageForCollection(img, index, featuredImage) {
    const src = extractImageSrc?.(img);
    if (!src) {
      Logger.log('圖片缺少 src 屬性', { action: 'processImageForCollection', index: index + 1 });
      return null;
    }

    try {
      // 1. 清理 URL
      const absoluteUrl = new URL(src, document.baseURI).href;
      const cleanedUrl = cleanImageUrl?.(absoluteUrl) ?? absoluteUrl;

      // 2. 檢查是否與特色圖片重複
      if (featuredImage && cleanedUrl === featuredImage) {
        Logger.log('跳過重複的特色圖片', {
          action: 'processImageForCollection',
          url: sanitizeUrlForLogging(cleanedUrl),
        });
        return null;
      }

      // 3. 驗證圖片
      // 使用 isNotionCompatibleImageUrl 如果可用，否則回退到 isValidImageUrl
      const isCompatible = isNotionCompatibleImageUrl
        ? isNotionCompatibleImageUrl(cleanedUrl)
        : isValidImageUrl?.(cleanedUrl);

      if (!isCompatible) {
        Logger.log('無效或不相容的圖片 URL', {
          action: 'processImageForCollection',
          url: sanitizeUrlForLogging(cleanedUrl),
        });
        return null;
      }

      // 4. 檢查尺寸 (如果 ImageUtils 有 getSize 或類似方法，或者我們需要加載圖片檢查)
      // 這裡簡化處理，假設 ImageUtils.isValidImageUrl 已經做了一些檢查
      // 原代碼中有檢查 naturalWidth/Height，但在 content.js 中這部分邏輯似乎被簡化了或依賴 ImageUtils
      // 讓我們檢查 content.js 的 processImageForCollection (我之前看過)
      // 原代碼有檢查 img.naturalWidth < 200 等。我應該加上。

      if (
        img.naturalWidth > 0 &&
        img.naturalHeight > 0 &&
        (img.naturalWidth < IMAGE_VALIDATION_CONSTANTS.MIN_IMAGE_WIDTH ||
          img.naturalHeight < IMAGE_VALIDATION_CONSTANTS.MIN_IMAGE_HEIGHT)
      ) {
        Logger.log('圖片尺寸太小', {
          action: 'processImageForCollection',
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
        return null;
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
      Logger.warn('處理圖片失敗', {
        action: 'processImageForCollection',
        src: sanitizeUrlForLogging(src),
        error: error.message,
      });
      return null;
    }
  },

  /**
   * 順序處理圖片列表
   *
   * @param {Element[]} images - 圖片元素數組
   * @param {string|null} featuredImage - 特色圖片 URL
   * @param {Array<object>} additionalImages - 用於存儲結果的數組
   */
  processImagesSequentially(images, featuredImage, additionalImages) {
    images.forEach((img, index) => {
      const result = ImageCollector.processImageForCollection(img, index, featuredImage);
      if (result) {
        additionalImages.push(result);
      }
    });
  },

  /**
   * 收集頁面中的所有相關圖片
   *
   * @param {Element} contentElement - 主要內容元素
   * @returns {Promise<Array>} 圖片對象數組
   */
  async collectAdditionalImages(contentElement) {
    const additionalImages = [];

    // 策略 0: 優先查找封面圖/特色圖片
    const featuredImage = this._collectFromFeatured(additionalImages);

    // 策略 1: 從指定的內容元素收集
    const contentImages = this._collectFromContent(contentElement);

    // 策略 2: 如果內容元素圖片少，從整個頁面的文章區域收集
    const allImages = [...contentImages];
    if (allImages.length < 3) {
      this._collectFromArticle(allImages);
    }

    // 策略 3: 如果仍然沒有圖片（< 1張），謹慎地擴展搜索
    if (allImages.length === 0) {
      this._collectFromExpansion(allImages);
    }

    Logger.log('待處理圖片總數', { action: 'collectAdditionalImages', count: allImages.length });

    // 使用批處理優化
    await this._processImages(allImages, featuredImage, additionalImages);

    Logger.log('已成功收集有效圖片', {
      action: 'collectAdditionalImages',
      count: additionalImages.length,
    });
    return additionalImages;
  },

  _collectFromFeatured(additionalImages) {
    Logger.log('圖片收集策略：特色圖片', { action: 'collectAdditionalImages' });
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
      Logger.log('特色圖片已作為首張圖片添加', { action: 'collectAdditionalImages' });
    }
    return featuredImage;
  },

  _collectFromContent(contentElement) {
    Logger.log('圖片收集策略：內容元素', { action: 'collectAdditionalImages' });
    if (!contentElement) {
      return [];
    }

    const imgElements = cachedQuery('img', contentElement, { all: true });
    const images = Array.from(imgElements);
    Logger.log('在內容元素中找到圖片', {
      action: 'collectAdditionalImages',
      count: images.length,
    });
    return images;
  },

  _collectFromArticle(allImages) {
    Logger.log('圖片收集策略：文章區域', { action: 'collectAdditionalImages' });
    for (const selector of ARTICLE_SELECTORS) {
      const articleElement = cachedQuery(selector, document, { single: true });
      if (articleElement) {
        const imgElements = cachedQuery('img', articleElement, { all: true });
        const articleImages = Array.from(imgElements);
        Logger.log('在指定區域找到圖片', {
          action: 'collectAdditionalImages',
          selector,
          count: articleImages.length,
        });

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
  },

  _collectFromExpansion(allImages) {
    Logger.log('圖片收集策略：選擇性擴展', { action: 'collectAdditionalImages' });
    Logger.log('找到的圖片極少，嘗試選擇性擴展搜尋', { action: 'collectAdditionalImages' });

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
  },

  async _processImages(allImages, featuredImage, additionalImages) {
    if (batchProcess !== undefined && allImages.length > 5) {
      Logger.log('對圖片使用批次處理', {
        action: 'collectAdditionalImages',
        count: allImages.length,
      });

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
        } catch {
          ImageCollector.processImagesSequentially(allImages, featuredImage, additionalImages);
        }
      }
    } else {
      ImageCollector.processImagesSequentially(allImages, featuredImage, additionalImages);
    }
  },
};

const imageCollector = ImageCollector;

export { ImageCollector, imageCollector };
