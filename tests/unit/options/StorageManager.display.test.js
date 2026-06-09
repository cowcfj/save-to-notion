import { StorageManager } from '../../../pages/options/StorageManager';
import { URL_ALIAS_PREFIX } from '../../../scripts/config/shared/storage.js';
import { UI_MESSAGES } from '../../../scripts/config/shared/messages.js';
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

describe('StorageManager — 使用量與健康狀態', () => {
  let storageManager = null;
  let mockGet = null;
  let mockRemove = null;

  beforeEach(() => {
    buildStorageManagerTestDom();

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
      expect(btn.classList.contains('hidden')).toBe(false);
      expect(storageManager.elements.healthStatus.textContent).toContain(
        UI_MESSAGES.STORAGE.CLEANUP_SUMMARY(
          [`1 ${UI_MESSAGES.STORAGE.CLEANUP_SUMMARY_EMPTY_RECORDS}`],
          '0.1'
        )
      );
    });

    test('無可清理項目時應隱藏「執行清理」按鈕', () => {
      storageManager.updateHealthDisplay(baseReport());
      const btn = storageManager.elements.executeCleanupButton;
      expect(btn.classList.contains('hidden')).toBe(true);
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

describe('StorageManager — showDataStatus', () => {
  let storageManager = null;

  beforeEach(() => {
    buildStorageManagerTestDom();
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
    expect(storageManager.elements.cleanupStatus.classList.contains('mt-sm')).toBe(true);
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
