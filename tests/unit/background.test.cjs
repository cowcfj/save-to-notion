/**
 * Background Script Lifecycle Tests
 */

// Mock all dependencies FIRST before requiring the module
const mockLogger = {
  ready: jest.fn(),
  success: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.doMock('../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: mockLogger,
  ready: mockLogger.ready,
  success: mockLogger.success,
  info: mockLogger.info,
  warn: mockLogger.warn,
  error: mockLogger.error,
}));

jest.doMock('../../scripts/utils/urlUtils.js', () => ({
  normalizeUrl: jest.fn(),
  computeStableUrl: jest.fn(),
}));

jest.doMock('../../scripts/config/shared/core.js', () => ({
  TAB_SERVICE: { LOADING_TIMEOUT_MS: 1000 },
}));

// Mock Services - return objects with setupListeners
const mockServiceInstance = {
  setupListeners: jest.fn(),
  getConfig: jest.fn().mockResolvedValue({}),
  getSavedPageData: jest.fn(),
  clearPageState: jest.fn(),
  setSavedPageData: jest.fn(),
  checkPageExists: jest.fn(),
  savePageDataAndHighlights: jest.fn().mockResolvedValue({}),
  updateHighlights: jest.fn().mockResolvedValue({}),
};

jest.doMock('../../scripts/background/services/StorageService.js', () => ({
  StorageService: jest.fn().mockImplementation(() => mockServiceInstance),
}));

jest.doMock('../../scripts/background/services/NotionService.js', () => ({
  NotionService: jest.fn().mockImplementation(() => mockServiceInstance),
}));

jest.doMock('../../scripts/background/services/InjectionService.js', () => ({
  InjectionService: jest.fn().mockImplementation(() => mockServiceInstance),
  isRestrictedInjectionUrl: jest.fn(),
  isRecoverableInjectionError: jest.fn(),
}));

jest.doMock('../../scripts/background/services/PageContentService.js', () => ({
  PageContentService: jest.fn().mockImplementation(() => mockServiceInstance),
}));

jest.doMock('../../scripts/background/services/TabService.js', () => ({
  TabService: jest.fn().mockImplementation(() => mockServiceInstance),
}));

jest.doMock('../../scripts/background/services/MigrationService.js', () => ({
  MigrationService: jest.fn().mockImplementation(() => mockServiceInstance),
}));

// Mock Handlers
jest.doMock('../../scripts/background/handlers/MessageHandler.js', () => ({
  MessageHandler: jest.fn().mockImplementation(() => ({
    registerAll: jest.fn(),
    setupListener: jest.fn(),
  })),
}));

jest.doMock('../../scripts/background/handlers/saveHandlers.js', () => ({
  createSaveHandlers: jest.fn().mockReturnValue({}),
}));
jest.doMock('../../scripts/background/handlers/highlightHandlers.js', () => ({
  createHighlightHandlers: jest.fn().mockReturnValue({}),
}));
jest.doMock('../../scripts/background/handlers/migrationHandlers.js', () => ({
  createMigrationHandlers: jest.fn().mockReturnValue({}),
}));
jest.doMock('../../scripts/background/handlers/logHandlers.js', () => ({
  createLogHandlers: jest.fn().mockReturnValue({}),
}));
jest.doMock('../../scripts/background/handlers/notionHandlers.js', () => ({
  createNotionHandlers: jest.fn().mockReturnValue({}),
}));
jest.doMock('../../scripts/background/handlers/accountAuthHandler.js', () => ({
  createAccountAuthHandler: jest.fn().mockReturnValue({
    setupListeners: jest.fn(),
  }),
}));

// Phase B: mock markDriveDirty 以避免 dirty tracking wrapper 污染 storageService mock
jest.doMock('../../scripts/auth/driveClient.js', () => ({
  DRIVE_SYNC_FREQUENCIES: ['off', 'daily', 'weekly', 'monthly'],
  DRIVE_SYNC_STORAGE_KEYS: { FREQUENCY: 'frequency' },
  markDriveDirty: jest.fn().mockResolvedValue(undefined),
}));

jest.doMock('../../scripts/background/handlers/driveAutoSync.js', () => ({
  runAutoUpload: jest.fn().mockResolvedValue(undefined),
}));

jest.doMock('../../scripts/background/handlers/driveAlarmScheduler.js', () => ({
  DRIVE_AUTO_SYNC_ALARM: 'drive-auto-sync',
  FREQUENCY_PERIOD_MINUTES: { daily: 1440, weekly: 10_080, monthly: 43_200 },
  setupDriveAlarm: jest.fn().mockResolvedValue(undefined),
}));

const loadBackgroundLifecycleSurfaceModule = () =>
  require('../../scripts/background/backgroundLifecycleTestSurface.js');
const isNativeDefaultRuntime = () =>
  (process.env.NODE_OPTIONS ?? '').includes('--experimental-vm-modules');
