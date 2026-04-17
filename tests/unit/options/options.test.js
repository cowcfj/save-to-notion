/**
 * options.js Unit Tests
 *
 * Tests for exported helper functions in the main options controller
 */

import {
  saveSettings,
  formatTitle,
  setupTemplatePreview,
  cleanDatabaseId,
  initOptions,
} from '../../../options/options.js';

import { UIManager } from '../../../options/UIManager.js';
import { AuthManager } from '../../../options/AuthManager.js';
import { DataSourceManager } from '../../../options/DataSourceManager.js';
import { StorageManager } from '../../../options/StorageManager.js';
import { MigrationTool } from '../../../options/MigrationTool.js';
import { BUILD_ENV } from '../../../scripts/config/env.js';
import Logger from '../../../scripts/utils/Logger.js';
import { DATA_SOURCE_KEYS } from '../../../scripts/config/storageKeys.js';

// Mocks for dependencies
jest.mock('../../../scripts/config/env.js', () => ({
  BUILD_ENV: {
    ENABLE_OAUTH: true,
    ENABLE_ACCOUNT: true,
    OAUTH_SERVER_URL: 'https://worker.test',
    OAUTH_CLIENT_ID: '',
    EXTENSION_API_KEY: '',
  },
}));
jest.mock('../../../options/UIManager.js');
jest.mock('../../../options/AuthManager.js');
jest.mock('../../../options/DataSourceManager.js');
jest.mock('../../../options/StorageManager.js');
jest.mock('../../../options/MigrationTool.js');
jest.mock('../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    success: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock('../../../scripts/auth/accountSession.js', () => ({
  getAccountProfile: jest.fn(),
  clearAccountSession: jest.fn().mockResolvedValue(),
}));

function appendSaveFormFields() {
  document.body.innerHTML += `
    <input id="api-key" value="key_123" />
    <input id="database-id" value="a1b2c3d4e5f67890abcdef1234567890" />
    <input id="title-template" value="{title}" />
    <input type="checkbox" id="add-source" checked />
    <input type="checkbox" id="add-timestamp" />
    <input id="database-type" value="database" />
  `;
}

