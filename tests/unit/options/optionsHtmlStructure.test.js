import fs from 'node:fs';
import path from 'node:path';
import { UI_MESSAGES } from '../../../scripts/config/shared/messages.js';

const OPTIONS_HTML_PATH = path.resolve(__dirname, '../../../pages/options/options.html');
const OPTIONS_CSS_PATH = path.resolve(__dirname, '../../../pages/options/options.css');
const UI_PRIMITIVES_CSS_PATH = path.resolve(__dirname, '../../../styles/ui-primitives.css');

const readOptionsHtml = () => fs.readFileSync(OPTIONS_HTML_PATH, 'utf8');

const readOptionsCss = () => fs.readFileSync(OPTIONS_CSS_PATH, 'utf8');

const readUiPrimitivesCss = () => fs.readFileSync(UI_PRIMITIVES_CSS_PATH, 'utf8');

const parseOptionsHtml = html => new DOMParser().parseFromString(html, 'text/html');

const queryRequiredElement = (doc, selector) => {
  const element = doc.querySelector(selector);

  expect(element).not.toBeNull();

  return element;
};

const expectChildElement = (parent, selector) => {
  expect(parent.querySelector(selector)).not.toBeNull();
};

const expectElementDatasetValue = (doc, { selector, datasetKey, expectedValue }) => {
  const element = queryRequiredElement(doc, selector);

  expect(element.dataset[datasetKey]).toBe(expectedValue);
};

const expectEmptyElementText = (doc, selector) => {
  const element = queryRequiredElement(doc, selector);

  expect(element.textContent.trim()).toBe('');
};

const expectMissingElementAttribute = (doc, { selector, attribute }) => {
  const element = queryRequiredElement(doc, selector);

  expect(element.getAttribute(attribute)).toBeNull();
};

