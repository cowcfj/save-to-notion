/**
 * Runtime message action registry
 *
 * 集中管理 extension 內部所有透過 `chrome.runtime.sendMessage()` /
 * `chrome.tabs.sendMessage()` 傳遞的 action 名稱，避免 magic string 漂移。
 */

/**
 * @typedef {object} CheckPageStatusRequest
 * @property {'checkPageStatus'} action
 * @property {boolean} [forceRefresh]
 */

/**
 * @typedef {object} CheckPageStatusResponse
 * @property {boolean} success
 * @property {boolean} [isSaved]
 * @property {string} [notionPageId]
 * @property {string} [notionUrl]
 * @property {string} [stableUrl]
 * @property {boolean} [wasDeleted]
 * @property {string} [error]
 */

/**
 * @typedef {object} SavePageFromToolbarRequest
 * @property {'SAVE_PAGE_FROM_TOOLBAR'} action
 */

/**
 * @typedef {object} SavePageFromToolbarResponse
 * @property {boolean} success
 * @property {string} [error]
 * @property {string} [url]
 * @property {string} [pageId]
 * @property {string} [notionPageId]
 */

/**
 * @typedef {object} SyncHighlightsRequest
 * @property {'syncHighlights'} action
 * @property {Array<object>} highlights
 */

/**
 * @typedef {object} SyncHighlightsResponse
 * @property {boolean} success
 * @property {number} [count]
 * @property {boolean} [highlightsUpdated]
 * @property {string} [errorCode]
 * @property {string} [error]
 */

/**
 * @typedef {object} OpenSidePanelRequest
 * @property {'OPEN_SIDE_PANEL'} action
 * @property {number} [tabId]
 */

/**
 * @typedef {object} OpenSidePanelResponse
 * @property {boolean} success
 * @property {string} [error]
 */

/**
 * @typedef {object} UpdateHighlightsRequest
 * @property {'UPDATE_HIGHLIGHTS'} action
 * @property {string} url
 * @property {Array<object>} highlights
 */

/**
 * @typedef {object} UpdateHighlightsResponse
 * @property {boolean} success
 * @property {string} [error]
 */

/**
 * @typedef {object} ClearHighlightsRequest
 * @property {'CLEAR_HIGHLIGHTS'} action
 * @property {string} [url]
 * @property {number} [tabId]
 */

/**
 * @typedef {object} ClearHighlightsResponse
 * @property {boolean} success
 * @property {number} [clearedCount]
 * @property {boolean} [visualCleared]
 * @property {string} [error]
 */

/**
 * @typedef {object} SetStableUrlRequest
 * @property {'SET_STABLE_URL'} action
 * @property {string} stableUrl
 */

/**
 * @typedef {object} SetStableUrlResponse
 * @property {boolean} [success]
 * @property {string} [error]
 */

/**
 * @typedef {object} ShowToolbarRequest
 * @property {'showToolbar'} action
 */

/**
 * @typedef {object} ShowToolbarResponse
 * @property {boolean} success
 * @property {string} [error]
 */

/**
 * @typedef {object} GetStableUrlRequest
 * @property {'GET_STABLE_URL'} action
 */

/**
 * @typedef {object} GetStableUrlResponse
 * @property {string|undefined} stableUrl
 */

/**
 * @typedef {object} ToggleHighlighterRequest
 * @property {'toggleHighlighter'} action
 */

/**
 * @typedef {object} ToggleHighlighterResponse
 * @property {boolean} success
 * @property {boolean} [isActive]
 * @property {string} [error]
 */

/**
 * @typedef {object} PageSaveHintRequest
 * @property {'PAGE_SAVE_HINT'} action
 * @property {boolean} isSaved
 */

/**
 * @typedef {object} PageSaveHintResponse
 * @property {boolean} [success]
 */

