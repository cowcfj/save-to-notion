/**
 * 性能優化器
 * 提供 DOM 查詢緩存和批處理隊列功能
 */
import { PERFORMANCE_OPTIMIZER } from '../config/constants.js';
import {
  ARTICLE_SELECTORS,
  CMS_CONTENT_SELECTORS, // Added missing import
  PRELOADER_SELECTORS,
} from '../config/selectors.js';
import Logger from '../utils/Logger.js';
import { ErrorHandler } from '../utils/ErrorHandler.js'; // Fixed import
import { validateSafeDomElement, validatePreloaderCache } from '../utils/securityUtils.js';

/**
 * 性能優化器類
 * 提供 DOM 查詢緩存和批處理隊列功能
 *
 * 架構設計說明：
 *
 * 1. 靜態輔助方法設計理念
 *    - 類中包含若干靜態無狀態方法（如 _performQuery、_generateCacheKey 等）
 *    - 這些方法保留在類內部是為了維護語義內聚性和代碼的可維護性
 *    - 它們是本類核心功能的輔助邏輯，與類的職責緊密相關
 *    - 遵循 KISS 原則：避免不必要的抽象和模組拆分
 *
 * 2. 何時應該提取靜態方法？
 *    - 當其他模組需要重用這些邏輯時
 *    - 當函數變得足夠通用，不再與本類職責緊密相關時
 *    - 當提取能明顯降低整體複雜度時
 *
 * 3. 參考原則
 *    - 優先考慮語義內聚性而非技術內聚性
 *    - 參考項目中的 imageUtils.js、pageComplexityDetector.js 等真正通用的工具模組
 *    - 只有當函數被多個不相關的模組使用時，才考慮提取
 *
 * @class
 */
class PerformanceOptimizer {
  constructor(options = {}) {
    this.options = {
      enableCache: true,
      enableBatching: true,
      cacheMaxSize: PERFORMANCE_OPTIMIZER.DEFAULT_CACHE_MAX_SIZE,
      batchDelay: 16, // 一個動畫幀的時間
      cacheTTL: PERFORMANCE_OPTIMIZER.CACHE_TTL_MS,
      prewarmSelectors: [
        // 圖片預熱選擇器
        'img[src]',
        'img[data-src]',
        // 文章區域選擇器（來自 selectors.js）
        ...ARTICLE_SELECTORS,
      ],
      ...options,
    };

    // DOM 查詢緩存
    this.queryCache = new Map();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      prewarms: 0, // 預熱計數
    };

    // 預熱相關屬性
    this.prewarmedSelectors = new Set();

    // 批處理隊列
    this.batchQueue = [];
    this.batchTimer = null;
    this.batchStats = {
      totalBatches: 0,
      totalItems: 0,
      averageBatchSize: 0,
    };