const BACKGROUND_ENTRYPOINT_PATH = '../../scripts/background.js';
let nativeBackgroundMocksRegistered = false;
let nativeRunAutoUploadMock = jest.fn().mockResolvedValue(undefined);
const nativeSetupDriveAlarmMock = jest.fn().mockResolvedValue(undefined);
const nativeMarkDriveDirtyMock = jest.fn().mockResolvedValue(undefined);

async function registerNativeBackgroundEntrypointMocks() {
  if (nativeBackgroundMocksRegistered || !isNativeDefaultRuntime()) {
    return;
  }

  await jest.unstable_mockModule('../../scripts/utils/Logger.js', () => ({
    __esModule: true,
    default: mockLogger,
    ...mockLogger,
  }));
  await jest.unstable_mockModule('../../scripts/utils/urlUtils.js', () => ({
    __esModule: true,
    normalizeUrl: jest.fn(url => url),
    computeStableUrl: jest.fn(url => url),
  }));
  await jest.unstable_mockModule('../../scripts/utils/notionAuth.js', () => ({
    getActiveNotionToken: jest.fn().mockResolvedValue({ token: 'test-oauth-token' }),
  }));
  await jest.unstable_mockModule('../../scripts/config/shared/core.js', () => ({
    TAB_SERVICE: { LOADING_TIMEOUT_MS: 1000 },
  }));

  await jest.unstable_mockModule('../../scripts/background/services/StorageService.js', () => ({
    StorageService: jest
      .fn()
      .mockImplementation(
        () => globalThis.__backgroundTestStorageServiceInstance ?? mockServiceInstance
      ),
  }));
  await jest.unstable_mockModule('../../scripts/background/services/NotionService.js', () => ({
    NotionService: jest
      .fn()
      .mockImplementation(
        () => globalThis.__backgroundTestNotionServiceInstance ?? mockServiceInstance
      ),
  }));
  await jest.unstable_mockModule('../../scripts/background/services/InjectionService.js', () => ({
    InjectionService: jest.fn().mockImplementation(() => mockServiceInstance),
    isRestrictedInjectionUrl: jest.fn(url =>
      (globalThis.__backgroundTestIsRestrictedInjectionUrl ?? jest.fn())(url)
    ),
    isRecoverableInjectionError: jest.fn(error =>
      (globalThis.__backgroundTestIsRecoverableInjectionError ?? jest.fn())(error)
    ),
  }));
  await jest.unstable_mockModule('../../scripts/background/services/PageContentService.js', () => ({
    PageContentService: jest.fn().mockImplementation(() => mockServiceInstance),
  }));
  await jest.unstable_mockModule('../../scripts/background/services/TabService.js', () => ({
    TabService: jest.fn().mockImplementation(options => {
      globalThis.__backgroundTestActualTabServiceDeps = options;
      return { setupListeners: jest.fn() };
    }),
  }));
  await jest.unstable_mockModule('../../scripts/background/services/MigrationService.js', () => ({
    MigrationService: jest.fn().mockImplementation(() => mockServiceInstance),
  }));
  await jest.unstable_mockModule(
    '../../scripts/background/services/StorageMigrationScanner.js',
    () => ({
      StorageMigrationScanner: jest.fn().mockImplementation(() => mockServiceInstance),
    })
  );
  await jest.unstable_mockModule('../../scripts/background/handlers/MessageHandler.js', () => ({
    MessageHandler: jest.fn().mockImplementation(() => ({
      registerAll: jest.fn(),
      setupListener: jest.fn(),
    })),
  }));

  for (const [modulePath, exportName] of [
    ['../../scripts/background/handlers/saveHandlers.js', 'createSaveHandlers'],
    ['../../scripts/background/handlers/highlightHandlers.js', 'createHighlightHandlers'],
    ['../../scripts/background/handlers/migrationHandlers.js', 'createMigrationHandlers'],
    ['../../scripts/background/handlers/logHandlers.js', 'createLogHandlers'],
    ['../../scripts/background/handlers/notionHandlers.js', 'createNotionHandlers'],
    ['../../scripts/background/handlers/sidepanelHandlers.js', 'createSidepanelHandlers'],
    ['../../scripts/background/handlers/driveSyncHandlers.js', 'createDriveSyncHandlers'],
  ]) {
    await jest.unstable_mockModule(modulePath, () => ({ [exportName]: jest.fn(() => ({})) }));
  }

  await jest.unstable_mockModule('../../scripts/background/handlers/accountAuthHandler.js', () => ({
    createAccountAuthHandler: jest
      .fn()
      .mockImplementation(
        () => globalThis.__backgroundTestAccountAuthHandler ?? { setupListeners: jest.fn() }
      ),
  }));
  await jest.unstable_mockModule('../../scripts/background/handlers/driveAutoSync.js', () => ({
    runAutoUpload: (...args) => nativeRunAutoUploadMock(...args),
  }));
  await jest.unstable_mockModule(
    '../../scripts/background/handlers/driveAlarmScheduler.js',
    () => ({
      DRIVE_AUTO_SYNC_ALARM: 'drive-auto-sync',
      FREQUENCY_PERIOD_MINUTES: { daily: 1440, weekly: 10_080, monthly: 43_200 },
      setupDriveAlarm: (...args) => nativeSetupDriveAlarmMock(...args),
    })
  );
  await jest.unstable_mockModule('../../scripts/auth/driveClient.js', () => ({
    DRIVE_SYNC_FREQUENCIES: ['off', 'daily', 'weekly', 'monthly'],
    DRIVE_SYNC_STORAGE_KEYS: { FREQUENCY: 'frequency' },
    markDriveDirty: (...args) => nativeMarkDriveDirtyMock(...args),
  }));
  await jest.unstable_mockModule('../../scripts/destinations/ProfileStore.js', () => ({
    AccountGatedDestinationEntitlementProvider: jest.fn(),
    LocalDestinationProfileRepository: jest.fn(),
  }));
  await jest.unstable_mockModule('../../scripts/destinations/ProfileResolver.js', () => ({
    ProfileResolver: jest.fn().mockImplementation(() => ({
      resolve: jest.fn().mockResolvedValue({ id: 'default' }),
    })),
  }));

  nativeBackgroundMocksRegistered = true;
}

