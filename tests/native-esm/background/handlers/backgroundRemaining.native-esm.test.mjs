import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const loggerMock = {
  addLogToBuffer: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  ready: jest.fn(),
  start: jest.fn(),
  success: jest.fn(),
  warn: jest.fn(),
};

const validateInternalRequestMock = jest.fn();
const validateContentScriptRequestMock = jest.fn();
const isValidUrlMock = jest.fn();
const sanitizeApiErrorMock = jest.fn();
const sanitizeUrlForLoggingMock = jest.fn();
const formatUserMessageMock = jest.fn();
const parseArgsToContextMock = jest.fn();
const exportLogsMock = jest.fn();
const computeStableUrlMock = jest.fn();

const getDriveSyncMetadataMock = jest.fn();
const ensureDriveSyncIdentityMock = jest.fn();
const updateDriveSyncRunMetadataMock = jest.fn();
const clearDriveDirtyMock = jest.fn();
const uploadDriveSnapshotMock = jest.fn();
const downloadDriveSnapshotMock = jest.fn();
const setDriveFrequencyMock = jest.fn();
const writeDriveAutoSyncTelemetryMock = jest.fn();
const getAccountAccessTokenMock = jest.fn();
const buildUnifiedPageStateFromLocalStorageMock = jest.fn();
const buildDriveSnapshotMock = jest.fn();
const applyDriveSnapshotToLocalStorageMock = jest.fn();
const computeDriveSnapshotHashMock = jest.fn();
const buildHighlightBlocksMock = jest.fn();
const ensureNotionApiKeyMock = jest.fn();
const isRestrictedInjectionUrlMock = jest.fn();

await jest.unstable_mockModule('../../../../scripts/utils/securityUtils.js', () => ({
  isValidUrl: isValidUrlMock,
  validateContentScriptRequest: validateContentScriptRequestMock,
  validateInternalRequest: validateInternalRequestMock,
}));

await jest.unstable_mockModule('../../../../scripts/utils/ApiErrorSanitizer.js', () => ({
  sanitizeApiError: sanitizeApiErrorMock,
}));

await jest.unstable_mockModule('../../../../scripts/utils/LogSanitizer.js', () => ({
  LogSanitizer: { sanitizeUrl: sanitizeUrlForLoggingMock },
  sanitizeUrlForLogging: sanitizeUrlForLoggingMock,
}));

await jest.unstable_mockModule('../../../../scripts/utils/ErrorHandler.js', () => ({
  ErrorHandler: {
    formatUserMessage: formatUserMessageMock,
  },
  ErrorTypes: {
    INTERNAL: 'internal',
  },
}));

await jest.unstable_mockModule('../../../../scripts/utils/Logger.js', () => ({
  default: loggerMock,
  parseArgsToContext: parseArgsToContextMock,
}));

await jest.unstable_mockModule('../../../../scripts/utils/LogExporter.js', () => ({
  LogExporter: {
    exportLogs: exportLogsMock,
  },
}));

await jest.unstable_mockModule('../../../../scripts/utils/urlUtils.js', () => ({
  computeStableUrl: computeStableUrlMock,
  isRootUrl: jest.fn(url => url === 'https://example.com/'),
}));

await jest.unstable_mockModule('../../../../scripts/utils/concurrencyUtils.js', () => ({
  pMap: async (items, worker) => Promise.all(items.map(item => worker(item))),
}));

await jest.unstable_mockModule('../../../../scripts/auth/driveClient.js', () => ({
  applyDriveSnapshotToLocalStorage: applyDriveSnapshotToLocalStorageMock,
  clearDriveDirty: clearDriveDirtyMock,
  downloadDriveSnapshot: downloadDriveSnapshotMock,
  ensureDriveSyncIdentity: ensureDriveSyncIdentityMock,
  getDriveSyncMetadata: getDriveSyncMetadataMock,
  setDriveFrequency: setDriveFrequencyMock,
  updateDriveSyncRunMetadata: updateDriveSyncRunMetadataMock,
  uploadDriveSnapshot: uploadDriveSnapshotMock,
  writeDriveAutoSyncTelemetry: writeDriveAutoSyncTelemetryMock,
}));

