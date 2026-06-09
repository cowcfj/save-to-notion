/**
 * storageDataUtils Unit Tests
 *
 * 涵蓋：
 * - getAllLocalStorage（Promise 包裝、lastError 路徑）
 * - diffBackupData（新增/衝突/跳過分類、key 順序無關性）
 */

import {
  buildImportExecutionPlan,
  diffBackupData,
  getAllLocalStorage,
  getStorageHealthReport,
  MIGRATION_LEFTOVER_PREFIXES,
  sanitizeBackupData,
} from '../../../pages/options/storageDataUtils';
import { buildChromeMock } from '../../helpers/storageManagerTestHarness.js';

describe('storageDataUtils — getAllLocalStorage', () => {
  let mockGet = null;

  beforeEach(() => {
    mockGet = jest.fn();
    globalThis.chrome = buildChromeMock(mockGet);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete globalThis.chrome;
  });

  test('應以 null 參數呼叫 chrome.storage.local.get 並回傳完整快照', async () => {
    const snapshot = { page_a: { highlights: [] }, 'url_alias:x': 'y' };
    mockGet.mockImplementation((keys, cb) => {
      expect(keys).toBeNull();
      cb(snapshot);
    });

    await expect(getAllLocalStorage()).resolves.toEqual(snapshot);
  });

  test('chrome.runtime.lastError 時應 reject', async () => {
    mockGet.mockImplementation((_keys, cb) => {
      globalThis.chrome.runtime.lastError = { message: 'storage get failed' };
      cb({});
      globalThis.chrome.runtime.lastError = null;
    });

    await expect(getAllLocalStorage()).rejects.toEqual({ message: 'storage get failed' });
  });
});

describe('storageDataUtils — diffBackupData', () => {
  test('備份中有本地不存在的 key → 進入 newKeys', () => {
    const backup = { page_a: { highlights: [] } };
    const local = {};

    const diff = diffBackupData(backup, local);

    expect(diff.newKeys).toEqual({ page_a: { highlights: [] } });
    expect(diff.conflictKeys).toEqual({});
    expect(diff.skippedKeys).toEqual([]);
  });

  test('備份中有本地存在且內容相同的 key → 進入 skippedKeys', () => {
    const value = { highlights: [{ id: '1' }] };
    const backup = { page_a: value };
    const local = { page_a: { highlights: [{ id: '1' }] } };

    const diff = diffBackupData(backup, local);

    expect(diff.newKeys).toEqual({});
    expect(diff.conflictKeys).toEqual({});
    expect(diff.skippedKeys).toEqual(['page_a']);
  });

  test('備份中有本地存在但內容不同的 key → 進入 conflictKeys', () => {
    const backup = { page_a: { highlights: [{ id: '2' }] } };
    const local = { page_a: { highlights: [{ id: '1' }] } };

    const diff = diffBackupData(backup, local);

    expect(diff.newKeys).toEqual({});
    expect(diff.conflictKeys).toEqual({ page_a: { highlights: [{ id: '2' }] } });
    expect(diff.skippedKeys).toEqual([]);
  });

  test('物件 key 順序不同但內容相同 → 應判為 skippedKeys', () => {
    const backup = {
      page_a: { notion: { pageId: 'p1' }, highlights: [] },
    };
    const local = {
      page_a: { highlights: [], notion: { pageId: 'p1' } },
    };

    const diff = diffBackupData(backup, local);

    expect(diff.skippedKeys).toEqual(['page_a']);
    expect(diff.conflictKeys).toEqual({});
  });

  test('巢狀物件 key 順序不同但內容相同 → 應判為 skippedKeys', () => {
    const backup = {
      page_a: { notion: { pageId: 'p1', url: 'u' }, highlights: [] },
    };
    const local = {
      page_a: { highlights: [], notion: { url: 'u', pageId: 'p1' } },
    };

    expect(diffBackupData(backup, local).skippedKeys).toEqual(['page_a']);
  });

  test('混合場景：三類各自正確分類', () => {
    const backup = {
      page_new: { highlights: [] },
      page_same: { highlights: [{ id: '1' }] },
      page_diff: { highlights: [{ id: '2' }] },
    };
    const local = {
      page_same: { highlights: [{ id: '1' }] },
      page_diff: { highlights: [{ id: '1' }] },
      page_untouched: { highlights: [] },
    };

    const diff = diffBackupData(backup, local);

    expect(Object.keys(diff.newKeys)).toEqual(['page_new']);
    expect(Object.keys(diff.conflictKeys)).toEqual(['page_diff']);
    expect(diff.skippedKeys).toEqual(['page_same']);
  });

  test('空備份 → 全空結果', () => {
    const diff = diffBackupData({}, { page_a: { highlights: [] } });

    expect(diff.newKeys).toEqual({});
    expect(diff.conflictKeys).toEqual({});
    expect(diff.skippedKeys).toEqual([]);
  });

  test('本地為空 → 全進 newKeys', () => {
    const backup = {
      page_a: { highlights: [] },
      'url_alias:x': 'https://example.com',
    };
    const diff = diffBackupData(backup, {});

    expect(diff.newKeys).toEqual(backup);
    expect(diff.conflictKeys).toEqual({});
    expect(diff.skippedKeys).toEqual([]);
  });

  test('url_alias: 字串值比較 — 相同字串應 skipped，不同字串應 conflict', () => {
    const backup = {
      'url_alias:same': 'https://example.com',
      'url_alias:diff': 'https://example.com/v2',
    };
    const local = {
      'url_alias:same': 'https://example.com',
      'url_alias:diff': 'https://example.com/v1',
    };

    const diff = diffBackupData(backup, local);

    expect(diff.skippedKeys).toEqual(['url_alias:same']);
    expect(diff.conflictKeys).toEqual({ 'url_alias:diff': 'https://example.com/v2' });
  });

  test('陣列元素順序不同應視為 conflict（非排序後比對）', () => {
    const backup = { page_a: { highlights: [{ id: '1' }, { id: '2' }] } };
    const local = { page_a: { highlights: [{ id: '2' }, { id: '1' }] } };

    const diff = diffBackupData(backup, local);

    expect(diff.conflictKeys).toEqual(backup);
    expect(diff.skippedKeys).toEqual([]);
  });
});

