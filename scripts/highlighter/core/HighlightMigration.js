/**
 * HighlightMigration - 舊數據遷移處理
 *
 * 從 HighlightManager 抽取的遷移相關邏輯
 * 負責將 localStorage 中的舊格式標註數據遷移到 chrome.storage
 */

import { serializeRange } from './Range.js';
import { findTextInPage } from '../utils/textSearch.js';
import Logger from '../../utils/Logger.js';
import { HighlightManager } from './HighlightManager.js';
import { StorageUtil } from '../utils/StorageUtil.js';
import { convertBgColorToName } from '../utils/color.js';

const HIGHLIGHT_MIGRATION = {
  MAX_SCAN_LIMIT: 500, // localStorage traversal limit to avoid performance issues
};

/**
 * HighlightMigration
 * 處理舊版標註數據的遷移
 */
export class HighlightMigration {
  /**
   * @param {object} manager - HighlightManager 實例（需要具備 nextId 屬性）
   */
  constructor(manager) {
    this.manager = manager;
  }

  // ── 私有輔助方法 ──────────────────────────────────────────

  /**
   * 嘗試將 localStorage 中的原始值解析為非空的標註陣列
   *
   * @param {string} raw - localStorage 原始字串
   * @returns {Array|null} 解析後的非空陣列，或 null
   */
  static _tryParseHighlightArray(raw) {
    if (!raw) {
      return null;
    }

    try {
      const data = JSON.parse(raw);
      return Array.isArray(data) && data.length > 0 ? data : null;
    } catch {
      return null;
    }
  }

  /**
   * 從一組候選 key 中尋找舊標註數據
   *
   * @param {string[]} keys - 候選 key 列表
   * @returns {{ data: Array, key: string }|null}
   */
  static _findLegacyDataByKeys(keys) {
    for (const key of keys) {
      const data = HighlightMigration._tryParseHighlightArray(localStorage.getItem(key));
      if (data) {
        return { data, key };
      }
    }
    return null;
  }

