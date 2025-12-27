/**
 * PerformanceOptimizer 批次處理邏輯測試
 * 測試批次處理的正確性和 destroy() 方法
 */
/* eslint-env jest */

const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');

global.document = dom.window.document;
global.window = dom.window;
global.performance = { now: () => Date.now() };
global.requestIdleCallback = cb => setTimeout(cb, 0);
global.cancelIdleCallback = clearTimeout;

const { PerformanceOptimizer } = require('../../../scripts/performance/PerformanceOptimizer');

describe('PerformanceOptimizer - 批次處理邏輯', () => {
  let optimizer = null;

  beforeEach(() => {
    optimizer = new PerformanceOptimizer({
      enableBatching: true,
      batchDelay: 10,
    });
  });

  afterEach(() => {
    if (optimizer) {
      optimizer.destroy();
    }
  });

  describe('批次處理邏輯修復驗證', () => {
    test('應該正確處理批次隊列，不遺失資料', async () => {
      const items = Array.from({ length: 150 }, (_, i) => ({ id: i }));
      const processor = item => ({ ...item, processed: true });

      const result = await optimizer.batchProcessImages(items, processor);

      expect(result).toHaveLength(150);
      expect(result.every(item => item.processed)).toBe(true);
      expect(result.map(item => item.id)).toEqual(items.map(i => i.id));
    });

    test('應該正確使用 splice 提取批次', async () => {
      const items = Array.from({ length: 250 }, (_, i) => i);
      const processor = item => item * 2;

      const result = await optimizer.batchProcessImages(items, processor);

      expect(result).toHaveLength(250);
      expect(result).toEqual(items.map(i => i * 2));
    });

    test('批次處理後隊列應該為空', async () => {
      const items = [1, 2, 3];
      const processor = item => item;

      await optimizer.batchProcessImages(items, processor);

      expect(optimizer.batchQueue).toHaveLength(0);
    });
  });

  describe('destroy() 方法測試', () => {
    test('應該清理批處理定時器', () => {
      optimizer.batchTimer = setTimeout(() => {
        /* no-op */
      }, 1000);

      optimizer.destroy();

      expect(optimizer.batchTimer).toBeNull();
    });

    test('應該清空查詢緩存', () => {
      optimizer.cachedQuery('body');
      expect(optimizer.queryCache.size).toBeGreaterThan(0);

      optimizer.destroy();

      expect(optimizer.queryCache.size).toBe(0);
    });

    test('多次調用 destroy 不應該報錯', () => {
      optimizer.destroy();

      expect(() => optimizer.destroy()).not.toThrow();
    });
  });
});
