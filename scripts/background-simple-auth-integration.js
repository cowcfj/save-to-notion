// ==========================================
// SIMPLE AUTH INTEGRATION FOR BACKGROUND SCRIPT
// ==========================================

// 這個文件包含將簡化授權系統整合到現有 Background Script 的代碼
// 可以直接複製到 scripts/background.js 中替換相關部分

// 全局簡化授權管理器實例
let simpleAuthManager = null;

// 載入簡化授權管理器
async function initializeSimpleAuthManager() {
    try {
        // 載入簡化授權模組
        importScripts('./notion-simple-auth.js');
        
        // 創建實例
        simpleAuthManager = new NotionSimpleAuth();
        
        // 初始化
        const success = await simpleAuthManager.initialize();
        
        console.log('✅ [Background] 簡化授權管理器載入成功');
        
        if (success) {
            console.log('✅ [Background] 簡化授權管理器初始化成功');
            console.log(`📋 [Background] 授權方式: ${simpleAuthManager.getAuthMethod()}`);
        } else {
            console.log('ℹ️ [Background] 簡化授權管理器初始化完成，但用戶未授權');
        }
        
        return success;
        
    } catch (error) {
        console.warn('⚠️ [Background] 簡化授權管理器載入失敗，將使用傳統模式:', error);
        return false;
    }
}

// 更新的 getApiKey 函數 - 整合簡化授權
async function getApiKey() {
    try {
        // 優先使用簡化授權管理器
        if (simpleAuthManager && simpleAuthManager.isAuthorized()) {
            const apiKey = simpleAuthManager.getApiKey();
            if (apiKey) {
                console.log('✅ [Background] 使用簡化授權管理器獲取 API 金鑰');
                return apiKey;
            }
        }
        
        // 回退到混合授權管理器（如果存在）
        if (typeof hybridAuthManager !== 'undefined' && hybridAuthManager) {
            const apiKey = await hybridAuthManager.getApiKey();
            if (apiKey) {
                console.log('✅ [Background] 使用混合授權管理器獲取 API 金鑰');
                return apiKey;
            }
        }
        
        // 最後回退到傳統方式
        console.log('🔄 [Background] 回退到傳統 API 金鑰獲取方式');
        const config = await new Promise(resolve => getConfig(['notionApiKey'], resolve));
        return config.notionApiKey || null;
        
    } catch (error) {
        console.error('❌ [Background] 獲取 API 金鑰失敗:', error);
        return null;
    }
}

// 更新的 getDatabaseId 函數 - 整合簡化授權
async function getDatabaseId() {
    try {
        // 優先使用簡化授權管理器
        if (simpleAuthManager && simpleAuthManager.isAuthorized()) {
            const databaseId = simpleAuthManager.getDatabaseId();
            if (databaseId) {
                console.log('✅ [Background] 使用簡化授權管理器獲取資料庫 ID');
                return databaseId;
            }
        }
        
        // 回退到傳統方式
        console.log('🔄 [Background] 回退到傳統資料庫 ID 獲取方式');
        const config = await new Promise(resolve => getConfig(['notionDatabaseId'], resolve));
        return config.notionDatabaseId || null;
        
    } catch (error) {
        console.error('❌ [Background] 獲取資料庫 ID 失敗:', error);
        return null;
    }
}

