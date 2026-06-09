import { StorageManager } from '../../../pages/options/StorageManager';
import Logger from '../../../scripts/utils/Logger';
import {
  buildChromeMock,
  buildStorageManagerTestDom,
  installBlobPolyfill,
} from '../../helpers/storageManagerTestHarness.js';

jest.mock('../../../scripts/utils/Logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  start: jest.fn(),
  finish: jest.fn(),
  success: jest.fn(),
}));

installBlobPolyfill();

describe('StorageManager — executeUnifiedCleanup', () => {
  let storageManager = null;
  let mockGet = null;
  let mockRemove = null;

  beforeEach(() => {
    buildStorageManagerTestDom();

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