export const RUNTIME_ACTIONS = Object.freeze({
  /**
   * Request: {@link CheckPageStatusRequest}
   * Response: {@link CheckPageStatusResponse}
   *
   * @type {CheckPageStatusRequest['action']}
   */
  CHECK_PAGE_STATUS: 'checkPageStatus',
  SAVE_PAGE: 'savePage',
  OPEN_NOTION_PAGE: 'openNotionPage',
  CHECK_NOTION_PAGE_EXISTS: 'checkNotionPageExists',
  START_HIGHLIGHT: 'startHighlight',
  USER_ACTIVATE_SHORTCUT: 'USER_ACTIVATE_SHORTCUT',
  /**
   * Request: {@link SavePageFromToolbarRequest}
   * Response: {@link SavePageFromToolbarResponse}
   *
   * @type {SavePageFromToolbarRequest['action']}
   */
  SAVE_PAGE_FROM_TOOLBAR: 'SAVE_PAGE_FROM_TOOLBAR',
  /**
   * Request: {@link SyncHighlightsRequest}
   * Response: {@link SyncHighlightsResponse}
   *
   * @type {SyncHighlightsRequest['action']}
   */
  SYNC_HIGHLIGHTS: 'syncHighlights',
  /**
   * Request: {@link OpenSidePanelRequest}
   * Response: {@link OpenSidePanelResponse}
   *
   * @type {OpenSidePanelRequest['action']}
   */
  OPEN_SIDE_PANEL: 'OPEN_SIDE_PANEL',
  UPDATE_REMOTE_HIGHLIGHTS: 'updateHighlights',
  /**
   * Request: {@link UpdateHighlightsRequest}
   * Response: {@link UpdateHighlightsResponse}
   *
   * @type {UpdateHighlightsRequest['action']}
   */
  UPDATE_HIGHLIGHTS: 'UPDATE_HIGHLIGHTS',
  /**
   * Request: {@link ClearHighlightsRequest}
   * Response: {@link ClearHighlightsResponse}
   *
   * @type {ClearHighlightsRequest['action']}
   */
  CLEAR_HIGHLIGHTS: 'CLEAR_HIGHLIGHTS',
  SEARCH_NOTION: 'searchNotion',
  REFRESH_OAUTH_TOKEN: 'refreshOAuthToken',
  EXPORT_DEBUG_LOGS: 'exportDebugLogs',
  DEV_LOG_SINK: 'devLogSink',
  DEV_LOG_SINK_BATCH: 'devLogSinkBatch',
  MIGRATION_EXECUTE: 'migration_execute',
  MIGRATION_DELETE: 'migration_delete',
  MIGRATION_BATCH: 'migration_batch',
  MIGRATION_BATCH_DELETE: 'migration_batch_delete',
  MIGRATION_GET_PENDING: 'migration_get_pending',
  MIGRATION_DELETE_FAILED: 'migration_delete_failed',
  /**
   * Request: {@link SetStableUrlRequest}
   * Response: {@link SetStableUrlResponse}
   *
   * @type {SetStableUrlRequest['action']}
   */
  SET_STABLE_URL: 'SET_STABLE_URL',
  /**
   * Request: {@link ShowToolbarRequest}
   * Response: {@link ShowToolbarResponse}
   *
   * @type {ShowToolbarRequest['action']}
   */
  SHOW_TOOLBAR: 'showToolbar',
  /**
   * Request: {@link GetStableUrlRequest}
   * Response: {@link GetStableUrlResponse}
   *
   * @type {GetStableUrlRequest['action']}
   */
  GET_STABLE_URL: 'GET_STABLE_URL',
  /**
   * Request: {@link ToggleHighlighterRequest}
   * Response: {@link ToggleHighlighterResponse}
   *
   * @type {ToggleHighlighterRequest['action']}
   */
  TOGGLE_HIGHLIGHTER: 'toggleHighlighter',
  /**
   * Request: {@link PageSaveHintRequest}
   * Response: {@link PageSaveHintResponse}
   *
   * @type {PageSaveHintRequest['action']}
   */
  PAGE_SAVE_HINT: 'PAGE_SAVE_HINT',
  SHOW_HIGHLIGHTER: 'showHighlighter',
  REMOVE_HIGHLIGHT_DOM: 'REMOVE_HIGHLIGHT_DOM',
  PING: 'PING',
  INIT_BUNDLE: 'INIT_BUNDLE',
  REPLAY_BUFFERED_EVENTS: 'REPLAY_BUFFERED_EVENTS',
  OAUTH_SUCCESS: 'oauth_success',
  OAUTH_FAILED: 'oauth_failed',
});

export const RUNTIME_ERROR_MESSAGES = Object.freeze({
  EXTENSION_UNAVAILABLE: '無法連接擴展',
});
