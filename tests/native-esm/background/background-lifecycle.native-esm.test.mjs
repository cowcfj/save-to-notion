import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import {
  assertTrustedBackgroundEntrypointPath,
  assertTrustedBackgroundLifecycleTestSurfacePath,
  cleanup,
  importBackgroundEntrypoint,
  makeDefaultChrome,
  makeLoggerMock,
  unwrapTestExports,
} from './backgroundLifecycleHarness.mjs';

const loggerMock = makeLoggerMock();

jest.mock('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: loggerMock,
  ...loggerMock,
}));

await jest.unstable_mockModule(
  '../../../scripts/background/utils/updateNotificationVersion.js',
  () => ({
    shouldShowUpdateNotification: jest.fn(() => false),
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
  StorageService: jest.fn(() => ({ setupListeners: jest.fn() })),
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
await jest.unstable_mockModule('../../../scripts/background/handlers/driveSyncHandlers.js', () => ({
  createDriveSyncHandlers: jest.fn(() => ({})),
}));
await jest.unstable_mockModule('../../../scripts/background/handlers/driveAutoSync.js', () => ({
  runAutoUpload: jest.fn(async () => undefined),
}));
await jest.unstable_mockModule(
  '../../../scripts/background/handlers/driveAlarmScheduler.js',
  () => ({
    DRIVE_AUTO_SYNC_ALARM: 'drive-auto-sync',
    FREQUENCY_PERIOD_MINUTES: { daily: 1440 },
    setupDriveAlarm: jest.fn(async () => undefined),
  })
);
await jest.unstable_mockModule('../../../scripts/auth/driveClient.js', () => ({
  DRIVE_SYNC_FREQUENCIES: ['off', 'daily', 'weekly', 'monthly'],
  DRIVE_SYNC_STORAGE_KEYS: { FREQUENCY: 'frequency' },
  markDriveDirty: jest.fn(),
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

let background;

beforeEach(async () => {
  cleanup();
  const chrome = makeDefaultChrome();
  chrome.runtime.getManifest.mockReturnValue({ version: '2.8.1' });
  chrome.runtime.getURL.mockImplementation(path => `chrome-extension://ext-id/${path}`);
  chrome.storage.local.get.mockResolvedValue({ frequency: 'off' });
  globalThis.module = { exports: {} };
  globalThis.chrome = chrome;
  globalThis.Logger = loggerMock;
  background = unwrapTestExports(await importBackgroundEntrypoint());
});

afterEach(() => {
  cleanup();
  delete globalThis.chrome;
  delete globalThis.Logger;
});

describe('background lifecycle harness source guard', () => {
  test('rejects non-background source paths before VM evaluation', async () => {
    const trustedPath = fileURLToPath(new URL('../../../scripts/background.js', import.meta.url));
    const untrustedPath = fileURLToPath(
      new URL('../../../scripts/config/shared/content.js', import.meta.url)
    );

    await expect(assertTrustedBackgroundEntrypointPath(trustedPath)).resolves.toBeUndefined();
    await expect(assertTrustedBackgroundEntrypointPath(untrustedPath)).rejects.toThrow(
      'Refusing to evaluate untrusted background entrypoint'
    );
  });

  test('rejects non-lifecycle test surface paths before VM evaluation', async () => {
    const trustedPath = fileURLToPath(
      new URL('../../../scripts/background/backgroundLifecycleTestSurface.js', import.meta.url)
    );
    const untrustedPath = fileURLToPath(
      new URL('../../../scripts/config/shared/content.js', import.meta.url)
    );

    await expect(
      assertTrustedBackgroundLifecycleTestSurfacePath(trustedPath)
    ).resolves.toBeUndefined();
    await expect(assertTrustedBackgroundLifecycleTestSurfacePath(untrustedPath)).rejects.toThrow(
      'Refusing to evaluate untrusted background lifecycle test surface'
    );
  });
});

describe('background lifecycle native ESM', () => {
  test('registers and dispatches onInstalled update/install handlers', () => {
    const onInstalledListener =
      globalThis.chrome.runtime.onInstalled.addListener.mock.calls[0]?.[0];
    expect(typeof onInstalledListener).toBe('function');

    onInstalledListener({ reason: 'update', previousVersion: '1.0.0' });
    expect(loggerMock.ready).toHaveBeenCalledWith(
      '[Lifecycle] Notion Smart Clipper extension ready'
    );
    expect(loggerMock.success).toHaveBeenCalledWith(
      '[Lifecycle] 擴展已更新',
      expect.objectContaining({ previousVersion: '1.0.0', currentVersion: '2.8.1' })
    );

    onInstalledListener({ reason: 'install', previousVersion: undefined });
    expect(globalThis.chrome.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://ext-id/pages/onboarding/onboarding.html',
    });
  });

  test('registers onStartup and onAlarm listeners', () => {
    expect(globalThis.chrome.runtime.onStartup.addListener).toHaveBeenCalledTimes(1);
    expect(globalThis.chrome.runtime.onStartup.addListener.mock.calls[0]?.[0]).toEqual(
      expect.any(Function)
    );
    expect(globalThis.chrome.alarms.onAlarm.addListener).toHaveBeenCalledTimes(1);
  });

  test('exports lifecycle helpers for incumbent parity', () => {
    expect(background.handleExtensionUpdate).toBeDefined();
    expect(background.handleExtensionInstall).toBeDefined();
    expect(background.shouldShowUpdateNotification).toBeDefined();
    expect(background.showUpdateNotification).toBeDefined();
  });

  test('handleExtensionInstall handles non-promise chrome.tabs.create', async () => {
    const onInstalledListener =
      globalThis.chrome.runtime.onInstalled.addListener.mock.calls[0]?.[0];
    expect(typeof onInstalledListener).toBe('function');

    globalThis.chrome.tabs.create.mockResolvedValue({ id: 1 });
    await onInstalledListener({ reason: 'install', previousVersion: undefined });

    expect(globalThis.chrome.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://ext-id/pages/onboarding/onboarding.html',
    });
  });
});
