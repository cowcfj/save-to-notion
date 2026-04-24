/**
 * ToolbarUI.js
 *
 * 封裝 Toolbar 的純 DOM helper 函數。
 * 不依賴 this，不碰 Chrome API，只處理 DOM 元素的讀取與更新。
 */

import { TOOLBAR_SELECTORS } from '../../config/contentSafe/toolbarSelectors.js';
import { TOOLBAR_ICONS } from '../../config/contentSafe/toolbarIcons.js';
import { TOOLBAR_MESSAGES } from '../../config/contentSafe/toolbarMessages.js';
import { createSafeIcon } from '../../utils/securityUtils.js';

const STYLE_INLINE_BLOCK = 'inline-block';
const STYLE_TEXT_BOTTOM = 'text-bottom';
const STYLE_INLINE_FLEX = 'inline-flex';
const STYLE_NONE = 'none';
const DEFAULT_STATUS_ICON_KEY = 'INFO';
const STATUS_ICON_KEY_MAP = {
  SYNC: 'REFRESH',
  CHECK: 'SUCCESS',
  X: 'ERROR',
};

function resolveStatusIconKey(iconKey) {
  const normalizedKey = typeof iconKey === 'string' ? iconKey.toUpperCase() : '';
  const mappedKey = STATUS_ICON_KEY_MAP[normalizedKey] ?? normalizedKey;

  if (mappedKey && TOOLBAR_ICONS[mappedKey]) {
    return mappedKey;
  }

  if (TOOLBAR_ICONS[DEFAULT_STATUS_ICON_KEY]) {
    return DEFAULT_STATUS_ICON_KEY;
  }

  return null;
}

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
 * @param {object|boolean} status - 保存狀態 contract 或向後兼容的 isSaved 布林值
 */
export function applySaveSyncVisibility(saveBtn, syncBtn, status) {
  if (!saveBtn || !syncBtn) {
    return;
  }

  const isSaved =
    typeof status === 'object' && status !== null ? status.canSave === false : Boolean(status);

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
 * @param {string} iconKey - TOOLBAR_ICONS 中的 key
 * @param {string|null} messageKey - TOOLBAR_MESSAGES 中的 key，null 時使用 customMessage
 * @param {string} [customMessage] - 自定義訊息（優先於 messageKey）
 */
export function renderStatusIcon(statusDiv, iconKey, messageKey, customMessage) {
  statusDiv.textContent = '';
  const resolvedIconKey = resolveStatusIconKey(iconKey);

  if (resolvedIconKey) {
    const icon = createSafeIcon(TOOLBAR_ICONS[resolvedIconKey]);
    icon.style.display = STYLE_INLINE_BLOCK;
    icon.style.marginRight = '4px';
    icon.style.verticalAlign = STYLE_TEXT_BOTTOM;

    if (resolvedIconKey === 'REFRESH') {
      icon.style.animation = 'spin 1s linear infinite';
    }

    statusDiv.append(icon);
  }

  const textMsg = customMessage ?? TOOLBAR_MESSAGES?.[messageKey] ?? '';
  if (textMsg !== '') {
    statusDiv.append(document.createTextNode(` ${textMsg}`));
  }
}
