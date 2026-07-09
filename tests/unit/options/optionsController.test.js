/**
 * @jest-environment jsdom
 */
/**
 * optionsController.test.js
 *
 * Tests for pure helper functions in the main options controller.
 */

import { UI_MESSAGES } from '../../../scripts/config/shared/messages.js';
import './optionsBootstrapTestSetup.js';

let formatTitle;
let setupTemplatePreview;
let cleanDatabaseId;

beforeAll(async () => {
  const optionsModule = await import('../../../pages/options/options.js');
  formatTitle = optionsModule.formatTitle;
  setupTemplatePreview = optionsModule.setupTemplatePreview;
  cleanDatabaseId = optionsModule.cleanDatabaseId;
});

describe('optionsController', () => {
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
      expect(previewDiv.textContent).toContain(UI_MESSAGES.OPTIONS.TEMPLATES.PREVIEW_RESULT_LABEL);
      expect(previewDiv.textContent).toContain(UI_MESSAGES.OPTIONS.TEMPLATES.PREVIEW_SAMPLE_TITLE);
    });
  });

  describe('cleanDatabaseId', () => {
    const cleanDatabaseIdCases = [
      {
        name: '應移除連字符',
        input: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        expected: 'a1b2c3d4e5f67890abcdef1234567890',
      },
      {
        name: '應從 URL 中提取 ID（帶連字符）',
        input: 'https://www.notion.so/workspace/a1b2c3d4-e5f6-7890-abcd-ef1234567890?v=123',
        expected: 'a1b2c3d4e5f67890abcdef1234567890',
      },
      {
        name: '應從 URL 中提取 ID（無連字符）',
        input: 'https://www.notion.so/workspace/a1b2c3d4e5f67890abcdef1234567890?v=123',
        expected: 'a1b2c3d4e5f67890abcdef1234567890',
      },
      {
        name: '應從帶 hash fragment 的 URL 中提取 ID',
        input: 'https://www.notion.so/workspace/a1b2c3d4e5f67890abcdef1234567890#block',
        expected: 'a1b2c3d4e5f67890abcdef1234567890',
      },
      {
        name: '應處理已清理的 ID',
        input: 'a1b2c3d4e5f67890abcdef1234567890',
        expected: 'a1b2c3d4e5f67890abcdef1234567890',
      },
      {
        name: '應處理帶空格的輸入',
        input: '  a1b2c3d4-e5f6-7890-abcd-ef1234567890  ',
        expected: 'a1b2c3d4e5f67890abcdef1234567890',
      },
      { name: '應拒絕無效格式', input: 'invalid-id', expected: '' },
      { name: '應拒絕過短格式', input: '12345', expected: '' },
      { name: '應拒絕空字串', input: '', expected: '' },
      { name: '應拒絕 null', input: null, expected: '' },
      {
        name: '應拒絕非十六進制字符',
        input: 'g1b2c3d4e5f67890abcdef1234567890',
        expected: '',
      },
      {
        name: '應拒絕帶連字符的非十六進制字符',
        input: 'a1b2c3d4-e5f6-7890-abcd-zzzzzzzzzzzz',
        expected: '',
      },
    ];

    it.each(cleanDatabaseIdCases)('$name', ({ input, expected }) => {
      expect(cleanDatabaseId(input)).toBe(expected);
    });
  });
});
