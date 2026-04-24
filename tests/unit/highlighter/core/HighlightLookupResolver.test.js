/**
 * HighlightLookupResolver 單元測試
 *
 * 覆蓋計劃 §11 Phase 3 的 contract matrix 情境：
 * - page_<stable> hit
 * - page_<stable> miss + page_<original> hit
 * - page_* miss + highlights_<original> hit
 * - alias 存在但指向空 stable key
 * - alias 污染或非法值
 * - 同一 canonical page 同時存在 page_<stable> 與 page_<original>
 * - page_* 損壞但 highlights_* 合法
 * - save / clear / delete 後 legacy cleanup 是否正確
 */

import {
  resolveKeys,
  getAliasLookupKeys,
  pickAliasCandidate,
  isValidAliasCandidate,
  pickHighlightsFromStorage,
  KEY_PREFIX,
} from '../../../../scripts/highlighter/core/HighlightLookupResolver.js';

// ============================================================
// 測試資料常數
// ============================================================

const NORM_URL = 'https://example.com/posts/hello';
const STABLE_URL = 'https://example.com/?p=123';
const RAW_URL = 'https://example.com/posts/hello?utm_source=twitter';

const PAGE_STABLE = `${KEY_PREFIX.PAGE}${STABLE_URL}`;
const PAGE_NORM = `${KEY_PREFIX.PAGE}${NORM_URL}`;
const HL_NORM = `${KEY_PREFIX.HIGHLIGHTS}${NORM_URL}`;
const ALIAS_NORM = `${KEY_PREFIX.URL_ALIAS}${NORM_URL}`;
const ALIAS_RAW = `${KEY_PREFIX.URL_ALIAS}${RAW_URL}`;

const SAMPLE_HIGHLIGHTS = [
  { id: 'h1', text: 'Hello', color: 'yellow' },
  { id: 'h2', text: 'World', color: 'green' },
];

// ============================================================
// resolveKeys()
// ============================================================

