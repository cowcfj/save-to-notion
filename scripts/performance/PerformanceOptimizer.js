/**
 * 性能優化器
 * 提供 DOM 查詢緩存、批處理隊列和性能監控功能
 */
/* global window, document, Image, requestIdleCallback, requestAnimationFrame, performance, ErrorHandler, module, AdaptivePerformanceManager */
// 使用不與其他庫衝突的本地日誌別名，避免與 Leaflet 等全域變量 L 衝突
const perfLogger = (typeof window !== 'undefined' && window.Logger) ? window.Logger : console;
class PerformanceOptimizer {
    constructor(options = {}) {
        this.options = {
            enableCache: true,
            enableBatching: true,
            enableMetrics: true,
            cacheMaxSize: 100,
            batchDelay: 16, // 一個動畫幀的時間
            metricsInterval: 5000, // 5秒收集一次指標
            cacheTTL: 300000, // 5分鐘 TTL
            prewarmSelectors: [ // 預設的預熱選擇器
                'img[src]', 'img[data-src]', 'article', 'main', '.content', '.post-content', '.entry-content'
            ],
            enableAdaptive: false, // 是否啟用自適應功能
            ...options
        };

        // DOM 查詢緩存
        this.queryCache = new Map();
        this.cacheStats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            prewarms: 0 // 預熱計數
        };

    // 預熱相關屬性
    this.prewarmedSelectors = new Set();

        // 批處理隊列
        this.batchQueue = [];
        this.batchTimer = null;
        this.batchStats = {
            totalBatches: 0,
            totalItems: 0,
            averageBatchSize: 0
        };

        // 性能指標
        this.metrics = {
            domQueries: 0,
            cacheHits: 0,
            batchOperations: 0,
            totalProcessingTime: 0,
            averageProcessingTime: 0
        };

        // 自適應性能管理
        this.adaptiveManager = null;
        if (this.options.enableAdaptive) {
            this._initAdaptiveManager();
        }