    // 性能指標
    this.metrics = {
      domQueries: 0,
      cacheHits: 0,
      batchOperations: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
    };
  }

  /**
   * 遷移單個快取項目
   *
   * @private
   * @param {Element} element - DOM 元素
   * @param {string} selector - CSS 選擇器
   * @param {number} timestamp - 時間戳
   * @returns {boolean} 是否遷移成功
   */
  _migrateCacheItem(element, selector, timestamp) {
    // SECURITY: 使用共享的安全驗證函數進行檢查
    // 包含：類型檢查、防篡改 (ownerDocument)、防過期 (isConnected)、選擇器匹配
    if (!validateSafeDomElement(element, document, selector)) {
      Logger.warn(`拒絕接管不安全的 preloader 快取: ${selector}`);
      return false;
    }

    // 使用 single: true 生成緩存鍵，與單一元素查詢邏輯保持一致
    const cacheKey = PerformanceOptimizer._generateCacheKey(selector, document, { single: true });

    this.queryCache.set(cacheKey, {
      result: element,
      timestamp,
      selector,
      ttl: this.options.cacheTTL,
    });

    Logger.debug(`已接管 preloader ${selector} 快取`);
    return true;
  }

  /**
   * 緩存的 DOM 查詢
   * @param {string} selector - CSS 選擇器
   * @param {Element} context - 查詢上下文，默認為 document
   * @param {Object} options - 查詢選項
   * @returns {NodeList|Element|null} 查詢結果
   */
  cachedQuery(selector, context = document, options = {}) {
    const startTime = performance.now();

    if (!this.options.enableCache) {
      return PerformanceOptimizer._performQuery(selector, context, options);
    }

    // 生成緩存鍵
    const cacheKey = PerformanceOptimizer._generateCacheKey(selector, context, options);

    // 檢查緩存
    if (this.queryCache.has(cacheKey)) {
      this.cacheStats.hits++;
      this.metrics.cacheHits++;

      const cached = this.queryCache.get(cacheKey);

      // 檢查緩存是否過期
      const isExpired = Date.now() - cached.timestamp > this.options.cacheTTL;
      const isValid = !isExpired && PerformanceOptimizer._validateCachedElements(cached.result);

      if (isValid) {
        this._recordQueryTime(startTime);
        return cached.result;
      }
      // 緩存過期或失效，移除
      Logger.debug(`Cache miss: expired=${isExpired}, valid=${isValid}`);
      this.queryCache.delete(cacheKey);
    } else {
      Logger.debug(`Cache miss: key not found ${cacheKey}`);
    }

    // 執行查詢
    this.cacheStats.misses++;
    this.metrics.domQueries++;

    const result = PerformanceOptimizer._performQuery(selector, context, options);

    // 緩存結果
    if (result) {
      // 維護緩存大小限制
      this._maintainCacheSizeLimit(cacheKey);

      this.queryCache.set(cacheKey, {
        result,
        timestamp: Date.now(),
        selector,
        ttl: this.options.cacheTTL,
      });
    }

    this._recordQueryTime(startTime);
    return result;
  }

  /**
   * 批處理圖片處理
   * @param {Array} images - 圖片元素數組
   * @param {Function} processor - 處理函數
   * @param {Object} options - 批處理選項
   * @returns {Promise<Array>} 處理結果
   */
  batchProcessImages(images, processor, options = {}) {
    if (!this.options.enableBatching) {
      return Promise.resolve(images.map(processor));
    }

    return new Promise((resolve, reject) => {
      const batchItem = {
        type: 'images',
        images,
        processor,
        resolve,
        reject,
        options,
        timestamp: Date.now(),
      };

      this.batchQueue.push(batchItem);
      this._scheduleBatchProcessing();
    });
  }

  /**
   * 批處理 DOM 操作
   * @param {Array} operations - 操作數組
   * @param {Object} options - 批處理選項
   * @returns {Promise<Array>} 操作結果
   */
  batchDomOperations(operations, options = {}) {
    if (!this.options.enableBatching) {
      return Promise.resolve(operations.map(op => op()));
    }

    return new Promise((resolve, reject) => {
      const batchItem = {
        operations,
        resolve,
        reject,
        options,
        timestamp: Date.now(),
        type: 'dom',
      };

      this.batchQueue.push(batchItem);
      this._scheduleBatchProcessing();
    });
  }

  /**
   * 預加載圖片
   * @param {Array} urls - 圖片 URL 數組
   * @param {Object} options - 預加載選項
   * @returns {Promise<Array>} 預加載結果
   */
  preloadImages(urls, options = {}) {
    const { timeout = 5000, concurrent = 3 } = options;

    return this._processInBatches(urls, concurrent, url => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const timer = setTimeout(() => {
          reject(new Error(`Image preload timeout: ${url}`));
        }, timeout);

        img.onload = () => {
          clearTimeout(timer);
          resolve({ url, success: true, image: img });
        };

        img.onerror = () => {
          clearTimeout(timer);
          resolve({ url, success: false, error: 'Load failed' });
        };

        img.src = url;
      });
    });
  }

  /**
   * 清理緩存
   * @param {Object} options - 清理選項
   */
  clearCache(options = {}) {
    const { force = false, maxAge } = options;

    if (force) {
      Logger.info('Force clearing cache. Size before:', this.queryCache.size);
      this.queryCache.clear();
      // 重置統計數據
      this.cacheStats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        prewarms: 0,
      };
      Logger.info('Cache cleared. Size after:', this.queryCache.size);
      return;
    }

    // 委託給 clearExpiredCache 處理過期清理
    this.clearExpiredCache({ maxAge: maxAge || this.options.cacheTTL });
  }

  /**
   * 獲取性能統計
   * @returns {Object} 性能統計信息
   */
  getStats() {
    return {
      cache: {
        ...this.cacheStats,
        size: this.queryCache.size,
        hitRate: this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) || 0,
        prewarmCount: this.prewarmedSelectors.size,
      },
      batch: {
        ...this.batchStats,
      },
      queries: {
        total: this.metrics.domQueries,
        averageTime: this.metrics.averageQueryTime,
        totalTime: this.metrics.totalQueryTime,
      },
      metrics: {
        ...this.metrics,
      },
      memory: PerformanceOptimizer._getMemoryStats(),
    };
  }

  /**
   * 獲取性能統計（別名方法）
   * @returns {Object} 性能統計信息
   */
  getPerformanceStats() {
    return this.getStats();
  }

  /**
   * 重置統計信息
   */
  resetStats() {
    this.cacheStats = { hits: 0, misses: 0, evictions: 0 };
    this.batchStats = { totalBatches: 0, totalItems: 0, averageBatchSize: 0 };
    this.metrics = {
      domQueries: 0,
      cacheHits: 0,
      batchOperations: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
    };
  }

  /**
   * 執行實際的 DOM 查詢
   *
   * 設計說明：
   * - 這是一個無狀態的純函數，不依賴類的實例狀態
   * - 保留為靜態方法是為了保持與 PerformanceOptimizer 的語義內聚性
   * - 封裝了 DOM 查詢的錯誤處理和自動判斷邏輯
   * - 如果未來有其他模組需要此邏輯，可考慮提取到獨立的工具模組
   *
   * @private
   * @static
   * @param {string} selector - CSS 選擇器
   * @param {Element|Document} context - 查詢上下文
   * @param {Object} options - 查詢選項
   * @param {boolean} [options.single=false] - 是否只返回單個元素
   * @param {boolean} [options.all=false] - 是否強制返回所有元素
   * @returns {NodeList|Element|null} 查詢結果
   */
  static _performQuery(selector, context, options) {
    const { single = false, all = false } = options;

    try {
      if (single) {
        return context.querySelector(selector);
      } else if (all) {
        return context.querySelectorAll(selector);
      }
      // 自動判斷
      const result = context.querySelectorAll(selector);
      return result.length === 1 ? result[0] : result;
    } catch (error) {
      console.error('DOM Query Error:', error);
      if (typeof ErrorHandler !== 'undefined') {
        ErrorHandler.logError({
          type: 'dom_error',
          context: `DOM query: ${selector}`,
          originalError: error,
          timestamp: Date.now(),
        });
      }
      return single ? null : [];
    }
  }

  /**
   * 生成緩存鍵
   *
   * 設計說明：
   * - 這是一個無狀態的純函數，基於輸入參數生成唯一的緩存鍵
   * - 保留為靜態方法是為了確保緩存鍵生成邏輯的一致性
   * - 使用組合鍵（選擇器 + 上下文 + 選項）確保緩存的精確性
   * - 此邏輯專屬於 PerformanceOptimizer 的緩存策略，不適合獨立提取
   *
   * @private
   * @static
   * @param {string} selector - CSS 選擇器
   * @param {Element|Document} context - 查詢上下文
   * @param {Object} options - 查詢選項
   * @returns {string} 緩存鍵（格式：selector:contextId:optionsJson）
   */
  static _generateCacheKey(selector, context, options) {
    const contextId =
      context === document ? 'document' : context.id || context.tagName || 'element';
    const optionsStr = JSON.stringify(options);
    return `${selector}:${contextId}:${optionsStr}`;
  }

  /**
   * 驗證緩存的元素是否仍然有效
   *
   * 設計說明：
   * - 這是一個無狀態的純函數，檢查 DOM 元素是否仍存在於文檔中
   * - 保留為靜態方法是因為此邏輯是 PerformanceOptimizer 緩存機制的核心部分
   * - 處理單個元素和 NodeList 兩種情況，並兼容 JSDOM 測試環境
   * - 此驗證邏輯與緩存策略緊密相關，不建議獨立提取
   *
   * @private
   * @static
   * @param {Element|NodeList|Array} result - 要驗證的元素或元素列表
   * @returns {boolean} 元素是否仍然有效（存在於文檔中）
   */
  static _validateCachedElements(result) {
    if (!result) {
      return false;
    }

    try {
      if (result.nodeType) {
        // 單個元素
        return document.contains(result);
      } else if (result.length !== undefined) {
        // NodeList 或數組
        return Array.from(result).every(el => {
          // 確保 el 是有效的 Node 對象
          if (!el || !el.nodeType) {
            return false;
          }

          // Use isConnected if available (standard DOM)
          if (typeof el.isConnected === 'boolean') {
            return el.isConnected;
          }

          try {
            return document.contains(el);
          } catch {
            return false;
          }
        });
      }
    } catch (error) {
      // 在 JSDOM 環境或其他邊緣情況下，驗證可能失敗
      Logger.warn('元素驗證失敗:', error.message);
      return false;
    }

    return false;
  }

  /**
   * 預熱選擇器緩存
   * @param {Array} selectors - 要預熱的 CSS 選擇器數組
   * @param {Element} context - 查詢上下文，默認為 document
   * @returns {Promise<Array>} 預熱結果
   */
  preloadSelectors(selectors, context = document) {
    if (!this.options.enableCache || !selectors || !Array.isArray(selectors)) {
      return Promise.resolve([]);
    }

    Logger.info(`🔥 開始預熱 ${selectors.length} 個選擇器...`);

    // 使用批處理方式預熱選擇器
    const results = [];

    for (const selector of selectors) {
      if (this.prewarmedSelectors.has(selector)) {
        continue; // 已預熱過，跳過
      }

      try {
        // 執行查詢並將結果存入緩存
        const result = this.cachedQuery(selector, context);

        if (result) {
          results.push({
            selector,
            count: result.length || (result.nodeType ? 1 : 0),
            cached: true,
          });

          this.cacheStats.prewarms++;
          this.prewarmedSelectors.add(selector);

          Logger.info(`✓ 預熱成功: ${selector} (${results[results.length - 1].count} 個元素)`);
        }
      } catch (error) {
        Logger.warn(`⚠️ 預熱選擇器失敗: ${selector}`, error);

        if (typeof ErrorHandler !== 'undefined') {
          ErrorHandler.logError({
            type: 'preload_error',
            context: `preloading selector: ${selector}`,
            originalError: error,
            timestamp: Date.now(),
          });
        }

        results.push({
          selector,
          error: error.message,
          cached: false,
        });
      }
    }

    Logger.info(
      `🔥 預熱完成: ${results.filter(result => result.cached).length}/${selectors.length} 個選擇器已預熱`
    );
    // 保守策略：統一以 Promise.resolve 返回，呼叫者可以使用 await 一致處理
    return Promise.resolve(results);
  }

  /**
   * 智能預熱 - 基於當前頁面內容自動預熱相關選擇器
   * @param {Element} context - 查詢上下文，默認為 document
   * @returns {Promise<Array>} 預熱結果
   */
  async smartPrewarm(context = document) {
    const startTime = performance.now();

    // 基於當前頁面分析，動態生成預熱選擇器
    const dynamicSelectors = PerformanceOptimizer._analyzePageForPrewarming(context);

    // 合併配置中的預設選擇器和動態生成的選擇器
    const allSelectors = [...new Set([...this.options.prewarmSelectors, ...dynamicSelectors])];

    const results = await this.preloadSelectors(allSelectors, context);

    const duration = performance.now() - startTime;
    Logger.info(`🧠 智能預熱完成，耗時: ${duration.toFixed(2)}ms`);

    return results;
  }

  /**
   * 基於當前頁面內容分析，動態生成預熱選擇器
   *
   * 設計說明：
   * - 這是一個無狀態的分析函數，根據頁面結構智能生成選擇器列表
   * - 保留為靜態方法是因為此邏輯是智能預熱功能的核心算法
   * - 包含對常見 CMS 和網站結構的啟發式分析
   * - 此分析邏輯專屬於 PerformanceOptimizer 的預熱策略，不適合獨立提取
   *
   * @private
   * @static
   * @param {Element|Document} context - 要分析的上下文元素
   * @returns {Array<string>} 動態生成的選擇器數組
   */
  /**
   * 分析頁面內容以進行預熱 (實例方法，委託給靜態方法)
   * @param {Document} doc - 文檔對象
   * @returns {Array<string>} 建議預熱的選擇器
   */
  _analyzePageForPrewarming(doc) {
    return this.constructor._analyzePageForPrewarming(doc);
  }

  static _analyzePageForPrewarming(context) {
    const selectors = [];

    // 檢查頁面結構，生成可能的選擇器
    if (context.querySelector('article')) {
      selectors.push('article h1', 'article h2', 'article h3', 'article p', 'article img');
    }

    if (context.querySelector('[role="main"]')) {
      selectors.push('[role="main"] *');
    }

    // 檢查是否有常見的 CMS 類名（使用 CMS_CONTENT_SELECTORS 前 4 個核心選擇器）
    const cmsPatterns = CMS_CONTENT_SELECTORS.slice(0, 4);
    cmsPatterns.forEach(pattern => {
      if (context.querySelector(pattern)) {
        selectors.push(
          `${pattern} p`,
          `${pattern} img`,
          `${pattern} h1`,
          `${pattern} h2`,
          `${pattern} h3`
        );
      }
    });

    return selectors;
  }

  /**
   * 維護緩存大小限制，實現 LRU 策略
   * @private
   */
  _maintainCacheSizeLimit(newKey) {
    if (this.queryCache.size < this.options.cacheMaxSize) {
      return; // 尚未達到最大大小，無需清理
    }

    // 如果達到最大大小，移除最久未使用的項目
    const firstKey = this.queryCache.keys().next().value;
    if (firstKey && firstKey !== newKey) {
      this.queryCache.delete(firstKey);
      this.cacheStats.evictions++;
    }
  }

  /**
   * 清理過期的緩存項目
   * @param {Object} options - 清理選項
   * @returns {number} 清理的項目數量
   */
  clearExpiredCache(options = {}) {
    const { force = false, maxAge = this.options.cacheTTL } = options;
    let clearedCount = 0;

    // 如果強制清理，則清理所有緩存
    if (force) {
      clearedCount = this.queryCache.size;
      this.queryCache.clear();
      return clearedCount;
    }

    // 否則只清理過期的緩存
    const now = Date.now();
    for (const [key, cached] of this.queryCache.entries()) {
      if (now - cached.timestamp > maxAge) {
        this.queryCache.delete(key);
        clearedCount++;
      }
    }

    return clearedCount;
  }

  /**
   * 強制刷新特定選擇器的緩存
   * @param {string|Array} selectors - 要刷新的選擇器或選擇器數組
   * @param {Element} context - 查詢上下文
   * @param {Object} options - 查詢選項
   */
  refreshCache(selectors, context = document, options = {}) {
    const selectorList = Array.isArray(selectors) ? selectors : [selectors];

    for (const selector of selectorList) {
      const cacheKey = PerformanceOptimizer._generateCacheKey(selector, context, options);
      if (this.queryCache.has(cacheKey)) {
        // 執行新的查詢並更新緩存
        const result = PerformanceOptimizer._performQuery(selector, context, options);

        if (result) {
          this.queryCache.set(cacheKey, {
            result,
            timestamp: Date.now(),
            selector,
            ttl: this.options.cacheTTL,
          });
        } else {
          // 如果新查詢沒有結果，則刪除緩存
          this.queryCache.delete(cacheKey);
        }
      }
    }
  }

  /**
   * 嘗試接管 Preloader 的快取
   *
   * Preloader 在頁面加載初期可能會緩存一些關鍵節點（如 article）
   * 如果這些緩存有效，PerformanceOptimizer 可以直接接管，避免重複查詢
   *
   * @param {Object} options - 接管選項
   * @param {number} [options.maxAge=30000] - 快取最大有效期（毫秒）
   * @returns {Object} 接管結果 { taken: number, expired: boolean }
   */
  takeoverPreloaderCache(options = {}) {
    const { maxAge = 30000 } = options;
    const preloaderCache = window.__NOTION_PRELOADER_CACHE__;

    // 1. 基礎結構驗證：使用 securityUtils 檢查
    if (!validatePreloaderCache(preloaderCache)) {
      if (preloaderCache) {
        // 只有當它存在但無效時才記錄 Warning
        Logger.warn('Preloader 快取結構無效，拒絕接管');
      } else {
        Logger.debug('無 preloader 快取可接管');
      }
      return { taken: 0 };
    }

    // 2. 檢查是否過期
    const cacheAge = Date.now() - preloaderCache.timestamp;
    if (cacheAge > maxAge) {
      Logger.debug(`preloader 快取已過期: ${cacheAge}ms > ${maxAge}ms`);
      return { taken: 0, expired: true };
    }

    let takenCount = 0;

    // 遷移 article 快取
    if (
      this._migrateCacheItem(
        preloaderCache.article,
        PRELOADER_SELECTORS.article,
        preloaderCache.timestamp
      )
    ) {
      takenCount++;
    }

    // 遷移 mainContent 快取
    if (
      this._migrateCacheItem(
        preloaderCache.mainContent,
        PRELOADER_SELECTORS.mainContent,
        preloaderCache.timestamp
      )
    ) {
      takenCount++;
    }

    return { taken: takenCount };
  }

  /**
  
   * 安排批處理
   * @private
   */
  _scheduleBatchProcessing() {
    if (this.batchTimer) {
      return;
    }

    // 使用 requestAnimationFrame 進行更優化的調度
    // 如果支持 requestIdleCallback，則優先使用它
    if (typeof requestIdleCallback !== 'undefined') {
      this.batchTimer = requestIdleCallback(
        () => {
          this._processBatch();
          this.batchTimer = null;
        },
        { timeout: this.options.batchDelay }
      );
    } else {
      // 回退到 setTimeout
      this.batchTimer = setTimeout(() => {
        this._processBatch();
        this.batchTimer = null;
      }, this.options.batchDelay);
    }
  }

  /**
   * 處理批處理隊列
   * @private
   */
  _processBatch() {
    if (this.batchQueue.length === 0) {
      return;
    }

    // 動態調整批處理大小，根據隊列大小決定是否分批處理
    const maxBatchSize = this._calculateOptimalBatchSize();
    const currentBatch = this.batchQueue.splice(0, maxBatchSize);

    const startTime = performance.now();

    // 更新批處理統計
    this.batchStats.totalBatches++;
    this.batchStats.totalItems += currentBatch.length;
    this.batchStats.averageBatchSize = this.batchStats.totalItems / this.batchStats.totalBatches;

    // 分批處理以避免阻塞 UI
    this._processBatchItems(currentBatch, startTime);
  }

  /**
   * 計算最佳批處理大小
   * @private
   */
  _calculateOptimalBatchSize() {
    // 根據隊列大小和歷史性能數據動態調整
    const queueLength = this.batchQueue.length;

    if (queueLength === 0) {
      return 100;
    } // 默認大小

    // 如果隊列很長，使用較大的批處理以提高效率
    if (queueLength > 500) {
      return 200;
    }
    if (queueLength > 200) {
      return 150;
    }
    if (queueLength > 50) {
      return 100;
    }

    // 如果隊列較短，使用較小的批處理以保持響應性
    return 50;
  }

  /**
   * 分批處理項目以避免阻塞 UI
   * @private
   */
  _processBatchItems(items, startTime, index = 0, results = []) {
    const chunkSize = 10; // 每次處理的項目數量
    const endIndex = Math.min(index + chunkSize, items.length);

    // 處理當前塊
    for (let i = index; i < endIndex; i++) {
      const item = items[i];
      try {
        if (item.type === 'dom') {
          // DOM 操作批處理
          const result = item.operations.map(op => op());
          item.resolve(result);
          results.push(result);
        } else {
          // 圖片處理批處理或其他處理
          const result = Array.isArray(item.images)
            ? item.images.map(img => item.processor(img))
            : [item.processor()]; // 處理單個項目
          item.resolve(result);
          results.push(result);
        }
      } catch (error) {
        if (typeof ErrorHandler !== 'undefined') {
          ErrorHandler.logError({
            type: 'performance_warning',
            context: 'batch processing',
            originalError: error,
            timestamp: Date.now(),
          });
        }
        // Return empty array on error so Promise.all (or map) doesn't fail entire batch
        item.resolve([]);
      }
    }

    // 如果還有更多項目，安排下一塊處理
    if (endIndex < items.length) {
      // 使用 requestAnimationFrame 或 setTimeout 來讓出控制權
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => {
          this._processBatchItems(items, startTime, endIndex, results);
        });
      } else {
        setTimeout(() => {
          this._processBatchItems(items, startTime, endIndex, results);
        }, 0);
      }
    } else {
      // 所有項目已完成處理
      const processingTime = performance.now() - startTime;
      this.metrics.totalProcessingTime += processingTime;
      this.metrics.batchOperations++;
      this.metrics.averageProcessingTime =
        this.metrics.totalProcessingTime / this.metrics.batchOperations;
    }
  }

  /**
   * 分批處理數組
   * @private
   */
  async _processInBatches(items, batchSize, processor) {
    const results = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      // 使用動態批處理大小調整
      const dynamicBatchSize = this._adjustBatchSizeForPerformance(batch.length);
      if (dynamicBatchSize < batch.length) {
        // 如果動態大小小於當前批次，進行細分
        for (let j = 0; j < batch.length; j += dynamicBatchSize) {
          const subBatch = batch.slice(j, j + dynamicBatchSize);
          const subBatchPromises = subBatch.map(processor);
          const subBatchResults = await Promise.allSettled(subBatchPromises);

          results.push(
            ...subBatchResults.map(result =>
              result.status === 'fulfilled' ? result.value : { error: result.reason }
            )
          );

          // 在批次之間提供短暫延遲以保持 UI 響應
          await PerformanceOptimizer._yieldToMain();
        }
      } else {
        const batchPromises = batch.map(processor);
        const batchResults = await Promise.allSettled(batchPromises);

        results.push(
          ...batchResults.map(result =>
            result.status === 'fulfilled' ? result.value : { error: result.reason }
          )
        );
      }
    }

    return results;
  }

  /**
   * 根據性能動態調整批處理大小
   * @private
   */
  _adjustBatchSizeForPerformance(currentSize) {
    // 如果有性能歷史數據，根據歷史性能調整大小
    if (this.metrics.averageProcessingTime && this.metrics.averageProcessingTime > 100) {
      // 如果平均處理時間過長，減少批次大小
      return Math.max(1, Math.floor(currentSize * 0.7));
    } else if (this.metrics.averageProcessingTime && this.metrics.averageProcessingTime < 10) {
      // 如果處理很快，可以增加批次大小（確保使用整數）
      return Math.min(PERFORMANCE_OPTIMIZER.MAX_BATCH_SIZE, Math.floor(currentSize * 1.5));
    }
    return currentSize;
  }

  /**
   * 讓出控制權給主線程以保持響應性
   *
   * 設計說明：
   * - 這是一個無狀態的工具函數，使用 requestIdleCallback 或 setTimeout
   * - 保留為靜態方法是因為此邏輯與批處理性能優化密切相關
   * - 提供跨瀏覽器的兼容性處理（requestIdleCallback 的回退方案）
   * - 此函數是 PerformanceOptimizer 批處理機制的基礎設施，不建議獨立提取
   *
   * @private
   * @static
   * @returns {Promise<void>} 在讓出控制權後解析的 Promise
   */
  static _yieldToMain() {
    return new Promise(resolve => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => resolve());
      } else {
        setTimeout(() => resolve(), 1); // 給瀏覽器機會處理其他任務
      }
    });
  }

  /**
   * 記錄查詢時間
   * @private
   */
  _recordQueryTime(startTime) {
    const queryTime = performance.now() - startTime;
    this.metrics.totalProcessingTime += queryTime;
    this.metrics.domQueries++;
    this.metrics.averageProcessingTime = this.metrics.totalProcessingTime / this.metrics.domQueries;
  }

  /**
   * 獲取內存統計
   *
   * 設計說明：
   * - 這是一個無狀態的工具函數，讀取瀏覽器的內存使用信息
   * - 保留為靜態方法是因為此邏輯是性能監控功能的一部分
   * - 提供跨環境的兼容性處理（瀏覽器、Node.js、測試環境）
   * - 此函數是 PerformanceOptimizer 性能指標收集的基礎功能
   *
   * @private
   * @static
   * @returns {Object|null} 內存統計對象或 null（如果不支持）
   * @returns {number} returns.usedJSHeapSize - 已使用的 JS 堆大小（字節）
   * @returns {number} returns.totalJSHeapSize - JS 堆總大小（字節）
   * @returns {number} returns.jsHeapSizeLimit - JS 堆大小限制（字節）
   */
  static _getMemoryStats() {
    // 檢查 window.performance.memory 或 global.performance.memory（測試環境）
    const perf =
      (typeof window !== 'undefined' && window.performance) ||
      (typeof global !== 'undefined' && global.performance) ||
      (typeof performance !== 'undefined' && performance);

    if (perf?.memory) {
      return {
        usedJSHeapSize: perf.memory.usedJSHeapSize,
        totalJSHeapSize: perf.memory.totalJSHeapSize,
        jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
      };
    }
    return null;
  }

  /**
   * 清理資源並停止所有定時器
   */
  destroy() {
    // 清理批處理定時器
    if (this.batchTimer) {
      if (typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(this.batchTimer);
      } else {
        clearTimeout(this.batchTimer);
      }
      this.batchTimer = null;
    }

    // 清理緩存
    this.queryCache.clear();
    this.prewarmedSelectors.clear();

    Logger.info('🧹 PerformanceOptimizer 資源已清理');
  }

  /**
   * 測量函數執行時間
   * @param {Function} fn - 要測量的函數
   * @param {string} name - 函數名稱
   * @returns {*} 函數執行結果
   */
  measure(fn, name = 'anonymous') {
    const startTime = performance.now();
    const result = fn();
    const endTime = performance.now();
    const duration = endTime - startTime;

    // 記錄測量結果到實例指標
    if (this.options.enableMetrics) {
      Logger.info(`Performance: ${name} took ${duration.toFixed(2)}ms`);
    }

    return result;
  }

  /**
   * 測量異步函數執行時間
   * @param {Function} asyncFn - 要測量的異步函數
   * @param {string} name - 函數名稱
   * @returns {Promise<*>} 函數執行結果
   */
  async measureAsync(asyncFn, name = 'anonymous') {
    const startTime = performance.now();
    const result = await asyncFn();
    const endTime = performance.now();
    const duration = endTime - startTime;

    // 記錄測量結果到實例指標
    if (this.options.enableMetrics) {
      Logger.info(`Performance: ${name} took ${duration.toFixed(2)}ms`);
    }

    return result;
  }
}

