/**
 * @jest-environment jsdom
 */

import { afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals';

const loggerMock = {
  debug: jest.fn(),
  error: jest.fn(),
  finish: jest.fn(),
  info: jest.fn(),
  ready: jest.fn(),
  start: jest.fn(),
  success: jest.fn(),
  warn: jest.fn(),
};

await jest.unstable_mockModule('../../../../scripts/utils/Logger.js', () => ({
  default: loggerMock,
}));

await jest.unstable_mockModule('../../../../scripts/utils/securityUtils.js', () => ({
  createSafeIcon: iconHtml => {
    const icon = document.createElement('span');
    const markup = String(iconHtml || '').trim();
    if (markup.startsWith('<svg')) {
      const template = document.createElement('template');
      template.innerHTML = markup;
      icon.append(...template.content.childNodes);
    } else {
      icon.textContent = markup;
    }
    return icon;
  },
  isValidNotionUrl: jest.fn(() => true),
  isValidUrl: jest.fn(() => true),
  sanitizeUrlForLogging: jest.fn(url => url),
  separateIconAndText: message => ({ icon: '', text: String(message || '') }),
  validateSafeSvg: value => typeof value === 'string' && value.includes('<svg'),
}));

await jest.unstable_mockModule('../../../../scripts/utils/ApiErrorSanitizer.js', () => ({
  sanitizeApiError: jest.fn(error => error?.message || error || 'UNKNOWN_ERROR'),
}));

await jest.unstable_mockModule('../../../../scripts/utils/ErrorHandler.js', () => ({
  ErrorHandler: {
    formatUserMessage: jest.fn(error => String(error || 'UNKNOWN_ERROR')),
  },
}));

await jest.unstable_mockModule('../../../../scripts/utils/notionAuth.js', () => ({
  getActiveNotionToken: jest.fn(async () => ({ mode: null, token: null })),
  getNextAuthEpoch: jest.fn(() => 1),
  isNonEmptyString: value => typeof value === 'string' && value.trim() !== '',
  migrateDataSourceKeys: jest.fn(async () => {}),
  refreshOAuthToken: jest.fn(async () => null),
}));

await jest.unstable_mockModule('../../../../scripts/utils/uiUtils.js', () => ({
  injectIcons: jest.fn(),
}));

await jest.unstable_mockModule('../../../../scripts/utils/accountDisplayUtils.js', () => ({
  resolveAccountDisplayProfile: jest.fn(profile => ({
    avatarFallbackInitial: 'N',
    displayLabel: profile?.name || profile?.email || 'Notion user',
    email: profile?.email || '',
  })),
}));

await jest.unstable_mockModule('../../../../scripts/utils/keyOrdering.js', () => ({
  compareKeysAlphabetically: (left, right) => String(left).localeCompare(String(right)),
}));

await jest.unstable_mockModule('../../../../scripts/utils/LogExportValidator.js', () => ({
  validateLogExportData: jest.fn(() => ({ valid: true })),
}));

await jest.unstable_mockModule('../../../../scripts/utils/LogSanitizer.js', () => ({
  sanitizeUrlForLogging: jest.fn(url => url),
}));

function renderMigrationToolDom() {
  document.body.innerHTML = `
    <button id="migration-scan-button"></button>
    <div id="scan-status"></div>
    <div id="migration-list" style="display: none">
      <label><input type="checkbox" id="migration-select-all" /> 全選</label>
      <span id="migration-selected-count">0 項</span>
      <div id="migration-items"></div>
      <button id="migration-execute-button" disabled>遷移</button>
      <button id="migration-delete-button" disabled>刪除</button>
    </div>
    <div id="migration-progress" style="display: none">
      <div id="migration-progress-bar"></div>
      <span id="migration-progress-text">0%</span>
    </div>
    <div id="migration-result"></div>
    <section id="pending-migration-section" style="display: none">
      <div id="pending-migration-list"></div>
    </section>
    <section id="failed-migration-section" style="display: none">
      <div id="failed-migration-list"></div>
    </section>
  `;
}

function renderDebugLogExportDom() {
  document.body.innerHTML = `
    <button id="export-logs-button">Export</button>
    <div id="export-status" class="status-message"></div>
  `;
}

async function flushAsyncClickHandler() {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

await jest.unstable_mockModule('../../../../scripts/auth/accountLogin.js', () => ({
  buildAccountLoginStartUrl: jest.fn(() => 'https://accounts.example.test/login'),
}));

await jest.unstable_mockModule('../../../../scripts/auth/accountSession.js', () => ({
  clearAccountSession: jest.fn(async () => {}),
  getAccountAccessToken: jest.fn(async () => null),
  getAccountProfile: jest.fn(async () => null),
}));

await jest.unstable_mockModule('../../../../scripts/auth/driveClient.js', () => ({
  clearDriveSyncMetadata: jest.fn(async () => {}),
  disconnectDrive: jest.fn(async () => {}),
  ensureDriveSyncIdentity: jest.fn(async () => ({ signedIn: false })),
  fetchDriveConnectionStatus: jest.fn(async () => ({ connected: false })),
  fetchDriveSnapshotStatus: jest.fn(async () => ({ exists: false })),
  getDriveSyncMetadata: jest.fn(async () => ({})),
  setDriveConnection: jest.fn(async () => {}),
  setLastKnownRemoteUpdatedAt: jest.fn(async () => {}),
  startDriveOAuthFlow: jest.fn(async () => ({ connected: true })),
}));

await jest.unstable_mockModule('../../../../scripts/auth/notionOAuthInitiator.js', () => ({
  initiateNotionOAuth: jest.fn(async () => ({ code: 'code', redirectUri: 'https://example.test' })),
}));

await jest.unstable_mockModule('../../../../scripts/auth/notionOAuthCompleter.js', () => ({
  exchangeNotionOAuthCode: jest.fn(async () => ({ accessToken: 'token' })),
  saveNotionOAuthToken: jest.fn(async () => {}),
}));

await jest.unstable_mockModule('../../../../scripts/destinations/ProfileStore.js', () => ({
  AccountGatedDestinationEntitlementProvider: jest.fn(),
  DESTINATION_PROFILE_ERROR_CODES: {
    LIMIT_REACHED: 'LIMIT_REACHED',
  },
  LocalDestinationProfileRepository: jest.fn(),
}));

await jest.unstable_mockModule('../../../../scripts/destinations/ProfileManager.js', () => ({
  ProfileManager: jest.fn().mockImplementation(() => ({
    activateProfile: jest.fn(async () => {}),
    createProfile: jest.fn(async () => ({ id: 'profile-1' })),
    deleteProfile: jest.fn(async () => {}),
    getActiveProfile: jest.fn(() => null),
    getEntitlement: jest.fn(async () => ({ maxProfiles: 1 })),
    listProfiles: jest.fn(() => []),
    renameProfile: jest.fn(async () => {}),
  })),
}));

const { confirmDialog } = await import('../../../../pages/options/confirmDialog.js');
const { RUNTIME_ACTIONS } = await import('../../../../scripts/config/shared/runtimeActions.js');
const { UIManager } = await import('../../../../pages/options/UIManager.js');
const { StorageManager } = await import('../../../../pages/options/StorageManager.js');
const { AuthManager } = await import('../../../../pages/options/AuthManager.js');
const { MigrationTool } = await import('../../../../pages/options/MigrationTool.js');
const { setupDebugLogExport } = await import('../../../../pages/options/debugLogExportUI.js');
const { cleanDatabaseId, formatTitle, setupTemplatePreview } = await import(
  '../../../../pages/options/options.js'
);
const { SearchableDatabaseSelector } = await import(
  '../../../../pages/options/SearchableDatabaseSelector.js'
);
const {
  buildImportExecutionPlan,
  getStorageHealthReport,
  sanitizeBackupData,
} = await import('../../../../pages/options/storageDataUtils.js');
const { applyStaticOptionMessages, resolveUiMessage } = await import(
  '../../../../pages/options/staticOptionMessages.js'
);

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  document.body.innerHTML = '';
});

