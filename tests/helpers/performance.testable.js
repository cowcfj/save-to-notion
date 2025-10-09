/**
 * PerformanceOptimizer 可測試版本
 * 從 scripts/performance/PerformanceOptimizer.js 提取用於單元測試
 */

/**
 * 性能優化器
 * 提供 DOM 查詢緩存、批處理和性能監控功能
 */
class PerformanceOptimizer {
    /**
     * 創建性能優化器實例
     * @param {Object} options - 配置選項
     */
    constructor(options = {}) {
        this.options = {
            enableCache: true,
            enableBatching: true,
            enableMetrics: true,
            cacheMaxSize: 1000,
            batchDelay: 16, // 一個動畫幀的時間
            metricsInterval: 5000, // 5秒收集一次指標
            ...options
        };
        
        // DOM 查詢緩存
        this.queryCache = new Map();
        this.cacheStats = {
            hits: 0,
            misses: 0,
            evictions: 0
        };
        
        // 批處理隊列
        this.batchQueue = [];
        this.batchTimer = null;
        this.processingBatch = false;
        
        // 性能指標
        this.metrics = {
            domQueries: 0,
            cacheHits: 0,
            batchOperations: 0,
            averageQueryTime: 0,
            totalQueryTime: 0
        };
    }

    /**
     * 緩存的 DOM 查詢
     * @param {string} selector - CSS 選擇器
     * @param {Element} context - 查詢上下文，默認為 document
     * @param {Object} options - 查詢選項
     * @returns {NodeList|Element|null} 查詢結果
     */
    cachedQuery(selector, context = document, options = {}) {
        if (!this.options.enableCache) {
            return this._performQuery(selector, context, options);
        }

        const cacheKey = this._generateCacheKey(selector, context, options);
        
        // 檢查緩存
        if (this.queryCache.has(cacheKey)) {
            this.cacheStats.hits++;
            this.metrics.cacheHits++;
            return this.queryCache.get(cacheKey).result;
        }

        // 執行查詢
        const startTime = performance.now();
        const result = this._performQuery(selector, context, options);
        const queryTime = performance.now() - startTime;

        // 更新指標
        this.metrics.domQueries++;
        this.metrics.totalQueryTime += queryTime;
        this.metrics.averageQueryTime = this.metrics.totalQueryTime / this.metrics.domQueries;
        this.cacheStats.misses++;

        // 緩存結果
        this._cacheResult(cacheKey, result, queryTime);

        return result;
    }

    /**
     * 批處理圖片處理
     * @param {Array} images - 圖片元素數組
     * @param {Function} processor - 處理函數
     * @param {Object} options - 批處理選項
     * @returns {Promise<Array>} 處理結果數組
     */
    batchProcessImages(images, processor, options = {}) {
        if (!this.options.enableBatching) {
            return Promise.resolve(images.map(processor));
        }

        return new Promise((resolve, reject) => {
            const batchItem = {
                type: 'images',
                data: images,
                processor: processor,
                options: options,
                resolve: resolve,
                reject: reject,
                timestamp: Date.now()
            };

            this.batchQueue.push(batchItem);
            this._scheduleBatchProcessing();
        });
    }

    /**
     * 批處理 DOM 操作
     * @param {Array} operations - DOM 操作數組
     * @param {Object} options - 批處理選項
     * @returns {Promise<Array>} 操作結果數組
     */
    batchDomOperations(operations, options = {}) {
        if (!this.options.enableBatching) {
            return Promise.resolve(operations.map(op => op()));
        }

        return new Promise((resolve, reject) => {
            const batchItem = {
                type: 'dom',
                data: operations,
                options: options,
                resolve: resolve,
                reject: reject,
                timestamp: Date.now()
            };

            this.batchQueue.push(batchItem);
            this._scheduleBatchProcessing();
        });
    }

    /**
     * 預加載關鍵選擇器
     * @param {Array} selectors - 選擇器數組
     * @param {Element} context - 查詢上下文
     */
    preloadSelectors(selectors, context = document) {
        if (!this.options.enableCache) return;

        // 使用 setTimeout 模擬 requestIdleCallback
        setTimeout(() => {
            selectors.forEach(selector => {
                this.cachedQuery(selector, context);
            });
        }, 100);
    }

    /**
     * 清理緩存
     * @param {string} pattern - 清理模式（可選）
     */
    clearCache(pattern = null) {
        if (pattern) {
            // 清理匹配模式的緩存
            for (const [key, value] of this.queryCache.entries()) {
                if (key.includes(pattern)) {
                    this.queryCache.delete(key);
                }
            }
        } else {
            // 清理所有緩存
            this.queryCache.clear();
        }

        // 重置統計
        this.cacheStats = {
            hits: 0,
            misses: 0,
            evictions: 0
        };
    }

