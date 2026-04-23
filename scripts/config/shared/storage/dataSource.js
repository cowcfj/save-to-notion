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
