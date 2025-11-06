// Notion Smart Clipper - Background Script
// Refactored for better organization

/* global chrome, PerformanceOptimizer, ImageUtils, batchProcess, ErrorHandler, AdaptivePerformanceManager */

// ==========================================
// DEVELOPMENT MODE CONTROL
// ==========================================

// 用於控制調試輸出的開發模式標誌
const DEBUG_MODE = (function() {
    try {
        // 可以通過 manifest.json 或其他方式控制
        return chrome?.runtime?.getManifest?.()?.version?.includes('dev') || false;
    } catch {
        // 生產環境中默認關閉調試
        return false;
    }
})();

// 條件日誌函數
const Logger = {
    log: (...args) => DEBUG_MODE && Logger.log(...args),
    warn: (...args) => console.warn(...args), // 警告總是顯示
    error: (...args) => console.error(...args), // 錯誤總是顯示
    info: (...args) => DEBUG_MODE && console.info(...args)
};

// ==========================================
// URL UTILITIES
// ==========================================

/**
 * 清理和標準化圖片 URL
 */
function cleanImageUrl(url) {
    if (!url || typeof url !== 'string') return null;

    try {
        const urlObj = new URL(url);

        // 處理代理 URL（如 pgw.udn.com.tw/gw/photo.php）
        if (urlObj.pathname.includes('/photo.php') || urlObj.pathname.includes('/gw/')) {
            const uParam = urlObj.searchParams.get('u');
            if (uParam?.match(/^https?:\/\//)) {
                // 使用代理中的原始圖片 URL
                return cleanImageUrl(uParam);
            }
        }

        // 移除重複的查詢參數
        const params = new URLSearchParams();
        for (const [key, value] of urlObj.searchParams.entries()) {
            if (!params.has(key)) {
                params.set(key, value);
            }
        }
        urlObj.search = params.toString();

        return urlObj.href;
    } catch {
        return null;
    }
}

// ============ 圖片 URL 驗證與緩存系統 ============

/**
 * 圖片 URL 驗證配置常量
 */
const IMAGE_VALIDATION_CONFIG = {
    MAX_URL_LENGTH: 2000,
    MAX_CACHE_SIZE: 500,  // 降低以減少記憶體使用
    CACHE_TTL: 30 * 60 * 1000,  // 30分鐘 TTL
    SUPPORTED_PROTOCOLS: ['http:', 'https:', 'data:', 'blob:'],
    IMAGE_EXTENSIONS: /\.(?:jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|tif|avif|heic|heif)(?:\?.*)?$/i,
    IMAGE_PATH_PATTERNS: [
        /\/image[s]?\//i,
        /\/img[s]?\//i,
        /\/photo[s]?\//i,
        /\/picture[s]?\//i,
        /\/media\//i,
        /\/upload[s]?\//i,
        /\/asset[s]?\//i,
        /\/file[s]?\//i,
        /\/content\//i,
        /\/wp-content\//i,
        /\/cdn\//i,
        /cdn\d*\./i,
        /\/static\//i,
        /\/thumb[s]?\//i,
        /\/thumbnail[s]?\//i,
        /\/resize\//i,
        /\/crop\//i,
        /\/(\d{4})\/(\d{2})\//
    ],
    EXCLUDE_PATTERNS: [
        /\.(js|css|html|htm|php|asp|jsp|json|xml)(\?|$)/i,
        /\/api\//i,
        /\/ajax\//i,
        /\/callback/i,
        /\/track/i,
        /\/analytics/i
    ]
};

/**
 * 圖片 URL 驗證緩存類
 * 實現真正的 LRU 緩存策略與 TTL
 */
class ImageUrlValidationCache {
    constructor(maxSize = IMAGE_VALIDATION_CONFIG.MAX_CACHE_SIZE, ttl = IMAGE_VALIDATION_CONFIG.CACHE_TTL) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.ttl = ttl;
        this.accessOrder = new Map();  // 用於 LRU 追蹤
        this.stats = { hits: 0, misses: 0, evictions: 0 };
    }

    /**
     * 獲取緩存的驗證結果
     * @param {string} url - 要檢查的 URL
     * @returns {boolean|null} 驗證結果或 null（未緩存）
     */
    get(url) {
        const entry = this.cache.get(url);
        if (!entry) {
            this.stats.misses++;
            return null;
        }

        // 檢查是否過期
        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(url);
            this.accessOrder.delete(url);
            this.stats.evictions++;
            this.stats.misses++;
            return null;
        }

        // 更新訪問順序（LRU）
        this.accessOrder.delete(url);
        this.accessOrder.set(url, Date.now());

        this.stats.hits++;
        return entry.isValid;
    }

    /**
     * 設置緩存的驗證結果
     * @param {string} url - 要緩存的 URL
     * @param {boolean} isValid - 驗證結果
     */
    set(url, isValid) {
        // 如果已存在，先刪除舊條目
        if (this.cache.has(url)) {
            this.accessOrder.delete(url);
        }

        // 檢查緩存大小限制
        if (this.cache.size >= this.maxSize) {
            this.evictLRU();
        }

        // 添加新條目
        this.cache.set(url, {
            isValid,
            timestamp: Date.now()
        });
        this.accessOrder.set(url, Date.now());
    }

    /**
     * 移除最少使用的條目（LRU）
     */
    evictLRU() {
        const lruKey = this.accessOrder.keys().next().value;
        if (lruKey) {
            this.cache.delete(lruKey);
            this.accessOrder.delete(lruKey);
            this.stats.evictions++;
        }
    }

    /**
     * 清理過期的條目
     */
    cleanupExpired() {
        const now = Date.now();
        for (const [url, timestamp] of this.accessOrder) {
            if (now - timestamp > this.ttl) {
                this.cache.delete(url);
                this.accessOrder.delete(url);
                this.stats.evictions++;
            } else {
                // 因為 Map 是有序的，可以提前停止
                break;
            }
        }
    }

    /**
     * 獲取緩存統計信息
     */
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
        return {
            ...this.stats,
            hitRate: `${hitRate.toFixed(2)}%`,
            size: this.cache.size,
            maxSize: this.maxSize
        };
    }

    /**
     * 清空緩存
     */
    clear() {
        this.cache.clear();
        this.accessOrder.clear();
        this.stats = { hits: 0, misses: 0, evictions: 0 };
    }
}

// 全域緩存實例
const imageUrlValidationCache = new ImageUrlValidationCache();

// 預編譯正則表達式以提升性能
const HTTP_PROTOCOL_REGEX = /^https?:\/\//i;
const DATA_PROTOCOL_REGEX = /^data:image\/(?:png|jpg|jpeg|gif|webp|svg\+xml);base64,/i;
const BLOB_PROTOCOL_REGEX = /^blob:/i;

/**
 * 驗證圖片 URL 是否有效
 * @param {string} url - 要驗證的圖片 URL
 * @returns {boolean} 是否為有效的圖片 URL
 */
function isValidImageUrl(url) {
    // 輸入驗證
    if (!url || typeof url !== 'string') {
        Logger.log('❌ [ImageValidation] 無效輸入：URL 為空或不是字符串');
        return false;
    }

    // 修剪空白字符
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
        Logger.log('❌ [ImageValidation] URL 為空字符串');
        return false;
    }

    // 檢查緩存
    const cachedResult = imageUrlValidationCache.get(trimmedUrl);
    if (cachedResult !== null) {
        return cachedResult;
    }

    try {
        // 清理和標準化 URL
        const cleanedUrl = cleanImageUrl(trimmedUrl);
        if (!cleanedUrl) {
            Logger.log('❌ [ImageValidation] URL 清理失敗');
            imageUrlValidationCache.set(trimmedUrl, false);
            return false;
        }

        // 驗證協議
        if (!isValidProtocol(cleanedUrl)) {
            Logger.log('❌ [ImageValidation] 不支持的協議');
            imageUrlValidationCache.set(trimmedUrl, false);
            return false;
        }

        // 檢查 URL 長度限制
        if (cleanedUrl.length > IMAGE_VALIDATION_CONFIG.MAX_URL_LENGTH) {
            Logger.log('❌ [ImageValidation] URL 長度超過限制');
            imageUrlValidationCache.set(trimmedUrl, false);
            return false;
        }

        // 檢查是否為圖片
        const isValidImage = validateImageContent(cleanedUrl);

        // 緩存結果
        imageUrlValidationCache.set(trimmedUrl, isValidImage);

        return isValidImage;

    } catch (error) {
        Logger.error('❌ [ImageValidation] 驗證過程中發生錯誤:', error);
        imageUrlValidationCache.set(trimmedUrl, false);
        return false;
    }
}

/**
 * 驗證 URL 協議是否受支持
 * @param {string} url - 要檢查的 URL
 * @returns {boolean} 是否為受支持的協議
 */
function isValidProtocol(url) {
    try {
        // 檢查不同協議類型
        if (url.startsWith('data:')) {
            return DATA_PROTOCOL_REGEX.test(url);
        }

        if (url.startsWith('blob:')) {
            return BLOB_PROTOCOL_REGEX.test(url);
        }

        // 對於 HTTP/HTTPS URLs
        return HTTP_PROTOCOL_REGEX.test(url);
    } catch (error) {
        Logger.error('❌ [ProtocolValidation] 協議檢查失敗:', error);
        return false;
    }
}

/**
 * 驗證 URL 內容是否為圖片
 * @param {string} url - 要檢查的 URL
 * @returns {boolean} 是否為圖片內容
 */
function validateImageContent(url) {
    // 如果 URL 包含圖片擴展名，直接返回 true
    if (IMAGE_VALIDATION_CONFIG.IMAGE_EXTENSIONS.test(url)) {
        return true;
    }

    // 排除明顯不是圖片的 URL
    if (IMAGE_VALIDATION_CONFIG.EXCLUDE_PATTERNS.some(pattern => pattern.test(url))) {
        return false;
    }

    // 檢查路徑模式
    const matchesImagePattern = IMAGE_VALIDATION_CONFIG.IMAGE_PATH_PATTERNS.some(pattern => pattern.test(url));

    return matchesImagePattern;
}

// 定期清理過期條目（每5分鐘）
setInterval(() => {
    imageUrlValidationCache.cleanupExpired();
}, 5 * 60 * 1000);

// ==========================================
// TEXT UTILITIES
// ==========================================

/**
 * 將長文本分割成符合 Notion 限制的片段
 * Notion API 限制每個 rich_text 區塊最多 2000 字符
 */
function splitTextForHighlight(text, maxLength = 2000) {
    if (!text || text.length <= maxLength) {
        return [text];
    }

    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break;
        }

        // 嘗試在句號、問號、驚嘆號、換行符處分割
        let splitIndex = -1;
        const punctuation = ['\n\n', '\n', '。', '.', '？', '?', '！', '!'];

        for (const punct of punctuation) {
            const lastIndex = remaining.lastIndexOf(punct, maxLength);
            if (lastIndex > maxLength * 0.5) { // 至少分割到一半以上，避免片段太短
                splitIndex = lastIndex + punct.length;
                break;
            }
        }

        // 如果找不到合適的標點，嘗試在空格處分割
        if (splitIndex === -1) {
            splitIndex = remaining.lastIndexOf(' ', maxLength);
            if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
                // 實在找不到，強制在 maxLength 處分割
                splitIndex = maxLength;
            }
        }

        chunks.push(remaining.substring(0, splitIndex).trim());
        remaining = remaining.substring(splitIndex).trim();
    }

    return chunks.filter(chunk => chunk.length > 0); // 過濾空字符串
}

// ==========================================
// SCRIPT INJECTION MANAGER
// ==========================================

/**
 * 腳本注入管理器 - 統一管理所有腳本注入操作
 */
