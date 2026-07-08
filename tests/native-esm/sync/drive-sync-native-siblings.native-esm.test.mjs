import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { baseDriveMetadata, installDriveChrome } from './driveSyncHarness.mjs';
import { snapshotGlobals } from '../utils/rootUtilsHarness.mjs';

let restoreGlobals;

function makeSnapshot() {
  return {
    metadata: {
      updated_at: '2026-06-28T01:00:00.000Z',
      item_counts: { saved_states: 0, highlights: 0 },
    },
    payload: {
      saved_states: [],
      highlights: [],
      url_aliases: {},
    },
  };
}

describe('drive and sync real helper native ESM siblings', () => {
  beforeEach(() => {
    restoreGlobals = snapshotGlobals(['chrome', 'crypto']);
    installDriveChrome();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    restoreGlobals();
  });

  test('driveClient metadata helpers preserve isolated driveSync storage keys', async () => {
    const {
      DRIVE_SYNC_STORAGE_KEYS,
      clearDriveDirty,
      getDriveSyncMetadata,
      markDriveDirty,
      setDriveConnection,
      setDriveFrequency,
    } = await import('../../../scripts/auth/driveClient.js');

    await setDriveConnection({
      email: 'drive-user@example.com',
      connectedAt: '2026-06-28T00:00:00.000Z',
    });
    await markDriveDirty();
    await setDriveFrequency('weekly');
    await clearDriveDirty({
      snapshotHash: 'hash-native',
      frequency: 'weekly',
      expectedDirtyRevision: 1,
    });

    const metadata = await getDriveSyncMetadata();

    expect(metadata).toEqual(
      expect.objectContaining({
        connectionEmail: 'drive-user@example.com',
        connectedAt: '2026-06-28T00:00:00.000Z',
        frequency: 'weekly',
        dirtyRevision: 1,
        lastUploadedRevision: 1,
        lastSnapshotHash: 'hash-native',
      })
    );
    expect(globalThis.chrome.storage.local.data?.notionOAuthToken).toBeUndefined();
    expect(Object.values(DRIVE_SYNC_STORAGE_KEYS)).toContain('driveSyncFrequency');
  });

  test('accountSession stores account tokens separately from Notion OAuth keys', async () => {
    const {
      ACCOUNT_STORAGE_KEYS,
      buildAccountAuthHeaders,
      clearAccountSession,
      getAccountAccessToken,
      isTerminalRefreshFailure,
      setAccountSession,
    } = await import('../../../scripts/auth/accountSession.js');

    await setAccountSession({
      accessToken: 'account-token-native',
      refreshToken: 'refresh-token-native',
      expiresAt: Math.floor(Date.now() / 1000) + 60,
      userId: 'user-native',
      email: 'user@example.com',
      displayName: 'Native User',
      avatarUrl: null,
    });

    await expect(getAccountAccessToken()).resolves.toBe('account-token-native');
    await expect(buildAccountAuthHeaders()).resolves.toEqual({
      Authorization: 'Bearer account-token-native',
    });
    expect(isTerminalRefreshFailure(401, 'SESSION_REVOKED')).toBe(true);
    expect(isTerminalRefreshFailure(500, 'SESSION_REVOKED')).toBe(false);

    await clearAccountSession();
    await expect(getAccountAccessToken()).resolves.toBeNull();
    expect(ACCOUNT_STORAGE_KEYS.ACCESS_TOKEN).toBe('accountAccessToken');
  });

  test('driveSnapshot apply and summary preserve alias gate output under native ESM', async () => {
    const { applyDriveSnapshotToLocalStorage, buildDriveSnapshot, getDriveSnapshotSummary } =
      await import('../../../scripts/sync/driveSnapshot.js');
    const { computeDriveSnapshotHash } = await import('../../../scripts/sync/driveSnapshotHash.js');

    const pages = new Map([
      [
        'https://example.com/page',
        {
          url: 'https://example.com/page',
          notion: {
            pageId: 'page-1',
            url: 'https://notion.so/page-1',
            title: 'Example',
            savedAt: 100,
          },
          highlights: [{ id: 'hl-1', text: 'highlight', color: 'yellow', timestamp: 200 }],
        },
      ],
    ]);
    const aliases = new Map([
      ['https://example.com/page?utm_source=x', 'https://example.com/page'],
    ]);

    const snapshot = await buildDriveSnapshot(pages, aliases, {
      installationId: 'drive-native-installation-id',
      profileId: 'profile-native',
    });
    const applyResult = await applyDriveSnapshotToLocalStorage(snapshot);
    const summary = getDriveSnapshotSummary(snapshot);

    expect(snapshot.payload.url_aliases).toEqual({
      'https://example.com/page?utm_source=x': 'https://example.com/page',
    });
    expect(applyResult.writtenKeys).toEqual(
      expect.arrayContaining([
        'page_https://example.com/page',
        'url_alias:https://example.com/page?utm_source=x',
      ])
    );
    expect(summary).toEqual(
      expect.objectContaining({
        pageCount: 1,
        highlightCount: 1,
      })
    );
    expect(computeDriveSnapshotHash(snapshot, '2026-06-28T01:00:00.000Z')).toContain(
      '2026-06-28T01:00:00.000Z'
    );
  });

  test('driveAlarmScheduler clamps initial delay and rejects unknown frequencies', async () => {
    const { DRIVE_AUTO_SYNC_ALARM, setupDriveAlarm } =
      await import('../../../scripts/background/handlers/driveAlarmScheduler.js');

    await setupDriveAlarm('weekly', { initialDelayInMinutes: 0.1 });

    expect(globalThis.chrome.alarms.clear).toHaveBeenCalledWith(DRIVE_AUTO_SYNC_ALARM);
    expect(globalThis.chrome.alarms.create).toHaveBeenCalledWith(DRIVE_AUTO_SYNC_ALARM, {
      delayInMinutes: 0.5,
      periodInMinutes: 10_080,
    });
    await expect(setupDriveAlarm('quarterly')).rejects.toThrow(/unknown frequency/);
  });
});

