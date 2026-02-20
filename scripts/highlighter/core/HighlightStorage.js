/**
 * HighlightStorage - 標註持久化管理
 *
 * 從 RestoreManager 重命名並擴展
 * 負責標註的保存、恢復和數據收集
 */

import Logger from '../../utils/Logger.js';
import { StorageUtil } from '../utils/StorageUtil.js';

/**
 * HighlightStorage
 * 管理標註的持久化操作
 */
export class HighlightStorage {
  /**
   * @param {object} highlightManager - HighlightManager 實例
   * @param {object | null} toolbar - Toolbar 實例（可選，用於恢復後隱藏）
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
    if (globalThis.window === undefined) {
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
      const highlights = await this._loadHighlightsWithFallback();

      if (highlights.length === 0) {
        Logger.info('[HighlightStorage] 無標註可恢復');
        return false;
      }

      // 清除現有（避免重複）
      this.manager.clearAll({ skipStorage: true });

      // 委託 Manager 並行處理標註的創建
      // 由於使用 CSS Custom Highlight API，不會修改 DOM 結構，因此沒有競態條件問題
      const restorePromises = highlights.map(async item => {
        try {
          const result = this.manager.restoreLocalHighlight(item);
          return result ? 1 : 0;
        } catch (error) {
          Logger.warn(`Failed to restore highlight ${item.id}`, error);
          return 0;
        }
      });

      const results = await Promise.all(restorePromises);
      const successCount = results.reduce((sum, count) => sum + count, 0);

      Logger.info(`[HighlightStorage] Restored ${successCount} highlights`);
      this.isRestored = true;
      this.hideToolbarAfterRestore();
      return true;
    } catch (error) {
      Logger.error('❌ [HighlightStorage] 標註恢復過程中出錯:', error);
      return false;
    }
  }

  // ========== 新增：收集數據給 Notion ==========

  /**
   * 收集標註數據用於同步到 Notion
   *
   * @returns {Array} 標註數據數組
   */
  collectForNotion() {
    if (
      !this.manager ||
      !this.manager.highlights ||
      typeof this.manager.highlights.values !== 'function'
    ) {
      return [];
    }
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
   *
   * @returns {boolean}
   */
  hasRestored() {
    return this.isRestored;
  }

  /**
   * 獲取標準化 URL
   *
   * @returns {string}
   * @private
   */
  static _getNormalizedUrl() {
    if (globalThis.__NOTION_STABLE_URL__) {
      return globalThis.__NOTION_STABLE_URL__;
    }
    return globalThis.normalizeUrl
      ? globalThis.normalizeUrl(globalThis.location.href)
      : globalThis.location.href;
  }

  /**
   * 加載標註（含回退邏輯）
   *
   * @returns {Promise<Array>}
   * @private
   */
  async _loadHighlightsWithFallback() {
    const currentUrl = HighlightStorage._getNormalizedUrl();
    Logger.debug(`[HighlightStorage] Loading highlights. Current URL: "${currentUrl}"`, {
      action: '_loadHighlightsWithFallback',
      stableUrlGlobal: globalThis.__NOTION_STABLE_URL__ || 'undefined',
    });

    const data = await StorageUtil.loadHighlights(currentUrl);
    const highlights = Array.isArray(data) ? data : data?.highlights || [];

    // 若找到標註，直接返回
    if (highlights.length > 0) {
      return highlights;
    }

    // [Phase 2 Fix] 回退邏輯：若使用穩定 URL 未找到標註，嘗試使用原始 URL
    if (globalThis.__NOTION_STABLE_URL__) {
      const originalUrl = globalThis.normalizeUrl
        ? globalThis.normalizeUrl(globalThis.location.href)
        : globalThis.location.href;

      if (originalUrl !== currentUrl) {
        const fallbackData = await StorageUtil.loadHighlights(originalUrl);
        const fallbackHighlights = Array.isArray(fallbackData)
          ? fallbackData
          : fallbackData?.highlights || [];

        if (fallbackHighlights.length > 0) {
          Logger.info('[HighlightStorage] Found highlights via fallback URL', { originalUrl });
          return fallbackHighlights;
        }
      }
    }

    return [];
  }
}

// 向後兼容別名
export { HighlightStorage as RestoreManager };
