/**
 * 性能基準測試工具
 * 
 * 提供統一的性能測試和數據收集功能，
 * 支持 Thomas Frank 方案對比和性能基準建立。
 */

class PerformanceBenchmark {
  constructor() {
    this.results = [];
    this.baselines = new Map();
  }

  /**
   * 執行性能測試
   * @param {string} testName - 測試名稱
   * @param {Function} testFunction - 測試函數
   * @param {Object} options - 測試選項
   * @returns {Promise<Object>} 測試結果
   */
  async runBenchmark(testName, testFunction, options = {}) {
    const {
      iterations = 1,
      warmupRuns = 0,
      collectMemory = false
    } = options;

    console.log(`🚀 開始性能測試: ${testName}`);

    // 預熱運行
    for (let i = 0; i < warmupRuns; i++) {
      await testFunction();
    }

    const results = [];
    
    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      const startMemory = collectMemory ? this.getMemoryUsage() : null;
      
      try {
        const result = await testFunction();
        const endTime = performance.now();
        const endMemory = collectMemory ? this.getMemoryUsage() : null;
        
        const benchmarkResult = {
          iteration: i + 1,
          processingTime: endTime - startTime,
          success: result.success !== false,
          result,
          memoryUsage: collectMemory ? {
            start: startMemory,
            end: endMemory,
            delta: endMemory - startMemory
          } : null
        };
        
        results.push(benchmarkResult);
        
      } catch (error) {
        const endTime = performance.now();
        
        results.push({
          iteration: i + 1,
          processingTime: endTime - startTime,
          success: false,
          error: error.message
        });
      }
    }

    const summary = this.calculateSummary(testName, results);
    this.results.push(summary);
    
    console.log(`✅ 完成性能測試: ${testName}`);
    console.log(`   平均時間: ${summary.averageTime.toFixed(2)}ms`);
    console.log(`   成功率: ${(summary.successRate * 100).toFixed(1)}%`);
    
    return summary;
  }

  /**
   * 計算測試結果摘要
   * @param {string} testName - 測試名稱
   * @param {Array} results - 測試結果數組
   * @returns {Object} 摘要統計
   */
  calculateSummary(testName, results) {
    const successfulResults = results.filter(r => r.success);
    const times = successfulResults.map(r => r.processingTime);
    
    return {
      testName,
      timestamp: new Date().toISOString(),
      totalIterations: results.length,
      successfulIterations: successfulResults.length,
      successRate: successfulResults.length / results.length,
      averageTime: times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0,
      minTime: times.length > 0 ? Math.min(...times) : 0,
      maxTime: times.length > 0 ? Math.max(...times) : 0,
      standardDeviation: this.calculateStandardDeviation(times),
      throughput: this.calculateThroughput(successfulResults),
      memoryStats: this.calculateMemoryStats(successfulResults),
      rawResults: results
    };
  }

  /**
   * 計算標準差
   * @param {Array<number>} values - 數值數組
   * @returns {number} 標準差
   */
  calculateStandardDeviation(values) {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    
    return Math.sqrt(avgSquaredDiff);
  }

  /**
   * 計算吞吐量
   * @param {Array} results - 成功的測試結果
   * @returns {Object} 吞吐量統計
   */
  calculateThroughput(results) {
    if (results.length === 0) return null;
    
    const throughputs = results
      .filter(r => r.result?.blocksProcessed)
      .map(r => r.result.blocksProcessed / (r.processingTime / 1000));
    
    if (throughputs.length === 0) return null;
    
    return {
      average: throughputs.reduce((a, b) => a + b, 0) / throughputs.length,
      min: Math.min(...throughputs),
      max: Math.max(...throughputs),
      unit: 'blocks/second'
    };
  }

  /**
   * 計算內存統計
   * @param {Array} results - 測試結果
   * @returns {Object|null} 內存統計
   */
  calculateMemoryStats(results) {
    const memoryResults = results.filter(r => r.memoryUsage);
    
    if (memoryResults.length === 0) return null;
    
    const deltas = memoryResults.map(r => r.memoryUsage.delta);
    
    return {
      averageDelta: deltas.reduce((a, b) => a + b, 0) / deltas.length,
      maxDelta: Math.max(...deltas),
      minDelta: Math.min(...deltas),
      unit: 'bytes'
    };
  }

  /**
   * 獲取當前內存使用量
   * @returns {number} 內存使用量（字節）
   */
  getMemoryUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
      return performance.memory.usedJSHeapSize;
    }
    return 0;
  }

  /**
   * 設置基準線
   * @param {string} name - 基準線名稱
   * @param {Object} baseline - 基準數據
   */
  setBaseline(name, baseline) {
    this.baselines.set(name, {
      ...baseline,
      timestamp: new Date().toISOString()
    });
    
    console.log(`📊 設置性能基準線: ${name}`);
  }

  /**
   * 與基準線對比
   * @param {string} testName - 測試名稱
   * @param {string} baselineName - 基準線名稱
   * @returns {Object|null} 對比結果
   */
  compareWithBaseline(testName, baselineName) {
    const testResult = this.results.find(r => r.testName === testName);
    const baseline = this.baselines.get(baselineName);
    
    if (!testResult || !baseline) {
      console.warn(`⚠️ 無法找到測試結果或基準線: ${testName} vs ${baselineName}`);
      return null;
    }
    
    const comparison = {
      testName,
      baselineName,
      timeImprovement: ((baseline.averageTime - testResult.averageTime) / baseline.averageTime) * 100,
      successRateChange: (testResult.successRate - baseline.successRate) * 100,
      throughputImprovement: this.calculateThroughputImprovement(testResult, baseline),
      timestamp: new Date().toISOString()
    };
    
    console.log(`📈 性能對比結果 (${testName} vs ${baselineName}):`);
    console.log(`   時間改進: ${comparison.timeImprovement.toFixed(2)}%`);
    console.log(`   成功率變化: ${comparison.successRateChange.toFixed(2)}%`);
    
    return comparison;
  }

  /**
   * 計算吞吐量改進
   * @param {Object} current - 當前測試結果
   * @param {Object} baseline - 基準結果
   * @returns {number|null} 吞吐量改進百分比
   */
  calculateThroughputImprovement(current, baseline) {
    if (!current.throughput || !baseline.throughput) return null;
    
    return ((current.throughput.average - baseline.throughput.average) / baseline.throughput.average) * 100;
  }

  /**
   * 生成性能報告
   * @returns {Object} 完整的性能報告
   */
  generateReport() {
    const report = {
      summary: {
        totalTests: this.results.length,
        totalBaselines: this.baselines.size,
        generatedAt: new Date().toISOString()
      },
      results: this.results,
      baselines: Object.fromEntries(this.baselines),
      comparisons: this.generateAllComparisons()
    };
    
    console.log('📋 性能測試報告已生成');
    return report;
  }

  /**
   * 生成所有可能的對比
   * @returns {Array} 對比結果數組
   */
  generateAllComparisons() {
    const comparisons = [];
    
    for (const result of this.results) {
      for (const [baselineName] of this.baselines) {
        const comparison = this.compareWithBaseline(result.testName, baselineName);
        if (comparison) {
          comparisons.push(comparison);
        }
      }
    }
    
    return comparisons;
  }

  /**
   * 清除所有結果
   */
  clear() {
    this.results = [];
    this.baselines.clear();
    console.log('🧹 已清除所有性能測試數據');
  }
}

