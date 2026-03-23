/**
 * @jest-environment jsdom
 */

// Mock Chrome APIs
const mockChrome = {
  runtime: {
    getManifest: jest.fn(),
    getURL: jest.fn(path => `chrome-extension://id/${path}`),
    onInstalled: {
      addListener: jest.fn(),
    },
    id: 'test-extension-id',
  },
  tabs: {
    create: jest.fn(),
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    onRemoved: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    sendMessage: jest.fn(),
    get: jest.fn(),
  },
  windows: {
    create: jest.fn(),
  },
};
globalThis.chrome = mockChrome;

// Mock Logger
jest.mock('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    ready: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
import Logger from '../../../scripts/utils/Logger.js';

jest.mock('../../../scripts/utils/urlUtils.js', () => ({
  normalizeUrl: jest.fn(),
  computeStableUrl: jest.fn(),
}));

jest.mock('../../../scripts/config/app.js', () => ({
  TAB_SERVICE: { LOADING_TIMEOUT_MS: 1000 },
}));

// Inline mock factories
jest.mock('../../../scripts/background/services/StorageService.js', () => ({
  StorageService: jest.fn().mockImplementation(() => ({
    name: 'StorageService',
    setupListeners: jest.fn(),
  })),
}));
jest.mock('../../../scripts/background/services/NotionService.js', () => ({
  NotionService: jest.fn().mockImplementation(() => ({
    name: 'NotionService',
    setupListeners: jest.fn(),
  })),
}));
jest.mock('../../../scripts/background/services/InjectionService.js', () => ({
  InjectionService: jest.fn().mockImplementation(() => ({
    name: 'InjectionService',
    setupListeners: jest.fn(),
  })),
  isRestrictedInjectionUrl: jest.fn(),
  isRecoverableInjectionError: jest.fn(),
}));
jest.mock('../../../scripts/background/services/PageContentService.js', () => ({
  PageContentService: jest.fn().mockImplementation(() => ({
    name: 'PageContentService',
    setupListeners: jest.fn(),
  })),
}));
jest.mock('../../../scripts/background/services/TabService.js', () => ({
  TabService: jest.fn().mockImplementation(() => ({
    name: 'TabService',
    setupListeners: jest.fn(),
  })),
}));

// Mock Handlers
jest.mock('../../../scripts/background/handlers/MessageHandler.js', () => ({
  MessageHandler: jest.fn().mockImplementation(() => ({
    registerAll: jest.fn(),
    setupListener: jest.fn(),
  })),
}));
jest.mock('../../../scripts/background/handlers/saveHandlers.js', () => ({
  createSaveHandlers: jest.fn(() => ({})),
}));
jest.mock('../../../scripts/background/handlers/highlightHandlers.js', () => ({
  createHighlightHandlers: jest.fn(() => ({})),
}));
jest.mock('../../../scripts/background/handlers/migrationHandlers.js', () => ({
  createMigrationHandlers: jest.fn(() => ({})),
}));
jest.mock('../../../scripts/background/handlers/logHandlers.js', () => ({
  createLogHandlers: jest.fn(() => ({})),
}));
jest.mock('../../../scripts/background/handlers/notionHandlers.js', () => ({
  createNotionHandlers: jest.fn(() => ({})),
}));

let background;

describe('Background Extension Lifecycle', () => {
  beforeAll(() => {
    // Manually assign global Logger since mocked module doesn't run side-effects
    globalThis.Logger = Logger;

    // Ensure background.js is loaded
    // Since we mocked everything, it should initialize without error
    background = require('../../../scripts/background.js');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockChrome.runtime.getManifest.mockReturnValue({ version: '2.8.1' });
    mockChrome.windows.create.mockResolvedValue({ id: 123 });
    mockChrome.tabs.sendMessage.mockResolvedValue({});
    mockChrome.tabs.get.mockResolvedValue({ status: 'complete' });
  });

  describe('handleExtensionUpdate', () => {
    test('應該記錄更新信息', async () => {
      await background.handleExtensionUpdate('2.7.3');
      expect(Logger.success).toHaveBeenCalledWith(
        '[Lifecycle] 擴展已更新',
        expect.objectContaining({ previousVersion: '2.7.3' })
      );
    });

    test('應該在重要更新時顯示通知', async () => {
      mockChrome.runtime.getManifest.mockReturnValue({ version: '2.8.0' });
      await background.handleExtensionUpdate('2.7.3');

      expect(mockChrome.windows.create).toHaveBeenCalled();
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('已顯示更新通知視窗'));
    });
  });

  describe('shouldShowUpdateNotification', () => {
    // 透過直接測試 shouldShowUpdateNotification（如果導出）或通過 handleExtensionUpdate 間接測試 logic

    const setupUpdateTest = async (previousVersion, currentVersion) => {
      mockChrome.runtime.getManifest.mockReturnValue({ version: currentVersion });
      mockChrome.windows.create.mockClear();
      await background.handleExtensionUpdate(previousVersion);
    };

    test('應該正確處理主版本升級 (2.5.0 -> 3.0.0)', async () => {
      await setupUpdateTest('2.5.0', '3.0.0');
      expect(mockChrome.windows.create).toHaveBeenCalled();
    });

    test('應該正確處理次版本升級 (2.4.5 -> 2.5.0)', async () => {
      await setupUpdateTest('2.4.5', '2.5.0');
      expect(mockChrome.windows.create).toHaveBeenCalled();
    });

    test('應該正確處理降級 (3.0.0 -> 2.5.0)', async () => {
      await setupUpdateTest('3.0.0', '2.5.0');
      expect(mockChrome.windows.create).not.toHaveBeenCalled();
    });

    test('應該正確處理次版本降級 (2.5.0 -> 2.4.0)', async () => {
      await setupUpdateTest('2.5.0', '2.4.0');
      expect(mockChrome.windows.create).not.toHaveBeenCalled();
    });
  });

  describe('handleExtensionInstall', () => {
    test('應該記錄首次安裝信息', () => {
      background.handleExtensionInstall();
      expect(Logger.success).toHaveBeenCalledWith('[Lifecycle] 擴展首次安裝', expect.anything());
    });
  });

  describe('showUpdateNotification', () => {
    test('應該創建更新通知視窗', async () => {
      mockChrome.runtime.getURL.mockReturnValue(
        'chrome-extension://id/update-notification/update-notification.html'
      );

      await background.showUpdateNotification('2.7.3', '2.8.1');

      expect(mockChrome.windows.create).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('update-notification.html?prev=2.7.3&curr=2.8.1'),
          type: 'popup',
        })
      );
    });

    test('應該處理錯誤', async () => {
      mockChrome.windows.create.mockRejectedValue(new Error('Failed'));
      await background.showUpdateNotification('2.7.3', '2.8.1');
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('顯示更新通知失敗'),
        expect.anything()
      );
    });
  });
});
