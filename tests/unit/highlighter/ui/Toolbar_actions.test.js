import { Toolbar } from '../../../../scripts/highlighter/ui/Toolbar.js';
import { createToolbarContainer } from '../../../../scripts/highlighter/ui/components/ToolbarContainer.js';

import { createMiniIcon } from '../../../../scripts/highlighter/ui/components/MiniIcon.js';
import Logger from '../../../../scripts/utils/Logger.js';
import { ERROR_MESSAGES, UI_MESSAGES } from '../../../../scripts/config/messages.js';

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
  injectGlobalStyles: jest.fn(),
}));

// Mock ToolbarRuntime - 替代 Chrome runtime API 呼叫
jest.mock('../../../../scripts/highlighter/ui/ToolbarRuntime.js', () => ({
  checkPageStatus: jest.fn().mockResolvedValue({ success: true, isSaved: false }),
  savePageFromToolbar: jest.fn().mockResolvedValue({ success: true }),
  syncHighlights: jest.fn().mockResolvedValue({ success: true }),
  openSidePanel: jest.fn().mockResolvedValue(undefined),
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
  let toolbarRuntimeMock = null;
  let statusDiv = null;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    document.body.innerHTML = '';

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

    // 获取 ToolbarRuntime mock 引用
    const ToolbarRuntime = require('../../../../scripts/highlighter/ui/ToolbarRuntime.js');
    toolbarRuntimeMock = ToolbarRuntime;
    // 重置每個 mock 的預設回傳値
    toolbarRuntimeMock.checkPageStatus.mockResolvedValue({ success: true, isSaved: false });
    toolbarRuntimeMock.savePageFromToolbar.mockResolvedValue({ success: true });
    toolbarRuntimeMock.syncHighlights.mockResolvedValue({ success: true });

    toolbar = new Toolbar(managerMock);
  });

  describe('syncToNotion', () => {
    test('should show success message when sync is successful', async () => {
      toolbarRuntimeMock.syncHighlights.mockResolvedValue({ success: true });

      await toolbar.syncToNotion();

      expect(toolbarRuntimeMock.syncHighlights).toHaveBeenCalledWith([{ text: 'test highlight' }]);
      expect(statusDiv.textContent).toContain('同步成功');
      expect(statusDiv.innerHTML).toContain('<svg');
    });

    test('should show error message when sync fails with error message', async () => {
      toolbarRuntimeMock.syncHighlights.mockResolvedValue({
        success: false,
        error: 'API Key Missing',
      });

      await toolbar.syncToNotion();

      expect(toolbarRuntimeMock.syncHighlights).toHaveBeenCalled();
      expect(statusDiv.innerHTML).toContain('<svg');
    });

    test('should show default error message when sync fails without error message', async () => {
      toolbarRuntimeMock.syncHighlights.mockResolvedValue({ success: false });

      await toolbar.syncToNotion();

      expect(statusDiv.textContent).toBeTruthy();
      expect(statusDiv.innerHTML).toContain('<svg');
    });

    test('should refresh save button state when sync reports PAGE_DELETED', async () => {
      const updateSpy = jest.spyOn(toolbar, 'updateSaveButtonVisibility').mockResolvedValue();

      toolbarRuntimeMock.syncHighlights.mockResolvedValue({
        success: false,
        errorCode: 'PAGE_DELETED',
        error: UI_MESSAGES.POPUP.DELETED_PAGE,
      });

      await toolbar.syncToNotion();

      expect(updateSpy).toHaveBeenCalled();
      expect(statusDiv.textContent).toContain(UI_MESSAGES.POPUP.DELETED_PAGE);
      expect(statusDiv.innerHTML).toContain('<svg');
    });

    test('should not refresh save button state when sync reports PAGE_DELETION_PENDING', async () => {
      const updateSpy = jest.spyOn(toolbar, 'updateSaveButtonVisibility').mockResolvedValue();

      toolbarRuntimeMock.syncHighlights.mockResolvedValue({
        success: false,
        errorCode: 'PAGE_DELETION_PENDING',
        error: UI_MESSAGES.POPUP.DELETION_PENDING,
      });

      await toolbar.syncToNotion();

      expect(updateSpy).not.toHaveBeenCalled();
      expect(statusDiv.textContent).toContain(UI_MESSAGES.POPUP.DELETION_PENDING);
      expect(statusDiv.innerHTML).toContain('<svg');
    });

    test('should keep save button state when sync reports retryable highlight failure', async () => {
      const updateSpy = jest.spyOn(toolbar, 'updateSaveButtonVisibility').mockResolvedValue();

      toolbarRuntimeMock.syncHighlights.mockResolvedValue({
        success: false,
        error: ERROR_MESSAGES.PATTERNS.highlight_section_delete_incomplete,
      });

      await toolbar.syncToNotion();

      expect(updateSpy).not.toHaveBeenCalled();
      expect(statusDiv.textContent).toContain(
        ERROR_MESSAGES.PATTERNS.highlight_section_delete_incomplete
      );
      expect(statusDiv.innerHTML).toContain('<svg');
    });

    test('should handle runtime errors (chrome.runtime.lastError)', async () => {
      toolbarRuntimeMock.syncHighlights.mockRejectedValue(new Error('Connection failed'));

      await toolbar.syncToNotion();

      expect(statusDiv.textContent).toContain('同步失敗');
      expect(statusDiv.innerHTML).toContain('<svg');
      expect(Logger.error).toHaveBeenCalledWith('同步失敗:', expect.any(Object));
    });
  });
});
