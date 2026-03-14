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
import Logger from '../../../scripts/utils/Logger.js';

// Mocks for dependencies
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

      globalThis.chrome = {
        storage: {
          local: { set: mockLocalSet },
          sync: { set: mockSet },
        },
      };
    });
    afterEach(() => {
      jest.clearAllMocks();
      delete globalThis.chrome;
    });

    it('should save settings and update status', async () => {
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

      expect(mockUi.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('成功'),
        'success',
        'status'
      );
      expect(mockAuth.checkAuthStatus).toHaveBeenCalled();
    });

    it('should validate empty API key if not in OAuth mode', () => {
      document.querySelector('#api-key').value = '';
      mockAuth.currentAuthMode = 'manual';
      saveSettings(mockUi, mockAuth);
      expect(mockUi.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('API Key'),
        'error',
        'status'
      );
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('should allow empty API key if in OAuth mode', () => {
      document.querySelector('#api-key').value = '';
      mockAuth.currentAuthMode = 'oauth';
      saveSettings(mockUi, mockAuth);
      // Because API key check is bypassed, it should proceed to save or hit the next validation
      // In this setup, database-id is valid, so it should attempt to save
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          notionApiKey: '',
        })
      );
    });

    it('should validate empty Database ID', () => {
      document.querySelector('#database-id').value = '';
      saveSettings(mockUi, mockAuth);
      expect(mockUi.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('ID'),
        'error',
        'status'
      );
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('should handle save error', async () => {
      mockSet.mockRejectedValueOnce(new Error('Storage error'));
      await saveSettings(mockUi, mockAuth);
      expect(mockUi.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('失敗'),
        'error',
        'status'
      );
    });

    it('should not save notionDataSourceType if database-type input is empty', () => {
      document.querySelector('#database-type').value = '';
      saveSettings(mockUi, mockAuth);

      expect(mockLocalSet).toHaveBeenCalledWith(
        expect.not.objectContaining({
          notionDataSourceType: expect.anything(),
        })
      );
    });

    it('should save highlightStyle when element exists', () => {
      document.querySelector('#highlight-style').value = 'text';
      saveSettings(mockUi, mockAuth);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          highlightStyle: 'text',
        })
      );
    });

    it('should save default highlightStyle (background)', () => {
      saveSettings(mockUi, mockAuth);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          highlightStyle: 'background',
        })
      );
    });

    it('should save underline highlightStyle', () => {
      document.querySelector('#highlight-style').value = 'underline';
      saveSettings(mockUi, mockAuth);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          highlightStyle: 'underline',
        })
      );
    });
    it('should save uiZoomLevel', () => {
      document.querySelector('#ui-zoom-level').value = '1.1';
      saveSettings(mockUi, mockAuth);

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

    beforeEach(() => {
      jest.clearAllMocks();

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
          },
        },
      };
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

    it('should handle navigation', () => {
      initOptions();
      const navItem = document.querySelector('.nav-item');
      const section = document.querySelector('#section-general');

      navItem.click();
      expect(navItem.classList.contains('active')).toBe(true);
      expect(section.classList.contains('active')).toBe(true);
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

    beforeEach(() => {
      document.body.innerHTML = `
        <button id="export-logs-button">導出日誌</button>
        <div id="export-status"></div>
      `;

      mockSendMessage = jest.fn();
      globalThis.chrome.runtime.sendMessage = mockSendMessage;
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

      // Mock URL.createObjectURL and URL.revokeObjectURL
      globalThis.URL.createObjectURL = jest.fn(() => 'blob:url');
      globalThis.URL.revokeObjectURL = jest.fn();

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
      await new Promise(resolve => setTimeout(resolve, 0));

      // Check final state
      expect(exportBtn.disabled).toBe(false);
      expect(exportBtn.textContent).toBe(originalText); // 文字不應該改變

      const statusEl = document.querySelector('#export-status');
      expect(statusEl.textContent).toContain('已成功匯出 10 條日誌');
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
      await new Promise(resolve => setTimeout(resolve, 0));

      // Check final state
      expect(exportBtn.disabled).toBe(false);
      expect(exportBtn.textContent).toBe(originalText);

      const statusEl = document.querySelector('#export-status');
      expect(statusEl.textContent).toContain('網路連線異常');
    });
  });
});
