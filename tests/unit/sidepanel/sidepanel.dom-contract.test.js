import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { importSidepanelEntrypoint, setupRequiredDomContractTest } from './sidepanel.shared.js';

describe('Required DOM contract', () => {
  beforeEach(() => {
    setupRequiredDomContractTest();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('缺少開始標註按鈕時應立即失敗，避免以不完整 DOM 啟動 sidepanel', async () => {
    const originalAddEventListener = document.addEventListener.bind(document);
    let domContentLoadedHandler;

    const addEventListenerSpy = jest
      .spyOn(document, 'addEventListener')
      .mockImplementation((eventName, listener, options) => {
        if (eventName === 'DOMContentLoaded') {
          domContentLoadedHandler = listener;
          return;
        }
        return originalAddEventListener(eventName, listener, options);
      });

    try {
      await importSidepanelEntrypoint();

      expect(typeof domContentLoadedHandler).toBe('function');
      await expect(domContentLoadedHandler()).rejects.toThrow(
        '[SidePanel] 缺少必要的 DOM 元素：startHighlightButton'
      );

      expect(chrome.tabs.onActivated.addListener).not.toHaveBeenCalled();
    } finally {
      addEventListenerSpy.mockRestore();
    }
  });
});
