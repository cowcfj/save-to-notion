/**
 * StorageManager Unit Tests
 *
 * Tests for options page storage management including analysis, cleanup, and optimization
 */

import { StorageManager } from '../../../scripts/options/StorageManager';
import Logger from '../../../scripts/utils/Logger';

// Mock Logger
jest.mock('../../../scripts/utils/Logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

describe('StorageManager', () => {
  let storageManager = null;
  let mockUiManager = null;
  let mockGet = null;
  let mockSet = null;
  let mockRemove = null;

  beforeEach(() => {
    // DOM Setup
    document.body.innerHTML = `
      <button id="export-data-button"></button>
      <button id="import-data-button"></button>
      <input type="file" id="import-data-file" />
      <button id="check-data-button"></button>
      <div id="data-status"></div>
      <button id="refresh-usage-button"></button>
      <div id="usage-fill"></div>
      <div id="usage-percentage"></div>
      <div id="usage-details"></div>
      <div id="pages-count"></div>
      <div id="highlights-count"></div>
      <div id="config-count"></div>
      <button id="preview-cleanup-button"><span class="button-text"></span></button>
      <button id="execute-cleanup-button"></button>
      <button id="analyze-optimization-button"></button>
      <button id="execute-optimization-button"></button>
      <div id="cleanup-preview"></div>
      <div id="optimization-preview"></div>
      <input type="checkbox" id="cleanup-deleted-pages" />
    `;

    // Chrome API Mocks
    mockGet = jest.fn();
    mockSet = jest.fn();
    mockRemove = jest.fn();

    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          set: mockSet,
          remove: mockRemove,
        },
      },
      runtime: {
        lastError: null,
        getManifest: jest.fn(() => ({ version: '1.0.0' })),
        sendMessage: jest.fn(),
      },
    };

    // UI Manager Mock
    mockUiManager = {
      showStatus: jest.fn(),
    };

    // URL Mock
    global.URL.createObjectURL = jest.fn(() => 'blob:url');
    global.URL.revokeObjectURL = jest.fn();

    storageManager = new StorageManager(mockUiManager);
    storageManager.init();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('init', () => {
    it('should initialize elements', () => {
      expect(storageManager.elements.exportButton).toBeTruthy();
      expect(storageManager.elements.importButton).toBeTruthy();
    });

    it('should setup event listeners', () => {
      // Simulate click
      storageManager.elements.exportButton.click();
      // Since exportData is async and we don't await anything here, we check side effects
      // But verify listeners are attached by spy or interaction
      // Just basic check that init calls updateStorageUsage
      expect(mockGet).toHaveBeenCalled();
    });

    it('should trigger checkDataIntegrity when check button is clicked', () => {
      const checkSpy = jest
        .spyOn(storageManager, 'checkDataIntegrity')
        .mockImplementation(() => Promise.resolve());
      storageManager.init(); // re-init to attach listeners again or attach manually if needed
      // Note: init was called in beforeEach, so listeners are already attached.
      storageManager.elements.checkButton.click();
      expect(checkSpy).toHaveBeenCalled();
      checkSpy.mockRestore();
    });
  });

  describe('getStorageUsage', () => {
    it('should calculate usage correctly', async () => {
      mockGet.mockImplementation((keys, sendResponse) => {
        sendResponse({
          highlights_page1: [{ text: 'abc' }],
          config_theme: 'dark',
        });
      });

      const usage = await StorageManager.getStorageUsage();

      expect(usage.pages).toBe(1);
      expect(usage.highlights).toBe(1);
      expect(usage.configs).toBe(1);
      expect(parseFloat(usage.used)).toBeGreaterThan(0);
    });
  });

  describe('exportData', () => {
    it('should export data as JSON file', async () => {
      mockGet.mockImplementation((keys, sendResponse) => {
        sendResponse({ key: 'value' });
      });

      const clickSpy = jest.fn();
      const originalCreateElement = document.createElement.bind(document);
      jest.spyOn(document, 'createElement').mockImplementation(tagName => {
        if (tagName === 'a') {
          return {
            click: clickSpy,
            href: '',
            download: '',
          };
        }
        return originalCreateElement(tagName);
      });
      jest.spyOn(document.body, 'appendChild').mockImplementation(() => undefined);
      jest.spyOn(document.body, 'removeChild').mockImplementation(() => undefined);

      await storageManager.exportData();

      expect(mockGet).toHaveBeenCalled();
      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(clickSpy).toHaveBeenCalled();
      expect(Logger.error).not.toHaveBeenCalled();
    });

    it('should handle export error', async () => {
      mockGet.mockImplementation((_keys, _callback) => {
        // Simulate runtime.lastError behavior if needed, or throw
        throw new Error('Export error');
      });

      await storageManager.exportData();
      expect(Logger.error).toHaveBeenCalled();
    });
  });

  describe('importData', () => {
    it('should import valid JSON data', async () => {
      const mockFile = new File([JSON.stringify({ data: { key: 'value' } })], 'backup.json', {
        type: 'application/json',
      });
      const event = { target: { files: [mockFile] } };

      // Mock FileReader
      const mockReader = {
        readAsText: jest.fn(),
        onload: null, // Will be set by code
      };
      window.FileReader = jest.fn(() => mockReader);

      // Trigger import
      storageManager.importData(event);

      // Simulate read completion
      mockReader.onload({ target: { result: JSON.stringify({ data: { key: 'value' } }) } });

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockSet).toHaveBeenCalledWith({ key: 'value' }, expect.any(Function));
    });
  });

  describe('checkDataIntegrity', () => {
    it('should analyze data and report status', async () => {
      mockGet.mockImplementation((keys, resolve) => {
        resolve({
          highlights_valid: [{ text: 'ok', rangeInfo: {} }],
          highlights_corrupt: 'not-an-array',
          migration_old: {},
        });
      });

      await storageManager.checkDataIntegrity();

      // Should report corrupted data and migration keys
      const statusText = storageManager.elements.dataStatus.textContent;
      // Since we mock DOM, we can check its content or class
      expect(statusText).toBeDefined();
      expect(storageManager.elements.dataStatus.className).toContain('error');
    });
  });

  describe('analyzeOptimization', () => {
    it('should identify optimization opportunities', async () => {
      mockGet.mockImplementation((keys, sendResponse) =>
        sendResponse({
          migration_file: {},
          highlights_empty: [],
          highlights_valid: [{ text: 'ok' }],
        })
      );

      await storageManager.analyzeOptimization();

      expect(storageManager.optimizationPlan.canOptimize).toBe(true);
      expect(storageManager.optimizationPlan.keysToRemove).toContain('migration_file');
      expect(storageManager.optimizationPlan.keysToRemove).toContain('highlights_empty');

      // Verify UI updated
      expect(storageManager.elements.executeOptimizationButton.style.display).toBe('inline-block');
    });
  });

  describe('executeOptimization', () => {
    it('should execute optimization plan', async () => {
      // Setup plan
      storageManager.optimizationPlan = {
        canOptimize: true,
        keysToRemove: ['key1'],
        optimizedData: { key2: 'val' },
        spaceSaved: 100,
      };

      mockRemove.mockImplementation((keys, sendResponse) => sendResponse());
      mockGet.mockImplementation((keys, resolve) => resolve({ key2: 'old_val' }));
      mockSet.mockImplementation((data, sendResponse) => sendResponse());

      await storageManager.executeOptimization();

      expect(mockRemove).toHaveBeenCalledWith(['key1'], expect.any(Function));
      expect(mockSet).toHaveBeenCalledWith({ key2: 'val' }, expect.any(Function));
    });

    it('should handle optimization error', async () => {
      storageManager.optimizationPlan = {
        canOptimize: true,
        keysToRemove: ['key1'],
        optimizedData: { key2: 'val' },
        spaceSaved: 100,
      };
      // Simulate error in remove
      mockRemove.mockImplementation((keys, callback) => {
        // simulate lastError
        // In the implementation: if (chrome.runtime.lastError) reject(...)
        // We need to mock chrome.runtime.lastError AND callback
        global.chrome.runtime.lastError = { message: 'Remove failed' };
        callback();
        global.chrome.runtime.lastError = null; // cleanup
      });

      await storageManager.executeOptimization();

      expect(Logger.error).toHaveBeenCalled();
      expect(storageManager.elements.dataStatus.textContent).toContain('數據重整失敗');
    });
  });
});