describe('options page native ESM diagnostics', () => {
  test('confirmDialog resolves true/false and cleans up the native dialog element', async () => {
    const confirmPromise = confirmDialog({
      title: '刪除設定',
      message: '確認刪除？',
      confirmLabel: '刪除',
      cancelLabel: '保留',
      danger: true,
    });

    const confirmDialogEl = document.querySelector('dialog');
    const confirmButton = confirmDialogEl.querySelector('[data-action="confirm"]');
    expect(confirmDialogEl.open).toBe(true);
    expect(confirmButton.classList.contains('btn-danger')).toBe(true);

    confirmButton.click();
    await expect(confirmPromise).resolves.toBe(true);
    expect(document.querySelector('dialog')).toBeNull();

    const cancelPromise = confirmDialog({ title: '取消', message: '保持原狀' });
    document.querySelector('[data-action="cancel"]').click();
    await expect(cancelPromise).resolves.toBe(false);
    expect(document.querySelector('dialog')).toBeNull();
  });

  test('UIManager renders safe status content and setup guide under jsdom', () => {
    document.body.innerHTML = `
      <div id="status"></div>
      <section class="manual-section"></section>
      <button id="test-api-button"></button>
    `;
    jest.useFakeTimers();

    const ui = new UIManager();
    ui.init();
    ui.showStatus({ icon: '<svg viewBox="0 0 24 24"><path d="M1 1" /></svg>', text: '已連接' }, 'success');

    const status = document.querySelector('#status');
    expect(status.className).toBe('status-message success');
    expect(status.querySelector('.status-icon svg')).not.toBeNull();
    expect(status.querySelector('.status-text').textContent).toBe('已連接');

    jest.advanceTimersByTime(3000);
    expect(status.textContent).toBe('');

    ui.showSetupGuide();
    expect(document.querySelector('.setup-guide__title').textContent).toContain('快速設置');
    expect(document.querySelectorAll('.setup-guide__list li')).toHaveLength(4);
  });

  test('StorageManager renders tokenized safe status lines', () => {
    document.body.innerHTML = '<div id="data-status"></div>';

    const storage = new StorageManager({ showStatus: jest.fn() });
    storage.elements.dataStatus = document.querySelector('#data-status');

    storage.showDataStatus('已清理 12 個項目\n釋放 34 KB', 'success');

    const status = document.querySelector('#data-status');
    expect(status.className).toBe('status-message success');
    expect(status.querySelector('.status-icon')).not.toBeNull();
    expect([...status.querySelectorAll('.highlight-primary')].map(node => node.textContent)).toEqual([
      '12',
      '34',
    ]);
    expect(status.querySelector('br')).not.toBeNull();
  });

  test('AuthManager local helpers sync OAuth toggle and data source notice state', () => {
    document.body.innerHTML = `
      <input id="database-id" />
      <input id="oauth-connection-toggle" type="checkbox" />
      <div id="oauth-status"></div>
    `;
    const ui = {
      hideDataSourceUpgradeNotice: jest.fn(),
      showDataSourceUpgradeNotice: jest.fn(),
    };
    const auth = new AuthManager(ui);
    auth.elements.databaseIdInput = document.querySelector('#database-id');
    auth.elements.oauthConnectionToggle = document.querySelector('#oauth-connection-toggle');
    auth.elements.oauthStatus = document.querySelector('#oauth-status');

    expect(auth._resolveStoredDataSourceIds({ notionDatabaseId: 'legacy-db' })).toEqual({
      storedDataSourceId: '',
      storedLegacyId: 'legacy-db',
      resolvedId: 'legacy-db',
    });

    expect(auth._resolveDataSourceIdAndNotice({ notionDatabaseId: 'legacy-db' })).toBe('legacy-db');
    expect(document.querySelector('#database-id').value).toBe('legacy-db');
    expect(ui.showDataSourceUpgradeNotice).toHaveBeenCalledWith('legacy-db');

    auth._setOAuthToggleLoading(true);
    expect(auth.elements.oauthConnectionToggle.disabled).toBe(true);
    expect(auth.elements.oauthConnectionToggle.getAttribute('aria-checked')).toBe('true');

    auth._setOAuthToggleDisconnected();
    expect(auth.elements.oauthConnectionToggle.checked).toBe(false);
    expect(auth.elements.oauthConnectionToggle.disabled).toBe(false);

    auth._renderConnectedStatus(auth.elements.oauthStatus, '已連接 — Workspace');
    expect(auth.elements.oauthStatus.textContent).toContain('已連接');
    expect(auth.elements.oauthStatus.className).toBe(AuthManager.CLASS_AUTH_SUCCESS);
  });

  test('options module exports normalize Notion IDs and render title preview safely', () => {
    const normalized = cleanDatabaseId(
      'https://www.notion.so/workspace/12345678-90ab-cdef-1234-567890abcdef?v=abc'
    );
    expect(normalized).toBe('1234567890abcdef1234567890abcdef');
    expect(cleanDatabaseId('not-a-notion-id')).toBe('');

    expect(formatTitle('{title} - {domain} - {missing}', {
      title: '文章標題',
      domain: 'example.com',
    })).toBe('文章標題 - example.com - {missing}');

    document.body.innerHTML = `
      <button id="preview-template"></button>
      <input id="title-template" value="{title} / {domain}" />
      <div id="template-preview" class="hidden"></div>
    `;

    setupTemplatePreview();
    document.querySelector('#preview-template').click();

    const preview = document.querySelector('#template-preview');
    expect(preview.classList.contains('hidden')).toBe(false);
    expect(preview.querySelector('strong').textContent).toContain('預覽');
    expect(preview.textContent).toContain('範例網頁標題');
    expect(preview.textContent).toContain('example.com');
  });
});

