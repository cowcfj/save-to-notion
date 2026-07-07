import { jest } from '@jest/globals';

import {
  expectMessageBusResponseContract,
  getLastResponse,
} from './messageBusContractTestUtils.js';

let createHighlightHandlers;
let ERROR_MESSAGES;
let RUNTIME_ACTIONS;

const TEST_EXTENSION_ID = 'test-id';
const TEST_TAB_ID = 1;
const TEST_URL = 'https://example.com';
const TEST_NOTION_PAGE_ID = 'page1';

const SYNC_HIGHLIGHTS_CONTRACT_FIELDS = ['success', 'count', 'errorCode', 'error'];
const SYNC_HIGHLIGHTS_SUCCESS_FIELDS = ['success', 'count'];
const SYNC_HIGHLIGHTS_ERROR_FIELDS = ['success', 'errorCode', 'error'];
const UPDATE_HIGHLIGHTS_CONTRACT_FIELDS = [
  'success',
  'highlightsUpdated',
  'highlightCount',
  'error',
];
const UPDATE_HIGHLIGHTS_SUCCESS_FIELDS = ['success', 'highlightsUpdated', 'highlightCount'];
const UPDATE_HIGHLIGHTS_ERROR_FIELDS = ['success', 'error'];

const mockInjectionService = {
  __esModule: true,
  isRestrictedInjectionUrl: jest.fn(),
};

const mockSecurityUtils = {
  __esModule: true,
  validateContentScriptRequest: jest.fn(),
  validateInternalRequest: jest.fn(),
};

const mockApiErrorSanitizer = {
  __esModule: true,
  sanitizeApiError: jest.fn(),
};

const mockErrorHandler = {
  __esModule: true,
  ErrorHandler: {
    formatUserMessage: jest.fn(),
  },
};

const mockUrlUtils = {
  __esModule: true,
  normalizeUrl: jest.fn(url => url),
  computeStableUrl: jest.fn(url => url),
  resolveStorageUrl: jest.fn(url => url),
};

const mockNotionAuth = {
  __esModule: true,
  getActiveNotionToken: jest.fn(),
  ensureNotionApiKey: jest.fn(),
};

const mockLogSanitizer = {
  __esModule: true,
  sanitizeUrlForLogging: jest.fn(url => url),
};

if (process.env.NODE_OPTIONS?.includes('--experimental-vm-modules')) {
  jest.unstable_mockModule(
    '../../../../scripts/background/services/InjectionService.js',
    () => mockInjectionService
  );
  jest.unstable_mockModule('../../../../scripts/utils/securityUtils.js', () => mockSecurityUtils);
  jest.unstable_mockModule(
    '../../../../scripts/utils/ApiErrorSanitizer.js',
    () => mockApiErrorSanitizer
  );
  jest.unstable_mockModule('../../../../scripts/utils/ErrorHandler.js', () => mockErrorHandler);
  jest.unstable_mockModule('../../../../scripts/utils/urlUtils.js', () => mockUrlUtils);
  jest.unstable_mockModule('../../../../scripts/utils/notionAuth.js', () => mockNotionAuth);
  jest.unstable_mockModule('../../../../scripts/utils/LogSanitizer.js', () => mockLogSanitizer);
} else {
  jest.mock(
    '../../../../scripts/background/services/InjectionService.js',
    () => mockInjectionService
  );
  jest.mock('../../../../scripts/utils/securityUtils.js', () => mockSecurityUtils);
  jest.mock('../../../../scripts/utils/ApiErrorSanitizer.js', () => mockApiErrorSanitizer);
  jest.mock('../../../../scripts/utils/ErrorHandler.js', () => mockErrorHandler);
  jest.mock('../../../../scripts/utils/urlUtils.js', () => mockUrlUtils);
  jest.mock('../../../../scripts/utils/notionAuth.js', () => mockNotionAuth);
  jest.mock('../../../../scripts/utils/LogSanitizer.js', () => mockLogSanitizer);
}

