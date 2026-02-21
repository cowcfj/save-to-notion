import { createSidepanelHandlers } from '../../../../scripts/background/handlers/sidepanelHandlers.js';
import Logger from '../../../../scripts/utils/Logger.js';

jest.mock('../../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('SidepanelHandlers', () => {
  let handlers;

  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.chrome = {
      sidePanel: {
        open: jest.fn(),
      },
      tabs: {
        get: jest.fn(),
      },
      windows: {
        getCurrent: jest.fn(),
      },
    };
    handlers = createSidepanelHandlers();
  });

  describe('OPEN_SIDE_PANEL', () => {
    it('should return error if sender and message are completely missing context', async () => {
      // Mock windows and tabs to also fail or return undefined to trigger the final error
      globalThis.chrome.windows.getCurrent.mockRejectedValue(new Error('No window'));
      const response = await handlers.OPEN_SIDE_PANEL({});
      expect(response).toEqual({ success: false, error: 'Invalid sender context' });
      expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('無效的 context'));
    });

    it('should successfully open side panel when windowId is present in sender', async () => {
      globalThis.chrome.sidePanel.open.mockResolvedValue();

      const response = await handlers.OPEN_SIDE_PANEL({}, { tab: { windowId: 999 } });

      expect(globalThis.chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 999 });
      expect(response).toEqual({ success: true });
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('windowId: 999'));
    });

    it('should fallback to message.tabId when sender.tab is missing (e.g. from popup)', async () => {
      globalThis.chrome.tabs.get.mockResolvedValue({ windowId: 888 });
      globalThis.chrome.sidePanel.open.mockResolvedValue();

      const response = await handlers.OPEN_SIDE_PANEL({ tabId: 10 }, { id: 'ext-id' });

      expect(globalThis.chrome.tabs.get).toHaveBeenCalledWith(10);
      expect(globalThis.chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 888 });
      expect(response).toEqual({ success: true });
    });

    it('should fallback to getCurrent window if tab lookup fails', async () => {
      globalThis.chrome.tabs.get.mockRejectedValue(new Error('Tab not found'));
      globalThis.chrome.windows.getCurrent.mockResolvedValue({ id: 777 });
      globalThis.chrome.sidePanel.open.mockResolvedValue();

      const response = await handlers.OPEN_SIDE_PANEL({ tabId: 10 }, { id: 'ext-id' });

      expect(globalThis.chrome.windows.getCurrent).toHaveBeenCalled();
      expect(globalThis.chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 777 });
      expect(response).toEqual({ success: true });
    });

    it('should return error if chrome.sidePanel.open fails', async () => {
      globalThis.chrome.sidePanel.open.mockRejectedValue(
        new Error('Extension context invalidated.')
      );

      const response = await handlers.OPEN_SIDE_PANEL({}, { tab: { windowId: 999 } });

      expect(response).toEqual({ success: false, error: 'Extension context invalidated.' });
      expect(Logger.error).toHaveBeenCalledWith(
        '[SidepanelHandler] Failed to open Side Panel',
        expect.any(Error)
      );
    });
  });
});
