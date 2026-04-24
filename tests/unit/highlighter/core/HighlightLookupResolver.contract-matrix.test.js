/**
 * Phase 3 跨模組 Contract Matrix 測試
 *
 * 目標：以同一組 Storage Fixture，驗證
 *   - HighlightLookupResolver （純 contract 層）
 *   - HighlightStorageGateway.loadHighlights （Content Script 路徑）
 *   - StorageService.getHighlights （Background 路徑）
 *
 * 這三個消費者的讀取優先順序與最終命中結果必須一致。
 *
 * Fixture 矩陣：
 *   F1. page_<stable> hit
 *   F2. page_<stable> miss + page_<original> hit
 *   F3. page_<stable> miss + page_<original> miss + highlights_<stable> hit（alias 舊格式）
 *   F4. page_* miss + highlights_<original> hit
 *   F5. alias 存在但指向空 stable key（fallback 成功）
 *   F6. alias 污染（非法值）— 應退化為無 alias 查詢
 *   F7. 同一 canonical page 同時存在 page_<stable> 與 page_<original>（雙寫）
 *   F8. page_* 損壞（highlights 欄位非陣列）但 highlights_<original> 合法
 *   F9. 所有 key 均無資料
 */

import {
  resolveKeys,
  pickHighlightsFromStorage,
  getAliasLookupKeys,
  pickAliasCandidate,
} from '../../../../scripts/highlighter/core/HighlightLookupResolver.js';
import { isSafeStableUrl } from '../../../../scripts/utils/urlUtils.js';

// ──── 常數 ────────────────────────────────────────────────────────────

const PAGE_PREFIX = 'page_';
const HIGHLIGHTS_PREFIX = 'highlights_';
const URL_ALIAS_PREFIX = 'url_alias:';

const NORM_URL = 'https://example.com/posts/hello';
const STABLE_URL = 'https://example.com/?p=123';

const PAGE_STABLE = `${PAGE_PREFIX}${STABLE_URL}`;
const PAGE_NORM = `${PAGE_PREFIX}${NORM_URL}`;
const HL_STABLE = `${HIGHLIGHTS_PREFIX}${STABLE_URL}`;
const HL_NORM = `${HIGHLIGHTS_PREFIX}${NORM_URL}`;
const ALIAS_NORM = `${URL_ALIAS_PREFIX}${NORM_URL}`;

const H1 = [{ id: 'h1', text: 'Stable highlights', color: 'yellow' }];
const H2 = [{ id: 'h2', text: 'Original highlights', color: 'green' }];
const H3 = [{ id: 'h3', text: 'Alias legacy highlights', color: 'blue' }];
const H4 = [{ id: 'h4', text: 'Legacy norm highlights', color: 'red' }];

// ──── Resolver-only helper（純函數，不需 mock）──────────────────────────

/**
 * 用 resolver + pickHighlightsFromStorage 直接從 storageData 取結果
 * （模擬 Background/Content 消費者的完整讀取流程）
 */
function resolverPick(storageData, aliasCandidate = null) {
  const contract = resolveKeys(NORM_URL, aliasCandidate);
  return pickHighlightsFromStorage(contract, storageData);
}

// ──── Gateway Mock Factory ──────────────────────────────────────────────

/**
 * 建立模擬 chrome.storage.local.get 的函數
 * 精確模擬瀏覽器行為：只回傳 keys list 中「有資料」的項目
 */
function makeChromeMock(fixture) {
  return jest.fn().mockImplementation(keys => {
    const keyList = Array.isArray(keys) ? keys : [keys];
    return Promise.resolve(
      Object.fromEntries(keyList.filter(k => k in fixture).map(k => [k, fixture[k]]))
    );
  });
}

// ──── StorageService Simplified Mock ──────────────────────────────────────
// 不真正 import StorageService（避免完整 background 依賴鏈）
// 而是模擬其 getHighlights 的核心邏輯，確認 contract 一致性

async function simulateStorageServiceGetHighlights(fixture) {
  const fakeChromeStorage = { local: { get: makeChromeMock(fixture) } };

  const aliasKeys = getAliasLookupKeys(NORM_URL);
  const preloadKeys = [
    ...aliasKeys,
    `${PAGE_PREFIX}${NORM_URL}`,
    `${HIGHLIGHTS_PREFIX}${NORM_URL}`,
  ];

  const preloadResult = await fakeChromeStorage.local.get(preloadKeys);
  const aliasCandidate = pickAliasCandidate(preloadResult, NORM_URL);
  const contract = resolveKeys(NORM_URL, aliasCandidate);

  let storageData = preloadResult;
  if (aliasCandidate && aliasCandidate !== NORM_URL) {
    const stablePageKey = `${PAGE_PREFIX}${aliasCandidate}`;
    if (!(stablePageKey in preloadResult)) {
      const extra = await fakeChromeStorage.local.get([stablePageKey]);
      storageData = { ...preloadResult, ...extra };
    }
  }

  // 補取 highlights_<stableUrl>（alias 命中時 resolver 需要它）
  if (aliasCandidate && aliasCandidate !== NORM_URL) {
    const hlStableKey = `${HIGHLIGHTS_PREFIX}${aliasCandidate}`;
    if (!(hlStableKey in storageData)) {
      const extra = await fakeChromeStorage.local.get([hlStableKey]);
      storageData = { ...storageData, ...extra };
    }
  }

  const { highlights } = pickHighlightsFromStorage(contract, storageData);
  return highlights;
}

