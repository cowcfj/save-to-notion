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

const CLEAR_CANONICAL_ACTION = Object.freeze({
  NONE: 'none',
  REMOVE: 'remove',
  SET: 'set',
});

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
    .filter(key => key !== target)
    .filter(key => _hasSnapshotValue(snapshot, key))
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
  return _isPageStateObject(value) ? value : null;
}

/**
 * @param {Record<string, any>} snapshot
 * @param {string} key
 * @returns {boolean}
 * @private
 */
function _hasSnapshotValue(snapshot, key) {
  return snapshot[key] != null;
}

/**
 * @param {any} value
 * @returns {boolean}
 * @private
 */
function _isObjectValue(value) {
  return ![Object(value) === value, typeof value !== 'function'].includes(false);
}

/**
 * @param {any} contract
 * @returns {void}
 * @private
 */
function _assertCleanupContract(contract) {
  if (!_isObjectValue(contract)) {
    throw new TypeError('[highlightCleanupHelper] contract 必須是 object');
  }
}

/**
 * @param {any} value
 * @returns {boolean}
 * @private
 */
function _isPageStateObject(value) {
  return ![_isObjectValue(value), !Array.isArray(value)].includes(false);
}

/**
 * @param {any} value
 * @returns {Record<string, any>}
 * @private
 */
function _normalizeSnapshot(value) {
  return _isPageStateObject(value) ? value : {};
}

/**
 * @param {object|null} pageState
 * @returns {boolean}
 * @private
 */
function _hasNotionState(pageState) {
  return Boolean(pageState?.notion);
}

/**
 * @param {object} pageState
 * @returns {object}
 * @private
 */
function _buildClearedPageState(pageState) {
  return {
    ...pageState,
    highlights: [],
    metadata: { ...pageState.metadata, lastUpdated: Date.now() },
  };
}

/**
 * @param {string[]} remove
 * @param {string} target
 * @returns {string[]}
 * @private
 */
function _withSortedRemoveTarget(remove, target) {
  return [...remove, target].toSorted(compareKeysAlphabetically);
}

/**
 * @param {string[]} remove
 * @param {Record<string, any>} set
 * @returns {HighlightCleanupPlan}
 * @private
 */
function _keepClearPlan(remove, set) {
  return { remove, set };
}

/**
 * @param {string[]} remove
 * @param {Record<string, any>} set
 * @param {string} target
 * @param {object} canonical
 * @returns {HighlightCleanupPlan}
 * @private
 */
function _setClearedCanonicalPlan(remove, set, target, canonical) {
  return {
    remove,
    set: {
      ...set,
      [target]: _buildClearedPageState(canonical),
    },
  };
}

/**
 * @param {string[]} remove
 * @param {Record<string, any>} set
 * @param {string} target
 * @returns {HighlightCleanupPlan}
 * @private
 */
function _removeCanonicalPlan(remove, set, target) {
  return { remove: _withSortedRemoveTarget(remove, target), set };
}

const CLEAR_CANONICAL_PLAN_BUILDERS = Object.freeze({
  [CLEAR_CANONICAL_ACTION.NONE]: ({ remove, set }) => _keepClearPlan(remove, set),
  [CLEAR_CANONICAL_ACTION.SET]: ({ remove, set, target, canonical }) =>
    _setClearedCanonicalPlan(remove, set, target, canonical),
  [CLEAR_CANONICAL_ACTION.REMOVE]: ({ remove, set, target }) =>
    _removeCanonicalPlan(remove, set, target),
});

const CLEAR_CANONICAL_ACTION_RULES = Object.freeze([
  { action: CLEAR_CANONICAL_ACTION.NONE, matches: canonical => canonical === null },
  { action: CLEAR_CANONICAL_ACTION.SET, matches: _hasNotionState },
  { action: CLEAR_CANONICAL_ACTION.REMOVE, matches: () => true },
]);

/**
 * @param {object|null} canonical
 * @returns {string}
 * @private
 */
function _resolveClearCanonicalAction(canonical) {
  const rule = CLEAR_CANONICAL_ACTION_RULES.find(({ matches }) => matches(canonical));
  return rule.action;
}

/**
 * @param {object} context
 * @param {object|null} context.canonical
 * @param {string[]} context.remove
 * @param {Record<string, any>} context.set
 * @param {string} context.target
 * @returns {HighlightCleanupPlan}
 * @private
 */
function _buildClearPlanForCanonical(context) {
  const action = _resolveClearCanonicalAction(context.canonical);
  return CLEAR_CANONICAL_PLAN_BUILDERS[action](context);
}

/**
 * @param {Record<string, any>} snapshot
 * @param {string} target
 * @param {string[]} remove
 * @returns {boolean}
 * @private
 */
function _shouldRemoveCanonicalTarget(snapshot, target, remove) {
  return ![Boolean(target), _hasSnapshotValue(snapshot, target), !remove.includes(target)].includes(
    false
  );
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
  _assertCleanupContract(contract);

  const safeSnapshot = _normalizeSnapshot(snapshot);
  const target = contract.mutationTargetKey;
  const remove = _existingLegacyKeysSorted(contract, safeSnapshot);
  /** @type {Record<string, any>} */
  const set = {};

  const canonical = _normalizePageObject(safeSnapshot[target]);
  return _buildClearPlanForCanonical({ canonical, remove, set, target });
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
  _assertCleanupContract(contract);

  const safeSnapshot = _normalizeSnapshot(snapshot);
  const target = contract.mutationTargetKey;
  let remove = _existingLegacyKeysSorted(contract, safeSnapshot);

  if (_shouldRemoveCanonicalTarget(safeSnapshot, target, remove)) {
    remove = _withSortedRemoveTarget(remove, target);
  }

  return { remove, set: {} };
}