const expectSwitchControl = (doc, selector) => {
  const input = queryRequiredElement(doc, selector);
  const wrapper = input.closest('.switch-wrapper');
  const track = input.nextElementSibling;

  expect(input.tagName).toBe('INPUT');
  expect(input.getAttribute('type')).toBe('checkbox');
  expect(input.getAttribute('role')).toBe('switch');
  expect(input.getAttribute('aria-checked')).toBe(input.checked ? 'true' : 'false');
  expect(input.classList.contains('switch-input')).toBe(true);
  expect(wrapper).not.toBeNull();
  expect(track).not.toBeNull();
  expect(track.classList.contains('switch-track')).toBe(true);
  expect(track.getAttribute('aria-hidden')).toBe('true');
  expect(track.querySelector('.switch-knob')).not.toBeNull();
};

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
    const html = readOptionsHtml();
    const doc = parseOptionsHtml(html);

    const nameRow = queryRequiredElement(doc, '.destination-profile-name-row');
    queryRequiredElement(doc, '.destination-target-row');
    const selectorColumn = queryRequiredElement(doc, '.destination-target-select');
    const manualColumn = queryRequiredElement(doc, '.destination-target-manual');
    const manualLabel = queryRequiredElement(doc, 'label[for="database-id"]');
    const helpText = queryRequiredElement(doc, '.destination-target-help');

    expectChildElement(nameRow, '#destination-profile-name');
    expectChildElement(selectorColumn, '#database-selector-container');
    expectChildElement(manualColumn, '#database-id');
    expect(manualLabel.classList.contains('sr-only')).toBe(false);
    expect(manualLabel.dataset.uiMessage).toBe('OPTIONS.DESTINATION.MANUAL_ID_LABEL');
    expect(manualLabel.textContent.trim()).toBe(UI_MESSAGES.OPTIONS.DESTINATION.MANUAL_ID_LABEL);
    expect(helpText.dataset.uiComposite).toBe('destination-target-help');
    expect(html).not.toContain(UI_MESSAGES.OPTIONS.DESTINATION.HELP_PREFIX);
    expect(helpText.textContent).not.toContain('上方欄位');
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
    expect.hasAssertions();

    const html = readOptionsHtml();
    const doc = parseOptionsHtml(html);

    [
      ['#database-search', 'uiPlaceholder', 'OPTIONS.DESTINATION.SEARCH_PLACEHOLDER'],
      ['#data-source-count', 'uiMessage', 'DATA_SOURCE.LABEL_DATA_SOURCE'],
      ['#refresh-databases', 'uiTitle', 'OPTIONS.DESTINATION.REFRESH_TITLE'],
      ['#add-destination-profile', 'uiMessage', 'OPTIONS.DESTINATION.ADD_BUTTON'],
      ['#save-button', 'uiMessage', 'OPTIONS.SETTINGS.SAVE_BUTTON'],
    ].forEach(([selector, datasetKey, expectedValue]) => {
      expectElementDatasetValue(doc, { selector, datasetKey, expectedValue });
    });

    ['#data-source-count', '#add-destination-profile', '#save-button'].forEach(selector => {
      expectEmptyElementText(doc, selector);
    });

    [
      ['#database-search', 'placeholder'],
      ['#refresh-databases', 'title'],
    ].forEach(([selector, attribute]) => {
      expectMissingElementAttribute(doc, { selector, attribute });
    });
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
    expect(oauthRow?.querySelector('#oauth-connection-toggle')).not.toBeNull();
    expect(manualRow?.querySelector('#oauth-button')).not.toBeNull();
    expect(manualRow?.querySelector('#disconnect-button')).not.toBeNull();
    expect(css).toMatch(
      /\.destination-target-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(0,\s*1fr\);/
    );
    expect(css).toMatch(
      /\.connection-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto;/
    );
  });

  test('保存目標 profile row 應保留 switch、內容與 actions 三欄 layout', () => {
    const cssPath = path.resolve(__dirname, '../../../pages/options/options.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toMatch(
      /\.destination-profile-row\s*\{[^}]*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s+auto;/
    );
    expect(css).toMatch(
      /\.destination-profile-row\s*>\s*div:first-of-type\s*\{[^}]*min-width:\s*0;/
    );
  });

  test('二元偏好設定應使用既有 switch primitive，並保留 migration checkbox 語意', () => {
    const html = readOptionsHtml();
    const doc = parseOptionsHtml(html);

    ['#floating-rail-enabled', '#add-source', '#add-timestamp', '#enable-debug-logs'].forEach(
      selector => {
        expectSwitchControl(doc, selector);
      }
    );

    const migrationSelectAll = queryRequiredElement(doc, '#migration-select-all');
    expect(migrationSelectAll.getAttribute('type')).toBe('checkbox');
    expect(migrationSelectAll.getAttribute('role')).toBeNull();
    expect(migrationSelectAll.classList.contains('switch-input')).toBe(false);
  });

  test('Options layout 應限制 root overscroll，避免內容到底後拉出空白', () => {
    const css = readOptionsCss();

    expect(css).toMatch(/html,\s*body\s*\{[^}]*height:\s*100%;[^}]*overflow:\s*hidden;/);
    expect(css).toMatch(/\.app-container\s*\{[^}]*height:\s*100%;[^}]*overflow:\s*hidden;/);
    expect(css).toMatch(
      /\.content-area\s*\{[^}]*overflow-y:\s*auto;[^}]*min-height:\s*0;[^}]*overscroll-behavior:\s*contain;/
    );
  });

  test('Options switch row 應保留 primitive 間距並抵消 form label display 覆寫', () => {
    const primitivesCss = readUiPrimitivesCss();
    const optionsCss = readOptionsCss();

    expect(primitivesCss).toMatch(
      /\.switch-wrapper\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*gap:\s*var\(--spacing-sm\);/
    );
    expect(optionsCss).toMatch(
      /\.form-group\s+\.switch-wrapper\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;/
    );
  });
});
