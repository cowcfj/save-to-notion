import { createSaveHandlers } from '../../../scripts/background/handlers/saveHandlers.js';

// Mocks
const mockNotionService = {
  createPage: jest.fn(),
  checkPageExists: jest.fn(),
  updateHighlightsSection: jest.fn(),
  refreshPageContent: jest.fn(),
  buildPageData: jest.fn().mockReturnValue({ pageData: {}, validBlocks: [] }),
};

const mockStorageService = {
  getConfig: jest.fn(),
  setSavedPageData: jest.fn(),
  getSavedPageData: jest.fn(),
  clearPageState: jest.fn(),
};

const mockInjectionService = {
  injectHighlighter: jest.fn(),
  collectHighlights: jest.fn().mockResolvedValue([]),
  inject: jest.fn(),
};

const mockPageContentService = {
  extractContent: jest.fn().mockResolvedValue({ title: 'Test Page', blocks: [] }),
};

// Security Utils Mock
jest.mock('../../../scripts/utils/securityUtils.js', () => ({
  validateInternalRequest: jest.fn(),
  validateContentScriptRequest: jest.fn(),
  isValidNotionUrl: jest.fn().mockReturnValue(true),
  sanitizeApiError: jest.fn(err => err),
  sanitizeUrlForLogging: jest.fn(url => url),
  normalizeUrl: jest.fn(url => url),
}));

import { validateInternalRequest } from '../../../scripts/utils/securityUtils.js';

describe('saveHandlers Security Verification', () => {
  let handlers;

  beforeEach(() => {
    handlers = createSaveHandlers({
      notionService: mockNotionService,
      storageService: mockStorageService,
      injectionService: mockInjectionService,
      pageContentService: mockPageContentService,
    });

    jest.clearAllMocks();

    // Default trusted internal request
    validateInternalRequest.mockReturnValue(null);
  });

  describe('savePage', () => {
    it('should reject requests that fail internal validation', async () => {
      // Setup validation failure
      const mockError = { success: false, error: 'Unauthorized' };
      validateInternalRequest.mockReturnValue(mockError);

      const sendResponse = jest.fn();
      const sender = { id: 'untrusted-sender' };
      const request = { action: 'savePage' };

      await handlers.savePage(request, sender, sendResponse);

      expect(validateInternalRequest).toHaveBeenCalledWith(sender);
      expect(sendResponse).toHaveBeenCalledWith(mockError);
      expect(mockNotionService.createPage).not.toHaveBeenCalled();
    });

    it('should use API Key from Storage, NOT from request params', async () => {
      // Trusted request
      validateInternalRequest.mockReturnValue(null);

      // Setup Storage to return a specific trusted key
      mockStorageService.getConfig.mockResolvedValue({
        notionApiKey: 'TRUSTED_STORAGE_KEY',
        notionDataSourceId: 'test-db',
      });

      // Setup Page Data to trigger a create
      mockStorageService.getSavedPageData.mockResolvedValue(null); // New page
      mockNotionService.createPage.mockResolvedValue({ success: true, pageId: 'new-page' });

      // Request attempts to inject a malicious key
      const request = {
        action: 'savePage',
        apiKey: 'MALICIOUS_INJECTED_KEY',
      };
      const sender = { id: 'trusted-extension-id' };
      const sendResponse = jest.fn();

      // Mock active tab logic (omitted for brevity, assume getActiveTab handled or mocked globally if needed)
      // Since getActiveTab is local inner function using chrome.tabs.query, we need to mock global chrome
      globalThis.chrome = {
        tabs: {
          query: jest.fn().mockResolvedValue([{ id: 123, url: 'https://example.com' }]),
          sendMessage: jest.fn(),
        },
        runtime: {
          id: 'trusted-extension-id',
          lastError: null,
        },
      };

      await handlers.savePage(request, sender, sendResponse);

      // Verify createPage was called with TRUSTED_STORAGE_KEY
      expect(mockNotionService.createPage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          apiKey: 'TRUSTED_STORAGE_KEY',
        })
      );

      // Verify it was NOT called with malicious key
      const callArgs = mockNotionService.createPage.mock.calls[0][1];
      expect(callArgs.apiKey).not.toBe('MALICIOUS_INJECTED_KEY');
    });
  });
});
