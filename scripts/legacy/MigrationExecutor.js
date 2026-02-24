/**
 * MigrationExecutor - 標註遷移執行器
 *
 * 合併 highlighter-migration.js 與 seamless-migration.js 的核心邏輯。
 * 設計為按需注入，不隨頁面自動載入。
 * 由 Background Script 動態注入至目標頁面執行。
 *
 * @version 2.19.0
 */

/* global chrome */
import Logger from '../utils/Logger.js';
import { normalizeUrl } from '../utils/urlUtils.js';
import { convertBgColorToName } from '../highlighter/utils/color.js';

const MIGRATED_SPAN_SELECTOR = '.simple-highlight[data-migrated="true"]';

/**
 * 遷移階段狀態
 */
export const MigrationPhase = {
  NOT_STARTED: 'not_started',
  PHASE_1_CREATED: 'phase_1', // 階段1：新標註已創建，舊 span 已隱藏
  PHASE_2_VERIFIED: 'phase_2', // 階段2：新標註已驗證有效
  COMPLETED: 'completed', // 完成：舊 span 已移除
  FAILED: 'failed', // 失敗：已回退
};

/**
 * 遷移執行器 - 負責執行標註從舊版 DOM 格式遷移到新版 CSS Highlight API
 */
export class MigrationExecutor {
  constructor() {
    this.statistics = {
      oldHighlightsFound: 0,
      newHighlightsCreated: 0,
      verified: 0,
      removed: 0,
      failed: 0,
    };
  }

  // =====================================================
  // 狀態管理方法
  // =====================================================

  /**
   * 獲取當前頁面的遷移狀態
   *
   * @returns {Promise<object>}
   */
  async getMigrationState() {
    try {
      const normalized = MigrationExecutor.normalizeCurrentUrl();
      const key = `${this.storageKey}_${normalized}`;
      const data = await chrome.storage.local.get(key);
      return (
        data[key] || {
          phase: MigrationPhase.NOT_STARTED,
          timestamp: Date.now(),
          attempts: 0,
        }
      );
    } catch (error) {
      Logger.warn('[MigrationExecutor] 無法讀取狀態:', error);
      return { phase: MigrationPhase.NOT_STARTED };
    }
  }

  /**
   * 更新遷移狀態
   *
   * @param {string} phase - 遷移階段
   * @param {object} metadata - 附加元數據
   */
  async updateMigrationState(phase, metadata = {}) {
    try {
      const normalized = MigrationExecutor.normalizeCurrentUrl();
      const key = `${this.storageKey}_${normalized}`;
      const state = {
        phase,
        timestamp: Date.now(),
        metadata,
      };
      await chrome.storage.local.set({ [key]: state });
      Logger.log(`[MigrationExecutor] 狀態已更新: ${phase}`);
    } catch (error) {
      Logger.error('[MigrationExecutor] 無法保存狀態:', error);
    }
  }

  /**
   * 正規化當前頁面 URL
   *
   * @returns {string}
   */
  static normalizeCurrentUrl() {
    return typeof normalizeUrl === 'function'
      ? normalizeUrl(globalThis.location.href)
      : globalThis.location.href;
  }

  // =====================================================
  // 核心遷移方法
  // =====================================================

  /**
   * 檢查是否需要遷移
   *
   * @returns {Promise<boolean>}
   */
  async needsMigration() {
    const state = await this.getMigrationState();

    if (state.phase === MigrationPhase.COMPLETED) {
      Logger.info('[MigrationExecutor] 此頁面已完成遷移');
      return false;
    }

    // 檢查頁面中是否有舊版標註
    const oldHighlights = document.querySelectorAll('.simple-highlight');
    this.statistics.oldHighlightsFound = oldHighlights.length;

    if (oldHighlights.length > 0) {
      Logger.info(`[MigrationExecutor] 檢測到 ${oldHighlights.length} 個舊版標註`);
      return true;
    }

    return false;
  }

  /**
   * 執行遷移
   *
   * @param {object} highlightManager - HighlightManager 實例
   * @returns {Promise<object>}
   */
  async migrate(highlightManager) {
    Logger.info('[MigrationExecutor] 🚀 開始遷移流程...');

    // 檢查瀏覽器支持
    if (!MigrationExecutor.checkBrowserSupport()) {
      return { skipped: true, reason: 'browser_not_supported' };
    }

    // 獲取當前狀態
    const state = await this.getMigrationState();

    // 根據階段執行相應操作
    switch (state.phase) {
      case MigrationPhase.NOT_STARTED: {
        return this.executePhase1(highlightManager);
      }

      case MigrationPhase.PHASE_1_CREATED: {
        return this.executePhase2(highlightManager);
      }

      case MigrationPhase.PHASE_2_VERIFIED: {
        return this.executePhase3(highlightManager);
      }

      case MigrationPhase.COMPLETED: {
        return { completed: true };
      }

      case MigrationPhase.FAILED: {
        const retryCount = state.metadata?.retryCount || 0;
        const MAX_RETRIES = 3;

        if (retryCount < MAX_RETRIES) {
          Logger.warn(
            `[MigrationExecutor] 上次遷移失敗，重試中 (${retryCount + 1}/${MAX_RETRIES})...`
          );
          await this.updateMigrationState(MigrationPhase.NOT_STARTED, {
            retryCount: retryCount + 1,
          });
          return this.migrate(highlightManager);
        }

        Logger.error('[MigrationExecutor] 已達最大重試次數，停止遷移');
        return { error: 'Migration failed after max retries' };
      }

      default: {
        return { skipped: true };
      }
    }
  }