    /**
     * 獲取性能統計
     * @returns {Object} 性能統計信息
     */
    getPerformanceStats() {
        const cacheHitRate = this.cacheStats.hits + this.cacheStats.misses > 0 
            ? (this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) * 100).toFixed(2)
            : 0;

        return {
            cache: {
                size: this.queryCache.size,
                maxSize: this.options.cacheMaxSize,
                hitRate: `${cacheHitRate}%`,
                ...this.cacheStats
            },
            batch: {
                queueSize: this.batchQueue.length,
                processing: this.processingBatch,
                totalOperations: this.metrics.batchOperations
            },
            queries: {
                total: this.metrics.domQueries,
                averageTime: `${this.metrics.averageQueryTime.toFixed(2)}ms`,
                totalTime: `${this.metrics.totalQueryTime.toFixed(2)}ms`
            }
        };
    }

    /**
     * 執行實際的 DOM 查詢
     * @private
     * @param {string} selector - CSS 選擇器
     * @param {Element} context - 查詢上下文
     * @param {Object} options - 查詢選項
     * @returns {NodeList|Element|null} 查詢結果
     */
    _performQuery(selector, context, options) {
        try {
            if (options.single) {
                return context.querySelector(selector);
            } else {
                return context.querySelectorAll(selector);
            }
        } catch (error) {
            // 在測試環境中，返回空結果而不是拋出錯誤
            return options.single ? null : [];
        }
    }

    /**
     * 生成緩存鍵
     * @private
     * @param {string} selector - CSS 選擇器
     * @param {Element} context - 查詢上下文
     * @param {Object} options - 查詢選項
     * @returns {string} 緩存鍵
     */
    _generateCacheKey(selector, context, options) {
        const contextId = context === document ? 'document' : 
                         (context.id || context.tagName || 'element');
        const optionsStr = JSON.stringify(options);
        return `${selector}|${contextId}|${optionsStr}`;
    }

    /**
     * 緩存查詢結果
     * @private
     * @param {string} key - 緩存鍵
     * @param {*} result - 查詢結果
     * @param {number} queryTime - 查詢耗時
     */
    _cacheResult(key, result, queryTime) {
        // 如果鍵已存在，直接更新
        if (this.queryCache.has(key)) {
            this.queryCache.set(key, {
                result: result,
                timestamp: Date.now(),
                queryTime: queryTime,
                accessCount: 1
            });
            return;
        }

        // 檢查緩存大小限制（新鍵）
        if (this.queryCache.size >= this.options.cacheMaxSize) {
            this._evictOldestCache();
        }

        this.queryCache.set(key, {
            result: result,
            timestamp: Date.now(),
            queryTime: queryTime,
            accessCount: 1
        });
    }

    /**
     * 驅逐最舊的緩存項
     * @private
     */
    _evictOldestCache() {
        let oldestKey = null;
        let oldestTime = Date.now();

        for (const [key, value] of this.queryCache.entries()) {
            if (value.timestamp < oldestTime) {
                oldestTime = value.timestamp;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.queryCache.delete(oldestKey);
            this.cacheStats.evictions++;
        }
    }

    /**
     * 調度批處理
     * @private
     */
    _scheduleBatchProcessing() {
        if (this.batchTimer || this.processingBatch) return;

        this.batchTimer = setTimeout(() => {
            this._processBatch();
            this.batchTimer = null;
        }, this.options.batchDelay);
    }

    /**
     * 處理批處理隊列
     * @private
     */
    async _processBatch() {
        if (this.batchQueue.length === 0 || this.processingBatch) return;

        this.processingBatch = true;
        const currentBatch = [...this.batchQueue];
        this.batchQueue.length = 0;

        try {
            // 按類型分組處理
            const imagesBatch = currentBatch.filter(item => item.type === 'images');
            const domBatch = currentBatch.filter(item => item.type === 'dom');

            // 處理圖片批次
            for (const item of imagesBatch) {
                try {
                    const results = item.data.map(item.processor);
                    item.resolve(results);
                    this.metrics.batchOperations++;
                } catch (error) {
                    item.reject(error);
                }
            }

            // 處理 DOM 批次
            for (const item of domBatch) {
                try {
                    const results = item.data.map(op => op());
                    item.resolve(results);
                    this.metrics.batchOperations++;
                } catch (error) {
                    item.reject(error);
                }
            }
        } catch (error) {
            console.error('Batch processing error:', error);
        } finally {
            this.processingBatch = false;
        }
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
        console.info(`Performance: ${name} took ${(endTime - startTime).toFixed(2)}ms`);
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
        console.info(`Performance: ${name} took ${(endTime - startTime).toFixed(2)}ms`);
        return result;
    }
}

module.exports = { PerformanceOptimizer };