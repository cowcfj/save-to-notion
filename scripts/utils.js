/* global chrome, ErrorHandler */
// 共享工具函數
// 此腳本包含所有內容腳本共用的工具函數

// 防止重複注入導致的重複聲明錯誤
if (typeof window !== 'undefined' && window.__NOTION_UTILS_LOADED__) {
  // utils.js 已經加載，跳過重複注入
} else {
  // 標記 utils.js 已加載
  if (typeof window !== 'undefined') {
    window.__NOTION_UTILS_LOADED__ = true;
  }

  (function () {
    // ===== Module-level utilities (must be at program root) =====
    // __sendBackgroundLog moved to Logger.js

    /**
     * 標準化 URL，用於生成一致的存儲鍵
     *
     * ⚠️ 設計限制：本函數僅處理絕對 URL（含協議的完整 URL）。
     * 相對 URL（如 '/path', '../page'）會原樣返回而不進行標準化。
     *
     * Chrome Extension 使用場景：
     * - tab.url, activeTab.url → 永遠是絕對 URL
     * - window.location.href → 永遠是絕對 URL
     *
     * 處理項目：
     * - 移除 fragment (hash #)
     * - 移除追蹤參數 (utm_*, fbclid, gclid, etc.)
     * - 標準化尾部斜線（保留根路徑 "/"）
     *
     * @param {string} rawUrl - 完整的絕對 URL
     * @returns {string} 標準化後的 URL，相對/無效 URL 返回原始輸入
     */
    function normalizeUrl(rawUrl) {
      // 輸入驗證
      if (!rawUrl || typeof rawUrl !== 'string') {
        return rawUrl || '';
      }

      // 快速檢查：相對 URL 直接返回（不進行標準化）
      // Chrome Extension 環境中 tab.url 和 window.location.href 永遠是絕對 URL
      if (!rawUrl.includes('://')) {
        return rawUrl;
      }

      try {
        // console.log('🔧 [normalizeUrl] 原始 URL:', rawUrl);

        const urlObj = new URL(rawUrl);

        // 1. 移除 fragment (hash)
        if (urlObj.hash) {
          // console.log('   移除 hash:', urlObj.hash);
          urlObj.hash = '';
        }

        // 2. 移除常見的追蹤參數
        const trackingParams = [
          'utm_source',
          'utm_medium',
          'utm_campaign',
          'utm_term',
          'utm_content',
          'gclid',
          'fbclid',
          'mc_cid',
          'mc_eid',
          'igshid',
          'vero_id',
        ];
        const removedParams = [];
        trackingParams.forEach(param => {
          if (urlObj.searchParams.has(param)) {
            removedParams.push(param);
            urlObj.searchParams.delete(param);
          }
        });
        if (removedParams.length > 0) {
          // console.log('   移除追蹤參數:', removedParams.join(', '));
        }

        // 3. 標準化尾部斜杠（保留根路徑 "/"）
        if (urlObj.pathname !== '/' && urlObj.pathname.endsWith('/')) {
          // console.log('   移除尾部斜杠:', urlObj.pathname);
          urlObj.pathname = urlObj.pathname.replace(/\/+$/, '');
        }

        const normalized = urlObj.toString();
        // console.log('✅ [normalizeUrl] 標準化後:', normalized);

        return normalized;
      } catch (error) {
        if (typeof ErrorHandler !== 'undefined') {
          ErrorHandler.logError({
            type: 'url_normalization_error',
            context: 'URL 標準化失敗',
            originalError: error,
            timestamp: Date.now(),
          });
        } else {
          console.error('❌ [normalizeUrl] 標準化失敗:', error);
        }
        return rawUrl || '';
      }
    }

    // Legacy logger helpers removed (moved to Logger.js or deprecated)

    // ===== Safe Logger Abstraction =====
    // 使用新的統一 Logger 模組
    // 注意：由於 utils.js 是內容腳本的一部分，我們需要確保 Logger.js 已被注入
    // 或者在這裡提供一個兼容層，如果 Logger 未定義則回退到 console

    if (typeof window !== 'undefined') {
      // 如果 window.Logger 已經由 Logger.js 定義，則直接使用
      // 如果沒有，嘗試加載或定義回退
      if (!window.Logger) {
        // 嘗試從全局獲取（如果是在 background）
        if (typeof self !== 'undefined' && self.Logger) {
          window.Logger = self.Logger;
        } else {
          // 臨時回退，直到 Logger.js 加載完成
          window.Logger = console;
        }
      }

      // 暴露給全局，以便其他腳本使用
      window.__NOTION_SAFE_LOGGER__ = window.Logger;
    }

    /**
     * 統一的存儲工具類
     */
    if (typeof window.StorageUtil === 'undefined') {
      window.StorageUtil = {
        /**
         * 保存標記數據
         */
        saveHighlights(pageUrl, highlightData) {
          // console.log('💾 [saveHighlights] 開始保存標註');
          // console.log('   原始 URL:', pageUrl);

          const normalizedUrl = normalizeUrl(pageUrl);
          const pageKey = `highlights_${normalizedUrl}`;

          // console.log(`   保存 ${Array.isArray(highlightData) ? highlightData.length : (highlightData?.highlights?.length || 0)} 個標註到鍵:`, pageKey);

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
                console.warn('Saved highlights to localStorage');
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
         */
        loadHighlights(pageUrl) {
          // console.log('📖 [loadHighlights] 開始讀取標註');
          // console.log('   原始 URL:', pageUrl);

          const normalizedUrl = normalizeUrl(pageUrl);
          const pageKey = `highlights_${normalizedUrl}`;

          // console.log('   讀取鍵:', pageKey);

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
         * @returns {Promise<void>} 清除操作完成後的 Promise
         */
        async clearHighlights(pageUrl) {
          // 輸入驗證
          if (!pageUrl || typeof pageUrl !== 'string') {
            const error = new Error('Invalid pageUrl: must be a non-empty string');
            (window.Logger || console).error('❌ [clearHighlights] 無效的 URL 參數:', error.message);
            throw error;
          }

          // URL 標準化（在 try 塊外，因為 normalizeUrl 內部已有錯誤處理）
          const normalizedUrl = normalizeUrl(pageUrl);
          const pageKey = `highlights_${normalizedUrl}`;

          (window.Logger || console).log('🗑️ [clearHighlights] 開始清除標註:', pageKey);

          const results = await Promise.allSettled([
            this._clearFromChromeStorage(pageKey),
            this._clearFromLocalStorage(pageKey),
          ]);

          // 檢查結果
          const failures = results.filter(result => result.status === 'rejected');
          if (failures.length === results.length) {
            // 所有清除操作都失敗
            const error = new Error('Failed to clear highlights from all storage locations');
            (window.Logger || console).error(
              '❌ [clearHighlights] 所有存儲清除失敗:',
              failures.map(failure => failure.reason)
            );
            throw error;
          }

          if (failures.length > 0) {
            (window.Logger || console).warn(
              '⚠️ [clearHighlights] 部分存儲清除失敗:',
              failures.map(failure => failure.reason)
            );
          } else {
            (window.Logger || console).log('✅ [clearHighlights] 標註清除完成');
          }
        },

        /**
         * 從 Chrome Storage 清除數據的輔助函數
         * @private
         * @param {string} key - 存儲鍵
         * @returns {Promise<void>}
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
         * 從 localStorage 清除數據的輔助函數
         * @private
         * @param {string} key - 存儲鍵
         * @returns {Promise<void>}
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

        /**
         * 調試工具：列出所有存儲的標註鍵
         * 在控制台執行：StorageUtil.debugListAllKeys()
         */
        debugListAllKeys() {
          return new Promise(resolve => {
            try {
              if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
                chrome.storage.local.get(null, data => {
                  const highlightKeys = Object.keys(data || {}).filter(keyName =>
                    keyName.startsWith('highlights_')
                  );
                  (window.Logger || console).info(`📋 所有標註鍵 (${highlightKeys.length} 個):`);
                  highlightKeys.forEach(keyName => {
                    const count = Array.isArray(data[keyName])
                      ? data[keyName].length
                      : data[keyName]?.highlights?.length || 0;
                    const url = keyName.replace('highlights_', '');
                    (window.Logger || console).info(`   ${count} 個標註: ${url}`);
                  });
                  resolve(highlightKeys);
                });
              } else {
                resolve([]);
              }
            } catch (_) {
              resolve([]);
            }
          });
        },
      }; // 結束 window.StorageUtil 定義
    }

    // Logger 定義已移至 scripts/utils/Logger.js
    // 此處不再重複定義，避免衝突

    // 暴露 normalizeUrl 函數
    if (typeof window.normalizeUrl === 'undefined') {
      window.normalizeUrl = normalizeUrl;
    } else {
      // normalizeUrl 已存在，跳過重複定義
    }
  })();
}
