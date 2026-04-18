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
} from '../../../options/storageDataUtils';

function buildChromeMock(mockGet) {
  return {
    storage: {
      local: {
        get: mockGet ?? jest.fn(),
      },
    },
    runtime: {
      lastError: null,
    },
  };
}

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
