/**
 * storageKeys.js 測試
 * 驗證 mergeDataSourceConfig 的合併邏輯
 */

let mergeDataSourceConfig;

const LOCAL_DATA_SOURCE_CONFIG = Object.freeze({
  notionDataSourceId: 'local-id',
  notionDatabaseId: 'local-db',
  notionDataSourceType: 'page',
});

const SYNC_DATA_SOURCE_CONFIG = Object.freeze({
  notionDataSourceId: 'sync-id',
  notionDatabaseId: 'sync-db',
  notionDataSourceType: 'database',
});

const EMPTY_DATA_SOURCE_CONFIG = Object.freeze({
  notionDataSourceId: undefined,
  notionDatabaseId: undefined,
  notionDataSourceType: undefined,
});

const buildDataSourceConfig = (overrides = {}) => ({
  ...EMPTY_DATA_SOURCE_CONFIG,
  ...overrides,
});

describe('配置模組 - storageKeys.js', () => {
  beforeAll(async () => {
    ({ mergeDataSourceConfig } = await import('../../../../scripts/config/shared/storage.js'));
  });

  describe('mergeDataSourceConfig', () => {
    test.each([
      {
        name: 'local 優先覆蓋 sync',
        local: LOCAL_DATA_SOURCE_CONFIG,
        sync: SYNC_DATA_SOURCE_CONFIG,
        expected: LOCAL_DATA_SOURCE_CONFIG,
      },
      {
        name: 'local 缺值時回退 sync',
        local: {},
        sync: SYNC_DATA_SOURCE_CONFIG,
        expected: SYNC_DATA_SOURCE_CONFIG,
      },
      {
        name: 'local 部分設定時混合回退 sync',
        local: { notionDataSourceId: 'local-id' },
        sync: SYNC_DATA_SOURCE_CONFIG,
        expected: buildDataSourceConfig({
          notionDataSourceId: 'local-id',
          notionDatabaseId: 'sync-db',
          notionDataSourceType: 'database',
        }),
      },
      {
        name: '雙方皆空時回傳 undefined 欄位',
        local: {},
        sync: {},
        expected: EMPTY_DATA_SOURCE_CONFIG,
      },
      {
        name: '當 local 設定為 falsy (如空字串) 時，應回退使用 sync 設定',
        local: {
          notionDataSourceId: '',
          notionDatabaseId: null,
          notionDataSourceType: false,
        },
        sync: SYNC_DATA_SOURCE_CONFIG,
        expected: SYNC_DATA_SOURCE_CONFIG,
      },
      {
        name: '當 local 與 sync 包含無關緊要的屬性時，應只回傳目標欄位 (過濾多餘屬性)',
        local: {
          notionDataSourceId: 'local-id',
          extraLocalProp: 'should-be-ignored',
        },
        sync: {
          ...SYNC_DATA_SOURCE_CONFIG,
          extraSyncProp: 'should-also-be-ignored',
        },
        expected: buildDataSourceConfig({
          notionDataSourceId: 'local-id',
          notionDatabaseId: 'sync-db',
          notionDataSourceType: 'database',
        }),
      },
    ])('$name', ({ local, sync, expected }) => {
      expect(mergeDataSourceConfig(local, sync)).toEqual(expected);
    });

    test.each([
      {
        name: '預設參數：無傳入時不拋錯',
        args: [],
      },
      {
        name: '輸入 null 參數時應優雅降級不拋錯',
        args: [null, null],
      },
    ])('$name', ({ args }) => {
      expect(() => mergeDataSourceConfig(...args)).not.toThrow();
      expect(mergeDataSourceConfig(...args)).toEqual(EMPTY_DATA_SOURCE_CONFIG);
    });
  });
});
