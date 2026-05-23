/**
 * FloatingRailAnimations.js 單元測試
 */

import {
  playLaunchAnimation,
  playFireworkAnimation,
  playFailAnimation,
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

    describe('prefers-reduced-motion', () => {
      beforeEach(() => {
        globalThis.matchMedia = jest.fn().mockReturnValue({ matches: true });
      });

      afterEach(() => {
        delete globalThis.matchMedia;
      });

      test('應設定 opacity 並回傳 fake animation', () => {
        const animation = playLaunchAnimation(button);
        expect(button.style.opacity).toBe('0.7');
        expect(animation.playState).toBe('running');
      });

      test('cancel 應清除 opacity 並回報 idle', () => {
        const animation = playLaunchAnimation(button);
        animation.cancel();
        expect(button.style.opacity).toBe('');
        expect(animation.playState).toBe('idle');
      });
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
      const appendSpy = jest.spyOn(button, 'append');
      const resultPromise = playFireworkAnimation(button);
      await jest.advanceTimersByTimeAsync(1000);
      await resultPromise;
      const particleAppends = appendSpy.mock.calls.filter(
        ([el]) => el instanceof HTMLElement && el.classList.contains('rail-particle')
      );
      expect(particleAppends.length).toBeGreaterThan(0);
      const particlesAfter = button.querySelectorAll('.rail-particle');
      expect(particlesAfter).toHaveLength(0);
      appendSpy.mockRestore();
    });

    test('prefers-reduced-motion 時應跳過粒子動畫', async () => {
      globalThis.matchMedia = jest.fn().mockReturnValue({ matches: true });
      const resultPromise = playFireworkAnimation(button);
      await jest.advanceTimersByTimeAsync(1000);
      await resultPromise;
      const particles = button.querySelectorAll('.rail-particle');
      expect(particles).toHaveLength(0);
      const rings = button.querySelectorAll('.rail-ring');
      expect(rings).toHaveLength(0);
      delete globalThis.matchMedia;
    });
  });

  describe('playFailAnimation', () => {
    let button;
    let tooltip;

    beforeEach(() => {
      jest.useFakeTimers();
      button = document.createElement('button');
      tooltip = document.createElement('span');
      tooltip.className = 'rail-error-tooltip';
      document.body.append(button);
      document.body.append(tooltip);
    });

    afterEach(() => {
      jest.useRealTimers();
      button.remove();
      tooltip.remove();
    });

    test('應在 shake 結束後立即 resolve（不等待 tooltip 隱藏）', async () => {
      const promise = playFailAnimation(button, tooltip);
      await promise;
      expect(tooltip.classList.contains('visible')).toBe(true);
    });

    test('應設定 tooltip 文字為「保存失敗」', async () => {
      const promise = playFailAnimation(button, tooltip);
      expect(tooltip.textContent).toBe('保存失敗');
      await promise;
    });

    test('應可自訂 tooltip 顯示的錯誤訊息', async () => {
      const customMessage = '自訂錯誤訊息';
      const promise = playFailAnimation(button, tooltip, customMessage);
      expect(tooltip.textContent).toBe(customMessage);
      await promise;
    });

    test('tooltip 應在背景延遲後移除 visible class', async () => {
      const promise = playFailAnimation(button, tooltip);
      await promise;
      expect(tooltip.classList.contains('visible')).toBe(true);
      await jest.advanceTimersByTimeAsync(3000);
      expect(tooltip.classList.contains('visible')).toBe(false);
    });
  });
});
