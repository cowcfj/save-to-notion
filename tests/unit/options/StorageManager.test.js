import { StorageManager } from '../../../pages/options/StorageManager';
import Logger from '../../../scripts/utils/Logger';
import {
  installBlobPolyfill,
  buildStorageManagerTestDom,
  buildChromeMock,
  buildFileEvent,
  getModeButton,
} from '../../helpers/storageManagerTestHarness.js';

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
installBlobPolyfill();

// ─── 1. StorageManager — 主要 UI 層測試 ────────────────────────────────

describe('StorageManager', () => {
  let storageManager = null;
  let mockGet = null;
  let mockSet = null;
  let mockRemove = null;

  beforeEach(() => {
    buildStorageManagerTestDom();

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

// ─── 3. executeUnifiedCleanup ──────────────────────────────────────────

// ─── 4. showDataStatus ────────────────────────────────────────────────

// ─── 5. getStorageHealthReport ─────────────────────────────────────────

// ─── 6. storageDataUtils 其他函數 ──────────────────────────────────────

// ─── Migration Leftover 判定精確性測試（Step 4）────────────────────────
