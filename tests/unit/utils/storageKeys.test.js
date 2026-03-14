const { mergeDataSourceConfig } = require('../../../scripts/config/storageKeys');

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
    const local = {};
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
});
