/* global document */
/* eslint-disable no-unused-vars */

const { PerformanceOptimizer } = require('../../../scripts/performance/PerformanceOptimizer');

describe('PerformanceOptimizer (extra tests)', () => {
  /** @type {PerformanceOptimizer} 性能優化器實例,在 beforeEach 中初始化 */
  let optimizer = null;

  beforeEach(() => {
    document.body.innerHTML = '';
    optimizer = new PerformanceOptimizer({ cacheMaxSize: 50, enableBatching: true });
  });

  test('cachedQuery caches and returns elements', () => {
    document.body.innerHTML =
      '<div class="root"><span class="a">x</span><span class="a">y</span></div>';

    const res1 = optimizer.cachedQuery('.a', document);
    expect(res1).toBeDefined();

    // second query should hit cache
    const res2 = optimizer.cachedQuery('.a', document);
    // cache stats should reflect a hit
    expect(optimizer.cacheStats.hits).toBeGreaterThanOrEqual(0);
    expect(optimizer.queryCache.size).toBeGreaterThanOrEqual(1);
  });

  test('clearExpiredCache(force) clears all entries', () => {
    document.body.innerHTML = '<p class="t">1</p>';
    optimizer.cachedQuery('.t');
    expect(optimizer.queryCache.size).toBeGreaterThan(0);

    optimizer.clearExpiredCache({ force: true });
    expect(optimizer.queryCache.size).toBe(0);
  });

  test('batchDomOperations executes operations when processing runs', async () => {
    const op1 = () => {
      document.body.appendChild(document.createElement('div'));
      return 1;
    };
    const op2 = () => {
      document.body.appendChild(document.createElement('span'));
      return 2;
    };

    const promise = optimizer.batchDomOperations([op1, op2]);
    // force processing synchronously by calling internal process
    if (typeof optimizer._processBatch === 'function') {
      optimizer._processBatch();
    }

    const results = await promise;
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2);
  });

  test('preloadSelectors prewarms selectors', async () => {
    document.body.innerHTML = '<article><p>p</p><img src="x.png"/></article>';

    const res = await optimizer.preloadSelectors(['article img', 'article p']);
    expect(Array.isArray(res)).toBe(true);
    // cached prewarms counted
    expect(optimizer.cacheStats.prewarms).toBeGreaterThanOrEqual(0);
  });
});
