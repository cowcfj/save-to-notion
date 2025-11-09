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
    location: { href: 'https://example.com' }
  };
  // 聲明 chrome 為全局變量（在瀏覽器環境中由 Chrome Extension API 提供）
  global.chrome = undefined;
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
        }
    };
}

// ===== Program-root utilities (for linters/DeepSource) =====
// 將函數提升到程式根作用域，以符合 DeepSource JS-0016 建議

/**
 * 檢查是否為開發模式
 */
function isDevMode() {
    // 首先檢查強制標記
    if (window.__FORCE_LOG__ || window.__LOGGER_ENABLED__) {
        return true;
    }

    // 然後檢查 Chrome manifest
    if (typeof chrome !== 'undefined' && chrome?.runtime?.getManifest) {
        try {
            const manifest = chrome.runtime.getManifest();
            return manifest?.version?.includes('dev') || false;
        } catch (_) {
            // 如果 getManifest 拋出異常，降級為非開發模式
            return false;
        }
    }

    return false;
}

/**
 * 發送日誌到背景腳本
 */
function __sendBackgroundLog(level, message, argsArray) {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
            chrome.runtime.sendMessage({
                action: 'devLogSink',
                level,
                message,
                args: Array.isArray(argsArray) ? argsArray : [argsArray]
            }, () => {
                // 忽略回調錯誤
            });
        } catch (_) {
            // 忽略發送錯誤
        }
    }
}

/**
 * 標準化 URL，用於生成一致的存儲鍵
 * 處理：hash、查詢參數、尾部斜杠等變體
 */
function normalizeUrl(rawUrl) {
    try {
        getLogger().debug('🔧 [normalizeUrl] 原始 URL:', rawUrl);

        const u = new URL(rawUrl);

        // 1. 移除 fragment (hash)
        if (u.hash) {
            getLogger().debug('   移除 hash:', u.hash);
            u.hash = '';
        }

        // 2. 移除常見的追蹤參數
        const trackingParams = [
            'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
            'gclid','fbclid','mc_cid','mc_eid','igshid','vero_id'
        ];
        const removedParams = [];
        trackingParams.forEach((p) => {
            if (u.searchParams.has(p)) {
                removedParams.push(p);
                u.searchParams.delete(p);
            }
        });
        if (removedParams.length > 0) {
            getLogger().debug('   移除追蹤參數:', removedParams.join(', '));
        }

        // 3. 標準化尾部斜杠（保留根路徑 "/"）
        if (u.pathname !== '/' && u.pathname.endsWith('/')) {
            getLogger().debug('   移除尾部斜杠:', u.pathname);
            u.pathname = u.pathname.replace(/\/+$/, '');
        }

        const normalized = u.toString();
        getLogger().debug('✅ [normalizeUrl] 標準化後:', normalized);

        return normalized;
    } catch (e) {
        getLogger().error('❌ [normalizeUrl] 標準化失敗:', e);
        return rawUrl || '';
    }
}

/**
 * 調試工具：列出所有存儲的標註鍵
 * 內部實現函數，供 StorageUtil.debugListAllKeys 使用
 */
