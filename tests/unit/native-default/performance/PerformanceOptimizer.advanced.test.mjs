import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { PERFORMANCE_HTML_FIXTURE } from '../../../helpers/performanceOptimizerTestHarness.js';
import loggerMock from '../../../helpers/loggerMock.cjs';

const { createLoggerMock } = loggerMock;

await jest.unstable_mockModule('../../../../scripts/utils/Logger.js', () => ({
  default: createLoggerMock(),
}));

const { PerformanceOptimizer } =
  await import('../../../../scripts/performance/PerformanceOptimizer.js');

describe('PerformanceOptimizer extended coverage', () => {
  let optimizer = null;
  let chromeState = null;

  const setupOptimizer = ({ bodyHtml, options }) => {
    chromeState = {
      hadChrome: Object.hasOwn(globalThis, 'chrome'),
      originalChrome: globalThis.chrome,
    };
    document.body.innerHTML = bodyHtml;
    optimizer = new PerformanceOptimizer(options);
  };

  afterEach(() => {
    jest.clearAllMocks();
    if (chromeState?.hadChrome) {
      globalThis.chrome = chromeState.originalChrome;
    } else {
      delete globalThis.chrome;
    }
    optimizer = null;
    chromeState = null;
    document.body.innerHTML = '';
  });

  // =========================================
  // 合併自 PerformanceOptimizer.extra.test.js
  // =========================================
  /* global document */

  describe('PerformanceOptimizer（額外測試）', () => {
    beforeEach(() => {
      setupOptimizer({
        bodyHtml: '',
        options: { cacheMaxSize: 50, enableBatching: true },
      });
    });

    test('cachedQuery 應快取並返回元素', () => {
      document.body.innerHTML =
        '<div class="root"><span class="a">x</span><span class="a">y</span></div>';

      const beforeHits = optimizer.cacheStats.hits;
      const beforeSize = optimizer.queryCache.size;
      const res1 = optimizer.cachedQuery('.a', document);
      expect(res1).toBeDefined();
      expect(optimizer.queryCache.size).toBe(beforeSize + 1);

      // 第二次查詢應命中快取
      optimizer.cachedQuery('.a', document);
      // 命中統計與快取大小應符合預期
      expect(optimizer.cacheStats.hits).toBe(beforeHits + 1);
      expect(optimizer.queryCache.size).toBe(beforeSize + 1);
    });

    test('clearExpiredCache(force) 應清空所有條目', () => {
      document.body.innerHTML = '<p class="t">1</p>';
      optimizer.cachedQuery('.t');
      expect(optimizer.queryCache.size).toBeGreaterThan(0);

      optimizer.clearExpiredCache({ force: true });
      expect(optimizer.queryCache.size).toBe(0);
    });

    test('preloadSelectors 應增加預熱計數', async () => {
      document.body.innerHTML = '<article><p>p</p><img src="x.png"/></article>';

      const beforePrewarms = optimizer.cacheStats.prewarms;
      const res = await optimizer.preloadSelectors(['article img', 'article p']);
      expect(Array.isArray(res)).toBe(true);
      expect(optimizer.cacheStats.prewarms).toBeGreaterThan(beforePrewarms);
    });
  });

  // =========================================
  // 合併自 PerformanceOptimizerAdvanced.test.js
  // =========================================
  /**
   * PerformanceOptimizer 進階功能測試
   * 測試新增的緩存預熱、TTL 機制和批處理優化功能
   */

  describe('PerformanceOptimizer 進階功能測試', () => {
    beforeEach(() => {
      setupOptimizer({
        bodyHtml: PERFORMANCE_HTML_FIXTURE,
        options: {
          enableCache: true,
          enableBatching: true,
          cacheMaxSize: 100,
          cacheTTL: 300_000, // 5分鐘 TTL
        },
      });
    });

    describe('TTL 機制和緩存管理', () => {
      test('應該支持 TTL 機制', () => {
        const selector = 'img';

        // 第一次查詢，結果會被緩存
        const _result1 = optimizer.cachedQuery(selector, document);
        expect(_result1).toBeDefined();

        // 驗證結果已緩存
        const stats = optimizer.getPerformanceStats();
        expect(stats.cache.size).toBeGreaterThan(0);

        // 檢查緩存對象是否包含 TTL 信息
        const cacheKeys = Array.from(optimizer.queryCache.keys());
        if (cacheKeys.length > 0) {
          const cachedItem = optimizer.queryCache.get(cacheKeys[0]);
          expect(cachedItem).toHaveProperty('timestamp');
          expect(cachedItem).toHaveProperty('ttl');
        }
      });

      test('應該清理過期緩存', () => {
        const selector = 'p';

        // 添加項目到緩存
        optimizer.cachedQuery(selector, document);
        expect(optimizer.getPerformanceStats().cache.size).toBeGreaterThan(0);

        // 手動設置一個過期的緩存項目
        const expiredKey = 'expired_test_key';
        optimizer.queryCache.set(expiredKey, {
          result: 'test_result',
          timestamp: Date.now() - 400_000, // 5分鐘前，已過期
          ttl: 300_000,
        });
        const sizeBeforeClear = optimizer.getPerformanceStats().cache.size;

        // 清理過期緩存
        const clearedCount = optimizer.clearExpiredCache();

        // 應該至少清理一個過期項目，且大小應按清理數量下降
        expect(clearedCount).toBeGreaterThan(0);
        const finalStats = optimizer.getPerformanceStats();
        expect(finalStats.cache.size).toBe(sizeBeforeClear - clearedCount);
      });

      test('應該強制刷新特定選擇器緩存', () => {
        const selector = 'a';

        // 初始查詢
        const _result1 = optimizer.cachedQuery(selector, document);
        expect(_result1).toBeDefined();

        // 刷新緩存
        optimizer.refreshCache(selector);

        // 再次查詢，雖然緩存被刷新，但結果應該相同
        const result2 = optimizer.cachedQuery(selector, document);
        expect(result2).toBeDefined();
      });

      test('應該維護緩存大小限制', () => {
        // 創建一個小容量的優化器
        const smallOptimizer = new PerformanceOptimizer({
          cacheMaxSize: 2,
          cacheTTL: 300_000,
        });

        // 添加超過限制的查詢
        smallOptimizer.cachedQuery('img');
        smallOptimizer.cachedQuery('p');
        smallOptimizer.cachedQuery('a'); // 這應該觸發 LRU 驅逐

        const stats = smallOptimizer.getPerformanceStats();
        expect(stats.cache.size).toBeLessThanOrEqual(2);
      });
    });

    describe('緩存預熱功能', () => {
      test('應該預熱選擇器', async () => {
        const selectors = ['img', 'p', 'article'];

        // 預熱選擇器
        const results = await optimizer.preloadSelectors(selectors);

        expect(Array.isArray(results)).toBe(true);
        expect(results).toHaveLength(selectors.length);

        // 驗證預熱計數增加
        const stats = optimizer.getPerformanceStats();
        expect(stats.cache.prewarms).toBeGreaterThan(0);
        expect(stats.cache.hitRate).toBeDefined();
      });

      test('應該進行智能預熱', async () => {
        const beforePrewarms = optimizer.getPerformanceStats().cache.prewarms;
        // 執行智能預熱
        const results = await optimizer.smartPrewarm(document);

        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThan(0);

        // 確保一些選擇器被預熱
        const stats = optimizer.getPerformanceStats();
        expect(stats.cache.prewarms).toBeGreaterThan(beforePrewarms);
      });

      test('應該避免重複預熱相同選擇器', async () => {
        const selector = 'img';
        const beforePrewarms = optimizer.getPerformanceStats().cache.prewarms;

        // 第一次預熱
        await optimizer.preloadSelectors([selector]);
        const afterFirstPrewarms = optimizer.getPerformanceStats().cache.prewarms;

        // 第二次預熱相同的選擇器
        await optimizer.preloadSelectors([selector]);

        // 第三次預熱相同的選擇器
        await optimizer.preloadSelectors([selector]);
        const stats = optimizer.getPerformanceStats();
        expect(afterFirstPrewarms).toBeGreaterThan(beforePrewarms);
        expect(stats.cache.prewarms).toBe(afterFirstPrewarms);
      });
    });

    describe('改進的批處理系統', () => {
      test('應該動態計算最佳批處理大小', () => {
        // 測試不同的隊列大小
        const size0 = optimizer._calculateOptimalBatchSize();
        expect(size0).toBe(100); // 默認大小

        // 模擬不同隊列長度
        optimizer.batchQueue = Array.from({ length: 10 });
        const size1 = optimizer._calculateOptimalBatchSize();
        expect(size1).toBe(50); // 中等大小

        optimizer.batchQueue = Array.from({ length: 300 });
        const size2 = optimizer._calculateOptimalBatchSize();
        expect(size2).toBe(150); // 較大

        optimizer.batchQueue = Array.from({ length: 600 });
        const size3 = optimizer._calculateOptimalBatchSize();
        expect(size3).toBe(200); // 最大
      });

      test('應該根據性能動態調整批處理大小', () => {
        const originalSize = 50;

        // 模擬低性能場景
        optimizer.metrics.averageProcessingTime = 200; // 高處理時間
        const adjustedSize1 = optimizer._adjustBatchSizeForPerformance(originalSize);
        expect(adjustedSize1).toBeLessThan(originalSize);

        // 模擬高性能場景
        optimizer.metrics.averageProcessingTime = 5; // 低處理時間
        const adjustedSize2 = optimizer._adjustBatchSizeForPerformance(originalSize);
        expect(adjustedSize2).toBeGreaterThan(originalSize);
      });
    });

    describe('頁面分析功能', () => {
      test('應該分析頁面內容', () => {
        const analysis = optimizer._analyzePageForPrewarming(document);
        expect(Array.isArray(analysis)).toBe(true);

        // 應該包含一些基於文檔結構的選擇器
        expect(analysis.length).toBeGreaterThan(0);
      });

      test('應該讓出控制權給主線程', async () => {
        // 測試讓出控制權功能
        const _result = await PerformanceOptimizer._yieldToMain();
        expect(_result).toBeUndefined(); // setTimeout(resolve) 返回 undefined
      });
    });
  });
});
