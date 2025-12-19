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
// 從統一工具函數導入 normalizeUrl
import { normalizeUrl } from '../../utils/urlUtils.js';

// Logger 回退定義
const Logger = (typeof window !== 'undefined' && window.Logger) || console;

/**
 * StorageUtil 對象
 */
const StorageUtil = {
  /**
   * 保存標記數據
   * @param {string} pageUrl - 頁面 URL
   * @param {Object|Array} highlightData - 標註數據
   * @returns {Promise<void>}
   */
  async saveHighlights(pageUrl, highlightData) {
    if (!pageUrl || typeof pageUrl !== 'string') {
      Logger.warn?.('saveHighlights: Invalid pageUrl provided');
      return;
    }
    const normalizedUrl = normalizeUrl(pageUrl);
    const pageKey = `highlights_${normalizedUrl}`;

    try {
      await this._saveToChromeStorage(pageKey, highlightData);
    } catch (error) {
      Logger.warn?.('Chrome storage unavailable/failed, falling back to localStorage:', error);
      try {
        await this._saveToLocalStorage(pageKey, highlightData);
      } catch (localError) {
        Logger.error('Failed to save highlights (both Chrome and local):', localError);
        throw localError;
      }
    }
  },

  /**
   * 保存到 Chrome Storage
   * @private
   */
  _saveToChromeStorage(key, data) {
    if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
      return Promise.reject(new Error('Chrome storage not available'));
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
   * @param {string} pageUrl - 頁面 URL
   * @returns {Promise<Array>}
   */
  async loadHighlights(pageUrl) {
    if (!pageUrl || typeof pageUrl !== 'string') {
      Logger.warn?.('loadHighlights: Invalid pageUrl provided');
      return [];
    }
    const normalizedUrl = normalizeUrl(pageUrl);
    const pageKey = `highlights_${normalizedUrl}`;

    try {
      const data = await this._loadFromChromeStorage(pageKey);
      if (data && data.length > 0) {
        return data;
      }
    } catch (_) {
      Logger.warn?.('Chrome storage unavailable, trying localStorage fallback');
    }

    try {
      return await this._loadFromLocalStorage(pageKey);
    } catch (error) {
      Logger.error('Failed to load highlights from localStorage:', error);
      return [];
    }
  },

  /**
   * 從 Chrome Storage 加載並解析格式
   * @private
   */
  _loadFromChromeStorage(key) {
    if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
      return Promise.reject(new Error('Chrome storage not available'));
    }

    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get([key], data => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          const stored = data?.[key];
          resolve(this._parseHighlightFormat(stored));
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  /**
   * 從 localStorage 加載並解析格式
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
          console.error('Failed to parse legacy highlights:', error);
          resolve([]);
        }
      } catch (error) {
        reject(error);
      }
    });
  },

  /**
   * 解析不同版本的標注數據格式
   * @private
   */
  _parseHighlightFormat(data) {
    if (!data) {
      return [];
    }

    // 支援數組（舊版）
    if (Array.isArray(data)) {
      return data;
    }

    // 支援對象格式（新版 {url, highlights}）
    if (data.highlights && Array.isArray(data.highlights)) {
      return data.highlights;
    }

    return [];
  },

  /**
   * 清除指定頁面的標記數據
   * @param {string} pageUrl - 頁面 URL
   * @returns {Promise<void>}
   */
  async clearHighlights(pageUrl) {
    // 輸入驗證
    if (!pageUrl || typeof pageUrl !== 'string') {
      const error = new Error('Invalid pageUrl: must be a non-empty string');
      Logger.error('❌ [clearHighlights] 無效的 URL 參數:', error.message);
      throw error;
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const pageKey = `highlights_${normalizedUrl}`;

    Logger.log?.('🗑️ [clearHighlights] 開始清除標註:', pageKey);

    const results = await Promise.allSettled([
      this._clearFromChromeStorage(pageKey),
      this._clearFromLocalStorage(pageKey),
    ]);

    // 檢查結果
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length === results.length) {
      const error = new Error('Failed to clear highlights from all storage locations');
      Logger.error(
        '❌ [clearHighlights] 所有存儲清除失敗:',
        failures.map(failure => failure.reason)
      );
      throw error;
    }

    if (failures.length > 0) {
      Logger.warn?.(
        '⚠️ [clearHighlights] 部分存儲清除失敗:',
        failures.map(failure => failure.reason)
      );
    } else {
      Logger.log?.('✅ [clearHighlights] 標註清除完成');
    }
  },

  /**
   * 從 Chrome Storage 清除數據
   * @private
   */
  _clearFromChromeStorage(key) {
    if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
      return Promise.reject(new Error('Chrome storage not available'));
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
if (typeof window !== 'undefined') {
  window.StorageUtil = StorageUtil;
}

// TEST_EXPOSURE_START
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StorageUtil };
}
// TEST_EXPOSURE_END
