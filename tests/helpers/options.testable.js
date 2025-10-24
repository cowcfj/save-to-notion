// 可測試版本的 options.js 函數
// 將 options.js 中的關鍵函數提取出來以便單元測試

/**
 * 斷開 Notion 連接功能 - 可測試版本
 * @param {Object} storageAPI - 存儲 API（默認使用 chrome.storage.sync）
 */
async function disconnectFromNotion(storageAPI = chrome.storage.sync) {
    try {
        console.log('🔌 [斷開連接] 開始斷開 Notion 連接');

        // 清除授權相關數據
        await new Promise((resolve, reject) => {
            storageAPI.remove([
                'notionApiToken',
                'notionDataSourceId',
                'notionDatabaseId'
            ], () => {
                if (chrome.runtime?.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });

        console.log('✅ [斷開連接] 已清除授權數據');

        // 重新檢查授權狀態，這會更新UI
        await checkAuthStatus(storageAPI);

        console.log('🔄 [斷開連接] UI 已更新為未連接狀態');

    } catch (error) {
        console.error('❌ [斷開連接] 斷開連接失敗:', error);
        throw error; // 重新拋出錯誤以便測試捕獲
    }
}

/**
 * 檢查授權狀態 - 可測試版本
 * @param {Object} storageAPI - 存儲 API（默認使用 chrome.storage.sync）
 */
async function checkAuthStatus(storageAPI = chrome.storage.sync) {
    return new Promise((resolve) => {
        storageAPI.get([
            'notionApiKey',
            'notionDataSourceId',
            'notionDatabaseId',
            'titleTemplate',
            'addSource',
            'addTimestamp',
            'enableDebugLogs'
        ], (result) => {
            // 模擬授權狀態檢查邏輯
            const hasAuth = !!result.notionApiKey;

            // 返回狀態以便測試驗證
            resolve({
                hasAuth,
                notionApiKey: result.notionApiKey,
                notionDataSourceId: result.notionDataSourceId,
                notionDatabaseId: result.notionDatabaseId,
                settings: {
                    titleTemplate: result.titleTemplate || '{title}',
                    addSource: result.addSource !== false,
                    addTimestamp: result.addTimestamp !== false,
                    enableDebugLogs: Boolean(result.enableDebugLogs)
                }
            });
        });
    });
}

module.exports = {
    disconnectFromNotion,
    checkAuthStatus
};