const DRIVE_ALARM_RESTORE_CALL = ['daily', { initialDelayInMinutes: 0.5 }];

function loadBackgroundLifecycleTestSurface() {
  require(BACKGROUND_ENTRYPOINT_PATH);
  return loadBackgroundLifecycleSurfaceModule().getBackgroundLifecycleTestSurface();
}

async function loadNativeBackgroundLifecycleTestSurface(chromeMock = globalThis.chrome) {
  await registerNativeBackgroundEntrypointMocks();
  globalThis.module = { exports: {} };
  globalThis.chrome = chromeMock;
  globalThis.Logger = mockLogger;
  globalThis.URL = URL;
  const { importBackgroundEntrypoint, setupBackgroundEntrypointGlobals, unwrapTestExports } =
    await import('../native-esm/background/backgroundLifecycleHarness.mjs');
  setupBackgroundEntrypointGlobals({ chrome: chromeMock, logger: mockLogger });
  return unwrapTestExports(await importBackgroundEntrypoint());
}

async function loadBackgroundLifecycleTestSurfaceForRuntime(chromeMock = globalThis.chrome) {
  if (isNativeDefaultRuntime()) {
    return loadNativeBackgroundLifecycleTestSurface(chromeMock);
  }
  return loadBackgroundLifecycleTestSurface();
}

async function loadDriveAutoSyncAlarmCallback(runAutoUploadMock) {
  jest.resetModules();
  const alarmsAddListener = jest.fn();
  globalThis.chrome = {
    runtime: { onInstalled: { addListener: jest.fn() } },
    alarms: { onAlarm: { addListener: alarmsAddListener } },
    storage: {
      local: {
        get: jest.fn().mockResolvedValue({}),
      },
    },
  };

  const driveAutoSyncMock = { runAutoUpload: runAutoUploadMock };
  jest.doMock('../../scripts/background/handlers/driveAutoSync.js', () => driveAutoSyncMock);

  if (isNativeDefaultRuntime()) {
    nativeRunAutoUploadMock = runAutoUploadMock;
    await loadBackgroundLifecycleTestSurfaceForRuntime(globalThis.chrome);
  } else {
    require(BACKGROUND_ENTRYPOINT_PATH);
  }

  return {
    alarmCallback: alarmsAddListener.mock.calls[0][0],
    driveAutoSyncMock,
  };
}

function createDriveAlarmStartupChromeMock({ frequency = 'daily', alarm = null } = {}) {
  const { DRIVE_SYNC_STORAGE_KEYS } = require('../../scripts/auth/driveClient.js');

  return {
    runtime: {
      getManifest: jest.fn(),
      getURL: jest.fn(path => `chrome-extension://id/${path}`),
      onInstalled: { addListener: jest.fn() },
      onMessage: { addListener: jest.fn() },
    },
    tabs: {
      create: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn(),
      onUpdated: { addListener: jest.fn(), removeListener: jest.fn() },
      onRemoved: { addListener: jest.fn(), removeListener: jest.fn() },
      get: jest.fn(),
    },
    windows: { create: jest.fn() },
    alarms: {
      create: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(true),
      get: jest.fn().mockResolvedValue(alarm),
      onAlarm: { addListener: jest.fn(), removeListener: jest.fn() },
    },
    storage: {
      local: {
        get: jest.fn().mockResolvedValue({ [DRIVE_SYNC_STORAGE_KEYS.FREQUENCY]: frequency }),
      },
    },
  };
}

