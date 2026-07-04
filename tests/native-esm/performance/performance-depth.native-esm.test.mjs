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

const { PerformanceOptimizer, PRELOADER_EVENTS, batchProcessWithRetry } =
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

beforeEach(() => {
  document.body.innerHTML = '';
  delete globalThis.__NOTION_PRELOADER_INITIALIZED__;
  delete globalThis.__NOTION_BUNDLE_READY__;
  delete globalThis.chrome;
  delete globalThis.requestIdleCallback;
  delete globalThis.cancelIdleCallback;
  delete globalThis.requestAnimationFrame;
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  delete globalThis.__NOTION_PRELOADER_INITIALIZED__;
  delete globalThis.__NOTION_BUNDLE_READY__;
  delete globalThis.chrome;
  delete globalThis.requestIdleCallback;
  delete globalThis.cancelIdleCallback;
  delete globalThis.requestAnimationFrame;
  jest.useRealTimers();
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
  test('preloads selectors once, clears cache, and exposes memory stats when available', async () => {
    document.body.innerHTML = '<main><article id="article"><img src="photo.jpg"></article></main>';
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
      { selector: 'img[src]', count: 1, cached: true },
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
});
