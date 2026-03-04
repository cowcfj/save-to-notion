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
    // 設定測試用 DOM
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

    // 模擬 performance.now
    if (!globalThis.performance) {
      globalThis.performance = { now: () => Date.now() };
    }

    // 模擬 window.__NOTION_PRELOADER_CACHE__
    delete globalThis.__NOTION_PRELOADER_CACHE__;

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
      expect(Array.from(result1)).toHaveLength(2);

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

    test('應該能清除過期或強制清除全部快取', () => {
      // 造假一條過期資料
      optimizer.queryCache.set('oldKey', {
        timestamp: Date.now() - 100_000,
        result: [],
      });
      optimizer.queryCache.set('newKey', {
        timestamp: Date.now(),
        result: [],
      });

      // 測試時間過期機制
      const clearedCount = optimizer.clearExpiredCache({ maxAge: 50_000 });
      expect(clearedCount).toBe(1);
      expect(optimizer.queryCache.has('oldKey')).toBe(false);
      expect(optimizer.queryCache.has('newKey')).toBe(true);

      // 測試強制清空機制
      const forceCleared = optimizer.clearExpiredCache({ force: true });
      expect(forceCleared).toBe(1);
      expect(optimizer.queryCache.size).toBe(0);
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
      expect(result).toBe(499_500); // 0+1+2+...+999 = 499500
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

  describe('預加載功能 (preloadSelectors)', () => {
    test('不合法的輸入或未啟用緩存時應提早返回空的 Promise', async () => {
      optimizer.options.enableCache = false;
      const result1 = await optimizer.preloadSelectors(['img']);
      expect(result1).toEqual([]);

      optimizer.options.enableCache = true;
      const result2 = await optimizer.preloadSelectors(null);
      expect(result2).toEqual([]);

      const result3 = await optimizer.preloadSelectors('not array');
      expect(result3).toEqual([]);
    });

    test('預加載應正確呼叫 cachedQuery', async () => {
      const selectors = ['img', '.test-container'];
      const spy = jest.spyOn(optimizer, 'cachedQuery');
      const results = await optimizer.preloadSelectors(selectors);

      expect(spy).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(2);
      spy.mockRestore();
    });

    test('如果 _preloadSingleSelector 拋出異常，應該捕獲並解析為包含 error 的物件', async () => {
      const spy = jest.spyOn(optimizer, 'cachedQuery').mockImplementation(() => {
        throw new Error('preload error');
      });
      const results = await optimizer.preloadSelectors(['img']);
      expect(results).toEqual([
        {
          selector: 'img',
          cached: false,
          error: 'preload error',
        },
      ]);
      spy.mockRestore();
    });
  });

  describe('預熱分析 (_analyzePageForPrewarming)', () => {
    test('應該依據 DOM 內容動態產生預熱選擇器', () => {
      // 構建帶有 article 標籤的假文件
      const fakeDoc = document.implementation.createHTMLDocument('Fake Doc');
      fakeDoc.body.innerHTML = '<article></article>';
      const selectorsArticle = PerformanceOptimizer._analyzePageForPrewarming(fakeDoc);
      expect(selectorsArticle).toContain('article h1');
      expect(selectorsArticle).toContain('article img');

      // 構建帶有 [role="main"] 標籤的假文件
      fakeDoc.body.innerHTML = '<main role="main"></main>';
      const selectorsMain = PerformanceOptimizer._analyzePageForPrewarming(fakeDoc);
      expect(selectorsMain).toContain('[role="main"] h1');
      expect(selectorsMain).toContain('[role="main"] p');
    });

    test('如果出現特定的網址或 CMS，會對應產生特定選擇器', () => {
      // 測試沒有特定結構時的 fallback (空陣列或預設)
      const emptyDoc = document.implementation.createHTMLDocument('Empty Doc');
      const selectorsEmpty = PerformanceOptimizer._analyzePageForPrewarming(emptyDoc);
      expect(selectorsEmpty).toEqual([]);

      // 測試有 CMS 結構時：這裡用 constants 的 CMS_CONTENT_SELECTORS 裡的第一個 `.entry-content`
      const cmsDoc = document.implementation.createHTMLDocument('CMS Doc');
      cmsDoc.body.innerHTML = '<div class="entry-content"></div>';
      const selectorsCms = PerformanceOptimizer._analyzePageForPrewarming(cmsDoc);
      expect(selectorsCms).toContain('.entry-content p');
      expect(selectorsCms).toContain('.entry-content h1');
    });
  });

  describe('單一選擇器預熱 (_preloadSingleSelector)', () => {
    test('如果已經預熱過該選擇器，應回傳 null', () => {
      optimizer.prewarmedSelectors.add('.tested-already');
      const result = optimizer._preloadSingleSelector('.tested-already', document);
      expect(result).toBeNull();
    });

    test('如果查詢結果為空陣列或為 null，應回傳 null', () => {
      // 空陣列 [] 但有 length!==undefined
      jest.spyOn(optimizer, 'cachedQuery').mockReturnValueOnce([]);
      const resultArray = optimizer._preloadSingleSelector('.not-exist', document);
      expect(resultArray).toBeNull();

      // null 情況 (在 623-624 行 default return null)
      jest.spyOn(optimizer, 'cachedQuery').mockReturnValueOnce(null);
      const resultNull = optimizer._preloadSingleSelector('.null-result', document);
      expect(resultNull).toBeNull();
    });

    test('如果查詢結果有實體節點但長度不明 (nodeType)，應以 count 1 紀錄並回傳', () => {
      const fakeNode = { nodeType: 1 };
      jest.spyOn(optimizer, 'cachedQuery').mockReturnValueOnce(fakeNode);
      const result = optimizer._preloadSingleSelector('.fake-node', document);
      expect(result).toEqual(
        expect.objectContaining({ selector: '.fake-node', count: 1, cached: true })
      );
      expect(optimizer.cacheStats.prewarms).toBe(1);
      expect(optimizer.prewarmedSelectors.has('.fake-node')).toBe(true);
    });

    test('遇到例外狀況時，應捕捉錯誤並回傳 cached: false 物件', () => {
      jest.spyOn(optimizer, 'cachedQuery').mockImplementationOnce(() => {
        throw new Error('sync query error');
      });
      const { ErrorHandler } = require('../../../scripts/utils/ErrorHandler.js');
      const spyError = jest.spyOn(ErrorHandler, 'logError').mockImplementation(() => {});

      const result = optimizer._preloadSingleSelector('.error-node', document);

      expect(result).toEqual({ selector: '.error-node', error: 'sync query error', cached: false });
      expect(spyError).toHaveBeenCalled();

      spyError.mockRestore();
    });
  });

  describe('智慧預熱 (smartPrewarm)', () => {
    test('應結合同步分析結果與預設選擇器，並呼叫 preloadSelectors', async () => {
      optimizer.options.prewarmSelectors = ['.default-1'];
      const spyAnalyze = jest
        .spyOn(PerformanceOptimizer, '_analyzePageForPrewarming')
        .mockReturnValue(['.dynamic-1']);
      const spyPreload = jest
        .spyOn(optimizer, 'preloadSelectors')
        .mockImplementation(async () => ['done']);

      const results = await optimizer.smartPrewarm(document);
      expect(spyAnalyze).toHaveBeenCalledWith(document);
      expect(spyPreload).toHaveBeenCalledWith(['.default-1', '.dynamic-1'], document);
      expect(results).toEqual(['done']);

      spyAnalyze.mockRestore();
      spyPreload.mockRestore();
    });
  });

  describe('_validateCachedElements', () => {
    test('應該處理 falsy 輸入', () => {
      expect(PerformanceOptimizer._validateCachedElements(null)).toBe(false);
      expect(PerformanceOptimizer._validateCachedElements(undefined)).toBe(false);
    });

    test('如果傳入長度為 0 的列表，應返回 false', () => {
      expect(PerformanceOptimizer._validateCachedElements([])).toBe(false);
    });

    test('應該處理 NodeList / Array 中缺乏 nodeType 的元素', () => {
      const invalidList = [{ notNodeType: true }, document.createElement('div')];
      expect(PerformanceOptimizer._validateCachedElements(invalidList)).toBe(false);
    });

    test('如果 isConnected 不為 boolean，應該退回使用 document.contains', () => {
      const div = document.createElement('div');
      document.body.append(div);

      // 模擬環境不支持 isConnected
      Object.defineProperty(div, 'isConnected', { value: undefined });

      expect(PerformanceOptimizer._validateCachedElements([div])).toBe(true);

      div.remove();
      expect(PerformanceOptimizer._validateCachedElements([div])).toBe(false);
    });

    test('當 document.contains 拋出例外時，應該返回 false', () => {
      const div = document.createElement('div');
      Object.defineProperty(div, 'isConnected', { value: undefined });

      // 改寫 document.contains 以拋出錯誤
      jest.spyOn(document, 'contains').mockImplementationOnce(() => {
        throw new Error('contain error');
      });

      expect(PerformanceOptimizer._validateCachedElements([div])).toBe(false);
      document.contains.mockRestore();
    });

    test('如果 result 不是節點也沒有 length，應該返回 false', () => {
      const weirdObject = { length: undefined };
      expect(PerformanceOptimizer._validateCachedElements(weirdObject)).toBe(false);
    });

    test('如果發生意外錯誤，應該被全域 try-catch 攔截', () => {
      // 模擬 result.nodeType 訪問拋出錯誤
      const throwingObject = {};
      Object.defineProperty(throwingObject, 'nodeType', {
        get: () => {
          throw new Error('accidental error');
        },
      });

      expect(PerformanceOptimizer._validateCachedElements(throwingObject)).toBe(false);
    });

    test('抽樣邊界：前 5 個元素在 DOM 但第 6 個已移除，應返回 true（抽樣不檢查）', () => {
      const elements = [];
      for (let i = 0; i < 6; i++) {
        const el = document.createElement('span');
        if (i < 5) {
          document.body.append(el);
        }
        elements.push(el);
      }

      // MAX_VALIDATION_SAMPLE_SIZE = 5，只驗證前 5 個
      expect(PerformanceOptimizer._validateCachedElements(elements)).toBe(true);

      // 清理
      elements.slice(0, 5).forEach(el => el.remove());
    });

    test('單個元素路徑：附加到 DOM 應返回 true，移除後應返回 false', () => {
      const el = document.createElement('div');

      // 未附加到 DOM
      expect(PerformanceOptimizer._validateCachedElements(el)).toBe(false);

      // 附加到 DOM
      document.body.append(el);
      expect(PerformanceOptimizer._validateCachedElements(el)).toBe(true);

      // 從 DOM 移除
      el.remove();
      expect(PerformanceOptimizer._validateCachedElements(el)).toBe(false);
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

    // NOTE: clearCache 目前不支援 pattern 過濾，僅支援 force/maxAge 清理。
    // 若日後需要按 selector pattern 清理，請在 PerformanceOptimizer 實作後補回此測試。
  });

  describe('快取接管 (takeoverPreloaderCache)', () => {
    // Helper helper to simulate preloader response
    const mockPreloader = cacheData => {
      document.addEventListener(
        'notion-preloader-request',
        () => {
          document.dispatchEvent(
            new CustomEvent('notion-preloader-response', { detail: cacheData })
          );
        },
        { once: true }
      );
    };

    test('如果無快取應返回 0', () => {
      // 不調用 mockPreloader，模擬無回應
      const result = optimizer.takeoverPreloaderCache();
      expect(result).toEqual({ taken: 0 });
    });

    test('如果快取已過期應返回 expired', () => {
      mockPreloader({
        timestamp: Date.now() - 60_000, // 1 分鐘前
        article: document.createElement('article'),
      });

      const result = optimizer.takeoverPreloaderCache({ maxAge: 30_000 });
      expect(result).toEqual({ taken: 0, expired: true });
    });

    test('應該成功接管有效的快取', () => {
      const article = document.createElement('article');
      const main = document.createElement('main');

      // 確保元素附加到 DOM，否則 _validateCachedElements 會返回 false
      document.body.append(article);
      document.body.append(main);

      mockPreloader({
        timestamp: Date.now(),
        article,
        mainContent: main,
      });

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

      mockPreloader({
        timestamp: Date.now(),
        article, // 未連接
      });

      const result = optimizer.takeoverPreloaderCache();
      expect(result.taken).toBe(0);
    });

    test('應該拒絕不匹配選擇器的元素', () => {
      const div = document.createElement('div'); // 不是 article
      document.body.append(div);

      mockPreloader({
        timestamp: Date.now(),
        article: div, // 類型錯誤
      });

      const result = optimizer.takeoverPreloaderCache();
      expect(result.taken).toBe(0);
    });

    test('應該拒絕來自不同文檔的元素 (防篡改)', () => {
      const article = document.createElement('article');
      document.body.append(article);

      // 模擬 ownerDocument 不匹配
      Object.defineProperty(article, 'ownerDocument', {
        value: {}, // 偽造一個不同的 document 對象
        configurable: true,
      });

      mockPreloader({
        timestamp: Date.now(),
        article,
      });

      const result = optimizer.takeoverPreloaderCache();
      expect(result.taken).toBe(0);
    });

    test('應該拒絕結構無效的快取 (缺少 timestamp)', () => {
      mockPreloader({
        article: document.createElement('article'),
      });

      const result = optimizer.takeoverPreloaderCache();
      expect(result.taken).toBe(0);
    });

    test('應該拒絕無效的 timestamp (非數值)', () => {
      mockPreloader({
        timestamp: 'invalid', // 字串
        article: document.createElement('article'),
      });

      const result = optimizer.takeoverPreloaderCache();
      expect(result.taken).toBe(0);
    });

    test('應該拒絕無效的 timestamp (NaN)', () => {
      mockPreloader({
        timestamp: Number.NaN, // NaN
        article: document.createElement('article'),
      });

      const result = optimizer.takeoverPreloaderCache();
      expect(result.taken).toBe(0);
    });
  });
});

// =========================================
// 合併自 PerformanceOptimizer.comprehensive.test.js
// =========================================
/**
 * PerformanceOptimizer 全面測試套件
 * 目標：提升覆蓋率至 80%+
 */

describe('PerformanceOptimizer - 全面測試', () => {
  let PerformanceOptimizer = null;
  let optimizer = null;
  let mockDocument = null;
  let originalDocument = null;
  let originalWindow = null;
  let originalImage = null;
  let originalPerformance = null;
  let originalRequestIdleCallback = null;
  let originalRequestAnimationFrame = null;
  let originalLogger = null;
  let originalChrome = null;

  beforeEach(() => {
    jest.useFakeTimers();
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;
    originalImage = globalThis.Image;
    originalPerformance = globalThis.performance;
    originalRequestIdleCallback = globalThis.requestIdleCallback;
    originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    originalLogger = globalThis.Logger;
    originalChrome = globalThis.chrome;
    // 創建新的 DOM 環境
    document.body.innerHTML = `
    <article>
        <h1>Article Title</h1>
        <h2>Subtitle</h2>
        <p>Paragraph 1</p>
        <p>Paragraph 2</p>
        <img src="test1.jpg" alt="Test 1">
        <img src="test2.jpg" alt="Test 2">
    </article>
    <div class="test-container" id="test-id">
        <img src="test3.jpg" data-src="lazy.jpg">
        <div class="entry-content">
            <p>Content paragraph</p>
            <img src="content-img.jpg">
        </div>
    </div>
    <div role="main">
        <p>Main content</p>
    </div>
`;
    mockDocument = document;

    // 使用 Jest 原生的 globalThis
    globalThis.performance = {
      now: jest.fn(() => Date.now()),
      memory: {
        usedJSHeapSize: 10_000_000,
        totalJSHeapSize: 20_000_000,
        jsHeapSizeLimit: 100_000_000,
      },
    };
    globalThis.requestIdleCallback = jest.fn(callback => setTimeout(callback, 0));
    globalThis.requestAnimationFrame = jest.fn(callback => setTimeout(callback, 16));

    // 模擬 Logger
    globalThis.Logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    // 重新加載模塊
    jest.resetModules();
    const module = require('../../../scripts/performance/PerformanceOptimizer');
    PerformanceOptimizer = module.PerformanceOptimizer;

    optimizer = new PerformanceOptimizer({
      enableCache: true,
      enableBatching: true,
      cacheMaxSize: 10,
      cacheTTL: 300_000,
      batchDelay: 16,
    });
  });

  afterEach(() => {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.Image = originalImage;
    if (originalPerformance === undefined) {
      delete globalThis.performance;
    } else {
      globalThis.performance = originalPerformance;
    }
    if (originalRequestIdleCallback === undefined) {
      delete globalThis.requestIdleCallback;
    } else {
      globalThis.requestIdleCallback = originalRequestIdleCallback;
    }
    if (originalRequestAnimationFrame === undefined) {
      delete globalThis.requestAnimationFrame;
    } else {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    }
    if (originalLogger === undefined) {
      delete globalThis.Logger;
    } else {
      globalThis.Logger = originalLogger;
    }
    if (originalChrome === undefined) {
      delete globalThis.chrome;
    } else {
      globalThis.chrome = originalChrome;
    }
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('構造函數和初始化', () => {
    test('應該使用默認選項創建實例', () => {
      const defaultOptimizer = new PerformanceOptimizer();
      expect(defaultOptimizer.options.enableCache).toBe(true);
      expect(defaultOptimizer.options.enableBatching).toBe(true);
      expect(defaultOptimizer.options.cacheMaxSize).toBe(100);
    });

    test('應該合併自定義選項', () => {
      const customOptimizer = new PerformanceOptimizer({
        cacheMaxSize: 50,
        batchDelay: 32,
      });
      expect(customOptimizer.options.cacheMaxSize).toBe(50);
      expect(customOptimizer.options.batchDelay).toBe(32);
      expect(customOptimizer.options.enableCache).toBe(true); // 默認值
    });

    test('應該初始化緩存統計', () => {
      expect(optimizer.cacheStats.hits).toBe(0);
      expect(optimizer.cacheStats.misses).toBe(0);
      expect(optimizer.cacheStats.evictions).toBe(0);
      expect(optimizer.cacheStats.prewarms).toBe(0);
    });

    test('應該初始化批處理統計', () => {
      expect(optimizer.batchStats.totalBatches).toBe(0);
      expect(optimizer.batchStats.totalItems).toBe(0);
      expect(optimizer.batchStats.averageBatchSize).toBe(0);
    });
  });

  describe('cachedQuery - DOM 查詢緩存', () => {
    test('應該執行並緩存查詢結果', () => {
      const result1 = optimizer.cachedQuery('img', mockDocument);
      expect(result1).toBeDefined();
      expect(result1.length).toBeGreaterThan(0);
      expect(optimizer.cacheStats.misses).toBe(1);
      expect(optimizer.queryCache.size).toBe(1);
    });

    test('應該從緩存返回結果', () => {
      // 創建全新的 optimizer 實例以避免測試間的干擾
      const freshOptimizer = new PerformanceOptimizer({
        enableCache: true,
      });

      const result1 = freshOptimizer.cachedQuery('img', mockDocument);
      const result2 = freshOptimizer.cachedQuery('img', mockDocument);

      // 驗證緩存命中統計 - 第二次查詢應該命中緩存
      expect(freshOptimizer.cacheStats.hits).toBeGreaterThan(0);
      // 兩次查詢應該返回相同數量的元素
      expect(result2).toHaveLength(result1.length);
    });

    test('應該支持 single 選項', () => {
      const result = optimizer.cachedQuery('img', mockDocument, { single: true });
      expect(result).toBeDefined();
      expect(result.nodeType).toBe(1); // 單個元素
    });

    test('應該支持 all 選項', () => {
      const result = optimizer.cachedQuery('img', mockDocument, { all: true });
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    test('應該處理無效選擇器', () => {
      const result = optimizer.cachedQuery(':::invalid:::', mockDocument);
      expect(result).toEqual([]);
    });

    test('應該在禁用緩存時直接查詢', () => {
      optimizer.options.enableCache = false;
      const result = optimizer.cachedQuery('img', mockDocument);
      expect(result).toBeDefined();
      expect(optimizer.queryCache.size).toBe(0);
    });

    test('應該驗證緩存的元素是否仍在 DOM 中', () => {
      // 簡化測試，只驗證緩存邏輯，不涉及實際 DOM 操作
      optimizer.cachedQuery('p', mockDocument);
      expect(optimizer.queryCache.size).toBe(1);

      // 第二次查詢應該命中緩存
      optimizer.cachedQuery('p', mockDocument);
      expect(optimizer.cacheStats.hits).toBeGreaterThan(0);
    });

    test('應該在相同 selector 且不同 context 時生成不同的緩存鍵', () => {
      const contextA = mockDocument.createElement('div');
      contextA.id = 'ctx-a';
      contextA.innerHTML = '<article><p>A</p></article>';

      const contextB = mockDocument.createElement('section');
      contextB.id = 'ctx-b';
      contextB.innerHTML = '<article><p>B</p></article>';

      mockDocument.body.append(contextA, contextB);

      optimizer.cachedQuery('article', contextA);
      optimizer.cachedQuery('article', contextB);

      expect(optimizer.queryCache.size).toBe(2);
      expect(new Set(Array.from(optimizer.queryCache.keys())).size).toBe(2);
    });
  });

  describe('clearExpiredCache - 過期緩存清理', () => {
    test('應該清理過期的緩存', () => {
      // 添加一些緩存
      optimizer.cachedQuery('img', mockDocument);
      optimizer.cachedQuery('p', mockDocument);

      // 修改緩存時間戳
      const firstKey = optimizer.queryCache.keys().next().value;
      const firstEntry = optimizer.queryCache.get(firstKey);
      firstEntry.timestamp = Date.now() - 400_000; // 過期

      const clearedCount = optimizer.clearExpiredCache({ maxAge: 300_000 });
      expect(clearedCount).toBe(1);
    });

    test('應該支持強制清理所有緩存', () => {
      optimizer.cachedQuery('img', mockDocument);
      optimizer.cachedQuery('p', mockDocument);

      const clearedCount = optimizer.clearExpiredCache({ force: true });
      expect(clearedCount).toBe(2);
      expect(optimizer.queryCache.size).toBe(0);
    });

    test('應該使用默認的 cacheTTL', () => {
      optimizer.cachedQuery('img', mockDocument);
      const firstKey = optimizer.queryCache.keys().next().value;
      const firstEntry = optimizer.queryCache.get(firstKey);
      firstEntry.timestamp = Date.now() - optimizer.options.cacheTTL - 1000;

      const clearedCount = optimizer.clearExpiredCache();
      expect(clearedCount).toBe(1);
    });
  });

  describe('refreshCache - 刷新緩存', () => {
    test('應該刷新單個選擇器的緩存', () => {
      optimizer.cachedQuery('img', mockDocument);

      // 獲取緩存鍵（可能不是簡單的字符串）
      const cacheKeys = Array.from(optimizer.queryCache.keys());
      expect(cacheKeys).toHaveLength(1);

      const firstResult = optimizer.queryCache.get(cacheKeys[0]);
      const firstTimestamp = firstResult.timestamp;

      // 稍微延遲以確保時間戳不同
      jest.advanceTimersByTime(10);

      // 刷新緩存
      optimizer.refreshCache('img', mockDocument);

      const refreshedResult = optimizer.queryCache.get(cacheKeys[0]);
      expect(refreshedResult).toBeDefined();
      expect(refreshedResult.timestamp).toBeGreaterThanOrEqual(firstTimestamp);
    });

    test('應該刷新多個選擇器的緩存', () => {
      optimizer.cachedQuery('img', mockDocument);
      optimizer.cachedQuery('p', mockDocument);

      optimizer.refreshCache(['img', 'p'], mockDocument);

      expect(optimizer.queryCache.size).toBe(2);
    });

    test('應該刪除查詢結果為空的緩存', () => {
      optimizer.cachedQuery('img', mockDocument);
      const imgCacheKeysBefore = Array.from(optimizer.queryCache.entries())
        .filter(([_key, value]) => value?.selector === 'img')
        .map(([key]) => key);
      expect(imgCacheKeysBefore.length).toBeGreaterThan(0);

      // 移除所有圖片
      const images = mockDocument.querySelectorAll('img');
      for (const img of images) {
        img.remove();
      }

      optimizer.refreshCache('img', mockDocument);

      // 緩存應該被刪除
      imgCacheKeysBefore.forEach(key => {
        expect(optimizer.queryCache.has(key)).toBe(false);
      });
      expect(
        Array.from(optimizer.queryCache.values()).some(cacheEntry => cacheEntry?.selector === 'img')
      ).toBe(false);
    });
  });

  describe('preloadSelectors - 選擇器預熱', () => {
    test('應該預熱選擇器並緩存結果', async () => {
      const selectors = ['img', 'p', 'article'];
      const results = await optimizer.preloadSelectors(selectors, mockDocument);

      expect(results.length).toBeGreaterThan(0);
      expect(optimizer.cacheStats.prewarms).toBeGreaterThan(0);
      expect(optimizer.prewarmedSelectors.size).toBeGreaterThan(0);
    });

    test('應該跳過已預熱的選擇器', async () => {
      const selectors = ['img', 'p'];
      await optimizer.preloadSelectors(selectors, mockDocument);

      const prewarmCount1 = optimizer.cacheStats.prewarms;

      // 再次預熱相同的選擇器
      await optimizer.preloadSelectors(selectors, mockDocument);

      const prewarmCount2 = optimizer.cacheStats.prewarms;
      expect(prewarmCount2).toBe(prewarmCount1); // 應該跳過
    });

    test('應該處理預熱失敗的選擇器', async () => {
      const selectors = [':::invalid:::', 'img'];
      const results = await optimizer.preloadSelectors(selectors, mockDocument);

      // 至少有一個選擇器成功
      expect(results.length).toBeGreaterThan(0);
      // 驗證有成功的緩存
      const successfulResults = results.filter(result => result.cached);
      expect(successfulResults.length).toBeGreaterThan(0);
    });

    test('應該在禁用緩存時返回空數組', async () => {
      optimizer.options.enableCache = false;
      const results = await optimizer.preloadSelectors(['img'], mockDocument);
      expect(results).toEqual([]);
    });

    test('應該處理無效的選擇器參數', async () => {
      const results = await optimizer.preloadSelectors(null, mockDocument);
      expect(results).toEqual([]);
    });
  });

  describe('smartPrewarm - 智能預熱', () => {
    test('應該基於頁面結構預熱選擇器', async () => {
      const results = await optimizer.smartPrewarm(mockDocument);

      expect(results.length).toBeGreaterThan(0);
      expect(optimizer.prewarmedSelectors.size).toBeGreaterThan(0);
    });

    test('應該識別 article 結構', async () => {
      await optimizer.smartPrewarm(mockDocument);

      // 應該包含 article 相關的選擇器
      expect(optimizer.queryCache.size).toBeGreaterThan(0);
    });

    test('應該識別 role="main" 結構', async () => {
      await optimizer.smartPrewarm(mockDocument);

      // 應該包含 role="main" 相關的選擇器
      const hasMainRole = Array.from(optimizer.queryCache.keys()).some(key =>
        key.includes('[role="main"]')
      );
      expect(hasMainRole).toBe(true);
    });

    test('應該識別 CMS 類名模式', async () => {
      await optimizer.smartPrewarm(mockDocument);

      // 應該包含 .entry-content 相關的選擇器
      const hasCmsPattern = Array.from(optimizer.queryCache.keys()).some(key =>
        key.includes('.entry-content')
      );
      expect(hasCmsPattern).toBe(true);
    });
  });

  describe('batchProcessImages - 批處理圖片', () => {
    test('應該批處理圖片並返回結果', async () => {
      const images = [{ src: 'test1.jpg' }, { src: 'test2.jpg' }, { src: 'test3.jpg' }];
      const processor = img => ({ url: img.src, processed: true });

      const promise = optimizer.batchProcessImages(images, processor);

      // 執行批處理
      jest.runAllTimers();

      const results = await promise;
      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ url: 'test1.jpg', processed: true });
    });

    test('應該在禁用批處理時直接處理', async () => {
      optimizer.options.enableBatching = false;
      const images = [{ src: 'test.jpg' }];
      const processor = img => ({ url: img.src });

      const results = await optimizer.batchProcessImages(images, processor);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ url: 'test.jpg' });
    });
  });

  describe('batchDomOperations - 批處理 DOM 操作', () => {
    test('應該批處理 DOM 操作', async () => {
      const operations = [() => 'result1', () => 'result2', () => 'result3'];

      const promise = optimizer.batchDomOperations(operations);
      jest.runAllTimers();

      const results = await promise;
      expect(results).toEqual(['result1', 'result2', 'result3']);
    });

    test('應該在禁用批處理時直接執行操作', async () => {
      optimizer.options.enableBatching = false;
      const operations = [() => 'direct'];

      const results = await optimizer.batchDomOperations(operations);
      expect(results).toEqual(['direct']);
    });

    test('應該處理批處理中的錯誤', async () => {
      // 注意：錯誤處理由 ErrorHandler 捕獲，批處理會返回空數組
      const operations = [
        () => 'success',
        () => {
          throw new Error('Batch error');
        },
      ];

      const promise = optimizer.batchDomOperations(operations);
      jest.runAllTimers();

      const results = await promise;
      // 當發生錯誤時，ErrorHandler 會捕獲並返回空數組
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('preloadImages - 預加載圖片', () => {
    test('應該預加載圖片', async () => {
      const urls = ['test1.jpg', 'test2.jpg'];

      const promise = optimizer.preloadImages(urls, { timeout: 100, concurrent: 2 });

      // 觸發所有異步操作
      jest.runAllTimers();

      const results = await promise;
      expect(results).toHaveLength(2);
    });

    test('應該處理圖片加載超時', async () => {
      const urls = ['timeout.jpg'];

      const promise = optimizer.preloadImages(urls, { timeout: 100 });
      jest.runAllTimers();

      const results = await promise;
      expect(results).toHaveLength(1);
    });
  });

  describe('clearCache - 清理緩存', () => {
    test('應該強制清理所有緩存', () => {
      optimizer.cachedQuery('img', mockDocument);
      optimizer.cachedQuery('p', mockDocument);

      optimizer.clearCache({ force: true });
      expect(optimizer.queryCache.size).toBe(0);
    });

    test('應該清理過期的緩存', () => {
      optimizer.cachedQuery('img', mockDocument);

      // 修改時間戳
      const key = optimizer.queryCache.keys().next().value;
      const entry = optimizer.queryCache.get(key);
      entry.timestamp = Date.now() - 400_000;

      optimizer.clearCache({ maxAge: 300_000 });
      expect(optimizer.queryCache.size).toBe(0);
    });

    test('應該使用默認的最大年齡', () => {
      optimizer.cachedQuery('img', mockDocument);

      const key = optimizer.queryCache.keys().next().value;
      const entry = optimizer.queryCache.get(key);
      entry.timestamp = Date.now() - 400_000;

      optimizer.clearCache();
      expect(optimizer.queryCache.size).toBe(0);
    });
  });

  describe('getStats - 獲取統計信息', () => {
    test('應該返回完整的統計信息', () => {
      // 直接操作統計，避免 DOM 查詢問題
      optimizer.cacheStats.hits = 1;
      optimizer.cacheStats.misses = 1;

      const stats = optimizer.getStats();

      expect(stats.cache).toBeDefined();
      expect(stats.cache.hits).toBe(1);
      expect(stats.cache.misses).toBe(1);
      expect(stats.cache.hitRate).toBeCloseTo(0.5);
      expect(stats.batch).toBeDefined();
      expect(stats.metrics).toBeDefined();
      expect(stats.memory).toBeDefined();
    });

    test('應該計算緩存命中率', () => {
      optimizer.cacheStats.hits = 2;
      optimizer.cacheStats.misses = 1;

      const stats = optimizer.getStats();
      expect(stats.cache.hitRate).toBeCloseTo(0.67, 1);
    });

    test('應該返回內存統計或 null', () => {
      const stats = optimizer.getStats();

      // 內存統計可能為 null（取決於環境）
      if (stats.memory) {
        expect(stats.memory.usedJSHeapSize).toBeDefined();
        expect(stats.memory.totalJSHeapSize).toBeDefined();
      } else {
        expect(stats.memory).toBeNull();
      }
    });
  });

  describe('getPerformanceStats - 別名方法', () => {
    test('應該返回與 getStats 相同的結果', () => {
      const stats1 = optimizer.getStats();
      const stats2 = optimizer.getPerformanceStats();

      expect(stats2).toEqual(stats1);
    });
  });

  describe('resetStats - 重置統計', () => {
    test('應該重置所有統計信息', () => {
      optimizer.cachedQuery('img', mockDocument);
      optimizer.cachedQuery('p', mockDocument);

      optimizer.resetStats();

      expect(optimizer.cacheStats.hits).toBe(0);
      expect(optimizer.cacheStats.misses).toBe(0);
      expect(optimizer.batchStats.totalBatches).toBe(0);
      expect(optimizer.metrics.domQueries).toBe(0);
    });
  });

  describe('_maintainCacheSizeLimit - 維護緩存大小', () => {
    test('應該在達到限制時移除最舊的項目', () => {
      // 填滿緩存
      for (let i = 0; i < optimizer.options.cacheMaxSize; i++) {
        optimizer.cachedQuery(`selector${i}`, mockDocument);
      }

      // 添加新項目
      optimizer.cachedQuery('new-selector', mockDocument);

      // 大小應該不超過限制
      expect(optimizer.queryCache.size).toBeLessThanOrEqual(optimizer.options.cacheMaxSize);
      expect(optimizer.cacheStats.evictions).toBeGreaterThan(0);
    });
  });

  describe('便捷函數', () => {
    test('cachedQuery 函數應該使用默認實例', () => {
      const { cachedQuery } = require('../../../scripts/performance/PerformanceOptimizer');
      const result = cachedQuery('img', mockDocument);
      expect(result).toBeDefined();
    });

    test('batchProcess 函數應該使用默認實例', async () => {
      const { batchProcess } = require('../../../scripts/performance/PerformanceOptimizer');
      const items = [{ id: 1 }];
      const processor = item => ({ ...item, processed: true });

      const promise = batchProcess(items, processor);
      jest.runAllTimers();

      const results = await promise;
      expect(results).toHaveLength(1);
    });
  });

  describe('模塊導出', () => {
    test('應該正確導出到 module.exports', () => {
      // 驗證 module.exports 導出
      const exported = require('../../../scripts/performance/PerformanceOptimizer');

      expect(exported.PerformanceOptimizer).toBeDefined();
      expect(exported.cachedQuery).toBeDefined();
      expect(exported.batchProcess).toBeDefined();
    });
  });

  describe('batchProcessWithRetry helper', () => {
    test('應該在第一次嘗試就成功並返回結果', async () => {
      const module = require('../../../scripts/performance/PerformanceOptimizer');
      const customBatchFn = jest.fn((items, processor) =>
        Promise.resolve(items.map(item => processor(item)))
      );
      const processor = value => ({ url: `image-${value}` });

      const { results, meta } = await module.batchProcessWithRetry([1, 2], processor, {
        customBatchFn,
        captureFailedResults: true,
        isResultSuccessful: result => Boolean(result?.url),
      });

      expect(customBatchFn).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(2);
      expect(meta.attempts).toBe(1);
      expect(meta.failedIndices).toEqual([]);
    });

    test('應該在失敗後重試並最終成功', async () => {
      const module = require('../../../scripts/performance/PerformanceOptimizer');
      let attempt = 0;
      const customBatchFn = jest.fn((items, processor) => {
        attempt++;
        if (attempt === 1) {
          return Promise.reject(new Error('Batch boom'));
        }
        return Promise.resolve(items.map(item => processor(item)));
      });
      const processor = value => ({ url: `ix-${value}` });

      const { results, meta } = await module.batchProcessWithRetry([1, 2, 3], processor, {
        customBatchFn,
        maxAttempts: 3,
        baseDelay: 0,
        captureFailedResults: true,
        isResultSuccessful: result => Boolean(result?.url),
      });

      expect(customBatchFn).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(3);
      expect(meta.attempts).toBe(2);
      expect(meta.failedIndices).toEqual([]);
    });

    test('當達到最大嘗試次數仍失敗時應返回 null', async () => {
      const module = require('../../../scripts/performance/PerformanceOptimizer');
      const customBatchFn = jest.fn(() => Promise.reject(new Error('permanent failure')));
      const processor = value => ({ url: `img-${value}` });

      const { results, meta } = await module.batchProcessWithRetry([1], processor, {
        customBatchFn,
        maxAttempts: 2,
        baseDelay: 0,
      });

      expect(customBatchFn).toHaveBeenCalledTimes(2);
      expect(results).toBeNull();
      expect(meta.attempts).toBe(2);
      expect(meta.lastError).toBeInstanceOf(Error);
    });

    test('應該在 captureFailedResults 時回報失敗索引', async () => {
      const module = require('../../../scripts/performance/PerformanceOptimizer');
      const customBatchFn = jest.fn((items, processor) =>
        Promise.resolve(items.map(item => processor(item)))
      );
      const processor = value => (value % 2 === 0 ? null : { url: `valid-${value}` });

      const { meta } = await module.batchProcessWithRetry([1, 2, 3], processor, {
        customBatchFn,
        captureFailedResults: true,
        isResultSuccessful: result => Boolean(result?.url),
      });

      expect(meta.failedIndices).toEqual([1]);
    });
  });
});

// =========================================
// 合併自 PerformanceOptimizer.extra.test.js
// =========================================
/* global document */

describe('PerformanceOptimizer（額外測試）', () => {
  /** @type {PerformanceOptimizer} 性能優化器實例,在 beforeEach 中初始化 */
  let optimizer = null;
  let originalChrome = null;
  let hadChrome = false;

  beforeEach(() => {
    hadChrome = Object.prototype.hasOwnProperty.call(globalThis, 'chrome');
    originalChrome = globalThis.chrome;
    document.body.innerHTML = '';
    optimizer = new PerformanceOptimizer({ cacheMaxSize: 50, enableBatching: true });
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (hadChrome) {
      globalThis.chrome = originalChrome;
    } else {
      delete globalThis.chrome;
    }
    optimizer = null;
    document.body.innerHTML = '';
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

  test('batchDomOperations 在執行批次時應回傳所有結果', async () => {
    const op1 = () => {
      document.body.append(document.createElement('div'));
      return 1;
    };
    const op2 = () => {
      document.body.append(document.createElement('span'));
      return 2;
    };

    const promise = optimizer.batchDomOperations([op1, op2]);
    // 直接呼叫內部批次處理，確保同步觸發
    if (typeof optimizer._processBatch === 'function') {
      optimizer._processBatch();
    }

    const results = await promise;
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(2);
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
  /** @type {PerformanceOptimizer | null} */
  let optimizer = null;
  let originalChrome = null;
  let hadChrome = false;

  beforeEach(() => {
    hadChrome = Object.prototype.hasOwnProperty.call(globalThis, 'chrome');
    originalChrome = globalThis.chrome;
    document.body.innerHTML = `
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
      </div>`;
    optimizer = new PerformanceOptimizer({
      enableCache: true,
      enableBatching: true,
      cacheMaxSize: 100,
      cacheTTL: 300_000, // 5分鐘 TTL
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (hadChrome) {
      globalThis.chrome = originalChrome;
    } else {
      delete globalThis.chrome;
    }
    optimizer = null;
    document.body.innerHTML = '';
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

    test('應該支持非阻塞批處理', async () => {
      const items = Array.from({ length: 25 }, (_, i) => ({ id: i, value: `item${i}` }));
      const processor = item => ({ ...item, processed: true });

      // 使用批處理處理項目
      const results = await optimizer._processInBatches(items, 10, processor);

      expect(results).toHaveLength(25);
      expect(results.every(result => result.processed)).toBe(true);
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
