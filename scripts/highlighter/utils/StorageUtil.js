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
  saveHighlights(pageUrl, highlightData) {
    const normalizedUrl = normalizeUrl(pageUrl);
    const pageKey = `highlights_${normalizedUrl}`;

    return new Promise((resolve, reject) => {
      try {
        if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
          chrome.storage.local.set({ [pageKey]: highlightData }, () => {
            if (chrome.runtime.lastError) {
              console.error(
                'Failed to save highlights to chrome.storage:',
                chrome.runtime.lastError
              );
              // 回退到 localStorage
              try {
                localStorage.setItem(pageKey, JSON.stringify(highlightData));
                resolve();
              } catch (error) {
                console.error('Failed to save highlights to localStorage:', error);
                reject(error);
              }
            } else {
              resolve();
            }
          });
        } else {
          throw new Error('Chrome storage not available');
        }
      } catch (_) {
        console.warn('Chrome storage not available, using localStorage');
        try {
          localStorage.setItem(pageKey, JSON.stringify(highlightData));
          resolve();
        } catch (err) {
          console.error('Failed to save highlights:', err);
          reject(err);
        }
      }
    });
  },

  /**
   * 加載標記數據
   * @param {string} pageUrl - 頁面 URL
   * @returns {Promise<Array>}
   */
  loadHighlights(pageUrl) {
    const normalizedUrl = normalizeUrl(pageUrl);
    const pageKey = `highlights_${normalizedUrl}`;

    return new Promise(resolve => {
      try {
        if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
          chrome.storage.local.get([pageKey], data => {
            const stored = data?.[pageKey];
            if (stored) {
              // 支持兩種格式：數組（舊版）和對象（新版 {url, highlights}）
              let highlights = [];
              if (Array.isArray(stored)) {
                highlights = stored;
              } else if (stored.highlights && Array.isArray(stored.highlights)) {
                highlights = stored.highlights;
              }

              if (highlights.length > 0) {
                resolve(highlights);
                return;
              }
            }

            // 兼容舊版：從 localStorage 回退
            const legacy = localStorage.getItem(pageKey);
            if (legacy) {
              try {
                const parsed = JSON.parse(legacy);
                let highlights = [];
                if (Array.isArray(parsed)) {
                  highlights = parsed;
                } else if (parsed.highlights && Array.isArray(parsed.highlights)) {
                  highlights = parsed.highlights;
                }

                if (highlights.length > 0) {
                  resolve(highlights);
                  return;
                }
              } catch (error) {
                console.error('Failed to parse legacy highlights:', error);
              }
            }

            resolve([]);
          });
        } else {
          throw new Error('Chrome storage not available');
        }
      } catch (_) {
        console.warn('Chrome storage not available, falling back to localStorage');
        const legacy = localStorage.getItem(pageKey);
        if (legacy) {
          try {
            const parsed = JSON.parse(legacy);
            let highlights = [];
            if (Array.isArray(parsed)) {
              highlights = parsed;
            } else if (parsed.highlights && Array.isArray(parsed.highlights)) {
              highlights = parsed.highlights;
            }

            if (highlights.length > 0) {
              resolve(highlights);
              return;
            }
          } catch (errParseLocal) {
            console.error('Failed to parse localStorage highlights:', errParseLocal);
          }
        }
        resolve([]);
      }
    });
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
