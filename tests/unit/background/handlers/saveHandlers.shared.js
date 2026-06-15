/**
 * @jest-environment jsdom
 */

import { createSaveHandlers } from '../../../../scripts/background/handlers/saveHandlers.js';
import * as notionAuth from '../../../../scripts/utils/notionAuth.js';
import { createSaveHandlersHarness } from '../../../helpers/saveHandlersTestHarness.js';

export const { ensureNotionApiKey, getActiveNotionToken } = notionAuth;

jest.mock('../../../../scripts/background/services/InjectionService.js', () => ({
  isRestrictedInjectionUrl: jest.fn(),
}));

jest.mock('../../../../scripts/utils/securityUtils.js', () => {
  const original = jest.requireActual('../../../../scripts/utils/securityUtils.js');
  return {
    __esModule: true,
    ...original,
    validateInternalRequest: jest.fn(original.validateInternalRequest),
    isValidNotionUrl: jest.fn(original.isValidNotionUrl),
  };
});

jest.mock('../../../../scripts/utils/urlUtils.js', () => ({
  __esModule: true,
  normalizeUrl: jest.fn(url => url),
  resolveStorageUrl: jest.fn(url => url),
}));

jest.mock('../../../../scripts/utils/notionAuth.js', () => ({
  getActiveNotionToken: jest.fn(),
  ensureNotionApiKey: jest.fn(),
}));

jest.mock('../../../../scripts/utils/ErrorHandler.js', () => ({
  __esModule: true,
  ErrorHandler: {
    formatUserMessage: jest.fn(
      jest.requireActual('../../../../scripts/utils/ErrorHandler.js').ErrorHandler.formatUserMessage
    ),
  },
}));

export function createSaveHandlersTestContext() {
  const context = {
    handlers: null,
    mockServices: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    notionAuth.getActiveNotionToken.mockResolvedValue({ token: 'valid-key', mode: 'manual' });
    notionAuth.ensureNotionApiKey.mockResolvedValue('valid-key');
    Object.assign(context, createSaveHandlersHarness());
  });

  return context;
}

export function setupDefaultActionMocks(mockServices) {
  chrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
  mockServices.storageService.getConfig.mockResolvedValue({
    notionApiKey: 'valid-key',
    notionDataSourceId: 'db-123',
  });
  mockServices.pageContentService.extractContent.mockResolvedValue({
    extractionStatus: 'success',
    title: 'Test Page',
    blocks: [],
  });
  mockServices.injectionService.collectHighlights.mockResolvedValue([]);
  mockServices.notionService.buildPageData.mockReturnValue({
    pageData: {},
    validBlocks: [],
  });
}

export function replaceSaveHandlers(context, services) {
  context.handlers = createSaveHandlers(services);
}

export { isRestrictedInjectionUrl } from '../../../../scripts/background/services/InjectionService.js';
export {
  isValidNotionUrl,
  validateInternalRequest,
} from '../../../../scripts/utils/securityUtils.js';
export { normalizeUrl, resolveStorageUrl } from '../../../../scripts/utils/urlUtils.js';
export const validSender = {
  id: 'mock-extension-id',
  origin: 'chrome-extension://mock-extension-id',
};

export const validContentScriptSender = {
  id: 'mock-extension-id',
  tab: { id: 1 },
  url: 'https://example.com',
};
