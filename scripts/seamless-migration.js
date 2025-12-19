/* global chrome */
'use strict';
// 無痛自動遷移 - 用戶零感知的標註升級方案
// v2.5.0 - 完全自動化，智能回退

import Logger from './utils/Logger.js';
import { normalizeUrl } from './utils/urlUtils.js';

/**
 * 智能遷移狀態
 */
const MigrationPhase = {
  NOT_STARTED: 'not_started', // 未開始
  PHASE_1_CREATED: 'phase_1', // 階段1：新標註已創建，舊span已隱藏
  PHASE_2_VERIFIED: 'phase_2', // 階段2：新標註已驗證有效
  COMPLETED: 'completed', // 完成：舊span已移除
  FAILED: 'failed', // 失敗：已回退
};

/**
 * 無痛自動遷移管理器
 */
export class SeamlessMigrationManager {
  constructor() {
    this.storageKey = 'seamless_migration_state';
    this.statistics = {
      oldHighlightsFound: 0,
      newHighlightsCreated: 0,
      verified: 0,
      removed: 0,
      failed: 0,
    };
  }

  /**
   * 獲取當前頁面的遷移狀態
   */
  async getMigrationState() {
    try {
      // 使用標準化的 URL 作為鍵，避免 hash 和追蹤參數導致重複狀態
      const normalized =
        typeof normalizeUrl === 'function'
          ? normalizeUrl(window.location.href)
          : window.location.href;
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
      Logger.warn('[遷移] 無法讀取狀態:', error);
      return { phase: MigrationPhase.NOT_STARTED };
    }
  }

  /**
   * 更新遷移狀態
   */
  async updateMigrationState(phase, metadata = {}) {
    try {
      // 使用標準化的 URL 作為鍵，避免 hash 和追蹤參數導致重複狀態
      const normalized =
        typeof normalizeUrl === 'function'
          ? normalizeUrl(window.location.href)
          : window.location.href;
      const key = `${this.storageKey}_${normalized}`;
      const state = {
        phase,
        timestamp: Date.now(),
        metadata,
      };
      await chrome.storage.local.set({ [key]: state });
    } catch (error) {
      Logger.error('[遷移] 無法保存狀態:', error);
    }
  }

  /**
   * 執行完整的自動遷移流程
   */
  async performSeamlessMigration(highlightManager) {
    // 檢查瀏覽器支持
    if (!SeamlessMigrationManager.checkBrowserSupport()) {
      return { skipped: true, reason: 'browser_not_supported' };
    }

    // 獲取當前狀態
    const state = await this.getMigrationState();

    // 根據階段執行相應操作
    switch (state.phase) {
      case MigrationPhase.NOT_STARTED:
        return this.phase1_CreateNewHighlights(highlightManager);

      case MigrationPhase.PHASE_1_CREATED:
        return this.phase2_VerifyAndHide(highlightManager);

      case MigrationPhase.PHASE_2_VERIFIED:
        return this.phase3_RemoveOldSpans(highlightManager);

      case MigrationPhase.COMPLETED:
        return { completed: true };

      case MigrationPhase.FAILED: {
        // 防止無限重試循環
        const retryCount = state.metadata?.retryCount || 0;
        const MAX_RETRIES = 3;

        if (retryCount < MAX_RETRIES) {
          Logger.warn(
            `[Migration] Previous attempt failed. Retrying (${retryCount + 1}/${MAX_RETRIES})...`
          );
          await this.updateMigrationState(MigrationPhase.NOT_STARTED, {
            retryCount: retryCount + 1,
          });
          return this.performSeamlessMigration(highlightManager);
        }

        Logger.error('[Migration] Max retries exceeded. Stopping migration.');
        return { error: 'Migration failed after max retries' };
      }

      default:
        return { skipped: true };
    }
  }

  /**
   * 階段1：創建新標註，隱藏舊span
   */
  async phase1_CreateNewHighlights(highlightManager) {
    // 查找舊標註
    const oldSpans = document.querySelectorAll('.simple-highlight');
    if (oldSpans.length === 0) {
      await this.updateMigrationState(MigrationPhase.COMPLETED);
      return { skipped: true, reason: 'no_old_highlights' };
    }

    this.statistics.oldHighlightsFound = oldSpans.length;

    const newHighlights = [];

    // 為每個舊標註創建新標註
    for (const span of oldSpans) {
      try {
        // 提取標註信息
        const text = span.textContent;
        const bgColor = span.style.backgroundColor;
        const color = SeamlessMigrationManager.convertColorToName(bgColor);

        // 創建Range
        const range = document.createRange();
        range.selectNodeContents(span);

        // 添加新標註
        const id = highlightManager.addHighlight(range, color);

        if (id) {
          // 標記舊span（添加特殊屬性，但不移除）
          span.setAttribute('data-migrated', 'true');
          span.setAttribute('data-new-id', id);

          // 隱藏舊span（視覺上看不到，但DOM中保留）
          span.style.opacity = '0';
          span.style.pointerEvents = 'none';

          newHighlights.push({
            oldSpan: span,
            newId: id,
            text: text.substring(0, 30),
          });

          this.statistics.newHighlightsCreated++;
        }
      } catch (error) {
        Logger.error('[遷移] ✗ 創建失敗:', error);
        this.statistics.failed++;
      }
    }

    // 更新狀態到階段1
    await this.updateMigrationState(MigrationPhase.PHASE_1_CREATED, {
      newHighlights: newHighlights.map(highlight => ({
        id: highlight.newId,
        text: highlight.text,
      })),
      statistics: this.statistics,
    });

    return {
      phase: MigrationPhase.PHASE_1_CREATED,
      statistics: this.statistics,
    };
  }

