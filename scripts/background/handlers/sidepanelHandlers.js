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
      if (!sender?.tab?.windowId) {
        Logger.warn('[SidepanelHandler] 無效的 sender，無法開啟 Side Panel');
        return { success: false, error: 'Invalid sender context' };
      }

      try {
        await chrome.sidePanel.open({ windowId: sender.tab.windowId });
        Logger.info(
          `[SidepanelHandler] Side Panel opened successfully for windowId: ${sender.tab.windowId}`
        );
        return { success: true };
      } catch (error) {
        Logger.error('[SidepanelHandler] Failed to open Side Panel', error);
        return { success: false, error: error.message };
      }
    },
  };
}
