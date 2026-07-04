import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  cleanup,
  importBackgroundEntrypoint,
  makeDefaultChrome,
  makeLoggerMock,
  unwrapTestExports,
} from './backgroundLifecycleHarness.mjs';

const loggerMock = makeLoggerMock();
const runAutoUploadMock = jest.fn(async () => undefined);
const setupDriveAlarmMock = jest.fn(async () => undefined);
const markDriveDirtyMock = jest.fn(async () => undefined);
const shouldShowUpdateNotificationMock = jest.fn(() => false);
const storageUpdateHighlightsMock = jest.fn(async () => undefined);
const uploadDriveSnapshotMock = jest.fn();
const downloadDriveSnapshotMock = jest.fn();
const getDriveSyncMetadataMock = jest.fn();
const ensureDriveSyncIdentityMock = jest.fn();
const updateDriveSyncRunMetadataMock = jest.fn();
const setDriveFrequencyMock = jest.fn();
const clearDriveDirtyMock = jest.fn();
const buildUnifiedPageStateFromLocalStorageMock = jest.fn();
const buildDriveSnapshotMock = jest.fn();
const applyDriveSnapshotToLocalStorageMock = jest.fn();
const computeDriveSnapshotHashMock = jest.fn();

jest.mock('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: loggerMock,
  ...loggerMock,
}));

await jest.unstable_mockModule(
  '../../../scripts/background/handlers/driveAlarmScheduler.js',
  () => ({
    DRIVE_AUTO_SYNC_ALARM: 'drive-auto-sync',
    FREQUENCY_PERIOD_MINUTES: { daily: 1440, weekly: 10080, monthly: 43_200 },
    setupDriveAlarm: setupDriveAlarmMock,
  })
);

await jest.unstable_mockModule('../../../scripts/background/handlers/driveAutoSync.js', () => ({
  runAutoUpload: runAutoUploadMock,
}));

await jest.unstable_mockModule('../../../scripts/auth/driveClient.js', () => ({
  DRIVE_SYNC_FREQUENCIES: ['off', 'daily', 'weekly', 'monthly'],
  DRIVE_SYNC_STORAGE_KEYS: { FREQUENCY: 'driveSyncFrequency' },
  markDriveDirty: markDriveDirtyMock,
  uploadDriveSnapshot: uploadDriveSnapshotMock,
  downloadDriveSnapshot: downloadDriveSnapshotMock,
  getDriveSyncMetadata: getDriveSyncMetadataMock,
  ensureDriveSyncIdentity: ensureDriveSyncIdentityMock,
  updateDriveSyncRunMetadata: updateDriveSyncRunMetadataMock,
  setDriveFrequency: setDriveFrequencyMock,
  clearDriveDirty: clearDriveDirtyMock,
}));

await jest.unstable_mockModule('../../../scripts/sync/driveSnapshot.js', () => ({
  buildUnifiedPageStateFromLocalStorage: buildUnifiedPageStateFromLocalStorageMock,
  buildDriveSnapshot: buildDriveSnapshotMock,
  applyDriveSnapshotToLocalStorage: applyDriveSnapshotToLocalStorageMock,
}));

await jest.unstable_mockModule('../../../scripts/sync/driveSnapshotHash.js', () => ({
  computeDriveSnapshotHash: computeDriveSnapshotHashMock,
}));

