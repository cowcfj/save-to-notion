/**
 * Highlighter 專用 runtime actions
 *
 * 供 highlighter runtime、toolbar 與 highlight storage 路徑使用。
 */
export const HIGHLIGHTER_ACTIONS = Object.freeze({
  SHOW_TOOLBAR: 'showToolbar',
  SHOW_HIGHLIGHTER: 'showHighlighter',
  TOGGLE_HIGHLIGHTER: 'toggleHighlighter',
  START_HIGHLIGHT: 'startHighlight',
  SYNC_HIGHLIGHTS: 'syncHighlights',
  UPDATE_HIGHLIGHTS: 'UPDATE_HIGHLIGHTS',
  CLEAR_HIGHLIGHTS: 'CLEAR_HIGHLIGHTS',
  REMOVE_HIGHLIGHT_DOM: 'REMOVE_HIGHLIGHT_DOM',
});
