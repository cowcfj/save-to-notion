/**
 * @jest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  createSaveHandlersTestContext,
  setupDefaultActionMocks,
  validSender,
} from './saveHandlers.shared.js';
import { buildCreatePageResult, buildSavedPageData } from './saveHandlersTestHarness.js';

const messageBusPath = path.resolve(process.cwd(), '.agents/.shared/knowledge/message_bus.json');
const messageBus = JSON.parse(readFileSync(messageBusPath, 'utf8'));

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

function getLastResponse(sendResponse) {
  return sendResponse.mock.calls.at(-1)?.[0];
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function expectJsonContractDeclares(actionName, fields) {
  if (!Object.hasOwn(messageBus.actions.save, actionName)) {
    throw new Error(`message_bus.json actions.save.${actionName} is missing`);
  }

  const responseContract = messageBus.actions.save[actionName].response;

  if (!isRecord(responseContract)) {
    throw new Error(`message_bus.json actions.save.${actionName}.response must be an object`);
  }

  for (const field of fields) {
    expect(responseContract).toHaveProperty(field);
  }
}

function expectResponseHasFields(response, fields) {
  for (const field of fields) {
    expect(response).toHaveProperty(field);
  }
}

function createRailSender() {
  return {
    id: 'mock-extension-id',
    url: 'https://example.com',
    tab: { id: 1, url: 'https://example.com' },
  };
}

describe('saveHandlers message_bus.json response contracts', () => {
  const context = createSaveHandlersTestContext();

  beforeEach(() => {
    setupDefaultActionMocks(context.mockServices);
  });

  test('contract helper reports missing save action by name', () => {
    expect(() => expectJsonContractDeclares('missingSaveAction', ['success'])).toThrow(
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
    expectJsonContractDeclares('savePage', SAVE_SUCCESS_CONTRACT_FIELDS);
    expectResponseHasFields(response, SAVE_SUCCESS_CONTRACT_FIELDS);
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
    expectJsonContractDeclares('checkPageStatus', CHECK_STATUS_CONTRACT_FIELDS);
    expectResponseHasFields(response, CHECK_STATUS_CONTRACT_FIELDS);
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
    expectJsonContractDeclares('SAVE_PAGE_FROM_RAIL', SAVE_SUCCESS_CONTRACT_FIELDS);
    expectResponseHasFields(response, SAVE_SUCCESS_CONTRACT_FIELDS);
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
    expect(messageBus.actions.save.SAVE_PAGE_FROM_RAIL.response).toHaveProperty('success');
    expect(messageBus.actions.save.SAVE_PAGE_FROM_RAIL.response).toHaveProperty('error');
    expect(response).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.any(String),
      })
    );
  });
});
