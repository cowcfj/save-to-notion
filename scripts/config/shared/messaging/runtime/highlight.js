/**
 * Highlight Actions
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
 * @property {number} [highlightCount]
 * @property {string} [message]
 * @property {boolean} [highlightsUpdated]
 * @property {string} [errorCode]
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
 * @property {{code?: string, message?: string}|string} [error]
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
 * @property {{code?: string, message?: string}|string} [error]
 */

/**
 * @typedef {object} UpdateRemoteHighlightsRequest
 * @property {'updateHighlights'} action
 * @property {Array<object>} [highlights]
 */

/**
 * @typedef {object} UpdateRemoteHighlightsResponse
 * @property {boolean} success
 * @property {boolean} [highlightsUpdated]
 * @property {number} [highlightCount]
 * @property {string} [errorCode]
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
 * @typedef {object} UserActivateShortcutRequest
 * @property {'USER_ACTIVATE_SHORTCUT'} action
 */

/**
 * @typedef {object} UserActivateShortcutResponse
 * @property {boolean} success
 * @property {object|string} [response]
 * @property {string} [error]
 */

export const HIGHLIGHT_ACTIONS = {
  START_HIGHLIGHT: 'startHighlight',
  /**
   * Request: {@link SyncHighlightsRequest}
   * Response: {@link SyncHighlightsResponse}
   *
   * @type {SyncHighlightsRequest['action']}
   */
  SYNC_HIGHLIGHTS: 'syncHighlights',
  /**
   * Request: {@link UpdateRemoteHighlightsRequest}
   * Response: {@link UpdateRemoteHighlightsResponse}
   *
   * @type {UpdateRemoteHighlightsRequest['action']}
   */
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
  /**
   * Request: {@link ShowToolbarRequest}
   * Response: {@link ShowToolbarResponse}
   *
   * @type {ShowToolbarRequest['action']}
   */
  SHOW_TOOLBAR: 'showToolbar',
  /**
   * Request: {@link ToggleHighlighterRequest}
   * Response: {@link ToggleHighlighterResponse}
   *
   * @type {ToggleHighlighterRequest['action']}
   */
  TOGGLE_HIGHLIGHTER: 'toggleHighlighter',
  SHOW_HIGHLIGHTER: 'showHighlighter',
  REMOVE_HIGHLIGHT_DOM: 'REMOVE_HIGHLIGHT_DOM',
  /**
   * Request: {@link UserActivateShortcutRequest}
   * Response: {@link UserActivateShortcutResponse}
   *
   * @type {UserActivateShortcutRequest['action']}
   */
  USER_ACTIVATE_SHORTCUT: 'USER_ACTIVATE_SHORTCUT',
};
