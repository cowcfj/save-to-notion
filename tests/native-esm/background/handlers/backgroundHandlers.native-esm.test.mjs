import { describe, expect, jest, test } from '@jest/globals';

class MockAppError extends Error {
  toResponse() {
    return {
      success: false,
      error: this.message,
      errorType: 'MOCK_APP_ERROR',
      errorCode: 'MOCK_APP_ERROR',
    };
  }
}

const loggerMock = {
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

const validateInternalRequestMock = jest.fn(() => null);
const validateContentScriptRequestMock = jest.fn(() => null);
const getActiveNotionTokenMock = jest.fn(async () => ({ token: 'oauth-token' }));
const mergeHighlightsWithStyleMock = jest.fn((blocks, _highlights, style) => [
  ...blocks,
  { type: 'merged-style', style },
]);
const buildHighlightBlocksMock = jest.fn(highlights =>
  highlights.map(highlight => ({ type: 'highlight', text: highlight.text }))
);

await jest.unstable_mockModule('../../../../scripts/utils/ErrorHandler.js', () => ({
  AppError: MockAppError,
  ErrorHandler: {
    formatUserMessage: jest.fn(error => error?.message || String(error || 'Unknown error')),
  },
  ErrorTypes: {
    INTERNAL: 'internal',
  },
}));

await jest.unstable_mockModule('../../../../scripts/utils/securityUtils.js', () => ({
  isValidNotionUrl: jest.fn(() => true),
  validateContentScriptRequest: validateContentScriptRequestMock,
  validateInternalRequest: validateInternalRequestMock,
}));

await jest.unstable_mockModule('../../../../scripts/utils/ApiErrorSanitizer.js', () => ({
  sanitizeApiError: jest.fn(error => error?.message || error || 'UNKNOWN_ERROR'),
}));

await jest.unstable_mockModule('../../../../scripts/utils/LogSanitizer.js', () => ({
  sanitizeUrlForLogging: jest.fn(url => url),
}));

await jest.unstable_mockModule('../../../../scripts/utils/Logger.js', () => ({
  default: loggerMock,
  parseArgsToContext: jest.fn(() => ({ action: 'native-esm' })),
}));

await jest.unstable_mockModule('../../../../scripts/utils/notionAuth.js', () => ({
  ensureNotionApiKey: jest.fn(async token => token || 'manual-token'),
  getActiveNotionToken: getActiveNotionTokenMock,
  refreshOAuthToken: jest.fn(async () => 'refreshed-token'),
}));

await jest.unstable_mockModule('../../../../scripts/background/utils/BlockBuilder.js', () => ({
  buildHighlightBlocks: buildHighlightBlocksMock,
}));

await jest.unstable_mockModule(
  '../../../../scripts/background/utils/highlightStyleMerger.js',
  () => ({
    HIGHLIGHT_STYLE_OPTIONS: {
      COLOR_SYNC: 'COLOR_SYNC',
      BOLD: 'BOLD',
    },
    mergeHighlightsWithStyle: mergeHighlightsWithStyleMock,
  })
);

await jest.unstable_mockModule(
  '../../../../scripts/background/services/InjectionService.js',
  () => ({
    isRestrictedInjectionUrl: jest.fn(() => false),
  })
);

await jest.unstable_mockModule(
  '../../../../scripts/background/services/SaveStatusCoordinator.js',
  () => ({
    resolveSaveStatus: jest.fn(() => ({ success: true, isSaved: false })),
  })
);

await jest.unstable_mockModule('../../../../scripts/destinations/ProfileStore.js', () => ({
  AccountGatedDestinationEntitlementProvider: jest.fn(),
  DEFAULT_PROFILE_ID: 'default',
  LocalDestinationProfileRepository: jest.fn(),
}));

await jest.unstable_mockModule('../../../../scripts/destinations/ProfileResolver.js', () => ({
  ProfileResolver: jest.fn().mockImplementation(() => ({
    resolve: jest.fn(async () => ({ id: 'default' })),
  })),
}));

await jest.unstable_mockModule('../../../../scripts/background/handlers/handlerUtils.js', () => ({
  getActiveTab: jest.fn(async () => ({ id: 7, url: 'https://example.com/article' })),
}));

await jest.unstable_mockModule('../../../../scripts/background/handlers/toastUtils.js', () => ({
  classifyErrorForToast: jest.fn(() => null),
  sendToastToTab: jest.fn(),
}));

const { RUNTIME_ACTIONS } = await import('../../../../scripts/config/shared/runtimeActions.js');
const { MessageHandler } =
  await import('../../../../scripts/background/handlers/MessageHandler.js');
const { processContentResult } =
  await import('../../../../scripts/background/handlers/saveHandlers.js');
const { createNotionHandlers } =
  await import('../../../../scripts/background/handlers/notionHandlers.js');

describe('background handlers native ESM diagnostics', () => {
  test('MessageHandler dispatches async results and rejects unknown actions', async () => {
    const sendResponse = jest.fn();
    const handler = new MessageHandler({
      logger: loggerMock,
      handlers: {
        PING: jest.fn(async () => ({ success: true, value: 'pong' })),
      },
    });

    expect(handler.getRegisteredActions()).toEqual(['PING']);
    expect(handler.handle({ action: 'PING' }, {}, sendResponse)).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(sendResponse).toHaveBeenCalledWith({ success: true, value: 'pong' });

    const unknownResponse = jest.fn();
    expect(handler.handle({ action: 'UNKNOWN' }, {}, unknownResponse)).toBe(false);
    expect(unknownResponse).toHaveBeenCalledWith({
      success: false,
      error: '未知動作：UNKNOWN',
    });
  });

  test('saveHandlers processContentResult merges source blocks and highlight blocks', () => {
    const rawResult = {
      title: 'Native ESM page',
      siteIcon: 'https://example.com/favicon.ico',
      blocks: [{ type: 'paragraph', text: 'body' }],
    };
    const highlights = [{ text: 'important' }];

    const result = processContentResult(rawResult, highlights, 'BOLD');

    expect(mergeHighlightsWithStyleMock).toHaveBeenCalledWith(
      [{ type: 'paragraph', text: 'body' }],
      highlights,
      'BOLD'
    );
    expect(buildHighlightBlocksMock).toHaveBeenCalledWith(highlights);
    expect(result).toEqual({
      title: 'Native ESM page',
      blocks: [
        { type: 'paragraph', text: 'body' },
        { type: 'merged-style', style: 'BOLD' },
        { type: 'highlight', text: 'important' },
      ],
      siteIcon: 'https://example.com/favicon.ico',
      coverImage: null,
      highlightContentStyle: 'BOLD',
    });
  });

  test('notionHandlers search uses active OAuth token when request omits apiKey', async () => {
    const notionService = {
      search: jest.fn(async () => [{ id: 'page-1' }]),
    };
    const handlers = createNotionHandlers({ notionService });
    const sendResponse = jest.fn();

    await handlers[RUNTIME_ACTIONS.SEARCH_NOTION](
      { searchParams: { query: 'Roadmap' } },
      { id: 'options-page' },
      sendResponse
    );

    expect(validateInternalRequestMock).toHaveBeenCalledWith({ id: 'options-page' });
    expect(getActiveNotionTokenMock).toHaveBeenCalled();
    expect(notionService.search).toHaveBeenCalledWith(
      { query: 'Roadmap' },
      { apiKey: 'oauth-token' }
    );
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: [{ id: 'page-1' }],
    });
  });
});
