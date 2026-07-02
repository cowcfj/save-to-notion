import fs from 'node:fs';
import path from 'node:path';

let RUNTIME_ACTIONS;
let RUNTIME_ERROR_MESSAGES;
let PAGE_SAVE_ACTIONS;
let runtimeActionsSource;

const projectRoot = path.resolve(__dirname, '../../..');
const runtimeActionsRegistryFile = path.join(
  projectRoot,
  'scripts/config/shared/runtimeActions.js'
);
const messageBusFile = path.join(projectRoot, '.agents/.shared/knowledge/message_bus.json');
const PRODUCTION_RUNTIME_ACTION_ROOTS = ['scripts', 'pages'];
const RUNTIME_ACTION_REGISTRY_IDENTIFIERS = [
  'RUNTIME_ACTIONS',
  'PRELOADER_ACTIONS',
  'CONTENT_BRIDGE_ACTIONS',
  'HIGHLIGHTER_ACTIONS',
  'PAGE_SAVE_ACTIONS',
  'DIAGNOSTICS_ACTIONS',
  'MIGRATION_ACTIONS',
  'DRIVE_SYNC_ACTIONS',
];
const RUNTIME_ACTION_USAGE_ALIASES = {
  CONTENT_BRIDGE_SHOW_FLOATING_RAIL: ['CONTENT_BRIDGE_ACTIONS.SHOW_FLOATING_RAIL'],
};
const ACTION_TYPE_CONTRACTS = [
  {
    actionKey: 'CHECK_PAGE_STATUS',
    requestType: 'CheckPageStatusRequest',
    responseType: 'CheckPageStatusResponse',
  },
  {
    actionKey: 'PAGE_SAVE_HINT',
    requestType: 'PageSaveHintRequest',
    responseType: 'PageSaveHintResponse',
  },
  {
    actionKey: 'GET_STABLE_URL',
    requestType: 'GetStableUrlRequest',
    responseType: 'GetStableUrlResponse',
  },
  {
    actionKey: 'SET_STABLE_URL',
    requestType: 'SetStableUrlRequest',
    responseType: 'SetStableUrlResponse',
  },
  { actionKey: 'SAVE_PAGE', requestType: 'SavePageRequest', responseType: 'SavePageResponse' },
  {
    actionKey: 'SAVE_PAGE_FROM_TOOLBAR',
    requestType: 'SavePageFromToolbarRequest',
    responseType: 'SavePageFromToolbarResponse',
  },
  {
    actionKey: 'OPEN_NOTION_PAGE',
    requestType: 'OpenNotionPageRequest',
    responseType: 'OpenNotionPageResponse',
  },
  {
    actionKey: 'CHECK_NOTION_PAGE_EXISTS',
    requestType: 'CheckNotionPageExistsRequest',
    responseType: 'CheckNotionPageExistsResponse',
  },
  {
    actionKey: 'SEARCH_NOTION',
    requestType: 'SearchNotionRequest',
    responseType: 'SearchNotionResponse',
  },
  {
    actionKey: 'START_HIGHLIGHT',
    requestType: 'StartHighlightRequest',
    responseType: 'StartHighlightResponse',
  },
  {
    actionKey: 'SYNC_HIGHLIGHTS',
    requestType: 'SyncHighlightsRequest',
    responseType: 'SyncHighlightsResponse',
  },
  {
    actionKey: 'UPDATE_REMOTE_HIGHLIGHTS',
    requestType: 'UpdateRemoteHighlightsRequest',
    responseType: 'UpdateRemoteHighlightsResponse',
  },
  {
    actionKey: 'UPDATE_HIGHLIGHTS',
    requestType: 'UpdateHighlightsRequest',
    responseType: 'UpdateHighlightsResponse',
  },
  {
    actionKey: 'CLEAR_HIGHLIGHTS',
    requestType: 'ClearHighlightsRequest',
    responseType: 'ClearHighlightsResponse',
  },
  {
    actionKey: 'SHOW_TOOLBAR',
    requestType: 'ShowToolbarRequest',
    responseType: 'ShowToolbarResponse',
  },
  {
    actionKey: 'SHOW_HIGHLIGHTER',
    requestType: 'ShowHighlighterRequest',
    responseType: 'ShowHighlighterResponse',
  },
  {
    actionKey: 'REMOVE_HIGHLIGHT_DOM',
    requestType: 'RemoveHighlightDomRequest',
    responseType: 'RemoveHighlightDomResponse',
  },
  {
    actionKey: 'USER_ACTIVATE_SHORTCUT',
    requestType: 'UserActivateShortcutRequest',
    responseType: 'UserActivateShortcutResponse',
  },
  {
    actionKey: 'MIGRATION_EXECUTE',
    requestType: 'MigrationExecuteRequest',
    responseType: 'MigrationExecuteResponse',
  },
  {
    actionKey: 'MIGRATION_DELETE',
    requestType: 'MigrationDeleteRequest',
    responseType: 'MigrationDeleteResponse',
  },
  {
    actionKey: 'MIGRATION_BATCH',
    requestType: 'MigrationBatchRequest',
    responseType: 'MigrationBatchResponse',
  },
  {
    actionKey: 'MIGRATION_BATCH_DELETE',
    requestType: 'MigrationBatchDeleteRequest',
    responseType: 'MigrationBatchDeleteResponse',
  },
  {
    actionKey: 'MIGRATION_GET_PENDING',
    requestType: 'MigrationGetPendingRequest',
    responseType: 'MigrationGetPendingResponse',
  },
  {
    actionKey: 'MIGRATION_DELETE_FAILED',
    requestType: 'MigrationDeleteFailedRequest',
    responseType: 'MigrationDeleteFailedResponse',
  },
  {
    actionKey: 'OAUTH_SUCCESS',
    requestType: 'OAuthSuccessRequest',
    responseType: 'OAuthSuccessResponse',
  },
  {
    actionKey: 'OAUTH_FAILED',
    requestType: 'OAuthFailedRequest',
    responseType: 'OAuthFailedResponse',
  },
  {
    actionKey: 'REFRESH_OAUTH_TOKEN',
    requestType: 'RefreshOAuthTokenRequest',
    responseType: 'RefreshOAuthTokenResponse',
  },
  {
    actionKey: 'ACCOUNT_SESSION_UPDATED',
    requestType: 'AccountSessionUpdatedRequest',
    responseType: 'AccountSessionUpdatedResponse',
  },
  {
    actionKey: 'ACCOUNT_SESSION_CLEARED',
    requestType: 'AccountSessionClearedRequest',
    responseType: 'AccountSessionClearedResponse',
  },
  {
    actionKey: 'DRIVE_SYNC_STATUS_UPDATED',
    requestType: 'DriveSyncStatusUpdatedRequest',
    responseType: 'DriveSyncStatusUpdatedResponse',
  },
  {
    actionKey: 'DRIVE_SYNC_MANUAL_UPLOAD',
    requestType: 'DriveSyncManualUploadRequest',
    responseType: 'DriveSyncManualUploadResponse',
  },
  {
    actionKey: 'DRIVE_SYNC_MANUAL_DOWNLOAD',
    requestType: 'DriveSyncManualDownloadRequest',
    responseType: 'DriveSyncManualDownloadResponse',
  },
  {
    actionKey: 'DRIVE_SYNC_CONFLICT',
    requestType: 'DriveSyncConflictRequest',
    responseType: 'DriveSyncConflictResponse',
  },
  {
    actionKey: 'DRIVE_SYNC_SCHEDULE_UPDATED',
    requestType: 'DriveSyncScheduleUpdatedRequest',
    responseType: 'DriveSyncScheduleUpdatedResponse',
  },
  {
    actionKey: 'OPEN_SIDE_PANEL',
    requestType: 'OpenSidePanelRequest',
    responseType: 'OpenSidePanelResponse',
  },
  {
    actionKey: 'EXPORT_DEBUG_LOGS',
    requestType: 'ExportDebugLogsRequest',
    responseType: 'ExportDebugLogsResponse',
  },
  {
    actionKey: 'DEV_LOG_SINK',
    requestType: 'DevLogSinkRequest',
    responseType: 'DevLogSinkResponse',
  },
  {
    actionKey: 'DEV_LOG_SINK_BATCH',
    requestType: 'DevLogSinkBatchRequest',
    responseType: 'DevLogSinkBatchResponse',
  },
  { actionKey: 'PING', requestType: 'PingRequest', responseType: 'PingResponse' },
  {
    actionKey: 'INIT_BUNDLE',
    requestType: 'InitBundleRequest',
    responseType: 'InitBundleResponse',
  },
  {
    actionKey: 'REPLAY_BUFFERED_EVENTS',
    requestType: 'ReplayBufferedEventsRequest',
    responseType: 'ReplayBufferedEventsResponse',
  },
  {
    actionKey: 'CONTENT_BRIDGE_SHOW_FLOATING_RAIL',
    requestType: 'ContentBridgeShowFloatingRailRequest',
    responseType: 'ContentBridgeShowFloatingRailResponse',
  },
];

