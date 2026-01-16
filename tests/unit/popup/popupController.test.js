/**
 * Popup Controller 測試
 *
 * 測試 popup/popup.js 的初始化和事件協調邏輯
 */

import { initPopup } from '../../../popup/popup.js';
import * as PopupUI from '../../../popup/popupUI.js';
import * as PopupActions from '../../../popup/popupActions.js';
import Logger from '../../../scripts/utils/Logger.js';

// Mock dependencies
jest.mock('../../../popup/popupUI.js');
jest.mock('../../../popup/popupActions.js');
jest.mock('../../../scripts/utils/Logger.js');

describe('popup.js Controller', () => {
  let mockElements;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock elements
    mockElements = {
      saveButton: { addEventListener: jest.fn(), style: {} },
      highlightButton: { addEventListener: jest.fn(), style: {} },
      clearHighlightsButton: { addEventListener: jest.fn(), style: {} },
      openNotionButton: { addEventListener: jest.fn(), getAttribute: jest.fn(), style: {} },
      status: { textContent: '', style: {} },
      modal: { addEventListener: jest.fn(), style: {} },
      modalMessage: { textContent: '' },
      modalConfirm: { addEventListener: jest.fn() },
      modalCancel: { addEventListener: jest.fn() },
    };

    PopupUI.getElements.mockReturnValue(mockElements);

    // Default mocks
    PopupActions.checkSettings.mockResolvedValue({ valid: true });
    PopupActions.checkPageStatus.mockResolvedValue({ success: true, isSaved: true });

    // Mock global chrome
    global.chrome = {
      tabs: {
        query: jest.fn().mockResolvedValue([{ id: 123, url: 'http://example.com' }]),
        sendMessage: jest.fn().mockResolvedValue({}),
      },
    };
    global.window.close = jest.fn();
  });

  it('should initialize successfully with valid settings and saved page', async () => {
    await initPopup();

    expect(PopupUI.getElements).toHaveBeenCalled();
    expect(PopupActions.checkSettings).toHaveBeenCalled();
    expect(PopupActions.checkPageStatus).toHaveBeenCalledWith({ forceRefresh: true });
    expect(PopupUI.updateUIForSavedPage).toHaveBeenCalledWith(mockElements, expect.anything());
  });

  it('should handle missing settings', async () => {
    PopupActions.checkSettings.mockResolvedValue({ valid: false });

    await initPopup();

    expect(PopupUI.setStatus).toHaveBeenCalledWith(
      mockElements,
      expect.stringContaining('Please set API Key')
    );
    expect(PopupUI.setButtonState).toHaveBeenCalledWith(mockElements.saveButton, true);
    expect(PopupUI.setButtonState).toHaveBeenCalledWith(mockElements.highlightButton, true);
  });

  it('should handle initialization error', async () => {
    PopupActions.checkPageStatus.mockRejectedValue(new Error('Init failed'));

    await initPopup();

    expect(Logger.error).toHaveBeenCalled();
    expect(PopupUI.setStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('Error initializing'),
      expect.anything()
    );
  });

  it('should setup event listeners', async () => {
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
    // Helper to trigger event
    async function triggerEvent(element, eventType = 'click') {
      const handler = element.addEventListener.mock.calls.find(call => call[0] === eventType)[1];
      await handler({ target: element });
    }

    it('saveButton click should save page', async () => {
      await initPopup();

      PopupActions.savePage.mockResolvedValue({ success: true, url: 'http://notion.so/page' });

      await triggerEvent(mockElements.saveButton);

      expect(PopupUI.setStatus).toHaveBeenCalledWith(mockElements, 'Saving...');
      expect(PopupActions.savePage).toHaveBeenCalled();
      expect(PopupUI.formatSaveSuccessMessage).toHaveBeenCalled();
      expect(PopupUI.updateUIForSavedPage).toHaveBeenCalled();
    });

    it('saveButton click failure should show error', async () => {
      await initPopup();

      PopupActions.savePage.mockResolvedValue({ success: false, error: 'Save failed' });

      await triggerEvent(mockElements.saveButton);

      expect(PopupUI.setStatus).toHaveBeenCalledWith(
        mockElements,
        expect.stringContaining('Failed to save')
      );
    });

    it('highlightButton click should start highlight if saved', async () => {
      await initPopup();
      PopupActions.checkPageStatus.mockResolvedValue({ isSaved: true });
      PopupActions.startHighlight.mockResolvedValue({ success: true });

      await triggerEvent(mockElements.highlightButton);

      expect(PopupUI.setStatus).toHaveBeenCalledWith(
        mockElements,
        expect.stringContaining('Starting highlight')
      );
      expect(PopupActions.startHighlight).toHaveBeenCalled();
    });

    it('highlightButton click should warn if not saved', async () => {
      await initPopup();
      PopupActions.checkPageStatus.mockResolvedValue({ isSaved: false });

      await triggerEvent(mockElements.highlightButton);

      // The actual message is "Please save the page first!"
      expect(PopupUI.setStatus).toHaveBeenCalledWith(
        mockElements,
        expect.stringContaining('Please save the page first'),
        expect.anything()
      );
    });

    it('openNotionButton click should open notion page', async () => {
      await initPopup();
      mockElements.openNotionButton.getAttribute.mockReturnValue('http://notion.so/new');
      PopupActions.openNotionPage.mockResolvedValue({ success: true });

      await triggerEvent(mockElements.openNotionButton);

      expect(PopupActions.openNotionPage).toHaveBeenCalledWith('http://notion.so/new');
    });

    it('clearHighlightsButton click should show modal', async () => {
      await initPopup();
      await triggerEvent(mockElements.clearHighlightsButton);
      expect(PopupUI.showModal).toHaveBeenCalled();
    });

    it('modal cancel should hide modal', async () => {
      await initPopup();
      await triggerEvent(mockElements.modalCancel);
      expect(PopupUI.hideModal).toHaveBeenCalled();
    });

    it('modal confirm should clear highlights', async () => {
      await initPopup();
      PopupActions.getActiveTab.mockResolvedValue({ id: 123, url: 'http://page.com' });
      PopupActions.clearHighlights.mockResolvedValue({ success: true, clearedCount: 5 });

      await triggerEvent(mockElements.modalConfirm);

      expect(PopupUI.hideModal).toHaveBeenCalled();
      expect(PopupUI.setStatus).toHaveBeenCalledWith(mockElements, 'Clearing highlights...');
      expect(PopupActions.clearHighlights).toHaveBeenCalledWith(123, 'http://page.com');
      expect(PopupUI.setStatus).toHaveBeenCalledWith(
        mockElements,
        expect.stringContaining('Cleared 5 highlights')
      );
    });

    it('modal overlay click should close modal', async () => {
      await initPopup();

      // Trigger click on modal element itself
      const handler = mockElements.modal.addEventListener.mock.calls.find(
        call => call[0] === 'click'
      )[1];
      await handler({ target: mockElements.modal }); // Click on overlay

      expect(PopupUI.hideModal).toHaveBeenCalled();
    });
  });
});
