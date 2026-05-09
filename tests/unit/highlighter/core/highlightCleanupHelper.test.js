/**
 * highlightCleanupHelper.test.js
 *
 * 測試 cleanup helper 的純函數行為：
 * - planClearCleanup: 清標註保 page state
 * - planDeleteCleanup: 整頁刪除
 *
 * 對應 2026-05-03 completion plan §2 / §4。
 */

import {
  planClearCleanup,
  planDeleteCleanup,
} from '../../../../scripts/highlighter/core/highlightCleanupHelper.js';
import { resolveKeys } from '../../../../scripts/highlighter/core/HighlightLookupResolver.js';
import { PAGE_PREFIX, HIGHLIGHTS_PREFIX } from '../../../../scripts/config/shared/storage.js';

describe('highlightCleanupHelper', () => {
  const NORMALIZED = 'https://example.com/article?ref=x';
  const STABLE = 'https://example.com/article';

  const stablePageKey = `${PAGE_PREFIX}${STABLE}`;
  const normalizedPageKey = `${PAGE_PREFIX}${NORMALIZED}`;
  const stableLegacyKey = `${HIGHLIGHTS_PREFIX}${STABLE}`;
  const normalizedLegacyKey = `${HIGHLIGHTS_PREFIX}${NORMALIZED}`;

  describe('planClearCleanup', () => {
    it('canonical key 有 notion 時，set 應寫回 highlights:[] 並保留 notion / metadata', () => {
      const contract = resolveKeys(NORMALIZED, STABLE);
      const snapshot = {
        [stablePageKey]: {
          notion: { pageId: 'p1' },
          highlights: ['h1', 'h2'],
          metadata: { createdAt: 1000, lastUpdated: 2000, custom: 'keep-me' },
        },
      };

      const plan = planClearCleanup(contract, snapshot);

      expect(plan.set[stablePageKey]).toEqual(
        expect.objectContaining({
          notion: { pageId: 'p1' },
          highlights: [],
          metadata: expect.objectContaining({
            createdAt: 1000,
            custom: 'keep-me',
            lastUpdated: expect.any(Number),
          }),
        })
      );
      expect(plan.set[stablePageKey].metadata.lastUpdated).toBeGreaterThanOrEqual(2000);
      expect(plan.remove).not.toContain(stablePageKey);
    });

    it('canonical key 無 notion 時應加入 remove（避免空 page state 殘留）', () => {
      const contract = resolveKeys(NORMALIZED, STABLE);
      const snapshot = {
        [stablePageKey]: {
          notion: null,
          highlights: ['h1'],
          metadata: { createdAt: 1, lastUpdated: 2 },
        },
      };

      const plan = planClearCleanup(contract, snapshot);

      expect(plan.remove).toContain(stablePageKey);
      expect(plan.set).toEqual({});
    });

    it('alias 命中時，legacy keys（page_<original> + highlights_*）應依字典序進入 remove', () => {
      const contract = resolveKeys(NORMALIZED, STABLE);
      const snapshot = {
        [stablePageKey]: {
          notion: { pageId: 'p1' },
          highlights: ['h1'],
          metadata: { lastUpdated: 1 },
        },
        [normalizedPageKey]: {
          notion: null,
          highlights: ['orphan'],
          metadata: {},
        },
        [normalizedLegacyKey]: ['legacy-h'],
      };

      const plan = planClearCleanup(contract, snapshot);

      // 應 remove: page_<normalized>, highlights_<normalized>（字典序）
      // MUST NOT remove: page_<stable>（會 setNull/highlights=[])
      expect(plan.remove).toEqual(
        [...new Set([normalizedPageKey, normalizedLegacyKey])].toSorted((a, b) =>
          a.localeCompare(b)
        )
      );
      expect(plan.remove).not.toContain(stablePageKey);
      expect(plan.set[stablePageKey]).toBeDefined();
    });

    it('snapshot 為空時，set 與 remove 都為空', () => {
      const contract = resolveKeys(NORMALIZED, null);
      const plan = planClearCleanup(contract, {});
      expect(plan.set).toEqual({});
      expect(plan.remove).toEqual([]);
    });

    it('snapshot 為非物件時，安全處理為空', () => {
      const contract = resolveKeys(NORMALIZED, null);
      expect(planClearCleanup(contract, null)).toEqual({ set: {}, remove: [] });
      expect(planClearCleanup(contract, undefined)).toEqual({ set: {}, remove: [] });
    });

    it('contract 不是物件時應拋 TypeError', () => {
      expect(() => planClearCleanup(null, {})).toThrow(TypeError);
      expect(() => planClearCleanup(undefined, {})).toThrow(TypeError);
    });
  });

  describe('planDeleteCleanup', () => {
    it('canonical 與 legacy keys 都應在 remove，set 為空', () => {
      const contract = resolveKeys(NORMALIZED, STABLE);
      const snapshot = {
        [stablePageKey]: { notion: { pageId: 'p1' }, highlights: ['h'] },
        [normalizedPageKey]: { notion: null, highlights: ['o'] },
        [normalizedLegacyKey]: ['legacy'],
      };

      const plan = planDeleteCleanup(contract, snapshot);

      expect(plan.remove).toEqual(
        [normalizedLegacyKey, normalizedPageKey, stablePageKey].toSorted((a, b) =>
          a.localeCompare(b)
        )
      );
      expect(plan.set).toEqual({});
    });

    it('canonical key 不存在於 snapshot 時，不加入 remove', () => {
      const contract = resolveKeys(NORMALIZED, STABLE);
      const snapshot = {
        [normalizedLegacyKey]: ['legacy'],
      };
      const plan = planDeleteCleanup(contract, snapshot);
      expect(plan.remove).toEqual([normalizedLegacyKey]);
      expect(plan.set).toEqual({});
    });

    it('snapshot 全空時，remove 為空', () => {
      const contract = resolveKeys(NORMALIZED, null);
      const plan = planDeleteCleanup(contract, {});
      expect(plan.remove).toEqual([]);
      expect(plan.set).toEqual({});
    });

    it('未提供 alias 時，contract 只涵蓋 normalizedUrl 對應的 keys', () => {
      const contract = resolveKeys(NORMALIZED, null);
      const snapshot = {
        [normalizedPageKey]: { notion: { pageId: 'p1' }, highlights: ['h'] },
        [normalizedLegacyKey]: ['legacy'],
        // 模擬另一個無關 key 不應出現在 plan 中
        [stablePageKey]: { notion: null, highlights: ['stable-orphan'] },
      };
      const plan = planDeleteCleanup(contract, snapshot);
      expect(plan.remove).toEqual(
        [normalizedLegacyKey, normalizedPageKey].toSorted((a, b) => a.localeCompare(b))
      );
      expect(plan.remove).not.toContain(stablePageKey);
    });

    it('contract 不是物件時應拋 TypeError', () => {
      expect(() => planDeleteCleanup(null, {})).toThrow(TypeError);
    });
  });

  describe('字典序穩定性（Phase 0 lock 決策延伸）', () => {
    it('多個 legacy key 與 canonical key 同時存在時，remove 採固定字典序', () => {
      const contract = resolveKeys(NORMALIZED, STABLE);
      const snapshot = {
        [stableLegacyKey]: ['stable-legacy'],
        [normalizedLegacyKey]: ['norm-legacy'],
        [normalizedPageKey]: { notion: null, highlights: ['o'] },
        [stablePageKey]: { notion: { pageId: 'p1' }, highlights: [] },
      };
      const plan = planDeleteCleanup(contract, snapshot);
      const expected = [
        stablePageKey,
        normalizedPageKey,
        stableLegacyKey,
        normalizedLegacyKey,
      ].toSorted((a, b) => a.localeCompare(b));
      expect(plan.remove).toEqual(expected);
    });
  });
});
