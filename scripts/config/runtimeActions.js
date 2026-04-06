/**
 * Runtime message action registry
 *
 * 集中管理 content script / background 之間共用的 runtime action 名稱，
 * 避免散落的 magic string 在多處漂移。
 */

export const RUNTIME_ACTIONS = Object.freeze({
  CHECK_PAGE_STATUS: 'checkPageStatus',
  SAVE_PAGE_FROM_TOOLBAR: 'SAVE_PAGE_FROM_TOOLBAR',
  SYNC_HIGHLIGHTS: 'syncHighlights',
  OPEN_SIDE_PANEL: 'OPEN_SIDE_PANEL',
  UPDATE_HIGHLIGHTS: 'UPDATE_HIGHLIGHTS',
  CLEAR_HIGHLIGHTS: 'CLEAR_HIGHLIGHTS',
  SET_STABLE_URL: 'SET_STABLE_URL',
  SHOW_TOOLBAR: 'showToolbar',
  GET_STABLE_URL: 'GET_STABLE_URL',
  TOGGLE_HIGHLIGHTER: 'toggleHighlighter',
  PAGE_SAVE_HINT: 'PAGE_SAVE_HINT',
});

export const RUNTIME_ERROR_MESSAGES = Object.freeze({
  EXTENSION_UNAVAILABLE: '無法連接擴展',
});
