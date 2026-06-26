/**
 * @jest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

const loggerMock = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
};

const gatewayMock = {
  clearHighlights: jest.fn(),
  loadHighlights: jest.fn(),
  saveHighlights: jest.fn(),
};

await jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
  default: loggerMock,
}));

await jest.unstable_mockModule('../../../scripts/utils/LogSanitizer.js', () => ({
  sanitizeUrlForLogging: jest.fn(url => `safe:${url}`),
}));

await jest.unstable_mockModule('../../../scripts/utils/urlUtils.js', () => ({
  isSafeStableUrl: jest.fn(url => typeof url === 'string' && url.startsWith('https://')),
  normalizeUrl: jest.fn(url => String(url || '').replace(/#.*$/, '')),
}));

await jest.unstable_mockModule('../../../styles/ui-token-constants.js', () => ({
  hexToRgba: (hex, alpha) => `${hex}/${alpha}`,
  UI_TOKENS: {
    color: {
      primary: '#2563eb',
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
      white: '#ffffff',
      text: '#1e293b',
      textMuted: '#64748b',
    },
    status: {
      successBg: '#dcfce7',
      successText: '#166534',
      successBorder: '#bbf7d0',
      errorBg: '#fee2e2',
      errorText: '#991b1b',
      errorBorder: '#fecaca',
      warningBg: '#fef3c7',
      warningText: '#92400e',
      warningBorder: '#fcd34d',
    },
    radius: { sm: '4px', md: '8px' },
    shadow: { md: '0 4px 12px rgba(0, 0, 0, 0.12)' },
    spacing: { sm: '8px', md: '16px' },
  },
}));

await jest.unstable_mockModule('../../../scripts/highlighter/core/HighlightStorageGateway.js', () => ({
  HighlightStorageGateway: gatewayMock,
}));

const { CONTENT_BRIDGE_ACTIONS } = await import(
  '../../../scripts/config/runtimeActions/contentBridgeActions.js'
);
const { HIGHLIGHTER_ACTIONS } = await import(
  '../../../scripts/config/runtimeActions/highlighterActions.js'
);
const { createLateStableUrlRestoreController } = await import(
  '../../../scripts/highlighter/autoInit/lateStableUrlRestore.js'
);
const { createPersistentListeners } = await import(
  '../../../scripts/highlighter/autoInit/persistentListeners.js'
);
const { createRailInitializationController } = await import(
  '../../../scripts/highlighter/autoInit/railInitialization.js'
);
const {
  applyResolvedStableUrl,
  resolveStableUrlForInit,
  waitForStableUrl,
} = await import('../../../scripts/highlighter/autoInit/stableUrlResolution.js');
const {
  deserializeRange,
  findRangeByTextContent,
  restoreRangeWithRetry,
  serializeRange,
  validateRange,
} = await import('../../../scripts/highlighter/core/Range.js');
const { StyleManager } = await import('../../../scripts/highlighter/core/StyleManager.js');
const { HighlightStorage, RestoreManager } = await import(
  '../../../scripts/highlighter/core/HighlightStorage.js'
);
const { HighlightInteraction } = await import(
  '../../../scripts/highlighter/core/HighlightInteraction.js'
);
const { HighlightMigration } = await import('../../../scripts/highlighter/core/HighlightMigration.js');
const { FloatingRailStateManager, RailStates } = await import(
  '../../../scripts/highlighter/ui/FloatingRailState.js'
);
const { Toast } = await import('../../../scripts/highlighter/ui/Toast.js');
const { mountWindowAPI } = await import('../../../scripts/highlighter/windowAPI.js');

function createListenerTarget() {
  return {
    addListener: jest.fn(),
    removeListener: jest.fn(),
  };
}

function flushPromises() {
  return Promise.resolve().then(() => Promise.resolve());
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  jest.clearAllMocks();
  gatewayMock.clearHighlights.mockResolvedValue(undefined);
  gatewayMock.loadHighlights.mockResolvedValue([]);
  gatewayMock.saveHighlights.mockResolvedValue(undefined);
  delete globalThis.chrome;
  delete globalThis.CSS;
  delete globalThis.Highlight;
  delete globalThis.HighlighterV2;
  delete globalThis.notionHighlighter;
  delete globalThis.__NOTION_STABLE_URL__;
  globalThis.normalizeUrl = jest.fn(url => String(url || '').replace(/#.*$/, ''));
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
  delete globalThis.chrome;
  delete globalThis.CSS;
  delete globalThis.Highlight;
  delete globalThis.HighlighterV2;
  delete globalThis.notionHighlighter;
  delete globalThis.__NOTION_STABLE_URL__;
  delete globalThis.normalizeUrl;
});

describe('highlighter residual native ESM diagnostics', () => {
  test('autoInit controllers route stable URL, persistent messages, and rail readiness', async () => {
    jest.useFakeTimers();
    const runtimeTarget = createListenerTarget();
    const storageTarget = createListenerTarget();
    const globalScope = {
      chrome: {
        runtime: { onMessage: runtimeTarget },
        storage: { onChanged: storageTarget },
      },
      HighlighterV2: {
        manager: { getCount: jest.fn(() => 0), updateStyleMode: jest.fn() },
        restoreManager: { restore: jest.fn().mockResolvedValue(undefined) },
      },
    };

    const lateRestore = createLateStableUrlRestoreController({ globalScope, logger: loggerMock });
    const sendResponse = jest.fn();
    expect(
      lateRestore.handleSetStableUrl({ stableUrl: 'https://example.com/stable' }, sendResponse)
    ).toBe(true);
    await flushPromises();
    expect(globalScope.__NOTION_STABLE_URL__).toBe('https://example.com/stable');
    expect(globalScope.HighlighterV2.restoreManager.restore).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledWith({ success: true });

    const listeners = createPersistentListeners({
      globalScope,
      getStableUrl: () => globalScope.__NOTION_STABLE_URL__,
      onLegacyShowToolbar: jest.fn(response => response({ success: true })),
      onSetStableUrl: lateRestore.handleSetStableUrl,
    });
    listeners.register();
    const persistentMessageHandler = runtimeTarget.addListener.mock.calls.at(-1)[0];
    expect(
      persistentMessageHandler({ action: CONTENT_BRIDGE_ACTIONS.GET_STABLE_URL }, {}, sendResponse)
    ).toBe(true);
    expect(sendResponse).toHaveBeenLastCalledWith({ stableUrl: 'https://example.com/stable' });
    expect(persistentMessageHandler({ action: HIGHLIGHTER_ACTIONS.SHOW_TOOLBAR }, {}, sendResponse)).toBe(
      true
    );
    const storageHandler = storageTarget.addListener.mock.calls[0][0];
    storageHandler({ highlightStyle: { newValue: 'underline' } }, 'sync');
    expect(globalScope.HighlighterV2.manager.updateStyleMode).toHaveBeenCalledWith('underline');
    listeners.unregister();
    expect(runtimeTarget.removeListener).toHaveBeenCalled();

    const waitPromise = waitForStableUrl({
      globalScope: { chrome: { runtime: { onMessage: createListenerTarget() } } },
      timeoutMs: 20,
      contentBridgeActions: CONTENT_BRIDGE_ACTIONS,
      logger: loggerMock,
    });
    jest.advanceTimersByTime(20);
    await expect(waitPromise).resolves.toBeNull();

    await expect(
      resolveStableUrlForInit({
        globalScope,
        pageStatus: { stableUrl: 'https://example.com/cached' },
        runtimeStableUrlPromise: Promise.resolve('https://example.com/runtime'),
      })
    ).resolves.toEqual({
      resolvedStableUrl: 'https://example.com/stable',
      stableUrlSource: 'SET_STABLE_URL',
    });
    applyResolvedStableUrl({
      globalScope,
      logger: loggerMock,
      resolvedStableUrl: 'https://example.com/applied?token=secret',
      sanitizeUrlForLogging: url => `redacted:${url.split('?')[0]}`,
      stableUrlSource: 'SET_STABLE_URL',
    });
    expect(globalScope.__NOTION_STABLE_URL__).toBe('https://example.com/applied?token=secret');

    const railGlobal = {};
    const railController = createRailInitializationController({ globalScope: railGlobal });
    const railReady = railGlobal.__NOTION_RAIL_READY__;
    railController.settleRailReady({ success: false, error: 'skip' });
    await expect(railReady).resolves.toEqual({ success: false, error: 'skip' });
    expect(railGlobal.__NOTION_RAIL_READY__).toBeUndefined();
  });

  test('core modules serialize ranges, manage styles, storage, interaction, and migration helpers', async () => {
    document.body.innerHTML = '<main><p id="a">Prefix Native ESM suffix</p><p>Second paragraph</p></main>';
    const textNode = document.querySelector('#a').firstChild;
    const range = document.createRange();
    range.setStart(textNode, 7);
    range.setEnd(textNode, 17);

    const serialized = serializeRange(range);
    expect(serialized.prefix).toContain('Prefix');
    expect(deserializeRange(serialized, 'Native ESM').toString()).toBe('Native ESM');
    await expect(restoreRangeWithRetry(serialized, 'Native ESM')).resolves.toEqual(expect.any(Range));
    expect(findRangeByTextContent('Second paragraph').toString()).toBe('Second paragraph');
    expect(validateRange(range, 'Native ESM')).toBe(true);

    globalThis.chrome = { runtime: { id: 'native-esm-test' } };
    globalThis.CSS = { highlights: new Map() };
    globalThis.Highlight = function Highlight() {
      this.clear = jest.fn();
    };
    globalThis.Highlight.toString = () => 'function Highlight() { [native code] }';
    const styleManager = new StyleManager({ styleMode: 'text' });
    styleManager.initialize();
    expect(document.querySelector('#notion-highlight-styles-native-esm-test').textContent).toContain(
      '::highlight(notion-native-esm-test-yellow)'
    );
    styleManager.updateMode('underline');
    expect(styleManager.getStyleMode()).toBe('underline');
    styleManager.clearAllHighlights();
    styleManager.cleanup();
    expect(globalThis.CSS.highlights.size).toBe(0);

    const manager = {
      clearAll: jest.fn(),
      highlights: new Map([
        ['h1', { color: 'yellow', id: 'h1', rangeInfo: serialized, text: 'Native ESM', timestamp: 1 }],
      ]),
      restoreLocalHighlight: jest.fn().mockResolvedValue(true),
    };
    globalThis.__NOTION_STABLE_URL__ = 'https://example.com/article';
    const storage = new HighlightStorage(manager);
    await storage.save();
    expect(gatewayMock.saveHighlights).toHaveBeenCalledWith(
      'https://example.com/article',
      expect.objectContaining({ highlights: [expect.objectContaining({ id: 'h1' })] })
    );
    gatewayMock.loadHighlights.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { color: 'blue', id: 'h2', text: 'fallback', timestamp: 2 },
    ]);
    globalThis.__NOTION_STABLE_URL__ = 'https://example.com/stable';
    await expect(storage.restore()).resolves.toBe(true);
    expect(manager.clearAll).toHaveBeenCalledWith({ skipStorage: true });
    expect(storage.collectForNotion()).toEqual([expect.objectContaining({ id: 'h1' })]);
    expect(RestoreManager).toBe(HighlightStorage);

    const interaction = new HighlightInteraction({
      highlights: new Map([
        ['h1', { range: { getClientRects: () => [{ bottom: 20, left: 0, right: 30, top: 0 }] } }],
      ]),
      removeHighlight: jest.fn(),
    });
    const clickEvent = { clientX: 10, clientY: 10, ctrlKey: true, preventDefault: jest.fn(), stopPropagation: jest.fn() };
    expect(interaction.handleClick(clickEvent)).toBe(true);
    expect(HighlightInteraction.isPointInRect({ bottom: 1, left: 0, right: 1, top: 0 }, 1, 1)).toBe(true);

    localStorage.setItem('highlights_https://example.com/article', JSON.stringify(['Native ESM']));
    expect(HighlightMigration._tryParseHighlightArray('["Native ESM"]')).toEqual(['Native ESM']);
    expect(HighlightMigration._findLegacyData('https://example.com/article')).toEqual(
      expect.objectContaining({ key: 'highlights_https://example.com/article' })
    );
    expect(HighlightMigration._getSafeNormalizedUrl('https://example.com/article#hash')).toBe(
      'https://example.com/article'
    );
  });

  test('ui state, toast, and window API execute under native ESM jsdom', () => {
    jest.useFakeTimers();
    const listener = jest.fn();
    const state = new FloatingRailStateManager();
    state.addListener(listener);
    state.initialize();
    state.currentState = RailStates.EXPANDED;
    state.selectedColor = 'blue';
    state.dismiss();
    expect(state.isDismissed).toBe(true);
    state.undismiss();
    expect(state.isHighlighting).toBe(false);
    expect(listener).toHaveBeenCalledWith({ color: 'blue', state: RailStates.EXPANDED });

    const toast = new Toast();
    toast.show('HIGHLIGHT_DELETED', { durationMs: 50, level: 'warning' });
    jest.advanceTimersByTime(0);
    expect(toast.container.classList.contains('toast--visible')).toBe(true);
    toast.show('UNKNOWN_KEY', { customMessage: '自訂訊息', durationMs: 50 });
    expect(toast.container.textContent).toContain('自訂訊息');
    toast.hide();
    expect(toast.container.classList.contains('toast--visible')).toBe(false);
    toast.cleanup();
    expect(document.querySelector('#notion-toast-host')).toBeNull();

    const manager = {
      clearAll: jest.fn(),
      collectHighlightsForNotion: jest.fn(() => [{ id: 'h1' }]),
      getCount: jest.fn(() => 1),
    };
    const restoreManager = { restore: jest.fn() };
    mountWindowAPI({
      fns: { init: jest.fn(() => manager) },
      manager,
      storage: restoreManager,
      toast,
    });
    expect(globalThis.HighlighterV2.getCount).toBeUndefined();
    expect(globalThis.HighlighterV2.getInstance()).toBe(manager);
    expect(globalThis.notionHighlighter.collectHighlights()).toEqual([{ id: 'h1' }]);
    globalThis.clearPageHighlights();
    expect(manager.clearAll).toHaveBeenCalledWith({ skipStorage: true });
    globalThis.HighlighterV2.rail = {
      hide: jest.fn(),
      host: { style: { display: 'block' } },
      show: jest.fn(),
      stateManager: { currentState: RailStates.EXPANDED },
    };
    expect(globalThis.notionHighlighter.isActive()).toBe(true);
    globalThis.notionHighlighter.toggle();
    expect(globalThis.HighlighterV2.rail.hide).toHaveBeenCalled();
  });
});
