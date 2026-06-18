/**
 * optionsStaticMessages.test.js
 *
 * Tests for applyStaticOptionMessages and resolveUiMessage static option messages.
 * Verifies i18n bindings and options.html static message compliance.
 */

import { applyStaticOptionMessages } from '../../../pages/options/options.js';
import { resolveUiMessage } from '../../../pages/options/staticOptionMessages.js';
import { UI_MESSAGES } from '../../../scripts/config/shared/messages.js';

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

describe('optionsStaticMessages', () => {
  describe('applyStaticOptionMessages', () => {
    it('應從 UI_MESSAGES 套用 options 靜態 UI 文案', () => {
      document.body.innerHTML = `
        <input id="database-search" data-ui-placeholder="OPTIONS.DESTINATION.SEARCH_PLACEHOLDER" />
        <button id="selector-toggle" data-ui-aria-label="OPTIONS.DESTINATION.SELECTOR_TOGGLE_ARIA_LABEL"></button>
        <span id="data-source-count" data-ui-message="DATA_SOURCE.LABEL_DATA_SOURCE"></span>
        <button id="refresh-databases" data-ui-title="OPTIONS.DESTINATION.REFRESH_TITLE" data-ui-aria-label="OPTIONS.DESTINATION.REFRESH_TITLE"></button>
        <label for="database-id" data-ui-message="OPTIONS.DESTINATION.MANUAL_ID_LABEL"></label>
        <button id="save-button" data-ui-message="OPTIONS.SETTINGS.SAVE_BUTTON"></button>
        <p class="help-text destination-target-help" data-ui-composite="destination-target-help">
          <a href="https://example.test" target="_blank" rel="noopener noreferrer"></a>
        </p>
      `;

      applyStaticOptionMessages();

      expect(document.querySelector('#database-search').placeholder).toBe(
        UI_MESSAGES.OPTIONS.DESTINATION.SEARCH_PLACEHOLDER
      );
      expect(document.querySelector('#selector-toggle').getAttribute('aria-label')).toBe(
        UI_MESSAGES.OPTIONS.DESTINATION.SELECTOR_TOGGLE_ARIA_LABEL
      );
      expect(document.querySelector('#data-source-count').textContent).toBe(
        UI_MESSAGES.DATA_SOURCE.LABEL_DATA_SOURCE
      );
      expect(document.querySelector('#refresh-databases').title).toBe(
        UI_MESSAGES.OPTIONS.DESTINATION.REFRESH_TITLE
      );
      expect(document.querySelector('#refresh-databases').getAttribute('aria-label')).toBe(
        UI_MESSAGES.OPTIONS.DESTINATION.REFRESH_TITLE
      );
      expect(document.querySelector('label[for="database-id"]').textContent).toBe(
        UI_MESSAGES.OPTIONS.DESTINATION.MANUAL_ID_LABEL
      );
      expect(document.querySelector('#save-button').textContent).toBe(
        UI_MESSAGES.OPTIONS.SETTINGS.SAVE_BUTTON
      );

      const helpText = document.querySelector('.destination-target-help');
      const helpLink = helpText.querySelector('a');
      expect(helpText.textContent).toContain(UI_MESSAGES.OPTIONS.DESTINATION.HELP_PREFIX);
      expect(helpText.textContent).toContain(UI_MESSAGES.OPTIONS.DESTINATION.HELP_SUFFIX);
      expect(helpLink.textContent).toBe(UI_MESSAGES.OPTIONS.DESTINATION.HELP_LINK_TEXT);
      expect(helpLink.getAttribute('href')).toBe('https://example.test');
    });

    it('resolveUiMessage 應解析已知 key，缺失 key 則回傳 fallback 或空字串', () => {
      expect(resolveUiMessage('OPTIONS.SETTINGS.SAVE_BUTTON')).toBe(
        UI_MESSAGES.OPTIONS.SETTINGS.SAVE_BUTTON
      );
      expect(resolveUiMessage('OPTIONS.NEVER_EXISTS', 'fallback text')).toBe('fallback text');
      expect(resolveUiMessage('OPTIONS.NEVER_EXISTS')).toBe('');
      expect(resolveUiMessage()).toBe('');
    });

    it('缺失 data-ui-* key 時應保留既有 HTML fallback 內容與屬性', () => {
      document.body.innerHTML = `
        <button id="message" data-ui-message="OPTIONS.NEVER_EXISTS">Fallback label</button>
        <input id="placeholder" data-ui-placeholder="OPTIONS.NEVER_EXISTS" placeholder="Fallback placeholder" />
        <button id="title" data-ui-title="OPTIONS.NEVER_EXISTS" title="Fallback title"></button>
        <button id="aria" data-ui-aria-label="OPTIONS.NEVER_EXISTS" aria-label="Fallback aria"></button>
      `;

      applyStaticOptionMessages();

      expect(document.querySelector('#message').textContent).toBe('Fallback label');
      expect(document.querySelector('#placeholder').getAttribute('placeholder')).toBe(
        'Fallback placeholder'
      );
      expect(document.querySelector('#title').getAttribute('title')).toBe('Fallback title');
      expect(document.querySelector('#aria').getAttribute('aria-label')).toBe('Fallback aria');
    });

    it('options.html 內所有 data-ui-* 綁定 key 皆能解析為非空字串', () => {
      const fs = require('node:fs');
      const path = require('node:path');
      const html = fs.readFileSync(
        path.join(__dirname, '../../../pages/options/options.html'),
        'utf8'
      );
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      expect(bodyMatch).not.toBeNull();
      document.body.innerHTML = bodyMatch[1];

      applyStaticOptionMessages();

      const bindings = [
        { selector: '[data-ui-message]', attr: 'data-ui-message', check: el => el.textContent },
        {
          selector: '[data-ui-placeholder]',
          attr: 'data-ui-placeholder',
          check: el => el.getAttribute('placeholder'),
        },
        {
          selector: '[data-ui-title]',
          attr: 'data-ui-title',
          check: el => el.getAttribute('title'),
        },
        {
          selector: '[data-ui-aria-label]',
          attr: 'data-ui-aria-label',
          check: el => el.getAttribute('aria-label'),
        },
      ];

      let totalBindings = 0;
      bindings.forEach(({ selector, attr, check }) => {
        document.querySelectorAll(selector).forEach(el => {
          totalBindings += 1;
          const key = el.getAttribute(attr);
          const resolved = check(el);
          expect(typeof resolved).toBe('string');
          expect(resolved.length).toBeGreaterThan(0);
          expect({ key, resolved }).toEqual({ key, resolved: expect.any(String) });
        });
      });

      expect(totalBindings).toBeGreaterThan(20);
    });

    it('debug logs 開關標籤應透過 UI_MESSAGES 綁定', () => {
      const fs = require('node:fs');
      const path = require('node:path');
      const html = fs.readFileSync(
        path.join(__dirname, '../../../pages/options/options.html'),
        'utf8'
      );
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      expect(bodyMatch).not.toBeNull();
      document.body.innerHTML = bodyMatch[1];

      const expectedKey = 'OPTIONS.DIAGNOSTICS.ENABLE_DEBUG_LOGS_LABEL';
      const labelText = document.querySelector('label[for="enable-debug-logs"] > span:last-child');

      expect(labelText).not.toBeNull();
      expect(labelText.dataset.uiMessage).toBe(expectedKey);

      applyStaticOptionMessages();

      expect(labelText.textContent).toBe(resolveUiMessage(expectedKey));
      expect(labelText.textContent).toBe(UI_MESSAGES.OPTIONS.DIAGNOSTICS.ENABLE_DEBUG_LOGS_LABEL);
    });

    it('destination help link 應提供靜態 accessible name 並保留 runtime i18n 綁定', () => {
      const fs = require('node:fs');
      const path = require('node:path');
      const html = fs.readFileSync(
        path.join(__dirname, '../../../pages/options/options.html'),
        'utf8'
      );
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      expect(bodyMatch).not.toBeNull();
      document.body.innerHTML = bodyMatch[1];

      const helpLink = document.querySelector(
        '.destination-target-help a[href*="USER_GUIDE.md#-如何獲取-notion-id"]'
      );

      expect(helpLink).not.toBeNull();
      expect(helpLink.getAttribute('aria-label')).toBe(
        UI_MESSAGES.OPTIONS.DESTINATION.HELP_LINK_TEXT
      );
      expect(helpLink.dataset.uiAriaLabel).toBe('OPTIONS.DESTINATION.HELP_LINK_TEXT');

      applyStaticOptionMessages();

      expect(helpLink.textContent).toBe(UI_MESSAGES.OPTIONS.DESTINATION.HELP_LINK_TEXT);
      expect(helpLink.getAttribute('aria-label')).toBe(
        UI_MESSAGES.OPTIONS.DESTINATION.HELP_LINK_TEXT
      );
    });

    it('應重組 guide-shortcut-desc 的 Ctrl/Cmd 快捷鍵描述', () => {
      document.body.innerHTML = `
        <div data-ui-composite="guide-shortcut-desc">
          舊文字 <code class="kbd">OLD-CTRL</code> 中間舊文字 <code class="kbd">OLD-CMD</code> 舊尾
        </div>
      `;

      applyStaticOptionMessages();

      const container = document.querySelector('[data-ui-composite="guide-shortcut-desc"]');
      const codes = container.querySelectorAll('code.kbd');
      expect(codes).toHaveLength(2);
      expect(codes[0].textContent).toBe(UI_MESSAGES.OPTIONS.GUIDE.FEATURES_SHORTCUT_CTRL_KEY);
      expect(codes[1].textContent).toBe(UI_MESSAGES.OPTIONS.GUIDE.FEATURES_SHORTCUT_CMD_KEY);
      expect(container.textContent).toContain(
        UI_MESSAGES.OPTIONS.GUIDE.FEATURES_SHORTCUT_DESC_PREFIX
      );
      expect(container.textContent).toContain(
        UI_MESSAGES.OPTIONS.GUIDE.FEATURES_SHORTCUT_DESC_MIDDLE
      );
      expect(container.textContent).toContain(
        UI_MESSAGES.OPTIONS.GUIDE.FEATURES_SHORTCUT_DESC_SUFFIX
      );
    });

    it('當 guide-shortcut-desc 缺少預期的 code 元素時應安靜跳過', () => {
      document.body.innerHTML = `
        <div data-ui-composite="guide-shortcut-desc">只有一個 <code class="kbd">X</code></div>
      `;

      expect(() => applyStaticOptionMessages()).not.toThrow();

      const code = document.querySelector('[data-ui-composite="guide-shortcut-desc"] code.kbd');
      expect(code.textContent).toBe('X');
    });

    it('guide-shortcut-desc 經 resolver 取值，缺失文案時不應注入 undefined', () => {
      jest.isolateModules(() => {
        jest.doMock('../../../scripts/config/shared/messages.js', () => ({
          UI_MESSAGES: {
            OPTIONS: {
              GUIDE: {
                FEATURES_SHORTCUT_CTRL_KEY: 'Ctrl',
                FEATURES_SHORTCUT_CMD_KEY: 'Cmd',
                FEATURES_SHORTCUT_DESC_PREFIX: 'Use ',
                FEATURES_SHORTCUT_DESC_SUFFIX: ' to save.',
              },
            },
          },
        }));
        const {
          applyStaticOptionMessages: applyWithMissingMessage,
        } = require('../../../pages/options/staticOptionMessages.js');

        document.body.innerHTML = `
          <div data-ui-composite="guide-shortcut-desc">
            舊文字 <code class="kbd">OLD-CTRL</code> 中間舊文字 <code class="kbd">OLD-CMD</code> 舊尾
          </div>
        `;

        applyWithMissingMessage();
      });

      const container = document.querySelector('[data-ui-composite="guide-shortcut-desc"]');
      expect(container.textContent).not.toContain('undefined');
      expect(container.querySelectorAll('code.kbd')).toHaveLength(2);
      jest.dontMock('../../../scripts/config/shared/messages.js');
    });

    it('應重組 guide-faq-token-answer 的 token 格式說明', () => {
      document.body.innerHTML = `
        <div data-ui-composite="guide-faq-token-answer">
          舊文字 <code class="inline-code">old_</code> 舊尾
        </div>
      `;

      applyStaticOptionMessages();

      const container = document.querySelector('[data-ui-composite="guide-faq-token-answer"]');
      const code = container.querySelector('code.inline-code');
      expect(code).not.toBeNull();
      expect(code.textContent).toBe(UI_MESSAGES.OPTIONS.GUIDE.FAQ_TOKEN_ANSWER_CODE);
      expect(container.textContent).toContain(UI_MESSAGES.OPTIONS.GUIDE.FAQ_TOKEN_ANSWER_PREFIX);
      expect(container.textContent).toContain(UI_MESSAGES.OPTIONS.GUIDE.FAQ_TOKEN_ANSWER_SUFFIX);
    });

    it('未知的 data-ui-composite key 不應拋錯', () => {
      document.body.innerHTML = `
        <div data-ui-composite="never-registered-key">原始內容</div>
      `;

      expect(() => applyStaticOptionMessages()).not.toThrow();
      expect(document.querySelector('[data-ui-composite="never-registered-key"]').textContent).toBe(
        '原始內容'
      );
    });

    it('composite handler 引用的 UI_MESSAGES path 皆為非空字串', () => {
      const compositePaths = [
        'OPTIONS.DESTINATION.HELP_PREFIX',
        'OPTIONS.DESTINATION.HELP_SUFFIX',
        'OPTIONS.DESTINATION.HELP_LINK_TEXT',
        'OPTIONS.GUIDE.FEATURES_SHORTCUT_CTRL_KEY',
        'OPTIONS.GUIDE.FEATURES_SHORTCUT_CMD_KEY',
        'OPTIONS.GUIDE.FEATURES_SHORTCUT_DESC_PREFIX',
        'OPTIONS.GUIDE.FEATURES_SHORTCUT_DESC_MIDDLE',
        'OPTIONS.GUIDE.FEATURES_SHORTCUT_DESC_SUFFIX',
        'OPTIONS.GUIDE.FAQ_TOKEN_ANSWER_CODE',
        'OPTIONS.GUIDE.FAQ_TOKEN_ANSWER_PREFIX',
        'OPTIONS.GUIDE.FAQ_TOKEN_ANSWER_SUFFIX',
      ];

      compositePaths.forEach(path => {
        let value = UI_MESSAGES;
        for (const key of path.split('.')) {
          value = value?.[key];
        }
        expect({
          path,
          type: typeof value,
          nonEmpty: typeof value === 'string' && value.length > 0,
        }).toEqual({ path, type: 'string', nonEmpty: true });
      });
    });

    it('options.js 不應直接硬編碼 destination profile 與 template preview UI 文案', () => {
      const fs = require('node:fs');
      const path = require('node:path');
      const source = fs.readFileSync(
        path.join(__dirname, '../../../pages/options/options.js'),
        'utf8'
      );
      const hardcodedUserFacingCopy = [
        '保存目標名稱不可為空白。',
        '保存目標名稱',
        '重新命名',
        '登入帳號後可建立第二個保存目標。',
        '更多保存目標會在付費方案開放。',
        '範例網頁標題 - Notion Clipper',
        '預覽結果：',
      ];

      hardcodedUserFacingCopy.forEach(copy => {
        expect({ copy, present: source.includes(copy) }).toEqual({ copy, present: false });
      });
    });
  });
});