async function loadBackgroundWithDriveAlarmStartup(options) {
  jest.resetModules();

  const driveAlarmScheduler = isNativeDefaultRuntime()
    ? { setupDriveAlarm: nativeSetupDriveAlarmMock }
    : require('../../scripts/background/handlers/driveAlarmScheduler.js');
  globalThis.chrome = createDriveAlarmStartupChromeMock(options);
  globalThis.Logger = mockLogger;

  if (isNativeDefaultRuntime()) {
    nativeSetupDriveAlarmMock.mockClear();
    await loadBackgroundLifecycleTestSurfaceForRuntime(globalThis.chrome);
  } else {
    require(BACKGROUND_ENTRYPOINT_PATH);
  }
  await new Promise(resolve => setTimeout(resolve, 0));

  return driveAlarmScheduler;
}

function createTabServiceDependencyMocks() {
  const mockStorage = {
    getSavedPageData: jest.fn().mockResolvedValue('data'),
    clearPageState: jest.fn().mockResolvedValue('cleared1'),
    clearNotionState: jest.fn().mockResolvedValue('cleared2'),
    setSavedPageData: jest.fn().mockResolvedValue('set'),
    savePageDataAndHighlights: jest.fn().mockResolvedValue('saved'),
    updateHighlights: jest.fn().mockResolvedValue('updated'),
  };

  return {
    mockStorage,
    mockNotion: {
      checkPageExists: jest.fn().mockResolvedValue(true),
    },
    restrictedUrlMock: jest.fn().mockReturnValue(true),
    recoverableErrorMock: jest.fn().mockReturnValue(false),
  };
}

function snapshotUnderlyingStorageMocks(mockStorage) {
  return {
    clearPageState: mockStorage.clearPageState,
    clearNotionState: mockStorage.clearNotionState,
    setSavedPageData: mockStorage.setSavedPageData,
    savePageDataAndHighlights: mockStorage.savePageDataAndHighlights,
    updateHighlights: mockStorage.updateHighlights,
  };
}

function exposeNativeTabServiceDependencyMocks({
  mockStorage,
  mockNotion,
  restrictedUrlMock,
  recoverableErrorMock,
}) {
  globalThis.__backgroundTestStorageServiceInstance = mockStorage;
  globalThis.__backgroundTestNotionServiceInstance = mockNotion;
  globalThis.__backgroundTestIsRestrictedInjectionUrl = restrictedUrlMock;
  globalThis.__backgroundTestIsRecoverableInjectionError = recoverableErrorMock;
}

const BACKGROUND_TEST_GLOBALS = [
  '__backgroundTestStorageServiceInstance',
  '__backgroundTestNotionServiceInstance',
  '__backgroundTestIsRestrictedInjectionUrl',
  '__backgroundTestIsRecoverableInjectionError',
  '__backgroundTestActualTabServiceDeps',
  '__backgroundTestAccountAuthHandler',
];

function cleanupBackgroundTestGlobals() {
  for (const globalName of BACKGROUND_TEST_GLOBALS) {
    delete globalThis[globalName];
  }
}

let shouldShowUpdateNotification;
let handleExtensionUpdate;
let handleExtensionInstall;

