/**
 * StorageManager Unit Tests
 *
 * 對存儲管理模組的 UI 層（StorageManager.js）和數據邏輯層（storageDataUtils.js）進行測試
 */

import { StorageManager } from '../../../options/StorageManager';
import {
  sanitizeBackupData,
  getStorageHealthReport,
  MIGRATION_LEFTOVER_PREFIXES,
} from '../../../options/storageDataUtils';
import Logger from '../../../scripts/utils/Logger';
import { URL_ALIAS_PREFIX } from '../../../scripts/config/shared/storage.js';
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
    <div id="cleanup-status" class="status-message mt-8"></div>
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

/**
 * 建立模擬的 file change event，並同時把真實 input 元素的 value 設為非空字串，
 * 讓 `importFile.value === ''` 的斷言能實際驗證「清除邏輯確實被執行」而非誤判為初始值。
 *
 * 注意：`HTMLInputElement[type=file]` 在 JSDOM 的 `value` 規範上只允許設為空字串，
 *      故使用 Object.defineProperty 重新定義為可讀寫以便覆寫初始值。
 */
function buildFileEvent(data) {
  const text = JSON.stringify({ data });
  const fileLike = { text: jest.fn().mockResolvedValue(text) };

  const input = document.querySelector('#import-data-file');
  if (input) {
    Object.defineProperty(input, 'value', {
      configurable: true,
      writable: true,
      value: String.raw`C:\fakepath\backup.json`,
    });
    Object.defineProperty(input, 'files', {
      configurable: true,
      writable: true,
      value: [fileLike],
    });
  }

  return { target: { files: [fileLike] } };
}

