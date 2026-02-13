/**
 * @jest-environment jsdom
 */

import { MigrationService } from '../../../../scripts/background/services/MigrationService.js';

// Mock dependencies
jest.mock('../../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    log: jest.fn(),
  },
}));

jest.mock('../../../../scripts/utils/securityUtils.js', () => ({
  sanitizeUrlForLogging: jest.fn(url => `safe://${url}`),
}));

describe('MigrationService', () => {
  let service;
  let mockStorageService;
  let mockTabService;
  let mockInjectionService;

  beforeEach(() => {
    jest.clearAllMocks();

    mockStorageService = {
      getSavedPageData: jest.fn(),
      setSavedPageData: jest.fn(),
      clearPageState: jest.fn(),
      clearLegacyKeys: jest.fn(),
      getHighlights: jest.fn(),
      savePageDataAndHighlights: jest.fn(),
    };

    mockTabService = {
      queryTabs: jest.fn().mockImplementation(q => globalThis.chrome.tabs.query(q)),
      createTab: jest.fn().mockImplementation(p => globalThis.chrome.tabs.create(p)),
      removeTab: jest.fn().mockImplementation(id => globalThis.chrome.tabs.remove(id)),
      waitForTabComplete: jest.fn().mockImplementation(id => {
        return globalThis.chrome.tabs.get(id).then(tab => {
          if (tab?.status === 'complete') {
            return;
          }
          // 這裡簡化模擬，實際測試中會透過 mockResolvedValue 控制
        });
      }),
    };
    mockInjectionService = {
      injectAndExecute: jest.fn(),
      injectWithResponse: jest.fn(),
    };

    globalThis.chrome = {
      tabs: {
        query: jest.fn(),
        create: jest.fn(),
        remove: jest.fn().mockResolvedValue(),
        get: jest.fn(),
        onUpdated: {
          addListener: jest.fn(),
          removeListener: jest.fn(),
        },
      },
      runtime: {
        lastError: null,
      },
      scripting: {
        executeScript: jest.fn(),
      },
    };

    service = new MigrationService(mockStorageService, mockTabService, mockInjectionService);
  });

  describe('migrateStorageKey', () => {
    const stableUrl = 'https://example.com/stable';
    const legacyUrl = 'https://example.com/legacy';
    const pageData = { notionPageId: 'page-123', title: 'Test Page' };

    test('should return false if URLs are missing or identical', async () => {
      expect(await service.migrateStorageKey(null, legacyUrl)).toBe(false);
      expect(await service.migrateStorageKey(stableUrl, null)).toBe(false);
      expect(await service.migrateStorageKey(stableUrl, stableUrl)).toBe(false);
    });

    test('should return false if no legacy data exists', async () => {
      mockStorageService.getSavedPageData.mockResolvedValue(null);
      mockStorageService.getHighlights.mockResolvedValue(null);

      const result = await service.migrateStorageKey(stableUrl, legacyUrl);

      expect(result).toBe(false);
      expect(mockStorageService.getSavedPageData).toHaveBeenCalledWith(legacyUrl);
      expect(mockStorageService.setSavedPageData).not.toHaveBeenCalled();
    });

    test('should perform atomic migration (copy then delete) when legacy data exists', async () => {
      mockStorageService.getSavedPageData.mockResolvedValue(pageData);
      mockStorageService.getHighlights.mockResolvedValue(null);
      mockStorageService.savePageDataAndHighlights.mockResolvedValue();
      mockStorageService.clearLegacyKeys.mockResolvedValue();

      const result = await service.migrateStorageKey(stableUrl, legacyUrl);

      expect(result).toBe(true);
      // 1. Verify read
      expect(mockStorageService.getSavedPageData).toHaveBeenCalledWith(legacyUrl);
      // 2. Verify write new key via atomic method
      expect(mockStorageService.savePageDataAndHighlights).toHaveBeenCalledWith(
        stableUrl,
        pageData,
        null
      );
      // 3. Verify delete old key using clearLegacyKeys (不會誤刪 stable URL)
      expect(mockStorageService.clearLegacyKeys).toHaveBeenCalledWith(legacyUrl);
    });

    test('should return false and NOT delete legacy data if write fails', async () => {
      mockStorageService.getSavedPageData.mockResolvedValue(pageData);
      mockStorageService.savePageDataAndHighlights.mockRejectedValue(new Error('Write failed'));

      const result = await service.migrateStorageKey(stableUrl, legacyUrl);

      expect(result).toBe(false);
      expect(mockStorageService.savePageDataAndHighlights).toHaveBeenCalled();
      // Critical: Should NOT clear old data if write failed
      expect(mockStorageService.clearLegacyKeys).not.toHaveBeenCalled();
    });
  });

  describe('executeContentMigration', () => {
    const targetUrl = 'https://example.com/target';
    const sender = { id: 'sender-123' };

    test('should return error if URL is missing', async () => {
      const result = await service.executeContentMigration({}, sender);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should return success if no highlights exist (early exit)', async () => {
      mockStorageService.getHighlights.mockResolvedValue(null);

      const result = await service.executeContentMigration({ url: targetUrl }, sender);

      expect(result.success).toBe(true);
      expect(result.message).toContain('No data');
      expect(mockStorageService.getHighlights).toHaveBeenCalledWith(targetUrl);
      expect(globalThis.chrome.tabs.query).not.toHaveBeenCalled();
    });

    test('should reuse existing tab if available', async () => {
      const existingTab = { id: 888, status: 'complete', url: targetUrl };
      mockStorageService.getHighlights.mockResolvedValue(['highlight1']);
      globalThis.chrome.tabs.query.mockResolvedValue([existingTab]); // Mock queryTabs({}) to return our tab
      mockInjectionService.injectAndExecute.mockResolvedValue(); // script injection
      mockInjectionService.injectWithResponse
        // Script readiness check
        .mockResolvedValueOnce({ ready: true })
        // Migration execution
        .mockResolvedValueOnce({
          success: true,
          statistics: { newHighlightsCreated: 5 },
        });

      const result = await service.executeContentMigration({ url: targetUrl }, sender);

      expect(result.success).toBe(true);
      expect(result.count).toBe(5);
      expect(globalThis.chrome.tabs.query).toHaveBeenCalledWith({}); // Verify precise match logic
      expect(mockTabService.createTab).not.toHaveBeenCalled();

      // Verify script injection
      expect(mockInjectionService.injectAndExecute).toHaveBeenCalledWith(
        existingTab.id,
        expect.arrayContaining(['dist/migration-executor.js']),
        null,
        expect.anything()
      );
      expect(mockTabService.removeTab).not.toHaveBeenCalled();
    });

    test('should create new tab if none exists and clean it up', async () => {
      const newTab = { id: 999 };
      mockStorageService.getHighlights.mockResolvedValue(['highlight1']);
      globalThis.chrome.tabs.query.mockResolvedValue([]); // No existing tabs
      globalThis.chrome.tabs.create.mockResolvedValue(newTab);

      // Setup waitForTabComplete
      mockTabService.waitForTabComplete.mockResolvedValue();

      mockInjectionService.injectAndExecute.mockResolvedValue();
      mockInjectionService.injectWithResponse
        .mockResolvedValueOnce({ ready: true }) // Ready check
        .mockResolvedValueOnce({
          success: true,
          statistics: { newHighlightsCreated: 3 },
        });

      const result = await service.executeContentMigration({ url: targetUrl }, sender);

      expect(result.success).toBe(true);
      expect(globalThis.chrome.tabs.query).toHaveBeenCalledWith({}); // Verify precise match logic
      expect(mockTabService.createTab).toHaveBeenCalledWith({ url: targetUrl, active: false });

      // Cleanup verification
      expect(mockTabService.removeTab).toHaveBeenCalledWith(newTab.id);
    });

    test('should handle migration execution failure and cleanup', async () => {
      const existingTab = { id: 777, status: 'complete', url: targetUrl };
      mockStorageService.getHighlights.mockResolvedValue(['highlight1']);
      globalThis.chrome.tabs.query.mockResolvedValue([existingTab]);
      mockInjectionService.injectAndExecute.mockResolvedValue();
      mockInjectionService.injectWithResponse
        .mockResolvedValueOnce({ ready: true })
        // Migration failure
        .mockResolvedValueOnce({ error: 'Migration Failed' });

      await expect(service.executeContentMigration({ url: targetUrl }, sender)).rejects.toThrow(
        'Migration Failed'
      );

      // Cleanup should still run (though tab reuse scenario technically doesn't create tab, logic handles createdTabId)
      // Since we reused tab, remove shouldn't be called unless we created it.
      // Let's verify standard reuse logic doesn't close existing tabs
      expect(mockTabService.removeTab).not.toHaveBeenCalled();
    });

    test('should handle create tab failure', async () => {
      mockStorageService.getHighlights.mockResolvedValue(['highlight1']);
      globalThis.chrome.tabs.query.mockResolvedValue([]);
      globalThis.chrome.tabs.create.mockRejectedValue(new Error('Tab Error'));

      await expect(service.executeContentMigration({ url: targetUrl }, sender)).rejects.toThrow(
        'Tab Error'
      );
    });
  });
});
