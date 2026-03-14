/**
 * StorageManager Unit Tests
 *
 * 對存儲管理模組的 UI 層（StorageManager.js）和數據邏輯層（storageDataUtils.js）進行測試
 */

import { StorageManager } from '../../../options/StorageManager';
import { sanitizeBackupData, getStorageHealthReport } from '../../../options/storageDataUtils';
import Logger from '../../../scripts/utils/Logger';
import fs from 'node:fs';
import path from 'node:path';

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

// ─── 共用 DOM 結構 ──────────────────────────────────────────────────────
/** 產生包含健康狀態 / 清理按鈕的完整 DOM */
function buildTestDom() {
  document.body.innerHTML = `
    <button id="export-data-button"></button>
    <button id="import-data-button"></button>
    <input type="file" id="import-data-file" />
    <div id="data-status"></div>
    <button id="refresh-usage-button"><span class="icon"></span><span class="button-text">刷新統計</span></button>
    <div id="usage-fill"></div>
    <div id="usage-percentage"></div>
    <div id="usage-details"></div>
    <div id="pages-count"></div>
    <div id="highlights-count"></div>
    <div id="config-count"></div>
    <output id="health-status"></output>
    <button id="execute-cleanup-button" style="display:none"></button>
  `;
}

// ─── 共用 Chrome API Mock ───────────────────────────────────────────────
function buildChromeMock(mockGet, mockSet, mockRemove) {
  return {
    storage: {
      local: {
        get: mockGet ?? jest.fn(),
        set:
          mockSet ??
          jest.fn((data, cb) => {
            cb?.();
            return Promise.resolve();
          }),
        remove: mockRemove ?? jest.fn(),
      },
    },
    runtime: {
      lastError: null,
      getManifest: jest.fn(() => ({ version: '2.0.0' })),
      sendMessage: jest.fn(),
    },
  };
}

// ─── 1. StorageManager — 主要 UI 層測試 ────────────────────────────────

