/**
 * @jest-environment jsdom
 */

import { MigrationService } from '../../../../scripts/background/services/MigrationService.js';
import { sanitizeUrlForLogging } from '../../../../scripts/utils/urlUtils.js';

// Mock dependencies
jest.mock('../../../../scripts/utils/Logger.js', () => ({
  Logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../../scripts/utils/urlUtils.js', () => ({
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
    };

    mockTabService = {};
    mockInjectionService = {};

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

      const result = await service.migrateStorageKey(stableUrl, legacyUrl);

      expect(result).toBe(false);
      expect(mockStorageService.getSavedPageData).toHaveBeenCalledWith(legacyUrl);
      expect(mockStorageService.setSavedPageData).not.toHaveBeenCalled();
    });

    test('should perform atomic migration (copy then delete) when legacy data exists', async () => {
      mockStorageService.getSavedPageData.mockResolvedValue(pageData);
      mockStorageService.setSavedPageData.mockResolvedValue();
      mockStorageService.clearPageState.mockResolvedValue();

      const result = await service.migrateStorageKey(stableUrl, legacyUrl);

      expect(result).toBe(true);
      // 1. Verify read
      expect(mockStorageService.getSavedPageData).toHaveBeenCalledWith(legacyUrl);
      // 2. Verify write new key
      expect(mockStorageService.setSavedPageData).toHaveBeenCalledWith(stableUrl, pageData);
      // 3. Verify delete old key
      expect(mockStorageService.clearPageState).toHaveBeenCalledWith(legacyUrl);
    });

    test('should return false and NOT delete legacy data if write fails', async () => {
      mockStorageService.getSavedPageData.mockResolvedValue(pageData);
      mockStorageService.setSavedPageData.mockRejectedValue(new Error('Write failed'));

      const result = await service.migrateStorageKey(stableUrl, legacyUrl);

      expect(result).toBe(false);
      expect(mockStorageService.setSavedPageData).toHaveBeenCalled();
      // Critical: Should NOT clear old data if write failed
      expect(mockStorageService.clearPageState).not.toHaveBeenCalled();
    });
  });

  describe('executeContentMigration', () => {
    test('should throw not implemented error', async () => {
      await expect(service.executeContentMigration({}, {})).rejects.toThrow('Not implemented yet');
    });
  });
});
