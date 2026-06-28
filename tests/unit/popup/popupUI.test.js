/**
 * Popup UI 測試
 *
 * 測試 popup/popupUI.js 中的 UI 更新函數
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  initializePopupStaticText,
  setStatus,
  setButtonState,
  setButtonText,
  setAccountSectionVisible,
  setAccountStatusError,
  updateUIForLoggedOutAccount,
  updateUIForLoggedInAccount,
  updateUIForSavedPage,
  updateUIForUnsavedPage,
  renderDestinationSelector,
  formatSaveSuccessMessage,
} from '../../../pages/popup/popupUI.js';
import { UI_MESSAGES } from '../../../scripts/config/shared/messages.js';

describe('popupUI.js', () => {
  let mockElements = {};

  beforeEach(() => {
    // 建立模擬 DOM 元素
    mockElements = {
      saveButton: { style: { display: 'block' }, disabled: false, querySelector: jest.fn() },
      highlightButton: { style: { display: 'block' }, disabled: false, querySelector: jest.fn() },
      manageButton: { style: { display: 'block' }, disabled: false, querySelector: jest.fn() },
      openNotionButton: {
        style: { display: 'none' },
        dataset: {},
        querySelector: jest.fn(),
        setAttribute: jest.fn(),
      },
      status: {
        textContent: '',
        style: { color: '' },
        replaceChildren: jest.fn(),
        append: jest.fn(),
      },
      accountSection: { style: { display: 'none' }, classList: { toggle: jest.fn() } },
      accountStatus: {
        textContent: '',
        style: { color: '' },
        classList: { add: jest.fn(), remove: jest.fn() },
        replaceChildren: jest.fn(),
      },
      accountButton: {
        querySelector: jest.fn(),
        setAttribute: jest.fn(),
        classList: { toggle: jest.fn() },
        style: {},
        disabled: false,
      },
      settingsLinkText: { textContent: '' },
      destinationSection: { style: { display: 'none' } },
      destinationCurrent: { textContent: '', style: {}, dataset: {} },
      destinationMenu: {
        innerHTML: '',
        append: jest.fn(),
        replaceChildren: jest.fn(),
        style: { display: 'none' },
      },
      destinationToggle: {
        style: { display: 'none' },
        disabled: false,
        setAttribute: jest.fn(),
        dataset: {},
      },
    };
    jest.clearAllMocks();
  });

  describe('renderDestinationSelector', () => {
    it('只有一個 profile 時應顯示目前保存目標並隱藏選單切換', () => {
      renderDestinationSelector(mockElements, {
        profiles: [{ id: 'default', name: 'Default', color: '#2563eb', icon: 'bookmark' }],
        selectedProfileId: 'default',
      });

      expect(mockElements.destinationSection.style.display).toBe('block');
      expect(mockElements.destinationCurrent.textContent).toBe(
        `${UI_MESSAGES.POPUP.DESTINATION_LABEL_PREFIX}Default`
      );
      expect(mockElements.destinationCurrent.textContent).toContain('Default');
      expect(mockElements.destinationToggle.style.display).toBe('none');
      expect(mockElements.destinationCurrent.dataset.profileId).toBe('default');
    });

    it('兩個 profiles 時應渲染 selector 選項', () => {
      const menuItems = [];
      const createElementSpy = jest.spyOn(document, 'createElement').mockImplementation(tagName => {
        const element = {
          tagName,
          textContent: '',
          className: '',
          type: '',
          dataset: {},
          style: {},
          setAttribute: jest.fn(),
          addEventListener: jest.fn(),
          append: jest.fn(),
        };
        if (tagName === 'button') {
          menuItems.push(element);
        }
        return element;
      });

      renderDestinationSelector(mockElements, {
        profiles: [
          { id: 'default', name: 'Default', color: '#2563eb', icon: 'bookmark' },
          { id: 'profile-2', name: 'Research', color: '#16a34a', icon: 'book-open' },
        ],
        selectedProfileId: 'profile-2',
      });

      expect(mockElements.destinationToggle.style.display).toBe('inline-flex');
      expect(mockElements.destinationCurrent.textContent).toContain('Research');
      expect(menuItems).toHaveLength(2);
      expect(menuItems[1].dataset.profileId).toBe('profile-2');
      createElementSpy.mockRestore();
    });

    it('沒有 profiles 時應隱藏 destination section 並不渲染 menu', () => {
      renderDestinationSelector(mockElements, { profiles: [], selectedProfileId: null });

      expect(mockElements.destinationSection.style.display).toBe('none');
      expect(mockElements.destinationMenu.replaceChildren).not.toHaveBeenCalled();
      expect(mockElements.destinationMenu.append).not.toHaveBeenCalled();
    });

    it('selectedProfileId 不存在時應 fallback 到第一個 profile', () => {
      const menuItems = [];
      const createElementSpy = jest.spyOn(document, 'createElement').mockImplementation(tagName => {
        const element = {
          tagName,
          textContent: '',
          className: '',
          type: '',
          dataset: {},
          style: {},
          setAttribute: jest.fn(),
          append: jest.fn(),
        };
        if (tagName === 'button') {
          menuItems.push(element);
        }
        return element;
      });

      renderDestinationSelector(mockElements, {
        profiles: [
          { id: 'default', name: 'Default', color: '#2563eb' },
          { id: 'profile-2', name: 'Research', color: '#16a34a' },
        ],
        selectedProfileId: 'missing',
      });

      expect(mockElements.destinationCurrent.textContent).toContain('Default');
      expect(mockElements.destinationCurrent.dataset.profileId).toBe('default');
      expect(menuItems[0].setAttribute).toHaveBeenCalledWith('aria-pressed', 'true');
      expect(menuItems[1].setAttribute).toHaveBeenCalledWith('aria-pressed', 'false');

      createElementSpy.mockRestore();
    });
  });

  describe('initializePopupStaticText', () => {
    it('應從集中化 UI_MESSAGES 套用 popup 初始文字', () => {
      const buttonTextSpans = new Map([
        [mockElements.highlightButton, { textContent: '' }],
        [mockElements.saveButton, { textContent: '' }],
        [mockElements.manageButton, { textContent: '' }],
        [mockElements.openNotionButton, { textContent: '' }],
      ]);

      buttonTextSpans.forEach((textSpan, button) => {
        button.querySelector.mockReturnValue(textSpan);
      });

      initializePopupStaticText(mockElements);

      expect(mockElements.status.textContent).toBe('準備儲存');
      expect(buttonTextSpans.get(mockElements.highlightButton).textContent).toBe('開始標註');
      expect(buttonTextSpans.get(mockElements.saveButton).textContent).toBe('儲存頁面');
      expect(buttonTextSpans.get(mockElements.manageButton).textContent).toBe('管理標註');
      expect(buttonTextSpans.get(mockElements.openNotionButton).textContent).toBe('開啟 Notion');
      expect(mockElements.accountButton.setAttribute).toHaveBeenCalledWith(
        'aria-label',
        '使用 Google 登入'
      );
      expect(mockElements.accountButton.setAttribute).toHaveBeenCalledWith(
        'title',
        '使用 Google 登入'
      );
      expect(mockElements.settingsLinkText.textContent).toBe('設定');
    });
  });

  describe('setStatus', () => {
    it('應該正確設置狀態文字和顏色', () => {
      setStatus(mockElements, 'Test Status', 'red');
      expect(mockElements.status.textContent).toBe('Test Status');
      expect(mockElements.status.style.color).toBe('red');
    });

    it('應該在沒有提供顏色時使用默認值', () => {
      setStatus(mockElements, 'Test Status');
      expect(mockElements.status.textContent).toBe('Test Status');
      expect(mockElements.status.style.color).toBe('');
    });

    it('如果 status 元素不存在，不應該報錯', () => {
      const elementsWithoutStatus = { ...mockElements, status: null };
      expect(() => setStatus(elementsWithoutStatus, 'Test')).not.toThrow();
    });

    it('應安全渲染結構化文字與 SVG 狀態內容', () => {
      setStatus(mockElements, [
        'Saved ',
        { type: 'svg', content: '<svg><path d="M0 0h1v1z"/></svg>' },
        ' with warning',
      ]);

      expect(mockElements.status.replaceChildren).toHaveBeenCalled();
      expect(mockElements.status.append).toHaveBeenCalledTimes(3);
      expect(mockElements.status.append.mock.calls[0][0].textContent).toBe('Saved ');
      expect(
        mockElements.status.append.mock.calls[1][0].classList.contains('status-icon-inline')
      ).toBe(true);
      expect(mockElements.status.append.mock.calls[2][0].textContent).toBe(' with warning');
    });

    it('應過濾掉 SVG 中的危險標籤（<script>）', () => {
      setStatus(mockElements, [
        'Status: ',
        { type: 'svg', content: '<svg><script>alert("XSS")</script><path d="M0 0"/></svg>' },
      ]);

      expect(mockElements.status.replaceChildren).toHaveBeenCalled();
      expect(mockElements.status.append).toHaveBeenCalledTimes(2);

      const svgContainer = mockElements.status.append.mock.calls[1][0];
      expect(svgContainer.classList.contains('status-icon-inline')).toBe(true);

      // DOMPurify 應該已移除 <script> 標籤
      const svgElement = svgContainer.querySelector('svg');
      if (svgElement) {
        expect(svgElement.querySelector('script')).toBeNull();
      }
    });

    it('應過濾掉 SVG 中的危險屬性（onload）', () => {
      setStatus(mockElements, [
        { type: 'svg', content: '<svg onload="alert(1)"><path d="M0 0"/></svg>' },
      ]);

      expect(mockElements.status.replaceChildren).toHaveBeenCalled();
      const svgContainer = mockElements.status.append.mock.calls[0][0];
      const svgElement = svgContainer.querySelector('svg');

      if (svgElement) {
        expect(svgElement.hasAttribute('onload')).toBe(false);
      }
    });

    it('當 SVG 內容無效時應返回空的 status-icon-inline span', () => {
      setStatus(mockElements, [{ type: 'svg', content: '' }]);

      expect(mockElements.status.replaceChildren).toHaveBeenCalled();
      const svgContainer = mockElements.status.append.mock.calls[0][0];
      expect(svgContainer.classList.contains('status-icon-inline')).toBe(true);
      expect(svgContainer.querySelector('svg')).toBeNull();
    });
  });

  describe('setButtonState', () => {
    it('應該正確設置按鈕禁用狀態', () => {
      setButtonState(mockElements.saveButton, true);
      expect(mockElements.saveButton.disabled).toBe(true);
      setButtonState(mockElements.saveButton, false);
      expect(mockElements.saveButton.disabled).toBe(false);
    });
  });

  describe('setButtonText', () => {
    it('應該優先使用 .btn-text 元素設置文字', () => {
      const mockTextSpan = { textContent: '' };
      mockElements.saveButton.querySelector.mockReturnValue(mockTextSpan);

      setButtonText(mockElements.saveButton, 'New Text');

      expect(mockElements.saveButton.querySelector).toHaveBeenCalledWith('.btn-text');
      expect(mockTextSpan.textContent).toBe('New Text');
      expect(mockElements.saveButton.textContent).not.toBe('New Text');
    });

    it('如果沒有 .btn-text 則直接設置 button.textContent', () => {
      mockElements.saveButton.querySelector.mockReturnValue(null);

      setButtonText(mockElements.saveButton, 'New Button Text');

      expect(mockElements.saveButton.textContent).toBe('New Button Text');
    });

    it('如果按鈕不存在不應該報錯', () => {
      expect(() => setButtonText(null, 'Text')).not.toThrow();
    });
  });

  describe('updateUIForSavedPage', () => {
    it('應該更新 UI 為已保存狀態', () => {
      const response = { notionUrl: 'https://notion.so/test' };
      updateUIForSavedPage(mockElements, response);

      expect(mockElements.highlightButton.disabled).toBe(false);
      expect(mockElements.saveButton.style.display).toBe('none');
      expect(mockElements.openNotionButton.style.display).toBe('block');
      expect(mockElements.openNotionButton.dataset.url).toBe(response.notionUrl);
      expect(mockElements.status.textContent).toContain('頁面已儲存，可開始標註。');
    });
  });

  describe('updateUIForUnsavedPage', () => {
    it('應該更新 UI 為未保存狀態', () => {
      const response = { wasDeleted: false };
      updateUIForUnsavedPage(mockElements, response);

      // Highlight-First 模式：即使未保存也不禁用標記按鈕
      expect(mockElements.highlightButton.disabled).toBe(false);
      expect(mockElements.saveButton.style.display).toBe('block');
      expect(mockElements.status.textContent).toContain('開始標註');
    });

    it('當頁面被刪除時應該顯示特定錯誤', () => {
      const response = { wasDeleted: true };
      updateUIForUnsavedPage(mockElements, response);
      expect(mockElements.status.textContent).toContain('原頁面已刪除');
    });
  });

  describe('account section helpers', () => {
    it('應可切換角落 account 按鈕顯示狀態', () => {
      setAccountSectionVisible(mockElements, true);
      expect(mockElements.accountSection.style.display).toBe('flex');

      setAccountSectionVisible(mockElements, false);
      expect(mockElements.accountSection.style.display).toBe('none');
    });

    it('未登入時應將角落按鈕標示為登入入口', () => {
      const mockTextSpan = { textContent: '' };
      mockElements.accountButton.querySelector.mockReturnValue(mockTextSpan);

      updateUIForLoggedOutAccount(mockElements);

      expect(mockTextSpan.textContent).toBe('登入');
      expect(mockElements.accountButton.setAttribute).toHaveBeenCalledWith(
        'aria-label',
        '使用 Google 登入'
      );
      expect(mockElements.accountButton.setAttribute).toHaveBeenCalledWith(
        'title',
        '使用 Google 登入'
      );
      expect(mockElements.accountButton.classList.toggle).toHaveBeenCalledWith(
        'is-signed-in',
        false
      );
      expect(mockElements.accountStatus.classList.remove).toHaveBeenCalledWith(
        'account-status-error'
      );
    });

    it('應使用 CSS class 顯示 account 錯誤狀態', () => {
      mockElements.accountStatus.style.color = 'red';

      setAccountStatusError(mockElements, '登入設定異常，請稍後再試');

      expect(mockElements.accountStatus.textContent).toBe('登入設定異常，請稍後再試');
      expect(mockElements.accountStatus.classList.add).toHaveBeenCalledWith('account-status-error');
      expect(mockElements.accountStatus.style.color).toBe('red');
    });

    it('已登入且有 displayName 時應將角落按鈕標示為帳號管理', () => {
      const mockTextSpan = { textContent: '' };
      mockElements.accountButton.querySelector.mockReturnValue(mockTextSpan);

      updateUIForLoggedInAccount(mockElements, {
        email: 'user@example.com',
        displayName: 'Test User',
      });

      expect(mockTextSpan.textContent).toBe('已登入');
      expect(mockElements.accountButton.setAttribute).toHaveBeenCalledWith(
        'aria-label',
        '帳號管理：Test User'
      );
      expect(mockElements.accountButton.setAttribute).toHaveBeenCalledWith(
        'title',
        '帳號管理：Test User'
      );
      expect(mockElements.accountButton.classList.toggle).toHaveBeenCalledWith(
        'is-signed-in',
        true
      );
    });

    it('已登入且無 displayName 時應以 email 作為帳號管理標籤', () => {
      const mockTextSpan = { textContent: '' };
      mockElements.accountButton.querySelector.mockReturnValue(mockTextSpan);

      updateUIForLoggedInAccount(mockElements, {
        email: 'user@example.com',
        displayName: '   ',
      });

      expect(mockTextSpan.textContent).toBe('已登入');
      expect(mockElements.accountButton.setAttribute).toHaveBeenCalledWith(
        'aria-label',
        '帳號管理：user@example.com'
      );
    });

    it('transient refresh error 時應保留已登入摘要並顯示狀態提醒', () => {
      const mockTextSpan = { textContent: '' };
      mockElements.accountButton.querySelector.mockReturnValue(mockTextSpan);
      mockElements.accountStatus.style.color = 'red';

      updateUIForLoggedInAccount(
        mockElements,
        {
          email: 'user@example.com',
          displayName: 'Test User',
        },
        { transientRefreshError: true }
      );

      expect(mockTextSpan.textContent).toBe('已登入');
      expect(mockElements.accountStatus.textContent).toContain('無法更新登入狀態');
      expect(mockElements.accountStatus.classList.add).toHaveBeenCalledWith('account-status-error');
      expect(mockElements.accountStatus.style.color).toBe('red');
    });
  });

  describe('formatSaveSuccessMessage', () => {
    it('應該格式化 Created 訊息', () => {
      const response = { created: true, blockCount: 5, imageCount: 2 };
      const msg = formatSaveSuccessMessage(response);
      expect(Array.isArray(msg)).toBe(true);
      expect(msg[0]).toContain('建立成功');
      expect(msg[0]).toContain('5 個區塊');
      expect(msg[0]).toContain('2 張圖片');
    });

    it('應該格式化 Updated 訊息', () => {
      const response = { updated: true, blockCount: 1, imageCount: 0 };
      const msg = formatSaveSuccessMessage(response);
      expect(Array.isArray(msg)).toBe(true);
      expect(msg[0]).toContain('更新成功');
      expect(msg[0]).toContain('1 個區塊');
      expect(msg[0]).toContain('0 張圖片');
    });

    it('應該格式化 Highlights updated 訊息', () => {
      const response = { highlightsUpdated: true, highlightCount: 3 };
      const msg = formatSaveSuccessMessage(response);
      expect(Array.isArray(msg)).toBe(true);
      expect(msg[0]).toContain('標註已更新');
      expect(msg[0]).toContain('3 條標註');
    });

    it('應該格式化 Recreated 訊息', () => {
      const response = { recreated: true, blockCount: 10, imageCount: 5 };
      const msg = formatSaveSuccessMessage(response);
      expect(Array.isArray(msg)).toBe(true);
      expect(msg[0]).toContain('重建成功 (原頁面已刪除)');
    });

    it('應該包含警告圖標（如果存在 warning）', () => {
      const response = { created: true, warning: 'Size limit' };
      const msg = formatSaveSuccessMessage(response);
      expect(Array.isArray(msg)).toBe(true);
      expect(msg[0]).toContain('建立成功');
      expect(msg[1]).toEqual({
        type: 'svg',
        content: expect.stringContaining('<svg'),
      });
      expect(msg[2]).toBe('Size limit');
    });

    it('預設路徑不應產生尾部空格', () => {
      const response = {};
      const msg = formatSaveSuccessMessage(response);
      expect(Array.isArray(msg)).toBe(true);
      expect(msg[0]).not.toMatch(/\s$/);
      expect(msg[0]).toBe('儲存成功！');
    });
  });
});
