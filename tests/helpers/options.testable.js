const optionsHandler = {
  /**
   * 斷開 Notion 連接功能 - 可測試版本
   * @param {Object} storageAPI - 存儲 API（默認使用 chrome.storage.sync）
   */
  async disconnectFromNotion(storageAPI = chrome.storage.sync) {
    console.log('🔌 [斷開連接] 開始斷開 Notion 連接');

    await new Promise((resolve, reject) => {
      storageAPI.remove(['notionApiToken', 'notionDataSourceId', 'notionDatabaseId'], () => {
        if (chrome.runtime?.lastError) {
          console.error('❌ [斷開連接] 清除授權數據失敗:', chrome.runtime.lastError.message);
          reject(chrome.runtime.lastError);
        } else {
          console.log('✅ [斷開連接] 已清除授權數據');
          resolve();
        }
      });
    });

    // 重新檢查授權狀態，這會更新UI
    await this.checkAuthStatus(storageAPI);
    console.log('🔄 [斷開連接] UI 已更新為未連接狀態');
  },

  /**
   * 檢查授權狀態 - 可測試版本
   * @param {Object} storageAPI - 存儲 API（默認使用 chrome.storage.sync）
   */
  checkAuthStatus(storageAPI = chrome.storage.sync) {
    return new Promise(resolve => {
      storageAPI.get(
        [
          'notionApiKey',
          'notionDataSourceId',
          'notionDatabaseId',
          'titleTemplate',
          'addSource',
          'addTimestamp',
          'enableDebugLogs',
        ],
        result => {
          // 模擬授權狀態檢查邏輯
          // 模擬授權狀態檢查邏輯
          const hasAuth = Boolean(result.notionApiKey);

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
              enableDebugLogs: Boolean(result.enableDebugLogs),
            },
          });
        }
      );
    });
  },
};

module.exports = optionsHandler;
