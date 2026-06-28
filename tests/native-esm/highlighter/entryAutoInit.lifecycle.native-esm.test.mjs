/**
 * @jest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import {
  cleanupHighlighterGlobals,
  createChromeMock,
  flushAsyncLifecycle,
  loggerMock,
} from './highlighterLifecycleHarness.mjs';

let createPersistentListenersCall;
let persistentListenersController;
let railInitializationController;
let setupHighlighter;
let fetchPageStatus;
let fetchHighlighterSettings;
let resolveStyleMode;
let resolveStableUrlForInit;
let applyResolvedStableUrl;
let withAvailableFloatingRailMock;

const createManager = () => ({
  getCount: jest.fn(() => 0),
  updateStyleMode: jest.fn(),
  clearAll: jest.fn(),
  collectHighlightsForNotion: jest.fn(() => []),
});

const createRestoreManager = () => ({
  restore: jest.fn().mockResolvedValue(undefined),
});

async function importEntryAutoInit() {
  await jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
    default: loggerMock,
  }));

  await jest.unstable_mockModule('../../../scripts/utils/LogSanitizer.js', () => ({
    sanitizeUrlForLogging: jest.fn(url => `sanitized:${url}`),
  }));

  await jest.unstable_mockModule('../../../scripts/highlighter/index.js', () => ({
    setupHighlighter,
  }));

  await jest.unstable_mockModule('../../../scripts/highlighter/autoInit/initializationInputs.js', () => ({
    fetchHighlighterSettings,
    fetchPageStatus,
    resolveStyleMode,
  }));

  await jest.unstable_mockModule('../../../scripts/highlighter/autoInit/stableUrlResolution.js', () => ({
    waitForStableUrl: jest.fn().mockResolvedValue('https://runtime.example/stable'),
    resolveStableUrlForInit,
    applyResolvedStableUrl,
  }));

  await jest.unstable_mockModule('../../../scripts/highlighter/autoInit/railInitialization.js', () => ({
    createRailInitializationController: () => railInitializationController,
  }));

  await jest.unstable_mockModule('../../../scripts/highlighter/autoInit/persistentListeners.js', () => ({
    createPersistentListeners: options => {
      createPersistentListenersCall = options;
      persistentListenersController = {
        register: jest.fn(),
        unregister: jest.fn(),
      };
      return persistentListenersController;
    },
  }));

  withAvailableFloatingRailMock = jest.fn(async (sendResponse, onRailReady) => {
    if (typeof sendResponse === 'function') {
      sendResponse({ success: true });
    }

    if (typeof onRailReady === 'function') {
      await onRailReady({ isReady: true });
    }
  });

  await jest.unstable_mockModule('../../../scripts/highlighter/utils/floatingRailAvailability.js', () => ({
    revealFloatingRail: jest.fn(),
    withAvailableFloatingRail: withAvailableFloatingRailMock,
  }));

  return import('../../../scripts/highlighter/entryAutoInit.js');
}

async function bootstrap({
  pageStatus = {
    isSaved: true,
    stableUrl: 'https://from-page-status.example',
  },
  settings = {
    highlightStyle: 'underline',
    floatingRailEnabled: true,
  },
} = {}) {
  const manager = createManager();
  const restoreManager = createRestoreManager();

  setupHighlighter = jest.fn(({ skipRestore, styleMode }) => {
    globalThis.HighlighterV2 = {
      manager,
      restoreManager,
      skipRestore: Boolean(skipRestore),
      wasDeleted: Boolean(skipRestore),
      restoreManagerReady: restoreManager,
      toast: null,
    };

    return { manager, restoreManager };
  });

  fetchPageStatus = jest.fn().mockResolvedValue(pageStatus);
  fetchHighlighterSettings = jest.fn().mockResolvedValue(settings);
  resolveStyleMode = jest.fn(() => pageStatus.styleMode || 'background');
  resolveStableUrlForInit = jest.fn(({ pageStatus: remote }) => ({
    resolvedStableUrl: pageStatus.stableUrl || remote?.stableUrl || 'https://runtime.example/stable',
    stableUrlSource: 'checkPageStatus',
  }));
  applyResolvedStableUrl = jest.fn(({ resolvedStableUrl }) => {
    if (resolvedStableUrl) {
      globalThis.__NOTION_STABLE_URL__ = resolvedStableUrl;
    }
  });

  railInitializationController = {
    initializeFloatingRail: jest.fn().mockResolvedValue({ success: true }),
    settleRailReady: jest.fn(),
  };

  createPersistentListenersCall = null;
  persistentListenersController = null;

  await importEntryAutoInit();
  await flushAsyncLifecycle();
}

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  cleanupHighlighterGlobals();
  globalThis.chrome = createChromeMock();
  globalThis.chrome.runtime.sendMessage = jest.fn().mockResolvedValue({});
});

afterEach(() => {
  cleanupHighlighterGlobals();
  delete globalThis.chrome;
});

describe('entryAutoInit lifecycle native ESM coverage', () => {
  test('正常初始化會走 setupHighlighter 並註冊持久監聽', async () => {
    await bootstrap();

    expect(resolveStyleMode).toHaveBeenCalled();
    expect(setupHighlighter).toHaveBeenCalledWith({
      skipRestore: false,
      styleMode: 'background',
    });
    expect(railInitializationController.initializeFloatingRail).toHaveBeenCalled();
    expect(persistentListenersController).toBeDefined();
    expect(persistentListenersController.register).toHaveBeenCalledTimes(1);
    expect(globalThis.__NOTION_STABLE_URL__).toBe('https://from-page-status.example');
  });

  test('頁面刪除時會走 skipRestore 並跳過 rail 初始化', async () => {
    await bootstrap({
      pageStatus: {
        isSaved: false,
        wasDeleted: true,
        stableUrl: 'https://deleted.example',
      },
    });

    expect(setupHighlighter).toHaveBeenCalledWith({
      skipRestore: true,
      styleMode: 'background',
    });
    expect(railInitializationController.settleRailReady).toHaveBeenCalledWith({
      success: false,
      error: '浮動側欄初始化已略過',
    });
    expect(railInitializationController.initializeFloatingRail).not.toHaveBeenCalled();
  });

  test('SET_STABLE_URL handler 會更新 __NOTION_STABLE_URL 與回報 restore', async () => {
    await bootstrap();

    const handler = createPersistentListenersCall.onSetStableUrl;
    const sendResponse = jest.fn();

    const result = handler(
      { action: 'SET_STABLE_URL', stableUrl: 'https://late.example/article' },
      sendResponse,
    );

    expect(result).toBe(true);
    await Promise.resolve();

    expect(globalThis.__NOTION_STABLE_URL__).toBe('https://late.example/article');
    expect(globalThis.HighlighterV2.restoreManager.restore).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  test('SHOW_TOOLBAR handler 會透過 floating rail 可用性入口', async () => {
    await bootstrap();

    const handler = createPersistentListenersCall.onLegacyShowToolbar;
    const sendResponse = jest.fn();

    handler(sendResponse);
    await Promise.resolve();

    expect(withAvailableFloatingRailMock).toHaveBeenCalledWith(sendResponse, expect.any(Function));
  });

  test('初始化失敗會 fallback 並記錄 Logger.error', async () => {
    setupHighlighter = jest.fn(() => {
      throw new Error('bootstrap failed');
    });
    fetchPageStatus = jest.fn().mockResolvedValue({ isSaved: true, stableUrl: 'https://error.example' });
    fetchHighlighterSettings = jest.fn().mockResolvedValue({
      highlightStyle: 'underline',
      floatingRailEnabled: false,
    });
    resolveStyleMode = jest.fn(() => 'background');
    resolveStableUrlForInit = jest.fn(() => ({
      resolvedStableUrl: 'https://error.example',
      stableUrlSource: 'checkPageStatus',
    }));
    applyResolvedStableUrl = jest.fn();

    await importEntryAutoInit();
    await flushAsyncLifecycle();

    expect(persistentListenersController.unregister).toHaveBeenCalled();
    expect(loggerMock.error).toHaveBeenCalledWith(
      '初始化失敗',
      expect.objectContaining({ action: 'initializeExtension' }),
    );
  });
});
