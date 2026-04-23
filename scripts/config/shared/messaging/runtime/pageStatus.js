/**
 * Page Status Actions
 */

/**
 * @typedef {object} CheckPageStatusRequest
 * @property {'checkPageStatus'} action
 * @property {boolean} [forceRefresh]
 */

/**
 * @typedef {object} CheckPageStatusResponse
 * @property {boolean} success
 * @property {'saved'|'unsaved'|'deletion_pending'|'deleted_remote'|'unverified_saved'|'error'} [statusKind]
 * @property {boolean} [isSaved]
 * @property {boolean} [canSave]
 * @property {boolean} [canSyncHighlights]
 * @property {string} [notionPageId]
 * @property {string} [notionUrl]
 * @property {string} [title]
 * @property {string} [stableUrl]
 * @property {boolean} [deletionPending]
 * @property {boolean} [wasDeleted]
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

/**
 * @typedef {object} GetStableUrlRequest
 * @property {'GET_STABLE_URL'} action
 */

/**
 * @typedef {object} GetStableUrlResponse
 * @property {string|undefined} stableUrl
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

export const PAGE_STATUS_ACTIONS = {
  /**
   * Request: {@link CheckPageStatusRequest}
   * Response: {@link CheckPageStatusResponse}
   *
   * @type {CheckPageStatusRequest['action']}
   */
  CHECK_PAGE_STATUS: 'checkPageStatus',
  /**
   * Request: {@link PageSaveHintRequest}
   * Response: {@link PageSaveHintResponse}
   *
   * @type {PageSaveHintRequest['action']}
   */
  PAGE_SAVE_HINT: 'PAGE_SAVE_HINT',
  /**
   * Request: {@link GetStableUrlRequest}
   * Response: {@link GetStableUrlResponse}
   *
   * @type {GetStableUrlRequest['action']}
   */
  GET_STABLE_URL: 'GET_STABLE_URL',
  /**
   * Request: {@link SetStableUrlRequest}
   * Response: {@link SetStableUrlResponse}
   *
   * @type {SetStableUrlRequest['action']}
   */
  SET_STABLE_URL: 'SET_STABLE_URL',
};
