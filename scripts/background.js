// Notion Smart Clipper - Background Script
// Refactored for better organization

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
            if (uParam && uParam.match(/^https?:\/\//)) {
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
    } catch (e) {
        return null;
    }
}

// 圖片 URL 驗證結果緩存
const urlValidationCache = new Map();
const MAX_CACHE_SIZE = 1000;

/**
 * 檢查 URL 是否為有效的圖片格式
 */
function isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    // 檢查緩存
    if (urlValidationCache.has(url)) {
        return urlValidationCache.get(url);
    }
    
    // 先清理 URL
    const cleanedUrl = cleanImageUrl(url);
    if (!cleanedUrl) {
        // 緩存負面結果
        cacheValidationResult(url, false);
        return false;
    }
    
    // 檢查是否為有效的 HTTP/HTTPS URL
    if (!cleanedUrl.match(/^https?:\/\//i)) return false;
    
    // 檢查 URL 長度（Notion 有限制）
    if (cleanedUrl.length > 2000) return false;
    
    // 檢查常見的圖片文件擴展名
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|tif)(\?.*)?$/i;
    
    // 如果 URL 包含圖片擴展名，直接返回 true
    if (imageExtensions.test(cleanedUrl)) return true;
    
    // 對於沒有明確擴展名的 URL（如 CDN 圖片），檢查是否包含圖片相關的路徑
    const imagePathPatterns = [
        /\/image[s]?\//i,
        /\/img[s]?\//i,
        /\/photo[s]?\//i,
        /\/picture[s]?\//i,
        /\/media\//i,
        /\/upload[s]?\//i,
        /\/asset[s]?\//i,
        /\/file[s]?\//i
    ];
    
    // 排除明顯不是圖片的 URL
    const excludePatterns = [
        /\.(js|css|html|htm|php|asp|jsp)(\?|$)/i,
        /\/api\//i,
        /\/ajax\//i,
        /\/callback/i
    ];
    
    if (excludePatterns.some(pattern => pattern.test(cleanedUrl))) {
        return false;
    }
    
    const result = imagePathPatterns.some(pattern => pattern.test(cleanedUrl));
    
    // 緩存結果
    cacheValidationResult(url, result);
    
    return result;
}

/**
 * 緩存圖片 URL 驗證結果
 */
