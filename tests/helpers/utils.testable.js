// 共享工具函數
// 此腳本包含所有內容腳本共用的工具函數
// 測試專用版本 - 可在 Node.js 環境中導出

/* global chrome */

// 模擬瀏覽器環境（如果不存在）
if (typeof window === 'undefined') {
  global.window = {
    StorageUtil: undefined,
    Logger: undefined,
    normalizeUrl: undefined,
    location: { href: 'https://example.com' },
  };
  // 聲明 chrome 為全局變量（在瀏覽器環境中由 Chrome Extension API 提供）
  global.chrome = undefined;
} else if (typeof window.__LOGGER_ENABLED__ === 'undefined') {
  window.__LOGGER_ENABLED__ = false;
}

// ===== Safe Logger Helper =====
// 安全地獲取 Logger，在 Logger 未初始化時提供回退
function getLogger() {
  if (typeof window !== 'undefined' && typeof window.Logger !== 'undefined') {
    return window.Logger;
  }
  // 回退到一個安全的 Logger（在測試環境中可能使用 console）
  // 注意：此文件是測試輔助文件，在 Node.js/Jest 環境中運行，console 使用是必要的
  // 這些 console 調用僅在測試環境中使用，不會出現在生產環境的瀏覽器代碼中
  return {
    debug: (message, ...args) => {
      try {
        if (typeof console !== 'undefined' && console.log) {
          // skipcq: JS-0002 - 測試環境中的合法 console 使用
          console.log(`[DEBUG] ${message}`, ...args);
        }
      } catch (_) {
        // 忽略日誌錯誤
      }
    },
    info: (message, ...args) => {
      try {
        if (typeof console !== 'undefined' && console.log) {
          // skipcq: JS-0002 - 測試環境中的合法 console 使用
          console.log(`[INFO] ${message}`, ...args);
        }
      } catch (_) {
        // 忽略日誌錯誤
      }
    },
    warn: (message, ...args) => {
      try {
        if (typeof console !== 'undefined' && console.warn) {
          // skipcq: JS-0002 - 測試環境中的合法 console 使用
          console.warn(`[WARN] ${message}`, ...args);
        }
      } catch (_) {
        // 忽略日誌錯誤
      }
    },
    error: (message, ...args) => {
      try {
        if (typeof console !== 'undefined' && console.error) {
          // skipcq: JS-0002 - 測試環境中的合法 console 使用
          console.error(`[ERROR] ${message}`, ...args);
        }
      } catch (_) {
        // 忽略日誌錯誤
      }
    },
  };
}

// ===== Program-root utilities (for linters/DeepSource) =====
// 將函數提升到程式根作用域，以符合 DeepSource JS-0016 建議

/**
 * 正規化日誌旗標，避免 'false' 字串被視為真值
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
 * 檢查是否啟用了手動日誌記錄
 * 檢查全局變數 __FORCE_LOG__ 和 __LOGGER_ENABLED__ 來確定是否應該輸出日誌
 * @returns {boolean} 如果啟用了手動日誌記錄則返回 true，否則返回 false
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
 * 通過檢查 version_name 或 version 字段是否包含 "dev" 來判斷
 * 使用閉包緩存結果以提升性能
 * @returns {boolean} 如果是開發版本則返回 true，否則返回 false
 */
// 使用全局對象存儲緩存狀態，確保跨模組加載的一致性
if (typeof window.__manifestDevCache === 'undefined') {
  window.__manifestDevCache = {
    cachedResult: null,
    cacheEnabled: true,
  };
}

