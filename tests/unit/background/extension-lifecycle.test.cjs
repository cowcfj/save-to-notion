/**
 * @jest-environment jsdom
 */

const loggerMock = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
  success: jest.fn(),
  ready: jest.fn(),
  start: jest.fn(),
};

const isNativeDefaultRuntime = () =>
  (process.env.NODE_OPTIONS ?? '').includes('--experimental-vm-modules');

const makeChromeMock = () => ({
  runtime: {
    onInstalled: { addListener: jest.fn(), removeListener: jest.fn() },
    onMessage: { addListener: jest.fn(), removeListener: jest.fn() },
    onStartup: { addListener: jest.fn(), removeListener: jest.fn() },
    getManifest: jest.fn(() => ({ version: '2.8.1' })),
    getURL: jest.fn(path => `chrome-extension://ext-id/${path}`),
    lastError: null,
  },
  alarms: {
    get: jest.fn(),
    create: jest.fn(),
    clear: jest.fn(),
    onAlarm: { addListener: jest.fn(), removeListener: jest.fn() },
  },
  tabs: {
    onUpdated: { addListener: jest.fn(), removeListener: jest.fn() },
    onRemoved: { addListener: jest.fn(), removeListener: jest.fn() },
    onActivated: { addListener: jest.fn(), removeListener: jest.fn() },
    create: jest.fn(async () => ({ id: 1 })),
    sendMessage: jest.fn(),
    get: jest.fn(),
    query: jest.fn(),
  },
  windows: {
    create: jest.fn(),
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
    },
    sync: {
      get: jest.fn(),
      set: jest.fn(),
    },
  },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
  },
  scripting: {
    executeScript: jest.fn(),
  },
});

const installChromeMock = chromeMock => {
  globalThis.chrome = chromeMock;
  if (globalThis.window !== undefined) {
    globalThis.window.chrome = chromeMock;
  }
  if (globalThis.self !== undefined) {
    globalThis.self.chrome = chromeMock;
  }
};