  /**
   * 階段2：驗證新標註能正常恢復
   */
  async phase2_VerifyAndHide(highlightManager) {
    const oldSpans = document.querySelectorAll('.simple-highlight[data-migrated="true"]');

    // 檢查新標註是否正常加載
    const newHighlightsCount = highlightManager.getCount();
    const oldHighlightsFound = this.statistics.oldHighlightsFound || 0;

    // 只有在原本有標註但新標註未恢復時才需要回滾
    // 避免在頁面原本就沒有標註時的假陽性
    if (oldHighlightsFound > 0 && newHighlightsCount === 0) {
      // 新標註恢復失敗，回滾
      Logger.error('[遷移] ❌ 新標註未恢復，執行回滾');
      return this.rollback('verification_failed');
    }

    // 驗證成功，更新狀態
    this.statistics.verified = oldSpans.length;

    await this.updateMigrationState(MigrationPhase.PHASE_2_VERIFIED, {
      verified: true,
      statistics: this.statistics,
    });

    // 立即進入階段3
    return this.phase3_RemoveOldSpans(highlightManager);
  }

  /**
   * 階段3：完全移除舊span
   * @param {Object} _highlightManager - 保留參數以維持接口一致性（與其他 phase 方法簽名一致）
   */
  async phase3_RemoveOldSpans(_highlightManager) {
    const oldSpans = document.querySelectorAll('.simple-highlight[data-migrated="true"]');

    let removed = 0;
    for (const span of oldSpans) {
      try {
        const parent = span.parentNode;

        // 將span內容移到父節點
        while (span.firstChild) {
          parent.insertBefore(span.firstChild, span);
        }

        // 移除span
        parent.removeChild(span);
        parent.normalize();

        removed++;
      } catch (error) {
        Logger.error('[遷移] 移除span失敗:', error);
      }
    }

    this.statistics.removed = removed;

    // 標記完成（只保留最小信息）
    await this.updateMigrationState(MigrationPhase.COMPLETED, {
      timestamp: Date.now(),
      // v2.9.0: 移除 statistics 等大數據
    });

    // v2.9.0: 清理遷移數據
    await this.cleanupMigrationData();

    return {
      completed: true,
      statistics: this.statistics,
    };
  }

  /**
   * 清理遷移數據
   * v2.9.0: 新增方法，清理不再需要的遷移狀態數據
   */
  async cleanupMigrationData() {
    try {
      const allData = await chrome.storage.local.get(null);
      const keysToRemove = [];
      const currentUrl =
        typeof normalizeUrl === 'function'
          ? normalizeUrl(window.location.href)
          : window.location.href;
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
      }
    } catch (error) {
      Logger.error('[遷移] ❌ 清理遷移數據失敗:', error);
    }
  }

  /**
   * 回滾：恢復舊標註顯示
   */
  async rollback(reason) {
    Logger.warn(`[遷移] ⚠️ 執行回滾，原因: ${reason}`);

    // 恢復舊span的顯示
    const oldSpans = document.querySelectorAll('.simple-highlight[data-migrated="true"]');
    oldSpans.forEach(span => {
      span.style.opacity = '1';
      span.style.pointerEvents = 'auto';
      span.removeAttribute('data-migrated');
      span.removeAttribute('data-new-id');
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
   * 檢查瀏覽器支持
   */
  static checkBrowserSupport() {
    return 'highlights' in CSS && CSS.highlights !== undefined;
  }

  /**
   * 轉換顏色值
   */
  static convertColorToName(bgColor) {
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
   * 手動觸發遷移重試（開發者工具）
   */
  async retryMigration(highlightManager) {
    try {
      // 重置遷移狀態為未開始
      await this.updateMigrationState(MigrationPhase.NOT_STARTED);

      // 執行完整遷移流程
      return await this.performSeamlessMigration(highlightManager);
    } catch (error) {
      Logger.error('[遷移] ❌ 重試遷移失敗:', error);

      // 返回失敗結果，包含錯誤信息
      return {
        success: false,
        error: error.message,
        phase: MigrationPhase.FAILED,
      };
    }
  }

  /**
   * 獲取遷移統計信息（用於調試）
   */
  getStatistics() {
    return {
      ...this.statistics,
      supportsCSSHighlight: SeamlessMigrationManager.checkBrowserSupport(),
    };
  }
}

// Global Assignment for backward compatibility and manual debugging
if (typeof window !== 'undefined') {
  window.SeamlessMigrationManager = SeamlessMigrationManager;
}

export default SeamlessMigrationManager;