const isManifestMarkedDev = (() => {
  const cache = window.__manifestDevCache;

  const checkManifest = function () {
    // 如果緩存被禁用，每次都重新檢測（不更新緩存）
    if (!cache.cacheEnabled) {
      if (typeof chrome !== 'undefined' && chrome?.runtime?.getManifest) {
        try {
          const manifest = chrome.runtime.getManifest();
          const versionString = manifest?.version_name || manifest?.version || '';
          return /dev/i.test(versionString);
        } catch (_) {
          return false;
        }
      } else {
        return false;
      }
    }

    // 如果緩存啟用但為空，檢測並緩存結果
    if (cache.cachedResult === null) {
      if (typeof chrome !== 'undefined' && chrome?.runtime?.getManifest) {
        try {
          const manifest = chrome.runtime.getManifest();
          const versionString = manifest?.version_name || manifest?.version || '';
          cache.cachedResult = /dev/i.test(versionString);
        } catch (_) {
          cache.cachedResult = false;
        }
      } else {
        cache.cachedResult = false;
      }
    }

    return cache.cachedResult;
  };

  /**
   * 測試專用：禁用緩存
   *
   * 禁用後，每次調用 isManifestMarkedDev() 都會重新檢測 manifest。
   * 這確保了測試環境中的完全隔離。
   *
   * 注意：生產環境永遠不應調用此函數。
   */
  checkManifest.disableCache = function () {
    cache.cacheEnabled = false;
  };

  /**
   * 測試專用：啟用緩存
   *
   * 重新啟用緩存機制，恢復性能優化。
   * 應在測試的 afterEach 中調用以避免影響其他測試。
   */
  checkManifest.enableCache = function () {
    cache.cacheEnabled = true;
  };

  /**
   * 測試專用：重置緩存
   *
   * 清除已緩存的結果，下次調用時會重新檢測。
   */
  checkManifest.resetCache = function () {
    cache.cachedResult = null;
  };

  return checkManifest;
})();

/**
 * 檢查是否應該輸出開發日誌
 * 綜合檢查手動日誌旗標和 manifest 開發版本標記
 * @returns {boolean} 如果應該輸出開發日誌則返回 true，否則返回 false
 */
function shouldEmitDevLog() {
  return isManualLoggingEnabled() || isManifestMarkedDev();
}

/**
 * 發送日誌到背景腳本
 * @param {string} level - 日誌級別 ('debug', 'info', 'warn', 'error')
 * @param {string} message - 日誌訊息
 * @param {Array} argsArray - 日誌參數陣列
 */
function __sendBackgroundLog(level, message, argsArray) {
  try {
    // 僅在擴充環境下可用（使用可選鏈）
    if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
      const argsSafe = Array.isArray(argsArray) ? argsArray : Array.from(argsArray || []);
      chrome.runtime.sendMessage({ action: 'devLogSink', level, message, args: argsSafe }, () => {
        // 消費 lastError 以避免未處理錯誤警告（Chrome Extension 要求）
        // 直接訪問屬性即可消費錯誤，無需額外操作
        if (chrome?.runtime?.lastError) {
          // lastError 已被訪問，Chrome 不會拋出警告
        }
      });
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
    getLogger().debug('🔧 [normalizeUrl] 原始 URL:', rawUrl);

    const urlObject = new URL(rawUrl);

    // 1. 移除 fragment (hash)
    if (urlObject.hash) {
      getLogger().debug('   移除 hash:', urlObject.hash);
      urlObject.hash = '';
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
      if (urlObject.searchParams.has(param)) {
        removedParams.push(param);
        urlObject.searchParams.delete(param);
      }
    });
    if (removedParams.length > 0) {
      getLogger().debug('   移除追蹤參數:', removedParams.join(', '));
    }

    // 3. 標準化尾部斜杠（保留根路徑 "/"）
    if (urlObject.pathname !== '/' && urlObject.pathname.endsWith('/')) {
      getLogger().debug('   移除尾部斜杠:', urlObject.pathname);
      urlObject.pathname = urlObject.pathname.replace(/\/+$/, '');
    }

    const normalized = urlObject.toString();
    getLogger().debug('✅ [normalizeUrl] 標準化後:', normalized);

    return normalized;
  } catch (error) {
    getLogger().error('❌ [normalizeUrl] 標準化失敗:', error);
    return rawUrl || '';
  }
}