        // 初始化性能監控
        if (this.options.enableMetrics) {
            this._initMetricsCollection();
        }
    }

    /**
     * 初始化自適應性能管理器
     * @private
     */
    _initAdaptiveManager() {
        try {
            if (typeof AdaptivePerformanceManager !== 'undefined') {
                this.adaptiveManager = new AdaptivePerformanceManager(this, {
                    performanceThreshold: 100,
                    batchSizeAdjustmentFactor: 0.1
                });
                perfLogger.info('🤖 自適應性能管理器已初始化');
            } else {
                perfLogger.warn('⚠️ AdaptivePerformanceManager not available, adaptive features disabled');
            }
        } catch (error) {
            perfLogger.error('❌ 初始化自適應管理器失敗:', error);
        }
    }

    /**
     * 啟用自適應性能優化
     */
    enableAdaptiveOptimization() {
        if (!this.adaptiveManager) {
            this.options.enableAdaptive = true;
            this._initAdaptiveManager();
        }
    }

    /**
     * 執行自適應性能調整
     * @param {Object} pageData - 頁面數據
     */
    adaptiveAdjustment(pageData = {}) {
        if (!this.adaptiveManager) {
            return Promise.resolve(null);
        }

        // 返回 underlying promise 讓呼叫者自行 await，避免額外的 microtask
        return this.adaptiveManager.analyzeAndAdjust(pageData);
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
            return this._performQuery(selector, context, options);
        }

        // 生成緩存鍵
        const cacheKey = this._generateCacheKey(selector, context, options);

        // 檢查緩存
        if (this.queryCache.has(cacheKey)) {
            this.cacheStats.hits++;
            this.metrics.cacheHits++;

            const cached = this.queryCache.get(cacheKey);

            // 檢查緩存是否過期
            const isExpired = Date.now() - cached.timestamp > this.options.cacheTTL;

            if (!isExpired && this._validateCachedElements(cached.result)) {
                this._recordQueryTime(startTime);
                return cached.result;
            } else {
                // 緩存過期或失效，移除
                this.queryCache.delete(cacheKey);
            }
        }

        // 執行查詢
        this.cacheStats.misses++;
        this.metrics.domQueries++;

        const result = this._performQuery(selector, context, options);

        // 緩存結果
        if (result) {
            // 維護緩存大小限制
            this._maintainCacheSizeLimit(cacheKey);

            this.queryCache.set(cacheKey, {
                result: result,
                timestamp: Date.now(),
                selector: selector,
                ttl: this.options.cacheTTL
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

        return new Promise((resolve) => {
            const batchItem = {
                images: images,
                processor: processor,
                resolve: resolve,
                options: options,
                timestamp: Date.now()
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

        return new Promise((resolve) => {
            const batchItem = {
                operations: operations,
                resolve: resolve,
                options: options,
                timestamp: Date.now(),
                type: 'dom'
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

        return this._processInBatches(urls, concurrent, (url) => {
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
        const { maxAge = 300000, force = false } = options; // 默認 5 分鐘過期

        if (force) {
            this.queryCache.clear();
            return;
        }

        const now = Date.now();
        const keysToDelete = [];

        for (const [key, cached] of this.queryCache.entries()) {
            if (now - cached.timestamp > maxAge) {
                keysToDelete.push(key);
            }
        }

        keysToDelete.forEach(key => {
            this.queryCache.delete(key);
        });
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
                prewarmCount: this.prewarmedSelectors.size
            },
            batch: {
                ...this.batchStats
            },
            metrics: {
                ...this.metrics
            },
            memory: this._getMemoryStats()
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
            averageProcessingTime: 0
        };
    }

    /**
     * 執行實際的 DOM 查詢
     * @private
     */
    _performQuery(selector, context, options) {
        const { single = false, all = false } = options;

        try {
            if (single) {
                return context.querySelector(selector);
            } else if (all) {
                return context.querySelectorAll(selector);
            } else {
                // 自動判斷
                const result = context.querySelectorAll(selector);
                return result.length === 1 ? result[0] : result;
            }
        } catch (error) {
            if (typeof ErrorHandler !== 'undefined') {
                ErrorHandler.logError({
                    type: 'dom_error',
                    context: `DOM query: ${selector}`,
                    originalError: error,
                    timestamp: Date.now()
                });
            }
            return null;
        }
    }

    /**
     * 生成緩存鍵
     * @private
     */
    _generateCacheKey(selector, context, options) {
        const contextId = context === document ? 'document' :
                         (context.id || context.tagName || 'element');
        const optionsStr = JSON.stringify(options);
        return `${selector}:${contextId}:${optionsStr}`;
    }

    /**
     * 驗證緩存的元素是否仍然有效
     * @private
     */
    _validateCachedElements(result) {
        if (!result) return false;

        try {
            if (result.nodeType) {
                // 單個元素
                return document.contains(result);
            } else if (result.length !== undefined) {
                // NodeList 或數組
                return Array.from(result).every(el => {
                    // 確保 el 是有效的 Node 對象
                    if (!el || !el.nodeType) return false;

                    try {
                        return document.contains(el);
                    } catch {
                        // document.contains 在 JSDOM 環境可能拋出錯誤
                        return false;
                    }
                });
            }
        } catch (error) {
            // 在 JSDOM 環境或其他邊緣情況下，驗證可能失敗
            perfLogger.warn('元素驗證失敗:', error.message);
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

        perfLogger.info(`🔥 開始預熱 ${selectors.length} 個選擇器...`);

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
                        selector: selector,
                        count: result.length || (result.nodeType ? 1 : 0),
                        cached: true
                    });

                    this.cacheStats.prewarms++;
                    this.prewarmedSelectors.add(selector);

                    perfLogger.info(`✓ 預熱成功: ${selector} (${results[results.length - 1].count} 個元素)`);
                }
            } catch (error) {
                perfLogger.warn(`⚠️ 預熱選擇器失敗: ${selector}`, error);

                if (typeof ErrorHandler !== 'undefined') {
                    ErrorHandler.logError({
                        type: 'preload_error',
                        context: `preloading selector: ${selector}`,
                        originalError: error,
                        timestamp: Date.now()
                    });
                }

                results.push({
                    selector: selector,
                    error: error.message,
                    cached: false
                });
            }
        }

    perfLogger.info(`🔥 預熱完成: ${results.filter(r => r.cached).length}/${selectors.length} 個選擇器已預熱`);
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
        const dynamicSelectors = this._analyzePageForPrewarming(context);

        // 合併配置中的預設選擇器和動態生成的選擇器
        const allSelectors = [...new Set([...this.options.prewarmSelectors, ...dynamicSelectors])];

        const results = await this.preloadSelectors(allSelectors, context);

        const duration = performance.now() - startTime;
        perfLogger.info(`🧠 智能預熱完成，耗時: ${duration.toFixed(2)}ms`);

        return results;
    }

    /**
     * 基於當前頁面內容分析，動態生成預熱選擇器
     * @private
     */
    _analyzePageForPrewarming(context) {
        const selectors = [];

        // 檢查頁面結構，生成可能的選擇器
        if (context.querySelector('article')) {
            selectors.push('article h1', 'article h2', 'article h3', 'article p', 'article img');
        }

        if (context.querySelector('[role="main"]')) {
            selectors.push('[role="main"] *');
        }

        // 檢查是否有常見的 CMS 類名
        const cmsPatterns = ['.entry-content', '.post-content', '.article-content', '.content-area'];
        cmsPatterns.forEach(pattern => {
            if (context.querySelector(pattern)) {
                selectors.push(`${pattern} p`, `${pattern} img`, `${pattern} h1`, `${pattern} h2`, `${pattern} h3`);
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
            const cacheKey = this._generateCacheKey(selector, context, options);
            if (this.queryCache.has(cacheKey)) {
                // 執行新的查詢並更新緩存
                const result = this._performQuery(selector, context, options);

                if (result) {
                    this.queryCache.set(cacheKey, {
                        result: result,
                        timestamp: Date.now(),
                        selector: selector,
                        ttl: this.options.cacheTTL
                    });
                } else {
                    // 如果新查詢沒有結果，則刪除緩存
                    this.queryCache.delete(cacheKey);
                }
            }
        }
    }

    /**
     * 安排批處理
     * @private
     */
    _scheduleBatchProcessing() {
        if (this.batchTimer) return;

        // 使用 requestAnimationFrame 進行更優化的調度
        // 如果支持 requestIdleCallback，則優先使用它
        if (typeof requestIdleCallback !== 'undefined') {
            this.batchTimer = requestIdleCallback(() => {
                this._processBatch();
                this.batchTimer = null;
            }, { timeout: this.options.batchDelay });
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
        if (this.batchQueue.length === 0) return;

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

        if (queueLength === 0) return 100; // 默認大小

        // 如果隊列很長，使用較大的批處理以提高效率
        if (queueLength > 500) return 200;
        if (queueLength > 200) return 150;
        if (queueLength > 50) return 100;

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
                        timestamp: Date.now()
                    });
                }
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
            this.metrics.averageProcessingTime = this.metrics.totalProcessingTime / this.metrics.batchOperations;
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

                    results.push(...subBatchResults.map(result =>
                        result.status === 'fulfilled' ? result.value : { error: result.reason }
                    ));

                    // 在批次之間提供短暫延遲以保持 UI 響應
                    await this._yieldToMain();
                }
            } else {
                const batchPromises = batch.map(processor);
                const batchResults = await Promise.allSettled(batchPromises);

                results.push(...batchResults.map(result =>
                    result.status === 'fulfilled' ? result.value : { error: result.reason }
                ));
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
            // 如果處理很快，可以增加批次大小
            return Math.min(500, currentSize * 1.5);
        }
        return currentSize;
    }

    /**
     * 讓出控制權給主線程以保持響應性
     * @private
     */
    _yieldToMain() {
        return new Promise(resolve => {
            if (typeof requestIdleCallback !== 'undefined') {
                requestIdleCallback(() => resolve());
            } else {
                setTimeout(() => resolve(), 1);  // 給瀏覽器機會處理其他任務
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
     * 初始化性能指標收集
     * @private
     */
    _initMetricsCollection() {
        if (typeof window !== 'undefined' && window.performance) {
            setInterval(() => {
                this._collectPerformanceMetrics();
            }, this.options.metricsInterval);
        }
    }

    /**
     * 收集性能指標
     * @private
     */
    _collectPerformanceMetrics() {
        if (typeof window !== 'undefined' && window.performance) {
            const memory = this._getMemoryStats();

            // 記錄到控制台（開發模式）
            if (this.options.enableMetrics && perfLogger.debug) {
                perfLogger.debug('Performance Metrics:', {
                    cache: this.cacheStats,
                    batch: this.batchStats,
                    memory: memory
                });
            }
        }
    }

    /**
     * 獲取內存統計
     * @private
     */
    _getMemoryStats() {
        // 檢查 window.performance.memory 或 global.performance.memory（測試環境）
        const perf = (typeof window !== 'undefined' && window.performance) ||
                     (typeof global !== 'undefined' && global.performance) ||
                     (typeof performance !== 'undefined' && performance);

        if (perf?.memory) {
            return {
                usedJSHeapSize: perf.memory.usedJSHeapSize,
                totalJSHeapSize: perf.memory.totalJSHeapSize,
                jsHeapSizeLimit: perf.memory.jsHeapSizeLimit
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

        // 清理自適應管理器
        if (this.adaptiveManager && typeof this.adaptiveManager.destroy === 'function') {
            this.adaptiveManager.destroy();
        }

        perfLogger.info('🧹 PerformanceOptimizer 資源已清理');
    }

    /**
     * 根據當前系統負載調整性能參數
     */
    adjustForSystemLoad() {
        // 獲取當前性能指標
        const stats = this.getStats();

        // 根據緩存命中率調整策略
        if (stats.cache.hitRate < 0.3) {
            // 緩存命中率低，可能需要增加緩存大小或清理策略
            perfLogger.info('📊 緩存命中率較低，考慮調整緩存策略');
        }

        // 根據平均處理時間調整批處理大小
        if (stats.metrics.averageProcessingTime > 50) {
            // 處理時間過長，減少批處理大小
            perfLogger.info('⏰ 處理時間過長，動態調整批處理大小');
            if (this.adaptiveManager) {
                const currentBatchSize = this.options.batchSize || 100;
                this.adaptiveManager.adjustBatchSize(Math.floor(currentBatchSize * 0.8));
            }
        }

        // 定期清理過期緩存
        const expiredCount = this.clearExpiredCache();
        if (expiredCount > 0) {
            perfLogger.info(`🧹 清理了 ${expiredCount} 個過期的緩存項目`);
        }

        // 保持 API 回傳 Promise（與之前 async 一致）
        return Promise.resolve();
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
        isResultSuccessful = (result) => Boolean(result),
        customBatchFn
    } = options;

    const attempts = Math.max(1, maxAttempts);
    const summary = {
        attempts: 0,
        failedIndices: [],
        lastError: null
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

// 導出類和函數
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PerformanceOptimizer, cachedQuery, batchProcess, batchProcessWithRetry };
} else if (typeof window !== 'undefined') {
    window.PerformanceOptimizer = PerformanceOptimizer;
    window.cachedQuery = cachedQuery;
    window.batchProcess = batchProcess;
    window.batchProcessWithRetry = batchProcessWithRetry;
}
