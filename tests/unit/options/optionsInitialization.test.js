/**
 * optionsInitialization.test.js
 *
 * Tests for options initialization, sidebar navigation, and URL routing logic.
 */

import { initOptions } from '../../../pages/options/options.js';
import { UIManager } from '../../../pages/options/UIManager.js';
import { AuthManager } from '../../../pages/options/AuthManager.js';
import { DataSourceManager } from '../../../pages/options/DataSourceManager.js';
import { StorageManager } from '../../../pages/options/StorageManager.js';
import { MigrationTool } from '../../../pages/options/MigrationTool.js';
import { BUILD_ENV } from '../../../scripts/config/env/index.js';
import Logger from '../../../scripts/utils/Logger.js';
import { sanitizeApiError } from '../../../scripts/utils/ApiErrorSanitizer.js';
import {
  appendSaveFormFields,
  flushAsyncClick,
  waitForLoggerWarn,
  buildNavigationDOM,
  buildChromeMock,
  buildProfileManagerMock,
} from '../../helpers/optionsTestHarness.js';

// Mocks for dependencies
jest.mock('../../../scripts/config/env/index.js', () => ({
  BUILD_ENV: {
    ENABLE_OAUTH: true,
    ENABLE_ACCOUNT: true,
    OAUTH_SERVER_URL: 'https://worker.test',
    OAUTH_CLIENT_ID: '',
    EXTENSION_API_KEY: '',
  },
}));
jest.mock('../../../pages/options/UIManager.js');
jest.mock('../../../pages/options/AuthManager.js');
jest.mock('../../../pages/options/DataSourceManager.js');
jest.mock('../../../pages/options/StorageManager.js');
jest.mock('../../../pages/options/MigrationTool.js');
jest.mock('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: require('../../helpers/loggerMock.js').createLoggerMock(),
}));
jest.mock('../../../scripts/auth/accountSession.js', () => ({
  getAccountProfile: jest.fn(),
  getAccountAccessToken: jest.fn(),
  clearAccountSession: jest.fn().mockResolvedValue(),
}));

jest.mock('../../../scripts/destinations/ProfileManager.js', () => ({
  ProfileManager: jest.fn().mockImplementation(() => ({
    listProfiles: jest.fn().mockResolvedValue([{ id: 'default' }]),
    getDestinationEntitlement: jest
      .fn()
      .mockResolvedValue({ maxProfiles: 2, accountSignedIn: true, source: 'test' }),
    ensureMigratedDefaultProfile: jest.fn().mockResolvedValue([{ id: 'default' }]),
    createProfile: jest.fn().mockResolvedValue({ id: 'profile-2' }),
    getProfile: jest.fn().mockResolvedValue({
      id: 'default',
      name: 'Default',
      notionDataSourceId: 'source-1',
      notionDataSourceType: 'database',
    }),
    updateProfile: jest.fn().mockResolvedValue({ id: 'default' }),
    deleteProfile: jest.fn().mockResolvedValue([{ id: 'default' }]),
  })),
}));

