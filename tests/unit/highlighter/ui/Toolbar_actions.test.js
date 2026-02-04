import { Toolbar } from '../../../../scripts/highlighter/ui/Toolbar.js';
import { createToolbarContainer } from '../../../../scripts/highlighter/ui/components/ToolbarContainer.js';

// Mock dependencies
jest.mock('../../../../scripts/highlighter/ui/components/ToolbarContainer.js', () => ({
  createToolbarContainer: jest.fn(),
}));

import { createMiniIcon } from '../../../../scripts/highlighter/ui/components/MiniIcon.js';

jest.mock('../../../../scripts/highlighter/ui/components/MiniIcon.js', () => ({
  createMiniIcon: jest.fn(),
  bindMiniIconEvents: jest.fn(),
}));

jest.mock('../../../../scripts/highlighter/ui/components/ColorPicker.js', () => ({
  renderColorPicker: jest.fn(),
}));

describe('Toolbar Actions', () => {
  let managerMock = null;
  let toolbar = null;
  let sendMessageMock = null;
  let statusDiv = null;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    document.body.innerHTML = '';

    // Mock chrome.runtime.sendMessage
    sendMessageMock = jest.fn();
    globalThis.window.chrome = {
      runtime: {
        sendMessage: sendMessageMock,
      },
    };

    // Mock Logger
    globalThis.Logger = {
      error: jest.fn(),
      log: jest.fn(),
    };

    // Mock ToolbarContainer creation
    statusDiv = document.createElement('div');
    statusDiv.id = 'highlight-status-v2';
    statusDiv.textContent = 'Original Status';

    const container = document.createElement('div');
    container.append(statusDiv);

    // Add other required elements to container to prevent errors during initialization
    const countSpan = document.createElement('span');
    countSpan.id = 'highlight-count-v2';
    container.append(countSpan);

    createToolbarContainer.mockReturnValue(container);
    createMiniIcon.mockReturnValue(document.createElement('div'));

    // Mock Manager
    managerMock = {
      highlights: new Map(),
      colors: { yellow: '#ff0' },
      currentColor: 'yellow',
      getCount: jest.fn().mockReturnValue(0),
      setColor: jest.fn(),
      addHighlight: jest.fn(),
      handleDocumentClick: jest.fn(),
      collectHighlightsForNotion: jest.fn().mockReturnValue([{ text: 'test highlight' }]),
    };

    toolbar = new Toolbar(managerMock);
  });

  describe('syncToNotion', () => {
    test('should show success message when sync is successful', async () => {
      // Setup success response via callback
      sendMessageMock.mockImplementation((message, sendResponse) => {
        sendResponse({ success: true });
      });

      await toolbar.syncToNotion();

      expect(sendMessageMock).toHaveBeenCalledWith(
        {
          action: 'syncHighlights',
          highlights: [{ text: 'test highlight' }],
        },
        expect.any(Function)
      );
      expect(statusDiv.textContent).toContain('同步成功');
      expect(statusDiv.innerHTML).toContain('<svg');
    });

    test('should show error message when sync fails with error message', async () => {
      // Setup failure response via callback
      sendMessageMock.mockImplementation((message, sendResponse) => {
        sendResponse({ success: false, error: 'API Key Missing' });
      });

      await toolbar.syncToNotion();

      expect(sendMessageMock).toHaveBeenCalled();
      expect(statusDiv.textContent).toContain('API Key');
      expect(statusDiv.innerHTML).toContain('<svg');
    });

    test('should show default error message when sync fails without error message', async () => {
      // Setup failure response without specific error via callback
      sendMessageMock.mockImplementation((message, sendResponse) => {
        sendResponse({ success: false });
      });

      await toolbar.syncToNotion();

      expect(statusDiv.textContent).toContain('未知錯誤');
      expect(statusDiv.innerHTML).toContain('<svg');
    });

    test('should handle runtime errors (chrome.runtime.lastError)', async () => {
      // Setup runtime error
      sendMessageMock.mockImplementation((message, sendResponse) => {
        globalThis.chrome.runtime.lastError = { message: 'Connection failed' };
        sendResponse();
        delete globalThis.chrome.runtime.lastError;
      });

      await toolbar.syncToNotion();

      expect(statusDiv.textContent).toContain('同步失敗');
      expect(statusDiv.innerHTML).toContain('<svg');
      expect(globalThis.Logger.error).toHaveBeenCalledWith('同步失敗:', expect.any(Object));
    });
  });

  describe('openInNotion', () => {
    test('should send openNotionPage message with current URL', () => {
      // Call the static method directly
      Toolbar.openInNotion();

      // 驗證發送的 URL 是當前頁面的 window.location.href
      // 在 jsdom 環境中默認是 'http://localhost/'
      expect(sendMessageMock).toHaveBeenCalledWith({
        action: 'openNotionPage',
        url: globalThis.location.href,
      });
    });
  });
});
