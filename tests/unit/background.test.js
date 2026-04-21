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

jest.mock('../../scripts/config/app.js', () => ({
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
  setupDriveAlarm: jest.fn().mockResolvedValue(undefined),
}));

// Now require the module
const {
  shouldShowUpdateNotification,
  handleExtensionUpdate,
  handleExtensionInstall,
} = require('../../scripts/background.js');

describe('Background Script Lifecycle', () => {
  let mockChrome;

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
        create: jest.fn(),
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
    test('Major version upgrade should return true', () => {
      expect(shouldShowUpdateNotification('1.0.0', '2.0.0')).toBe(true);
    });

    test('Minor version upgrade should return true', () => {
      expect(shouldShowUpdateNotification('1.0.0', '1.1.0')).toBe(true);
    });

    test('Downgrade should return false', () => {
      expect(shouldShowUpdateNotification('2.0.0', '1.0.0')).toBe(false);
      expect(shouldShowUpdateNotification('1.1.0', '1.0.0')).toBe(false);
    });

    test('Patch version upgrade should return false', () => {
      expect(shouldShowUpdateNotification('2.7.2', '2.7.3')).toBe(false);
      expect(shouldShowUpdateNotification('2.7.0', '2.7.1')).toBe(false);
    });

    test('Same version should return false', () => {
      expect(shouldShowUpdateNotification('1.0.0', '1.0.0')).toBe(false);
    });

    test('Null or undefined versions should return false', () => {
      expect(shouldShowUpdateNotification(null, '2.0.0')).toBe(false);
      expect(shouldShowUpdateNotification('1.0.0', null)).toBe(false);
      expect(shouldShowUpdateNotification(undefined, '2.0.0')).toBe(false);
      expect(shouldShowUpdateNotification('1.0.0', undefined)).toBe(false);
      expect(shouldShowUpdateNotification(null, null)).toBe(false);
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
  });

  describe('handleExtensionUpdate', () => {
    test('Should show notification popup for important updates', async () => {
      mockChrome.runtime.getManifest.mockReturnValue({ version: '2.8.0' });
      mockChrome.windows.create.mockResolvedValue({ id: 123 });

      await handleExtensionUpdate('2.7.0');

      expect(mockChrome.windows.create).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('update-notification.html?prev=2.7.0&curr=2.8.0'),
          type: 'popup',
        })
      );
    });

    test('Should handle failure when creating window', async () => {
      mockChrome.runtime.getManifest.mockReturnValue({ version: '2.8.0' });
      mockChrome.windows.create.mockRejectedValue(new Error('creation failed'));

      await handleExtensionUpdate('2.7.0');

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
      require('../../scripts/background.js');

      const addListener = mockChrome.runtime.onInstalled.addListener;
      const callback = addListener.mock.calls[0][0]; // 取得在 background.js 註冊的 callback

      callback({ reason: 'install' });
      expect(mockLogger.ready).toHaveBeenCalled();
      expect(mockLogger.success).toHaveBeenCalledWith(
        expect.stringContaining('擴展首次安裝'),
        expect.any(Object)
      );
    });

    test('Should handle update reason', () => {
      require('../../scripts/background.js');
      mockChrome.runtime.getManifest.mockReturnValue({ version: '2.8.1' }); // patch update, won't trigger ui

      const addListener = mockChrome.runtime.onInstalled.addListener;
      const callback = addListener.mock.calls[0][0];

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

    test('savePageDataAndHighlights dirty tracking wrapper works', async () => {
      const bgModule = require('../../scripts/background.js');
      const driveClient = require('../../scripts/auth/driveClient.js');

      await bgModule.storageService.savePageDataAndHighlights('url', { page: 1 }, [1, 2]);
      // wrapper 既要 forward 給底層，也要標記 drive dirty
      expect(underlyingStorageMocks.savePageDataAndHighlights).toHaveBeenCalledWith(
        'url',
        { page: 1 },
        [1, 2]
      );
      expect(driveClient.markDriveDirty).toHaveBeenCalled();
    });

    test('updateHighlights dirty tracking wrapper works', async () => {
      const bgModule = require('../../scripts/background.js');
      const driveClient = require('../../scripts/auth/driveClient.js');

      await bgModule.storageService.updateHighlights('url', ['h1']);
      expect(underlyingStorageMocks.updateHighlights).toHaveBeenCalledWith('url', ['h1']);
      expect(driveClient.markDriveDirty).toHaveBeenCalled();
    });

    test('setSavedPageData dirty tracking wrapper works', async () => {
      const bgModule = require('../../scripts/background.js');
      const driveClient = require('../../scripts/auth/driveClient.js');

      await bgModule.storageService.setSavedPageData('url', { data: 1 });
      expect(underlyingStorageMocks.setSavedPageData).toHaveBeenCalledWith('url', { data: 1 });
      expect(driveClient.markDriveDirty).toHaveBeenCalled();
    });

    test('clearPageState dirty tracking wrapper works', async () => {
      const bgModule = require('../../scripts/background.js');
      const driveClient = require('../../scripts/auth/driveClient.js');

      await bgModule.storageService.clearPageState('url-to-clear');
      expect(underlyingStorageMocks.clearPageState).toHaveBeenCalledWith('url-to-clear');
      expect(driveClient.markDriveDirty).toHaveBeenCalled();
    });

    test('clearNotionState dirty tracking wrapper works', async () => {
      const bgModule = require('../../scripts/background.js');
      const driveClient = require('../../scripts/auth/driveClient.js');

      await bgModule.storageService.clearNotionState('url-clear-notion', { expectedPageId: 'p1' });
      expect(underlyingStorageMocks.clearNotionState).toHaveBeenCalledWith('url-clear-notion', {
        expectedPageId: 'p1',
      });
      expect(driveClient.markDriveDirty).toHaveBeenCalled();
    });
  });

  describe('Drive Auto Sync Alarm', () => {
    it('listens to DRIVE_AUTO_SYNC_ALARM and calls runAutoUpload', async () => {
      jest.resetModules();
      const alarmsAddListener = jest.fn();
      globalThis.chrome = {
        runtime: { onInstalled: { addListener: jest.fn() } },
        alarms: { onAlarm: { addListener: alarmsAddListener } },
      };

      const driveAutoSyncMock = { runAutoUpload: jest.fn().mockResolvedValue() };
      jest.doMock('../../scripts/background/handlers/driveAutoSync.js', () => driveAutoSyncMock);

      require('../../scripts/background.js');

      const alarmCallback = alarmsAddListener.mock.calls[0][0];
      await alarmCallback({ name: 'drive-auto-sync' });

      expect(driveAutoSyncMock.runAutoUpload).toHaveBeenCalled();
    });

    it('logs error when runAutoUpload fails', async () => {
      jest.resetModules();
      const alarmsAddListener = jest.fn();
      globalThis.chrome = {
        runtime: { onInstalled: { addListener: jest.fn() } },
        alarms: { onAlarm: { addListener: alarmsAddListener } },
      };

      const driveAutoSyncMock = {
        runAutoUpload: jest.fn().mockRejectedValue(new Error('auto upload broke')),
      };
      jest.doMock('../../scripts/background/handlers/driveAutoSync.js', () => driveAutoSyncMock);

      require('../../scripts/background.js');

      const alarmCallback = alarmsAddListener.mock.calls[0][0];
      await alarmCallback({ name: 'drive-auto-sync' });
      // wait for promise rejection to propagate
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[Alarm] Drive auto sync failed',
        expect.objectContaining({ reason: 'auto upload broke' })
      );
    });
  });
});
