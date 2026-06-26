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
const { UIManager } = await import('../../../../pages/options/UIManager.js');
const { StorageManager } = await import('../../../../pages/options/StorageManager.js');
const { AuthManager } = await import('../../../../pages/options/AuthManager.js');
const { cleanDatabaseId, formatTitle, setupTemplatePreview } = await import(
  '../../../../pages/options/options.js'
);
const { SearchableDatabaseSelector } = await import(
  '../../../../pages/options/SearchableDatabaseSelector.js'
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
