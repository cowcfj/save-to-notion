/**
 * @jest-environment jsdom
 */

import { describe, expect, jest, test } from '@jest/globals';
import {
  convertBgColorToName,
  COLORS,
  getColorCSSVar,
} from '../../../../scripts/highlighter/utils/color.js';
import {
  isCollapsedRange,
  isNonEmptyString,
  isValidColor,
  isValidHighlightData,
  isValidRange,
  isValidUrl,
} from '../../../../scripts/highlighter/utils/validation.js';

await jest.unstable_mockModule('../../../../scripts/utils/Logger.js', () => ({
  default: {
    warn: jest.fn(),
  },
}));

const { createSafeIcon, sanitizeSvgIcon } = await import(
  '../../../../scripts/highlighter/utils/safeIcon.js'
);

describe('highlighter pure utility native ESM diagnostics', () => {
  test('color helpers expose stable constants and conversion fallbacks', () => {
    expect(COLORS.blue).toBe('#cce7ff');
    expect(convertBgColorToName('rgb(255, 243, 205)')).toBe('yellow');
    expect(convertBgColorToName('#f8d7da')).toBe('red');
    expect(convertBgColorToName('unknown')).toBe('yellow');
    expect(getColorCSSVar('green')).toBe('--highlight-green');
  });

  test('validation helpers cover url, range, color, and highlight data branches', () => {
    const textNode = document.createTextNode('hello world');
    document.body.append(textNode);
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);

    expect(isNonEmptyString(' value ')).toBe(true);
    expect(isNonEmptyString('   ')).toBe(false);
    expect(isValidRange(range)).toBe(true);
    expect(isCollapsedRange(range)).toBe(false);
    expect(isValidColor('yellow')).toBe(true);
    expect(isValidColor('purple')).toBe(false);
    expect(isValidUrl('https://example.com/path')).toBe(true);
    expect(isValidUrl('not a url')).toBe(false);
    expect(isValidHighlightData({ id: 'h1', text: 'text', color: 'yellow' })).toBe(true);
    expect(isValidHighlightData({ id: 'bad', text: 'text', color: 'yellow' })).toBe(false);

    textNode.remove();
  });

  test('safeIcon sanitizes SVG input and falls back to text spans', () => {
    const sanitized = sanitizeSvgIcon(
      '<svg viewBox="0 0 24 24"><script>alert(1)</script><path d="M1" /></svg>'
    );
    expect(sanitized).toContain('<svg');
    expect(sanitized).not.toContain('<script>');

    const textIcon = createSafeIcon('Save');
    expect(textIcon.tagName).toBe('SPAN');
    expect(textIcon.textContent).toBe('Save');
    expect(textIcon.querySelector('svg')).toBeNull();

    const svgIcon = createSafeIcon('<svg viewBox="0 0 24 24"><path d="M1" /></svg>');
    const svg = svgIcon.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg.classList.contains('icon-svg')).toBe(true);
    expect(svg.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
  });
});