function cacheValidationResult(url, isValid) {
    // 檢查緩存大小限制
    if (urlValidationCache.size >= MAX_CACHE_SIZE) {
        // 刪除最舊的條目（簡單的 FIFO 策略）
        const firstKey = urlValidationCache.keys().next().value;
        urlValidationCache.delete(firstKey);
    }
    
    urlValidationCache.set(url, isValid);
}

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
                                console.error(`File injection failed:`, chrome.runtime.lastError);
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
                                console.error(`Function execution failed:`, chrome.runtime.lastError);
                            }
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            if (successMessage && logErrors) {
                                console.log(successMessage);
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
                    console.log('✅ 工具欄已顯示');
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
            throw error;
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
    
    console.log(`📦 準備分批添加區塊: 總共 ${totalBlocks} 個，從索引 ${startIndex} 開始`);
    
    try {
        // 分批處理剩餘區塊
        for (let i = startIndex; i < blocks.length; i += BLOCKS_PER_BATCH) {
            const batch = blocks.slice(i, i + BLOCKS_PER_BATCH);
            const batchNumber = Math.floor((i - startIndex) / BLOCKS_PER_BATCH) + 1;
            const totalBatches = Math.ceil(totalBlocks / BLOCKS_PER_BATCH);
            
            console.log(`📤 發送批次 ${batchNumber}/${totalBatches}: ${batch.length} 個區塊`);
            
            // 使用重試機制發送批次
            const response = await (typeof withRetry !== 'undefined' ? withRetry : (fn) => fn())(
                async () => {
                    const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
                        method: 'PATCH',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json',
                            'Notion-Version': '2022-06-28'
                        },
                        body: JSON.stringify({
                            children: batch
                        })
                    });
                    
                    if (!res.ok) {
                        const errorText = await res.text();
                        const error = new Error(`批次添加失敗: ${res.status} - ${errorText}`);
                        error.status = res.status;
                        throw error;
                    }
                    
                    return res;
                },
                {
                    maxRetries: 3,
                    baseDelay: 1000,
                    shouldRetry: (error) => {
                        // 重試 5xx 錯誤和 429 (Too Many Requests)
                        return error.status >= 500 || error.status === 429;
                    }
                }
            );
            
            // 如果沒有重試機制，記錄批次失敗
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ 批次 ${batchNumber} 失敗:`, errorText);
                throw new Error(`批次添加失敗: ${response.status} - ${errorText}`);
            }
            
            addedCount += batch.length;
            console.log(`✅ 批次 ${batchNumber} 成功: 已添加 ${addedCount}/${totalBlocks} 個區塊`);
            
            // 如果還有更多批次，添加延遲以遵守速率限制
            if (i + BLOCKS_PER_BATCH < blocks.length) {
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
            }
        }
        
        console.log(`🎉 所有區塊添加完成: ${addedCount}/${totalBlocks}`);
        return { success: true, addedCount, totalCount: totalBlocks };
        
    } catch (error) {
        console.error(`❌ 分批添加區塊失敗:`, error);
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
    } catch (e) {
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
        console.log('✅ Cleared all data for:', pageUrl);
        console.log('  - Saved state:', savedKey);
        console.log('  - Highlights:', highlightsKey);
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

// ==========================================
// NOTION API MODULE
// ==========================================

/**
 * Checks if a Notion page exists
 */
async function checkNotionPageExists(pageId, apiKey) {
    try {
        const response = await (typeof withRetry !== 'undefined' ? withRetry : (fn) => fn())(
            async () => {
                const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Notion-Version': '2022-06-28'
                    }
                });

                // 404 是預期的結果，不應該重試
                if (res.status === 404) {
                    return res;
                }

                // 其他錯誤狀態可能需要重試
                if (!res.ok && res.status >= 500) {
                    const error = new Error(`Page check failed: ${res.status}`);
                    error.status = res.status;
                    throw error;
                }

                return res;
            },
            {
                maxRetries: 2,
                baseDelay: 500,
                shouldRetry: (error) => error.status >= 500 || error.status === 429
            }
        );

        if (response.ok) {
            const pageData = await response.json();
            return !pageData.archived;
        } else if (response.status === 404) {
            return false;
        } else {
            return false;
        }
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
        return false;
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
 */
async function saveToNotion(title, blocks, pageUrl, apiKey, databaseId, sendResponse, siteIcon = null) {
    // 開始性能監控 (service worker 環境，使用原生 Performance API)
    const startTime = performance.now();
    console.log('⏱️ 開始保存到 Notion...');

    const notionApiUrl = 'https://api.notion.com/v1/pages';

    const pageData = {
        parent: { database_id: databaseId },
        properties: {
            'Title': {
                title: [{ text: { content: title } }]
            },
            'URL': {
                url: pageUrl
            }
        },
        children: blocks.slice(0, 100)
    };
    
    // v2.6.0: 添加網站 Icon（如果有）
    if (siteIcon) {
        pageData.icon = {
            type: 'external',
            external: {
                url: siteIcon
            }
        };
        console.log('✓ Setting page icon:', siteIcon);
    }

    try {
        const response = await fetch(notionApiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify(pageData)
        });

        if (response.ok) {
            const responseData = await response.json();
            console.log('📄 Notion API 創建頁面響應:', responseData);
            console.log('🔗 響應中的 URL:', responseData.url);
            const notionPageId = responseData.id;
            
            // 如果區塊數量超過 100，分批添加剩餘區塊
            if (blocks.length > 100) {
                console.log(`📚 檢測到超長文章: ${blocks.length} 個區塊，需要分批添加`);
                const appendResult = await appendBlocksInBatches(notionPageId, blocks, apiKey, 100);
                
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
                console.log('🔗 手動構建 Notion URL:', notionUrl);
            }
            
            setSavedPageData(pageUrl, {
                title: title,
                savedAt: Date.now(),
                notionPageId: notionPageId,
                notionUrl: notionUrl
            }, () => {
                // 結束性能監控 (service worker 環境)
                const duration = performance.now() - startTime;
                console.log(`⏱️ 保存到 Notion 完成: ${duration.toFixed(2)}ms`);
                sendResponse({ success: true, notionPageId: notionPageId });
            });
        } else {
            const errorData = await response.json();
            console.error('Notion API Error:', errorData);
            sendResponse({ success: false, error: errorData.message || 'Failed to save to Notion.' });
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
        const getResponse = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Notion-Version': '2022-06-28'
            }
        });

        if (getResponse.ok) {
            const existingContent = await getResponse.json();
            for (const block of existingContent.results) {
                await fetch(`https://api.notion.com/v1/blocks/${block.id}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Notion-Version': '2022-06-28'
                    }
                });
            }
        }

        const updateResponse = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify({
                children: blocks.slice(0, 100)
            })
        });

        if (updateResponse.ok) {
            // 如果區塊數量超過 100，分批添加剩餘區塊
            if (blocks.length > 100) {
                console.log(`📚 檢測到超長文章: ${blocks.length} 個區塊，需要分批添加`);
                const appendResult = await appendBlocksInBatches(pageId, blocks, apiKey, 100);
                
                if (!appendResult.success) {
                    console.warn(`⚠️ 部分區塊添加失敗: ${appendResult.addedCount}/${appendResult.totalCount}`, appendResult.error);
                    // 即使部分失敗，頁面已更新，仍然繼續
                }
            }
            
            const titleUpdatePromise = fetch(`https://api.notion.com/v1/pages/${pageId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Notion-Version': '2022-06-28'
                },
                body: JSON.stringify({
                    properties: {
                        'Title': {
                            title: [{ text: { content: title } }]
                        }
                    }
                })
            });

            const storageUpdatePromise = new Promise((resolve) => {
                setSavedPageData(pageUrl, {
                    title: title,
                    savedAt: Date.now(),
                    notionPageId: pageId,
                    lastUpdated: Date.now()
                }, resolve);
            });

            await Promise.all([titleUpdatePromise, storageUpdatePromise]);
            sendResponse({ success: true });
        } else {
            const errorData = await updateResponse.json();
            console.error('Notion Update Error:', errorData);
            sendResponse({ success: false, error: errorData.message || 'Failed to update Notion page.' });
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
        console.log('🔄 開始更新標記 - 頁面ID:', pageId, '標記數量:', highlights.length);

        const getResponse = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Notion-Version': '2022-06-28'
            }
        });

        if (!getResponse.ok) {
            const errorData = await getResponse.json();
            console.error('❌ 獲取頁面內容失敗:', errorData);
            throw new Error('Failed to get existing page content: ' + (errorData.message || getResponse.statusText));
        }

        const existingContent = await getResponse.json();
        const existingBlocks = existingContent.results;
        console.log('📋 現有區塊數量:', existingBlocks.length);

        const blocksToDelete = [];
        let foundHighlightSection = false;

        for (let i = 0; i < existingBlocks.length; i++) {
            const block = existingBlocks[i];

            if (block.type === 'heading_3' &&
                block.heading_3?.rich_text?.[0]?.text?.content === '📝 頁面標記') {
                foundHighlightSection = true;
                blocksToDelete.push(block.id);
                console.log(`🎯 找到標記區域標題 (索引 ${i}):`, block.id);
            } else if (foundHighlightSection) {
                if (block.type.startsWith('heading_')) {
                    console.log(`🛑 遇到下一個標題，停止收集標記區塊 (索引 ${i})`);
                    break;
                }
                if (block.type === 'paragraph') {
                    blocksToDelete.push(block.id);
                    console.log(`📝 標記為刪除的段落 (索引 ${i}):`, block.id);
                }
            }
        }

        console.log('🗑️ 需要刪除的區塊數量:', blocksToDelete.length);

        let deletedCount = 0;
        for (const blockId of blocksToDelete) {
            try {
                console.log(`🗑️ 正在刪除區塊: ${blockId}`);
                const deleteResponse = await fetch(`https://api.notion.com/v1/blocks/${blockId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Notion-Version': '2022-06-28'
                    }
                });

                if (deleteResponse.ok) {
                    deletedCount++;
                    console.log(`✅ 成功刪除區塊: ${blockId}`);
                } else {
                    const errorData = await deleteResponse.json();
                    console.error(`❌ 刪除區塊失敗 ${blockId}:`, errorData);
                }
            } catch (deleteError) {
                console.error(`❌ 刪除區塊異常 ${blockId}:`, deleteError);
            }
        }

        console.log(`🗑️ 實際刪除了 ${deletedCount}/${blocksToDelete.length} 個區塊`);

        if (highlights.length > 0) {
            console.log('➕ 準備添加新的標記區域...');

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
                console.log(`📝 準備添加標記 ${index + 1}: "${highlight.text.substring(0, 30)}..." (顏色: ${highlight.color})`);
                
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
                        console.log(`   └─ 分割片段 ${chunkIndex + 1}/${textChunks.length}: ${chunk.length} 字符`);
                    }
                });
            });

            console.log('➕ 準備添加的區塊數量:', highlightBlocks.length);

            const addResponse = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Notion-Version': '2022-06-28'
                },
                body: JSON.stringify({
                    children: highlightBlocks
                })
            });

            console.log('📡 API 響應狀態:', addResponse.status, addResponse.statusText);

            if (!addResponse.ok) {
                const errorData = await addResponse.json();
                console.error('❌ 添加標記失敗 - 錯誤詳情:', errorData);
                throw new Error('Failed to add new highlights: ' + (errorData.message || 'Unknown error'));
            }

            const addResult = await addResponse.json();
            console.log('✅ 成功添加新標記 - 響應:', addResult);
            console.log('✅ 添加的區塊數量:', addResult.results?.length || 0);
        } else {
            console.log('ℹ️ 沒有新標記需要添加');
        }

        console.log('💾 更新本地保存記錄...');
        setSavedPageData(pageUrl, {
            savedAt: Date.now(),
            notionPageId: pageId,
            lastUpdated: Date.now()
        }, () => {
            console.log('🎉 標記更新完成！');
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
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' && tab && tab.url) {
            const normUrl = normalizeUrl(tab.url);
            const key = `highlights_${normUrl}`;
            
            // 添加延遲，確保頁面完全載入
            setTimeout(async () => {
                try {
                    const data = await new Promise(resolve => chrome.storage.local.get([key], resolve));
                    const highlights = data[key];
                    
                    if (highlights && Array.isArray(highlights) && highlights.length > 0) {
                        console.log(`Found ${highlights.length} highlights for ${normUrl}, injecting restore script`);
                        await ScriptInjector.injectHighlightRestore(tabId);
                    } else {
                        // 檢查是否有舊版 localStorage 中的標記需要遷移
                        await migrateLegacyHighlights(tabId, normUrl, key);
                    }
                } catch (error) {
                    console.error('Error in tab listener:', error);
                }
            }, 1000); // 延遲 1 秒確保頁面穩定
        }
    });
}

