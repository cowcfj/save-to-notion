/**
 * StorageService - 存儲操作封裝
 *
 * 職責：封裝 chrome.storage 操作，提供統一的異步接口
 * - 頁面保存狀態管理
 * - 標註 (Highlights) 數據管理與遷移
 * - 配置讀取
 * - URL 標準化（使用統一的 urlUtils）
 *
 * @module services/StorageService
 */

/* global chrome */

// 從統一工具函數導入（Single Source of Truth）
import { normalizeUrl, computeStableUrl } from '../../utils/urlUtils.js';
import { sanitizeUrlForLogging } from '../../utils/securityUtils.js';

/**
 * URL 標準化相關常量（從 urlUtils 導出，用於兼容既有導入）
 */
export const SAVED_PREFIX = 'saved_';
export const HIGHLIGHTS_PREFIX = 'highlights_';
export const STORAGE_ERROR = 'Chrome storage not available';

/**
 * StorageService 類
 */
class StorageService {
  /**
   * @param {object} options - 配置選項
   * @param {object} options.chromeStorage - chrome.storage 對象（用於測試注入）
   * @param {object} options.logger - 日誌對象
   */
  constructor(options = {}) {
    this.storage = options.chromeStorage || (typeof chrome === 'undefined' ? null : chrome.storage);
    this.logger = options.logger || console;
  }

  /**
   * 獲取頁面保存狀態
   *
   * @param {string} pageUrl - 頁面 URL
   * @returns {Promise<object | null>}
   */
  async getSavedPageData(pageUrl) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const key = `${SAVED_PREFIX}${normalizedUrl}`;

    try {
      const result = await this.storage.local.get([key]);
      return result[key] || null;
    } catch (error) {
      this.logger.error?.('[StorageService] getSavedPageData failed', { error });
      throw error;
    }
  }

  /**
   * 獲取頁面標註數據
   *
   * @param {string} pageUrl - 頁面 URL
   * @returns {Promise<any | null>}
   */
  async getHighlights(pageUrl) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const key = `${HIGHLIGHTS_PREFIX}${normalizedUrl}`;

    try {
      const result = await this.storage.local.get([key]);
      return result[key] || null;
    } catch (error) {
      this.logger.error?.('[StorageService] getHighlights failed', { error });
      throw error;
    }
  }

  /**
   * 設置頁面標註數據
   *
   * @param {string} pageUrl - 頁面 URL
   * @param {any} data - 標註數據
   * @returns {Promise<void>}
   */
  async setHighlights(pageUrl, data) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const key = `${HIGHLIGHTS_PREFIX}${normalizedUrl}`;

    try {
      await this.storage.local.set({ [key]: data });
    } catch (error) {
      this.logger.error?.('[StorageService] setHighlights failed', { error });
      throw error;
    }
  }

  /**
   * 原子寫入頁面數據和標註
   *
   * @param {string} pageUrl - 頁面 URL
   * @param {object|null} pageData - 頁面數據
   * @param {Array|null} highlights - 標註數據
   * @returns {Promise<void>}
   */
  async savePageDataAndHighlights(pageUrl, pageData, highlights) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const dataToSet = {};

    if (pageData) {
      const savedKey = `${SAVED_PREFIX}${normalizedUrl}`;
      dataToSet[savedKey] = {
        ...pageData,
        lastUpdated: Date.now(),
      };
    }

    if (highlights) {
      const highlightKey = `${HIGHLIGHTS_PREFIX}${normalizedUrl}`;
      dataToSet[highlightKey] = highlights;
    }

    // 只有當有資料要寫入時才執行 set
    if (Object.keys(dataToSet).length > 0) {
      try {
        await this.storage.local.set(dataToSet);
      } catch (error) {
        this.logger.error?.('[StorageService] savePageDataAndHighlights failed', { error });
        throw error;
      }
    }
  }

  /**
   * 設置頁面保存狀態
   *
   * @param {string} pageUrl - 頁面 URL
   * @param {object} data - 保存數據
   * @returns {Promise<void>}
   */
  async setSavedPageData(pageUrl, data) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const key = `${SAVED_PREFIX}${normalizedUrl}`;

    try {
      await this.storage.local.set({
        [key]: {
          ...data,
          lastUpdated: Date.now(),
        },
      });
    } catch (error) {
      this.logger.error?.('[StorageService] setSavedPageData failed', { error });
      throw error;
    }
  }

  /**
   * 清除頁面狀態
   * 同時清理穩定 URL 和原始 URL 的存儲 key（確保完全清除）
   *
   * @param {string} pageUrl - 頁面 URL
   * @returns {Promise<void>}
   */

  async clearPageState(pageUrl) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const stableUrl = computeStableUrl(pageUrl);

    const keysToRemove = [
      `${SAVED_PREFIX}${normalizedUrl}`,
      `${HIGHLIGHTS_PREFIX}${normalizedUrl}`,
    ];

    // 如果有穩定 URL 且與原始 URL 不同，也清理穩定 URL 的 key
    if (stableUrl && stableUrl !== normalizedUrl) {
      keysToRemove.push(`${SAVED_PREFIX}${stableUrl}`, `${HIGHLIGHTS_PREFIX}${stableUrl}`);
    }

    try {
      await this.storage.local.remove(keysToRemove);
      this.logger.log?.('Cleared all data', { url: sanitizeUrlForLogging(normalizedUrl) });
    } catch (error) {
      this.logger.error?.('[StorageService] clearPageState failed', { error });
      throw error;
    }
  }

  /**
   * 獲取配置（從 sync storage）
   *
   * @param {string[]} keys - 要獲取的配置鍵
   * @returns {Promise<object>}
   */
  async getConfig(keys) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    try {
      return await this.storage.sync.get(keys);
    } catch (error) {
      this.logger.error?.('[StorageService] getConfig failed', { error });
      throw error;
    }
  }

  /**
   * 設置配置（到 sync storage）
   *
   * @param {object} config - 配置對象
   * @returns {Promise<void>}
   */
  async setConfig(config) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    try {
      await this.storage.sync.set(config);
    } catch (error) {
      this.logger.error?.('[StorageService] setConfig failed', { error });
      throw error;
    }
  }

  /**
   * 獲取所有已保存頁面的 URL
   *
   * @returns {Promise<string[]>}
   */
  async getAllSavedPageUrls() {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    try {
      const result = await this.storage.local.get(null);
      return Object.keys(result)
        .filter(key => key.startsWith(SAVED_PREFIX))
        .map(key => key.slice(SAVED_PREFIX.length));
    } catch (error) {
      this.logger.error?.('[StorageService] getAllSavedPageUrls failed', { error });
      throw error;
    }
  }
}

// 導出
export { StorageService };
export { TRACKING_PARAMS as URL_TRACKING_PARAMS, normalizeUrl } from '../../utils/urlUtils.js';
