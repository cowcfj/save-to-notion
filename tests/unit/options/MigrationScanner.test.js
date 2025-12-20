/**
 * MigrationScanner Unit Tests
 *
 * Tests for options page storage scanning and migration coordination
 */

import { MigrationScanner } from '../../../scripts/options/MigrationScanner';

// Mock Chrome API (reset in beforeEach)

describe('MigrationScanner', () => {
  let mockGet = null;
  let mockRemove = null;
  let mockSendMessage = null;
  let scanner = null;

  beforeEach(() => {
    // Initialize mocks
    mockGet = jest.fn();
    mockRemove = jest.fn();
    mockSendMessage = jest.fn();

    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          remove: mockRemove,
        },
      },
      runtime: {
        sendMessage: mockSendMessage,
      },
    };

    // Mock Logger to prevent console pollution and ensure function existence
    global.Logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    // Explicitly set window.Logger for JSDOM
    if (typeof window !== 'undefined') {
      window.Logger = global.Logger;
    }

    scanner = new MigrationScanner();
  });

  describe('constructor', () => {
    it('should set correct key prefixes', () => {
      expect(scanner.LEGACY_KEY_PREFIX).toBe('highlights_');
      expect(scanner.MIGRATION_STATE_PREFIX).toBe('seamless_migration_state_');
    });

    it('should initialize logger', () => {
      expect(scanner.logger).toBeDefined();
    });
  });

  describe('scanStorage', () => {
    it('should return empty results when no storage data', async () => {
      mockGet.mockResolvedValue({});

      const result = await scanner.scanStorage();

      expect(result.items).toEqual([]);
      expect(result.totalHighlights).toBe(0);
      expect(result.legacyCount).toBe(0);
      expect(result.needsMigration).toBe(false);
    });

    it('should identify legacy format highlights (no rangeInfo)', async () => {
      mockGet.mockResolvedValue({
        'highlights_https://example.com': [{ text: 'test', color: 'yellow' }],
      });

      const result = await scanner.scanStorage();

      expect(result.items.length).toBe(1);
      expect(result.items[0]).toEqual({
        url: 'https://example.com',
        highlightCount: 1,
      });
      expect(result.needsMigration).toBe(true);
    });

    it('should ignore modern format highlights (with rangeInfo)', async () => {
      mockGet.mockResolvedValue({
        'highlights_https://example.com': [
          { text: 'test', color: 'yellow', rangeInfo: { startOffset: 0 } },
        ],
      });

      const result = await scanner.scanStorage();

      expect(result.items.length).toBe(0);
      expect(result.needsMigration).toBe(false);
    });

    it('should correctly count total highlights', async () => {
      mockGet.mockResolvedValue({
        'highlights_https://example1.com': [{ text: 'a' }, { text: 'b' }],
        'highlights_https://example2.com': { highlights: [{ text: 'c' }] },
      });

      const result = await scanner.scanStorage();

      expect(result.totalHighlights).toBe(3);
    });

    it('should ignore non-highlight keys', async () => {
      mockGet.mockResolvedValue({
        saved_url: { title: 'Test' },
        config_theme: 'dark',
      });

      const result = await scanner.scanStorage();

      expect(result.items.length).toBe(0);
    });
  });

  describe('isLegacyFormat', () => {
    it('should identify array format without rangeInfo', () => {
      const data = [{ text: 'test' }, { text: 'test2' }];
      expect(MigrationScanner.isLegacyFormat(data)).toBe(true);
    });

    it('should identify highlights property without rangeInfo', () => {
      const data = { highlights: [{ text: 'test' }] };
      expect(MigrationScanner.isLegacyFormat(data)).toBe(true);
    });

    it('should identify items with rangeInfo as modern format', () => {
      const data = [{ text: 'test', rangeInfo: { startOffset: 0 } }];
      expect(MigrationScanner.isLegacyFormat(data)).toBe(false);
    });

    it('should handle empty data', () => {
      expect(MigrationScanner.isLegacyFormat(null)).toBe(false);
      expect(MigrationScanner.isLegacyFormat()).toBe(false);
      expect(MigrationScanner.isLegacyFormat([])).toBe(false);
    });
  });

  describe('requestBatchMigration', () => {
    it('should handle successful migration requests', async () => {
      mockSendMessage.mockResolvedValue({ success: true });

      const urls = ['https://example1.com', 'https://example2.com'];
      const onProgress = jest.fn();

      const result = await scanner.requestBatchMigration(urls, onProgress);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.errors).toEqual([]);
      expect(onProgress).toHaveBeenCalledTimes(2);
    });

    it('should handle failed migration requests', async () => {
      mockSendMessage
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'Migration failed' });

      const urls = ['https://success.com', 'https://fail.com'];
      const result = await scanner.requestBatchMigration(urls);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors.length).toBe(1);
    });
  });

  describe('getMigrationStatusSummary', () => {
    it('should return correct status summary', async () => {
      mockGet.mockResolvedValue({
        seamless_migration_state_url1: { phase: 'completed' },
        seamless_migration_state_url2: { phase: 'completed' },
        seamless_migration_state_url3: { phase: 'failed' },
        other_key: 'value',
      });

      const result = await scanner.getMigrationStatusSummary();

      expect(result.completed).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.pending).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      mockGet.mockRejectedValue(new Error('Storage error'));

      const result = await scanner.getMigrationStatusSummary();

      expect(result.completed).toBe(0);
      expect(result.pending).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe('cleanupCompletedMigrations', () => {
    it('should clean up completed migration records', async () => {
      mockGet.mockResolvedValue({
        seamless_migration_state_url1: { phase: 'completed' },
        seamless_migration_state_url2: { phase: 'completed' },
        seamless_migration_state_url3: { phase: 'failed' },
      });
      mockRemove.mockResolvedValue();

      const count = await scanner.cleanupCompletedMigrations();

      expect(count).toBe(2);
      expect(mockRemove).toHaveBeenCalled();
    });

    it('should not call remove when no completed records', async () => {
      mockGet.mockResolvedValue({
        seamless_migration_state_url1: { phase: 'failed' },
      });

      const count = await scanner.cleanupCompletedMigrations();

      expect(count).toBe(0);
      expect(mockRemove).not.toHaveBeenCalled();
    });
  });

  describe('truncateUrl', () => {
    it('should truncate long URLs', () => {
      const longUrl = 'https://example.com/very/long/path/that/exceeds/maximum/length';
      const result = MigrationScanner.truncateUrl(longUrl, 30);
      expect(result.length).toBe(30);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should preserve short URLs', () => {
      const shortUrl = 'https://example.com';
      const result = MigrationScanner.truncateUrl(shortUrl, 50);
      expect(result).toBe(shortUrl);
    });
  });
});