describe('drive handler native ESM siblings with mocked collaborators', () => {
  beforeEach(() => {
    restoreGlobals = snapshotGlobals(['chrome']);
    installDriveChrome();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    restoreGlobals();
  });

  test('driveSyncHandlers uploads snapshots with source identity and broadcasts status', async () => {
    const metadata = baseDriveMetadata();
    const snapshot = makeSnapshot();
    const driveClient = {
      uploadDriveSnapshot: jest.fn(async () => ({
        success: true,
        updatedAt: '2026-06-28T02:00:00.000Z',
      })),
      downloadDriveSnapshot: jest.fn(),
      getDriveSyncMetadata: jest.fn(async () => metadata),
      ensureDriveSyncIdentity: jest.fn(async () => metadata.installationId),
      updateDriveSyncRunMetadata: jest.fn(async () => {}),
      setDriveFrequency: jest.fn(async () => {}),
      clearDriveDirty: jest.fn(async () => {}),
    };
    const driveSnapshot = {
      buildUnifiedPageStateFromLocalStorage: jest.fn(async () => ({
        pages: new Map(),
        urlAliases: new Map(),
      })),
      buildDriveSnapshot: jest.fn(async () => snapshot),
      applyDriveSnapshotToLocalStorage: jest.fn(),
    };
    const setupDriveAlarm = jest.fn(async () => {});

    await jest.unstable_mockModule('../../../scripts/auth/driveClient.js', () => driveClient);
    await jest.unstable_mockModule('../../../scripts/sync/driveSnapshot.js', () => driveSnapshot);
    await jest.unstable_mockModule(
      '../../../scripts/background/handlers/driveAlarmScheduler.js',
      () => ({ setupDriveAlarm })
    );

    const { RUNTIME_ACTIONS } = await import('../../../scripts/config/shared/runtimeActions.js');
    const { createDriveSyncHandlers } =
      await import('../../../scripts/background/handlers/driveSyncHandlers.js');
    const handlers = createDriveSyncHandlers();

    const result = await handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD]({ force: false });

    expect(result).toEqual({ success: true, updatedAt: '2026-06-28T02:00:00.000Z' });
    expect(driveSnapshot.buildDriveSnapshot).toHaveBeenCalledWith(
      expect.any(Map),
      expect.any(Map),
      {
        installationId: metadata.installationId,
        profileId: metadata.profileId,
      }
    );
    expect(driveClient.uploadDriveSnapshot).toHaveBeenCalledWith(snapshot, false, {
      lastKnownRemoteUpdatedAt: metadata.lastKnownRemoteUpdatedAt,
      sourceInstallationId: metadata.installationId,
      sourceProfileId: metadata.profileId,
    });
    expect(driveClient.clearDriveDirty).toHaveBeenCalledWith(
      expect.objectContaining({
        frequency: metadata.frequency,
        expectedDirtyRevision: metadata.dirtyRevision,
      })
    );
    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED,
      })
    );
  });

  test('driveAutoSync records run telemetry and does not force conflict uploads', async () => {
    const metadata = baseDriveMetadata();
    const snapshot = makeSnapshot();
    const driveClient = {
      getDriveSyncMetadata: jest.fn(async () => metadata),
      ensureDriveSyncIdentity: jest.fn(async () => metadata.installationId),
      updateDriveSyncRunMetadata: jest.fn(async () => {}),
      clearDriveDirty: jest.fn(async () => {}),
      uploadDriveSnapshot: jest.fn(async () => ({
        success: false,
        errorCode: 'REMOTE_SNAPSHOT_NEWER',
        remoteUpdatedAt: '2026-06-28T03:00:00.000Z',
      })),
      writeDriveAutoSyncTelemetry: jest.fn(async () => {}),
    };
    const driveSnapshot = {
      buildUnifiedPageStateFromLocalStorage: jest.fn(async () => ({
        pages: new Map(),
        urlAliases: new Map(),
      })),
      buildDriveSnapshot: jest.fn(async () => snapshot),
    };

    await jest.unstable_mockModule('../../../scripts/auth/driveClient.js', () => driveClient);
    await jest.unstable_mockModule('../../../scripts/auth/accountSession.js', () => ({
      getAccountAccessToken: jest.fn(async () => 'account-token-native'),
    }));
    await jest.unstable_mockModule('../../../scripts/sync/driveSnapshot.js', () => driveSnapshot);

    const { RUNTIME_ACTIONS } = await import('../../../scripts/config/shared/runtimeActions.js');
    const { default: Logger } = await import('../../../scripts/utils/Logger.js');
    const { runAutoUpload, shouldRunAutoSync } =
      await import('../../../scripts/background/handlers/driveAutoSync.js');
    jest.spyOn(Logger, 'warn').mockImplementation(() => {});

    expect(shouldRunAutoSync(metadata)).toEqual({
      shouldRun: true,
      reason: 'all_conditions_met',
    });

    await runAutoUpload({ alarmFiredAt: '2026-06-28T02:59:59.000Z' });

    expect(driveClient.writeDriveAutoSyncTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: 'run',
        alarmFiredAt: '2026-06-28T02:59:59.000Z',
      })
    );
    expect(driveClient.uploadDriveSnapshot).toHaveBeenCalledWith(snapshot, false, {
      lastKnownRemoteUpdatedAt: metadata.lastKnownRemoteUpdatedAt,
      sourceInstallationId: metadata.installationId,
      sourceProfileId: metadata.profileId,
    });
    expect(driveClient.updateDriveSyncRunMetadata).toHaveBeenCalledWith({
      type: 'upload',
      success: false,
      errorCode: 'REMOTE_SNAPSHOT_NEWER',
      remoteUpdatedAt: '2026-06-28T03:00:00.000Z',
    });
    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: RUNTIME_ACTIONS.DRIVE_SYNC_CONFLICT,
      conflictType: 'REMOTE_SNAPSHOT_NEWER',
      remoteUpdatedAt: '2026-06-28T03:00:00.000Z',
    });
  });
});
