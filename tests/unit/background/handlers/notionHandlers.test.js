/**
 * @jest-environment jsdom
 */

jest.mock('../../../../scripts/utils/notionAuth.js', () => ({
  refreshOAuthToken: jest.fn(),
  getActiveNotionToken: jest.fn(),
}));

import { createNotionHandlers } from '../../../../scripts/background/handlers/notionHandlers.js';
import { refreshOAuthToken, getActiveNotionToken } from '../../../../scripts/utils/notionAuth.js';

// Mock Logger
globalThis.Logger = {
  debug: jest.fn(),
  success: jest.fn(),
  start: jest.fn(),
  ready: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('notionHandlers', () => {
  let handlers = null;
  let mockNotionService = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNotionService = {
      search: jest.fn(),
    };
    handlers = createNotionHandlers({ notionService: mockNotionService });
  });

  describe('searchNotion', () => {
    // 應允許的請求場景
    describe.each([
      {
        scenario: '來自 Popup/Background (無 tab 對象)',
        sender: {
          id: 'mock-extension-id',
          // tab undefined
        },
      },
      {
        scenario: '來自 Options Page (在 Tab 中打開)',
        sender: {
          id: 'mock-extension-id',
          tab: { id: 123 },
          url: 'chrome-extension://mock-extension-id/options.html',
        },
      },
    ])('應該允許: $scenario', ({ sender }) => {
      test('安全性檢查通過並執行搜索', async () => {
        const sendResponse = jest.fn();
        const request = { query: 'test', apiKey: 'secret' };
        const mockResult = { results: [] };

        mockNotionService.search.mockResolvedValue(mockResult);

        await handlers.searchNotion(request, sender, sendResponse);

        // 如果安全性檢查通過，應該會調用 notionService.search
        expect(mockNotionService.search).toHaveBeenCalledWith(
          expect.objectContaining({ query: 'test' }),
          expect.objectContaining({ apiKey: 'secret' })
        );

        // 確認返回成功
        expect(sendResponse).toHaveBeenCalledWith({ success: true, data: mockResult });
      });
    });

    // 應該拒絕的請求場景
    describe.each([
      {
        scenario: '來自 Content Script (sender.url 為網頁 URL)',
        sender: {
          id: 'mock-extension-id',
          tab: { id: 456 },
          url: 'https://malicious-site.com',
        },
      },
      {
        scenario: '來自其他擴充功能',
        sender: {
          id: 'other-extension-id',
        },
      },
    ])('應該拒絕: $scenario', ({ sender }) => {
      test('安全性檢查失敗', async () => {
        const sendResponse = jest.fn();
        const request = { query: 'test', apiKey: 'hacker-key' };

        await handlers.searchNotion(request, sender, sendResponse);

        // 應在調用 service 前中止
        expect(mockNotionService.search).not.toHaveBeenCalled();

        expect(sendResponse).toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
        );
      });
    });

    test('應該處理 Notion Service 錯誤', async () => {
      const sender = {
        id: 'mock-extension-id',
      };
      const sendResponse = jest.fn();
      const request = { query: 'test', apiKey: 'secret' };

      mockNotionService.search.mockRejectedValue(new Error('API Error'));

      await handlers.searchNotion(request, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.any(String) })
      );
    });

    test('caller 未帶 apiKey 時應從 storage hydrate active token', async () => {
      const sender = { id: 'mock-extension-id' };
      const sendResponse = jest.fn();
      const request = {
        searchParams: { filter: { property: 'object', value: 'database' } },
      };
      const mockResult = { results: [] };

      getActiveNotionToken.mockResolvedValueOnce({
        token: 'oauth-token-from-storage',
        mode: 'oauth',
      });
      mockNotionService.search.mockResolvedValue(mockResult);

      await handlers.searchNotion(request, sender, sendResponse);

      expect(getActiveNotionToken).toHaveBeenCalledTimes(1);
      expect(mockNotionService.search).toHaveBeenCalledWith(
        expect.objectContaining({ filter: { property: 'object', value: 'database' } }),
        expect.objectContaining({ apiKey: 'oauth-token-from-storage' })
      );
      expect(sendResponse).toHaveBeenCalledWith({ success: true, data: mockResult });
    });

    test('caller 帶了 apiKey 時不應再呼叫 getActiveNotionToken', async () => {
      const sender = { id: 'mock-extension-id' };
      const sendResponse = jest.fn();
      const request = {
        apiKey: 'caller-supplied-key',
        searchParams: { query: 'foo' },
      };

      mockNotionService.search.mockResolvedValue({ results: [] });

      await handlers.searchNotion(request, sender, sendResponse);

      expect(getActiveNotionToken).not.toHaveBeenCalled();
      expect(mockNotionService.search).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'foo' }),
        expect.objectContaining({ apiKey: 'caller-supplied-key' })
      );
    });

    test('caller 未帶 apiKey 且 storage 也沒 token 時應回傳友善錯誤', async () => {
      const sender = { id: 'mock-extension-id' };
      const sendResponse = jest.fn();
      const request = {
        searchParams: { filter: { property: 'object', value: 'database' } },
      };

      getActiveNotionToken.mockResolvedValueOnce({ token: null, mode: null });

      await handlers.searchNotion(request, sender, sendResponse);

      expect(mockNotionService.search).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.any(String) })
      );
    });
  });

  describe('refreshOAuthToken', () => {
    test('應該允許內部請求並回傳刷新後 token', async () => {
      const sender = { id: 'mock-extension-id' };
      const sendResponse = jest.fn();
      refreshOAuthToken.mockResolvedValueOnce('oauth_token_refreshed');

      await handlers.refreshOAuthToken({ action: 'refreshOAuthToken' }, sender, sendResponse);

      expect(refreshOAuthToken).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith({ success: true, token: 'oauth_token_refreshed' });
    });

    test('刷新失敗時應回傳失敗結果', async () => {
      const sender = { id: 'mock-extension-id' };
      const sendResponse = jest.fn();
      refreshOAuthToken.mockResolvedValueOnce(null);

      await handlers.refreshOAuthToken({ action: 'refreshOAuthToken' }, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({ success: false, token: null });
    });
  });
});
