/**
 * @jest-environment jsdom
 */
/* global document */
import { jest } from '@jest/globals';
import { RUNTIME_ACTIONS } from '../../../scripts/config/shared/runtimeActions.js';
import { ERROR_MESSAGES, UI_MESSAGES } from '../../../scripts/config/shared/messages.js';

const mockConfirmDialog = jest.fn().mockResolvedValue(true);

const getConfirmDialogMock = () => mockConfirmDialog;

const mockScannerInstance = {
  scanStorage: jest.fn(),
};

const truncateMigrationUrl = (url, maxLength = 50) => {
  if (!url || typeof url !== 'string') {
    return '';
  }
  if (url.length <= maxLength) {
    return url;
  }
  return `${url.slice(0, Math.max(0, maxLength - 3))}...`;
};

const MockMigrationScanner = jest.fn().mockImplementation(() => mockScannerInstance);
MockMigrationScanner.truncateUrl = truncateMigrationUrl;
MockMigrationScanner.requestBatchMigration = jest.fn();

jest.unstable_mockModule('../../../pages/options/confirmDialog.js', () => ({
  confirmDialog: mockConfirmDialog,
}));
jest.unstable_mockModule('../../../pages/options/MigrationScanner.js', () => ({
  MigrationScanner: MockMigrationScanner,
}));

jest.mock('../../../pages/options/confirmDialog.js', () => ({
  confirmDialog: mockConfirmDialog,
}));
jest.mock('../../../pages/options/MigrationScanner.js', () => ({
  MigrationScanner: MockMigrationScanner,
}));

let MigrationTool;
let UIManager;
let MigrationScanner;

const renderMigrationToolDom = () => {
  document.body.innerHTML = `
    <button id="migration-scan-button"></button>
    <div id="scan-status"></div>
    <div id="migration-list" style="display: none">
      <div class="list-header">
        <label><input type="checkbox" id="migration-select-all" /> 全選</label>
        <span id="migration-selected-count">0 項</span>
      </div>
      <div id="migration-items" class="list-body"></div>
      <div class="list-actions">
        <button id="migration-execute-button" class="btn-primary" disabled>遷移</button>
        <button id="migration-delete-button" class="btn-danger" disabled>刪除</button>
      </div>
    </div>
    <div id="migration-progress" style="display: none">
      <div class="progress-bar">
        <div id="migration-progress-bar" class="progress-fill"></div>
      </div>
      <span id="migration-progress-text">0%</span>
    </div>
    <div id="migration-result"></div>
    <section id="pending-migration-section" style="display: none">
      <div id="pending-migration-list"></div>
    </section>
    <section id="failed-migration-section" style="display: none">
      <div id="failed-migration-list"></div>
    </section>
  `;
};

const installChromeRuntimeMock = () => {
  globalThis.chrome = {
    ...globalThis.chrome,
    runtime: {
      ...globalThis.chrome?.runtime,
      sendMessage: jest.fn().mockResolvedValue({
        success: true,
        items: [],
        failedItems: [],
      }),
    },
  };
};

const setupMigrationTool = () => {
  getConfirmDialogMock().mockReset();
  getConfirmDialogMock().mockResolvedValue(true);
  installChromeRuntimeMock();
  renderMigrationToolDom();

  const mockUiManager = new UIManager();
  mockUiManager.showStatus = jest.fn();

  mockScannerInstance.scanStorage.mockReset();
  MigrationScanner.requestBatchMigration = jest.fn();

  const migrationTool = new MigrationTool(mockUiManager);
  migrationTool.init();

  return {
    migrationTool,
    mockScanner: mockScannerInstance,
  };
};

const expectDeleteConfirmation = count => {
  expect(getConfirmDialogMock()).toHaveBeenCalledWith({
    title: UI_MESSAGES.STORAGE.MIGRATION_DELETE_CONFIRM_TITLE(count),
    message: UI_MESSAGES.STORAGE.MIGRATION_DELETE_CONFIRM_MESSAGE,
    confirmLabel: UI_MESSAGES.STORAGE.MIGRATION_DELETE_CONFIRM_OK,
    cancelLabel: UI_MESSAGES.STORAGE.MIGRATION_DELETE_CONFIRM_CANCEL,
    danger: true,
  });
};

beforeAll(async () => {
  const migrationToolModule = await import('../../../pages/options/MigrationTool.js');
  MigrationTool = migrationToolModule.MigrationTool;
  const uiManagerModule = await import('../../../pages/options/UIManager.js');
  UIManager = uiManagerModule.UIManager;
  const migrationScannerModule = await import('../../../pages/options/MigrationScanner.js');
  MigrationScanner = migrationScannerModule.MigrationScanner;
});

