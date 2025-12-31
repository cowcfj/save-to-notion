/**
 * ImageService - 圖片 URL 驗證緩存服務
 *
 * 職責：管理圖片 URL 驗證結果的緩存（LRU + TTL）
 * 注意：驗證邏輯委派給 imageUtils.js，此服務僅負責緩存管理
 *
 * @module services/ImageService
 */

// 導入統一配置
import {
  IMAGE_VALIDATION_CONFIG,
  IMAGE_EXTENSIONS,
  IMAGE_PATH_PATTERNS,
} from '../../config/index.js';

// 從配置獲取默認值
const DEFAULT_CACHE_SIZE = IMAGE_VALIDATION_CONFIG.MAX_CACHE_SIZE;
const DEFAULT_CACHE_TTL = IMAGE_VALIDATION_CONFIG.CACHE_TTL;
const DEFAULT_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 分鐘

/**
 * 圖片 URL 驗證緩存類
 * 實現 LRU 緩存策略與 TTL 過期機制
 */
class ImageUrlValidationCache {
  /**
   * @param {number} maxSize - 緩存最大條目數（預設來自配置）
   * @param {number} ttl - 條目存活時間（毫秒，預設來自配置）
   */
  constructor(maxSize = DEFAULT_CACHE_SIZE, ttl = DEFAULT_CACHE_TTL) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.accessOrder = new Map(); // 用於 LRU 追蹤
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }

  /**
   * 獲取緩存的驗證結果
   * @param {string} url - 要檢查的 URL
   * @returns {boolean|null} 驗證結果或 null（未緩存）
   */
  get(url) {
    const entry = this.cache.get(url);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // 檢查是否過期
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(url);
      this.accessOrder.delete(url);
      this.stats.evictions++;
      this.stats.misses++;
      return null;
    }

    // 更新訪問順序（LRU）
    this.accessOrder.delete(url);
    this.accessOrder.set(url, Date.now());

    this.stats.hits++;
    return entry.isValid;
  }

  /**
   * 設置緩存的驗證結果
   * @param {string} url - 要緩存的 URL
   * @param {boolean} isValid - 驗證結果
   */
  set(url, isValid) {
    // 如果已存在，先刪除舊條目
    if (this.cache.has(url)) {
      this.accessOrder.delete(url);
    }

    // 檢查緩存大小限制
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    // 添加新條目
    this.cache.set(url, {
      isValid,
      timestamp: Date.now(),
    });
    this.accessOrder.set(url, Date.now());
  }

  /**
   * 移除最少使用的條目（LRU）
   */
  evictLRU() {
    const lruKey = this.accessOrder.keys().next().value;
    if (lruKey) {
      this.cache.delete(lruKey);
      this.accessOrder.delete(lruKey);
      this.stats.evictions++;
    }
  }

  /**
   * 清理過期的條目
   */
  cleanupExpired() {
    const now = Date.now();
    for (const url of this.accessOrder.keys()) {
      const entry = this.cache.get(url);

      // 處理數據不一致情況
      if (!entry) {
        this.accessOrder.delete(url);
        continue;
      }

      // 使用創建時間檢查 TTL (Review Fix)
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(url);
        this.accessOrder.delete(url);
        this.stats.evictions++;
      } else {
        // 保持 Review 建議的優化：遇到未過期的則提前停止
        // 注意：這假設 LRU 順序與創建時間大致相關，雖然不嚴格準確，
        // 但作為後台清理任務的可接受啟發式優化。
        break;
      }
    }
  }

  /**
   * 獲取緩存統計信息
   * @returns {{hits: number, misses: number, evictions: number, hitRate: string, size: number, maxSize: number}}
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
    return {
      ...this.stats,
      hitRate: `${hitRate.toFixed(2)}%`,
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }

  /**
   * 清空緩存
   */
  clear() {
    this.cache.clear();
    this.accessOrder.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
  }
}

/**
 * 圖片服務類
 * 封裝緩存管理，驗證邏輯委派給 imageUtils
 */
class ImageService {
  /**
   * @param {Object} options - 配置選項
   * @param {number} options.maxCacheSize - 緩存最大條目數
   * @param {number} options.cacheTtl - 緩存 TTL（毫秒）
   * @param {Function} options.validator - 驗證函數（預設使用 ImageUtils）
   * @param {Object} options.logger - 日誌對象（預設使用 console）
   */
  constructor(options = {}) {
    this.cache = new ImageUrlValidationCache(
      options.maxCacheSize ?? DEFAULT_CACHE_SIZE,
      options.cacheTtl ?? DEFAULT_CACHE_TTL
    );
    this.validator = options.validator ?? null;
    this.logger = options.logger ?? console;
    this.cleanupIntervalId = null;
  }

  /**
   * 設置外部驗證器
   * @param {Function} validator - 驗證函數 (url) => boolean
   */
  setValidator(validator) {
    this.validator = validator;
  }

  /**
   * 本地輕量級驗證器（回退方案）
   * @param {string} url - 要驗證的 URL
   * @returns {boolean} 是否為有效的圖片 URL
   * @private
   */
  static _validateLocally(url) {
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      return false;
    }

    try {
      const urlObj = new URL(url);

      // 驗證協議是 http 或 https
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        return false;
      }

      // 檢查常見圖片擴展名
      const pathname = urlObj.pathname.toLowerCase();
      const hasImageExtension = IMAGE_EXTENSIONS.test(pathname);

      // 檢查路徑是否包含圖片關鍵詞
      const hasImageKeyword = IMAGE_PATH_PATTERNS.some(pattern => pattern.test(pathname));

      // 至少滿足一個條件
      return hasImageExtension || hasImageKeyword;
    } catch (_error) {
      return false;
    }
  }

  /**
   * 驗證圖片 URL 是否有效（帶緩存）
   * @param {string} url - 要驗證的圖片 URL
   * @returns {boolean} 是否為有效的圖片 URL
   */
  isValidImageUrl(url) {
    // 輸入驗證
    if (!url || typeof url !== 'string') {
      return false;
    }

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      return false;
    }

    // 檢查緩存
    const cachedResult = this.cache.get(trimmedUrl);
    if (cachedResult !== null) {
      return cachedResult;
    }

    try {
      // 優先使用外部驗證器
      let isValid = false;

      if (this.validator) {
        isValid = this.validator(trimmedUrl);
      } else {
        // 回退到本地驗證器
        this.logger.warn?.('⚠️ [ImageService] 外部驗證器不可用，使用本地回退驗證器');
        isValid = ImageService._validateLocally(trimmedUrl);
      }

      // 緩存結果
      this.cache.set(trimmedUrl, isValid);
      return isValid;
    } catch (error) {
      this.logger.error?.('❌ [ImageService] 驗證過程中發生錯誤:', error);
      this.cache.set(trimmedUrl, false);
      return false;
    }
  }

  /**
   * 獲取緩存統計信息
   * @returns {Object} 統計信息
   */
  getStats() {
    return this.cache.getStats();
  }

  /**
   * 清空緩存
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * 啟動定期清理任務
   * @param {number} intervalMs - 清理間隔（毫秒，預設 5 分鐘）
   */
  startCleanupTask(intervalMs = DEFAULT_CLEANUP_INTERVAL) {
    if (this.cleanupIntervalId) {
      return; // 已啟動
    }

    this.cleanupIntervalId = setInterval(() => {
      this.cache.cleanupExpired();
    }, intervalMs);
  }

  /**
   * 停止定期清理任務
   */
  stopCleanupTask() {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }
}

// 導出
export { ImageService, ImageUrlValidationCache };