await jest.unstable_mockModule(
  '../../../scripts/background/utils/updateNotificationVersion.cjs',
  () => ({
    shouldShowUpdateNotification: shouldShowUpdateNotificationMock,
    default: {
      shouldShowUpdateNotification: shouldShowUpdateNotificationMock,
    },
    updateNotificationVersion: {
      shouldShowUpdateNotification: shouldShowUpdateNotificationMock,
    },
    __esModule: true,
  })
);
await jest.unstable_mockModule('../../../scripts/utils/urlUtils.js', () => ({
  __esModule: true,
  computeStableUrl: jest.fn(url => url),
  normalizeUrl: jest.fn(url => url),
}));
await jest.unstable_mockModule('../../../scripts/utils/notionAuth.js', () => ({
  getActiveNotionToken: jest.fn(async () => ({ token: 'token' })),
}));
await jest.unstable_mockModule('../../../scripts/background/handlers/MessageHandler.js', () => ({
  MessageHandler: jest.fn(() => ({
    registerAll: jest.fn(),
    setupListener: jest.fn(),
  })),
}));
await jest.unstable_mockModule('../../../scripts/background/services/StorageService.js', () => ({
  StorageService: jest.fn(() => ({
    setupListeners: jest.fn(),
    updateHighlights: storageUpdateHighlightsMock,
    savePageDataAndHighlights: jest.fn(async () => undefined),
    setSavedPageData: jest.fn(async () => undefined),
    clearPageState: jest.fn(async () => undefined),
    clearNotionState: jest.fn(async () => undefined),
  })),
}));
await jest.unstable_mockModule('../../../scripts/background/services/NotionService.js', () => ({
  NotionService: jest.fn(() => ({ setupListeners: jest.fn() })),
}));
await jest.unstable_mockModule('../../../scripts/background/services/InjectionService.js', () => ({
  InjectionService: jest.fn(() => ({ setupListeners: jest.fn() })),
  isRestrictedInjectionUrl: jest.fn(() => false),
  isRecoverableInjectionError: jest.fn(() => false),
}));
await jest.unstable_mockModule(
  '../../../scripts/background/services/PageContentService.js',
  () => ({
    PageContentService: jest.fn(() => ({ setupListeners: jest.fn() })),
  })
);
await jest.unstable_mockModule('../../../scripts/background/services/TabService.js', () => ({
  TabService: jest.fn(() => ({ setupListeners: jest.fn() })),
}));
await jest.unstable_mockModule('../../../scripts/background/services/MigrationService.js', () => ({
  MigrationService: jest.fn(() => ({})),
}));
await jest.unstable_mockModule(
  '../../../scripts/background/services/StorageMigrationScanner.js',
  () => ({
    StorageMigrationScanner: jest.fn(() => ({})),
  })
);
await jest.unstable_mockModule(
  '../../../scripts/background/handlers/accountAuthHandler.js',
  () => ({
    createAccountAuthHandler: jest.fn(() => ({ setupListeners: jest.fn() })),
  })
);
await jest.unstable_mockModule('../../../scripts/background/handlers/logHandlers.js', () => ({
  createLogHandlers: jest.fn(() => ({})),
}));
await jest.unstable_mockModule('../../../scripts/background/handlers/migrationHandlers.js', () => ({
  createMigrationHandlers: jest.fn(() => ({})),
}));
await jest.unstable_mockModule('../../../scripts/background/handlers/notionHandlers.js', () => ({
  createNotionHandlers: jest.fn(() => ({})),
}));
await jest.unstable_mockModule('../../../scripts/background/handlers/saveHandlers.js', () => ({
  createSaveHandlers: jest.fn(() => ({})),
}));
await jest.unstable_mockModule('../../../scripts/background/handlers/highlightHandlers.js', () => ({
  createHighlightHandlers: jest.fn(() => ({})),
}));
await jest.unstable_mockModule('../../../scripts/background/handlers/sidepanelHandlers.js', () => ({
  createSidepanelHandlers: jest.fn(() => ({})),
}));
await jest.unstable_mockModule('../../../scripts/destinations/ProfileStore.js', () => ({
  AccountGatedDestinationEntitlementProvider: jest.fn(),
  LocalDestinationProfileRepository: jest.fn(),
}));
await jest.unstable_mockModule('../../../scripts/destinations/ProfileResolver.js', () => ({
  ProfileResolver: jest.fn().mockImplementation(() => ({
    resolve: jest.fn(async () => ({ id: 'default' })),
  })),
}));

