import { describe, expect, jest, test } from '@jest/globals';
import {
  importBackgroundEntrypoint,
  makeDefaultChrome,
  makeLoggerMock,
  unwrapTestExports,
} from './backgroundLifecycleHarness.mjs';

const loggerMock = makeLoggerMock();

globalThis.chrome = makeDefaultChrome();
globalThis.chrome.storage.local.get.mockResolvedValue({ frequency: 'off' });
globalThis.chrome.alarms.get.mockResolvedValue(undefined);
globalThis.Logger = loggerMock;
globalThis.module = { exports: {} };

jest.mock('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: loggerMock,
  ...loggerMock,
}));

await jest.unstable_mockModule('../../../scripts/background/services/StorageService.js', () => ({
  StorageService: class {
    setupListeners() {}
  },
}));

await jest.unstable_mockModule('../../../scripts/background/services/TabService.js', () => ({
  TabService: class {
    constructor() {
      this.setupListeners = jest.fn(() => {
        globalThis.chrome.tabs.onUpdated.addListener(jest.fn());
        globalThis.chrome.tabs.onActivated.addListener(jest.fn());
        globalThis.chrome.tabs.onRemoved.addListener(jest.fn());
      });
      this.consumeDeletionConfirmation = jest.fn();
      this.confirmRemotePageMissing = jest.fn();
      this.resetRemotePageMissingState = jest.fn();
      this._applyMigration = jest.fn();
      this._isHttpOrHttpsUrl = jest.fn(() => true);
      this.updateTabStatus = jest.fn(async () => undefined);
    }
  },
}));

await jest.unstable_mockModule('../../../scripts/background/handlers/MessageHandler.js', () => ({
  MessageHandler: jest.fn(() => ({
    registerAll: jest.fn(),
    setupListener: jest.fn(),
  })),
}));

await jest.unstable_mockModule('../../../scripts/background/services/NotionService.js', () => ({
  NotionService: class {
    setupListeners() {}
  },
}));

await jest.unstable_mockModule('../../../scripts/background/services/InjectionService.js', () => ({
  InjectionService: class {
    setupListeners() {}
  },
  isRestrictedInjectionUrl: jest.fn(() => false),
  isRecoverableInjectionError: jest.fn(() => false),
}));

await jest.unstable_mockModule(
  '../../../scripts/background/services/PageContentService.js',
  () => ({
    PageContentService: class {
      setupListeners() {}
    },
  })
);

await jest.unstable_mockModule('../../../scripts/background/services/MigrationService.js', () => ({
  MigrationService: class {
    constructor() {}
  },
}));

await jest.unstable_mockModule(
  '../../../scripts/background/services/StorageMigrationScanner.js',
  () => ({
    StorageMigrationScanner: class {},
  })
);

await jest.unstable_mockModule(
  '../../../scripts/background/handlers/accountAuthHandler.js',
  () => ({
    createAccountAuthHandler: jest.fn(() => ({
      setupListeners: jest.fn(),
    })),
  })
);

await jest.unstable_mockModule('../../../scripts/background/handlers/saveHandlers.js', () => ({
  createSaveHandlers: jest.fn(() => ({})),
}));
await jest.unstable_mockModule('../../../scripts/background/handlers/highlightHandlers.js', () => ({
  createHighlightHandlers: jest.fn(() => ({})),
}));
await jest.unstable_mockModule('../../../scripts/background/handlers/migrationHandlers.js', () => ({
  createMigrationHandlers: jest.fn(() => ({})),
}));
await jest.unstable_mockModule('../../../scripts/background/handlers/logHandlers.js', () => ({
  createLogHandlers: jest.fn(() => ({})),
}));
await jest.unstable_mockModule('../../../scripts/background/handlers/notionHandlers.js', () => ({
  createNotionHandlers: jest.fn(() => ({})),
}));
await jest.unstable_mockModule('../../../scripts/background/handlers/sidepanelHandlers.js', () => ({
  createSidepanelHandlers: jest.fn(() => ({})),
}));
await jest.unstable_mockModule('../../../scripts/background/handlers/driveSyncHandlers.js', () => ({
  createDriveSyncHandlers: jest.fn(() => ({})),
}));
await jest.unstable_mockModule('../../../scripts/background/handlers/driveAutoSync.js', () => ({
  runAutoUpload: jest.fn(),
}));
await jest.unstable_mockModule(
  '../../../scripts/background/handlers/driveAlarmScheduler.js',
  () => ({
    DRIVE_AUTO_SYNC_ALARM: 'drive-auto-sync',
    FREQUENCY_PERIOD_MINUTES: { daily: 1440 },
    setupDriveAlarm: jest.fn(async () => {}),
  })
);

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

await jest.unstable_mockModule('../../../scripts/destinations/ProfileStore.js', () => ({
  AccountGatedDestinationEntitlementProvider: class {},
  LocalDestinationProfileRepository: class {},
}));

await jest.unstable_mockModule('../../../scripts/destinations/ProfileResolver.js', () => ({
  ProfileResolver: class {
    resolve() {
      return Promise.resolve({ id: 'default' });
    }
  },
}));

await jest.unstable_mockModule('../../../scripts/auth/driveClient.js', () => ({
  DRIVE_SYNC_FREQUENCIES: ['off', 'daily', 'weekly', 'monthly'],
  DRIVE_SYNC_STORAGE_KEYS: { FREQUENCY: 'frequency' },
  markDriveDirty: jest.fn(),
}));
await jest.unstable_mockModule('../../../scripts/utils/urlUtils.js', () => ({
  normalizeUrl: jest.fn(url => url),
  computeStableUrl: jest.fn(url => url),
}));
await jest.unstable_mockModule('../../../scripts/utils/notionAuth.js', () => ({
  getActiveNotionToken: jest.fn(async () => ({ token: 'token' })),
}));

const background = unwrapTestExports(await importBackgroundEntrypoint());

describe('background tab-listeners native ESM', () => {
  test('tabService constructor and setupListeners called on import', async () => {
    expect(globalThis.chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
    expect(globalThis.chrome.tabs.onActivated.addListener).toHaveBeenCalled();
    expect(globalThis.chrome.tabs.onRemoved.addListener).toHaveBeenCalled();
    expect(globalThis.chrome.runtime.onStartup.addListener).toHaveBeenCalled();
  });

  test('module is importable with mocks', async () => {
    expect(background).toHaveProperty('handleExtensionUpdate');
    await expect(background.handleExtensionUpdate('2.7.3')).resolves.toBeUndefined();
  });
});
