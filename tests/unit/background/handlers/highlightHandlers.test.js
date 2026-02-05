/**
 * @jest-environment jsdom
 */

/* global chrome */

import { createHighlightHandlers } from '../../../../scripts/background/handlers/highlightHandlers.js';

// Mock Logger
globalThis.Logger = {
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  start: jest.fn(),
  ready: jest.fn(),
};

// Mock chrome API
globalThis.chrome = {
  runtime: {
    id: 'test-extension-id',
    lastError: null,
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
  },
};

describe('highlightHandlers', () => {
  let handlers = null;
  let mockServices = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockServices = {
      notionService: {
        updateHighlightsSection: jest.fn(),
      },
      storageService: {
        getConfig: jest.fn(),
        getSavedPageData: jest.fn(),
        setSavedPageData: jest.fn(),
      },
      injectionService: {
        ensureBundleInjected: jest.fn(),
        injectHighlighter: jest.fn(),
        collectHighlights: jest.fn(),
      },
    };
    handlers = createHighlightHandlers(mockServices);
  });

  describe('Security Checks', () => {
    test('updateHighlights 應拒絕外部請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };
      await handlers.updateHighlights({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    test('syncHighlights 應拒絕非 Content Script 請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-extension-id', url: 'https://malicious.com' }; // missing tab
      await handlers.syncHighlights({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    test('USER_ACTIVATE_SHORTCUT 應拒絕非法請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'other-id' };
      await handlers.USER_ACTIVATE_SHORTCUT({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });

    test('startHighlight 應拒絕外部請求', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'wrong-id' };
      await handlers.startHighlight({}, sender, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('拒絕訪問') })
      );
    });
  });

  describe('Action Logic', () => {
    test('updateHighlights 應在內部請求時正常工作', async () => {
      const sendResponse = jest.fn();
      const sender = { id: 'test-extension-id' };

      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
      mockServices.storageService.getSavedPageData.mockResolvedValue({ notionPageId: 'page1' });
      mockServices.storageService.getConfig.mockResolvedValue({ notionApiKey: 'key1' });
      mockServices.injectionService.collectHighlights.mockResolvedValue([{ text: 'hi' }]);
      mockServices.notionService.updateHighlightsSection.mockResolvedValue({ success: true });

      await handlers.updateHighlights({}, sender, sendResponse);

      expect(mockServices.notionService.updateHighlightsSection).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });
});
