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
// Temporary image URL 偵測：拆獨立模組以避免 rollup 把整個 ImageUtils 物件鎖進 background bundle
import { isTemporaryImageUrl } from '../../utils/temporaryImageUrl.js';
// Content-only helper: 隔離大型中文 placeholder 字串避免被打包進 background bundle
import { buildTemporaryImagePlaceholderBlock } from './temporaryImagePlaceholder.js';
import { sanitizeUrlForLogging } from '../../utils/LogSanitizer.js';
import Logger from '../../utils/Logger.js';

// Remove legacy getter
// const getImageUtils = ...
import { ErrorHandler } from '../../utils/ErrorHandler.js';
import { batchProcess, batchProcessWithRetry } from '../../performance/PerformanceOptimizer.js';

import { cachedQuery } from './ReadabilityAdapter.js';
import { NextJsExtractor } from './NextJsExtractor.js';
import {
  FEATURED_IMAGE_SELECTORS,
  IMAGE_SELECTORS,
  GALLERY_SELECTORS,
  EXCLUSION_SELECTORS,
  IMAGE_VALIDATION_CONSTANTS,
  IMAGE_LIMITS,
  IMAGE_SIZE_RESOLVE,
} from '../../config/shared/content.js';

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
      const imageUrl = this._collectFeaturedFromDOMSelector(selector);
      if (imageUrl) {
        return imageUrl;
      }
    }
    return null;
  },

  _collectFeaturedFromDOMSelector(selector) {
    try {
      const img = cachedQuery(selector, document, { single: true });
      return this._getFeaturedDOMImageUrl(img, selector);
    } catch (error) {
      this._handleFeaturedImageError(error, selector);
      return null;
    }
  },

  _getFeaturedDOMImageUrl(img, selector) {
    if (!img) {
      return null;
    }
    if (this._isSidebarFeaturedImage(img, selector)) {
      return null;
    }

    const src = extractImageSrc?.(img);
    if (!this._isValidFeaturedImageSource(src)) {
      return null;
    }

    const cleanedUrl = this._normalizeFeaturedImageUrl(src, { selector, source: 'dom' });
    if (!cleanedUrl) {
      return null;
    }
    if (
      this._shouldSkipTemporaryFeaturedImage(cleanedUrl, '跳過 temporary 圖片 URL (DOM 封面)', {
        selector,
      })
    ) {
      return null;
    }

    Logger.log('找到特色圖片 (DOM)', {
      action: 'collectFeaturedImage',
      selector,
      url: sanitizeUrlForLogging(cleanedUrl),
    });
    return cleanedUrl;
  },

  _isSidebarFeaturedImage(img, selector) {
    if (!img.closest('aside, [role="complementary"], .sidebar, .side-bar, [class*="rhs"]')) {
      return false;
    }

    Logger.log('跳過側邊欄圖片', { action: 'collectFeaturedImage', selector });
    return true;
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
      const imageUrl = this._collectFeaturedFromMetaSelector(selector);
      if (imageUrl) {
        return imageUrl;
      }
    }
    return null;
  },

  _collectFeaturedFromMetaSelector(selector) {
    try {
      const meta = document.querySelector(selector);
      return this._getFeaturedMetaImageUrl(meta?.content, selector);
    } catch (error) {
      Logger.warn('解析 meta 圖片出錯', {
        action: 'collectFeaturedImage',
        selector,
        error: error.message,
      });
      return null;
    }
  },

  _getFeaturedMetaImageUrl(content, selector) {
    if (!this._isValidFeaturedImageSource(content)) {
      return null;
    }

    const cleanedUrl = this._normalizeFeaturedImageUrl(content, { source: selector });
    if (!cleanedUrl) {
      return null;
    }
    if (
      this._shouldSkipTemporaryFeaturedImage(cleanedUrl, '跳過 temporary 圖片 URL (Meta 封面)', {
        source: selector,
      })
    ) {
      return null;
    }

    Logger.log('找到特色圖片 (Meta)', {
      action: 'collectFeaturedImage',
      source: selector,
      url: sanitizeUrlForLogging(cleanedUrl),
    });
    return cleanedUrl;
  },

  _isValidFeaturedImageSource(src) {
    if (!src) {
      return false;
    }
    return Boolean(isValidImageUrl?.(src));
  },

  _normalizeFeaturedImageUrl(src, metadata = {}) {
    try {
      const absoluteUrl = new URL(src, document.baseURI).href;
      return cleanImageUrl?.(absoluteUrl) ?? absoluteUrl;
    } catch {
      Logger.warn('無效的圖片 URL', {
        action: 'collectFeaturedImage',
        ...metadata,
        url: sanitizeUrlForLogging(src),
      });
      return null;
    }
  },

  _shouldSkipTemporaryFeaturedImage(cleanedUrl, message, metadata) {
    if (!isTemporaryImageUrl?.(cleanedUrl)) {
      return false;
    }

    Logger.log(message, {
      action: 'collectFeaturedImage',
      ...metadata,
      url: sanitizeUrlForLogging(cleanedUrl),
    });
    return true;
  },

  /**
   * 從圖集/畫廊收集圖片
   *
   * @param {string} featuredImage - 特色圖片 URL (用於去重)
   * @returns {Array} 圖片區塊列表
   * @private
   */
  _collectFromGalleries(featuredImage) {
    const images = [];
    const processedUrls = new Set();
    if (featuredImage) {
      processedUrls.add(featuredImage);
    }

    if (!GALLERY_SELECTORS || GALLERY_SELECTORS.length === 0) {
      return images;
    }

    Logger.log('開始收集圖集圖片', { action: 'collectFromGalleries' });

    for (const selector of GALLERY_SELECTORS) {
      this._appendGallerySelectorImages(selector, featuredImage, processedUrls, images);
    }

    return images;
  },

  _appendGallerySelectorImages(selector, featuredImage, processedUrls, images) {
    try {
      const elements = cachedQuery(selector, document, { all: true });
      if (!elements || elements.length === 0) {
        return;
      }

      Logger.log(`找到圖集元素: ${selector}`, { count: elements.length });
      this._appendUniqueGalleryImages(elements, featuredImage, processedUrls, images);
    } catch (error) {
      Logger.warn('圖集收集錯誤', { selector, error: error.message });
    }
  },

  _appendUniqueGalleryImages(elements, featuredImage, processedUrls, images) {
    elements.forEach((el, index) => {
      const imageObj = this.processImageForCollection(el, index, featuredImage);
      const url = this._extractImageBlockUrl(imageObj);
      if (!url || processedUrls.has(url)) {
        return;
      }

      processedUrls.add(url);
      images.push(imageObj);
    });
  },

  _extractPlaceholderImageBlockUrl(block) {
    // Temporary placeholder paragraphs have no image URL; use originalSrc as the gallery dedupe key.
    if (block?._meta?.placeholder) {
      return block._meta.originalSrc || null;
    }
    return null;
  },

  _extractExternalImageBlockUrl(block) {
    return block?.image?.external?.url || null;
  },

  _extractImageBlockUrl(block) {
    const placeholderUrl = this._extractPlaceholderImageBlockUrl(block);
    if (placeholderUrl) {
      return placeholderUrl;
    }
    return this._extractExternalImageBlockUrl(block);
  },

  /**
   * 處理單張圖片以進行收集
   *
   * @param {Element} img - 圖片元素
   * @param {number} index - 索引
   * @param {string} featuredImage - 已找到的特色圖片 URL (用於去重)
   * @param {object} [options] - 處理選項
   * @returns {object | null} 圖片對象或 null
   */
  processImageForCollection(img, index, featuredImage, options = {}) {
    const outcome = this._evaluateImageForCollection(img, index, featuredImage);
    if (options.detailed) {
      return outcome;
    }
    if (outcome.status === 'accepted' || outcome.status === 'temporary_replaced') {
      return outcome.image;
    }
    return null;
  },

  /**
   * 標準化 URL，確保與後續圖片的去重比較一致
   *
   * @param {Element} img - 圖片元素
   * @param {string} src - 原始 src
   * @returns {string} 標準化且清理後的 URL
   * @private
   */
  _normalizeCandidateImageUrl(img, src) {
    const absoluteUrl = new URL(src, document.baseURI).href;
    return cleanImageUrl?.(absoluteUrl) ?? absoluteUrl;
  },

  /**
   * 從已按優先級排列的候選值中取第一個正數尺寸
   *
   * @param {number[]} values - 尺寸候選值
   * @returns {number} 第一個正數尺寸，沒有則回傳 0
   * @private
   */
  _selectFirstPositiveDimensionValue(values) {
    for (const value of values) {
      if (value > 0) {
        return value;
      }
    }
    return 0;
  },

  /**
   * 判斷圖片尺寸資訊來源
   *
   * @param {Element} img - 圖片元素
   * @returns {string} 尺寸來源描述
   * @private
   */
  _getImageDimensionSource(img) {
    if (img.naturalWidth > 0) {
      return 'naturalSize';
    }
    return 'htmlAttribute';
  },

  /**
   * 依優先級獲取圖片尺寸
   *
   * @param {Element} img - 圖片元素
   * @returns {{width: number, height: number, source: string}} 尺寸與來源描述
   * @private
   */
  _getImageDimensions(img) {
    const width = this._selectFirstPositiveDimensionValue([
      img.naturalWidth,
      Number.parseInt(img.getAttribute('width'), 10),
      Number.parseInt(img.dataset.width, 10),
      Number.parseInt(img.dataset.resolvedWidth, 10),
    ]);
    const height = this._selectFirstPositiveDimensionValue([
      img.naturalHeight,
      Number.parseInt(img.getAttribute('height'), 10),
      Number.parseInt(img.dataset.height, 10),
      Number.parseInt(img.dataset.resolvedHeight, 10),
    ]);

    return { width, height, source: this._getImageDimensionSource(img) };
  },

  /**
   * 判斷是否低於最小尺寸限制
   *
   * @param {{width: number, height: number}} dimensions - 尺寸對象
   * @returns {boolean} 是否低於最小尺寸
   * @private
   */
  _isImageBelowMinimumSize({ width, height }) {
    return (
      width < IMAGE_VALIDATION_CONSTANTS.MIN_IMAGE_WIDTH ||
      height < IMAGE_VALIDATION_CONSTANTS.MIN_IMAGE_HEIGHT
    );
  },

  /**
   * 建立 Notion external image block
   *
   * @param {Element} img - 圖片元素
   * @param {string} src - 原始 src
   * @param {string} cleanedImageUrl - 清理後的 URL
   * @returns {object} Notion image block 對象
   * @private
   */
  _buildExternalImageBlock(img, src, cleanedImageUrl) {
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
  },

  _evaluateImageUrlForCollection(img, src, featuredImage) {
    const cleanedImageUrl = this._normalizeCandidateImageUrl(img, src);

    if (featuredImage && cleanedImageUrl === featuredImage) {
      Logger.log('跳過重複的特色圖片', {
        action: 'processImageForCollection',
        url: sanitizeUrlForLogging(cleanedImageUrl),
      });
      return { status: 'duplicate_featured' };
    }

    if (!isValidCleanedImageUrl?.(cleanedImageUrl)) {
      Logger.log('無效或不相容的圖片 URL', {
        action: 'processImageForCollection',
        url: sanitizeUrlForLogging(cleanedImageUrl),
      });
      return { status: 'invalid_url' };
    }

    if (isTemporaryImageUrl?.(cleanedImageUrl)) {
      Logger.log('偵測到 temporary 圖片 URL，改以提示區塊取代', {
        action: 'processImageForCollection',
        url: sanitizeUrlForLogging(cleanedImageUrl),
      });
      return {
        status: 'temporary_replaced',
        image: buildTemporaryImagePlaceholderBlock(cleanedImageUrl, { alt: img.alt || '' }),
      };
    }

    return { status: 'accepted', cleanedImageUrl };
  },

  _hasKnownImageDimensions({ width, height }) {
    if (width <= 0) {
      return false;
    }
    return height > 0;
  },

  _evaluateImageSizeForCollection(dimensions) {
    if (!this._hasKnownImageDimensions(dimensions)) {
      Logger.log('圖片尺寸未知 (0)，跳過尺寸檢查', {
        action: 'processImageForCollection',
        width: dimensions.width,
        height: dimensions.height,
      });
      return { status: 'accepted' };
    }

    if (this._isImageBelowMinimumSize(dimensions)) {
      Logger.log('圖片尺寸太小', {
        action: 'processImageForCollection',
        width: dimensions.width,
        height: dimensions.height,
        source: dimensions.source,
      });
      return { status: 'filtered_by_size' };
    }

    return { status: 'accepted' };
  },

  _evaluateImageForCollection(img, index, featuredImage) {
    const src = extractImageSrc?.(img);
    if (!src) {
      Logger.log('圖片缺少 src 屬性', { action: 'processImageForCollection', index: index + 1 });
      return { status: 'missing_src' };
    }

    try {
      const urlOutcome = this._evaluateImageUrlForCollection(img, src, featuredImage);
      if (urlOutcome.status !== 'accepted') {
        return urlOutcome;
      }

      const dimensions = this._getImageDimensions(img);
      const sizeOutcome = this._evaluateImageSizeForCollection(dimensions);
      if (sizeOutcome.status !== 'accepted') {
        return sizeOutcome;
      }

      return {
        status: 'accepted',
        image: this._buildExternalImageBlock(img, src, urlOutcome.cleanedImageUrl),
      };
    } catch (error) {
      Logger.warn('處理圖片失敗', {
        action: 'processImageForCollection',
        src: sanitizeUrlForLogging(src),
        error: error.message,
      });
      return { status: 'error' };
    }
  },

  _normalizeImageProcessOutcome(result) {
    if (!result) {
      return null;
    }

    if (typeof result === 'object' && typeof result.status === 'string') {
      return result;
    }

    if (result.image?.external?.url) {
      return { status: 'accepted', image: result };
    }

    return null;
  },

  _createImageProcessingStats() {
    return {
      urlValidCount: 0,
      filteredBySize: 0,
    };
  },

  /**
   * 建立圖片處理 Shared Context 對象，收斂引數數量
   *
   * @param {Array} additionalImages - 補充圖片區塊列表
   * @param {string|null} featuredImage - 特色圖片 URL
   * @returns {object} Shared Context 對象
   * @private
   */
  _createImageProcessingContext(additionalImages, featuredImage) {
    const stats = this._createImageProcessingStats();
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

    return {
      additionalImages,
      processedUrls,
      stats,
    };
  },

  /**
   * 判斷是否為有效的圖片 URL 狀態
   *
   * @param {object} outcome - 評估結果
   * @returns {boolean}
   * @private
   */
  _shouldCountOutcomeAsUrlValid(outcome) {
    return (
      outcome.status === 'accepted' ||
      outcome.status === 'filtered_by_size' ||
      outcome.status === 'temporary_replaced'
    );
  },

  /**
   * 處理並記錄 temporary URL 降級區塊的 outcome
   *
   * @param {object} outcome - 評估結果
   * @param {object} context - 共享上下文
   * @param {string} logAction - log action metadata
   * @private
   */
  _recordTemporaryImageOutcome(outcome, context, logAction) {
    const originalSrc = outcome.image?._meta?.originalSrc;
    if (originalSrc && context.processedUrls.has(originalSrc)) {
      Logger.log('跳過重複的 temporary 圖片 URL', {
        action: logAction,
        url: sanitizeUrlForLogging(originalSrc),
      });
      return;
    }
    if (originalSrc) {
      context.processedUrls.add(originalSrc);
    }
    context.additionalImages.push(outcome.image);
  },

  /**
   * 處理並記錄正常圖片區塊的 outcome
   *
   * @param {object} outcome - 評估結果
   * @param {object} context - 共享上下文
   * @param {string} logAction - log action metadata
   * @private
   */
  _recordAcceptedImageOutcome(outcome, context, logAction) {
    const result = outcome.image;
    const url = result.image?.external?.url;
    if (url && !context.processedUrls.has(url)) {
      context.processedUrls.add(url);
      context.additionalImages.push(result);
    } else if (url) {
      Logger.log('跳過重複的圖片 URL', {
        action: logAction,
        url: sanitizeUrlForLogging(url),
      });
    }
  },

  /**
   * 記錄圖片處理結果
   *
   * @param {object} outcome - 圖片評估結果
   * @param {object} context - 共享上下文
   * @param {string} [logAction] - log action metadata
   * @private
   */
  _recordImageProcessingOutcome(outcome, context, logAction = 'collectAdditionalImages') {
    if (!outcome) {
      return;
    }

    if (this._shouldCountOutcomeAsUrlValid(outcome)) {
      context.stats.urlValidCount++;
    }

    if (outcome.status === 'filtered_by_size') {
      context.stats.filteredBySize++;
    }

    if (outcome.status === 'temporary_replaced') {
      this._recordTemporaryImageOutcome(outcome, context, logAction);
      return;
    }

    if (outcome.status === 'accepted') {
      this._recordAcceptedImageOutcome(outcome, context, logAction);
    }
  },

  /**
   * 建立 collectAdditionalImages metrics 初始值
   *
   * @returns {object} 初始 metrics
   * @private
   */
  _createImageCollectionMetrics() {
    return {
      candidateCount: 0,
      urlValidCount: 0,
      unknownSizeCount: 0,
      sizeResolveAttempted: 0,
      sizeResolveSuccess: 0,
      filteredBySize: 0,
      finalCount: 0,
      hasCoverImage: false,
      durationMs: 0,
    };
  },

  /**
   * 統一 final result assembly 與 durationMs 寫入
   *
   * @param {Array} images - 收集到的圖片
   * @param {string|null} coverImage - 封面圖片 URL
   * @param {object} metrics - 收集指標
   * @param {number} startTime - 開始時間 (performance.now())
   * @returns {object} 結構化結果
   * @private
   */
  _buildAdditionalImagesResult(images, coverImage, metrics, startTime) {
    metrics.finalCount = images.length;
    metrics.durationMs = Math.round(performance.now() - startTime);
    return {
      images,
      coverImage,
      metrics,
    };
  },

  /**
   * 封裝 main content sufficient threshold 判斷
   *
   * @param {number} mainCount - 主內容圖片數量
   * @returns {boolean} 是否應跳過額外圖片收集
   * @private
   */
  _shouldSkipAdditionalImageCollection(mainCount) {
    return mainCount >= IMAGE_LIMITS.MAIN_CONTENT_SUFFICIENT_THRESHOLD;
  },

  /**
   * 封裝 content -> article -> expansion -> Next.js pipeline
   *
   * @param {Element} contentElement - 主要內容元素
   * @param {object} options - 配置選項
   * @returns {Element[]} 候選圖片元素數組
   * @private
   */
  _collectCandidateImages(contentElement, options) {
    // 策略 1: 從指定的內容元素收集
    const imageElements = this._collectFromContent(contentElement);

    // 策略 2: 如果內容元素圖片少，從整個頁面的文章區域收集
    if (imageElements.length < IMAGE_LIMITS.MIN_IMAGES_FOR_ARTICLE_SEARCH) {
      this._collectFromArticle(imageElements);
    }

    // 策略 3: 如果仍然沒有圖片（< 1張），謹慎地擴展搜尋
    if (imageElements.length === 0) {
      this._collectFromExpansion(imageElements);
    }

    // 策略 4: 嘗試從 Next.js Data 提取 (針對 HK01 等 CSR/SSR 網站)
    this._collectFromNextJsData(imageElements, options.nextJsBlocks);

    return imageElements;
  },

  /**
   * 封裝 image-only URL set 與 gallery dedupe merge
   *
   * @param {Array} additionalImages - 現有的補充圖片區塊列表
   * @param {Array} galleryImages - 收集到的畫廊圖片區塊列表
   * @private
   */
  _mergeGalleryImages(additionalImages, galleryImages) {
    if (galleryImages.length === 0) {
      return;
    }

    Logger.log('合併圖集圖片', { count: galleryImages.length });

    // 構建現有圖片 URL 的 Set 以優化查找
    // additionalImages 可能包含 temporary URL 降級產生的 paragraph block, 需先過濾
    const existingUrls = new Set();
    for (const block of additionalImages) {
      if (block.type === 'image') {
        existingUrls.add(block.image.external.url);
      }
    }

    galleryImages.forEach(img => {
      const url = img.image.external.url;
      if (!existingUrls.has(url)) {
        existingUrls.add(url);
        additionalImages.push(img);
      }
    });
  },

  /**
   * 封裝 gallery relaxed / standard strict limit
   *
   * @param {Array} additionalImages - 補充圖片區塊列表
   * @param {boolean} hasGalleryImages - 是否有圖集圖片
   * @private
   */
  _applyAdditionalImageLimit(additionalImages, hasGalleryImages) {
    const maxImages = hasGalleryImages
      ? IMAGE_LIMITS.MAX_GALLERY_IMAGES
      : IMAGE_LIMITS.MAX_ADDITIONAL_IMAGES;

    if (additionalImages.length > maxImages) {
      Logger.log('圖片數量超過上限，已截取', {
        action: 'collectAdditionalImages',
        original: additionalImages.length,
        limit: maxImages,
        mode: hasGalleryImages ? 'gallery (relaxed)' : 'standard (strict)',
      });
      additionalImages.length = maxImages; // 原地截取，效能最優
    }
  },

  /**
   * 收集頁面中的所有相關圖片
   *
   * @param {Element} contentElement - 主要內容元素
   * @param {object} [options] - 配置選項
   * @param {Array} [options.nextJsBlocks] - 預先提取的 Next.js 區塊 (避免重複解析)
   * @param {number} [options.mainContentImageCount] - 主要內容區域已找到的圖片數量
   * @returns {Promise<{images: Array<object>, coverImage: string|null, metrics: object}>} 包含圖片對象數組 (images)、封面圖片 URL (coverImage) 和收集指標 (metrics) 的對象
   */
  async collectAdditionalImages(contentElement, options = {}) {
    const startTime = performance.now();
    const metrics = this._createImageCollectionMetrics();
    const additionalImages = [];

    // 策略 0: 優先查找封面圖/特色圖片
    const featuredImage = this._collectFromFeatured();
    metrics.hasCoverImage = Boolean(featuredImage);

    // [New] 條件式收集檢查
    // 如果主內容圖片數量充足，則不收集額外圖片 (但保留封面圖)
    const mainCount = options.mainContentImageCount || 0;
    if (this._shouldSkipAdditionalImageCollection(mainCount)) {
      Logger.log('主內容圖片充足，跳過額外收集', {
        action: 'collectAdditionalImages',
        mainCount,
        threshold: IMAGE_LIMITS.MAIN_CONTENT_SUFFICIENT_THRESHOLD,
      });
      return this._buildAdditionalImagesResult([], featuredImage, metrics, startTime);
    }

    // 策略 1-4: 收集候選圖片元素
    const imageElements = this._collectCandidateImages(contentElement, options);

    // 記錄候選圖片總數
    metrics.candidateCount = imageElements.length;

    Logger.log('待處理圖片元素總數', {
      action: 'collectAdditionalImages',
      count: imageElements.length,
    });

    // [New] 前置批次解析尺寸未知的候選圖片
    const resolveResult = await this._resolveUnknownSizes(imageElements);
    metrics.unknownSizeCount = resolveResult.attempted;
    metrics.sizeResolveAttempted = resolveResult.attempted;
    metrics.sizeResolveSuccess = resolveResult.succeeded;

    // 批處理：將元素轉換為圖片對象
    const processStats =
      (await this._processImages(imageElements, featuredImage, additionalImages)) ??
      this._createImageProcessingStats();
    metrics.urlValidCount = processStats.urlValidCount;
    metrics.filteredBySize = processStats.filteredBySize;

    // 策略 5: 從圖集/畫廊收集 (Mingpao etc.) -> 返回圖片對象
    const galleryImages = this._collectFromGalleries(featuredImage);

    // 合併圖集圖片 (去重)
    this._mergeGalleryImages(additionalImages, galleryImages);

    Logger.log('已成功收集有效圖片', {
      action: 'collectAdditionalImages',
      count: additionalImages.length,
    });

    // 限制圖片數量（封面圖片不計入限制）
    this._applyAdditionalImageLimit(additionalImages, galleryImages.length > 0);

    // 返回結構化對象，包含封面圖片 URL 供 Notion cover 使用
    return this._buildAdditionalImagesResult(additionalImages, featuredImage, metrics, startTime);
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
    Logger.log('圖片收集策略：指定區域', { action: 'collectAdditionalImages' });
    for (const selector of IMAGE_SELECTORS) {
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
        if (allImages.length >= IMAGE_LIMITS.MAX_IMAGES_FROM_ARTICLE_SEARCH) {
          break;
        }
      }
    }
  },

  /**
   * 檢查圖片是否位於排除區塊內
   *
   * @param {Element} img - 圖片元素
   * @returns {boolean} 是否應排除
   * @private
   */
  _isImageExcludedFromExpansion(img) {
    for (const selector of EXCLUSION_SELECTORS) {
      const excludeElements = cachedQuery(selector, document, { all: true });
      for (const excludeEl of excludeElements) {
        if (excludeEl.contains(img)) {
          return true;
        }
      }
    }
    return false;
  },

  _collectFromExpansion(allImages) {
    Logger.log('圖片收集策略：選擇性擴展', { action: 'collectAdditionalImages' });
    Logger.log('找到的圖片極少，嘗試選擇性擴展搜尋', { action: 'collectAdditionalImages' });

    const imgElements = cachedQuery('img', document, { all: true });
    const docImages = Array.from(imgElements);

    let addedFromExpansion = 0;
    for (const img of docImages) {
      if (addedFromExpansion >= IMAGE_LIMITS.MAX_IMAGES_FROM_EXPANSION) {
        break;
      }
      if (allImages.includes(img)) {
        continue;
      }
      if (this._isImageExcludedFromExpansion(img)) {
        continue;
      }
      allImages.push(img);
      addedFromExpansion++;
    }
  },

  /**
   * 提取 Next.js block 內的圖片 URL
   *
   * @param {object} block - Notion block 對象
   * @returns {string|null} 圖片 URL 或 null
   * @private
   */
  _extractNextJsImageUrl(block) {
    if (block.type !== 'image') {
      return null;
    }
    return block.image?.external?.url || null;
  },

  /**
   * 建立 fake img 元素以供後續 pipeline 使用
   *
   * @param {object} block - Notion block 對象
   * @param {string} url - 圖片 URL
   * @returns {Element} fake img 元素
   * @private
   */
  _createNextJsImageElement(block, url) {
    const fakeImg = document.createElement('img');
    fakeImg.src = url;
    fakeImg.alt = block.image?.caption?.[0]?.text?.content || '';
    fakeImg.dataset.source = 'nextjs-data';
    return fakeImg;
  },

  _resolveNextJsImageBlocks(preExtractedBlocks) {
    if (preExtractedBlocks) {
      Logger.log('使用預提取的 Next.js 區塊進行圖片收集', {
        count: preExtractedBlocks.length,
      });
      return preExtractedBlocks;
    }

    if (!NextJsExtractor.detect(document)) {
      return null;
    }

    const result = NextJsExtractor.extract(document);
    if (!result?.blocks) {
      Logger.log('Next.js Data 提取結果為空', { action: 'collectAdditionalImages' });
      return null;
    }

    return result.blocks;
  },

  _collectExistingImageUrls(allImages) {
    const seenUrls = new Set();
    for (const img of allImages) {
      if (img.src) {
        seenUrls.add(img.src);
      }
    }
    return seenUrls;
  },

  _shouldAddNextJsImageUrl(url, seenUrls) {
    if (!url) {
      return false;
    }
    if (seenUrls.has(url)) {
      return false;
    }
    return Boolean(isValidImageUrl?.(url));
  },

  _appendNextJsImageBlocks(allImages, blocks, seenUrls) {
    let addedCount = 0;

    for (const block of blocks) {
      const url = this._extractNextJsImageUrl(block);
      if (!this._shouldAddNextJsImageUrl(url, seenUrls)) {
        continue;
      }

      const fakeImg = this._createNextJsImageElement(block, url);
      allImages.push(fakeImg);
      seenUrls.add(url);
      addedCount++;
    }

    return addedCount;
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

    const blocks = this._resolveNextJsImageBlocks(preExtractedBlocks);
    if (!Array.isArray(blocks)) {
      return;
    }

    const seenUrls = this._collectExistingImageUrls(allImages);
    const addedCount = this._appendNextJsImageBlocks(allImages, blocks, seenUrls);

    Logger.log('從 Next.js Data 添加了新圖片', { count: addedCount });
  },

  /**
   * 順序處理圖片列表
   *
   * @param {Element[]} images - 圖片元素數組
   * @param {string|null} featuredImage - 特色圖片 URL
   * @param {Array<object>} additionalImages - 用於存儲結果的數組
   * @param {Set<string>} processedUrls - 已處理的 URL 集合 (Context)
   * @returns {{urlValidCount: number, filteredBySize: number}} 圖片處理統計
   */
  processImagesSequentially(images, featuredImage, additionalImages, processedUrls = new Set()) {
    // 為了相容 public API，建立一個適配的 context 對象
    const context = {
      additionalImages,
      processedUrls,
      stats: ImageCollector._createImageProcessingStats(),
    };

    if (featuredImage && !context.processedUrls.has(featuredImage)) {
      context.processedUrls.add(featuredImage);
    }

    images.forEach((img, index) => {
      const outcome = ImageCollector._normalizeImageProcessOutcome(
        ImageCollector.processImageForCollection(img, index, featuredImage, { detailed: true })
      );
      ImageCollector._recordImageProcessingOutcome(outcome, context, 'processImagesSequentially');
    });

    return context.stats;
  },

  /**
   * 解析單張圖片的原始尺寸
   *
   * @param {string} url - 圖片 URL
   * @param {number} timeoutMs - 超時毫秒數
   * @returns {Promise<{width: number, height: number}>} 解析出的尺寸
   * @private
   */
  _resolveImageSize(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      let settled = false;

      const cleanup = () => {
        clearTimeout(timeoutId);
        img.removeEventListener('load', handleLoad);
        img.removeEventListener('error', handleError);
      };

      const settle = callback => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        callback();
      };

      const handleLoad = () =>
        settle(() => resolve({ width: img.naturalWidth, height: img.naturalHeight }));

      const handleError = () => settle(() => reject(new Error('load failed')));

      const timeoutId = setTimeout(() => settle(() => reject(new Error('timeout'))), timeoutMs);

      img.addEventListener('load', handleLoad);
      img.addEventListener('error', handleError);
      img.src = url;
    });
  },

  /**
   * 前置批次解析尺寸未知的候選圖片
   * 成功解析的尺寸會寫入 img.dataset.resolvedWidth / resolvedHeight
   *
   * @param {Element[]} imageElements - 候選圖片元素列表
   * @returns {Promise<{attempted: number, succeeded: number}>} 解析統計
   * @private
   */
  /**
   * 檢查圖片是否有已知的寬高尺寸資訊
   *
   * @param {Element} img - 圖片元素
   * @returns {boolean} 是否為已知尺寸
   * @private
   */
  _hasKnownImageSize(img) {
    const imgW =
      img.naturalWidth ||
      Number.parseInt(img.getAttribute('width'), 10) ||
      Number.parseInt(img.dataset.width, 10) ||
      0;
    const imgH =
      img.naturalHeight ||
      Number.parseInt(img.getAttribute('height'), 10) ||
      Number.parseInt(img.dataset.height, 10) ||
      0;
    return imgW > 0 && imgH > 0;
  },

  /**
   * 獲取賸餘的尺寸解析時間預算 (ms)
   *
   * @param {number} budgetStart - 開始解析時間點
   * @returns {number} 賸餘毫秒數
   * @private
   */
  _getRemainingSizeResolveBudget(budgetStart) {
    return IMAGE_SIZE_RESOLVE.TOTAL_BUDGET_MS - (performance.now() - budgetStart);
  },

  /**
   * 將解析出的尺寸寫入 img 的 dataset
   *
   * @param {Element} img - 圖片元素
   * @param {{width: number, height: number}} size - 解析出的尺寸
   * @returns {boolean} 是否成功寫入
   * @private
   */
  _writeResolvedImageSize(img, size) {
    if (size.width > 0 && size.height > 0) {
      img.dataset.resolvedWidth = String(size.width);
      img.dataset.resolvedHeight = String(size.height);
      return true;
    }
    return false;
  },

  /**
   * 在時間預算內解析單張圖片的尺寸
   *
   * @param {Element} img - 圖片元素
   * @param {number} budgetStart - 解析開始時間點
   * @returns {Promise<{status: string}>} 解析狀態結果
   * @private
   */
  async _resolveImageSizeWithinBudget(img, budgetStart) {
    const remaining = this._getRemainingSizeResolveBudget(budgetStart);
    const perImageTimeout = IMAGE_SIZE_RESOLVE.PER_IMAGE_TIMEOUT_MS;
    const effectiveTimeout = Math.min(perImageTimeout, Math.max(remaining, 0));

    if (effectiveTimeout <= 0) {
      return { status: 'budget_exhausted' };
    }

    const src = extractImageSrc?.(img) || img.src;
    if (!src) {
      return { status: 'missing_src' };
    }

    try {
      const size = await this._resolveImageSize(src, effectiveTimeout);
      if (this._writeResolvedImageSize(img, size)) {
        return { status: 'resolved' };
      }
      return { status: 'failed' };
    } catch {
      Logger.log('尺寸解析失敗', {
        action: '_resolveUnknownSizes',
        src: sanitizeUrlForLogging(src),
      });
      return { status: 'failed' };
    }
  },

  /**
   * 前置批次解析尺寸未知的候選圖片
   * 成功解析的尺寸會寫入 img.dataset.resolvedWidth / resolvedHeight
   *
   * @param {Element[]} imageElements - 候選圖片元素列表
   * @returns {Promise<{attempted: number, succeeded: number}>} 解析統計
   * @private
   */
  async _resolveUnknownSizes(imageElements) {
    const unknowns = imageElements.filter(img => !this._hasKnownImageSize(img));

    if (unknowns.length === 0) {
      return { attempted: 0, succeeded: 0 };
    }

    Logger.log('開始批次解析尺寸未知圖片', {
      action: '_resolveUnknownSizes',
      count: unknowns.length,
    });

    const budgetStart = performance.now();
    let succeeded = 0;

    for (const img of unknowns) {
      const outcome = await this._resolveImageSizeWithinBudget(img, budgetStart);
      if (outcome.status === 'budget_exhausted') {
        break;
      }
      if (outcome.status === 'resolved') {
        succeeded++;
      }
    }

    Logger.log('批次尺寸解析完成', {
      action: '_resolveUnknownSizes',
      attempted: unknowns.length,
      succeeded,
      durationMs: Math.round(performance.now() - budgetStart),
    });

    return { attempted: unknowns.length, succeeded };
  },

  /**
   * 將圖片列表包裝為帶索引的項目對象
   *
   * @param {Element[]} allImages - 圖片元素列表
   * @returns {{img: Element, index: number}[]}
   * @private
   */
  _createIndexedImageItems(allImages) {
    return allImages.map((img, index) => ({ img, index }));
  },

  /**
   * 批次處理中的單張圖片處理包裝
   *
   * @param {{img: Element, index: number}} item - 帶索引項目
   * @param {string|null} featuredImage - 特色圖片 URL
   * @returns {object} 處理結果 outcome
   * @private
   */
  _processIndexedImageItem({ img, index }, featuredImage) {
    return ImageCollector.processImageForCollection(img, index, featuredImage, {
      detailed: true,
    });
  },

  /**
   * 批次處理完成後的結果收尾
   *
   * @param {Array} results - 批次處理結果列表
   * @param {object} context - 共享上下文
   * @private
   */
  _handleImageProcessingResults(results, context) {
    if (!results) {
      return;
    }
    results.forEach(result => {
      const outcome = ImageCollector._normalizeImageProcessOutcome(result);
      ImageCollector._recordImageProcessingOutcome(outcome, context);
    });
  },

  /**
   * 嘗試使用帶重試的批次處理
   *
   * @param {Array} indexedImages - 帶索引項目
   * @param {object} context - 共享上下文
   * @param {string|null} featuredImage - 特色圖片 URL
   * @returns {Promise<boolean>} 是否成功執行
   * @private
   */
  async _processImagesWithRetry(indexedImages, context, featuredImage) {
    const processFn = item => this._processIndexedImageItem(item, featuredImage);

    try {
      const { results } = await batchProcessWithRetry(indexedImages, processFn, {
        maxAttempts: 3,
        isResultSuccessful: result => {
          const outcome = ImageCollector._normalizeImageProcessOutcome(result);
          return outcome?.status === 'accepted' && Boolean(outcome.image?.image?.external?.url);
        },
      });
      this._handleImageProcessingResults(results, context);
      return true;
    } catch (error) {
      Logger.warn('批次處理失敗 (Retry)，回退到順序處理', { error: error.message });
      return false;
    }
  },

  /**
   * 嘗試使用簡單的批次處理
   *
   * @param {Array} indexedImages - 帶索引項目
   * @param {object} context - 共享上下文
   * @param {string|null} featuredImage - 特色圖片 URL
   * @returns {Promise<boolean>} 是否成功執行
   * @private
   */
  async _processImagesWithSimpleBatch(indexedImages, context, featuredImage) {
    const processFn = item => this._processIndexedImageItem(item, featuredImage);

    try {
      const results = await batchProcess(indexedImages, processFn);
      this._handleImageProcessingResults(results, context);
      return true;
    } catch (error) {
      Logger.warn('批次處理失敗，回退到順序處理', { error: error.message });
      return false;
    }
  },

  _getImageBatchProcessingRunner(allImages) {
    if (batchProcess === undefined) {
      return null;
    }
    if (allImages.length <= IMAGE_LIMITS.BATCH_PROCESS_THRESHOLD) {
      return null;
    }
    if (typeof batchProcessWithRetry === 'function') {
      return this._processImagesWithRetry.bind(this);
    }
    return this._processImagesWithSimpleBatch.bind(this);
  },

  _processImagesSequentialFallback(allImages, featuredImage, additionalImages, context) {
    return ImageCollector.processImagesSequentially(
      allImages,
      featuredImage,
      additionalImages,
      context.processedUrls
    );
  },

  async _processImages(allImages, featuredImage, additionalImages) {
    const context = this._createImageProcessingContext(additionalImages, featuredImage);
    const batchRunner = this._getImageBatchProcessingRunner(allImages);

    if (!batchRunner) {
      return this._processImagesSequentialFallback(
        allImages,
        featuredImage,
        additionalImages,
        context
      );
    }

    Logger.log('對圖片使用批次處理', {
      action: 'collectAdditionalImages',
      count: allImages.length,
    });

    const indexedImages = this._createIndexedImageItems(allImages);
    const success = await batchRunner(indexedImages, context, featuredImage);
    if (success) {
      return context.stats;
    }

    return this._processImagesSequentialFallback(
      allImages,
      featuredImage,
      additionalImages,
      context
    );
  },
};

export { ImageCollector };
