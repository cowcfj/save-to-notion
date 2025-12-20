/**
 * RestoreManager - 標註恢復管理器
 *
 * 負責從 Storage 讀取標註數據並重建。
 * 從 highlight-restore.js 移植，轉為 ES6 模組。
 *
 * @version 2.19.0
 */

import Logger from '../../utils/Logger.js';

/**
 * 標註恢復管理器
 * 負責在頁面載入後自動恢復已保存的標註
 */
export class RestoreManager {
  /**
   * @param {Object} highlightManager - HighlightManager 實例
   * @param {Object|null} toolbar - Toolbar 實例（可選，用於恢復後隱藏）
   */
  constructor(highlightManager, toolbar = null) {
    this.manager = highlightManager;
    this.toolbar = toolbar;
    this.HIDE_TOOLBAR_DELAY_MS = 500; // 與既有行為一致，避免改變 UX 時序
    this.isRestored = false;
  }

  /**
   * 執行標註恢復
   *
   * @returns {Promise<boolean>} 恢復是否成功
   */
  async restore() {
    // 確保必要的依賴已準備就緒
    if (!this.manager) {
      Logger.warn('⚠️ [RestoreManager] HighlightManager 未提供，無法恢復標註');
      return false;
    }

    try {
      Logger.info('🔧 [RestoreManager] 開始執行標註恢復...');

      // 嘗試強制恢復標註
      const canForceRestore = typeof this.manager.forceRestoreHighlights === 'function';

      if (!canForceRestore) {
        Logger.warn('⚠️ [RestoreManager] 無法找到 forceRestoreHighlights 方法，跳過恢復');
        return false;
      }

      const result = await this.manager.forceRestoreHighlights();

      // 若沒有明確的布林規約，僅在明確 true 時標記成功
      if (result === true) {
        Logger.info('✅ [RestoreManager] 標註恢復成功');
        this.isRestored = true;
        this.hideToolbarAfterRestore();
        return true;
      }

      Logger.warn('⚠️ [RestoreManager] 標註恢復失敗或無標註可恢復');
      return false;
    } catch (error) {
      Logger.error('❌ [RestoreManager] 標註恢復過程中出錯:', error);
      return false;
    }
  }

  /**
   * 恢復後隱藏工具欄
   * 保持原 500ms 延遲行為，避免改變既有使用者感受
   */
  hideToolbarAfterRestore() {
    if (!this.toolbar || typeof this.toolbar.hide !== 'function') {
      return;
    }

    setTimeout(() => {
      try {
        this.toolbar.hide();
        Logger.info('🎨 [RestoreManager] 工具欄已隱藏');
      } catch (error) {
        // 隱藏失敗不應阻斷流程，只記錄錯誤
        Logger.error('❌ [RestoreManager] 隱藏工具欄時出錯:', error);
      }
    }, this.HIDE_TOOLBAR_DELAY_MS);
  }

  /**
   * 檢查是否已完成恢復
   * @returns {boolean}
   */
  hasRestored() {
    return this.isRestored;
  }
}
