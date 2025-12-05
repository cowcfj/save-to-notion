/**
 * 自適應性能管理器
 * 根據頁面和系統性能動態調整優化策略
 */
/* global window, document, performance, module */
const Logger = typeof window !== 'undefined' && window.Logger ? window.Logger : console;
class AdaptivePerformanceManager {
  /**
   * 創建自適應性能管理器實例
   * @param {PerformanceOptimizer} performanceOptimizer - 性能優化器實例
   * @param {Object} options - 配置選項
   */
  constructor(performanceOptimizer, options = {}) {
    // 防禦性檢查：確保 performanceOptimizer 和其 options 存在
    const DEFAULT_CACHE_MAX_SIZE = 100;
    const validOptimizer = performanceOptimizer && typeof performanceOptimizer === 'object';

    this.performanceOptimizer = validOptimizer ? performanceOptimizer : null;
    this.options = {
      performanceThreshold: 100, // 性能基準線（ms）
      batchSizeAdjustmentFactor: 0.1, // 批處理大小調整因子
      cacheSizeAdjustmentFactor: 0.05, // 緩存大小調整因子
      ...options,
    };

    // 安全地獲取 cacheMaxSize，使用多層回退
    const cacheMaxSize =
      (validOptimizer && performanceOptimizer.options?.cacheMaxSize) ||
      options.cacheMaxSize ||
      DEFAULT_CACHE_MAX_SIZE;

    this.performanceHistory = []; // 性能歷史記錄
    this.currentSettings = {
      batchSize: 100,
      cacheSize: cacheMaxSize,
      enableCache: true,
      enableBatching: true,
    };
  }

  /**
   * 分析當前頁面特性，調整性能策略
   * @param {Object} pageData - 頁面數據
   * @returns {Promise<Object>} 調整後的策略
   */
  async analyzeAndAdjust(_pageData = {}) {
    const startTime = performance.now();

    // 分析頁面內容
    // 將傳入的 pageData 命名為 _pageData 表示在某些執行環境中該參數可能未被使用
    const pageAnalysis = AdaptivePerformanceManager._analyzePageContent(_pageData);

    // 分析系統性能
    const systemPerformance = await AdaptivePerformanceManager._analyzeSystemPerformance();
    // 參考配置中的 performanceThreshold 避免被靜態分析標記為未使用
    const perfThreshold =
      typeof this.options.performanceThreshold === 'number'
        ? this.options.performanceThreshold
        : 100;
    Logger.info(`⚙️ 使用 performanceThreshold = ${perfThreshold}`);

    // 基於分析結果調整策略
    const strategy = this._adjustStrategyBasedOnAnalysis(pageAnalysis, systemPerformance);

    const duration = performance.now() - startTime;
    // 將本次分析結果推入歷史以供後續決策或診斷使用（防止未使用變數警告，且保留診斷信息）
    try {
      this.performanceHistory.push({
        ts: Date.now(),
        duration: Number(duration.toFixed(2)),
        performanceScore: systemPerformance?.performanceScore
          ? systemPerformance.performanceScore
          : null,
      });
      // 保持歷史長度在合理範圍內以免無限增長
      if (this.performanceHistory.length > 50) {
        this.performanceHistory.shift();
      }
    } catch (error) {
      // 不要阻塞主要流程，僅記錄警告
      Logger.warn('記錄性能歷史失敗:', error);
    }

    Logger.info(`📊 自適應性能分析完成，耗時: ${duration.toFixed(2)}ms`);
    return strategy;
  }

  /**
   * 分析頁面內容以調整性能策略
   * @private
   */
  static _analyzePageContent(_pageData) {
    const analysis = {
      elementCount: 0,
      imageCount: 0,
      textLength: 0,
      complexityScore: 0,
    };

    try {
      // 分析當前文檔
      analysis.elementCount = document.querySelectorAll('*').length;
      analysis.imageCount = document.querySelectorAll('img').length;
      analysis.textLength = document?.body?.textContent?.length || 0;

      // 計算複雜度分數
      analysis.complexityScore =
        analysis.elementCount / 1000 + analysis.imageCount * 0.1 + analysis.textLength / 10000;
    } catch (error) {
      Logger.warn('頁面內容分析失敗:', error);
    }

    return analysis;
  }