class ScriptInjector {
    /**
     * 注入文件並執行函數
     */
    static async injectAndExecute(tabId, files = [], func = null, options = {}) {
        const {
            errorMessage = 'Script injection failed',
            successMessage = 'Script executed successfully',
            logErrors = true,
            returnResult = false
        } = options;

        try {
            // 首先注入文件
            if (files.length > 0) {
                await new Promise((resolve, reject) => {
                    chrome.scripting.executeScript({
                        target: { tabId },
                        files: files
                    }, () => {
                        if (chrome.runtime.lastError) {
                            if (logErrors) {
                                console.error("File injection failed:", chrome.runtime.lastError);
                            }
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve();
                        }
                    });
                });
            }

            // 然後執行函數
            if (func) {
                return new Promise((resolve, reject) => {
                    chrome.scripting.executeScript({
                        target: { tabId },
                        func: func
                    }, (results) => {
                        if (chrome.runtime.lastError) {
                            if (logErrors) {
                                console.error("Function execution failed:", chrome.runtime.lastError);
                            }
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            if (successMessage && logErrors) {
                                Logger.log(successMessage);
                            }
                            const result = returnResult && results && results[0] ? results[0].result : null;
                            resolve(result);
                        }
                    });
                });
            }

            return Promise.resolve();
        } catch (error) {
            if (logErrors) {
                console.error(errorMessage, error);
            }
            throw error;
        }
    }

    /**
     * 注入標記工具並初始化
     * v2.5.0: 使用新版 CSS Highlight API + 無痛自動遷移
     */
    static async injectHighlighter(tabId) {
        return this.injectAndExecute(
            tabId,
            ['scripts/utils.js', 'scripts/seamless-migration.js', 'scripts/highlighter-v2.js'],
            () => {
                // highlighter-v2.js 現在會自動初始化
                // 這裡只需要顯示工具欄並激活標註模式
                if (window.initHighlighter) {
                    window.initHighlighter(); // 確保已初始化
                }

                // 顯示工具欄
                if (window.notionHighlighter) {
                    window.notionHighlighter.show();
                    Logger.log('✅ 工具欄已顯示');
                }
            },
            {
                errorMessage: 'Failed to inject highlighter',
                successMessage: 'Highlighter v2 injected and initialized successfully'
            }
        );
    }

    /**
     * 注入並收集標記
     * v2.5.0: 使用新版標註系統
     */
    static async collectHighlights(tabId) {
        return this.injectAndExecute(
            tabId,
            ['scripts/utils.js', 'scripts/seamless-migration.js', 'scripts/highlighter-v2.js'],
            () => {
                if (window.collectHighlights) {
                    return window.collectHighlights();
                }
                return [];
            },
            {
                errorMessage: 'Failed to collect highlights',
                returnResult: true
            }
        );
    }

    /**
     * 注入並清除頁面標記
     * v2.5.0: 使用新版標註系統
     */
    static async clearPageHighlights(tabId) {
        return this.injectAndExecute(
            tabId,
            ['scripts/utils.js', 'scripts/seamless-migration.js', 'scripts/highlighter-v2.js'],
            () => {
                if (window.clearPageHighlights) {
                    window.clearPageHighlights();
                }
            },
            {
                errorMessage: 'Failed to clear page highlights'
            }
        );
    }

    /**
     * 注入標記恢復腳本
     */
    static async injectHighlightRestore(tabId) {
        return this.injectAndExecute(
            tabId,
            ['scripts/utils.js', 'scripts/highlight-restore.js'],
            null,
            {
                errorMessage: 'Failed to inject highlight restore script',
                successMessage: 'Highlight restore script injected successfully'
            }
        );
    }

    /**
     * 注入腳本並執行函數，返回結果
     */
    static async injectWithResponse(tabId, func, files = []) {
        try {
            // 如果有文件需要注入，先注入文件
            if (files && files.length > 0) {
                await this.injectAndExecute(tabId, files, null, { logErrors: true });
            }

            // 執行函數並返回結果
            if (func) {
                return this.injectAndExecute(tabId, [], func, {
                    returnResult: true,
                    logErrors: true
                });
            } else if (files && files.length > 0) {
                // 如果只注入文件而不執行函數，等待注入完成後返回成功標記
                return Promise.resolve([{ result: { success: true } }]);
            }

            return Promise.resolve(null);
        } catch (error) {
            console.error('injectWithResponse failed:', error);
            // 返回 null，由調用方判斷並回覆錯誤，避免未捕獲拒絕
            return null;
        }
    }

    /**
     * 簡單的腳本注入（不返回結果）
     */
    static async inject(tabId, func, files = []) {
        try {
            return this.injectAndExecute(tabId, files, func, {
                returnResult: false,
                logErrors: true
            });
        } catch (error) {
            console.error('inject failed:', error);
            throw error;
        }
    }
}

// ==========================================
// NOTION API UTILITIES
// ==========================================

/**
 * 分批將區塊添加到 Notion 頁面
 * Notion API 限制每次最多 100 個區塊
 *
 * @param {string} pageId - Notion 頁面 ID
 * @param {Array} blocks - 要添加的區塊數組
 * @param {string} apiKey - Notion API Key
 * @param {number} startIndex - 開始索引（默認 0）
 * @returns {Promise<{success: boolean, addedCount: number, totalCount: number}>}
 */
async function appendBlocksInBatches(pageId, blocks, apiKey, startIndex = 0) {
    const BLOCKS_PER_BATCH = 100;
    const DELAY_BETWEEN_BATCHES = 350; // ms，遵守 Notion API 速率限制（3 req/s）

    let addedCount = 0;
    const totalBlocks = blocks.length - startIndex;

    if (totalBlocks <= 0) {
        return { success: true, addedCount: 0, totalCount: 0 };
    }

    Logger.log(`📦 準備分批添加區塊: 總共 ${totalBlocks} 個，從索引 ${startIndex} 開始`);

    try {
        // 分批處理剩餘區塊
        for (let i = startIndex; i < blocks.length; i += BLOCKS_PER_BATCH) {
            const batch = blocks.slice(i, i + BLOCKS_PER_BATCH);
            const batchNumber = Math.floor((i - startIndex) / BLOCKS_PER_BATCH) + 1;
            const totalBatches = Math.ceil(totalBlocks / BLOCKS_PER_BATCH);

            Logger.log(`📤 發送批次 ${batchNumber}/${totalBatches}: ${batch.length} 個區塊`);

            // 使用重試機制發送批次（處理 5xx/429/409/DatastoreInfraError）
            const response = await fetchNotionWithRetry(`https://api.notion.com/v1/blocks/${pageId}/children`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Notion-Version': '2025-09-03'
                },
                body: JSON.stringify({
                    children: batch
                })
            }, { maxRetries: 3, baseDelay: 800 });

            // 如果沒有重試機制，記錄批次失敗
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ 批次 ${batchNumber} 失敗:`, errorText);
                throw new Error(`批次添加失敗: ${response.status} - ${errorText}`);
            }

            addedCount += batch.length;
            Logger.log(`✅ 批次 ${batchNumber} 成功: 已添加 ${addedCount}/${totalBlocks} 個區塊`);

            // 如果還有更多批次，添加延遲以遵守速率限制
            if (i + BLOCKS_PER_BATCH < blocks.length) {
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
            }
        }

        Logger.log(`🎉 所有區塊添加完成: ${addedCount}/${totalBlocks}`);
        return { success: true, addedCount, totalCount: totalBlocks };

    } catch (error) {
        console.error("❌ 分批添加區塊失敗:", error);
        return { success: false, addedCount, totalCount: totalBlocks, error: error.message };
    }
}

// ==========================================
// URL UTILITIES MODULE
// ==========================================

/**
 * Normalizes URLs for consistent keys and deduplication
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
    } catch {
        return rawUrl || '';
    }
}

// ==========================================
// STORAGE MANAGER MODULE
// ==========================================

/**
 * Clears the local state for a specific page
 */
function clearPageState(pageUrl) {
    const savedKey = `saved_${pageUrl}`;
    const highlightsKey = `highlights_${pageUrl}`;

    // v2.7.1: 同時刪除保存狀態和標註數據
    chrome.storage.local.remove([savedKey, highlightsKey], () => {
        Logger.log('✅ Cleared all data for:', pageUrl);
        Logger.log('  - Saved state:', savedKey);
        Logger.log('  - Highlights:', highlightsKey);
    });
}

/**
 * Gets the saved page data from local storage
 */
function getSavedPageData(pageUrl, callback) {
    chrome.storage.local.get([`saved_${pageUrl}`], (result) => {
        callback(result[`saved_${pageUrl}`] || null);
    });
}

/**
 * Sets the saved page data in local storage
 */
function setSavedPageData(pageUrl, data, callback) {
    const storageData = {
        [`saved_${pageUrl}`]: {
            ...data,
            lastUpdated: Date.now()
        }
    };
    chrome.storage.local.set(storageData, callback);
}

/**
 * Gets configuration from sync storage
 */
function getConfig(keys, callback) {
    chrome.storage.sync.get(keys, callback);
}

/**
 * 帶重試的 Notion API 請求（處理暫時性錯誤，如 DatastoreInfraError/5xx/429/409）
 */
async function fetchNotionWithRetry(url, options, retryOptions = {}) {
    const {
        maxRetries = 2,
        baseDelay = 600,
    } = retryOptions;

    let attempt = 0;
    let lastError = null;
    while (attempt <= maxRetries) {
        try {
            const res = await fetch(url, options);

            if (res.ok) return res;

            // 嘗試解析錯誤訊息
            let message = '';
            try {
                const data = await res.clone().json();
                message = data?.message || '';
            } catch { /* ignore parse errors */ }

            const retriableStatus = res.status >= 500 || res.status === 429 || res.status === 409;
            const retriableMessage = /Unsaved transactions|DatastoreInfraError/i.test(message);

            if (attempt < maxRetries && (retriableStatus || retriableMessage)) {
                const delay = baseDelay * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
                await new Promise(r => setTimeout(r, delay));
                attempt++;
                continue;
            }

            // 非可重試錯誤或已達最大重試次數
            return res;
        } catch (err) {
            lastError = err;
            if (attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
                await new Promise(r => setTimeout(r, delay));
                attempt++;
                continue;
            }
            throw err;
        }
    }

    // 理論上不會到達這裡
    if (lastError) throw lastError;
    throw new Error('fetchNotionWithRetry failed unexpectedly');
}

// ==========================================
// NOTION API MODULE
// ==========================================

/**
 * Checks if a Notion page exists
 */
// 返回值：
//   true  => 確認存在
//   false => 確認不存在（404）
//   null  => 不確定（網路/服務端暫時性錯誤）
async function checkNotionPageExists(pageId, apiKey) {
    try {
        const response = await fetchNotionWithRetry(`https://api.notion.com/v1/pages/${pageId}` , {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Notion-Version': '2025-09-03'
            }
        }, { maxRetries: 2, baseDelay: 500 });

        if (response.ok) {
            const pageData = await response.json();
            return !pageData.archived;
        }

        if (response.status === 404) {
            return false; // 確認不存在
        }

        // 其他情況（5xx/429/409 等）返回不確定，避免誤判為刪除
        return null;
    } catch (error) {
        /*
         * 頁面存在性檢查錯誤：記錄但不中斷流程
         * 返回 false 作為安全的默認值
         */
        if (typeof ErrorHandler !== 'undefined') {
            ErrorHandler.logError({
                type: 'network_error',
                context: `checking page existence: ${pageId}`,
                originalError: error,
                timestamp: Date.now()
            });
        } else {
            console.error('Error checking page existence:', error);
        }
        return null;
    }
}

/**
 * v2.7.1: 處理檢查 Notion 頁面是否存在的消息請求（用於數據清理）
 */
