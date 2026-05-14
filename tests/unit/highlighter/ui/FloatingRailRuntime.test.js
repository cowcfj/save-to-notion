/**
 * FloatingRailRuntime.js 單元測試
 *
 * 直接 import 真實模組（不可 jest.mock），覆蓋：
 *  - ensureChromeRuntimeAvailable sendMessage 不存在分支
 *  - 4 個 action wrapper 的 payload contract 與 sendMessage return 透傳
 *  - sendMessage rejection 冒泡
 *
 * 注意：window === undefined 分支需要 node 環境，見 FloatingRailRuntime.node.test.js
 */

import {
  checkPageStatus,
  openSidePanel,
  savePageFromRail,
  syncHighlights,
} from '../../../../scripts/highlighter/ui/FloatingRailRuntime.js';
import { HIGHLIGHTER_ACTIONS } from '../../../../scripts/config/runtimeActions/highlighterActions.js';
import { PAGE_SAVE_ACTIONS } from '../../../../scripts/config/runtimeActions/pageSaveActions.js';
import { RUNTIME_ERROR_MESSAGES } from '../../../../scripts/config/runtimeActions/errorMessages.js';

describe('FloatingRailRuntime', () => {
  let originalSendMessage;

  beforeEach(() => {
    originalSendMessage = globalThis.chrome?.runtime?.sendMessage;
  });

  afterEach(() => {
    if (globalThis.chrome?.runtime) {
      globalThis.chrome.runtime.sendMessage = originalSendMessage;
    }
  });

  describe('ensureChromeRuntimeAvailable guard', () => {
    it('chrome.runtime.sendMessage 不存在時拋 EXTENSION_UNAVAILABLE', async () => {
      globalThis.chrome.runtime.sendMessage = undefined;

      await expect(savePageFromRail()).rejects.toThrow(
        RUNTIME_ERROR_MESSAGES.EXTENSION_UNAVAILABLE
      );
    });
  });

  describe('action wrappers', () => {
    it('checkPageStatus 送出 CHECK_PAGE_STATUS 並透傳 sendMessage 回應', async () => {
      const response = { saved: true };
      const sendMessage = jest.fn().mockResolvedValue(response);
      globalThis.chrome.runtime.sendMessage = sendMessage;

      await expect(checkPageStatus()).resolves.toBe(response);
      expect(sendMessage).toHaveBeenCalledWith({
        action: PAGE_SAVE_ACTIONS.CHECK_PAGE_STATUS,
      });
    });

    it('savePageFromRail 送出 SAVE_PAGE_FROM_TOOLBAR', async () => {
      const sendMessage = jest.fn().mockResolvedValue({ ok: true });
      globalThis.chrome.runtime.sendMessage = sendMessage;

      await savePageFromRail();

      expect(sendMessage).toHaveBeenCalledWith({
        action: PAGE_SAVE_ACTIONS.SAVE_PAGE_FROM_TOOLBAR,
      });
    });

    it('syncHighlights 送出 SYNC_HIGHLIGHTS 並夾帶 highlights payload', async () => {
      const highlights = [{ id: 'h1', text: 'sample' }];
      const sendMessage = jest.fn().mockResolvedValue(undefined);
      globalThis.chrome.runtime.sendMessage = sendMessage;

      await syncHighlights(highlights);

      expect(sendMessage).toHaveBeenCalledWith({
        action: HIGHLIGHTER_ACTIONS.SYNC_HIGHLIGHTS,
        highlights,
      });
    });

    it('openSidePanel 送出 OPEN_SIDE_PANEL', async () => {
      const sendMessage = jest.fn().mockResolvedValue(undefined);
      globalThis.chrome.runtime.sendMessage = sendMessage;

      await openSidePanel();

      expect(sendMessage).toHaveBeenCalledWith({
        action: PAGE_SAVE_ACTIONS.OPEN_SIDE_PANEL,
      });
    });

    it('sendMessage rejection 會冒泡給 caller', async () => {
      const failure = new Error('runtime disconnected');
      globalThis.chrome.runtime.sendMessage = jest.fn().mockRejectedValue(failure);

      await expect(checkPageStatus()).rejects.toBe(failure);
    });
  });
});