  /**
   * 階段1：創建新標註，隱藏舊 span
   *
   * @param {object} highlightManager
   * @returns {Promise<object>}
   */
  async executePhase1(highlightManager) {
    const oldSpans = document.querySelectorAll('.simple-highlight');
    if (oldSpans.length === 0) {
      await this.updateMigrationState(MigrationPhase.COMPLETED);
      return { skipped: true, reason: 'no_old_highlights' };
    }

    this.statistics.oldHighlightsFound = oldSpans.length;
    const newHighlights = [];

    for (const span of oldSpans) {
      try {
        const result = MigrationExecutor.convertSpanToRange(span, highlightManager);
        if (result) {
          newHighlights.push(result);
          this.statistics.newHighlightsCreated++;
        }
      } catch (error) {
        Logger.error('[MigrationExecutor] 轉換失敗:', error);
        this.statistics.failed++;
      }
    }

    await this.updateMigrationState(MigrationPhase.PHASE_1_CREATED, {
      newHighlights: newHighlights.map(highlight => ({ id: highlight.id, text: highlight.text })),
      statistics: this.statistics,
    });

    return {
      phase: MigrationPhase.PHASE_1_CREATED,
      statistics: this.statistics,
    };
  }

  /**
   * 階段2：驗證新標註能正常恢復
   *
   * @param {object} highlightManager
   * @returns {Promise<object>}
   */
  async executePhase2(highlightManager) {
    const oldSpans = document.querySelectorAll(MIGRATED_SPAN_SELECTOR);
    const newHighlightsCount = highlightManager.getCount();
    const oldHighlightsFound =
      this.statistics.oldHighlightsFound > 0 ? this.statistics.oldHighlightsFound : oldSpans.length;

    // 補回丟失的統計數據
    if (this.statistics.oldHighlightsFound === 0) {
      this.statistics.oldHighlightsFound = oldHighlightsFound;
    }

    // 只有在原本有標註但新標註未恢復時才需要回滾
    if (oldHighlightsFound > 0 && newHighlightsCount === 0) {
      Logger.error('[MigrationExecutor] 新標註未恢復，執行回滾');
      return this.rollback('verification_failed');
    }

    this.statistics.verified = oldSpans.length;

    await this.updateMigrationState(MigrationPhase.PHASE_2_VERIFIED, {
      verified: true,
      statistics: this.statistics,
    });

    // 立即進入階段3
    return this.executePhase3(highlightManager);
  }

  /**
   * 階段3：完全移除舊 span
   *
   * @param {object} _highlightManager - 保留參數以維持接口一致性
   * @returns {Promise<object>}
   */
  async executePhase3(_highlightManager) {
    const oldSpans = document.querySelectorAll(MIGRATED_SPAN_SELECTOR);
    let removed = 0;

    for (const span of oldSpans) {
      try {
        MigrationExecutor.removeOldSpan(span);
        removed++;
      } catch (error) {
        Logger.error('[MigrationExecutor] 移除 span 失敗:', error);
      }
    }

    this.statistics.removed = removed;

    await this.updateMigrationState(MigrationPhase.COMPLETED, {
      timestamp: Date.now(),
    });

    // 清理舊遷移數據
    await this.cleanup();

    return {
      completed: true,
      statistics: this.statistics,
    };
  }

  // =====================================================
  // 轉換與清理方法
  // =====================================================