describe('resolveKeys()', () => {
  describe('無 alias 情境（aliasCandidate = null）', () => {
    let contract;
    beforeEach(() => {
      contract = resolveKeys(NORM_URL, null);
    });

    test('canonicalUrl 等於 normalizedUrl', () => {
      expect(contract.canonicalUrl).toBe(NORM_URL);
    });

    test('stableUrl 等於 normalizedUrl', () => {
      expect(contract.stableUrl).toBe(NORM_URL);
    });

    test('aliasUsed 為 false', () => {
      expect(contract.aliasUsed).toBe(false);
    });

    test('lookupOrder 包含 2 個 key（page_<normalizedUrl> + highlights_<normalizedUrl>）', () => {
      expect(contract.lookupOrder).toHaveLength(2);
    });

    test('lookupOrder 第一個 key = page_<normalizedUrl>', () => {
      expect(contract.lookupOrder[0]).toBe(PAGE_NORM);
    });

    test('lookupOrder 最後一個 key = highlights_<normalizedUrl>', () => {
      expect(contract.lookupOrder.at(-1)).toBe(HL_NORM);
    });

    test('mutationTargetKey = page_<normalizedUrl>', () => {
      expect(contract.mutationTargetKey).toBe(PAGE_NORM);
    });

    test('legacyCleanupKeys 不含 mutationTargetKey', () => {
      expect(contract.legacyCleanupKeys).not.toContain(contract.mutationTargetKey);
    });

    test('legacyCleanupKeys 包含 highlights_<normalizedUrl>', () => {
      expect(contract.legacyCleanupKeys).toContain(HL_NORM);
    });

    test('contract 是 frozen 物件（不可變）', () => {
      expect(() => {
        contract.canonicalUrl = 'tampered';
      }).toThrow();
    });
  });

  describe('有 alias 情境（aliasCandidate = STABLE_URL）', () => {
    let contract;
    beforeEach(() => {
      contract = resolveKeys(NORM_URL, STABLE_URL);
    });

    test('canonicalUrl 等於 stableUrl', () => {
      expect(contract.canonicalUrl).toBe(STABLE_URL);
    });

    test('aliasUsed 為 true', () => {
      expect(contract.aliasUsed).toBe(true);
    });

    test('lookupOrder 第一個 key = page_<stableUrl>', () => {
      expect(contract.lookupOrder[0]).toBe(PAGE_STABLE);
    });

    test('lookupOrder 第二個 key = page_<normalizedUrl>（alias 不遮蔽 original）', () => {
      expect(contract.lookupOrder[1]).toBe(PAGE_NORM);
    });

    test('lookupOrder 共 4 個 key（page_stable + page_norm + hl_stable + hl_norm）', () => {
      expect(contract.lookupOrder).toHaveLength(4);
    });

    test('lookupOrder 第三個 key = highlights_<stableUrl>（alias 舊格式 fallback）', () => {
      const HL_STABLE = `${KEY_PREFIX.HIGHLIGHTS}${STABLE_URL}`;
      expect(contract.lookupOrder[2]).toBe(HL_STABLE);
    });

    test('lookupOrder 第四個 key = highlights_<normalizedUrl>（最終舊格式 fallback）', () => {
      expect(contract.lookupOrder[3]).toBe(HL_NORM);
    });

    test('mutationTargetKey = page_<stableUrl>', () => {
      expect(contract.mutationTargetKey).toBe(PAGE_STABLE);
    });

    test('legacyCleanupKeys 包含 page_<normalizedUrl>（與 stable 已不同）', () => {
      expect(contract.legacyCleanupKeys).toContain(PAGE_NORM);
    });

    test('legacyCleanupKeys 包含 highlights_<stableUrl>（alias 舊格式）', () => {
      const HL_STABLE = `${KEY_PREFIX.HIGHLIGHTS}${STABLE_URL}`;
      expect(contract.legacyCleanupKeys).toContain(HL_STABLE);
    });

    test('legacyCleanupKeys 包含 highlights_<normalizedUrl>', () => {
      expect(contract.legacyCleanupKeys).toContain(HL_NORM);
    });

    test('legacyCleanupKeys 不包含 mutationTargetKey', () => {
      expect(contract.legacyCleanupKeys).not.toContain(contract.mutationTargetKey);
    });
  });

  describe('alias candidate 等於 normalizedUrl（等同無 alias）', () => {
    test('aliasUsed 為 false', () => {
      const contract = resolveKeys(NORM_URL, NORM_URL);
      expect(contract.aliasUsed).toBe(false);
    });

    test('lookupOrder 長度為 2（不重複 page_<normalizedUrl>）', () => {
      const contract = resolveKeys(NORM_URL, NORM_URL);
      expect(contract.lookupOrder).toHaveLength(2);
    });
  });

  describe('輸入驗證', () => {
    test('normalizedUrl 為 null 應 throw TypeError', () => {
      expect(() => resolveKeys(null)).toThrow(TypeError);
    });

    test('normalizedUrl 為空字串應 throw TypeError', () => {
      expect(() => resolveKeys('')).toThrow(TypeError);
    });

    test('normalizedUrl 為 undefined 應 throw TypeError', () => {
      expect(() => resolveKeys(undefined)).toThrow(TypeError);
    });
  });
});

// ============================================================
// getAliasLookupKeys()
// ============================================================

describe('getAliasLookupKeys()', () => {
  test('無 rawUrl 時，只回傳 normalizedUrl 的 alias key', () => {
    const keys = getAliasLookupKeys(NORM_URL);
    expect(keys).toEqual([ALIAS_NORM]);
  });

  test('rawUrl 與 normalizedUrl 不同時，回傳兩個 alias key', () => {
    const keys = getAliasLookupKeys(NORM_URL, RAW_URL);
    expect(keys).toContain(ALIAS_NORM);
    expect(keys).toContain(ALIAS_RAW);
    expect(keys).toHaveLength(2);
  });

  test('rawUrl 等於 normalizedUrl 時，只回傳一個 key（不重複）', () => {
    const keys = getAliasLookupKeys(NORM_URL, NORM_URL);
    expect(keys).toHaveLength(1);
  });

  test('normalizedUrl 無效時，回傳空陣列', () => {
    expect(getAliasLookupKeys(null)).toEqual([]);
    expect(getAliasLookupKeys('')).toEqual([]);
  });
});