describe('SearchableDatabaseSelector native ESM tests', () => {
  let selector = null;
  let mockShowStatus = null;
  let mockLoadDataSources = null;
  let mockGetApiKey = null;

  beforeEach(() => {
    Element.prototype.scrollIntoView = jest.fn();
    document.body.innerHTML = `
      <div id="database-selector-container" class="hidden">
        <input type="text" id="database-search" />
        <button id="selector-toggle"></button>
        <div id="database-dropdown" class="hidden"></div>
        <div id="data-source-list"></div>
        <div id="data-source-count"></div>
        <button id="refresh-databases"></button>
      </div>
      <input type="hidden" id="database-id" />
      <input type="hidden" id="database-type" />
    `;

    mockShowStatus = jest.fn();
    mockLoadDataSources = jest.fn();
    mockGetApiKey = jest.fn().mockResolvedValue('mock_api_key');

    selector = new SearchableDatabaseSelector({
      showStatus: mockShowStatus,
      loadDataSources: mockLoadDataSources,
      getApiKey: mockGetApiKey,
    });
  });

  test('constructor initializes element mappings', () => {
    expect(selector.container).toBeTruthy();
    expect(selector.searchInput).toBeTruthy();
  });

  test('populateDataSources handles basic database records and populates lists', () => {
    const mockDatabases = [
      { id: 'db1', object: 'database', title: [{ plain_text: 'DB One' }] },
      { id: 'page1', object: 'page', properties: { title: { title: [{ plain_text: 'Page One' }] } } },
    ];
    selector.populateDataSources(mockDatabases);
    expect(selector.dataSources).toHaveLength(2);
    expect(selector.dataSourceList.children).toHaveLength(2);
    expect(selector.dataSourceList.children[0].textContent).toContain('DB One');
    expect(selector.dataSourceList.children[1].textContent).toContain('Page One');
    expect(selector.searchInput.placeholder).toBe('搜尋保存目標...');
  });

  test('extractDataSourceTitle extracts various title structures safely', () => {
    const pageDb = {
      object: 'page',
      properties: { title: { title: [{ plain_text: 'Page Title' }] } }
    };
    expect(SearchableDatabaseSelector.extractDataSourceTitle(pageDb)).toBe('Page Title');

    const topDb = {
      object: 'database',
      title: [{ plain_text: 'Top DB' }]
    };
    expect(SearchableDatabaseSelector.extractDataSourceTitle(topDb)).toBe('Top DB');
  });
});