describe('StorageManager Extended', () => {
  let storageManager = null;
  let mockUiManager = null;
  let mockGet = null;
  let mockSet = null;
  let mockRemove = null;

  beforeEach(() => {
    // DOM Setup
    document.body.innerHTML = `
      <button id="export-data-button"></button>
      <button id="import-data-button"></button>
      <input type="file" id="import-data-file" />
      <button id="check-data-button"></button>
      <div id="data-status"></div>
      <button id="refresh-usage-button"></button>
      <div id="usage-fill"></div>
      <div id="usage-percentage"></div>
      <div id="usage-details"></div>
      <div id="pages-count"></div>
      <div id="highlights-count"></div>
      <div id="config-count"></div>
      <button id="preview-cleanup-button"><span class="button-text"></span></button>
      <button id="execute-cleanup-button"></button>
      <button id="analyze-optimization-button"></button>
      <button id="execute-optimization-button"></button>
      <div id="cleanup-preview"></div>
      <div id="optimization-preview"></div>
      <input type="checkbox" id="cleanup-deleted-pages" />
    `;

    // Chrome API Mocks
    mockGet = jest.fn();
    mockSet = jest.fn();
    mockRemove = jest.fn();

    global.chrome = {
      storage: {
        local: {
          get: mockGet,
          set: mockSet,
          remove: mockRemove,
        },
      },
      runtime: {
        lastError: null,
        getManifest: jest.fn(() => ({ version: '1.0.0' })),
        sendMessage: jest.fn(),
      },
    };

    mockUiManager = { showStatus: jest.fn(), showDataStatus: jest.fn() };

    global.URL.createObjectURL = jest.fn(() => 'blob:url');
    global.URL.revokeObjectURL = jest.fn();

    storageManager = new StorageManager(mockUiManager);
    storageManager.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('previewSafeCleanup', () => {
    test('應生成清理預覽', async () => {
      mockGet.mockImplementation((keys, sendResponse) =>
        sendResponse({
          highlights_page1: [{ text: 'test' }],
          migration_old: {},
        })
      );

      await storageManager.previewSafeCleanup();

      expect(mockGet).toHaveBeenCalled();
    });

    test('應正確轉義惡意 URL 以防止 XSS', () => {
      const maliciousUrl = 'http://example.com/search?q=<script>alert(1)</script>';
      const encodedUrl = encodeURIComponent(maliciousUrl);

      storageManager.cleanupPlan = {
        items: [
          {
            key: 'malicious_key',
            url: encodedUrl,
            size: 100,
            reason: 'test',
          },
        ],
        totalKeys: 1,
        spaceFreed: 100,
        deletedPages: 0,
      };

      storageManager.displayCleanupPreview(storageManager.cleanupPlan);

      const previewHtml = storageManager.elements.cleanupPreview.innerHTML;
      expect(previewHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(previewHtml).not.toContain('<script>alert(1)</script>');
    });
  });

  describe('generateSafeCleanupPlan', () => {
    test('應生成清理計劃', async () => {
      mockGet.mockImplementation((keys, sendResponse) =>
        sendResponse({
          saved_page1: { notionPageId: 'page-123' },
          highlights_page1: [{ text: 'ok' }],
        })
      );

      const plan = await storageManager.generateSafeCleanupPlan(false);

      expect(plan.items).toBeDefined();
      expect(plan.totalKeys).toBeDefined();
    });

    test('無可清理項目時應返回空計劃', async () => {
      mockGet.mockImplementation((keys, sendResponse) =>
        sendResponse({
          highlights_page1: [{ text: 'valid', rangeInfo: {} }],
          config_theme: 'dark',
        })
      );

      const plan = await storageManager.generateSafeCleanupPlan(false);

      expect(plan.items.length).toBe(0);
      expect(plan.totalKeys).toBe(0);
    });
  });

  describe('executeSafeCleanup', () => {
    test('無計劃時應返回', async () => {
      storageManager.cleanupPlan = null;

      await storageManager.executeSafeCleanup();

      expect(mockRemove).not.toHaveBeenCalled();
    });

    test('有計劃時應執行清理', async () => {
      storageManager.cleanupPlan = {
        items: [{ key: 'old_key', url: 'test', size: 100, reason: 'test' }],
        totalKeys: 1,
        spaceFreed: 100,
        deletedPages: 0,
      };

      mockRemove.mockImplementation((keys, sendResponse) => sendResponse());

      await storageManager.executeSafeCleanup();

      expect(mockRemove).toHaveBeenCalledWith(['old_key'], expect.any(Function));
    });
  });

  describe('updateUsageDisplay', () => {
    test('應更新 UI 元素', () => {
      const usage = {
        total: 5242880,
        usedMB: '5.00',
        percentage: 5,
        pages: 5,
        highlights: 25,
        configs: 3,
        isUnlimited: true,
      };

      storageManager.updateUsageDisplay(usage);

      expect(storageManager.elements.usagePercentage.textContent).toBe('5%');
      expect(storageManager.elements.pagesCount.textContent).toBe('5');
      expect(storageManager.elements.highlightsCount.textContent).toBe('25');
      expect(storageManager.elements.configCount.textContent).toBe('3');
    });

    // Test for storage warning prioritization
    test('當使用量 > 100MB 時應顯示嚴重錯誤警告 (error)', () => {
      const showDataStatusSpy = jest.spyOn(storageManager, 'showDataStatus');
      const usage = {
        total: 105 * 1024 * 1024,
        usedMB: '105.00',
        percentage: 95,
        pages: 100,
        highlights: 500,
        configs: 10,
        isUnlimited: true,
      };

      storageManager.updateUsageDisplay(usage);

      // Verify that showDataStatus was called with 'error' type
      expect(showDataStatusSpy).toHaveBeenCalledWith(
        expect.stringContaining('數據量過大'),
        'error'
      );
    });

    test('當使用量 > 80MB (但在 100MB 以下) 時應顯示警告 (warning)', () => {
      const showDataStatusSpy = jest.spyOn(storageManager, 'showDataStatus');
      const usage = {
        total: 85 * 1024 * 1024,
        usedMB: '85.00',
        percentage: 85,
        pages: 80,
        highlights: 400,
        configs: 10,
        isUnlimited: true,
      };

      storageManager.updateUsageDisplay(usage);

      // Verify that showDataStatus was called with 'warning' type
      expect(showDataStatusSpy).toHaveBeenCalledWith(
        expect.stringContaining('數據量較大'),
        'warning'
      );
    });
  });

  describe('showDataStatus', () => {
    test('應顯示成功狀態', () => {
      storageManager.showDataStatus('操作成功', 'success');

      expect(storageManager.elements.dataStatus.textContent).toBe('操作成功');
      expect(storageManager.elements.dataStatus.className).toContain('success');
    });

    test('應顯示錯誤狀態', () => {
      storageManager.showDataStatus('發生錯誤', 'error');

      expect(storageManager.elements.dataStatus.textContent).toBe('發生錯誤');
      expect(storageManager.elements.dataStatus.className).toContain('error');
    });

    test('如果元素不存在應安全返回', () => {
      storageManager.elements.dataStatus = null;
      storageManager.showDataStatus('test', 'info');
      // Should not throw
    });
  });

  describe('dataAnalysis', () => {
    test('應可存取統計數據', async () => {
      mockGet.mockImplementation((keys, sendResponse) =>
        sendResponse({
          highlights_page1: [{ text: 'test1' }, { text: 'test2' }],
          highlights_page2: [{ text: 'test3' }],
          config_theme: 'dark',
        })
      );

      const usage = await StorageManager.getStorageUsage();

      expect(usage.pages).toBeGreaterThanOrEqual(0);
      expect(usage.highlights).toBeGreaterThanOrEqual(0);
    });
  });

  describe('setPreviewButtonLoading', () => {
    test('應設置加載狀態', () => {
      storageManager.setPreviewButtonLoading(true);

      expect(storageManager.elements.previewCleanupButton.disabled).toBe(true);
    });

    test('應取消加載狀態', () => {
      storageManager.setPreviewButtonLoading(false);

      expect(storageManager.elements.previewCleanupButton.disabled).toBe(false);
    });
  });

  describe('analyzeOptimization extended', () => {
    test('應識別可優化項目', async () => {
      mockGet.mockImplementation((keys, sendResponse) =>
        sendResponse({
          migration_file: {},
          highlights_empty: [],
          highlights_valid: [{ text: 'ok' }],
          seamless_migration_state_old: {},
        })
      );

      await storageManager.analyzeOptimization();

      expect(storageManager.optimizationPlan).toBeDefined();
    });
  });
});