/**
 * 調試工具：列出所有存儲的標註鍵
 * 內部實現函數，供 StorageUtil.debugListAllKeys 使用
 * @returns {Promise<Array<string>>} 返回包含所有標註鍵的陣列
 */
function __debugListAllKeys() {
  return new Promise(resolve => {
    try {
      if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
        chrome.storage.local.get(null, data => {
          const highlightKeys = Object.keys(data || {}).filter(k => k.startsWith('highlights_'));
          try {
            getLogger().debug(`📋 所有標註鍵 (${highlightKeys.length} 個):`);
          } catch (_) {
            // 忽略日誌錯誤，防止日誌失敗影響函數執行
          }
          highlightKeys.forEach(key => {
            const count = Array.isArray(data[key])
              ? data[key].length
              : data[key]?.highlights?.length || 0;
            const url = key.replace('highlights_', '');
            try {
              getLogger().debug(`   ${count} 個標註: ${url}`);
            } catch (_) {
              // 忽略日誌錯誤，防止日誌失敗影響函數執行
            }
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
}

// 防止重複注入導致的重複聲明錯誤
const isReinjection = typeof window.StorageUtil !== 'undefined';
if (isReinjection) {
  try {
    getLogger().warn('⚠️ utils.js 已經加載，跳過重複注入');
  } catch (_) {
    // 忽略日誌錯誤
  }
  // 對於測試環境，仍然導出現有的函數（包括緩存控制函數）
  if (typeof module !== 'undefined' && module.exports) {
    // 獲取 checkManifest 函數（isManifestMarkedDev 返回的函數）
    const checkManifest = isManifestMarkedDev;

    module.exports = {
      normalizeUrl: window.normalizeUrl,
      StorageUtil: window.StorageUtil,
      Logger: window.Logger,
      // 測試專用：緩存控制函數（直接調用 checkManifest 上的方法）
      __disableManifestCache: checkManifest.disableCache,
      __enableManifestCache: checkManifest.enableCache,
      __resetManifestCache: checkManifest.resetCache,
    };
  }
} else {
  // normalizeUrl 函數已提升到程序根作用域（第 64 行）

  /**
   * 統一的存儲工具類
   */
  if (typeof window.StorageUtil === 'undefined') {
    window.StorageUtil = {
      /**
       * 保存標記數據
       */
      saveHighlights(pageUrl, highlightData) {
        getLogger().debug('💾 [saveHighlights] 開始保存標註');
        getLogger().debug('   原始 URL:', pageUrl);

        const normalizedUrl = normalizeUrl(pageUrl);
        const pageKey = `highlights_${normalizedUrl}`;
        const count = Array.isArray(highlightData)
          ? highlightData.length
          : highlightData?.highlights?.length || 0;

        getLogger().debug(`   保存 ${count} 個標註到鍵:`, pageKey);

        return new Promise((resolve, reject) => {
          try {
            chrome.storage?.local?.set({ [pageKey]: highlightData }, () => {
              if (chrome.runtime.lastError) {
                getLogger().error(
                  'Failed to save highlights to chrome.storage:',
                  chrome.runtime.lastError
                );
                // 回退到 localStorage
                try {
                  localStorage.setItem(pageKey, JSON.stringify(highlightData));
                  getLogger().info('Saved highlights to localStorage as fallback');
                  resolve();
                } catch (error) {
                  getLogger().error('Failed to save highlights to localStorage:', error);
                  reject(error);
                }
              } else {
                getLogger().debug('Successfully saved highlights to chrome.storage');
                resolve();
              }
            });
          } catch (error) {
            getLogger().warn('Chrome storage not available, using localStorage:', error);
            try {
              localStorage.setItem(pageKey, JSON.stringify(highlightData));
              getLogger().info('Saved highlights to localStorage');
              resolve();
            } catch (error) {
              getLogger().error('Failed to save highlights:', error);
              reject(error);
            }
          }
        });
      },

      /**
       * 加載標記數據
       */
      loadHighlights(pageUrl) {
        getLogger().debug('📖 [loadHighlights] 開始讀取標註');
        getLogger().debug('   原始 URL:', pageUrl);

        const normalizedUrl = normalizeUrl(pageUrl);
        const pageKey = `highlights_${normalizedUrl}`;

        getLogger().debug('   讀取鍵:', pageKey);

        return new Promise(resolve => {
          try {
            chrome.storage?.local?.get([pageKey], data => {
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
                  getLogger().debug(`Found ${highlights.length} highlights in chrome.storage`);
                  resolve(highlights);
                  return;
                }
              }

              getLogger().debug('No highlights found in chrome.storage, checking localStorage');
              // 兼容舊版：從 localStorage 回退
              const legacy = localStorage.getItem(pageKey);
              if (legacy) {
                getLogger().debug('Found legacy highlights in localStorage');
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
                  getLogger().error('Failed to parse legacy highlights:', error);
                }
              }
              getLogger().debug('No highlights found for this page');
              resolve([]);
            });
          } catch (_) {
            getLogger().debug('Chrome storage not available, falling back to localStorage');
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
                getLogger().error('Failed to parse localStorage highlights:', error);
              }
            }
            resolve([]);
          }
        });
      },

      /**
       * 清除標記數據
       */
      clearHighlights(pageUrl) {
        const pageKey = `highlights_${normalizeUrl(pageUrl)}`;
        getLogger().debug('Clearing highlights for key:', pageKey);

        return new Promise(resolve => {
          // 修復：先檢查 chrome.storage 是否存在
          if (chrome.storage?.local) {
            try {
              chrome.storage.local.remove([pageKey], () => {
                if (chrome.runtime.lastError) {
                  getLogger().error(
                    'Failed to clear highlights from chrome.storage:',
                    chrome.runtime.lastError
                  );
                } else {
                  getLogger().debug('Cleared highlights from chrome.storage');
                }

                // 同時清除 localStorage
                try {
                  localStorage.removeItem(pageKey);
                  getLogger().debug('Cleared highlights from localStorage');
                } catch (error) {
                  getLogger().error('Failed to clear localStorage:', error);
                }
                resolve();
              });
            } catch (_) {
              // chrome.storage.remove 調用失敗，回退到 localStorage
              getLogger().debug('Chrome storage remove failed, clearing localStorage only');
              try {
                localStorage.removeItem(pageKey);
                getLogger().debug('Cleared highlights from localStorage');
              } catch (error) {
                getLogger().error('Failed to clear localStorage:', error);
              }
              resolve();
            }
          } else {
            // chrome.storage 不可用，只清除 localStorage
            getLogger().debug('Chrome storage not available, clearing localStorage only');
            try {
              localStorage.removeItem(pageKey);
              getLogger().debug('Cleared highlights from localStorage');
            } catch (error) {
              getLogger().error('Failed to clear localStorage:', error);
            }
            resolve();
          }
        });
      },

      /**
       * 調試工具：列出所有存儲的標註鍵
       * 在控制台執行：StorageUtil.debugListAllKeys()
       */
      debugListAllKeys: __debugListAllKeys,
    }; // 結束 window.StorageUtil 定義
  } else {
    try {
      getLogger().warn('⚠️ StorageUtil 已存在，跳過重複定義');
    } catch (_) {
      // 忽略日誌錯誤
    }
  }

  /**
   * 日誌工具
   */
  if (typeof window.Logger === 'undefined') {
    window.Logger = {
      debug: (message, ...args) => {
        if (shouldEmitDevLog()) {
          __sendBackgroundLog('debug', message, args);
        }
        try {
          // skipcq: JS-0002 - 測試環境中的合法 console 使用
          console.log(`[DEBUG] ${message}`, ...args);
        } catch (_) {
          // 忽略 console 錯誤
        }
      },

      info: (message, ...args) => {
        if (shouldEmitDevLog()) {
          __sendBackgroundLog('info', message, args);
        }
        try {
          // skipcq: JS-0002 - 測試環境中的合法 console 使用
          console.log(`[INFO] ${message}`, ...args);
        } catch (_) {
          // 忽略 console 錯誤
        }
      },

      warn: (message, ...args) => {
        __sendBackgroundLog('warn', message, args);
        try {
          console.warn(`[WARN] ${message}`, ...args);
        } catch (_) {
          // 忽略 console 錯誤
        }
      },

      error: (message, ...args) => {
        __sendBackgroundLog('error', message, args);
        try {
          console.error(`[ERROR] ${message}`, ...args);
        } catch (_) {
          // 忽略 console 錯誤
        }
      },
    }; // 結束 window.Logger 定義
  } else {
    try {
      getLogger().warn('⚠️ Logger 已存在，跳過重複定義');
    } catch (_) {
      // 忽略日誌錯誤
    }
  }

  // 暴露 normalizeUrl 函數
  if (typeof window.normalizeUrl === 'undefined') {
    window.normalizeUrl = normalizeUrl;
  } else {
    try {
      getLogger().warn('⚠️ normalizeUrl 已存在，跳過重複定義');
    } catch (_) {
      // 忽略日誌錯誤
    }
  }
} // 結束 else 區塊（如果 utils.js 未加載）

// 初始化 Chrome Storage 監聽器
if (
  typeof chrome !== 'undefined' &&
  chrome.storage &&
  chrome.storage.sync &&
  chrome.storage.sync.onChanged
) {
  try {
    chrome.storage.sync.onChanged.addListener((changes, areaName) => {
      try {
        if (
          areaName === 'sync' &&
          changes &&
          Object.prototype.hasOwnProperty.call(changes, 'enableDebugLogs')
        ) {
          window.__LOGGER_ENABLED__ = normalizeLoggerFlag(changes.enableDebugLogs.newValue);
        }
      } catch (_) {
        // 忽略監聽器處理錯誤
      }
    });
  } catch (_) {
    // 忽略監聽器設置錯誤
  }
}

// Node.js/Jest 環境導出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeUrl: window.normalizeUrl || normalizeUrl,
    StorageUtil: window.StorageUtil,
    Logger: window.Logger,

    /**
     * 測試專用：禁用 manifest 檢測緩存
     *
     * 禁用後，每次 Logger 調用都會重新檢測 manifest 版本。
     * 這確保了測試環境中的完全隔離，避免測試間的狀態洩漏。
     *
     * 使用後必須在 afterEach 中調用 __enableManifestCache() 重新啟用緩存。
     *
     * @example
     * beforeEach(() => {
     *   if (utils?.__disableManifestCache) {
     *     utils.__disableManifestCache();
     *   }
     * });
     *
     * afterEach(() => {
     *   if (utils?.__enableManifestCache) {
     *     utils.__enableManifestCache();
     *   }
     * });
     */
    __disableManifestCache: () => {
      if (typeof isManifestMarkedDev?.disableCache === 'function') {
        isManifestMarkedDev.disableCache();
      }
    },

    /**
     * 測試專用：啟用 manifest 檢測緩存
     *
     * 重新啟用緩存機制，恢復性能優化。
     * 應在測試的 afterEach 中調用以避免影響其他測試。
     */
    __enableManifestCache: () => {
      if (typeof isManifestMarkedDev?.enableCache === 'function') {
        isManifestMarkedDev.enableCache();
      }
    },

    /**
     * 測試專用：重置 manifest 檢測緩存
     *
     * 清除已緩存的結果，下次調用時會重新檢測。
     * 通常與 __disableManifestCache 配合使用。
     */
    __resetManifestCache: () => {
      if (typeof isManifestMarkedDev?.resetCache === 'function') {
        isManifestMarkedDev.resetCache();
      }
    },
  };
}
