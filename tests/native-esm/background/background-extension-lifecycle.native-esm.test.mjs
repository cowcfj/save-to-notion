import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import {
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
await jest.unstable_mockModule(
  '../../../scripts/background/utils/updateNotificationVersion.cjs',
  () => ({
    shouldShowUpdateNotification: jest.fn(() => false),
    default: {
      shouldShowUpdateNotification: jest.fn(() => false),
    },
    updateNotificationVersion: {
      shouldShowUpdateNotification: jest.fn(() => false),
    },
    __esModule: true,
  })
);
await jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
  default: loggerMock,
}));
await jest.unstable_mockModule('../../../scripts/utils/urlUtils.js', () => ({
  computeStableUrl: jest.fn(url => url),
  normalizeUrl: jest.fn(url => url),
}));
await jest.unstable_mockModule('../../../scripts/utils/notionAuth.js', () => ({
  getActiveNotionToken: jest.fn(async () => ({ token: 'token' })),
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
  chrome.storage.local.get.mockResolvedValue({ frequency: 'off' });
  chrome.alarms.get.mockResolvedValue(undefined);
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

describe('background extension lifecycle native ESM', () => {
  test('onInstalled handler runs update path when reason=update', async () => {
    const runtime = globalThis.chrome.runtime;
    const onInstalledListener = runtime.onInstalled.addListener.mock.calls[0]?.[0];
    expect(typeof onInstalledListener).toBe('function');

    await onInstalledListener({ reason: 'update', previousVersion: '1.0.0' });

    expect(loggerMock.ready).toHaveBeenCalledWith(
      '[Lifecycle] Notion Smart Clipper extension ready'
    );
    expect(loggerMock.success).toHaveBeenCalledWith(
      '[Lifecycle] 擴展已更新',
      expect.objectContaining({ previousVersion: '1.0.0', currentVersion: '2.8.1' })
    );
  });

  test('onInstalled handler runs install path when reason=install', async () => {
    const runtime = globalThis.chrome.runtime;
    const onInstalledListener = runtime.onInstalled.addListener.mock.calls[0]?.[0];
    runtime.getURL.mockReturnValue('chrome-extension://ext-id/pages/onboarding/onboarding.html');

    await onInstalledListener({ reason: 'install', previousVersion: undefined });

    expect(globalThis.chrome.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://ext-id/pages/onboarding/onboarding.html',
    });
  });

  test('onStartup listener invokes startup recovery', async () => {
    const onStartupListener = globalThis.chrome.runtime.onStartup.addListener.mock.calls[0]?.[0];
    expect(typeof onStartupListener).toBe('function');
    chrome.storage.local.get.mockResolvedValue({ frequency: 'daily' });

    onStartupListener();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(globalThis.chrome.alarms.get).toHaveBeenCalled();
  });

  test('onAlarm listener is registered', () => {
    expect(globalThis.chrome.alarms.onAlarm.addListener).toHaveBeenCalledTimes(1);
  });
});
