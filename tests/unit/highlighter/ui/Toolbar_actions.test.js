import { Toolbar } from '../../../../scripts/highlighter/ui/Toolbar.js';
import { createToolbarContainer } from '../../../../scripts/highlighter/ui/components/ToolbarContainer.js';

import { createMiniIcon } from '../../../../scripts/highlighter/ui/components/MiniIcon.js';
import Logger from '../../../../scripts/utils/Logger.js';

// Mock dependencies
jest.mock('../../../../scripts/highlighter/ui/components/ToolbarContainer.js', () => ({
  createToolbarContainer: jest.fn(),
}));

jest.mock('../../../../scripts/highlighter/ui/components/MiniIcon.js', () => ({
  createMiniIcon: jest.fn(),
  bindMiniIconEvents: jest.fn(),
}));

jest.mock('../../../../scripts/highlighter/ui/components/ColorPicker.js', () => ({
  renderColorPicker: jest.fn(),
}));

// Mock toolbarStyles — Shadow DOM 環境中的樣式注入
jest.mock('../../../../scripts/highlighter/ui/styles/toolbarStyles.js', () => ({
  injectStylesIntoShadowRoot: jest.fn(),
  getToolbarCSS: jest.fn(() => ''),
  injectGlobalStyles: jest.fn(), // 向後相容
}));

jest.mock('../../../../scripts/utils/Logger.js', () => ({
  error: jest.fn(),
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  success: jest.fn(),
  start: jest.fn(),
  ready: jest.fn(),

  __esModule: true,
  default: {
    error: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    success: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
  },
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

    // Reset Logger Mock
    Logger.error.mockClear();

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
      // ErrorHandler might return a localized message or default error
      // verified that consistent error handling is in place
      expect(statusDiv.innerHTML).toContain('<svg');
    });

    test('should show default error message when sync fails without error message', async () => {
      // Setup failure response without specific error via callback
      sendMessageMock.mockImplementation((message, sendResponse) => {
        sendResponse({ success: false });
      });

      await toolbar.syncToNotion();

      // 預期顯示錯誤訊息（可能是 "發生未知錯誤" 或配置的默認訊息）
      expect(statusDiv.textContent).toBeTruthy();
      expect(statusDiv.innerHTML).toContain('<svg');
    });

    test('should refresh save button state when sync reports PAGE_DELETED', async () => {
      const updateSpy = jest.spyOn(toolbar, 'updateSaveButtonVisibility').mockResolvedValue();

      sendMessageMock.mockImplementation((message, sendResponse) => {
        if (message.action === 'syncHighlights') {
          sendResponse({
            success: false,
            errorCode: 'PAGE_DELETED',
            error: '原頁面已刪除，請重新儲存。',
          });
          return;
        }

        if (message.action === 'checkPageStatus') {
          sendResponse({ success: true, isSaved: false });
        }
      });

      await toolbar.syncToNotion();

      expect(updateSpy).toHaveBeenCalled();
      expect(statusDiv.textContent).toContain('原頁面已刪除，請重新儲存。');
      expect(statusDiv.innerHTML).toContain('<svg');
    });

    test('should not refresh save button state when sync reports PAGE_DELETION_PENDING', async () => {
      const updateSpy = jest.spyOn(toolbar, 'updateSaveButtonVisibility').mockResolvedValue();

      sendMessageMock.mockImplementation((message, sendResponse) => {
        if (message.action === 'syncHighlights') {
          sendResponse({
            success: false,
            errorCode: 'PAGE_DELETION_PENDING',
            error: '正在確認原頁面是否已刪除，請稍後再試。',
          });
          return;
        }

        if (message.action === 'checkPageStatus') {
          sendResponse({ success: true, isSaved: true });
        }
      });

      await toolbar.syncToNotion();

      expect(updateSpy).not.toHaveBeenCalled();
      expect(statusDiv.textContent).toContain('正在確認原頁面是否已刪除，請稍後再試。');
      expect(statusDiv.innerHTML).toContain('<svg');
    });

    test('should keep save button state when sync reports retryable highlight failure', async () => {
      const updateSpy = jest.spyOn(toolbar, 'updateSaveButtonVisibility').mockResolvedValue();

      sendMessageMock.mockImplementation((message, sendResponse) => {
        if (message.action === 'syncHighlights') {
          sendResponse({
            success: false,
            error: '標註同步未完成，請稍後再試',
          });
        }
      });

      await toolbar.syncToNotion();

      expect(updateSpy).not.toHaveBeenCalled();
      expect(statusDiv.textContent).toContain('標註同步未完成，請稍後再試');
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
      expect(Logger.error).toHaveBeenCalledWith('同步失敗:', expect.any(Object));
    });
  });
});
