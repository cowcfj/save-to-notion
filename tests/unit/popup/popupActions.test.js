import { checkPageStatus } from '../../../popup/popupActions.js';

// Mock Chrome API
global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
  },
};

describe('popupActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkPageStatus', () => {
    it('應該使用默認值 (forceRefresh: false) 當沒有參數傳入時', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });
      await checkPageStatus();
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'checkPageStatus',
        forceRefresh: false,
      });
    });

    it('應該正確傳遞 forceRefresh: true', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });
      await checkPageStatus({ forceRefresh: true });
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'checkPageStatus',
        forceRefresh: true,
      });
    });

    it('應該將非布林值強制轉換為布林值 (安全性驗證)', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });

      // 測試字串 "true" (轉換為 true)
      await checkPageStatus({ forceRefresh: 'true' });
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'checkPageStatus',
        forceRefresh: true,
      });

      // 測試 null (轉換為 false)
      await checkPageStatus({ forceRefresh: null });
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'checkPageStatus',
        forceRefresh: false,
      });

      // 測試 undefined (轉換為 false)
      await checkPageStatus({ forceRefresh: undefined });
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'checkPageStatus',
        forceRefresh: false,
      });
    });

    it('應該正確處理空 options 對象', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });
      await checkPageStatus({});
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'checkPageStatus',
        forceRefresh: false,
      });
    });
  });
});
