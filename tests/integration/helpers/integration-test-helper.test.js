import { createSendResponseWaiter } from '../../helpers/integration-test-helper.js';

describe('integration-test-helper', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    delete globalThis.chrome;
  });

  test('createSendResponseWaiter：callback 被呼叫後立即 resolve，且保留 mock 斷言能力', async () => {
    const sendResponse = createSendResponseWaiter();
    const responsePayload = { success: true, pageId: 'page-1' };

    sendResponse(responsePayload);
    await expect(sendResponse.waitForCall()).resolves.toEqual([responsePayload]);

    expect(sendResponse).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledWith(responsePayload);
  });

  test('createSendResponseWaiter：超時時會 reject', async () => {
    jest.useFakeTimers();

    const sendResponse = createSendResponseWaiter(100);
    const waitPromise = sendResponse.waitForCall();

    jest.advanceTimersByTime(100);

    await expect(waitPromise).rejects.toThrow(
      'waitForSend timeout: function was not called within 100ms'
    );
  });
});
