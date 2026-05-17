/**
 * @jest-environment jsdom
 *
 * StyleManager 必須以 chrome.runtime.id 作 namespace 邊界。
 *
 * 場景：商店版 + 測試版兩個 extension 同時注入同一頁面時，page-global 的
 * `CSS.highlights` registry 與 `<style id="...">` 元素都會被後初始化的覆蓋，
 * 導致前者的 highlight ranges 失去視覺渲染。
 *
 * 修復前：兩個 instance 都寫 `CSS.highlights.set('notion-yellow', ...)`
 *         與 `<style id="notion-highlight-styles">`，互相覆蓋。
 * 修復後：key 與 element id 都帶 `chrome.runtime.id` namespace，互不影響。
 */

import { StyleManager } from '../../../../scripts/highlighter/core/StyleManager.js';
import { COLORS } from '../../../../scripts/highlighter/utils/color.js';

jest.mock('../../../../scripts/highlighter/utils/dom.js', () => ({
  supportsHighlightAPI: jest.fn(() => true),
}));

jest.mock('../../../../scripts/utils/Logger.js', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
}));

function setRuntimeId(id) {
  globalThis.chrome = globalThis.chrome ?? { runtime: {} };
  globalThis.chrome.runtime = globalThis.chrome.runtime ?? {};
  globalThis.chrome.runtime.id = id;
}

function highlightKeysForRuntimeId(id) {
  return CSS.highlights.set.mock.calls
    .map(args => args[0])
    .filter(key => typeof key === 'string' && key.includes(id));
}

describe('core/StyleManager — chrome.runtime.id namespace', () => {
  const ORIGINAL_RUNTIME_ID = globalThis.chrome?.runtime?.id;

  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';

    globalThis.CSS = {
      highlights: {
        set: jest.fn(),
        get: jest.fn(),
        delete: jest.fn(),
        clear: jest.fn(),
      },
    };

    globalThis.Highlight = jest.fn().mockImplementation(() => ({
      add: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
    }));
    globalThis.Highlight.toString = () => 'function Highlight() { [native code] }';
  });

  afterEach(() => {
    if (globalThis.chrome?.runtime) {
      globalThis.chrome.runtime.id = ORIGINAL_RUNTIME_ID;
    }
  });

  test('CSS.highlights.set key 必須帶 chrome.runtime.id，避免兩個 extension 互覆蓋', () => {
    setRuntimeId('ext-aaa');
    new StyleManager().initialize();

    const colorCount = Object.keys(COLORS).length;
    const aaaKeys = highlightKeysForRuntimeId('ext-aaa');

    expect(aaaKeys).toHaveLength(colorCount);
    Object.keys(COLORS).forEach(color => {
      expect(aaaKeys).toEqual(expect.arrayContaining([expect.stringContaining(color)]));
    });

    Object.keys(COLORS).forEach(color => {
      expect(CSS.highlights.set).not.toHaveBeenCalledWith(`notion-${color}`, expect.anything());
    });
  });

  test('兩個 StyleManager instance（不同 runtime.id）不應註冊到相同的 CSS.highlights key', () => {
    setRuntimeId('ext-aaa');
    new StyleManager().initialize();
    const aaaKeys = highlightKeysForRuntimeId('ext-aaa');

    setRuntimeId('ext-bbb');
    new StyleManager().initialize();
    const bbbKeys = highlightKeysForRuntimeId('ext-bbb');

    const intersection = aaaKeys.filter(key => bbbKeys.includes(key));
    expect(intersection).toEqual([]);

    Object.keys(COLORS).forEach(color => {
      expect(aaaKeys).toEqual(expect.arrayContaining([expect.stringContaining(color)]));
      expect(bbbKeys).toEqual(expect.arrayContaining([expect.stringContaining(color)]));
    });
  });

  test('<style> 元素 id 必須帶 namespace，兩個 extension 不會互相覆蓋 stylesheet', () => {
    setRuntimeId('ext-aaa');
    new StyleManager().initialize();

    setRuntimeId('ext-bbb');
    new StyleManager().initialize();

    const styleElements = document.head.querySelectorAll('style[id^="notion-highlight-styles"]');
    expect(styleElements).toHaveLength(2);

    const ids = Array.from(styleElements).map(el => el.id);
    expect(ids).toEqual(expect.arrayContaining([expect.stringContaining('ext-aaa')]));
    expect(ids).toEqual(expect.arrayContaining([expect.stringContaining('ext-bbb')]));
  });

  test('cleanup 只能移除自己 namespace 下的 highlights，不可誤刪其他 extension 的', () => {
    setRuntimeId('ext-aaa');
    const managerA = new StyleManager();
    managerA.initialize();

    setRuntimeId('ext-bbb');
    const managerB = new StyleManager();
    managerB.initialize();

    CSS.highlights.delete.mockClear();
    managerA.cleanup();

    const deletedKeys = CSS.highlights.delete.mock.calls.map(args => args[0]);

    expect(deletedKeys.length).toBeGreaterThan(0);
    deletedKeys.forEach(key => {
      expect(key).toEqual(expect.stringContaining('ext-aaa'));
      expect(key).not.toEqual(expect.stringContaining('ext-bbb'));
    });
  });

  test('CSS rule `::highlight(...)` 名稱必須與註冊的 key 一致（含 namespace）', () => {
    setRuntimeId('ext-aaa');
    new StyleManager().initialize();

    const styleEl = document.head.querySelector('style[id^="notion-highlight-styles"]');
    expect(styleEl).not.toBeNull();

    Object.keys(COLORS).forEach(color => {
      expect(styleEl.textContent).toContain(`::highlight(notion-ext-aaa-${color})`);
      expect(styleEl.textContent).not.toMatch(
        new RegExp(String.raw`::highlight\(notion-${color}\)`)
      );
    });
  });
});
