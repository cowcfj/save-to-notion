/**
 * 性能優化器
 * 提供 DOM 查詢緩存、批處理隊列和性能監控功能
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
            cacheMaxSize: 100,
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

        // 初始化性能監控
        if (this.options.enableMetrics) {
            this._initMetricsCollection();
        }
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
            
            // 驗證緩存的元素是否仍在 DOM 中
            if (this._validateCachedElements(cached.result)) {
                this._recordQueryTime(startTime);
                return cached.result;
            } else {
                // 緩存失效，移除
                this.queryCache.delete(cacheKey);
            }
        }

        // 執行查詢
        this.cacheStats.misses++;
        this.metrics.domQueries++;
        
        const result = this._performQuery(selector, context, options);
        
        // 緩存結果
        if (result) {
            // 如果緩存已滿，移除最舊的項目
            if (this.queryCache.size >= this.options.cacheMaxSize) {
                const firstKey = this.queryCache.keys().next().value;
                if (firstKey) {
                    this.queryCache.delete(firstKey);
                    this.cacheStats.evictions++;
                }
            }
            
            this.queryCache.set(cacheKey, {
                result: result,
                timestamp: Date.now(),
                selector: selector
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
                hitRate: this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) || 0
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

        if (result.nodeType) {
            // 單個元素
            return document.contains(result);
        } else if (result.length !== undefined) {
            // NodeList 或數組
            return Array.from(result).every(el => document.contains(el));
        }

        return false;
    }

    /**
     * 安排批處理
     * @private
     */
    _scheduleBatchProcessing() {
        if (this.batchTimer) return;

        this.batchTimer = setTimeout(() => {
            this._processBatch();
            this.batchTimer = null;
        }, this.options.batchDelay);
    }

    /**
     * 處理批處理隊列
     * @private
     */
    _processBatch() {
        if (this.batchQueue.length === 0) return;

        const startTime = performance.now();
        const currentBatch = [...this.batchQueue];
        this.batchQueue = [];

        // 更新批處理統計
        this.batchStats.totalBatches++;
        this.batchStats.totalItems += currentBatch.length;
        this.batchStats.averageBatchSize = this.batchStats.totalItems / this.batchStats.totalBatches;

        // 處理每個批處理項目
        currentBatch.forEach(item => {
            try {
                if (item.type === 'dom') {
                    // DOM 操作批處理
                    const results = item.operations.map(op => op());
                    item.resolve(results);
                } else {
                    // 圖片處理批處理
                    const results = item.images.map(item.processor);
                    item.resolve(results);
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
        });

        // 記錄處理時間
        const processingTime = performance.now() - startTime;
        this.metrics.totalProcessingTime += processingTime;
        this.metrics.batchOperations++;
        this.metrics.averageProcessingTime = this.metrics.totalProcessingTime / this.metrics.batchOperations;
    }

    /**
     * 分批處理數組
     * @private
     */
    async _processInBatches(items, batchSize, processor) {
        const results = [];
        
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const batchPromises = batch.map(processor);
            const batchResults = await Promise.allSettled(batchPromises);
            
            results.push(...batchResults.map(result => 
                result.status === 'fulfilled' ? result.value : { error: result.reason }
            ));
        }
        
        return results;
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
            if (this.options.enableMetrics && console.debug) {
                console.debug('Performance Metrics:', {
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
        if (typeof window !== 'undefined' && window.performance && window.performance.memory) {
            return {
                usedJSHeapSize: window.performance.memory.usedJSHeapSize,
                totalJSHeapSize: window.performance.memory.totalJSHeapSize,
                jsHeapSizeLimit: window.performance.memory.jsHeapSizeLimit
            };
        }
        return null;
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

// 導出類和函數
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PerformanceOptimizer, cachedQuery, batchProcess };
} else if (typeof window !== 'undefined') {
    window.PerformanceOptimizer = PerformanceOptimizer;
    window.cachedQuery = cachedQuery;
    window.batchProcess = batchProcess;
}