/**
 * @jest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import {
  cleanupHighlighterGlobals,
  createManagerMock,
  createRailMock,
  createStorageMock,
  loggerMock,
} from './highlighterLifecycleHarness.mjs';

await jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
  default: loggerMock,
}));

const { HighlightManager } = await import('../../../scripts/highlighter/core/HighlightManager.js');
const { mountWindowAPI } = await import('../../../scripts/highlighter/windowAPI.js');

function mountWithMocks({ manager = createManagerMock(), storage = createStorageMock(), fns } = {}) {
  mountWindowAPI({ manager, storage, fns });
  return { manager, storage };
}

beforeEach(() => {
  cleanupHighlighterGlobals();
  jest.clearAllMocks();
});

afterEach(() => {
  cleanupHighlighterGlobals();
});

describe('windowAPI native ESM lifecycle coverage', () => {
  test('mountWindowAPI installs HighlighterV2, notionHighlighter, and global aliases', () => {
    const init = jest.fn(() => 'next-manager');
    const { manager, storage } = mountWithMocks({ fns: { init } });

    expect(globalThis.HighlighterV2.getInstance()).toBe(manager);
    expect(globalThis.HighlighterV2.getRestoreManager()).toBe(storage);
    expect(globalThis.HighlighterV2.init()).toBe('next-manager');
    expect(globalThis.notionHighlighter.manager).toBe(manager);
    expect(typeof globalThis.initHighlighter).toBe('function');
    expect(typeof globalThis.collectHighlights).toBe('function');
    expect(typeof globalThis.clearPageHighlights).toBe('function');
  });

  test('notionHighlighter delegates collection, restore, count, and rail visibility behavior', () => {
    const { manager, storage } = mountWithMocks();
    const rail = createRailMock({ currentState: 'collapsed' });
    globalThis.HighlighterV2.rail = rail;

    expect(globalThis.notionHighlighter.collectHighlights()).toEqual([
      { id: 'h1', text: 'Native ESM' },
    ]);
    expect(globalThis.notionHighlighter.getCount()).toBe(1);
    globalThis.notionHighlighter.forceRestoreHighlights();
    globalThis.notionHighlighter.show();
    globalThis.notionHighlighter.toggle();
    globalThis.notionHighlighter.minimize();

    expect(manager.collectHighlightsForNotion).toHaveBeenCalledTimes(1);
    expect(manager.getCount).toHaveBeenCalledTimes(1);
    expect(storage.restore).toHaveBeenCalledTimes(1);
    expect(rail.show).toHaveBeenCalledTimes(2);
    expect(rail.collapse).toHaveBeenCalledTimes(1);

    rail.stateManager.currentState = 'expanded';
    globalThis.notionHighlighter.toggle();
    expect(rail.hide).toHaveBeenCalledTimes(1);
    expect(globalThis.notionHighlighter.isActive()).toBe(true);
  });

  test('global aliases stay safe when notionHighlighter is unavailable', () => {
    mountWithMocks();
    delete globalThis.notionHighlighter;

    expect(globalThis.initHighlighter()).toBeUndefined();
    expect(globalThis.collectHighlights()).toEqual([]);
    expect(() => globalThis.clearPageHighlights()).not.toThrow();
  });

  test('clearPageHighlights uses skip-storage while clearAll keeps default save behavior', () => {
    const styleManager = {
      clearAllHighlights: jest.fn(),
      getHighlightObject: jest.fn(),
      initialize: jest.fn(),
    };
    const storage = createStorageMock();
    const manager = new HighlightManager();
    manager.setDependencies({
      interaction: null,
      migration: null,
      storage,
      styleManager,
    });
    manager.highlights.set('h1', {
      color: 'yellow',
      id: 'h1',
      rangeInfo: {},
      text: 'Native ESM',
      timestamp: 1,
    });

    mountWithMocks({ manager, storage });
    globalThis.clearPageHighlights();

    expect(manager.highlights.size).toBe(0);
    expect(styleManager.clearAllHighlights).toHaveBeenCalledTimes(1);
    expect(storage.save).not.toHaveBeenCalled();

    manager.highlights.set('h2', {
      color: 'blue',
      id: 'h2',
      rangeInfo: {},
      text: 'Save path',
      timestamp: 2,
    });
    globalThis.notionHighlighter.clearAll();

    expect(styleManager.clearAllHighlights).toHaveBeenCalledTimes(2);
    expect(storage.save).toHaveBeenCalledTimes(1);
  });

  test('missing rail warnings stay observable through Logger metadata', () => {
    mountWithMocks();

    expect(globalThis.notionHighlighter.isActive()).toBe(false);
    globalThis.notionHighlighter.show();

    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('isActive'),
      expect.objectContaining({ action: 'isActive', reason: 'rail_missing' })
    );
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('舊版 UI 控制器不可用'),
      expect.objectContaining({ action: 'getLegacyUiController', reason: 'rail_missing' })
    );
  });
});
