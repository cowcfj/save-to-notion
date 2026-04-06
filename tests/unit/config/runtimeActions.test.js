import { RUNTIME_ACTIONS, RUNTIME_ERROR_MESSAGES } from '../../../scripts/config/runtimeActions.js';

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
      })
    );
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
});
