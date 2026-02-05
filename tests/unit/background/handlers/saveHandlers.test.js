/**
 * @jest-environment jsdom
 */

import { createSaveHandlers } from '../../../../scripts/background/handlers/saveHandlers.js';

// Mock Logger
globalThis.Logger = {
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  success: jest.fn(),
  start: jest.fn(),
  ready: jest.fn(),
};

// Mock chrome API
globalThis.chrome = {
  runtime: {
    id: 'test-extension-id',
  },
  tabs: {
    query: jest.fn(),
    create: jest.fn(),
  },
  action: {
    setBadgeText: jest.fn(),
  },
};

describe('saveHandlers', () => {
  let handlers = null;
  let mockServices = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockServices = {
      notionService: {
        checkPageExists: jest.fn(),
        createPage: jest.fn(),
        buildPageData: jest.fn(),
      },
      storageService: {
        getConfig: jest.fn(),
        getSavedPageData: jest.fn(),
        setSavedPageData: jest.fn(),
        clearPageState: jest.fn(),
      },
      injectionService: {
        injectHighlighter: jest.fn(),
        collectHighlights: jest.fn(),
        inject: jest.fn(),
      },
      pageContentService: {
        extractContent: jest.fn(),
      },
    };
    handlers = createSaveHandlers(mockServices);
  });

  describe('Security Checks', () => {
    test('savePage 應拒絕外部請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };
      await handlers.savePage({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    test('openNotionPage 應拒絕外部請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };
      await handlers.openNotionPage({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    test('checkNotionPageExists 應拒絕外部請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };
      await handlers.checkNotionPageExists({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    test('checkPageStatus 應拒絕外部請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };
      await handlers.checkPageStatus({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    test('devLogSink 應拒絕非 Content Script 請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-extension-id', url: 'https://evil.com' };
      handlers.devLogSink({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });
  });

  describe('Action Logic', () => {
    test('checkNotionPageExists 應在合法請求時調用 service', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-extension-id' };
      mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'key1' });
      mockServices.notionService.checkPageExists.mockResolvedValue(true);

      await handlers.checkNotionPageExists({ pageId: 'page1' }, sender, sendResponse);

      expect(mockServices.notionService.checkPageExists).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, exists: true })
      );
    });
  });
});
