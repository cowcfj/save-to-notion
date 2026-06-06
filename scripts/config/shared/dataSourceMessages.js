/**
 * Shared data source UI messages.
 *
 * Kept as a small leaf module so bundle-sensitive shared config can reference
 * the canonical data source copy without importing the full UI_MESSAGES registry.
 */

export const DATA_SOURCE_MESSAGES = Object.freeze({
  LOADING: '正在載入保存目標列表...',
  SEARCHING: keyword => `正在搜尋 "${keyword}"...`,
  SELECT_REMINDER: '保存目標已選擇，請點擊保存設置',
  LOAD_SUCCESS: count => `已成功載入 ${count} 個保存目標`,
  FOUND_COUNT: count => `找到 ${count} 個保存目標，請從下拉選單中選擇`,
  NO_RESULT: keyword => `未找到 "${keyword}" 相關的保存目標`,
  NO_DATA_SOURCE_FOUND:
    '未找到任何保存目標。請確保：1) API Key 正確 2) Integration 已連接到頁面或資料庫',
  LOAD_FAILED: error => `載入保存目標失敗: ${error}`,
  DEFAULT_OPTION: '選擇保存目標...',
  SEARCH_PLACEHOLDER: '搜尋保存目標...',
  SEARCHING_PREFIX: '正在搜尋「',
  SEARCHING_SUFFIX: '」...',
  NO_MATCH_FOUND: '未找到匹配的資料來源',
  TRY_DIFFERENT_KEYWORD: '嘗試使用不同的關鍵字搜尋',
  LABEL_DATA_SOURCE: '保存目標',
  LABEL_SEARCH_RESULT: '搜尋結果',
  UNTITLED_PAGE: '未命名頁面',
  UNTITLED_DATA_SOURCE: '未命名資料來源',
  UNKNOWN_ERROR_LOG: '未知錯誤',
});
