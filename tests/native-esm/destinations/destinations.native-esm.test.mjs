import { beforeEach, describe, expect, jest, test } from '@jest/globals';

const loggerMock = {
  warn: jest.fn(),
};

const getAccountSessionMock = jest.fn();
const isAccountSessionExpiredMock = jest.fn();

await jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
  default: loggerMock,
}));

await jest.unstable_mockModule('../../../scripts/auth/accountSession.js', () => ({
  getAccountSession: getAccountSessionMock,
  isAccountSessionExpired: isAccountSessionExpiredMock,
}));

const {
  AccountGatedDestinationEntitlementProvider,
  DEFAULT_PROFILE_ID,
  DESTINATION_PROFILE_ERRORS,
  DESTINATION_PROFILE_STORAGE_KEYS,
  LocalDestinationProfileRepository,
  buildDefaultProfileFromLegacy,
  buildLegacyTargetWrite,
  ensureMigratedDefaultProfile,
  normalizeDataSourceType,
  normalizeProfile,
  pickNonEmptyString,
  resolveActiveProfile,
} = await import('../../../scripts/destinations/ProfileStore.js');
const { ProfileManager } = await import('../../../scripts/destinations/ProfileManager.js');
const { ProfileResolver } = await import('../../../scripts/destinations/ProfileResolver.js');

let storageData;
let chromeStorage;

function createChromeStorage() {
  return {
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
    },
  };
}

function buildProfile(overrides = {}) {
  return {
    color: '#2563eb',
    createdAt: 1,
    icon: 'bookmark',
    id: DEFAULT_PROFILE_ID,
    name: 'Default',
    notionDataSourceId: 'source-default',
    notionDataSourceType: 'database',
    updatedAt: 1,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  storageData = {};
  chromeStorage = createChromeStorage();
  getAccountSessionMock.mockResolvedValue(null);
  isAccountSessionExpiredMock.mockReturnValue(true);
});

describe('destinations native ESM diagnostics', () => {
  test('ProfileStore normalizes legacy targets and migrates default profile', async () => {
    expect(normalizeDataSourceType('page')).toBe('page');
    expect(normalizeDataSourceType('data_source')).toBe('database');
    expect(pickNonEmptyString(null, '  ', ' target ')).toBe('target');

    const defaultProfile = buildDefaultProfileFromLegacy({
      notionDataSourceId: 'legacy-source',
      notionDataSourceType: 'page',
    });
    expect(defaultProfile).toEqual(
      expect.objectContaining({
        id: DEFAULT_PROFILE_ID,
        notionDataSourceId: 'legacy-source',
        notionDataSourceType: 'page',
      })
    );
    expect(buildLegacyTargetWrite(defaultProfile)).toEqual({
      notionDataSourceId: 'legacy-source',
      notionDatabaseId: 'legacy-source',
      notionDataSourceType: 'page',
    });

    storageData.notionDataSourceId = 'legacy-source';
    storageData.notionDataSourceType = 'data_source';
    const repository = new LocalDestinationProfileRepository({ chromeStorage });
    const profiles = await ensureMigratedDefaultProfile(repository);

    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toEqual(
      expect.objectContaining({
        id: DEFAULT_PROFILE_ID,
        notionDataSourceId: 'legacy-source',
        notionDataSourceType: 'database',
      })
    );
    expect(storageData[DESTINATION_PROFILE_STORAGE_KEYS.LAST_USED_PROFILE_ID]).toBe(
      DEFAULT_PROFILE_ID
    );
    await expect(resolveActiveProfile(repository)).resolves.toEqual(
      expect.objectContaining({ id: DEFAULT_PROFILE_ID })
    );
  });

  test('ProfileManager creates, updates, activates, and deletes profiles through repository', async () => {
    storageData.destinationProfiles = [buildProfile()];
    const repository = new LocalDestinationProfileRepository({ chromeStorage });
    const entitlementProvider = {
      getDestinationEntitlement: jest.fn(async () => ({ maxProfiles: 3, source: 'test' })),
    };
    const manager = new ProfileManager({ entitlementProvider, repository });

    const created = await manager.createProfile({
      id: 'second',
      name: 'Second',
      notionDataSourceId: 'source-second',
      notionDataSourceType: 'page',
    });
    expect(created).toEqual(
      expect.objectContaining({
        id: 'second',
        notionDataSourceType: 'page',
      })
    );

    const updated = await manager.updateProfile('second', { name: 'Second Updated' });
    expect(updated.name).toBe('Second Updated');

    await expect(manager.setActiveProfile('second')).resolves.toEqual(
      expect.objectContaining({ id: 'second' })
    );
    expect(storageData[DESTINATION_PROFILE_STORAGE_KEYS.ACTIVE_PROFILE_ID]).toBe('second');

    await expect(manager.deleteProfile('second')).resolves.toHaveLength(1);
    await expect(manager.deleteProfile(DEFAULT_PROFILE_ID)).rejects.toThrow(
      DESTINATION_PROFILE_ERRORS.LAST_DELETE
    );
  });

  test('ProfileResolver honors entitlement limits and account-gated provider state', async () => {
    storageData.destinationProfiles = [
      buildProfile(),
      buildProfile({
        id: 'second',
        name: 'Second',
        notionDataSourceId: 'source-second',
        notionDataSourceType: 'page',
      }),
    ];
    storageData.destinationActiveProfileId = 'second';
    const repository = new LocalDestinationProfileRepository({ chromeStorage });
    const resolver = new ProfileResolver({
      entitlementProvider: {
        getDestinationEntitlement: jest.fn(async () => ({ maxProfiles: 1, source: 'test' })),
      },
      repository,
    });

    await expect(resolver.resolveProfileForSave('second')).rejects.toThrow(
      DESTINATION_PROFILE_ERRORS.NOT_ALLOWED
    );
    await expect(resolver.resolveProfileForSave()).resolves.toEqual(
      expect.objectContaining({ id: DEFAULT_PROFILE_ID })
    );

    const provider = new AccountGatedDestinationEntitlementProvider();
    getAccountSessionMock.mockResolvedValueOnce({ accessToken: 'token', expiresAt: 9_999_999_999 });
    isAccountSessionExpiredMock.mockReturnValueOnce(false);
    await expect(provider.getDestinationEntitlement()).resolves.toEqual(
      expect.objectContaining({ accountSignedIn: true, maxProfiles: 2 })
    );
  });

  test('normalizeProfile rejects missing targets but preserves valid caller input', () => {
    expect(normalizeProfile(null)).toBeNull();
    expect(normalizeProfile({ name: 'Missing target' })).toBeNull();
    expect(
      normalizeProfile({
        color: '#16a34a',
        id: 'custom',
        name: 'Custom',
        notionDatabaseId: 'legacy-db',
        notionDataSourceType: 'page',
      })
    ).toEqual(
      expect.objectContaining({
        color: '#16a34a',
        id: 'custom',
        notionDataSourceId: 'legacy-db',
        notionDataSourceType: 'page',
      })
    );
  });

  test('LocalDestinationProfileRepository writes last-used profile id directly', async () => {
    const repository = new LocalDestinationProfileRepository({ chromeStorage });

    await repository.setLastUsedProfileId('second');

    expect(storageData[DESTINATION_PROFILE_STORAGE_KEYS.LAST_USED_PROFILE_ID]).toBe('second');
  });
});
