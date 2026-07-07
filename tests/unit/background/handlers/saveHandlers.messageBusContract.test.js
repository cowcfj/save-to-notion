/**
 * @jest-environment jsdom
 */

import {
  createSaveHandlersTestContext,
  setupDefaultActionMocks,
  validSender,
} from './saveHandlers.shared.js';
import { buildCreatePageResult, buildSavedPageData } from './saveHandlersTestHarness.js';
import {
  expectActionResponseDeclares,
  expectMessageBusResponseContract,
  getLastResponse,
  loadMessageBusContract,
} from './messageBusContractTestUtils.js';

const SAVE_SUCCESS_CONTRACT_FIELDS = [
  'success',
  'statusKind',
  'canSave',
  'canSyncHighlights',
  'notionPageId',
  'notionUrl',
];

const CHECK_STATUS_CONTRACT_FIELDS = [
  'success',
  'statusKind',
  'canSave',
  'canSyncHighlights',
  'notionPageId',
  'notionUrl',
];

const OPEN_NOTION_PAGE_CONTRACT_FIELDS = ['success', 'tabId'];
const OPEN_NOTION_PAGE_ERROR_FIELDS = ['success', 'error'];

function createRailSender() {
  return {
    id: 'mock-extension-id',
    url: 'https://example.com',
    tab: { id: 1, url: 'https://example.com' },
  };
}

function expectSaveResponseContract(actionName, declaredFields, response) {
  expectMessageBusResponseContract({
    group: 'save',
    actionName,
    declaredFields,
    response,
  });
}

function expectSavePageContract(response) {
  expectSaveResponseContract('savePage', SAVE_SUCCESS_CONTRACT_FIELDS, response);
}

function expectCheckPageStatusContract(response) {
  expectSaveResponseContract('checkPageStatus', CHECK_STATUS_CONTRACT_FIELDS, response);
}

function expectRailSaveContract(response) {
  expectSaveResponseContract('SAVE_PAGE_FROM_RAIL', SAVE_SUCCESS_CONTRACT_FIELDS, response);
}

function expectOpenNotionPageContract(response, fields) {
  expectSaveResponseContract('openNotionPage', fields, response);
}