function escapeRegex(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function readUtf8File(filePath) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.readFileSync(filePath, 'utf8');
}

function collectJavaScriptFiles(dir) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!fs.existsSync(dir)) {
    return [];
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
      return [];
    }

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectJavaScriptFiles(full);
    }
    if (entry.name.endsWith('.js') && full !== runtimeActionsRegistryFile) {
      return [full];
    }
    return [];
  });
}

function collectProductionRuntimeActionFiles() {
  return PRODUCTION_RUNTIME_ACTION_ROOTS.flatMap(rootDir =>
    collectJavaScriptFiles(path.join(projectRoot, rootDir))
  );
}

function hasDirectRuntimeActionUsage(codebase, key) {
  return RUNTIME_ACTION_REGISTRY_IDENTIFIERS.some(identifier =>
    new RegExp(String.raw`\b${escapeRegex(identifier)}\.${escapeRegex(key)}\b`).test(codebase)
  );
}

function hasAliasRuntimeActionUsage(codebase, key) {
  return (RUNTIME_ACTION_USAGE_ALIASES[key] ?? []).some(alias =>
    new RegExp(String.raw`\b${escapeRegex(alias)}\b`).test(codebase)
  );
}

function isUnusedRuntimeActionKey(codebase, key) {
  return !hasDirectRuntimeActionUsage(codebase, key) && !hasAliasRuntimeActionUsage(codebase, key);
}

