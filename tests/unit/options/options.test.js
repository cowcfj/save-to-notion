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

import { UIManager } from '../../../scripts/options/UIManager.js';
import { AuthManager } from '../../../scripts/options/AuthManager.js';
import { DataSourceManager } from '../../../scripts/options/DataSourceManager.js';
import { StorageManager } from '../../../scripts/options/StorageManager.js';
import { MigrationTool } from '../../../scripts/options/MigrationTool.js';
import Logger from '../../../scripts/utils/Logger.js';

// Mocks for dependencies
jest.mock('../../../scripts/options/UIManager.js');
jest.mock('../../../scripts/options/AuthManager.js');
jest.mock('../../../scripts/options/DataSourceManager.js');
jest.mock('../../../scripts/options/StorageManager.js');
jest.mock('../../../scripts/options/MigrationTool.js');
jest.mock('../../../scripts/utils/Logger.js', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
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

      const button = document.getElementById('preview-template');
      button.click();

      const previewDiv = document.getElementById('template-preview');
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
      `;

      mockUi = { showStatus: jest.fn() };
      mockAuth = { checkAuthStatus: jest.fn() };
      mockSet = jest.fn((data, cb) => {
        if (cb) {
          cb();
        }
      });

      global.chrome = {
        storage: {
          sync: { set: mockSet },
        },
        runtime: { lastError: null },
      };
    });

    it('should save settings and update status', () => {
      saveSettings(mockUi, mockAuth);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          notionApiKey: 'key_123',
          notionDatabaseId: 'a1b2c3d4e5f67890abcdef1234567890',
          notionDataSourceId: 'a1b2c3d4e5f67890abcdef1234567890',
          notionDataSourceType: 'page',
          addSource: true,
          addTimestamp: false,
        }),
        expect.any(Function)
      );

      expect(mockUi.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('成功'),
        'success',
        'status'
      );
      expect(mockAuth.checkAuthStatus).toHaveBeenCalled();
    });

    it('should validate empty API key', () => {
      document.getElementById('api-key').value = '';
      saveSettings(mockUi, mockAuth);
      expect(mockUi.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('API Key'),
        'error',
        'status'
      );
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('should validate empty Database ID', () => {
      document.getElementById('database-id').value = '';
      saveSettings(mockUi, mockAuth);
      expect(mockUi.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('ID'),
        'error',
        'status'
      );
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('should handle save error', () => {
      global.chrome.runtime.lastError = { message: 'Storage error' };
      saveSettings(mockUi, mockAuth);
      expect(mockUi.showStatus).toHaveBeenCalledWith(
        expect.stringContaining('失敗'),
        'error',
        'status'
      );
    });

    it('should not save notionDataSourceType if database-type input is empty', () => {
      document.getElementById('database-type').value = '';
      saveSettings(mockUi, mockAuth);

      expect(mockSet).toHaveBeenCalledWith(
        expect.not.objectContaining({
          notionDataSourceType: expect.anything(),
        }),
        expect.any(Function)
      );
    });

    it('should save highlightStyle when element exists', () => {
      document.getElementById('highlight-style').value = 'text';
      saveSettings(mockUi, mockAuth);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          highlightStyle: 'text',
        }),
        expect.any(Function)
      );
    });

    it('should save default highlightStyle (background)', () => {
      saveSettings(mockUi, mockAuth);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          highlightStyle: 'background',
        }),
        expect.any(Function)
      );
    });

    it('should save underline highlightStyle', () => {
      document.getElementById('highlight-style').value = 'underline';
      saveSettings(mockUi, mockAuth);

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          highlightStyle: 'underline',
        }),
        expect.any(Function)
      );
    });
  });

  describe('Initialization (initOptions)', () => {
    let mockUiInstance,
      mockAuthInstance,
      mockDataSourceInstance,
      mockStorageInstance,
      mockMigrationInstance;

    beforeEach(() => {
      jest.clearAllMocks();

      // Setup mock instances
      mockUiInstance = { init: jest.fn(), showStatus: jest.fn() };
      mockAuthInstance = { init: jest.fn(), checkAuthStatus: jest.fn() };
      mockDataSourceInstance = { init: jest.fn(), loadDatabases: jest.fn() };
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
        `;

      global.chrome.runtime.onMessage = {
        addListener: jest.fn(),
      };
    });

    it('should initialize all managers and check auth status', () => {
      initOptions();

      expect(UIManager).toHaveBeenCalled();
      expect(AuthManager).toHaveBeenCalled();
      expect(DataSourceManager).toHaveBeenCalled();
      expect(StorageManager).toHaveBeenCalled();
      expect(MigrationTool).toHaveBeenCalled();

      expect(mockUiInstance.init).toHaveBeenCalled();
      expect(mockAuthInstance.init).toHaveBeenCalled();
      expect(mockDataSourceInstance.init).toHaveBeenCalled();
      expect(mockStorageInstance.init).toHaveBeenCalled();
      expect(mockMigrationInstance.init).toHaveBeenCalled();
      expect(mockAuthInstance.checkAuthStatus).toHaveBeenCalled();
    });

    it('should display app version', () => {
      global.chrome.runtime.getManifest = jest.fn(() => ({ version: '1.2.3' }));
      initOptions();
      const versionEl = document.getElementById('app-version');
      expect(versionEl.textContent).toBe('v1.2.3');
    });

    it('should handle version display error gracefully', () => {
      global.chrome.runtime.getManifest = jest.fn(() => {
        throw new Error('No manifest');
      });
      initOptions();
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('無法獲取應用程式版本號'),
        expect.any(Error)
      );
    });

    it('should handle oauth messages', () => {
      initOptions();

      const messageListener = global.chrome.runtime.onMessage.addListener.mock.calls[0][0];

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
      const section = document.getElementById('section-general');

      navItem.click();
      expect(navItem.classList.contains('active')).toBe(true);
      expect(section.classList.contains('active')).toBe(true);
    });
  });
});
