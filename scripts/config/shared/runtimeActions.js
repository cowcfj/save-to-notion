/**
 * Shared runtime actions registry
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

const PAGE_STATUS_ACTIONS = {
  CHECK_PAGE_STATUS: 'checkPageStatus',
  PAGE_SAVE_HINT: 'PAGE_SAVE_HINT',
  GET_STABLE_URL: 'GET_STABLE_URL',
  SET_STABLE_URL: 'SET_STABLE_URL',
};

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

const SAVE_ACTIONS = {
  SAVE_PAGE: 'savePage',
  SAVE_PAGE_FROM_TOOLBAR: 'SAVE_PAGE_FROM_TOOLBAR',
  OPEN_NOTION_PAGE: 'openNotionPage',
  CHECK_NOTION_PAGE_EXISTS: 'checkNotionPageExists',
  SEARCH_NOTION: 'searchNotion',
};

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

const HIGHLIGHT_ACTIONS = {
  START_HIGHLIGHT: 'startHighlight',
  SYNC_HIGHLIGHTS: 'syncHighlights',
  UPDATE_REMOTE_HIGHLIGHTS: 'updateHighlights',
  UPDATE_HIGHLIGHTS: 'UPDATE_HIGHLIGHTS',
  CLEAR_HIGHLIGHTS: 'CLEAR_HIGHLIGHTS',
  SHOW_TOOLBAR: 'showToolbar',
  TOGGLE_HIGHLIGHTER: 'toggleHighlighter',
  SHOW_HIGHLIGHTER: 'showHighlighter',
  REMOVE_HIGHLIGHT_DOM: 'REMOVE_HIGHLIGHT_DOM',
  USER_ACTIVATE_SHORTCUT: 'USER_ACTIVATE_SHORTCUT',
};

/**
 * @typedef {object} MigrationExecuteRequest
 * @property {'migration_execute'} action
 * @property {string} url
 */

/**
 * @typedef {object} MigrationExecuteResponse
 * @property {boolean} success
 * @property {string} [error]
 */

/**
 * @typedef {object} MigrationDeleteRequest
 * @property {'migration_delete'} action
 * @property {string} url
 */

/**
 * @typedef {object} MigrationDeleteResponse
 * @property {boolean} success
 * @property {string} [message]
 * @property {string} [error]
 */

/**
 * @typedef {object} MigrationBatchItemResult
 * @property {string} [url]
 * @property {string} [status]
 * @property {number} [count]
 * @property {string} [reason]
 */

/**
 * @typedef {object} MigrationBatchSummary
 * @property {number} success
 * @property {number} failed
 * @property {Array<MigrationBatchItemResult>} details
 */

/**
 * @typedef {object} MigrationBatchRequest
 * @property {'migration_batch'} action
 * @property {string[]} urls
 */

/**
 * @typedef {object} MigrationBatchResponse
 * @property {boolean} success
 * @property {MigrationBatchSummary} [results]
 * @property {string} [error]
 */

/**
 * @typedef {object} MigrationBatchDeleteRequest
 * @property {'migration_batch_delete'} action
 * @property {string[]} urls
 */

/**
 * @typedef {object} MigrationBatchDeleteResponse
 * @property {boolean} success
 * @property {number} [count]
 * @property {string} [error]
 */

/**
 * @typedef {object} MigrationPendingItem
 * @property {string} url
 * @property {number} totalCount
 * @property {number} pendingCount
 */

/**
 * @typedef {object} MigrationFailedItem
 * @property {string} url
 * @property {number} totalCount
 * @property {number} failedCount
 */

/**
 * @typedef {object} MigrationGetPendingRequest
 * @property {'migration_get_pending'} action
 */

/**
 * @typedef {object} MigrationGetPendingResponse
 * @property {boolean} success
 * @property {Array<MigrationPendingItem>} [items]
 * @property {Array<MigrationFailedItem>} [failedItems]
 * @property {number} [totalPages]
 * @property {number} [totalPending]
 * @property {number} [totalFailed]
 * @property {string} [error]
 */

/**
 * @typedef {object} MigrationDeleteFailedRequest
 * @property {'migration_delete_failed'} action
 * @property {string} url
 */

/**
 * @typedef {object} MigrationDeleteFailedResponse
 * @property {boolean} success
 * @property {number} [deletedCount]
 * @property {string} [error]
 */

const MIGRATION_ACTIONS = {
  MIGRATION_EXECUTE: 'migration_execute',
  MIGRATION_DELETE: 'migration_delete',
  MIGRATION_BATCH: 'migration_batch',
  MIGRATION_BATCH_DELETE: 'migration_batch_delete',
  MIGRATION_GET_PENDING: 'migration_get_pending',
  MIGRATION_DELETE_FAILED: 'migration_delete_failed',
};

/**
 * @typedef {object} OAuthSuccessRequest
 * @property {'oauth_success'} action
 */

/**
 * @typedef {object} OAuthSuccessResponse
 * @property {boolean} [success]
 */