describe('StorageManager', () => {
  let storageManager = null;
  let mockGet = null;
  let mockSet = null;
  let mockRemove = null;

  beforeEach(() => {
    buildTestDom();

    mockGet = jest.fn((keys, cb) => cb?.({}));
    mockSet = jest.fn((data, cb) => {
      cb?.();
      return Promise.resolve();
    });
    mockRemove = jest.fn((keys, cb) => cb?.());
    globalThis.chrome = buildChromeMock(mockGet, mockSet, mockRemove);

    globalThis.URL.createObjectURL = jest.fn(() => 'blob:url');
    globalThis.URL.revokeObjectURL = jest.fn();

    storageManager = new StorageManager({ showStatus: jest.fn() });
    storageManager.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    delete globalThis.chrome;
  });

  // ── 初始化 ────────────────────────────────────────────────────────────

  describe('init', () => {
    it('應正確初始化所有 DOM 元素引用', () => {
      expect(storageManager.elements.exportButton).toBeTruthy();
      expect(storageManager.elements.importButton).toBeTruthy();
      expect(storageManager.elements.healthStatus).toBeTruthy();
      expect(storageManager.elements.executeCleanupButton).toBeTruthy();
    });

    it('init 時應呼叫 updateStorageUsage', () => {
      expect(mockGet).toHaveBeenCalled();
    });
  });

  // ── exportData ────────────────────────────────────────────────────────

  describe('exportData', () => {
    it('應匯出 JSON 備份檔案並觸發下載', async () => {
      mockGet.mockImplementation((_keys, sendResponse) => {
        sendResponse({ key: 'value' });
      });

      const clickSpy = jest.fn();
      const originalCreateElement = document.createElement.bind(document);
      jest.spyOn(document, 'createElement').mockImplementation(tagName => {
        if (tagName === 'a') {
          return { click: clickSpy, href: '', download: '', remove: jest.fn() };
        }
        return originalCreateElement(tagName);
      });
      jest.spyOn(document.body, 'appendChild').mockImplementation(() => undefined);

      await storageManager.exportData();

      expect(mockGet).toHaveBeenCalled();
      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(clickSpy).toHaveBeenCalled();
      expect(Logger.error).not.toHaveBeenCalled();
    });

    it('應排除 OAuth 相關金鑰', async () => {
      const OriginalBlob = globalThis.Blob;
      globalThis.Blob = class TestBlob {
        constructor(parts = []) {
          this._text = parts.join('');
        }

        async text() {
          return this._text;
        }
      };

      mockGet.mockImplementation((_keys, sendResponse) => {
        sendResponse({
          notionAuthMode: 'oauth',
          notionOAuthToken: 'oauth_token_secret',
          notionRefreshToken: 'refresh_token_secret',
          page_abc: { notion: { pageId: 'page-1' }, highlights: [] },
        });
      });

      let exportedBlob = null;
      const clickSpy = jest.fn();
      const originalCreateElement = document.createElement.bind(document);
      jest.spyOn(globalThis.URL, 'createObjectURL').mockImplementation(blob => {
        exportedBlob = blob;
        return 'blob:url';
      });
      jest.spyOn(document, 'createElement').mockImplementation(tagName => {
        if (tagName === 'a') {
          return { click: clickSpy, href: '', download: '', remove: jest.fn() };
        }
        return originalCreateElement(tagName);
      });
      jest.spyOn(document.body, 'appendChild').mockImplementation(() => undefined);

      await storageManager.exportData();

      const text = await exportedBlob.text();
      const backup = JSON.parse(text);

      expect(backup.data).toEqual({ page_abc: { notion: { pageId: 'page-1' }, highlights: [] } });
      expect(backup.data).not.toHaveProperty('notionOAuthToken');

      globalThis.Blob = OriginalBlob;
    });

    it('匯出失敗時應記錄錯誤', async () => {
      mockGet.mockImplementation(() => {
        throw new Error('Export error');
      });
      await storageManager.exportData();
      expect(Logger.error).toHaveBeenCalled();
    });
  });

  // ── importData ────────────────────────────────────────────────────────

  describe('importData', () => {
    it('應匯入有效 JSON 備份', async () => {
      const mockContent = JSON.stringify({
        data: { 'page_test.com': { notion: null, highlights: [] } },
      });
      const event = { target: { files: [{ text: jest.fn().mockResolvedValue(mockContent) }] } };

      await storageManager.importData(event);

      expect(mockSet).toHaveBeenCalledWith({ 'page_test.com': { notion: null, highlights: [] } });
    });

    it('匯入時應忽略 OAuth 金鑰', async () => {
      const mockContent = JSON.stringify({
        data: {
          notionOAuthToken: 'oauth_token_secret',
          notionRefreshToken: 'refresh_token_secret',
          page_abc: { notion: { pageId: 'page-1' }, highlights: [] },
        },
      });
      const event = { target: { files: [{ text: jest.fn().mockResolvedValue(mockContent) }] } };

      await storageManager.importData(event);

      expect(mockSet).toHaveBeenCalledWith({
        page_abc: { notion: { pageId: 'page-1' }, highlights: [] },
      });
    });

    it('應拒絕備份數據為陣列格式', async () => {
      const event = {
        target: {
          files: [{ text: jest.fn().mockResolvedValue(JSON.stringify({ data: [] })) }],
        },
      };
      await storageManager.importData(event);
      expect(mockSet).not.toHaveBeenCalled();
      expect(storageManager.elements.dataStatus.className).toContain('error');
    });

    it('應拒絕備份數據為 null', async () => {
      const event = {
        target: {
          files: [{ text: jest.fn().mockResolvedValue(JSON.stringify({ data: null })) }],
        },
      };
      await storageManager.importData(event);
      expect(mockSet).not.toHaveBeenCalled();
      expect(Logger.error).toHaveBeenCalled();
    });

    it('匯入儲存失敗時應顯示錯誤', async () => {
      mockSet.mockRejectedValueOnce(new Error('Storage error'));
      const event = {
        target: {
          files: [
            { text: jest.fn().mockResolvedValue(JSON.stringify({ data: { page_test: {} } })) },
          ],
        },
      };

      await storageManager.importData(event);

      expect(Logger.error).toHaveBeenCalledWith(
        'Import failed',
        expect.objectContaining({
          action: 'import_backup',
          error: expect.objectContaining({ message: 'Storage error' }),
        })
      );
      expect(storageManager.elements.dataStatus.className).toContain('error');
    });
  });
});

// ─── 2. updateStorageUsage / updateUsageDisplay / updateHealthDisplay ──

