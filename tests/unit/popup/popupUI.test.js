/**
 * Popup UI 測試
 *
 * 測試 popup/popupUI.js 中的 UI 更新函數
 */

import {
  setStatus,
  setButtonState,
  setButtonText,
  updateUIForSavedPage,
  updateUIForUnsavedPage,
  showModal,
  hideModal,
  formatSaveSuccessMessage,
} from '../../../popup/popupUI.js';

describe('popupUI.js', () => {
  let mockElements;

  beforeEach(() => {
    // 建立模擬 DOM 元素
    mockElements = {
      saveButton: { style: { display: 'block' }, disabled: false, querySelector: jest.fn() },
      highlightButton: { style: { display: 'block' }, disabled: false, querySelector: jest.fn() },
      clearHighlightsButton: { style: { display: 'none' } },
      openNotionButton: { style: { display: 'none' }, setAttribute: jest.fn() },
      status: { textContent: '', style: { color: '' } },
      modal: { style: { display: 'none' } },
      modalMessage: { textContent: '' },
      modalConfirm: {},
      modalCancel: {},
    };
    jest.clearAllMocks();
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
      expect(mockElements.clearHighlightsButton.style.display).toBe('block');
      expect(mockElements.saveButton.style.display).toBe('none');
      expect(mockElements.openNotionButton.style.display).toBe('block');
      expect(mockElements.openNotionButton.setAttribute).toHaveBeenCalledWith(
        'data-url',
        response.notionUrl
      );
      expect(mockElements.status.textContent).toContain('Page saved');
    });
  });

  describe('updateUIForUnsavedPage', () => {
    it('應該更新 UI 為未保存狀態', () => {
      const response = { wasDeleted: false };
      updateUIForUnsavedPage(mockElements, response);

      expect(mockElements.highlightButton.disabled).toBe(true);
      expect(mockElements.clearHighlightsButton.style.display).toBe('none');
      expect(mockElements.saveButton.style.display).toBe('block');
      expect(mockElements.status.textContent).toContain('Save page first');
    });

    it('當頁面被刪除時應該顯示特定錯誤', () => {
      const response = { wasDeleted: true };
      updateUIForUnsavedPage(mockElements, response);
      expect(mockElements.status.textContent).toContain('Original page was deleted');
    });
  });

  describe('showModal / hideModal', () => {
    it('應該正確顯示和隱藏 Modal', () => {
      showModal(mockElements, 'Confirm Message');
      expect(mockElements.modalMessage.textContent).toBe('Confirm Message');
      expect(mockElements.modal.style.display).toBe('flex');

      hideModal(mockElements);
      expect(mockElements.modal.style.display).toBe('none');
    });
  });

  describe('formatSaveSuccessMessage', () => {
    it('應該格式化 Created 訊息', () => {
      const response = { created: true, blockCount: 5, imageCount: 2 };
      const msg = formatSaveSuccessMessage(response);
      expect(msg).toContain('Created successfully!');
      expect(msg).toContain('5 blocks');
      expect(msg).toContain('2 images');
    });

    it('應該格式化 Updated 訊息', () => {
      const response = { updated: true, blockCount: 1, imageCount: 0 };
      const msg = formatSaveSuccessMessage(response);
      expect(msg).toContain('Updated successfully!');
      expect(msg).toContain('1 block');
      expect(msg).toContain('0 images');
    });

    it('應該格式化 Highlights updated 訊息', () => {
      const response = { highlightsUpdated: true, highlightCount: 3 };
      const msg = formatSaveSuccessMessage(response);
      expect(msg).toContain('Highlights updated successfully!');
      expect(msg).toContain('3 highlights');
    });

    it('應該格式化 Recreated 訊息', () => {
      const response = { recreated: true, blockCount: 10, imageCount: 5 };
      const msg = formatSaveSuccessMessage(response);
      expect(msg).toContain('Recreated (original was deleted) successfully!');
    });

    it('應該包含警告圖標（如果存在 warning）', () => {
      const response = { created: true, warning: 'Size limit' };
      const msg = formatSaveSuccessMessage(response);
      expect(msg).toContain('<svg');
      expect(msg).toContain('Size limit');
    });
  });
});