function __debugListAllKeys() {
    return new Promise((resolve) => {
        try {
            if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
                chrome.storage.local.get(null, (data) => {
                    const highlightKeys = Object.keys(data || {}).filter(k => k.startsWith('highlights_'));
                    try {
                        getLogger().debug(`📋 所有標註鍵 (${highlightKeys.length} 個):`);
                    } catch (_) {
                        // 忽略日誌錯誤，防止日誌失敗影響函數執行
                    }
                    highlightKeys.forEach(key => {
                        const count = Array.isArray(data[key])
                            ? data[key].length
                            : (data[key]?.highlights?.length || 0);
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
    // 對於測試環境，仍然導出現有的函數
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = {
        normalizeUrl: window.normalizeUrl,
        StorageUtil: window.StorageUtil,
        Logger: window.Logger
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
    async saveHighlights(pageUrl, highlightData) {
        getLogger().debug('💾 [saveHighlights] 開始保存標註');
        getLogger().debug('   原始 URL:', pageUrl);

        const normalizedUrl = normalizeUrl(pageUrl);
        const pageKey = `highlights_${normalizedUrl}`;
        const count = Array.isArray(highlightData) ? highlightData.length : (highlightData?.highlights?.length || 0);

        getLogger().debug(`   保存 ${count} 個標註到鍵:`, pageKey);

        return new Promise((resolve, reject) => {
            try {
                chrome.storage?.local?.set({ [pageKey]: highlightData }, () => {
                    if (chrome.runtime.lastError) {
                        getLogger().error('Failed to save highlights to chrome.storage:', chrome.runtime.lastError);
                        // 回退到 localStorage
                        try {
                            localStorage.setItem(pageKey, JSON.stringify(highlightData));
                            getLogger().info('Saved highlights to localStorage as fallback');
                            resolve();
                        } catch (e) {
                            getLogger().error('Failed to save highlights to localStorage:', e);
                            reject(e);
                        }
                    } else {
                        getLogger().debug('Successfully saved highlights to chrome.storage');
                        resolve();
                    }
                });
            } catch (e) {
                getLogger().warn('Chrome storage not available, using localStorage:', e);
                try {
                    localStorage.setItem(pageKey, JSON.stringify(highlightData));
                    getLogger().info('Saved highlights to localStorage');
                    resolve();
                } catch (err) {
                    getLogger().error('Failed to save highlights:', err);
                    reject(err);
                }
            }
        });
    },

    /**
     * 加載標記數據
     */
    async loadHighlights(pageUrl) {
        getLogger().debug('📖 [loadHighlights] 開始讀取標註');
        getLogger().debug('   原始 URL:', pageUrl);

        const normalizedUrl = normalizeUrl(pageUrl);
        const pageKey = `highlights_${normalizedUrl}`;

        getLogger().debug('   讀取鍵:', pageKey);

        return new Promise((resolve) => {
            try {
                chrome.storage?.local?.get([pageKey], (data) => {
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
                        } catch (e) {
                            getLogger().error('Failed to parse legacy highlights:', e);
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
                    } catch (e) {
                        getLogger().error('Failed to parse localStorage highlights:', e);
                    }
                }
                resolve([]);
            }
        });
    },

    /**
     * 清除標記數據
     */
    async clearHighlights(pageUrl) {
        const pageKey = `highlights_${normalizeUrl(pageUrl)}`;
        getLogger().debug('Clearing highlights for key:', pageKey);

        return new Promise((resolve) => {
            // 修復：先檢查 chrome.storage 是否存在
            if (chrome.storage?.local) {
                try {
                    chrome.storage.local.remove([pageKey], () => {
                        if (chrome.runtime.lastError) {
                            getLogger().error('Failed to clear highlights from chrome.storage:', chrome.runtime.lastError);
                        } else {
                            getLogger().debug('Cleared highlights from chrome.storage');
                        }

                        // 同時清除 localStorage
                        try {
                            localStorage.removeItem(pageKey);
                            getLogger().debug('Cleared highlights from localStorage');
                        } catch (e) {
                            getLogger().error('Failed to clear localStorage:', e);
                        }
                        resolve();
                    });
                } catch (_) {
                    // chrome.storage.remove 調用失敗，回退到 localStorage
                    getLogger().debug('Chrome storage remove failed, clearing localStorage only');
                    try {
                        localStorage.removeItem(pageKey);
                        getLogger().debug('Cleared highlights from localStorage');
                    } catch (err) {
                        getLogger().error('Failed to clear localStorage:', err);
                    }
                    resolve();
                }
            } else {
                // chrome.storage 不可用，只清除 localStorage
                getLogger().debug('Chrome storage not available, clearing localStorage only');
                try {
                    localStorage.removeItem(pageKey);
                    getLogger().debug('Cleared highlights from localStorage');
                } catch (err) {
                    getLogger().error('Failed to clear localStorage:', err);
                }
                resolve();
            }
        });
    },

    /**
     * 調試工具：列出所有存儲的標註鍵
     * 在控制台執行：StorageUtil.debugListAllKeys()
     */
    debugListAllKeys: __debugListAllKeys
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
            if (isDevMode()) {
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
            if (isDevMode()) {
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
        }
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
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync && chrome.storage.sync.onChanged) {
    try {
        chrome.storage.sync.onChanged.addListener((changes, areaName) => {
            try {
                if (areaName === 'sync' && changes && changes.enableDebugLogs) {
                    window.__LOGGER_ENABLED__ = changes.enableDebugLogs.newValue;
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
    Logger: window.Logger
  };
}