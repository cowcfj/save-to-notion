/**
 * @jest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const loggerMock = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  ready: jest.fn(),
  start: jest.fn(),
  success: jest.fn(),
  warn: jest.fn(),
};
const injectIconsMock = jest.fn();
const migrateDataSourceKeysMock = jest.fn(async () => {});
const getAccountAccessTokenMock = jest.fn(async () => 'account-token');
const getAccountProfileMock = jest.fn(async () => ({ email: 'user@example.test' }));
const getOptionsAdvancedUrlMock = jest.fn(() => 'chrome-extension://id/pages/options/options.html?section=advanced');
const profileManagerInstance = {
  getActiveProfile: jest.fn(async () => ({ id: 'profile-1', notionDataSourceId: 'ds-profile' })),
  getDestinationEntitlement: jest.fn(async () => ({ maxProfiles: 2 })),
  listProfiles: jest.fn(async () => [
    { id: 'profile-1', name: 'Inbox', color: '#2563eb' },
    { id: 'profile-2', name: 'Research', color: '#16a34a' },
  ]),
};

await jest.unstable_mockModule('../../../../scripts/utils/Logger.js', () => ({
  default: loggerMock,
}));

await jest.unstable_mockModule('../../../../scripts/utils/securityUtils.js', () => ({
  isValidNotionUrl: jest.fn(url => String(url).startsWith('https://www.notion.so/')),
}));

await jest.unstable_mockModule('../../../../scripts/utils/ApiErrorSanitizer.js', () => ({
  sanitizeApiError: jest.fn(error => error?.message || String(error || 'UNKNOWN_ERROR')),
}));

await jest.unstable_mockModule('../../../../scripts/utils/LogSanitizer.js', () => ({
  sanitizeUrlForLogging: jest.fn(url => url),
}));

await jest.unstable_mockModule('../../../../scripts/utils/accountDisplayUtils.js', () => ({
  resolveAccountDisplayProfile: jest.fn(profile => ({
    displayLabel: profile?.displayName || profile?.email || '',
  })),
}));

await jest.unstable_mockModule('../../../../scripts/utils/notionAuth.js', () => ({
  migrateDataSourceKeys: migrateDataSourceKeysMock,
}));

await jest.unstable_mockModule('../../../../scripts/utils/uiUtils.js', () => ({
  injectIcons: injectIconsMock,
}));

await jest.unstable_mockModule('../../../../scripts/utils/ErrorHandler.js', () => ({
  ErrorHandler: {
    formatUserMessage: jest.fn(error => String(error || 'UNKNOWN_ERROR')),
  },
}));

await jest.unstable_mockModule('../../../../scripts/auth/accountSession.js', () => ({
  getAccountAccessToken: getAccountAccessTokenMock,
  getAccountProfile: getAccountProfileMock,
}));

await jest.unstable_mockModule('../../../../scripts/auth/accountLogin.js', () => ({
  getOptionsAdvancedUrl: getOptionsAdvancedUrlMock,
}));

await jest.unstable_mockModule('../../../../scripts/auth/accountLoginInitiator.js', () => ({
  startAccountLogin: jest.fn(async () => ({ success: true })),
}));

await jest.unstable_mockModule('../../../../scripts/config/env/index.js', () => ({
  BUILD_ENV: {
    ENABLE_ACCOUNT: true,
    ENABLE_OAUTH: true,
    EXTENSION_API_KEY: '',
    OAUTH_CLIENT_ID: '',
    OAUTH_SERVER_URL: '',
  },
}));

await jest.unstable_mockModule('../../../../scripts/destinations/ProfileStore.js', () => ({
  AccountGatedDestinationEntitlementProvider: jest.fn(),
  LocalDestinationProfileRepository: jest.fn(),
}));

await jest.unstable_mockModule('../../../../scripts/destinations/ProfileManager.js', () => ({
  ProfileManager: jest.fn(() => profileManagerInstance),
}));

const popupUI = await import('../../../../pages/popup/popupUI.js');
const popupActions = await import('../../../../pages/popup/popupActions.js');
const popup = await import('../../../../pages/popup/popup.js');

function installChrome() {
  globalThis.chrome = {
    runtime: {
      sendMessage: jest.fn(async message => {
        const action = String(message.action || '').toLowerCase();
        if (action.includes('save')) {
          return { success: true, created: true, blockCount: 2, imageCount: 1 };
        }
        if (action.includes('highlight')) {
          return { success: true };
        }
        return {
          success: true,
          isSaved: true,
          canSave: true,
          canSyncHighlights: true,
          notionUrl: 'https://www.notion.so/native-esm',
          statusKind: 'saved',
        };
      }),
    },
    storage: {
      sync: {
        get: jest.fn(async () => ({
          notionApiKey: 'synthetic-manual-api-key',
          notionDataSourceId: 'ds-sync',
        })),
      },
      local: {
        get: jest.fn(async keys => {
          if (Array.isArray(keys)) {
            return {
              notionAuthMode: null,
              notionOAuthToken: null,
              notionDataSourceId: 'ds-local',
            };
          }
          return {};
        }),
      },
      session: {
        get: jest.fn(async () => ({ popupTempDestinationProfileId: 'profile-2' })),
        set: jest.fn(async () => {}),
      },
    },
    tabs: {
      create: jest.fn(async ({ url }) => ({ id: 9, url })),
      onActivated: { addListener: jest.fn() },
      query: jest.fn(async () => [{ id: 7, url: 'https://example.com/article' }]),
      sendMessage: jest.fn(async () => ({ success: true })),
    },
    sidePanel: {
      open: jest.fn(async () => {}),
    },
  };
}

function renderPopupDom() {
  document.body.innerHTML = `
    <h1 id="popup-title"></h1>
    <p id="status"></p>
    <button id="save-button"><span class="btn-text"></span></button>
    <button id="highlight-button"><span class="btn-text"></span></button>
    <button id="manage-button"><span class="btn-text"></span></button>
    <button id="open-notion-button"><span class="btn-text"></span></button>
    <section id="account-section"><button id="account-button"><span class="btn-text"></span></button><p id="account-status"></p></section>
    <section id="destination-section"><span id="destination-current"></span><button id="destination-toggle"></button><div id="destination-menu"></div></section>
    <span id="settings-link-text"></span>
  `;
}

beforeEach(() => {
  document.body.innerHTML = '';
  installChrome();
  jest.clearAllMocks();
});

afterEach(() => {
  delete globalThis.chrome;
});

describe('popup native ESM diagnostics', () => {
  test('popupUI renders status, destination selector, account state, and save messages', () => {
    renderPopupDom();
    const elements = popupUI.getElements();

    popupUI.initializePopupStaticText(elements);
    expect(document.title).toBe('Save to Notion');
    expect(elements.saveButton.querySelector('.btn-text').textContent).toBe('儲存頁面');

    popupUI.renderDestinationSelector(elements, {
      profiles: [
        { id: 'profile-1', name: 'Inbox', color: '#2563eb' },
        { id: 'profile-2', name: 'Research', color: '#16a34a' },
      ],
      selectedProfileId: 'profile-2',
    });
    expect(elements.destinationSection.style.display).toBe('block');
    expect(elements.destinationCurrent.textContent).toContain('Research');
    expect(elements.destinationMenu.querySelectorAll('.destination-menu-item')).toHaveLength(2);

    popupUI.updateUIForLoggedInAccount(elements, { email: 'user@example.test' });
    expect(elements.accountButton.classList.contains('is-signed-in')).toBe(true);
    popupUI.setAccountStatusError(elements, '登入失敗');
    expect(elements.accountStatus.textContent).toBe('登入失敗');

    popupUI.updateUIForSavedPage(elements, { notionUrl: 'https://www.notion.so/page' });
    expect(elements.openNotionButton.dataset.url).toBe('https://www.notion.so/page');
    popupUI.updateUIForUnsavedPage(elements, { wasDeleted: true });
    expect(elements.saveButton.style.display).toBe('block');

    expect(
      popupUI.formatSaveSuccessMessage({
        created: true,
        blockCount: 2,
        imageCount: 1,
        warning: '部分圖片未保存',
      })
    ).toEqual(expect.arrayContaining(['建立成功 (2 個區塊, 1 張圖片)', '部分圖片未保存']));
  });

  test('popupActions executes storage, runtime, tab, account, and destination flows', async () => {
    await expect(popupActions.checkSettings()).resolves.toMatchObject({
      valid: true,
      dataSourceId: 'ds-profile',
      hasManualApiKey: true,
    });
    expect(migrateDataSourceKeysMock).toHaveBeenCalled();

    await expect(popupActions.checkPageStatus({ forceRefresh: true })).resolves.toMatchObject({
      success: true,
      isSaved: true,
    });
    await expect(popupActions.savePage('profile-1')).resolves.toMatchObject({
      success: true,
      created: true,
    });
    await expect(popupActions.getDestinationState()).resolves.toMatchObject({
      selectedProfileId: 'profile-2',
    });
    await expect(popupActions.startHighlight()).resolves.toEqual({ success: true });
    await expect(popupActions.openNotionPage('https://www.notion.so/native-esm')).resolves.toMatchObject({
      success: true,
    });
    await expect(popupActions.getActiveTab()).resolves.toMatchObject({ id: 7 });
    await expect(popupActions.getPopupAccountState()).resolves.toMatchObject({
      enabled: true,
      isLoggedIn: true,
    });
    await expect(popupActions.openAccountManagement()).resolves.toEqual({ success: true });
    await popupActions.setPopupTempProfile('profile-1');
    expect(globalThis.chrome.storage.session.set).toHaveBeenCalledWith({
      popupTempDestinationProfileId: 'profile-1',
    });
  });

  test('popup entry initializes DOM with real page modules under native ESM', async () => {
    renderPopupDom();

    await popup.initPopup();

    expect(injectIconsMock).toHaveBeenCalled();
    expect(document.querySelector('#status').textContent).toBe('頁面已儲存，可開始標註。');
    expect(document.querySelector('#open-notion-button').dataset.url).toBe(
      'https://www.notion.so/native-esm'
    );
    expect(globalThis.chrome.tabs.onActivated.addListener).toHaveBeenCalled();
  });
});
