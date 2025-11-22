/**
 * @jest-environment jsdom
 */

import { COLORS, convertBgColorToName, getColorCSSVar } from '../../../../scripts/highlighter/utils/color.js';

describe('Color Utils Coverage Tests', () => {
    describe('COLORS constant', () => {
        test('should have all required colors', () => {
            expect(COLORS).toHaveProperty('yellow');
            expect(COLORS).toHaveProperty('green');
            expect(COLORS).toHaveProperty('blue');
            expect(COLORS).toHaveProperty('red');
        });

        test('should have correct hex values', () => {
            expect(COLORS.yellow).toBe('#fff3cd');
            expect(COLORS.green).toBe('#d4edda');
            expect(COLORS.blue).toBe('#cce7ff');
            expect(COLORS.red).toBe('#f8d7da');
        });
    });

    describe('convertBgColorToName', () => {
        test('should convert hex colors to names', () => {
            expect(convertBgColorToName('#fff3cd')).toBe('yellow');
            expect(convertBgColorToName('#d4edda')).toBe('green');
            expect(convertBgColorToName('#cce7ff')).toBe('blue');
            expect(convertBgColorToName('#f8d7da')).toBe('red');
        });

        test('should convert RGB colors to names', () => {
            expect(convertBgColorToName('rgb(255, 243, 205)')).toBe('yellow');
            expect(convertBgColorToName('rgb(212, 237, 218)')).toBe('green');
            expect(convertBgColorToName('rgb(204, 231, 255)')).toBe('blue');
            expect(convertBgColorToName('rgb(248, 215, 218)')).toBe('red');
        });

        test('should default to yellow for unknown colors', () => {
            expect(convertBgColorToName('#000000')).toBe('yellow');
            expect(convertBgColorToName('rgb(0, 0, 0)')).toBe('yellow');
            expect(convertBgColorToName('purple')).toBe('yellow');
            expect(convertBgColorToName('')).toBe('yellow');
            expect(convertBgColorToName(null)).toBe('yellow');
            expect(convertBgColorToName(undefined)).toBe('yellow');
        });
    });

    describe('getColorCSSVar', () => {
        test('should return CSS variable name for valid colors', () => {
            expect(getColorCSSVar('yellow')).toBe('--highlight-yellow');
            expect(getColorCSSVar('green')).toBe('--highlight-green');
            expect(getColorCSSVar('blue')).toBe('--highlight-blue');
            expect(getColorCSSVar('red')).toBe('--highlight-red');
        });

        test('should work with any string input', () => {
            expect(getColorCSSVar('custom')).toBe('--highlight-custom');
            expect(getColorCSSVar('')).toBe('--highlight-');
        });
    });
});
