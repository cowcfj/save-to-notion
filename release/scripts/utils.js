// 共享工具函數
// 此腳本包含所有內容腳本共用的工具函數

/**
 * 標準化 URL，用於生成一致的存儲鍵
 */
function normalizeUrl(rawUrl) {
    try {
        const u = new URL(rawUrl);
        // Drop fragment
        u.hash = '';
        // Remove common tracking params
        const trackingParams = [
            'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
            'gclid','fbclid','mc_cid','mc_eid','igshid','vero_id'
        ];
        trackingParams.forEach((p) => u.searchParams.delete(p));
        // Normalize trailing slash (keep root "/")
        if (u.pathname !== '/' && u.pathname.endsWith('/')) {
            u.pathname = u.pathname.replace(/\/+$/, '');
        }
        return u.toString();
    } catch (e) {
        return rawUrl || '';
    }
}

/**
 * 統一的存儲工具類
 */
const StorageUtil = {
    /**
     * 保存標記數據
     */
    async saveHighlights(pageUrl, highlightData) {
        const pageKey = `highlights_${normalizeUrl(pageUrl)}`;
        console.log(`Saving ${highlightData.length} highlights for key:`, pageKey);
        
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
        const pageKey = `highlights_${normalizeUrl(pageUrl)}`;
        console.log('Loading highlights for key:', pageKey);
        
        return new Promise((resolve) => {
            try {
                chrome.storage?.local?.get([pageKey], (data) => {
                    const stored = data && data[pageKey];
                    if (stored && Array.isArray(stored) && stored.length > 0) {
                        console.log(`Found ${stored.length} highlights in chrome.storage`);
                        resolve(stored);
                    } else {
                        console.log('No highlights found in chrome.storage, checking localStorage');
                        // 兼容舊版：從 localStorage 回退
                        const legacy = localStorage.getItem(pageKey);
                        if (legacy) {
                            console.log('Found legacy highlights in localStorage');
                            try { 
                                const parsed = JSON.parse(legacy);
                                if (Array.isArray(parsed) && parsed.length > 0) {
                                    resolve(parsed);
                                    return;
                                }
                            } catch (e) {
                                console.error('Failed to parse legacy highlights:', e);
                            }
                        }
                        console.log('No highlights found for this page');
                        resolve([]);
                    }
                });
            } catch (e) {
                console.log('Chrome storage not available, falling back to localStorage');
                const legacy = localStorage.getItem(pageKey);
                if (legacy) {
                    try { 
                        const parsed = JSON.parse(legacy);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            resolve(parsed);
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
            try {
                chrome.storage?.local?.remove([pageKey], () => {
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
    }
};

/**
 * 日誌工具
 */
const Logger = {
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
};

// 暴露全局變數以供其他腳本使用
window.normalizeUrl = normalizeUrl;
window.StorageUtil = StorageUtil;
window.Logger = Logger;