describe('StorageManager — 使用量與健康狀態', () => {
  let storageManager = null;
  let mockGet = null;
  let mockRemove = null;

  beforeEach(() => {
    buildTestDom();

    mockGet = jest.fn();
    mockRemove = jest.fn((keys, cb) => cb?.());
    globalThis.chrome = buildChromeMock(
      mockGet,
      jest.fn((d, cb) => cb?.()),
      mockRemove
    );
    globalThis.URL.createObjectURL = jest.fn(() => 'blob:url');
    globalThis.URL.revokeObjectURL = jest.fn();

    storageManager = new StorageManager({ showStatus: jest.fn() });
    storageManager.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete globalThis.chrome;
  });

  // ── updateUsageDisplay ───────────────────────────────────────────────

  describe('updateUsageDisplay', () => {
    test('應正確更新 UI 百分比、頁面數、標注數', () => {
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

    test('usedMB > 100 時應顯示 error 等級警告', () => {
      const showDataStatusSpy = jest.spyOn(storageManager, 'showDataStatus');
      storageManager.updateUsageDisplay({
        total: 105 * 1024 * 1024,
        usedMB: '105.00',
        percentage: 95,
        pages: 100,
        highlights: 500,
        configs: 10,
        isUnlimited: true,
      });

      expect(showDataStatusSpy).toHaveBeenCalledWith(
        expect.stringContaining('數據量過大'),
        'error'
      );
    });

    test('usedMB > 80 (且 <= 100) 時應顯示 warning 等級警告', () => {
      const showDataStatusSpy = jest.spyOn(storageManager, 'showDataStatus');
      storageManager.updateUsageDisplay({
        total: 85 * 1024 * 1024,
        usedMB: '85.00',
        percentage: 85,
        pages: 80,
        highlights: 400,
        configs: 10,
        isUnlimited: true,
      });

      expect(showDataStatusSpy).toHaveBeenCalledWith(
        expect.stringContaining('數據量較大'),
        'warning'
      );
    });

    test('usedMB <= 50 時不應顯示警告', () => {
      const showDataStatusSpy = jest.spyOn(storageManager, 'showDataStatus');
      storageManager.updateUsageDisplay({
        percentage: 30,
        usedMB: '30.00',
        pages: 5,
        highlights: 50,
        configs: 2,
        isUnlimited: false,
      });

      expect(showDataStatusSpy).not.toHaveBeenCalled();
    });

    test('usageFill 不存在應安全返回', () => {
      storageManager.elements.usageFill = null;
      expect(() => storageManager.updateUsageDisplay({})).not.toThrow();
    });

    test('usedMB > 50 时應添加 warning 類', () => {
      storageManager.updateUsageDisplay({
        percentage: 60,
        usedMB: '60.00',
        pages: 10,
        highlights: 100,
        configs: 5,
        isUnlimited: false,
      });

      expect(storageManager.elements.usageFill.classList.contains('warning')).toBe(true);
      expect(storageManager.elements.usageFill.classList.contains('danger')).toBe(false);
    });
  });

  // ── updateHealthDisplay ──────────────────────────────────────────────

  describe('updateHealthDisplay', () => {
    /** 建立最小合法 report */
    const baseReport = () => ({
      corruptedData: [],
      migrationKeys: 0,
      migrationDataSize: 0,
      legacySavedKeys: 0,
      cleanupPlan: {
        items: [],
        totalKeys: 0,
        spaceFreed: 0,
        summary: { emptyRecords: 0, orphanRecords: 0, migrationLeftovers: 0, corruptedRecords: 0 },
      },
    });

    test('無問題時應顯示健康資訊並套用 health-ok 樣式', () => {
      storageManager.updateHealthDisplay(baseReport());

      const el = storageManager.elements.healthStatus;
      expect(el.classList.contains('health-ok')).toBe(true);
      expect(el.textContent).toContain('數據完整');
    });

    test('有損壞數據時應顯示錯誤資訊並套用 health-error 樣式', () => {
      const report = baseReport();
      report.corruptedData = ['page_bad.com'];

      storageManager.updateHealthDisplay(report);

      const el = storageManager.elements.healthStatus;
      expect(el.classList.contains('health-error')).toBe(true);
      expect(el.textContent).toContain('發現 1 個損壞的數據項');
    });

    test('有升級殘留時應顯示警告資訊並套用 health-warning 樣式', () => {
      const report = baseReport();
      report.migrationKeys = 3;
      report.migrationDataSize = 2048;

      storageManager.updateHealthDisplay(report);

      const el = storageManager.elements.healthStatus;
      expect(el.classList.contains('health-warning')).toBe(true);
      expect(el.textContent).toContain('個舊版格式升級殘留');
    });

    test('有舊版保存紀錄時應顯示提示（不影響主健康度）', () => {
      const report = baseReport();
      report.legacySavedKeys = 5;

      storageManager.updateHealthDisplay(report);

      const el = storageManager.elements.healthStatus;
      // 主狀態仍為 ok
      expect(el.classList.contains('health-ok')).toBe(true);
      // 但有舊版資訊行
      expect(el.textContent).toContain('個舊版網頁保存紀錄');
    });

    test('有可清理項目時應顯示清理摘要並顯示「執行清理」按鈕', () => {
      const report = baseReport();
      report.cleanupPlan = {
        items: [{ key: 'page_empty.com', size: 100, reason: '空記錄' }],
        totalKeys: 1,
        spaceFreed: 100,
        summary: { emptyRecords: 1, orphanRecords: 0, migrationLeftovers: 0, corruptedRecords: 0 },
      };

      storageManager.updateHealthDisplay(report);

      const btn = storageManager.elements.executeCleanupButton;
      expect(btn.style.display).toBe('inline-block');
      expect(storageManager.elements.healthStatus.textContent).toContain('可清理：1 個空記錄');
    });

    test('無可清理項目時應隱藏「執行清理」按鈕', () => {
      storageManager.updateHealthDisplay(baseReport());
      const btn = storageManager.elements.executeCleanupButton;
      expect(btn.style.display).toBe('none');
    });

    test('healthStatus 元素不存在時應安全返回', () => {
      storageManager.elements.healthStatus = null;
      expect(() => storageManager.updateHealthDisplay(baseReport())).not.toThrow();
    });
  });

  // ── updateStorageUsage ───────────────────────────────────────────────

  describe('updateStorageUsage', () => {
    test('refreshUsageButton 不存在時應安全返回', async () => {
      storageManager.elements.refreshUsageButton = null;
      await expect(storageManager.updateStorageUsage()).resolves.toBeUndefined();
    });

    test('呼叫後應更新 _lastHealthReport', async () => {
      mockGet.mockImplementation((keys, cb) =>
        cb({ 'page_a.com': { notion: { pageId: 'p1' }, highlights: [{ id: '1' }] } })
      );

      await storageManager.updateStorageUsage();

      expect(storageManager._lastHealthReport).toBeDefined();
      expect(storageManager._lastHealthReport.pages).toBeGreaterThan(0);
    });
  });
});

// ─── 3. executeUnifiedCleanup ──────────────────────────────────────────

describe('StorageManager — executeUnifiedCleanup', () => {
  let storageManager = null;
  let mockGet = null;
  let mockRemove = null;

  beforeEach(() => {
    buildTestDom();

    mockGet = jest.fn((keys, cb) => cb?.({}));
    mockRemove = jest.fn((keys, cb) => cb?.());
    globalThis.chrome = buildChromeMock(
      mockGet,
      jest.fn((d, cb) => cb?.()),
      mockRemove
    );
    globalThis.URL.createObjectURL = jest.fn(() => 'blob:url');
    globalThis.URL.revokeObjectURL = jest.fn();

    storageManager = new StorageManager({ showStatus: jest.fn() });
    storageManager.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete globalThis.chrome;
  });

  test('無清理計劃時應顯示「無可清理項目」提示', async () => {
    storageManager._lastHealthReport = null;
    await storageManager.executeUnifiedCleanup();
    expect(mockRemove).not.toHaveBeenCalled();
    expect(storageManager.elements.dataStatus.textContent).toContain('無可清理項目');
  });

  test('有清理計劃時應呼叫 chrome.storage.local.remove 並更新 UI', async () => {
    storageManager._lastHealthReport = {
      cleanupPlan: {
        items: [
          { key: 'page_empty.com', size: 100, reason: '空記錄' },
          { key: 'highlights_orphan.com', size: 50, reason: '孤兒資料' },
        ],
        totalKeys: 2,
        spaceFreed: 150,
        summary: { emptyRecords: 1, orphanRecords: 1, migrationLeftovers: 0, corruptedRecords: 0 },
      },
    };

    mockGet.mockImplementation((keys, cb) =>
      cb({
        'page_empty.com': { notion: null, highlights: [] },
        'highlights_orphan.com': [],
      })
    );
    mockRemove.mockImplementation((keys, cb) => cb?.());

    await storageManager.executeUnifiedCleanup();

    expect(mockRemove).toHaveBeenCalledWith(
      ['page_empty.com', 'highlights_orphan.com'],
      expect.any(Function)
    );
    // 完成後應刷新統計（_lastHealthReport 會重新設定）
    expect(mockGet).toHaveBeenCalled();
  });

  test('清理成功後應重新啟用執行清理按鈕', async () => {
    storageManager._lastHealthReport = {
      cleanupPlan: {
        items: [{ key: 'page_empty.com', size: 100, reason: '空記錄' }],
        totalKeys: 1,
        spaceFreed: 100,
        summary: { emptyRecords: 1, orphanRecords: 0, migrationLeftovers: 0, corruptedRecords: 0 },
      },
    };

    mockGet.mockImplementationOnce((keys, cb) =>
      cb({
        'page_empty.com': { notion: null, highlights: [] },
      })
    );

    const button = storageManager.elements.executeCleanupButton;
    const updateStorageUsageSpy = jest
      .spyOn(storageManager, 'updateStorageUsage')
      .mockResolvedValue(undefined);

    mockRemove.mockImplementation((keys, cb) => cb?.());

    await storageManager.executeUnifiedCleanup();

    expect(updateStorageUsageSpy).toHaveBeenCalled();
    expect(button.disabled).toBe(false);
  });

  test('chrome.storage.local.remove 失敗時應顯示錯誤', async () => {
    storageManager._lastHealthReport = {
      cleanupPlan: {
        items: [{ key: 'page_k1', size: 10, reason: 'r1' }],
        totalKeys: 1,
        spaceFreed: 10,
        summary: { emptyRecords: 0, orphanRecords: 0, migrationLeftovers: 0, corruptedRecords: 0 },
      },
    };

    mockGet.mockImplementationOnce((keys, cb) =>
      cb({
        page_k1: { notion: null, highlights: [] },
      })
    );

    mockRemove.mockImplementation((keys, cb) => {
      globalThis.chrome.runtime.lastError = { message: 'Remove failed' };
      cb?.();
      globalThis.chrome.runtime.lastError = null;
    });

    await storageManager.executeUnifiedCleanup();

    expect(Logger.error).toHaveBeenCalledWith(
      '執行統一清理失敗',
      expect.objectContaining({
        action: 'executeUnifiedCleanup',
        error: expect.anything(),
      })
    );
    expect(storageManager.elements.dataStatus.textContent).toContain('清理失敗');
  });

  test('清理流程的日誌應使用 zh-TW 訊息與 executeUnifiedCleanup action', async () => {
    storageManager._lastHealthReport = {
      cleanupPlan: {
        items: [{ key: 'page_empty.com', size: 100, reason: '空記錄' }],
        totalKeys: 1,
        spaceFreed: 100,
        summary: { emptyRecords: 1, orphanRecords: 0, migrationLeftovers: 0, corruptedRecords: 0 },
      },
    };

    mockGet.mockImplementationOnce((keys, cb) =>
      cb({
        'page_empty.com': { notion: null, highlights: [] },
      })
    );
    jest.spyOn(storageManager, 'updateStorageUsage').mockResolvedValue(undefined);
    mockRemove.mockImplementation((keys, cb) => cb?.());

    await storageManager.executeUnifiedCleanup();

    expect(Logger.start).toHaveBeenCalledWith(
      '開始執行統一清理',
      expect.objectContaining({
        action: 'executeUnifiedCleanup',
        operation: 'validateCleanupPlan',
      })
    );
    expect(Logger.success).toHaveBeenCalledWith(
      '統一清理完成',
      expect.objectContaining({
        action: 'executeUnifiedCleanup',
        result: 'success',
        removedCount: 1,
        freedBytes: expect.any(Number),
      })
    );
  });

  test('重新驗證後只應刪除最新清理計劃仍存在的 key', async () => {
    storageManager._lastHealthReport = {
      cleanupPlan: {
        items: [
          { key: 'page_empty.com', size: 100, reason: '空記錄' },
          { key: 'highlights_orphan.com', size: 50, reason: '孤兒資料' },
        ],
        totalKeys: 2,
        spaceFreed: 150,
        summary: { emptyRecords: 1, orphanRecords: 1, migrationLeftovers: 0, corruptedRecords: 0 },
      },
    };

    mockGet.mockImplementationOnce((keys, cb) =>
      cb({
        'highlights_orphan.com': [],
      })
    );
    mockRemove.mockImplementation((keys, cb) => cb?.());
    jest.spyOn(storageManager, 'updateStorageUsage').mockResolvedValue(undefined);

    await storageManager.executeUnifiedCleanup();

    expect(mockRemove).toHaveBeenCalledWith(['highlights_orphan.com'], expect.any(Function));
  });

  test('重新驗證後若無可刪 key，則不應呼叫 remove 且應更新健康顯示', async () => {
    storageManager._lastHealthReport = {
      cleanupPlan: {
        items: [{ key: 'page_empty.com', size: 100, reason: '空記錄' }],
        totalKeys: 1,
        spaceFreed: 100,
        summary: { emptyRecords: 1, orphanRecords: 0, migrationLeftovers: 0, corruptedRecords: 0 },
      },
    };

    mockGet.mockImplementationOnce((keys, cb) =>
      cb({
        'page_valid.com': { notion: { pageId: 'p1' }, highlights: [{ id: '1' }] },
      })
    );
    const updateHealthDisplaySpy = jest.spyOn(storageManager, 'updateHealthDisplay');
    const updateStorageUsageSpy = jest
      .spyOn(storageManager, 'updateStorageUsage')
      .mockResolvedValue(undefined);

    await storageManager.executeUnifiedCleanup();

    expect(mockRemove).not.toHaveBeenCalled();
    expect(updateStorageUsageSpy).not.toHaveBeenCalled();
    expect(updateHealthDisplaySpy).toHaveBeenCalled();
    expect(storageManager._lastHealthReport.cleanupPlan.totalKeys).toBe(0);
    expect(storageManager.elements.dataStatus.textContent).toContain('無可清理項目');
  });
});

// ─── 4. showDataStatus ────────────────────────────────────────────────

describe('StorageManager — showDataStatus', () => {
  let storageManager = null;

  beforeEach(() => {
    buildTestDom();
    globalThis.chrome = buildChromeMock(jest.fn((k, cb) => cb?.({})));
    globalThis.URL.createObjectURL = jest.fn(() => 'blob:url');
    globalThis.URL.revokeObjectURL = jest.fn();
    storageManager = new StorageManager({ showStatus: jest.fn() });
    storageManager.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete globalThis.chrome;
  });

  test('應正確顯示成功狀態與文字', () => {
    storageManager.showDataStatus('操作成功', 'success');
    expect(storageManager.elements.dataStatus.textContent).toBe('操作成功');
    expect(storageManager.elements.dataStatus.className).toContain('success');
  });

  test('應正確顯示錯誤狀態與文字', () => {
    storageManager.showDataStatus('發生錯誤', 'error');
    expect(storageManager.elements.dataStatus.textContent).toBe('發生錯誤');
    expect(storageManager.elements.dataStatus.className).toContain('error');
  });

  test('dataStatus 元素不存在時應安全返回', () => {
    storageManager.elements.dataStatus = null;
    expect(() => storageManager.showDataStatus('test', 'info')).not.toThrow();
  });

  test('應拒絕不安全的 SVG 並改用預設圖標', () => {
    const unsafeSvg = '<svg><script>alert(1)</script></svg>';
    storageManager.showDataStatus(`${unsafeSvg} 危險內容`, 'error');

    const iconSpan = storageManager.elements.dataStatus.querySelector('.status-icon');
    expect(iconSpan).not.toBeNull();
    // 不安全 SVG 被拒絕後，應回退到 type=error 的預設圖標（仍為 SVG）
    expect(iconSpan.innerHTML).toContain('<svg');
  });

  test('應處理包含換行的多行訊息', () => {
    storageManager.showDataStatus('第一行\n第二行', 'info');
    const textSpan = storageManager.elements.dataStatus.querySelector('.status-text');
    expect(textSpan.innerHTML).toContain('第一行<br>第二行');
  });

  test('應正確處理 Emoji 組成的圖標', () => {
    storageManager.showDataStatus('✅ 完成', 'success');
    const iconSpan = storageManager.elements.dataStatus.querySelector('.status-icon');
    expect(iconSpan.textContent).toBe('✅');
  });
});

// ─── 5. getStorageHealthReport ─────────────────────────────────────────

describe('getStorageHealthReport', () => {
  let mockGet = null;

  beforeEach(() => {
    mockGet = jest.fn();
    globalThis.chrome = buildChromeMock(mockGet);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete globalThis.chrome;
  });

  test('應回傳包含使用量、健康度、清理計劃的統一報告', async () => {
    mockGet.mockImplementation((k, cb) =>
      cb({
        'page_example.com': { notion: { pageId: 'p1' }, highlights: [{ id: '1' }] },
        notionApiKey: 'key',
      })
    );

    const report = await getStorageHealthReport();

    expect(report.pages).toBe(1);
    expect(report.highlights).toBe(1);
    expect(report.configs).toBeGreaterThan(0);
    expect(report.corruptedData).toEqual([]);
    expect(report.migrationKeys).toBe(0);
    expect(report.cleanupPlan).toBeDefined();
    expect(report.cleanupPlan.items).toBeDefined();
    expect(report.used).toBeGreaterThan(0);
  });

  test('有效頁面（有標注）不應進入清理計劃', async () => {
    mockGet.mockImplementation((k, cb) =>
      cb({
        'page_valid.com': { notion: { pageId: 'p1' }, highlights: [{ id: '1' }] },
      })
    );

    const report = await getStorageHealthReport();
    expect(report.cleanupPlan.totalKeys).toBe(0);
  });

  test('空 page_*（無標注且無 Notion 綁定）應進入清理計劃', async () => {
    mockGet.mockImplementation((k, cb) =>
      cb({
        'page_empty.com': { notion: null, highlights: [] },
      })
    );

    const report = await getStorageHealthReport();
    expect(report.cleanupPlan.summary.emptyRecords).toBe(1);
    expect(report.cleanupPlan.totalKeys).toBe(1);
    expect(report.cleanupPlan.items[0].key).toBe('page_empty.com');
  });

  test('損壞的 page_*（highlights 非陣列）應加入 corruptedData 並進入清理計劃', async () => {
    mockGet.mockImplementation((k, cb) =>
      cb({
        'page_bad.com': { highlights: 'not_an_array' },
      })
    );

    const report = await getStorageHealthReport();
    expect(report.corruptedData).toContain('page_bad.com');
    expect(report.pages).toBe(0);
    expect(report.highlights).toBe(0);
    expect(report.cleanupPlan.summary.corruptedRecords).toBe(1);
  });

  test('缺少 highlights 的 page_* 應視為損壞資料', async () => {
    mockGet.mockImplementation((k, cb) =>
      cb({
        'page_missing_highlights.com': { notion: { pageId: 'p1' } },
      })
    );

    const report = await getStorageHealthReport();

    expect(report.corruptedData).toContain('page_missing_highlights.com');
    expect(report.pages).toBe(0);
    expect(report.highlights).toBe(0);
    expect(report.cleanupPlan.summary.corruptedRecords).toBe(1);
  });

  test('migration_* key 應計入 migrationKeys 並加入清理計劃', async () => {
    mockGet.mockImplementation((k, cb) =>
      cb({
        migration_old_data: { someField: 'x' },
      })
    );

    const report = await getStorageHealthReport();
    expect(report.migrationKeys).toBe(1);
    expect(report.cleanupPlan.summary.migrationLeftovers).toBe(1);
  });

  test('saved_* key 應計入 legacySavedKeys（不影響清理計劃）', async () => {
    mockGet.mockImplementation((k, cb) =>
      cb({
        'saved_example.com': { notionPageId: 'p1' },
      })
    );

    const report = await getStorageHealthReport();
    expect(report.legacySavedKeys).toBe(1);
    // saved_* 為舊格式殘留，不直接進入清理計劃（由升級機制處理）
    expect(report.cleanupPlan.totalKeys).toBe(0);
  });

  test('孤兒 highlights_*（無對應頁面且無標注）應加入清理計劃', async () => {
    mockGet.mockImplementation((k, cb) =>
      cb({
        'highlights_orphan.com': [],
      })
    );

    const report = await getStorageHealthReport();
    expect(report.cleanupPlan.summary.orphanRecords).toBeGreaterThan(0);
    expect(report.cleanupPlan.items.some(i => i.key === 'highlights_orphan.com')).toBe(true);
  });

  test('損壞的 highlights_* 不應增加 pages 或 highlights，但仍應進入清理計劃', async () => {
    mockGet.mockImplementation((k, cb) =>
      cb({
        'highlights_bad.com': { highlights: 'not_an_array' },
      })
    );

    const report = await getStorageHealthReport();

    expect(report.pages).toBe(0);
    expect(report.highlights).toBe(0);
    expect(report.corruptedData).toContain('highlights_bad.com');
    expect(report.cleanupPlan.summary.corruptedRecords).toBe(1);
    expect(report.cleanupPlan.items.some(i => i.key === 'highlights_bad.com')).toBe(true);
  });

  test('無效的 url_alias:* 應加入清理計劃並計入 orphanRecords', async () => {
    mockGet.mockImplementation((k, cb) =>
      cb({
        'url_alias:https://example.com/bad': '',
      })
    );

    const report = await getStorageHealthReport();

    expect(report.corruptedData).toEqual([]);
    expect(report.cleanupPlan.summary.corruptedRecords).toBe(0);
    expect(report.cleanupPlan.summary.orphanRecords).toBe(1);
    expect(
      report.cleanupPlan.items.some(
        item =>
          item.key === 'url_alias:https://example.com/bad' && item.reason === '無效的 URL 別名'
      )
    ).toBe(true);
  });

  test('損壞的 page_* 不應遮蔽同 URL 的合法 highlights_* 計數', async () => {
    mockGet.mockImplementation((k, cb) =>
      cb({
        'page_stable.com': { notion: { pageId: 'p1' } },
        'highlights_stable.com': [{ id: '1' }, { id: '2' }],
      })
    );

    const report = await getStorageHealthReport();

    expect(report.corruptedData).toContain('page_stable.com');
    expect(report.pages).toBe(1);
    expect(report.highlights).toBe(2);
    expect(report.cleanupPlan.items.some(i => i.key === 'highlights_stable.com')).toBe(false);
  });

  test('損壞的 page_* 不應阻止空 highlights_* 被判定為孤兒', async () => {
    mockGet.mockImplementation((k, cb) =>
      cb({
        'page_orphan.com': { notion: { pageId: 'p1' } },
        'highlights_orphan.com': [],
      })
    );

    const report = await getStorageHealthReport();

    expect(report.corruptedData).toContain('page_orphan.com');
    expect(report.cleanupPlan.summary.orphanRecords).toBe(1);
    expect(report.cleanupPlan.items.some(i => i.key === 'highlights_orphan.com')).toBe(true);
  });

  test('有對應 page_* 的 highlights_* 不應計入孤兒', async () => {
    mockGet.mockImplementation((k, cb) =>
      cb({
        'page_example.com': { notion: { pageId: 'p1' }, highlights: [{ id: '1' }] },
        'highlights_example.com': [{ id: '2' }],
      })
    );

    const report = await getStorageHealthReport();
    // highlights_example.com 有對應的 page_example.com，不應視為孤兒
    expect(report.cleanupPlan.items.some(i => i.key === 'highlights_example.com')).toBe(false);
    // 計數去重：只計 page_example.com 的 1 個頁面 + 1 個標注
    expect(report.pages).toBe(1);
    expect(report.highlights).toBe(1);
  });

  test('chrome.runtime.lastError 時應 reject', async () => {
    mockGet.mockImplementation((k, cb) => {
      globalThis.chrome.runtime.lastError = { message: 'Storage error' };
      cb({});
      globalThis.chrome.runtime.lastError = null;
    });

    await expect(getStorageHealthReport()).rejects.toEqual({ message: 'Storage error' });
  });
});

// ─── 6. storageDataUtils 其他函數 ──────────────────────────────────────

describe('storageDataUtils — Legacy / 輔助函數', () => {
  let mockGet = null;

  beforeEach(() => {
    mockGet = jest.fn();
    globalThis.chrome = buildChromeMock(mockGet);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete globalThis.chrome;
  });

  // ── sanitizeBackupData ───────────────────────────────────────────────

  describe('sanitizeBackupData', () => {
    test('應保留 page_* key', () => {
      const result = sanitizeBackupData({ 'page_example.com': { notion: null, highlights: [] } });
      expect(Object.keys(result)).toContain('page_example.com');
    });

    test('應排除 OAuth 金鑰', () => {
      const result = sanitizeBackupData({
        notionOAuthToken: 'secret',
        notionRefreshToken: 'refresh',
        'page_example.com': { notion: null, highlights: [] },
      });
      expect(Object.keys(result)).not.toContain('notionOAuthToken');
      expect(Object.keys(result)).toContain('page_example.com');
    });

    test('應排除 migration_* key', () => {
      const result = sanitizeBackupData({
        'migration_completed_example.com': { done: true },
        page_x: { notion: null, highlights: [] },
      });
      expect(Object.keys(result)).not.toContain('migration_completed_example.com');
      expect(Object.keys(result)).toContain('page_x');
    });
  });
});

describe('options.html 結構', () => {
  test('health-status 應為 polite live region 的 output 標籤', () => {
    const htmlPath = path.resolve(__dirname, '../../../options/options.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toMatch(/<output[^>]*id="health-status"/);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
  });
});