// 新增：檢查授權狀態函數
async function checkAuthStatus() {
    try {
        const status = {
            isAuthenticated: false,
            authMethod: null,
            userInfo: null,
            hasApiKey: false,
            hasDatabaseId: false,
            timestamp: new Date().toISOString()
        };
        
        // 檢查簡化授權管理器
        if (simpleAuthManager && simpleAuthManager.isAuthorized()) {
            status.isAuthenticated = true;
            status.authMethod = simpleAuthManager.getAuthMethod();
            status.userInfo = simpleAuthManager.getUserDisplayInfo();
            status.hasApiKey = !!simpleAuthManager.getApiKey();
            status.hasDatabaseId = !!simpleAuthManager.getDatabaseId();
            
            console.log('✅ [Background] 簡化授權狀態檢查完成');
            return status;
        }
        
        // 回退到混合授權管理器
        if (typeof hybridAuthManager !== 'undefined' && hybridAuthManager) {
            try {
                const hybridStatus = await hybridAuthManager.checkAuthStatus();
                if (hybridStatus.isAuthenticated) {
                    status.isAuthenticated = true;
                    status.authMethod = 'hybrid';
                    status.userInfo = hybridStatus.userInfo;
                    status.hasApiKey = true;
                    
                    console.log('✅ [Background] 混合授權狀態檢查完成');
                    return status;
                }
            } catch (error) {
                console.warn('⚠️ [Background] 混合授權狀態檢查失敗:', error);
            }
        }
        
        // 檢查傳統手動設置
        const apiKey = await getApiKey();
        const databaseId = await getDatabaseId();
        
        if (apiKey) {
            status.isAuthenticated = true;
            status.authMethod = 'manual';
            status.hasApiKey = true;
            status.hasDatabaseId = !!databaseId;
            status.userInfo = { method: 'manual', hasApiKey: true };
        }
        
        console.log('📋 [Background] 授權狀態檢查完成:', status);
        return status;
        
    } catch (error) {
        console.error('❌ [Background] 檢查授權狀態失敗:', error);
        return {
            isAuthenticated: false,
            authMethod: null,
            userInfo: null,
            hasApiKey: false,
            hasDatabaseId: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

// 更新的 makeNotionAPICall 函數 - 整合簡化授權
async function makeNotionAPICall(endpoint, options = {}) {
    try {
        // 優先使用簡化授權管理器
        if (simpleAuthManager && simpleAuthManager.isAuthorized()) {
            console.log('✅ [Background] 使用簡化授權管理器調用 API');
            return await simpleAuthManager.makeAPICall(endpoint, options);
        }
        
        // 回退到混合授權管理器
        if (typeof hybridAuthManager !== 'undefined' && hybridAuthManager && hybridAuthManager.isReady()) {
            console.log('✅ [Background] 使用混合授權管理器調用 API');
            return await hybridAuthManager.makeNotionAPICall(endpoint, options);
        }
        
        // 最後回退到傳統方式
        console.log('🔄 [Background] 回退到傳統 API 調用方式');
        const apiKey = await getApiKey();
        if (!apiKey) {
            throw new Error('API 金鑰未設置');
        }
        
        const url = endpoint.startsWith('http') ? endpoint : `https://api.notion.com/v1${endpoint}`;
        const requestOptions = {
            method: options.method || 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28',
                ...options.headers
            },
            body: options.body
        };
        
        const response = await fetch(url, requestOptions);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API 調用失敗: ${errorData.message || response.statusText}`);
        }
        
        return response;
        
    } catch (error) {
        console.error(`❌ [Background] API 調用失敗 (${endpoint}):`, error);
        throw error;
    }
}

// 新增：搜索資料庫函數
async function searchDatabases(query = '') {
    try {
        // 優先使用簡化授權管理器
        if (simpleAuthManager && simpleAuthManager.isAuthorized()) {
            console.log('✅ [Background] 使用簡化授權管理器搜索資料庫');
            return await simpleAuthManager.searchDatabases(query);
        }
        
        // 回退到手動 API 調用
        const apiKey = await getApiKey();
        if (!apiKey) {
            throw new Error('未授權：請先設置 API 金鑰');
        }
        
        const response = await fetch('https://api.notion.com/v1/search', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify({
                query: query,
                filter: {
                    value: 'database',
                    property: 'object'
                }
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`搜索失敗: ${errorData.message || response.statusText}`);
        }
        
        const data = await response.json();
        const databases = data.results.map(db => ({
            id: db.id,
            title: db.title?.[0]?.plain_text || 'Untitled Database',
            url: db.url,
            icon: db.icon,
            created_time: db.created_time
        }));
        
        console.log(`📊 [Background] 找到 ${databases.length} 個資料庫`);
        return databases;
        
    } catch (error) {
        console.error('❌ [Background] 搜索資料庫失敗:', error);
        throw error;
    }
}

// 更新消息處理器以支援新的授權功能
function handleSimpleAuthMessages(request, sender, sendResponse) {
    switch (request.action) {
        case 'checkAuthStatus':
            checkAuthStatus().then(status => {
                sendResponse({ success: true, data: status });
            }).catch(error => {
                sendResponse({ success: false, error: error.message });
            });
            return true; // 保持消息通道開放
            
        case 'searchDatabases':
            searchDatabases(request.query).then(databases => {
                sendResponse({ success: true, data: databases });
            }).catch(error => {
                sendResponse({ success: false, error: error.message });
            });
            return true;
            
        case 'refreshAuth':
            if (simpleAuthManager) {
                simpleAuthManager.recheckAuth().then(success => {
                    sendResponse({ success: true, data: { refreshed: success } });
                }).catch(error => {
                    sendResponse({ success: false, error: error.message });
                });
            } else {
                sendResponse({ success: false, error: '簡化授權管理器未初始化' });
            }
            return true;
            
        case 'logout':
            if (simpleAuthManager) {
                simpleAuthManager.logout().then(() => {
                    sendResponse({ success: true, data: { loggedOut: true } });
                }).catch(error => {
                    sendResponse({ success: false, error: error.message });
                });
            } else {
                sendResponse({ success: false, error: '簡化授權管理器未初始化' });
            }
            return true;
            
        default:
            return false; // 不處理此消息
    }
}

// 在現有的消息監聽器中添加簡化授權處理
// 這應該添加到現有的 chrome.runtime.onMessage.addListener 中
function integrateSimpleAuthMessageHandler() {
    // 如果已經有消息監聽器，需要修改它以包含簡化授權處理
    // 或者添加一個新的監聽器專門處理簡化授權消息
    
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        // 首先嘗試簡化授權處理
        const handled = handleSimpleAuthMessages(request, sender, sendResponse);
        if (handled) {
            return true;
        }
        
        // 如果不是簡化授權消息，繼續處理其他消息
        // 這裡應該調用現有的消息處理邏輯
        return false;
    });
}

// 擴展啟動時初始化簡化授權管理器
chrome.runtime.onStartup.addListener(async () => {
    console.log('🚀 [Background] 擴展啟動，初始化簡化授權管理器...');
    await initializeSimpleAuthManager();
});

chrome.runtime.onInstalled.addListener(async () => {
    console.log('📦 [Background] 擴展安裝/更新，初始化簡化授權管理器...');
    await initializeSimpleAuthManager();
});

// 導出函數供其他部分使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initializeSimpleAuthManager,
        getApiKey,
        getDatabaseId,
        checkAuthStatus,
        makeNotionAPICall,
        searchDatabases,
        handleSimpleAuthMessages
    };
}

console.log('🔧 [Background] 簡化授權整合模組已載入');

// ==========================================
// 整合說明
// ==========================================

/*
要將此代碼整合到現有的 scripts/background.js 中：

1. 將 initializeSimpleAuthManager 函數添加到文件頂部
2. 替換現有的 getApiKey 函數
3. 添加新的 getDatabaseId 函數（如果不存在）
4. 添加 checkAuthStatus 函數
5. 更新 makeNotionAPICall 函數
6. 添加 searchDatabases 函數
7. 在現有的消息監聽器中整合 handleSimpleAuthMessages
8. 確保在擴展啟動時調用 initializeSimpleAuthManager

示例整合：

// 在現有的消息監聽器中
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 首先嘗試簡化授權處理
    const handled = handleSimpleAuthMessages(request, sender, sendResponse);
    if (handled) {
        return true;
    }
    
    // 繼續現有的消息處理邏輯
    switch (request.action) {
        case 'saveToNotion':
            // 現有邏輯...
            break;
        // 其他現有 cases...
    }
});
*/