const { RUNTIME_ACTIONS } = await import('../../../scripts/config/shared/runtimeActions.js');
const { DRIVE_SYNC_ERROR_CODES } =
  await import('../../../scripts/config/extension/driveSyncErrorCodes.js');
const { createDriveSyncHandlers } =
  await import('../../../scripts/background/handlers/driveSyncHandlers.js');

function resetDriveMocks() {
  for (const mock of [
    runAutoUploadMock,
    setupDriveAlarmMock,
    markDriveDirtyMock,
    uploadDriveSnapshotMock,
    downloadDriveSnapshotMock,
    getDriveSyncMetadataMock,
    ensureDriveSyncIdentityMock,
    updateDriveSyncRunMetadataMock,
    setDriveFrequencyMock,
    clearDriveDirtyMock,
    buildUnifiedPageStateFromLocalStorageMock,
    buildDriveSnapshotMock,
    applyDriveSnapshotToLocalStorageMock,
    computeDriveSnapshotHashMock,
  ]) {
    mock.mockReset();
  }
  runAutoUploadMock.mockResolvedValue(undefined);
  setupDriveAlarmMock.mockResolvedValue(undefined);
  markDriveDirtyMock.mockResolvedValue(undefined);
  storageUpdateHighlightsMock.mockReset().mockResolvedValue(undefined);
  shouldShowUpdateNotificationMock.mockReset().mockReturnValue(false);
  updateDriveSyncRunMetadataMock.mockResolvedValue(undefined);
  setDriveFrequencyMock.mockResolvedValue(undefined);
  clearDriveDirtyMock.mockResolvedValue(undefined);
  computeDriveSnapshotHashMock.mockReturnValue('snapshot-hash');
}

function resetLoggerMocks() {
  for (const mock of Object.values(loggerMock)) {
    mock.mockReset();
  }
}

beforeEach(() => {
  resetLoggerMocks();
  resetDriveMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  globalThis.chrome = makeDefaultChrome();
  globalThis.chrome.runtime.sendMessage = jest.fn(async () => undefined);
});

afterEach(() => {
  cleanup();
  resetLoggerMocks();
  delete globalThis.chrome;
  delete globalThis.Logger;
});

