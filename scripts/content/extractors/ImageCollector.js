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
  isValidCleanedImageUrl,
  cleanImageUrl,
} from '../../utils/imageUtils.js';
import { sanitizeUrlForLogging } from '../../utils/securityUtils.js';
import Logger from '../../utils/Logger.js';

// Remove legacy getter
// const getImageUtils = ...
import { ErrorHandler } from '../../utils/ErrorHandler.js';
import { batchProcess, batchProcessWithRetry } from '../../performance/PerformanceOptimizer.js';

import { cachedQuery } from './ReadabilityAdapter.js';
import { NextJsExtractor } from './NextJsExtractor.js';
import {
  FEATURED_IMAGE_SELECTORS,
  ARTICLE_SELECTORS,
  EXCLUSION_SELECTORS,
} from '../../config/extraction.js';
import { IMAGE_VALIDATION_CONSTANTS, IMAGE_COLLECTION } from '../../config/constants.js';

const ImageCollector = {
  /**
   * 嘗試收集特色/封面圖片
   *
   * @returns {string|null} 圖片 URL 或 null
   */
  collectFeaturedImage() {
    Logger.log('嘗試收集特色/封面圖片', { action: 'collectFeaturedImage' });

    // 策略 1: 優先使用 og:image / twitter:image meta 標籤（最可靠）
    const metaImage = this._collectFeaturedFromMeta();
    if (metaImage) {
      return metaImage;
    }

    // 策略 2: 使用 DOM 選擇器回退
    const domImage = this._collectFeaturedFromDOM();
    if (domImage) {
      return domImage;
    }

    Logger.log('未找到特色圖片', { action: 'collectFeaturedImage' });
    return null;
  },

  /**
   * 從 DOM 選擇器獲取封面圖片（回退策略）
   *
   * @returns {string|null} 封面圖片 URL 或 null
   * @private
   */
  _collectFeaturedFromDOM() {
    for (const selector of FEATURED_IMAGE_SELECTORS) {
      try {
        const img = cachedQuery(selector, document, { single: true });
        if (!img) {
          continue;
        }

        // 排除側邊欄和非主文章區域的圖片
        if (img.closest('aside, [role="complementary"], .sidebar, .side-bar, [class*="rhs"]')) {
          Logger.log('跳過側邊欄圖片', { action: 'collectFeaturedImage', selector });
          continue;
        }

        const src = extractImageSrc?.(img);
        if (!src || !isValidImageUrl?.(src)) {
          continue;
        }

        // 標準化 URL，確保與後續圖片的去重比較一致
        const absoluteUrl = new URL(src, document.baseURI).href;
        const cleanedUrl = cleanImageUrl?.(absoluteUrl) ?? absoluteUrl;
        Logger.log('找到特色圖片 (DOM)', {
          action: 'collectFeaturedImage',
          selector,
          url: sanitizeUrlForLogging(cleanedUrl),
        });
        return cleanedUrl;
      } catch (error) {
        this._handleFeaturedImageError(error, selector);
      }
    }
    return null;
  },

  /**
   * 處理特色圖片提取錯誤（輔助方法）
   *
   * @param {Error} error - 錯誤對象
   * @param {string} selector - 選擇器
   * @private
   */
  _handleFeaturedImageError(error, selector) {
    ErrorHandler.logError({
      type: 'dom_error',
      context: `featured image selector: ${selector}`,
      originalError: error,
      timestamp: Date.now(),
    });
  },

  /**
   * 從 meta 標籤獲取封面圖片（og:image / twitter:image）
   *
   * @returns {string|null} 封面圖片 URL 或 null
   * @private
   */
  _collectFeaturedFromMeta() {
    const metaSelectors = ['meta[property="og:image"]', 'meta[name="twitter:image"]'];

    for (const selector of metaSelectors) {
      try {
        const meta = document.querySelector(selector);
        const content = meta?.content;

        if (content && isValidImageUrl?.(content)) {
          const absoluteUrl = new URL(content, document.baseURI).href;
          const cleanedUrl = cleanImageUrl?.(absoluteUrl) ?? absoluteUrl;
          Logger.log('找到特色圖片 (Meta)', {
            action: 'collectFeaturedImage',
            source: selector,
            url: sanitizeUrlForLogging(cleanedUrl),
          });
          return cleanedUrl;
        }
      } catch (error) {
        Logger.warn('解析 meta 圖片出錯', {
          action: 'collectFeaturedImage',
          selector,
          error: error.message,
        });
      }
    }
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
      const cleanedImageUrl = cleanImageUrl?.(absoluteUrl) ?? absoluteUrl;

      // 2. 檢查是否與特色圖片重複
      if (featuredImage && cleanedImageUrl === featuredImage) {
        Logger.log('跳過重複的特色圖片', {
          action: 'processImageForCollection',
          url: sanitizeUrlForLogging(cleanedImageUrl),
        });
        return null;
      }

      // 3. 驗證圖片 URL (使用已清理的 URL，避免重複標準化)
      if (!isValidCleanedImageUrl?.(cleanedImageUrl)) {
        Logger.log('無效或不相容的圖片 URL', {
          action: 'processImageForCollection',
          url: sanitizeUrlForLogging(cleanedImageUrl),
        });
        return null;
      }

      // 4. 檢查尺寸過濾小圖
      // 優先使用 naturalWidth/naturalHeight（已載入的圖片）
      // 回退到 HTML width/height 屬性或 data-width/data-height（處理懶加載圖片）
      const imgWidth =
        img.naturalWidth ||
        Number.parseInt(img.getAttribute('width'), 10) ||
        Number.parseInt(img.dataset.width, 10) ||
        0;
      const imgHeight =
        img.naturalHeight ||
        Number.parseInt(img.getAttribute('height'), 10) ||
        Number.parseInt(img.dataset.height, 10) ||
        0;

      // 只在有有效尺寸資訊時進行過濾（避免誤殺未設置尺寸屬性的大圖）
      if (
        imgWidth > 0 &&
        imgHeight > 0 &&
        (imgWidth < IMAGE_VALIDATION_CONSTANTS.MIN_IMAGE_WIDTH ||
          imgHeight < IMAGE_VALIDATION_CONSTANTS.MIN_IMAGE_HEIGHT)
      ) {
        Logger.log('圖片尺寸太小', {
          action: 'processImageForCollection',
          width: imgWidth,
          height: imgHeight,
          source: img.naturalWidth > 0 ? 'naturalSize' : 'htmlAttribute',
        });
        return null;
      }

      return {
        object: 'block',
        type: 'image',
        image: {
          type: 'external',
          external: { url: cleanedImageUrl },
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
   * 收集頁面中的所有相關圖片
   *
   * @param {Element} contentElement - 主要內容元素
   * @param {object} [options] - 配置選項
   * @param {Array} [options.nextJsBlocks] - 預先提取的 Next.js 區塊 (避免重複解析)
   * @returns {Promise<{images: Array<object>, coverImage: string|null}>} 包含圖片對象數組 (images) 和封面圖片 URL (coverImage) 的對象
   */
  async collectAdditionalImages(contentElement, options = {}) {
    const additionalImages = [];

    // 策略 0: 優先查找封面圖/特色圖片
    const featuredImage = this._collectFromFeatured();

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
    // 如果傳入了 nextJsBlocks，則直接使用，避免重複解析 DOM
    this._collectFromNextJsData(allImages, options.nextJsBlocks);

    Logger.log('待處理圖片總數', { action: 'collectAdditionalImages', count: allImages.length });

    // 使用批處理優化
    await this._processImages(allImages, featuredImage, additionalImages);

    Logger.log('已成功收集有效圖片', {
      action: 'collectAdditionalImages',
      count: additionalImages.length,
    });

    // 限制圖片數量（封面圖片不計入限制）
    const maxImages = IMAGE_COLLECTION.MAX_IMAGES_PER_PAGE;
    if (additionalImages.length > maxImages) {
      Logger.log('圖片數量超過上限，已截取', {
        action: 'collectAdditionalImages',
        original: additionalImages.length,
        limit: maxImages,
      });
      additionalImages.length = maxImages; // 原地截取，效能最優
    }

    // 返回結構化對象，包含封面圖片 URL 供 Notion cover 使用
    return {
      images: additionalImages,
      coverImage: featuredImage, // 封面圖片 URL（用於設置 Notion 頁面封面）
    };
  },

  _collectFromFeatured() {
    Logger.log('圖片收集策略：特色圖片', { action: 'collectAdditionalImages' });
    const featuredImage = ImageCollector.collectFeaturedImage();
    if (featuredImage) {
      Logger.log('已獲取特色圖片 (供封面使用)', { action: 'collectAdditionalImages' });
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
   * 委託 NextJsExtractor 處理解析
   *
   * @param {Array} allImages - 現有的圖片元素數組
   * @param {Array} [preExtractedBlocks] - 預先提取的 Next.js 區塊
   */
  _collectFromNextJsData(allImages, preExtractedBlocks) {
    Logger.log('圖片收集策略：Next.js Data', { action: 'collectAdditionalImages' });

    let blocks = preExtractedBlocks;

    // 如果沒有預先提取的區塊，則嘗試解析
    if (blocks) {
      Logger.log('使用預提取的 Next.js 區塊進行圖片收集', {
        count: blocks.length,
      });
    } else {
      // 使用 NextJsExtractor 進行檢測與提取
      if (!NextJsExtractor.detect(document)) {
        return;
      }

      const result = NextJsExtractor.extract(document);
      if (!result?.blocks) {
        Logger.log('Next.js Data 提取結果為空', { action: 'collectAdditionalImages' });
        return;
      }
      blocks = result.blocks;
    }

    if (!Array.isArray(blocks)) {
      return;
    }

    let addedCount = 0;
    const seenUrls = new Set(allImages.map(img => img.src));

    // 從轉換後的 Notion Blocks 中提取圖片
    blocks.forEach(block => {
      if (block.type === 'image' && block.image?.external?.url) {
        const url = block.image.external.url;

        // 簡單去重與驗證
        if (!seenUrls.has(url) && isValidImageUrl?.(url)) {
          // 創建偽造的 img 元素以便重用現有的處理邏輯
          const fakeImg = document.createElement('img');
          fakeImg.src = url;
          if (block.image.caption && block.image.caption.length > 0) {
            fakeImg.alt = block.image.caption[0].text.content;
          }
          fakeImg.dataset.source = 'nextjs-data';

          allImages.push(fakeImg);
          seenUrls.add(url);
          addedCount++;
        }
      }
    });

    Logger.log('從 Next.js Data 添加了新圖片', { count: addedCount });
  },

  /**
   * 順序處理圖片列表
   *
   * @param {Element[]} images - 圖片元素數組
   * @param {string|null} featuredImage - 特色圖片 URL
   * @param {Array<object>} additionalImages - 用於存儲結果的數組
   * @param {Set<string>} processedUrls - 已處理的 URL 集合 (Context)
   */
  processImagesSequentially(images, featuredImage, additionalImages, processedUrls = new Set()) {
    // 如果有特色圖片且尚未記錄，先加入
    if (featuredImage && !processedUrls.has(featuredImage)) {
      processedUrls.add(featuredImage);
    }

    images.forEach((img, index) => {
      const result = ImageCollector.processImageForCollection(img, index, featuredImage);
      if (result) {
        const url = result.image?.external?.url;
        // 檢查是否已處理過這個 URL
        if (url && !processedUrls.has(url)) {
          processedUrls.add(url);
          additionalImages.push(result);
        } else if (url) {
          Logger.log('跳過重複的圖片 URL', {
            action: 'processImagesSequentially',
            url: sanitizeUrlForLogging(url),
          });
        }
      }
    });
  },

  async _processImages(allImages, featuredImage, additionalImages) {
    // 初始化已處理的 URL 集合，以防止重複 (Shared Context)
    const processedUrls = new Set();
    if (featuredImage) {
      processedUrls.add(featuredImage);
    }

    // 初始化已有結果的 URL
    additionalImages.forEach(img => {
      const url = img.image?.external?.url;
      if (url) {
        processedUrls.add(url);
      }
    });

    if (batchProcess !== undefined && allImages.length > 5) {
      Logger.log('對圖片使用批次處理', {
        action: 'collectAdditionalImages',
        count: allImages.length,
      });

      // 定義處理函數，注意這裡不進行去重，去重在收集結果時統一處理
      const processFn = img => {
        const index = allImages.indexOf(img);
        return ImageCollector.processImageForCollection(img, index, featuredImage);
      };

      const handleResults = results => {
        if (!results) {
          return;
        }
        results.forEach(result => {
          if (!result) {
            return;
          }
          const url = result.image?.external?.url;
          if (url && !processedUrls.has(url)) {
            processedUrls.add(url);
            additionalImages.push(result);
          }
        });
      };

      if (typeof batchProcessWithRetry === 'function') {
        const { results } = await batchProcessWithRetry(allImages, processFn, {
          maxAttempts: 3,
          isResultSuccessful: result => Boolean(result?.image?.external?.url),
        });
        handleResults(results);
      } else {
        // Fallback to simple batch
        try {
          const results = await batchProcess(allImages, processFn);
          handleResults(results);
        } catch (error) {
          Logger.warn('批次處理失敗，回退到順序處理', { error: error.message });
          ImageCollector.processImagesSequentially(
            allImages,
            featuredImage,
            additionalImages,
            processedUrls
          );
        }
      }
    } else {
      ImageCollector.processImagesSequentially(
        allImages,
        featuredImage,
        additionalImages,
        processedUrls
      );
    }
  },
};

const imageCollector = ImageCollector;

export { ImageCollector, imageCollector };
