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
import { extractImageSrc, isValidImageUrl, cleanImageUrl } from '../../utils/imageUtils.js';
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

      // 3. 驗證圖片 URL
      if (!isValidImageUrl?.(cleanedUrl)) {
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

    // 策略 4: 嘗試從 Next.js Data 提取 (針對 HK01 等 CSR/SSR 網站)
    this._collectFromNextJsData(allImages);

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

  /**
   * 從 Next.js 的 hydration data (__NEXT_DATA__) 中提取圖片
   * 適用於像 HK01 這樣使用 CSR/SSR 且圖片資訊存在於 JSON 中的網站
   *
   * @param {Array} allImages - 現有的圖片元素數組
   */
  _collectFromNextJsData(allImages) {
    Logger.log('圖片收集策略：Next.js Data (scoped)', { action: 'collectAdditionalImages' });

    // 1. 獲取並解析 JSON 數據
    const nextDataScript = document.querySelector('#__NEXT_DATA__');
    if (!nextDataScript) {
      return;
    }

    let nextData;
    try {
      nextData = JSON.parse(nextDataScript.textContent);
    } catch (error) {
      Logger.warn('解析 Next.js Data JSON 失敗', { error: error.message });
      return;
    }

    const foundImages = [];
    const seenUrls = new Set(); // 用於去重

    // 2. 針對 HK01 的特定路徑: props.pageProps.article
    const articleData = nextData?.props?.pageProps?.article;

    if (articleData) {
      this._extractImagesFromArticleData(articleData, foundImages, seenUrls);
    } else {
      // 如果找不到 article 對象，記錄警告但不進行全域遞歸搜索，避免提取無關圖片
      const keys = nextData?.props?.pageProps ? Object.keys(nextData.props.pageProps) : 'no_props';
      Logger.log('Next.js Data 中未找到 article 對象，跳過提取', { keys });
    }

    // 3. 記錄日誌
    this._logFoundImages(foundImages);

    // 4. 添加到結果集
    const addedCount = this._addImagesToCollection(foundImages, allImages);
    Logger.log('已添加來自 Next.js Data 的新圖片', { count: addedCount });
  },

  /**
   * 從 article 數據中提取圖片 (提取輔助方法以降低複雜度)
   *
   * @param {object} articleData - 文章數據對象
   * @param {Array} foundImages - 存儲找到的圖片的數組
   * @param {Set} seenUrls - 用於去重的 URL 集合
   * @private
   */
  _extractImagesFromArticleData(articleData, foundImages, seenUrls) {
    // 設定提取目標：主圖、原圖、圖庫
    // 排除 thumbnails 以避免重複和低畫質圖片
    const candidates = [
      articleData.mainImage,
      articleData.originalImage,
      ...(articleData.gallery?.images || []),
    ].filter(Boolean); // 過濾掉 null/undefined

    for (const imgData of candidates) {
      if (imgData.cdnUrl && typeof imgData.cdnUrl === 'string') {
        const url = imgData.cdnUrl;

        // 去重檢查
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          foundImages.push({
            url, // 使用簡寫
            width: imgData.originalWidth, // HK01 使用 originalWidth
            height: imgData.originalHeight,
            caption: imgData.caption,
          });
        }
      }
    }
  },

  /**
   * 記錄找到的圖片 (提取輔助方法)
   *
   * @param {Array} foundImages - 找到的圖片數組
   * @private
   */
  _logFoundImages(foundImages) {
    Logger.log('從 Next.js Data 找到潛在圖片', {
      count: foundImages.length,
      samples: foundImages.slice(0, 3).map(img => {
        const urlStr = img.url || '';
        return urlStr.length > 50 ? `...${urlStr.slice(-50)}` : urlStr;
      }),
    });
  },

  /**
   * 將找到的圖片添加到集合中 (提取輔助方法)
   *
   * @param {Array} foundImages - 找到的圖片數組
   * @param {Array} allImages - 所有圖片元素的數組
   * @returns {number} 添加的圖片數量
   * @private
   */
  _addImagesToCollection(foundImages, allImages) {
    let addedCount = 0;
    const seenUrls = new Set(allImages.map(img => img.src));

    foundImages.forEach(data => {
      let normalizedHref;
      try {
        normalizedHref = new URL(data.url, document.baseURI).href;
      } catch {
        return; // Skip invalid URLs
      }

      // 檢查是否已存在於 allImages (通過 normalized URL)
      if (seenUrls.has(normalizedHref)) {
        return;
      }

      // 創建偽造的 img 元素以便重用現有的處理邏輯
      const fakeImg = document.createElement('img');
      fakeImg.src = normalizedHref;

      if (data.width) {
        Object.defineProperty(fakeImg, 'naturalWidth', { value: Number(data.width) });
      }
      if (data.height) {
        Object.defineProperty(fakeImg, 'naturalHeight', { value: Number(data.height) });
      }
      if (data.caption) {
        fakeImg.alt = data.caption;
      }

      // 添加一個標記屬性，識別來源
      fakeImg.dataset.source = 'nextjs-data';

      allImages.push(fakeImg);
      seenUrls.add(normalizedHref);
      addedCount++;
    });
    return addedCount;
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