describe('background lifecycle native ESM depth coverage', () => {
  test('logs drive dirty tracking failures while preserving the original storage result', async () => {
    const chrome = makeDefaultChrome();
    chrome.storage.local.get.mockResolvedValue({ driveSyncFrequency: 'off' });
    globalThis.chrome = chrome;
    globalThis.Logger = loggerMock;
    markDriveDirtyMock.mockRejectedValueOnce(new Error('dirty unavailable'));
    storageUpdateHighlightsMock.mockResolvedValueOnce('saved');

    const surface = unwrapTestExports(await importBackgroundEntrypoint());

    await expect(surface.storageService.updateHighlights('url', [])).resolves.toBe('saved');
    expect(markDriveDirtyMock).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      '[Background] markDriveDirty failed during wrapper forward',
      expect.objectContaining({
        action: 'drive_dirty_tracking',
        methodName: 'updateHighlights',
        reason: 'dirty unavailable',
      })
    );
  });

  test('dispatches drive auto-sync alarms and ignores unrelated alarms', async () => {
    const chrome = makeDefaultChrome();
    chrome.storage.local.get.mockResolvedValue({ driveSyncFrequency: 'off' });
    globalThis.chrome = chrome;
    globalThis.Logger = loggerMock;

    unwrapTestExports(await importBackgroundEntrypoint());

    const alarmListener = chrome.alarms.onAlarm.addListener.mock.calls[0]?.[0];
    expect(alarmListener).toEqual(expect.any(Function));

    alarmListener({ name: 'other-alarm', scheduledTime: Date.UTC(2026, 0, 1) });
    expect(runAutoUploadMock).not.toHaveBeenCalled();

    alarmListener({ name: 'drive-auto-sync', scheduledTime: Date.UTC(2026, 0, 2) });
    expect(runAutoUploadMock).toHaveBeenCalledWith({
      alarmFiredAt: '2026-01-02T00:00:00.000Z',
    });
  });

  test('logs drive auto-sync alarm rejections', async () => {
    const chrome = makeDefaultChrome();
    chrome.storage.local.get.mockResolvedValue({ driveSyncFrequency: 'off' });
    globalThis.chrome = chrome;
    globalThis.Logger = loggerMock;
    runAutoUploadMock.mockRejectedValueOnce(new Error('upload failed'));

    unwrapTestExports(await importBackgroundEntrypoint());
    const alarmListener = chrome.alarms.onAlarm.addListener.mock.calls[0]?.[0];
    alarmListener({ name: 'drive-auto-sync', scheduledTime: Date.UTC(2026, 0, 2) });
    await Promise.resolve();

    expect(loggerMock.error).toHaveBeenCalledWith(
      '[Alarm] Drive 自動同步失敗',
      expect.objectContaining({
        action: 'auto_sync',
        reason: 'upload failed',
      })
    );
  });

  test('restores missing alarm through startup listener for stored frequency', async () => {
    const chrome = makeDefaultChrome();
    chrome.storage.local.get.mockResolvedValue({ driveSyncFrequency: 'daily' });
    chrome.alarms.get.mockResolvedValue(null);
    globalThis.chrome = chrome;
    globalThis.Logger = loggerMock;
    const setupDriveAlarmReached = new Promise(resolve => {
      setupDriveAlarmMock.mockImplementationOnce(async (frequency, options) => {
        resolve({ frequency, options });
      });
    });

    unwrapTestExports(await importBackgroundEntrypoint());
    const startupListener = chrome.runtime.onStartup.addListener.mock.calls[0]?.[0];
    expect(startupListener).toEqual(expect.any(Function));

    startupListener();
    await expect(setupDriveAlarmReached).resolves.toEqual({
      frequency: 'daily',
      options: { initialDelayInMinutes: 0.5 },
    });

    expect(setupDriveAlarmMock).toHaveBeenCalledWith('daily', { initialDelayInMinutes: 0.5 });
  });

  test('rebuilds drifted alarms and swallows startup recovery errors', async () => {
    const chrome = makeDefaultChrome();
    chrome.storage.local.get.mockResolvedValue({ driveSyncFrequency: 'weekly' });
    chrome.alarms.get.mockResolvedValue({ periodInMinutes: 1440 });
    globalThis.chrome = chrome;
    globalThis.Logger = loggerMock;
    const setupDriveAlarmReached = new Promise(resolve => {
      setupDriveAlarmMock.mockImplementationOnce(async (frequency, options) => {
        resolve({ frequency, options });
      });
    });
    const restoreLogged = new Promise(resolve => {
      loggerMock.info.mockImplementation((message, payload) => {
        if (message === '[Background] Drive auto sync alarm restored on startup') {
          resolve(payload);
        }
      });
    });

    await importBackgroundEntrypoint();

    await expect(setupDriveAlarmReached).resolves.toEqual({
      frequency: 'weekly',
      options: { initialDelayInMinutes: 0.5 },
    });
    expect(setupDriveAlarmMock).toHaveBeenCalledWith('weekly', {
      initialDelayInMinutes: 0.5,
    });
    expect(loggerMock.warn).toHaveBeenCalledWith(
      '[Background] Drive auto sync alarm period drifted, rebuilding',
      expect.objectContaining({
        frequency: 'weekly',
        expectedPeriod: 10080,
        actualPeriod: 1440,
      })
    );
    await expect(restoreLogged).resolves.toEqual({ frequency: 'weekly' });

    cleanup(chrome);
    resetDriveMocks();
    resetLoggerMocks();
    jest.resetModules();
    const failingChrome = makeDefaultChrome();
    failingChrome.storage.local.get.mockRejectedValue(new Error('storage unavailable'));
    globalThis.chrome = failingChrome;
    globalThis.Logger = loggerMock;
    const startupRecoveryWarned = new Promise(resolve => {
      loggerMock.warn.mockImplementation((message, payload) => {
        if (message === '[Background] ensureDriveAutoSyncAlarm failed') {
          resolve(payload);
        }
      });
    });

    await importBackgroundEntrypoint();

    await expect(startupRecoveryWarned).resolves.toEqual(
      expect.objectContaining({
        action: 'alarm_startup_recovery',
        reason: 'storage unavailable',
      })
    );
  });

  test('handles update notification success and failure lifecycle branches', async () => {
    const chrome = makeDefaultChrome();
    chrome.storage.local.get.mockResolvedValue({ driveSyncFrequency: 'off' });
    chrome.windows.create.mockResolvedValueOnce({ id: 9 });
    globalThis.chrome = chrome;
    globalThis.Logger = loggerMock;
    globalThis.URL = URL;
    shouldShowUpdateNotificationMock.mockReturnValue(true);

    const surface = unwrapTestExports(await importBackgroundEntrypoint());
    await surface.handleExtensionUpdate('2.8.0');

    expect(shouldShowUpdateNotificationMock).toHaveBeenCalledWith('2.8.0', '2.8.1');
    expect(chrome.windows.create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('pages/update-notification/update-notification.html'),
        type: 'popup',
        width: 480,
        height: 560,
        focused: true,
      })
    );
    expect(loggerMock.info).toHaveBeenCalledWith('[Lifecycle] 已顯示更新通知視窗');

    chrome.windows.create.mockRejectedValueOnce(new Error('window denied'));
    await surface.showUpdateNotification('2.8.0', '2.8.1');
    expect(loggerMock.warn).toHaveBeenCalledWith(
      '[Lifecycle] 顯示更新通知失敗',
      expect.objectContaining({ action: 'showUpdateNotification' })
    );
  });

  test('logs install onboarding tab creation failures', async () => {
    const chrome = makeDefaultChrome();
    chrome.storage.local.get.mockResolvedValue({ driveSyncFrequency: 'off' });
    chrome.tabs.create.mockRejectedValueOnce(new Error('tabs denied'));
    globalThis.chrome = chrome;
    globalThis.Logger = loggerMock;

    const surface = unwrapTestExports(await importBackgroundEntrypoint());
    surface.handleExtensionInstall();
    await Promise.resolve();

    expect(loggerMock.warn).toHaveBeenCalledWith(
      '[Lifecycle] 開啟 onboarding tab 失敗',
      expect.objectContaining({
        action: 'handleExtensionInstall',
        error: 'tabs denied',
      })
    );
  });
});

