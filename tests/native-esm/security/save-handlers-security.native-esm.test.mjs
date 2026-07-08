import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createSaveHandlerServices, installSavePageChrome } from './securityHarness.mjs';
import { installLoggerGlobal, snapshotGlobals } from '../utils/rootUtilsHarness.mjs';

const validateInternalRequest = jest.fn();
const validateContentScriptRequest = jest.fn();
const isValidNotionUrl = jest.fn(() => true);
const getActiveNotionToken = jest.fn();
const ensureNotionApiKey = jest.fn();

await jest.unstable_mockModule('../../../scripts/utils/securityUtils.js', () => ({
  validateInternalRequest,
  validateContentScriptRequest,
  isValidNotionUrl,
}));

await jest.unstable_mockModule('../../../scripts/utils/notionAuth.js', () => ({
  getActiveNotionToken,
  ensureNotionApiKey,
}));

let restoreGlobals;

describe('saveHandlers security native ESM sibling', () => {
  beforeEach(() => {
    restoreGlobals = snapshotGlobals(['chrome', 'Logger']);
    installSavePageChrome();
    installLoggerGlobal();
    validateInternalRequest.mockReturnValue(null);
    validateContentScriptRequest.mockReturnValue(null);
    getActiveNotionToken.mockResolvedValue({
      token: 'trusted-storage-token',
      mode: 'manual',
    });
    ensureNotionApiKey.mockResolvedValue('trusted-storage-token');
  });

  afterEach(() => {
    jest.clearAllMocks();
    restoreGlobals();
  });

  test('savePage rejects senders that fail internal request validation', async () => {
    validateInternalRequest.mockReturnValue({
      success: false,
      error: 'Unauthorized',
    });
    const { createSaveHandlers } =
      await import('../../../scripts/background/handlers/saveHandlers.js');
    const services = createSaveHandlerServices();
    const handlers = createSaveHandlers(services);
    const sendResponse = jest.fn();

    await handlers.savePage({ action: 'savePage' }, { id: 'untrusted-extension' }, sendResponse);

    expect(validateInternalRequest).toHaveBeenCalledWith({ id: 'untrusted-extension' });
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: 'Unauthorized',
    });
    expect(services.notionService.createPage).not.toHaveBeenCalled();
  });

  test('savePage uses active storage token instead of request-supplied apiKey', async () => {
    const { createSaveHandlers } =
      await import('../../../scripts/background/handlers/saveHandlers.js');
    const services = createSaveHandlerServices();
    const handlers = createSaveHandlers(services);
    const sendResponse = jest.fn();

    await handlers.savePage(
      {
        action: 'savePage',
        apiKey: 'malicious-request-token',
      },
      { id: 'trusted-extension-id' },
      sendResponse
    );

    expect(getActiveNotionToken).toHaveBeenCalled();
    expect(services.notionService.createPage).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        apiKey: 'trusted-storage-token',
      })
    );
    expect(services.notionService.createPage).not.toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        apiKey: 'malicious-request-token',
      })
    );
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
      })
    );
  });
});