beforeAll(async () => {
  ({ createHighlightHandlers } =
    await import('../../../../scripts/background/handlers/highlightHandlers.js'));
  ({ ERROR_MESSAGES } = await import('../../../../scripts/config/shared/messages.js'));
  ({ RUNTIME_ACTIONS } = await import('../../../../scripts/config/shared/runtimeActions.js'));
});

function createSender({
  id = TEST_EXTENSION_ID,
  tabId = TEST_TAB_ID,
  url = TEST_URL,
  tab = { id: tabId, url },
} = {}) {
  return { id, tab };
}

function resetHighlightContractMocks() {
  jest.resetAllMocks();
}

function configureDefaultHighlightContractMocks() {
  mockSecurityUtils.validateContentScriptRequest.mockReturnValue(null);
  mockSecurityUtils.validateInternalRequest.mockReturnValue(null);
  mockInjectionService.isRestrictedInjectionUrl.mockReturnValue(false);
  mockUrlUtils.normalizeUrl.mockImplementation(url => url);
  mockUrlUtils.resolveStorageUrl.mockImplementation(url => url);
  mockNotionAuth.ensureNotionApiKey.mockResolvedValue('key1');
  mockApiErrorSanitizer.sanitizeApiError.mockImplementation(err =>
    typeof err === 'string' ? err : err.message || 'unknown_error'
  );
  mockErrorHandler.ErrorHandler.formatUserMessage.mockImplementation(error => {
    const key = error?.message ?? error;
    return ERROR_MESSAGES.PATTERNS[key] ?? ERROR_MESSAGES.USER_MESSAGES[key] ?? key;
  });
  mockLogSanitizer.sanitizeUrlForLogging.mockImplementation(url => {
    try {
      return new URL(url).toString();
    } catch {
      return url;
    }
  });
}

function createHighlightContractMockServices() {
  return {
    notionService: {
      updateHighlightsSection: jest.fn(),
    },
    storageService: {
      getSavedPageData: jest.fn(),
      getConfig: jest.fn(),
      clearNotionStateWithRetry: jest.fn().mockResolvedValue({ cleared: true, attempts: 1 }),
    },
    tabService: {
      resolveTabUrl: jest.fn().mockImplementation((_tabId, url) =>
        Promise.resolve({
          stableUrl: url,
          originalUrl: url,
          migrated: false,
        })
      ),
      confirmRemotePageMissing: jest
        .fn()
        .mockReturnValue({ shouldDelete: false, deletionPending: true }),
      resetRemotePageMissingState: jest
        .fn()
        .mockReturnValue({ shouldDelete: false, deletionPending: false }),
    },
    migrationService: {
      migrateStorageKey: jest.fn().mockResolvedValue(false),
    },
    injectionService: {
      collectHighlights: jest.fn().mockResolvedValue([{ text: 'hi' }]),
    },
  };
}

function installHighlightContractChromeMock() {
  globalThis.chrome = {
    runtime: { id: TEST_EXTENSION_ID, lastError: null },
    tabs: {
      query: jest.fn().mockResolvedValue([{ id: TEST_TAB_ID, url: TEST_URL }]),
      sendMessage: jest.fn(),
    },
  };
}

function installHighlightContractLoggerMock() {
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
}

function expectHighlightResponseContract(actionName, declaredFields, response, actualFields) {
  expectMessageBusResponseContract({
    group: 'highlight',
    actionName,
    declaredFields,
    response,
    actualFields,
  });
}

function expectSyncHighlightsContract(response, actualFields) {
  expectHighlightResponseContract(
    'syncHighlights',
    SYNC_HIGHLIGHTS_CONTRACT_FIELDS,
    response,
    actualFields
  );
}

function expectUpdateHighlightsContract(response, actualFields) {
  expectHighlightResponseContract(
    'updateHighlights',
    UPDATE_HIGHLIGHTS_CONTRACT_FIELDS,
    response,
    actualFields
  );
}

