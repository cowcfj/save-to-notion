/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

import {
  expectMessageBusResponseContract,
  getLastResponse,
} from './messageBusContractTestUtils.js';

const SEARCH_NOTION_CONTRACT_FIELDS = ['success', 'data', 'error'];
const REFRESH_OAUTH_TOKEN_CONTRACT_FIELDS = ['success', 'token', 'error'];
const SEARCH_NOTION_SUCCESS_FIELDS = ['success', 'data'];
const SEARCH_NOTION_ERROR_FIELDS = ['success', 'error'];
const REFRESH_OAUTH_TOKEN_FIELDS = ['success', 'token'];

const mockNotionAuth = {
  refreshOAuthToken: jest.fn(),
  getActiveNotionToken: jest.fn(),
};

if (process.env.NODE_OPTIONS?.includes('--experimental-vm-modules')) {
  jest.unstable_mockModule('../../../../scripts/utils/notionAuth.js', () => mockNotionAuth);
} else {
  jest.mock('../../../../scripts/utils/notionAuth.js', () => mockNotionAuth);
}

let createNotionHandlers;
let refreshOAuthToken;
let getActiveNotionToken;

beforeAll(async () => {
  ({ createNotionHandlers } =
    await import('../../../../scripts/background/handlers/notionHandlers.js'));
  ({ refreshOAuthToken, getActiveNotionToken } =
    await import('../../../../scripts/utils/notionAuth.js'));
});

function expectAuthResponseContract(actionName, declaredFields, response, actualFields) {
  expectMessageBusResponseContract({
    group: 'auth',
    actionName,
    declaredFields,
    response,
    actualFields,
  });
}

function expectSearchNotionContract(response, actualFields) {
  expectAuthResponseContract('searchNotion', SEARCH_NOTION_CONTRACT_FIELDS, response, actualFields);
}

function expectRefreshOAuthTokenContract(response) {
  expectAuthResponseContract(
    'refreshOAuthToken',
    REFRESH_OAUTH_TOKEN_CONTRACT_FIELDS,
    response,
    REFRESH_OAUTH_TOKEN_FIELDS
  );
}

function expectRefreshOAuthTokenResponse(response, { success, token }) {
  expect(response).toEqual({
    success,
    token,
  });
}

describe('notionHandlers message_bus.json response contracts', () => {
  let handlers;
  let mockNotionService;
  const refreshOAuthTokenCases = [
    {
      name: 'refreshOAuthToken success response matches contract fields',
      refreshResult: 'oauth_token_refreshed',
      expectedResponse: {
        success: true,
        token: 'oauth_token_refreshed',
      },
    },
    {
      name: 'refreshOAuthToken failure response keeps null token contract',
      refreshResult: null,
      expectedResponse: {
        success: false,
        token: null,
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.chrome = {
      runtime: {
        id: 'mock-extension-id',
      },
    };
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
    mockNotionService = {
      search: jest.fn(),
    };
    handlers = createNotionHandlers({ notionService: mockNotionService });
  });

  afterEach(() => {
    delete globalThis.chrome;
    delete globalThis.Logger;
  });

  test('searchNotion success response matches contract fields', async () => {
    const sender = { id: 'mock-extension-id' };
    const sendResponse = jest.fn();
    const mockResult = { results: [] };
    mockNotionService.search.mockResolvedValue(mockResult);

    await handlers.searchNotion({ query: 'test', apiKey: 'secret' }, sender, sendResponse);

    const response = getLastResponse(sendResponse);
    expectSearchNotionContract(response, SEARCH_NOTION_SUCCESS_FIELDS);
    expect(response).toEqual({
      success: true,
      data: mockResult,
    });
  });

  test('searchNotion missing active token keeps error envelope contract', async () => {
    const sender = { id: 'mock-extension-id' };
    const sendResponse = jest.fn();
    getActiveNotionToken.mockResolvedValueOnce({ token: null, mode: null });

    await handlers.searchNotion(
      { searchParams: { filter: { property: 'object', value: 'database' } } },
      sender,
      sendResponse
    );

    const response = getLastResponse(sendResponse);
    expectSearchNotionContract(response, SEARCH_NOTION_ERROR_FIELDS);
    expect(response).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.any(String),
      })
    );
    expect(mockNotionService.search).not.toHaveBeenCalled();
  });

  test('searchNotion invalid sender returns error envelope and does not call service', async () => {
    const sender = {
      id: 'other-extension-id',
    };
    const sendResponse = jest.fn();

    await handlers.searchNotion({ query: 'test', apiKey: 'hacker-key' }, sender, sendResponse);

    const response = getLastResponse(sendResponse);
    expectSearchNotionContract(response, SEARCH_NOTION_ERROR_FIELDS);
    expect(response).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.any(String),
      })
    );
    expect(mockNotionService.search).not.toHaveBeenCalled();
  });

  test.each(refreshOAuthTokenCases)('$name', async ({ refreshResult, expectedResponse }) => {
    expect.hasAssertions();
    const sender = { id: 'mock-extension-id' };
    const sendResponse = jest.fn();
    refreshOAuthToken.mockResolvedValueOnce(refreshResult);

    await handlers.refreshOAuthToken({ action: 'refreshOAuthToken' }, sender, sendResponse);

    const response = getLastResponse(sendResponse);
    expectRefreshOAuthTokenContract(response);
    expectRefreshOAuthTokenResponse(response, expectedResponse);
  });
});
