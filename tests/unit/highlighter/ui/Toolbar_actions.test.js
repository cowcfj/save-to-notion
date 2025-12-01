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
  let managerMock;
  let toolbar;
  let sendMessageMock;
  let statusDiv;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    document.body.innerHTML = '';

    // Mock chrome.runtime.sendMessage
    sendMessageMock = jest.fn();
    global.window.chrome = {
      runtime: {
        sendMessage: sendMessageMock,
      },
    };

    // Mock Logger
    window.Logger = {
      error: jest.fn(),
      log: jest.fn(),
    };

    // Mock ToolbarContainer creation
    statusDiv = document.createElement('div');
    statusDiv.id = 'highlight-status-v2';
    statusDiv.textContent = 'Original Status';

    const container = document.createElement('div');
    container.appendChild(statusDiv);

    // Add other required elements to container to prevent errors during initialization
    const countSpan = document.createElement('span');
    countSpan.id = 'highlight-count-v2';
    container.appendChild(countSpan);

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
      // Setup success response
      sendMessageMock.mockResolvedValue({ success: true });

      await toolbar.syncToNotion();

      expect(sendMessageMock).toHaveBeenCalledWith({
        action: 'syncHighlights',
        highlights: [{ text: 'test highlight' }],
      });
      expect(statusDiv.textContent).toBe('✅ 同步成功');
    });

    test('should show error message when sync fails with error message', async () => {
      // Setup failure response
      sendMessageMock.mockResolvedValue({ success: false, error: 'API Key Missing' });

      await toolbar.syncToNotion();

      expect(sendMessageMock).toHaveBeenCalled();
      expect(statusDiv.textContent).toBe('❌ API Key Missing');
    });

    test('should show default error message when sync fails without error message', async () => {
      // Setup failure response without specific error
      sendMessageMock.mockResolvedValue({ success: false });

      await toolbar.syncToNotion();

      expect(statusDiv.textContent).toBe('❌ 未知錯誤');
    });

    test('should handle network/runtime errors', async () => {
      // Setup network error
      const error = new Error('Network Error');
      sendMessageMock.mockRejectedValue(error);

      await toolbar.syncToNotion();

      expect(statusDiv.textContent).toBe('❌ 同步失敗');
      expect(window.Logger.error).toHaveBeenCalledWith('同步失敗:', error);
    });
  });

  describe('openInNotion', () => {
    test('should send openNotionPage message with current URL', () => {
      // Just verify it sends *some* URL, since we can't easily mock window.location in JSDOM without issues
      toolbar.openInNotion();

      expect(sendMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'openNotionPage',
          url: expect.any(String),
        })
      );
    });
  });
});