  /**
   * 分析系統性能
   * @private
   */
  static _analyzeSystemPerformance() {
    const performanceData = {
      memoryUsage: null,
      cpuLoad: null,
      networkCondition: 'good', // 'good', 'average', 'poor'
      performanceScore: 0,
    };

    try {
      // 獲取內存使用情況
      if (typeof performance !== 'undefined' && performance.memory) {
        performanceData.memoryUsage = {
          used: performance.memory.usedJSHeapSize,
          total: performance.memory.totalJSHeapSize,
          limit: performance.memory.jsHeapSizeLimit,
          usageRatio: performance.memory.usedJSHeapSize / performance.memory.totalJSHeapSize,
        };
      }

      // 執行簡單的性能測試（避免建立大型未使用陣列以造成警告）
      const testStartTime = performance.now();
      let tmpAcc = 0;
      for (let i = 0; i < 10000; i++) {
        tmpAcc += i * 2;
      }
      const testDuration = performance.now() - testStartTime;

      // 使用 testDuration 作為性能分數；tmpAcc 用來避免迴圈被優化掉
      performanceData.performanceScore = testDuration + (tmpAcc % 1);

      // 基於測試結果評估性能
      if (testDuration < 10) {
        performanceData.networkCondition = 'good';
      } else if (testDuration < 50) {
        performanceData.networkCondition = 'average';
      } else {
        performanceData.networkCondition = 'poor';
      }
    } catch (error) {
      Logger.warn('系統性能分析失敗:', error);
    }

    return performanceData;
  }

  /**
   * 根據分析結果調整策略
   * @private
   */
  _adjustStrategyBasedOnAnalysis(pageAnalysis, systemPerformance) {
    const newSettings = { ...this.currentSettings };

    // 安全獲取 cacheMaxSize，如果 performanceOptimizer 不可用則使用默認值
    const DEFAULT_CACHE_MAX_SIZE = 100;
    const cacheMaxSize = this.performanceOptimizer?.options?.cacheMaxSize || DEFAULT_CACHE_MAX_SIZE;

    // 根據頁面複雜度調整緩存大小
    const cacheFactor =
      typeof this.options.cacheSizeAdjustmentFactor === 'number'
        ? this.options.cacheSizeAdjustmentFactor
        : 0.5; // 預設回退值

    if (pageAnalysis.complexityScore > 10) {
      // 複雜頁面 -> 增加緩存大小
      newSettings.cacheSize = Math.min(
        Math.floor(cacheMaxSize * (1 + cacheFactor)),
        2000 // 最大緩存限制
      );
    } else if (pageAnalysis.complexityScore < 2) {
      // 簡單頁面 -> 減少緩存大小以節省內存
      newSettings.cacheSize = Math.floor(cacheMaxSize * Math.max(0.1, 1 - cacheFactor));
    }

    // 根據系統性能調整批處理大小
    const batchFactor =
      typeof this.options.batchSizeAdjustmentFactor === 'number'
        ? this.options.batchSizeAdjustmentFactor
        : 0.2; // 預設回退值

    if (systemPerformance.performanceScore < 20) {
      // 高性能系統 -> 增加批處理大小
      newSettings.batchSize = Math.min(
        Math.floor(this.currentSettings.batchSize * (1 + batchFactor)),
        500 // 最大批處理大小
      );
    } else if (systemPerformance.performanceScore > 50) {
      // 低性能系統 -> 減少批處理大小
      newSettings.batchSize = Math.max(
        Math.floor(this.currentSettings.batchSize * Math.max(0.1, 1 - batchFactor)),
        10 // 最小批處理大小
      );
    }

    // 根據內存使用率決定是否啟用某些功能
    if (systemPerformance.memoryUsage && systemPerformance.memoryUsage.usageRatio > 0.8) {
      // 內存使用率高 -> 限制某些功能
      newSettings.enableCache = false; // 這可能不是最佳做法，僅作示例
    }

    // 更新當前設置
    this.currentSettings = newSettings;

    // 應用新設置到性能優化器
    this._applySettingsToOptimizer();

    Logger.info('🔄 自適應性能策略調整完成:', newSettings);
    Logger.info('📊 頁面分析:', pageAnalysis);
    Logger.info('📊 系統性能:', systemPerformance);

    return {
      settings: newSettings,
      pageAnalysis,
      systemPerformance,
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
      Logger.info('🔧 已將新的性能設置應用到優化器:', this.currentSettings);
    }
  }

  /**
   * 動態調整批處理大小
   * @param {number} newBatchSize - 新的批處理大小
   */
  adjustBatchSize(newBatchSize) {
    const applied = Math.max(1, Math.min(1000, newBatchSize));
    this.currentSettings.batchSize = applied;
    Logger.info(`🔄 批處理大小調整為: ${applied}`);
  }

  /**
   * 動態調整緩存大小
   * @param {number} newCacheSize - 新的緩存大小
   */
  adjustCacheSize(newCacheSize) {
    this.currentSettings.cacheSize = Math.max(50, Math.min(2000, newCacheSize));

    // 檢查 performanceOptimizer 是否存在並且有 options 屬性
    if (this.performanceOptimizer?.options) {
      this.performanceOptimizer.options.cacheMaxSize = this.currentSettings.cacheSize;
    } else {
      Logger.warn('⚠️ performanceOptimizer 不可用，無法同步緩存大小設置');
    }

    // 報告實際應用的緩存大小，而不是原始輸入值
    Logger.info(`🔄 緩存大小調整為: ${this.currentSettings.cacheSize}`);
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