await jest.unstable_mockModule('../../../../scripts/auth/accountSession.js', () => ({
  getAccountAccessToken: getAccountAccessTokenMock,
}));

await jest.unstable_mockModule('../../../../scripts/sync/driveSnapshot.js', () => ({
  applyDriveSnapshotToLocalStorage: applyDriveSnapshotToLocalStorageMock,
  buildDriveSnapshot: buildDriveSnapshotMock,
  buildUnifiedPageStateFromLocalStorage: buildUnifiedPageStateFromLocalStorageMock,
}));

await jest.unstable_mockModule('../../../../scripts/sync/driveSnapshotHash.js', () => ({
  computeDriveSnapshotHash: computeDriveSnapshotHashMock,
}));

await jest.unstable_mockModule('../../../../scripts/utils/notionAuth.js', () => ({
  ensureNotionApiKey: ensureNotionApiKeyMock,
}));

await jest.unstable_mockModule('../../../../scripts/background/utils/BlockBuilder.js', () => ({
  buildHighlightBlocks: buildHighlightBlocksMock,
}));

await jest.unstable_mockModule(
  '../../../../scripts/background/services/InjectionService.js',
  () => ({
    isRestrictedInjectionUrl: isRestrictedInjectionUrlMock,
  })
);

const { RUNTIME_ACTIONS } = await import('../../../../scripts/config/shared/runtimeActions.js');
const { CONTENT_BRIDGE_ACTIONS } = await import(
  '../../../../scripts/config/runtimeActions/contentBridgeActions.js'
);
const { createAccountAuthHandler } = await import(
  '../../../../scripts/background/handlers/accountAuthHandler.js'
);
const {
  DRIVE_AUTO_SYNC_ALARM,
  setupDriveAlarm,
} = await import('../../../../scripts/background/handlers/driveAlarmScheduler.js');
const { runAutoUpload, shouldRunAutoSync } = await import(
  '../../../../scripts/background/handlers/driveAutoSync.js'
);
const { createDriveSyncHandlers } = await import(
  '../../../../scripts/background/handlers/driveSyncHandlers.js'
);
const { getActiveTab } = await import(
  '../../../../scripts/background/handlers/handlerUtils.js'
);
const {
  buildMigrationGuardMeta,
  clearLegacyKeysWithStable,
  sendGuardFailure,
  validateBatchUrls,
  validatePrivilegedRequest,
} = await import('../../../../scripts/background/handlers/handlerGuard.js');
const { createHighlightHandlers } = await import(
  '../../../../scripts/background/handlers/highlightHandlers.js'
);
const { createLogHandlers } = await import(
  '../../../../scripts/background/handlers/logHandlers.js'
);
const { createMigrationHandlers } = await import(
  '../../../../scripts/background/handlers/migrationHandlers.js'
);
const { createSidepanelHandlers } = await import(
  '../../../../scripts/background/handlers/sidepanelHandlers.js'
);
const { classifyErrorForToast, sendToastToTab } = await import(
  '../../../../scripts/background/handlers/toastUtils.js'
);

const originalChrome = globalThis.chrome;
const originalLogger = globalThis.Logger;

