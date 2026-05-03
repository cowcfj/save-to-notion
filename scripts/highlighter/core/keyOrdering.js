/**
 * keyOrdering — storage key 排序語意的單一來源
 *
 * 動機：
 * highlightCleanupHelper.planDeleteCleanup / planClearCleanup 與
 * sidepanel._collectDeletionKeys 都對外承諾「remove 清單採固定字典序」，
 * 並且這個契約在 log/test/diff 中被斷言。為避免兩處 caller 各自寫
 * inline arrow 而造成 locale options drift（一邊有 numeric: true、
 * 另一邊沒有，靜默產出不同順序），把 comparator 集中於本檔。
 *
 * 設計選擇：
 * - 鎖 'en' locale，避免 runtime locale 影響排序（土耳其 i、瑞典 å…）。
 * - sensitivity: 'variant' 顯式宣告區分大小寫與重音。
 * - numeric: true 提供自然排序（item_2 < item_10），對純 hash/URL key 無副作用。
 *
 * 輸入型別契約：呼叫端必須保證 key 為 string；本函式不做防呆 String(...)
 * 強制轉型，以免 mask 上游錯誤。
 *
 * @module core/keyOrdering
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
