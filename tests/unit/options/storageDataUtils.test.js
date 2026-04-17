/**
 * storageDataUtils Unit Tests
 *
 * 涵蓋：
 * - getAllLocalStorage（Promise 包裝、lastError 路徑）
 * - diffBackupData（新增/衝突/跳過分類、key 順序無關性）
 */

import { diffBackupData, getAllLocalStorage } from '../../../options/storageDataUtils';

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

  test('缺少 Array.prototype.toSorted 時仍應可判為 skippedKeys', () => {
    const backup = {
      page_a: { notion: { pageId: 'p1', url: 'u' }, highlights: [] },
    };
    const local = {
      page_a: { highlights: [], notion: { url: 'u', pageId: 'p1' } },
    };
    const originalToSorted = Array.prototype.toSorted;

    delete Array.prototype.toSorted;

    try {
      expect(diffBackupData(backup, local).skippedKeys).toEqual(['page_a']);
    } finally {
      if (originalToSorted) {
        Object.defineProperty(Array.prototype, 'toSorted', {
          value: originalToSorted,
          writable: true,
          configurable: true,
        });
      }
    }
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
