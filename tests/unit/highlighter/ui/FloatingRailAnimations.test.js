/**
 * FloatingRailAnimations.js 單元測試
 */

import {
  playLaunchAnimation,
  playFireworkAnimation,
} from '../../../../scripts/highlighter/ui/FloatingRailAnimations.js';

beforeAll(() => {
  Element.prototype.animate = jest.fn(() => ({
    cancel: jest.fn(function () {
      this.playState = 'idle';
    }),
    playState: 'running',
    finished: Promise.resolve(),
  }));
});

describe('FloatingRailAnimations', () => {
  describe('playLaunchAnimation', () => {
    let button;

    beforeEach(() => {
      button = document.createElement('button');
      document.body.append(button);
    });

    afterEach(() => {
      button.remove();
    });

    test('應回傳可取消的 Animation 物件', () => {
      const animation = playLaunchAnimation(button);
      expect(animation).toBeDefined();
      expect(typeof animation.cancel).toBe('function');
    });

    test('cancel 後動畫應停止', () => {
      const animation = playLaunchAnimation(button);
      animation.cancel();
      expect(animation.playState).toBe('idle');
    });
  });

  describe('playFireworkAnimation', () => {
    let button;
    let container;

    beforeEach(() => {
      jest.useFakeTimers();
      container = document.createElement('div');
      container.style.position = 'relative';
      button = document.createElement('button');
      container.append(button);
      document.body.append(container);
    });

    afterEach(() => {
      jest.useRealTimers();
      container.remove();
    });

    test('應回傳 Promise 且在動畫結束後 resolve', async () => {
      const resultPromise = playFireworkAnimation(button);
      // Flush microtasks so await bounce.finished resolves, then advance timers
      await jest.advanceTimersByTimeAsync(1000);
      expect(resultPromise).toBeInstanceOf(Promise);
      await resultPromise;
    });

    test('應建立粒子元素並在動畫後清除', async () => {
      const resultPromise = playFireworkAnimation(button);
      await jest.advanceTimersByTimeAsync(1000);
      await resultPromise;
      const particles = container.querySelectorAll('.rail-particle');
      expect(particles).toHaveLength(0);
    });
  });
});
