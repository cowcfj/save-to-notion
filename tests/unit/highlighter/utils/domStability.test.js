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
      document.body.appendChild(container);

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
  });
});
