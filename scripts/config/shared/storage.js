/**
 * Shared storage 配置
 */

/**
 * Sync 設定鍵
 * 跨裝置共用的使用者設定，存放於 chrome.storage.sync
 */
export const SYNC_CONFIG_KEYS = [
  'notionApiKey',
  'titleTemplate',
  'addSource',
  'addTimestamp',
  'highlightStyle',
  'highlightContentStyle',
  'enableDebugLogs',
  'uiZoomLevel',
];

/**
 * Storage 前綴常量
 */
export const SAVED_PREFIX = 'saved_';
export const HIGHLIGHTS_PREFIX = 'highlights_';
export const URL_ALIAS_PREFIX = 'url_alias:';
export const HIGHLIGHTS_LEGACY_PREFIX = 'nh_highlights_';
export const PAGE_PREFIX = 'page_';

/**
 * 認證相關 Storage Keys
 * 存放於 chrome.storage.local
 */
export const AUTH_LOCAL_KEYS = [
  'notionAuthMode',
  'notionOAuthToken',
  'notionRefreshToken',
  'notionRefreshProof',
  'notionWorkspaceName',
  'notionAuthEpoch',
];

/**
 * 資料來源相關 Storage Keys 與合併策略
 * 資料來源 key 保留在 local，避免跨裝置同步造成工作區不一致
 */
export const DATA_SOURCE_KEYS = ['notionDataSourceId', 'notionDatabaseId', 'notionDataSourceType'];

export const LOCAL_STORAGE_KEYS = new Set(DATA_SOURCE_KEYS);

/**
 * 合併 data source 設定（local 優先覆蓋 sync）。
 *
 * @param {object} localData - 本機 data source 設定（local storage）。
 * @param {object} syncData - 同步 data source 設定（sync storage）。
 * @returns {{notionDataSourceId?: string, notionDatabaseId?: string, notionDataSourceType?: string}}
 * 合併後的 data source 設定。
 */
export function mergeDataSourceConfig(localData = {}, syncData = {}) {
  return {
    notionDataSourceId: localData.notionDataSourceId || syncData.notionDataSourceId,
    notionDatabaseId: localData.notionDatabaseId || syncData.notionDatabaseId,
    notionDataSourceType: localData.notionDataSourceType || syncData.notionDataSourceType,
  };
}