/**
 * @typedef {object} OAuthFailedRequest
 * @property {'oauth_failed'} action
 */

/**
 * @typedef {object} OAuthFailedResponse
 * @property {boolean} [success]
 */

/**
 * @typedef {object} AccountSessionUpdatedRequest
 * @property {'account_session_updated'} action
 * @property {string} userId
 * @property {string} email
 */

/**
 * @typedef {object} AccountSessionUpdatedResponse
 * @property {boolean} [success]
 */

/**
 * @typedef {object} AccountSessionClearedRequest
 * @property {'account_session_cleared'} action
 */

/**
 * @typedef {object} AccountSessionClearedResponse
 * @property {boolean} [success]
 */

const AUTH_ACTIONS = {
  OAUTH_SUCCESS: 'oauth_success',
  OAUTH_FAILED: 'oauth_failed',
  REFRESH_OAUTH_TOKEN: 'refreshOAuthToken',
  ACCOUNT_SESSION_UPDATED: 'account_session_updated',
  ACCOUNT_SESSION_CLEARED: 'account_session_cleared',
};

/**
 * @typedef {object} DriveSyncStatusUpdatedRequest
 * @property {'DRIVE_SYNC_STATUS_UPDATED'} action
 * @property {string | null} lastKnownRemoteUpdatedAt
 * @property {string | null} lastSuccessfulUploadAt
 */

/**
 * @typedef {object} DriveSyncStatusUpdatedResponse
 * @property {boolean} [success]
 */

/**
 * @typedef {object} DriveSyncManualUploadRequest
 * @property {'DRIVE_SYNC_MANUAL_UPLOAD'} action
 * @property {boolean} [force]
 */

/**
 * @typedef {object} DriveSyncManualUploadResponse
 * @property {boolean} success
 * @property {string} [error]
 * @property {string} [errorCode]
 * @property {string | null} [remoteUpdatedAt]
 * @property {string | null} [updatedAt]
 */

/**
 * @typedef {object} DriveSyncManualDownloadRequest
 * @property {'DRIVE_SYNC_MANUAL_DOWNLOAD'} action
 */

/**
 * @typedef {object} DriveSyncManualDownloadResponse
 * @property {boolean} success
 * @property {string} [error]
 * @property {number} [writtenKeys]
 */

/**
 * @typedef {object} DriveSyncConflictRequest
 * @property {'DRIVE_SYNC_CONFLICT'} action
 * @property {'REMOTE_SNAPSHOT_NEWER'} conflictType
 * @property {string} remoteUpdatedAt
 */

/**
 * @typedef {object} DriveSyncConflictResponse
 * @property {boolean} [success]
 */

/**
 * @typedef {object} DriveSyncScheduleUpdatedRequest
 * @property {'DRIVE_SYNC_SCHEDULE_UPDATED'} action
 * @property {'off' | 'daily' | 'weekly' | 'monthly'} frequency
 */

/**
 * @typedef {object} DriveSyncScheduleUpdatedResponse
 * @property {boolean} [success]
 */

const DRIVE_SYNC_ACTIONS = {
  DRIVE_SYNC_STATUS_UPDATED: 'DRIVE_SYNC_STATUS_UPDATED',
  DRIVE_SYNC_MANUAL_UPLOAD: 'DRIVE_SYNC_MANUAL_UPLOAD',
  DRIVE_SYNC_MANUAL_DOWNLOAD: 'DRIVE_SYNC_MANUAL_DOWNLOAD',
  DRIVE_SYNC_CONFLICT: 'DRIVE_SYNC_CONFLICT',
  DRIVE_SYNC_SCHEDULE_UPDATED: 'DRIVE_SYNC_SCHEDULE_UPDATED',
};

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

const SIDEPANEL_ACTIONS = {
  OPEN_SIDE_PANEL: 'OPEN_SIDE_PANEL',
};

const DIAGNOSTICS_ACTIONS = {
  EXPORT_DEBUG_LOGS: 'exportDebugLogs',
  DEV_LOG_SINK: 'devLogSink',
  DEV_LOG_SINK_BATCH: 'devLogSinkBatch',
  PING: 'PING',
  INIT_BUNDLE: 'INIT_BUNDLE',
  REPLAY_BUFFERED_EVENTS: 'REPLAY_BUFFERED_EVENTS',
};

export const RUNTIME_ACTIONS = Object.freeze({
  ...PAGE_STATUS_ACTIONS,
  ...SAVE_ACTIONS,
  ...HIGHLIGHT_ACTIONS,
  ...MIGRATION_ACTIONS,
  ...AUTH_ACTIONS,
  ...DRIVE_SYNC_ACTIONS,
  ...SIDEPANEL_ACTIONS,
  ...DIAGNOSTICS_ACTIONS,
});

export const RUNTIME_ERROR_MESSAGES = Object.freeze({
  EXTENSION_UNAVAILABLE: '無法連接擴展',
});