describe('storageDataUtils native ESM diagnostics', () => {
  const originalChrome = globalThis.chrome;

  afterEach(() => {
    globalThis.chrome = originalChrome;
  });

  function installStorageSnapshot(snapshot) {
    globalThis.chrome = {
      runtime: {
        lastError: null,
      },
      storage: {
        local: {
          get: jest.fn((_keys, callback) => callback(snapshot)),
        },
      },
    };
  }

  test('buildImportExecutionPlan classifies overwrite, conflict, skip, and new-only work', () => {
    const localData = {
      page_conflict: { highlights: [{ id: 'old' }] },
      page_same: { highlights: [{ id: 'same' }] },
      saved_legacy: true,
    };
    const sanitizedData = {
      page_conflict: { highlights: [{ id: 'new' }] },
      page_new: { highlights: [] },
      page_same: { highlights: [{ id: 'same' }] },
    };

    expect(buildImportExecutionPlan('new-only', sanitizedData, localData)).toMatchObject({
      dataToWrite: { page_new: { highlights: [] } },
      effectiveNewCount: 1,
      effectiveOverwriteCount: 0,
      skipCount: 1,
      conflictSkipCount: 1,
      hasWork: true,
    });

    const overwritePlan = buildImportExecutionPlan('overwrite-all', sanitizedData, localData);
    expect(overwritePlan.dataToWrite).toEqual({
      page_conflict: { highlights: [{ id: 'new' }] },
      page_new: { highlights: [] },
    });
    expect(overwritePlan.keysToRemove).toEqual(['saved_legacy']);
    expect(() => buildImportExecutionPlan('unknown-mode', {}, {})).toThrow(
      'Unknown import mode: unknown-mode'
    );
  });

  test('sanitizeBackupData keeps only backup-safe storage prefixes', () => {
    expect(sanitizeBackupData(null)).toEqual({});
    expect(
      sanitizeBackupData({
        page_article: { notion: null, highlights: [] },
        highlights_article: [{ id: 'h1' }],
        saved_article: true,
        'url_alias:https://example.com': 'https://example.com',
        notionOAuthToken: 'secret',
        migration_old_data: { done: true },
      })
    ).toEqual({
      page_article: { notion: null, highlights: [] },
      highlights_article: [{ id: 'h1' }],
      saved_article: true,
      'url_alias:https://example.com': 'https://example.com',
    });
  });

  test('getStorageHealthReport classifies empty, orphan, corrupted, migration, and config records', async () => {
    installStorageSnapshot({
      page_valid: { notion: { pageId: 'page-1' }, highlights: [{ id: 'h1' }] },
      page_empty: { notion: null, highlights: [] },
      page_corrupted: { notion: { pageId: 'page-2' } },
      highlights_orphan: [],
      highlights_saved: { highlights: [{ id: 'h2' }, { id: 'h3' }] },
      saved_saved: { notionPageId: 'page-3' },
      'url_alias:https://missing.example': '',
      migration_old_data: { version: 1 },
      config_notion_target: 'database-1',
    });

    const report = await getStorageHealthReport();

    expect(report.pages).toBe(4);
    expect(report.highlights).toBe(3);
    expect(report.configs).toBe(1);
    expect(report.legacySavedKeys).toBe(1);
    expect(report.migrationKeys).toBe(1);
    expect(report.corruptedData).toContain('page_corrupted');
    expect(report.cleanupPlan.summary).toMatchObject({
      emptyRecords: 1,
      orphanRecords: 2,
      migrationLeftovers: 1,
      corruptedRecords: 1,
    });
    expect(report.cleanupPlan.items.map(item => item.key)).toEqual(
      expect.arrayContaining([
        'page_empty',
        'page_corrupted',
        'highlights_orphan',
        'url_alias:https://missing.example',
        'migration_old_data',
      ])
    );
  });
});

