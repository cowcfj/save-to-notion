/**
 * PerformanceOptimizer 單元測試
 * 測試性能優化器的核心功能
 */
/* eslint-env jest */

// 模擬 DOM 環境
const { PerformanceOptimizer } = require('../../../scripts/performance/PerformanceOptimizer');

describe('PerformanceOptimizer', () => {
  let optimizer = null;

  beforeEach(() => {
    // Setup DOM for tests
    document.title = 'Test';
    document.body.innerHTML = `
      <div class="test-container">
          <img src="test1.jpg" alt="Test 1">
          <img src="test2.jpg" alt="Test 2">
          <p>Test paragraph 1</p>
          <p>Test paragraph 2</p>
          <a href="#test">Test link</a>
      </div>
    `;

    // Mock performance.now
    if (!global.performance) {
      global.performance = { now: () => Date.now() };
    }

    // Mock window.__NOTION_PRELOADER_CACHE__
    delete window.__NOTION_PRELOADER_CACHE__;

    optimizer = new PerformanceOptimizer({
      enableCache: true,
      enableBatching: true,
      enableMetrics: true,
      cacheMaxSize: 100,
    });
  });

  describe('DOM 查詢緩存', () => {
    test('應該緩存查詢結果', () => {
      const selector = 'img';

      // 第一次查詢
      const result1 = optimizer.cachedQuery(selector, document);
      expect(result1).toBeDefined();
      expect(Array.from(result1).length).toBe(2);

      // 第二次查詢應該使用緩存
      const result2 = optimizer.cachedQuery(selector, document);
      expect(result2).toBe(result1); // 應該是相同的對象引用

      // 檢查統計
      const stats = optimizer.getPerformanceStats();
      expect(stats.cache.hitRate).toBeCloseTo(0.5); // 1 hit out of 2 queries (50%)
    });

    test('應該支持單個元素查詢', () => {
      const selector = '.test-container';

      const result = optimizer.cachedQuery(selector, document, { single: true });
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      if (result) {
        expect(result.tagName).toBe('DIV');
      }
    });

    test('應該處理無效選擇器', () => {
      const selector = ':::invalid:::';

      const result = optimizer.cachedQuery(selector);
      expect(Array.from(result)).toEqual([]);
    });

    test('應該限制緩存大小', () => {
      const smallOptimizer = new PerformanceOptimizer({
        cacheMaxSize: 2,
      });

      // 添加超過限制的查詢（使用不同的選擇器和選項來確保不同的緩存鍵）
      smallOptimizer.cachedQuery('img', document, { single: true });
      smallOptimizer.cachedQuery('p', document, { all: true });

      let stats = smallOptimizer.getPerformanceStats();
      expect(stats.cache.size).toBe(2);

      // 添加第三個查詢，應該觸發驅逐
      smallOptimizer.cachedQuery('a', document, { single: false });

      stats = smallOptimizer.getPerformanceStats();
      expect(stats.cache.size).toBeLessThanOrEqual(2);
      expect(stats.cache.evictions).toBeGreaterThan(0);
    });
  });

  describe('批處理系統', () => {
    test('應該批處理圖片操作', async () => {
      const images = [{ src: 'test1.jpg' }, { src: 'test2.jpg' }, { src: 'test3.jpg' }];

      const processor = img => ({ url: img.src, processed: true });

      const results = await optimizer.batchProcessImages(images, processor);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ url: 'test1.jpg', processed: true });
      expect(results[1]).toEqual({ url: 'test2.jpg', processed: true });
      expect(results[2]).toEqual({ url: 'test3.jpg', processed: true });
    });

    test('應該批處理 DOM 操作', async () => {
      const operations = [() => 'operation1', () => 'operation2', () => 'operation3'];

      const results = await optimizer.batchDomOperations(operations);

      expect(results).toEqual(['operation1', 'operation2', 'operation3']);
    });

    test('應該處理批處理錯誤', async () => {
      const images = [{ src: 'test.jpg' }];
      const processor = () => {
        throw new Error('Processing failed');
      };

      await expect(optimizer.batchProcessImages(images, processor)).resolves.toEqual([]);
    });
  });

  describe('性能監控', () => {
    test('應該收集性能統計', () => {
      // 執行一些操作
      optimizer.cachedQuery('img');
      optimizer.cachedQuery('p');
      optimizer.cachedQuery('img'); // 緩存命中

      const stats = optimizer.getPerformanceStats();

      expect(stats).toHaveProperty('cache');
      expect(stats).toHaveProperty('batch');
      expect(stats).toHaveProperty('queries');

      expect(stats.cache.size).toBeGreaterThan(0);
      expect(stats.cache.hitRate).toBeDefined();
      expect(stats.queries.total).toBeGreaterThan(0);
    });

    test('應該測量函數執行時間', () => {
      const testFunction = () => {
        // 模擬一些工作
        let sum = 0;
        for (let i = 0; i < 1000; i++) {
          sum += i;
        }
        return sum;
      };

      const result = optimizer.measure(testFunction, 'test-function');
      expect(result).toBe(499500); // 0+1+2+...+999 = 499500
    });

    test('應該測量異步函數執行時間', async () => {
      const asyncFunction = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async-result';
      };

      const result = await optimizer.measureAsync(asyncFunction, 'async-test');
      expect(result).toBe('async-result');
    });
  });

  describe('預加載功能', () => {
    test('應該預加載選擇器', () => {
      const selectors = ['img', 'p', 'a'];

      // 預加載不應該拋出錯誤
      expect(() => {
        optimizer.preloadSelectors(selectors);
      }).not.toThrow();
    });
  });

  describe('緩存管理', () => {
    test('應該清理所有緩存', () => {
      // 添加一些緩存項
      optimizer.cachedQuery('img');
      optimizer.cachedQuery('p');

      let stats = optimizer.getPerformanceStats();
      expect(stats.cache.size).toBeGreaterThan(0);

      // 清理緩存
      optimizer.clearCache({ force: true });

      stats = optimizer.getPerformanceStats();
      expect(stats.cache.size).toBe(0);
      expect(stats.cache.hits).toBe(0);
      expect(stats.cache.misses).toBe(0);
    });

    // skip 'should clean by pattern' as it's not supported in prod implementation
    test.skip('應該按模式清理緩存', () => {
      // 添加不同的緩存項
      optimizer.cachedQuery('img.test');
      optimizer.cachedQuery('p.test');
      optimizer.cachedQuery('div.other');

      // 清理包含 'test' 的緩存
      optimizer.clearCache('test');

      const stats = optimizer.getPerformanceStats();
      expect(stats.cache.size).toBe(1); // 只剩下 'div.other'
    });
  });

  describe('快取接管 (takeoverPreloaderCache)', () => {
    beforeEach(() => {
      // 清理全域快取
      delete window.__NOTION_PRELOADER_CACHE__;
    });

    test('如果無快取應返回 0', () => {
      const result = optimizer.takeoverPreloaderCache();
      expect(result).toEqual({ taken: 0 });
    });

    test('如果快取已過期應返回 expired', () => {
      global.window.__NOTION_PRELOADER_CACHE__ = {
        timestamp: Date.now() - 60000, // 1 分鐘前
        article: document.createElement('article'),
      };

      const result = optimizer.takeoverPreloaderCache({ maxAge: 30000 });
      expect(result).toEqual({ taken: 0, expired: true });
    });

    test('應該成功接管有效的快取', () => {
      const article = document.createElement('article');
      const main = document.createElement('main');

      // 確保元素附加到 DOM，否則 _validateCachedElements 會返回 false
      document.body.appendChild(article);
      document.body.appendChild(main);

      global.window.__NOTION_PRELOADER_CACHE__ = {
        timestamp: Date.now(),
        article,
        mainContent: main,
      };

      const result = optimizer.takeoverPreloaderCache();

      expect(result.taken).toBe(2);

      // 驗證快取是否已進入 PerformanceOptimizer
      const stats = optimizer.getPerformanceStats();
      expect(stats.cache.size).toBe(2);

      // 驗證能否從快取讀取
      const cachedArticle = optimizer.cachedQuery('article', document, { single: true });
      expect(cachedArticle).toBe(article);
    });

    test('應該拒絕未連接到 DOM 的元素 (isConnected: false)', () => {
      const article = document.createElement('article');
      // 不執行 document.body.appendChild(article)

      global.window.__NOTION_PRELOADER_CACHE__ = {
        timestamp: Date.now(),
        article, // 未連接
      };

      const result = optimizer.takeoverPreloaderCache();
      expect(result.taken).toBe(0);
    });

    test('應該拒絕不匹配選擇器的元素', () => {
      const div = document.createElement('div'); // 不是 article
      document.body.appendChild(div);

      global.window.__NOTION_PRELOADER_CACHE__ = {
        timestamp: Date.now(),
        article: div, // 類型錯誤
      };

      const result = optimizer.takeoverPreloaderCache();
      expect(result.taken).toBe(0);
    });

    test('應該拒絕來自不同文檔的元素 (防篡改)', () => {
      const article = document.createElement('article');
      document.body.appendChild(article);

      // 模擬 ownerDocument 不匹配
      Object.defineProperty(article, 'ownerDocument', {
        value: {}, // 偽造一個不同的 document 對象
        configurable: true,
      });

      global.window.__NOTION_PRELOADER_CACHE__ = {
        timestamp: Date.now(),
        article,
      };

      const result = optimizer.takeoverPreloaderCache();
      expect(result.taken).toBe(0);
    });

    test('應該拒絕結構無效的快取 (缺少 timestamp)', () => {
      global.window.__NOTION_PRELOADER_CACHE__ = {
        article: document.createElement('article'),
      };

      const result = optimizer.takeoverPreloaderCache();
      expect(result.taken).toBe(0);
    });

    test('應該拒絕無效的 timestamp (非數值)', () => {
      global.window.__NOTION_PRELOADER_CACHE__ = {
        timestamp: 'invalid', // 字串
        article: document.createElement('article'),
      };

      const result = optimizer.takeoverPreloaderCache();
      expect(result.taken).toBe(0);
    });

    test('應該拒絕無效的 timestamp (NaN)', () => {
      global.window.__NOTION_PRELOADER_CACHE__ = {
        timestamp: NaN, // NaN
        article: document.createElement('article'),
      };

      const result = optimizer.takeoverPreloaderCache();
      expect(result.taken).toBe(0);
    });
  });
});
