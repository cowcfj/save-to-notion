/**
 * @jest-environment jsdom
 */

import { createNotionHandlers } from '../../../../scripts/background/handlers/notionHandlers.js';

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

// Mock chrome API
globalThis.chrome = {
  runtime: {
    id: 'test-extension-id',
    lastError: null,
  },
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
          id: 'test-extension-id',
          // tab undefined
        },
      },
      {
        scenario: '來自 Options Page (在 Tab 中打開)',
        sender: {
          id: 'test-extension-id',
          tab: { id: 123 },
          url: 'chrome-extension://test-extension-id/options.html',
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
          id: 'test-extension-id',
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
        id: 'test-extension-id',
      };
      const sendResponse = jest.fn();
      const request = { query: 'test' };

      mockNotionService.search.mockRejectedValue(new Error('API Error'));

      await handlers.searchNotion(request, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.any(String) })
      );
    });
  });
});