async function handleCheckNotionPageExistsMessage(request, sendResponse) {
    try {
        const { pageId } = request;

        if (!pageId) {
            sendResponse({ success: false, error: 'Page ID is required' });
            return;
        }

        const config = await new Promise(resolve => getConfig(['notionApiKey'], resolve));

        if (!config.notionApiKey) {
            sendResponse({ success: false, error: 'Notion API Key not configured' });
            return;
        }

        const exists = await checkNotionPageExists(pageId, config.notionApiKey);
        sendResponse({ success: true, exists: exists });

    } catch (error) {
        console.error('handleCheckNotionPageExistsMessage error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Saves new content to Notion as a new page
 * @param {boolean} excludeImages - 是否排除所有圖片（用於重試）
 */
async function saveToNotion(title, blocks, pageUrl, apiKey, dataSourceId, sendResponse, siteIcon = null, excludeImages = false) {
    // 開始性能監控 (service worker 環境，使用原生 Performance API)
    const startTime = performance.now();
    Logger.log('⏱️ 開始保存到 Notion...');

    const notionApiUrl = 'https://api.notion.com/v1/pages';

    // 如果需要排除圖片（重試模式），過濾掉所有圖片
    let validBlocks = [];
    if (excludeImages) {
        Logger.log('🚫 Retry mode: Excluding ALL images');
        validBlocks = blocks.filter(block => block.type !== 'image');
    } else {
        // 過濾掉可能導致 Notion API 錯誤的圖片區塊
        validBlocks = blocks.filter(block => {
            if (block.type === 'image') {
                const imageUrl = block.image?.external?.url;
                if (!imageUrl) {
                    console.warn('⚠️ Skipped image block without URL');
                    return false;
                }

                // 檢查 URL 長度
                if (imageUrl.length > 1500) {
                    console.warn(`⚠️ Skipped image with too long URL (${imageUrl.length} chars): ${imageUrl.substring(0, 100)}...`);
                    return false;
                }

                // 檢查特殊字符
                const problematicChars = /[<>{}|\\^`\[\]]/;
                if (problematicChars.test(imageUrl)) {
                    console.warn(`⚠️ Skipped image with problematic characters: ${imageUrl.substring(0, 100)}...`);
                    return false;
                }

                // 驗證 URL 格式
                try {
                    const urlObj = new URL(imageUrl);

                    // 只接受 http/https
                    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
                        console.warn(`⚠️ Skipped image with invalid protocol: ${urlObj.protocol}`);
                        return false;
                    }

                    // 檢查 URL 是否可以正常訪問（基本格式檢查）
                    if (!urlObj.hostname || urlObj.hostname.length < 3) {
                        console.warn(`⚠️ Skipped image with invalid hostname: ${urlObj.hostname}`);
                        return false;
                    }
                } catch (error) {
                    console.warn(`⚠️ Skipped image with invalid URL format: ${imageUrl.substring(0, 100)}...`, error);
                    return false;
                }

                Logger.log(`✓ Valid image URL: ${imageUrl.substring(0, 80)}...`);
            }
            return true;
        });
    }

    const skippedCount = blocks.length - validBlocks.length;
    if (skippedCount > 0) {
        Logger.log(`📊 Filtered ${skippedCount} potentially problematic image blocks from ${blocks.length} total blocks`);
    }

    Logger.log(`📊 Total blocks to save: ${validBlocks.length}, Image blocks: ${validBlocks.filter(b => b.type === 'image').length}`);

    const pageData = {
        parent: {
            type: 'data_source_id',
            data_source_id: dataSourceId
        },
        properties: {
            'Title': {
                title: [{ text: { content: title } }]
            },
            'URL': {
                url: pageUrl
            }
        },
        children: validBlocks.slice(0, 100)
    };

    // v2.6.0: 添加網站 Icon（如果有）
    if (siteIcon) {
        pageData.icon = {
            type: 'external',
            external: {
                url: siteIcon
            }
        };
        Logger.log('✓ Setting page icon:', siteIcon);
    }

    try {
        Logger.log(`🚀 Sending ${validBlocks.slice(0, 100).length} blocks to Notion API...`);

        // 記錄所有圖片區塊的 URL（用於調試）
        const imageBlocksInPayload = validBlocks.slice(0, 100).filter(b => b.type === 'image');
        if (imageBlocksInPayload.length > 0) {
            Logger.log(`📸 Image blocks in payload: ${imageBlocksInPayload.length}`);
            imageBlocksInPayload.forEach((img, idx) => {
                const url = img.image?.external?.url;
                Logger.log(`  ${idx + 1}. ${url?.substring(0, 100)}... (length: ${url?.length})`);
            });
        }

        const response = await fetchNotionWithRetry(notionApiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2025-09-03'
            },
            body: JSON.stringify(pageData)
        }, { maxRetries: 2, baseDelay: 600 });

        if (response.ok) {
            const responseData = await response.json();
            Logger.log('📄 Notion API 創建頁面響應:', responseData);
            Logger.log('🔗 響應中的 URL:', responseData.url);
            const notionPageId = responseData.id;

            // 如果區塊數量超過 100，分批添加剩餘區塊
            if (validBlocks.length > 100) {
                Logger.log(`📚 檢測到超長文章: ${validBlocks.length} 個區塊，需要分批添加`);
                const appendResult = await appendBlocksInBatches(notionPageId, validBlocks, apiKey, 100);

                if (!appendResult.success) {
                    console.warn(`⚠️ 部分區塊添加失敗: ${appendResult.addedCount}/${appendResult.totalCount}`, appendResult.error);
                    // 即使部分失敗，頁面已創建，仍然保存記錄
                }
            }

            // 構建 Notion 頁面 URL（如果 API 響應中沒有提供）
            let notionUrl = responseData.url;
            if (!notionUrl && notionPageId) {
                // 手動構建 Notion URL
                notionUrl = `https://www.notion.so/${notionPageId.replace(/-/g, '')}`;
                Logger.log('🔗 手動構建 Notion URL:', notionUrl);
            }

            setSavedPageData(pageUrl, {
                title: title,
                savedAt: Date.now(),
                notionPageId: notionPageId,
                notionUrl: notionUrl
            }, () => {
                // 結束性能監控 (service worker 環境)
                const duration = performance.now() - startTime;
                Logger.log(`⏱️ 保存到 Notion 完成: ${duration.toFixed(2)}ms`);

                // 如果有過濾掉的圖片，在成功訊息中提醒用戶
                if (skippedCount > 0 || excludeImages) {
                    const totalSkipped = excludeImages ? 'All images' : `${skippedCount} image(s)`;
                    sendResponse({
                        success: true,
                        notionPageId: notionPageId,
                        warning: `${totalSkipped} were skipped due to compatibility issues`
                    });
                } else {
                    sendResponse({ success: true, notionPageId: notionPageId });
                }
            });
        } else {
            const errorData = await response.json();
            console.error('Notion API Error:', errorData);
            console.error('Complete error details:', JSON.stringify(errorData, null, 2));

            // 記錄發送到 Notion 的資料，以便調試
            console.error('Blocks sent to Notion (first 5):', validBlocks.slice(0, 5).map(b => {
                if (b.type === 'image') {
                    return {
                        type: b.type,
                        imageUrl: b.image?.external?.url,
                        urlLength: b.image?.external?.url?.length
                    };
                }
                return { type: b.type };
            }));

            // 檢查是否仍有圖片驗證錯誤
            if (errorData.code === 'validation_error' && errorData.message && errorData.message.includes('image')) {
                // 嘗試找出哪個圖片導致問題
                const imageBlocks = validBlocks.filter(b => b.type === 'image');
                console.error(`❌ Still have image validation errors. Total image blocks: ${imageBlocks.length}`);
                console.error('All image URLs:', imageBlocks.map(b => b.image?.external?.url));

                // 自動重試：排除所有圖片
                Logger.log('🔄 Auto-retry: Saving without ANY images...');

                // 使用 setTimeout 避免立即重試
                setTimeout(() => {
                    saveToNotion(title, blocks, pageUrl, apiKey, dataSourceId, sendResponse, siteIcon, true);
                }, 500);
                return;
            }

            // 提供更友好的錯誤信息
            let errorMessage = errorData.message || 'Failed to save to Notion.';
            sendResponse({ success: false, error: errorMessage });
        }
    } catch (error) {
        console.error('Fetch Error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Updates an entire Notion page with new content
 */
async function updateNotionPage(pageId, title, blocks, pageUrl, apiKey, sendResponse) {
    try {
        // 過濾掉可能導致 Notion API 錯誤的圖片區塊（與 saveToNotion 一致）
        const validBlocks = blocks.filter(block => {
            if (block.type === 'image') {
                const imageUrl = block.image?.external?.url;
                if (!imageUrl) {
                    console.warn('⚠️ Skipped image block without URL');
                    return false;
                }

                // 檢查 URL 長度
                if (imageUrl.length > 1500) {
                    console.warn(`⚠️ Skipped image with too long URL (${imageUrl.length} chars): ${imageUrl.substring(0, 100)}...`);
                    return false;
                }

                // 檢查特殊字符
                const problematicChars = /[<>{}|\\^`\[\]]/;
                if (problematicChars.test(imageUrl)) {
                    console.warn(`⚠️ Skipped image with problematic characters: ${imageUrl.substring(0, 100)}...`);
                    return false;
                }

                // 驗證 URL 格式
                try {
                    const urlObj = new URL(imageUrl);

                    // 只接受 http/https
                    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
                        console.warn(`⚠️ Skipped image with invalid protocol: ${urlObj.protocol}`);
                        return false;
                    }

                    // 檢查 URL 是否可以正常訪問（基本格式檢查）
                    if (!urlObj.hostname || urlObj.hostname.length < 3) {
                        console.warn(`⚠️ Skipped image with invalid hostname: ${urlObj.hostname}`);
                        return false;
                    }
                } catch (error) {
                    console.warn(`⚠️ Skipped image with invalid URL format: ${imageUrl.substring(0, 100)}...`, error);
                    return false;
                }

                Logger.log(`✓ Valid image URL: ${imageUrl.substring(0, 80)}...`);
            }
            return true;
        });

        const skippedCount = blocks.length - validBlocks.length;
        if (skippedCount > 0) {
            Logger.log(`📊 Filtered ${skippedCount} potentially problematic image blocks from ${blocks.length} total blocks`);
        }

        const getResponse = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Notion-Version': '2025-09-03'
            }
        });

        if (getResponse.ok) {
            const existingContent = await getResponse.json();
            for (const block of existingContent.results) {
                await fetch(`https://api.notion.com/v1/blocks/${block.id}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Notion-Version': '2025-09-03'
                    }
                });
            }
        }

        const updateResponse = await fetchNotionWithRetry(`https://api.notion.com/v1/blocks/${pageId}/children`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2025-09-03'
            },
            body: JSON.stringify({
                children: validBlocks.slice(0, 100)
            })
        }, { maxRetries: 0, baseDelay: 0 });

        if (updateResponse.ok) {
            // 如果區塊數量超過 100，分批添加剩餘區塊
            if (validBlocks.length > 100) {
                Logger.log(`📚 檢測到超長文章: ${validBlocks.length} 個區塊，需要分批添加`);
                const appendResult = await appendBlocksInBatches(pageId, validBlocks, apiKey, 100);

                if (!appendResult.success) {
                    console.warn(`⚠️ 部分區塊添加失敗: ${appendResult.addedCount}/${appendResult.totalCount}`, appendResult.error);
                    // 即使部分失敗，頁面已更新，仍然繼續
                }
            }

            const titleUpdatePromise = fetchNotionWithRetry(`https://api.notion.com/v1/pages/${pageId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Notion-Version': '2025-09-03'
                },
                body: JSON.stringify({
                    properties: {
                        'Title': {
                            title: [{ text: { content: title } }]
                        }
                    }
                })
            }, { maxRetries: 2, baseDelay: 600 });

            const storageUpdatePromise = new Promise((resolve) => {
                setSavedPageData(pageUrl, {
                    title: title,
                    savedAt: Date.now(),
                    notionPageId: pageId,
                    lastUpdated: Date.now()
                }, resolve);
            });

            await Promise.all([titleUpdatePromise, storageUpdatePromise]);

            // 如果有過濾掉的圖片，在回應中提醒用戶
            if (skippedCount > 0) {
                sendResponse({
                    success: true,
                    warning: `${skippedCount} image(s) were skipped due to compatibility issues`
                });
            } else {
                sendResponse({ success: true });
            }
        } else {
            const errorData = await updateResponse.json();
            console.error('Notion Update Error:', errorData);

            // 提供更友好的錯誤信息
            let errorMessage = errorData.message || 'Failed to update Notion page.';
            if (errorData.code === 'validation_error' && errorMessage.includes('image')) {
                errorMessage = 'Update Failed. Some images may have invalid URLs. Try updating again - problematic images will be filtered out.';
            }

            sendResponse({ success: false, error: errorMessage });
        }
    } catch (error) {
        console.error('Update Error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Updates only highlights on an existing page
 */
async function updateHighlightsOnly(pageId, highlights, pageUrl, apiKey, sendResponse) {
    try {
        Logger.log('🔄 開始更新標記 - 頁面ID:', pageId, '標記數量:', highlights.length);

        const getResponse = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Notion-Version': '2025-09-03'
            }
        });

        if (!getResponse.ok) {
            const errorData = await getResponse.json();
            console.error('❌ 獲取頁面內容失敗:', errorData);
            throw new Error('Failed to get existing page content: ' + (errorData.message || getResponse.statusText));
        }

        const existingContent = await getResponse.json();
        const existingBlocks = existingContent.results;
        Logger.log('📋 現有區塊數量:', existingBlocks.length);

        const blocksToDelete = [];
        let foundHighlightSection = false;

        for (let i = 0; i < existingBlocks.length; i++) {
            const block = existingBlocks[i];

            if (block.type === 'heading_3' &&
                block.heading_3?.rich_text?.[0]?.text?.content === '📝 頁面標記') {
                foundHighlightSection = true;
                blocksToDelete.push(block.id);
                Logger.log(`🎯 找到標記區域標題 (索引 ${i}):`, block.id);
            } else if (foundHighlightSection) {
                if (block.type.startsWith('heading_')) {
                    Logger.log(`🛑 遇到下一個標題，停止收集標記區塊 (索引 ${i})`);
                    break;
                }
                if (block.type === 'paragraph') {
                    blocksToDelete.push(block.id);
                    Logger.log(`📝 標記為刪除的段落 (索引 ${i}):`, block.id);
                }
            }
        }

        Logger.log('🗑️ 需要刪除的區塊數量:', blocksToDelete.length);

        let deletedCount = 0;
        for (const blockId of blocksToDelete) {
            try {
                Logger.log(`🗑️ 正在刪除區塊: ${blockId}`);
                const deleteResponse = await fetch(`https://api.notion.com/v1/blocks/${blockId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Notion-Version': '2025-09-03'
                    }
                });

                if (deleteResponse.ok) {
                    deletedCount++;
                    Logger.log(`✅ 成功刪除區塊: ${blockId}`);
                } else {
                    const errorData = await deleteResponse.json();
                    console.error(`❌ 刪除區塊失敗 ${blockId}:`, errorData);
                }
            } catch (deleteError) {
                console.error(`❌ 刪除區塊異常 ${blockId}:`, deleteError);
            }
        }

        Logger.log(`🗑️ 實際刪除了 ${deletedCount}/${blocksToDelete.length} 個區塊`);

        if (highlights.length > 0) {
            Logger.log('➕ 準備添加新的標記區域...');

            const highlightBlocks = [{
                object: 'block',
                type: 'heading_3',
                heading_3: {
                    rich_text: [{
                        type: 'text',
                        text: { content: '📝 頁面標記' }
                    }]
                }
            }];

            highlights.forEach((highlight, index) => {
                Logger.log(`📝 準備添加標記 ${index + 1}: "${highlight.text.substring(0, 30)}..." (顏色: ${highlight.color})`);

                // 處理超長標記文本，需要分割成多個段落
                const textChunks = splitTextForHighlight(highlight.text, 2000);

                textChunks.forEach((chunk, chunkIndex) => {
                    highlightBlocks.push({
                        object: 'block',
                        type: 'paragraph',
                        paragraph: {
                            rich_text: [{
                                type: 'text',
                                text: { content: chunk },
                                annotations: {
                                    color: highlight.color
                                }
                            }]
                        }
                    });

                    // 如果是分割的標記，在日誌中標註
                    if (textChunks.length > 1) {
                        Logger.log(`   └─ 分割片段 ${chunkIndex + 1}/${textChunks.length}: ${chunk.length} 字符`);
                    }
                });
            });

            Logger.log('➕ 準備添加的區塊數量:', highlightBlocks.length);

            const addResponse = await fetchNotionWithRetry(`https://api.notion.com/v1/blocks/${pageId}/children`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Notion-Version': '2025-09-03'
                },
                body: JSON.stringify({
                    children: highlightBlocks
                })
            }, { maxRetries: 2, baseDelay: 600 });

            Logger.log('📡 API 響應狀態:', addResponse.status, addResponse.statusText);

            if (!addResponse.ok) {
                const errorData = await addResponse.json();
                console.error('❌ 添加標記失敗 - 錯誤詳情:', errorData);
                throw new Error('Failed to add new highlights: ' + (errorData.message || 'Unknown error'));
            }

            const addResult = await addResponse.json();
            Logger.log('✅ 成功添加新標記 - 響應:', addResult);
            Logger.log('✅ 添加的區塊數量:', addResult.results?.length || 0);
        } else {
            Logger.log('ℹ️ 沒有新標記需要添加');
        }

        Logger.log('💾 更新本地保存記錄...');
        setSavedPageData(pageUrl, {
            savedAt: Date.now(),
            notionPageId: pageId,
            lastUpdated: Date.now()
        }, () => {
            Logger.log('🎉 標記更新完成！');
            sendResponse({ success: true });
        });
    } catch (error) {
        console.error('💥 標記更新錯誤:', error);
        console.error('💥 錯誤堆棧:', error.stack);
        sendResponse({ success: false, error: error.message });
    }
}