const registerBackgroundEntrypointMocks = async () => {
  jest.doMock('../../../scripts/utils/Logger.js', () => ({
    __esModule: true,
    default: loggerMock,
    ...loggerMock,
  }));
  await jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
    __esModule: true,
    default: loggerMock,
    ...loggerMock,
  }));

  jest.doMock('../../../scripts/utils/urlUtils.js', () => ({
    normalizeUrl: jest.fn(),
    computeStableUrl: jest.fn(),
  }));
  await jest.unstable_mockModule('../../../scripts/utils/urlUtils.js', () => ({
    __esModule: true,
    normalizeUrl: jest.fn(url => url),
    computeStableUrl: jest.fn(url => url),
  }));

  jest.doMock('../../../scripts/config/shared/core.js', () => ({
    TAB_SERVICE: { LOADING_TIMEOUT_MS: 1000 },
  }));
  await jest.unstable_mockModule('../../../scripts/config/shared/core.js', () => ({
    TAB_SERVICE: { LOADING_TIMEOUT_MS: 1000 },
  }));

  const serviceFactory = name =>
    jest.fn().mockImplementation(() => ({
      name,
      setupListeners: jest.fn(),
    }));

  const serviceMocks = [
    ['../../../scripts/background/services/StorageService.js', 'StorageService'],
    ['../../../scripts/background/services/NotionService.js', 'NotionService'],
    ['../../../scripts/background/services/PageContentService.js', 'PageContentService'],
    ['../../../scripts/background/services/TabService.js', 'TabService'],
    ['../../../scripts/background/services/MigrationService.js', 'MigrationService'],
  ];

  for (const [modulePath, exportName] of serviceMocks) {
    const mockFactory = () => ({ [exportName]: serviceFactory(exportName) });
    jest.doMock(modulePath, mockFactory);
    await jest.unstable_mockModule(modulePath, mockFactory);
  }

  const injectionMockFactory = () => ({
    InjectionService: serviceFactory('InjectionService'),
    isRestrictedInjectionUrl: jest.fn(),
    isRecoverableInjectionError: jest.fn(),
  });
  jest.doMock('../../../scripts/background/services/InjectionService.js', injectionMockFactory);
  await jest.unstable_mockModule(
    '../../../scripts/background/services/InjectionService.js',
    injectionMockFactory
  );

  const messageHandlerMockFactory = () => ({
    MessageHandler: jest.fn().mockImplementation(() => ({
      registerAll: jest.fn(),
      setupListener: jest.fn(),
    })),
  });
  jest.doMock('../../../scripts/background/handlers/MessageHandler.js', messageHandlerMockFactory);
  await jest.unstable_mockModule(
    '../../../scripts/background/handlers/MessageHandler.js',
    messageHandlerMockFactory
  );

  const handlerMocks = [
    ['../../../scripts/background/handlers/saveHandlers.js', 'createSaveHandlers'],
    ['../../../scripts/background/handlers/highlightHandlers.js', 'createHighlightHandlers'],
    ['../../../scripts/background/handlers/migrationHandlers.js', 'createMigrationHandlers'],
    ['../../../scripts/background/handlers/logHandlers.js', 'createLogHandlers'],
    ['../../../scripts/background/handlers/notionHandlers.js', 'createNotionHandlers'],
    ['../../../scripts/background/handlers/sidepanelHandlers.js', 'createSidepanelHandlers'],
    ['../../../scripts/background/handlers/driveSyncHandlers.js', 'createDriveSyncHandlers'],
  ];

  for (const [modulePath, exportName] of handlerMocks) {
    const mockFactory = () => ({ [exportName]: jest.fn(() => ({})) });
    jest.doMock(modulePath, mockFactory);
    await jest.unstable_mockModule(modulePath, mockFactory);
  }

  const accountAuthMockFactory = () => ({
    createAccountAuthHandler: jest.fn(() => ({ setupListeners: jest.fn() })),
  });
  jest.doMock('../../../scripts/background/handlers/accountAuthHandler.js', accountAuthMockFactory);
  await jest.unstable_mockModule(
    '../../../scripts/background/handlers/accountAuthHandler.js',
    accountAuthMockFactory
  );

  const notionAuthMockFactory = () => ({
    getActiveNotionToken: jest.fn(async () => ({ token: 'token' })),
  });
  jest.doMock('../../../scripts/utils/notionAuth.js', notionAuthMockFactory);
  await jest.unstable_mockModule('../../../scripts/utils/notionAuth.js', notionAuthMockFactory);

  const driveAutoSyncMockFactory = () => ({
    runAutoUpload: jest.fn(async () => undefined),
  });
  jest.doMock('../../../scripts/background/handlers/driveAutoSync.js', driveAutoSyncMockFactory);
  await jest.unstable_mockModule(
    '../../../scripts/background/handlers/driveAutoSync.js',
    driveAutoSyncMockFactory
  );

  const driveAlarmSchedulerMockFactory = () => ({
    DRIVE_AUTO_SYNC_ALARM: 'drive-auto-sync',
    FREQUENCY_PERIOD_MINUTES: { daily: 1440 },
    setupDriveAlarm: jest.fn(async () => undefined),
  });
  jest.doMock(
    '../../../scripts/background/handlers/driveAlarmScheduler.js',
    driveAlarmSchedulerMockFactory
  );
  await jest.unstable_mockModule(
    '../../../scripts/background/handlers/driveAlarmScheduler.js',
    driveAlarmSchedulerMockFactory
  );

  const driveClientMockFactory = () => ({
    DRIVE_SYNC_FREQUENCIES: ['off', 'daily', 'weekly', 'monthly'],
    DRIVE_SYNC_STORAGE_KEYS: { FREQUENCY: 'frequency' },
    markDriveDirty: jest.fn(),
  });
  jest.doMock('../../../scripts/auth/driveClient.js', driveClientMockFactory);
  await jest.unstable_mockModule('../../../scripts/auth/driveClient.js', driveClientMockFactory);

  const profileStoreMockFactory = () => ({
    AccountGatedDestinationEntitlementProvider: jest.fn(),
    LocalDestinationProfileRepository: jest.fn(),
  });
  jest.doMock('../../../scripts/destinations/ProfileStore.js', profileStoreMockFactory);
  await jest.unstable_mockModule(
    '../../../scripts/destinations/ProfileStore.js',
    profileStoreMockFactory
  );

  const profileResolverMockFactory = () => ({
    ProfileResolver: jest.fn().mockImplementation(() => ({
      resolve: jest.fn(async () => ({ id: 'default' })),
    })),
  });
  jest.doMock('../../../scripts/destinations/ProfileResolver.js', profileResolverMockFactory);
  await jest.unstable_mockModule(
    '../../../scripts/destinations/ProfileResolver.js',
    profileResolverMockFactory
  );
};

let background;
let chrome;

const loadBackgroundTestSurface = async () => {
  if (isNativeDefaultRuntime()) {
    const { importBackgroundEntrypoint, setupBackgroundEntrypointGlobals, unwrapTestExports } =
      await import('../../native-esm/background/backgroundLifecycleHarness.mjs');
    setupBackgroundEntrypointGlobals({ chrome, logger: loggerMock });
    return unwrapTestExports(await importBackgroundEntrypoint());
  }

  require('../../../scripts/background.js');
  return require('../../../scripts/background/backgroundLifecycleTestSurface.js').getBackgroundLifecycleTestSurface();
};

