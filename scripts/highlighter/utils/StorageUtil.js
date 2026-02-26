/**
 * StorageUtil - 標註存儲工具
 *
 * 職責：處理 Highlights 相關的存儲操作
 * - 保存/讀取/清除標註
 * - 支持 Chrome Storage 和 localStorage 回退
 *
 * 使用環境：Content Script / Highlighter
 *
 * @module utils/StorageUtil
 */

/* global chrome */

// 從統一工具函數導入 normalizeUrl
import { normalizeUrl } from '../../utils/urlUtils.js';
import Logger from '../../utils/Logger.js';
import { ERROR_MESSAGES } from '../../config/messages.js';

const MESSAGES = ERROR_MESSAGES.TECHNICAL;

// Storage key 前綴常量
const HIGHLIGHTS_PREFIX = 'highlights_';
const PAGE_PREFIX = 'page_';

/**
 * StorageUtil 對象
 */
const StorageUtil = {
  /**
   * 保存標記數據
   *
   * Phase 3：透過訊息轉發給 Background 的 UPDATE_HIGHLIGHTS handler 處理，
   * 利用 Background 的 _withLock 互斥鎖避免並發衝突。
   *
   * @param {string} pageUrl - 頁面 URL
   * @param {object | Array} highlightData - 標註數據
   * @returns {Promise<void>}
   */
  async saveHighlights(pageUrl, highlightData) {
    if (!pageUrl || typeof pageUrl !== 'string') {
      const error = new Error(MESSAGES.INVALID_PAGE_URL);
      Logger.error(MESSAGES.LOG_INVALID_URL, { action: 'saveHighlights', error: error.message });
      throw error;
    }

    const highlights = Array.isArray(highlightData)
      ? highlightData
      : highlightData?.highlights || [];

    // Phase 3：送給 Background 結層處理（含 _withLock）
    if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
      try {
        await chrome.runtime.sendMessage({
          action: 'UPDATE_HIGHLIGHTS',
          url: pageUrl,
          highlights,
        });
        return;
      } catch {
        // sendMessage 失敗（如 Background SW 未啟動），回退到直接寫入
        Logger.warn('[StorageUtil] sendMessage 失敗，回退直接寫入 storage', {
          action: 'saveHighlights',
        });
      }
    }

    // Fallback：直接寫入（過渡期安全網）
    const normalizedUrl = normalizeUrl(pageUrl);
    const pageKey = `${PAGE_PREFIX}${normalizedUrl}`;
    try {
      await this._saveToChromeStorage(pageKey, {
        notion: null,
        highlights,
        metadata: { lastUpdated: Date.now() },
      });
    } catch (error) {
      Logger.warn('Chrome Storage 不可用，回退到 localStorage', {
        action: 'saveHighlights',
        error: error.message,
      });
      const legacyKey = `${HIGHLIGHTS_PREFIX}${normalizedUrl}`;
      try {
        await this._saveToLocalStorage(legacyKey, highlightData);
      } catch (localError) {
        Logger.error('保存標註失敗（Chrome 與本地直失敗）', {
          action: 'saveHighlights',
          error: localError.message,
        });
        throw localError;
      }
    }
  },

  /**
   * 保存到 Chrome Storage
   *
   * @param {string} key - 鍵名
   * @param {any} data - 數據
   * @returns {Promise<void>}
   * @private
   */
  _saveToChromeStorage(key, data) {
    if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
      return Promise.reject(new Error(MESSAGES.CHROME_STORAGE_UNAVAILABLE));
    }

    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set({ [key]: data }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  /**
   * 保存到 localStorage
   *
   * @param {string} key - 鍵名
   * @param {any} data - 數據
   * @returns {Promise<void>}
   * @private
   */
  _saveToLocalStorage(key, data) {
    return new Promise((resolve, reject) => {
      try {
        localStorage.setItem(key, JSON.stringify(data));
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  },

  /**
   * 加載標記數據
   *
   * Phase 3：先查 page_*，再回退 highlights_*（舊格式）。
   *
   * @param {string} pageUrl - 頁面 URL
   * @returns {Promise<Array>}
   */
  async loadHighlights(pageUrl) {
    if (!pageUrl || typeof pageUrl !== 'string') {
      const error = new Error(MESSAGES.INVALID_PAGE_URL);
      Logger.error(MESSAGES.LOG_INVALID_URL, { action: 'loadHighlights', error: error.message });
      throw error;
    }
    const normalizedUrl = normalizeUrl(pageUrl);
    const pageKey = `${PAGE_PREFIX}${normalizedUrl}`;
    const legacyKey = `${HIGHLIGHTS_PREFIX}${normalizedUrl}`;

    try {
      // Phase 3：同時查詢新舊格式
      // null = 找不到資料（需回退），[] = 明確空陣列（不回退）
      const data = await this._loadBothFormats(pageKey, legacyKey);
      if (data !== null && data !== undefined) {
        return data;
      }
    } catch {
      Logger.warn('Chrome Storage 不可用，嘗試 localStorage 備案', { action: 'loadHighlights' });
    }

    try {
      return await this._loadFromLocalStorage(legacyKey);
    } catch (error) {
      Logger.error('從 localStorage 加載標註失敗', {
        action: 'loadHighlights',
        error: error.message,
      });
      return [];
    }
  },

  /**
   * 同時查詢 page_* 和 highlights_* 格式
   *
   * @param {string} pageKey - page_* key
   * @param {string} legacyKey - highlights_* key
   * @returns {Promise<Array>}
   * @private
   */
  async _loadBothFormats(pageKey, legacyKey) {
    if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
      throw new Error(MESSAGES.CHROME_STORAGE_UNAVAILABLE);
    }

    return new Promise((resolve, reject) => {
      chrome.storage.local.get([pageKey, legacyKey], data => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        // 優先返回 page_* 格式
        if (data[pageKey]) {
          resolve(this._parseHighlightFormat(data[pageKey]));
          return;
        }

        // 回退 highlights_* 舊格式
        if (data[legacyKey]) {
          resolve(this._parseHighlightFormat(data[legacyKey]));
          return;
        }

        // 兩個 key 都找不到：回傳 null 表示「未找到」，與「明確空陣列」區分
        resolve(null);
      });
    });
  },

  /**
   * 從 Chrome Storage 加載並解析格式
   *
   * @param {string} key - 鍵名
   * @returns {Promise<Array>}
   * @private
   */
  _loadFromChromeStorage(key) {
    if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
      return Promise.reject(new Error(MESSAGES.CHROME_STORAGE_UNAVAILABLE));
    }

    return new Promise((resolve, reject) => {
      try {
        Logger.debug(`[StorageUtil] Reading from Chrome Storage: "${key}"`, {
          action: '_loadFromChromeStorage',
        });
        chrome.storage.local.get([key], data => {
          if (chrome.runtime.lastError) {
            Logger.error(`[StorageUtil] Chrome Storage Error for "${key}"`, {
              action: '_loadFromChromeStorage',
              error: chrome.runtime.lastError.message,
            });
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          const stored = data?.[key];
          const result = this._parseHighlightFormat(stored);
          Logger.debug(`[StorageUtil] Read result for "${key}"`, {
            action: '_loadFromChromeStorage',
            found: Boolean(stored),
            itemCount: Array.isArray(result) ? result.length : 0,
          });
          resolve(result);
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  /**
   * 從 localStorage 加載並解析格式
   *
   * @param {string} key - 鍵名
   * @returns {Promise<Array>}
   * @private
   */
  _loadFromLocalStorage(key) {
    return new Promise((resolve, reject) => {
      try {
        const legacy = localStorage.getItem(key);
        if (!legacy) {
          resolve([]);
          return;
        }
        try {
          const parsed = JSON.parse(legacy);
          resolve(this._parseHighlightFormat(parsed));
        } catch (error) {
          Logger.error('解析舊版標註失敗', {
            action: 'loadHighlights',
            operation: 'parseLocalStorage',
            error: error.message,
          });
          resolve([]);
        }
      } catch (error) {
        reject(error);
      }
    });
  },

  /**
   * 解析不同版本的標注數據格式
   *
   * 支援：
   * - page_* 新格式（Phase 3）：{ notion, highlights: [...] }
   * - 對象格式（新版）：{ url, highlights: [...] }
   * - 數組格式（舊版）：[...]
   *
   * @param {any} data - 存儲的數據
   * @returns {Array} List of highlights
   * @private
   */
  _parseHighlightFormat(data) {
    if (!data) {
      return [];
    }

    // Phase 3 page_* 新格式：{ notion, highlights: [...] }
    if (data.highlights !== undefined && !Array.isArray(data)) {
      return Array.isArray(data.highlights) ? data.highlights : [];
    }

    // 支援數組（舊版）
    if (Array.isArray(data)) {
      return data;
    }

    return [];
  },

  /**
   * 清除指定頁面的標記數據
   *
   * Phase 3：透過訊息轉發給 Background 處理（含 _withLock）。
   *
   * @param {string} pageUrl - 頁面 URL
   * @returns {Promise<void>}
   */
  async clearHighlights(pageUrl) {
    if (!pageUrl || typeof pageUrl !== 'string') {
      const error = new Error(MESSAGES.INVALID_PAGE_URL);
      Logger.error(MESSAGES.LOG_INVALID_URL, { action: 'clearHighlights', error: error.message });
      throw error;
    }

    // Phase 3：送給 Background 結層處理（含 _withLock，保留 notion 欄位）
    if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'CLEAR_HIGHLIGHTS',
          url: pageUrl,
        });
        // sendMessage 成功且 Background 確認成功才 return
        if (response?.success === true) {
          return;
        }
        // sendMessage 成功但回傳 { success: false }：回退到直接清除
        Logger.warn('[StorageUtil] sendMessage 回傳失敗，回退直接清除 storage', {
          action: 'clearHighlights',
        });
      } catch {
        Logger.warn('[StorageUtil] sendMessage 失敗，回退直接清除 storage', {
          action: 'clearHighlights',
        });
      }
    }

    // Fallback：直接清除（舊格式安全網）
    const normalizedUrl = normalizeUrl(pageUrl);
    const pageKey = `${PAGE_PREFIX}${normalizedUrl}`;
    const legacyKey = `${HIGHLIGHTS_PREFIX}${normalizedUrl}`;

    Logger.log('開始清除標註', { action: 'clearHighlights', pageKey });

    const results = await Promise.allSettled([
      this._clearFromChromeStorage(pageKey),
      this._clearFromChromeStorage(legacyKey),
      this._clearFromLocalStorage(legacyKey),
    ]);

    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length === results.length) {
      const error = new Error('Failed to clear highlights from all storage locations');
      Logger.error('所有存儲清除失敗', {
        action: 'clearHighlights',
        reasons: failures.map(failure => failure.reason.message || failure.reason),
      });
      throw error;
    }

    if (failures.length > 0) {
      Logger.warn('部分存儲清除失敗', { action: 'clearHighlights' });
    } else {
      Logger.log('標註清除完成', { action: 'clearHighlights' });
    }
  },

  /**
   * 從 Chrome Storage 清除數據
   *
   * @param {string} key - 鍵名
   * @returns {Promise<void>}
   * @private
   */
  _clearFromChromeStorage(key) {
    if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
      return Promise.reject(new Error(MESSAGES.CHROME_STORAGE_UNAVAILABLE));
    }

    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.remove([key], () => {
          if (chrome.runtime.lastError) {
            reject(new Error(`Chrome storage error: ${chrome.runtime.lastError.message}`));
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(new Error(`Chrome storage operation failed: ${error.message}`));
      }
    });
  },

  /**
   * 從 localStorage 清除數據
   *
   * @param {string} key - 鍵名
   * @returns {Promise<void>}
   * @private
   */
  _clearFromLocalStorage(key) {
    return new Promise((resolve, reject) => {
      try {
        localStorage.removeItem(key);
        resolve();
      } catch (error) {
        reject(new Error(`localStorage operation failed: ${error.message}`));
      }
    });
  },
};

// 導出
export { StorageUtil };

// 掛載到 window 供 IIFE 環境使用
if (globalThis.window !== undefined) {
  globalThis.StorageUtil = StorageUtil;
}