  /**
   * 遍歷 localStorage 尋找 highlights_ 開頭的舊數據（有掃描上限）
   *
   * @returns {{ data: Array, key: string }|null}
   */
  _findLegacyDataByScan() {
    const maxLimit = this.constructor.MAX_SCAN_LIMIT;

    if (localStorage.length > maxLimit) {
      Logger.warn('localStorage 項目超過掃描限制，僅掃描部分項目', {
        action: 'checkAndMigrate',
        count: localStorage.length,
        limit: maxLimit,
      });
    }

    const scanCount = Math.min(localStorage.length, maxLimit);

    for (let i = 0; i < scanCount; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('highlights_')) {
        continue;
      }

      const data = HighlightMigration._tryParseHighlightArray(localStorage.getItem(key));
      if (data) {
        return { data, key };
      }
    }
    return null;
  }

  /**
   * 綜合查找舊標註數據：先查候選 key，再全量掃描
   *
   * @param {string} normalizedUrl - 標準化後的 URL
   * @returns {{ data: Array, key: string }|null}
   */
  _findLegacyData(normalizedUrl) {
    const currentUrl = globalThis.location.href;
    const possibleKeys = [
      `highlights_${normalizedUrl}`,
      `highlights_${currentUrl}`,
      `highlights_${globalThis.location.origin}${globalThis.location.pathname}`,
    ];

    return HighlightMigration._findLegacyDataByKeys(possibleKeys) || this._findLegacyDataByScan();
  }

  /**
   * 判斷是否應該執行遷移（尚未遷移過且 storage 可用）
   *
   * @param {string} normalizedUrl - 標準化後的 URL
   * @returns {Promise<boolean>}
   */
  static async _shouldRunMigration(normalizedUrl) {
    const storage = HighlightManager.getSafeExtensionStorage();
    if (!storage) {
      return false;
    }

    const migrationKey = `migration_completed_${normalizedUrl}`;
    const migrationStatus = await storage.get(migrationKey);
    return !migrationStatus[migrationKey];
  }

  /**
   * 從舊格式的項目中提取文字與顏色
   *
   * @param {object|string} oldItem - 舊數據項目
   * @returns {{ text: string|null, color: string }}
   */
  static _extractItemTextAndColor(oldItem) {
    if (typeof oldItem === 'string') {
      return { text: oldItem, color: 'yellow' };
    }

    if (oldItem === null || typeof oldItem !== 'object') {
      return { text: null, color: 'yellow' };
    }

    const text = oldItem.text || oldItem.content;
    let color = 'yellow';

    if (oldItem.color) {
      color = oldItem.color;
    } else if (oldItem.bgColor || oldItem.backgroundColor) {
      color = convertBgColorToName(oldItem.bgColor || oldItem.backgroundColor);
    }

    return { text, color };
  }

  /**
   * 嘗試遷移單一舊項目，回傳遷移後的物件或 null
   *
   * @param {object|string} oldItem - 舊數據項目
   * @param {string} newId - 新 ID
   * @returns {object|null} 遷移後的標註物件，或 null（失敗時）
   */
  static _migrateItem(oldItem, newId) {
    const { text, color } = HighlightMigration._extractItemTextAndColor(oldItem);

    if (!text || text.trim().length === 0) {
      return null;
    }

    const range = findTextInPage(text);
    if (!range) {
      return null;
    }

    return {
      id: newId,
      color,
      text,
      timestamp: oldItem.timestamp || Date.now(),
      rangeInfo: serializeRange(range),
    };
  }

  // ── 公開方法 ──────────────────────────────────────────────

  /**
   * 檢查並遷移 localStorage 中的舊標註數據
   */
  async checkAndMigrate() {
    if (globalThis.window === undefined || typeof globalThis.normalizeUrl !== 'function') {
      return;
    }

    try {
      const normalizedUrl = globalThis.normalizeUrl(globalThis.location.href);
      const legacy = this._findLegacyData(normalizedUrl);

      if (legacy && (await HighlightMigration._shouldRunMigration(normalizedUrl))) {
        await this.migrateToNewFormat(legacy.data, legacy.key);
      }
    } catch (error) {
      Logger.error('檢查舊數據失敗', { action: 'checkAndMigrate', error: error.message });
    }
  }

  /**
   * 將舊格式數據遷移到新格式
   *
   * @param {Array} legacyData - 舊數據
   * @param {string} oldKey - 舊 key
   */
  async migrateToNewFormat(legacyData, oldKey) {
    try {
      // 預先保留 ID 區間，避免與用戶操作產生競爭條件
      const baseId = this.manager.nextId;
      this.manager.nextId += legacyData.length;

      let successCount = 0;
      let failCount = 0;
      const migratedHighlights = [];

      for (const [i, oldItem] of legacyData.entries()) {
        try {
          const result = HighlightMigration._migrateItem(oldItem, `h${baseId + i}`);

          if (result) {
            migratedHighlights.push(result);
            successCount++;
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
      }

      if (migratedHighlights.length > 0) {
        const currentUrl = globalThis.normalizeUrl
          ? globalThis.normalizeUrl(globalThis.location.href)
          : globalThis.location.href;

        await StorageUtil.saveHighlights(currentUrl, {
          url: currentUrl,
          highlights: migratedHighlights,
        });
      }

      // 標記遷移完成
      await this._markMigrationComplete(oldKey, legacyData.length, successCount, failCount);

      // 刪除舊數據（僅在有成功遷移的項目時）
      if (successCount > 0) {
        localStorage.removeItem(oldKey);
      }

      Logger.info('數據遷移完成', { action: 'migrateToNewFormat', successCount, failCount });
    } catch (_error) {
      Logger.error('數據遷移失敗', { action: 'migrateToNewFormat', error: _error.message });
    }
  }

  /**
   * 標記遷移完成
   *
   * @param {string} oldKey - 舊 key
   * @param {number} totalCount - 總項目數
   * @param {number} successCount - 成功數
   * @param {number} failCount - 失敗數
   */
  async _markMigrationComplete(oldKey, totalCount, successCount, failCount) {
    const storage = HighlightManager.getSafeExtensionStorage();
    if (!storage || !globalThis.normalizeUrl) {
      return;
    }

    const normalizedUrl = globalThis.normalizeUrl(globalThis.location.href);
    await storage.set({
      [`migration_completed_${normalizedUrl}`]: {
        timestamp: Date.now(),
        oldKey,
        totalCount,
        successCount,
        failCount,
      },
    });
  }
}

/**
 * 限制 localStorage 遍歷數量，避免性能問題
 *
 * @type {number}
 */
HighlightMigration.MAX_SCAN_LIMIT = HIGHLIGHT_MIGRATION.MAX_SCAN_LIMIT;