/** 從當前 dataStatus 抓取模式按鈕 */
function getModeButton(storageManager, mode) {
  return storageManager.elements.dataStatus.querySelector(`button[data-mode="${mode}"]`);
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
    it('選檔成功後應顯示 4 個模式按鈕（3 模式 + 取消）且不直接寫入', async () => {
      const event = buildFileEvent({ page_a: { notion: null, highlights: [] } });

      await storageManager.importData(event);

      expect(mockSet).not.toHaveBeenCalled();
      const buttons = storageManager.elements.dataStatus.querySelectorAll('button[data-mode]');
      expect(buttons).toHaveLength(4);
      expect(getModeButton(storageManager, 'overwrite-all')).toBeTruthy();
      expect(getModeButton(storageManager, 'new-only')).toBeTruthy();
      expect(getModeButton(storageManager, 'new-and-overwrite')).toBeTruthy();
      expect(getModeButton(storageManager, 'cancel')).toBeTruthy();
    });

    it('模式按鈕應套用專案設計系統的語意 class（避免未來回退成原生樣式）', async () => {
      await storageManager.importData(buildFileEvent({ page_a: { highlights: [] } }));

      // 破壞性操作必須是 danger；推薦操作是 primary；安全操作與取消是 secondary
      expect(getModeButton(storageManager, 'overwrite-all').classList.contains('btn-danger')).toBe(
        true
      );
      expect(
        getModeButton(storageManager, 'new-and-overwrite').classList.contains('btn-primary')
      ).toBe(true);
      expect(getModeButton(storageManager, 'new-only').classList.contains('btn-secondary')).toBe(
        true
      );
      expect(getModeButton(storageManager, 'cancel').classList.contains('btn-secondary')).toBe(
        true
      );

      // 模式選擇器應包在 .import-mode-panel 中，而非沿用 status-message.info
      expect(storageManager.elements.dataStatus.querySelector('.import-mode-panel')).toBeTruthy();
      expect(storageManager.elements.dataStatus.classList.contains('info')).toBe(false);
    });

    it('選檔時應過濾非白名單 key（OAuth/migration 等）', async () => {
      const event = buildFileEvent({
        notionOAuthToken: 'secret',
        migration_old: { x: 1 },
        page_abc: { notion: { pageId: 'p1' }, highlights: [] },
      });

      await storageManager.importData(event);

      // 選擇 overwrite-all 模式應只寫入白名單 key
      mockGet.mockImplementation((_keys, cb) => cb({}));
      getModeButton(storageManager, 'overwrite-all').click();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockSet).toHaveBeenCalledWith({
        page_abc: { notion: { pageId: 'p1' }, highlights: [] },
      });
      expect(mockSet.mock.calls[0][0]).not.toHaveProperty('notionOAuthToken');
      expect(mockSet.mock.calls[0][0]).not.toHaveProperty('migration_old');
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
      expect(storageManager.elements.importFile.value).toBe('');
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
      expect(storageManager.elements.importFile.value).toBe('');
    });

    it('讀檔/JSON parse 失敗時應走錯誤處理', async () => {
      const event = {
        target: { files: [{ text: jest.fn().mockResolvedValue('not-json') }] },
      };
      await storageManager.importData(event);
      expect(mockSet).not.toHaveBeenCalled();
      expect(Logger.error).toHaveBeenCalledWith(
        'Import failed',
        expect.objectContaining({ action: 'import_backup' })
      );
      expect(storageManager.elements.dataStatus.className).toContain('error');
      expect(storageManager.elements.importFile.value).toBe('');
    });

    describe('模式執行', () => {
      let setTimeoutSpy = null;

      beforeEach(() => {
        // 不用 fake timers + reload spy，因為 JSDOM 的 location.reload 是 non-configurable；
        // 改為觀察 setTimeout 是否以 2000ms 排程 reload 副作用。
        setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout').mockImplementation(() => 0);
      });

      afterEach(() => {
        setTimeoutSpy.mockRestore();
      });

      it('「overwrite-all」模式應以完整 sanitized 資料呼叫 set 並清 importFile', async () => {
        const backupData = {
          page_a: { notion: null, highlights: [{ id: '1' }] },
          page_b: { notion: { pageId: 'p' }, highlights: [] },
        };
        mockGet.mockImplementation((_keys, cb) => cb({ page_a: { notion: null, highlights: [] } }));

        await storageManager.importData(buildFileEvent(backupData));
        getModeButton(storageManager, 'overwrite-all').click();
        await Promise.resolve();
        await Promise.resolve();

        expect(mockSet).toHaveBeenCalledWith(backupData);
        expect(storageManager.elements.importFile.value).toBe('');

        // reload 副作用：setTimeout 以 2000ms 排程
        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
      });

      it('「overwrite-all」模式應移除 backup 中不存在的本地白名單 key', async () => {
        const backupData = {
          page_a: { notion: null, highlights: [{ id: '1' }] },
        };
        mockGet.mockImplementation((_keys, cb) =>
          cb({
            // 與備份內容不同 → 視為 conflict，需寫入
            page_a: { notion: null, highlights: [{ id: '0' }] },
            'highlights_https://example.com/article': [{ id: 'legacy-1' }],
            'url_alias:https://example.com/article': 'https://example.com/article',
          })
        );

        await storageManager.importData(buildFileEvent(backupData));
        getModeButton(storageManager, 'overwrite-all').click();
        await Promise.resolve();
        await Promise.resolve();

        expect(mockSet).toHaveBeenCalledWith(backupData);
        expect(mockRemove).toHaveBeenCalledWith([
          'highlights_https://example.com/article',
          'url_alias:https://example.com/article',
        ]);
      });

      it('「new-only」模式應只寫入 newKeys', async () => {
        const backupData = {
          page_same: { highlights: [{ id: '1' }] },
          page_conflict: { highlights: [{ id: '2' }] },
          page_new: { highlights: [] },
        };
        mockGet.mockImplementation((_keys, cb) =>
          cb({
            page_same: { highlights: [{ id: '1' }] },
            page_conflict: { highlights: [{ id: '1' }] },
          })
        );

        await storageManager.importData(buildFileEvent(backupData));
        getModeButton(storageManager, 'new-only').click();
        await Promise.resolve();
        await Promise.resolve();

        expect(mockSet).toHaveBeenCalledWith({ page_new: { highlights: [] } });
      });

      it('「new-only」模式的成功訊息應將覆蓋數顯示為 0', async () => {
        const backupData = {
          page_same: { highlights: [{ id: '1' }] },
          page_conflict: { highlights: [{ id: '2' }] },
          page_new: { highlights: [] },
        };
        mockGet.mockImplementation((_keys, cb) =>
          cb({
            page_same: { highlights: [{ id: '1' }] },
            page_conflict: { highlights: [{ id: '1' }] },
          })
        );

        await storageManager.importData(buildFileEvent(backupData));
        getModeButton(storageManager, 'new-only').click();
        await Promise.resolve();
        await Promise.resolve();

        expect(storageManager.elements.dataStatus.textContent).toContain('新增 1 項');
        expect(storageManager.elements.dataStatus.textContent).toContain('覆蓋 0 項');
        expect(storageManager.elements.dataStatus.textContent).toContain('跳過 2 項');
      });

      it('「new-only」模式僅有 conflicts 時應顯示衝突跳過訊息、不寫入、不 reload', async () => {
        const backupData = {
          page_conflict: { highlights: [{ id: '2' }] },
        };
        mockGet.mockImplementation((_keys, cb) =>
          cb({
            page_conflict: { highlights: [{ id: '1' }] },
          })
        );

        await storageManager.importData(buildFileEvent(backupData));
        getModeButton(storageManager, 'new-only').click();
        await Promise.resolve();
        await Promise.resolve();

        expect(mockSet).not.toHaveBeenCalled();
        expect(mockRemove).not.toHaveBeenCalled();
        expect(storageManager.elements.dataStatus.textContent).toContain('已跳過');
        expect(storageManager.elements.importFile.value).toBe('');
        expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 2000);
      });

      it('「new-and-overwrite」模式應寫入 newKeys + conflictKeys', async () => {
        const backupData = {
          page_same: { highlights: [{ id: '1' }] },
          page_conflict: { highlights: [{ id: '2' }] },
          page_new: { highlights: [] },
        };
        mockGet.mockImplementation((_keys, cb) =>
          cb({
            page_same: { highlights: [{ id: '1' }] },
            page_conflict: { highlights: [{ id: '1' }] },
          })
        );

        await storageManager.importData(buildFileEvent(backupData));
        getModeButton(storageManager, 'new-and-overwrite').click();
        await Promise.resolve();
        await Promise.resolve();

        expect(mockSet).toHaveBeenCalledWith({
          page_new: { highlights: [] },
          page_conflict: { highlights: [{ id: '2' }] },
        });
      });

      it('備份與本地完全一致時應顯示 IMPORT_NOTHING_TO_DO、不寫入、不 reload', async () => {
        const backupData = { page_same: { highlights: [{ id: '1' }] } };
        mockGet.mockImplementation((_keys, cb) => cb({ page_same: { highlights: [{ id: '1' }] } }));

        await storageManager.importData(buildFileEvent(backupData));
        getModeButton(storageManager, 'new-and-overwrite').click();
        await Promise.resolve();
        await Promise.resolve();

        expect(mockSet).not.toHaveBeenCalled();
        expect(storageManager.elements.dataStatus.textContent).toContain('無需匯入');
        expect(storageManager.elements.importFile.value).toBe('');

        expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 2000);
      });

      it('成功訊息應包含新增/覆蓋/跳過數字', async () => {
        const backupData = {
          page_same: { highlights: [{ id: '1' }] },
          page_conflict: { highlights: [{ id: '2' }] },
          page_new: { highlights: [] },
        };
        mockGet.mockImplementation((_keys, cb) =>
          cb({
            page_same: { highlights: [{ id: '1' }] },
            page_conflict: { highlights: [{ id: '1' }] },
          })
        );

        await storageManager.importData(buildFileEvent(backupData));
        getModeButton(storageManager, 'new-and-overwrite').click();
        await Promise.resolve();
        await Promise.resolve();

        const status = storageManager.elements.dataStatus.textContent;
        expect(status).toContain('新增');
        expect(status).toContain('1');
        expect(status).toContain('覆蓋');
        expect(status).toContain('跳過');
      });

      it('chrome.storage.local.set 丟錯時應走 IMPORT_FAILED 路徑、不 reload', async () => {
        const backupData = { page_new: { highlights: [] } };
        mockGet.mockImplementation((_keys, cb) => cb({}));
        mockSet.mockRejectedValueOnce(new Error('Storage error'));

        await storageManager.importData(buildFileEvent(backupData));
        getModeButton(storageManager, 'overwrite-all').click();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(Logger.error).toHaveBeenCalledWith(
          'Import failed',
          expect.objectContaining({
            action: 'import_backup',
            error: expect.objectContaining({ message: 'Storage error' }),
          })
        );
        expect(storageManager.elements.dataStatus.className).toContain('error');
        expect(storageManager.elements.importFile.value).toBe('');

        expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 2000);
      });

      it('set 成功但 remove 失敗時應記錄 "partial applied" 診斷日誌並報錯', async () => {
        const backupData = {
          page_new: { highlights: [{ id: '1' }] },
        };
        mockGet.mockImplementation((_keys, cb) =>
          cb({
            // 觸發 keysToRemove 非空，使 remove 被呼叫
            'highlights_https://legacy.example.com/a': [{ id: 'legacy-1' }],
          })
        );
        mockRemove.mockImplementationOnce(() => Promise.reject(new Error('remove failed')));

        await storageManager.importData(buildFileEvent(backupData));
        getModeButton(storageManager, 'overwrite-all').click();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        // set 成功：確實寫入新資料
        expect(mockSet).toHaveBeenCalledWith(backupData);
        // 明確標註 partial applied，供運維診斷
        expect(Logger.error).toHaveBeenCalledWith(
          expect.stringContaining('partially applied'),
          expect.objectContaining({
            action: 'import_backup',
            result: 'partial',
            writtenCount: 1,
            pendingRemoveCount: 1,
          })
        );
        // 最終仍走 IMPORT_FAILED 路徑
        expect(storageManager.elements.dataStatus.className).toContain('error');
      });

      it('importFile 引用不存在時，成功路徑仍應完成匯入', async () => {
        const backupData = { page_new: { highlights: [] } };
        mockGet.mockImplementation((_keys, cb) => cb({}));

        await storageManager.importData(buildFileEvent(backupData));
        storageManager.elements.importFile = null;
        getModeButton(storageManager, 'overwrite-all').click();
        await Promise.resolve();
        await Promise.resolve();

        expect(mockSet).toHaveBeenCalledWith(backupData);
        expect(storageManager.elements.dataStatus.className).toContain('success');
      });

      it('未知匯入模式應走集中式錯誤處理', async () => {
        const backupData = { page_new: { highlights: [] } };
        mockGet.mockImplementation((_keys, cb) => cb({}));

        await storageManager._executeImport('invalid-mode', backupData);

        expect(Logger.error).toHaveBeenCalledWith(
          'Import failed',
          expect.objectContaining({
            action: 'import_backup',
            error: expect.objectContaining({ message: 'Unknown import mode: invalid-mode' }),
          })
        );
        expect(storageManager.elements.dataStatus.className).toContain('error');
        expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 2000);
      });

      it('取消按鈕應清 importFile、顯示 IMPORT_CANCELED、不寫入、不 reload', async () => {
        const backupData = { page_a: { highlights: [] } };

        await storageManager.importData(buildFileEvent(backupData));
        getModeButton(storageManager, 'cancel').click();
        await Promise.resolve();

        expect(mockSet).not.toHaveBeenCalled();
        expect(storageManager.elements.dataStatus.textContent).toContain('已取消匯入');
        expect(storageManager.elements.importFile.value).toBe('');

        expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 2000);
      });
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

    // ── Health UI 真實性（Step 3：cleanupPlan.totalKeys > 0 不可顯示 HEALTH_OK）──

    test('有孤兒 / 空記錄可清理時，主狀態 MUST NOT 為 health-ok（應為 health-warning）', () => {
      const report = baseReport();
      report.cleanupPlan = {
        items: [{ key: `${URL_ALIAS_PREFIX}orphan`, size: 50, reason: '孤兒 URL 別名' }],
        totalKeys: 1,
        spaceFreed: 50,
        summary: { emptyRecords: 0, orphanRecords: 1, migrationLeftovers: 0, corruptedRecords: 0 },
      };

      storageManager.updateHealthDisplay(report);

      const el = storageManager.elements.healthStatus;
      expect(el.classList.contains('health-ok')).toBe(false);
      expect(el.classList.contains('health-warning')).toBe(true);
      expect(el.textContent).toContain('可清理項目');
    });

    test('無 cleanup 項目且無 migration/corrupted 時才可顯示 HEALTH_OK', () => {
      storageManager.updateHealthDisplay(baseReport());
      const el = storageManager.elements.healthStatus;
      expect(el.classList.contains('health-ok')).toBe(true);
      expect(el.textContent).toContain('數據完整');
    });

    test('有 corrupted 優先顯示 health-error，不被 cleanupPlan.totalKeys 覆蓋', () => {
      const report = baseReport();
      report.corruptedData = ['page_broken.com'];
      report.cleanupPlan = {
        items: [{ key: 'page_broken.com', size: 100, reason: '損壞的頁面數據' }],
        totalKeys: 1,
        spaceFreed: 100,
        summary: { emptyRecords: 0, orphanRecords: 0, migrationLeftovers: 0, corruptedRecords: 1 },
      };

      storageManager.updateHealthDisplay(report);

      const el = storageManager.elements.healthStatus;
      expect(el.classList.contains('health-error')).toBe(true);
      expect(el.classList.contains('health-warning')).toBe(false);
      expect(el.classList.contains('health-ok')).toBe(false);
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
    expect(storageManager.elements.cleanupStatus.textContent).toContain('無可清理項目');
    expect(storageManager.elements.dataStatus.textContent).not.toContain('無可清理項目');
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
    expect(storageManager.elements.cleanupStatus.textContent).toBeTruthy();
    expect(storageManager.elements.dataStatus.textContent).toBeFalsy();
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
    expect(storageManager.elements.cleanupStatus.textContent).toContain('清理失敗');
    expect(storageManager.elements.dataStatus.textContent).not.toContain('清理失敗');
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
    expect(storageManager.elements.cleanupStatus.textContent).toContain('無可清理項目');
    expect(storageManager.elements.dataStatus.textContent).not.toContain('無可清理項目');
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

  test('指定第三個參數時會保留既有佈局類別並替換狀態類別', () => {
    storageManager.elements.cleanupStatus.classList.add('warning');

    storageManager.showDataStatus('針對清理', 'success', 'cleanupStatus');

    expect(storageManager.elements.cleanupStatus.textContent).toBe('針對清理');
    expect(storageManager.elements.cleanupStatus.classList.contains('status-message')).toBe(true);
    expect(storageManager.elements.cleanupStatus.classList.contains('mt-8')).toBe(true);
    expect(storageManager.elements.cleanupStatus.classList.contains('success')).toBe(true);
    expect(storageManager.elements.cleanupStatus.classList.contains('warning')).toBe(false);
    expect(storageManager.elements.dataStatus.textContent).toBe('');
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

  test('migration_notion_* key 應優先視為 migration leftover 而非 config', async () => {
    mockGet.mockImplementation((k, cb) =>
      cb({
        migration_notion_old_data: { someField: 'x' },
      })
    );

    const report = await getStorageHealthReport();
    expect(report.migrationKeys).toBe(1);
    expect(report.configs).toBe(0);
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

  test('cleanup-status 應保留既有 class 並提供 polite status live region', () => {
    const htmlPath = path.resolve(__dirname, '../../../options/options.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toMatch(/<output[^>]*id="cleanup-status"/);
    expect(html).toMatch(/<output[^>]*id="cleanup-status"[^>]*class="status-message mt-8"/);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
  });

  test('destination-profile-status 應使用 output 標籤而非 status role', () => {
    const htmlPath = path.resolve(__dirname, '../../../options/options.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const status = doc.querySelector('#destination-profile-status');

    expect(status).not.toBeNull();
    expect(status.tagName).toBe('OUTPUT');
    expect(status.getAttribute('role')).toBeNull();
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');
  });

  test('Google Drive 雲端同步卡片應僅保留單一說明文案，描述備份與同步本地資料到雲端', () => {
    const htmlPath = path.resolve(__dirname, '../../../options/options.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('連接 Google Drive 後，可備份和同步你的本地資料到雲端。');
    expect(html).not.toContain('此登入用於 Google Drive 授權，用於備份和同步你的本地資料。');
  });

  test('Google Drive 自動備份 UI 應標示測試版，避免暗示完整背景雙向同步', () => {
    const htmlPath = path.resolve(__dirname, '../../../options/options.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('測試版');
    expect(html).toContain('自動備份頻率');
    expect(html).not.toContain('自動還原');
  });

  test('保存目標選擇器應位於手動 ID 輸入框之前', () => {
    const htmlPath = path.resolve(__dirname, '../../../options/options.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const selectorContainer = doc.querySelector('#database-selector-container');
    const manualIdInput = doc.querySelector('#database-id');

    expect(selectorContainer).not.toBeNull();
    expect(manualIdInput).not.toBeNull();
    expect(
      selectorContainer.compareDocumentPosition(manualIdInput) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  test('保存目標新增表單應將名稱獨立成行，選擇器與 ID 欄位並列成行', () => {
    const htmlPath = path.resolve(__dirname, '../../../options/options.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const nameRow = doc.querySelector('.destination-profile-name-row');
    const targetRow = doc.querySelector('.destination-target-row');
    const selectorColumn = doc.querySelector('.destination-target-select');
    const manualColumn = doc.querySelector('.destination-target-manual');
    const manualLabel = doc.querySelector('label[for="database-id"]');
    const helpText = doc.querySelector('.destination-target-help');

    expect(nameRow?.querySelector('#destination-profile-name')).not.toBeNull();
    expect(targetRow).not.toBeNull();
    expect(selectorColumn?.querySelector('#database-selector-container')).not.toBeNull();
    expect(manualColumn?.querySelector('#database-id')).not.toBeNull();
    expect(manualLabel?.classList.contains('sr-only')).toBe(false);
    expect(manualLabel?.textContent.trim()).toBe('或貼上 ID');
    expect(helpText?.textContent).toContain(
      '找不到目標時，可在「或貼上 ID」欄位輸入 Page ID 或 Database ID'
    );
    expect(helpText?.textContent).not.toContain('上方欄位');
  });
});

// ─── Migration Leftover 判定精確性測試（Step 4）────────────────────────

describe('MIGRATION_LEFTOVER_PREFIXES — registry 正確性與邊界', () => {
  test('registry 應包含 migration_ / _v1_ / _backup_ 等核心前綴', () => {
    expect(MIGRATION_LEFTOVER_PREFIXES).toContain('migration_');
    expect(MIGRATION_LEFTOVER_PREFIXES).toContain('_v1_');
    expect(MIGRATION_LEFTOVER_PREFIXES).toContain('_backup_');
  });

  test('真實遷移 key（migration_ 前綴）應命中 registry', () => {
    const migrationKey = 'migration_page_v1_data';
    const matched = MIGRATION_LEFTOVER_PREFIXES.some(p => migrationKey.startsWith(p));
    expect(matched).toBe(true);
  });

  test('一般業務 key 含 backup 字樣但非前綴時，不應命中 registry（防誤刪）', () => {
    // page_my-backup-notes：業務 key，backup 在中間不是前綴
    const businessKey = 'page_my-backup-notes';
    const matched = MIGRATION_LEFTOVER_PREFIXES.some(p => businessKey.startsWith(p));
    expect(matched).toBe(false);
  });

  test('一般業務 key 含 migration 字樣但非前綴時，不應命中 registry', () => {
    // highlights_post-migration-guide：業務 key，migration 在中間
    const businessKey = 'highlights_post-migration-guide';
    const matched = MIGRATION_LEFTOVER_PREFIXES.some(p => businessKey.startsWith(p));
    expect(matched).toBe(false);
  });

  test('一般業務 key 以正常前綴開頭且尾端含 _v1_ 時，不應命中 registry', () => {
    const businessKey = 'page_url_v1_';
    const matched = MIGRATION_LEFTOVER_PREFIXES.some(p => businessKey.startsWith(p));
    expect(matched).toBe(false);
  });

  test('空字串不應命中任何前綴', () => {
    const matched = MIGRATION_LEFTOVER_PREFIXES.some(p => ''.startsWith(p));
    expect(matched).toBe(false);
  });
});