function resetMockDefaults() {
  validateInternalRequestMock.mockReset().mockReturnValue(null);
  validateContentScriptRequestMock.mockReset().mockReturnValue(null);
  isValidUrlMock.mockReset().mockImplementation(url => String(url || '').startsWith('https://'));
  sanitizeApiErrorMock.mockReset().mockImplementation(error => error?.message || String(error));
  sanitizeUrlForLoggingMock.mockReset().mockImplementation(url => `[safe]${url}`);
  formatUserMessageMock.mockReset().mockImplementation(error => `formatted:${error}`);
  parseArgsToContextMock.mockReset().mockImplementation(args => ({ parsed: args?.[0] ?? null }));
  exportLogsMock.mockReset().mockReturnValue({ exported: true });
  computeStableUrlMock.mockReset().mockImplementation(url => `${String(url).split('?')[0]}#stable`);
  getDriveSyncMetadataMock.mockReset().mockResolvedValue({
    connectionEmail: 'drive@example.com',
    dirtyRevision: 3,
    frequency: 'daily',
    lastKnownRemoteUpdatedAt: '2026-06-26T00:00:00.000Z',
    lastSuccessfulUploadAt: null,
    lastUploadedRevision: 1,
    needsManualReview: false,
    nextEligibleAt: null,
    profileId: 'default',
  });
  ensureDriveSyncIdentityMock.mockReset().mockResolvedValue('installation-1');
  updateDriveSyncRunMetadataMock.mockReset().mockResolvedValue();
  clearDriveDirtyMock.mockReset().mockResolvedValue();
  uploadDriveSnapshotMock.mockReset().mockResolvedValue({
    success: true,
    updatedAt: '2026-06-26T01:00:00.000Z',
  });
  downloadDriveSnapshotMock.mockReset().mockResolvedValue({
    metadata: { updated_at: '2026-06-26T02:00:00.000Z' },
  });
  setDriveFrequencyMock.mockReset().mockResolvedValue();
  writeDriveAutoSyncTelemetryMock.mockReset().mockResolvedValue();
  getAccountAccessTokenMock.mockReset().mockResolvedValue('account-token');
  buildUnifiedPageStateFromLocalStorageMock.mockReset().mockResolvedValue({
    pages: { 'https://example.com/article': { notion: { pageId: 'page-1' } } },
    urlAliases: {},
  });
  buildDriveSnapshotMock.mockReset().mockResolvedValue({
    metadata: { item_counts: { saved_states: 1 } },
  });
  applyDriveSnapshotToLocalStorageMock.mockReset().mockResolvedValue({
    removedKeys: ['old_key'],
    writtenKeys: ['page_https://example.com/article'],
  });
  computeDriveSnapshotHashMock.mockReset().mockReturnValue('snapshot-hash');
  buildHighlightBlocksMock.mockReset().mockReturnValue([{ type: 'paragraph' }]);
  ensureNotionApiKeyMock.mockReset().mockResolvedValue('notion-token');
  isRestrictedInjectionUrlMock.mockReset().mockReturnValue(false);
}

