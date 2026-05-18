/**
 * Onboarding wizard controller
 *
 * 純邏輯模組，與 DOM 互動但不持有 module-level state，
 * 便於 jest 在 jsdom 環境下注入自製 root 與 mock storage 進行單元測試。
 *
 * Entry script (onboarding.js) 將 document 作為 root 傳入並接線 click handler。
 */

import { ONBOARDING_COMPLETED_KEY } from '../scripts/config/shared/storage.js';

export const TOTAL_STEPS = 6;
export { ONBOARDING_COMPLETED_KEY } from '../scripts/config/shared/storage.js';

/**
 * 顯示指定步驟，隱藏其他 section，並更新進度圓點的 active 狀態。
 *
 * @param {ParentNode} root - 包含 section 與 progress-dot 的 DOM 根節點
 * @param {number} step - 目標步驟（會 clamp 到 [1, TOTAL_STEPS]）
 * @returns {number} 實際套用的步驟數
 */
export function showStep(root, step) {
  const target = Math.min(Math.max(Math.trunc(step) || 1, 1), TOTAL_STEPS);
  const sections = root.querySelectorAll('section[data-step]');
  sections.forEach(section => {
    section.hidden = Number(section.dataset.step) !== target;
  });
  const dots = root.querySelectorAll('.progress-dot');
  dots.forEach(dot => {
    dot.classList.toggle('active', Number(dot.dataset.dot) === target);
  });
  return target;
}

/**
 * 讀取當前可見 section 的步驟數；無可見 section 時回傳 1。
 *
 * @param {ParentNode} root
 * @returns {number}
 */
export function getCurrentStep(root) {
  const visible = root.querySelector('section[data-step]:not([hidden])');
  if (!visible) {
    return 1;
  }
  return Number(visible.dataset.step) || 1;
}

/**
 * 前進一步；已在最後一步時保持不變。
 *
 * @param {ParentNode} root
 * @returns {number} 前進後的步驟數
 */
export function nextStep(root) {
  return showStep(root, getCurrentStep(root) + 1);
}

/**
 * 跳到最後一步（完成頁）。
 *
 * @param {ParentNode} root
 * @returns {number}
 */
export function skipToEnd(root) {
  return showStep(root, TOTAL_STEPS);
}

/**
 * 將 onboardingCompleted 寫入 storage 為 true。
 *
 * @param {{ set: (items: object) => Promise<void> }} storage
 *   chrome.storage.local 形狀的物件；caller 由頁面層注入便於測試。
 * @returns {Promise<void>}
 */
export async function markCompleted(storage) {
  await storage.set({ [ONBOARDING_COMPLETED_KEY]: true });
}
