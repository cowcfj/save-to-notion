/**
 * options.js Unit Tests
 *
 * Tests for exported helper functions in the main options controller
 */

import { saveSettings, formatTitle, setupTemplatePreview } from '../../../options/options.js';

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
        <div id="template-preview"></div>
      `;
    });

    it('should setup event listener and show preview', () => {
      setupTemplatePreview();

      const button = document.getElementById('preview-template');
      button.click();

      const previewDiv = document.getElementById('template-preview');
      expect(previewDiv.style.display).toBe('block');
      expect(previewDiv.textContent).toContain('預覽結果：');
      expect(previewDiv.textContent).toContain('範例網頁標題');
    });
  });

  describe('saveSettings', () => {
    let mockUi = null;
    let mockAuth = null;
    let mockSet = null;

    beforeEach(() => {
      document.body.innerHTML = `
        <input id="api-key" value="key_123" />
        <input id="database-id" value="db_123" />
        <input id="title-template" value="{title}" />
        <input type="checkbox" id="add-source" checked />
        <input type="checkbox" id="add-timestamp" />
        <input id="database-type" value="page" />
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
          notionDatabaseId: 'db_123',
          notionDataSourceId: 'db_123',
          notionDataSourceType: 'page',
          addSource: true,
          addTimestamp: false,
        }),
        expect.any(Function)
      );

      expect(mockUi.showStatus).toHaveBeenCalledWith(expect.stringContaining('成功'), 'success');
      expect(mockAuth.checkAuthStatus).toHaveBeenCalled();
    });

    it('should validate empty API key', () => {
      document.getElementById('api-key').value = '';
      saveSettings(mockUi, mockAuth);
      expect(mockUi.showStatus).toHaveBeenCalledWith(expect.stringContaining('API Key'), 'error');
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('should validate empty Database ID', () => {
      document.getElementById('database-id').value = '';
      saveSettings(mockUi, mockAuth);
      expect(mockUi.showStatus).toHaveBeenCalledWith(expect.stringContaining('ID'), 'error');
      expect(mockSet).not.toHaveBeenCalled();
    });

    it('should handle save error', () => {
      global.chrome.runtime.lastError = { message: 'Storage error' };
      saveSettings(mockUi, mockAuth);
      expect(mockUi.showStatus).toHaveBeenCalledWith(expect.stringContaining('失敗'), 'error');
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
  });
});
