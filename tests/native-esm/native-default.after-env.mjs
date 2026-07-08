import { createRequire } from 'node:module';
import { jest } from '@jest/globals';

const require = createRequire(import.meta.url);
const sharedChromeMock = require('../mocks/chrome.cjs');
const sharedRuntimeSendMessage = sharedChromeMock.runtime.sendMessage;

function restoreSharedChromeMock() {
  globalThis.chrome = sharedChromeMock;

  if (!globalThis.chrome?.runtime) {
    return;
  }

  globalThis.chrome.runtime.lastError = undefined;
  sharedRuntimeSendMessage.mockImplementation((payload, callback) => {
    if (typeof callback === 'function') {
      callback({ success: true });
    }
    return Promise.resolve({ success: true });
  });
  globalThis.chrome.runtime.sendMessage = sharedRuntimeSendMessage;
}

globalThis.__restoreNativeDefaultChromeMock = restoreSharedChromeMock;

beforeEach(() => {
  jest.clearAllMocks();
  restoreSharedChromeMock();
});
