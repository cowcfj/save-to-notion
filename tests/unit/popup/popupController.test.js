/**
 * Popup Controller 測試
 *
 * 測試 popup/popup.js 的初始化和事件協調邏輯
 */

import { initPopup } from '../../../popup/popup.js';
import {
  getElements,
  updateUIForSavedPage,
  setStatus,
  setButtonState,
  formatSaveSuccessMessage,
  showModal,
  hideModal,
} from '../../../popup/popupUI.js';
import {
  checkSettings,
  checkPageStatus,
  savePage,
  startHighlight,
  openNotionPage,
  getActiveTab,
  clearHighlights,
} from '../../../popup/popupActions.js';
import Logger from '../../../scripts/utils/Logger.js';
import { UI_MESSAGES, ERROR_MESSAGES } from '../../../scripts/config/messages.js';

// Mock dependencies
jest.mock('../../../popup/popupUI.js');
jest.mock('../../../popup/popupActions.js');
jest.mock('../../../scripts/utils/Logger.js');

// Helper to trigger event
async function triggerEvent(element, eventType = 'click') {
  const handler = element.addEventListener.mock.calls.find(call => call[0] === eventType)[1];
  await handler({ target: element });
}

describe('popup.js Controller', () => {
  const setup = () => {
    const mockElements = {
      saveButton: { addEventListener: jest.fn(), style: {}, dataset: {} },
      highlightButton: { addEventListener: jest.fn(), style: {}, dataset: {} },
      clearHighlightsButton: { addEventListener: jest.fn(), style: {}, dataset: {} },
      openNotionButton: {
        addEventListener: jest.fn(),
        getAttribute: jest.fn(),
        style: {},
        dataset: { url: 'https://notion.so/new' },
      },
      status: { textContent: '', style: {} },
      modal: { addEventListener: jest.fn(), style: {} },
      modalMessage: { textContent: '' },
      modalConfirm: { addEventListener: jest.fn() },
      modalCancel: { addEventListener: jest.fn() },
    };

    getElements.mockReturnValue(mockElements);

    // Default mocks
    checkSettings.mockResolvedValue({ valid: true });
    checkPageStatus.mockResolvedValue({ success: true, isSaved: true });

    // Mock global chrome
    globalThis.chrome = {
      tabs: {
        query: jest.fn().mockResolvedValue([{ id: 123, url: 'https://example.com' }]),
        sendMessage: jest.fn().mockResolvedValue({}),
      },
    };
    globalThis.window.close = jest.fn();

    return { mockElements };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize successfully with valid settings and saved page', async () => {
    const { mockElements } = setup();
    await initPopup();

    expect(getElements).toHaveBeenCalled();
    expect(checkSettings).toHaveBeenCalled();
    expect(checkPageStatus).toHaveBeenCalledWith({ forceRefresh: true });
    expect(updateUIForSavedPage).toHaveBeenCalledWith(mockElements, expect.anything());
  });

  it('should handle missing API Key', async () => {
    const { mockElements } = setup();
    checkSettings.mockResolvedValue({ valid: false, apiKey: undefined, dataSourceId: undefined });

    await initPopup();

    expect(setStatus).toHaveBeenCalledWith(
      mockElements,
      expect.stringContaining(ERROR_MESSAGES.USER_MESSAGES.SETUP_KEY_NOT_CONFIGURED)
    );
    expect(setButtonState).toHaveBeenCalledWith(mockElements.saveButton, true);
    expect(setButtonState).toHaveBeenCalledWith(mockElements.highlightButton, true);
  });

  it('should handle missing Data Source ID when API Key exists', async () => {
    const { mockElements } = setup();
    checkSettings.mockResolvedValue({
      valid: false,
      apiKey: 'test-api-key',
      dataSourceId: undefined,
    });

    await initPopup();

    expect(setStatus).toHaveBeenCalledWith(
      mockElements,
      expect.stringContaining(ERROR_MESSAGES.USER_MESSAGES.SETUP_MISSING_DATA_SOURCE)
    );
    expect(setButtonState).toHaveBeenCalledWith(mockElements.saveButton, true);
    expect(setButtonState).toHaveBeenCalledWith(mockElements.highlightButton, true);
  });

  it('should handle initialization error', async () => {
    setup();
    checkPageStatus.mockRejectedValue(new Error('Init failed'));

    await initPopup();

    expect(Logger.error).toHaveBeenCalled();
    // 錯誤訊息經過 sanitizeApiError 清洗後再由 ErrorHandler.formatUserMessage 轉換
    // 'Init failed' 不匹配任何已知模式，會返回預設錯誤訊息
    expect(setStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('發生未知錯誤'),
      expect.anything()
    );
  });

  it('should setup event listeners', async () => {
    const { mockElements } = setup();
    await initPopup();

    expect(mockElements.saveButton.addEventListener).toHaveBeenCalledWith(
      'click',
      expect.any(Function)
    );
    expect(mockElements.highlightButton.addEventListener).toHaveBeenCalledWith(
      'click',
      expect.any(Function)
    );
    expect(mockElements.openNotionButton.addEventListener).toHaveBeenCalledWith(
      'click',
      expect.any(Function)
    );
    expect(mockElements.clearHighlightsButton.addEventListener).toHaveBeenCalledWith(
      'click',
      expect.any(Function)
    );
  });

  describe('Event Handlers', () => {
    it('saveButton click should save page', async () => {
      const { mockElements } = setup();
      await initPopup();

      savePage.mockResolvedValue({ success: true, url: 'https://notion.so/page' });

      await triggerEvent(mockElements.saveButton);

      expect(setStatus).toHaveBeenCalledWith(mockElements, UI_MESSAGES.POPUP.SAVING);
      expect(savePage).toHaveBeenCalled();
      expect(formatSaveSuccessMessage).toHaveBeenCalled();
      expect(updateUIForSavedPage).toHaveBeenCalled();
    });

    it('saveButton click failure should show error', async () => {
      const { mockElements } = setup();
      await initPopup();

      savePage.mockResolvedValue({ success: false, error: 'Save failed' });

      await triggerEvent(mockElements.saveButton);

      expect(setStatus).toHaveBeenCalledWith(mockElements, expect.stringContaining('發生未知錯誤'));
    });

    it('highlightButton click should start highlight if saved', async () => {
      const { mockElements } = setup();
      await initPopup();
      checkPageStatus.mockResolvedValue({ isSaved: true });
      startHighlight.mockResolvedValue({ success: true });

      await triggerEvent(mockElements.highlightButton);

      expect(setStatus).toHaveBeenCalledWith(
        mockElements,
        expect.stringContaining(UI_MESSAGES.POPUP.HIGHLIGHT_STARTING)
      );
      expect(startHighlight).toHaveBeenCalled();
    });

    it('highlightButton click should warn if not saved', async () => {
      const { mockElements } = setup();
      await initPopup();
      checkPageStatus.mockResolvedValue({ isSaved: false });

      await triggerEvent(mockElements.highlightButton);

      // 錯誤訊息已被 ErrorHandler.formatUserMessage 轉換為友善訊息
      expect(setStatus).toHaveBeenCalledWith(
        mockElements,
        expect.stringContaining('頁面尚未保存'),
        expect.anything()
      );
    });

    it('openNotionButton click should open notion page', async () => {
      const { mockElements } = setup();
      await initPopup();
      openNotionPage.mockResolvedValue({ success: true });

      await triggerEvent(mockElements.openNotionButton);

      expect(openNotionPage).toHaveBeenCalledWith('https://notion.so/new');
    });

    it('clearHighlightsButton click should show modal', async () => {
      const { mockElements } = setup();
      await initPopup();
      await triggerEvent(mockElements.clearHighlightsButton);
      expect(showModal).toHaveBeenCalled();
    });

    it('modal cancel should hide modal', async () => {
      const { mockElements } = setup();
      await initPopup();
      await triggerEvent(mockElements.modalCancel);
      expect(hideModal).toHaveBeenCalled();
    });

    it('modal confirm should clear highlights', async () => {
      const { mockElements } = setup();
      await initPopup();
      getActiveTab.mockResolvedValue({ id: 123, url: 'https://page.com' });
      clearHighlights.mockResolvedValue({ success: true, clearedCount: 5 });

      await triggerEvent(mockElements.modalConfirm);

      expect(hideModal).toHaveBeenCalled();
      expect(setStatus).toHaveBeenCalledWith(mockElements, UI_MESSAGES.POPUP.CLEARING);
      expect(clearHighlights).toHaveBeenCalledWith(123, 'https://page.com');
      expect(setStatus).toHaveBeenCalledWith(
        mockElements,
        expect.stringContaining(UI_MESSAGES.POPUP.CLEAR_SUCCESS(5))
      );
    });

    it('modal overlay click should close modal', async () => {
      const { mockElements } = setup();
      await initPopup();

      // Trigger click on modal element itself
      const handler = mockElements.modal.addEventListener.mock.calls.find(
        call => call[0] === 'click'
      )[1];
      await handler({ target: mockElements.modal }); // Click on overlay

      expect(hideModal).toHaveBeenCalled();
    });
  });
});