describe('staticOptionMessages native ESM diagnostics', () => {
  test('resolveUiMessage returns configured messages and fallback values', () => {
    expect(resolveUiMessage('OPTIONS.DESTINATION.HELP_LINK_TEXT')).toBeTruthy();
    expect(resolveUiMessage('', 'fallback')).toBe('fallback');
    expect(resolveUiMessage('OPTIONS.DOES_NOT_EXIST', 'fallback')).toBe('fallback');
  });

  test('applyStaticOptionMessages updates text, attributes, and composite message nodes', () => {
    document.body.innerHTML = `
      <section>
        <h1 data-ui-message="OPTIONS.DESTINATION.SECTION_TITLE"></h1>
        <input data-ui-placeholder="OPTIONS.DESTINATION.MANUAL_ID_PLACEHOLDER" />
        <button data-ui-title="OPTIONS.DESTINATION.REFRESH_TITLE"></button>
        <button data-ui-aria-label="OPTIONS.SETTINGS.SAVE_BUTTON"></button>
        <p data-ui-composite="destination-target-help"><a href="#help"></a></p>
        <p data-ui-composite="guide-shortcut-desc">
          <code class="kbd"></code><code class="kbd"></code>
        </p>
        <p data-ui-composite="guide-faq-token-answer"><code class="inline-code"></code></p>
      </section>
    `;

    applyStaticOptionMessages(document);

    expect(document.querySelector('[data-ui-message]').textContent).toBeTruthy();
    expect(document.querySelector('[data-ui-placeholder]').getAttribute('placeholder')).toBeTruthy();
    expect(document.querySelector('[data-ui-title]').getAttribute('title')).toBeTruthy();
    expect(document.querySelector('[data-ui-aria-label]').getAttribute('aria-label')).toBeTruthy();
    expect(document.querySelector('[data-ui-composite="destination-target-help"]').textContent)
      .toContain(document.querySelector('[data-ui-composite="destination-target-help"] a').textContent);
    expect(
      [...document.querySelectorAll('[data-ui-composite="guide-shortcut-desc"] code')].map(
        code => code.textContent
      )
    ).toEqual(expect.arrayContaining(['Ctrl+S', 'Cmd+S']));
    expect(
      document.querySelector('[data-ui-composite="guide-faq-token-answer"] code').textContent
    ).toBeTruthy();
  });
});