describe('optionsInitialization', () => {
  describe('Initialization (initOptions)', () => {
    let mockUiInstance = null;
    let mockAuthInstance = null;
    let mockDataSourceInstance = null;
    let mockStorageInstance = null;
    let mockMigrationInstance = null;
    const originalEnableOauth = BUILD_ENV.ENABLE_OAUTH;
    const originalHref = globalThis.location.href;

    beforeEach(() => {
      jest.clearAllMocks();
      BUILD_ENV.ENABLE_OAUTH = originalEnableOauth;

      // Setup mock instances
      mockUiInstance = { init: jest.fn(), showStatus: jest.fn() };
      mockAuthInstance = { init: jest.fn(), checkAuthStatus: jest.fn() };
      mockDataSourceInstance = { init: jest.fn(), loadDataSources: jest.fn() };
      mockStorageInstance = { init: jest.fn(), updateStorageUsage: jest.fn() };
      mockMigrationInstance = { init: jest.fn() };

      // Setup implementations
      UIManager.mockImplementation(() => mockUiInstance);
      AuthManager.mockImplementation(() => mockAuthInstance);
      DataSourceManager.mockImplementation(() => mockDataSourceInstance);
      StorageManager.mockImplementation(() => mockStorageInstance);
      MigrationTool.mockImplementation(() => mockMigrationInstance);

      // Setup DOM
      document.body.innerHTML = `
            <button id="save-button"></button>
            <button id="save-templates-button"></button>
            <div id="app-version"></div>
            <div class="nav-item" data-section="general"></div>
            <div id="section-general" class="settings-section"></div>
            <button id="preview-template"></button>
            <input id="title-template" />
            <div id="template-preview"></div>
            <select id="ui-zoom-level">
              <option value="1">1</option>
              <option value="1.1">1.1</option>
            </select>
        `;

      // JSDOM doesn't support zoom property, so we mock it
      Object.defineProperty(document.body.style, 'zoom', {
        value: '',
        writable: true,
        configurable: true,
      });

      globalThis.chrome = buildChromeMock();
    });

    afterEach(() => {
      BUILD_ENV.ENABLE_OAUTH = originalEnableOauth;
      globalThis.history.replaceState({}, '', originalHref);
    });

    it('should initialize all managers and check auth status', () => {
      initOptions();

      expect(UIManager).toHaveBeenCalled();
      expect(AuthManager).toHaveBeenCalled();
      expect(DataSourceManager).toHaveBeenCalledWith(expect.anything(), expect.any(Function));
      expect(StorageManager).toHaveBeenCalled();
      expect(MigrationTool).toHaveBeenCalled();

      expect(mockUiInstance.init).toHaveBeenCalled();
      expect(mockAuthInstance.init).toHaveBeenCalled();
      expect(mockDataSourceInstance.init).toHaveBeenCalled();
      expect(mockStorageInstance.init).toHaveBeenCalled();
      expect(mockMigrationInstance.init).toHaveBeenCalled();
      expect(mockAuthInstance.checkAuthStatus).toHaveBeenCalled();
    });

    it('初始化保存目標 UI 失敗時應只記錄脫敏後錯誤', async () => {
      const { ProfileManager } = require('../../../scripts/destinations/ProfileManager.js');
      document.body.innerHTML += `
        <div id="destination-profile-list"></div>
        <button id="add-destination-profile"></button>
        <div id="destination-profile-status"></div>
        <input id="destination-profile-name" />
      `;
      const initError = new Error('Storage unavailable with token secret_12345');
      ProfileManager.mockImplementationOnce(() => ({
        ensureMigratedDefaultProfile: jest.fn().mockRejectedValue(initError),
        listProfiles: jest.fn(),
        getDestinationEntitlement: jest.fn(),
        createProfile: jest.fn(),
        getProfile: jest.fn(),
        updateProfile: jest.fn(),
        deleteProfile: jest.fn(),
      }));

      initOptions();
      const logCall = await waitForLoggerWarn(Logger, '初始化保存目標 UI 失敗');

      expect(logCall).toEqual([
        '初始化保存目標 UI 失敗',
        {
          action: 'initDestinationProfilesUI',
          error: sanitizeApiError(initError, 'initDestinationProfilesUI'),
        },
      ]);
      expect(Logger.warn).not.toHaveBeenCalledWith(
        '初始化保存目標 UI 失敗',
        expect.objectContaining({ error: initError })
      );
    });

    it('account session 更新後應重新初始化保存目標 UI', async () => {
      const service = buildProfileManagerMock();
      const { ProfileManager } = require('../../../scripts/destinations/ProfileManager.js');
      ProfileManager.mockImplementationOnce(() => service);
      document.body.innerHTML += `
        <div id="destination-profile-list"></div>
        <button id="add-destination-profile"></button>
        <div id="destination-profile-status"></div>
        <input id="destination-profile-name" />
      `;

      initOptions();
      await flushAsyncClick();
      const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];
      listener({ action: 'account_session_updated' });
      await flushAsyncClick();

      expect(ProfileManager).toHaveBeenCalledTimes(1);
      expect(service.listProfiles).toHaveBeenCalledTimes(2);
      expect(service.getDestinationEntitlement).toHaveBeenCalledTimes(2);
    });

    describe('DataSourceManager getApiKey callback', () => {
      beforeEach(() => {
        document.body.innerHTML += '<input id="api-key" value="fallback-key" />';
      });

      it('should return token from AuthManager if activeAuth exists', async () => {
        AuthManager.getActiveNotionToken = jest.fn().mockResolvedValue({ token: 'oauth-token' });
        initOptions();

        const getApiKeyCallback = DataSourceManager.mock.calls[0][1];
        const token = await getApiKeyCallback();

        expect(token).toBe('oauth-token');
        expect(AuthManager.getActiveNotionToken).toHaveBeenCalled();
      });

      it('should fallback to #api-key if token is missing', async () => {
        AuthManager.getActiveNotionToken = jest.fn().mockResolvedValue({ token: null });
        initOptions();

        const getApiKeyCallback = DataSourceManager.mock.calls[0][1];
        const token = await getApiKeyCallback();

        expect(token).toBe('fallback-key');
      });

      it('should fallback to #api-key if activeAuth is null', async () => {
        AuthManager.getActiveNotionToken = jest.fn().mockResolvedValue(null);
        initOptions();

        const getApiKeyCallback = DataSourceManager.mock.calls[0][1];
        const token = await getApiKeyCallback();

        expect(token).toBe('fallback-key');
      });

      it('should return empty string if fallback input is missing or empty', async () => {
        AuthManager.getActiveNotionToken = jest.fn().mockResolvedValue(null);
        document.querySelector('#api-key').value = '';
        initOptions();

        const getApiKeyCallback = DataSourceManager.mock.calls[0][1];
        const token = await getApiKeyCallback();

        expect(token).toBe('');
      });
    });

    it('should display app version', () => {
      globalThis.chrome.runtime.getManifest = jest.fn(() => ({ version: '1.2.3' }));
      initOptions();
      const versionEl = document.querySelector('#app-version');
      expect(versionEl.textContent).toBe('v1.2.3');
    });

    it('should handle version display error gracefully', () => {
      globalThis.chrome.runtime.getManifest = jest.fn(() => {
        throw new Error('No manifest');
      });
      initOptions();
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('無法獲取應用程式版本號'),
        expect.objectContaining({ error: expect.any(Error) })
      );
    });

    it('should handle oauth messages', () => {
      initOptions();

      const messageListener = globalThis.chrome.runtime.onMessage.addListener.mock.calls[0][0];

      // Test Success
      messageListener({ action: 'oauth_success' });
      expect(mockAuthInstance.checkAuthStatus).toHaveBeenCalledTimes(2); // 1 initial + 1 event
      expect(mockUiInstance.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('連接成功'),
        'success'
      );

      // Test Failure
      messageListener({ action: 'oauth_failed' });
      expect(mockUiInstance.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('連接失敗'),
        'error'
      );
    });

    it('當 OAuth 被停用時應隱藏連接按鈕', () => {
      BUILD_ENV.ENABLE_OAUTH = false;
      document.body.innerHTML += `
        <button id="oauth-connect-button" style="display:block"></button>
        <button id="oauth-disconnect-button" style="display:block"></button>
      `;

      initOptions();

      expect(document.querySelector('#oauth-connect-button').classList.contains('hidden')).toBe(
        true
      );
      expect(document.querySelector('#oauth-disconnect-button').classList.contains('hidden')).toBe(
        true
      );
    });

    it('應監聽 storageUsageUpdate 事件並更新儲存使用量', () => {
      initOptions();

      document.dispatchEvent(new Event('storageUsageUpdate'));

      expect(mockStorageInstance.updateStorageUsage).toHaveBeenCalledTimes(1);
    });

    it('應初始化 Notion 同步樣式選單', () => {
      document.body.innerHTML += `
        <select id="highlight-content-style">
          <option value="COLOR_SYNC">COLOR_SYNC</option>
          <option value="inline">inline</option>
        </select>
      `;
      globalThis.chrome.storage.sync.get = jest.fn((keys, cb) => {
        if (Array.isArray(keys)) {
          cb({});
          return;
        }

        cb({ highlightContentStyle: 'inline' });
      });

      initOptions();

      expect(globalThis.chrome.storage.sync.get).toHaveBeenCalledWith(
        { highlightContentStyle: 'COLOR_SYNC' },
        expect.any(Function)
      );
      expect(document.querySelector('#highlight-content-style').value).toBe('inline');
    });

    it('should handle navigation', () => {
      initOptions();
      const navItem = document.querySelector('.nav-item');
      const section = document.querySelector('#section-general');

      navItem.click();
      expect(navItem.classList.contains('active')).toBe(true);
      expect(section.classList.contains('active')).toBe(true);
    });

    it('導航項目缺少 data-section 時應記錄警告', () => {
      document.body.innerHTML = `
        <button id="save-button"></button>
        <button id="save-templates-button"></button>
        <div id="app-version"></div>
        <div class="nav-item"></div>
        <div id="section-general" class="settings-section"></div>
      `;

      initOptions();

      document.querySelector('.nav-item').click();

      expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('缺少 data-section'), {
        action: 'setupSidebarNavigation',
        tagName: 'DIV',
        targetId: null,
        sectionName: null,
      });
    });

    it('導航目標區塊不存在時應記錄警告', () => {
      document.body.innerHTML = `
        <button id="save-button"></button>
        <button id="save-templates-button"></button>
        <div id="app-version"></div>
        <div class="nav-item" data-section="advanced"></div>
        <div id="section-general" class="settings-section"></div>
      `;

      initOptions();

      document.querySelector('.nav-item').click();

      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('找不到目標區塊'),
        expect.objectContaining({
          action: 'setupSidebarNavigation',
          targetId: 'section-advanced',
        })
      );
    });

    it('切換導航時應停用非目標區塊並更新 aria 屬性', () => {
      buildNavigationDOM({ activeSection: 'general' });

      initOptions();

      const navItems = document.querySelectorAll('.nav-item');
      const sections = document.querySelectorAll('.settings-section');

      navItems[1].click();

      expect(navItems[0].classList.contains('active')).toBe(false);
      expect(navItems[0].getAttribute('aria-selected')).toBe('false');
      expect(navItems[1].classList.contains('active')).toBe(true);
      expect(navItems[1].getAttribute('aria-selected')).toBe('true');
      expect(sections[0].classList.contains('active')).toBe(false);
      expect(sections[0].getAttribute('aria-hidden')).toBe('true');
      expect(sections[1].classList.contains('active')).toBe(true);
      expect(sections[1].getAttribute('aria-hidden')).toBe('false');
    });

    it('網址帶 ?section=advanced 時應在初始化後切到 advanced 區塊', () => {
      globalThis.history.replaceState({}, '', '/pages/options/options.html?section=advanced');
      buildNavigationDOM({ activeSection: 'general' });

      initOptions();

      expect(document.querySelector('#tab-general').classList.contains('active')).toBe(false);
      expect(document.querySelector('#tab-general').getAttribute('aria-selected')).toBe('false');
      expect(document.querySelector('#tab-advanced').classList.contains('active')).toBe(true);
      expect(document.querySelector('#tab-advanced').getAttribute('aria-selected')).toBe('true');
      expect(document.querySelector('#section-general').classList.contains('active')).toBe(false);
      expect(document.querySelector('#section-general').getAttribute('aria-hidden')).toBe('true');
      expect(document.querySelector('#section-advanced').classList.contains('active')).toBe(true);
      expect(document.querySelector('#section-advanced').getAttribute('aria-hidden')).toBe('false');
    });

    it('網址帶不合法 section 時應維持預設 general 區塊', () => {
      globalThis.history.replaceState({}, '', '/pages/options/options.html?section=unknown');
      buildNavigationDOM({ activeSection: 'general' });

      initOptions();

      expect(document.querySelector('#tab-general').classList.contains('active')).toBe(true);
      expect(document.querySelector('#tab-general').getAttribute('aria-selected')).toBe('true');
      expect(document.querySelector('#tab-advanced').classList.contains('active')).toBe(false);
      expect(document.querySelector('#section-general').classList.contains('active')).toBe(true);
      expect(document.querySelector('#section-advanced').classList.contains('active')).toBe(false);
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('找不到目標區塊'),
        expect.objectContaining({
          action: 'setupSidebarNavigation',
          targetId: 'unknown',
        })
      );
    });

    it('點擊保存按鈕時應以 status 狀態區儲存設定', async () => {
      appendSaveFormFields();
      globalThis.chrome.storage.local = { set: jest.fn().mockResolvedValue() };
      globalThis.chrome.storage.sync.set = jest.fn().mockResolvedValue();

      initOptions();
      document.querySelector('#save-button').click();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(globalThis.chrome.storage.sync.set).toHaveBeenCalledWith(
        expect.objectContaining({
          notionApiKey: 'key_123',
        })
      );
      expect(mockUiInstance.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('成功'),
        'success',
        'status'
      );
    });

    it('點擊保存模板按鈕時應以 template-status 狀態區儲存設定', async () => {
      appendSaveFormFields();
      document.body.innerHTML += '<div id="template-status"></div>';
      globalThis.chrome.storage.local = { set: jest.fn().mockResolvedValue() };
      globalThis.chrome.storage.sync.set = jest.fn().mockResolvedValue();

      initOptions();
      document.querySelector('#save-templates-button').click();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockUiInstance.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('成功'),
        'success',
        'template-status'
      );
    });

    it('should initialize zoom level', () => {
      globalThis.chrome.storage.sync.get = jest.fn((keys, cb) => {
        cb({ uiZoomLevel: '1.1' });
      });

      initOptions();

      const zoomSelect = document.querySelector('#ui-zoom-level');
      expect(globalThis.chrome.storage.sync.get).toHaveBeenCalledWith(
        ['uiZoomLevel'],
        expect.any(Function)
      );
      expect(document.body.style.zoom).toBe('1.1');
      expect(zoomSelect.value).toBe('1.1');
    });

    it('should handle zoom level change', () => {
      globalThis.chrome.storage.sync.get = jest.fn((keys, cb) => {
        cb({});
      });

      initOptions();

      const zoomSelect = document.querySelector('#ui-zoom-level');
      zoomSelect.value = '1.1';
      zoomSelect.dispatchEvent(new Event('change'));

      expect(document.body.style.zoom).toBe('1.1');
    });
  });
});