describe('MigrationTool', () => {
  let migrationTool = null;
  let mockScanner = null;

  beforeEach(() => {
    ({ migrationTool, mockScanner } = setupMigrationTool());
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.useRealTimers();
    jest.clearAllMocks();
    delete globalThis.chrome;
  });

  describe('scanForLegacyHighlights', () => {
    test('成功掃描並找到舊版標註', async () => {
      const mockResult = {
        needsMigration: true,
        legacyCount: 5,
        items: [
          { url: 'https://example.com', highlightCount: 3 },
          { url: 'https://test.com', highlightCount: 2 },
        ],
      };

      mockScanner.scanStorage.mockResolvedValueOnce(mockResult);

      await migrationTool.scanForLegacyHighlights();

      expect(mockScanner.scanStorage).toHaveBeenCalled();

      const scanStatus = document.querySelector('#scan-status');
      expect(scanStatus.innerHTML).toContain('2 個頁面');
      expect(scanStatus.innerHTML).toContain('5 個舊版標記');
    });

    test('掃描未發現舊版標註', async () => {
      const mockResult = {
        needsMigration: false,
        legacyCount: 0,
        items: [],
      };

      mockScanner.scanStorage.mockResolvedValueOnce(mockResult);

      await migrationTool.scanForLegacyHighlights();

      const scanStatus = document.querySelector('#scan-status');
      expect(scanStatus.textContent).toContain('未發現舊版格式');
    });

    test('處理掃描錯誤', async () => {
      mockScanner.scanStorage.mockRejectedValueOnce(new Error('Scan failed'));

      await migrationTool.scanForLegacyHighlights();

      const scanStatus = document.querySelector('#scan-status');
      expect(scanStatus.textContent).toContain('掃描錯誤');
      expect(scanStatus.textContent).toContain('發生未知錯誤');
    });
  });

  describe('renderMigrationList', () => {
    test('渲染遷移列表', () => {
      const items = [
        {
          url: 'https://very-long-example-url-to-test-truncation.com/path/to/page',
          highlightCount: 3,
        },
        { url: 'https://test.com', highlightCount: 2 },
      ];

      migrationTool.renderMigrationList(items);

      // 新版代碼將項目渲染到 #migration-items
      const migrationItems = document.querySelector('#migration-items');
      expect(migrationItems.innerHTML).toContain('3 個標註');
      expect(migrationItems.innerHTML).toContain('2 個標註');
      // 新版列表項目應包含 checkbox
      expect(migrationItems.innerHTML).toContain('type="checkbox"');
    });

    test('空列表顯示空狀態', () => {
      migrationTool.renderMigrationList([]);

      const migrationItems = document.querySelector('#migration-items');
      expect(migrationItems.innerHTML).toContain('沒有找到舊版數據');
    });
  });

  describe('truncateUrl (已移至 MigrationScanner.truncateUrl)', () => {
    test('截斷過長的 URL', () => {
      // MigrationTool.truncateUrl 已移除，UI 改用 MigrationScanner.truncateUrl(url, 60)
      const longUrl = 'https://example.com/very/long/path/to/some/resource/that/exceeds/the/limit';
      const truncated = MigrationScanner.truncateUrl(longUrl, 60);

      expect(truncated.length).toBeLessThanOrEqual(60);
      expect(truncated).toContain('...');
    });

    test('保留短 URL 不變', () => {
      const shortUrl = 'https://example.com';
      const result = MigrationScanner.truncateUrl(shortUrl, 60);

      expect(result).toBe(shortUrl);
    });
  });
});

