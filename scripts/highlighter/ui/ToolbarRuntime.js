/**
 * ToolbarRuntime.js
 *
 * 封裝 Toolbar 與 Background Script 的所有 Chrome runtime 通訊。
 * 每個函數對應一個 background action，直接使用原生 await chrome.runtime.sendMessage。
 *
 * ⚠️ 嚴禁在此模組內新增 new Promise(...) 類型的 sendMessage wrapper。
 *    若需要新增 background 通訊，直接新增 async 函數並 await sendMessage。
 */

import {
  RUNTIME_ACTIONS,
  RUNTIME_ERROR_MESSAGES,
} from '../../config/shared/messaging/runtime/index.js';

function ensureChromeRuntimeAvailable() {
  if (globalThis.window === undefined || !globalThis.chrome?.runtime?.sendMessage) {
    throw new Error(RUNTIME_ERROR_MESSAGES.EXTENSION_UNAVAILABLE);
  }

  return globalThis.chrome.runtime.sendMessage;
}

/**
 * @typedef {object} ToolbarSaveStatusResponse
 * @property {boolean} success
 * @property {string} [statusKind]
 * @property {boolean} [isSaved]
 * @property {boolean} [canSave]
 * @property {boolean} [canSyncHighlights]
 * @property {string} [stableUrl]
 * @property {string} [url]
 * @property {string} [pageId]
 * @property {string} [notionPageId]
 * @property {string} [notionUrl]
 * @property {string} [title]
 * @property {boolean} [wasDeleted]
 * @property {boolean} [deletionPending]
 * @property {string} [error]
 */

/**
 * 檢查當前頁面保存狀態
 *
 * @returns {Promise<ToolbarSaveStatusResponse|null>}
 */
export async function checkPageStatus() {
  const sendMessage = ensureChromeRuntimeAvailable();
  return sendMessage({ action: RUNTIME_ACTIONS.CHECK_PAGE_STATUS });
}

/**
 * 從 Toolbar 觸發頁面保存到 Notion
 *
 * @returns {Promise<ToolbarSaveStatusResponse>}
 */
export async function savePageFromToolbar() {
  const sendMessage = ensureChromeRuntimeAvailable();
  return sendMessage({ action: RUNTIME_ACTIONS.SAVE_PAGE_FROM_TOOLBAR });
}

/**
 * 同步標註到 Notion
 *
 * @param {Array} highlights - 標註數據陣列
 * @returns {Promise<{success: boolean, errorCode?: string, error?: string}>}
 */
export async function syncHighlights(highlights) {
  const sendMessage = ensureChromeRuntimeAvailable();
  return sendMessage({ action: RUNTIME_ACTIONS.SYNC_HIGHLIGHTS, highlights });
}

/**
 * 打開側邊欄
 *
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function openSidePanel() {
  const sendMessage = ensureChromeRuntimeAvailable();
  return sendMessage({ action: RUNTIME_ACTIONS.OPEN_SIDE_PANEL });
}
