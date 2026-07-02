let CONTENT_BRIDGE_ACTIONS;
let DIAGNOSTICS_ACTIONS;
let HIGHLIGHTER_ACTIONS;
let PAGE_SAVE_ACTIONS;
let PRELOADER_ACTIONS;
let MIGRATION_ACTIONS;
let DRIVE_SYNC_ACTIONS;
let RUNTIME_ACTIONS;

beforeAll(async () => {
  ({ CONTENT_BRIDGE_ACTIONS } =
    await import('../../../scripts/config/runtimeActions/contentBridgeActions.js'));
  ({ DIAGNOSTICS_ACTIONS } =
    await import('../../../scripts/config/runtimeActions/diagnosticsActions.js'));
  ({ HIGHLIGHTER_ACTIONS } =
    await import('../../../scripts/config/runtimeActions/highlighterActions.js'));
  ({ PAGE_SAVE_ACTIONS } =
    await import('../../../scripts/config/runtimeActions/pageSaveActions.js'));
  ({ PRELOADER_ACTIONS } =
    await import('../../../scripts/config/runtimeActions/preloaderActions.js'));
  ({ MIGRATION_ACTIONS } =
    await import('../../../scripts/config/runtimeActions/migrationActions.js'));
  ({ DRIVE_SYNC_ACTIONS } =
    await import('../../../scripts/config/runtimeActions/driveSyncActions.js'));
  ({ RUNTIME_ACTIONS } = await import('../../../scripts/config/shared/runtimeActions.js'));
});

describe('runtime action 模組拆分', () => {
  const getExpectedModules = () => [
    {
      registry: PRELOADER_ACTIONS,
      keys: ['USER_ACTIVATE_SHORTCUT', 'PING', 'INIT_BUNDLE', 'REPLAY_BUFFERED_EVENTS'],
    },
    {
      registry: CONTENT_BRIDGE_ACTIONS,
      keys: [
        'PING',
        'SET_STABLE_URL',
        'GET_STABLE_URL',
        'INIT_BUNDLE',
        'REPLAY_BUFFERED_EVENTS',
        'SHOW_FLOATING_RAIL',
        'SHOW_TOAST',
      ],
    },
    {
      registry: DIAGNOSTICS_ACTIONS,
      keys: ['DEV_LOG_SINK', 'DEV_LOG_SINK_BATCH', 'EXPORT_DEBUG_LOGS'],
    },
    {
      registry: HIGHLIGHTER_ACTIONS,
      keys: [
        'SHOW_TOOLBAR',
        'SHOW_HIGHLIGHTER',
        'START_HIGHLIGHT',
        'SYNC_HIGHLIGHTS',
        'UPDATE_REMOTE_HIGHLIGHTS',
        'UPDATE_HIGHLIGHTS',
        'CLEAR_HIGHLIGHTS',
        'REMOVE_HIGHLIGHT_DOM',
        'SHOW_FLOATING_RAIL',
        'ACTIVATE_FLOATING_RAIL_HIGHLIGHT',
      ],
    },
    {
      registry: PAGE_SAVE_ACTIONS,
      keys: [
        'CHECK_PAGE_STATUS',
        'SAVE_PAGE',
        'SAVE_PAGE_FROM_TOOLBAR',
        'SAVE_PAGE_FROM_RAIL',
        'PAGE_SAVE_HINT',
        'OPEN_NOTION_PAGE',
        'OPEN_SIDE_PANEL',
      ],
    },
    {
      registry: MIGRATION_ACTIONS,
      keys: [
        'MIGRATION_EXECUTE',
        'MIGRATION_DELETE',
        'MIGRATION_BATCH',
        'MIGRATION_BATCH_DELETE',
        'MIGRATION_GET_PENDING',
        'MIGRATION_DELETE_FAILED',
      ],
    },
    {
      registry: DRIVE_SYNC_ACTIONS,
      keys: [
        'DRIVE_SYNC_STATUS_UPDATED',
        'DRIVE_SYNC_MANUAL_UPLOAD',
        'DRIVE_SYNC_MANUAL_DOWNLOAD',
        'DRIVE_SYNC_CONFLICT',
        'DRIVE_SYNC_SCHEDULE_UPDATED',
      ],
    },
  ];

  test('拆分模組應輸出凍結的 action registry，且值與 aggregate registry 一致', () => {
    for (const { registry: actionRegistry, keys } of getExpectedModules()) {
      expect(actionRegistry).toBeDefined();
      expect(Object.isFrozen(actionRegistry)).toBe(true);
      expect(Object.keys(actionRegistry).toSorted((a, b) => a.localeCompare(b))).toEqual(
        keys.toSorted((a, b) => a.localeCompare(b))
      );

      for (const key of keys) {
        const aggregateKey =
          actionRegistry === CONTENT_BRIDGE_ACTIONS && key === 'SHOW_FLOATING_RAIL'
            ? 'CONTENT_BRIDGE_SHOW_FLOATING_RAIL'
            : key;
        expect(actionRegistry[key]).toBe(RUNTIME_ACTIONS[aggregateKey]);
      }
    }
  });

  test('跨邊界的重複 action keys（如 PING、INIT_BUNDLE 等）值應完全相等', () => {
    expect(PRELOADER_ACTIONS.PING).toBe(CONTENT_BRIDGE_ACTIONS.PING);
    expect(PRELOADER_ACTIONS.INIT_BUNDLE).toBe(CONTENT_BRIDGE_ACTIONS.INIT_BUNDLE);
    expect(PRELOADER_ACTIONS.REPLAY_BUFFERED_EVENTS).toBe(
      CONTENT_BRIDGE_ACTIONS.REPLAY_BUFFERED_EVENTS
    );
  });
});