describe('MigrationTool Extended', () => {
  let migrationTool = null;
  let mockScanner = null;

  beforeEach(() => {
    ({ migrationTool, mockScanner } = setupMigrationTool());
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    delete globalThis.chrome;
  });

  describe('init extended', () => {
    test('應初始化所有元素', () => {
      expect(migrationTool.elements.scanButton).toBeTruthy();
      expect(migrationTool.elements.migrationList).toBeTruthy();
      expect(migrationTool.elements.executeButton).toBeTruthy();
    });

    test('應設置事件監聽器', () => {
      const scanButton = document.querySelector('#migration-scan-button');
      expect(scanButton).toBeTruthy();
    });
  });

  describe('edge cases', () => {
    test('空掃描結果應正確處理', async () => {
      mockScanner.scanStorage.mockResolvedValueOnce({
        needsMigration: false,
        legacyCount: 0,
        items: [],
      });

      await migrationTool.scanForLegacyHighlights();

      const migrationList = document.querySelector('#migration-list');
      expect(migrationList.style.display).toBe('none');
    });

    test('多次渲染應清除舊內容', () => {
      const items1 = [{ url: 'https://first.com', highlightCount: 1 }];
      const items2 = [{ url: 'https://second.com', highlightCount: 2 }];

      migrationTool.renderMigrationList(items1);
      migrationTool.renderMigrationList(items2);

      const migrationItems = document.querySelector('#migration-items');
      expect(migrationItems.innerHTML).not.toContain('first.com');
      expect(migrationItems.innerHTML).toContain('second.com');
    });

    test('大量項目渲染測試', () => {
      const items = Array.from({ length: 20 }, (_, i) => ({
        url: `https://example${i}.com`,
        highlightCount: i + 1,
      }));

      migrationTool.renderMigrationList(items);

      const migrationItems = document.querySelector('#migration-items');
      expect(migrationItems.innerHTML).toContain('example0.com');
      expect(migrationItems.innerHTML).toContain('example19.com');
    });
  });

  describe('performSelectedDeletion', () => {
    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    test.each([
      {
        name: 'full success response 應顯示 success box 與刪除數量',
        urls: ['https://example.com/one', 'https://example.com/two'],
        results: { success: 2, failed: 0, total: 2, details: [] },
        verifyResult: migrationResult => {
          expect(migrationResult.querySelector('.success-box')).toBeTruthy();
          expect(migrationResult.querySelector('.warning-box')).toBeNull();
          expect(migrationResult.textContent).toContain('刪除成功');
          expect(migrationResult.textContent).toContain('已刪除 2 個頁面的舊版標註數據');
        },
      },
      {
        name: 'partial response 應顯示 warning 文案與成功失敗計數',
        urls: ['https://example.com/one', 'https://example.com/two', 'https://example.com/three'],
        results: { success: 2, failed: 1, total: 3, details: [] },
        verifyResult: migrationResult => {
          expect(migrationResult.querySelector('.warning-box')).toBeTruthy();
          expect(migrationResult.textContent).toContain(
            UI_MESSAGES.STORAGE.MIGRATION_DELETE_PARTIAL_COMPLETE
          );
          expect(migrationResult.textContent).toContain(
            ERROR_MESSAGES.PATTERNS.MIGRATION_BATCH_DELETE_PARTIAL_FAILURE
          );
          expect(migrationResult.textContent).toContain(
            UI_MESSAGES.STORAGE.MIGRATION_DELETE_RESULT_SUMMARY(2, 1, 3)
          );
        },
      },
      {
        name: 'full failure response 應顯示刪除失敗標題與失敗計數',
        urls: ['https://example.com/one', 'https://example.com/two'],
        results: { success: 0, failed: 2, total: 2, details: [] },
        verifyResult: migrationResult => {
          expect(migrationResult.querySelector('.warning-box')).toBeTruthy();
          expect(migrationResult.textContent).toContain(
            UI_MESSAGES.STORAGE.MIGRATION_DELETE_FAILED
          );
          expect(migrationResult.textContent).toContain(
            ERROR_MESSAGES.PATTERNS.MIGRATION_BATCH_DELETE_PARTIAL_FAILURE
          );
          expect(migrationResult.textContent).toContain(
            UI_MESSAGES.STORAGE.MIGRATION_DELETE_RESULT_SUMMARY(0, 2, 2)
          );
        },
      },
    ])('$name', async ({ urls, results, verifyResult }) => {
      expect.hasAssertions();
      jest.useFakeTimers();
      getConfirmDialogMock().mockResolvedValueOnce(true);
      jest.spyOn(migrationTool, 'scanForLegacyHighlights').mockResolvedValue();

      chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        results,
      });

      migrationTool.selectedUrls = new Set(urls);

      await migrationTool.performSelectedDeletion();

      expectDeleteConfirmation(urls.length);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.MIGRATION_BATCH_DELETE,
        urls,
      });
      expect(migrationTool.selectedUrls.size).toBe(0);

      const migrationResult = document.querySelector('#migration-result');
      verifyResult(migrationResult);

      jest.runOnlyPendingTimers();
      expect(migrationTool.scanForLegacyHighlights).toHaveBeenCalled();
    });

    test('使用者取消刪除確認時不應送出批次刪除 request', async () => {
      getConfirmDialogMock().mockResolvedValueOnce(false);
      migrationTool.selectedUrls = new Set(['https://example.com/one']);

      await migrationTool.performSelectedDeletion();

      expectDeleteConfirmation(1);

      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: RUNTIME_ACTIONS.MIGRATION_BATCH_DELETE })
      );
    });
  });

  describe('performSelectedMigration', () => {
    beforeEach(() => {
      chrome.runtime.sendMessage.mockClear();
    });

    test('no selection 應不呼叫 chrome.runtime.sendMessage', async () => {
      migrationTool.selectedUrls = new Set();
      await migrationTool.performSelectedMigration();
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    test('success response 應送出正確 action 且顯示 success result，清空 selectedUrls，dispatch storageUsageUpdate', async () => {
      jest.spyOn(migrationTool, 'showBatchMigrationResult').mockImplementation(() => {});
      const dispatchSpy = jest.spyOn(document, 'dispatchEvent');

      chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        results: {
          success: 2,
          failed: 0,
          total: 2,
          details: [],
        },
      });

      migrationTool.selectedUrls = new Set(['https://example.com/one', 'https://example.com/two']);

      await migrationTool.performSelectedMigration();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.MIGRATION_BATCH,
        urls: ['https://example.com/one', 'https://example.com/two'],
      });
      expect(migrationTool.showBatchMigrationResult).toHaveBeenCalledWith({
        success: 2,
        failed: 0,
        total: 2,
        details: [],
      });
      expect(migrationTool.selectedUrls.size).toBe(0);
      expect(dispatchSpy).toHaveBeenCalledWith(expect.any(CustomEvent));
      // 驗證任一 dispatch 包含正確的 event type，而非假設順序
      const storageUpdateCalls = dispatchSpy.mock.calls.filter(
        call => call[0]?.type === 'storageUsageUpdate'
      );
      expect(storageUpdateCalls.length).toBeGreaterThan(0);

      dispatchSpy.mockRestore();
    });

    test('unsuccessful response 應顯示錯誤，且保留 selected state 以便重試', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({
        success: false,
        error: '測試遷移失敗',
      });

      migrationTool.selectedUrls = new Set(['https://example.com/one', 'https://example.com/two']);

      await migrationTool.performSelectedMigration();

      const migrationResult = document.querySelector('#migration-result');
      expect(migrationResult.textContent).toContain('測試遷移失敗');
      expect(migrationTool.selectedUrls.size).toBe(2);
    });

    test('thrown error 應經 sanitize/format 後顯示，並執行 cleanup', async () => {
      chrome.runtime.sendMessage.mockRejectedValue(new Error('Network error'));

      migrationTool.selectedUrls = new Set(['https://example.com/one']);

      await migrationTool.performSelectedMigration();

      const migrationResult = document.querySelector('#migration-result');
      // 驗證顯示完整的使用者友善錯誤訊息（經 sanitizeApiError + ErrorHandler.formatUserMessage 處理）
      // 'Network error' → sanitizeApiError → 'NETWORK_ERROR' → formatUserMessage → 實際中文訊息
      // showErrorResult 會在前面加上 " 操作失敗"（含前導空格來自 icon）
      expect(migrationResult.textContent).toBe(' 操作失敗網路連線異常，請檢查網路後重試');
      expect(migrationTool.elements.progressContainer.style.display).toBe('none');
    });
  });

  describe('truncateUrl extended (委託 MigrationScanner)', () => {
    test('應處理空 URL', () => {
      const result = MigrationScanner.truncateUrl('', 60);
      expect(result).toBe('');
    });

    test('應處理臨界長度', () => {
      const url = 'a'.repeat(60);
      const result = MigrationScanner.truncateUrl(url, 60);
      expect(result).toHaveLength(60);
    });
  });

  describe('truncateUrl rendering coverage', () => {
    test.each([
      {
        name: 'showBatchMigrationResult 應透過 MigrationScanner.truncateUrl 渲染成功項目 URL',
        url: 'https://example.com/success',
        render: () =>
          migrationTool.showBatchMigrationResult({
            success: 1,
            details: [
              {
                status: 'success',
                url: 'https://example.com/success',
                count: 2,
                pending: 1,
              },
            ],
          }),
        getRenderedText: () => document.querySelector('#migration-result').textContent,
      },
      {
        name: 'renderPendingList 應透過 MigrationScanner.truncateUrl 渲染待完成 URL',
        url: 'https://example.com/pending',
        render: () =>
          migrationTool.renderPendingList([
            {
              url: 'https://example.com/pending',
              totalCount: 3,
              pendingCount: 1,
            },
          ]),
        getRenderedText: () => document.querySelector('#pending-migration-list').textContent,
      },
      {
        name: 'renderFailedList 應透過 MigrationScanner.truncateUrl 渲染失敗 URL',
        url: 'https://example.com/failed',
        render: () =>
          migrationTool.renderFailedList([
            {
              url: 'https://example.com/failed',
              totalCount: 3,
              failedCount: 2,
            },
          ]),
        getRenderedText: () => document.querySelector('#failed-migration-list').textContent,
      },
    ])('$name', ({ url, render, getRenderedText }) => {
      expect.hasAssertions();
      const truncateSpy = jest
        .spyOn(MigrationScanner, 'truncateUrl')
        .mockImplementation((url, maxLength) => `cut(${url},${maxLength})`);

      render();

      expect(truncateSpy).toHaveBeenCalledWith(url, 60);
      expect(getRenderedText()).toContain(`cut(${url},60)`);
      truncateSpy.mockRestore();
    });
  });
});
