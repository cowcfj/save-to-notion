import { createSidepanelHandlers } from '../../../../scripts/background/handlers/sidepanelHandlers.js';
import Logger from '../../../../scripts/utils/Logger.js';

jest.mock('../../../../scripts/utils/Logger.js', () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
}));

describe('SidepanelHandlers', () => {
  let handlers;

  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.chrome = {
      sidePanel: {
        open: jest.fn(),
      },
    };
    handlers = createSidepanelHandlers();
  });

  describe('OPEN_SIDE_PANEL', () => {
    it('should return error if sender is totally missing', async () => {
      const response = await handlers.OPEN_SIDE_PANEL({});
      expect(response).toEqual({ success: false, error: 'Invalid sender context' });
      expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('無效的 sender'));
    });

    it('should return error if sender.tab is missing', async () => {
      const response = await handlers.OPEN_SIDE_PANEL({}, { id: 'ext' });
      expect(response).toEqual({ success: false, error: 'Invalid sender context' });
    });

    it('should return error if sender.tab.windowId is missing', async () => {
      const response = await handlers.OPEN_SIDE_PANEL({}, { tab: { id: 1 } });
      expect(response).toEqual({ success: false, error: 'Invalid sender context' });
    });

    it('should successfully open side panel when windowId is present', async () => {
      globalThis.chrome.sidePanel.open.mockResolvedValue();

      const response = await handlers.OPEN_SIDE_PANEL({}, { tab: { windowId: 999 } });

      expect(globalThis.chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 999 });
      expect(response).toEqual({ success: true });
      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('windowId: 999'));
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
