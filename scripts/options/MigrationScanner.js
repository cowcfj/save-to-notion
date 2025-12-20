/**
 * MigrationScanner - 遷移掃描器
 *
 * 在選項頁面中執行，掃描 chrome.storage.local 中的舊版標註數據
 * 並協調 Background 執行批次遷移
 *
 * @version 1.0.0
 */

/* global chrome */

/**
 * 遷移掃描結果類型
 * @typedef {Object} ScanResult
 * @property {string[]} urls - 待遷移的 URL 清單
 * @property {number} totalHighlights - 總標註數量
 * @property {number} legacyCount - 舊版格式數量
 * @property {boolean} needsMigration - 是否需要遷移
 */

/**
 * 遷移進度回調類型
 * @callback ProgressCallback
 * @param {number} current - 當前進度
 * @param {number} total - 總數
 * @param {string} status - 狀態描述
 */

import Logger from '../utils/Logger.js';

/**
 * 舊版數據遷移掃描器
 * 負責掃描和識別存儲中需要從舊版格式遷移到新版格式的標註數據
 */
export class MigrationScanner {
  constructor() {
    this.LEGACY_KEY_PREFIX = 'highlights_';
    this.MIGRATION_STATE_PREFIX = 'seamless_migration_state_';
  }

  /**
   * 掃描所有待遷移數據
   * @returns {Promise<ScanResult>}
   */
  async scanStorage() {
    try {
      const allData = await chrome.storage.local.get(null);
      const items = [];
      let totalHighlights = 0;
      let legacyCount = 0;

      for (const [key, value] of Object.entries(allData)) {
        // 跳過非標註數據
        if (!key.startsWith(this.LEGACY_KEY_PREFIX)) {
          continue;
        }

        const url = key.replace(this.LEGACY_KEY_PREFIX, '');

        let highlightCount = 0;
        if (value?.highlights) {
          highlightCount = value.highlights.length;
        } else if (Array.isArray(value)) {
          highlightCount = value.length;
        }

        // 檢查是否有舊版格式的標註
        if (MigrationScanner.isLegacyFormat(value)) {
          items.push({ url, highlightCount });
          legacyCount++;
        }

        // 統計總標註數
        totalHighlights += highlightCount;
      }

      Logger.info(
        `[MigrationScanner] 掃描完成: ${items.length} 個待遷移, ${totalHighlights} 個總標註`
      );

      return {
        items,
        totalHighlights,
        legacyCount,
        needsMigration: items.length > 0,
      };
    } catch (error) {
      Logger.error('[MigrationScanner] 掃描失敗:', error);
      throw error;
    }
  }

  /**
   * 檢查數據是否為舊版格式
   * @param {any} data - 標註數據
   * @returns {boolean}
   */
  static isLegacyFormat(data) {
    // 舊版格式判斷：
    // 1. 純陣列格式（沒有 rangeInfo）
    // 2. 有 highlights 但缺少 rangeInfo
    if (Array.isArray(data)) {
      return data.some(item => !item.rangeInfo);
    }

    if (data?.highlights) {
      return data.highlights.some(item => !item.rangeInfo);
    }

    return false;
  }

  /**
   * 請求 Background 執行批次遷移
   * @param {string[]} urls - 待遷移的網址清單
   * @param {ProgressCallback} [onProgress] - 進度回調
   * @returns {Promise<{success: number, failed: number, errors: string[]}>}
   */
  static async requestBatchMigration(urls, onProgress) {
    const results = {
      success: 0,
      failed: 0,
      errors: [],
    };

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];

      try {
        if (onProgress) {
          onProgress(i + 1, urls.length, `正在處理: ${MigrationScanner.truncateUrl(url)}`);
        }

        const response = await chrome.runtime.sendMessage({
          action: 'migration_execute',
          url,
        });

        if (response?.success) {
          results.success++;
        } else {
          results.failed++;
          results.errors.push(`${url}: ${response?.error || '未知錯誤'}`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`${url}: ${error.message}`);
      }
    }

    Logger.info(`[MigrationScanner] 遷移完成: ${results.success} 成功, ${results.failed} 失敗`);

    return results;
  }

  /**
   * 獲取遷移狀態摘要
   * @returns {Promise<{completed: number, pending: number, failed: number}>}
   */
  async getMigrationStatusSummary() {
    try {
      const allData = await chrome.storage.local.get(null);
      let completed = 0;
      let pending = 0;
      let failed = 0;

      for (const [key, value] of Object.entries(allData)) {
        if (!key.startsWith(this.MIGRATION_STATE_PREFIX)) {
          continue;
        }

        switch (value?.phase) {
          case 'completed':
            completed++;
            break;
          case 'failed':
            failed++;
            break;
          default:
            pending++;
        }
      }

      return { completed, pending, failed };
    } catch (error) {
      Logger.error('[MigrationScanner] 獲取狀態失敗:', error);
      return { completed: 0, pending: 0, failed: 0 };
    }
  }

  /**
   * 清理已完成的遷移狀態記錄
   * @returns {Promise<number>} 清理的記錄數
   */
  async cleanupCompletedMigrations() {
    try {
      const allData = await chrome.storage.local.get(null);
      const keysToRemove = [];

      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith(this.MIGRATION_STATE_PREFIX) && value?.phase === 'completed') {
          keysToRemove.push(key);
        }
      }

      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
      }

      Logger.info(`[MigrationScanner] 已清理 ${keysToRemove.length} 個遷移記錄`);
      return keysToRemove.length;
    } catch (error) {
      Logger.error('[MigrationScanner] 清理失敗:', error);
      return 0;
    }
  }

  /**
   * 截斷 URL 用於顯示
   * @param {string} url
   * @param {number} maxLength
   * @returns {string}
   */
  static truncateUrl(url, maxLength = 50) {
    if (url.length <= maxLength) {
      return url;
    }
    return `${url.substring(0, maxLength - 3)}...`;
  }
}
