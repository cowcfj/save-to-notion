/*
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com/"}
 *
 * TabService legacy highlight migration flow tests
 */

import {
  createTabService,
  mockInjectionService,
  mockLogger,
  resetTabServiceTestState,
} from './tabServiceTestHarness.js';

describe('TabService legacy highlight migration flow', () => {
  let service = null;

  beforeEach(() => {
    resetTabServiceTestState();
    service = createTabService();
  });

  describe('migrateLegacyHighlights', () => {
    beforeEach(() => {
      chrome.tabs.get.mockResolvedValue({ id: 1, url: 'https://example.com', status: 'complete' });
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
      chrome.storage.local.set.mockImplementation(_data => Promise.resolve());

      await service.migrateLegacyHighlights(
        1,
        'https://example.com',
        'highlights_https://example.com'
      );

      expect(mockInjectionService.injectWithResponse).toHaveBeenCalled();
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        'highlights_https://example.com': [{ id: '1', text: 'highlight' }],
      });
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

      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockLogger.warn.mock.calls[0][0]).toMatch(
        /Migration skipped due to recoverable error:?/
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

  describe('Concurrency & Edge Cases', () => {
    it('updateTabStatus 應該防止並發處理同一個標籤頁 (Line 62)', async () => {
      service.processingTabs.set(1, Date.now());
      await service.updateTabStatus(1, 'https://example.com');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('already being processed')
      );
    });

    it('migrateLegacyHighlights 應該處理腳本回報的錯誤 (Line 277)', async () => {
      chrome.tabs.get.mockResolvedValue({ id: 1, url: 'https://example.com' });
      mockInjectionService.injectWithResponse.mockResolvedValue({ error: 'Injected script fail' });

      await service.migrateLegacyHighlights(1, 'https://example.com', 'key');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Migration script reported error'),
        expect.anything()
      );
    });
  });
});
