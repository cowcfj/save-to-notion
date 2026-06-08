import fs from 'node:fs';
import path from 'node:path';
import { UI_MESSAGES } from '../../../scripts/config/shared/messages.js';

describe('options.html 結構', () => {
  test('health-status 應為 polite live region 的 output 標籤', () => {
    const htmlPath = path.resolve(__dirname, '../../../pages/options/options.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toMatch(/<output[^>]*id="health-status"/);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
  });

  test('cleanup-status 應保留既有 class 並提供 polite status live region', () => {
    const htmlPath = path.resolve(__dirname, '../../../pages/options/options.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toMatch(/<output[^>]*id="cleanup-status"/);
    expect(html).toMatch(/<output[^>]*id="cleanup-status"[^>]*class="status-message mt-sm"/);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
  });

  test('destination-profile-status 應使用 output 標籤而非 status role', () => {
    const htmlPath = path.resolve(__dirname, '../../../pages/options/options.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const status = doc.querySelector('#destination-profile-status');

    expect(status).not.toBeNull();
    expect(status.tagName).toBe('OUTPUT');
    expect(status.getAttribute('role')).toBeNull();
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');
  });

  test('Google Drive 雲端同步卡片應僅保留單一說明文案，描述備份與同步本地資料到雲端', () => {
    const htmlPath = path.resolve(__dirname, '../../../pages/options/options.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('連接 Google Drive 後，可備份和同步你的本地資料到雲端。');
    expect(html).not.toContain('此登入用於 Google Drive 授權，用於備份和同步你的本地資料。');
  });

  test('Google Drive 自動備份 UI 應標示測試版，避免暗示完整背景雙向同步', () => {
    const htmlPath = path.resolve(__dirname, '../../../pages/options/options.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('測試版');
    expect(html).toContain('自動備份頻率');
    expect(html).not.toContain('自動還原');
  });

  test('保存目標選擇器應位於手動 ID 輸入框之前', () => {
    const htmlPath = path.resolve(__dirname, '../../../pages/options/options.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const selectorContainer = doc.querySelector('#database-selector-container');
    const manualIdInput = doc.querySelector('#database-id');

    expect(selectorContainer).not.toBeNull();
    expect(manualIdInput).not.toBeNull();
    expect(
      selectorContainer.compareDocumentPosition(manualIdInput) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  test('保存目標新增表單應將名稱獨立成行，選擇器與 ID 欄位並列成行', () => {
    const htmlPath = path.resolve(__dirname, '../../../pages/options/options.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const nameRow = doc.querySelector('.destination-profile-name-row');
    const targetRow = doc.querySelector('.destination-target-row');
    const selectorColumn = doc.querySelector('.destination-target-select');
    const manualColumn = doc.querySelector('.destination-target-manual');
    const manualLabel = doc.querySelector('label[for="database-id"]');
    const helpText = doc.querySelector('.destination-target-help');

    expect(nameRow?.querySelector('#destination-profile-name')).not.toBeNull();
    expect(targetRow).not.toBeNull();
    expect(selectorColumn?.querySelector('#database-selector-container')).not.toBeNull();
    expect(manualColumn?.querySelector('#database-id')).not.toBeNull();
    expect(manualLabel?.classList.contains('sr-only')).toBe(false);
    expect(manualLabel?.dataset.uiMessage).toBe('OPTIONS.DESTINATION.MANUAL_ID_LABEL');
    expect(manualLabel?.textContent.trim()).toBe(UI_MESSAGES.OPTIONS.DESTINATION.MANUAL_ID_LABEL);
    expect(helpText?.dataset.uiComposite).toBe('destination-target-help');
    expect(html).not.toContain(UI_MESSAGES.OPTIONS.DESTINATION.HELP_PREFIX);
    expect(helpText?.textContent).not.toContain('上方欄位');
  });

  test('表單 label 在初始 HTML 中應關聯控制項並提供可讀文字', () => {
    const htmlPath = path.resolve(__dirname, '../../../pages/options/options.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');

    [
      ['destination-profile-name', 'OPTIONS.DESTINATION.PROFILE_NAME_LABEL'],
      ['database-search', 'OPTIONS.DESTINATION.SELECT_FROM_NOTION_LABEL'],
      ['database-id', 'OPTIONS.DESTINATION.MANUAL_ID_LABEL'],
      ['ui-zoom-level', 'OPTIONS.INTERFACE.ZOOM_LABEL'],
    ].forEach(([controlId, messageKey]) => {
      const control = doc.querySelector(`#${controlId}`);
      const label = doc.querySelector(`label[for="${controlId}"]`);

      expect(control).not.toBeNull();
      expect(label).not.toBeNull();
      expect(label?.dataset.uiMessage).toBe(messageKey);
      expect(label?.textContent.trim().length).toBeGreaterThan(0);
    });
  });

  test('保存目標靜態文案應以 UI_MESSAGES key 掛載，避免 HTML 重複硬編碼', () => {
    const htmlPath = path.resolve(__dirname, '../../../pages/options/options.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.querySelector('#database-search')?.dataset.uiPlaceholder).toBe(
      'OPTIONS.DESTINATION.SEARCH_PLACEHOLDER'
    );
    expect(doc.querySelector('#data-source-count')?.dataset.uiMessage).toBe(
      'DATA_SOURCE.LABEL_DATA_SOURCE'
    );
    expect(doc.querySelector('#refresh-databases')?.dataset.uiTitle).toBe(
      'OPTIONS.DESTINATION.REFRESH_TITLE'
    );
    expect(doc.querySelector('#add-destination-profile')?.dataset.uiMessage).toBe(
      'OPTIONS.DESTINATION.ADD_BUTTON'
    );
    expect(doc.querySelector('#save-button')?.dataset.uiMessage).toBe(
      'OPTIONS.SETTINGS.SAVE_BUTTON'
    );

    expect(doc.querySelector('#data-source-count')?.textContent.trim()).toBe('');
    expect(doc.querySelector('#add-destination-profile')?.textContent.trim()).toBe('');
    expect(doc.querySelector('#save-button')?.textContent.trim()).toBe('');
    expect(doc.querySelector('#database-search')?.getAttribute('placeholder')).toBeNull();
    expect(doc.querySelector('#refresh-databases')?.getAttribute('title')).toBeNull();
  });

  test('一般設定 UI 應保留精簡文案與連接操作列', () => {
    const htmlPath = path.resolve(__dirname, '../../../pages/options/options.html');
    const cssPath = path.resolve(__dirname, '../../../pages/options/options.css');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const oauthRow = doc.querySelector('.connection-row #oauth-status')?.closest('.connection-row');
    const manualRow = doc.querySelector('.connection-row #auth-status')?.closest('.connection-row');
    const zoomLabel = doc.querySelector('label[for="ui-zoom-level"]');

    expect(html).not.toContain(
      '預設保存目標會沿用下方 Notion 儲存目標。登入帳號後可新增第二個本地保存目標。'
    );
    expect(zoomLabel?.dataset.uiMessage).toBe('OPTIONS.INTERFACE.ZOOM_LABEL');
    expect(zoomLabel?.textContent.trim()).toBe(UI_MESSAGES.OPTIONS.INTERFACE.ZOOM_LABEL);
    expect(oauthRow?.querySelector('#oauth-connect-button')).not.toBeNull();
    expect(oauthRow?.querySelector('#oauth-disconnect-button')).not.toBeNull();
    expect(manualRow?.querySelector('#oauth-button')).not.toBeNull();
    expect(manualRow?.querySelector('#disconnect-button')).not.toBeNull();
    expect(css).toMatch(
      /\.destination-target-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(0,\s*1fr\);/
    );
    expect(css).toMatch(
      /\.connection-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto;/
    );
  });
});