async function flushAsyncClick() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('options.js', () => {
  describe('formatTitle', () => {
    it('should replace variables in template', () => {
      const template = '{title} - {date}';
      const variables = { title: 'Test Page', date: '2023-12-25' };
      const result = formatTitle(template, variables);
      expect(result).toBe('Test Page - 2023-12-25');
    });

    it('should keep original key if variable not found', () => {
      const template = '{unknown}';
      const result = formatTitle(template, {});
      expect(result).toBe('{unknown}');
    });
  });

  describe('setupTemplatePreview', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <button id="preview-template"></button>
        <input id="title-template" value="{title}" />
        <div id="template-preview" class="hidden"></div>
      `;
    });

    it('should setup event listener and show preview', () => {
      setupTemplatePreview();

      const button = document.querySelector('#preview-template');
      button.click();

      const previewDiv = document.querySelector('#template-preview');
      expect(previewDiv.classList.contains('hidden')).toBe(false);
      expect(previewDiv.textContent).toContain('預覽結果：');
      expect(previewDiv.textContent).toContain('範例網頁標題');
    });
  });

  describe('cleanDatabaseId', () => {
    it('應移除連字符', () => {
      expect(cleanDatabaseId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(
        'a1b2c3d4e5f67890abcdef1234567890'
      );
    });

    it('應從 URL 中提取 ID（帶連字符）', () => {
      const url = 'https://www.notion.so/workspace/a1b2c3d4-e5f6-7890-abcd-ef1234567890?v=123';
      expect(cleanDatabaseId(url)).toBe('a1b2c3d4e5f67890abcdef1234567890');
    });

    it('應從 URL 中提取 ID（無連字符）', () => {
      const url = 'https://www.notion.so/workspace/a1b2c3d4e5f67890abcdef1234567890?v=123';
      expect(cleanDatabaseId(url)).toBe('a1b2c3d4e5f67890abcdef1234567890');
    });

    it('應處理已清理的 ID', () => {
      expect(cleanDatabaseId('a1b2c3d4e5f67890abcdef1234567890')).toBe(
        'a1b2c3d4e5f67890abcdef1234567890'
      );
    });

    it('應處理帶空格的輸入', () => {
      expect(cleanDatabaseId('  a1b2c3d4-e5f6-7890-abcd-ef1234567890  ')).toBe(
        'a1b2c3d4e5f67890abcdef1234567890'
      );
    });

    it('應拒絕無效格式', () => {
      expect(cleanDatabaseId('invalid-id')).toBe('');
      expect(cleanDatabaseId('12345')).toBe('');
      expect(cleanDatabaseId('')).toBe('');
      expect(cleanDatabaseId(null)).toBe('');
    });

    it('應拒絕非十六進制字符', () => {
      expect(cleanDatabaseId('g1b2c3d4e5f67890abcdef1234567890')).toBe('');
      expect(cleanDatabaseId('a1b2c3d4-e5f6-7890-abcd-zzzzzzzzzzzz')).toBe('');
    });
  });

  describe('saveSettings', () => {
    let mockUi = null;
    let mockAuth = null;
    let mockSet = null;
    let mockLocalSet = null;
    let mockSyncRemove = null;

    beforeEach(() => {
      document.body.innerHTML = `
        <input id="api-key" value="key_123" />
        <input id="database-id" value="a1b2c3d4e5f67890abcdef1234567890" />
        <input id="title-template" value="{title}" />
        <input type="checkbox" id="add-source" checked />
        <input type="checkbox" id="add-timestamp" />
        <input id="database-type" value="page" />
        <select id="highlight-style">
          <option value="background" selected>背景顏色</option>
          <option value="text">文字顏色</option>
          <option value="underline">底線</option>
        </select>

        <select id="ui-zoom-level">
          <option value="1">中 (100%)</option>
          <option value="1.1">大 (110%)</option>
        </select>
      `;

      mockUi = { showStatus: jest.fn() };
      mockAuth = { currentAuthMode: 'manual', checkAuthStatus: jest.fn() };
      mockSet = jest.fn().mockResolvedValue();
      mockLocalSet = jest.fn().mockResolvedValue();
      mockSyncRemove = jest.fn().mockResolvedValue();

      globalThis.chrome = {
        storage: {
          local: { set: mockLocalSet },
          sync: { set: mockSet, remove: mockSyncRemove },
        },
      };
    });
    afterEach(() => {
      jest.clearAllMocks();
      delete globalThis.chrome;
    });

    it('應儲存設定並更新狀態', async () => {
      await saveSettings(mockUi, mockAuth);

      expect(mockLocalSet).toHaveBeenCalledWith(
        expect.objectContaining({
          notionDatabaseId: 'a1b2c3d4e5f67890abcdef1234567890',
          notionDataSourceId: 'a1b2c3d4e5f67890abcdef1234567890',
          notionDataSourceType: 'page',
        })
      );

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          notionApiKey: 'key_123',
          titleTemplate: '{title}',
          addSource: true,
          addTimestamp: false,
          uiZoomLevel: '1',
          highlightStyle: 'background',
        })
      );

      expect(mockSyncRemove).toHaveBeenCalledWith(DATA_SOURCE_KEYS);

      expect(mockUi.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('成功'),
        'success',
        'status'
      );
      expect(mockAuth.checkAuthStatus).toHaveBeenCalled();
    });

    it('should validate empty API key if not in OAuth mode', async () => {
      document.querySelector('#api-key').value = '';
      mockAuth.currentAuthMode = 'manual';
      await saveSettings(mockUi, mockAuth);
      expect(mockUi.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('API Key'),
        'error',
        'status'
      );
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('should allow empty API key if in OAuth mode', async () => {
      document.querySelector('#api-key').value = '';
      mockAuth.currentAuthMode = 'oauth';
      await saveSettings(mockUi, mockAuth);
      // Because API key check is bypassed, it should proceed to save or hit the next validation
      // In this setup, database-id is valid, so it should attempt to save
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          notionApiKey: '',
        })
      );
    });

    it('should validate empty Database ID', async () => {
      document.querySelector('#database-id').value = '';
      await saveSettings(mockUi, mockAuth);
      expect(mockUi.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('ID'),
        'error',
        'status'
      );
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('應處理儲存失敗', async () => {
      mockSet.mockRejectedValueOnce(new Error('Storage error'));
      await saveSettings(mockUi, mockAuth);
      expect(mockUi.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('失敗'),
        'error',
        'status'
      );
    });

    it('應處理 local.set 儲存失敗', async () => {
      mockLocalSet.mockRejectedValueOnce(new Error('Storage error'));
      await saveSettings(mockUi, mockAuth);
      expect(mockUi.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('失敗'),
        'error',
        'status'
      );
    });

    it('輸入為空時應將 notionDataSourceType 回退為 database', async () => {
      document.querySelector('#database-type').value = '';
      await saveSettings(mockUi, mockAuth);

      expect(mockLocalSet).toHaveBeenCalledWith(
        expect.objectContaining({
          notionDataSourceType: 'database',
        })
      );
    });

    it('無效值時應將 notionDataSourceType 回退為 database', async () => {
      document.querySelector('#database-type').value = 'invalid';
      await saveSettings(mockUi, mockAuth);

      expect(mockLocalSet).toHaveBeenCalledWith(
        expect.objectContaining({
          notionDataSourceType: 'database',
        })
      );
    });

    it('should save highlightStyle when element exists', async () => {
      document.querySelector('#highlight-style').value = 'text';
      await saveSettings(mockUi, mockAuth);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          highlightStyle: 'text',
        })
      );
    });

    it('當元素存在時應儲存 highlightContentStyle', async () => {
      const highlightContentStyle = document.createElement('input');
      highlightContentStyle.id = 'highlight-content-style';
      highlightContentStyle.value = 'inline';
      document.body.append(highlightContentStyle);

      await saveSettings(mockUi, mockAuth);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          highlightContentStyle: 'inline',
        })
      );
    });

    it('should save default highlightStyle (background)', async () => {
      await saveSettings(mockUi, mockAuth);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          highlightStyle: 'background',
        })
      );
    });

    it('should save underline highlightStyle', async () => {
      document.querySelector('#highlight-style').value = 'underline';
      await saveSettings(mockUi, mockAuth);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          highlightStyle: 'underline',
        })
      );
    });
    it('should save uiZoomLevel', async () => {
      document.querySelector('#ui-zoom-level').value = '1.1';
      await saveSettings(mockUi, mockAuth);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          uiZoomLevel: '1.1',
        })
      );
    });
  });

  describe('Initialization (initOptions)', () => {
    let mockUiInstance = null;
    let mockAuthInstance = null;
    let mockDataSourceInstance = null;
    let mockStorageInstance = null;
    let mockMigrationInstance = null;
    const originalEnableOauth = BUILD_ENV.ENABLE_OAUTH;

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

      globalThis.chrome = {
        runtime: {
          onMessage: {
            addListener: jest.fn(),
          },
          getManifest: jest.fn(() => ({ version: '1.2.3' })),
        },
        storage: {
          sync: {
            get: jest.fn((keys, cb) => cb({})),
            set: jest.fn(),
            remove: jest.fn().mockResolvedValue(),
          },
        },
      };
    });

    afterEach(() => {
      BUILD_ENV.ENABLE_OAUTH = originalEnableOauth;
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

    describe('DataSourceManager getApiKey callback', () => {
      beforeEach(() => {
        // Need to add #api-key to the DOM for testing fallback
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

      expect(document.querySelector('#oauth-connect-button').style.display).toBe('none');
      expect(document.querySelector('#oauth-disconnect-button').style.display).toBe('none');
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
      document.body.innerHTML = `
        <button id="save-button"></button>
        <button id="save-templates-button"></button>
        <div id="app-version"></div>
        <button class="nav-item active" data-section="general" aria-selected="true"></button>
        <button class="nav-item" data-section="advanced" aria-selected="false"></button>
        <section id="section-general" class="settings-section active" aria-hidden="false"></section>
        <section id="section-advanced" class="settings-section" aria-hidden="true"></section>
      `;

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
      // Mock storage get
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
      // Mock storage get with default
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

  describe('Log Export', () => {
    let mockSendMessage = null;
    let anchorClickSpy = null;
    let originalCreateObjectURL = null;
    let originalRevokeObjectURL = null;

    beforeEach(() => {
      jest.useFakeTimers();
      document.body.innerHTML = `
        <button id="export-logs-button">導出日誌</button>
        <div id="export-status"></div>
      `;

      anchorClickSpy = jest
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {});
      mockSendMessage = jest.fn();
      originalCreateObjectURL = globalThis.URL.createObjectURL;
      originalRevokeObjectURL = globalThis.URL.revokeObjectURL;
      globalThis.URL.createObjectURL = jest.fn(() => 'blob:url');
      globalThis.URL.revokeObjectURL = jest.fn();
      globalThis.chrome.runtime.sendMessage = mockSendMessage;
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
      anchorClickSpy?.mockRestore();
      globalThis.URL.createObjectURL = originalCreateObjectURL;
      globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
    });

    it('should stay disabled while exporting and restore afterwards without changing text', async () => {
      // Mock successful response
      mockSendMessage.mockResolvedValue({
        success: true,
        data: {
          filename: 'test.json',
          content: 'log content',
          mimeType: 'application/json',
          count: 10,
        },
      });

      // Initialize to attach event listeners
      initOptions();

      const exportBtn = document.querySelector('#export-logs-button');
      const originalText = exportBtn.textContent;

      // Trigger click
      exportBtn.click();

      // Check state immediately after click
      expect(exportBtn.disabled).toBe(true);
      expect(exportBtn.textContent).toBe(originalText); //文字不應該改變

      // Wait for async operations
      await flushAsyncClick();

      // Check final state
      expect(exportBtn.disabled).toBe(false);
      expect(exportBtn.textContent).toBe(originalText); // 文字不應該改變

      const statusEl = document.querySelector('#export-status');
      expect(statusEl.textContent).toContain('已成功匯出 10 條日誌');
      expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
      expect(globalThis.URL.revokeObjectURL).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:url');

      jest.advanceTimersByTime(3000);
      expect(statusEl.textContent).toBe('');
      expect(statusEl.className).toBe('status-message');
    });

    it('should restore disabled state even on error without changing text', async () => {
      // Mock error response
      mockSendMessage.mockRejectedValue(new Error('Network error'));

      // Initialize to attach event listeners
      initOptions();

      const exportBtn = document.querySelector('#export-logs-button');
      const originalText = exportBtn.textContent;

      // Trigger click
      exportBtn.click();

      // Check intermediate state
      expect(exportBtn.disabled).toBe(true);
      expect(exportBtn.textContent).toBe(originalText);

      // Wait for async operations
      await flushAsyncClick();

      // Check final state
      expect(exportBtn.disabled).toBe(false);
      expect(exportBtn.textContent).toBe(originalText);

      const statusEl = document.querySelector('#export-status');
      expect(statusEl.textContent).toContain('網路連線異常');

      jest.advanceTimersByTime(5000);
      expect(statusEl.textContent).toBe('');
      expect(statusEl.className).toBe('status-message');
    });

    it('當背景頁沒有回應時應顯示錯誤並恢復按鈕狀態', async () => {
      mockSendMessage.mockResolvedValue(undefined);

      initOptions();

      const exportBtn = document.querySelector('#export-logs-button');
      exportBtn.click();
      await flushAsyncClick();

      const statusEl = document.querySelector('#export-status');
      expect(statusEl.textContent).toContain('匯出失敗');
      expect(exportBtn.disabled).toBe(false);
      expect(Logger.error).toHaveBeenCalled();
    });

    it('當背景頁返回明確錯誤時應顯示錯誤訊息', async () => {
      mockSendMessage.mockResolvedValue({ error: 'custom export error' });

      initOptions();

      const exportBtn = document.querySelector('#export-logs-button');
      exportBtn.click();
      await flushAsyncClick();

      const statusEl = document.querySelector('#export-status');
      expect(statusEl.textContent).toContain('匯出失敗');
      expect(exportBtn.disabled).toBe(false);
      expect(Logger.error).toHaveBeenCalled();
    });

    it('當背景頁返回 success false 時應顯示預設失敗訊息', async () => {
      mockSendMessage.mockResolvedValue({ success: false });

      initOptions();

      const exportBtn = document.querySelector('#export-logs-button');
      exportBtn.click();
      await flushAsyncClick();

      const statusEl = document.querySelector('#export-status');
      expect(statusEl.textContent).toContain('匯出失敗');
      expect(exportBtn.disabled).toBe(false);
      expect(Logger.error).toHaveBeenCalled();
    });
  });
});

// =============================================================================
// Account UI（Cloudflare-native）
// =============================================================================

/** 建立最小的 account card DOM */
function buildAccountCardDOM() {
  document.body.innerHTML = `
    <button id="save-button"></button>
    <button id="save-templates-button"></button>
    <div id="app-version"></div>
    <div class="nav-item" data-section="general"></div>
    <div id="section-general" class="settings-section"></div>
    <div id="account-card" style="display: none">
      <div id="account-logged-out"></div>
      <div id="account-logged-in" style="display: none">
        <div id="account-info"></div>
      </div>
      <button id="account-login-button"></button>
      <button id="account-logout-button"></button>
      <p id="account-status" class="status-message"></p>
    </div>
  `;
}

/** 共用 chrome mock（帶 tabs + local storage） */
function buildChromeMock(overrides = {}) {
  return {
    runtime: {
      id: 'ext_id_123',
      onMessage: { addListener: jest.fn() },
      sendMessage: jest.fn().mockResolvedValue(),
      getManifest: jest.fn(() => ({ version: '1.0.0' })),
    },
    storage: {
      local: { get: jest.fn().mockResolvedValue({}), remove: jest.fn().mockResolvedValue() },
      sync: {
        get: jest.fn((keys, cb) => cb({})),
        set: jest.fn(),
        remove: jest.fn().mockResolvedValue(),
      },
    },
    tabs: { create: jest.fn() },
    ...overrides,
  };
}

describe('Account UI (initAccountUI / renderAccountUI)', () => {
  // Import mock 控制器
  const {
    getAccountProfile,
    clearAccountSession,
  } = require('../../../scripts/auth/accountSession.js');
  const { BUILD_ENV } = require('../../../scripts/config/env.js');

  beforeEach(() => {
    jest.useFakeTimers();
    buildAccountCardDOM();
    globalThis.chrome = buildChromeMock();
    BUILD_ENV.ENABLE_ACCOUNT = true;
    getAccountProfile.mockReset();
    clearAccountSession.mockReset();
    clearAccountSession.mockResolvedValue();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    delete globalThis.chrome;
    BUILD_ENV.ENABLE_ACCOUNT = true;
    jest.clearAllMocks();
  });

  describe('ENABLE_ACCOUNT feature flag', () => {
    it('ENABLE_ACCOUNT=false 時應隱藏 account card', () => {
      BUILD_ENV.ENABLE_ACCOUNT = false;
      getAccountProfile.mockResolvedValue(null);
      initOptions();
      expect(document.querySelector('#account-card').style.display).toBe('none');
    });

    it('ENABLE_ACCOUNT=true 時應顯示 account card', async () => {
      getAccountProfile.mockResolvedValue(null);
      initOptions();
      // renderAccountUI 是 async，等待 microtask
      await Promise.resolve();
      expect(document.querySelector('#account-card').style.display).not.toBe('none');
    });
  });

  describe('未登入狀態', () => {
    it('getAccountProfile 回傳 null 時應顯示 logged-out 區塊', async () => {
      getAccountProfile.mockResolvedValue(null);
      initOptions();
      await Promise.resolve();

      expect(document.querySelector('#account-logged-out').style.display).not.toBe('none');
      expect(document.querySelector('#account-logged-in').style.display).toBe('none');
    });
  });

  describe('已登入狀態', () => {
    it('getAccountProfile 回傳 profile 時應顯示 logged-in 區塊與帳號資訊', async () => {
      getAccountProfile.mockResolvedValue({
        userId: 'u1',
        email: 'user@example.com',
        displayName: 'Test User',
        avatarUrl: null,
      });
      initOptions();
      await Promise.resolve();

      expect(document.querySelector('#account-logged-in').style.display).not.toBe('none');
      expect(document.querySelector('#account-logged-out').style.display).toBe('none');
      expect(document.querySelector('#account-info').textContent).toContain('Test User');
    });

    it('displayName 為 null 時應顯示 email', async () => {
      getAccountProfile.mockResolvedValue({
        userId: 'u1',
        email: 'user@example.com',
        displayName: null,
        avatarUrl: null,
      });
      initOptions();
      await Promise.resolve();

      expect(document.querySelector('#account-info').textContent).toContain('user@example.com');
    });
  });

  describe('登入按鈕', () => {
    it('點擊後應開新 tab 到 Google start URL（帶 ext_id）', async () => {
      getAccountProfile.mockResolvedValue(null);
      initOptions();
      await Promise.resolve();

      document.querySelector('#account-login-button').click();

      expect(globalThis.chrome.tabs.create).toHaveBeenCalledWith({
        url: expect.stringContaining('/v1/account/google/start?ext_id=ext_id_123'),
      });
    });

    it('登入 URL 應使用 BUILD_ENV.OAUTH_SERVER_URL 作為 base', async () => {
      getAccountProfile.mockResolvedValue(null);
      initOptions();
      await Promise.resolve();

      document.querySelector('#account-login-button').click();

      expect(globalThis.chrome.tabs.create).toHaveBeenCalledWith({
        url: expect.stringContaining('https://worker.test'),
      });
    });
  });

  describe('登出按鈕', () => {
    beforeEach(() => {
      getAccountProfile
        .mockResolvedValueOnce({
          userId: 'u1',
          email: 'user@example.com',
          displayName: null,
          avatarUrl: null,
        })
        .mockResolvedValue(null); // 登出後回傳 null
    });

    it('成功登出後應清除 account session 並廣播 cleared 訊息', async () => {
      clearAccountSession.mockResolvedValue();
      initOptions();
      await Promise.resolve();

      document.querySelector('#account-logout-button').click();
      // 清空所有 microtask：clearAccountSession + sendMessage + renderAccountUI
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(clearAccountSession).toHaveBeenCalled();
      expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ action: expect.stringMatching(/account.*clear/i) })
      );
    });

    it('成功登出後應顯示成功訊息，並在 3 秒後清除', async () => {
      clearAccountSession.mockResolvedValue();
      initOptions();
      await Promise.resolve();

      document.querySelector('#account-logout-button').click();
      // 清空所有 microtask：clearAccountSession + sendMessage + renderAccountUI
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const statusEl = document.querySelector('#account-status');
      expect(statusEl.textContent).toContain('登出');
      expect(statusEl.className).toContain('success');

      jest.advanceTimersByTime(3000);
      expect(statusEl.textContent).toBe('');
    });

    it('clearAccountSession 拋錯時應顯示錯誤訊息', async () => {
      clearAccountSession.mockRejectedValue(new Error('clear failed'));
      initOptions();
      await Promise.resolve();

      document.querySelector('#account-logout-button').click();
      // 清空所有 microtask：clearAccountSession rejection + catch handler
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const statusEl = document.querySelector('#account-status');
      expect(statusEl.textContent).toContain('失敗');
      expect(statusEl.className).toContain('error');
      expect(Logger.error).toHaveBeenCalled();
    });
  });

  describe('account_session_updated / account_session_cleared runtime 訊息', () => {
    it('收到 account_session_updated 訊息時應重新讀取 profile', async () => {
      getAccountProfile.mockResolvedValue(null);
      initOptions();
      await Promise.resolve();

      const listener = globalThis.chrome.runtime.onMessage.addListener.mock.calls[0][0];

      getAccountProfile.mockResolvedValue({
        userId: 'u2',
        email: 'new@example.com',
        displayName: 'New',
        avatarUrl: null,
      });

      listener({ action: 'account_session_updated' });
      await Promise.resolve();

      // getAccountProfile 應被第二次呼叫（renderAccountUI 觸發）
      expect(getAccountProfile).toHaveBeenCalledTimes(2);
    });

    it('收到 account_session_cleared 訊息時應重新讀取 profile', async () => {
      getAccountProfile.mockResolvedValue({
        userId: 'u1',
        email: 'user@example.com',
        displayName: null,
        avatarUrl: null,
      });
      initOptions();
      await Promise.resolve();

      const listener = globalThis.chrome.runtime.onMessage.addListener.mock.calls[0][0];

      getAccountProfile.mockResolvedValue(null);
      listener({ action: 'account_session_cleared' });
      await Promise.resolve();

      expect(getAccountProfile).toHaveBeenCalledTimes(2);
    });
  });

  describe('隔離性：登出只清 account，不影響 Notion OAuth', () => {
    it('clearAccountSession 不應操作 chrome.storage.sync', async () => {
      getAccountProfile.mockResolvedValue({
        userId: 'u1',
        email: 'user@example.com',
        displayName: null,
        avatarUrl: null,
      });
      clearAccountSession.mockResolvedValue();
      initOptions();
      await Promise.resolve();

      const syncSetSpy = globalThis.chrome.storage.sync.set;
      document.querySelector('#account-logout-button').click();
      await Promise.resolve();
      await Promise.resolve();

      // logout 不應觸碰 sync storage（Notion OAuth settings）
      expect(syncSetSpy).not.toHaveBeenCalled();
    });
  });
});
