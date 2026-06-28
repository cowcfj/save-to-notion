/**
 * @jest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import {
  cleanupHighlighterGlobals,
  loggerMock,
  flushAsyncLifecycle,
} from './highlighterLifecycleHarness.mjs';

await jest.unstable_mockModule('../../../scripts/utils/Logger.js', () => ({
  default: loggerMock,
}));

const { waitForDOMStability } = await import('../../../scripts/highlighter/utils/domStability.js');
const { deserializeRange, findRangeByTextContent, serializeRange } = await import(
  '../../../scripts/highlighter/core/Range.js'
);
const { getNodeByPath, getNodePath, parsePathFromString } = await import(
  '../../../scripts/highlighter/utils/path.js'
);

beforeEach(() => {
  cleanupHighlighterGlobals();
  jest.clearAllMocks();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
  cleanupHighlighterGlobals();
  document.body.innerHTML = '';
});

describe('highlighter root support native ESM coverage', () => {
  test('waitForDOMStability 在容器可見、穩定時回傳 true；找不到容器回傳 false', async () => {
    document.body.innerHTML = '<div id="container"><p>Root support test</p></div>';

    jest.useFakeTimers();
    const stable = waitForDOMStability({
      containerSelector: '#container',
      initialGracePeriodMs: 0,
      stabilityThresholdMs: 25,
      maxWaitMs: 200,
    });
    jest.advanceTimersByTime(30);

    await expect(stable).resolves.toBe(true);

    await expect(
      waitForDOMStability({
        containerSelector: '#not-found',
        stabilityThresholdMs: 10,
      })
    ).resolves.toBe(false);
    await flushAsyncLifecycle();
    jest.useRealTimers();
  });

  test('DOM path 工具可回傳節點路徑並還原節點', () => {
    document.body.innerHTML = '<main id="root"><p>hello <span>world</span></p></main>';
    const spanTextNode = document.querySelector('span').firstChild;
    const path = getNodePath(spanTextNode);

    expect(typeof path).toBe('string');
    expect(path).toMatch(/main\[[0-9]+\]\/p\[[0-9]+\]\/span\[[0-9]+\]\/text\[[0-9]+\]/);
    expect(parsePathFromString(path)).toEqual([
      { type: 'element', tag: 'main', index: 0 },
      { type: 'element', tag: 'p', index: 0 },
      { type: 'element', tag: 'span', index: 0 },
      { type: 'text', index: 0 },
    ]);
    expect(getNodeByPath(path)).toBe(spanTextNode);
    expect(getNodeByPath('main[0]/bad-step')).toBeNull();
  });

  test('Range serializeRange / deserializeRange 可進行回復與文本驗證', async () => {
    document.body.innerHTML = '<main><p id="a">Root support range case</p></main>';
    const textNode = document.querySelector('#a').firstChild;
    const range = document.createRange();
    range.setStart(textNode, 5);
    range.setEnd(textNode, 12);

    const serialized = serializeRange(range);
    const restored = deserializeRange(serialized, 'support');

    expect(serialized).toEqual(
      expect.objectContaining({
        startOffset: 5,
        endOffset: 12,
        prefix: expect.any(String),
      })
    );
    expect(restored).toBeInstanceOf(Range);
    expect(restored.toString()).toBe('support');

    const fuzzyRange = findRangeByTextContent('support');
    expect(fuzzyRange).toBeInstanceOf(Range);
    expect(fuzzyRange.toString()).toBe('support');
  });
});
