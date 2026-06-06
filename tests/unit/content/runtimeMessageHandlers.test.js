/**
 * @jest-environment jsdom
 */

import { CONTENT_BRIDGE_ACTIONS } from '../../../scripts/config/runtimeActions/contentBridgeActions.js';
import { HIGHLIGHTER_ACTIONS } from '../../../scripts/config/runtimeActions/highlighterActions.js';
import {
  activateFloatingRailHighlighting,
  createContentRuntimeMessageHandler,
} from '../../../scripts/content/runtimeMessageHandlers.js';

const { createLoggerMock } = require('../../helpers/loggerMock.js');

function createRouter(overrides = {}) {
  const dependencies = {
    getPreloaderCache: jest.fn(() => null),
    isBundleReady: jest.fn(() => true),
    getStableUrl: jest.fn(() => undefined),
    setStableUrl: jest.fn(),
    getHighlighterRuntime: jest.fn(() => undefined),
    logger: createLoggerMock(),
    withAvailableFloatingRail: jest.fn(),
    revealFloatingRail: jest.fn(),
    formatRuntimeErrorMessage: jest.fn((_error, fallback) => fallback),
    ...overrides,
  };

  return {
    dependencies,
    handler: createContentRuntimeMessageHandler(dependencies),
  };
}

describe('content runtime message router', () => {
  test.each([null, undefined, 'PING', 42, true, {}])(
    'malformed request %p returns false without response',
    request => {
      const { handler } = createRouter();
      const sendResponse = jest.fn();

      expect(() => handler(request, {}, sendResponse)).not.toThrow();
      expect(handler(request, {}, sendResponse)).toBe(false);
      expect(sendResponse).not.toHaveBeenCalled();
    }
  );

  test('PING responds with bundle readiness and preloader metadata', () => {
    const { handler } = createRouter({
      getPreloaderCache: jest.fn(() => ({
        nextRouteInfo: { page: '/article' },
        shortlink: 'https://wp.me/p1',
      })),
      isBundleReady: jest.fn(() => true),
    });
    const sendResponse = jest.fn();

    const result = handler({ action: CONTENT_BRIDGE_ACTIONS.PING }, {}, sendResponse);

    expect(result).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith({
      status: 'bundle_ready',
      hasPreloaderCache: true,
      nextRouteInfo: { page: '/article' },
      shortlink: 'https://wp.me/p1',
    });
  });

  test('SET_STABLE_URL invalid input responds with INVALID_STABLE_URL', () => {
    const { handler, dependencies } = createRouter({
      getStableUrl: jest.fn(() => 'https://example.com/old'),
    });
    const sendResponse = jest.fn();

    const result = handler(
      { action: CONTENT_BRIDGE_ACTIONS.SET_STABLE_URL, stableUrl: 'https://example.com/' },
      {},
      sendResponse
    );

    expect(result).toBe(true);
    expect(dependencies.setStableUrl).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: 'INVALID_STABLE_URL',
    });
  });

  test('SET_STABLE_URL valid input updates stable URL', () => {
    const { handler, dependencies } = createRouter();
    const sendResponse = jest.fn();

    const result = handler(
      {
        action: CONTENT_BRIDGE_ACTIONS.SET_STABLE_URL,
        stableUrl: 'https://example.com/posts/123?ref=clipper',
      },
      {},
      sendResponse
    );

    expect(result).toBe(true);
    expect(dependencies.setStableUrl).toHaveBeenCalledWith(
      'https://example.com/posts/123?ref=clipper'
    );
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  test('GET_STABLE_URL responds with stableUrl', () => {
    const { handler } = createRouter({
      getStableUrl: jest.fn(() => 'https://example.com/posts/123'),
    });
    const sendResponse = jest.fn();

    const result = handler({ action: CONTENT_BRIDGE_ACTIONS.GET_STABLE_URL }, {}, sendResponse);

    expect(result).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith({ stableUrl: 'https://example.com/posts/123' });
  });

  test('INIT_BUNDLE responds with ready and bufferedEvents contract', () => {
    const { handler } = createRouter();
    const sendResponse = jest.fn();

    const result = handler({ action: CONTENT_BRIDGE_ACTIONS.INIT_BUNDLE }, {}, sendResponse);

    expect(result).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith({ ready: true, bufferedEvents: 0 });
  });

  test('SHOW_TOAST is fire-and-forget and does not require a response', () => {
    const show = jest.fn();
    const { handler } = createRouter({
      getHighlighterRuntime: jest.fn(() => ({ toast: { show } })),
    });
    const sendResponse = jest.fn();

    const result = handler(
      {
        action: CONTENT_BRIDGE_ACTIONS.SHOW_TOAST,
        messageKey: 'SYNC_FAILED_AUTH',
        level: 'error',
      },
      {},
      sendResponse
    );

    expect(result).toBe(false);
    expect(show).toHaveBeenCalledWith('SYNC_FAILED_AUTH', { level: 'error' });
    expect(sendResponse).not.toHaveBeenCalled();
  });

  test('SHOW_FLOATING_RAIL and showHighlighter use the injected floating rail reveal helper', () => {
    const { handler, dependencies } = createRouter();
    const sendResponse = jest.fn();

    expect(handler({ action: CONTENT_BRIDGE_ACTIONS.SHOW_FLOATING_RAIL }, {}, sendResponse)).toBe(
      true
    );
    expect(handler({ action: HIGHLIGHTER_ACTIONS.SHOW_HIGHLIGHTER }, {}, sendResponse)).toBe(true);

    expect(dependencies.withAvailableFloatingRail).toHaveBeenNthCalledWith(
      1,
      sendResponse,
      dependencies.revealFloatingRail
    );
    expect(dependencies.withAvailableFloatingRail).toHaveBeenNthCalledWith(
      2,
      sendResponse,
      dependencies.revealFloatingRail
    );
  });

  test('ACTIVATE_FLOATING_RAIL_HIGHLIGHT uses the shared activation flow', async () => {
    const { handler, dependencies } = createRouter();
    const sendResponse = jest.fn();

    const result = handler(
      {
        action: HIGHLIGHTER_ACTIONS.ACTIVATE_FLOATING_RAIL_HIGHLIGHT,
        sessionOverride: true,
      },
      {},
      sendResponse
    );

    expect(result).toBe(true);
    const [, activateRail, options] = dependencies.withAvailableFloatingRail.mock.calls[0];
    expect(options).toEqual({ sessionOverride: true });

    const rail = {
      activateHighlighting: jest.fn(),
    };
    await activateRail(rail);

    expect(dependencies.revealFloatingRail).toHaveBeenCalledWith(rail);
    expect(rail.activateHighlighting).toHaveBeenCalledWith();
  });

  test('REMOVE_HIGHLIGHT_DOM responds with removal result', () => {
    const removeHighlight = jest.fn(() => true);
    const { handler } = createRouter({
      getHighlighterRuntime: jest.fn(() => ({ manager: { removeHighlight } })),
    });
    const sendResponse = jest.fn();

    const result = handler(
      { action: HIGHLIGHTER_ACTIONS.REMOVE_HIGHLIGHT_DOM, highlightId: 'hl-123' },
      {},
      sendResponse
    );

    expect(result).toBe(true);
    expect(removeHighlight).toHaveBeenCalledWith('hl-123');
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  test('every handled content bridge action has an explicit response or fire-and-forget contract', () => {
    const handledContracts = new Map([
      [CONTENT_BRIDGE_ACTIONS.PING, 'response'],
      [CONTENT_BRIDGE_ACTIONS.SET_STABLE_URL, 'response'],
      [CONTENT_BRIDGE_ACTIONS.GET_STABLE_URL, 'response'],
      [CONTENT_BRIDGE_ACTIONS.INIT_BUNDLE, 'response'],
      [CONTENT_BRIDGE_ACTIONS.SHOW_FLOATING_RAIL, 'response'],
      [CONTENT_BRIDGE_ACTIONS.SHOW_TOAST, 'fire-and-forget'],
    ]);

    expect([...handledContracts.keys()].toSorted()).toEqual(
      [
        CONTENT_BRIDGE_ACTIONS.PING,
        CONTENT_BRIDGE_ACTIONS.SET_STABLE_URL,
        CONTENT_BRIDGE_ACTIONS.GET_STABLE_URL,
        CONTENT_BRIDGE_ACTIONS.INIT_BUNDLE,
        CONTENT_BRIDGE_ACTIONS.SHOW_FLOATING_RAIL,
        CONTENT_BRIDGE_ACTIONS.SHOW_TOAST,
      ].toSorted()
    );
    expect(handledContracts.get(CONTENT_BRIDGE_ACTIONS.SHOW_TOAST)).toBe('fire-and-forget');
  });
});

describe('activateFloatingRailHighlighting', () => {
  test.each([
    {
      name: 'reveals the rail before activating highlighting',
      createShowMock: calls =>
        jest.fn(() => {
          calls.push('show');
        }),
      expectedCalls: ['show', 'activate'],
    },
    {
      name: 'waits for async reveal before activating highlighting',
      createShowMock: calls =>
        jest.fn(async () => {
          calls.push('show-start');
          await Promise.resolve();
          calls.push('show-end');
        }),
      expectedCalls: ['show-start', 'show-end', 'activate'],
    },
  ])('$name', async ({ createShowMock, expectedCalls }) => {
    const calls = [];
    const rail = {
      show: createShowMock(calls),
      activateHighlighting: jest.fn(() => {
        calls.push('activate');
      }),
    };

    await activateFloatingRailHighlighting(rail);

    expect(calls).toEqual(expectedCalls);
    expect(rail.activateHighlighting).toHaveBeenCalledWith();
  });
});