describe('storageDataUtils — buildImportExecutionPlan', () => {
  test('overwrite-all 應移除 backup 外的本地白名單 key，且保留非備份類 key', () => {
    const sanitizedData = {
      page_a: { highlights: [{ id: '1' }] },
    };
    const localData = {
      page_a: { highlights: [{ id: '1' }] },
      'highlights_https://example.com/article': [{ id: 'legacy-1' }],
      notionOAuthToken: 'secret',
      themePreference: 'dark',
    };

    const plan = buildImportExecutionPlan('overwrite-all', sanitizedData, localData);

    // 優化後：相同內容不重寫，dataToWrite 只含變動項（此例為空）
    expect(plan.dataToWrite).toEqual({});
    expect(plan.keysToRemove).toEqual(['highlights_https://example.com/article']);
    expect(plan.effectiveNewCount).toBe(0);
    expect(plan.effectiveOverwriteCount).toBe(0);
    expect(plan.skipCount).toBe(1);
    expect(plan.hasWork).toBe(true);
  });

  test('overwrite-all 包含新增 + 衝突 + 需移除的 legacy key 時應正確分類', () => {
    const sanitizedData = {
      page_new: { highlights: [{ id: 'n1' }] },
      page_conflict: { highlights: [{ id: 'v2' }] },
    };
    const localData = {
      page_conflict: { highlights: [{ id: 'v1' }] },
      'highlights_https://legacy.example.com/x': [{ id: 'legacy-1' }],
      'saved_https://legacy.example.com/y': true,
    };

    const plan = buildImportExecutionPlan('overwrite-all', sanitizedData, localData);

    expect(plan.dataToWrite).toEqual({
      page_new: { highlights: [{ id: 'n1' }] },
      page_conflict: { highlights: [{ id: 'v2' }] },
    });
    expect(plan.keysToRemove).toEqual(
      expect.arrayContaining([
        'highlights_https://legacy.example.com/x',
        'saved_https://legacy.example.com/y',
      ])
    );
    expect(plan.keysToRemove).toHaveLength(2);
    expect(plan.effectiveNewCount).toBe(1);
    expect(plan.effectiveOverwriteCount).toBe(1);
    expect(plan.skipCount).toBe(0);
    expect(plan.hasWork).toBe(true);
  });

  test('new-only 僅有 conflicts 時應視為無需寫入，並把 conflicts 計入 conflictSkipCount（非 skipCount）', () => {
    const sanitizedData = {
      page_conflict: { highlights: [{ id: '2' }] },
    };
    const localData = {
      page_conflict: { highlights: [{ id: '1' }] },
    };

    const plan = buildImportExecutionPlan('new-only', sanitizedData, localData);

    expect(plan.dataToWrite).toEqual({});
    expect(plan.keysToRemove).toEqual([]);
    expect(plan.effectiveNewCount).toBe(0);
    expect(plan.effectiveOverwriteCount).toBe(0);
    // 語義區分：skipCount 只計 identical；conflict 被 new-only 跳過時計入 conflictSkipCount
    expect(plan.skipCount).toBe(0);
    expect(plan.conflictSkipCount).toBe(1);
    expect(plan.hasWork).toBe(false);
  });

  test('new-only 同時有 identical 與 conflicts 時應分別計入 skipCount / conflictSkipCount', () => {
    const sanitizedData = {
      page_same: { highlights: [{ id: '1' }] },
      page_conflict: { highlights: [{ id: '2' }] },
    };
    const localData = {
      page_same: { highlights: [{ id: '1' }] },
      page_conflict: { highlights: [{ id: '1' }] },
    };

    const plan = buildImportExecutionPlan('new-only', sanitizedData, localData);

    expect(plan.skipCount).toBe(1);
    expect(plan.conflictSkipCount).toBe(1);
    expect(plan.hasWork).toBe(false);
  });

  test('new-only 僅含新 key 時 dataToWrite 應等於 newKeys、hasWork 為 true', () => {
    const sanitizedData = {
      page_new_a: { highlights: [] },
      page_new_b: { highlights: [{ id: 'x' }] },
    };
    const localData = {};

    const plan = buildImportExecutionPlan('new-only', sanitizedData, localData);

    expect(plan.dataToWrite).toEqual(sanitizedData);
    expect(plan.keysToRemove).toEqual([]);
    expect(plan.effectiveNewCount).toBe(2);
    expect(plan.effectiveOverwriteCount).toBe(0);
    expect(plan.skipCount).toBe(0);
    expect(plan.hasWork).toBe(true);
  });

  test('new-and-overwrite 應合併 newKeys 與 conflictKeys', () => {
    const sanitizedData = {
      page_new: { highlights: [{ id: 'n1' }] },
      page_conflict: { highlights: [{ id: 'v2' }] },
      page_same: { highlights: [{ id: 's1' }] },
    };
    const localData = {
      page_conflict: { highlights: [{ id: 'v1' }] },
      page_same: { highlights: [{ id: 's1' }] },
    };

    const plan = buildImportExecutionPlan('new-and-overwrite', sanitizedData, localData);

    expect(plan.dataToWrite).toEqual({
      page_new: { highlights: [{ id: 'n1' }] },
      page_conflict: { highlights: [{ id: 'v2' }] },
    });
    expect(plan.keysToRemove).toEqual([]);
    expect(plan.effectiveNewCount).toBe(1);
    expect(plan.effectiveOverwriteCount).toBe(1);
    expect(plan.skipCount).toBe(1);
    expect(plan.hasWork).toBe(true);
  });

  test('未知模式應拋出 Error("Unknown import mode: ...")', () => {
    expect(() => buildImportExecutionPlan('unknown-mode', {}, {})).toThrow(
      'Unknown import mode: unknown-mode'
    );
  });
});

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
