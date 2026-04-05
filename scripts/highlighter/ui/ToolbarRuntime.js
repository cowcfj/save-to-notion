/**
 * ToolbarRuntime.js
 *
 * 封裝 Toolbar 與 Background Script 的所有 Chrome runtime 通訊。
 * 每個函數對應一個 background action，直接使用原生 await chrome.runtime.sendMessage。
 *
 * ⚠️ 嚴禁在此模組內新增 new Promise(...) 類型的 sendMessage wrapper。
 *    若需要新增 background 通訊，直接新增 async 函數並 await sendMessage。
 */

/**
 * 檢查當前頁面保存狀態
 *
 * @returns {Promise<{success: boolean, isSaved: boolean, stableUrl?: string}|null>}
 */
export async function checkPageStatus() {
  if (globalThis.window === undefined || !globalThis.chrome?.runtime?.sendMessage) {
    throw new Error('無法連接擴展');
  }
  return globalThis.chrome.runtime.sendMessage({ action: 'checkPageStatus' });
}

/**
 * 從 Toolbar 觸發頁面保存到 Notion
 *
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function savePageFromToolbar() {
  if (globalThis.window === undefined || !globalThis.chrome?.runtime?.sendMessage) {
    throw new Error('無法連接擴展');
  }
  return globalThis.chrome.runtime.sendMessage({ action: 'SAVE_PAGE_FROM_TOOLBAR' });
}

/**
 * 同步標註到 Notion
 *
 * @param {Array} highlights - 標註數據陣列
 * @returns {Promise<{success: boolean, errorCode?: string, error?: string}>}
 */
export async function syncHighlights(highlights) {
  if (globalThis.window === undefined || !globalThis.chrome?.runtime?.sendMessage) {
    throw new Error('無法連接擴展');
  }
  return globalThis.chrome.runtime.sendMessage({ action: 'syncHighlights', highlights });
}

/**
 * 打開側邊欄
 *
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function openSidePanel() {
  if (globalThis.window === undefined || !globalThis.chrome?.runtime?.sendMessage) {
    throw new Error('無法連接擴展');
  }
  return globalThis.chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL' });
}
