import fs from 'node:fs';
import path from 'node:path';
import {
  RUNTIME_ACTIONS,
  RUNTIME_ERROR_MESSAGES,
} from '../../../scripts/config/shared/runtimeActions.js';

describe('runtimeActions', () => {
  test('應集中收錄目前 extension 使用的 runtime action', () => {
    expect(RUNTIME_ACTIONS).toEqual(
      expect.objectContaining({
        SAVE_PAGE: 'savePage',
        OPEN_NOTION_PAGE: 'openNotionPage',
        CHECK_NOTION_PAGE_EXISTS: 'checkNotionPageExists',
        CHECK_PAGE_STATUS: 'checkPageStatus',
        START_HIGHLIGHT: 'startHighlight',
        USER_ACTIVATE_SHORTCUT: 'USER_ACTIVATE_SHORTCUT',
        SAVE_PAGE_FROM_TOOLBAR: 'SAVE_PAGE_FROM_TOOLBAR',
        SYNC_HIGHLIGHTS: 'syncHighlights',
        UPDATE_REMOTE_HIGHLIGHTS: 'updateHighlights',
        UPDATE_HIGHLIGHTS: 'UPDATE_HIGHLIGHTS',
        CLEAR_HIGHLIGHTS: 'CLEAR_HIGHLIGHTS',
        OPEN_SIDE_PANEL: 'OPEN_SIDE_PANEL',
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
        SET_STABLE_URL: 'SET_STABLE_URL',
        SHOW_TOOLBAR: 'showToolbar',
        GET_STABLE_URL: 'GET_STABLE_URL',
        TOGGLE_HIGHLIGHTER: 'toggleHighlighter',
        PAGE_SAVE_HINT: 'PAGE_SAVE_HINT',
        SHOW_HIGHLIGHTER: 'showHighlighter',
        REMOVE_HIGHLIGHT_DOM: 'REMOVE_HIGHLIGHT_DOM',
        PING: 'PING',
        INIT_BUNDLE: 'INIT_BUNDLE',
        REPLAY_BUFFERED_EVENTS: 'REPLAY_BUFFERED_EVENTS',
        OAUTH_SUCCESS: 'oauth_success',
        OAUTH_FAILED: 'oauth_failed',
        // Account session actions（Cloudflare-native，與 Notion OAuth 完整隔離）
        ACCOUNT_SESSION_UPDATED: 'account_session_updated',
        ACCOUNT_SESSION_CLEARED: 'account_session_cleared',
      })
    );
  });

  test('ACCOUNT_SESSION_UPDATED 與 ACCOUNT_SESSION_CLEARED 值不得與任何 Notion OAuth action 衝突', () => {
    const notionOAuthActions = [
      RUNTIME_ACTIONS.OAUTH_SUCCESS,
      RUNTIME_ACTIONS.OAUTH_FAILED,
      RUNTIME_ACTIONS.REFRESH_OAUTH_TOKEN,
    ];
    expect(notionOAuthActions).not.toContain(RUNTIME_ACTIONS.ACCOUNT_SESSION_UPDATED);
    expect(notionOAuthActions).not.toContain(RUNTIME_ACTIONS.ACCOUNT_SESSION_CLEARED);
  });

  test('應維持唯一 action value 並凍結 registry', () => {
    expect(new Set(Object.values(RUNTIME_ACTIONS)).size).toBe(Object.keys(RUNTIME_ACTIONS).length);
    expect(Object.isFrozen(RUNTIME_ACTIONS)).toBe(true);
    expect(Object.isFrozen(RUNTIME_ERROR_MESSAGES)).toBe(true);
  });

  test('應暴露一致命名的 runtime 錯誤訊息', () => {
    expect(RUNTIME_ERROR_MESSAGES).toEqual(
      expect.objectContaining({
        EXTENSION_UNAVAILABLE: '無法連接擴展',
      })
    );
  });

  test('應在聚合 registry 保留具名 action 與 Request/Response typedef 的對照註釋', () => {
    const projectRoot = path.resolve(__dirname, '../../..');
    const registryFile = path.join(projectRoot, 'scripts/config/shared/runtimeActions.js');
    const source = fs.readFileSync(registryFile, 'utf8');
    const actionTypePairs = [
      ['CHECK_PAGE_STATUS', 'CheckPageStatusRequest', 'CheckPageStatusResponse'],
      ['PAGE_SAVE_HINT', 'PageSaveHintRequest', 'PageSaveHintResponse'],
      ['GET_STABLE_URL', 'GetStableUrlRequest', 'GetStableUrlResponse'],
      ['SET_STABLE_URL', 'SetStableUrlRequest', 'SetStableUrlResponse'],
      ['SAVE_PAGE', 'SavePageRequest', 'SavePageResponse'],
      ['SAVE_PAGE_FROM_TOOLBAR', 'SavePageFromToolbarRequest', 'SavePageFromToolbarResponse'],
      ['OPEN_NOTION_PAGE', 'OpenNotionPageRequest', 'OpenNotionPageResponse'],
      ['CHECK_NOTION_PAGE_EXISTS', 'CheckNotionPageExistsRequest', 'CheckNotionPageExistsResponse'],
      ['SEARCH_NOTION', 'SearchNotionRequest', 'SearchNotionResponse'],
      ['START_HIGHLIGHT', 'StartHighlightRequest', 'StartHighlightResponse'],
      ['SYNC_HIGHLIGHTS', 'SyncHighlightsRequest', 'SyncHighlightsResponse'],
      [
        'UPDATE_REMOTE_HIGHLIGHTS',
        'UpdateRemoteHighlightsRequest',
        'UpdateRemoteHighlightsResponse',
      ],
      ['UPDATE_HIGHLIGHTS', 'UpdateHighlightsRequest', 'UpdateHighlightsResponse'],
      ['CLEAR_HIGHLIGHTS', 'ClearHighlightsRequest', 'ClearHighlightsResponse'],
      ['SHOW_TOOLBAR', 'ShowToolbarRequest', 'ShowToolbarResponse'],
      ['TOGGLE_HIGHLIGHTER', 'ToggleHighlighterRequest', 'ToggleHighlighterResponse'],
      ['SHOW_HIGHLIGHTER', 'ShowHighlighterRequest', 'ShowHighlighterResponse'],
      ['REMOVE_HIGHLIGHT_DOM', 'RemoveHighlightDomRequest', 'RemoveHighlightDomResponse'],
      ['USER_ACTIVATE_SHORTCUT', 'UserActivateShortcutRequest', 'UserActivateShortcutResponse'],
      ['MIGRATION_EXECUTE', 'MigrationExecuteRequest', 'MigrationExecuteResponse'],
      ['MIGRATION_DELETE', 'MigrationDeleteRequest', 'MigrationDeleteResponse'],
      ['MIGRATION_BATCH', 'MigrationBatchRequest', 'MigrationBatchResponse'],
      ['MIGRATION_BATCH_DELETE', 'MigrationBatchDeleteRequest', 'MigrationBatchDeleteResponse'],
      ['MIGRATION_GET_PENDING', 'MigrationGetPendingRequest', 'MigrationGetPendingResponse'],
      ['MIGRATION_DELETE_FAILED', 'MigrationDeleteFailedRequest', 'MigrationDeleteFailedResponse'],
      ['OAUTH_SUCCESS', 'OAuthSuccessRequest', 'OAuthSuccessResponse'],
      ['OAUTH_FAILED', 'OAuthFailedRequest', 'OAuthFailedResponse'],
      ['REFRESH_OAUTH_TOKEN', 'RefreshOAuthTokenRequest', 'RefreshOAuthTokenResponse'],
      ['ACCOUNT_SESSION_UPDATED', 'AccountSessionUpdatedRequest', 'AccountSessionUpdatedResponse'],
      ['ACCOUNT_SESSION_CLEARED', 'AccountSessionClearedRequest', 'AccountSessionClearedResponse'],
      [
        'DRIVE_SYNC_STATUS_UPDATED',
        'DriveSyncStatusUpdatedRequest',
        'DriveSyncStatusUpdatedResponse',
      ],
      ['DRIVE_SYNC_MANUAL_UPLOAD', 'DriveSyncManualUploadRequest', 'DriveSyncManualUploadResponse'],
      [
        'DRIVE_SYNC_MANUAL_DOWNLOAD',
        'DriveSyncManualDownloadRequest',
        'DriveSyncManualDownloadResponse',
      ],
      ['DRIVE_SYNC_CONFLICT', 'DriveSyncConflictRequest', 'DriveSyncConflictResponse'],
      [
        'DRIVE_SYNC_SCHEDULE_UPDATED',
        'DriveSyncScheduleUpdatedRequest',
        'DriveSyncScheduleUpdatedResponse',
      ],
      ['OPEN_SIDE_PANEL', 'OpenSidePanelRequest', 'OpenSidePanelResponse'],
      ['EXPORT_DEBUG_LOGS', 'ExportDebugLogsRequest', 'ExportDebugLogsResponse'],
      ['DEV_LOG_SINK', 'DevLogSinkRequest', 'DevLogSinkResponse'],
      ['DEV_LOG_SINK_BATCH', 'DevLogSinkBatchRequest', 'DevLogSinkBatchResponse'],
      ['PING', 'PingRequest', 'PingResponse'],
      ['INIT_BUNDLE', 'InitBundleRequest', 'InitBundleResponse'],
      ['REPLAY_BUFFERED_EVENTS', 'ReplayBufferedEventsRequest', 'ReplayBufferedEventsResponse'],
    ];

    expect(source).toContain('@typedef {object} RuntimeActionsRegistry');
    for (const [actionKey, requestType, responseType] of actionTypePairs) {
      const propertyPattern = new RegExp(
        String.raw`@property \{${requestType}\['action'\]\} ${actionKey} - Request: \{@link ${requestType}\}; Response: \{@link ${responseType}\}`
      );
      expect(source).toMatch(propertyPattern);
    }
  });

  // 防止 dead-action：registry 的每個條目都必須在 scripts/ 或 options/ 中透過
  // `RUNTIME_ACTIONS.KEY` 實際被引用。只收錄卻沒人用的條目會誤導未來維護者，
  // 且工具鏈無法自動偵測（Object.freeze 使所有 key 看起來都「被消費」）。
  test('每個 RUNTIME_ACTIONS 條目都必須在 scripts/ 或 options/ 中實際被引用', () => {
    const projectRoot = path.resolve(__dirname, '../../..');
    const registryFile = path.join(projectRoot, 'scripts/config/shared/runtimeActions.js');

    const collectJsFiles = (dir, out = []) => {
      if (!fs.existsSync(dir)) {
        return out;
      }
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
          continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          collectJsFiles(full, out);
        } else if (entry.name.endsWith('.js') && full !== registryFile) {
          out.push(full);
        }
      }
      return out;
    };

    const sourceFiles = [
      ...collectJsFiles(path.join(projectRoot, 'scripts')),
      ...collectJsFiles(path.join(projectRoot, 'options')),
    ];
    const codebase = sourceFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');

    const unused = Object.keys(RUNTIME_ACTIONS).filter(
      key => !codebase.includes(`RUNTIME_ACTIONS.${key}`)
    );

    expect(unused).toEqual([]);
  });
});
