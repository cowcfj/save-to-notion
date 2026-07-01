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

jest.mock('../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: mockLogger,
  ready: mockLogger.ready,
  success: mockLogger.success,
  info: mockLogger.info,
  warn: mockLogger.warn,
  error: mockLogger.error,
}));

jest.mock('../../scripts/utils/urlUtils.js', () => ({
  normalizeUrl: jest.fn(),
  computeStableUrl: jest.fn(),
}));

jest.mock('../../scripts/config/shared/core.js', () => ({
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

jest.mock('../../scripts/background/services/StorageService.js', () => ({
  StorageService: jest.fn().mockImplementation(() => mockServiceInstance),
}));

jest.mock('../../scripts/background/services/NotionService.js', () => ({
  NotionService: jest.fn().mockImplementation(() => mockServiceInstance),
}));

jest.mock('../../scripts/background/services/InjectionService.js', () => ({
  InjectionService: jest.fn().mockImplementation(() => mockServiceInstance),
  isRestrictedInjectionUrl: jest.fn(),
  isRecoverableInjectionError: jest.fn(),
}));

jest.mock('../../scripts/background/services/PageContentService.js', () => ({
  PageContentService: jest.fn().mockImplementation(() => mockServiceInstance),
}));

jest.mock('../../scripts/background/services/TabService.js', () => ({
  TabService: jest.fn().mockImplementation(() => mockServiceInstance),
}));

jest.mock('../../scripts/background/services/MigrationService.js', () => ({
  MigrationService: jest.fn().mockImplementation(() => mockServiceInstance),
}));

// Mock Handlers
jest.mock('../../scripts/background/handlers/MessageHandler.js', () => ({
  MessageHandler: jest.fn().mockImplementation(() => ({
    registerAll: jest.fn(),
    setupListener: jest.fn(),
  })),
}));

jest.mock('../../scripts/background/handlers/saveHandlers.js', () => ({
  createSaveHandlers: jest.fn().mockReturnValue({}),
}));
jest.mock('../../scripts/background/handlers/highlightHandlers.js', () => ({
  createHighlightHandlers: jest.fn().mockReturnValue({}),
}));
jest.mock('../../scripts/background/handlers/migrationHandlers.js', () => ({
  createMigrationHandlers: jest.fn().mockReturnValue({}),
}));
jest.mock('../../scripts/background/handlers/logHandlers.js', () => ({
  createLogHandlers: jest.fn().mockReturnValue({}),
}));
jest.mock('../../scripts/background/handlers/notionHandlers.js', () => ({
  createNotionHandlers: jest.fn().mockReturnValue({}),
}));
jest.mock('../../scripts/background/handlers/accountAuthHandler.js', () => ({
  createAccountAuthHandler: jest.fn().mockReturnValue({
    setupListeners: jest.fn(),
  }),
}));

// Phase B: mock markDriveDirty 以避免 dirty tracking wrapper 污染 storageService mock
jest.mock('../../scripts/auth/driveClient.js', () => ({
  ...jest.requireActual('../../scripts/auth/driveClient.js'),
  markDriveDirty: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../scripts/background/handlers/driveAutoSync.js', () => ({
  runAutoUpload: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../scripts/background/handlers/driveAlarmScheduler.js', () => ({
  DRIVE_AUTO_SYNC_ALARM: 'drive-auto-sync',
  FREQUENCY_PERIOD_MINUTES: { daily: 1440, weekly: 10_080, monthly: 43_200 },
  setupDriveAlarm: jest.fn().mockResolvedValue(undefined),
}));

import {
  getBackgroundLifecycleTestSurface,
  setBackgroundLifecycleTestSurface,
} from '../../scripts/background/backgroundLifecycleTestSurface.js';

const DRIVE_ALARM_RESTORE_CALL = ['daily', { initialDelayInMinutes: 0.5 }];

function loadBackgroundLifecycleTestSurface() {
  require('../../scripts/background.js');
  return getBackgroundLifecycleTestSurface();
}

function loadDriveAutoSyncAlarmCallback(runAutoUploadMock) {
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

  require('../../scripts/background.js');

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

  const driveAlarmScheduler = require('../../scripts/background/handlers/driveAlarmScheduler.js');
  globalThis.chrome = createDriveAlarmStartupChromeMock(options);
  globalThis.Logger = mockLogger;

  require('../../scripts/background.js');
  await new Promise(resolve => setTimeout(resolve, 0));

  return driveAlarmScheduler;
}

require('../../scripts/background.js');
const { shouldShowUpdateNotification, handleExtensionUpdate, handleExtensionInstall } =
  getBackgroundLifecycleTestSurface();

describe('Background Script Lifecycle', () => {
  let mockChrome;

  async function handleMinorVersionUpdate(setupWindowCreate) {
    mockChrome.runtime.getManifest.mockReturnValue({ version: '2.8.0' });
    setupWindowCreate(mockChrome.windows.create);
    await handleExtensionUpdate('2.7.0');
  }

  function loadOnInstalledCallback() {
    require('../../scripts/background.js');
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
    test('應在啟動時註冊 account callback bridge listener', () => {
      jest.resetModules();

      const mockAccountAuthHandler = {
        setupListeners: jest.fn(),
      };

      jest.doMock('../../scripts/background/handlers/accountAuthHandler.js', () => ({
        createAccountAuthHandler: jest.fn().mockReturnValue(mockAccountAuthHandler),
      }));

      require('../../scripts/background.js');

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

    test('production 環境載入 background 時不應暴露 lifecycle test surface', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalSurface = getBackgroundLifecycleTestSurface();
      const sentinelSurface = { sentinel: true };

      try {
        setBackgroundLifecycleTestSurface(sentinelSurface);
        process.env.NODE_ENV = 'production';
        jest.resetModules();
        globalThis.chrome = createDriveAlarmStartupChromeMock({ frequency: 'off' });
        globalThis.Logger = mockLogger;

        require('../../scripts/background.js');

        expect(getBackgroundLifecycleTestSurface()).toBe(sentinelSurface);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        setBackgroundLifecycleTestSurface(originalSurface);
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
    beforeEach(() => {
      jest.resetModules();

      // 確保需要被依賴的 utils 都被 Mock
      jest.mock('../../scripts/utils/notionAuth.js', () => ({
        getActiveNotionToken: jest.fn().mockResolvedValue({ token: 'test-oauth-token' }),
      }));
      jest.mock('../../scripts/utils/Logger.js', () => ({
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

      jest.mock('../../scripts/background/services/StorageService.js', () => ({
        StorageService: jest.fn().mockImplementation(() => mockServiceInstanceLocal),
      }));
      jest.mock('../../scripts/background/services/NotionService.js', () => ({
        NotionService: jest.fn().mockImplementation(() => mockServiceInstanceLocal),
      }));
      jest.mock('../../scripts/background/services/InjectionService.js', () => ({
        InjectionService: jest.fn().mockImplementation(() => mockServiceInstanceLocal),
        isRestrictedInjectionUrl: jest.fn(),
        isRecoverableInjectionError: jest.fn(),
      }));
      jest.mock('../../scripts/background/services/PageContentService.js', () => ({
        PageContentService: jest.fn().mockImplementation(() => mockServiceInstanceLocal),
      }));
      jest.mock('../../scripts/background/services/TabService.js', () => ({
        TabService: jest.fn().mockImplementation(() => mockServiceInstanceLocal),
      }));
      jest.mock('../../scripts/background/services/MigrationService.js', () => ({
        MigrationService: jest.fn().mockImplementation(() => mockServiceInstanceLocal),
      }));
      jest.mock('../../scripts/background/handlers/MessageHandler.js', () => ({
        MessageHandler: jest.fn().mockImplementation(() => ({
          registerAll: jest.fn(),
          setupListener: jest.fn(),
        })),
      }));

      // Handler Mocks
      jest.mock('../../scripts/background/handlers/saveHandlers.js', () => ({
        createSaveHandlers: jest.fn(),
      }));
      jest.mock('../../scripts/background/handlers/highlightHandlers.js', () => ({
        createHighlightHandlers: jest.fn(),
      }));
      jest.mock('../../scripts/background/handlers/migrationHandlers.js', () => ({
        createMigrationHandlers: jest.fn(),
      }));
      jest.mock('../../scripts/background/handlers/logHandlers.js', () => ({
        createLogHandlers: jest.fn(),
      }));
      jest.mock('../../scripts/background/handlers/notionHandlers.js', () => ({
        createNotionHandlers: jest.fn(),
      }));
      jest.mock('../../scripts/background/handlers/sidepanelHandlers.js', () => ({
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

    test('Should handle install reason', () => {
      const callback = loadOnInstalledCallback();

      callback({ reason: 'install' });
      expect(mockLogger.ready).toHaveBeenCalled();
      expect(mockLogger.success).toHaveBeenCalledWith(
        expect.stringContaining('擴展首次安裝'),
        expect.any(Object)
      );
    });

    test('Should handle update reason', () => {
      mockChrome.runtime.getManifest.mockReturnValue({ version: '2.8.1' }); // patch update, won't trigger ui
      const callback = loadOnInstalledCallback();

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

    beforeEach(() => {
      // 重新 require 模組以捕捉傳給 TabService 的參數
      jest.resetModules();

      // 確保需要被依賴的 utils 都被 Mock
      jest.mock('../../scripts/utils/notionAuth.js', () => ({
        getActiveNotionToken: jest.fn().mockResolvedValue({ token: 'test-oauth-token' }),
      }));
      jest.mock('../../scripts/utils/Logger.js', () => ({
        __esModule: true,
        default: mockLogger,
      }));

      // 取得 Mock instance 以便進行後續呼叫的斷言
      const mockStorage = {
        getSavedPageData: jest.fn().mockResolvedValue('data'),
        clearPageState: jest.fn().mockResolvedValue('cleared1'),
        clearNotionState: jest.fn().mockResolvedValue('cleared2'),
        setSavedPageData: jest.fn().mockResolvedValue('set'),
        savePageDataAndHighlights: jest.fn().mockResolvedValue('saved'),
        updateHighlights: jest.fn().mockResolvedValue('updated'),
      };

      // 快照原始 jest.fn() 參考，供 wrapper 測試驗證底層轉發
      underlyingStorageMocks = {
        clearPageState: mockStorage.clearPageState,
        clearNotionState: mockStorage.clearNotionState,
        setSavedPageData: mockStorage.setSavedPageData,
        savePageDataAndHighlights: mockStorage.savePageDataAndHighlights,
        updateHighlights: mockStorage.updateHighlights,
      };

      const mockNotion = {
        checkPageExists: jest.fn().mockResolvedValue(true),
      };

      jest.mock('../../scripts/background/services/StorageService.js', () => ({
        StorageService: jest.fn().mockImplementation(() => mockStorage),
      }));
      jest.mock('../../scripts/background/services/NotionService.js', () => ({
        NotionService: jest.fn().mockImplementation(() => mockNotion),
      }));
      jest.mock('../../scripts/background/services/InjectionService.js', () => ({
        InjectionService: jest.fn().mockImplementation(() => ({})),
        isRestrictedInjectionUrl: jest.fn().mockReturnValue(true),
        isRecoverableInjectionError: jest.fn().mockReturnValue(false),
      }));
      jest.mock('../../scripts/background/services/PageContentService.js', () => ({
        PageContentService: jest.fn().mockImplementation(() => ({})),
      }));
      jest.mock('../../scripts/background/services/MigrationService.js', () => ({
        MigrationService: jest.fn().mockImplementation(() => ({})),
      }));

      // 攔截 TabService 建構子，保存傳入的 options
      jest.mock('../../scripts/background/services/TabService.js', () => ({
        TabService: jest.fn().mockImplementation(options => {
          actualTabServiceDeps = options;
          return { setupListeners: jest.fn() };
        }),
      }));

      require('../../scripts/background.js');

      const storageModule = require('../../scripts/background/services/StorageService.js');
      storageServiceMock = new storageModule.StorageService();

      const notionModule = require('../../scripts/background/services/NotionService.js');
      notionServiceMock = new notionModule.NotionService();

      const injectionModule = require('../../scripts/background/services/InjectionService.js');
      injectionServiceMock = injectionModule;
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
      const bgModule = loadBackgroundLifecycleTestSurface();
      const driveClient = require('../../scripts/auth/driveClient.js');

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
      const { alarmCallback, driveAutoSyncMock } = loadDriveAutoSyncAlarmCallback(
        jest.fn().mockResolvedValue()
      );
      await alarmCallback({ name: 'drive-auto-sync', scheduledTime });

      expect(driveAutoSyncMock.runAutoUpload).toHaveBeenCalledWith({
        alarmFiredAt: expectedAlarmFiredAt,
      });
    });

    it('logs error when runAutoUpload fails', async () => {
      const { alarmCallback } = loadDriveAutoSyncAlarmCallback(
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
      loadDriveAutoSyncAlarmCallback(jest.fn().mockResolvedValue());
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        '[Background] ensureDriveAutoSyncAlarm failed',
        expect.anything()
      );
    });
  });
});
