/**
 * Floating Rail 動畫模組
 *
 * 純函式，使用 Web Animations API。
 * 所有動畫綁定在傳入的 DOM 元素上，不持有外部狀態。
 */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion() {
  return globalThis.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

/**
 * 播放發射脈動動畫（等待期間循環）。
 *
 * @param {HTMLElement} button
 * @returns {Animation} 可呼叫 .cancel() 停止
 */
export function playLaunchAnimation(button) {
  if (prefersReducedMotion()) {
    button.style.opacity = '0.7';
    return {
      cancel() {
        button.style.opacity = '';
      },
      get playState() {
        return button.style.opacity === '0.7' ? 'running' : 'idle';
      },
    };
  }

  return button.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }],
    {
      duration: 800,
      iterations: Infinity,
      easing: 'ease-in-out',
    }
  );
}
