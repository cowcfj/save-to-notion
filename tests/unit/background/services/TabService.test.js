/**
 * TabService 單元測試
 */

const { TabService } = require('../../../../scripts/background/services/TabService');

// Mock chrome API
global.chrome = {
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
    },
  },
  tabs: {
    onUpdated: {
      addListener: jest.fn(),
    },
    onActivated: {
      addListener: jest.fn(),
    },
    get: jest.fn(),
  },
};

// Mock Logger
const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Mock InjectionService
const mockInjectionService = {
  injectHighlighter: jest.fn().mockResolvedValue({ initialized: true }),
  injectHighlightRestore: jest.fn().mockResolvedValue(),
  injectWithResponse: jest.fn().mockResolvedValue({ migrated: false }),
};

describe('TabService', () => {
  let service = null;

  beforeEach(() => {
    service = new TabService({
      logger: mockLogger,
      injectionService: mockInjectionService,
      normalizeUrl: url => url,
      getSavedPageData: jest.fn().mockResolvedValue(null),
      isRestrictedUrl: url => url.includes('chrome://'),
      isRecoverableError: msg => msg.includes('Cannot access'),
    });
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultService = new TabService();
      expect(defaultService.logger).toBe(console);
      expect(typeof defaultService.normalizeUrl).toBe('function');
      expect(typeof defaultService.getSavedPageData).toBe('function');
    });

    it('should accept custom options', () => {
      expect(service.logger).toBe(mockLogger);
      expect(service.injectionService).toBe(mockInjectionService);
    });
  });

  describe('updateTabStatus', () => {
    it('should skip invalid URLs', async () => {
      await service.updateTabStatus(1, null);
      await service.updateTabStatus(1, '');
      await service.updateTabStatus(1, 'ftp://example.com');

      expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
    });

    it('should skip restricted URLs', async () => {
      await service.updateTabStatus(1, 'chrome://extensions');

      expect(chrome.action.setBadgeText).not.toHaveBeenCalled();
    });

    it('should set badge for saved pages', async () => {
      service.getSavedPageData = jest.fn().mockResolvedValue({ pageId: '123' });
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        callback({});
      });

      await service.updateTabStatus(1, 'https://example.com');

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '✓', tabId: 1 });
      expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
        color: '#48bb78',
        tabId: 1,
      });
    });

    it('should clear badge for unsaved pages', async () => {
      service.getSavedPageData = jest.fn().mockResolvedValue(null);
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        callback({});
      });

      await service.updateTabStatus(1, 'https://example.com');

      expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 1 });
    });

    it('should inject highlighter when highlights exist', async () => {
      service.getSavedPageData = jest.fn().mockResolvedValue(null);
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        callback({ 'highlights_https://example.com': [{ id: '1' }] });
      });

      await service.updateTabStatus(1, 'https://example.com');

      expect(mockInjectionService.injectHighlighter).toHaveBeenCalledWith(1);
    });

    it('should call migrateLegacyHighlights when no highlights exist', async () => {
      service.getSavedPageData = jest.fn().mockResolvedValue(null);
      chrome.storage.local.get.mockImplementation((keys, callback) => {
        callback({});
      });

      const migrateSpy = jest.spyOn(service, 'migrateLegacyHighlights').mockResolvedValue();

      await service.updateTabStatus(1, 'https://example.com');

      expect(migrateSpy).toHaveBeenCalledWith(
        1,
        'https://example.com',
        'highlights_https://example.com'
      );
    });

    it('should handle errors gracefully', async () => {
      service.getSavedPageData = jest.fn().mockRejectedValue(new Error('Storage error'));

      await service.updateTabStatus(1, 'https://example.com');

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('setupListeners', () => {
    it('should register tab update listener', () => {
      service.setupListeners();

      expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
    });

    it('should register tab activation listener', () => {
      service.setupListeners();

      expect(chrome.tabs.onActivated.addListener).toHaveBeenCalled();
    });
  });

  describe('migrateLegacyHighlights', () => {
    beforeEach(() => {
      chrome.tabs.get.mockResolvedValue({ url: 'https://example.com' });
    });

    it('should skip if normUrl is missing', async () => {
      await service.migrateLegacyHighlights(1, null, 'key');

      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockInjectionService.injectWithResponse).not.toHaveBeenCalled();
    });

    it('should skip if storageKey is missing', async () => {
      await service.migrateLegacyHighlights(1, 'https://example.com', null);

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should skip non-http URLs', async () => {
      await service.migrateLegacyHighlights(1, 'ftp://example.com', 'key');

      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should skip if tab is invalid', async () => {
      chrome.tabs.get.mockRejectedValue(new Error('Tab not found'));

      await service.migrateLegacyHighlights(1, 'https://example.com', 'key');

      expect(mockInjectionService.injectWithResponse).not.toHaveBeenCalled();
    });

    it('should skip if tab shows error page', async () => {
      chrome.tabs.get.mockResolvedValue({ url: 'chrome-error://chromewebdata' });

      await service.migrateLegacyHighlights(1, 'https://example.com', 'key');

      expect(mockInjectionService.injectWithResponse).not.toHaveBeenCalled();
    });

    it('should save migrated data to storage', async () => {
      mockInjectionService.injectWithResponse.mockResolvedValue({
        migrated: true,
        data: [{ id: '1', text: 'highlight' }],
        foundKey: 'highlights_old',
      });
      chrome.storage.local.set.mockImplementation((data, callback) => callback());

      await service.migrateLegacyHighlights(
        1,
        'https://example.com',
        'highlights_https://example.com'
      );

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        { 'highlights_https://example.com': [{ id: '1', text: 'highlight' }] },
        expect.any(Function)
      );
      expect(mockInjectionService.injectHighlightRestore).toHaveBeenCalledWith(1);
    });

    it('should handle recoverable errors gracefully', async () => {
      mockInjectionService.injectWithResponse.mockRejectedValue(
        new Error('Cannot access contents of page')
      );

      await service.migrateLegacyHighlights(
        1,
        'https://example.com',
        'highlights_https://example.com'
      );

      expect(mockLogger.log).toHaveBeenCalledWith(
        '⚠️ Migration skipped due to recoverable error:',
        expect.any(String)
      );
    });

    it('should log non-recoverable errors', async () => {
      mockInjectionService.injectWithResponse.mockRejectedValue(new Error('Unknown error'));

      await service.migrateLegacyHighlights(
        1,
        'https://example.com',
        'highlights_https://example.com'
      );

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