describe('Background Extension Lifecycle', () => {
  beforeAll(async () => {
    await registerBackgroundEntrypointMocks();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    chrome = makeChromeMock();
    chrome.storage.local.get.mockResolvedValue({ frequency: 'off' });
    globalThis.module = { exports: {} };
    installChromeMock(chrome);
    globalThis.Logger = loggerMock;
    globalThis.URL = URL;
    chrome.runtime.getManifest.mockReturnValue({ version: '2.8.1' });
    chrome.windows.create.mockResolvedValue({ id: 123 });
    chrome.tabs.sendMessage.mockResolvedValue({});
    chrome.tabs.get.mockResolvedValue({ status: 'complete' });
    background = await loadBackgroundTestSurface();
  });

  describe('handleExtensionUpdate', () => {
    test('應該記錄更新信息', async () => {
      await background.handleExtensionUpdate('2.7.3');
      expect(loggerMock.success).toHaveBeenCalledWith(
        '[Lifecycle] 擴展已更新',
        expect.objectContaining({ previousVersion: '2.7.3' })
      );
    });

    test('應該在重要更新時顯示通知', async () => {
      chrome.runtime.getManifest.mockReturnValue({ version: '2.8.0' });
      await background.handleExtensionUpdate('2.7.3');

      expect(chrome.windows.create).toHaveBeenCalled();
      expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('已顯示更新通知視窗'));
    });
  });

  describe('shouldShowUpdateNotification', () => {
    const setupUpdateTest = async (previousVersion, currentVersion) => {
      chrome.runtime.getManifest.mockReturnValue({ version: currentVersion });
      chrome.windows.create.mockClear();
      await background.handleExtensionUpdate(previousVersion);
    };

    test('應該正確處理主版本升級 (2.5.0 -> 3.0.0)', async () => {
      await setupUpdateTest('2.5.0', '3.0.0');
      expect(chrome.windows.create).toHaveBeenCalled();
    });

    test('應該正確處理次版本升級 (2.4.5 -> 2.5.0)', async () => {
      await setupUpdateTest('2.4.5', '2.5.0');
      expect(chrome.windows.create).toHaveBeenCalled();
    });

    test('應該正確處理降級 (3.0.0 -> 2.5.0)', async () => {
      await setupUpdateTest('3.0.0', '2.5.0');
      expect(chrome.windows.create).not.toHaveBeenCalled();
    });

    test('應該正確處理次版本降級 (2.5.0 -> 2.4.0)', async () => {
      await setupUpdateTest('2.5.0', '2.4.0');
      expect(chrome.windows.create).not.toHaveBeenCalled();
    });
  });

  describe('handleExtensionInstall', () => {
    test('應該記錄首次安裝信息', () => {
      background.handleExtensionInstall();
      expect(loggerMock.success).toHaveBeenCalledWith(
        '[Lifecycle] 擴展首次安裝',
        expect.anything()
      );
    });

    test('應該開啟 onboarding tab', () => {
      chrome.runtime.getURL.mockReturnValue(
        'chrome-extension://id/pages/onboarding/onboarding.html'
      );
      background.handleExtensionInstall();
      expect(chrome.runtime.getURL).toHaveBeenCalledWith('pages/onboarding/onboarding.html');
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'chrome-extension://id/pages/onboarding/onboarding.html',
      });
    });

    test('開啟 onboarding tab 失敗時應記錄錯誤但不中斷安裝流程', async () => {
      chrome.runtime.getURL.mockReturnValue(
        'chrome-extension://id/pages/onboarding/onboarding.html'
      );
      chrome.tabs.create.mockRejectedValueOnce(new Error('tab_create_failed'));
      expect(() => background.handleExtensionInstall()).not.toThrow();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.stringContaining('開啟 onboarding tab 失敗'),
        expect.anything()
      );
    });
  });

  describe('showUpdateNotification', () => {
    test('應該創建更新通知視窗', async () => {
      chrome.runtime.getURL.mockReturnValue(
        'chrome-extension://id/pages/update-notification/update-notification.html'
      );

      await background.showUpdateNotification('2.7.3', '2.8.1');

      expect(chrome.windows.create).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('update-notification.html?prev=2.7.3&curr=2.8.1'),
          type: 'popup',
        })
      );
    });

    test('應該處理錯誤', async () => {
      chrome.windows.create.mockRejectedValue(new Error('Failed'));
      await background.showUpdateNotification('2.7.3', '2.8.1');
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.stringContaining('顯示更新通知失敗'),
        expect.anything()
      );
    });
  });
});