describe('MigrationTool native ESM diagnostics', () => {
  const originalChrome = globalThis.chrome;

  afterEach(() => {
    globalThis.chrome = originalChrome;
  });

  function installChromeRuntime(resolver = async () => ({ success: true })) {
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage: jest.fn(message => Promise.resolve(resolver(message))),
      },
    };
    return globalThis.chrome.runtime.sendMessage;
  }

  function createMigrationTool() {
    renderMigrationToolDom();
    installChromeRuntime(message => {
      if (message.action === RUNTIME_ACTIONS.MIGRATION_GET_PENDING) {
        return { success: true, items: [], failedItems: [] };
      }
      return { success: true };
    });

    const tool = new MigrationTool({ showStatus: jest.fn() });
    tool.init();
    globalThis.chrome.runtime.sendMessage.mockClear();
    return tool;
  }

  test('scan results render selectable migration items and update selection state', async () => {
    const tool = createMigrationTool();
    tool.scanner = {
      scanStorage: jest.fn(async () => ({
        needsMigration: true,
        items: [
          { url: 'https://example.com/one', highlightCount: 2 },
          { url: 'https://example.com/two', highlightCount: 3 },
        ],
      })),
    };

    await tool.scanForLegacyHighlights();

    expect(tool.scanner.scanStorage).toHaveBeenCalled();
    expect(document.querySelector('#scan-status').textContent).toContain('2 個頁面');
    expect(document.querySelector('#scan-status').textContent).toContain('5 個舊版標記');
    expect(document.querySelector('#migration-list').style.display).toBe('block');
    expect(document.querySelectorAll('#migration-items input[type="checkbox"]')).toHaveLength(2);

    const [firstCheckbox] = document.querySelectorAll('#migration-items input[type="checkbox"]');
    firstCheckbox.checked = true;
    firstCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

    expect(tool.selectedUrls).toEqual(new Set(['https://example.com/one']));
    expect(document.querySelector('#migration-selected-count').textContent).toBe('已選 1 項');
    expect(document.querySelector('#migration-execute-button').disabled).toBe(false);
    expect(document.querySelector('#migration-select-all').indeterminate).toBe(true);

    document.querySelector('#migration-select-all').checked = true;
    document
      .querySelector('#migration-select-all')
      .dispatchEvent(new Event('change', { bubbles: true }));

    expect(tool.selectedUrls).toEqual(
      new Set(['https://example.com/one', 'https://example.com/two'])
    );
    expect(document.querySelector('#migration-selected-count').textContent).toBe('已選 2 項');
  });

  test('performSelectedMigration sends batch request and renders success result with pending hint', async () => {
    const tool = createMigrationTool();
    const dispatchSpy = jest.spyOn(document, 'dispatchEvent');
    const sendMessage = installChromeRuntime(message => {
      if (message.action === RUNTIME_ACTIONS.MIGRATION_BATCH) {
        return {
          success: true,
          results: {
            success: 1,
            failed: 0,
            total: 1,
            details: [
              {
                status: 'success',
                url: 'https://example.com/migrated',
                count: 4,
                pending: 2,
              },
            ],
          },
        };
      }
      return { success: true, items: [], failedItems: [] };
    });

    tool.selectedUrls = new Set(['https://example.com/migrated']);

    await tool.performSelectedMigration();

    expect(sendMessage).toHaveBeenCalledWith({
      action: RUNTIME_ACTIONS.MIGRATION_BATCH,
      urls: ['https://example.com/migrated'],
    });
    expect(document.querySelector('#migration-progress').style.display).toBe('none');
    expect(tool.selectedUrls.size).toBe(0);
    expect(document.querySelector('#migration-result').textContent).toContain('批量遷移完成');
    expect(document.querySelector('#migration-result').textContent).toContain('2 個標註等待完成位置定位');
    expect(document.querySelector('#migration-result a').href).toBe('https://example.com/migrated');
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'storageUsageUpdate' }));
    dispatchSpy.mockRestore();
  });

  test('batch migration failure keeps selected URLs available for retry', async () => {
    const tool = createMigrationTool();
    installChromeRuntime(message => {
      if (message.action === RUNTIME_ACTIONS.MIGRATION_BATCH) {
        return { success: false, error: '批次遷移失敗' };
      }
      return { success: true, items: [], failedItems: [] };
    });
    tool.selectedUrls = new Set(['https://example.com/retry']);

    await tool.performSelectedMigration();

    expect(tool.selectedUrls).toEqual(new Set(['https://example.com/retry']));
    expect(document.querySelector('#migration-result').textContent).toContain('批次遷移失敗');
  });

  test('pending and failed migration lists render actionable rows', async () => {
    const tool = createMigrationTool();
    const sendMessage = installChromeRuntime(message => {
      if (message.action === RUNTIME_ACTIONS.MIGRATION_DELETE_FAILED) {
        return { success: true };
      }
      if (message.action === RUNTIME_ACTIONS.MIGRATION_GET_PENDING) {
        return {
          success: true,
          items: [{ url: 'https://example.com/pending', totalCount: 4, pendingCount: 1 }],
          failedItems: [{ url: 'https://example.com/failed', totalCount: 3, failedCount: 2 }],
        };
      }
      return { success: true };
    });

    await tool.loadPendingMigrations();

    expect(document.querySelector('#pending-migration-section').style.display).toBe('block');
    expect(document.querySelector('#pending-migration-list').textContent).toContain('1 / 4 待完成');
    expect(document.querySelector('#failed-migration-section').style.display).toBe('block');
    expect(document.querySelector('#failed-migration-list').textContent).toContain('2 個無法恢復');

    document.querySelector('.delete-failed-btn').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(sendMessage).toHaveBeenCalledWith({
      action: RUNTIME_ACTIONS.MIGRATION_DELETE_FAILED,
      url: 'https://example.com/failed',
    });
  });

  test('deletion response helpers render success and partial-failure summaries', () => {
    const tool = createMigrationTool();

    tool.handleBatchDeletionResponse(
      { success: true, results: { success: 3, failed: 0, total: 3 } },
      ['https://example.com/one', 'https://example.com/two', 'https://example.com/three']
    );

    expect(document.querySelector('#migration-result').textContent).toContain('刪除成功');
    expect(document.querySelector('#migration-result').textContent).toContain('已刪除 3 個頁面');

    tool.handleBatchDeletionResponse(
      { success: true, results: { success: 1, failed: 2, total: 3 } },
      ['https://example.com/one', 'https://example.com/two', 'https://example.com/three']
    );

    expect(document.querySelector('#migration-result').textContent).toContain('部分刪除完成');
    expect(document.querySelector('#migration-result').textContent).toContain('成功: 1, 失敗: 2, 總計: 3');
  });
});

