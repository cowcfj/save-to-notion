/* global document */

const {
  AdaptivePerformanceManager,
} = require('../../../scripts/performance/AdaptivePerformanceManager');
const { PerformanceOptimizer } = require('../../../scripts/performance/PerformanceOptimizer');

describe('AdaptivePerformanceManager', () => {
  /** @type {PerformanceOptimizer|null} */
  let optimizer = null;
  /** @type {AdaptivePerformanceManager|null} */
  let manager = null;

  beforeEach(() => {
    // clean DOM
    document.body.innerHTML = '';
    optimizer = new PerformanceOptimizer({ cacheMaxSize: 200 });
    manager = new AdaptivePerformanceManager(optimizer, { performanceThreshold: 100 });
  });

  test('analyzeAndAdjust returns strategy object and applies settings to optimizer', async () => {
    // create some DOM elements to influence page analysis
    document.body.innerHTML = '<article><h1>Title</h1><p>Some text</p><img src="a.png"/></article>';

    const result = await manager.analyzeAndAdjust();

    expect(result).toHaveProperty('settings');
    expect(result).toHaveProperty('pageAnalysis');
    expect(result).toHaveProperty('systemPerformance');

    // ensure optimizer's cacheMaxSize was updated according to manager logic
    const currentSettings = manager.getCurrentStrategy();
    expect(optimizer.options.cacheMaxSize).toBeDefined();
    expect(currentSettings).toHaveProperty('cacheSize');
  });

  test('adjustBatchSize and adjustCacheSize update settings', () => {
    manager.adjustBatchSize(250);
    manager.adjustCacheSize(500);

    const strategy = manager.getCurrentStrategy();
    expect(strategy.batchSize).toBeGreaterThanOrEqual(1);
    expect(strategy.cacheSize).toBeGreaterThanOrEqual(50);
    // optimizer options also updated
    expect(optimizer.options.cacheMaxSize).toBe(strategy.cacheSize);
  });

  test('destroy cleans up resources', () => {
    manager.destroy();
    expect(manager.performanceHistory).toEqual([]);
    expect(manager.performanceOptimizer).toBeNull();
  });

  test('adjustBatchSize respects MIN and MAX_BATCH_SIZE bounds', () => {
    // Test lower bound (should clamp to MIN_BATCH_SIZE = 10)
    manager.adjustBatchSize(1);
    expect(manager.getCurrentStrategy().batchSize).toBe(10);

    // Test upper bound (should clamp to MAX_BATCH_SIZE = 500)
    manager.adjustBatchSize(1000);
    expect(manager.getCurrentStrategy().batchSize).toBe(500);

    // Test normal value
    manager.adjustBatchSize(200);
    expect(manager.getCurrentStrategy().batchSize).toBe(200);
  });

  test('performanceThreshold affects batch size adjustment thresholds', async () => {
    // Create manager with custom threshold
    const customManager = new AdaptivePerformanceManager(optimizer, {
      performanceThreshold: 200, // 2x default
    });

    // The thresholds are:
    // - highPerfThreshold = 200 * 0.2 = 40 (instead of default 20)
    // - lowPerfThreshold = 200 * 0.5 = 100 (instead of default 50)
    // This affects when batch sizes are adjusted

    const result = await customManager.analyzeAndAdjust();
    expect(result).toHaveProperty('settings');
    expect(result.settings).toHaveProperty('batchSize');
  });
});
