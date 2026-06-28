/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

import { CONTENT_BRIDGE_ACTIONS } from '../../../../scripts/config/runtimeActions/contentBridgeActions.js';
import { HIGHLIGHTER_ACTIONS } from '../../../../scripts/config/runtimeActions/highlighterActions.js';

const mockLogger = {
  warn: jest.fn(),
};
const Logger = mockLogger;

jest.mock('../../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: mockLogger,
  ...mockLogger,
}));

if (typeof jest.unstable_mockModule === 'function') {
  jest.unstable_mockModule('../../../../scripts/utils/Logger.js', () => ({
    __esModule: true,
    default: mockLogger,
    ...mockLogger,
  }));
}

let createPersistentListeners;

beforeAll(async () => {
  ({ createPersistentListeners } =
    await import('../../../../scripts/highlighter/autoInit/persistentListeners.js'));
});

function createListenerTarget(overrides = {}) {
  return {
    addListener: jest.fn(),
    removeListener: jest.fn(),
    ...overrides,
  };
}

function createController({ globalScope = {}, overrides = {} } = {}) {
  const dependencies = {
    getStableUrl: jest.fn(() => 'https://example.com/stable'),
    onSetStableUrl: jest.fn(() => true),
    onLegacyShowToolbar: jest.fn(),
    ...overrides,
  };

  return {
    controller: createPersistentListeners({
      globalScope,
      getStableUrl: dependencies.getStableUrl,
      onSetStableUrl: dependencies.onSetStableUrl,
      onLegacyShowToolbar: dependencies.onLegacyShowToolbar,
    }),
    dependencies,
  };
}

describe('createPersistentListeners', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([null, undefined, 'SET_STABLE_URL', 42, true])(
    'handlePersistentMessage(%p) ignores malformed request values',
    request => {
      const runtimeTarget = createListenerTarget();
      const { controller, dependencies } = createController({
        globalScope: {
          chrome: {
            runtime: { onMessage: runtimeTarget },
          },
        },
      });
      const sendResponse = jest.fn();

      controller.register();
      const handler = runtimeTarget.addListener.mock.calls[0][0];

      expect(handler(request, {}, sendResponse)).toBeUndefined();
      expect(dependencies.onSetStableUrl).not.toHaveBeenCalled();
      expect(dependencies.onLegacyShowToolbar).not.toHaveBeenCalled();
      expect(sendResponse).not.toHaveBeenCalled();
    }
  );

  test('registered runtime handler routes supported persistent actions', () => {
    const runtimeTarget = createListenerTarget();
    const { controller, dependencies } = createController({
      globalScope: {
        chrome: {
          runtime: { onMessage: runtimeTarget },
        },
      },
    });
    const sendResponse = jest.fn();

    controller.register();
    const handler = runtimeTarget.addListener.mock.calls[0][0];

    expect(handler({ action: CONTENT_BRIDGE_ACTIONS.GET_STABLE_URL }, {}, sendResponse)).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith({ stableUrl: 'https://example.com/stable' });

    expect(handler({ action: HIGHLIGHTER_ACTIONS.SHOW_TOOLBAR }, {}, sendResponse)).toBe(true);
    expect(dependencies.onLegacyShowToolbar).toHaveBeenCalledWith(sendResponse);

    expect(
      handler(
        { action: CONTENT_BRIDGE_ACTIONS.SET_STABLE_URL, stableUrl: 'https://example.com/p/1' },
        {},
        sendResponse
      )
    ).toBe(true);
    expect(dependencies.onSetStableUrl).toHaveBeenCalledWith(
      { action: CONTENT_BRIDGE_ACTIONS.SET_STABLE_URL, stableUrl: 'https://example.com/p/1' },
      sendResponse
    );
  });

  test('missing chrome listener targets do not throw during register or unregister', () => {
    const { controller } = createController({
      globalScope: {
        chrome: {
          runtime: {},
          storage: {},
        },
      },
    });

    expect(() => controller.register()).not.toThrow();
    expect(() => controller.unregister()).not.toThrow();
  });

  test('addListener exception logs structured failure context', () => {
    const runtimeTarget = createListenerTarget({
      addListener: jest.fn(() => {
        throw new Error('Extension context invalidated');
      }),
    });
    const { controller } = createController({
      globalScope: {
        chrome: {
          runtime: { onMessage: runtimeTarget },
        },
      },
    });

    expect(() => controller.register()).not.toThrow();

    expect(Logger.warn).toHaveBeenCalledWith(
      '[Highlighter] 註冊持久監聽器失敗',
      expect.objectContaining({
        action: 'createPersistentListenerController',
        operation: 'addListener',
        result: 'failed',
        error: 'Extension context invalidated',
      })
    );
  });

  test('removeListener exception still clears registered handler state', () => {
    const runtimeTarget = createListenerTarget({
      removeListener: jest.fn(() => {
        throw new Error('Extension context invalidated during remove');
      }),
    });
    const { controller } = createController({
      globalScope: {
        chrome: {
          runtime: { onMessage: runtimeTarget },
        },
      },
    });

    controller.register();
    expect(() => controller.unregister()).not.toThrow();
    expect(() => controller.unregister()).not.toThrow();

    expect(runtimeTarget.removeListener).toHaveBeenCalledTimes(1);
    expect(Logger.warn).toHaveBeenCalledWith(
      '[Highlighter] 移除持久監聽器失敗',
      expect.objectContaining({
        action: 'createPersistentListenerController',
        operation: 'removeListener',
        result: 'failed',
        error: 'Extension context invalidated during remove',
      })
    );
  });
});