// ==========================================
// TAB MANAGER MODULE
// ==========================================

/**
 * Sets up tab event listeners for dynamic injection
 */
/**
 * 設置標籤事件監聽器，用於動態注入標記恢復腳本
 */
function setupTabListeners() {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status !== 'complete' || !tab || !tab.url) {
            return;
        }

        // 僅處理 http/https 頁面，排除 chrome-extension:// 等內部頁面
        if (!/^https?:/i.test(tab.url)) {
            if (typeof Logger !== 'undefined' && Logger.debug) {
                Logger.debug('Skipping tab listener for non-http(s) URL:', tab.url);
            }
            return;
        }

        const normUrl = normalizeUrl(tab.url);
        const key = `highlights_${normUrl}`;

        // 添加延遲，確保頁面完全載入
        setTimeout(async () => {
            try {
                const data = await new Promise(resolve => chrome.storage.local.get([key], resolve));
                const highlights = data[key];

                // 僅在儲存中有有效標註時注入高亮腳本
                if (Array.isArray(highlights) && highlights.length > 0) {
                    if (typeof Logger !== 'undefined' && Logger.debug) {
                        Logger.debug(`Found ${highlights.length} highlights for ${normUrl}, ensuring highlighter is initialized`);
                    }
                    await ScriptInjector.injectHighlighter(tabId);
                    return;
                }

                // 沒有找到現有標註，若曾有遷移資料則恢復一次後清理
                await migrateLegacyHighlights(tabId, normUrl, key);
            } catch (error) {
                console.error('Error in tab listener:', error);
            }
        }, 1000); // 延遲 1 秒確保頁面穩定
    });
}

/**
 * 遷移舊版本 localStorage 中的標記到 chrome.storage
 */
/**
 * 遷移舊版 localStorage 中的標記到 chrome.storage.local
 */
async function migrateLegacyHighlights(tabId, normUrl, storageKey) {
    if (!normUrl || !storageKey) {
        console.warn('Skipping legacy migration: missing normalized URL or storage key');
        return;
    }

    if (!/^https?:/i.test(normUrl)) {
        console.warn('Skipping legacy migration for non-http URL:', normUrl);
        return;
    }

    try {
        const result = await ScriptInjector.injectWithResponse(tabId, () => {
            try {
                const normalize = (raw) => {
                    try {
                        const u = new URL(raw);
                        u.hash = '';
                        const params = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','mc_cid','mc_eid','igshid','vero_id'];
                        params.forEach((p) => u.searchParams.delete(p));
                        if (u.pathname !== '/' && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '');
                        return u.toString();
                    } catch { return raw || ''; }
                };

                const norm = normalize(window.location.href);
                const k1 = `highlights_${norm}`;
                const k2 = `highlights_${window.location.href}`;
                let key = null;
                let raw = null;

                // 嘗試找到對應的舊版標記數據
                raw = localStorage.getItem(k1);
                if (raw) key = k1;
                else {
                    raw = localStorage.getItem(k2);
                    if (raw) key = k2;
                }

                // 如果還是找不到，遍歷所有以 highlights_ 開頭的鍵
                if (!raw) {
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k?.startsWith('highlights_')) {
                            key = k;
                            raw = localStorage.getItem(k);
                            break;
                        }
                    }
                }

                if (raw) {
                    try {
                        const data = JSON.parse(raw);
                        if (Array.isArray(data) && data.length > 0) {
                            localStorage.removeItem(key);
                            return { migrated: true, data, foundKey: key };
                        }
                    } catch (e) {
                        console.error('Failed to parse legacy highlight data:', e);
                    }
                }
            } catch (e) {
                console.error('Error during migration:', e);
            }
            return { migrated: false };
        });

        const res = result?.[0] ? result[0].result : null;
        if (res?.migrated && Array.isArray(res.data) && res.data.length > 0) {
            Logger.log(`Migrating ${res.data.length} highlights from localStorage key: ${res.foundKey}`);

            await new Promise(resolve => {
                chrome.storage.local.set({ [storageKey]: res.data }, resolve);
            });

            Logger.log('Legacy highlights migrated successfully, injecting restore script');
            await ScriptInjector.injectHighlightRestore(tabId);
        }
    } catch (error) {
        console.error('Error handling migration results:', error);
    }
}

// ==========================================
// MESSAGE HANDLERS MODULE
// ==========================================

/**
 * Sets up the message listener for runtime messages
 */
function setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        handleMessage(request, sender, sendResponse);
        return true; // Indicates asynchronous response
    });
}

/**
 * Main message handler that routes to specific handlers
 */
