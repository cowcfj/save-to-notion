import {
  applySaveSyncVisibility,
  getToolbarElements,
  renderStatusIcon,
} from '../../../../scripts/highlighter/ui/ToolbarUI.js';
import { UI_ICONS } from '../../../../scripts/config/icons.js';
import { TOOLBAR_SELECTORS } from '../../../../scripts/config/ui.js';
import { createSafeIcon } from '../../../../scripts/utils/securityUtils.js';

jest.mock('../../../../scripts/utils/securityUtils.js', () => ({
  createSafeIcon: jest.fn(),
}));

describe('ToolbarUI', () => {
  beforeEach(() => {
    createSafeIcon.mockImplementation(svgStr => {
      const el = document.createElement('span');
      el.innerHTML = svgStr || '';
      return el;
    });
  });
  describe('applySaveSyncVisibility', () => {
    test('當有任何按鈕缺失時應直接返回', () => {
      const btn = document.createElement('button');
      // 不會拋出異常即代表正常
      expect(() => applySaveSyncVisibility(null, btn, true)).not.toThrow();
      expect(() => applySaveSyncVisibility(btn, null, false)).not.toThrow();
    });

    test('isSaved 為 true 時應顯示 sync 隱藏 save', () => {
      const saveBtn = document.createElement('button');
      const syncBtn = document.createElement('button');
      applySaveSyncVisibility(saveBtn, syncBtn, true);
      expect(saveBtn.style.display).toBe('none');
      expect(syncBtn.style.display).toBe('inline-flex');
    });

    test('isSaved 為 false 時應顯示 save 隱藏 sync', () => {
      const saveBtn = document.createElement('button');
      const syncBtn = document.createElement('button');
      applySaveSyncVisibility(saveBtn, syncBtn, false);
      expect(saveBtn.style.display).toBe('inline-flex');
      expect(syncBtn.style.display).toBe('none');
    });
  });

  describe('getToolbarElements', () => {
    test('應正確選取三個元素', () => {
      const container = document.createElement('div');
      const saveBtn = document.createElement('button');
      saveBtn.id = TOOLBAR_SELECTORS.SAVE_PAGE.replace('#', '');
      const syncBtn = document.createElement('button');
      syncBtn.id = TOOLBAR_SELECTORS.SYNC_TO_NOTION.replace('#', '');
      const statusDiv = document.createElement('div');
      statusDiv.id = TOOLBAR_SELECTORS.STATUS_CONTAINER.replace('#', '');

      container.append(saveBtn, syncBtn, statusDiv);

      const elements = getToolbarElements(container);
      expect(elements.saveBtn).toBe(saveBtn);
      expect(elements.syncBtn).toBe(syncBtn);
      expect(elements.statusDiv).toBe(statusDiv);
    });
  });

  describe('renderStatusIcon', () => {
    test('應將 CHECK 映射為 SUCCESS 圖標並附加 customMessage', () => {
      const statusDiv = document.createElement('div');
      renderStatusIcon(statusDiv, 'CHECK', null, '自定義訊息');
      expect(statusDiv.textContent.trim()).toBe('自定義訊息');
      const iconSpan = statusDiv.querySelector('span');
      expect(iconSpan).not.toBeNull();
      expect(iconSpan.style.display).toBe('inline-block');
      expect(createSafeIcon).toHaveBeenCalledWith(UI_ICONS.SUCCESS);
    });

    test('當 iconKey 為 SYNC 時應映射為 REFRESH 並加上 spin 樣式', () => {
      const statusDiv = document.createElement('div');
      renderStatusIcon(statusDiv, 'SYNC', null, 'Syncing');
      const iconSpan = statusDiv.querySelector('span');
      expect(iconSpan.style.animation).toBe('spin 1s linear infinite');
      expect(createSafeIcon).toHaveBeenCalledWith(UI_ICONS.REFRESH);
    });

    test('當 messageKey 與 customMessage 均無時只顯示圖標', () => {
      const statusDiv = document.createElement('div');
      renderStatusIcon(statusDiv, 'CHECK', 'UNKNOWN_KEY');
      // customMessage = undefined, messageKey 找不到 -> textMsg 為 ''
      expect(statusDiv.textContent.trim()).toBe('');
    });

    test('未知 iconKey 應回退到安全預設圖標', () => {
      const statusDiv = document.createElement('div');

      renderStatusIcon(statusDiv, 'UNKNOWN', null, 'fallback');

      expect(createSafeIcon).toHaveBeenCalledWith(UI_ICONS.INFO);
      expect(statusDiv.textContent.trim()).toBe('fallback');
    });
  });
});