  /**
   * 將舊的 span 元素轉換為 Range 並添加新標註
   *
   * @param {HTMLElement} span
   * @param {object} highlightManager
   * @returns {object | null}
   */
  static convertSpanToRange(span, highlightManager) {
    try {
      const text = span.textContent;
      const bgColor = span.style.backgroundColor;
      const color = MigrationExecutor.convertColorToName(bgColor);

      // 創建 Range 包含整個 span
      const range = document.createRange();
      range.selectNodeContents(span);

      // 使用新版標註管理器添加標註
      const id = highlightManager.addHighlight(range, color);

      if (id) {
        // 標記舊 span（添加特殊屬性，但不移除）
        span.dataset.migrated = 'true';
        span.dataset.newId = id;

        // 隱藏舊 span（視覺上看不到，但 DOM 中保留）
        span.style.opacity = '0';
        span.style.pointerEvents = 'none';

        Logger.info(`[MigrationExecutor] ✓ 成功遷移: ${text.slice(0, 20)}...`);
        return { id, text: text.slice(0, 30), color };
      }

      Logger.warn('[MigrationExecutor] 新標註添加失敗');
      return null;
    } catch (error) {
      Logger.error('[MigrationExecutor] 轉換過程出錯:', error);
      return null;
    }
  }

  /**
   * 移除舊的 span 元素
   *
   * @param {HTMLElement} span
   */
  static removeOldSpan(span) {
    const parent = span.parentNode;

    // 將 span 內容移到父節點
    while (span.firstChild) {
      parent.insertBefore(span.firstChild, span);
    }

    // 移除 span
    span.remove();

    // 合併文本節點
    parent.normalize();
  }

  /**
   * 回滾：恢復舊標註顯示
   *
   * @param {string} reason - 回滾原因
   * @returns {Promise<object>}
   */
  async rollback(reason) {
    Logger.warn(`[MigrationExecutor] ⚠️ 執行回滾，原因: ${reason}`);

    const oldSpans = document.querySelectorAll(MIGRATED_SPAN_SELECTOR);
    oldSpans.forEach(span => {
      span.style.opacity = '1';
      span.style.pointerEvents = 'auto';
      delete span.dataset.migrated;
      delete span.dataset.newId;
    });

    await this.updateMigrationState(MigrationPhase.FAILED, {
      reason,
      failedAt: new Date().toISOString(),
    });

    return {
      rolledBack: true,
      reason,
    };
  }

  /**
   * 清理遷移數據
   */
  async cleanup() {
    try {
      const allData = await chrome.storage.local.get(null);
      const keysToRemove = [];
      const currentUrl = MigrationExecutor.normalizeCurrentUrl();
      const currentKey = `${this.storageKey}_${currentUrl}`;

      for (const key of Object.keys(allData)) {
        // 清理其他頁面的遷移狀態（保留當前頁面的完成標記）
        if (key.startsWith('seamless_migration_state_') && key !== currentKey) {
          const state = allData[key];
          // 如果已完成超過7天，清理
          if (
            state.phase === MigrationPhase.COMPLETED &&
            Date.now() - state.timestamp > 7 * 24 * 60 * 60 * 1000
          ) {
            keysToRemove.push(key);
          }
        }

        // 清理舊的遷移標記
        if (
          key.startsWith('highlight_migration_status_') ||
          key.startsWith('migration_completed_')
        ) {
          keysToRemove.push(key);
        }
      }

      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        Logger.info(`[MigrationExecutor] 已清理 ${keysToRemove.length} 個舊遷移數據`);
      }
    } catch (error) {
      Logger.error('[MigrationExecutor] 清理遷移數據失敗:', error);
    }
  }

  // =====================================================
  // 靜態工具方法
  // =====================================================

  /**
   * 檢查瀏覽器是否支持 CSS Highlight API
   *
   * @returns {boolean}
   */
  static checkBrowserSupport() {
    return 'highlights' in CSS && CSS.highlights !== undefined;
  }

  /**
   * 轉換顏色值到顏色名稱
   *
   * @param {string} bgColor - 背景顏色（RGB 或 HEX 格式）
   * @returns {string} 顏色名稱
   */
  static convertColorToName(bgColor) {
    // 優先使用 highlighter 的轉換函數
    if (typeof convertBgColorToName === 'function') {
      return convertBgColorToName(bgColor);
    }

    // 回退：內建顏色映射
    const colorMap = {
      'rgb(255, 243, 205)': 'yellow',
      '#fff3cd': 'yellow',
      'rgb(212, 237, 218)': 'green',
      '#d4edda': 'green',
      'rgb(204, 231, 255)': 'blue',
      '#cce7ff': 'blue',
      'rgb(248, 215, 218)': 'red',
      '#f8d7da': 'red',
    };

    return colorMap[bgColor] || 'yellow';
  }

  /**
   * 獲取遷移統計信息
   *
   * @returns {object}
   */
  getStatistics() {
    return {
      ...this.statistics,
      supportsCSSHighlight: MigrationExecutor.checkBrowserSupport(),
    };
  }
  storageKey = 'seamless_migration_state';
  migrationKey = 'highlight_migration_status';
}

// 全域暴露供動態注入後調用
if (globalThis.window !== undefined) {
  globalThis.MigrationExecutor = MigrationExecutor;
  globalThis.MigrationPhase = MigrationPhase;
}

export default MigrationExecutor;
