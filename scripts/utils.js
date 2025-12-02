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
    /**
     * 背景日誌轉運器：將日誌發送到 background service worker
     * @param {string} level - 日誌級別 (log/debug/info/warn/error)
     * @param {string} message - 日誌訊息
     * @param {Array} argsArray - 額外參數
     */
    function __sendBackgroundLog(level, message, argsArray) {
      try {
        // 僅在擴充環境下可用（使用可選鏈）
        if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
          const argsSafe = Array.isArray(argsArray) ? argsArray : Array.from(argsArray || []);
          chrome.runtime.sendMessage(
            { action: 'devLogSink', level, message, args: argsSafe },
            () => {
              // 消費 lastError 以避免未處理錯誤警告（Chrome Extension 要求）
              // 直接訪問屬性即可消費錯誤，無需額外操作
              if (chrome?.runtime?.lastError) {
                // lastError 已被訪問，Chrome 不會拋出警告
              }
            }
          );
        }
      } catch (_) {
        // 忽略背景日誌發送錯誤（瀏覽器端避免直接 console）
      }
    }

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

    /**
     * 正規化日誌啟用旗標，避免 'false' 等字串被當成真值
     * @param {*} value - 任何可被使用者或 storage 設置的值
     * @returns {boolean}
     */
    function normalizeLoggerFlag(value) {
      if (value === true) {
        return true;
      }
      if (value === false || value === undefined || value === null) {
        return false;
      }
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') {
          return true;
        }
        if (normalized === 'false' || normalized === '0' || normalized === '') {
          return false;
        }
      }
      if (typeof value === 'number') {
        return value === 1;
      }
      return false;
    }

    /**
     * 檢查是否手動啟用日誌記錄
     * 檢查 window.__FORCE_LOG__ 或 window.__LOGGER_ENABLED__ 旗標
     * @returns {boolean} 如果手動啟用日誌則返回 true，否則返回 false
     */
    function isManualLoggingEnabled() {
      if (typeof window === 'undefined') {
        return false;
      }
      return (
        normalizeLoggerFlag(window.__FORCE_LOG__) || normalizeLoggerFlag(window.__LOGGER_ENABLED__)
      );
    }

    /**
     * 檢查 manifest 版本是否標記為開發版本
     * 通過檢查 version_name 或 version 字段中是否包含 'dev' 來判斷
     * 使用閉包緩存結果以提升性能
     * @returns {boolean} 如果是開發版本則返回 true，否則返回 false
     */
    const isManifestMarkedDev = (() => {
      let cachedResult = null;

      return function () {
        if (cachedResult !== null) {
          return cachedResult;
        }

        try {
          if (typeof chrome !== 'undefined') {
            const manifest = chrome?.runtime?.getManifest?.();
            const versionString = manifest?.version_name || manifest?.version || '';
            cachedResult = /dev/i.test(versionString);
            return cachedResult;
          }
        } catch (_) {
          // manifest 讀取失敗時，退回 false
        }

        cachedResult = false;
        return false;
      };
    })();

    /**
     * 判斷是否應該輸出開發日誌
     * 檢查手動啟用旗標或 manifest 開發版本標記
     * @returns {boolean} 如果應該輸出開發日誌則返回 true，否則返回 false
     */
    function shouldEmitDevLog() {
      return isManualLoggingEnabled() || isManifestMarkedDev();
    }

    /**
     * 安全地設置日誌啟用旗標
     * 使用 normalizeLoggerFlag 正規化輸入值，避免字串 'false' 等被誤判為真值
     * 設置失敗時靜默處理，不影響主流程
     * @param {*} value - 要設置的值（任何類型，會被正規化為 boolean）
     * @returns {void}
     */
    function setLoggerEnabledSafely(value) {
      try {
        if (typeof window !== 'undefined') {
          window.__LOGGER_ENABLED__ = normalizeLoggerFlag(value);
        }
      } catch (_) {
        // 初始化設置失敗不應影響主流程
      }
    }

    // ===== Safe Logger Abstraction =====
    // 創建一個安全的 Logger 抽象，避免重複的 typeof 檢查
    const safeLogger = (function initSafeLoggerSingleton() {
      if (typeof window !== 'undefined' && window.__NOTION_SAFE_LOGGER__) {
        return window.__NOTION_SAFE_LOGGER__;
      }

      // 檢查是否在瀏覽器環境且有 window.Logger
      if (typeof window !== 'undefined' && typeof window.Logger !== 'undefined') {
        window.__NOTION_SAFE_LOGGER__ = window.Logger;
        return window.Logger;
      }

      // 返回一個安全的替代 Logger（使用原生 console）
      const fallbackLogger = {
        log: () => {
          /* Intentionally empty for production */
        }, // 在生產環境不輸出 log
        debug: () => {
          /* Intentionally empty for production */
        },
        info: () => {
          /* Intentionally empty for production */
        },
        warn: console.warn.bind(console),
        error: console.error.bind(console),
      };

      if (typeof window !== 'undefined') {
        window.__NOTION_SAFE_LOGGER__ = fallbackLogger;
      }

      return fallbackLogger;
    })();

    // 初始化可切換的日誌模式旗標（預設 false）；由 options 頁面設定 enableDebugLogs 同步更新
    if (typeof window !== 'undefined') {
      try {
        if (typeof window.__LOGGER_ENABLED__ === 'undefined') {
          window.__LOGGER_ENABLED__ = false;
        }
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
          chrome.storage.sync.get(['enableDebugLogs'], cfg => {
            setLoggerEnabledSafely(cfg?.enableDebugLogs);
          });
          if (
            chrome.storage.onChanged &&
            typeof chrome.storage.onChanged.addListener === 'function'
          ) {
            chrome.storage.onChanged.addListener((changes, area) => {
              if (
                area === 'sync' &&
                changes &&
                Object.prototype.hasOwnProperty.call(changes, 'enableDebugLogs')
              ) {
                setLoggerEnabledSafely(changes.enableDebugLogs.newValue);
              }
            });
          }
        }
      } catch (_) {
        /* ignore */
      }
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
            safeLogger.error('❌ [clearHighlights] 無效的 URL 參數:', error.message);
            throw error;
          }

          // URL 標準化（在 try 塊外，因為 normalizeUrl 內部已有錯誤處理）
          const normalizedUrl = normalizeUrl(pageUrl);
          const pageKey = `highlights_${normalizedUrl}`;

          safeLogger.log('🗑️ [clearHighlights] 開始清除標註:', pageKey);

          const results = await Promise.allSettled([
            this._clearFromChromeStorage(pageKey),
            this._clearFromLocalStorage(pageKey),
          ]);

          // 檢查結果
          const failures = results.filter(result => result.status === 'rejected');
          if (failures.length === results.length) {
            // 所有清除操作都失敗
            const error = new Error('Failed to clear highlights from all storage locations');
            safeLogger.error(
              '❌ [clearHighlights] 所有存儲清除失敗:',
              failures.map(failure => failure.reason)
            );
            throw error;
          }

          if (failures.length > 0) {
            safeLogger.warn(
              '⚠️ [clearHighlights] 部分存儲清除失敗:',
              failures.map(failure => failure.reason)
            );
          } else {
            safeLogger.log('✅ [clearHighlights] 標註清除完成');
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
                  safeLogger.info(`📋 所有標註鍵 (${highlightKeys.length} 個):`);
                  highlightKeys.forEach(keyName => {
                    const count = Array.isArray(data[keyName])
                      ? data[keyName].length
                      : data[keyName]?.highlights?.length || 0;
                    const url = keyName.replace('highlights_', '');
                    safeLogger.info(`   ${count} 個標註: ${url}`);
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

    /**
     * 日誌工具
     */
    if (typeof window.Logger === 'undefined') {
      /**
       * 檢查是否應該輸出開發日誌的內部函數
       * 作為 Logger 方法的條件檢查器，決定是否執行日誌輸出
       * @returns {boolean} 如果應該輸出開發日誌則返回 true，否則返回 false
       */
      const __LOGGER_DEV__ = () => shouldEmitDevLog();

      window.Logger = {
        // 與現有代碼兼容：提供 log 別名（透過 background sink；僅在 dev 時發送）
        log: (message, ...args) => {
          if (__LOGGER_DEV__()) {
            __sendBackgroundLog('log', message, args);
          }
        },
        debug: (message, ...args) => {
          if (__LOGGER_DEV__()) {
            __sendBackgroundLog('debug', message, args);
            console.debug('[DEBUG]', message, ...args);
          }
        },
        info: (message, ...args) => {
          if (__LOGGER_DEV__()) {
            __sendBackgroundLog('info', message, args);
            console.info('[INFO]', message, ...args);
          }
        },
        warn: (message, ...args) => {
          __sendBackgroundLog('warn', message, args);
          if (__LOGGER_DEV__()) {
            console.warn('[WARN]', message, ...args);
          }
        },
        error: (message, ...args) => {
          __sendBackgroundLog('error', message, args);
          console.error('[ERROR]', message, ...args);
        },
      }; // 結束 window.Logger 定義
    } else {
      // Logger 已存在，跳過重複定義
    }

    // 暴露 normalizeUrl 函數
    if (typeof window.normalizeUrl === 'undefined') {
      window.normalizeUrl = normalizeUrl;
    } else {
      // normalizeUrl 已存在，跳過重複定義
    }
  })();
}
