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

jest.mock('../../scripts/config/constants.js', () => ({
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

// Now require the module
const {
  shouldShowUpdateNotification,
  isImportantUpdate,
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

    test('Patch version upgrade: Important update should return true', () => {
      expect(shouldShowUpdateNotification('2.7.2', '2.7.3')).toBe(true);
    });

    test('Patch version upgrade: Non-important update should return false', () => {
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

  describe('isImportantUpdate', () => {
    test('Should identify important versions', () => {
      expect(isImportantUpdate('2.7.3')).toBe(true);
      expect(isImportantUpdate('2.8.0')).toBe(true);
    });

    test('Should return false for regular versions', () => {
      expect(isImportantUpdate('1.0.0')).toBe(false);
      expect(isImportantUpdate('2.7.4')).toBe(false);
    });
  });

  describe('handleExtensionUpdate', () => {
    test('Should show notification for important updates', async () => {
      mockChrome.runtime.getManifest.mockReturnValue({ version: '2.8.0' });
      mockChrome.tabs.get.mockResolvedValue({ status: 'complete' });
      mockChrome.tabs.create.mockResolvedValue({ id: 123 });

      await handleExtensionUpdate('2.7.0');

      expect(mockChrome.tabs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('update-notification.html'),
          active: true,
        })
      );
    });

    test('Should NOT show notification for patch updates (unless flagged as important)', async () => {
      mockChrome.runtime.getManifest.mockReturnValue({ version: '2.8.1' });

      await handleExtensionUpdate('2.8.0'); // Patch update, not important

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
});
