/**
 * @jest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const loggerMock = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};

const errorHandlerMock = {
  logError: jest.fn(),
};

await jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: loggerMock,
  ...loggerMock,
}));

await jest.unstable_mockModule('../../../scripts/utils/ErrorHandler.js', () => ({
  ErrorHandler: errorHandlerMock,
}));

const { PerformanceOptimizer, PRELOADER_EVENTS, batchProcess, batchProcessWithRetry, cachedQuery } =
  await import('../../../scripts/performance/PerformanceOptimizer.js');

function installChromeRuntime() {
  const listeners = [];
  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage: jest.fn((_message, callback) => callback?.({ ok: true })),
      onMessage: {
        addListener: jest.fn(listener => listeners.push(listener)),
      },
    },
  };
  return { listeners };
}

async function importFreshPreloader() {
  jest.resetModules();
  await import('../../../scripts/performance/preloader.js');
}

function resetPreloaderGlobals() {
  delete globalThis.__NOTION_PRELOADER_INITIALIZED__;
  delete globalThis.__NOTION_BUNDLE_READY__;
  delete globalThis.chrome;
  delete globalThis.requestIdleCallback;
  delete globalThis.cancelIdleCallback;
  delete globalThis.requestAnimationFrame;
}

function dispatchPreloaderCache(cache) {
  document.addEventListener(
    PRELOADER_EVENTS.REQUEST,
    event => {
      event.stopImmediatePropagation();
      document.dispatchEvent(new CustomEvent(PRELOADER_EVENTS.RESPONSE, { detail: cache }));
    },
    { once: true, capture: true }
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
  resetPreloaderGlobals();
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  resetPreloaderGlobals();
  jest.useRealTimers();
});

describe('PerformanceOptimizer native ESM preloader takeover before preloader lifecycle import', () => {
  test('reports no-cache takeover before any preloader listener is installed', () => {
    const optimizer = new PerformanceOptimizer();

    expect(optimizer.takeoverPreloaderCache()).toEqual({ taken: 0 });
    expect(loggerMock.debug).toHaveBeenCalledWith(
      '無 preloader 快取可接管',
      expect.objectContaining({ action: 'takeoverPreloaderCache' })
    );
  });
});

describe('preloader native ESM lifecycle depth', () => {
  test('initializes once, responds with cache, buffers shortcut events, and replays them', async () => {
    document.body.innerHTML = `
      <main><article>Article</article></main>
      <script id="__NEXT_DATA__" type="application/json">
        {"page":"/posts/[slug]","query":{"slug":"native"},"buildId":"build-1"}
      </script>
      <link rel="shortlink" href="https://example.com/?p=123">
    `;
    const { listeners } = installChromeRuntime();

    await importFreshPreloader();
    expect(globalThis.__NOTION_PRELOADER_INITIALIZED__).toBe(true);
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);

    await import('../../../scripts/performance/preloader.js');
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);

    const cacheResponses = [];
    document.addEventListener(
      PRELOADER_EVENTS.RESPONSE,
      event => {
        cacheResponses.push(event.detail);
      },
      { once: true }
    );
    document.dispatchEvent(new CustomEvent(PRELOADER_EVENTS.REQUEST));
    expect(cacheResponses[0]).toEqual(
      expect.objectContaining({
        article: expect.any(HTMLElement),
        mainContent: expect.any(HTMLElement),
        nextRouteInfo: { page: '/posts/[slug]', query: { slug: 'native' }, buildId: 'build-1' },
        shortlink: 'https://example.com/?p=123',
        timestamp: expect.any(Number),
      })
    );

    const shortcut = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true });
    document.dispatchEvent(shortcut);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { action: 'USER_ACTIVATE_SHORTCUT' },
      expect.any(Function)
    );

    const listener = listeners[0];
    const pingResponse = jest.fn();
    expect(listener({ action: 'PING' }, {}, pingResponse)).toBe(true);
    expect(pingResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'preloader_only',
        hasCache: true,
        nextRouteInfo: { page: '/posts/[slug]', query: { slug: 'native' }, buildId: 'build-1' },
      })
    );

    const initResponse = jest.fn();
    expect(listener({ action: 'INIT_BUNDLE' }, {}, initResponse)).toBe(true);
    expect(initResponse).toHaveBeenCalledWith({ ready: true, bufferedEvents: 1 });

    const replayResponse = jest.fn();
    expect(listener({ action: 'REPLAY_BUFFERED_EVENTS' }, {}, replayResponse)).toBe(true);
    expect(replayResponse).toHaveBeenCalledWith({
      events: [expect.objectContaining({ type: 'shortcut', timestamp: expect.any(Number) })],
    });
    expect(listener({ action: 'UNKNOWN' }, {}, jest.fn())).toBe(false);
  });

  test('no-ops safely without optional runtime APIs and lets ready bundle handle ping', async () => {
    await importFreshPreloader();
    expect(globalThis.__NOTION_PRELOADER_INITIALIZED__).toBe(true);
    expect(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true }));
    }).not.toThrow();

    delete globalThis.__NOTION_PRELOADER_INITIALIZED__;
    const { listeners } = installChromeRuntime();
    globalThis.__NOTION_BUNDLE_READY__ = true;
    await importFreshPreloader();

    expect(listeners[0]({ action: 'PING' }, {}, jest.fn())).toBe(false);
  });
});

describe('PerformanceOptimizer native ESM lifecycle depth', () => {
  test('covers module wrappers and config fallbacks without using cache or batching', async () => {
    document.body.innerHTML = '<article id="wrapped">Wrapped</article><main>Main</main>';

    expect(cachedQuery('article', document, { single: true })).toBe(
      document.getElementById('wrapped')
    );

    const wrappedBatch = batchProcess([{ src: 'x' }], image => image.src);
    jest.advanceTimersByTime(16);
    await expect(wrappedBatch).resolves.toEqual(['x']);

    const noCacheOptimizer = new PerformanceOptimizer({ enableCache: false });
    expect(noCacheOptimizer.cachedQuery('article', document, { single: true }).id).toBe('wrapped');
    expect(noCacheOptimizer.getStats().cache.size).toBe(0);

    const noBatchOptimizer = new PerformanceOptimizer({ enableBatching: false });
    await expect(
      noBatchOptimizer.batchProcessImages([{ src: 'a' }, { src: 'b' }], image =>
        image.src.toUpperCase()
      )
    ).resolves.toEqual(['A', 'B']);

    const cleanupOptimizer = new PerformanceOptimizer({ cacheTTL: 50 });
    const clearExpiredSpy = jest.spyOn(cleanupOptimizer, 'clearExpiredCache');
    cleanupOptimizer.clearCache({ maxAge: 25 });
    expect(clearExpiredSpy).toHaveBeenCalledWith({ maxAge: 25 });
    cleanupOptimizer.clearCache();
    expect(clearExpiredSpy).toHaveBeenCalledWith({ maxAge: 50 });

    expect(noCacheOptimizer.cachedQuery('[[invalid', document, { single: true })).toBeNull();
    expect(noCacheOptimizer.cachedQuery('[[invalid', document, { all: true })).toEqual([]);
    expect(errorHandlerMock.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'dom_error',
        context: 'DOM query: [[invalid',
        originalError: expect.any(Error),
      })
    );
  });

  test('validates preloader cache structure, selector matching, and DOM ownership', () => {
    const optimizer = new PerformanceOptimizer();
    dispatchPreloaderCache({ timestamp: Number.NaN });

    expect(optimizer.takeoverPreloaderCache()).toEqual({ taken: 0 });

    const foreignDocument = document.implementation.createHTMLDocument('foreign');
    const mismatchedArticle = document.createElement('div');
    document.body.append(mismatchedArticle);
    dispatchPreloaderCache({
      timestamp: Date.now(),
      article: mismatchedArticle,
      mainContent: foreignDocument.createElement('main'),
    });

    expect(optimizer.takeoverPreloaderCache()).toEqual({ taken: 0 });
    expect(loggerMock.warn).toHaveBeenCalledWith(
      '拒絕接管不安全的 preloader 快取',
      expect.objectContaining({ action: 'takeoverPreloaderCache', selector: 'article' })
    );

    const article = document.createElement('article');
    const main = document.createElement('main');
    document.body.append(article, main);

    expect(optimizer._migrateCacheItem(article, 'article', Date.now())).toBe(true);
    expect(optimizer._migrateCacheItem(article, '', Date.now())).toBe(true);
    expect(
      optimizer._migrateCacheItem(main, 'main, [role="main"], #content, .content', Date.now())
    ).toBe(true);

    expect(optimizer._migrateCacheItem(null, 'article', Date.now())).toBe(false);
    expect(optimizer._migrateCacheItem('not-an-element', 'article', Date.now())).toBe(false);
    expect(
      optimizer._migrateCacheItem(
        { nodeType: 1, ownerDocument: document, isConnected: true },
        'article',
        Date.now()
      )
    ).toBe(false);
    expect(
      optimizer._migrateCacheItem(
        { nodeType: 1, ownerDocument: document, matches: jest.fn(() => true) },
        'article',
        Date.now()
      )
    ).toBe(false);
  });

  test('invalidates disconnected cached elements and handles cache maintenance branches', () => {
    document.body.innerHTML = '<article id="article">Article</article><main>Main</main>';
    const optimizer = new PerformanceOptimizer({ cacheMaxSize: 1, cacheTTL: 10 });

    const article = optimizer.cachedQuery('article', document, { single: true });
    expect(article.id).toBe('article');
    article.remove();

    expect(optimizer.cachedQuery('article', document, { single: true })).toBeNull();
    expect(optimizer.getStats().cache.misses).toBeGreaterThanOrEqual(2);

    optimizer.cachedQuery('main', document, { single: true });
    optimizer.cachedQuery('body', document, { single: true });
    expect(optimizer.getStats().cache.evictions).toBeGreaterThanOrEqual(1);

    optimizer.queryCache.set('expired', {
      result: document.body,
      timestamp: Date.now() - 100,
      selector: 'body',
      ttl: 10,
    });
    expect(optimizer.clearExpiredCache({ maxAge: 10 })).toBeGreaterThanOrEqual(1);

    optimizer.queryCache.set('forced', {
      result: document.body,
      timestamp: Date.now(),
      selector: 'body',
      ttl: 10,
    });
    expect(optimizer.clearExpiredCache({ force: true })).toBeGreaterThanOrEqual(1);

    const list = document.querySelectorAll('main');
    const listKey = PerformanceOptimizer._generateCacheKey('main', document, {});
    optimizer.queryCache.set(listKey, {
      result: list,
      timestamp: Date.now(),
      selector: 'main',
      ttl: 10,
    });
    expect(optimizer.cachedQuery('main', document)).toBe(list);

    document.querySelector('main').remove();
    expect(optimizer.cachedQuery('main', document)).toHaveLength(0);

    expect(PerformanceOptimizer._validateCachedElements(null)).toBe(false);
    expect(PerformanceOptimizer._validateCachedElements({})).toBe(false);
    expect(PerformanceOptimizer._validateCachedElements([])).toBe(false);
    expect(
      PerformanceOptimizer._validateCachedElements({
        nodeType: 1,
        get isConnected() {
          throw new Error('bad connected getter');
        },
      })
    ).toBe(false);

    const fallbackConnected = document.createElement('section');
    document.body.append(fallbackConnected);
    Object.defineProperty(fallbackConnected, 'isConnected', {
      value: undefined,
      configurable: true,
    });
    expect(PerformanceOptimizer._isElementConnected(fallbackConnected)).toBe(true);
    expect(PerformanceOptimizer._isElementConnected({ nodeType: 1 })).toBe(false);
  });

  test('skips non-preloadable selector inputs and reports preload query errors', async () => {
    const optimizer = new PerformanceOptimizer({ enableCache: false });
    await expect(optimizer.preloadSelectors(['article'])).resolves.toEqual([]);
    await expect(new PerformanceOptimizer().preloadSelectors(null)).resolves.toEqual([]);

    const throwingOptimizer = new PerformanceOptimizer();
    throwingOptimizer.cachedQuery = () => {
      throw new Error('selector failed');
    };
    await expect(throwingOptimizer.preloadSelectors(['article'])).resolves.toEqual([
      {
        selector: 'article',
        error: 'selector failed',
        cached: false,
      },
    ]);
    expect(errorHandlerMock.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preload_error',
        context: 'preloading selector: article',
        originalError: expect.any(Error),
      })
    );

    const noResultOptimizer = new PerformanceOptimizer();
    noResultOptimizer.cachedQuery = () => null;
    await expect(noResultOptimizer.preloadSelectors(['.missing'])).resolves.toEqual([]);
    expect(loggerMock.debug).toHaveBeenCalledWith(
      '預熱跳過：查詢無結果',
      expect.objectContaining({ action: 'preloadSelectors', selector: '.missing' })
    );
  });

  test('preloads selectors once, clears cache, and exposes memory stats when available', async () => {
    document.body.innerHTML =
      '<main><article id="article"><img src="photo.jpg"><img src="second.jpg"></article></main>';
    const optimizer = new PerformanceOptimizer({
      prewarmSelectors: ['article', 'article', 'img[src]', '.missing'],
      cacheMaxSize: 2,
    });
    Object.defineProperty(globalThis.performance, 'memory', {
      value: {
        usedJSHeapSize: 10,
        totalJSHeapSize: 20,
        jsHeapSizeLimit: 30,
      },
      configurable: true,
    });

    const results = await optimizer.preloadSelectors(['article', 'article', 'img[src]']);
    expect(results).toEqual([
      { selector: 'article', count: 1, cached: true },
      { selector: 'img[src]', count: 2, cached: true },
    ]);
    expect(loggerMock.debug).toHaveBeenCalledWith(
      '預熱跳過：已預熱',
      expect.objectContaining({ selector: 'article' })
    );
    expect(optimizer.getPerformanceStats().memory).toEqual({
      usedJSHeapSize: 10,
      totalJSHeapSize: 20,
      jsHeapSizeLimit: 30,
    });

    optimizer.clearCache({ force: true });
    expect(optimizer.getStats().cache.size).toBe(0);

    await expect(optimizer.preloadSelectors(['.missing'])).resolves.toEqual([]);
    expect(loggerMock.debug).toHaveBeenCalledWith(
      '預熱跳過：結果為空',
      expect.objectContaining({ action: 'preloadSelectors', selector: '.missing' })
    );
  });

  test('analyzes page structure for smart prewarm dynamic selectors', async () => {
    document.body.innerHTML = `
      <main>
        <article><h1>Title</h1><h2>Section</h2><h3>Sub</h3><p>Body</p><img src="article.jpg"></article>
        <h1>Main title</h1><h2>Main section</h2><h3>Main sub</h3><p>Main body</p><img src="main.jpg">
        <section class="entry-content"><h1>Entry</h1><h2>Entry h2</h2><h3>Entry h3</h3><p>Entry body</p><img src="entry.jpg"></section>
      </main>
    `;
    const optimizer = new PerformanceOptimizer({ prewarmSelectors: [] });

    expect(optimizer._analyzePageForPrewarming(document)).toEqual(
      expect.arrayContaining([
        'article h1',
        'article p',
        'article img',
        'main h1',
        'main p',
        'main img',
        '.entry-content p',
        '.entry-content img',
        '.entry-content h1',
        '.entry-content h2',
        '.entry-content h3',
      ])
    );

    const results = await optimizer.smartPrewarm(document);
    expect(results.map(result => result.selector)).toEqual(
      expect.arrayContaining(['article h1', 'main h1', '.entry-content p'])
    );
    expect(loggerMock.info).toHaveBeenCalledWith(
      '智能預熱完成',
      expect.objectContaining({ action: 'smartPrewarm' })
    );
  });

  test('refreshes existing cache entries and deletes stale no-result entries', () => {
    document.body.innerHTML = `
      <article id="article">Old</article>
      <main id="main">Main</main>
      <section class="stale">Stale</section>
    `;
    const optimizer = new PerformanceOptimizer();

    const article = optimizer.cachedQuery('article', document, { single: true });
    const main = optimizer.cachedQuery('main', document, { single: true });
    const stale = optimizer.cachedQuery('.stale', document, { single: true });
    expect(article.id).toBe('article');
    expect(main.id).toBe('main');
    expect(stale.className).toBe('stale');

    const nextArticle = document.createElement('article');
    nextArticle.id = 'article-next';
    document.querySelector('article').replaceWith(nextArticle);
    document.querySelector('.stale').remove();

    optimizer.refreshCache(['article', 'main', '.stale'], document, { single: true });

    expect(optimizer.cachedQuery('article', document, { single: true }).id).toBe('article-next');
    expect(optimizer.cachedQuery('main', document, { single: true }).id).toBe('main');
    expect(optimizer.cachedQuery('.stale', document, { single: true })).toBeNull();
  });

  test('takes over no-cache, expired, and valid preloader cache states', () => {
    const optimizer = new PerformanceOptimizer();

    dispatchPreloaderCache({ timestamp: Date.now() - 1000, article: null, mainContent: null });
    expect(optimizer.takeoverPreloaderCache({ maxAge: 10 })).toEqual({ taken: 0, expired: true });

    const article = document.createElement('article');
    const main = document.createElement('main');
    document.body.append(article, main);
    dispatchPreloaderCache({
      timestamp: Date.now(),
      article,
      mainContent: main,
    });

    expect(optimizer.takeoverPreloaderCache()).toEqual({ taken: 2 });
  });

  test('uses timer fallback for batch processing, handles processor errors, and destroy clears timers', async () => {
    const optimizer = new PerformanceOptimizer({ batchDelay: 25 });
    const success = optimizer.batchProcessImages([{ src: 'a' }], image => image.src.toUpperCase());
    jest.advanceTimersByTime(25);
    await expect(success).resolves.toEqual(['A']);

    const failure = optimizer.batchProcessImages([{ src: 'b' }], () => {
      throw new Error('processor failed');
    });
    jest.advanceTimersByTime(25);
    await expect(failure).resolves.toEqual([]);
    expect(errorHandlerMock.logError).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'performance_warning',
        context: 'batch processing',
        originalError: expect.any(Error),
      })
    );

    const pending = optimizer.batchProcessImages([{ src: 'c' }], image => image.src);
    expect(optimizer.batchTimer).not.toBeNull();
    optimizer.destroy();
    expect(optimizer.batchTimer).toBeNull();
    jest.advanceTimersByTime(25);
    await expect(Promise.race([pending, Promise.resolve('still pending')])).resolves.toBe(
      'still pending'
    );
  });

  test('uses requestIdleCallback scheduling and retry failure metadata', async () => {
    globalThis.requestIdleCallback = jest.fn(callback => {
      callback();
      return 7;
    });
    globalThis.cancelIdleCallback = jest.fn();

    const optimizer = new PerformanceOptimizer({ batchDelay: 10 });
    await expect(
      optimizer.batchProcessImages([{ src: 'idle' }], image => image.src)
    ).resolves.toEqual(['idle']);
    expect(globalThis.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 10,
    });

    optimizer.batchTimer = 7;
    optimizer.destroy();
    expect(globalThis.cancelIdleCallback).toHaveBeenCalledWith(7);

    const retryPromise = batchProcessWithRetry(
      [1, 2],
      () => {
        throw new Error('always fails');
      },
      {
        maxAttempts: 2,
        baseDelay: 1,
        customBatchFn: async () => {
          throw Object.assign(new Error('batch failed'), { failedIndices: [0, 1] });
        },
      }
    );
    await Promise.resolve();
    jest.advanceTimersByTime(1);
    const { results, meta } = await retryPromise;
    expect(results).toBeNull();
    expect(meta).toEqual(
      expect.objectContaining({
        attempts: 2,
        failedIndices: [0, 1],
        lastError: expect.any(Error),
      })
    );
    expect(meta.lastError.message).toBe('batch failed');
  });

  test('captures retry metadata for non-array and failed batch results', async () => {
    const nonArray = await batchProcessWithRetry([1, 2], value => value, {
      maxAttempts: 1,
      customBatchFn: async () => 'not-array',
    });

    expect(nonArray.results).toBeNull();
    expect(nonArray.meta).toEqual(
      expect.objectContaining({
        attempts: 1,
        failedIndices: [0, 1],
        lastError: expect.any(Error),
      })
    );
    expect(nonArray.meta.lastError.message).toBe('Batch processor returned non-array results');

    const partial = await batchProcessWithRetry(['ok', 'bad'], value => value, {
      captureFailedResults: true,
      isResultSuccessful: result => result === 'ok',
      customBatchFn: async () => ['ok', 'bad'],
    });

    expect(partial).toEqual({
      results: ['ok', 'bad'],
      meta: {
        attempts: 1,
        failedIndices: [1],
        lastError: null,
      },
    });
  });

  test('calculates batch sizes and yields with animation frame or timeout fallbacks', async () => {
    const optimizer = new PerformanceOptimizer();

    optimizer.batchQueue = [];
    expect(optimizer._calculateOptimalBatchSize()).toBe(100);
    optimizer.batchQueue = Array.from({ length: 51 }, (_, index) => index);
    expect(optimizer._calculateOptimalBatchSize()).toBe(100);
    optimizer.batchQueue = Array.from({ length: 201 }, (_, index) => index);
    expect(optimizer._calculateOptimalBatchSize()).toBe(150);
    optimizer.batchQueue = Array.from({ length: 501 }, (_, index) => index);
    expect(optimizer._calculateOptimalBatchSize()).toBe(200);

    const timeoutYield = PerformanceOptimizer._yieldToMain();
    jest.advanceTimersByTime(1);
    await expect(timeoutYield).resolves.toBeUndefined();

    globalThis.requestAnimationFrame = jest.fn(callback => {
      callback();
      return 1;
    });
    const processed = [];
    optimizer._processBatchItems(
      Array.from({ length: 11 }, (_, index) => ({
        processor: () => index,
        resolve: result => processed.push(result),
      })),
      performance.now()
    );

    expect(globalThis.requestAnimationFrame).toHaveBeenCalled();
    expect(processed).toHaveLength(11);
  });

  test('guards duplicate batch scheduling, empty queue processing, setTimeout chunks, and idle yielding', async () => {
    const optimizer = new PerformanceOptimizer({ batchDelay: 30 });

    optimizer.batchTimer = 123;
    optimizer.batchQueue = [
      { images: [], processor: jest.fn(), resolve: jest.fn(), reject: jest.fn() },
    ];
    optimizer._scheduleBatchProcessing();
    expect(optimizer.batchTimer).toBe(123);
    expect(optimizer.batchQueue).toHaveLength(1);

    optimizer.batchTimer = null;
    optimizer.batchQueue = [];
    optimizer._processBatch();
    expect(optimizer.batchStats.totalBatches).toBe(0);

    delete globalThis.requestAnimationFrame;
    const processed = [];
    optimizer._processBatchItems(
      Array.from({ length: 11 }, (_, index) => ({
        processor: () => index,
        resolve: result => processed.push(result),
      })),
      performance.now()
    );
    expect(processed).toHaveLength(10);
    jest.advanceTimersByTime(0);
    expect(processed).toHaveLength(11);

    globalThis.requestIdleCallback = jest.fn(callback => {
      callback();
      return 9;
    });
    await expect(PerformanceOptimizer._yieldToMain()).resolves.toBeUndefined();
    expect(globalThis.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function));

    const retry = await batchProcessWithRetry([1], value => value, {
      maxAttempts: 2,
      baseDelay: 0,
      customBatchFn: jest
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('first failure'), { failedIndices: [0] }))
        .mockResolvedValueOnce([1]),
    });
    expect(retry).toEqual({
      results: [1],
      meta: { attempts: 2, failedIndices: [], lastError: expect.any(Error) },
    });
  });

  test('measures sync and async work and adjusts batch size from performance history', async () => {
    const optimizer = new PerformanceOptimizer({ enableMetrics: true });

    expect(optimizer.measure(() => 'measured', 'sync-work')).toBe('measured');
    await expect(optimizer.measureAsync(async () => 'async-measured', 'async-work')).resolves.toBe(
      'async-measured'
    );
    expect(loggerMock.info).toHaveBeenCalledWith(
      '性能測量',
      expect.objectContaining({ action: 'measure', name: 'sync-work' })
    );
    expect(loggerMock.info).toHaveBeenCalledWith(
      '性能測量 (Async)',
      expect.objectContaining({ action: 'measureAsync', name: 'async-work' })
    );

    optimizer.metrics.averageProcessingTime = 150;
    expect(optimizer._adjustBatchSizeForPerformance(100)).toBe(70);
    optimizer.metrics.averageProcessingTime = 5;
    expect(optimizer._adjustBatchSizeForPerformance(100)).toBe(150);
    optimizer.metrics.averageProcessingTime = 50;
    expect(optimizer._adjustBatchSizeForPerformance(100)).toBe(100);
  });
});
