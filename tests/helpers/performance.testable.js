/**
 * PerformanceOptimizer 可測試版本
 * 從 scripts/performance/PerformanceOptimizer.js 提取用於單元測試
 */

/**
 * 性能優化器
 * 提供 DOM 查詢緩存、批處理和性能監控功能
 */
/* eslint-env browser, jest */
/* eslint-disable no-console */
/* global document, performance, setTimeout */

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
    // 預留欄位：測試用預熱超時控制（目前在測試環境未使用，以下以 _ 前綴表示刻意未使用以避開 linter/DeepSource 警告）
    this._prewarmTimeout = null;
        
        // 批處理隊列
        this.batchQueue = [];
        this.batchTimer = null;
        this.processingBatch = false;
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
            averageQueryTime: 0,
            totalQueryTime: 0,
            totalProcessingTime: 0,
            averageProcessingTime: 0
        };

        // 自適應性能管理
        this.adaptiveManager = null;
        if (this.options.enableAdaptive) {
            this._initAdaptiveManager();
        }
    }

    /**
     * 初始化自適應性能管理器
     * @private
     */
    _initAdaptiveManager() {
        // 在測試環境中不實現複雜的自適應邏輯
    // skipcq: JS-0002
    // 在測試環境中記錄 _prewarmTimeout（可能為 null）以表明該欄位是刻意保留的
    console.log('🤖 自適應性能管理器已初始化（測試環境）', { _prewarmTimeout: this._prewarmTimeout });
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
    adaptiveAdjustment(_pageData = {}) {
        // 在測試環境中返回基本結果
        // 這裡保留返回 Promise 的行為以與生產版本一致（避免將函式簽名改動影響外部呼叫）
        return Promise.resolve({
            settings: { ...this.currentSettings },
            pageAnalysis: { elementCount: 0, imageCount: 0, textLength: 0, complexityScore: 0 },
            systemPerformance: { memoryUsage: null, cpuLoad: null, networkCondition: 'good', performanceScore: 0 }
        });
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
            const cached = this.queryCache.get(cacheKey);
            
            // 檢查緩存是否過期
            const isExpired = Date.now() - cached.timestamp > this.options.cacheTTL;
            
            if (!isExpired) {
                this.cacheStats.hits++;
                this.metrics.cacheHits++;
                return cached.result;
            } else {
                // 緩存過期，移除
                this.queryCache.delete(cacheKey);
            }
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
     * 預熱選擇器緩存
     * @param {Array} selectors - 要預熱的 CSS 選擇器數組
     * @param {Element} context - 查詢上下文，默認為 document
     * @returns {Promise<Array>} 預熱結果
     */
    async preloadSelectors(selectors, context = document) {
        if (!this.options.enableCache || !selectors || !Array.isArray(selectors)) {
            return [];
        }

    // skipcq: JS-0002
    console.log(`🔥 開始預熱 ${selectors.length} 個選擇器...`);
        
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
                        count: Array.isArray(result) ? result.length : (result.nodeType ? 1 : 0),
                        cached: true
                    });
                    
                    this.cacheStats.prewarms++;
                    this.prewarmedSelectors.add(selector);
                    
                    // skipcq: JS-0002
                    console.log(`✓ 預熱成功: ${selector} (${results[results.length - 1].count} 個元素)`);
                }
            } catch (error) {
                // skipcq: JS-0002
                console.warn(`⚠️ 預熱選擇器失敗: ${selector}`, error);
                
                results.push({
                    selector: selector,
                    error: error.message,
                    cached: false
                });
            }
        }
        
    // skipcq: JS-0002
    console.log(`🔥 預熱完成: ${results.filter(r => r.cached).length}/${selectors.length} 個選擇器已預熱`);
        return results;
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
    // skipcq: JS-0002
    console.log(`🧠 智能預熱完成，耗時: ${duration.toFixed(2)}ms`);
        
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
     * 預加載關鍵選擇器
     * @param {Array} selectors - 選擇器數組
     * @param {Element} context - 查詢上下文
     */
    preloadSelectorsOld(selectors, context = document) {
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
            evictions: 0,
            prewarms: 0
        };
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
                prewarmCount: this.prewarmedSelectors.size,
                ...this.cacheStats
            },
            batch: {
                queueSize: this.batchQueue.length,
                processing: this.processingBatch,
                totalOperations: this.metrics.batchOperations,
                ...this.batchStats
            },
            queries: {
                total: this.metrics.domQueries,
                averageTime: `${this.metrics.averageQueryTime.toFixed(2)}ms`,
                totalTime: `${this.metrics.totalQueryTime.toFixed(2)}ms`
            },
            metrics: {
                ...this.metrics
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
                accessCount: 1,
                ttl: this.options.cacheTTL
            });
            return;
        }

        // 維護緩存大小限制
        this._maintainCacheSizeLimit(key);

        this.queryCache.set(key, {
            result: result,
            timestamp: Date.now(),
            queryTime: queryTime,
            accessCount: 1,
            ttl: this.options.cacheTTL
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
            // 更新批處理統計
            this.batchStats.totalBatches++;
            this.batchStats.totalItems += currentBatch.length;
            this.batchStats.averageBatchSize = this.batchStats.totalItems / this.batchStats.totalBatches;

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
            // skipcq: JS-0002
            console.error('Batch processing error:', error);
        } finally {
            this.processingBatch = false;
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
            const batchPromises = batch.map(processor);
            const batchResults = await Promise.allSettled(batchPromises);
            
            results.push(...batchResults.map(result => 
                result.status === 'fulfilled' ? result.value : { error: result.reason }
            ));
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
            setTimeout(() => resolve(), 1);  // 給瀏覽器機會處理其他任務
        });
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
    // skipcq: JS-0002
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
    // skipcq: JS-0002
    console.info(`Performance: ${name} took ${(endTime - startTime).toFixed(2)}ms`);
        return result;
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
     * 根據當前系統負載調整性能參數
     */
    async adjustForSystemLoad() {
        // 獲取當前性能指標
        const stats = this.getPerformanceStats();
        
        // 根據緩存命中率調整策略
        if (stats.cache.hitRate < 0.3) {
            // 緩存命中率低，可能需要增加緩存大小或清理策略
            // skipcq: JS-0002
            console.log('📊 緩存命中率較低，考慮調整緩存策略');
        }
        
        // 根據平均處理時間調整批處理大小
        if (this.metrics.averageProcessingTime > 50) {
            // 處理時間過長，減少批處理大小
            // skipcq: JS-0002
            console.log('⏰ 處理時間過長，動態調整批處理大小');
        }
        
        // 定期清理過期緩存
        const expiredCount = this.clearExpiredCache();
        if (expiredCount > 0) {
            // skipcq: JS-0002
            console.log(`🧹 清理了 ${expiredCount} 個過期的緩存項目`);
        }
    }
}

module.exports = { PerformanceOptimizer };