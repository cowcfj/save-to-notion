/**
 * Floating Rail 動畫模組
 *
 * 純函式，使用 Web Animations API。
 * 所有動畫綁定在傳入的 DOM 元素上，不持有外部狀態。
 */

import { UI_MESSAGES } from '../../config/shared/messages.js';

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

function safeFinished(animation) {
  return animation.finished.catch(() => undefined);
}

const PARTICLE_COLORS = [
  '#ff6b6b',
  '#ffd93d',
  '#6bcb77',
  '#4d96ff',
  '#ff8fd8',
  '#a78bfa',
  '#f97316',
  '#06b6d4',
];

/**
 * @param {HTMLElement} button
 * @returns {Promise<void>}
 */
export async function playFireworkAnimation(button) {
  if (prefersReducedMotion()) {
    return;
  }

  const bounce = button.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.3)' },
      { transform: 'scale(0.85)' },
      { transform: 'scale(1.15)' },
      { transform: 'scale(1)' },
    ],
    { duration: 500, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }
  );

  await safeFinished(bounce);

  const container = button;
  const promises = [];

  const ring = document.createElement('span');
  ring.className = 'rail-ring';
  ring.style.cssText = `
    position: absolute; top: 50%; left: 50%;
    width: 34px; height: 34px; border-radius: 50%;
    border: 2px solid currentColor; pointer-events: none;
    transform: translate(-50%, -50%) scale(1);
  `;
  container.append(ring);
  const ringAnim = ring.animate(
    [
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.7 },
      { transform: 'translate(-50%, -50%) scale(3)', opacity: 0 },
    ],
    { duration: 600, easing: 'ease-out' }
  );
  promises.push(
    safeFinished(ringAnim).then(() => ring.remove()),
    emitParticles(container, 8, 30, 500),
    (async () => {
      await new Promise(resolve => setTimeout(resolve, 150));
      return emitParticles(container, 6, 45, 700);
    })()
  );

  await Promise.all(promises);
}

function emitParticles(container, count, spread, duration) {
  const promises = [];
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('span');
    particle.className = 'rail-particle';
    // eslint-disable-next-line sonarjs/pseudo-random -- visual-only animation jitter
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    // eslint-disable-next-line sonarjs/pseudo-random -- visual-only animation jitter
    const dist = spread * (0.7 + Math.random() * 0.6);
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    // eslint-disable-next-line sonarjs/pseudo-random -- visual-only particle sizing
    const size = 4 + Math.random() * 3;
    particle.style.cssText = `
      position: absolute; top: 50%; left: 50%;
      width: ${size}px; height: ${size}px; border-radius: 50%;
      background: ${PARTICLE_COLORS[i % PARTICLE_COLORS.length]};
      pointer-events: none; transform: translate(-50%, -50%);
    `;
    container.append(particle);
    const anim = particle.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        {
          transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0.2)`,
          opacity: 0,
        },
      ],
      { duration, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }
    );
    promises.push(safeFinished(anim).then(() => particle.remove()));
  }
  return Promise.all(promises);
}

const FAIL_TOOLTIP_DURATION_MS = 3000;
const FAIL_SHAKE_CENTER_TRANSFORM = 'translateX(0)';
const FAIL_SHAKE_LEFT_TRANSFORM = 'translateX(-4px)';
const FAIL_SHAKE_RIGHT_TRANSFORM = 'translateX(4px)';
const _failHideTimers = new WeakMap();

/**
 * @param {HTMLElement} button
 * @param {HTMLElement} tooltip - .rail-error-tooltip 元素
 * @returns {Promise<void>}
 */
export async function playFailAnimation(button, tooltip) {
  const shake = prefersReducedMotion()
    ? null
    : button.animate(
        [
          { transform: FAIL_SHAKE_CENTER_TRANSFORM },
          { transform: FAIL_SHAKE_LEFT_TRANSFORM },
          { transform: FAIL_SHAKE_RIGHT_TRANSFORM },
          { transform: FAIL_SHAKE_LEFT_TRANSFORM },
          { transform: FAIL_SHAKE_RIGHT_TRANSFORM },
          { transform: FAIL_SHAKE_LEFT_TRANSFORM },
          { transform: FAIL_SHAKE_CENTER_TRANSFORM },
        ],
        { duration: 400, easing: 'ease-in-out' }
      );

  tooltip.textContent = UI_MESSAGES.FLOATING_RAIL.SAVE_FAILED;
  tooltip.classList.add('visible');

  if (shake) {
    try {
      await shake.finished;
    } catch {
      // Animation was cancelled (e.g. rapid re-trigger) — proceed to schedule hide
    }
  }

  const existingTimer = _failHideTimers.get(tooltip);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    tooltip.classList.remove('visible');
    _failHideTimers.delete(tooltip);
  }, FAIL_TOOLTIP_DURATION_MS);
  _failHideTimers.set(tooltip, timer);
}
