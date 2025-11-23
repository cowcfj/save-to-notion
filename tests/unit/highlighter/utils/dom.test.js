/**
 * @jest-environment jsdom
 */

const {
    supportsHighlightAPI,
    isValidElement,
    getVisibleText,
    isInViewport,
    getAttribute
} = require('../../../helpers/highlighter/utils/dom.testable.js');

describe('utils/dom', () => {
    describe('supportsHighlightAPI', () => {
        test('should return boolean', () => {
            const result = supportsHighlightAPI();
            expect(typeof result).toBe('boolean');
        });

        test('should return false in jsdom (no CSS.highlights support)', () => {
            // jsdom 不支援 CSS Highlight API
            expect(supportsHighlightAPI()).toBe(false);
        });
    });

    describe('isValidElement', () => {
        test('should return true for valid elements', () => {
            const div = document.createElement('div');
            expect(isValidElement(div)).toBe(true);
        });

        test('should return false for null', () => {
            expect(isValidElement(null)).toBe(false);
        });

        test('should return false for undefined', () => {
            expect(isValidElement()).toBe(false);
        });

        test('should return false for non-Element types', () => {
            expect(isValidElement({})).toBe(false);
            expect(isValidElement('string')).toBe(false);
            expect(isValidElement(123)).toBe(false);
            expect(isValidElement(true)).toBe(false);
        });

        test('should return true for different element types', () => {
            expect(isValidElement(document.createElement('div'))).toBe(true);
            expect(isValidElement(document.createElement('span'))).toBe(true);
            expect(isValidElement(document.createElement('p'))).toBe(true);
        });
    });

    describe('getVisibleText', () => {
        test('should return text content of element', () => {
            const div = document.createElement('div');
            div.textContent = 'Hello World';
            expect(getVisibleText(div)).toBe('Hello World');
        });

        test('should trim whitespace', () => {
            const div = document.createElement('div');
            div.textContent = '  Hello World  ';
            expect(getVisibleText(div)).toBe('Hello World');
        });

        test('should return empty string for null', () => {
            expect(getVisibleText(null)).toBe('');
        });

        test('should return empty string for invalid element', () => {
            expect(getVisibleText({})).toBe('');
        });

        test('should return empty string for element with no text', () => {
            const div = document.createElement('div');
            expect(getVisibleText(div)).toBe('');
        });
    });

    describe('isInViewport', () => {
        test('should return false for null', () => {
            expect(isInViewport(null)).toBe(false);
        });

        test('should return false for invalid element', () => {
            expect(isInViewport({})).toBe(false);
        });

        test('should handle elements with getBoundingClientRect', () => {
            const div = document.createElement('div');
            document.body.appendChild(div);

            // 在 jsdom 中，元素默認是在視口內的（所有座標都是 0）
            const result = isInViewport(div);
            expect(typeof result).toBe('boolean');

            document.body.removeChild(div);
        });
    });

    describe('getAttribute', () => {
        test('should return attribute value', () => {
            const div = document.createElement('div');
            div.setAttribute('data-id', '123');
            expect(getAttribute(div, 'data-id')).toBe('123');
        });

        test('should return default value for missing attribute', () => {
            const div = document.createElement('div');
            expect(getAttribute(div, 'data-id', 'default')).toBe('default');
        });

        test('should return null as default when not specified', () => {
            const div = document.createElement('div');
            expect(getAttribute(div, 'data-id')).toBe(null);
        });

        test('should return default value for null element', () => {
            expect(getAttribute(null, 'data-id', 'default')).toBe('default');
        });

        test('should return default value for invalid element', () => {
            expect(getAttribute({}, 'data-id', 'default')).toBe('default');
        });

        test('should work with different attribute types', () => {
            const div = document.createElement('div');
            div.setAttribute('id', 'test');
            div.setAttribute('class', 'my-class');
            div.setAttribute('data-value', '42');

            expect(getAttribute(div, 'id')).toBe('test');
            expect(getAttribute(div, 'class')).toBe('my-class');
            expect(getAttribute(div, 'data-value')).toBe('42');
        });
    });
});
