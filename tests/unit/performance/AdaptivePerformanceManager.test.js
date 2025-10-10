const { AdaptivePerformanceManager } = require('../../../scripts/performance/AdaptivePerformanceManager');
const { PerformanceOptimizer } = require('../../helpers/performance.testable');

describe('AdaptivePerformanceManager', () => {
  let optimizer;
  let manager;

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

    const s = manager.getCurrentStrategy();
    expect(s.batchSize).toBeGreaterThanOrEqual(1);
    expect(s.cacheSize).toBeGreaterThanOrEqual(50);
    // optimizer options also updated
    expect(optimizer.options.cacheMaxSize).toBe(s.cacheSize);
  });
});