// ============================================================
// pickAliasCandidate()
// ============================================================

describe('pickAliasCandidate()', () => {
  test('aliasData 含 normalizedUrl 版本的 alias，回傳有效候選值', () => {
    const aliasData = { [ALIAS_NORM]: STABLE_URL };
    const result = pickAliasCandidate(aliasData, NORM_URL);
    expect(result).toBe(STABLE_URL);
  });

  test('若 normalizedUrl 版 alias 不存在，fallback 到 rawUrl 版', () => {
    const aliasData = { [ALIAS_RAW]: STABLE_URL };
    const result = pickAliasCandidate(aliasData, NORM_URL, RAW_URL);
    expect(result).toBe(STABLE_URL);
  });

  test('alias 值為非法 URL 時，回傳 null', () => {
    const aliasData = { [ALIAS_NORM]: 'not-a-url' };
    const result = pickAliasCandidate(aliasData, NORM_URL);
    expect(result).toBeNull();
  });

  test('alias 值為空字串時，回傳 null', () => {
    const aliasData = { [ALIAS_NORM]: '' };
    const result = pickAliasCandidate(aliasData, NORM_URL);
    expect(result).toBeNull();
  });

  test('aliasData 不含任何 alias 時，回傳 null', () => {
    const result = pickAliasCandidate({}, NORM_URL);
    expect(result).toBeNull();
  });

  test('aliasData 為 null 時，回傳 null', () => {
    const result = pickAliasCandidate(null, NORM_URL);
    expect(result).toBeNull();
  });
});

// ============================================================
// isValidAliasCandidate()
// ============================================================

describe('isValidAliasCandidate()', () => {
  test.each([
    ['https://example.com/?p=123', true],
    ['http://example.com/posts/1', true],
    ['https://example.com/', false],
    ['not-a-url', false],
    ['', false],
    [null, false],
    [undefined, false],
    [123, false],
    ['ftp://example.com/file', false],
    ['https://a', false], // 太短
  ])('isValidAliasCandidate(%s) → %s', (input, expected) => {
    expect(isValidAliasCandidate(input)).toBe(expected);
  });
});

// ============================================================
// pickHighlightsFromStorage() — contract matrix 情境
// ============================================================

