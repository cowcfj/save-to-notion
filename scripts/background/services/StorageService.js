/**
 * StorageService - 存儲操作封裝
 *
 * 職責：封裝 chrome.storage 操作，提供統一的異步接口
 * - 頁面保存狀態管理
 * - 配置讀取
 * - URL 標準化（使用統一的 urlUtils）
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
  getSavedPageData(pageUrl) {
    if (!this.storage) {
      throw new Error('Chrome storage not available');
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const key = `saved_${normalizedUrl}`;

    return new Promise((resolve, reject) => {
      this.storage.local.get([key], result => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result[key] || null);
        }
      });
    });
  }

  /**
   * 設置頁面保存狀態
   * @param {string} pageUrl - 頁面 URL
   * @param {Object} data - 保存數據
   * @returns {Promise<void>}
   */
  setSavedPageData(pageUrl, data) {
    if (!this.storage) {
      throw new Error('Chrome storage not available');
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const key = `saved_${normalizedUrl}`;

    return new Promise((resolve, reject) => {
      this.storage.local.set(
        {
          [key]: {
            ...data,
            lastUpdated: Date.now(),
          },
        },
        () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * 清除頁面狀態
   * @param {string} pageUrl - 頁面 URL
   * @returns {Promise<void>}
   */
  clearPageState(pageUrl) {
    if (!this.storage) {
      throw new Error('Chrome storage not available');
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const savedKey = `saved_${normalizedUrl}`;
    const highlightsKey = `highlights_${normalizedUrl}`;

    return new Promise((resolve, reject) => {
      this.storage.local.remove([savedKey, highlightsKey], () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          this.logger.log?.('✅ Cleared all data for:', normalizedUrl);
          resolve();
        }
      });
    });
  }

  /**
   * 獲取配置（從 sync storage）
   * @param {string[]} keys - 要獲取的配置鍵
   * @returns {Promise<Object>}
   */
  getConfig(keys) {
    if (!this.storage) {
      throw new Error('Chrome storage not available');
    }

    return new Promise((resolve, reject) => {
      this.storage.sync.get(keys, result => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * 設置配置（到 sync storage）
   * @param {Object} config - 配置對象
   * @returns {Promise<void>}
   */
  setConfig(config) {
    if (!this.storage) {
      throw new Error('Chrome storage not available');
    }

    return new Promise((resolve, reject) => {
      this.storage.sync.set(config, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 獲取標註數據
   * @param {string} pageUrl - 頁面 URL
   * @returns {Promise<Array>}
   */
  getHighlights(pageUrl) {
    if (!this.storage) {
      throw new Error('Chrome storage not available');
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const key = `highlights_${normalizedUrl}`;

    return new Promise((resolve, reject) => {
      this.storage.local.get([key], result => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result[key] || []);
        }
      });
    });
  }

  /**
   * 設置標註數據
   * @param {string} pageUrl - 頁面 URL
   * @param {Array} highlights - 標註數組
   * @returns {Promise<void>}
   */
  setHighlights(pageUrl, highlights) {
    if (!this.storage) {
      throw new Error('Chrome storage not available');
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const key = `highlights_${normalizedUrl}`;

    return new Promise((resolve, reject) => {
      this.storage.local.set({ [key]: highlights }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * 獲取所有已保存頁面的 URL
   * @returns {Promise<string[]>}
   */
  getAllSavedPageUrls() {
    if (!this.storage) {
      throw new Error('Chrome storage not available');
    }

    return new Promise((resolve, reject) => {
      this.storage.local.get(null, result => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          const urls = Object.keys(result)
            .filter(key => key.startsWith('saved_'))
            .map(key => key.replace('saved_', ''));
          resolve(urls);
        }
      });
    });
  }
}

// 導出
export { StorageService, normalizeUrl };

// TEST_EXPOSURE_START
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StorageService, normalizeUrl, URL_TRACKING_PARAMS };
}
// TEST_EXPOSURE_END

if (typeof window !== 'undefined') {
  window.StorageService = StorageService;
  window.normalizeUrl = normalizeUrl;
}
