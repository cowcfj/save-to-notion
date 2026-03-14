export const DATA_SOURCE_KEYS = ['notionDataSourceId', 'notionDatabaseId', 'notionDataSourceType'];

export const LOCAL_STORAGE_KEYS = new Set(DATA_SOURCE_KEYS);

export const AUTH_LOCAL_KEYS = [
  'notionAuthMode',
  'notionOAuthToken',
  'notionRefreshToken',
  'notionRefreshProof',
  'notionWorkspaceName',
  'notionAuthEpoch',
];

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

export function mergeDataSourceConfig(localData = {}, syncData = {}) {
  return {
    notionDataSourceId: localData.notionDataSourceId || syncData.notionDataSourceId,
    notionDatabaseId: localData.notionDatabaseId || syncData.notionDatabaseId,
    notionDataSourceType: localData.notionDataSourceType || syncData.notionDataSourceType,
  };
}