describe('pickHighlightsFromStorage() contract matrix', () => {
  describe('情境 1：page_<stable> hit', () => {
    test('應回傳 stableUrl 的 highlights 並命中 page_<stable> key', () => {
      const contract = resolveKeys(NORM_URL, STABLE_URL);
      const storageData = {
        [PAGE_STABLE]: { highlights: SAMPLE_HIGHLIGHTS, notion: null },
        [PAGE_NORM]: { highlights: [], notion: null },
        [HL_NORM]: SAMPLE_HIGHLIGHTS,
      };
      const { highlights, resolvedKey } = pickHighlightsFromStorage(contract, storageData);
      expect(highlights).toEqual(SAMPLE_HIGHLIGHTS);
      expect(resolvedKey).toBe(PAGE_STABLE);
    });
  });

  describe('情境 2：page_<stable> miss + page_<original> hit', () => {
    test('應 fallback 並命中 page_<normalizedUrl>', () => {
      const contract = resolveKeys(NORM_URL, STABLE_URL);
      const storageData = {
        [PAGE_STABLE]: null,
        [PAGE_NORM]: { highlights: SAMPLE_HIGHLIGHTS, notion: null },
        [HL_NORM]: null,
      };
      const { highlights, resolvedKey } = pickHighlightsFromStorage(contract, storageData);
      expect(highlights).toEqual(SAMPLE_HIGHLIGHTS);
      expect(resolvedKey).toBe(PAGE_NORM);
    });
  });

  describe('情境 3：page_* miss + highlights_<original> hit', () => {
    test('應 fallback 到 highlights_* 舊格式（陣列格式）', () => {
      const contract = resolveKeys(NORM_URL, null);
      const storageData = {
        [PAGE_NORM]: null,
        [HL_NORM]: SAMPLE_HIGHLIGHTS,
      };
      const { highlights, resolvedKey } = pickHighlightsFromStorage(contract, storageData);
      expect(highlights).toEqual(SAMPLE_HIGHLIGHTS);
      expect(resolvedKey).toBe(HL_NORM);
    });

    test('應 fallback 到 highlights_* 舊格式（物件格式 {highlights:[...]}）', () => {
      const contract = resolveKeys(NORM_URL, null);
      const storageData = {
        [PAGE_NORM]: null,
        [HL_NORM]: { highlights: SAMPLE_HIGHLIGHTS },
      };
      const { highlights, resolvedKey } = pickHighlightsFromStorage(contract, storageData);
      expect(highlights).toEqual(SAMPLE_HIGHLIGHTS);
      expect(resolvedKey).toBe(HL_NORM);
    });
  });

  describe('情境 4：alias 存在但指向空 stable key（stable miss，fallback 成功）', () => {
    test('alias 指向的 page_<stable> 無內容，應 fallback 到 page_<normalizedUrl>', () => {
      const contract = resolveKeys(NORM_URL, STABLE_URL);
      const storageData = {
        [PAGE_STABLE]: undefined, // stable key 存在但空
        [PAGE_NORM]: { highlights: SAMPLE_HIGHLIGHTS, notion: null },
        [HL_NORM]: null,
      };
      const { highlights, resolvedKey } = pickHighlightsFromStorage(contract, storageData);
      expect(highlights).toEqual(SAMPLE_HIGHLIGHTS);
      expect(resolvedKey).toBe(PAGE_NORM);
    });
  });

  describe('情境 5：alias 污染（非法值）', () => {
    test('isValidAliasCandidate 攔截非法 alias，resolveKeys 收到 null，lookup order 正確退化', () => {
      // 呼叫端先過濾後傳入，此處模擬呼叫端已過濾
      const contract = resolveKeys(NORM_URL, null); // alias 被過濾掉

      const storageData = {
        [PAGE_NORM]: { highlights: SAMPLE_HIGHLIGHTS, notion: null },
      };
      const { highlights, resolvedKey } = pickHighlightsFromStorage(contract, storageData);
      expect(highlights).toEqual(SAMPLE_HIGHLIGHTS);
      expect(resolvedKey).toBe(PAGE_NORM);
    });
  });

  describe('情境 6：同一 canonical page 同時存在 page_<stable> 與 page_<original>', () => {
    test('應優先回傳 page_<stable> 的資料', () => {
      const stableHighlights = [{ id: 'hs', text: 'Stable', color: 'blue' }];
      const origHighlights = [{ id: 'ho', text: 'Original', color: 'red' }];

      const contract = resolveKeys(NORM_URL, STABLE_URL);
      const storageData = {
        [PAGE_STABLE]: { highlights: stableHighlights, notion: { pageId: 'abc' } },
        [PAGE_NORM]: { highlights: origHighlights, notion: null },
      };
      const { highlights, resolvedKey } = pickHighlightsFromStorage(contract, storageData);
      expect(highlights).toEqual(stableHighlights);
      expect(resolvedKey).toBe(PAGE_STABLE);
    });
  });

  describe('情境 7：page_* 損壞（highlights 欄位非陣列）但 highlights_* 合法', () => {
    test('page_* highlights 非陣列時跳過，fallback 到 highlights_*', () => {
      const contract = resolveKeys(NORM_URL, null);
      const storageData = {
        [PAGE_NORM]: { highlights: 'corrupted', notion: null }, // 損壞
        [HL_NORM]: SAMPLE_HIGHLIGHTS,
      };
      const { highlights, resolvedKey } = pickHighlightsFromStorage(contract, storageData);
      expect(highlights).toEqual(SAMPLE_HIGHLIGHTS);
      expect(resolvedKey).toBe(HL_NORM);
    });
  });

  describe('情境 8：所有 key 均無資料', () => {
    test('回傳 { highlights: null, resolvedKey: null }', () => {
      const contract = resolveKeys(NORM_URL, STABLE_URL);
      const storageData = {};
      const { highlights, resolvedKey } = pickHighlightsFromStorage(contract, storageData);
      expect(highlights).toBeNull();
      expect(resolvedKey).toBeNull();
    });
  });

  describe('storageData 為空物件或 null', () => {
    test('storageData 為 null 時，回傳 null', () => {
      const contract = resolveKeys(NORM_URL, null);
      const { highlights } = pickHighlightsFromStorage(contract, null);
      expect(highlights).toBeNull();
    });
  });
});

