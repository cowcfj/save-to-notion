import { jest } from '@jest/globals';

export const loggerMock = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  success: jest.fn(),
  warn: jest.fn(),
};

export function cleanupHighlighterGlobals() {
  delete globalThis.HighlighterV2;
  delete globalThis.notionHighlighter;
  delete globalThis.initHighlighter;
  delete globalThis.collectHighlights;
  delete globalThis.clearPageHighlights;
  delete globalThis.__NOTION_RAIL_READY__;
  delete globalThis.__NOTION_STABLE_URL__;
  delete globalThis.chrome;
  delete globalThis.normalizeUrl;
}

export function createListenerTarget() {
  return {
    addListener: jest.fn(),
    removeListener: jest.fn(),
  };
}

export function createChromeMock() {
  return {
    runtime: {
      id: 'native-esm-test',
      lastError: null,
      onMessage: createListenerTarget(),
      sendMessage: jest.fn().mockResolvedValue({ success: true }),
    },
    storage: {
      local: {
        get: jest.fn().mockResolvedValue({}),
        remove: jest.fn().mockResolvedValue(undefined),
        set: jest.fn().mockResolvedValue(undefined),
      },
      sync: {
        get: jest.fn().mockResolvedValue({}),
        onChanged: createListenerTarget(),
      },
      onChanged: createListenerTarget(),
    },
  };
}

export function createManagerMock() {
  return {
    clearAll: jest.fn(),
    collectHighlightsForNotion: jest.fn(() => [{ id: 'h1', text: 'Native ESM' }]),
    getCount: jest.fn(() => 1),
    initialize: jest.fn().mockResolvedValue(undefined),
    setDependencies: jest.fn(),
    toast: null,
  };
}

export function createStorageMock() {
  return {
    restore: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

export function createRailMock({ currentState = 'expanded', display = 'block' } = {}) {
  return {
    collapse: jest.fn(),
    hide: jest.fn(),
    host: { style: { display } },
    minimize: jest.fn(),
    show: jest.fn(),
    stateManager: { currentState },
  };
}

export async function flushAsyncLifecycle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