describe('debugLogExportUI native ESM diagnostics', () => {
  const originalChrome = globalThis.chrome;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  afterEach(() => {
    globalThis.chrome = originalChrome;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });

  function installLogExportResponse(response) {
    globalThis.chrome = {
      runtime: {
        sendMessage: jest.fn(async () => response),
      },
    };
  }

  test('exports validated logs, downloads a blob, and clears success status', async () => {
    jest.useFakeTimers();
    renderDebugLogExportDom();
    installLogExportResponse({
      success: true,
      data: {
        filename: 'debug-log.json',
        content: '{"logs":[]}',
        mimeType: 'application/json',
        count: 2,
      },
    });
    URL.createObjectURL = jest.fn(() => 'blob:debug-log');
    URL.revokeObjectURL = jest.fn();
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    setupDebugLogExport();
    document.querySelector('#export-logs-button').click();
    await flushAsyncClickHandler();

    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: RUNTIME_ACTIONS.EXPORT_DEBUG_LOGS,
      format: 'json',
    });
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickSpy).toHaveBeenCalled();
    expect(document.querySelector('#export-status').textContent).toContain('2');
    expect(document.querySelector('#export-status').className).toBe('status-message success');
    expect(document.querySelector('#export-logs-button').disabled).toBe(false);

    jest.advanceTimersByTime(100);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:debug-log');
    jest.advanceTimersByTime(3000);
    expect(document.querySelector('#export-status').textContent).toBe('');
    expect(document.querySelector('#export-status').className).toBe('status-message');
    clickSpy.mockRestore();
  });

  test('renders sanitized export errors and clears the failure status', async () => {
    jest.useFakeTimers();
    renderDebugLogExportDom();
    installLogExportResponse({ success: false, error: 'server denied' });

    setupDebugLogExport();
    document.querySelector('#export-logs-button').click();
    await flushAsyncClickHandler();

    expect(loggerMock.error).toHaveBeenCalledWith('Log export failed', {
      action: 'exportLog',
      result: 'failed',
      error: 'server denied',
    });
    expect(document.querySelector('#export-status').textContent).toContain('server denied');
    expect(document.querySelector('#export-status').className).toBe('status-message error');

    jest.advanceTimersByTime(5000);
    expect(document.querySelector('#export-status').textContent).toBe('');
    expect(document.querySelector('#export-status').className).toBe('status-message');
  });
});
