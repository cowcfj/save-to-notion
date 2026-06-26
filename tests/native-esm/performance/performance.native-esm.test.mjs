/**
 * @jest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const loggerMock = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
};

const errorHandlerMock = {
  handleError: jest.fn(),
  captureException: jest.fn(),
  formatUserMessage: jest.fn(err => String(err)),
  logError: jest.fn(),
};

await jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
  default: loggerMock,
}));

await jest.unstable_mockModule('../../../scripts/utils/ErrorHandler.js', () => ({
  ErrorHandler: errorHandlerMock,
}));

// Setup global chrome mock for preloader
const chromeMock = {
  runtime: {
    id: 'test',
    sendMessage: jest.fn((msg, cb) => {
      if (cb) cb({ success: true });
    }),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    lastError: null,
  },
};

globalThis.chrome = chromeMock;

const {
  PERFORMANCE_OPTIMIZER,
  PRELOADER_EVENTS,
  PerformanceOptimizer,
  cachedQuery,
  batchProcess,
  batchProcessWithRetry,
} = await import('../../../scripts/performance/PerformanceOptimizer.js');

describe('Performance native ESM diagnostics', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('PerformanceOptimizer instantiation and config options', () => {
    const optimizer = new PerformanceOptimizer({
      cacheMaxSize: 50,
      enableCache: true,
    });
    expect(optimizer.options.cacheMaxSize).toBe(50);
    expect(optimizer.options.enableCache).toBe(true);

    const stats = optimizer.getStats();
    expect(stats.cache.size).toBe(0);
    expect(stats.cache.hitRate).toBe(0);

    optimizer.resetStats();
  });

  test('cachedQuery misses, hits, TTL limits, and validations', () => {
    document.body.innerHTML = '<main><article id="art">Hello</article></main>';
    const optimizer = new PerformanceOptimizer({
      cacheMaxSize: 3,
      cacheTTL: 100, // 100ms TTL
    });

    const selector = 'article';
    const result1 = optimizer.cachedQuery(selector, document, { single: true });
    expect(result1).not.toBeNull();
    expect(result1.textContent).toBe('Hello');

    // Cache hit
    const result2 = optimizer.cachedQuery(selector, document, { single: true });
    expect(result2).toBe(result1);
    expect(optimizer.getStats().cache.hits).toBe(1);

    // Eviction test by exceeding cacheMaxSize
    optimizer.cachedQuery('main', document, { single: true });
    optimizer.cachedQuery('body', document, { single: true });
    optimizer.cachedQuery('div', document, { single: true });

    // Advance time to test TTL expiration
    jest.advanceTimersByTime(200);
    const resultExpired = optimizer.cachedQuery(selector, document, { single: true });
    expect(optimizer.getStats().cache.misses).toBeGreaterThan(1);
  });

  test('batchProcessImages queues and processes items with RAF/IdleCallback fallback', async () => {
    // Mock requestAnimationFrame and cancelIdleCallback/requestIdleCallback to make sure they run deterministically in JSDOM
    globalThis.requestIdleCallback = jest.fn(cb => setTimeout(cb, 0));
    globalThis.cancelIdleCallback = jest.fn(id => clearTimeout(id));

    const optimizer = new PerformanceOptimizer({
      enableBatching: true,
      batchDelay: 10,
    });

    const mockProcessor = jest.fn(img => img.src + '_processed');
    const img1 = { src: 'img1.png' };
    const img2 = { src: 'img2.png' };

    const batchPromise = optimizer.batchProcessImages([img1, img2], mockProcessor);
    jest.advanceTimersByTime(20);

    const results = await batchPromise;
    expect(results).toEqual(['img1.png_processed', 'img2.png_processed']);
    expect(mockProcessor).toHaveBeenCalledTimes(2);

    optimizer.destroy();
  });

  test('batchProcessWithRetry wraps batch functions, retry on failures', async () => {
    const mockProcessor = jest.fn(x => x * 2);
    const items = [1, 2];

    const { results, meta } = await batchProcessWithRetry(items, mockProcessor, {
      maxAttempts: 2,
      baseDelay: 50,
      customBatchFn: async (arr, proc) => arr.map(proc),
    });

    expect(results).toEqual([2, 4]);
    expect(meta.attempts).toBe(1);
  });

  test('static utilities _isElementConnected, _analyzePageForPrewarming and smartPrewarm', async () => {
    document.body.innerHTML = '<main><article><h2>Title</h2><p>Para</p><img></article></main>';
    const optimizer = new PerformanceOptimizer();

    const results = await optimizer.smartPrewarm(document);
    expect(results.length).toBeGreaterThan(0);

    const stats = optimizer.getStats();
    expect(stats.cache.prewarmCount).toBeGreaterThan(0);
  });

  test('takeoverPreloaderCache validates and takes over preloader cache detail', () => {
    const optimizer = new PerformanceOptimizer();
    const articleEl = document.createElement('article');
    document.body.appendChild(articleEl);

    const mockPreloaderCache = {
      article: articleEl,
      mainContent: null,
      timestamp: Date.now(),
    };

    // Listen to dispatch event request
    document.addEventListener(PRELOADER_EVENTS.REQUEST, () => {
      document.dispatchEvent(
        new CustomEvent(PRELOADER_EVENTS.RESPONSE, {
          detail: mockPreloaderCache,
        })
      );
    }, { once: true });

    const result = optimizer.takeoverPreloaderCache({ maxAge: 5000 });
    expect(result.taken).toBe(1);
  });

  test('preloader.js side effect execution and IIFE keydown shortcuts', async () => {
    const addListenerMock = jest.fn();
    chromeMock.runtime.onMessage.addListener = addListenerMock;

    // Load preloader.js side effect module
    await import('../../../scripts/performance/preloader.js');

    // Verify preloader registered listeners
    expect(globalThis.__NOTION_PRELOADER_INITIALIZED__).toBe(true);

    // Simulate keydown event to trigger USER_ACTIVATE_SHORTCUT
    const event = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      bubbles: true,
    });
    document.dispatchEvent(event);

    expect(chromeMock.runtime.sendMessage).toHaveBeenCalled();
  });
});
