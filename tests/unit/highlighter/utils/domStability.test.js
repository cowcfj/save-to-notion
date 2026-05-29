/**
 * @jest-environment jsdom
 */

// 【重構】直接導入源代碼（Babel 自動處理 ES Module → CommonJS 轉換）
const { waitForDOMStability } = require('../../../../scripts/highlighter/utils/domStability.js');

describe('utils/domStability', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('waitForDOMStability', () => {
    test('should resolve true when DOM is stable', async () => {
      const promise = waitForDOMStability({
        stabilityThresholdMs: 100,
        maxWaitMs: 1000,
      });

      jest.advanceTimersByTime(150);

      const result = await promise;
      expect(result).toBe(true);
    });

    test('should resolve false when container not found', async () => {
      const result = await waitForDOMStability({
        containerSelector: '#non-existent',
      });

      expect(result).toBe(false);
    });

    test('should use custom container selector', async () => {
      const container = document.createElement('div');
      container.id = 'test-container';
      document.body.append(container);

      const promise = waitForDOMStability({
        containerSelector: '#test-container',
        stabilityThresholdMs: 100,
      });

      jest.advanceTimersByTime(150);

      const result = await promise;
      expect(result).toBe(true);
    });

    test('should use default options', async () => {
      const promise = waitForDOMStability();

      jest.advanceTimersByTime(200);

      const result = await promise;
      expect(result).toBe(true);
    });

    test('initialGracePeriodMs=0 應該在 0ms 後即判定穩定(無 mutation 時)', async () => {
      const promise = waitForDOMStability({
        stabilityThresholdMs: 150,
        maxWaitMs: 500,
        initialGracePeriodMs: 0,
      });

      // 推進 0ms 即跑首次 check;預設沒 mutation,該立即 resolve(true)。
      jest.advanceTimersByTime(0);

      const result = await promise;
      expect(result).toBe(true);
    });

    test('initialGracePeriodMs=0 + 在 grace 後 mutation,後續仍要等 thresholdMs', async () => {
      const container = document.createElement('div');
      container.id = 'mut-test';
      document.body.append(container);

      const promise = waitForDOMStability({
        containerSelector: '#mut-test',
        stabilityThresholdMs: 100,
        maxWaitMs: 1000,
        initialGracePeriodMs: 0,
      });

      // 立刻 mutate,首次 check 在 0ms 跑時 lastMutationTime 已被更新。
      container.append(document.createElement('span'));

      jest.advanceTimersByTime(150);

      const result = await promise;
      expect(result).toBe(true);
    });
  });
});
