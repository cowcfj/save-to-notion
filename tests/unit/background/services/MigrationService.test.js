/**
 * @jest-environment jsdom
 */

import { MigrationService } from '../../../../scripts/background/services/MigrationService.js';
import Logger from '../../../../scripts/utils/Logger.js';

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

jest.mock('../../../../scripts/utils/urlUtils.js', () => ({
  isRootUrl: jest.fn(() => false),
  computeStableUrl: jest.fn(url => url),
}));

jest.mock('../../../../scripts/background/utils/migrationMetadataUtils.js', () => ({
  hasNotionData: jest.fn(),
  isSameNotionPage: jest.fn(),
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
      setUrlAlias: jest.fn(),
      clearPageState: jest.fn(),
      clearLegacyKeys: jest.fn(),
      getHighlights: jest.fn(),
      updateHighlights: jest.fn(),
      savePageDataAndHighlights: jest.fn(),
    };

    mockTabService = {
      queryTabs: jest.fn().mockResolvedValue([]),
      createTab: jest.fn().mockResolvedValue({ id: 999 }),
      removeTab: jest.fn().mockResolvedValue(),
      waitForTabComplete: jest.fn().mockResolvedValue(),
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

    test('should block migration to root URL', async () => {
      const { isRootUrl } = require('../../../../scripts/utils/urlUtils.js');
      isRootUrl.mockReturnValueOnce(true);
      expect(await service.migrateStorageKey('https://example.com/', legacyUrl)).toBe(false);
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Blocked migration'),
        expect.anything()
      );
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
      mockStorageService.getSavedPageData.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(pageData) : Promise.resolve(null)
      );
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
        []
      );
      // 3. Verify delete old key using clearLegacyKeys (不會誤刪 stable URL)
      expect(mockStorageService.clearLegacyKeys).toHaveBeenCalledWith(legacyUrl);
    });

    test('should normalize wrapped legacy highlights object before migration', async () => {
      const legacyHighlights = [{ id: 'legacy-1' }];

      mockStorageService.getSavedPageData.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(pageData) : Promise.resolve(null)
      );
      mockStorageService.getHighlights.mockImplementation(url =>
        url === legacyUrl
          ? Promise.resolve({ highlights: legacyHighlights })
          : Promise.resolve(null)
      );
      mockStorageService.savePageDataAndHighlights.mockResolvedValue();
      mockStorageService.clearLegacyKeys.mockResolvedValue();

      const result = await service.migrateStorageKey(stableUrl, legacyUrl);

      expect(result).toBe(true);
      expect(mockStorageService.savePageDataAndHighlights).toHaveBeenCalledWith(
        stableUrl,
        pageData,
        legacyHighlights
      );
    });

    test('should supplement notion metadata when target already has highlights', async () => {
      const {
        hasNotionData,
      } = require('../../../../scripts/background/utils/migrationMetadataUtils.js');
      // legacyData is pageData, stableData is null. we want legacy to have notion, stable to not have notion.
      hasNotionData.mockImplementation(data => data === pageData);

      mockStorageService.getSavedPageData.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(pageData) : Promise.resolve(null)
      );
      mockStorageService.getHighlights.mockImplementation(url => {
        if (url === legacyUrl) {
          return Promise.resolve([]);
        }
        if (url === stableUrl) {
          return Promise.resolve({ highlights: [{ id: 'existing-1' }] });
        }
        return Promise.resolve(null);
      });

      const result = await service.migrateStorageKey(stableUrl, legacyUrl);

      expect(result).toBe(true);
      expect(mockStorageService.setSavedPageData).toHaveBeenCalledWith(stableUrl, pageData);
      expect(mockStorageService.savePageDataAndHighlights).not.toHaveBeenCalled();
      expect(mockStorageService.clearLegacyKeys).not.toHaveBeenCalled();
    });

    test('should log conflict warning when stable/legacy notion are determined as different pages', async () => {
      const {
        hasNotionData,
        isSameNotionPage,
      } = require('../../../../scripts/background/utils/migrationMetadataUtils.js');
      hasNotionData.mockReturnValue(true);
      isSameNotionPage.mockReturnValue(false);

      mockStorageService.getSavedPageData.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(pageData) : Promise.resolve({ notionPageId: 'other' })
      );
      mockStorageService.getHighlights.mockImplementation(url => {
        if (url === legacyUrl) {
          return Promise.resolve([]);
        }
        if (url === stableUrl) {
          return Promise.resolve({ highlights: [{ id: 'existing-1' }] });
        }
        return Promise.resolve(null);
      });

      await service.migrateStorageKey(stableUrl, legacyUrl);

      expect(Logger.warn).toHaveBeenCalledWith(
        'Stable/legacy notion metadata conflict, keeping stable data',
        expect.anything()
      );
    });

    test('should not log conflict warning when stable/legacy notion cannot be determined as same page', async () => {
      const {
        hasNotionData,
        isSameNotionPage,
      } = require('../../../../scripts/background/utils/migrationMetadataUtils.js');
      hasNotionData.mockReturnValue(true);
      isSameNotionPage.mockReturnValue(null);

      mockStorageService.getSavedPageData.mockImplementation(url => {
        if (url === legacyUrl) {
          return Promise.resolve({ notionUrl: 'https://notion.so/legacy-only-url' });
        }
        if (url === stableUrl) {
          return Promise.resolve({ notionPageId: 'stable-only-page-id' });
        }
        return Promise.resolve(null);
      });
      mockStorageService.getHighlights.mockImplementation(url => {
        if (url === legacyUrl) {
          return Promise.resolve([]);
        }
        if (url === stableUrl) {
          return Promise.resolve({ highlights: [{ id: 'existing-1' }] });
        }
        return Promise.resolve(null);
      });

      await service.migrateStorageKey(stableUrl, legacyUrl);

      expect(Logger.warn).not.toHaveBeenCalledWith(
        'Stable/legacy notion metadata conflict, keeping stable data',
        expect.anything()
      );
    });

    test('should not throw if setUrlAlias is not a function or throws', async () => {
      mockStorageService.setUrlAlias = undefined;
      const {
        hasNotionData,
      } = require('../../../../scripts/background/utils/migrationMetadataUtils.js');
      hasNotionData.mockReturnValue(false);

      mockStorageService.getSavedPageData.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(pageData) : Promise.resolve(null)
      );
      mockStorageService.getHighlights.mockResolvedValue(null);
      mockStorageService.savePageDataAndHighlights.mockResolvedValue();
      mockStorageService.clearLegacyKeys.mockResolvedValue();

      let result = await service.migrateStorageKey(stableUrl, legacyUrl);
      expect(result).toBe(true);

      // Now test the catch block
      mockStorageService.setUrlAlias = jest.fn().mockRejectedValue(new Error('alias err'));
      result = await service.migrateStorageKey(stableUrl, legacyUrl);
      expect(result).toBe(true);
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to set URL alias'),
        expect.anything()
      );
    });

    test('should convert highlights format when convertFormat is enabled', async () => {
      const legacyHighlights = [{ id: 'h-1' }];
      const convertedHighlights = [{ id: 'h-1', needsRangeInfo: true }];
      const formatConverter = jest.fn().mockReturnValue(convertedHighlights);

      mockStorageService.getSavedPageData.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(pageData) : Promise.resolve(null)
      );
      mockStorageService.getHighlights.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(legacyHighlights) : Promise.resolve(null)
      );
      mockStorageService.savePageDataAndHighlights.mockResolvedValue();
      mockStorageService.clearLegacyKeys.mockResolvedValue();

      const result = await service.migrateStorageKey(stableUrl, legacyUrl, {
        convertFormat: true,
        formatConverter,
      });

      expect(result).toBe(true);
      expect(formatConverter).toHaveBeenCalledWith(legacyHighlights);
      expect(mockStorageService.savePageDataAndHighlights).toHaveBeenCalledWith(
        stableUrl,
        pageData,
        convertedHighlights
      );
    });

    test('should support async format converter when convertFormat is enabled', async () => {
      const legacyHighlights = [{ id: 'h-1a' }];
      const convertedHighlights = [{ id: 'h-1a', needsRangeInfo: true }];
      const formatConverter = jest.fn().mockResolvedValue(convertedHighlights);

      mockStorageService.getSavedPageData.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(pageData) : Promise.resolve(null)
      );
      mockStorageService.getHighlights.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(legacyHighlights) : Promise.resolve(null)
      );
      mockStorageService.savePageDataAndHighlights.mockResolvedValue();
      mockStorageService.clearLegacyKeys.mockResolvedValue();

      const result = await service.migrateStorageKey(stableUrl, legacyUrl, {
        convertFormat: true,
        formatConverter,
      });

      expect(result).toBe(true);
      expect(formatConverter).toHaveBeenCalledWith(legacyHighlights);
      expect(mockStorageService.savePageDataAndHighlights).toHaveBeenCalledWith(
        stableUrl,
        pageData,
        convertedHighlights
      );
    });

    test('should skip conversion if formatConverter is active but not a function', async () => {
      const legacyHighlights = [{ id: 'h-2' }];
      const pageData = { notionPageId: 'page-123', title: 'Test Page' };
      const legacyUrl = 'https://example.com/legacy';
      const stableUrl = 'https://example.com/stable';

      mockStorageService.getSavedPageData.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(pageData) : Promise.resolve(null)
      );
      mockStorageService.getHighlights.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(legacyHighlights) : Promise.resolve(null)
      );
      mockStorageService.savePageDataAndHighlights.mockResolvedValue();
      mockStorageService.clearLegacyKeys.mockResolvedValue();

      const result = await service.migrateStorageKey(stableUrl, legacyUrl, {
        convertFormat: true,
        formatConverter: 'not-a-fn',
      });

      expect(result).toBe(true);
      expect(mockStorageService.savePageDataAndHighlights).toHaveBeenCalledWith(
        stableUrl,
        pageData,
        legacyHighlights
      );
    });

    test('should keep original highlights when convertFormat is disabled', async () => {
      const legacyHighlights = [{ id: 'h-2' }];
      const formatConverter = jest.fn().mockReturnValue([{ id: 'converted' }]);

      mockStorageService.getSavedPageData.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(pageData) : Promise.resolve(null)
      );
      mockStorageService.getHighlights.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(legacyHighlights) : Promise.resolve(null)
      );
      mockStorageService.savePageDataAndHighlights.mockResolvedValue();
      mockStorageService.clearLegacyKeys.mockResolvedValue();

      const result = await service.migrateStorageKey(stableUrl, legacyUrl, {
        convertFormat: false,
        formatConverter,
      });

      expect(result).toBe(true);
      expect(formatConverter).not.toHaveBeenCalled();
      expect(mockStorageService.savePageDataAndHighlights).toHaveBeenCalledWith(
        stableUrl,
        pageData,
        legacyHighlights
      );
    });

    test('should return false and NOT delete legacy data if format conversion fails', async () => {
      const legacyHighlights = [{ id: 'h-3' }];
      const formatConverter = jest.fn(() => {
        throw new Error('Convert failed');
      });

      mockStorageService.getSavedPageData.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(pageData) : Promise.resolve(null)
      );
      mockStorageService.getHighlights.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(legacyHighlights) : Promise.resolve(null)
      );

      const result = await service.migrateStorageKey(stableUrl, legacyUrl, {
        convertFormat: true,
        formatConverter,
      });

      expect(result).toBe(false);
      expect(formatConverter).toHaveBeenCalledWith(legacyHighlights);
      expect(mockStorageService.savePageDataAndHighlights).not.toHaveBeenCalled();
      expect(mockStorageService.clearLegacyKeys).not.toHaveBeenCalled();
    });

    test('should return false and NOT delete legacy data if format converter returns non-array', async () => {
      const legacyHighlights = [{ id: 'h-4' }];
      const formatConverter = jest.fn().mockReturnValue('not-an-array');

      mockStorageService.getSavedPageData.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(pageData) : Promise.resolve(null)
      );
      mockStorageService.getHighlights.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(legacyHighlights) : Promise.resolve(null)
      );

      const result = await service.migrateStorageKey(stableUrl, legacyUrl, {
        convertFormat: true,
        formatConverter,
      });

      expect(result).toBe(false);
      expect(formatConverter).toHaveBeenCalledWith(legacyHighlights);
      expect(mockStorageService.savePageDataAndHighlights).not.toHaveBeenCalled();
      expect(mockStorageService.clearLegacyKeys).not.toHaveBeenCalled();
    });

    test('should return false and NOT delete legacy data if write fails', async () => {
      mockStorageService.getSavedPageData.mockImplementation(url =>
        url === legacyUrl ? Promise.resolve(pageData) : Promise.resolve(null)
      );
      mockStorageService.getHighlights.mockResolvedValue(null); // Explicit mock
      mockStorageService.savePageDataAndHighlights.mockRejectedValue(new Error('Write failed'));

      const result = await service.migrateStorageKey(stableUrl, legacyUrl);

      expect(result).toBe(false);
      expect(mockStorageService.savePageDataAndHighlights).toHaveBeenCalled();
      // Critical: Should NOT clear old data if write failed
      expect(mockStorageService.clearLegacyKeys).not.toHaveBeenCalled();
    });
  });

  describe('migrateBatchUrl', () => {
    const url = 'https://example.com/article';

    test('should normalize wrapped legacy highlights object before batch migration', async () => {
      const { computeStableUrl } = require('../../../../scripts/utils/urlUtils.js');
      const oldHighlights = [{ id: 'legacy-1' }];

      computeStableUrl.mockReturnValueOnce(url);
      mockStorageService.getHighlights.mockResolvedValueOnce({ highlights: oldHighlights });
      service._applyInPlaceConversion = jest.fn().mockResolvedValue();

      const result = await service.migrateBatchUrl(url);

      expect(service._applyInPlaceConversion).toHaveBeenCalledWith(url, oldHighlights);
      expect(result).toEqual({
        status: 'success',
        url: `safe://${url}`,
        count: 1,
        pending: 1,
      });
    });

    test('should skip batch migration when no legacy data exists', async () => {
      const { computeStableUrl } = require('../../../../scripts/utils/urlUtils.js');

      computeStableUrl.mockReturnValueOnce(url);
      mockStorageService.getHighlights.mockResolvedValueOnce(null);
      service._applyInPlaceConversion = jest.fn().mockResolvedValue();

      const result = await service.migrateBatchUrl(url);

      expect(result).toEqual({
        status: 'skipped',
        reason: '無數據',
        url: `safe://${url}`,
      });
      expect(service._applyInPlaceConversion).not.toHaveBeenCalled();
    });

    test('should skip batch migration when legacy data has no highlights', async () => {
      const { computeStableUrl } = require('../../../../scripts/utils/urlUtils.js');

      computeStableUrl.mockReturnValueOnce(url);
      mockStorageService.getHighlights.mockResolvedValueOnce({ foo: 'bar' });
      service._applyInPlaceConversion = jest.fn().mockResolvedValue();

      const result = await service.migrateBatchUrl(url);

      expect(result).toEqual({
        status: 'skipped',
        reason: '無標註',
        url: `safe://${url}`,
      });
      expect(service._applyInPlaceConversion).not.toHaveBeenCalled();
    });
  });

  describe('_supplementBatchSavedMetadata', () => {
    const originalUrl = 'https://example.com/original';
    const stableUrl = 'https://example.com/stable';

    test('should supplement batch metadata via shared helper and keep batch log context', async () => {
      const {
        hasNotionData,
      } = require('../../../../scripts/background/utils/migrationMetadataUtils.js');
      const legacySavedData = { notionPageId: 'legacy-page-id' };

      hasNotionData.mockImplementation(data => Boolean(data?.notionPageId));
      mockStorageService.getSavedPageData.mockImplementation(url => {
        if (url === stableUrl) {
          return Promise.resolve(null);
        }
        if (url === originalUrl) {
          return Promise.resolve(legacySavedData);
        }
        return Promise.resolve(null);
      });

      const result = await service._supplementBatchSavedMetadata(originalUrl, stableUrl);

      expect(result).toBe(true);
      expect(mockStorageService.setSavedPageData).toHaveBeenCalledWith(stableUrl, legacySavedData);
      expect(Logger.info).toHaveBeenCalledWith(
        '已補遷移 saved metadata 到穩定 URL',
        expect.objectContaining({
          action: 'migration_batch',
          stable: `safe://${stableUrl}`,
          legacy: `safe://${originalUrl}`,
        })
      );
      expect(mockStorageService.setUrlAlias).toHaveBeenCalledWith(originalUrl, stableUrl);
    });

    test('should log conflict with batch context when notion metadata conflicts', async () => {
      const {
        hasNotionData,
        isSameNotionPage,
      } = require('../../../../scripts/background/utils/migrationMetadataUtils.js');
      const stableSavedData = { notionPageId: 'stable-page-id' };
      const legacySavedData = { notionPageId: 'legacy-page-id' };

      hasNotionData.mockReturnValue(true);
      isSameNotionPage.mockReturnValue(false);
      mockStorageService.getSavedPageData.mockImplementation(url => {
        if (url === stableUrl) {
          return Promise.resolve(stableSavedData);
        }
        if (url === originalUrl) {
          return Promise.resolve(legacySavedData);
        }
        return Promise.resolve(null);
      });

      const result = await service._supplementBatchSavedMetadata(originalUrl, stableUrl);

      expect(result).toBe(false);
      expect(Logger.warn).toHaveBeenCalledWith(
        'stable/legacy notion 衝突，保留 stable 資料',
        expect.objectContaining({
          action: 'migration_batch',
          stable: `safe://${stableUrl}`,
          legacy: `safe://${originalUrl}`,
        })
      );
      expect(mockStorageService.setUrlAlias).toHaveBeenCalledWith(originalUrl, stableUrl);
    });

    test('should still set alias when supplement logic throws', async () => {
      const {
        hasNotionData,
      } = require('../../../../scripts/background/utils/migrationMetadataUtils.js');
      const legacySavedData = { notionPageId: 'legacy-page-id' };

      hasNotionData.mockImplementation(data => Boolean(data?.notionPageId));
      mockStorageService.getSavedPageData.mockImplementation(url => {
        if (url === stableUrl) {
          return Promise.resolve(null);
        }
        if (url === originalUrl) {
          return Promise.resolve(legacySavedData);
        }
        return Promise.resolve(null);
      });
      mockStorageService.setSavedPageData.mockRejectedValueOnce(new Error('set failed'));

      await expect(service._supplementBatchSavedMetadata(originalUrl, stableUrl)).rejects.toThrow(
        'set failed'
      );
      expect(mockStorageService.setUrlAlias).toHaveBeenCalledWith(originalUrl, stableUrl);
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
      expect(result.message).toContain('No data');
      expect(mockStorageService.getHighlights).toHaveBeenCalledWith(targetUrl);
      expect(mockTabService.queryTabs).not.toHaveBeenCalled();
    });

    test('should reuse existing tab if available', async () => {
      const existingTab = { id: 888, status: 'complete', url: targetUrl };
      mockStorageService.getHighlights.mockResolvedValue(['highlight1']);
      mockTabService.queryTabs.mockResolvedValue([existingTab]); // Mock mockTabService directly
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
      expect(mockTabService.queryTabs).toHaveBeenCalledWith({}); // Verify precise match logic
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
      mockTabService.queryTabs.mockResolvedValue([]); // No existing tabs
      mockTabService.createTab.mockResolvedValue(newTab);

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
      expect(mockTabService.queryTabs).toHaveBeenCalledWith({}); // Verify precise match logic
      expect(mockTabService.createTab).toHaveBeenCalledWith({ url: targetUrl, active: false });
      expect(mockTabService.waitForTabComplete).toHaveBeenCalledWith(newTab.id);

      // Cleanup verification
      expect(mockTabService.removeTab).toHaveBeenCalledWith(newTab.id);
    });

    test('should handle migration execution failure and cleanup', async () => {
      const existingTab = { id: 777, status: 'complete', url: targetUrl };
      mockStorageService.getHighlights.mockResolvedValue(['highlight1']);
      mockTabService.queryTabs.mockResolvedValue([existingTab]);
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

    test('should treat nested migration outcome error as failure', async () => {
      const existingTab = { id: 778, status: 'complete', url: targetUrl };
      mockStorageService.getHighlights.mockResolvedValue(['highlight1']);
      mockTabService.queryTabs.mockResolvedValue([existingTab]);
      mockInjectionService.injectAndExecute.mockResolvedValue();
      mockInjectionService.injectWithResponse
        .mockResolvedValueOnce({ ready: true })
        .mockResolvedValueOnce({
          success: true,
          result: { error: 'Migration failed after max retries' },
          statistics: { newHighlightsCreated: 0 },
        });

      await expect(service.executeContentMigration({ url: targetUrl }, sender)).rejects.toThrow(
        'Migration failed after max retries'
      );
      expect(mockTabService.removeTab).not.toHaveBeenCalled();
    });

    test('should treat rolled back migration result as failure', async () => {
      const existingTab = { id: 779, status: 'complete', url: targetUrl };
      mockStorageService.getHighlights.mockResolvedValue(['highlight1']);
      mockTabService.queryTabs.mockResolvedValue([existingTab]);
      mockInjectionService.injectAndExecute.mockResolvedValue();
      mockInjectionService.injectWithResponse
        .mockResolvedValueOnce({ ready: true })
        .mockResolvedValueOnce({
          success: true,
          result: { rolledBack: true, reason: 'verification_failed' },
          statistics: { newHighlightsCreated: 0 },
        });

      await expect(service.executeContentMigration({ url: targetUrl }, sender)).rejects.toThrow(
        'Migration rolled back: verification_failed'
      );
      expect(mockTabService.removeTab).not.toHaveBeenCalled();
    });

    test('should execute the injectWithResponse callbacks properly for coverage', async () => {
      const existingTab = { id: 888, status: 'complete', url: targetUrl };
      mockTabService.queryTabs.mockResolvedValue([existingTab]);
      mockStorageService.getHighlights.mockResolvedValue(['hi']);

      // We will actually execute the callback passed to injectWithResponse
      mockInjectionService.injectWithResponse.mockImplementation(async (_tabId, cb) => {
        // Setup global mock state for _waitForScriptReady
        globalThis.MigrationExecutor = class {
          migrate() {
            return Promise.resolve({ rolledBack: false });
          }
          getStatistics() {
            return { newHighlightsCreated: 1 };
          }
        };
        globalThis.HighlighterV2 = { manager: {} };

        try {
          return cb('exec_err', 'mgr_err');
        } finally {
          delete globalThis.MigrationExecutor;
          delete globalThis.HighlighterV2;
        }
      });

      const result = await service.executeContentMigration({ url: targetUrl }, sender);
      expect(result.success).toBe(true);
    });

    test('should handle execution failure in injectWithResponse cb', async () => {
      const existingTab = { id: 888, status: 'complete', url: targetUrl };
      mockTabService.queryTabs.mockResolvedValue([existingTab]);
      mockStorageService.getHighlights.mockResolvedValue(['hi']);

      mockInjectionService.injectWithResponse.mockImplementation(async (_tabId, cb) => {
        try {
          delete globalThis.MigrationExecutor;
          delete globalThis.HighlighterV2;
          return cb('exec_err', 'mgr_err');
        } finally {
          delete globalThis.MigrationExecutor;
          delete globalThis.HighlighterV2;
        }
      });

      await expect(service.executeContentMigration({ url: targetUrl }, sender)).rejects.toThrow();
    });

    test('should timeout _waitForScriptReady if ready check fails', async () => {
      const existingTab = { id: 888, status: 'complete', url: targetUrl };
      mockTabService.queryTabs.mockResolvedValue([existingTab]);
      mockStorageService.getHighlights.mockResolvedValue(['hi']);

      // Always return ready: false
      mockInjectionService.injectWithResponse.mockResolvedValue({ ready: false });

      const originalSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = jest.fn(cb => cb());

      const promise = service.executeContentMigration({ url: targetUrl }, sender);
      await expect(promise).rejects.toThrow(/timeout/);

      globalThis.setTimeout = originalSetTimeout;
    });
  });
});
