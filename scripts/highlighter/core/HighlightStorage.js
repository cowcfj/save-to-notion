/**
 * HighlightStorage - 標註持久化管理
 *
 * 從 RestoreManager 重命名並擴展
 * 負責標註的保存、恢復和數據收集
 *
 * @version 2.19.0
 */

import Logger from '../../utils/Logger.js';
import StorageUtil from '../utils/StorageUtil.js';

/**
 * HighlightStorage
 * 管理標註的持久化操作
 */
export class HighlightStorage {
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

  // ========== 新增：保存標註 ==========

  /**
   * 保存標註到存儲
   */
  async save() {
    // StorageUtil is imported, so we don't need to check window property
    if (typeof window === 'undefined') {
      return;
    }

    // 使用標準化 URL 確保存儲鍵一致性
    const currentUrl = HighlightStorage._getNormalizedUrl();
    const data = {
      url: currentUrl,
      highlights: Array.from(this.manager.highlights.values()).map(highlight => ({
        id: highlight.id,
        color: highlight.color,
        text: highlight.text,
        timestamp: highlight.timestamp,
        rangeInfo: highlight.rangeInfo,
      })),
    };

    try {
      if (data.highlights.length === 0) {
        await StorageUtil.clearHighlights(currentUrl);
        Logger.info('[HighlightStorage] 已刪除空白標註記錄');
      } else {
        await StorageUtil.saveHighlights(currentUrl, data);
        Logger.info(`[HighlightStorage] 已保存 ${data.highlights.length} 個標註`);
      }
    } catch (error) {
      Logger.error('[HighlightStorage] 保存標註失敗:', error);
    }
  }

  // ========== 保留：恢復標註 (原 RestoreManager) ==========

  /**
   * 執行標註恢復
   *
   * @returns {Promise<boolean>} 恢復是否成功
   */
  async restore() {
    // 確保必要的依賴已準備就緒
    if (!this.manager) {
      Logger.warn('⚠️ [HighlightStorage] HighlightManager 未提供，無法恢復標註');
      return false;
    }

    try {
      Logger.info('🔧 [HighlightStorage] 開始執行標註恢復...');

      // 嘗試強制恢復標註
      const canForceRestore = typeof this.manager.forceRestoreHighlights === 'function';

      if (!canForceRestore) {
        Logger.warn('⚠️ [HighlightStorage] 無法找到 forceRestoreHighlights 方法，跳過恢復');
        return false;
      }

      const result = await this.manager.forceRestoreHighlights();

      // 若沒有明確的布林規約，僅在明確 true 時標記成功
      if (result === true) {
        Logger.info('✅ [HighlightStorage] 標註恢復成功');
        this.isRestored = true;
        this.hideToolbarAfterRestore();
        return true;
      }

      Logger.warn('⚠️ [HighlightStorage] 標註恢復失敗或無標註可恢復');
      return false;
    } catch (error) {
      Logger.error('❌ [HighlightStorage] 標註恢復過程中出錯:', error);
      return false;
    }
  }

  // ========== 新增：收集數據給 Notion ==========

  /**
   * 收集標註數據用於同步到 Notion
   * @returns {Array} 標註數據數組
   */
  collectForNotion() {
    return Array.from(this.manager.highlights.values()).map(highlight => ({
      text: highlight.text,
      color: highlight.color,
      timestamp: highlight.timestamp,
    }));
  }

  // ========== 保留：隱藏工具欄 ==========

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
        Logger.info('🎨 [HighlightStorage] 工具欄已隱藏');
      } catch (error) {
        // 隱藏失敗不應阻斷流程，只記錄錯誤
        Logger.error('❌ [HighlightStorage] 隱藏工具欄時出錯:', error);
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

  /**
   * 獲取標準化 URL
   * @returns {string}
   * @private
   */
  static _getNormalizedUrl() {
    return window.normalizeUrl ? window.normalizeUrl(window.location.href) : window.location.href;
  }
}

// 向後兼容別名
export { HighlightStorage as RestoreManager };
