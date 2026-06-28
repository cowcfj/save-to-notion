/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

const SECURITY_ERROR_MESSAGES = {
  INTERNAL_ONLY: '拒絕訪問：此操作僅限擴充功能內部調用',
  CONTENT_SCRIPT_ONLY: '拒絕訪問：此操作僅限內容腳本調用',
  TAB_CONTEXT_REQUIRED: '拒絕訪問：此操作需要分頁上下文',
};

const mockInjectionService = {
  __esModule: true,
  isRestrictedInjectionUrl: jest.fn(),
};

function isExtensionSender(sender) {
  return sender?.id === chrome.runtime.id;
}

function isExtensionPageSender(sender) {
  return sender?.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`);
}

function validateInternalRequestDefault(sender) {
  if (!isExtensionSender(sender)) {
    return { success: false, error: SECURITY_ERROR_MESSAGES.INTERNAL_ONLY };
  }

  if (sender.tab && !isExtensionPageSender(sender)) {
    return { success: false, error: SECURITY_ERROR_MESSAGES.INTERNAL_ONLY };
  }

  return null;
}

function validateContentScriptRequestDefault(sender) {
  if (!isExtensionSender(sender)) {
    return { success: false, error: SECURITY_ERROR_MESSAGES.CONTENT_SCRIPT_ONLY };
  }

  if (!sender.tab?.id) {
    return { success: false, error: SECURITY_ERROR_MESSAGES.TAB_CONTEXT_REQUIRED };
  }

  return null;
}

function isValidNotionUrlDefault(url) {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === 'notion.so' || hostname === 'www.notion.so' || hostname.endsWith('.notion.so')
    );
  } catch {
    return false;
  }
}

const mockSecurityUtils = {
  __esModule: true,
  validateInternalRequest: jest.fn(validateInternalRequestDefault),
  validateContentScriptRequest: jest.fn(validateContentScriptRequestDefault),
  isValidNotionUrl: jest.fn(isValidNotionUrlDefault),
};

const mockUrlUtils = {
  __esModule: true,
  normalizeUrl: jest.fn(url => url),
  resolveStorageUrl: jest.fn(url => url),
};

const mockNotionAuth = {
  __esModule: true,
  getActiveNotionToken: jest.fn(),
  ensureNotionApiKey: jest.fn(),
};

if (process.env.NODE_OPTIONS?.includes('--experimental-vm-modules')) {
  jest.unstable_mockModule(
    '../../../../scripts/background/services/InjectionService.js',
    () => mockInjectionService
  );
  jest.unstable_mockModule('../../../../scripts/utils/securityUtils.js', () => mockSecurityUtils);
  jest.unstable_mockModule('../../../../scripts/utils/urlUtils.js', () => mockUrlUtils);
  jest.unstable_mockModule('../../../../scripts/utils/notionAuth.js', () => mockNotionAuth);
} else {
  jest.mock(
    '../../../../scripts/background/services/InjectionService.js',
    () => mockInjectionService
  );
  jest.mock('../../../../scripts/utils/securityUtils.js', () => mockSecurityUtils);
  jest.mock('../../../../scripts/utils/urlUtils.js', () => mockUrlUtils);
  jest.mock('../../../../scripts/utils/notionAuth.js', () => mockNotionAuth);
}

let createSaveHandlers;
let createSaveHandlersHarness;
let setCreateSaveHandlersFactory;
let sharedChromeMock;
export const ensureNotionApiKey = mockNotionAuth.ensureNotionApiKey;
export const getActiveNotionToken = mockNotionAuth.getActiveNotionToken;
export const isRestrictedInjectionUrl = mockInjectionService.isRestrictedInjectionUrl;
export const isValidNotionUrl = mockSecurityUtils.isValidNotionUrl;
export const normalizeUrl = mockUrlUtils.normalizeUrl;
export const resolveStorageUrl = mockUrlUtils.resolveStorageUrl;
export const validateInternalRequest = mockSecurityUtils.validateInternalRequest;

beforeAll(async () => {
  const chromeMockModule = await import('../../../mocks/chrome.js');
  sharedChromeMock = chromeMockModule.default ?? chromeMockModule;
  restoreChromeMock();
  restoreLoggerMock();
  ({ createSaveHandlers } =
    await import('../../../../scripts/background/handlers/saveHandlers.js'));
  ({ createSaveHandlersHarness, setCreateSaveHandlersFactory } =
    await import('./saveHandlersTestHarness.js'));
  setCreateSaveHandlersFactory(createSaveHandlers);
});

function restoreChromeMock() {
  globalThis.chrome = sharedChromeMock;

  if (globalThis.chrome?.runtime) {
    globalThis.chrome.runtime.lastError = undefined;
  }
}

function restoreLoggerMock() {
  globalThis.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  };
  globalThis.Logger = {
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn((message, ...args) => {
      console.error(`[ERROR] ${message}`, ...args);
    }),
    success: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
    addLogToBuffer: jest.fn(),
  };
}

export function createSaveHandlersTestContext() {
  const context = {
    handlers: null,
    mockServices: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    restoreChromeMock();
    restoreLoggerMock();
    getActiveNotionToken.mockResolvedValue({ token: 'valid-key', mode: 'manual' });
    ensureNotionApiKey.mockResolvedValue('valid-key');
    isRestrictedInjectionUrl.mockReturnValue(false);
    isValidNotionUrl.mockImplementation(isValidNotionUrlDefault);
    validateInternalRequest.mockImplementation(validateInternalRequestDefault);
    normalizeUrl.mockImplementation(url => url);
    resolveStorageUrl.mockImplementation(url => url);
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
export const validSender = {
  id: 'mock-extension-id',
  origin: 'chrome-extension://mock-extension-id',
};

export const validContentScriptSender = {
  id: 'mock-extension-id',
  tab: { id: 1 },
  url: 'https://example.com',
};
