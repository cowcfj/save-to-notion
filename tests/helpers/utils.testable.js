// 共享工具函數
// 此腳本包含所有內容腳本共用的工具函數
// 測試專用版本 - 可在 Node.js 環境中導出

// 模擬瀏覽器環境（如果不存在）
if (typeof window === 'undefined') {
  global.window = {
    StorageUtil: undefined,
    Logger: undefined,
    normalizeUrl: undefined,
    location: { href: 'https://example.com' }
  };
}

// 防止重複注入導致的重複聲明錯誤
const isReinjection = typeof window.StorageUtil !== 'undefined';
if (isReinjection) {
    console.log('⚠️ utils.js 已經加載，跳過重複注入');
    // 對於測試環境，仍然導出現有的函數
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = {
        normalizeUrl: window.normalizeUrl,
        StorageUtil: window.StorageUtil,
        Logger: window.Logger
      };
    }
} else {

/**
 * 標準化 URL，用於生成一致的存儲鍵
 * 處理：hash、查詢參數、尾部斜杠等變體
 */
function normalizeUrl(rawUrl) {
    try {
        console.log('🔧 [normalizeUrl] 原始 URL:', rawUrl);
        
        const u = new URL(rawUrl);
        
        // 1. 移除 fragment (hash)
        if (u.hash) {
            console.log('   移除 hash:', u.hash);
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
            console.log('   移除追蹤參數:', removedParams.join(', '));
        }
        
        // 3. 標準化尾部斜杠（保留根路徑 "/"）
        if (u.pathname !== '/' && u.pathname.endsWith('/')) {
            console.log('   移除尾部斜杠:', u.pathname);
            u.pathname = u.pathname.replace(/\/+$/, '');
        }
        
        const normalized = u.toString();
        console.log('✅ [normalizeUrl] 標準化後:', normalized);
        
        return normalized;
    } catch (e) {
        console.error('❌ [normalizeUrl] 標準化失敗:', e);
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
        console.log('💾 [saveHighlights] 開始保存標註');
        console.log('   原始 URL:', pageUrl);
        
        const normalizedUrl = normalizeUrl(pageUrl);
        const pageKey = `highlights_${normalizedUrl}`;
        const count = Array.isArray(highlightData) ? highlightData.length : (highlightData?.highlights?.length || 0);
        
        console.log(`   保存 ${count} 個標註到鍵:`, pageKey);
        
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
        console.log('📖 [loadHighlights] 開始讀取標註');
        console.log('   原始 URL:', pageUrl);
        
        const normalizedUrl = normalizeUrl(pageUrl);
        const pageKey = `highlights_${normalizedUrl}`;
        
        console.log('   讀取鍵:', pageKey);
        
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
                    } catch (e) {
                        console.error('Failed to parse localStorage highlights:', e);
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
    async debugListAllKeys() {
        return new Promise((resolve) => {
            try {
                if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
                    chrome.storage.local.get(null, (data) => {
                        const highlightKeys = Object.keys(data || {}).filter(k => k.startsWith('highlights_'));
                        try { console.log('📋 所有標註鍵 (' + highlightKeys.length + ' 個):'); } catch (_) {}
                        highlightKeys.forEach(key => {
                            const count = Array.isArray(data[key]) 
                                ? data[key].length 
                                : (data[key]?.highlights?.length || 0);
                            const url = key.replace('highlights_', '');
                            try { console.log(`   ${count} 個標註: ${url}`); } catch (_) {}
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
} else {
    console.log('⚠️ StorageUtil 已存在，跳過重複定義');
}

/**
 * 日誌工具
 */
if (typeof window.Logger === 'undefined') {
    window.Logger = {
    debug: (message, ...args) => {
        console.log(`[DEBUG] ${message}`, ...args);
    },
    
    info: (message, ...args) => {
        console.log(`[INFO] ${message}`, ...args);
    },
    
    warn: (message, ...args) => {
        console.warn(`[WARN] ${message}`, ...args);
    },
    
    error: (message, ...args) => {
        console.error(`[ERROR] ${message}`, ...args);
    }
    }; // 結束 window.Logger 定義
} else {
    console.log('⚠️ Logger 已存在，跳過重複定義');
}

// 暴露 normalizeUrl 函數
if (typeof window.normalizeUrl === 'undefined') {
    window.normalizeUrl = normalizeUrl;
} else {
    console.log('⚠️ normalizeUrl 已存在，跳過重複定義');
}

} // 結束 else 區塊（如果 utils.js 未加載）

// Node.js/Jest 環境導出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeUrl: window.normalizeUrl || normalizeUrl,
    StorageUtil: window.StorageUtil,
    Logger: window.Logger
  };
}