function handleMessage(request, sender, sendResponse) {
    try {
        // removed unused IS_TEST_ENV (legacy test guard)
        switch (request.action) {
            case 'devLogSink': {
                try {
                    const level = request.level || 'log';
                    const message = request.message || '';
                    const args = Array.isArray(request.args) ? request.args : [];
                    const prefix = '[ClientLog]';
                    if (level === 'warn') {
                        Logger.warn(prefix, message, ...args);
                    } else if (level === 'error') {
                        Logger.error(prefix, message, ...args);
                    } else if (level === 'info') {
                        Logger.info(`${prefix} ${message}`, ...args);
                    } else {
                        Logger.log(`${prefix} ${message}`, ...args);
                    }
                    sendResponse({ success: true });
                } catch (e) {
                    sendResponse({ success: false, error: e.message });
                }
                break;
            }
            case 'checkPageStatus':
                handleCheckPageStatus(sendResponse);
                break;
            case 'checkNotionPageExists':
                handleCheckNotionPageExistsMessage(request, sendResponse);
                break;
            case 'startHighlight':
                handleStartHighlight(sendResponse);
                break;
            case 'updateHighlights':
                handleUpdateHighlights(sendResponse);
                break;
            case 'syncHighlights':
                handleSyncHighlights(request, sendResponse);
                break;
            case 'savePage':
                // 防禦性處理：確保即使內部未捕獲的拒絕也會回覆
                Promise.resolve(handleSavePage(sendResponse)).catch(err => {
                    try { sendResponse({ success: false, error: err?.message || 'Save failed' }); } catch { /* 忽略 sendResponse 錯誤 */ }
                });
                break;
            case 'openNotionPage':
                handleOpenNotionPage(request, sendResponse);
                break;

            default:
                sendResponse({ success: false, error: 'Unknown action' });
        }
    } catch (error) {
        console.error('Message handler error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handles checkPageStatus action
 */
/**
 * 處理檢查頁面狀態的請求
 */
async function handleCheckPageStatus(sendResponse) {
    try {
        const tabs = await new Promise(resolve =>
            chrome.tabs.query({ active: true, currentWindow: true }, resolve)
        );

        const activeTab = tabs[0];
        if (!activeTab || !activeTab.id) {
            sendResponse({ success: false, error: 'Could not get active tab.' });
            return;
        }

        const normUrl = normalizeUrl(activeTab.url || '');
        const savedData = await new Promise(resolve => getSavedPageData(normUrl, resolve));

        if (savedData?.notionPageId) {
            const config = await new Promise(resolve => getConfig(['notionApiKey'], resolve));

            if (config.notionApiKey) {
                try {
                    const existence = await checkNotionPageExists(savedData.notionPageId, config.notionApiKey);

                    if (existence === false) {
                        Logger.log('Notion page was deleted, clearing local state');
                        clearPageState(normUrl);

                        await ScriptInjector.injectHighlighter(activeTab.id);
                        await ScriptInjector.inject(activeTab.id, () => {
                            if (window.clearPageHighlights) {
                                window.clearPageHighlights();
                            }
                        });

                        // 清除徽章
                        chrome.action.setBadgeText({ text: '', tabId: activeTab.id });

                        sendResponse({
                            success: true,
                            isSaved: false,
                            url: normUrl,
                            title: activeTab.title,
                            wasDeleted: true
                        });
                    } else {
                        // existence 為 true 或 null（不確定）均視為已保存，不清除狀態
                        if (existence === null) {
                            console.warn('⚠️ Notion page existence uncertain due to transient error; preserving local saved state');
                        }
                        // 設置綠色徽章表示已保存
                        chrome.action.setBadgeText({ text: '✓', tabId: activeTab.id });
                        chrome.action.setBadgeBackgroundColor({ color: '#48bb78', tabId: activeTab.id });

                        // 為舊版本數據生成 notionUrl（如果沒有的話）
                        let notionUrl = savedData.notionUrl;
                        if (!notionUrl && savedData.notionPageId) {
                            notionUrl = `https://www.notion.so/${savedData.notionPageId.replace(/-/g, '')}`;
                            Logger.log('🔗 為舊版本數據生成 Notion URL:', notionUrl);
                        }

                        sendResponse({
                            success: true,
                            isSaved: true,
                            url: normUrl,
                            title: activeTab.title,
                            notionUrl: notionUrl || null
                        });
                    }
                } catch (error) {
                    console.error('Error checking page status:', error);
                    // 即使檢查出錯，仍然返回 notionUrl
                    chrome.action.setBadgeText({ text: '✓', tabId: activeTab.id });
                    chrome.action.setBadgeBackgroundColor({ color: '#48bb78', tabId: activeTab.id });

                    // 為舊版本數據生成 notionUrl（如果沒有的話）
                    let notionUrl = savedData.notionUrl;
                    if (!notionUrl && savedData.notionPageId) {
                        notionUrl = `https://www.notion.so/${savedData.notionPageId.replace(/-/g, '')}`;
                        Logger.log('🔗 為舊版本數據生成 Notion URL (錯誤處理):', notionUrl);
                    }

                    sendResponse({
                        success: true,
                        isSaved: true,
                        url: normUrl,
                        title: activeTab.title,
                        notionUrl: notionUrl || null
                    });
                }
            } else {
                // 設置徽章
                if (savedData) {
                    chrome.action.setBadgeText({ text: '✓', tabId: activeTab.id });
                    chrome.action.setBadgeBackgroundColor({ color: '#48bb78', tabId: activeTab.id });
                } else {
                    chrome.action.setBadgeText({ text: '', tabId: activeTab.id });
                }

                // 為舊版本數據生成 notionUrl（如果沒有的話）
                let notionUrl = savedData?.notionUrl;
                if (!notionUrl && savedData?.notionPageId) {
                    notionUrl = `https://www.notion.so/${savedData.notionPageId.replace(/-/g, '')}`;
                    Logger.log('🔗 為舊版本數據生成 Notion URL (無 API Key):', notionUrl);
                }

                sendResponse({
                    success: true,
                    isSaved: Boolean(savedData),
                    url: normUrl,
                    title: activeTab.title,
                    notionUrl: notionUrl || null
                });
            }
        } else {
            // 清除徽章
            chrome.action.setBadgeText({ text: '', tabId: activeTab.id });

            sendResponse({
                success: true,
                isSaved: false,
                url: normUrl,
                title: activeTab.title
            });
        }
    } catch (error) {
        console.error('Error in handleCheckPageStatus:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handles startHighlight action
 */
async function handleStartHighlight(sendResponse) {
    try {
        const tabs = await new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
        const activeTab = tabs[0];

        if (!activeTab || !activeTab.id) {
            sendResponse({ success: false, error: 'Could not get active tab.' });
            return;
        }

        await ScriptInjector.injectHighlighter(activeTab.id);
        sendResponse({ success: true });
    } catch (error) {
        console.error('Error in handleStartHighlight:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * Handles updateHighlights action
 */
async function handleUpdateHighlights(sendResponse) {
    try {
        const tabs = await new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve));
        const activeTab = tabs[0];

        if (!activeTab || !activeTab.id) {
            sendResponse({ success: false, error: 'Could not get active tab.' });
            return;
        }

        const config = await new Promise(resolve => getConfig(['notionApiKey'], resolve));
        if (!config.notionApiKey) {
            sendResponse({ success: false, error: 'API Key is not set.' });
            return;
        }

        const normUrl = normalizeUrl(activeTab.url || '');
        const savedData = await new Promise(resolve => getSavedPageData(normUrl, resolve));

        if (!savedData || !savedData.notionPageId) {
            sendResponse({ success: false, error: 'Page not saved yet. Please save the page first.' });
            return;
        }

        const highlights = await ScriptInjector.collectHighlights(activeTab.id);

        updateHighlightsOnly(savedData.notionPageId, highlights, normUrl, config.notionApiKey, (response) => {
            if (response.success) {
                response.highlightsUpdated = true;
                response.highlightCount = highlights.length;
            }
            sendResponse(response);
        });
    } catch (error) {
        console.error('Error in handleUpdateHighlights:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * 處理從工具欄同步標註到 Notion 的請求
 */
async function handleSyncHighlights(request, sendResponse) {
    try {
        Logger.log('🔄 處理同步標註請求');

        const tabs = await new Promise(resolve =>
            chrome.tabs.query({ active: true, currentWindow: true }, resolve)
        );

        const activeTab = tabs[0];
        if (!activeTab || !activeTab.id) {
            sendResponse({ success: false, error: '無法獲取當前標籤頁' });
            return;
        }

        const config = await new Promise(resolve =>
            getConfig(['notionApiKey'], resolve)
        );

        if (!config.notionApiKey) {
            sendResponse({ success: false, error: 'API Key 未設置' });
            return;
        }

        const normUrl = normalizeUrl(activeTab.url || '');
        const savedData = await new Promise(resolve => getSavedPageData(normUrl, resolve));

        if (!savedData || !savedData.notionPageId) {
            sendResponse({
                success: false,
                error: '頁面尚未保存到 Notion，請先點擊「保存頁面」'
            });
            return;
        }

        const highlights = request.highlights || [];
        Logger.log(`📊 準備同步 ${highlights.length} 個標註到頁面: ${savedData.notionPageId}`);

        if (highlights.length === 0) {
            sendResponse({
                success: true,
                message: '沒有新標註需要同步',
                highlightCount: 0
            });
            return;
        }

        // 使用 updateHighlightsOnly 函數同步標註
        updateHighlightsOnly(savedData.notionPageId, highlights, normUrl, config.notionApiKey, (response) => {
            if (response.success) {
                Logger.log(`✅ 成功同步 ${highlights.length} 個標註`);
                response.highlightCount = highlights.length;
                response.message = `成功同步 ${highlights.length} 個標註`;
            } else {
                console.error('❌ 同步標註失敗:', response.error);
            }
            sendResponse(response);
        });
    } catch (error) {
        console.error('❌ handleSyncHighlights 錯誤:', error);
        sendResponse({ success: false, error: error.message });
    }
}

/**
 * 處理保存頁面的請求
 */
async function handleSavePage(sendResponse) {
    try {
        const tabs = await new Promise(resolve =>
            chrome.tabs.query({ active: true, currentWindow: true }, resolve)
        );

        const activeTab = tabs[0];
        if (!activeTab || !activeTab.id) {
            sendResponse({ success: false, error: 'Could not get active tab.' });
            return;
        }

        const config = await new Promise(resolve =>
            getConfig(['notionApiKey', 'notionDataSourceId', 'notionDatabaseId'], resolve)
        );

        const dataSourceId = config.notionDataSourceId || config.notionDatabaseId;

        if (!config.notionApiKey || !dataSourceId) {
            sendResponse({ success: false, error: 'API Key or Data Source ID is not set.' });
            return;
        }

        const normUrl = normalizeUrl(activeTab.url || '');
        const savedData = await new Promise(resolve => getSavedPageData(normUrl, resolve));

        // 注入 highlighter 並收集標記
        await ScriptInjector.injectHighlighter(activeTab.id);
        const highlights = await ScriptInjector.collectHighlights(activeTab.id);

        Logger.log('📊 收集到的標註數據:', highlights);
        Logger.log('📊 標註數量:', highlights?.length || 0);

        // 注入並執行內容提取
        let result = null;
        try {
            result = await ScriptInjector.injectWithResponse(activeTab.id, () => {
            // 初始化性能優化器（可選）
            let performanceOptimizer = null;
            try {
                if (typeof PerformanceOptimizer !== 'undefined') {
                    performanceOptimizer = new PerformanceOptimizer({
                        enableCache: true,
                        enableBatching: true,
                        enableMetrics: true,
                        cacheMaxSize: 500,  // 增加緩存大小以支持更多頁面元素
                        cacheTTL: 600000    // 10分鐘 TTL
                    });

                    // 使用智能預熱功能
                    performanceOptimizer.smartPrewarm(document).then(() => {
                        Logger.log('✓ PerformanceOptimizer initialized successfully with smart prewarming');
                    }).catch(error => {
                        Logger.warn('⚠️ Smart prewarming failed:', error);
                    });
                } else {
                    Logger.warn('⚠️ PerformanceOptimizer not available, using fallback queries');
                }
            } catch (perfError) {
                Logger.warn('⚠️ PerformanceOptimizer initialization failed, using fallback queries:', perfError);
                performanceOptimizer = null;
            }

            // 便捷的緩存查詢函數（帶回退）
            function cachedQuery(selector, context = document, options = {}) {
                if (performanceOptimizer) {
                    return performanceOptimizer.cachedQuery(selector, context, options);
                }
                // 回退到原生查詢
                return options.single ? context.querySelector(selector) : context.querySelectorAll(selector);
            }

            // URL 清理輔助函數
            function cleanImageUrl(url) {
                if (!url || typeof url !== 'string') return null;

                try {
                    const urlObj = new URL(url);

                    // 處理代理 URL（如 pgw.udn.com.tw/gw/photo.php）
                    if (urlObj.pathname.includes('/photo.php') || urlObj.pathname.includes('/gw/')) {
                        const uParam = urlObj.searchParams.get('u');
                        if (uParam?.match(/^https?:\/\//)) {
                            // 使用代理中的原始圖片 URL
                            return cleanImageUrl(uParam);
                        }
                    }

                    // 移除重複的查詢參數
                    const params = new URLSearchParams();
                    for (const [key, value] of urlObj.searchParams.entries()) {
                        if (!params.has(key)) {
                            params.set(key, value);
                        }
                    }
                    urlObj.search = params.toString();

                    return urlObj.href;
                } catch {
                    return null;
                }
            }


            // ============ v2.5.6: 封面圖/特色圖片提取功能 ============
            /**
             * 優先收集封面圖/特色圖片（通常位於標題上方或文章開頭）
             */
            function collectFeaturedImage() {
                Logger.log('🎯 Attempting to collect featured/hero image...');

                // 常見的封面圖選擇器（按優先級排序）
                const featuredImageSelectors = [
                    // WordPress 和常見 CMS
                    '.featured-image img',
                    '.hero-image img',
                    '.cover-image img',
                    '.post-thumbnail img',
                    '.entry-thumbnail img',
                    '.wp-post-image',

                    // 文章頭部區域
                    '.article-header img',
                    'header.article-header img',
                    '.post-header img',
                    '.entry-header img',

                    // 通用特色圖片容器
                    'figure.featured img',
                    'figure.hero img',
                    '[class*="featured"] img:first-of-type',
                    '[class*="hero"] img:first-of-type',
                    '[class*="cover"] img:first-of-type',

                    // 文章開頭的第一張圖片
                    'article > figure:first-of-type img',
                    'article > div:first-of-type img',
                    '.article > figure:first-of-type img',
                    '.post > figure:first-of-type img'
                ];

                // 檢查圖片是否為作者頭像/logo
                function isAuthorAvatar(img) {
                    // 檢查常見的作者頭像相關 class 名稱
                    const avatarKeywords = [
                        'avatar', 'profile', 'author', 'user-image',
                        'user-avatar', 'byline', 'author-image',
                        'author-photo', 'profile-pic', 'user-photo'
                    ];

                    // 檢查圖片本身的 class 和 id
                    const imgClass = (img.className || '').toLowerCase();
                    const imgId = (img.id || '').toLowerCase();
                    const imgAlt = (img.alt || '').toLowerCase();

                    for (const keyword of avatarKeywords) {
                        if (imgClass.includes(keyword) ||
                            imgId.includes(keyword) ||
                            imgAlt.includes(keyword)) {
                            Logger.log(`✗ Skipped author avatar/logo (keyword: ${keyword})`);
                            return true;
                        }
                    }

                    // 檢查父元素（向上最多 3 層）
                    let parent = img.parentElement;
                    for (let level = 0; level < 3 && parent; level++) {
                        const parentClass = (parent.className || '').toLowerCase();
                        const parentId = (parent.id || '').toLowerCase();

                        for (const keyword of avatarKeywords) {
                            if (parentClass.includes(keyword) || parentId.includes(keyword)) {
                                Logger.log(`✗ Skipped author avatar/logo (parent ${level + 1} has keyword: ${keyword})`);
                                return true;
                            }
                        }
                        parent = parent.parentElement;
                    }

                    // 檢查圖片尺寸（頭像通常較小，< 200x200）
                    const width = img.naturalWidth || img.width || 0;
                    const height = img.naturalHeight || img.height || 0;

                    if (width > 0 && height > 0) {
                        if (width < 200 && height < 200) {
                            Logger.log(`✗ Skipped small image (possible avatar): ${width}x${height}px`);
                            return true;
                        }

                        // 檢查是否為圓形或接近正方形（頭像特徵）
                        const aspectRatio = width / height;
                        const borderRadius = window.getComputedStyle(img).borderRadius;

                        if (aspectRatio >= 0.9 && aspectRatio <= 1.1 &&
                            width < 400 && height < 400 &&
                            borderRadius && (borderRadius === '50%' || parseInt(borderRadius) >= width / 2)) {
                            Logger.log(`✗ Skipped circular/square image (likely avatar): ${width}x${height}px, border-radius: ${borderRadius}`);
                            return true;
                        }
                    }

                    return false;
                }

                // 提取圖片 src 的函數
                function extractImageSrc(img) {
                    const srcAttributes = [
                        'src', 'data-src', 'data-lazy-src', 'data-original',
                        'data-lazy', 'data-url', 'data-image'
                    ];

                    for (const attr of srcAttributes) {
                        const value = img.getAttribute(attr);
                        if (value?.trim() && !value.startsWith('data:')) {
                            return value.trim();
                        }
                    }

                    // 檢查 picture 元素
                    const picture = img.closest('picture');
                    if (picture) {
                        const source = cachedQuery('source', picture, { single: true });
                        if (source) {
                            const srcset = source.getAttribute('srcset') || source.getAttribute('data-srcset');
                            if (srcset) {
                                const urls = srcset.split(',').map(s => s.trim().split(' ')[0]);
                                if (urls.length > 0 && !urls[0].startsWith('data:')) {
                                    return urls[0];
                                }
                            }
                        }
                    }

                    return null;
                }

                for (const selector of featuredImageSelectors) {
                    try {
                        const img = cachedQuery(selector, document, { single: true });
                        if (img) {
                            // 🔍 檢查是否為作者頭像/logo
                            if (isAuthorAvatar(img)) {
                                continue; // 跳過此圖片，繼續下一個選擇器
                            }

                            const src = extractImageSrc(img);
                            if (src) {
                                try {
                                    const absoluteUrl = new URL(src, document.baseURI).href;
                                    const cleanedUrl = cleanImageUrl(absoluteUrl);

                                    if (cleanedUrl && isValidImageUrl(cleanedUrl)) {
                                        Logger.log(`✓ Found featured image via selector: ${selector}`);
                                        Logger.log(`  Image URL: ${cleanedUrl}`);
                                        return cleanedUrl;
                                    }
                                } catch (e) {
                                    console.warn(`Failed to process featured image URL: ${src}`, e);
                                }
                            }
                        }
                    } catch (e) {
                        console.warn(`Error checking selector ${selector}:`, e);
                    }
                }

                Logger.log('✗ No featured image found');
                return null;
            }

            // 輔助函數：解析尺寸字符串（如 "180x180"）
            function parseSizeString(sizeStr) {
                if (!sizeStr || !sizeStr.trim()) return 0;

                // 處理 "any" 格式（通常是 SVG）
                if (sizeStr.toLowerCase() === 'any') {
                    return 999; // 給予 SVG 最高優先級
                }

                // 處理 "180x180" 格式
                const match = sizeStr.match(/(\d+)x(\d+)/i);
                if (match) {
                    return parseInt(match[1]); // 返回寬度
                }

                // 處理只有數字的情況
                const numMatch = sizeStr.match(/\d+/);
                if (numMatch) {
                    return parseInt(numMatch[0]);
                }

                return 0;
            }

            // 輔助函數：從候選 icons 中智能選擇最佳的
            function selectBestIcon(candidates) {
                Logger.log(`📊 Selecting best icon from ${candidates.length} candidates...`);

                if (candidates.length === 0) return null;
                if (candidates.length === 1) {
                    Logger.log('✓ Only one candidate, selected by default');
                    return candidates[0];
                }

                // 評分系統
                const scored = candidates.map(icon => {
                    let score = 0;
                    const url = icon.url.toLowerCase();

                    // 1. 格式評分（最重要）
                    if (url.endsWith('.svg') || url.includes('image/svg') || icon.type.includes('svg')) {
                        score += 1000; // SVG 矢量圖，完美縮放
                        Logger.log(`  ${icon.url.substring(0, 60)}...: +1000 (SVG format)`);
                    } else if (url.endsWith('.png') || icon.type.includes('png')) {
                        score += 500; // PNG 較好
                        Logger.log(`  ${icon.url.substring(0, 60)}...: +500 (PNG format)`);
                    } else if (url.endsWith('.ico') || icon.type.includes('ico')) {
                        score += 100; // ICO 可用但較舊
                        Logger.log(`  ${icon.url.substring(0, 60)}...: +100 (ICO format)`);
                    } else if (url.endsWith('.jpg') || url.endsWith('.jpeg') || icon.type.includes('jpeg')) {
                        score += 200; // JPEG 可用但不如 PNG
                        Logger.log(`  ${icon.url.substring(0, 60)}...: +200 (JPEG format)`);
                    }

                    // 2. 尺寸評分（第二重要）
                    const size = icon.size || 0;
                    if (size === 999) {
                        // SVG "any" 尺寸
                        score += 500;
                        Logger.log(`  ${icon.url.substring(0, 60)}...: +500 (any size - SVG)`);
                    } else if (size >= 180 && size <= 256) {
                        // 理想尺寸範圍（180x180 到 256x256）
                        score += 300;
                        Logger.log(`  ${icon.url.substring(0, 60)}...: +300 (ideal size: ${size}x${size})`);
                    } else if (size > 256) {
                        // 太大（可能影響性能，但質量好）
                        score += 200;
                        Logger.log(`  ${icon.url.substring(0, 60)}...: +200 (large size: ${size}x${size})`);
                    } else if (size >= 120) {
                        // 中等尺寸（可接受）
                        score += 100;
                        Logger.log(`  ${icon.url.substring(0, 60)}...: +100 (medium size: ${size}x${size})`);
                    } else if (size > 0) {
                        // 小尺寸（不理想）
                        score += 50;
                        Logger.log(`  ${icon.url.substring(0, 60)}...: +50 (small size: ${size}x${size})`);
                    }

                    // 3. 類型評分（第三重要）
                    if (icon.iconType === 'apple-touch') {
                        score += 50; // Apple Touch Icon 通常質量較好
                        Logger.log(`  ${icon.url.substring(0, 60)}...: +50 (apple-touch-icon)`);
                    }

                    // 4. 優先級評分（最後考量）
                    // 較低的 priority 值表示更高的優先級
                    score += (10 - icon.priority) * 10;

                    Logger.log(`  Total score: ${score}`);
                    return { ...icon, score };
                });

                // 按分數排序（降序）
                scored.sort((a, b) => b.score - a.score);

                const best = scored[0];
                Logger.log(`✓ Best icon selected: ${best.url} (score: ${best.score})`);

                // 顯示其他候選的分數（用於調試）
                if (scored.length > 1) {
                    Logger.log('  Other candidates:');
                    scored.slice(1, 4).forEach((icon, idx) => {
                        Logger.log(`    ${idx + 2}. ${icon.url.substring(0, 50)}... (score: ${icon.score})`);
                    });
                    if (scored.length > 4) {
                        Logger.log(`    ... and ${scored.length - 4} more`);
                    }
                }

                return best;
            }

            // 提取網站 Icon/Favicon
            function collectSiteIcon() {
                Logger.log('🎯 Attempting to collect site icon/favicon...');

                // 常見的網站 icon 選擇器（按優先級排序）
                const iconSelectors = [
                    // 高清 Apple Touch Icon（通常尺寸較大，180x180 或更大）
                    { selector: 'link[rel="apple-touch-icon"]', attr: 'href', priority: 1, iconType: 'apple-touch' },
                    { selector: 'link[rel="apple-touch-icon-precomposed"]', attr: 'href', priority: 2, iconType: 'apple-touch' },

                    // 標準 Favicon
                    { selector: 'link[rel="icon"]', attr: 'href', priority: 3, iconType: 'standard' },
                    { selector: 'link[rel="shortcut icon"]', attr: 'href', priority: 4, iconType: 'standard' },
                ];

                // 收集所有候選 icons（不做早期退出優化）
                // 設計決策：收集所有候選而不是找到第一個就返回
                // 理由：1) 性能影響可忽略（< 1ms）
                //      2) 保持代碼簡單易維護
                //      3) 完整日誌有助於調試和驗證評分邏輯
                const candidates = [];

                for (const { selector, attr, priority, iconType } of iconSelectors) {
                    try {
                        const elements = cachedQuery(selector, document, { all: true });
                        for (const element of elements) {
                            const iconUrl = element.getAttribute(attr);
                            if (iconUrl?.trim() && !iconUrl.startsWith('data:')) {
                                try {
                                    const absoluteUrl = new URL(iconUrl, document.baseURI).href;

                                    // 提取尺寸和類型信息
                                    const sizes = element.getAttribute('sizes') || '';
                                    const type = element.getAttribute('type') || '';
                                    const size = parseSizeString(sizes);

                                    candidates.push({
                                        url: absoluteUrl,
                                        priority: priority,
                                        size: size,
                                        type: type,
                                        iconType: iconType,
                                        sizes: sizes,
                                        selector: selector
                                    });

                                    Logger.log(`✓ Found icon: ${absoluteUrl.substring(0, 60)}... (${sizes || 'no size'}, ${type || 'no type'})`);
                                } catch (e) {
                                    console.warn(`Failed to process icon URL: ${iconUrl}`, e);
                                }
                            }
                        }
                    } catch (e) {
                        console.warn(`Error checking selector ${selector}:`, e);
                    }
                }

                // 如果找到候選 icons，使用智能選擇
                if (candidates.length > 0) {
                    const bestIcon = selectBestIcon(candidates);
                    if (bestIcon) {
                        return bestIcon.url;
                    }
                }

                // 回退到默認 favicon.ico
                Logger.log('⚠️ No icons found in HTML declarations, falling back to default favicon.ico');
                try {
                    const defaultFavicon = new URL('/favicon.ico', document.baseURI).href;
                    Logger.log(`✓ Using default favicon: ${defaultFavicon}`);
                    return defaultFavicon;
                } catch (e) {
                    console.warn('Failed to construct default favicon URL:', e);
                }

                Logger.log('✗ No site icon found');
                return null;
            }

            // 執行內容提取邏輯（從 content.js 中提取的核心邏輯）
            try {
                // 檢測是否為技術文檔頁面（需要使用 emergency extraction）
                function isTechnicalDoc() {
                    const url = window.location.href.toLowerCase();
                    const title = document.title.toLowerCase();

                    // 檢查 URL 模式
                    const urlPatterns = [
                        /\/docs?\//,
                        /\/api\//,
                        /\/documentation\//,
                        /\/guide\//,
                        /\/manual\//,
                        /\/reference\//,
                        /\/cli\//,
                        /\/commands?\//,
                        /github\.io.*docs/,
                        /\.github\.io/
                    ];

                    // 檢查標題模式
                    const titlePatterns = [
                        /documentation/,
                        /commands?/,
                        /reference/,
                        /guide/,
                        /manual/,
                        /cli/,
                        /api/
                    ];

                    const hasUrlPattern = urlPatterns.some(pattern => pattern.test(url));
                    const hasTitlePattern = titlePatterns.some(pattern => pattern.test(title));

                    Logger.log(`🔍 Technical doc detection: URL=${hasUrlPattern}, Title=${hasTitlePattern}, URL="${url}"`);
                    return hasUrlPattern || hasTitlePattern;
                }

                // Emergency extraction 函數 - 用於技術文檔
                function extractEmergencyContent() {
                    Logger.log('🆘 Using emergency extraction for technical documentation...');

                    // 等待動態內容載入（特別針對 gemini-cli 這種懶載入頁面）
                    function waitForContent(maxAttempts = 10) {
                        for (let attempt = 0; attempt < maxAttempts; attempt++) {
                            const textLength = document.body.textContent?.trim()?.length || 0;
                            Logger.log(`🔄 Attempt ${attempt + 1}/${maxAttempts}: Found ${textLength} characters`);

                            // 如果內容足夠多，停止等待
                            if (textLength > 3000) {
                                Logger.log(`✅ Content loaded successfully: ${textLength} chars`);
                                break;
                            }

                            // 嘗試觸發內容載入的多種方法
                            if (attempt < 3) {
                                try {
                                    // 方法1：選擇整個文檔來觸發懶載入
                                    if (attempt === 0) {
                                        const selection = window.getSelection();
                                        const range = document.createRange();
                                        range.selectNodeContents(document.body);
                                        selection.removeAllRanges();
                                        selection.addRange(range);
                                        Logger.log('🎯 Method 1: Triggered document selection');

                                        // 稍後清除選擇
                                        setTimeout(() => {
                                            try { selection.removeAllRanges(); } catch { /* 忽略清除選擇錯誤 */ }
                                        }, 50);
                                    }

                                    // 方法2：觸發滾動事件
                                    if (attempt === 1) {
                                        window.scrollTo(0, document.body.scrollHeight);
                                        window.scrollTo(0, 0);
                                        Logger.log('🎯 Method 2: Triggered scroll events');
                                    }

                                    // 方法3：觸發點擊事件
                                    if (attempt === 2) {
                                        const clickableElements = document.querySelectorAll('button, [role="button"], .expand, .show-more');
                                        if (clickableElements.length > 0) {
                                            clickableElements[0].click();
                                            Logger.log('🎯 Method 3: Clicked expandable element');
                                        }
                                    }
                                } catch (e) {
                                    console.warn(`⚠️ Could not trigger content loading (method ${attempt + 1}):`, e);
                                }
                            }

                            // 等待時間：前幾次短等待，後面長等待
                            const waitTime = attempt < 3 ? 300 : 500;
                            const start = Date.now();
                            while (Date.now() - start < waitTime) {
                                // 同步等待
                            }
                        }

                        const finalLength = document.body.textContent?.trim()?.length || 0;
                        Logger.log(`🏁 Final content length: ${finalLength} characters`);
                        return finalLength;
                    }

                    // 等待內容載入
                    waitForContent();

                    // 特別針對技術文檔的選擇器（按優先級排序）
                    const docSelectors = [
                        // 通用文檔容器
                        '.content', '.documentation', '.docs', '.guide', '.manual',
                        '.api-content', '.reference', '.commands', '.cli-content',

                        // HTML5 語義化標籤
                        '[role="main"]', 'main', 'article',

                        // 常見的頁面容器
                        '.page-content', '.main-content', '.wrapper', '.container',

                        // GitHub Pages 和技術文檔站點
                        '.site-content', '.page', '.markdown-body', '.wiki-content',

                        // 特定於某些文檔系統
                        '.content-wrapper', '.docs-content', '.documentation-content',

                        // 最寬泛的選擇器（最後嘗試）
                        'body > div', 'body > section', 'body'
                    ];

                    // 1. 嘗試特定選擇器
                    for (const selector of docSelectors) {
                        const element = cachedQuery(selector, document, { single: true });
                        if (element) {
                            const text = element.textContent?.trim();
                            if (text && text.length > 500) {
                                Logger.log(`✅ Found technical content with selector: ${selector} (${text.length} chars)`);
                                return element.innerHTML;
                            }
                        }
                    }

                    // 2. 使用 TreeWalker 進行深度搜索
                    Logger.log('🔄 Using TreeWalker for deep content search...');
                    const walker = document.createTreeWalker(
                        document.body,
                        NodeFilter.SHOW_ELEMENT,
                        {
                            acceptNode: function(node) {
                                // 跳過導航、側邊欄、頁腳等
                                const skipTags = ['nav', 'header', 'footer', 'aside', 'script', 'style'];
                                if (skipTags.includes(node.tagName.toLowerCase())) {
                                    return NodeFilter.FILTER_REJECT;
                                }

                                // 跳過特定 class
                                const className = node.className || '';
                                const skipClasses = ['nav', 'navigation', 'sidebar', 'header', 'footer', 'menu'];
                                if (skipClasses.some(cls => className.includes(cls))) {
                                    return NodeFilter.FILTER_SKIP;
                                }

                                return NodeFilter.FILTER_ACCEPT;
                            }
                        }
                    );

                    let bestElement = null;
                    let maxScore = 0;
                    let node = null;

                    while (node = walker.nextNode()) {
                        const text = node.textContent?.trim();
                        if (!text || text.length < 200) continue;

                        // 計算內容質量分數（確保不會產生 NaN）
                        let score = text.length || 0;

                        // 技術內容特徵加分
                        const techKeywords = ['command', 'option', 'parameter', 'example', 'usage', 'syntax', 'cli', 'api'];
                        let keywordCount = 0;
                        const lowerText = text.toLowerCase();
                        for (const keyword of techKeywords) {
                            const matches = lowerText.split(keyword).length - 1;
                            keywordCount += matches;
                        }
                        score += keywordCount * 100;

                        // 結構化內容加分
                        const headings = cachedQuery('h1, h2, h3, h4, h5, h6', node).length || 0;
                        const codeBlocks = cachedQuery('code, pre', node).length || 0;
                        const lists = cachedQuery('ul, ol', node).length || 0;

                        score += headings * 50 + codeBlocks * 30 + lists * 20;

                        // 確保分數是有效數字
                        if (isNaN(score) || score <= 0) {
                            score = text.length;
                        }

                        // 避免選擇包含更大元素的元素
                        if (bestElement && (node.contains(bestElement) || bestElement.contains(node))) {
                            if (node.contains(bestElement)) {
                                // 當前節點包含之前的最佳節點，跳過
                                continue;
                            } else {
                                // 之前的最佳節點包含當前節點，更新
                                bestElement = node;
                                maxScore = score;
                            }
                        } else if (score > maxScore) {
                            bestElement = node;
                            maxScore = score;
                        }
                    }

                    if (bestElement) {
                        const text = bestElement.textContent?.trim();
                        Logger.log(`🎯 Emergency extraction found content: ${text ? text.length : 0} chars, score: ${maxScore}`);
                        return bestElement.innerHTML;
                    }

                    Logger.log('❌ Emergency extraction failed');
                    return null;
                }

                let finalContent = null;
                let finalTitle = document.title;

                // 決定使用哪種提取策略
                if (isTechnicalDoc()) {
                    Logger.log('📋 Technical documentation detected, using emergency extraction');
                    finalContent = extractEmergencyContent();

                    // 如果 emergency extraction 失敗，仍然嘗試 Readability
                    if (!finalContent) {
                        Logger.log('🔄 Emergency extraction failed, falling back to Readability...');
                    } else {
                        Logger.log(`✅ Emergency extraction succeeded with ${finalContent.length} chars, skipping Readability`);
                    }
                }

                // 檢查內容品質的函數
                function isContentGood(article) {
                    const MIN_CONTENT_LENGTH = 250;
                    const MAX_LINK_DENSITY = 0.3;

                    if (!article || !article.content || article.length < MIN_CONTENT_LENGTH) return false;
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = article.content;
                    const links = cachedQuery('a', tempDiv);
                    let linkTextLength = 0;
                    // 確保 links 是可迭代的數組或類數組對象
                    let linksArray = [];
                    if (links) {
                        if (Array.isArray(links)) {
                            linksArray = links;
                        } else if (links.nodeType) {
                            // 單個元素
                            linksArray = [links];
                        } else if (typeof links === 'object' && typeof links.length === 'number') {
                            // 類數組對象（如 NodeList）
                            linksArray = Array.from(links);
                        } else {
                            // 其他情況，嘗試轉換為數組
                            try {
                                linksArray = Array.from(links);
                            } catch (e) {
                                console.warn('Failed to convert links to array:', e);
                                linksArray = [];
                            }
                        }
                    }
                    linksArray.forEach(link => linkTextLength += link.textContent.length);
                    const linkDensity = linkTextLength / article.length;
                    return linkDensity <= MAX_LINK_DENSITY;
                }

                let article = null;

                // 如果不是技術文檔或 emergency extraction 失敗，使用 Readability
                if (!finalContent) {
                    Logger.log('📖 Using Readability.js for content extraction');
                    article = new Readability(document.cloneNode(true)).parse();

                    if (isContentGood(article)) {
                        finalContent = article.content;
                        finalTitle = article.title;
                    } else {
                        Logger.log('🔄 Readability.js failed, trying CMS-aware fallback...');
                        // 將使用下面的備用方案邏輯
                    }
                }

                // 輔助函數：清理文本內容
                function cleanTextContent(text) {
                    if (!text) return '';

                    return text
                        .replace(/\s+/g, ' ')  // 將多個空白字符替換為單個空格
                        .replace(/[\u{a0}]/gu, ' ')  // 替換不間斷空格
                        .trim();
                }

                // 輔助函數：檢查文本是否有實際內容
                function hasActualContent(text) {
                    if (!text) return false;
                    const cleaned = cleanTextContent(text);
                    return cleaned.length > 0 && cleaned !== '•' && !/^[•\-*\s]*$/u.test(cleaned);
                }

                // 輔助函數：獲取元素的直接文本內容（不包括子元素的文本）
                function getDirectTextContent(element) {
                    let text = '';
                    for (const child of element.childNodes) {
                        if (child.nodeType === 3) { // Text node
                            text += child.textContent;
                        }
                    }
                    return text.trim();
                }

                // 輔助函數：創建帶縮進的列表項文本
                function createIndentedText(text, depth) {
                    const indent = '  '.repeat(depth); // 每級縮進2個空格
                    return indent + text;
                }

                // 輔助函數：處理列表項元素，保持層級結構
                function processListItem(liElement, parentDepth, blocksArray) {
                    const directText = getDirectTextContent(liElement);
                    const cleanText = cleanTextContent(directText);

                    // 如果有直接文本內容，創建列表項
                    if (hasActualContent(cleanText)) {
                        const indentedText = createIndentedText(cleanText, parentDepth);
                        const textChunks = splitTextForNotion(indentedText, 2000);
                        textChunks.forEach(chunk => {
                            blocksArray.push({
                                object: 'block',
                                type: 'bulleted_list_item',
                                bulleted_list_item: {
                                    rich_text: [{ type: 'text', text: { content: chunk } }]
                                }
                            });
                        });
                    }

                    // 遞歸處理子列表
                    const childLists = liElement.querySelectorAll(':scope > ul, :scope > ol');
                    childLists.forEach(childList => {
                        processListRecursively(childList, parentDepth + 1, blocksArray);
                    });
                }

                // 輔助函數：遞歸處理列表，保持層級結構
                function processListRecursively(listElement, depth, blocksArray) {
                    const directChildren = listElement.querySelectorAll(':scope > li');
                    directChildren.forEach(li => {
                        processListItem(li, depth, blocksArray);
                    });
                }

                // 輔助函數：將長文本分割成符合 Notion 限制的片段
                function splitTextForNotion(text, maxLength = 2000) {
                    if (!text || text.length <= maxLength) {
                        return [text];
                    }

                    const chunks = [];
                    let remaining = text;

                    while (remaining.length > 0) {
                        if (remaining.length <= maxLength) {
                            chunks.push(remaining);
                            break;
                        }

                        // 嘗試在句號、問號、驚嘆號處分割
                        let splitIndex = -1;
                        const punctuation = ['.', '。', '?', '？', '!', '！', '\n'];

                        for (const punct of punctuation) {
                            const lastIndex = remaining.lastIndexOf(punct, maxLength);
                            if (lastIndex > maxLength * 0.5) { // 至少分割到一半以上
                                splitIndex = lastIndex + 1;
                                break;
                            }
                        }

                        // 如果找不到合適的標點，嘗試在空格處分割
                        if (splitIndex === -1) {
                            splitIndex = remaining.lastIndexOf(' ', maxLength);
                            if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
                                // 實在找不到，強制在 maxLength 處分割
                                splitIndex = maxLength;
                            }
                        }

                        chunks.push(remaining.substring(0, splitIndex).trim());
                        remaining = remaining.substring(splitIndex).trim();
                    }

                    return chunks;
                }

                if (finalContent) {
                    /**
                     * @type {Array<Object>|null} Notion blocks 陣列，存儲從 HTML 轉換的內容區塊
                     * 初始化為 null 以明確表示「尚未轉換」狀態，便於後續檢查與錯誤處理
                     */
                    let blocks = null;

                    // 優先使用增強轉換器
                    if (typeof window.convertHtmlToNotionBlocks === 'function') {
                        Logger.log('🎉 Using enhanced HTML to Notion converter');
                        try {
                            blocks = window.convertHtmlToNotionBlocks(finalContent);
                        } catch (error) {
                            console.error('❌ Enhanced converter failed:', error);
                            blocks = null;
                        }
                    }

                    // 回退方案：簡單文本處理
                    if (!blocks || blocks.length === 0) {
                        console.warn('⚠️ Using fallback: simple text processing');
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = finalContent;
                        const text = (tempDiv.textContent || tempDiv.innerText || '').trim();

                        if (text) {
                            const paragraphs = text.split('\n\n').filter(p => p.trim() && p.length > 10);
                            blocks = paragraphs.map(para => ({
                                object: 'block',
                                type: 'paragraph',
                                paragraph: {
                                    rich_text: [{ type: 'text', text: { content: para.trim().substring(0, 2000) } }]
                                }
                            }));
                        } else {
                            blocks = [{
                                object: 'block',
                                type: 'paragraph',
                                paragraph: {
                                    rich_text: [{ type: 'text', text: { content: 'Content extraction failed' } }]
                                }
                            }];
                        }
                    }

                    Logger.log(`✅ Generated ${blocks.length} Notion blocks`);

                    // v2.5.6: 優先添加封面圖
                    Logger.log('=== v2.5.6: Featured Image Collection ===');
                    const featuredImageUrl = collectFeaturedImage();

                    if (featuredImageUrl) {
                        // 檢查是否已經在 blocks 中（避免重複）
                        const isDuplicate = blocks.some(block =>
                            block.type === 'image' &&
                            block.image?.external?.url === featuredImageUrl
                        );

                        if (!isDuplicate) {
                            // 將封面圖插入到 blocks 開頭
                            blocks.unshift({
                                object: 'block',
                                type: 'image',
                                image: {
                                    type: 'external',
                                    external: { url: featuredImageUrl }
                                }
                            });
                            Logger.log('✓ Featured image added as first block');
                        } else {
                            Logger.log('✗ Featured image already exists in blocks, skipped');
                        }
                    }

                    // v2.6.0: 提取網站 Icon
                    Logger.log('=== v2.6.0: Site Icon Collection ===');
                    const siteIconUrl = collectSiteIcon();

                    // 輸出性能統計（如果可用）
                    if (performanceOptimizer) {
                        try {
                            const performanceStats = performanceOptimizer.getPerformanceStats();
                            Logger.log('🚀 Performance Stats:', performanceStats);
                        } catch (perfError) {
                            console.warn('Could not get performance stats:', perfError);
                        }
                    }

                    return {
                        title: finalTitle,
                        blocks: blocks,
                        siteIcon: siteIconUrl  // 新增：返回網站 Icon URL
                    };
                } else {
                    return {
                        title: document.title,
                        blocks: [{
                            object: 'block',
                            type: 'paragraph',
                            paragraph: {
                                rich_text: [{ type: 'text', text: { content: 'Could not automatically extract article content.' } }]
                            }
                        }]
                    };
                }
            } catch (error) {
                console.error('Content extraction failed:', error);
                return {
                    title: document.title,
                    blocks: [{
                        object: 'block',
                        type: 'paragraph',
                        paragraph: {
                            rich_text: [{ type: 'text', text: { content: 'Content extraction failed.' } }]
                        }
                    }]
                };
            }
        }, ['lib/Readability.js', 'lib/turndown.js', 'lib/turndown-plugin-gfm.js', 'scripts/utils/htmlToNotionConverter.js', 'scripts/performance/PerformanceOptimizer.js']);
        } catch (scriptError) {
            console.error('❌ Content extraction script execution failed:', scriptError);
            // 直接回覆錯誤，符合錯誤分支預期
            sendResponse({ success: false, error: scriptError?.message || 'Content extraction failed' });
            return;
        }

        if (!result || !result.title || !result.blocks) {
            console.error('❌ Content extraction result validation failed:', {
                result: result,
                resultType: typeof result,
                hasResult: Boolean(result),
                hasTitle: Boolean(result?.title),
                hasBlocks: Boolean(result?.blocks),
                blocksLength: result?.blocks ? result.blocks.length : 'N/A',
                url: activeTab.url,
                timestamp: new Date().toISOString()
            });

            // Provide more specific error messages based on what's missing
            let errorMessage = 'Could not parse the article content.';
            if (!result) {
                errorMessage = 'Content extraction script returned no result.';
            } else if (!result.title) {
                errorMessage = 'Content extraction failed to get page title.';
            } else if (!result.blocks) {
                errorMessage = 'Content extraction failed to generate content blocks.';
            }

            sendResponse({
                success: false,
                error: errorMessage + ' Please check the browser console for details.'
            });
            return;
        }

        const contentResult = result;
        // 添加標記到內容
        if (highlights.length > 0) {
            const highlightBlocks = [{
                object: 'block',
                type: 'heading_3',
                heading_3: {
                    rich_text: [{
                        type: 'text',
                        text: { content: '📝 頁面標記' }
                    }]
                }
            }];

            highlights.forEach((highlight) => {
                highlightBlocks.push({
                    object: 'block',
                    type: 'paragraph',
                    paragraph: {
                        rich_text: [{
                            type: 'text',
                            text: { content: highlight.text },
                            annotations: {
                                color: highlight.color
                            }
                        }]
                    }
                });
            });

            contentResult.blocks.push(...highlightBlocks);
        }

        const imageCount = contentResult.blocks.filter(b => b.type === 'image').length;

        // 處理保存邏輯
        if (savedData?.notionPageId) {
            const pageExists = await checkNotionPageExists(savedData.notionPageId, config.notionApiKey);

            if (pageExists) {
                if (highlights.length > 0) {
                    updateHighlightsOnly(savedData.notionPageId, highlights, normUrl, config.notionApiKey, (response) => {
                        if (response.success) {
                            response.highlightCount = highlights.length;
                            response.highlightsUpdated = true;
                        }
                        sendResponse(response);
                    });
                } else {
                    updateNotionPage(savedData.notionPageId, contentResult.title, contentResult.blocks, normUrl, config.notionApiKey, (response) => {
                        if (response.success) {
                            response.imageCount = imageCount;
                            response.blockCount = contentResult.blocks.length;
                            response.updated = true;
                        }
                        sendResponse(response);
                    });
                }
            } else {
                Logger.log('Notion page was deleted, clearing local state and creating new page');
                clearPageState(normUrl);
                await clearPageHighlights(activeTab.id);

                saveToNotion(contentResult.title, contentResult.blocks, normUrl, config.notionApiKey, dataSourceId, (response) => {
                    if (response.success) {
                        response.imageCount = imageCount;
                        response.blockCount = contentResult.blocks.length;
                        response.created = true;
                        response.recreated = true;
                    }
                    sendResponse(response);
                }, contentResult.siteIcon);
            }
        } else {
            saveToNotion(contentResult.title, contentResult.blocks, normUrl, config.notionApiKey, dataSourceId, (response) => {
                if (response.success) {
                    response.imageCount = imageCount;
                    response.blockCount = contentResult.blocks.length;
                    response.created = true;
                }
                sendResponse(response);
            }, contentResult.siteIcon);
        }
    } catch (error) {
        console.error('Error in handleSavePage:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// 清理頁面標記的輔助函數
async function clearPageHighlights(tabId) {
    try {
        await ScriptInjector.injectHighlighter(tabId);
        await ScriptInjector.inject(tabId, () => {
            if (window.clearPageHighlights) {
                window.clearPageHighlights();
            }
        });
    } catch (error) {
        console.warn('Failed to clear page highlights:', error);
    }
}

// ==========================================
// INITIALIZATION
// ==========================================

// Initialize the extension
chrome.runtime.onInstalled.addListener((details) => {
  Logger.log('Notion Smart Clipper extension installed/updated');

  // 處理擴展更新
  if (details.reason === 'update') {
    handleExtensionUpdate(details.previousVersion);
  } else if (details.reason === 'install') {
    handleExtensionInstall();
  }
});

/**
 * 處理擴展更新
 */
async function handleExtensionUpdate(previousVersion) {
  const currentVersion = chrome.runtime.getManifest().version;
  Logger.log(`擴展已更新: ${previousVersion} → ${currentVersion}`);

  // 檢查是否需要顯示更新說明
  if (shouldShowUpdateNotification(previousVersion, currentVersion)) {
    await showUpdateNotification(previousVersion, currentVersion);
  }
}

/**
 * 處理擴展安裝
 */
async function handleExtensionInstall() {
  Logger.log('擴展首次安裝');
  // 可以在這裡添加歡迎頁面或設置引導
}

/**
 * 判斷是否需要顯示更新通知
 */
function shouldShowUpdateNotification(previousVersion, currentVersion) {
  // 跳過開發版本或測試版本
  if (!previousVersion || !currentVersion) return false;

  // 解析版本號
  const prevParts = previousVersion.split('.').map(Number);
  const currParts = currentVersion.split('.').map(Number);

  // 主版本或次版本更新時顯示通知
  if (currParts[0] > prevParts[0] || currParts[1] > prevParts[1]) {
    return true;
  }

  // 修訂版本更新且有重要功能時也顯示
  if (currParts[2] > prevParts[2]) {
    // 檢查是否為重要更新
    return isImportantUpdate(currentVersion);
  }

  return false;
}

/**
 * 檢查是否為重要更新
 */
function isImportantUpdate(version) {
  // 定義重要更新的版本列表
  const importantUpdates = [
    '2.7.3', // 修復超長文章截斷問題
    '2.8.0', // 商店更新說明功能
    // 可以繼續添加重要版本
  ];

  return importantUpdates.includes(version);
}

/**
 * 顯示更新通知
 */
async function showUpdateNotification(previousVersion, currentVersion) {
  try {
    // 創建通知標籤頁
    const tab = await chrome.tabs.create({
      url: chrome.runtime.getURL('update-notification/update-notification.html'),
      active: true
    });

    // 等待頁面載入後傳送版本信息
    setTimeout(() => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'UPDATE_INFO',
        previousVersion: previousVersion,
        currentVersion: currentVersion
      }).catch(err => {
        Logger.log('發送更新信息失敗:', err);
      });
    }, 1000);

    Logger.log('已顯示更新通知頁面');
  } catch (error) {
    console.error('顯示更新通知失敗:', error);
  }
}

/**
 * 處理打開 Notion 頁面的請求
 */
function handleOpenNotionPage(request, sendResponse) {
    try {
        const url = request.url;
        if (!url) {
            sendResponse({ success: false, error: 'No URL provided' });
            return;
        }

        // 在新標籤頁中打開 Notion 頁面
        chrome.tabs.create({ url: url }, (tab) => {
            if (chrome.runtime.lastError) {
                console.error('Failed to open Notion page:', chrome.runtime.lastError);
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                Logger.log('✅ Opened Notion page in new tab:', url);
                sendResponse({ success: true, tabId: tab.id });
            }
        });
    } catch (error) {
        console.error('❌ handleOpenNotionPage 錯誤:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Setup all services
setupMessageHandlers();
setupTabListeners();

// ============================================================
// 模組導出 (用於測試)
// ============================================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeUrl,
    cleanImageUrl,
    isValidImageUrl,
    splitTextForHighlight,
    appendBlocksInBatches,
    migrateLegacyHighlights
  };
}
