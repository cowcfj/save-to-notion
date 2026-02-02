/**
 * StorageManager Branch Coverage Tests
 *
 * Focuses on uncovered branches and error paths in StorageManager.js
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

    // Chrome API Mocks
    // 模擬真實的 Chrome Storage API 行為
    // API 簽名：get(keys?: string | string[] | object | null, callback?: function)
    mockGet = jest.fn().mockImplementation((keys, callback) => {
      const emptyData = {};
      // 真實 API 中，callback 永遠是第二個參數
      if (typeof callback === 'function') {
        callback(emptyData);
      }
      // 返回 Promise 以支持 async/await 模式
      return Promise.resolve(emptyData);
    });
    mockSet = jest.fn().mockImplementation((data, callback) => {
      if (typeof callback === 'function') {
        callback();
      }
      return Promise.resolve();
    });
    mockRemove = jest.fn().mockImplementation((keys, callback) => {
      if (typeof callback === 'function') {
        callback();
      }
      return Promise.resolve();
    });

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
        sendMessage: jest.fn(),
      },
    };

    mockUiManager = { showStatus: jest.fn(), showDataStatus: jest.fn() };
    storageManager = new StorageManager(mockUiManager);
    storageManager.init();
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
        global.chrome.runtime.lastError = { message: 'Set error' };
        respond();
        global.chrome.runtime.lastError = null;
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

      global.chrome.runtime.sendMessage.mockRejectedValue(new Error('API Down'));

      const plan = await storageManager.generateSafeCleanupPlan(true);

      expect(plan.items.length).toBe(0);
      expect(Logger.error).toHaveBeenCalled();
    });

    test('當 Notion 頁面不存在時應將該頁面及其標註加入清理清單', async () => {
      mockGet.mockImplementation((k, respond) => {
        const mockData = {
          saved_page1: { notionPageId: 'p1' },
          highlights_page1: [{ id: 'h1' }],
        };
        respond(mockData);
      });

      global.chrome.runtime.sendMessage.mockResolvedValue({ exists: false });

      const plan = await storageManager.generateSafeCleanupPlan(true);

      expect(plan.items.some(i => i.key === 'saved_page1')).toBe(true);
      expect(plan.items.some(i => i.key === 'highlights_page1')).toBe(true);
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
        global.chrome.runtime.lastError = { message: 'Remove failed' };
        respond();
        global.chrome.runtime.lastError = null;
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

      mockRemove.mockImplementation((keys, respond) => respond());
      // 模擬 updateStorageUsage 內部調用的 getStorageUsage
      mockGet.mockImplementation((k, respond) => {
        const emptyData = {};
        respond(emptyData);
      });

      await storageManager.executeSafeCleanup();

      expect(storageManager.elements.dataStatus.textContent).toContain(
        '清理了 5 個已刪除頁面的數據'
      );
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
        global.chrome.runtime.lastError = { message: 'Get fatal' };
        respond();
        global.chrome.runtime.lastError = null;
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