describe('highlightHandlers message_bus.json response contracts', () => {
  let handlers;
  let mockServices;

  beforeEach(() => {
    resetHighlightContractMocks();
    configureDefaultHighlightContractMocks();
    mockServices = createHighlightContractMockServices();
    installHighlightContractChromeMock();
    installHighlightContractLoggerMock();
    handlers = createHighlightHandlers(mockServices);
  });

  afterEach(() => {
    delete globalThis.chrome;
    delete globalThis.Logger;
  });

  function mockSavedPageData(notionPageId = TEST_NOTION_PAGE_ID) {
    mockServices.storageService.getSavedPageData.mockResolvedValue({ notionPageId });
  }

  function mockHighlightSectionResult(result) {
    mockServices.notionService.updateHighlightsSection.mockResolvedValue(result);
  }

  async function executeSyncHighlights({
    request = { highlights: [{ text: 'test' }] },
    sender = createSender(),
  } = {}) {
    const sendResponse = jest.fn();
    await handlers.syncHighlights(request, sender, sendResponse);
    return sendResponse;
  }

  async function executeUpdateHighlights() {
    const sendResponse = jest.fn();
    await handlers[RUNTIME_ACTIONS.UPDATE_REMOTE_HIGHLIGHTS](
      {},
      { id: TEST_EXTENSION_ID },
      sendResponse
    );
    return sendResponse;
  }

  test('syncHighlights success response matches contract fields', async () => {
    mockSavedPageData();
    mockHighlightSectionResult({ success: true });

    const sendResponse = await executeSyncHighlights();
    const response = getLastResponse(sendResponse);

    expectSyncHighlightsContract(response, SYNC_HIGHLIGHTS_SUCCESS_FIELDS);
    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        count: 1,
      })
    );
  });

  test('syncHighlights PAGE_DELETION_PENDING keeps public error contract', async () => {
    mockSavedPageData();
    mockHighlightSectionResult({
      success: false,
      error: 'OBJECT_NOT_FOUND',
      details: { phase: 'fetch_blocks' },
    });

    const sendResponse = await executeSyncHighlights();
    const response = getLastResponse(sendResponse);

    expectSyncHighlightsContract(response, SYNC_HIGHLIGHTS_ERROR_FIELDS);
    expect(response).toEqual(
      expect.objectContaining({
        success: false,
        errorCode: 'PAGE_DELETION_PENDING',
        error: expect.any(String),
      })
    );
    expect(response).not.toHaveProperty('details');
  });

  test('syncHighlights PAGE_DELETED keeps public error contract', async () => {
    mockSavedPageData();
    mockServices.tabService.confirmRemotePageMissing.mockReturnValue({
      shouldDelete: true,
      deletionPending: false,
    });
    mockHighlightSectionResult({
      success: false,
      error: 'OBJECT_NOT_FOUND',
      details: { phase: 'fetch_blocks' },
    });

    const sendResponse = await executeSyncHighlights();
    const response = getLastResponse(sendResponse);

    expectSyncHighlightsContract(response, SYNC_HIGHLIGHTS_ERROR_FIELDS);
    expect(response).toEqual(
      expect.objectContaining({
        success: false,
        errorCode: 'PAGE_DELETED',
        error: expect.any(String),
      })
    );
    expect(response).not.toHaveProperty('details');
  });

  test('updateHighlights success response matches remote update contract fields', async () => {
    mockSavedPageData();
    mockHighlightSectionResult({ success: true });

    const sendResponse = await executeUpdateHighlights();
    const response = getLastResponse(sendResponse);

    expectUpdateHighlightsContract(response, UPDATE_HIGHLIGHTS_SUCCESS_FIELDS);
    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        highlightsUpdated: true,
        highlightCount: 1,
      })
    );
  });

  test('updateHighlights missing saved page keeps error envelope contract', async () => {
    mockServices.storageService.getSavedPageData.mockResolvedValue(null);

    const sendResponse = await executeUpdateHighlights();
    const response = getLastResponse(sendResponse);

    expectUpdateHighlightsContract(response, UPDATE_HIGHLIGHTS_ERROR_FIELDS);
    expect(response).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.any(String),
      })
    );
  });
});
