/**
 * @jest-environment jsdom
 */

const {
    isNonEmptyString,
    isValidRange,
    isCollapsedRange,
    isValidColor,
    isValidUrl,
    isValidHighlightId,
    isValidHighlightData
} = require('../../../helpers/highlighter/utils/validation.testable.js');

describe('utils/validation', () => {
    describe('isNonEmptyString', () => {
        test('should return true for non-empty strings', () => {
            expect(isNonEmptyString('hello')).toBe(true);
            expect(isNonEmptyString('  text  ')).toBe(true);
            expect(isNonEmptyString('a')).toBe(true);
        });

        test('should return false for empty strings', () => {
            expect(isNonEmptyString('')).toBe(false);
            expect(isNonEmptyString('   ')).toBe(false);
            expect(isNonEmptyString('\t\n')).toBe(false);
        });

        test('should return false for non-string types', () => {
            expect(isNonEmptyString(null)).toBe(false);
            expect(isNonEmptyString(undefined)).toBe(false);
            expect(isNonEmptyString(123)).toBe(false);
            expect(isNonEmptyString({})).toBe(false);
            expect(isNonEmptyString([])).toBe(false);
        });
    });

    describe('isValidRange', () => {
        test('should return true for valid Range objects', () => {
            const range = document.createRange();
            expect(isValidRange(range)).toBe(true);
        });

        test('should return false for null/undefined', () => {
            expect(isValidRange(null)).toBe(false);
            expect(isValidRange(undefined)).toBe(false);
        });

        test('should return false for invalid objects', () => {
            expect(isValidRange({})).toBe(false);
            expect(isValidRange({ startContainer: null })).toBe(false);
            expect(isValidRange('range')).toBe(false);
        });
    });

    describe('isCollapsedRange', () => {
        test('should return true for collapsed ranges', () => {
            const range = document.createRange();
            // 新創建的 range 默認是 collapsed
            expect(isCollapsedRange(range)).toBe(true);
        });

        test('should return false for non-collapsed ranges', () => {
            const div = document.createElement('div');
            div.textContent = 'Hello World';
            document.body.appendChild(div);

            const range = document.createRange();
            range.setStart(div.firstChild, 0);
            range.setEnd(div.firstChild, 5);

            expect(isCollapsedRange(range)).toBe(false);

            document.body.removeChild(div);
        });

        test('should return true for invalid ranges', () => {
            expect(isCollapsedRange(null)).toBe(true);
            expect(isCollapsedRange({})).toBe(true);
        });
    });

    describe('isValidColor', () => {
        test('should return true for valid colors', () => {
            expect(isValidColor('yellow')).toBe(true);
            expect(isValidColor('green')).toBe(true);
            expect(isValidColor('blue')).toBe(true);
            expect(isValidColor('red')).toBe(true);
        });

        test('should return false for invalid colors', () => {
            expect(isValidColor('purple')).toBe(false);
            expect(isValidColor('orange')).toBe(false);
            expect(isValidColor('')).toBe(false);
            expect(isValidColor(null)).toBe(false);
        });
    });

    describe('isValidUrl', () => {
        test('should return true for valid URLs', () => {
            expect(isValidUrl('https://example.com')).toBe(true);
            expect(isValidUrl('http://test.org')).toBe(true);
            expect(isValidUrl('https://example.com/path?query=1')).toBe(true);
        });

        test('should return false for invalid URLs', () => {
            expect(isValidUrl('not a url')).toBe(false);
            expect(isValidUrl('')).toBe(false);
            expect(isValidUrl('   ')).toBe(false);
        });

        test('should return false for non-string types', () => {
            expect(isValidUrl(null)).toBe(false);
            expect(isValidUrl(undefined)).toBe(false);
            expect(isValidUrl(123)).toBe(false);
        });
    });

    describe('isValidHighlightId', () => {
        test('should return true for valid highlight IDs', () => {
            expect(isValidHighlightId('h1')).toBe(true);
            expect(isValidHighlightId('h123')).toBe(true);
            expect(isValidHighlightId('h999')).toBe(true);
        });

        test('should return false for invalid IDs', () => {
            expect(isValidHighlightId('1')).toBe(false);
            expect(isValidHighlightId('highlight1')).toBe(false);
            expect(isValidHighlightId('h')).toBe(false);
            expect(isValidHighlightId('habc')).toBe(false);
            expect(isValidHighlightId('')).toBe(false);
            expect(isValidHighlightId(null)).toBe(false);
        });
    });

    describe('isValidHighlightData', () => {
        test('should return true for valid highlight data', () => {
            expect(isValidHighlightData({
                id: 'h1',
                text: 'test text',
                color: 'yellow'
            })).toBe(true);

            expect(isValidHighlightData({
                id: 'h123',
                text: 'another text',
                color: 'blue'
            })).toBe(true);
        });

        test('should return false for missing fields', () => {
            expect(isValidHighlightData({
                text: 'test',
                color: 'yellow'
            })).toBe(false);

            expect(isValidHighlightData({
                id: 'h1',
                color: 'yellow'
            })).toBe(false);

            expect(isValidHighlightData({
                id: 'h1',
                text: 'test'
            })).toBe(false);
        });

        test('should return false for invalid field values', () => {
            expect(isValidHighlightData({
                id: 'invalid',
                text: 'test',
                color: 'yellow'
            })).toBe(false);

            expect(isValidHighlightData({
                id: 'h1',
                text: '',
                color: 'yellow'
            })).toBe(false);

            expect(isValidHighlightData({
                id: 'h1',
                text: 'test',
                color: 'purple'
            })).toBe(false);
        });

        test('should return false for non-objects', () => {
            expect(isValidHighlightData(null)).toBe(false);
            expect(isValidHighlightData(undefined)).toBe(false);
            expect(isValidHighlightData('string')).toBe(false);
            expect(isValidHighlightData(123)).toBe(false);
        });
    });
});
