// 共享工具函數
// 此腳本包含所有內容腳本共用的工具函數

// ===== Program-root utilities (for linters/DeepSource) =====
// 將背景日誌轉運器提升到程式根作用域，以符合 DeepSource 建議
function __sendBackgroundLog(level, message, argsArray) {
    try {
        // 僅在擴充環境下可用（使用可選鏈）
        if (chrome?.runtime?.sendMessage) {
            const argsSafe = Array.isArray(argsArray) ? argsArray : Array.from(argsArray || []);
            chrome.runtime.sendMessage({ action: 'devLogSink', level, message, args: argsSafe }, () => {
                try {
                    // 讀取 lastError 以避免未處理錯誤
                    const _lastError = chrome?.runtime?.lastError; // eslint-disable-line no-unused-vars
                } catch (_) { /* ignore */ }
            });
        }
    } catch (_) {
        // 忽略背景日誌發送錯誤（瀏覽器端避免直接 console）
    }
}

// 初始化可切換的日誌模式旗標（預設 false）；由 options 頁面設定 enableDebugLogs 同步更新
if (typeof window !== 'undefined') {
    try {
        window.__LOGGER_ENABLED__ = false;
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
            chrome.storage.sync.get(['enableDebugLogs'], (cfg) => {
                try { window.__LOGGER_ENABLED__ = Boolean(cfg?.enableDebugLogs); } catch (_) {}
            });
            if (chrome.storage.onChanged && typeof chrome.storage.onChanged.addListener === 'function') {
                chrome.storage.onChanged.addListener((changes, area) => {
                    if (area === 'sync' && changes && Object.prototype.hasOwnProperty.call(changes, 'enableDebugLogs')) {
                        try { window.__LOGGER_ENABLED__ = Boolean(changes.enableDebugLogs.newValue); } catch (_) {}
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
 * 標準化 URL，用於生成一致的存儲鍵
 * 處理：hash、查詢參數、尾部斜杠等變體
 */
function normalizeUrl(rawUrl) {
    try {
        // console.log('🔧 [normalizeUrl] 原始 URL:', rawUrl);
        
        const u = new URL(rawUrl);
        
        // 1. 移除 fragment (hash)
        if (u.hash) {
            // console.log('   移除 hash:', u.hash);
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
            // console.log('   移除追蹤參數:', removedParams.join(', '));
        }
        
        // 3. 標準化尾部斜杠（保留根路徑 "/"）
        if (u.pathname !== '/' && u.pathname.endsWith('/')) {
            // console.log('   移除尾部斜杠:', u.pathname);
            u.pathname = u.pathname.replace(/\/+$/, '');
        }
        
        const normalized = u.toString();
        // console.log('✅ [normalizeUrl] 標準化後:', normalized);
        
        return normalized;
    } catch (e) {
        Logger?.error?.('❌ [normalizeUrl] 標準化失敗:', e) || console.error('❌ [normalizeUrl] 標準化失敗:', e);
        return rawUrl || '';
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
    async saveHighlights(pageUrl, highlightData) {
        // console.log('💾 [saveHighlights] 開始保存標註');
        // console.log('   原始 URL:', pageUrl);
        
        const normalizedUrl = normalizeUrl(pageUrl);
        const pageKey = `highlights_${normalizedUrl}`;
        const count = Array.isArray(highlightData) ? highlightData.length : (highlightData?.highlights?.length || 0);
        
        // console.log(`   保存 ${count} 個標註到鍵:`, pageKey);
        
        return new Promise((resolve, reject) => {
            try {
                chrome.storage?.local?.set({ [pageKey]: highlightData }, () => {
                    if (chrome.runtime.lastError) {
                        console.error('Failed to save highlights to chrome.storage:', chrome.runtime.lastError);
                        // 回退到 localStorage
                        try {
                            localStorage.setItem(pageKey, JSON.stringify(highlightData));
                            console.log('Saved highlights to localStorage as fallback');
                            resolve();
                        } catch (e) {
                            console.error('Failed to save highlights to localStorage:', e);
                            reject(e);
                        }
                    } else {
                        console.log('Successfully saved highlights to chrome.storage');
                        resolve();
                    }
                });
            } catch (e) {
                console.log('Chrome storage not available, using localStorage');
                try {
                    localStorage.setItem(pageKey, JSON.stringify(highlightData));
                    console.log('Saved highlights to localStorage');
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
    async loadHighlights(pageUrl) {
        // console.log('📖 [loadHighlights] 開始讀取標註');
        // console.log('   原始 URL:', pageUrl);
        
        const normalizedUrl = normalizeUrl(pageUrl);
        const pageKey = `highlights_${normalizedUrl}`;
        
        // console.log('   讀取鍵:', pageKey);
        
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
                            console.log(`Found ${highlights.length} highlights in chrome.storage`);
                            resolve(highlights);
                            return;
                        }
                    }
                    
                    console.log('No highlights found in chrome.storage, checking localStorage');
                    // 兼容舊版：從 localStorage 回退
                    const legacy = localStorage.getItem(pageKey);
                    if (legacy) {
                        console.log('Found legacy highlights in localStorage');
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
                    console.log('No highlights found for this page');
                    resolve([]);
                });
            } catch (e) {
                console.log('Chrome storage not available, falling back to localStorage');
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
     * 清除標記數據
     */
    async clearHighlights(pageUrl) {
        const pageKey = `highlights_${normalizeUrl(pageUrl)}`;
        console.log('Clearing highlights for key:', pageKey);
        
        return new Promise((resolve) => {
            // 修復：先檢查 chrome.storage 是否存在
            if (chrome.storage?.local) {
                try {
                    chrome.storage.local.remove([pageKey], () => {
                        if (chrome.runtime.lastError) {
                            console.error('Failed to clear highlights from chrome.storage:', chrome.runtime.lastError);
                        } else {
                            console.log('Cleared highlights from chrome.storage');
                        }
                        
                        // 同時清除 localStorage
                        try {
                            localStorage.removeItem(pageKey);
                            console.log('Cleared highlights from localStorage');
                        } catch (e) {
                            console.error('Failed to clear localStorage:', e);
                        }
                        resolve();
                    });
                } catch (e) {
                    // chrome.storage.remove 調用失敗，回退到 localStorage
                    console.log('Chrome storage remove failed, clearing localStorage only');
                    try {
                        localStorage.removeItem(pageKey);
                        console.log('Cleared highlights from localStorage');
                    } catch (err) {
                        console.error('Failed to clear localStorage:', err);
                    }
                    resolve();
                }
            } else {
                // chrome.storage 不可用，只清除 localStorage
                console.log('Chrome storage not available, clearing localStorage only');
                try {
                    localStorage.removeItem(pageKey);
                    console.log('Cleared highlights from localStorage');
                } catch (err) {
                    console.error('Failed to clear localStorage:', err);
                }
                resolve();
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
                chrome.storage?.local?.get(null, (data) => {
                    const highlightKeys = Object.keys(data || {}).filter(keyName => keyName.startsWith('highlights_'));
                    try { window.Logger?.info?.(`📋 所有標註鍵 (${highlightKeys.length} 個):`); } catch (_) {}
                    highlightKeys.forEach(keyName => {
                        const count = Array.isArray(data[keyName])
                            ? data[keyName].length
                            : (data[keyName]?.highlights?.length || 0);
                        const url = keyName.replace('highlights_', '');
                        try { window.Logger?.info?.(`   ${count} 個標註: ${url}`); } catch (_) {}
                    });
                    resolve(highlightKeys);
                });
            } catch (_) {
                resolve([]);
            }
        });
    }
    }; // 結束 window.StorageUtil 定義
} else {
    console.log('⚠️ StorageUtil 已存在，跳過重複定義');
}

/**
 * 日誌工具
 */
if (typeof window.Logger === 'undefined') {
    // 簡易開發模式偵測：版本字串含 dev 或手動開關
    const __LOGGER_DEV__ = (() => {
        try {
            const manifest = chrome?.runtime?.getManifest?.();
            const versionString = manifest?.version_name || manifest?.version || '';
            const flag = (typeof window !== 'undefined' && window.__FORCE_LOG__ === true) || (typeof window !== 'undefined' && window.__LOGGER_ENABLED__ === true);
            return /dev/i.test(versionString) || flag;
        } catch (e) {
            return false;
        }
    })();

    window.Logger = {
    // 與現有代碼兼容：提供 log 別名（透過 background sink；僅在 dev 時發送）
    log: (message, ...args) => {
        if (__LOGGER_DEV__) {
            __sendBackgroundLog('log', message, args);
            console.log('[LOG]', message, ...args);
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
