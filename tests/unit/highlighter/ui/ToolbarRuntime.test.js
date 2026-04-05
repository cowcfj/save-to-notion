/**
 * ToolbarRuntime.js 單元測試
 *
 * 測試 ToolbarRuntime 模組對 Chrome runtime API 的封裝。
 * 每個函數對應一個 background action，使用原生 async/await。
 */

import {
  checkPageStatus,
  savePageFromToolbar,
  syncHighlights,
  openSidePanel,
} from '../../../../scripts/highlighter/ui/ToolbarRuntime.js';

describe('ToolbarRuntime', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    globalThis.window = globalThis.window ?? {};
    globalThis.chrome = {
      runtime: {
        sendMessage: jest.fn(),
        lastError: null,
      },
    };
  });

  afterEach(() => {
    delete globalThis.chrome;
  });

  const mockSendMessage = response => {
    globalThis.chrome.runtime.sendMessage.mockResolvedValue(response);
  };

  describe('checkPageStatus', () => {
    test('應該呼叫 checkPageStatus action', async () => {
      mockSendMessage({ success: true, isSaved: true });

      const result = await checkPageStatus();

      expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'checkPageStatus',
      });
      expect(result).toEqual({ success: true, isSaved: true });
    });

    test('應該在 chrome 不可用時拋出錯誤', async () => {
      globalThis.chrome = undefined;
      await expect(checkPageStatus()).rejects.toThrow('無法連接擴展');
    });
  });

  describe('savePageFromToolbar', () => {
    test('應該呼叫 SAVE_PAGE_FROM_TOOLBAR action', async () => {
      mockSendMessage({ success: true });

      const result = await savePageFromToolbar();

      expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'SAVE_PAGE_FROM_TOOLBAR',
      });
      expect(result).toEqual({ success: true });
    });

    test('應該在 chrome 不可用時拋出錯誤', async () => {
      globalThis.chrome = undefined;
      await expect(savePageFromToolbar()).rejects.toThrow('無法連接擴展');
    });
  });

  describe('syncHighlights', () => {
    test('應該呼叫 syncHighlights action 並傳遞 highlights', async () => {
      mockSendMessage({ success: true });
      const highlights = [{ text: 'test' }];

      const result = await syncHighlights(highlights);

      expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'syncHighlights',
        highlights,
      });
      expect(result).toEqual({ success: true });
    });

    test('應該在 chrome 不可用時拋出錯誤', async () => {
      globalThis.chrome = undefined;
      await expect(syncHighlights([])).rejects.toThrow('無法連接擴展');
    });
  });

  describe('openSidePanel', () => {
    test('應該呼叫 OPEN_SIDE_PANEL action', async () => {
      mockSendMessage(undefined);

      await openSidePanel();

      expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'OPEN_SIDE_PANEL',
      });
    });

    test('應該在 chrome 不可用時拋出錯誤', async () => {
      globalThis.chrome = undefined;
      await expect(openSidePanel()).rejects.toThrow('無法連接擴展');
    });
  });
});