describe('saveHandlers message_bus.json response contracts', () => {
  const context = createSaveHandlersTestContext();

  beforeEach(() => {
    setupDefaultActionMocks(context.mockServices);
  });

  test('contract helper reports missing save action by name', () => {
    expect(() => expectActionResponseDeclares('save', 'missingSaveAction', ['success'])).toThrow(
      /missingSaveAction/
    );
  });

  test('savePage successful create response matches canonical save contract fields', async () => {
    const sendResponse = jest.fn();
    context.mockServices.storageService.getSavedPageData.mockResolvedValue(null);
    context.mockServices.notionService.createPage.mockResolvedValue(
      buildCreatePageResult({
        pageId: 'new-page-123',
        url: 'https://notion.so/new-page-123',
      })
    );

    await context.handlers.savePage({}, validSender, sendResponse);

    const response = getLastResponse(sendResponse);
    expectSavePageContract(response);
    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        statusKind: 'saved',
        canSave: false,
        canSyncHighlights: true,
        notionPageId: 'new-page-123',
        notionUrl: 'https://notion.so/new-page-123',
      })
    );
  });

  test('savePage destination failure keeps error envelope contract', async () => {
    const sendResponse = jest.fn();
    context.mockServices.destinationProfileResolver.resolveProfileForSave.mockRejectedValue(
      new Error('找不到目的地：missing')
    );

    await context.handlers.savePage({ profileId: 'missing' }, validSender, sendResponse);

    const response = getLastResponse(sendResponse);
    const messageBus = loadMessageBusContract();
    expect(messageBus.actions.save.savePage.response).toHaveProperty('error');
    expect(messageBus.actions.save.savePage.response).toHaveProperty('errorCode');
    expect(response).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.any(String),
        errorCode: 'DESTINATION_PROFILE_NOT_FOUND',
      })
    );
  });

  test('checkPageStatus saved response matches status contract fields', async () => {
    const sendResponse = jest.fn();
    context.mockServices.storageService.getSavedPageData.mockResolvedValue(
      buildSavedPageData({
        notionPageId: 'saved-page-123',
        notionUrl: 'https://notion.so/saved-page-123',
        title: 'Saved Page',
        lastVerifiedAt: Date.now(),
      })
    );

    await context.handlers.checkPageStatus({}, validSender, sendResponse);

    const response = getLastResponse(sendResponse);
    expectCheckPageStatusContract(response);
    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        statusKind: 'saved',
        canSave: false,
        canSyncHighlights: true,
        notionPageId: 'saved-page-123',
        notionUrl: 'https://notion.so/saved-page-123',
      })
    );
  });

  test('SAVE_PAGE_FROM_RAIL successful create response is compatible with canonical save shape', async () => {
    const sendResponse = jest.fn();
    context.mockServices.storageService.getSavedPageData.mockResolvedValue(null);
    context.mockServices.notionService.createPage.mockResolvedValue(
      buildCreatePageResult({
        pageId: 'rail-page-123',
        url: 'https://notion.so/rail-page-123',
      })
    );

    await context.handlers.SAVE_PAGE_FROM_RAIL({}, createRailSender(), sendResponse);

    const response = getLastResponse(sendResponse);
    expectRailSaveContract(response);
    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        statusKind: 'saved',
        canSave: false,
        canSyncHighlights: true,
        notionPageId: 'rail-page-123',
        notionUrl: 'https://notion.so/rail-page-123',
      })
    );
  });

  test('SAVE_PAGE_FROM_RAIL validation failure keeps error envelope contract', async () => {
    const sendResponse = jest.fn();

    await context.handlers.SAVE_PAGE_FROM_RAIL({}, { id: 'mock-extension-id' }, sendResponse);

    const response = getLastResponse(sendResponse);
    const messageBus = loadMessageBusContract();
    expect(messageBus.actions.save.SAVE_PAGE_FROM_RAIL.response).toHaveProperty('success');
    expect(messageBus.actions.save.SAVE_PAGE_FROM_RAIL.response).toHaveProperty('error');
    expect(response).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.any(String),
      })
    );
  });

  test('openNotionPage success response matches navigation contract fields', async () => {
    const sendResponse = jest.fn();
    context.mockServices.storageService.getSavedPageData.mockResolvedValue(
      buildSavedPageData({
        notionPageId: 'open-page-123',
        notionUrl: 'https://notion.so/open-page-123',
      })
    );
    chrome.tabs.create.mockResolvedValue({ id: 99 });

    await context.handlers.openNotionPage(
      { url: 'https://example.com' },
      validSender,
      sendResponse
    );

    const response = getLastResponse(sendResponse);
    expectOpenNotionPageContract(response, OPEN_NOTION_PAGE_CONTRACT_FIELDS);
    expect(response).toEqual(
      expect.objectContaining({
        success: true,
        tabId: 99,
      })
    );
  });

  test('openNotionPage missing saved page keeps error envelope contract', async () => {
    const sendResponse = jest.fn();
    context.mockServices.tabService.resolveTabUrl.mockResolvedValue({
      stableUrl: 'https://example.com/stable',
      originalUrl: 'https://example.com/original',
      migrated: false,
    });
    context.mockServices.storageService.getSavedPageData
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await context.handlers.openNotionPage(
      { url: 'https://example.com/stable' },
      validSender,
      sendResponse
    );

    const response = getLastResponse(sendResponse);
    expectOpenNotionPageContract(response, OPEN_NOTION_PAGE_ERROR_FIELDS);
    expect(response).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.any(String),
      })
    );
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });
});
