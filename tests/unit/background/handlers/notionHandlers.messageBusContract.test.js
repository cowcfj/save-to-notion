/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

import {
  expectActionResponseDeclares,
  expectResponseHasFields,
} from './messageBusContractTestUtils.js';

const SEARCH_NOTION_CONTRACT_FIELDS = ['success', 'data', 'error'];
const REFRESH_OAUTH_TOKEN_CONTRACT_FIELDS = ['success', 'token', 'error'];

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

function getLastResponse(sendResponse) {
  return sendResponse.mock.calls.at(-1)?.[0];
}

describe('notionHandlers message_bus.json response contracts', () => {
  let handlers;
  let mockNotionService;

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
    expectActionResponseDeclares('auth', 'searchNotion', SEARCH_NOTION_CONTRACT_FIELDS);
    expectResponseHasFields(response, ['success', 'data']);
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
    expectActionResponseDeclares('auth', 'searchNotion', SEARCH_NOTION_CONTRACT_FIELDS);
    expectResponseHasFields(response, ['success', 'error']);
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
    expectActionResponseDeclares('auth', 'searchNotion', SEARCH_NOTION_CONTRACT_FIELDS);
    expectResponseHasFields(response, ['success', 'error']);
    expect(response).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.any(String),
      })
    );
    expect(mockNotionService.search).not.toHaveBeenCalled();
  });

  test('refreshOAuthToken success response matches contract fields', async () => {
    const sender = { id: 'mock-extension-id' };
    const sendResponse = jest.fn();
    refreshOAuthToken.mockResolvedValueOnce('oauth_token_refreshed');

    await handlers.refreshOAuthToken({ action: 'refreshOAuthToken' }, sender, sendResponse);

    const response = getLastResponse(sendResponse);
    expectActionResponseDeclares('auth', 'refreshOAuthToken', REFRESH_OAUTH_TOKEN_CONTRACT_FIELDS);
    expectResponseHasFields(response, ['success', 'token']);
    expect(response).toEqual({
      success: true,
      token: 'oauth_token_refreshed',
    });
  });

  test('refreshOAuthToken failure response keeps null token contract', async () => {
    const sender = { id: 'mock-extension-id' };
    const sendResponse = jest.fn();
    refreshOAuthToken.mockResolvedValueOnce(null);

    await handlers.refreshOAuthToken({ action: 'refreshOAuthToken' }, sender, sendResponse);

    const response = getLastResponse(sendResponse);
    expectActionResponseDeclares('auth', 'refreshOAuthToken', REFRESH_OAUTH_TOKEN_CONTRACT_FIELDS);
    expectResponseHasFields(response, ['success', 'token']);
    expect(response).toEqual({
      success: false,
      token: null,
    });
  });
});
