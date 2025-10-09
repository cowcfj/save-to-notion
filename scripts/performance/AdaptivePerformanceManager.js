/**
 * 自適應性能管理器
 * 根據頁面和系統性能動態調整優化策略
 */
class AdaptivePerformanceManager {
    /**
     * 創建自適應性能管理器實例
     * @param {PerformanceOptimizer} performanceOptimizer - 性能優化器實例
     * @param {Object} options - 配置選項
     */
    constructor(performanceOptimizer, options = {}) {
        this.performanceOptimizer = performanceOptimizer;
        this.options = {
            performanceThreshold: 100, // 性能基準線（ms）
            batchSizeAdjustmentFactor: 0.1, // 批處理大小調整因子
            cacheSizeAdjustmentFactor: 0.05, // 緩存大小調整因子
            ...options
        };

        this.performanceHistory = []; // 性能歷史記錄
        this.currentSettings = {
            batchSize: 100,
            cacheSize: performanceOptimizer.options.cacheMaxSize,
            enableCache: true,
            enableBatching: true
        };
    }

    /**
     * 分析當前頁面特性，調整性能策略
     * @param {Object} pageData - 頁面數據
     * @returns {Promise<Object>} 調整後的策略
     */
    async analyzeAndAdjust(pageData = {}) {
        const startTime = performance.now();
        
        // 分析頁面內容
        const pageAnalysis = this._analyzePageContent(pageData);
        
        // 分析系統性能
        const systemPerformance = await this._analyzeSystemPerformance();
        
        // 基於分析結果調整策略
        const strategy = this._adjustStrategyBasedOnAnalysis(pageAnalysis, systemPerformance);
        
        const duration = performance.now() - startTime;
        console.log(`📊 自適應性能分析完成，耗時: ${duration.toFixed(2)}ms`);
        
        return strategy;
    }

    /**
     * 分析頁面內容以調整性能策略
     * @private
     */
    _analyzePageContent(pageData) {
        const analysis = {
            elementCount: 0,
            imageCount: 0,
            textLength: 0,
            complexityScore: 0
        };

        try {
            // 分析當前文檔
            analysis.elementCount = document.querySelectorAll('*').length;
            analysis.imageCount = document.querySelectorAll('img').length;
            analysis.textLength = document.body ? document.body.textContent.length : 0;
            
            // 計算複雜度分數
            analysis.complexityScore = 
                (analysis.elementCount / 1000) + 
                (analysis.imageCount * 0.1) + 
                (analysis.textLength / 10000);
        } catch (error) {
            console.warn('頁面內容分析失敗:', error);
        }

        return analysis;
    }

    /**
     * 分析系統性能
     * @private
     */
    async _analyzeSystemPerformance() {
        const performanceData = {
            memoryUsage: null,
            cpuLoad: null,
            networkCondition: 'good', // 'good', 'average', 'poor'
            performanceScore: 0
        };

        try {
            // 獲取內存使用情況
            if (typeof performance !== 'undefined' && performance.memory) {
                performanceData.memoryUsage = {
                    used: performance.memory.usedJSHeapSize,
                    total: performance.memory.totalJSHeapSize,
                    limit: performance.memory.jsHeapSizeLimit,
                    usageRatio: performance.memory.usedJSHeapSize / performance.memory.totalJSHeapSize
                };
            }

            // 執行簡單的性能測試
            const testStartTime = performance.now();
            const testArray = new Array(10000);
            for (let i = 0; i < 10000; i++) {
                testArray[i] = i * 2;
            }
            const testDuration = performance.now() - testStartTime;
            
            performanceData.performanceScore = testDuration;
            
            // 基於測試結果評估性能
            if (testDuration < 10) {
                performanceData.networkCondition = 'good';
            } else if (testDuration < 50) {
                performanceData.networkCondition = 'average';
            } else {
                performanceData.networkCondition = 'poor';
            }
            
        } catch (error) {
            console.warn('系統性能分析失敗:', error);
        }

        return performanceData;
    }

    /**
     * 根據分析結果調整策略
     * @private
     */
    _adjustStrategyBasedOnAnalysis(pageAnalysis, systemPerformance) {
        let newSettings = { ...this.currentSettings };

        // 根據頁面複雜度調整緩存大小
        if (pageAnalysis.complexityScore > 10) {
            // 複雜頁面 -> 增加緩存大小
            newSettings.cacheSize = Math.min(
                Math.floor(this.performanceOptimizer.options.cacheMaxSize * 1.5),
                2000 // 最大緩存限制
            );
        } else if (pageAnalysis.complexityScore < 2) {
            // 簡單頁面 -> 減少緩存大小以節省內存
            newSettings.cacheSize = Math.floor(this.performanceOptimizer.options.cacheMaxSize * 0.7);
        }

        // 根據系統性能調整批處理大小
        if (systemPerformance.performanceScore < 20) {
            // 高性能系統 -> 增加批處理大小
            newSettings.batchSize = Math.min(
                Math.floor(this.currentSettings.batchSize * 1.2),
                500 // 最大批處理大小
            );
        } else if (systemPerformance.performanceScore > 50) {
            // 低性能系統 -> 減少批處理大小
            newSettings.batchSize = Math.max(
                Math.floor(this.currentSettings.batchSize * 0.6),
                10 // 最小批處理大小
            );
        }

        // 根據內存使用率決定是否啟用某些功能
        if (systemPerformance.memoryUsage && 
            systemPerformance.memoryUsage.usageRatio > 0.8) {
            // 內存使用率高 -> 限制某些功能
            newSettings.enableCache = false; // 這可能不是最佳做法，僅作示例
        }

        // 更新當前設置
        this.currentSettings = newSettings;

        // 應用新設置到性能優化器
        this._applySettingsToOptimizer();

        console.log('🔄 自適應性能策略調整完成:', newSettings);
        console.log('📊 頁面分析:', pageAnalysis);
        console.log('📊 系統性能:', systemPerformance);

        return {
            settings: newSettings,
            pageAnalysis,
            systemPerformance
        };
    }

    /**
     * 將調整後的設置應用到性能優化器
     * @private
     */
    _applySettingsToOptimizer() {
        if (this.performanceOptimizer) {
            // 更新緩存大小
            this.performanceOptimizer.options.cacheMaxSize = this.currentSettings.cacheSize;
            
            // 這裡可以添加更多設置的動態更新邏輯
            console.log(`🔧 已將新的性能設置應用到優化器:`, this.currentSettings);
        }
    }

    /**
     * 動態調整批處理大小
     * @param {number} newBatchSize - 新的批處理大小
     */
    adjustBatchSize(newBatchSize) {
        this.currentSettings.batchSize = Math.max(1, Math.min(1000, newBatchSize));
        console.log(`🔄 批處理大小調整為: ${newBatchSize}`);
    }

    /**
     * 動態調整緩存大小
     * @param {number} newCacheSize - 新的緩存大小
     */
    adjustCacheSize(newCacheSize) {
        this.currentSettings.cacheSize = Math.max(50, Math.min(2000, newCacheSize));
        this.performanceOptimizer.options.cacheMaxSize = this.currentSettings.cacheSize;
        console.log(`🔄 緩存大小調整為: ${newCacheSize}`);
    }

    /**
     * 獲取當前性能策略
     * @returns {Object} 當前策略設置
     */
    getCurrentStrategy() {
        return { ...this.currentSettings };
    }
}

// 導出類
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AdaptivePerformanceManager };
} else if (typeof window !== 'undefined') {
    window.AdaptivePerformanceManager = AdaptivePerformanceManager;
}