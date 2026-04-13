/**
 * Popup Controller 測試
 *
 * 測試 popup/popup.js 的初始化和事件協調邏輯
 */

import { initPopup } from '../../../popup/popup.js';
import {
  getElements,
  updateUIForSavedPage,
  updateUIForUnsavedPage,
  setStatus,
  setButtonState,
  formatSaveSuccessMessage,
} from '../../../popup/popupUI.js';
import {
  checkSettings,
  checkPageStatus,
  savePage,
  startHighlight,
  openNotionPage,
  getActiveTab,
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
      manageButton: { addEventListener: jest.fn(), style: {}, dataset: {} },
      openNotionButton: {
        addEventListener: jest.fn(),
        getAttribute: jest.fn(),
        style: {},
        dataset: { url: 'https://notion.so/new' },
      },
      status: { textContent: '', style: {} },
      clearHighlightsButton: null,
      modal: null,
      modalMessage: null,
      modalConfirm: null,
      modalCancel: null,
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
        onActivated: { addListener: jest.fn() },
      },
      sidePanel: {
        open: jest.fn(),
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
    expect(checkPageStatus).toHaveBeenCalledWith();
    expect(updateUIForSavedPage).toHaveBeenCalledWith(mockElements, expect.anything());
  });

  it('should initialize unsaved UI when page status is unsaved or deleted', async () => {
    const { mockElements } = setup();
    checkPageStatus.mockResolvedValue({
      success: true,
      isSaved: false,
      wasDeleted: true,
      stableUrl: 'https://example.com/deleted',
    });

    await initPopup();

    expect(updateUIForUnsavedPage).toHaveBeenCalledWith(
      mockElements,
      expect.objectContaining({
        isSaved: false,
        wasDeleted: true,
      })
    );
    expect(updateUIForSavedPage).not.toHaveBeenCalled();
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
    expect(mockElements.manageButton.addEventListener).toHaveBeenCalledWith(
      'click',
      expect.any(Function)
    );
    expect(mockElements.openNotionButton.addEventListener).toHaveBeenCalledWith(
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

    it('highlightButton click should start highlight even if page not saved', async () => {
      const { mockElements } = setup();
      await initPopup();
      checkPageStatus.mockResolvedValue({ isSaved: false });
      startHighlight.mockResolvedValue({ success: true });

      await triggerEvent(mockElements.highlightButton);

      // Highlight-First：不再檢查 isSaved，直接啟動標註
      expect(startHighlight).toHaveBeenCalled();
      expect(setStatus).toHaveBeenCalledWith(
        mockElements,
        expect.stringContaining(UI_MESSAGES.POPUP.HIGHLIGHT_ACTIVATED)
      );
    });

    it('openNotionButton click should open notion page', async () => {
      const { mockElements } = setup();
      await initPopup();
      openNotionPage.mockResolvedValue({ success: true });

      await triggerEvent(mockElements.openNotionButton);

      expect(openNotionPage).toHaveBeenCalledWith('https://notion.so/new');
    });

    it('manageButton click should open side panel and close popup when current tab exists', async () => {
      const { mockElements } = setup();
      getActiveTab.mockResolvedValue({ id: 777, url: 'https://example.com' });
      await initPopup();

      await triggerEvent(mockElements.manageButton);

      expect(globalThis.chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 777 });
      expect(globalThis.window.close).toHaveBeenCalled();
    });

    it('manageButton click should show error when current tab is unavailable', async () => {
      const { mockElements } = setup();
      getActiveTab.mockResolvedValue(null);
      await initPopup();

      await triggerEvent(mockElements.manageButton);

      expect(setStatus).toHaveBeenCalledWith(mockElements, '側邊欄無法在此頁面開啟。', '#d63384');
      expect(globalThis.chrome.sidePanel.open).not.toHaveBeenCalled();
      expect(globalThis.window.close).not.toHaveBeenCalled();
    });

    it('should tolerate missing clear-highlights UI controls', async () => {
      const { mockElements } = setup();

      await expect(initPopup()).resolves.toBeUndefined();

      expect(mockElements.clearHighlightsButton).toBeNull();
      expect(mockElements.modal).toBeNull();
      expect(mockElements.modalConfirm).toBeNull();
      expect(mockElements.modalCancel).toBeNull();
    });
  });
});