/**
 * 遷移舊版本 localStorage 中的標記到 chrome.storage
 */
/**
 * 遷移舊版 localStorage 中的標記到 chrome.storage.local
 */
async function migrateLegacyHighlights(tabId, normUrl, storageKey) {
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
                    } catch (e) { return raw || ''; }
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
                        if (k && k.startsWith('highlights_')) { 
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

        const res = result && result[0] ? result[0].result : null;
        if (res && res.migrated && Array.isArray(res.data) && res.data.length > 0) {
            console.log(`Migrating ${res.data.length} highlights from localStorage key: ${res.foundKey}`);
            
            await new Promise(resolve => {
                chrome.storage.local.set({ [storageKey]: res.data }, resolve);
            });
            
            console.log('Legacy highlights migrated successfully, injecting restore script');
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
        switch (request.action) {
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
                handleSavePage(sendResponse);
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
        
        if (savedData && savedData.notionPageId) {
            const config = await new Promise(resolve => getConfig(['notionApiKey'], resolve));
            
            if (config.notionApiKey) {
                try {
                    const pageExists = await checkNotionPageExists(savedData.notionPageId, config.notionApiKey);
                    
                    if (!pageExists) {
                        console.log('Notion page was deleted, clearing local state');
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
                        // 設置綠色徽章表示已保存
                        chrome.action.setBadgeText({ text: '✓', tabId: activeTab.id });
                        chrome.action.setBadgeBackgroundColor({ color: '#48bb78', tabId: activeTab.id });

                        // 為舊版本數據生成 notionUrl（如果沒有的話）
                        let notionUrl = savedData.notionUrl;
                        if (!notionUrl && savedData.notionPageId) {
                            notionUrl = `https://www.notion.so/${savedData.notionPageId.replace(/-/g, '')}`;
                            console.log('🔗 為舊版本數據生成 Notion URL:', notionUrl);
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
                        console.log('🔗 為舊版本數據生成 Notion URL (錯誤處理):', notionUrl);
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
                    console.log('🔗 為舊版本數據生成 Notion URL (無 API Key):', notionUrl);
                }

                sendResponse({
                    success: true,
                    isSaved: !!savedData,
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
        console.log('🔄 處理同步標註請求');
        
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
        console.log(`📊 準備同步 ${highlights.length} 個標註到頁面: ${savedData.notionPageId}`);
        
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
                console.log(`✅ 成功同步 ${highlights.length} 個標註`);
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
            getConfig(['notionApiKey', 'notionDatabaseId'], resolve)
        );
        
        if (!config.notionApiKey || !config.notionDatabaseId) {
            sendResponse({ success: false, error: 'API Key or Database ID is not set.' });
            return;
        }

        const normUrl = normalizeUrl(activeTab.url || '');
        const savedData = await new Promise(resolve => getSavedPageData(normUrl, resolve));

        // 注入 highlighter 並收集標記
        await ScriptInjector.injectHighlighter(activeTab.id);
        const highlights = await ScriptInjector.collectHighlights(activeTab.id);
        
        console.log('📊 收集到的標註數據:', highlights);
        console.log('📊 標註數量:', highlights?.length || 0);

        // 注入並執行內容提取
        let result;
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
                        console.log('✓ PerformanceOptimizer initialized successfully with smart prewarming');
                    }).catch(error => {
                        console.warn('⚠️ Smart prewarming failed:', error);
                    });
                } else {
                    console.warn('⚠️ PerformanceOptimizer not available, using fallback queries');
                }
            } catch (perfError) {
                console.warn('⚠️ PerformanceOptimizer initialization failed, using fallback queries:', perfError);
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
                        if (uParam && uParam.match(/^https?:\/\//)) {
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
                } catch (e) {
                    return null;
                }
            }

            // 圖片 URL 驗證結果緩存（內聯函數版本）
            const urlValidationCache = new Map();
            const MAX_CACHE_SIZE = 1000;
            
            function isValidImageUrl(url) {
                if (!url || typeof url !== 'string') return false;
                
                // 檢查緩存
                if (urlValidationCache.has(url)) {
                    return urlValidationCache.get(url);
                }
                
                // 先清理 URL
                const cleanedUrl = cleanImageUrl(url);
                if (!cleanedUrl) {
                    // 緩存負面結果
                    cacheValidationResult(url, false);
                    return false;
                }
                
                // 檢查是否為有效的 HTTP/HTTPS URL
                if (!cleanedUrl.match(/^https?:\/\//i)) return false;
                
                // 檢查 URL 長度（Notion 有限制）
                if (cleanedUrl.length > 2000) return false;
                
                // v2.5.4: 擴展圖片格式支持
                const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|tif|avif|heic|heif)(\?.*)?$/i;
                
                // 如果 URL 包含圖片擴展名，直接返回 true
                if (imageExtensions.test(cleanedUrl)) return true;
                
                // v2.5.4: 擴展路徑模式識別
                const imagePathPatterns = [
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
                    /cdn\d*\./i,  // cdn1.example.com, cdn2.example.com
                    /\/static\//i,
                    /\/thumb[s]?\//i,
                    /\/thumbnail[s]?\//i,
                    /\/resize\//i,
                    /\/crop\//i,
                    /\/(\d{4})\/(\d{2})\//  // 日期路徑如 /2025/10/
                ];
                
                // 排除明顯不是圖片的 URL
                const excludePatterns = [
                    /\.(js|css|html|htm|php|asp|jsp|json|xml)(\?|$)/i,
                    /\/api\//i,
                    /\/ajax\//i,
                    /\/callback/i,
                    /\/track/i,
                    /\/analytics/i
                ];
                
                if (excludePatterns.some(pattern => pattern.test(cleanedUrl))) {
                    return false;
                }
                
                const result = imagePathPatterns.some(pattern => pattern.test(cleanedUrl));
                
                // 緩存結果
                cacheValidationResult(url, result);
                
                return result;
            }
            
            /**
             * 緩存圖片 URL 驗證結果（內聯函數版本）
             */
            function cacheValidationResult(url, isValid) {
                // 檢查緩存大小限制
                if (urlValidationCache.size >= MAX_CACHE_SIZE) {
                    // 刪除最舊的條目（簡單的 FIFO 策略）
                    const firstKey = urlValidationCache.keys().next().value;
                    urlValidationCache.delete(firstKey);
                }
                
                urlValidationCache.set(url, isValid);
            }
            
            // ============ v2.5.6: 封面圖/特色圖片提取功能 ============
            /**
             * 優先收集封面圖/特色圖片（通常位於標題上方或文章開頭）
             */
            function collectFeaturedImage() {
                console.log('🎯 Attempting to collect featured/hero image...');
                
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
                            console.log(`✗ Skipped author avatar/logo (keyword: ${keyword})`);
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
                                console.log(`✗ Skipped author avatar/logo (parent ${level + 1} has keyword: ${keyword})`);
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
                            console.log(`✗ Skipped small image (possible avatar): ${width}x${height}px`);
                            return true;
                        }
                        
                        // 檢查是否為圓形或接近正方形（頭像特徵）
                        const aspectRatio = width / height;
                        const borderRadius = window.getComputedStyle(img).borderRadius;
                        
                        if (aspectRatio >= 0.9 && aspectRatio <= 1.1 && 
                            width < 400 && height < 400 &&
                            borderRadius && (borderRadius === '50%' || parseInt(borderRadius) >= width / 2)) {
                            console.log(`✗ Skipped circular/square image (likely avatar): ${width}x${height}px, border-radius: ${borderRadius}`);
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
                        if (value && value.trim() && !value.startsWith('data:')) {
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
                                        console.log(`✓ Found featured image via selector: ${selector}`);
                                        console.log(`  Image URL: ${cleanedUrl}`);
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
                
                console.log('✗ No featured image found');
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
                console.log(`📊 Selecting best icon from ${candidates.length} candidates...`);
                
                if (candidates.length === 0) return null;
                if (candidates.length === 1) {
                    console.log('✓ Only one candidate, selected by default');
                    return candidates[0];
                }
                
                // 評分系統
                const scored = candidates.map(icon => {
                    let score = 0;
                    const url = icon.url.toLowerCase();
                    
                    // 1. 格式評分（最重要）
                    if (url.endsWith('.svg') || url.includes('image/svg') || icon.type.includes('svg')) {
                        score += 1000; // SVG 矢量圖，完美縮放
                        console.log(`  ${icon.url.substring(0, 60)}...: +1000 (SVG format)`);
                    } else if (url.endsWith('.png') || icon.type.includes('png')) {
                        score += 500; // PNG 較好
                        console.log(`  ${icon.url.substring(0, 60)}...: +500 (PNG format)`);
                    } else if (url.endsWith('.ico') || icon.type.includes('ico')) {
                        score += 100; // ICO 可用但較舊
                        console.log(`  ${icon.url.substring(0, 60)}...: +100 (ICO format)`);
                    } else if (url.endsWith('.jpg') || url.endsWith('.jpeg') || icon.type.includes('jpeg')) {
                        score += 200; // JPEG 可用但不如 PNG
                        console.log(`  ${icon.url.substring(0, 60)}...: +200 (JPEG format)`);
                    }
                    
                    // 2. 尺寸評分（第二重要）
                    const size = icon.size || 0;
                    if (size === 999) {
                        // SVG "any" 尺寸
                        score += 500;
                        console.log(`  ${icon.url.substring(0, 60)}...: +500 (any size - SVG)`);
                    } else if (size >= 180 && size <= 256) {
                        // 理想尺寸範圍（180x180 到 256x256）
                        score += 300;
                        console.log(`  ${icon.url.substring(0, 60)}...: +300 (ideal size: ${size}x${size})`);
                    } else if (size > 256) {
                        // 太大（可能影響性能，但質量好）
                        score += 200;
                        console.log(`  ${icon.url.substring(0, 60)}...: +200 (large size: ${size}x${size})`);
                    } else if (size >= 120) {
                        // 中等尺寸（可接受）
                        score += 100;
                        console.log(`  ${icon.url.substring(0, 60)}...: +100 (medium size: ${size}x${size})`);
                    } else if (size > 0) {
                        // 小尺寸（不理想）
                        score += 50;
                        console.log(`  ${icon.url.substring(0, 60)}...: +50 (small size: ${size}x${size})`);
                    }
                    
                    // 3. 類型評分（第三重要）
                    if (icon.iconType === 'apple-touch') {
                        score += 50; // Apple Touch Icon 通常質量較好
                        console.log(`  ${icon.url.substring(0, 60)}...: +50 (apple-touch-icon)`);
                    }
                    
                    // 4. 優先級評分（最後考量）
                    // 較低的 priority 值表示更高的優先級
                    score += (10 - icon.priority) * 10;
                    
                    console.log(`  Total score: ${score}`);
                    return { ...icon, score };
                });
                
                // 按分數排序（降序）
                scored.sort((a, b) => b.score - a.score);
                
                const best = scored[0];
                console.log(`✓ Best icon selected: ${best.url} (score: ${best.score})`);
                
                // 顯示其他候選的分數（用於調試）
                if (scored.length > 1) {
                    console.log('  Other candidates:');
                    scored.slice(1, 4).forEach((icon, idx) => {
                        console.log(`    ${idx + 2}. ${icon.url.substring(0, 50)}... (score: ${icon.score})`);
                    });
                    if (scored.length > 4) {
                        console.log(`    ... and ${scored.length - 4} more`);
                    }
                }
                
                return best;
            }
            
            // 提取網站 Icon/Favicon
            function collectSiteIcon() {
                console.log('🎯 Attempting to collect site icon/favicon...');
                
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
                        const elements = cachedQuery(selector, document);
                        for (const element of elements) {
                            const iconUrl = element.getAttribute(attr);
                            if (iconUrl && iconUrl.trim() && !iconUrl.startsWith('data:')) {
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
                                    
                                    console.log(`✓ Found icon: ${absoluteUrl.substring(0, 60)}... (${sizes || 'no size'}, ${type || 'no type'})`);
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
                console.log('⚠️ No icons found in HTML declarations, falling back to default favicon.ico');
                try {
                    const defaultFavicon = new URL('/favicon.ico', document.baseURI).href;
                    console.log(`✓ Using default favicon: ${defaultFavicon}`);
                    return defaultFavicon;
                } catch (e) {
                    console.warn('Failed to construct default favicon URL:', e);
                }
                
                console.log('✗ No site icon found');
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
                    
                    console.log(`🔍 Technical doc detection: URL=${hasUrlPattern}, Title=${hasTitlePattern}, URL="${url}"`);
                    return hasUrlPattern || hasTitlePattern;
                }
                
                // Emergency extraction 函數 - 用於技術文檔
                function extractEmergencyContent() {
                    console.log('🆘 Using emergency extraction for technical documentation...');
                    
                    // 等待動態內容載入（特別針對 gemini-cli 這種懶載入頁面）
                    function waitForContent(maxAttempts = 10) {
                        for (let attempt = 0; attempt < maxAttempts; attempt++) {
                            const textLength = document.body.textContent?.trim()?.length || 0;
                            console.log(`🔄 Attempt ${attempt + 1}/${maxAttempts}: Found ${textLength} characters`);
                            
                            // 如果內容足夠多，停止等待
                            if (textLength > 3000) {
                                console.log(`✅ Content loaded successfully: ${textLength} chars`);
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
                                        console.log('🎯 Method 1: Triggered document selection');
                                        
                                        // 稍後清除選擇
                                        setTimeout(() => {
                                            try { selection.removeAllRanges(); } catch (e) {}
                                        }, 50);
                                    }
                                    
                                    // 方法2：觸發滾動事件
                                    if (attempt === 1) {
                                        window.scrollTo(0, document.body.scrollHeight);
                                        window.scrollTo(0, 0);
                                        console.log('🎯 Method 2: Triggered scroll events');
                                    }
                                    
                                    // 方法3：觸發點擊事件
                                    if (attempt === 2) {
                                        const clickableElements = document.querySelectorAll('button, [role="button"], .expand, .show-more');
                                        if (clickableElements.length > 0) {
                                            clickableElements[0].click();
                                            console.log('🎯 Method 3: Clicked expandable element');
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
                        console.log(`🏁 Final content length: ${finalLength} characters`);
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
                                console.log(`✅ Found technical content with selector: ${selector} (${text.length} chars)`);
                                return element.innerHTML;
                            }
                        }
                    }
                    
                    // 2. 使用 TreeWalker 進行深度搜索
                    console.log('🔄 Using TreeWalker for deep content search...');
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
                    let node;
                    
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
                        console.log(`🎯 Emergency extraction found content: ${text ? text.length : 0} chars, score: ${maxScore}`);
                        return bestElement.innerHTML;
                    }
                    
                    console.log('❌ Emergency extraction failed');
                    return null;
                }
                
                finalContent = null;
                finalTitle = document.title;
                
                // 決定使用哪種提取策略
                if (isTechnicalDoc()) {
                    console.log('📋 Technical documentation detected, using emergency extraction');
                    finalContent = extractEmergencyContent();
                    
                    // 如果 emergency extraction 失敗，仍然嘗試 Readability
                    if (!finalContent) {
                        console.log('🔄 Emergency extraction failed, falling back to Readability...');
                    } else {
                        console.log(`✅ Emergency extraction succeeded with ${finalContent.length} chars, skipping Readability`);
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
                    links.forEach(link => linkTextLength += link.textContent.length);
                    const linkDensity = linkTextLength / article.length;
                    return linkDensity <= MAX_LINK_DENSITY;
                }
                
                let article = null;
                
                // 如果不是技術文檔或 emergency extraction 失敗，使用 Readability
                if (!finalContent) {
                    console.log('📖 Using Readability.js for content extraction');
                    article = new Readability(document.cloneNode(true)).parse();
                    
                    if (isContentGood(article)) {
                        finalContent = article.content;
                        finalTitle = article.title;
                    } else {
                        console.log('🔄 Readability.js failed, trying CMS-aware fallback...');
                        // 將使用下面的備用方案邏輯
                    }
                }
                
                // 輔助函數：清理文本內容
                function cleanTextContent(text) {
                    if (!text) return '';
                    
                    return text
                        .replace(/\s+/g, ' ')  // 將多個空白字符替換為單個空格
                        .replace(/[\u00A0]/g, ' ')  // 替換不間斷空格
                        .trim();
                }

                // 輔助函數：檢查文本是否有實際內容
                function hasActualContent(text) {
                    if (!text) return false;
                    const cleaned = cleanTextContent(text);
                    return cleaned.length > 0 && cleaned !== '•' && !/^[•\-\*\s]*$/.test(cleaned);
                }

                // 輔助函數：計算元素的列表嵌套深度
                function getListDepth(element) {
                    let depth = 0;
                    let parent = element.parentElement;
                    while (parent && parent !== document.body) {
                        if (parent.tagName === 'LI') {
                            depth++;
                        }
                        parent = parent.parentElement;
                    }
                    return depth;
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
                
                // 將 Markdown 轉換為 Notion 區塊
                function convertMarkdownToNotionBlocks(markdown) {
                    const blocks = [];
                    const lines = markdown.split('\n');
                    let currentParagraph = '';
                    let inCodeBlock = false;
                    let codeContent = '';
                    let codeLanguage = 'plain text';
                    
                    console.log(`🔄 Converting Markdown to Notion blocks: ${lines.length} lines`);
                    
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i];
                        const trimmedLine = line.trim();
                        
                        // 處理代碼區塊
                        if (trimmedLine.startsWith('```')) {
                            if (inCodeBlock) {
                                // 結束代碼區塊
                                if (codeContent.trim()) {
                                    blocks.push({
                                        object: 'block',
                                        type: 'code',
                                        code: {
                                            rich_text: [{ type: 'text', text: { content: codeContent.trim() } }],
                                            language: codeLanguage
                                        }
                                    });
                                }
                                inCodeBlock = false;
                                codeContent = '';
                                codeLanguage = 'plain text';
                            } else {
                                // 開始代碼區塊
                                // 先保存當前段落
                                if (currentParagraph.trim()) {
                                    blocks.push({
                                        object: 'block',
                                        type: 'paragraph',
                                        paragraph: {
                                            rich_text: [{ type: 'text', text: { content: currentParagraph.trim() } }]
                                        }
                                    });
                                    currentParagraph = '';
                                }
                                inCodeBlock = true;
                                // 提取語言（如果有）
                                const lang = trimmedLine.substring(3).trim();
                                if (lang) {
                                    codeLanguage = lang;
                                }
                            }
                            continue;
                        }
                        
                        if (inCodeBlock) {
                            codeContent += line + '\n';
                            continue;
                        }
                        
                        // 處理標題
                        if (trimmedLine.startsWith('#')) {
                            // 先保存當前段落
                            if (currentParagraph.trim()) {
                                blocks.push({
                                    object: 'block',
                                    type: 'paragraph',
                                    paragraph: {
                                        rich_text: [{ type: 'text', text: { content: currentParagraph.trim() } }]
                                    }
                                });
                                currentParagraph = '';
                            }
                            
                            // 計算標題級別
                            const level = Math.min(3, trimmedLine.match(/^#+/)[0].length);
                            const headingText = trimmedLine.replace(/^#+\s*/, '');
                            
                            if (headingText) {
                                blocks.push({
                                    object: 'block',
                                    type: `heading_${level}`,
                                    [`heading_${level}`]: {
                                        rich_text: [{ type: 'text', text: { content: headingText } }]
                                    }
                                });
                            }
                            continue;
                        }
                        
                        // 處理列表項
                        if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ') || /^\d+\.\s/.test(trimmedLine)) {
                            // 先保存當前段落
                            if (currentParagraph.trim()) {
                                blocks.push({
                                    object: 'block',
                                    type: 'paragraph',
                                    paragraph: {
                                        rich_text: [{ type: 'text', text: { content: currentParagraph.trim() } }]
                                    }
                                });
                                currentParagraph = '';
                            }
                            
                            // 提取列表項文本
                            let listText = '';
                            if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
                                listText = trimmedLine.substring(2).trim();
                            } else {
                                listText = trimmedLine.replace(/^\d+\.\s/, '');
                            }
                            
                            // 處理加粗格式 **text**
                            const richText = [];
                            const parts = listText.split(/(\*\*[^*]+\*\*)/);
                            
                            for (const part of parts) {
                                if (part.startsWith('**') && part.endsWith('**')) {
                                    // 加粗文本
                                    const boldText = part.slice(2, -2);
                                    richText.push({
                                        type: 'text',
                                        text: { content: boldText },
                                        annotations: { bold: true }
                                    });
                                } else if (part) {
                                    // 普通文本
                                    richText.push({
                                        type: 'text',
                                        text: { content: part }
                                    });
                                }
                            }
                            
                            blocks.push({
                                object: 'block',
                                type: 'bulleted_list_item',
                                bulleted_list_item: {
                                    rich_text: richText.length > 0 ? richText : [{ type: 'text', text: { content: listText } }]
                                }
                            });
                            continue;
                        }
                        
                        // 處理空行
                        if (!trimmedLine) {
                            if (currentParagraph.trim()) {
                                blocks.push({
                                    object: 'block',
                                    type: 'paragraph',
                                    paragraph: {
                                        rich_text: [{ type: 'text', text: { content: currentParagraph.trim() } }]
                                    }
                                });
                                currentParagraph = '';
                            }
                            continue;
                        }
                        
                        // 累積段落內容
                        if (currentParagraph) {
                            currentParagraph += ' ' + trimmedLine;
                        } else {
                            currentParagraph = trimmedLine;
                        }
                    }
                    
                    // 處理最後的段落
                    if (currentParagraph.trim()) {
                        blocks.push({
                            object: 'block',
                            type: 'paragraph',
                            paragraph: {
                                rich_text: [{ type: 'text', text: { content: currentParagraph.trim() } }]
                            }
                        });
                    }
                    
                    // 處理未結束的代碼區塊
                    if (inCodeBlock && codeContent.trim()) {
                        blocks.push({
                            object: 'block',
                            type: 'code',
                            code: {
                                rich_text: [{ type: 'text', text: { content: codeContent.trim() } }],
                                language: codeLanguage
                            }
                        });
                    }
                    
                    console.log(`✅ Converted Markdown to ${blocks.length} Notion blocks`);
                    return blocks;
                }

                // 轉換為 Notion 格式的函數
                function convertHtmlToNotionBlocks(html) {
                    console.log(`🔄 Converting HTML to Notion blocks: ${html.length} chars`);
                    
                    // 🎯 新策略：對於 Markdown 網站，嘗試獲取原始 Markdown 源碼
                    const currentUrl = window.location.href;
                    
                    // 檢查是否是 GitHub Pages 或類似的 Markdown 網站
                    if (currentUrl.includes('github.io') || currentUrl.includes('docs')) {
                        console.log('🔍 Detected potential Markdown website, attempting to fetch source...');
                        
                        // 嘗試構建原始 Markdown URL
                        let markdownUrl = null;
                        
                        if (currentUrl.includes('google-gemini.github.io/gemini-cli')) {
                            markdownUrl = 'https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/cli/commands.md';
                        }
                        // 可以添加更多網站的規則
                        
                        if (markdownUrl) {
                            console.log(`🔄 Attempting to fetch Markdown from: ${markdownUrl}`);
                            
                            // 使用同步方法嘗試獲取（在 executeScript 上下文中）
                            try {
                                const xhr = new XMLHttpRequest();
                                xhr.open('GET', markdownUrl, false); // 同步請求
                                xhr.send();
                                
                                if (xhr.status === 200) {
                                    const markdown = xhr.responseText;
                                    console.log(`✅ Successfully fetched original Markdown: ${markdown.length} chars`);
                                    
                                    // 將 Markdown 轉換為 Notion 區塊
                                    return convertMarkdownToNotionBlocks(markdown);
                                }
                            } catch (error) {
                                console.warn('Failed to fetch original Markdown:', error);
                            }
                        }
                    }
                    
                    // 回退到 HTML 處理
                    const blocks = [];
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = html;
                    
                    // 嘗試提取純文本並簡單處理
                    const fullText = tempDiv.textContent || tempDiv.innerText || '';
                    console.log(`📝 Extracted full text: ${fullText.length} chars`);
                    
                    if (fullText.length > 500) {
                        // 將文本按段落分割，保持原有的結構
                        const lines = fullText.split('\n').filter(line => line.trim());
                        console.log(`📋 Processing ${lines.length} lines`);
                        
                        let currentParagraph = '';
                        const maxLineLength = 1500; // 較大的段落長度限制
                        
                        lines.forEach((line, index) => {
                            const trimmedLine = line.trim();
                            
                            // 跳過空行和很短的行
                            if (!trimmedLine || trimmedLine.length < 3) return;
                            
                            // 檢查是否是標題（基於內容判斷）
                            const isTitle = (
                                /^[A-Z][^.!?]*$/.test(trimmedLine) && trimmedLine.length < 100 &&
                                (trimmedLine.includes('commands') || trimmedLine.includes('Commands') || 
                                 trimmedLine.includes('/') || trimmedLine.includes('@') || trimmedLine.includes('!'))
                            ) || trimmedLine.startsWith('# ') || /^[A-Z][A-Za-z\s\/\(\)@!]+$/.test(trimmedLine);
                            
                            if (isTitle && trimmedLine.length < 100) {
                                // 先保存當前段落（如果有內容）
                                if (currentParagraph.trim()) {
                                    blocks.push({
                                        object: 'block',
                                        type: 'paragraph',
                                        paragraph: {
                                            rich_text: [{ type: 'text', text: { content: currentParagraph.trim() } }]
                                        }
                                    });
                                    currentParagraph = '';
                                }
                                
                                // 添加標題
                                blocks.push({
                                    object: 'block',
                                    type: 'heading_2',
                                    heading_2: {
                                        rich_text: [{ type: 'text', text: { content: trimmedLine } }]
                                    }
                                });
                            } else {
                                // 累積段落內容，保持原有的格式
                                if (currentParagraph) {
                                    currentParagraph += '\n' + line; // 保持原有的縮進
                                } else {
                                    currentParagraph = line;
                                }
                                
                                // 如果段落太長，就分割
                                if (currentParagraph.length > maxLineLength) {
                                    blocks.push({
                                        object: 'block',
                                        type: 'paragraph',
                                        paragraph: {
                                            rich_text: [{ type: 'text', text: { content: currentParagraph.trim() } }]
                                        }
                                    });
                                    currentParagraph = '';
                                }
                            }
                        });
                        
                        // 添加最後一個段落
                        if (currentParagraph.trim()) {
                            blocks.push({
                                object: 'block',
                                type: 'paragraph',
                                paragraph: {
                                    rich_text: [{ type: 'text', text: { content: currentParagraph.trim() } }]
                                }
                            });
                        }
                        
                        console.log(`✅ Simple processing: ${blocks.length} blocks created`);
                        return blocks;
                    }
                    
                    // 最終回退
                    console.log(`❌ All methods failed, returning simple text block`);
                    return [{
                        object: 'block',
                        type: 'paragraph',
                        paragraph: {
                            rich_text: [{ type: 'text', text: { content: html.substring(0, 2000) } }]
                        }
                    }];
                }
                
                if (article && isContentGood(article)) {
                    finalContent = article.content;
                    finalTitle = article.title;
                } else if (article) {
                    console.log('🔄 Readability.js failed, trying CMS-aware fallback...');
                    
                    // 只有在 emergency extraction 也失敗時才使用備用方案
                    if (!finalContent) {
                        // 備用方案：使用更全面的選擇器列表
                    const fallbackSelectors = [
                        // WordPress 和 CMS 模式
                        '.entry-content', '.post-content', '.article-content', '.content-area', '.single-content',
                        '.main-content', '.page-content', '.content-wrapper', '.article-wrapper', '.post-wrapper',
                        '.content-body', '.article-text', '.post-text', '.content-main', '.article-main',
                        // 移動版常用選擇器
                        '.mobile-content', '.m-content', '.content', '.text-content', '.article-detail',
                        '.post-detail', '.detail-content', '.news-content', '.story-content',
                        // 文章結構
                        'article[role="main"]', 'article.post', 'article.article', 'article.content', 'article.entry',
                        '.post-body', '.article-body', '.entry-body', '.news-body', '.story-body',
                        '.content-text', '.article-container', '.post-container', '.content-container',
                        // 通用選擇器
                        'article', 'main article', '.article', '.post', '.entry', '.news', '.story',
                        // ID 選擇器
                        '#content', '#main-content', '#article-content', '#post-content', '#article', '#post', '#main'
                    ];
                    
                    for (const selector of fallbackSelectors) {
                        const element = cachedQuery(selector, document, { single: true });
                        if (element) {
                            const textLength = element.textContent.trim().length;
                            console.log(`🔍 Checking selector "${selector}": ${textLength} characters`);
                            if (textLength >= 250) {
                                console.log(`✅ Found content with selector: ${selector} (${textLength} chars)`);
                                finalContent = element.innerHTML;
                                break;
                            }
                        }
                    }
                    
                    // 最後的嘗試：通用內容查找
                    if (!finalContent) {
                        console.log('🆘 Trying generic content finder with lower standards...');
                        const candidates = cachedQuery('article, section, main, div', document);
                        let bestElement = null;
                        let maxScore = 0;
                        
                        for (const el of candidates) {
                            const text = el.textContent?.trim() || '';
                            if (text.length < 100) continue; // 降低標準到 100 字符
                            
                            const paragraphs = cachedQuery('p', el).length;
                            const images = cachedQuery('img', el).length;
                            const links = cachedQuery('a', el).length;
                            
                            const score = text.length + (paragraphs * 50) + (images * 30) - (links * 25);
                            
                            if (score > maxScore) {
                                if (bestElement && el.contains(bestElement)) continue;
                                maxScore = score;
                                bestElement = el;
                            }
                        }
                        
                        if (bestElement) {
                            console.log(`🎯 Emergency fallback: Found content with ${bestElement.textContent.trim().length} characters`);
                            finalContent = bestElement.innerHTML;
                        }
                    }
                    } // 結束 emergency extraction 檢查的條件塊
                }
                
                if (finalContent) {
                    const blocks = convertHtmlToNotionBlocks(finalContent);
                    
                    // v2.5.6: 優先添加封面圖
                    console.log('=== v2.5.6: Featured Image Collection ===');
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
                            console.log('✓ Featured image added as first block');
                        } else {
                            console.log('✗ Featured image already exists in blocks, skipped');
                        }
                    }
                    
                    // v2.6.0: 提取網站 Icon
                    console.log('=== v2.6.0: Site Icon Collection ===');
                    const siteIconUrl = collectSiteIcon();
                    
                    // 輸出性能統計（如果可用）
                    if (performanceOptimizer) {
                        try {
                            const performanceStats = performanceOptimizer.getPerformanceStats();
                            console.log('🚀 Performance Stats:', performanceStats);
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
        }, ['lib/Readability.js', 'scripts/performance/PerformanceOptimizer.js']);
        } catch (scriptError) {
            console.error('❌ Content extraction script execution failed:', scriptError);
            result = {
                title: 'Content Extraction Failed',
                blocks: [{
                    object: 'block',
                    type: 'paragraph',
                    paragraph: {
                        rich_text: [{
                            type: 'text',
                            text: { content: `Content extraction failed: ${scriptError.message || 'Unknown error'}` }
                        }]
                    }
                }]
            };
        }

        if (!result || !result.title || !result.blocks) {
            console.error('❌ Content extraction result validation failed:', {
                result: result,
                resultType: typeof result,
                hasResult: !!result,
                hasTitle: !!(result && result.title),
                hasBlocks: !!(result && result.blocks),
                blocksLength: result && result.blocks ? result.blocks.length : 'N/A',
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
        // --- DEBUG HELPER: 保存最新的 content extraction 結果到 chrome.storage.local，並在 service worker console 輸出 ---
        try {
            try {
                const debugData = {
                    title: contentResult.title,
                    blocks: contentResult.blocks,
                    url: normUrl,
                    timestamp: Date.now()
                };

                // 儲存到 chrome.storage.local，方便在擴展 Inspect Service Worker 或 popup 中取用
                try {
                    chrome.storage.local.set({ '__debug_last_extraction__': debugData }, () => {
                        if (chrome.runtime.lastError) {
                            console.warn('🧪 Debug: failed to save last extraction to storage:', chrome.runtime.lastError);
                        } else {
                            console.log('🧪 Debug: saved last extraction to chrome.storage.local');
                        }
                    });
                } catch (e) {
                    console.warn('🧪 Debug: chrome.storage.local.set threw:', e);
                }

                // 在 service worker console 輸出一份摘要（避免一次列印大量 block）
                try {
                    const summary = {
                        title: debugData.title,
                        url: debugData.url,
                        timestamp: new Date(debugData.timestamp).toISOString(),
                        blockCount: Array.isArray(debugData.blocks) ? debugData.blocks.length : 0,
                        sampleBlocks: Array.isArray(debugData.blocks) ? debugData.blocks.slice(0, 6) : []
                    };
                    console.log('🧪 Debug - last extraction summary:', summary);
                } catch (e) {
                    console.warn('🧪 Debug: failed to build debug summary', e);
                }
            } catch (e) {
                console.warn('🧪 Debug: error preparing debug extraction data', e);
            }
        } catch (e) {
            // 安全保護：不可讓 debug 影響正常流程
            console.warn('🧪 Debug helper failed:', e);
        }
        
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
        if (savedData && savedData.notionPageId) {
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
                console.log('Notion page was deleted, clearing local state and creating new page');
                clearPageState(normUrl);
                await clearPageHighlights(activeTab.id);
                
                saveToNotion(contentResult.title, contentResult.blocks, normUrl, config.notionApiKey, config.notionDatabaseId, (response) => {
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
            saveToNotion(contentResult.title, contentResult.blocks, normUrl, config.notionApiKey, config.notionDatabaseId, (response) => {
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
  console.log('Notion Smart Clipper extension installed/updated');
  
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
  console.log(`擴展已更新: ${previousVersion} → ${currentVersion}`);
  
  // 檢查是否需要顯示更新說明
  if (shouldShowUpdateNotification(previousVersion, currentVersion)) {
    await showUpdateNotification(previousVersion, currentVersion);
  }
}

/**
 * 處理擴展安裝
 */
async function handleExtensionInstall() {
  console.log('擴展首次安裝');
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
        console.log('發送更新信息失敗:', err);
      });
    }, 1000);
    
    console.log('已顯示更新通知頁面');
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
                console.log('✅ Opened Notion page in new tab:', url);
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
    appendBlocksInBatches
  };
}