// ============================================================
// legacyCleanupKeys 驗證（write / clear 情境）
// ============================================================

describe('legacyCleanupKeys（mutation 後清理情境）', () => {
  test('有 alias 時：legacyCleanupKeys 包含 page_<normalizedUrl>、highlights_<stableUrl> 和 highlights_<normalizedUrl>', () => {
    const HL_STABLE = `${KEY_PREFIX.HIGHLIGHTS}${STABLE_URL}`;
    const contract = resolveKeys(NORM_URL, STABLE_URL);
    expect(contract.legacyCleanupKeys).toContain(PAGE_NORM);
    expect(contract.legacyCleanupKeys).toContain(HL_STABLE);
    expect(contract.legacyCleanupKeys).toContain(HL_NORM);
    // 且不能包含 mutationTargetKey 本身
    expect(contract.legacyCleanupKeys).not.toContain(PAGE_STABLE);
  });

  test('無 alias 時：legacyCleanupKeys 只包含 highlights_<normalizedUrl>（不含 page_<normalizedUrl>）', () => {
    const contract = resolveKeys(NORM_URL, null);
    expect(contract.legacyCleanupKeys).toContain(HL_NORM);
    expect(contract.legacyCleanupKeys).not.toContain(PAGE_NORM);
  });
});

// ============================================================
// Contract 一致性不變式（對應計劃 §8 Unsynced Enumeration Invariants）
// ============================================================

describe('Contract 不變式驗證', () => {
  test('mutationTargetKey 必須是 lookupOrder 的第一個 key', () => {
    // 無論有無 alias，mutation target 應與 highest-priority lookup key 一致
    const withAlias = resolveKeys(NORM_URL, STABLE_URL);
    expect(withAlias.mutationTargetKey).toBe(withAlias.lookupOrder[0]);

    const withoutAlias = resolveKeys(NORM_URL, null);
    expect(withoutAlias.mutationTargetKey).toBe(withoutAlias.lookupOrder[0]);
  });

  test('lookupOrder 中 page_* 必須全部排在 highlights_* 之前', () => {
    const contract = resolveKeys(NORM_URL, STABLE_URL);
    const firstLegacyIdx = contract.lookupOrder.findIndex(k => k.startsWith(KEY_PREFIX.HIGHLIGHTS));
    const lastPageIdx = contract.lookupOrder.findLastIndex(k => k.startsWith(KEY_PREFIX.PAGE));
    expect(lastPageIdx).toBeLessThan(firstLegacyIdx);
  });

  test('lookupOrder 不能包含重複 key', () => {
    const contract = resolveKeys(NORM_URL, STABLE_URL);
    const unique = new Set(contract.lookupOrder);
    expect(unique.size).toBe(contract.lookupOrder.length);
  });

  test('stableUrl === normalizedUrl 時，lookupOrder 不包含重複的 page_<normalizedUrl>', () => {
    const contract = resolveKeys(NORM_URL, NORM_URL); // alias = normalizedUrl（實質無 alias）
    const count = contract.lookupOrder.filter(k => k === PAGE_NORM).length;
    expect(count).toBe(1);
  });
});
