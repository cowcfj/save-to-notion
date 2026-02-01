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
import { HIGHLIGHT_MIGRATION } from '../../config/constants.js';

/**
 * HighlightMigration
 * 處理舊版標註數據的遷移
 */
export class HighlightMigration {
  /**
   * @param {Object} manager - HighlightManager 實例（需要具備 nextId 屬性）
   */
  constructor(manager) {
    this.manager = manager;
  }

  /**
   * 檢查並遷移 localStorage 中的舊標註數據
   */
  async checkAndMigrate() {
    if (typeof window === 'undefined' || typeof window.normalizeUrl !== 'function') {
      return;
    }

    try {
      const currentUrl = window.location.href;
      const normalizedUrl = window.normalizeUrl(currentUrl);

      // 檢查可能的舊 key
      const possibleKeys = [
        `highlights_${normalizedUrl}`,
        `highlights_${currentUrl}`,
        `highlights_${window.location.origin}${window.location.pathname}`,
      ];

      let legacyData = null;
      let foundKey = null;

      // 優先檢查標準 key
      for (const key of possibleKeys) {
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const data = JSON.parse(raw);
            if (Array.isArray(data) && data.length > 0) {
              legacyData = data;
              foundKey = key;
              break;
            }
          } catch {
            // 忽略解析錯誤
          }
        }
      }

      // 如果沒找到，遍歷所有 localStorage（限制數量以優化性能）
      if (!legacyData) {
        // 使用 this.constructor 確保測試時修改靜態屬性生效
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
          if (key?.startsWith('highlights_')) {
            const raw = localStorage.getItem(key);
            try {
              const data = JSON.parse(raw);
              if (Array.isArray(data) && data.length > 0) {
                legacyData = data;
                foundKey = key;
                break;
              }
            } catch {
              // 忽略
            }
          }
        }
      }

      if (legacyData && foundKey) {
        // 檢查是否已經遷移過
        const migrationKey = `migration_completed_${normalizedUrl}`;
        const storage = HighlightManager.getSafeExtensionStorage();

        // 只有在 storage 可用時才執行遷移檢查
        if (storage) {
          const migrationStatus = await storage.get(migrationKey);

          if (!migrationStatus[migrationKey]) {
            await this.migrateToNewFormat(legacyData, foundKey);
          }
        }
      }
    } catch (error) {
      Logger.error('檢查舊數據失敗', { action: 'checkAndMigrate', error: error.message });
    }
  }

  /**
   * 將舊格式數據遷移到新格式
   * @param {Array} legacyData - 舊數據
   * @param {string} oldKey - 舊 key
   */
  async migrateToNewFormat(legacyData, oldKey) {
    try {
      const migratedHighlights = [];
      let successCount = 0;
      let failCount = 0;

      // 預先保留 ID 區間，避免與用戶操作產生競爭條件
      const baseId = this.manager.nextId;
      this.manager.nextId += legacyData.length;
      let localIdCounter = 0;

      for (const oldItem of legacyData) {
        try {
          let textToFind = null;
          let color = 'yellow';

          if (typeof oldItem === 'object') {
            textToFind = oldItem.text || oldItem.content;

            if (oldItem.color) {
              color = oldItem.color;
            } else if (oldItem.bgColor || oldItem.backgroundColor) {
              color = convertBgColorToName(oldItem.bgColor || oldItem.backgroundColor);
            }
          } else if (typeof oldItem === 'string') {
            textToFind = oldItem;
          }

          if (!textToFind || textToFind.trim().length === 0) {
            failCount++;
            localIdCounter++;
            continue;
          }

          const range = findTextInPage(textToFind);

          if (range) {
            // 使用預留區間內的 ID
            const newId = `h${baseId + localIdCounter}`;
            const rangeInfo = serializeRange(range);

            migratedHighlights.push({
              id: newId,
              color,
              text: textToFind,
              timestamp: oldItem.timestamp || Date.now(),
              rangeInfo,
            });

            successCount++;
          } else {
            failCount++;
          }
          localIdCounter++;
        } catch {
          failCount++;
          localIdCounter++;
        }
      }

      if (migratedHighlights.length > 0) {
        // 使用標準化 URL 保持與存儲格式一致
        const currentUrl = window.normalizeUrl
          ? window.normalizeUrl(window.location.href)
          : window.location.href;

        await StorageUtil.saveHighlights(currentUrl, {
          url: currentUrl,
          highlights: migratedHighlights,
        });
      }

      // 標記遷移完成
      const storage = HighlightManager.getSafeExtensionStorage();
      if (storage && window.normalizeUrl) {
        const normalizedUrl = window.normalizeUrl(window.location.href);
        await storage.set({
          [`migration_completed_${normalizedUrl}`]: {
            timestamp: Date.now(),
            oldKey,
            totalCount: legacyData.length,
            successCount,
            failCount,
          },
        });
      }

      // 刪除舊數據（僅在有成功遷移的項目時）
      if (successCount > 0) {
        localStorage.removeItem(oldKey);
      }

      Logger.info('數據遷移完成', { action: 'migrateToNewFormat', successCount, failCount });
    } catch (_error) {
      Logger.error('數據遷移失敗', { action: 'migrateToNewFormat', error: _error.message });
    }
  }
}

/**
 * 限制 localStorage 遍歷數量，避免性能問題
 * @type {number}
 */
HighlightMigration.MAX_SCAN_LIMIT = HIGHLIGHT_MIGRATION.MAX_SCAN_LIMIT;
