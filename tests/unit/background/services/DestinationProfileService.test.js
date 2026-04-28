import {
  ACCOUNT_GATED_FOUNDATION_ENTITLEMENT_SOURCE,
  AccountGatedDestinationEntitlementProvider,
  DESTINATION_PROFILE_STORAGE_KEYS,
  DestinationProfileService,
  LocalDestinationProfileRepository,
} from '../../../../scripts/background/services/DestinationProfileService.js';
import {
  getAccountSession,
  isAccountSessionExpired,
} from '../../../../scripts/auth/accountSession.js';
import Logger from '../../../../scripts/utils/Logger.js';

jest.mock('../../../../scripts/auth/accountSession.js', () => ({
  getAccountSession: jest.fn(),
  isAccountSessionExpired: jest.fn(),
}));

jest.mock('../../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
  },
}));

describe('DestinationProfileService', () => {
  let storageData = null;
  let chromeStorage = null;
  let repository = null;
  let service = null;
  let entitlementProvider = null;

  beforeEach(() => {
    storageData = {};
    chromeStorage = {
      local: {
        get: jest.fn(async keys => {
          const requestedKeys = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(
            requestedKeys
              .filter(key => Object.hasOwn(storageData, key))
              .map(key => [key, storageData[key]])
          );
        }),
        set: jest.fn(async values => {
          Object.assign(storageData, values);
        }),
        remove: jest.fn(async keys => {
          const requestedKeys = Array.isArray(keys) ? keys : [keys];
          for (const key of requestedKeys) {
            delete storageData[key];
          }
        }),
      },
    };
    repository = new LocalDestinationProfileRepository({ chromeStorage });
    entitlementProvider = {
      getDestinationEntitlement: jest.fn(async () => ({ maxProfiles: 2, source: 'test' })),
    };
    service = new DestinationProfileService({ repository, entitlementProvider });
    getAccountSession.mockResolvedValue(null);
    isAccountSessionExpired.mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('舊單一保存目標存在時會建立 Default profile 並記錄 last-used', async () => {
    storageData.notionDataSourceId = 'legacy-source';
    storageData.notionDataSourceType = 'page';

    const profiles = await service.ensureMigratedDefaultProfile();

    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toEqual(
      expect.objectContaining({
        id: 'default',
        name: 'Default',
        notionDataSourceId: 'legacy-source',
        notionDataSourceType: 'page',
      })
    );
    expect(storageData.destinationLastUsedProfileId).toBe('default');
    expect(storageData.destinationProfilesVersion).toBe(1);
  });

  it('已有 destinationProfiles 時不會重複建立 Default profile', async () => {
    storageData.destinationProfiles = [
      {
        id: 'existing',
        name: 'Existing',
        icon: 'bookmark',
        color: '#2563eb',
        notionDataSourceId: 'existing-source',
        notionDataSourceType: 'database',
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    storageData.notionDataSourceId = 'legacy-source';

    const profiles = await service.ensureMigratedDefaultProfile();

    expect(profiles).toHaveLength(1);
    expect(profiles[0].id).toBe('existing');
    expect(storageData.destinationProfiles).toHaveLength(1);
  });

  it('migration 會把 legacy notionDataSourceType 正規化為 database 或 page', async () => {
    storageData.notionDatabaseId = 'legacy-database';
    storageData.notionDataSourceType = 'data_source';

    const profiles = await service.ensureMigratedDefaultProfile();

    expect(profiles[0].notionDataSourceType).toBe('database');
  });

  it('未登入 account 的 entitlement 上限為 1，已登入有效 session 的上限為 2', async () => {
    const provider = new AccountGatedDestinationEntitlementProvider();

    getAccountSession.mockResolvedValueOnce(null);
    await expect(provider.getDestinationEntitlement()).resolves.toMatchObject({ maxProfiles: 1 });

    getAccountSession.mockResolvedValueOnce({ accessToken: 'token', expiresAt: 9_999_999_999 });
    isAccountSessionExpired.mockReturnValueOnce(false);
    await expect(provider.getDestinationEntitlement()).resolves.toMatchObject({ maxProfiles: 2 });
  });

  it('讀取 account session 失敗時會記錄警告並保守回退為未登入 entitlement', async () => {
    const provider = new AccountGatedDestinationEntitlementProvider();
    const error = new Error('storage unavailable');

    getAccountSession.mockRejectedValueOnce(error);

    await expect(provider.getDestinationEntitlement()).resolves.toEqual({
      maxProfiles: 1,
      source: ACCOUNT_GATED_FOUNDATION_ENTITLEMENT_SOURCE,
      accountSignedIn: false,
    });
    expect(Logger.warn).toHaveBeenCalledWith(
      '[DestinationProfileService] Failed to get account session for entitlement',
      {
        reason: 'storage unavailable',
        errorName: 'Error',
      }
    );
  });

  it('createProfile 會依 entitlement 拒絕超額目的地', async () => {
    entitlementProvider.getDestinationEntitlement.mockResolvedValue({
      maxProfiles: 1,
      source: 'test',
    });
    storageData.destinationProfiles = [
      {
        id: 'default',
        name: 'Default',
        icon: 'bookmark',
        color: '#2563eb',
        notionDataSourceId: 'source-1',
        notionDataSourceType: 'database',
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    await expect(
      service.createProfile({
        name: 'Second',
        notionDataSourceId: 'source-2',
        notionDataSourceType: 'page',
      })
    ).rejects.toThrow('Destination profile limit reached');
  });

  it('resolveProfileForSave 會拒絕超出 entitlement 上限的 profile', async () => {
    entitlementProvider.getDestinationEntitlement.mockResolvedValue({
      maxProfiles: 1,
      source: 'test',
    });
    storageData.destinationProfiles = [
      {
        id: 'default',
        name: 'Default',
        icon: 'bookmark',
        color: '#2563eb',
        notionDataSourceId: 'source-1',
        notionDataSourceType: 'database',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'second',
        name: 'Second',
        icon: 'bookmark',
        color: '#16a34a',
        notionDataSourceId: 'source-2',
        notionDataSourceType: 'page',
        createdAt: 2,
        updatedAt: 2,
      },
    ];

    await expect(service.resolveProfileForSave('second')).rejects.toThrow(
      'Destination profile is not allowed'
    );
  });

  it('更新 Default profile 時會同步回寫舊保存目標 keys', async () => {
    storageData.destinationProfiles = [
      {
        id: 'default',
        name: 'Default',
        icon: 'bookmark',
        color: '#2563eb',
        notionDataSourceId: 'source-1',
        notionDataSourceType: 'database',
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    await service.updateProfile('default', {
      notionDataSourceId: 'source-2',
      notionDataSourceType: 'page',
    });

    expect(storageData.notionDataSourceId).toBe('source-2');
    expect(storageData.notionDatabaseId).toBe('source-2');
    expect(storageData.notionDataSourceType).toBe('page');
  });

  it('刪除 last-used profile 時會把 last-used 指向剩餘第一個 profile', async () => {
    storageData.destinationLastUsedProfileId = 'second';
    storageData.destinationProfiles = [
      {
        id: 'default',
        name: 'Default',
        icon: 'bookmark',
        color: '#2563eb',
        notionDataSourceId: 'source-1',
        notionDataSourceType: 'database',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'second',
        name: 'Second',
        icon: 'bookmark',
        color: '#16a34a',
        notionDataSourceId: 'source-2',
        notionDataSourceType: 'page',
        createdAt: 2,
        updatedAt: 2,
      },
    ];

    await service.deleteProfile('second');

    expect(storageData.destinationProfiles.map(profile => profile.id)).toEqual(['default']);
    expect(storageData.destinationLastUsedProfileId).toBe('default');
  });

  it('repository 使用 canonical destination storage keys', () => {
    expect(DESTINATION_PROFILE_STORAGE_KEYS).toEqual({
      PROFILES: 'destinationProfiles',
      LAST_USED_PROFILE_ID: 'destinationLastUsedProfileId',
      VERSION: 'destinationProfilesVersion',
    });
  });
});
