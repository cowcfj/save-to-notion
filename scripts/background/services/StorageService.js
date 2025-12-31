/**
 * StorageService - 存儲操作封裝
 *
 * 職責：封裝 chrome.storage 操作，提供統一的異步接口
 * - 頁面保存狀態管理
 * - 配置讀取
 * - URL 標準化（使用統一的 urlUtils）
 *
 * 注意：Highlights 存儲由 StorageUtil（Content Script）處理
 *
 * @module services/StorageService
 */

/* global chrome */

// 從統一工具函數導入（Single Source of Truth）
import { normalizeUrl, TRACKING_PARAMS } from '../../utils/urlUtils.js';

/**
 * URL 標準化相關常量（從 urlUtils 導出，用於兼容既有導入）
 */
export const URL_TRACKING_PARAMS = TRACKING_PARAMS;

/**
 * StorageService 類
 */
class StorageService {
  /**
   * @param {Object} options - 配置選項
   * @param {Object} options.chromeStorage - chrome.storage 對象（用於測試注入）
   * @param {Object} options.logger - 日誌對象
   */
  constructor(options = {}) {
    this.storage = options.chromeStorage || (typeof chrome !== 'undefined' ? chrome.storage : null);
    this.logger = options.logger || console;
  }

  /**
   * 獲取頁面保存狀態
   * @param {string} pageUrl - 頁面 URL
   * @returns {Promise<Object|null>}
   */
  async getSavedPageData(pageUrl) {
    if (!this.storage) {
      throw new Error('Chrome storage not available');
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const key = `saved_${normalizedUrl}`;

    try {
      const result = await this.storage.local.get([key]);
      return result[key] || null;
    } catch (error) {
      this.logger.error?.('[StorageService] getSavedPageData failed:', error);
      throw error;
    }
  }

  /**
   * 設置頁面保存狀態
   * @param {string} pageUrl - 頁面 URL
   * @param {Object} data - 保存數據
   * @returns {Promise<void>}
   */
  async setSavedPageData(pageUrl, data) {
    if (!this.storage) {
      throw new Error('Chrome storage not available');
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const key = `saved_${normalizedUrl}`;

    try {
      await this.storage.local.set({
        [key]: {
          ...data,
          lastUpdated: Date.now(),
        },
      });
    } catch (error) {
      this.logger.error?.('[StorageService] setSavedPageData failed:', error);
      throw error;
    }
  }

  /**
   * 清除頁面狀態
   * @param {string} pageUrl - 頁面 URL
   * @returns {Promise<void>}
   */
  async clearPageState(pageUrl) {
    if (!this.storage) {
      throw new Error('Chrome storage not available');
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const savedKey = `saved_${normalizedUrl}`;
    const highlightsKey = `highlights_${normalizedUrl}`;

    try {
      await this.storage.local.remove([savedKey, highlightsKey]);
      this.logger.log?.('✅ Cleared all data for:', normalizedUrl);
    } catch (error) {
      this.logger.error?.('[StorageService] clearPageState failed:', error);
      throw error;
    }
  }

  /**
   * 獲取配置（從 sync storage）
   * @param {string[]} keys - 要獲取的配置鍵
   * @returns {Promise<Object>}
   */
  async getConfig(keys) {
    if (!this.storage) {
      throw new Error('Chrome storage not available');
    }

    try {
      return await this.storage.sync.get(keys);
    } catch (error) {
      this.logger.error?.('[StorageService] getConfig failed:', error);
      throw error;
    }
  }

  /**
   * 設置配置（到 sync storage）
   * @param {Object} config - 配置對象
   * @returns {Promise<void>}
   */
  async setConfig(config) {
    if (!this.storage) {
      throw new Error('Chrome storage not available');
    }

    try {
      await this.storage.sync.set(config);
    } catch (error) {
      this.logger.error?.('[StorageService] setConfig failed:', error);
      throw error;
    }
  }

  /**
   * 獲取所有已保存頁面的 URL
   * @returns {Promise<string[]>}
   */
  async getAllSavedPageUrls() {
    if (!this.storage) {
      throw new Error('Chrome storage not available');
    }

    try {
      const result = await this.storage.local.get(null);
      return Object.keys(result)
        .filter(key => key.startsWith('saved_'))
        .map(key => key.replace('saved_', ''));
    } catch (error) {
      this.logger.error?.('[StorageService] getAllSavedPageUrls failed:', error);
      throw error;
    }
  }
}

// 導出
export { StorageService, normalizeUrl };