function installChromeMock() {
  globalThis.chrome = {
    alarms: {
      clear: jest.fn(async () => true),
      create: jest.fn(async () => {}),
    },
    runtime: {
      id: 'ext-1',
      getURL: jest.fn(path => `chrome-extension://ext-1/${path}`),
      sendMessage: jest.fn(async () => {}),
    },
    sidePanel: {
      open: jest.fn(async () => {}),
    },
    tabs: {
      get: jest.fn(async tabId => ({ id: tabId, windowId: 44 })),
      query: jest.fn(async () => [{ id: 7, url: 'https://example.com/article', windowId: 9 }]),
      sendMessage: jest.fn(async () => ({ success: true })),
      update: jest.fn(async () => {}),
    },
    windows: {
      getCurrent: jest.fn(async () => ({ id: 55 })),
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetMockDefaults();
  installChromeMock();
  globalThis.Logger = loggerMock;
});

afterEach(() => {
  globalThis.chrome = originalChrome;
  globalThis.Logger = originalLogger;
});

describe('remaining background handlers native ESM diagnostics', () => {
  test('handler utilities validate active-tab, guard, legacy cleanup, logs, and toast paths', async () => {
    const activeTab = await getActiveTab();
    expect(activeTab).toEqual({ id: 7, url: 'https://example.com/article', windowId: 9 });

    expect(validatePrivilegedRequest({ id: 'options-page' }, 'https://example.com/article')).toBeNull();
    expect(validateBatchUrls(['https://example.com/a', 'https://example.com/b'])).toBeNull();

    const validationError = { success: false, error: 'blocked' };
    const sendResponse = jest.fn();
    sendGuardFailure(
      validationError,
      sendResponse,
      buildMigrationGuardMeta({
        action: 'migration_delete',
        sender: { id: 'options-page' },
        validationError,
        url: 'https://example.com/private?token=raw',
      })
    );
    expect(loggerMock.warn).toHaveBeenCalledWith(
      '安全性阻擋',
      expect.objectContaining({ url: '[safe]https://example.com/private?token=raw' })
    );
    expect(sendResponse).toHaveBeenCalledWith(validationError);

    const storageService = { clearLegacyKeys: jest.fn(async () => {}) };
    await clearLegacyKeysWithStable(storageService, 'https://example.com/article?utm=1');
    expect(storageService.clearLegacyKeys).toHaveBeenCalledWith(
      'https://example.com/article?utm=1'
    );
    expect(storageService.clearLegacyKeys).toHaveBeenCalledWith(
      'https://example.com/article#stable'
    );

    const logHandlers = createLogHandlers();
    const logResponse = jest.fn();
    logHandlers[RUNTIME_ACTIONS.EXPORT_DEBUG_LOGS](
      { format: 'json' },
      { id: 'options-page' },
      logResponse
    );
    expect(logResponse).toHaveBeenCalledWith({ success: true, data: { exported: true } });

    const batchResponse = jest.fn();
    logHandlers[RUNTIME_ACTIONS.DEV_LOG_SINK_BATCH](
      {
        logs: Array.from({ length: 25 }, (_value, index) => ({
          args: [{ index }],
          level: 'debug',
          message: `log-${index}`,
        })),
      },
      { id: 'content-script', url: 'https://example.com/path?secret=raw' },
      batchResponse
    );
    expect(loggerMock.addLogToBuffer).toHaveBeenCalledTimes(20);
    expect(batchResponse).toHaveBeenCalledWith({ success: true });

    expect(classifyErrorForToast('RATE_LIMITED')).toBe('SYNC_FAILED_RATE_LIMIT');
    await sendToastToTab(7, 'SYNC_FAILED_NETWORK', 'error');
    expect(globalThis.chrome.tabs.sendMessage).toHaveBeenCalledWith(7, {
      action: CONTENT_BRIDGE_ACTIONS.SHOW_TOAST,
      level: 'error',
      messageKey: 'SYNC_FAILED_NETWORK',
    });
  });

  test('account bridge, alarm setup, auto upload, and manual Drive sync handlers execute', async () => {
    const bridgeTabs = {
      onRemoved: { addListener: jest.fn() },
      onUpdated: { addListener: jest.fn() },
      update: jest.fn(async () => {}),
    };
    const accountHandler = createAccountAuthHandler({
      bridgePath: '/account/callback',
      logger: loggerMock,
      oauthServerUrl: 'https://auth.example.test',
      runtime: {
        id: 'ext-1',
        getURL: path => `chrome-extension://ext-1/${path}`,
      },
      tabs: bridgeTabs,
    });

    accountHandler.setupListeners();
    expect(bridgeTabs.onUpdated.addListener).toHaveBeenCalledWith(
      accountHandler.handleTabUpdated
    );
    expect(bridgeTabs.onRemoved.addListener).toHaveBeenCalledWith(
      accountHandler.handleTabRemoved
    );

    await accountHandler.handleTabUpdated(12, {
      url: 'https://auth.example.test/account/callback?account_ticket=ticket%201&ext_id=ext-1',
    });
    await accountHandler.handleTabUpdated(12, {
      url: 'https://auth.example.test/account/callback?account_ticket=ticket%201&ext_id=ext-1',
    });
    expect(bridgeTabs.update).toHaveBeenCalledTimes(1);
    expect(bridgeTabs.update).toHaveBeenCalledWith(12, {
      url: 'chrome-extension://ext-1/pages/auth/auth.html?account_ticket=ticket%201',
    });

    await setupDriveAlarm('daily', { initialDelayInMinutes: 0.1 });
    expect(globalThis.chrome.alarms.clear).toHaveBeenCalledWith(DRIVE_AUTO_SYNC_ALARM);
    expect(globalThis.chrome.alarms.create).toHaveBeenCalledWith(DRIVE_AUTO_SYNC_ALARM, {
      delayInMinutes: 0.5,
      periodInMinutes: 1440,
    });

    expect(
      shouldRunAutoSync({
        connectionEmail: 'drive@example.com',
        dirtyRevision: 2,
        frequency: 'daily',
        lastUploadedRevision: 1,
        needsManualReview: false,
        nextEligibleAt: null,
      })
    ).toEqual({ shouldRun: true, reason: 'all_conditions_met' });
    expect(
      shouldRunAutoSync(
        {
          connectionEmail: 'drive@example.com',
          dirtyRevision: 1,
          frequency: 'daily',
          lastUploadedRevision: 1,
          needsManualReview: false,
        },
        { isAccountLoggedIn: true }
      )
    ).toEqual({ shouldRun: false, reason: 'not_dirty' });

    await runAutoUpload({
      alarmFiredAt: '2026-06-26T00:30:00.000Z',
      isAccountLoggedIn: true,
    });
    expect(writeDriveAutoSyncTelemetryMock).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'run' })
    );
    expect(uploadDriveSnapshotMock).toHaveBeenCalledWith(
      { metadata: { item_counts: { saved_states: 1 } } },
      false,
      expect.objectContaining({ sourceInstallationId: 'installation-1' })
    );
    expect(clearDriveDirtyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedDirtyRevision: 3,
        snapshotHash: 'snapshot-hash',
      })
    );

    const driveHandlers = createDriveSyncHandlers();
    await expect(driveHandlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_DOWNLOAD]()).resolves.toEqual({
      success: true,
      writtenKeys: 1,
    });
    await expect(
      driveHandlers[RUNTIME_ACTIONS.DRIVE_SYNC_SCHEDULE_UPDATED]({ frequency: 'weekly' })
    ).resolves.toEqual({ success: true });
    expect(setDriveFrequencyMock).toHaveBeenCalledWith('weekly');
  });

  test('migration, highlight, and sidepanel factories execute representative handlers', async () => {
    const migrationHandlers = createMigrationHandlers({
      migrationScanner: {
        getAllHighlights: jest.fn(async () => ({
          'https://example.com/a': {
            highlights: [
              { id: 'pending', needsRangeInfo: true },
              { id: 'failed', migrationFailed: true },
            ],
            url: 'https://example.com/a',
          },
        })),
      },
      migrationService: {
        executeContentMigration: jest.fn(async () => ({ success: true })),
        migrateBatchUrl: jest.fn(async url => ({ status: 'success', url })),
      },
      storageService: {
        clearLegacyKeys: jest.fn(async () => {}),
        getHighlights: jest.fn(async () => ({ highlights: [{ id: 'failed', migrationFailed: true }] })),
        getSavedPageData: jest.fn(async () => null),
        updateHighlights: jest.fn(async () => {}),
      },
    });

    const pendingResponse = jest.fn();
    await migrationHandlers[RUNTIME_ACTIONS.MIGRATION_GET_PENDING](
      {},
      { id: 'options-page' },
      pendingResponse
    );
    expect(pendingResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        failedItems: [expect.objectContaining({ failedCount: 1 })],
        items: [expect.objectContaining({ pendingCount: 1 })],
        success: true,
      })
    );

    const highlightHandlers = createHighlightHandlers({
      injectionService: { clearPageHighlights: jest.fn(async () => true) },
      storageService: {
        getHighlights: jest.fn(async () => [{ id: 'h1' }]),
        updateHighlights: jest.fn(async () => {}),
      },
    });

    const updateResponse = jest.fn();
    await highlightHandlers.UPDATE_HIGHLIGHTS(
      { highlights: [{ id: 'h2' }], url: 'https://example.com/article' },
      { tab: { id: 7, url: 'https://example.com/article' } },
      updateResponse
    );
    expect(updateResponse).toHaveBeenCalledWith({ success: true });

    const clearResponse = jest.fn();
    await highlightHandlers[RUNTIME_ACTIONS.CLEAR_HIGHLIGHTS](
      { url: 'https://example.com/article' },
      { tab: { id: 7, url: 'https://example.com/article' } },
      clearResponse
    );
    expect(clearResponse).toHaveBeenCalledWith({
      clearedCount: 1,
      success: true,
      visualCleared: true,
    });

    const sidepanelHandlers = createSidepanelHandlers();
    await expect(
      sidepanelHandlers[RUNTIME_ACTIONS.OPEN_SIDE_PANEL]({}, { tab: { windowId: 88 } })
    ).resolves.toEqual({ success: true });
    expect(globalThis.chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 88 });
  });
});