function getRuntimeActionsRegistryKeys(source) {
  const propertyPattern =
    /@property \{[^}]+\} ([A-Z0-9_]+) - Request: \{@link [^}]+\}; Response: \{@link [^}]+\}/g;
  return new Set([...source.matchAll(propertyPattern)].map(([, actionKey]) => actionKey));
}

beforeAll(async () => {
  ({ RUNTIME_ACTIONS, RUNTIME_ERROR_MESSAGES } =
    await import('../../../scripts/config/shared/runtimeActions.js'));
  ({ PAGE_SAVE_ACTIONS } =
    await import('../../../scripts/config/runtimeActions/pageSaveActions.js'));
  runtimeActionsSource = readUtf8File(runtimeActionsRegistryFile);
});

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
        PAGE_SAVE_HINT: 'PAGE_SAVE_HINT',
        SHOW_HIGHLIGHTER: 'showHighlighter',
        REMOVE_HIGHLIGHT_DOM: 'REMOVE_HIGHLIGHT_DOM',
        PING: 'PING',
        INIT_BUNDLE: 'INIT_BUNDLE',
        REPLAY_BUFFERED_EVENTS: 'REPLAY_BUFFERED_EVENTS',
        CONTENT_BRIDGE_SHOW_FLOATING_RAIL: 'CONTENT_BRIDGE_SHOW_FLOATING_RAIL',
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
    const keys = Object.keys(RUNTIME_ACTIONS);
    const valueMap = {};
    const duplicates = [];
    for (const key of keys) {
      const val = RUNTIME_ACTIONS[key];
      if (valueMap[val]) {
        duplicates.push(`${val} (keys: ${valueMap[val]} and ${key})`);
      } else {
        valueMap[val] = key;
      }
    }
    expect(duplicates).toEqual([]);
    expect(Object.isFrozen(RUNTIME_ACTIONS)).toBe(true);
    expect(Object.isFrozen(RUNTIME_ERROR_MESSAGES)).toBe(true);
  });

  test('bridge actions 應與 diagnostics actions 分組分離', () => {
    expect(runtimeActionsSource).toMatch(/const BRIDGE_ACTIONS = \{/);
    expect(runtimeActionsSource).toMatch(
      /const BRIDGE_ACTIONS = \{[\s\S]*CONTENT_BRIDGE_SHOW_FLOATING_RAIL: CONTENT_BRIDGE_ACTIONS.SHOW_FLOATING_RAIL[\s\S]*\}/
    );
    expect(runtimeActionsSource).not.toMatch(/const DIAGNOSTICS_ACTIONS = \{/);
    expect(runtimeActionsSource).toMatch(/\.{3}BRIDGE_ACTIONS,/);
    expect(runtimeActionsSource).toMatch(/\.{3}DIAGNOSTICS_ACTIONS,/);
  });

  test('OPEN_SIDE_PANEL 應來自 page save action module，不保留 deprecated sidepanel alias', () => {
    const deprecatedAliasName = ['SIDE', 'PANEL_ACTIONS'].join('');

    expect(RUNTIME_ACTIONS.OPEN_SIDE_PANEL).toBe(PAGE_SAVE_ACTIONS.OPEN_SIDE_PANEL);
    expect(runtimeActionsSource).not.toMatch(
      new RegExp(String.raw`const ${deprecatedAliasName} = \{`)
    );
    expect(runtimeActionsSource).not.toContain(`...${deprecatedAliasName},`);
  });

  test('應暴露一致命名的 runtime 錯誤訊息', () => {
    expect(RUNTIME_ERROR_MESSAGES).toEqual(
      expect.objectContaining({
        EXTENSION_UNAVAILABLE: '無法連接擴展',
        FLOATING_RAIL_NOT_INITIALIZED: '浮動側欄尚未初始化',
        FLOATING_RAIL_INIT_FAILED: '浮動側欄初始化失敗',
        FLOATING_RAIL_SHOW_METHOD_MISSING: '浮動側欄缺少 show() 方法',
        FLOATING_RAIL_ACTIVATE_METHOD_MISSING: '浮動側欄缺少 activateHighlighting() 方法',
        FLOATING_RAIL_ACTION_FAILED: '浮動側欄操作失敗',
        SHORTCUT_REPLAY_FAILED: '重放快捷鍵事件失敗',
      })
    );
  });

  describe('RuntimeActionsRegistry typedef contract', () => {
    test.each(ACTION_TYPE_CONTRACTS)(
      '$actionKey typedef 應對齊 Request/Response link',
      ({ actionKey, requestType, responseType }) => {
        expect(runtimeActionsSource).toContain('@typedef {object} RuntimeActionsRegistry');
        const actionPropertyPattern = new RegExp(
          String.raw`@property \{${requestType}\['action'\]\} ${actionKey} - Request: \{@link ${requestType}\}; Response: \{@link ${responseType}\}`
        );
        expect(runtimeActionsSource).toMatch(actionPropertyPattern);
      }
    );

    test('typedef key set 應與 aggregate runtime actions 完全一致', () => {
      expect(getRuntimeActionsRegistryKeys(runtimeActionsSource)).toEqual(
        new Set(Object.keys(RUNTIME_ACTIONS))
      );
    });
  });

  test('message bus migration batch results schema 應與 runtimeActions typedef 對齊', () => {
    const messageBus = JSON.parse(readUtf8File(messageBusFile));
    const migrationActions = messageBus.actions.migration;

    expect(migrationActions.migration_batch.response.results).toEqual({
      type: 'object (optional)',
      fields: {
        success: 'number',
        failed: 'number',
        details: 'array<MigrationBatchItemResult>',
      },
      example: {
        success: 1,
        failed: 1,
        details: [
          { url: 'https://example.com/a', status: 'success', count: 1 },
          { url: 'https://example.com/b', status: 'failed', reason: 'migration failed' },
        ],
      },
      notes:
        'success is the successful item count. The top-level response.success remains the boolean handler envelope.',
    });
    expect(migrationActions.migration_batch_delete.response.results).toEqual({
      type: 'object (optional)',
      fields: {
        success: 'number',
        failed: 'number',
        total: 'number',
        details: 'array<MigrationBatchDeleteItemResult>',
      },
      example: {
        success: 1,
        failed: 1,
        total: 2,
        details: [
          { url: 'https://example.com/a', status: 'success' },
          { url: 'https://example.com/b', status: 'failed', reason: 'cleanup failed' },
        ],
      },
      notes:
        'success is the successful item count. The top-level response.success remains the boolean handler envelope.',
    });
  });

  // 防止 dead-action：registry 的每個條目都必須在 scripts/ 或 pages/ 中透過
  // aggregate registry 或拆分後的小型 action registry 實際被引用。
  test('每個 RUNTIME_ACTIONS 條目都必須在 scripts/ 或 pages/ 中實際被引用', () => {
    const codebase = collectProductionRuntimeActionFiles()
      .map(filePath => readUtf8File(filePath))
      .join('\n');
    const unused = Object.keys(RUNTIME_ACTIONS).filter(key =>
      isUnusedRuntimeActionKey(codebase, key)
    );

    expect(unused).toEqual([]);
  });
});
