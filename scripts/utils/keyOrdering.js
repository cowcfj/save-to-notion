/**
 * keyOrdering — storage key 排序語意的單一來源
 *
 * 動機：
 * 多個模組對 storage key 清單承諾「固定字典序」並在 log / test / diff
 * 中對此排序結果做斷言：
 * - scripts/highlighter/core/highlightCleanupHelper.js
 *   （planDeleteCleanup / planClearCleanup / _existingLegacyKeysSorted）
 * - sidepanel/sidepanel.js（_collectDeletionKeys）
 * - scripts/background/services/StorageService.js（updateHighlights cleanup）
 * - options/storageDataUtils.js（_sortKeys → _deepEqual canonical form）
 *
 * 為避免各 caller 自己寫 inline arrow 而造成 locale options drift
 * （一邊有 numeric: true、另一邊沒有，靜默產出不同順序），把
 * comparator 集中於本檔，所有 caller 一律 import 使用。
 *
 * 設計選擇：
 * - 鎖 'en' locale，避免 runtime locale 影響排序（土耳其 i、瑞典 å…）。
 * - sensitivity: 'variant' 顯式宣告區分大小寫與重音。
 * - numeric: true 提供自然排序（item_2 < item_10），對純 hash/URL key 無副作用。
 *
 * 輸入型別契約：呼叫端必須保證 key 為 string；本函式不做防呆 String(...)
 * 強制轉型，以免 mask 上游錯誤。
 *
 * @module utils/keyOrdering
 */

/**
 * Storage key 字母序 comparator。
 *
 * @param {string} keyA
 * @param {string} keyB
 * @returns {number}
 */
export function compareKeysAlphabetically(keyA, keyB) {
  return keyA.localeCompare(keyB, 'en', {
    sensitivity: 'variant',
    numeric: true,
  });
}
