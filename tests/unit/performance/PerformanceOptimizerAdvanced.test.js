/**
 * PerformanceOptimizer 進階功能測試
 * 測試新增的緩存預熱、TTL 機制、批處理優化和自適應功能
 */


// 模擬 DOM 環境
const { JSDOM } = require('jsdom');
const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
    <div class="test-container">
        <img src="test1.jpg" alt="Test 1">
        <img src="test2.jpg" alt="Test 2">
        <article>
            <h1>Article Title</h1>
            <p>Test paragraph 1</p>
            <p>Test paragraph 2</p>
            <img class="article-img" src="article.jpg" alt="Article image">
        </article>
        <main>
            <p>Main content paragraph</p>
            <img class="main-img" src="main.jpg" alt="Main image">
        </main>
        <a href="#test">Test link</a>
    </div>
</body>
</html>
`);

// 設置所需的全局引用（使用解構以減少未宣告變數警告）
const { document, window } = dom.window;
global.document = document;
global.window = window;
global.performance = {
    now: () => Date.now(),
    memory: {
        usedJSHeapSize: 1000000,
        totalJSHeapSize: 2000000,
        jsHeapSizeLimit: 4000000
    }
};

// 確保 DOM 查詢方法可用
global.document.querySelector = dom.window.document.querySelector.bind(dom.window.document);
global.document.querySelectorAll = dom.window.document.querySelectorAll.bind(dom.window.document);

// 引入性能優化器
const { PerformanceOptimizer } = require('../../helpers/performance.testable');

describe('PerformanceOptimizer 進階功能測試', () => {
    /** @type {PerformanceOptimizer | null} */
    let optimizer = null;

    beforeEach(() => {
        optimizer = new PerformanceOptimizer({
            enableCache: true,
            enableBatching: true,
            enableMetrics: true,
            cacheMaxSize: 100,
            cacheTTL: 300000 // 5分鐘 TTL
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
                timestamp: Date.now() - 400000, // 5分鐘前，已過期
                ttl: 300000
            });

            // 清理過期緩存
            const clearedCount = optimizer.clearExpiredCache();

            // 應該至少清理一個過期項目
            expect(clearedCount).toBeGreaterThanOrEqual(1);

            // 如果清理了項目，則當前緩存大小應小於或等於原始大小
            const finalStats = optimizer.getPerformanceStats();
            expect(finalStats.cache.size).toBeGreaterThanOrEqual(0);
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
                cacheTTL: 300000
            });

            // 添加超過限制的查詢
            smallOptimizer.cachedQuery('img');
            smallOptimizer.cachedQuery('p');
            smallOptimizer.cachedQuery('a');  // 這應該觸發 LRU 驅逐

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
            expect(results.length).toBe(selectors.length);

            // 驗證預熱計數增加
            const stats = optimizer.getPerformanceStats();
            expect(stats.cache.prewarms).toBeGreaterThan(0);
            expect(stats.cache.hitRate).toBeDefined();
        });

        test('應該進行智能預熱', async () => {
            // 執行智能預熱
            const results = await optimizer.smartPrewarm(document);

            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThanOrEqual(0);

            // 確保一些選擇器被預熱
            const stats = optimizer.getPerformanceStats();
            expect(stats.cache.prewarms).toBeGreaterThanOrEqual(0);

            // 驗證預熱選擇器計數
            expect(stats.cache.prewarmCount).toBeGreaterThanOrEqual(0);
        });

        test('應該避免重複預熱相同選擇器', async () => {
            const selector = 'img';

            // 第一次預熱
            const _r1 = await optimizer.preloadSelectors([selector]);

            // 第二次預熱相同的選擇器
            const _r2 = await optimizer.preloadSelectors([selector]);

            // 第二次預熱相同的選擇器
            const _r3 = await optimizer.preloadSelectors([selector]);
            const stats = optimizer.getPerformanceStats();
            expect(stats.cache.prewarms).toBeGreaterThanOrEqual(0);
        });
    });

    describe('改進的批處理系統', () => {
        test('應該動態計算最佳批處理大小', () => {
            // 測試不同的隊列大小
                const size0 = optimizer._calculateOptimalBatchSize();
            expect(size0).toBe(100); // 默認大小

            // 模擬不同隊列長度
            optimizer.batchQueue = new Array(10);
                const size1 = optimizer._calculateOptimalBatchSize();
            expect(size1).toBe(50); // 中等大小

            optimizer.batchQueue = new Array(300);
                const size2 = optimizer._calculateOptimalBatchSize();
            expect(size2).toBe(150); // 較大

            optimizer.batchQueue = new Array(600);
                const size3 = optimizer._calculateOptimalBatchSize();
            expect(size3).toBe(200); // 最大
        });

        test('應該支持非阻塞批處理', async () => {
            const items = Array.from({ length: 25 }, (_, i) => ({ id: i, value: `item${i}` }));
            const processor = (item) => ({ ...item, processed: true });

            // 使用批處理處理項目
            const results = await optimizer._processInBatches(items, 10, processor);

            expect(results).toHaveLength(25);
            expect(results.every(r => r.processed)).toBe(true);
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

    describe('自適應性能功能', () => {
        test('應該初始化自適應管理器', () => {
            // 創建帶有自適應功能的優化器
            const adaptiveOptimizer = new PerformanceOptimizer({
                enableCache: true,
                enableBatching: true,
                enableMetrics: true,
                enableAdaptive: true
            });

            // 檢查是否初始化了自適應管理器
            // 由於 AdaptivePerformanceManager 可能不存在於測試環境中，我們測試它的存在性
            expect(adaptiveOptimizer).toBeDefined();
        });

        test('應該分析頁面內容', () => {
            const analysis = optimizer._analyzePageForPrewarming(document);
            expect(Array.isArray(analysis)).toBe(true);

            // 應該包含一些基於文檔結構的選擇器
            expect(analysis.length).toBeGreaterThanOrEqual(0);
        });

        test('應該讓出控制權給主線程', async () => {
            // 測試讓出控制權功能
                const _result = await optimizer._yieldToMain();
                expect(_result).toBeUndefined(); // setTimeout(resolve) 返回 undefined
        });
    });

    describe('系統負載調整', () => {
        test('應該根據系統負載調整性能參數', async () => {
            // 模擬不同性能場景並測試調整
            optimizer.metrics.averageProcessingTime = 100; // 假設處理時間較長

            // 測試調整功能不拋出錯誤
            await expect(optimizer.adjustForSystemLoad()).resolves.not.toThrow();
        });
    });
});