// 創建默認實例
const defaultOptimizer = new PerformanceOptimizer();

/**
 * 便捷的緩存查詢函數
 * @param {string} selector - CSS 選擇器
 * @param {Element} context - 查詢上下文
 * @param {Object} options - 查詢選項
 * @returns {NodeList|Element|null} 查詢結果
 */
function cachedQuery(selector, context = document, options = {}) {
  return defaultOptimizer.cachedQuery(selector, context, options);
}

/**
 * 便捷的批處理函數
 * @param {Array} items - 要處理的項目
 * @param {Function} processor - 處理函數
 * @returns {Promise<Array>} 處理結果
 */
function batchProcess(items, processor) {
  return defaultOptimizer.batchProcessImages(items, processor);
}

/**
 * 等待指定的時間
 * @param {number} ms - 等待的毫秒數
 * @returns {Promise<void>}
 */
function waitForDelay(ms) {
  if (!ms || ms <= 0) {
    return Promise.resolve();
  }
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 具備重試與失敗統計的批處理封裝
 * @param {Array} items - 要處理的項目
 * @param {Function} processor - 單項處理函數
 * @param {Object} options - 設定
 * @param {number} [options.maxAttempts=2] - 最大嘗試次數
 * @param {number} [options.baseDelay=120] - 初始延遲（毫秒），會以 2 的冪次增加
 * @param {boolean} [options.captureFailedResults=false] - 是否收集失敗索引
 * @param {Function} [options.isResultSuccessful] - 自訂成功判斷函數
 * @param {Function} [options.customBatchFn] - 測試用自訂批處理函數
 * @returns {Promise<{results: Array|null, meta: Object}>}
 */
async function batchProcessWithRetry(items, processor, options = {}) {
  const {
    maxAttempts = 2,
    baseDelay = 120,
    captureFailedResults = false,
    isResultSuccessful = result => Boolean(result),
    customBatchFn,
  } = options;

  const attempts = Math.max(1, maxAttempts);
  const summary = {
    attempts: 0,
    failedIndices: [],
    lastError: null,
  };

  const batchFn = typeof customBatchFn === 'function' ? customBatchFn : batchProcess;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    summary.attempts = attempt;
    try {
      const results = await batchFn(items, processor);

      if (!Array.isArray(results)) {
        summary.failedIndices = items.map((_, index) => index);
        throw new Error('Batch processor returned non-array results');
      }

      if (captureFailedResults) {
        summary.failedIndices = [];
        results.forEach((result, index) => {
          if (!isResultSuccessful(result, index)) {
            summary.failedIndices.push(index);
          }
        });
      }

      return { results, meta: summary };
    } catch (error) {
      summary.lastError = error;

      if (attempt < attempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await waitForDelay(delay);
      }
    }
  }

  return { results: null, meta: summary };
}

export { PerformanceOptimizer, cachedQuery, batchProcess, batchProcessWithRetry };
