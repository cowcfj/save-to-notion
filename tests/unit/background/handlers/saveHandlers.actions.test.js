/**
 * @jest-environment jsdom
 */

import {
  createSaveHandlersTestContext,
  ensureNotionApiKey,
  isValidNotionUrl,
  setupDefaultActionMocks,
  validContentScriptSender,
  validSender,
} from './saveHandlers.shared.js';

describe('saveHandlers security and actions', () => {
  const context = createSaveHandlersTestContext();

  describe('Security Checks', () => {
    test('savePage 應拒絕外部請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };
      await context.handlers.savePage({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    test('openNotionPage 應拒絕外部請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };
      await context.handlers.openNotionPage({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    test('checkNotionPageExists 應拒絕外部請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };
      await context.handlers.checkNotionPageExists({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    test('checkPageStatus 應拒絕外部請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };
      await context.handlers.checkPageStatus({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    it('checkNotionPageExists 應該處理意外錯誤', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'mock-extension-id' };
      ensureNotionApiKey.mockRejectedValueOnce(new Error('Fatal'));

      await context.handlers.checkNotionPageExists({ pageId: 'page1' }, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.any(String) })
      );
    });

    test('devLogSink 應拒絕非 Content Script 請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'mock-extension-id', url: 'https://evil.com' };
      await context.handlers.devLogSink({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });
  });

  describe('Action Logic', () => {
    beforeEach(() => {
      setupDefaultActionMocks(context.mockServices);
    });

    test('checkNotionPageExists 應在合法請求時調用 service', async () => {
      const sendResponse = jest.fn();
      context.mockServices.notionService.checkPageExists.mockResolvedValue(true);

      await context.handlers.checkNotionPageExists({ pageId: 'page1' }, validSender, sendResponse);

      expect(context.mockServices.notionService.checkPageExists).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, exists: true })
      );
    });

    test.each([
      {
        action: 'checkNotionPageExists',
        blockedService: ['notionService', 'checkPageExists'],
      },
      {
        action: 'openNotionPage',
        blockedService: ['storageService', 'getSavedPageData'],
      },
    ])('$action 缺少必要參數時應返回錯誤', async ({ action, blockedService }) => {
      const sendResponse = jest.fn();

      await context.handlers[action]({}, validSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.any(String),
        })
      );
      expect(context.mockServices[blockedService[0]][blockedService[1]]).not.toHaveBeenCalled();
    });

    test('openNotionPage: 應該成功打開已保存的 Notion 頁面', async () => {
      const sendResponse = jest.fn();
      context.mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page-123',
        notionUrl: 'https://notion.so/page-123',
      });
      // Mock chrome.tabs.create callback
      chrome.tabs.create.mockImplementation((opts, callback) => {
        // Support callback style
        if (callback) {
          callback({ id: 99 });
        }
        // Support Promise style
        return Promise.resolve({ id: 99 });
      });

      await context.handlers.openNotionPage(
        { url: 'https://example.com' },
        validSender,
        sendResponse
      );

      expect(chrome.tabs.create).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://notion.so/page-123' })
      );
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('openNotionPage: 缺少 notionUrl 時應生成 URL，若非法則拒絕打開', async () => {
      const sendResponse = jest.fn();
      context.mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'abcd-1234',
        notionUrl: null,
      });

      isValidNotionUrl.mockReturnValueOnce(false);

      await context.handlers.openNotionPage(
        { url: 'https://example.com' },
        validSender,
        sendResponse
      );

      expect(isValidNotionUrl).toHaveBeenCalledWith('https://www.notion.so/abcd1234');
      expect(chrome.tabs.create).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.any(String),
        })
      );
    });

    test('openNotionPage: 打開分頁失敗時應返回錯誤', async () => {
      const sendResponse = jest.fn();
      context.mockServices.storageService.getSavedPageData.mockResolvedValue({
        notionPageId: 'page-123',
        notionUrl: 'https://notion.so/page-123',
      });
      chrome.tabs.create.mockRejectedValue(new Error('Create tab failed'));
      isValidNotionUrl.mockReturnValueOnce(true);

      await context.handlers.openNotionPage(
        { url: 'https://example.com' },
        validSender,
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.any(String),
        })
      );
    });

    test('openNotionPage: stable URL 查無資料時 fallback original URL', async () => {
      const sendResponse = jest.fn();
      context.mockServices.tabService.resolveTabUrl.mockResolvedValue({
        stableUrl: 'https://example.com/stable',
        originalUrl: 'https://example.com/original',
        migrated: false,
      });

      context.mockServices.storageService.getSavedPageData
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          notionPageId: 'page-123',
          notionUrl: 'https://notion.so/page-123',
        });

      chrome.tabs.create.mockResolvedValue({ id: 99 });

      await context.handlers.openNotionPage(
        { url: 'https://example.com/stable' },
        validSender,
        sendResponse
      );

      expect(context.mockServices.storageService.getSavedPageData).toHaveBeenCalledTimes(2);
      expect(context.mockServices.storageService.getSavedPageData).toHaveBeenNthCalledWith(
        1,
        'https://example.com/stable'
      );
      expect(context.mockServices.storageService.getSavedPageData).toHaveBeenNthCalledWith(
        2,
        'https://example.com/original'
      );
      expect(chrome.tabs.create).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://notion.so/page-123' })
      );
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test.each([
      {
        action: 'SAVE_PAGE_FROM_TOOLBAR',
        errMessage: 'Toolbar failed',
      },
      {
        action: 'SAVE_PAGE_FROM_RAIL',
        errMessage: 'Rail failed',
      },
    ])('$action: 內部錯誤時應返回錯誤', async ({ action, errMessage }) => {
      const sendResponse = jest.fn();

      context.mockServices.pageContentService.extractContent.mockRejectedValue(
        new Error(errMessage)
      );

      await context.handlers[action]({}, validContentScriptSender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.any(String),
        })
      );
    });

    test('SAVE_PAGE_FROM_TOOLBAR: 不應讀取 request.profileId 覆寫保存目標', async () => {
      const sendResponse = jest.fn();
      const toolbarSender = {
        ...validContentScriptSender,
        tab: { id: 1, url: 'https://example.com' },
      };
      context.mockServices.storageService.getSavedPageData.mockResolvedValue(null);
      context.mockServices.notionService.createPage.mockResolvedValue({
        success: true,
        pageId: 'new-page-id',
        url: 'https://notion.so/new-page',
      });

      await context.handlers.SAVE_PAGE_FROM_TOOLBAR(
        { profileId: 'malicious-profile' },
        toolbarSender,
        sendResponse
      );

      expect(
        context.mockServices.destinationProfileResolver.resolveProfileForSave
      ).toHaveBeenCalledWith(undefined);
      expect(context.mockServices.storageService.setSavedPageData).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({ destinationProfileId: 'default' })
      );
    });

    // ===== devLogSink Tests (Positive) =====
    test('devLogSink: 應接受來自合法 content script 的請求並記錄日誌', () => {
      const sendResponse = jest.fn();
      const logData = { level: 'info', message: 'Test message from content script' };

      context.handlers.devLogSink(logData, validContentScriptSender, sendResponse);

      expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('[ClientLog] Test message'));
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('devLogSink Log Level Validation', () => {
    const validSender = {
      id: 'mock-extension-id',
      tab: { id: 1 },
      url: 'https://example.com',
    };

    test('should use correct log level when valid', () => {
      const levels = ['log', 'info', 'warn', 'error', 'debug'];
      levels.forEach(level => {
        context.handlers.devLogSink({ level, message: 'test' }, validSender, jest.fn());
        expect(Logger.addLogToBuffer).toHaveBeenCalledWith(
          expect.objectContaining({
            context: expect.objectContaining({
              action: 'devLogSink',
              result: 'success',
            }),
            message: '[ClientLog] test',
            level,
          })
        );
      });
    });

    it.each([
      ['invalid level', 'invalid'],
      ['non-function property access', 'addLogToBuffer'],
      ['prototype property access', 'constructor'],
    ])('should fallback to log for %s', (_caseName, level) => {
      context.handlers.devLogSink({ level, message: 'test' }, validSender, jest.fn());

      expect(Logger.addLogToBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            action: 'devLogSink',
            result: 'success',
          }),
          message: '[ClientLog] test',
          level: 'log',
        })
      );
    });
  });

  describe('devLogSink', () => {
    const sender = {
      id: 'mock-extension-id',
      tab: { id: 1 },
      origin: 'chrome-extension://mock-extension-id',
    };

    it.each([
      {
        desc: '應該處理單一字串訊息',
        args: [],
        expectedContext: undefined,
        checkResponse: true,
      },
      {
        desc: '應該處理帶有物件參數的訊息',
        args: [{ key: 'value' }],
        expectedContext: { key: 'value' },
      },
      {
        desc: '應該處理多個參數',
        args: [{ key: 'value' }, 'more data'],
        expectedContext: { key: 'value', details: ['more data'] },
      },
      {
        desc: '應該處理第一個參數非物件的情況',
        args: ['data1', 'data2'],
        expectedContext: { details: ['data1', 'data2'] },
      },
    ])('$desc', async ({ args, expectedContext, checkResponse }) => {
      const sendResponse = jest.fn();
      await context.handlers.devLogSink(
        { message: 'hello', level: 'info', args },
        sender,
        sendResponse
      );

      const expectedObject = {
        message: '[ClientLog] hello',
        level: 'info',
      };
      if (expectedContext !== undefined) {
        expectedObject.context = expect.objectContaining(expectedContext);
      }

      expect(globalThis.Logger.addLogToBuffer).toHaveBeenCalledWith(
        expect.objectContaining(expectedObject)
      );

      if (checkResponse) {
        expect(sendResponse).toHaveBeenCalledWith({ success: true });
      }
    });

    it('應該處理異常情況', async () => {
      const sendResponse = jest.fn();
      // 故意使 Logger 噴錯
      globalThis.Logger.addLogToBuffer.mockImplementationOnce(() => {
        throw new Error('Buffer fail');
      });

      await context.handlers.devLogSink(
        { message: 'hello', level: 'info', args: [] },
        sender,
        sendResponse
      );

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[ClientLog] dev_log_sink:'),
        expect.anything()
      );
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });
  });
});
