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
      let windowId = sender?.tab?.windowId;

      // 如果從 Popup 發送，sender.tab 會是 undefined，但 message 中有 tabId
      if (!windowId && message?.tabId) {
        try {
          const tab = await chrome.tabs.get(message.tabId);
          windowId = tab.windowId;
        } catch (error) {
          Logger.warn('[SidepanelHandler] 無法透過 tabId 獲取 windowId', { error });
        }
      }

      // 如果依然沒有 windowId，嘗試獲取當前視窗
      if (!windowId) {
        try {
          const win = await chrome.windows.getCurrent();
          windowId = win.id;
        } catch (error) {
          Logger.warn('[SidepanelHandler] 無法獲取當前 windowId', { error });
        }
      }

      if (!windowId) {
        Logger.warn('[SidepanelHandler] 無效的 context，無法開啟 Side Panel');
        return { success: false, error: 'Invalid sender context' };
      }

      try {
        await chrome.sidePanel.open({ windowId });
        Logger.info(`[SidepanelHandler] Side Panel opened successfully for windowId: ${windowId}`);
        return { success: true };
      } catch (error) {
        Logger.error('[SidepanelHandler] Failed to open Side Panel', error);
        return { success: false, error: error.message };
      }
    },
  };
}
