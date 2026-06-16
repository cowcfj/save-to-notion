/**
 * Highlighter 專用 runtime actions
 *
 * 供 highlighter runtime、floating rail 與 highlight storage 等路徑使用（包含 legacy toolbar 相容接口）。
 */
export const HIGHLIGHTER_ACTIONS = Object.freeze({
  SHOW_TOOLBAR: 'showToolbar',
  SHOW_HIGHLIGHTER: 'showHighlighter',
  START_HIGHLIGHT: 'startHighlight',

  // Highlight sync/update actions (容易混淆，請參考各自用途)：
  // - SYNC_HIGHLIGHTS: content script 發起，將 highlights 推送到 Notion remote
  // - UPDATE_REMOTE_HIGHLIGHTS: background 發起，從 active tab 收集 highlights 後推送到 Notion remote (legacy，可能無實際呼叫端)
  // - UPDATE_HIGHLIGHTS: content script 發起，純粹更新 local storage (不涉及 remote)
  SYNC_HIGHLIGHTS: 'syncHighlights',
  UPDATE_REMOTE_HIGHLIGHTS: 'updateHighlights',
  UPDATE_HIGHLIGHTS: 'UPDATE_HIGHLIGHTS',

  CLEAR_HIGHLIGHTS: 'CLEAR_HIGHLIGHTS',
  REMOVE_HIGHLIGHT_DOM: 'REMOVE_HIGHLIGHT_DOM',
  SHOW_FLOATING_RAIL: 'SHOW_FLOATING_RAIL',
  ACTIVATE_FLOATING_RAIL_HIGHLIGHT: 'ACTIVATE_FLOATING_RAIL_HIGHLIGHT',
});
