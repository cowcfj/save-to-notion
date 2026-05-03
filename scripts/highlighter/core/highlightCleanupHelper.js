/**
 * highlightCleanupHelper — 純函數層的 highlight cleanup 計劃產生器
 *
 * 職責：
 * - 根據 HighlightLookupResolver 的 contract 與 storage snapshot，
 *   產生「需要 remove 哪些 key、需要 set 哪些 key」的純資料計劃。
 * - 純函數，無 `chrome.storage` / `window` 依賴；輸入即決定輸出。
 * - background 與 sidepanel 兩端共用，避免 cleanup 邏輯散落在多處。
 *
 * 設計原則（對應 2026-05-03 completion plan §2 / §4）：
 * 1. 所有 cleanup target 來自 contract.mutationTargetKey + contract.legacyCleanupKeys
 *    → consumer 不再自行決定要刪/保留哪些 key
 * 2. cleanup 順序在輸出陣列中採固定字典序（Phase 0 lock 決策的延伸）
 * 3. 只對「snapshot 中實際存在」的 key 產出操作，避免無謂的 storage round-trip
 *
 * 兩個常見 intent：
 * - **clear**: 清空 highlights 但保留 page state（notion / metadata）
 * - **delete**: 完整刪除 page（含 notion）
 *
 * @module core/highlightCleanupHelper
 */

import { compareKeysAlphabetically } from '../../utils/keyOrdering.js';

/**
 * @typedef {object} HighlightCleanupPlan
 * @property {string[]} remove - 應呼叫 `storage.remove()` 的 key 清單（已字典序）
 * @property {Record<string, any>} set - 應呼叫 `storage.set()` 的 key→value 對映（保留 page state 時用）
 */

/**
 * 取得 contract 中應納入 cleanup 範圍的 legacy keys（不含 mutationTargetKey 自身），
 * 並過濾為僅 snapshot 中實際存在的 key，固定字典序。
 *
 * @param {import('./HighlightLookupResolver.js').HighlightLookupContract} contract
 * @param {Record<string, any>} snapshot
 * @returns {string[]}
 * @private
 */
function _existingLegacyKeysSorted(contract, snapshot) {
  const target = contract.mutationTargetKey;
  return contract.legacyCleanupKeys
    .filter(k => k !== target && snapshot?.[k] !== undefined && snapshot?.[k] !== null)
    .toSorted(compareKeysAlphabetically);
}

/**
 * 規範化現有 page_* 物件，避免被 cleanup 覆寫掉時遺失關鍵欄位。
 *
 * @param {any} value
 * @returns {object|null}
 * @private
 */
function _normalizePageObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value;
}

/**
 * 產生「清空 highlights、保留 page state」的 cleanup 計劃。
 *
 * 行為：
 * - canonical key（contract.mutationTargetKey）若存在於 snapshot：
 *     - 有 notion → 寫回 highlights:[]，保留其他欄位（透過 set）
 *     - 無 notion 且無其他欄位 → 視同空狀態，加入 remove（避免遺留只有空 highlights 的孤兒）
 * - legacy keys（contract.legacyCleanupKeys 中、snapshot 存在的）：
 *     - 一律加入 remove
 *
 * @param {import('./HighlightLookupResolver.js').HighlightLookupContract} contract
 * @param {Record<string, any>} snapshot
 * @returns {HighlightCleanupPlan}
 */
export function planClearCleanup(contract, snapshot) {
  if (!contract || typeof contract !== 'object') {
    throw new TypeError('[highlightCleanupHelper] contract 必須是 object');
  }

  const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const target = contract.mutationTargetKey;
  const remove = _existingLegacyKeysSorted(contract, safeSnapshot);
  /** @type {Record<string, any>} */
  const set = {};

  const canonical = _normalizePageObject(safeSnapshot[target]);
  if (canonical) {
    if (canonical.notion) {
      // 保留 notion 與其他欄位，僅 highlights 清空
      set[target] = {
        ...canonical,
        highlights: [],
        metadata: { ...canonical.metadata, lastUpdated: Date.now() },
      };
    } else {
      // 無 notion 也無有意義內容 → 直接 remove
      remove.push(target);
      remove.sort(compareKeysAlphabetically); // 就地排序：此時陣列已是 planClearCleanup 本地變數，安全
    }
  }

  return { remove, set };
}

/**
 * 產生「整頁刪除（含 notion）」的 cleanup 計劃。
 *
 * 行為：
 * - canonical key 若存在於 snapshot：加入 remove
 * - legacy keys（snapshot 存在的）：一律加入 remove
 * - set：恆為空物件
 *
 * @param {import('./HighlightLookupResolver.js').HighlightLookupContract} contract
 * @param {Record<string, any>} snapshot
 * @returns {HighlightCleanupPlan}
 */
export function planDeleteCleanup(contract, snapshot) {
  if (!contract || typeof contract !== 'object') {
    throw new TypeError('[highlightCleanupHelper] contract 必須是 object');
  }

  const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const target = contract.mutationTargetKey;
  const remove = _existingLegacyKeysSorted(contract, safeSnapshot);

  if (
    target &&
    safeSnapshot[target] !== undefined &&
    safeSnapshot[target] !== null &&
    !remove.includes(target)
  ) {
    remove.push(target);
    remove.sort(compareKeysAlphabetically);
  }

  return { remove, set: {} };
}