describe('drive sync handlers native ESM depth coverage', () => {
  test('handles manual upload success and clears dirty metadata with snapshot hash', async () => {
    const chrome = globalThis.chrome;
    getDriveSyncMetadataMock.mockResolvedValue({
      profileId: 'profile-1',
      lastKnownRemoteUpdatedAt: '2026-01-01T00:00:00.000Z',
      frequency: 'daily',
      dirtyRevision: 3,
    });
    ensureDriveSyncIdentityMock.mockResolvedValue('install-1');
    buildUnifiedPageStateFromLocalStorageMock.mockResolvedValue({
      pages: { 'https://example.com': { title: 'Page' } },
      urlAliases: {},
    });
    const snapshot = { metadata: { item_counts: { saved_states: 1 } } };
    buildDriveSnapshotMock.mockResolvedValue(snapshot);
    uploadDriveSnapshotMock.mockResolvedValue({
      success: true,
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const handlers = createDriveSyncHandlers();
    await expect(
      handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD]({ force: true })
    ).resolves.toEqual({
      success: true,
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(uploadDriveSnapshotMock).toHaveBeenCalledWith(snapshot, true, {
      lastKnownRemoteUpdatedAt: '2026-01-01T00:00:00.000Z',
      sourceInstallationId: 'install-1',
      sourceProfileId: 'profile-1',
    });
    expect(clearDriveDirtyMock).toHaveBeenCalledWith({
      snapshotHash: 'snapshot-hash',
      frequency: 'daily',
      expectedDirtyRevision: 3,
    });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED })
    );
  });

  test('reports remote-newer upload conflicts and upload exceptions', async () => {
    const chrome = globalThis.chrome;
    getDriveSyncMetadataMock.mockResolvedValue({
      profileId: 'profile-1',
      lastKnownRemoteUpdatedAt: null,
    });
    ensureDriveSyncIdentityMock.mockResolvedValue('install-1');
    buildUnifiedPageStateFromLocalStorageMock.mockResolvedValue({ pages: {}, urlAliases: {} });
    buildDriveSnapshotMock.mockResolvedValue({ metadata: { item_counts: {} } });
    uploadDriveSnapshotMock.mockResolvedValueOnce({
      success: false,
      errorCode: DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER,
      message: 'remote newer',
      remoteUpdatedAt: '2026-01-03T00:00:00.000Z',
    });

    const handlers = createDriveSyncHandlers();
    await expect(handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD]({})).resolves.toEqual({
      success: false,
      errorCode: DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER,
      error: 'remote newer',
      remoteUpdatedAt: '2026-01-03T00:00:00.000Z',
    });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_CONFLICT,
        conflictType: DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER,
      })
    );

    uploadDriveSnapshotMock.mockReset();
    buildDriveSnapshotMock.mockRejectedValueOnce(new Error('snapshot failed'));
    await expect(handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD]({})).resolves.toEqual({
      success: false,
      errorCode: DRIVE_SYNC_ERROR_CODES.UPLOAD_FAILED,
      error: 'snapshot failed',
    });
  });

  test('handles manual download success, no-remote snapshot, and schedule validation', async () => {
    downloadDriveSnapshotMock.mockResolvedValueOnce({
      metadata: { updated_at: '2026-01-04T00:00:00.000Z' },
    });
    applyDriveSnapshotToLocalStorageMock.mockResolvedValueOnce({
      writtenKeys: ['a', 'b'],
      removedKeys: ['c'],
    });

    const handlers = createDriveSyncHandlers();
    await expect(handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_DOWNLOAD]()).resolves.toEqual({
      success: true,
      writtenKeys: 2,
    });

    downloadDriveSnapshotMock.mockRejectedValueOnce(
      Object.assign(new Error('missing'), { code: DRIVE_SYNC_ERROR_CODES.NO_REMOTE_SNAPSHOT })
    );
    await expect(handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_DOWNLOAD]()).resolves.toEqual({
      success: false,
      errorCode: DRIVE_SYNC_ERROR_CODES.NO_REMOTE_SNAPSHOT,
      error: 'missing',
    });

    await expect(
      handlers[RUNTIME_ACTIONS.DRIVE_SYNC_SCHEDULE_UPDATED]({ frequency: 'yearly' })
    ).resolves.toEqual({ success: false, error: 'invalid frequency: yearly' });

    await expect(
      handlers[RUNTIME_ACTIONS.DRIVE_SYNC_SCHEDULE_UPDATED]({ frequency: 'weekly' })
    ).resolves.toEqual({ success: true });
    expect(setupDriveAlarmMock).toHaveBeenCalledWith('weekly');
    expect(setDriveFrequencyMock).toHaveBeenCalledWith('weekly');

    setupDriveAlarmMock.mockRejectedValueOnce(new Error('alarm failed'));
    await expect(
      handlers[RUNTIME_ACTIONS.DRIVE_SYNC_SCHEDULE_UPDATED]({ frequency: 'daily' })
    ).resolves.toEqual({ success: false, error: 'alarm failed' });
  });
});
