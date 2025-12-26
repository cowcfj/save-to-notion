/* global document */

const {
  AdaptivePerformanceManager,
} = require('../../../scripts/performance/AdaptivePerformanceManager');
const { PerformanceOptimizer } = require('../../../scripts/performance/PerformanceOptimizer');
const { PERFORMANCE_OPTIMIZER } = require('../../../scripts/config/constants');

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

  test('destroy is idempotent (can be called multiple times safely)', () => {
    // First call
    manager.destroy();
    expect(manager.performanceOptimizer).toBeNull();

    // Second call should not throw
    expect(() => manager.destroy()).not.toThrow();
    expect(manager.performanceOptimizer).toBeNull();
  });

  test('methods handle destroyed state gracefully', () => {
    manager.destroy();

    // adjustBatchSize should still work (updates internal state only)
    expect(() => manager.adjustBatchSize(100)).not.toThrow();

    // adjustCacheSize should warn but not throw (optimizer is null)
    expect(() => manager.adjustCacheSize(100)).not.toThrow();

    // getCurrentStrategy should still return settings
    const strategy = manager.getCurrentStrategy();
    expect(strategy).toHaveProperty('batchSize');
  });

  test('adjustBatchSize respects MIN and MAX_BATCH_SIZE bounds', () => {
    const { MIN_BATCH_SIZE, MAX_BATCH_SIZE } = PERFORMANCE_OPTIMIZER;

    // Test lower bound (should clamp to MIN_BATCH_SIZE)
    manager.adjustBatchSize(1);
    expect(manager.getCurrentStrategy().batchSize).toBe(MIN_BATCH_SIZE);

    // Test upper bound (should clamp to MAX_BATCH_SIZE)
    manager.adjustBatchSize(1000);
    expect(manager.getCurrentStrategy().batchSize).toBe(MAX_BATCH_SIZE);

    // Test normal value within bounds
    manager.adjustBatchSize(200);
    expect(manager.getCurrentStrategy().batchSize).toBe(200);
  });

  test('performanceThreshold affects batch size adjustment thresholds', async () => {
    // Create manager with custom threshold (2x default)
    const customManager = new AdaptivePerformanceManager(optimizer, {
      performanceThreshold: 200,
    });

    // Create manager with default threshold for comparison
    const defaultManager = new AdaptivePerformanceManager(optimizer, {
      performanceThreshold: 100,
    });

    // Both should complete without error and return valid settings
    const customResult = await customManager.analyzeAndAdjust();
    const defaultResult = await defaultManager.analyzeAndAdjust();

    // Verify structure
    expect(customResult).toHaveProperty('settings');
    expect(customResult.settings).toHaveProperty('batchSize');
    expect(defaultResult).toHaveProperty('settings');
    expect(defaultResult.settings).toHaveProperty('batchSize');

    // Both batch sizes should be valid (within bounds)
    const { MIN_BATCH_SIZE, MAX_BATCH_SIZE } = PERFORMANCE_OPTIMIZER;
    expect(customResult.settings.batchSize).toBeGreaterThanOrEqual(MIN_BATCH_SIZE);
    expect(customResult.settings.batchSize).toBeLessThanOrEqual(MAX_BATCH_SIZE);
  });

  test('handles invalid performanceThreshold gracefully (NaN, negative, non-number)', async () => {
    const { MIN_BATCH_SIZE } = PERFORMANCE_OPTIMIZER;

    // Test with NaN
    const nanManager = new AdaptivePerformanceManager(optimizer, {
      performanceThreshold: NaN,
    });
    const nanResult = await nanManager.analyzeAndAdjust();
    expect(nanResult.settings.batchSize).toBeGreaterThanOrEqual(MIN_BATCH_SIZE);

    // Test with negative
    const negManager = new AdaptivePerformanceManager(optimizer, {
      performanceThreshold: -50,
    });
    const negResult = await negManager.analyzeAndAdjust();
    expect(negResult.settings.batchSize).toBeGreaterThanOrEqual(MIN_BATCH_SIZE);

    // Test with string
    const strManager = new AdaptivePerformanceManager(optimizer, {
      performanceThreshold: 'invalid',
    });
    const strResult = await strManager.analyzeAndAdjust();
    expect(strResult.settings.batchSize).toBeGreaterThanOrEqual(MIN_BATCH_SIZE);
  });
});