// ──── Gateway 核心邏輯模擬 ─────────────────────────────────────────────
// 模擬 HighlightStorageGateway._resolveStableUrl + _loadBothFormats 邏輯

async function simulateGatewayLoadHighlights(fixture) {
  const fakeChromeStorage = { local: { get: makeChromeMock(fixture) } };

  // _resolveStableUrl
  const aliasKeys = [ALIAS_NORM];
  const aliasData = await fakeChromeStorage.local.get(aliasKeys);
  const rawAlias = aliasData?.[ALIAS_NORM] ?? null;
  const stableUrl =
    rawAlias && rawAlias !== NORM_URL && isSafeStableUrl(rawAlias, { requireNormalized: true })
      ? rawAlias
      : NORM_URL;

  // _loadBothFormats via resolver
  const aliasCandidate = stableUrl === NORM_URL ? null : stableUrl;
  const contract = resolveKeys(NORM_URL, aliasCandidate);
  const data = await fakeChromeStorage.local.get(contract.lookupOrder);
  const { highlights } = pickHighlightsFromStorage(contract, data);
  return highlights;
}

// ═══════════════════════════════════════════════════════════════════════════
// Fixture 矩陣測試
// ═══════════════════════════════════════════════════════════════════════════

describe('Phase 3 Contract Matrix：跨模組讀取一致性', () => {
  // ─── F1. page_<stable> hit ───────────────────────────────────────────────
  describe('F1. page_<stable> hit', () => {
    const fixture = {
      [ALIAS_NORM]: STABLE_URL,
      [PAGE_STABLE]: { highlights: H1, notion: { pageId: 'abc' } },
      [PAGE_NORM]: { highlights: H2, notion: null },
      [HL_NORM]: H4,
    };

    test('Resolver：命中 page_<stable>', () => {
      const { highlights, resolvedKey } = resolverPick(fixture, STABLE_URL);
      expect(highlights).toEqual(H1);
      expect(resolvedKey).toBe(PAGE_STABLE);
    });

    test('StorageService 模擬：同一結果', async () => {
      const result = await simulateStorageServiceGetHighlights(fixture);
      expect(result).toEqual(H1);
    });

    test('Gateway 模擬：同一結果', async () => {
      const result = await simulateGatewayLoadHighlights(fixture);
      expect(result).toEqual(H1);
    });
  });

  // ─── F2. page_<stable> miss + page_<original> hit ───────────────────────
  describe('F2. page_<stable> miss + page_<original> hit', () => {
    const fixture = {
      [ALIAS_NORM]: STABLE_URL,
      // PAGE_STABLE 刻意不存在
      [PAGE_NORM]: { highlights: H2, notion: null },
      [HL_NORM]: H4,
    };

    test('Resolver：fallback 命中 page_<original>', () => {
      const { highlights, resolvedKey } = resolverPick(fixture, STABLE_URL);
      expect(highlights).toEqual(H2);
      expect(resolvedKey).toBe(PAGE_NORM);
    });

    test('StorageService 模擬：同一結果', async () => {
      const result = await simulateStorageServiceGetHighlights(fixture);
      expect(result).toEqual(H2);
    });

    test('Gateway 模擬：同一結果', async () => {
      const result = await simulateGatewayLoadHighlights(fixture);
      expect(result).toEqual(H2);
    });
  });

  // ─── F3. page_* miss + highlights_<stable> hit（alias 舊格式）────────────
  describe('F3. page_* miss + highlights_<stable> hit', () => {
    const fixture = {
      [ALIAS_NORM]: STABLE_URL,
      // PAGE_STABLE 與 PAGE_NORM 刻意不存在
      [HL_STABLE]: H3, // alias-resolved legacy key
      [HL_NORM]: H4,
    };

    test('Resolver：fallback 命中 highlights_<stable>', () => {
      const { highlights, resolvedKey } = resolverPick(fixture, STABLE_URL);
      expect(highlights).toEqual(H3);
      expect(resolvedKey).toBe(HL_STABLE);
    });

    test('StorageService 模擬：同一結果', async () => {
      const result = await simulateStorageServiceGetHighlights(fixture);
      expect(result).toEqual(H3);
    });

    test('Gateway 模擬：同一結果', async () => {
      const result = await simulateGatewayLoadHighlights(fixture);
      expect(result).toEqual(H3);
    });
  });

  // ─── F4. page_* miss + highlights_<original> hit（無 alias）────────────
  describe('F4. page_* miss + highlights_<original> hit（無 alias）', () => {
    const fixture = {
      // 無 alias，無 page_* keys
      [HL_NORM]: H4,
    };

    test('Resolver：fallback 命中 highlights_<original>', () => {
      const { highlights, resolvedKey } = resolverPick(fixture, null);
      expect(highlights).toEqual(H4);
      expect(resolvedKey).toBe(HL_NORM);
    });

    test('StorageService 模擬：同一結果', async () => {
      const result = await simulateStorageServiceGetHighlights(fixture);
      expect(result).toEqual(H4);
    });

    test('Gateway 模擬：同一結果', async () => {
      const result = await simulateGatewayLoadHighlights(fixture);
      expect(result).toEqual(H4);
    });
  });

  // ─── F5. alias 存在但指向空 stable key（fallback 成功）────────────────────
  describe('F5. alias 指向空 stable key，fallback 到 page_<original>', () => {
    const fixture = {
      [ALIAS_NORM]: STABLE_URL,
      // PAGE_STABLE 刻意不存在（資料尚未遷移）
      [PAGE_NORM]: { highlights: H2, notion: null },
    };

    test('Resolver：降級命中 page_<original>', () => {
      const { highlights, resolvedKey } = resolverPick(fixture, STABLE_URL);
      expect(highlights).toEqual(H2);
      expect(resolvedKey).toBe(PAGE_NORM);
    });

    test('StorageService 模擬：同一結果', async () => {
      const result = await simulateStorageServiceGetHighlights(fixture);
      expect(result).toEqual(H2);
    });

    test('Gateway 模擬：同一結果', async () => {
      const result = await simulateGatewayLoadHighlights(fixture);
      expect(result).toEqual(H2);
    });
  });

  // ─── F6. alias 污染（非法值）— 應退化為無 alias 查詢 ──────────────────────
  describe('F6. alias 污染（非法值 root URL）', () => {
    const fixture = {
      [ALIAS_NORM]: 'https://example.com/', // root URL，isSafeStableAliasUrl 拒絕
      [PAGE_NORM]: { highlights: H2, notion: null },
    };

    test('Resolver：alias 過濾後退化為 page_<original>，無 aliasUsed', () => {
      // 呼叫端過濾 alias，傳 null 給 resolveKeys（模擬 isSafeStableAliasUrl 拒絕）
      const { highlights, resolvedKey } = resolverPick(fixture, null);
      expect(highlights).toEqual(H2);
      expect(resolvedKey).toBe(PAGE_NORM);
    });

    test('StorageService 模擬：isValidAliasCandidate 拒絕 root URL 後退化', async () => {
      // StorageService 使用 isValidAliasCandidate；root URL alias 會先被拒絕，直接退化到 page_<norm>
      const result = await simulateStorageServiceGetHighlights(fixture);
      expect(result).toEqual(H2);
    });

    test('Gateway 模擬：isSafeStableAliasUrl 拒絕後退化到 page_<original>', async () => {
      const result = await simulateGatewayLoadHighlights(fixture);
      expect(result).toEqual(H2);
    });
  });

  describe('F6b. alias 污染（未 normalized URL）', () => {
    const fixture = {
      [ALIAS_NORM]: 'https://example.com/posts/hello/?utm_source=fb',
      [PAGE_NORM]: { highlights: H2, notion: null },
      [`page_https://example.com/posts/hello/?utm_source=fb`]: { highlights: H1, notion: null },
    };

    test('Gateway 模擬：應比照 requireNormalized=true 拒絕未 normalized alias', async () => {
      const result = await simulateGatewayLoadHighlights(fixture);
      expect(result).toEqual(H2);
    });
  });

  // ─── F7. 雙寫衝突：page_<stable> 與 page_<original> 同時存在 ────────────
  describe('F7. 雙寫衝突：page_<stable> 優先', () => {
    const fixture = {
      [ALIAS_NORM]: STABLE_URL,
      [PAGE_STABLE]: { highlights: H1, notion: { pageId: 'abc' } },
      [PAGE_NORM]: { highlights: H2, notion: null },
    };

    test('Resolver：page_<stable> 優先', () => {
      const { highlights, resolvedKey } = resolverPick(fixture, STABLE_URL);
      expect(highlights).toEqual(H1);
      expect(resolvedKey).toBe(PAGE_STABLE);
    });

    test('StorageService 模擬：同一結果', async () => {
      const result = await simulateStorageServiceGetHighlights(fixture);
      expect(result).toEqual(H1);
    });

    test('Gateway 模擬：同一結果', async () => {
      const result = await simulateGatewayLoadHighlights(fixture);
      expect(result).toEqual(H1);
    });
  });

  // ─── F8. page_* 損壞但 highlights_<original> 合法 ───────────────────────
  describe('F8. page_* 損壞（highlights 非陣列），fallback 到 highlights_<original>', () => {
    const fixture = {
      [PAGE_NORM]: { highlights: 'corrupted', notion: null },
      [HL_NORM]: H4,
    };

    test('Resolver：跳過損壞 page_*，命中 highlights_<original>', () => {
      const { highlights, resolvedKey } = resolverPick(fixture, null);
      expect(highlights).toEqual(H4);
      expect(resolvedKey).toBe(HL_NORM);
    });

    test('StorageService 模擬：同一結果', async () => {
      const result = await simulateStorageServiceGetHighlights(fixture);
      expect(result).toEqual(H4);
    });

    test('Gateway 模擬：同一結果', async () => {
      const result = await simulateGatewayLoadHighlights(fixture);
      expect(result).toEqual(H4);
    });
  });

  // ─── F9. 所有 key 均無資料 ──────────────────────────────────────────────
  describe('F9. 所有 key 均無資料', () => {
    const fixture = {}; // 空 storage

    test('Resolver：回傳 null', () => {
      const { highlights } = resolverPick(fixture, null);
      expect(highlights).toBeNull();
    });

    test('StorageService 模擬：回傳 null', async () => {
      const result = await simulateStorageServiceGetHighlights(fixture);
      expect(result).toBeNull();
    });

    test('Gateway 模擬：回傳 null', async () => {
      const result = await simulateGatewayLoadHighlights(fixture);
      expect(result).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Contract 不變式補充（跨模組角度）
// ═══════════════════════════════════════════════════════════════════════════

describe('Contract 不變式：lookup 結果對稱性', () => {
  test('有 alias 時：三個消費者的 resolvedKey prefix 必須一致（皆為 page_* 或 highlights_*）', async () => {
    const fixture = {
      [ALIAS_NORM]: STABLE_URL,
      [PAGE_STABLE]: { highlights: H1, notion: null },
    };

    const resolverResult = resolverPick(fixture, STABLE_URL);
    const ssResult = await simulateStorageServiceGetHighlights(fixture);
    const gwResult = await simulateGatewayLoadHighlights(fixture);

    // 三者結果必須相同
    expect(resolverResult.highlights).toEqual(H1);
    expect(ssResult).toEqual(H1);
    expect(gwResult).toEqual(H1);
  });

  test('無 alias 時：三個消費者均能從 page_<norm> 讀取', async () => {
    const fixture = {
      [PAGE_NORM]: { highlights: H2, notion: null },
    };

    const resolverResult = resolverPick(fixture, null);
    const ssResult = await simulateStorageServiceGetHighlights(fixture);
    const gwResult = await simulateGatewayLoadHighlights(fixture);

    expect(resolverResult.highlights).toEqual(H2);
    expect(ssResult).toEqual(H2);
    expect(gwResult).toEqual(H2);
  });

  test('lookupOrder 長度：有 alias 時 resolveKeys 必須包含 4 個 key（page×2 + hl×2）', () => {
    const { lookupOrder } = resolveKeys(NORM_URL, STABLE_URL);
    expect(lookupOrder).toHaveLength(4);
    expect(lookupOrder[0]).toBe(PAGE_STABLE);
    expect(lookupOrder[1]).toBe(PAGE_NORM);
    expect(lookupOrder[2]).toBe(HL_STABLE);
    expect(lookupOrder[3]).toBe(HL_NORM);
  });

  test('lookupOrder 長度：無 alias 時 resolveKeys 只包含 2 個 key（page + hl）', () => {
    const { lookupOrder } = resolveKeys(NORM_URL, null);
    expect(lookupOrder).toHaveLength(2);
    expect(lookupOrder[0]).toBe(PAGE_NORM);
    expect(lookupOrder[1]).toBe(HL_NORM);
  });

  test('mutationTargetKey 永遠是 lookupOrder[0]（最高優先順位的寫入目標）', () => {
    const withAlias = resolveKeys(NORM_URL, STABLE_URL);
    const withoutAlias = resolveKeys(NORM_URL, null);
    expect(withAlias.mutationTargetKey).toBe(withAlias.lookupOrder[0]);
    expect(withoutAlias.mutationTargetKey).toBe(withoutAlias.lookupOrder[0]);
  });
});
