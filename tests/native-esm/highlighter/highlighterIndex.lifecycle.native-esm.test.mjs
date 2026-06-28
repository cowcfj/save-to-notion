/**
 * @jest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { cleanupHighlighterGlobals, loggerMock } from './highlighterLifecycleHarness.mjs';

const managerInstances = [];
const storageInstances = [];
const constructorSpies = {
  HighlightInteraction: jest.fn(),
  HighlightManager: jest.fn(),
  HighlightMigration: jest.fn(),
  HighlightStorage: jest.fn(),
  StyleManager: jest.fn(),
  Toast: jest.fn(),
};

function createManager(options) {
  const manager = {
    clearAll: jest.fn(),
    collectHighlightsForNotion: jest.fn(() => []),
    getCount: jest.fn(() => 0),
    initialize: jest.fn().mockResolvedValue(undefined),
    options,
    setDependencies: jest.fn(dependencies => {
      Object.assign(manager, dependencies);
    }),
  };
  managerInstances.push(manager);
  return manager;
}

function createStorage(manager) {
  const storage = {
    manager,
    restore: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
  };
  storageInstances.push(storage);
  return storage;
}

async function importIndexModule() {
  await jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
    default: loggerMock,
  }));

  await jest.unstable_mockModule('../../../scripts/utils/urlUtils.js', () => ({
    normalizeUrl: jest.fn(url => String(url || '').replace(/#.*$/, '')),
  }));

  await jest.unstable_mockModule('../../../scripts/highlighter/core/HighlightManager.js', () => ({
    HighlightManager: constructorSpies.HighlightManager.mockImplementation(createManager),
  }));

  await jest.unstable_mockModule('../../../scripts/highlighter/core/StyleManager.js', () => ({
    StyleManager: constructorSpies.StyleManager.mockImplementation(function StyleManager(options) {
      this.options = options;
    }),
  }));

  await jest.unstable_mockModule('../../../scripts/highlighter/core/HighlightInteraction.js', () => ({
    HighlightInteraction: constructorSpies.HighlightInteraction.mockImplementation(
      function HighlightInteraction(manager) {
        this.manager = manager;
      }
    ),
  }));

  await jest.unstable_mockModule('../../../scripts/highlighter/core/HighlightMigration.js', () => ({
    HighlightMigration: constructorSpies.HighlightMigration.mockImplementation(
      function HighlightMigration(manager) {
        this.manager = manager;
      }
    ),
  }));

  await jest.unstable_mockModule('../../../scripts/highlighter/core/HighlightStorage.js', () => ({
    HighlightStorage: constructorSpies.HighlightStorage.mockImplementation(createStorage),
    RestoreManager: constructorSpies.HighlightStorage,
  }));

  await jest.unstable_mockModule('../../../scripts/highlighter/ui/Toast.js', () => ({
    Toast: constructorSpies.Toast.mockImplementation(function Toast() {
      this.cleanup = jest.fn();
    }),
  }));

  return import('../../../scripts/highlighter/index.js');
}

beforeEach(() => {
  jest.resetModules();
  cleanupHighlighterGlobals();
  jest.clearAllMocks();
  managerInstances.length = 0;
  storageInstances.length = 0;
  globalThis.chrome = {
    runtime: {
      onMessage: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
    },
  };
});

afterEach(() => {
  cleanupHighlighterGlobals();
});

describe('highlighter index native ESM lifecycle coverage', () => {
  test('initHighlighter creates dependencies and initializes the manager', async () => {
    const { initHighlighter } = await importIndexModule();
    const manager = initHighlighter({ skipRestore: true, styleMode: 'underline' });

    expect(constructorSpies.HighlightManager).toHaveBeenCalledWith({
      skipRestore: true,
      styleMode: 'underline',
    });
    expect(constructorSpies.StyleManager).toHaveBeenCalledWith({
      skipRestore: true,
      styleMode: 'underline',
    });
    expect(constructorSpies.HighlightInteraction).toHaveBeenCalledWith(manager);
    expect(constructorSpies.HighlightMigration).toHaveBeenCalledWith(manager);
    expect(constructorSpies.HighlightStorage).toHaveBeenCalledWith(manager);
    expect(constructorSpies.Toast).toHaveBeenCalledTimes(1);
    expect(manager.setDependencies).toHaveBeenCalledWith(
      expect.objectContaining({
        interaction: expect.any(Object),
        migration: expect.any(Object),
        storage: storageInstances[0],
        styleManager: expect.any(Object),
        toast: expect.any(Object),
      })
    );
    expect(manager.initialize).toHaveBeenCalledWith(true);
    await expect(manager.initializationComplete).resolves.toBeUndefined();
  });

  test('setupHighlighter mounts HighlighterV2, notionHighlighter, and aliases through windowAPI', async () => {
    const { setupHighlighter } = await importIndexModule();
    const result = setupHighlighter({ styleMode: 'background' });

    expect(result).toEqual({
      manager: managerInstances[0],
      restoreManager: storageInstances[0],
    });
    expect(globalThis.HighlighterV2.getInstance()).toBe(managerInstances[0]);
    expect(globalThis.HighlighterV2.getRestoreManager()).toBe(storageInstances[0]);
    expect(globalThis.notionHighlighter.getCount()).toBe(0);
    expect(globalThis.collectHighlights()).toEqual([]);
    expect(typeof globalThis.clearPageHighlights).toBe('function');
  });

  test('skipRestore setup path passes lifecycle option into initialization and mounted init remounts', async () => {
    const { setupHighlighter } = await importIndexModule();

    setupHighlighter({ skipRestore: true });
    expect(managerInstances[0].initialize).toHaveBeenCalledWith(true);

    const nextManager = globalThis.HighlighterV2.init({ skipRestore: false });

    expect(nextManager).toBe(managerInstances[1]);
    expect(managerInstances[1].initialize).toHaveBeenCalledWith(false);
    expect(globalThis.HighlighterV2.getInstance()).toBe(managerInstances[1]);
  });

});
