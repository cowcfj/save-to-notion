/**
 * @jest-environment jsdom
 */

// Mock Chrome APIs
const mockChrome = {
  runtime: {
    getManifest: jest.fn(),
    getURL: jest.fn(),
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

jest.mock('../../../scripts/config/constants.js', () => ({
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
    mockChrome.tabs.create.mockResolvedValue({ id: 123 });
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

      expect(mockChrome.tabs.create).toHaveBeenCalled();
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('已顯示更新通知頁面'));
    });
  });

  describe('handleExtensionInstall', () => {
    test('應該記錄首次安裝信息', () => {
      background.handleExtensionInstall();
      expect(Logger.success).toHaveBeenCalledWith('[Lifecycle] 擴展首次安裝', expect.anything());
    });
  });

  describe('shouldShowUpdateNotification', () => {
    test('應該為重要更新返回 true', () => {
      expect(background.shouldShowUpdateNotification('2.7.3', '2.8.0')).toBe(true);
    });

    test('應該為非重要更新返回 false', () => {
      expect(background.shouldShowUpdateNotification('2.6.0', '2.6.1')).toBe(false);
    });
  });

  describe('isImportantUpdate', () => {
    test('應該識別重要更新版本', () => {
      expect(background.isImportantUpdate('2.8.0')).toBe(true);
    });

    test('應該識別非重要更新版本', () => {
      expect(background.isImportantUpdate('2.9.9')).toBe(false);
    });
  });

  describe('showUpdateNotification', () => {
    test('應該創建更新通知標籤頁', async () => {
      mockChrome.runtime.getURL.mockReturnValue(
        'chrome-extension://id/update-notification/update-notification.html'
      );

      await background.showUpdateNotification('2.7.3', '2.8.1');

      expect(mockChrome.tabs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('update-notification.html'),
        })
      );
      expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(
        123,
        expect.objectContaining({ type: 'UPDATE_INFO' })
      );
    });

    test('應該處理錯誤', async () => {
      mockChrome.tabs.create.mockRejectedValue(new Error('Failed'));
      await background.showUpdateNotification('2.7.3', '2.8.1');
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('顯示更新通知失敗'),
        expect.anything()
      );
    });
  });
});
