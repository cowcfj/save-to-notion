/**
 * @jest-environment jsdom
 */

/* global chrome */

import { createHighlightHandlers } from '../../../../scripts/background/handlers/highlightHandlers.js';
import { isRestrictedInjectionUrl } from '../../../../scripts/background/services/InjectionService.js';
import {
  validateContentScriptRequest,
  validateInternalRequest,
} from '../../../../scripts/utils/securityUtils.js';

jest.mock('../../../../scripts/background/services/InjectionService.js', () => ({
  isRestrictedInjectionUrl: jest.fn(),
}));

jest.mock('../../../../scripts/utils/securityUtils.js', () => {
  const original = jest.requireActual('../../../../scripts/utils/securityUtils.js');
  return {
    ...original,
    validateContentScriptRequest: jest.fn(original.validateContentScriptRequest),
    validateInternalRequest: jest.fn(original.validateInternalRequest),
  };
});

// Mock ErrorHandler
jest.mock('../../../../scripts/utils/ErrorHandler.js', () => ({
  ErrorHandler: {
    formatUserMessage: jest.fn(msg => msg),
  },
}));

// Mock buildHighlightBlocks
jest.mock('../../../../scripts/background/utils/BlockBuilder.js', () => ({
  buildHighlightBlocks: jest.fn(() => []),
}));

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
  describe('Coverage Improvements', () => {
    beforeEach(() => {
      isRestrictedInjectionUrl.mockReturnValue(false);
    });

    it('USER_ACTIVATE_SHORTCUT should handle restricted URL', async () => {
      isRestrictedInjectionUrl.mockReturnValue(true);
      const sendResponse = jest.fn();
      const sender = { tab: { id: 1, url: 'chrome://extensions' } }; // Valid sender structure (missing id check passed by mock?)
      // We need valid sender for validateContentScriptRequest to pass or mock it.
      // validateContentScriptRequest checks sender.tab and (!sender.frameId || sender.frameId === 0) usually?
      // Let's force validateContentScriptRequest to return null (success)
      validateContentScriptRequest.mockReturnValue(null);

      await handlers.USER_ACTIVATE_SHORTCUT({}, sender, sendResponse);

      expect(isRestrictedInjectionUrl).toHaveBeenCalledWith('chrome://extensions');
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringMatching(/不支[持援]|restricted/i),
        })
      );
    });

    it('USER_ACTIVATE_SHORTCUT should handle missing tab context', async () => {
      validateContentScriptRequest.mockReturnValue(null);
      const sendResponse = jest.fn();
      const sender = { tab: null };

      await handlers.USER_ACTIVATE_SHORTCUT({}, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'No tab context' })
      );
    });

    it('USER_ACTIVATE_SHORTCUT should handle Bundle injection failure', async () => {
      validateContentScriptRequest.mockReturnValue(null);
      const sendResponse = jest.fn();
      const sender = { tab: { id: 1, url: 'https://example.com' } };

      mockServices.injectionService.ensureBundleInjected.mockRejectedValue(
        new Error('Bundle error')
      );

      await handlers.USER_ACTIVATE_SHORTCUT({}, sender, sendResponse);

      expect(Logger.error).toHaveBeenCalledWith('Bundle 注入失敗', expect.anything());
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('USER_ACTIVATE_SHORTCUT should handle Bundle init timeout', async () => {
      validateContentScriptRequest.mockReturnValue(null);
      const sendResponse = jest.fn();
      const sender = { tab: { id: 1, url: 'https://example.com' } };

      mockServices.injectionService.ensureBundleInjected.mockResolvedValue();

      // Mock chrome.tabs.sendMessage for PING to verify bundle ready.
      // logic: ensureBundleReady calls ping.
      // We need to simulate ping failing or returning not ready status multiple times.
      // Or we can mock ensureBundleReady internal helper? No, it's not exported.
      // We must rely on chrome.tabs.sendMessage behavior.
      // default retries is 3, delay is small? constant HANDLER_CONSTANTS.

      // Mock sendMessage implementation for PING
      chrome.tabs.sendMessage.mockImplementation((tabId, msg, cb) => {
        if (msg.action === 'PING') {
          cb({ status: 'not_ready' });
        }
      });

      // Need to fast-forward timers? ensureBundleReady uses setTimeout.
      jest.useFakeTimers();
      const promise = handlers.USER_ACTIVATE_SHORTCUT({}, sender, sendResponse);

      // Advance verify loop
      // Max retries is from HANDLER_CONSTANTS.
      for (let i = 0; i < 50; i++) {
        await Promise.resolve();
        jest.advanceTimersByTime(500);
      }
      jest.useRealTimers();

      await promise;

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringMatching(/timeout|初始化超時/i) })
      );
    });

    it('startHighlight should handle restricted URL', async () => {
      validateInternalRequest.mockReturnValue(null);
      isRestrictedInjectionUrl.mockReturnValue(true);
      const sendResponse = jest.fn();
      const sender = { id: chrome.runtime.id };

      // Mock getActiveTab
      chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'chrome://settings' }]);

      await handlers.startHighlight({}, sender, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });
  });
});
