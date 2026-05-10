/**
 * storageKeys.js 測試
 * 驗證 mergeDataSourceConfig 的合併邏輯
 */

const { mergeDataSourceConfig } = require('../../../scripts/config/shared/storage.js');

describe('配置模組 - storageKeys.js', () => {
  describe('mergeDataSourceConfig', () => {
    test('local 優先覆蓋 sync', () => {
      const local = {
        notionDataSourceId: 'local-id',
        notionDatabaseId: 'local-db',
        notionDataSourceType: 'page',
      };
      const sync = {
        notionDataSourceId: 'sync-id',
        notionDatabaseId: 'sync-db',
        notionDataSourceType: 'database',
      };
      expect(mergeDataSourceConfig(local, sync)).toEqual({
        notionDataSourceId: 'local-id',
        notionDatabaseId: 'local-db',
        notionDataSourceType: 'page',
      });
    });

    test('local 缺值時回退 sync', () => {
      const sync = {
        notionDataSourceId: 'sync-id',
        notionDatabaseId: 'sync-db',
        notionDataSourceType: 'database',
      };
      expect(mergeDataSourceConfig({}, sync)).toEqual({
        notionDataSourceId: 'sync-id',
        notionDatabaseId: 'sync-db',
        notionDataSourceType: 'database',
      });
    });

    test('local 部分設定時混合回退 sync', () => {
      const local = { notionDataSourceId: 'local-id' };
      const sync = {
        notionDataSourceId: 'sync-id',
        notionDatabaseId: 'sync-db',
        notionDataSourceType: 'database',
      };
      expect(mergeDataSourceConfig(local, sync)).toEqual({
        notionDataSourceId: 'local-id',
        notionDatabaseId: 'sync-db',
        notionDataSourceType: 'database',
      });
    });

    test('雙方皆空時回傳 undefined 欄位', () => {
      expect(mergeDataSourceConfig({}, {})).toEqual({
        notionDataSourceId: undefined,
        notionDatabaseId: undefined,
        notionDataSourceType: undefined,
      });
    });

    test('預設參數：無傳入時不拋錯', () => {
      expect(() => mergeDataSourceConfig()).not.toThrow();
      expect(mergeDataSourceConfig()).toEqual({
        notionDataSourceId: undefined,
        notionDatabaseId: undefined,
        notionDataSourceType: undefined,
      });
    });

    test('當 local 設定為 falsy (如空字串) 時，應回退使用 sync 設定', () => {
      const local = {
        notionDataSourceId: '',
        notionDatabaseId: null,
        notionDataSourceType: false,
      };
      const sync = {
        notionDataSourceId: 'sync-id',
        notionDatabaseId: 'sync-db',
        notionDataSourceType: 'database',
      };
      expect(mergeDataSourceConfig(local, sync)).toEqual({
        notionDataSourceId: 'sync-id',
        notionDatabaseId: 'sync-db',
        notionDataSourceType: 'database',
      });
    });

    test('當 local 與 sync 包含無關緊要的屬性時，應只回傳目標欄位 (過濾多餘屬性)', () => {
      const local = {
        notionDataSourceId: 'local-id',
        extraLocalProp: 'should-be-ignored',
      };
      const sync = {
        notionDataSourceId: 'sync-id',
        notionDatabaseId: 'sync-db',
        notionDataSourceType: 'database',
        extraSyncProp: 'should-also-be-ignored',
      };
      expect(mergeDataSourceConfig(local, sync)).toEqual({
        notionDataSourceId: 'local-id',
        notionDatabaseId: 'sync-db',
        notionDataSourceType: 'database',
      });
    });

    test('輸入 null 參數時應優雅降級不拋錯', () => {
      expect(() => mergeDataSourceConfig(null, null)).not.toThrow();
      expect(mergeDataSourceConfig(null, null)).toEqual({
        notionDataSourceId: undefined,
        notionDatabaseId: undefined,
        notionDataSourceType: undefined,
      });
    });
  });
});
