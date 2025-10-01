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

/**
 * 檢查 URL 是否為有效的圖片格式
 */
function isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    // 先清理 URL
    const cleanedUrl = cleanImageUrl(url);
    if (!cleanedUrl) return false;
    
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
    
    return imagePathPatterns.some(pattern => pattern.test(cleanedUrl));
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
     */
    static async injectHighlighter(tabId) {
        return this.injectAndExecute(
            tabId,
            ['scripts/utils.js', 'scripts/highlighter.js'],
            () => {
                if (window.initHighlighter) {
                    window.initHighlighter();
                }
            },
            {
                errorMessage: 'Failed to inject highlighter',
                successMessage: 'Highlighter injected and initialized successfully'
            }
        );
    }

    /**
     * 注入並收集標記
     */
    static async collectHighlights(tabId) {
        return this.injectAndExecute(
            tabId,
            ['scripts/utils.js', 'scripts/highlighter.js'],
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
     */
    static async clearPageHighlights(tabId) {
        return this.injectAndExecute(
            tabId,
            ['scripts/utils.js', 'scripts/highlighter.js'],
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
    chrome.storage.local.remove([`saved_${pageUrl}`]);
    console.log('Cleared local state for:', pageUrl);
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
        const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Notion-Version': '2022-06-28'
            }
        });

        if (response.ok) {
            const pageData = await response.json();
            return !pageData.archived;
        } else if (response.status === 404) {
            return false;
        } else {
            return false;
        }
    } catch (error) {
        console.error('Error checking page existence:', error);
        return false;
    }
}

/**
 * Saves new content to Notion as a new page
 */
async function saveToNotion(title, blocks, pageUrl, apiKey, databaseId, sendResponse) {
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
            const notionPageId = responseData.id;

            setSavedPageData(pageUrl, {
                title: title,
                savedAt: Date.now(),
                notionPageId: notionPageId,
                notionUrl: responseData.url || null
            }, () => {
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
            case 'startHighlight':
                handleStartHighlight(sendResponse);
                break;
            case 'updateHighlights':
                handleUpdateHighlights(sendResponse);
                break;
            case 'savePage':
                handleSavePage(sendResponse);
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

                        sendResponse({
                            success: true,
                            isSaved: false,
                            url: normUrl,
                            title: activeTab.title,
                            wasDeleted: true
                        });
                    } else {
                        sendResponse({
                            success: true,
                            isSaved: true,
                            url: normUrl,
                            title: activeTab.title
                        });
                    }
                } catch (error) {
                    console.error('Error checking page status:', error);
                    sendResponse({
                        success: true,
                        isSaved: true,
                        url: normUrl,
                        title: activeTab.title
                    });
                }
            } else {
                sendResponse({
                    success: true,
                    isSaved: !!savedData,
                    url: normUrl,
                    title: activeTab.title
                });
            }
        } else {
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

        // 注入並執行內容提取
        const result = await ScriptInjector.injectWithResponse(activeTab.id, () => {
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

            function isValidImageUrl(url) {
                if (!url || typeof url !== 'string') return false;
                
                // 先清理 URL
                const cleanedUrl = cleanImageUrl(url);
                if (!cleanedUrl) return false;
                
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
                
                return imagePathPatterns.some(pattern => pattern.test(cleanedUrl));
            }
            
            // 執行內容提取邏輯（從 content.js 中提取的核心邏輯）
            try {
                // 首先嘗試使用 Readability.js
                const article = new Readability(document.cloneNode(true)).parse();
                
                // 檢查內容品質的函數
                function isContentGood(article) {
                    const MIN_CONTENT_LENGTH = 250;
                    const MAX_LINK_DENSITY = 0.3;
                    
                    if (!article || !article.content || article.length < MIN_CONTENT_LENGTH) return false;
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = article.content;
                    const links = tempDiv.querySelectorAll('a');
                    let linkTextLength = 0;
                    links.forEach(link => linkTextLength += link.textContent.length);
                    const linkDensity = linkTextLength / article.length;
                    return linkDensity <= MAX_LINK_DENSITY;
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
                
                // 轉換為 Notion 格式的函數
                function convertHtmlToNotionBlocks(html) {
                    const blocks = [];
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = html;
                    
                    function processNode(node) {
                        if (node.nodeType !== 1) return;
                        const textContent = node.textContent?.trim();
                        
                        switch (node.nodeName) {
                            case 'H1': case 'H2': case 'H3':
                                if (textContent) {
                                    // 標題也需要處理長度限制
                                    const headingChunks = splitTextForNotion(textContent, 2000);
                                    headingChunks.forEach((chunk, index) => {
                                        blocks.push({
                                            object: 'block',
                                            type: index === 0 ? `heading_${node.nodeName[1]}` : 'paragraph',
                                            [index === 0 ? `heading_${node.nodeName[1]}` : 'paragraph']: {
                                                rich_text: [{ type: 'text', text: { content: chunk } }]
                                            }
                                        });
                                    });
                                }
                                break;
                            case 'P':
                                if (textContent) {
                                    // 將長段落分割成多個段落
                                    const paragraphChunks = splitTextForNotion(textContent, 2000);
                                    paragraphChunks.forEach(chunk => {
                                        blocks.push({
                                            object: 'block',
                                            type: 'paragraph',
                                            paragraph: {
                                                rich_text: [{ type: 'text', text: { content: chunk } }]
                                            }
                                        });
                                    });
                                }
                                break;
                            case 'IMG':
                                const src = node.src || node.getAttribute('data-src');
                                if (src) {
                                    try {
                                        const absoluteUrl = new URL(src, document.baseURI).href;
                                        const cleanedUrl = cleanImageUrl(absoluteUrl);
                                        
                                        if (cleanedUrl && isValidImageUrl(cleanedUrl)) {
                                            blocks.push({
                                                object: 'block',
                                                type: 'image',
                                                image: {
                                                    type: 'external',
                                                    external: { url: cleanedUrl }
                                                }
                                            });
                                        }
                                    } catch (e) {
                                        console.warn('Failed to process image URL:', src);
                                    }
                                }
                                break;
                            default:
                                if (node.childNodes.length > 0) {
                                    node.childNodes.forEach(processNode);
                                }
                                break;
                        }
                    }
                    
                    tempDiv.childNodes.forEach(processNode);
                    return blocks;
                }
                
                let finalTitle = document.title;
                let finalContent = null;
                
                if (isContentGood(article)) {
                    finalContent = article.content;
                    finalTitle = article.title;
                } else {
                    // 備用方案：查找主要內容
                    const candidates = document.querySelectorAll('article, main, .content, .post-content, .entry-content');
                    for (const candidate of candidates) {
                        if (candidate.textContent.trim().length > 250) {
                            finalContent = candidate.innerHTML;
                            break;
                        }
                    }
                }
                
                if (finalContent) {
                    const blocks = convertHtmlToNotionBlocks(finalContent);
                    return { title: finalTitle, blocks: blocks };
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
        }, ['lib/Readability.js']);

        if (!result || !result.title || !result.blocks) {
            sendResponse({ success: false, error: 'Could not parse the article content.' });
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
                });
            }
        } else {
            saveToNotion(contentResult.title, contentResult.blocks, normUrl, config.notionApiKey, config.notionDatabaseId, (response) => {
                if (response.success) {
                    response.imageCount = imageCount;
                    response.blockCount = contentResult.blocks.length;
                    response.created = true;
                }
                sendResponse(response);
            });
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
chrome.runtime.onInstalled.addListener(() => {
  console.log('Notion Smart Clipper extension installed/updated');
});

// Setup all services
setupMessageHandlers();
setupTabListeners();
