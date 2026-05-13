/**
 * FloatingRailAnimations.js 單元測試
 */

import { playLaunchAnimation } from '../../../../scripts/highlighter/ui/FloatingRailAnimations.js';

describe('FloatingRailAnimations', () => {
  describe('playLaunchAnimation', () => {
    let button;

    beforeEach(() => {
      button = document.createElement('button');
      // jsdom 不支援 Web Animations API，需 mock
      button.animate = jest.fn(() => ({
        cancel: jest.fn(function () {
          this.playState = 'idle';
        }),
        playState: 'running',
      }));
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
});
