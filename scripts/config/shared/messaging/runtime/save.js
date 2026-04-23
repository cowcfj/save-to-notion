/**
 * Save Page Actions
 */

/**
 * @typedef {object} SavePageRequest
 * @property {'savePage'} action
 */

/**
 * @typedef {object} SavePageResponse
 * @property {boolean} success
 * @property {'saved'|'unsaved'|'deletion_pending'|'deleted_remote'|'unverified_saved'|'error'} [statusKind]
 * @property {boolean} [isSaved]
 * @property {boolean} [canSave]
 * @property {boolean} [canSyncHighlights]
 * @property {string} [stableUrl]
 * @property {string} [url]
 * @property {string} [pageId]
 * @property {string} [notionPageId]
 * @property {string} [notionUrl]
 * @property {string} [title]
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
 * @property {'saved'|'unsaved'|'deletion_pending'|'deleted_remote'|'unverified_saved'|'error'} [statusKind]
 * @property {boolean} [isSaved]
 * @property {boolean} [canSave]
 * @property {boolean} [canSyncHighlights]
 * @property {string} [stableUrl]
 * @property {string} [url]
 * @property {string} [pageId]
 * @property {string} [notionPageId]
 * @property {string} [notionUrl]
 * @property {string} [title]
 */

/**
 * @typedef {object} OpenNotionPageRequest
 * @property {'openNotionPage'} action
 * @property {string} url
 */

/**
 * @typedef {object} OpenNotionPageResponse
 * @property {boolean} success
 * @property {number} [tabId]
 * @property {string} [error]
 */

export const SAVE_ACTIONS = {
  /**
   * Request: {@link SavePageRequest}
   * Response: {@link SavePageResponse}
   *
   * @type {SavePageRequest['action']}
   */
  SAVE_PAGE: 'savePage',
  /**
   * Request: {@link SavePageFromToolbarRequest}
   * Response: {@link SavePageFromToolbarResponse}
   *
   * @type {SavePageFromToolbarRequest['action']}
   */
  SAVE_PAGE_FROM_TOOLBAR: 'SAVE_PAGE_FROM_TOOLBAR',
  /**
   * Request: {@link OpenNotionPageRequest}
   * Response: {@link OpenNotionPageResponse}
   *
   * @type {OpenNotionPageRequest['action']}
   */
  OPEN_NOTION_PAGE: 'openNotionPage',
  CHECK_NOTION_PAGE_EXISTS: 'checkNotionPageExists',
  SEARCH_NOTION: 'searchNotion',
};
