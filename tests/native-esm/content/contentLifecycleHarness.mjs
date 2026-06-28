import { jest } from '@jest/globals';

function makeDefaultChrome() {
  return {
    runtime: {
      onMessage: { addListener: jest.fn(), removeListener: jest.fn() },
      sendMessage: jest.fn(),
      getManifest: jest.fn(() => ({ version_name: 'native-esm', version: '2.8.1' })),
      getURL: jest.fn(path => `chrome-extension://ext-id/${path}`),
      lastError: null,
    },
    action: {
      setBadgeText: jest.fn(),
      setBadgeBackgroundColor: jest.fn(),
    },
  };
}

function makeLoggerMock() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
    success: jest.fn(),
    ready: jest.fn(),
    start: jest.fn(),
  };
}

function installNoOpDOMParser() {
  globalThis.DOMParser = jest.fn(() => ({
    parseFromString: (_input, _type) => ({
      body: {
        querySelector: jest.fn(() => null),
        querySelectorAll: jest.fn(() => []),
      },
    }),
  }));
}

function cleanupGlobals() {
  jest.clearAllMocks();
  delete globalThis.HighlighterV2;
  delete globalThis.__NOTION_PRELOADER_CACHE__;
  delete globalThis.__NOTION_BUNDLE_READY__;
  delete globalThis.__UNIT_TESTING__;
  delete globalThis.__notion_extraction_promise;
  delete globalThis.__notion_extraction_result;
  delete globalThis.__NOTION_STABLE_URL__;
  document.head.innerHTML = '';
  document.body.innerHTML = '';
}

function resetRuntimeListeners(chromeLike = globalThis.chrome) {
  const onMessage = chromeLike?.runtime?.onMessage;
  onMessage?.addListener?.mockClear();
  onMessage?.removeListener?.mockClear();
  chromeLike?.runtime?.sendMessage?.mockClear?.();
}

export {
  cleanupGlobals,
  installNoOpDOMParser,
  makeDefaultChrome,
  makeLoggerMock,
  resetRuntimeListeners,
};
