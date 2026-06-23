/**
 * @jest-environment jsdom
 */

import { afterEach, describe, expect, jest, test } from '@jest/globals';
import {
  getAttribute,
  getVisibleText,
  isInViewport,
  isValidElement,
} from '../../../../scripts/highlighter/utils/dom.js';
import { waitForDOMStability } from '../../../../scripts/highlighter/utils/domStability.js';
import {
  getNodeByPath,
  getNodePath,
  isValidPathString,
  parsePathFromString,
} from '../../../../scripts/highlighter/utils/path.js';
import {
  findTextFuzzy,
  findTextInPage,
  findTextWithTreeWalker,
} from '../../../../scripts/highlighter/utils/textSearch.js';

afterEach(() => {
  jest.useRealTimers();
  document.body.innerHTML = '';
});

describe('DOM/text native ESM diagnostics', () => {
  test('native ESM jsdom environment is available', () => {
    document.body.innerHTML = '<main><p>Hello</p></main>';
    expect(document.querySelector('p').textContent).toBe('Hello');
  });

  test('dom helpers validate elements, visible text, viewport, and attributes', () => {
    document.body.innerHTML = `
      <main>
        <p id="visible" data-id="p1">Hello <span>World</span></p>
        <p id="hidden" style="display: none">Hidden</p>
      </main>
    `;
    const visible = document.querySelector('#visible');
    const hidden = document.querySelector('#hidden');
    visible.getBoundingClientRect = () => ({
      top: 0,
      left: 0,
      bottom: 10,
      right: 10,
    });

    expect(isValidElement(visible)).toBe(true);
    expect(isValidElement(null)).toBe(false);
    expect(getVisibleText(visible)).toBe('Hello World');
    expect(getVisibleText(hidden)).toBe('');
    expect(isInViewport(visible)).toBe(true);
    expect(isInViewport(null)).toBe(false);
    expect(getAttribute(visible, 'data-id')).toBe('p1');
    expect(getAttribute(null, 'data-id', 'fallback')).toBe('fallback');
  });

  test('path helpers serialize text nodes, resolve paths, and reject invalid input', () => {
    document.body.innerHTML = '<main><p>Alpha <span>Beta</span></p></main>';
    const textNode = document.querySelector('span').firstChild;
    const path = getNodePath(textNode);

    expect(path).toBe('main[0]/p[0]/span[0]/text[0]');
    expect(getNodeByPath(path)).toBe(textNode);
    expect(getNodeByPath('main[0]/missing')).toBeNull();
    expect(parsePathFromString(path)).toEqual([
      { type: 'element', tag: 'main', index: 0 },
      { type: 'element', tag: 'p', index: 0 },
      { type: 'element', tag: 'span', index: 0 },
      { type: 'text', index: 0 },
    ]);
    expect(parsePathFromString('main[0]/bad-step')).toBeNull();
    expect(isValidPathString(path)).toBe(true);
    expect(isValidPathString('main[0]/bad-step')).toBe(false);
  });

  test('domStability resolves true for stable containers and false for missing containers', async () => {
    document.body.innerHTML = '<main id="root"><p>Stable</p></main>';
    jest.useFakeTimers();

    const stable = waitForDOMStability({
      containerSelector: '#root',
      stabilityThresholdMs: 10,
      maxWaitMs: 100,
      initialGracePeriodMs: 0,
    });
    await jest.advanceTimersByTimeAsync(0);
    await expect(stable).resolves.toBe(true);

    await expect(waitForDOMStability({ containerSelector: '#missing' })).resolves.toBe(false);
  });

  test('text search finds exact, cross-node, and fuzzy whitespace matches', () => {
    document.body.innerHTML = `
      <main>
        <p>Alpha exact target.</p>
        <p>split <span>cross</span> nodes</p>
        <p>Fuzzy   spacing target</p>
        <p>first target here</p>
        <p>matching target chosen</p>
      </main>
    `;

    expect(findTextWithTreeWalker('exact target').toString()).toBe('exact target');
    expect(findTextWithTreeWalker('split cross nodes').toString().trim()).toBe('split cross nodes');
    expect(findTextFuzzy('Fuzzy spacing target').toString()).toBe('Fuzzy   spacing target');
    expect(findTextInPage('missing text')).toBeNull();
    expect(findTextInPage('Fuzzy spacing target', { prefix: 'Alpha', suffix: '' }).toString()).toBe(
      'Fuzzy   spacing target'
    );
    expect(findTextFuzzy('target', { prefix: 'matching ' }).toString()).toBe('target');
  });
});
