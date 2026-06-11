/**
 * StorageMigrationScanner - 遷移掃描器
 *
 * 職責：處理一次性全量儲存空間掃描
 * - 獲取所有 highlights_* 和 page_* 格式的 highlights（用於遷移掃描）
 * - 獲取所有已保存頁面的 URL
 * - 從 StorageService 中拆分出來，降低主存儲服務的複雜度，便於未來整體移除。
 *
 * @module services/StorageMigrationScanner
 */

/* global chrome */

import { PAGE_PREFIX, SAVED_PREFIX, HIGHLIGHTS_PREFIX } from '../../config/shared/storage.js';
import { ERROR_MESSAGES } from '../../config/messages/errorMessages.js';

const STORAGE_ERROR = ERROR_MESSAGES.TECHNICAL.CHROME_STORAGE_UNAVAILABLE;

export class StorageMigrationScanner {
  constructor(options = {}) {
    this.storage = options.chromeStorage || (typeof chrome === 'undefined' ? null : chrome.storage);
    this.logger = options.logger || console;
  }

  /**
   * 檢查資料是否已是規範化的 highlights 物件形狀
   *
   * @param {any} value - 待檢查的值
   * @returns {boolean} 是否為規範化物件
   * @private
   */
  _isNormalizedHighlightObject(value) {
    return this._isStorageObjectValue(value) && 'highlights' in value;
  }

  /**
   * 規範化舊格式標註資料，確保回傳形狀一律為 { highlights: [...] }
   *
   * @param {any} value - 原始儲存值（可能是陣列或含 highlights 欄位的物件）
   * @returns {object} 統一為 { highlights: [...] } 格式
   * @private
   */
  _normalizeLegacyHighlight(value) {
    if (this._isNormalizedHighlightObject(value)) {
      return value;
    }
    return { highlights: Array.isArray(value) ? value : [] };
  }

  /**
   * 共用全量儲存空間讀取
   *
   * @returns {Promise<object>}
   * @private
   */
  async _getAllStorageData() {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }
    return await this.storage.local.get(null);
  }

  /**
   * 檢查 storage entry value 是否可當作物件讀取
   *
   * @param {any} value - 待檢查的 storage value
   * @returns {boolean} 是否可作為 page state 物件處理
   * @private
   */
  _isStorageObjectValue(value) {
    return Boolean(value) && typeof value === 'object';
  }

  /**
   * 取得外部提供或 storage 內的完整掃描資料
   *
   * @param {object|null} allData - 外部提供的全量儲存空間數據
   * @returns {Promise<object>} 可供掃描的完整 storage snapshot
   * @private
   */
  async _resolveStorageSnapshot(allData) {
    return allData || (await this._getAllStorageData());
  }

  /**
   * 從全量儲存空間數據中收集新格式 page_* 的 highlights 資料
   *
   * @param {object} allData - 全量數據
   * @returns {Record<string, object>} 收集結果
   * @private
   */
  _collectPageHighlights(allData) {
    if (!this._isStorageObjectValue(allData)) {
      return {};
    }
    const result = {};
    for (const [key, value] of Object.entries(allData)) {
      if (!key.startsWith(PAGE_PREFIX)) {
        continue;
      }
      if (!this._isStorageObjectValue(value)) {
        this.logger.warn?.('[StorageMigrationScanner] page_* entry has invalid shape, skipped', {
          key,
        });
        continue;
      }
      const url = key.slice(PAGE_PREFIX.length);
      result[url] = { url, highlights: Array.isArray(value.highlights) ? value.highlights : [] };
    }
    return result;
  }

  /**
   * 從全量儲存空間數據中收集舊格式 highlights_* 的 highlights 資料，且不覆寫已存在的 result
   *
   * @param {object} allData - 全量數據
   * @param {Record<string, object>} existingResult - 已收集到的 highlights 結果
   * @returns {Record<string, object>} 補充過渡期格式後的完整收集結果
   * @private
   */
  _collectLegacyHighlights(allData, existingResult) {
    if (!this._isStorageObjectValue(allData)) {
      return existingResult;
    }
    const result = { ...existingResult };
    for (const [key, value] of Object.entries(allData)) {
      if (key.startsWith(HIGHLIGHTS_PREFIX)) {
        const url = key.slice(HIGHLIGHTS_PREFIX.length);
        if (!result[url]) {
          const normalized = this._normalizeLegacyHighlight(value);
          result[url] = { ...normalized, url };
        }
      }
    }
    return result;
  }

  /**
   * 獲取所有 highlights_* 和 page_* 的資料（用於遷移掃描）
   *
   * ⚠️ **效能警告**：此方法透過 `storage.local.get(null)` 讀取整個 chrome.storage.local，
   * 屬於昂貴的一次性 migration-only helper，不應在 hot paths 或頻繁觸發的流程中使用。
   * 若需讀取單一 URL 的標註，請改用 `getHighlights(pageUrl)`。
   *
   * Phase 3：同時掃描 page_* + highlights_*，去重（同 URL 優先用 page_* 資料）。
   *
   * 回傳格式：
   * ```
   * {
   *   "https://example.com": { url, highlights: [...] },
   *   ...
   * }
   * ```
   *
   * @param {object} [allData] - 外部提供的全量儲存空間數據，若未提供則從 storage 讀取
   * @returns {Promise<Record<string, object>>} key 為 URL，value 為完整標註資料
   */
  async getAllHighlights(allData = null) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    try {
      const data = await this._resolveStorageSnapshot(allData);
      const pageResult = this._collectPageHighlights(data);
      return this._collectLegacyHighlights(data, pageResult);
    } catch (error) {
      this.logger.error?.('[StorageMigrationScanner] getAllHighlights failed', { error });
      throw error;
    }
  }

  /**
   * 獲取所有已保存頁面的 URL
   *
   * Phase 3：合併 page_*（notion 非 null）+ saved_* 的 URLs（去重）。
   *
   * @param {object} [allData] - 外部提供的全量儲存空間數據，若未提供則從 storage 讀取
   * @returns {Promise<string[]>}
   */
  async getAllSavedPageUrls(allData = null) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    try {
      const result = await this._resolveStorageSnapshot(allData);
      return this._extractUrlsFromStorageData(result);
    } catch (error) {
      this.logger.error?.('[StorageMigrationScanner] getAllSavedPageUrls failed', { error });
      throw error;
    }
  }

  /**
   * 從儲存數據中提取所有已保存的 URL
   *
   * @param {object} result - 儲存數據
   * @returns {string[]}
   * @private
   */
  _extractUrlsFromStorageData(result) {
    if (!this._isStorageObjectValue(result)) {
      return [];
    }
    const urlSet = new Set();

    for (const [key, value] of Object.entries(result)) {
      const url = this._extractSavedUrlFromEntry(key, value);
      if (url) {
        urlSet.add(url);
      }
    }

    return Array.from(urlSet);
  }

  /**
   * 從儲存體項目的鍵名與值中解析並提取已保存的頁面 URL
   *
   * @param {string} key - 儲存體鍵名
   * @param {any} value - 儲存體值
   * @returns {string|null} 提取出的頁面 URL，若未保存則為 null
   * @private
   */
  _extractSavedUrlFromEntry(key, value) {
    if (key.startsWith(PAGE_PREFIX) && value?.notion) {
      // 新格式：有 notion 欄位代表已保存
      return key.slice(PAGE_PREFIX.length);
    }
    if (key.startsWith(SAVED_PREFIX)) {
      // 舊格式（過渡期）
      return key.slice(SAVED_PREFIX.length);
    }
    return null;
  }
}
