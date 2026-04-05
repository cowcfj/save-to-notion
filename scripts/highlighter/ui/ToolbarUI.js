/**
 * ToolbarUI.js
 *
 * 封裝 Toolbar 的純 DOM helper 函數。
 * 不依賴 this，不碰 Chrome API，只處理 DOM 元素的讀取與更新。
 */

import { TOOLBAR_SELECTORS } from '../../config/ui.js';
import { UI_ICONS } from '../../config/icons.js';
import { UI_MESSAGES } from '../../config/messages.js';
import { createSafeIcon } from '../../utils/securityUtils.js';

const STYLE_INLINE_BLOCK = 'inline-block';
const STYLE_TEXT_BOTTOM = 'text-bottom';
const STYLE_INLINE_FLEX = 'inline-flex';
const STYLE_NONE = 'none';

/**
 * 集中查詢 Toolbar 常用 DOM 節點
 *
 * @param {HTMLElement} container - Shadow DOM 內的 toolbar container
 * @returns {{ saveBtn: HTMLElement|null, syncBtn: HTMLElement|null, statusDiv: HTMLElement|null }}
 */
export function getToolbarElements(container) {
  return {
    saveBtn: container.querySelector(TOOLBAR_SELECTORS.SAVE_PAGE),
    syncBtn: container.querySelector(TOOLBAR_SELECTORS.SYNC_TO_NOTION),
    statusDiv: container.querySelector(TOOLBAR_SELECTORS.STATUS_CONTAINER),
  };
}

/**
 * 根據頁面保存狀態切換 Save / Sync 按鈕顯示
 *
 * @param {HTMLElement|null} saveBtn
 * @param {HTMLElement|null} syncBtn
 * @param {boolean} isSaved - 頁面是否已保存到 Notion
 */
export function applySaveSyncVisibility(saveBtn, syncBtn, isSaved) {
  if (!saveBtn || !syncBtn) {
    return;
  }

  if (isSaved) {
    // 已保存 → 顯示同步按鈕，隱藏保存按鈕
    saveBtn.style.display = STYLE_NONE;
    syncBtn.style.display = STYLE_INLINE_FLEX;
  } else {
    // 未保存 → 顯示保存按鈕，隱藏同步按鈕
    saveBtn.style.display = STYLE_INLINE_FLEX;
    syncBtn.style.display = STYLE_NONE;
  }
}

/**
 * 設置狀態欄圖標與文字，封裝共用語意與樣式
 *
 * @param {HTMLElement} statusDiv - 狀態欄容器
 * @param {string} iconKey - UI_ICONS 中的 key
 * @param {string|null} messageKey - UI_MESSAGES.TOOLBAR 中的 key，null 時使用 customMessage
 * @param {string} [customMessage] - 自定義訊息（優先於 messageKey）
 */
export function renderStatusIcon(statusDiv, iconKey, messageKey, customMessage) {
  statusDiv.textContent = '';
  const icon = createSafeIcon(UI_ICONS[iconKey]);
  icon.style.display = STYLE_INLINE_BLOCK;
  icon.style.marginRight = '4px';
  icon.style.verticalAlign = STYLE_TEXT_BOTTOM;

  if (iconKey === 'SYNC') {
    icon.style.animation = 'spin 1s linear infinite';
  }

  statusDiv.append(icon);

  // 優先使用 customMessage，否則查找 UI_MESSAGES.TOOLBAR 常數
  const textMsg = customMessage ?? UI_MESSAGES.TOOLBAR[messageKey];
  statusDiv.append(document.createTextNode(` ${textMsg}`));
}
