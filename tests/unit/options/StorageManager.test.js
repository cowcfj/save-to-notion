/**
 * StorageManager Unit Tests
 *
 * Tests for options page storage management including analysis, cleanup, and optimization
 */

import { StorageManager } from '../../../options/StorageManager';
import Logger from '../../../scripts/utils/Logger';

// Mock Logger
jest.mock('../../../scripts/utils/Logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  start: jest.fn(),
  finish: jest.fn(),
  success: jest.fn(),
}));

// Blob Polyfill for JSDOM
if (globalThis.Blob === undefined) {
  globalThis.Blob = class Blob {
    constructor(parts = []) {
      const encoder = new TextEncoder();
      const normalizedParts = Array.isArray(parts) ? parts : [parts];
      this._chunks = normalizedParts.map(part => {
        if (part instanceof ArrayBuffer) {
          return new Uint8Array(part);
        }
        if (ArrayBuffer.isView(part)) {
          return new Uint8Array(part.buffer, part.byteOffset, part.byteLength);
        }
        return encoder.encode(String(part ?? ''));
      });
      this.size = this._chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    }

    async arrayBuffer() {
      const merged = new Uint8Array(this.size);
      let offset = 0;
      for (const chunk of this._chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return merged.buffer;
    }
  };
}

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
    mockSet = jest.fn((data, callback) => callback?.());
    mockRemove = jest.fn();

    globalThis.chrome = {
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
    globalThis.URL.createObjectURL = jest.fn(() => 'blob:url');
    globalThis.URL.revokeObjectURL = jest.fn();

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
      mockGet.mockImplementation((_keys, sendResponse) => {
        sendResponse({
          highlights_page1: [{ text: 'abc' }],
          config_theme: 'dark',
        });
      });

      const usage = await StorageManager.getStorageUsage();

      expect(usage.pages).toBe(1);
      expect(usage.highlights).toBe(1);
      expect(usage.configs).toBe(1);
      expect(Number.parseFloat(usage.used)).toBeGreaterThan(0);
    });
  });

  describe('exportData', () => {
    it('should export data as JSON file', async () => {
      mockGet.mockImplementation((_keys, sendResponse) => {
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
            remove: jest.fn(),
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
      const mockContent = JSON.stringify({ data: { key: 'value' } });
      const mockFile = {
        text: jest.fn().mockResolvedValue(mockContent),
      };
      const event = { target: { files: [mockFile] } };

      // Trigger import
      await storageManager.importData(event);

      expect(mockSet).toHaveBeenCalledWith({ key: 'value' }, expect.any(Function));
    });

    it('should reject backup with array data', async () => {
      const mockContent = JSON.stringify({ data: [] });
      const mockFile = {
        text: jest.fn().mockResolvedValue(mockContent),
      };
      const event = { target: { files: [mockFile] } };

      await storageManager.importData(event);

      expect(mockSet).not.toHaveBeenCalled();
      expect(storageManager.elements.dataStatus.className).toContain('error');
    });

    it('should reject backup with null data', async () => {
      const mockContent = JSON.stringify({ data: null });
      const mockFile = {
        text: jest.fn().mockResolvedValue(mockContent),
      };
      const event = { target: { files: [mockFile] } };

      await storageManager.importData(event);

      expect(mockSet).not.toHaveBeenCalled();
      expect(Logger.error).toHaveBeenCalled();
    });

    it('should reject backup with non-object data', async () => {
      const mockContent = JSON.stringify({ data: 'invalid' });
      const mockFile = {
        text: jest.fn().mockResolvedValue(mockContent),
      };
      const event = { target: { files: [mockFile] } };

      await storageManager.importData(event);

      expect(mockSet).not.toHaveBeenCalled();
      expect(Logger.error).toHaveBeenCalled();
    });
  });

  describe('checkDataIntegrity', () => {
    it('should analyze data and report status', async () => {
      mockGet.mockImplementation((_keys, resolve) => {
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
      mockGet.mockImplementation((_keys, sendResponse) =>
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

      mockGet.mockImplementation((_keys, resolve) => {
        if (typeof resolve === 'function') {
          resolve({});
        }
      });
      mockRemove.mockImplementation((_keys, sendResponse) => {
        if (typeof sendResponse === 'function') {
          sendResponse();
        }
      });
      mockSet.mockImplementation((_data, sendResponse) => {
        if (typeof sendResponse === 'function') {
          sendResponse();
        }
      });

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
      mockGet.mockImplementation((_keys, resolve) => {
        if (typeof resolve === 'function') {
          resolve({});
        }
      });
      // Simulate error in remove
      mockRemove.mockImplementation((_keys, callback) => {
        // simulate lastError
        // In the implementation: if (chrome.runtime.lastError) reject(...)
        // We need to mock chrome.runtime.lastError AND callback
        globalThis.chrome.runtime.lastError = { message: 'Remove failed' };
        if (typeof callback === 'function') {
          callback();
        }
        globalThis.chrome.runtime.lastError = null; // cleanup
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
    mockSet = jest.fn((data, callback) => callback?.());
    mockRemove = jest.fn();

    globalThis.chrome = {
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

    globalThis.URL.createObjectURL = jest.fn(() => 'blob:url');
    globalThis.URL.revokeObjectURL = jest.fn();

    storageManager = new StorageManager(mockUiManager);
    storageManager.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('previewSafeCleanup', () => {
    test('應生成清理預覽', async () => {
      mockGet.mockImplementation((_keys, sendResponse) =>
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

    test('應優雅處理無效的 URL 編碼 (URIError)', () => {
      const malformedUrl = 'https://example.com/search?q=%E0%A4';

      storageManager.cleanupPlan = {
        items: [
          {
            key: 'malformed_key',
            url: malformedUrl,
            size: 100,
            reason: 'test',
          },
        ],
        totalKeys: 1,
        spaceFreed: 100,
        deletedPages: 0,
      };

      // 應該不會拋出錯誤
      expect(() => {
        storageManager.displayCleanupPreview(storageManager.cleanupPlan);
      }).not.toThrow();

      // 驗證是否回退顯示原始 URL
      const previewText = storageManager.elements.cleanupPreview.textContent;
      expect(previewText).toContain(malformedUrl);
    });
  });

  describe('generateSafeCleanupPlan', () => {
    test('應生成清理計劃', async () => {
      mockGet.mockImplementation((_keys, sendResponse) =>
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
      mockGet.mockImplementation((_keys, sendResponse) =>
        sendResponse({
          highlights_page1: [{ text: 'valid', rangeInfo: {} }],
          config_theme: 'dark',
        })
      );

      const plan = await storageManager.generateSafeCleanupPlan(false);

      expect(plan.items).toHaveLength(0);
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

      mockRemove.mockImplementation(_keys => Promise.resolve());

      await storageManager.executeSafeCleanup();

      expect(mockRemove).toHaveBeenCalledWith(['old_key']);
    });
  });

  describe('updateUsageDisplay', () => {
    test('應更新 UI 元素', () => {
      const usage = {
        total: 5_242_880,
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
      expect(true).toBe(true); // Explicit assertion to satisfy jest/expect-expect
    });
  });

  describe('dataAnalysis', () => {
    test('應可存取統計數據', async () => {
      mockGet.mockImplementation((_keys, sendResponse) =>
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
      mockGet.mockImplementation((_keys, sendResponse) =>
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

// =========================================
// Merged from StorageManager_coverage.test.js
// =========================================
/**
 * StorageManager Branch Coverage Tests
 *
 * Focuses on uncovered branches and error paths in StorageManager.js
 */
describe('StorageManager Branch Coverage', () => {
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

    globalThis.chrome = {
      storage: {
        local: {
          get: jest.fn(),
          set: jest.fn(),
          remove: jest.fn(),
        },
      },
      runtime: {
        lastError: null,
        getManifest: jest.fn(() => ({ version: '1.0.0' })),
        sendMessage: jest.fn(),
      },
    };

    // Chrome API Mocks
    // 模擬真實的 Chrome Storage API 行為
    // API 簽名：get(keys?: string | string[] | object | null, callback?: function)
    // 覆寫全域 mock 為符合此處測試需求的行為
    mockGet = jest
      .spyOn(globalThis.chrome.storage.local, 'get')
      .mockImplementation((keys, callback) => {
        const emptyData = {};
        if (typeof callback === 'function') {
          callback(emptyData);
        }
        return Promise.resolve(emptyData);
      });
    mockSet = jest
      .spyOn(globalThis.chrome.storage.local, 'set')
      .mockImplementation((data, callback) => {
        if (typeof callback === 'function') {
          callback();
        }
        return Promise.resolve();
      });
    mockRemove = jest
      .spyOn(globalThis.chrome.storage.local, 'remove')
      .mockImplementation((keys, callback) => {
        if (typeof callback === 'function') {
          callback();
        }
        return Promise.resolve();
      });

    mockUiManager = { showStatus: jest.fn(), showDataStatus: jest.fn() };
    storageManager = new StorageManager(mockUiManager);
    storageManager.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    delete globalThis.chrome;
  });

  describe('updateUsageDisplay Branches', () => {
    test('usedMB > 50 且 <= 80 時應添加 warning 類', () => {
      const usage = {
        percentage: 60,
        usedMB: '60.00',
        pages: 10,
        highlights: 100,
        configs: 5,
        isUnlimited: false,
      };

      storageManager.updateUsageDisplay(usage);

      expect(storageManager.elements.usageFill.classList.contains('warning')).toBe(true);
      expect(storageManager.elements.usageFill.classList.contains('danger')).toBe(false);
    });

    test('usedMB <= 50 時應不加警告類', () => {
      const usage = {
        percentage: 30,
        usedMB: '30.00',
        pages: 5,
        highlights: 50,
        configs: 2,
        isUnlimited: false,
      };

      storageManager.updateUsageDisplay(usage);

      expect(storageManager.elements.usageFill.classList.contains('warning')).toBe(false);
      expect(storageManager.elements.usageFill.classList.contains('danger')).toBe(false);
    });

    test('如果 usageFill 不存在則應安全返回', () => {
      storageManager.elements.usageFill = null;
      expect(() => storageManager.updateUsageDisplay({})).not.toThrow();
    });
  });

  describe('showDataStatus Branches', () => {
    test('應拒絕不安全的 SVG 圖標 (Uncovered Line 920)', () => {
      const unsafeSvg = '<svg><script>alert(1)</script></svg>';
      storageManager.showDataStatus(`${unsafeSvg} 危險內容`, 'error');

      const iconSpan = storageManager.elements.dataStatus.querySelector('.status-icon');
      // 根據代碼邏輯，不安全的 SVG 會被過濾掉，然後因為 type='error'，會使用預設的錯誤圖標 (UI_ICONS.ERROR)
      // 所以這裡我們應該期望看到一個 iconSpan，而不是 null
      expect(iconSpan).not.toBeNull();
      // 驗證它是一個 span
      expect(iconSpan.tagName).toBe('SPAN');
      // 可以進一步驗證它包含預設錯誤圖標的特徵 (svg)
      expect(iconSpan.innerHTML).toContain('<svg');
    });

    test('應處理包含多行文本的消息 (\n)', () => {
      storageManager.showDataStatus('第一行\n第二行', 'info');

      const textSpan = storageManager.elements.dataStatus.querySelector('.status-text');
      expect(textSpan.innerHTML).toContain('第一行<br>第二行');
    });

    test('應正確處理由 Emoji 組成的圖標', () => {
      storageManager.showDataStatus('✅ 完成', 'success');

      const iconSpan = storageManager.elements.dataStatus.querySelector('.status-icon');
      expect(iconSpan.textContent).toBe('✅');
    });
  });

  describe('executeOptimization Branches', () => {
    test('沒有優化計劃時應提示錯誤 (Uncovered Lines 827-829)', async () => {
      storageManager.optimizationPlan = null;
      await storageManager.executeOptimization();

      expect(storageManager.elements.dataStatus.textContent).toContain('沒有重整計劃可執行');
    });

    test('不需要更新數據時應跳過 chrome.storage.local.set', async () => {
      storageManager.optimizationPlan = {
        canOptimize: true,
        keysToRemove: [],
        optimizedData: { key1: 'same' },
        spaceSaved: 100,
      };

      // 模擬 storage 中的數據與 optimizedData 相同
      mockGet.mockImplementation((key, respond) => {
        const mockData = { key1: 'same' };
        respond(mockData);
      });

      await storageManager.executeOptimization();

      expect(mockSet).not.toHaveBeenCalled();
    });

    test('chrome.storage.local.set 失敗時應丟出錯誤 (Uncovered Line 864)', async () => {
      storageManager.optimizationPlan = {
        canOptimize: true,
        keysToRemove: [],
        optimizedData: { key1: 'new' },
        spaceSaved: 100,
      };

      mockGet.mockImplementation((k, respond) => {
        const emptyData = {};
        respond(emptyData);
      });
      mockSet.mockImplementation((data, respond) => {
        globalThis.chrome.runtime.lastError = { message: 'Set error' };
        respond();
        globalThis.chrome.runtime.lastError = null;
      });

      await storageManager.executeOptimization();
      expect(Logger.error).toHaveBeenCalled();
    });
  });

  describe('generateSafeCleanupPlan Branches', () => {
    test('應處理檢測 Notion 頁面是否存在時的失敗情況', async () => {
      mockGet.mockImplementation((k, respond) => {
        const mockData = {
          saved_page1: { notionPageId: 'p1' },
        };
        respond(mockData);
      });

      jest.spyOn(globalThis.chrome.runtime, 'sendMessage').mockRejectedValue(new Error('API Down'));

      const plan = await storageManager.generateSafeCleanupPlan(true);

      expect(plan.items).toHaveLength(0);
      expect(Logger.error).toHaveBeenCalled();
    });

    test('當 Notion 頁面不存在時應僅清理保存狀態，保留本地標註', async () => {
      mockGet.mockImplementation((k, respond) => {
        const mockData = {
          saved_page1: { notionPageId: 'p1' },
          highlights_page1: [{ id: 'h1' }],
        };
        respond(mockData);
      });

      jest.spyOn(globalThis.chrome.runtime, 'sendMessage').mockResolvedValue({ exists: false });

      const plan = await storageManager.generateSafeCleanupPlan(true);

      // 只清理 saved_ 狀態，保留 highlights_（擴展允許未保存頁面標注）
      expect(plan.items.some(i => i.key === 'saved_page1')).toBe(true);
      expect(plan.items.some(i => i.key === 'highlights_page1')).toBe(false);
      expect(plan.deletedPages).toBe(1);
    });
  });

  describe('executeSafeCleanup Branches', () => {
    test('chrome.storage.local.remove 失敗時應丟出錯誤 (Line 626)', async () => {
      storageManager.cleanupPlan = {
        items: [{ key: 'k1', url: 'u1', size: 10, reason: 'r1' }],
        totalKeys: 1,
        spaceFreed: 10,
        deletedPages: 0,
      };

      mockRemove.mockImplementation((keys, respond) => {
        globalThis.chrome.runtime.lastError = { message: 'Remove failed' };
        respond();
        globalThis.chrome.runtime.lastError = null;
      });

      await storageManager.executeSafeCleanup();
      expect(Logger.error).toHaveBeenCalled();
      expect(storageManager.elements.dataStatus.textContent).toContain('清理失敗');
    });

    test('成功清理且包含已刪除頁面時應顯示完整訊息 (Line 639)', async () => {
      storageManager.cleanupPlan = {
        items: [{ key: 'k1', url: 'u1', size: 10, reason: 'r1' }],
        totalKeys: 1,
        spaceFreed: 10,
        deletedPages: 5,
      };

      mockRemove.mockImplementation((keys, respond) => {
        if (typeof respond === 'function') {
          respond();
        }
        return Promise.resolve();
      });
      // 模擬 updateStorageUsage 內部調用的 getStorageUsage
      mockGet.mockImplementation((k, respond) => {
        const emptyData = {};
        respond(emptyData);
      });

      await storageManager.executeSafeCleanup();

      expect(storageManager.elements.dataStatus.textContent).toContain('清理了 5 筆無效的殘留數據');
    });
  });

  describe('updateStorageUsage & setPreviewButtonLoading error paths', () => {
    test('updateStorageUsage 應處理按鈕缺失的情況', async () => {
      storageManager.elements.refreshUsageButton = null;
      await expect(storageManager.updateStorageUsage()).resolves.toBeUndefined();
    });

    test('setPreviewButtonLoading 應處理按鈕或文本缺失的情況', () => {
      storageManager.elements.previewCleanupButton = null;
      expect(() => storageManager.setPreviewButtonLoading(true)).not.toThrow();
    });

    test('StorageManager.getStorageUsage 應該處理 runtime.lastError', async () => {
      mockGet.mockImplementation((k, respond) => {
        globalThis.chrome.runtime.lastError = { message: 'Get fatal' };
        respond();
        globalThis.chrome.runtime.lastError = null;
      });
      await expect(StorageManager.getStorageUsage()).rejects.toEqual({ message: 'Get fatal' });
    });
  });

  describe('displayOptimizationPreview & Internal Helper Branches', () => {
    test('當 optimizationPreview 元素缺失時應安全返回 (Line 765)', () => {
      storageManager.elements.optimizationPreview = null;
      expect(() => storageManager.displayOptimizationPreview({ canOptimize: true })).not.toThrow();
    });

    test('當數據不需要優化時應顯示正確的 UI (Lines 771-790)', () => {
      const plan = {
        canOptimize: false,
        highlightPages: 10,
        totalHighlights: 50,
        originalSize: 1024,
      };
      storageManager.displayOptimizationPreview(plan);
      expect(storageManager.elements.optimizationPreview.innerHTML).toContain(
        '數據已經處於最佳狀態'
      );
    });

    test('generateOptimizationPlan 應識別大體積遷移數據 (Lines 727-729)', async () => {
      // 需要大於 1024 bytes
      const largeData = 'x'.repeat(2000);
      mockGet.mockImplementation((k, respond) => {
        const mockData = {
          migration_backup: largeData,
        };
        respond(mockData);
      });

      const plan = await StorageManager.generateOptimizationPlan();
      expect(plan.canOptimize).toBe(true);
      expect(plan.optimizations.some(opt => opt.includes('清理遷移數據'))).toBe(true);
    });

    test('generateOptimizationPlan 應識別數據碎片 (Lines 754-755)', async () => {
      mockGet.mockImplementation((k, respond) => {
        const mockData = {
          highlights_page1: { not_an_array: true },
        };
        respond(mockData);
      });

      const plan = await StorageManager.generateOptimizationPlan();
      expect(plan.canOptimize).toBe(true);
      expect(plan.optimizations.some(opt => opt.includes('修復數據碎片'))).toBe(true);
    });

    test('analyzeOptimization 當不可優化時應隱藏按鈕 (Lines 670-671)', async () => {
      mockGet.mockImplementation((k, respond) => {
        const mockData = {
          regular_config: 'value', // Covers line 722 as well
        };
        respond(mockData);
      });

      // 確保按鈕初始是顯示的，以便驗證它被隱藏
      storageManager.elements.executeOptimizationButton.style.display = 'inline-block';

      await storageManager.analyzeOptimization();

      expect(storageManager.optimizationPlan.canOptimize).toBe(false);
      expect(storageManager.elements.executeOptimizationButton.style.display).toBe('none');
    });
  });
});