/**
 * Thomas Frank 方案專用基準測試
 */
class ThomasFrankBenchmark extends PerformanceBenchmark {
  constructor() {
    super();
    this.thomasFrankBaseline = null;
  }

  /**
   * 運行 Thomas Frank 對比測試套件
   * @param {Function} thomasFrankImpl - Thomas Frank 實現
   * @param {Function} currentImpl - 當前實現
   * @param {Array} testSizes - 測試規模數組
   * @returns {Promise<Object>} 完整對比結果
   */
  async runComparisonSuite(thomasFrankImpl, currentImpl, testSizes = [200, 500, 1000, 2000]) {
    console.log('🔍 開始 Thomas Frank 方案對比測試套件');
    
    const results = {
      thomasFrank: {},
      current: {},
      comparisons: {}
    };
    
    for (const size of testSizes) {
      console.log(`\n📊 測試規模: ${size} 區塊`);
      
      // 測試 Thomas Frank 實現
      const tfResult = await this.runBenchmark(
        `thomas-frank-${size}`,
        () => thomasFrankImpl(size),
        { iterations: 3, warmupRuns: 1 }
      );
      
      // 測試當前實現
      const currentResult = await this.runBenchmark(
        `current-impl-${size}`,
        () => currentImpl(size),
        { iterations: 3, warmupRuns: 1 }
      );
      
      results.thomasFrank[size] = tfResult;
      results.current[size] = currentResult;
      
      // 設置基準線（如果是第一次運行）
      if (size === 200 && !this.thomasFrankBaseline) {
        this.setBaseline('thomas-frank-200', tfResult);
        this.thomasFrankBaseline = tfResult;
      }
      
      // 生成對比
      results.comparisons[size] = this.generateSizeComparison(tfResult, currentResult, size);
    }
    
    console.log('\n✅ Thomas Frank 對比測試套件完成');
    return results;
  }

  /**
   * 生成特定規模的對比結果
   * @param {Object} tfResult - Thomas Frank 結果
   * @param {Object} currentResult - 當前實現結果
   * @param {number} size - 測試規模
   * @returns {Object} 對比結果
   */
  generateSizeComparison(tfResult, currentResult, size) {
    return {
      size,
      timeComparison: {
        thomasFrank: tfResult.averageTime,
        current: currentResult.averageTime,
        improvement: ((tfResult.averageTime - currentResult.averageTime) / tfResult.averageTime) * 100
      },
      successRateComparison: {
        thomasFrank: tfResult.successRate,
        current: currentResult.successRate,
        difference: (currentResult.successRate - tfResult.successRate) * 100
      },
      throughputComparison: {
        thomasFrank: tfResult.throughput?.average || 0,
        current: currentResult.throughput?.average || 0,
        improvement: this.calculateThroughputImprovement(currentResult, tfResult)
      },
      scalabilityFactor: this.calculateScalabilityFactor(tfResult, currentResult, size)
    };
  }

  /**
   * 計算擴展性因子
   * @param {Object} tfResult - Thomas Frank 結果
   * @param {Object} currentResult - 當前實現結果
   * @param {number} size - 測試規模
   * @returns {number} 擴展性因子
   */
  calculateScalabilityFactor(tfResult, currentResult, size) {
    if (!this.thomasFrankBaseline || size === 200) return 1.0;
    
    const tfScaling = tfResult.averageTime / this.thomasFrankBaseline.averageTime;
    const currentScaling = currentResult.averageTime / this.thomasFrankBaseline.averageTime;
    
    return currentScaling / tfScaling;
  }
}

module.exports = {
  PerformanceBenchmark,
  ThomasFrankBenchmark
};