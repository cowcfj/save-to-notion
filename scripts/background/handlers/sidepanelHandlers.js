/**
 * 背景腳本 Side Panel 處理模組
 */

import Logger from '../../utils/Logger.js';

/**
 * 創建 Side Panel 相關的訊息處理器
 *
 * @returns {Record<string, Function>} 處理器物件
 */
export function createSidepanelHandlers() {
  return {
    /**
     * 開啟側邊欄
     * 處理來自 Toolbar 的 'OPEN_SIDE_PANEL' 訊息
     *
     * @param {object} message 訊息物件
     * @param {chrome.runtime.MessageSender} sender 發送者資訊
     * @returns {Promise<{success: boolean, error?: string}>} 處理結果
     */
    async OPEN_SIDE_PANEL(message, sender) {
      const windowId = sender?.tab?.windowId;

      // 快速路徑：windowId 可直接從 sender 取得（content script 發送的訊息）。
      // 必須在任何 await 之前呼叫 sidePanel.open()，以保留 Chrome 透過
      // sendMessage() 傳遞的使用者手勢 Token（User Activation Token）。
      if (windowId) {
        try {
          await chrome.sidePanel.open({ windowId });
          Logger.info(
            `[SidepanelHandler] Side Panel opened successfully for windowId: ${windowId}`
          );
          return { success: true };
        } catch (error) {
          Logger.error('[SidepanelHandler] Failed to open Side Panel', error);
          return { success: false, error: error.message };
        }
      }

      // 慢速路徑：需要非同步查詢 windowId（來自 message.tabId 或當前視窗）。
      // 此路徑的使用者手勢 Token 已在到達此處前丟失，保留為向下相容的 fallback。
      let resolvedWindowId;

      if (message?.tabId) {
        try {
          const tab = await chrome.tabs.get(message.tabId);
          resolvedWindowId = tab.windowId;
        } catch (error) {
          Logger.warn('[SidepanelHandler] 無法透過 tabId 獲取 windowId', { error });
        }
      }

      if (!resolvedWindowId) {
        try {
          const win = await chrome.windows.getCurrent();
          resolvedWindowId = win.id;
        } catch (error) {
          Logger.warn('[SidepanelHandler] 無法獲取當前 windowId', { error });
        }
      }

      if (!resolvedWindowId) {
        Logger.warn('[SidepanelHandler] 無效的 context，無法開啟 Side Panel');
        return { success: false, error: 'Invalid sender context' };
      }

      try {
        await chrome.sidePanel.open({ windowId: resolvedWindowId });
        Logger.info(
          `[SidepanelHandler] Side Panel opened successfully for windowId: ${resolvedWindowId}`
        );
        return { success: true };
      } catch (error) {
        Logger.error('[SidepanelHandler] Failed to open Side Panel', error);
        return { success: false, error: error.message };
      }
    },
  };
}
