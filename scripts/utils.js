/* global chrome, ErrorHandler */
// 共享工具函數
// 此腳本包含所有內容腳本共用的工具函數

// ===== Safe Logger Abstraction =====
// 創建一個安全的 Logger 抽象，避免重複的 typeof 檢查
const safeLogger = (() => {
    // 檢查是否在瀏覽器環境且有 window.Logger
    if (typeof window !== 'undefined' && typeof window.Logger !== 'undefined') {
        return window.Logger;
    }
    // 返回一個安全的替代 Logger（使用原生 console）
    return {
        log: () => { /* Intentionally empty for production */ }, // 在生產環境不輸出 log
        debug: () => { /* Intentionally empty for production */ },
        info: () => { /* Intentionally empty for production */ },
        warn: console.warn.bind(console),
        error: console.error.bind(console)
    };
})();

// ===== Program-root utilities (for linters/DeepSource) =====
// 將背景日誌轉運器提升到程式根作用域，以符合 DeepSource 建議
function __sendBackgroundLog(level, message, argsArray) {
    try {
        // 僅在擴充環境下可用（使用可選鏈）
        if (typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage) {
            const argsSafe = Array.isArray(argsArray) ? argsArray : Array.from(argsArray || []);
            chrome.runtime.sendMessage({ action: 'devLogSink', level, message, args: argsSafe }, () => {
                try {
                    // 讀取 lastError 以避免未處理錯誤
                    const _lastError = chrome?.runtime?.lastError;
                } catch (_) { /* ignore */ }
            });
        }
    } catch (_) {
        // 忽略背景日誌發送錯誤（瀏覽器端避免直接 console）
    }
}

/**
 * 標準化 URL，用於生成一致的存儲鍵
 * 處理：hash、查詢參數、尾部斜杠等變體
 */
function normalizeUrl(rawUrl) {
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
            'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
            'gclid','fbclid','mc_cid','mc_eid','igshid','vero_id'
        ];
        const removedParams = [];
        trackingParams.forEach((p) => {
            if (urlObj.searchParams.has(p)) {
                removedParams.push(p);
                urlObj.searchParams.delete(p);
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
    } catch (e) {
        if (typeof ErrorHandler !== 'undefined') {
            ErrorHandler.logError({
                type: 'url_normalization_error',
                context: 'URL 標準化失敗',
                originalError: e,
                timestamp: Date.now()
            });
        } else {
            console.error('❌ [normalizeUrl] 標準化失敗:', e);
        }
        return rawUrl || '';
    }
}

/**
 * 安全地設置日誌啟用狀態
 * 初始化設置失敗不應影響主流程，因此靜默處理錯誤
 * @param {*} value - 要設置的值（會被轉換為布爾值）
 */
function setLoggerEnabledSafely(value) {
    try {
        if (typeof window !== 'undefined') {
            window.__LOGGER_ENABLED__ = Boolean(value);
        }
    } catch (_) {
        // 初始化設置失敗不應影響主流程
    }
}

// 初始化可切換的日誌模式旗標（預設 false）；由 options 頁面設定 enableDebugLogs 同步更新
if (typeof window !== 'undefined') {
    try {
        window.__LOGGER_ENABLED__ = false;
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
            chrome.storage.sync.get(['enableDebugLogs'], (cfg) => {
                setLoggerEnabledSafely(cfg?.enableDebugLogs);
            });
            if (chrome.storage.onChanged && typeof chrome.storage.onChanged.addListener === 'function') {
                chrome.storage.onChanged.addListener((changes, area) => {
                    if (area === 'sync' && changes && Object.prototype.hasOwnProperty.call(changes, 'enableDebugLogs')) {
                        setLoggerEnabledSafely(changes.enableDebugLogs.newValue);
                    }
                });
            }
        }
    } catch (_) { /* ignore */ }
}

// 防止重複注入導致的重複聲明錯誤
if (typeof window.StorageUtil !== 'undefined') {
    // utils.js 已經加載，跳過重複注入
    // 不執行後續代碼
} else {

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
                            console.error('Failed to save highlights to chrome.storage:', chrome.runtime.lastError);
                            // 回退到 localStorage
                            try {
                                localStorage.setItem(pageKey, JSON.stringify(highlightData));

                                resolve();
                            } catch (e) {
                                console.error('Failed to save highlights to localStorage:', e);
                                reject(e);
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

        return new Promise((resolve) => {
            try {
                if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
                    chrome.storage.local.get([pageKey], (data) => {
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
                            } catch (e) {
                                console.error('Failed to parse legacy highlights:', e);
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
            this._clearFromLocalStorage(pageKey)
        ]);

        // 檢查結果
        const failures = results.filter(result => result.status === 'rejected');
        if (failures.length === results.length) {
            // 所有清除操作都失敗
            const error = new Error('Failed to clear highlights from all storage locations');
            safeLogger.error('❌ [clearHighlights] 所有存儲清除失敗:', failures.map(f => f.reason));
            throw error;
        }

        if (failures.length > 0) {
            safeLogger.warn('⚠️ [clearHighlights] 部分存儲清除失敗:', failures.map(f => f.reason));
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
        return new Promise((resolve) => {
            try {
                if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
                    chrome.storage.local.get(null, (data) => {
                        const highlightKeys = Object.keys(data || {}).filter(keyName => keyName.startsWith('highlights_'));
                        safeLogger.info(`📋 所有標註鍵 (${highlightKeys.length} 個):`);
                        highlightKeys.forEach(keyName => {
                            const count = Array.isArray(data[keyName])
                                ? data[keyName].length
                                : (data[keyName]?.highlights?.length || 0);
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
    }
    }; // 結束 window.StorageUtil 定義
}

/**
 * 日誌工具
 */
if (typeof window.Logger === 'undefined') {
    // 簡易開發模式偵測：版本字串含 dev 或手動開關
    const __LOGGER_DEV__ = (() => {
        try {
            if (typeof chrome !== 'undefined') {
                const manifest = chrome?.runtime?.getManifest?.();
                const versionString = manifest?.version_name || manifest?.version || '';
                const flag = (typeof window !== 'undefined' && window.__FORCE_LOG__ === true) || (typeof window !== 'undefined' && window.__LOGGER_ENABLED__ === true);
                return /dev/i.test(versionString) || flag;
            }
            return false;
        } catch (_) {
            return false;
        }
    })();

    window.Logger = {
    // 與現有代碼兼容：提供 log 別名（透過 background sink；僅在 dev 時發送）
    log: (message, ...args) => {
        if (__LOGGER_DEV__) {
            __sendBackgroundLog('log', message, args);

        }
    },
    debug: (message, ...args) => {
        if (__LOGGER_DEV__) {
            __sendBackgroundLog('debug', message, args);
            console.debug('[DEBUG]', message, ...args);
        }
    },
    info: (message, ...args) => {
        if (__LOGGER_DEV__) {
            __sendBackgroundLog('info', message, args);
            console.info('[INFO]', message, ...args);
        }
    },
    warn: (message, ...args) => {
        __sendBackgroundLog('warn', message, args);
        if (__LOGGER_DEV__) {
            console.warn('[WARN]', message, ...args);
        }
    },
    error: (message, ...args) => {
        __sendBackgroundLog('error', message, args);
        console.error('[ERROR]', message, ...args);
    }
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

} // 結束 else 區塊（如果 utils.js 未加載）
