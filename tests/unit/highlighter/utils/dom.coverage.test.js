/**
 * @jest-environment jsdom
 */

import {
  supportsHighlightAPI,
  isValidElement,
  getVisibleText,
  isInViewport,
  getAttribute,
} from '../../../../scripts/highlighter/utils/dom.js';

describe('DOM Utils Coverage Tests', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('supportsHighlightAPI', () => {
    test('should return true when CSS.highlights is available', () => {
      global.CSS = {
        highlights: new Map(),
      };

      expect(supportsHighlightAPI()).toBe(true);
    });

    test('should return false when CSS is undefined', () => {
      const originalCSS = global.CSS;
      delete global.CSS;

      expect(supportsHighlightAPI()).toBe(false);

      global.CSS = originalCSS;
    });

    test('should return false when highlights is not in CSS', () => {
      global.CSS = {};

      expect(supportsHighlightAPI()).toBe(false);
    });
  });

  describe('isValidElement', () => {
    test('should return true for valid Element', () => {
      const div = document.createElement('div');
      expect(isValidElement(div)).toBe(true);
    });

    test('should return false for null', () => {
      expect(isValidElement(null)).toBe(false);
    });

    test('should return false for undefined', () => {
      expect(isValidElement()).toBe(false);
    });

    test('should return false for text node', () => {
      const textNode = document.createTextNode('text');
      expect(isValidElement(textNode)).toBe(false);
    });

    test('should return false for plain object', () => {
      expect(isValidElement({})).toBe(false);
    });

    test('should return false for string', () => {
      expect(isValidElement('div')).toBe(false);
    });
  });

  describe('getVisibleText', () => {
    test('should return text for visible element', () => {
      const div = document.createElement('div');
      div.textContent = '  Test content  ';
      document.body.appendChild(div);

      expect(getVisibleText(div)).toBe('Test content');
    });

    test('should return empty string for element with display:none', () => {
      const div = document.createElement('div');
      div.textContent = 'Hidden';
      div.style.display = 'none';
      document.body.appendChild(div);

      expect(getVisibleText(div)).toBe('');
    });

    test('should return empty string for element with visibility:hidden', () => {
      const div = document.createElement('div');
      div.textContent = 'Hidden';
      div.style.visibility = 'hidden';
      document.body.appendChild(div);

      expect(getVisibleText(div)).toBe('');
    });

    test('should return empty string for element with opacity:0', () => {
      const div = document.createElement('div');
      div.textContent = 'Hidden';
      div.style.opacity = '0';
      document.body.appendChild(div);

      expect(getVisibleText(div)).toBe('');
    });

    test('should return empty string for invalid element', () => {
      expect(getVisibleText(null)).toBe('');
      expect(getVisibleText()).toBe('');
    });

    test('should return empty string for element without text', () => {
      const div = document.createElement('div');
      document.body.appendChild(div);

      expect(getVisibleText(div)).toBe('');
    });
  });

  describe('isInViewport', () => {
    test('should return true for element in viewport', () => {
      const div = document.createElement('div');
      div.style.position = 'absolute';
      div.style.top = '0px';
      div.style.left = '0px';
      div.style.width = '100px';
      div.style.height = '100px';
      document.body.appendChild(div);

      // Mock getBoundingClientRect
      div.getBoundingClientRect = jest.fn(() => ({
        top: 0,
        left: 0,
        bottom: 100,
        right: 100,
        width: 100,
        height: 100,
      }));

      expect(isInViewport(div)).toBe(true);
    });

    test('should return false for element outside viewport (below)', () => {
      const div = document.createElement('div');
      document.body.appendChild(div);

      div.getBoundingClientRect = jest.fn(() => ({
        top: window.innerHeight + 100,
        left: 0,
        bottom: window.innerHeight + 200,
        right: 100,
        width: 100,
        height: 100,
      }));

      expect(isInViewport(div)).toBe(false);
    });

    test('should return false for element outside viewport (right)', () => {
      const div = document.createElement('div');
      document.body.appendChild(div);

      div.getBoundingClientRect = jest.fn(() => ({
        top: 0,
        left: window.innerWidth + 100,
        bottom: 100,
        right: window.innerWidth + 200,
        width: 100,
        height: 100,
      }));

      expect(isInViewport(div)).toBe(false);
    });

    test('should return false for invalid element', () => {
      expect(isInViewport(null)).toBe(false);
      expect(isInViewport()).toBe(false);
    });
  });

  describe('getAttribute', () => {
    test('should return attribute value when it exists', () => {
      const div = document.createElement('div');
      div.setAttribute('data-id', '123');

      expect(getAttribute(div, 'data-id')).toBe('123');
    });

    test('should return default value when attribute does not exist', () => {
      const div = document.createElement('div');

      expect(getAttribute(div, 'data-id', 'default')).toBe('default');
    });

    test('should return null as default when not specified', () => {
      const div = document.createElement('div');

      expect(getAttribute(div, 'data-id')).toBeNull();
    });

    test('should return default value for invalid element', () => {
      expect(getAttribute(null, 'data-id', 'default')).toBe('default');
      expect(getAttribute(undefined, 'data-id', 'default')).toBe('default');
    });

    test('should handle empty string attribute value', () => {
      const div = document.createElement('div');
      div.setAttribute('data-value', '');

      expect(getAttribute(div, 'data-value', 'default')).toBe('');
    });
  });
});