describe('Background Script Lifecycle', () => {
  let mockChrome;

  beforeAll(async () => {
    const lifecycleSurface = await loadBackgroundLifecycleTestSurfaceForRuntime(globalThis.chrome);
    ({ shouldShowUpdateNotification, handleExtensionUpdate, handleExtensionInstall } =
      lifecycleSurface);
  });

  async function handleMinorVersionUpdate(setupWindowCreate) {
    mockChrome.runtime.getManifest.mockReturnValue({ version: '2.8.0' });
    setupWindowCreate(mockChrome.windows.create);
    await handleExtensionUpdate('2.7.0');
  }

  async function loadOnInstalledCallback() {
    await loadBackgroundLifecycleTestSurfaceForRuntime(mockChrome);
    return mockChrome.runtime.onInstalled.addListener.mock.calls[0][0];
  }

  beforeEach(() => {
    jest.clearAllMocks();

    mockChrome = {
      runtime: {
        getManifest: jest.fn(),
        getURL: jest.fn(path => `chrome-extension://id/${path}`),
        onInstalled: {
          addListener: jest.fn(),
        },
        onMessage: {
          addListener: jest.fn(),
        },
      },
      tabs: {
        create: jest.fn().mockResolvedValue(undefined),
        sendMessage: jest.fn(),
        onUpdated: {
          addListener: jest.fn(),
          removeListener: jest.fn(),
        },
        onRemoved: {
          addListener: jest.fn(),
          removeListener: jest.fn(),
        },
        get: jest.fn(),
      },
      windows: {
        create: jest.fn(),
      },
      // Phase B: alarm API mock
      alarms: {
        create: jest.fn().mockResolvedValue(undefined),
        clear: jest.fn().mockResolvedValue(true),
        onAlarm: { addListener: jest.fn(), removeListener: jest.fn() },
      },
    };
    globalThis.chrome = mockChrome;
    globalThis.Logger = mockLogger;
  });

  afterEach(() => {
    cleanupBackgroundTestGlobals();
  });

  describe('shouldShowUpdateNotification', () => {
    test.each([
      ['major version upgrade', '1.0.0', '2.0.0', true],
      ['minor version upgrade', '1.0.0', '1.1.0', true],
      ['major downgrade', '2.0.0', '1.0.0', false],
      ['minor downgrade', '1.1.0', '1.0.0', false],
      ['patch upgrade from patch', '2.7.2', '2.7.3', false],
      ['patch upgrade from minor', '2.7.0', '2.7.1', false],
      ['same version', '1.0.0', '1.0.0', false],
      ['missing previous version', null, '2.0.0', false],
      ['missing current version', '1.0.0', null, false],
      ['undefined previous version', undefined, '2.0.0', false],
      ['undefined current version', '1.0.0', undefined, false],
      ['missing both versions', null, null, false],
    ])('returns %s result', (_caseName, previousVersion, currentVersion, expected) => {
      expect(shouldShowUpdateNotification(previousVersion, currentVersion)).toBe(expected);
    });
  });

  describe('startup listeners', () => {
    test('應在啟動時註冊 account callback bridge listener', async () => {
      jest.resetModules();

      const mockAccountAuthHandler = {
        setupListeners: jest.fn(),
      };
      globalThis.__backgroundTestAccountAuthHandler = mockAccountAuthHandler;

      jest.doMock('../../scripts/background/handlers/accountAuthHandler.js', () => ({
        createAccountAuthHandler: jest.fn().mockReturnValue(mockAccountAuthHandler),
      }));

      await loadBackgroundLifecycleTestSurfaceForRuntime(mockChrome);

      expect(mockAccountAuthHandler.setupListeners).toHaveBeenCalledTimes(1);
    });

    test.each([
      ['alarm 缺失且 frequency 啟用時', undefined],
      [
        'alarm 存在但 periodInMinutes 與 frequency 不一致時',
        { name: 'drive-auto-sync', periodInMinutes: 10_080 },
      ],
    ])('%s，應以短首延遲恢復排程', async (_caseName, alarm) => {
      const driveAlarmScheduler = await loadBackgroundWithDriveAlarmStartup({ alarm });

      expect(driveAlarmScheduler.setupDriveAlarm).toHaveBeenCalledWith(...DRIVE_ALARM_RESTORE_CALL);
    });

    test('alarm 已存在時，不應重建排程', async () => {
      // 有效 alarm：periodInMinutes 與 frequency=daily(1440) 一致
      const driveAlarmScheduler = await loadBackgroundWithDriveAlarmStartup({
        alarm: { name: 'drive-auto-sync', periodInMinutes: 1440 },
      });

      expect(driveAlarmScheduler.setupDriveAlarm).not.toHaveBeenCalled();
    });

    test('production 環境載入 background 時不應暴露 lifecycle test surface', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      let lifecycleSurfaceModule;
      let originalSurface;
      const sentinelSurface = { sentinel: true };

      try {
        process.env.NODE_ENV = 'production';
        jest.resetModules();
        lifecycleSurfaceModule = isNativeDefaultRuntime()
          ? await import('../../scripts/background/backgroundLifecycleTestSurface.js')
          : loadBackgroundLifecycleSurfaceModule();
        originalSurface = lifecycleSurfaceModule.getBackgroundLifecycleTestSurface();
        lifecycleSurfaceModule.setBackgroundLifecycleTestSurface(sentinelSurface);
        globalThis.chrome = createDriveAlarmStartupChromeMock({ frequency: 'off' });
        globalThis.Logger = mockLogger;

        if (isNativeDefaultRuntime()) {
          await loadBackgroundLifecycleTestSurfaceForRuntime(globalThis.chrome);
        } else {
          require(BACKGROUND_ENTRYPOINT_PATH);
        }

        expect(lifecycleSurfaceModule.getBackgroundLifecycleTestSurface()).toBe(sentinelSurface);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        lifecycleSurfaceModule?.setBackgroundLifecycleTestSurface(originalSurface);
        jest.resetModules();
      }
    });
  });

  describe('handleExtensionUpdate', () => {
    test('Should show notification popup for important updates', async () => {
      await handleMinorVersionUpdate(createWindow => createWindow.mockResolvedValue({ id: 123 }));

      expect(mockChrome.windows.create).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('update-notification.html?prev=2.7.0&curr=2.8.0'),
          type: 'popup',
        })
      );
    });

    test('Should handle failure when creating window', async () => {
      await handleMinorVersionUpdate(createWindow =>
        createWindow.mockRejectedValue(new Error('creation failed'))
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('顯示更新通知失敗'),
        expect.objectContaining({
          error: expect.any(Error),
          action: 'showUpdateNotification',
        })
      );
    });

    test('Should NOT show notification for patch updates', async () => {
      mockChrome.runtime.getManifest.mockReturnValue({ version: '2.8.1' });

      await handleExtensionUpdate('2.8.0'); // Patch update

      expect(mockChrome.windows.create).not.toHaveBeenCalled();
    });
  });

  describe('onInstalled listener', () => {
    beforeEach(async () => {
      jest.resetModules();

      // 確保需要被依賴的 utils 都被 Mock
      jest.doMock('../../scripts/utils/notionAuth.js', () => ({
        getActiveNotionToken: jest.fn().mockResolvedValue({ token: 'test-oauth-token' }),
      }));
      jest.doMock('../../scripts/utils/Logger.js', () => ({
        __esModule: true,
        default: mockLogger,
        ready: mockLogger.ready,
        success: mockLogger.success,
        info: mockLogger.info,
        warn: mockLogger.warn,
        error: mockLogger.error,
      }));

      // Service Mocks 要存在不然 background.js 會報錯
      const mockServiceInstanceLocal = {
        setupListeners: jest.fn(),
      };

      jest.doMock('../../scripts/background/services/StorageService.js', () => ({
        StorageService: jest.fn().mockImplementation(() => mockServiceInstanceLocal),
      }));
      jest.doMock('../../scripts/background/services/NotionService.js', () => ({
        NotionService: jest.fn().mockImplementation(() => mockServiceInstanceLocal),
      }));
      jest.doMock('../../scripts/background/services/InjectionService.js', () => ({
        InjectionService: jest.fn().mockImplementation(() => mockServiceInstanceLocal),
        isRestrictedInjectionUrl: jest.fn(),
        isRecoverableInjectionError: jest.fn(),
      }));
      jest.doMock('../../scripts/background/services/PageContentService.js', () => ({
        PageContentService: jest.fn().mockImplementation(() => mockServiceInstanceLocal),
      }));
      jest.doMock('../../scripts/background/services/TabService.js', () => ({
        TabService: jest.fn().mockImplementation(() => mockServiceInstanceLocal),
      }));
      jest.doMock('../../scripts/background/services/MigrationService.js', () => ({
        MigrationService: jest.fn().mockImplementation(() => mockServiceInstanceLocal),
      }));
      jest.doMock('../../scripts/background/handlers/MessageHandler.js', () => ({
        MessageHandler: jest.fn().mockImplementation(() => ({
          registerAll: jest.fn(),
          setupListener: jest.fn(),
        })),
      }));

      // Handler Mocks
      jest.doMock('../../scripts/background/handlers/saveHandlers.js', () => ({
        createSaveHandlers: jest.fn(),
      }));
      jest.doMock('../../scripts/background/handlers/highlightHandlers.js', () => ({
        createHighlightHandlers: jest.fn(),
      }));
      jest.doMock('../../scripts/background/handlers/migrationHandlers.js', () => ({
        createMigrationHandlers: jest.fn(),
      }));
      jest.doMock('../../scripts/background/handlers/logHandlers.js', () => ({
        createLogHandlers: jest.fn(),
      }));
      jest.doMock('../../scripts/background/handlers/notionHandlers.js', () => ({
        createNotionHandlers: jest.fn(),
      }));
      jest.doMock('../../scripts/background/handlers/sidepanelHandlers.js', () => ({
        createSidepanelHandlers: jest.fn(),
      }));

      // 設定 chrome object
      globalThis.chrome = mockChrome;
      globalThis.Logger = mockLogger;
    });

    afterEach(() => {
      // 復原 require 狀態
      jest.resetModules();
    });

    test('Should handle install reason', async () => {
      const callback = await loadOnInstalledCallback();

      callback({ reason: 'install' });
      expect(mockLogger.ready).toHaveBeenCalled();
      expect(mockLogger.success).toHaveBeenCalledWith(
        expect.stringContaining('擴展首次安裝'),
        expect.any(Object)
      );
    });

    test('Should handle update reason', async () => {
      mockChrome.runtime.getManifest.mockReturnValue({ version: '2.8.1' }); // patch update, won't trigger ui
      const callback = await loadOnInstalledCallback();

      callback({ reason: 'update', previousVersion: '2.8.0' });

      expect(mockLogger.ready).toHaveBeenCalled();
      expect(mockChrome.tabs.create).not.toHaveBeenCalled();
    });
  });

  describe('handleExtensionInstall', () => {
    test('Should log installation', () => {
      handleExtensionInstall();
      expect(mockLogger.success).toHaveBeenCalledWith(
        expect.stringContaining('擴展首次安裝'),
        expect.any(Object)
      );
    });
  });

  describe('TabService Dependencies from background.js', () => {
    let storageServiceMock, notionServiceMock, injectionServiceMock;
    let actualTabServiceDeps;
    /**
     * 保存 wrapWithDriveDirtyTracking 執行前的原始 jest.fn() 參考，
     * 讓我們能驗證底層 storage 確實收到 args（wrapper 本身不是 jest.fn）。
     */
    let underlyingStorageMocks;

    function registerTabServiceDependencyMocks(dependencyMocks) {
      const { mockStorage, mockNotion } = dependencyMocks;

      jest.doMock('../../scripts/utils/notionAuth.js', () => ({
        getActiveNotionToken: jest.fn().mockResolvedValue({ token: 'test-oauth-token' }),
      }));
      jest.doMock('../../scripts/utils/Logger.js', () => ({
        __esModule: true,
        default: mockLogger,
      }));
      jest.doMock('../../scripts/background/services/StorageService.js', () => ({
        StorageService: jest.fn().mockImplementation(() => mockStorage),
      }));
      jest.doMock('../../scripts/background/services/NotionService.js', () => ({
        NotionService: jest.fn().mockImplementation(() => mockNotion),
      }));
      jest.doMock('../../scripts/background/services/InjectionService.js', () => ({
        InjectionService: jest.fn().mockImplementation(() => ({})),
        isRestrictedInjectionUrl: jest.fn().mockReturnValue(true),
        isRecoverableInjectionError: jest.fn().mockReturnValue(false),
      }));
      jest.doMock('../../scripts/background/services/PageContentService.js', () => ({
        PageContentService: jest.fn().mockImplementation(() => ({})),
      }));
      jest.doMock('../../scripts/background/services/MigrationService.js', () => ({
        MigrationService: jest.fn().mockImplementation(() => ({})),
      }));
      jest.doMock('../../scripts/background/services/TabService.js', () => ({
        TabService: jest.fn().mockImplementation(options => {
          actualTabServiceDeps = options;
          return { setupListeners: jest.fn() };
        }),
      }));
    }

    async function loadTabServiceDependenciesForRuntime({
      restrictedUrlMock,
      recoverableErrorMock,
    }) {
      if (isNativeDefaultRuntime()) {
        const surface = await loadBackgroundLifecycleTestSurfaceForRuntime(globalThis.chrome);

        return {
          actualTabServiceDeps: globalThis.__backgroundTestActualTabServiceDeps,
          storageServiceMock: surface.storageService,
          notionServiceMock: surface.notionService,
          injectionServiceMock: {
            isRestrictedInjectionUrl: restrictedUrlMock,
            isRecoverableInjectionError: recoverableErrorMock,
          },
        };
      }

      require(BACKGROUND_ENTRYPOINT_PATH);

      const storageModule = require('../../scripts/background/services/StorageService.js');
      const notionModule = require('../../scripts/background/services/NotionService.js');
      const injectionModule = require('../../scripts/background/services/InjectionService.js');

      return {
        actualTabServiceDeps,
        storageServiceMock: new storageModule.StorageService(),
        notionServiceMock: new notionModule.NotionService(),
        injectionServiceMock: injectionModule,
      };
    }

    beforeEach(async () => {
      // 重新 require 模組以捕捉傳給 TabService 的參數
      jest.resetModules();

      const dependencyMocks = createTabServiceDependencyMocks();
      underlyingStorageMocks = snapshotUnderlyingStorageMocks(dependencyMocks.mockStorage);
      exposeNativeTabServiceDependencyMocks(dependencyMocks);
      registerTabServiceDependencyMocks(dependencyMocks);

      ({ actualTabServiceDeps, storageServiceMock, notionServiceMock, injectionServiceMock } =
        await loadTabServiceDependenciesForRuntime(dependencyMocks));
    });

    afterEach(() => {
      cleanupBackgroundTestGlobals();
    });

    test('getSavedPageData maps to StorageService.getSavedPageData', async () => {
      await actualTabServiceDeps.getSavedPageData('url1');
      expect(storageServiceMock.getSavedPageData).toHaveBeenCalledWith('url1');
    });

    test('isRestrictedUrl maps to isRestrictedInjectionUrl', () => {
      const res = actualTabServiceDeps.isRestrictedUrl('url2');
      expect(injectionServiceMock.isRestrictedInjectionUrl).toHaveBeenCalledWith('url2');
      expect(res).toBe(true);
    });

    test('isRecoverableError maps to isRecoverableInjectionError', () => {
      const res = actualTabServiceDeps.isRecoverableError('err');
      expect(injectionServiceMock.isRecoverableInjectionError).toHaveBeenCalledWith('err');
      expect(res).toBe(false);
    });

    test('checkPageExists maps to NotionService.checkPageExists', async () => {
      await actualTabServiceDeps.checkPageExists('page-123', 'key1');
      expect(notionServiceMock.checkPageExists).toHaveBeenCalledWith('page-123', {
        apiKey: 'key1',
      });
    });

    test('getApiKey maps to getActiveNotionToken().then(result => result.token)', async () => {
      const token = await actualTabServiceDeps.getApiKey();
      expect(token).toBe('test-oauth-token');
    });

    test('clearPageState maps to StorageService.clearPageState', async () => {
      await actualTabServiceDeps.clearPageState('url3');
      // wrapWithDriveDirtyTracking 已包裝 clearPageState，需透過原始 jest.fn 驗證底層收到 args
      expect(underlyingStorageMocks.clearPageState).toHaveBeenCalledWith('url3');
    });

    test('clearNotionState maps to StorageService.clearNotionState', async () => {
      await actualTabServiceDeps.clearNotionState('url4', { expectedPageId: '123' });
      expect(underlyingStorageMocks.clearNotionState).toHaveBeenCalledWith('url4', {
        expectedPageId: '123',
      });
    });

    test('clearNotionStateWithRetry maps to StorageService.clearNotionStateWithRetry', async () => {
      // Setup mock since it wasn't added to the shared mock storage
      storageServiceMock.clearNotionStateWithRetry = jest.fn().mockResolvedValue('cleared3');
      await actualTabServiceDeps.clearNotionStateWithRetry('urlRetry', { opt: 1 });
      expect(storageServiceMock.clearNotionStateWithRetry).toHaveBeenCalledWith('urlRetry', {
        opt: 1,
      });
    });

    test('setSavedPageData maps to StorageService.setSavedPageData', async () => {
      // Phase B dirty tracking 會 wrap setSavedPageData，
      // 驗證底層 storage 收到原始 args。
      await actualTabServiceDeps.setSavedPageData('url5', { data: 1 });
      expect(underlyingStorageMocks.setSavedPageData).toHaveBeenCalledWith('url5', { data: 1 });
    });

    async function expectDirtyTrackingForward({ methodName, args }) {
      const bgModule = isNativeDefaultRuntime()
        ? { storageService: storageServiceMock }
        : loadBackgroundLifecycleTestSurface();
      const driveClient = isNativeDefaultRuntime()
        ? { markDriveDirty: nativeMarkDriveDirtyMock }
        : require('../../scripts/auth/driveClient.js');

      nativeMarkDriveDirtyMock.mockClear();
      await bgModule.storageService[methodName](...args);
      expect(underlyingStorageMocks[methodName]).toHaveBeenCalledWith(...args);
      expect(driveClient.markDriveDirty).toHaveBeenCalled();
    }

    // eslint-disable-next-line jest/expect-expect -- assertions live in expectDirtyTrackingForward.
    test.each([
      [
        'savePageDataAndHighlights',
        {
          methodName: 'savePageDataAndHighlights',
          args: ['url', { page: 1 }, [1, 2]],
        },
      ],
      ['updateHighlights', { methodName: 'updateHighlights', args: ['url', ['h1']] }],
      ['setSavedPageData', { methodName: 'setSavedPageData', args: ['url', { data: 1 }] }],
      ['clearPageState', { methodName: 'clearPageState', args: ['url-to-clear'] }],
      [
        'clearNotionState',
        { methodName: 'clearNotionState', args: ['url-clear-notion', { expectedPageId: 'p1' }] },
      ],
    ])('%s dirty tracking wrapper forwards and marks drive dirty', async (_label, scenario) => {
      await expectDirtyTrackingForward(scenario);
    });
  });

  describe('Drive Auto Sync Alarm', () => {
    const scheduledTime = Date.UTC(2026, 3, 28, 8, 30, 0);
    const expectedAlarmFiredAt = new Date(scheduledTime).toISOString();

    it('listens to DRIVE_AUTO_SYNC_ALARM and calls runAutoUpload', async () => {
      const { alarmCallback, driveAutoSyncMock } = await loadDriveAutoSyncAlarmCallback(
        jest.fn().mockResolvedValue()
      );
      await alarmCallback({ name: 'drive-auto-sync', scheduledTime });

      expect(driveAutoSyncMock.runAutoUpload).toHaveBeenCalledWith({
        alarmFiredAt: expectedAlarmFiredAt,
      });
    });

    it('logs error when runAutoUpload fails', async () => {
      const { alarmCallback } = await loadDriveAutoSyncAlarmCallback(
        jest.fn().mockRejectedValue(new Error('auto upload broke'))
      );
      await alarmCallback({ name: 'drive-auto-sync', scheduledTime });
      // wait for promise rejection to propagate
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[Alarm] Drive 自動同步失敗',
        expect.objectContaining({ reason: 'auto upload broke' })
      );
    });

    it('loads alarm callback without startup recovery warning from incomplete chrome mock', async () => {
      await loadDriveAutoSyncAlarmCallback(jest.fn().mockResolvedValue());
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        '[Background] ensureDriveAutoSyncAlarm failed',
        expect.anything()
      );
    });
  });
});
