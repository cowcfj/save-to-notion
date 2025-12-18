/**
 * @jest-environment jsdom
 */

// 【重構】直接導入源代碼（Babel 自動處理 ES Module → CommonJS 轉換）
const {
  COLORS,
  convertBgColorToName,
  getColorCSSVar,
} = require('../../../../scripts/highlighter/utils/color.js');

describe('utils/color', () => {
  describe('COLORS constant', () => {
    test('should have all required colors', () => {
      expect(COLORS).toHaveProperty('yellow');
      expect(COLORS).toHaveProperty('green');
      expect(COLORS).toHaveProperty('blue');
      expect(COLORS).toHaveProperty('red');
    });

    test('should have valid HEX color values', () => {
      expect(COLORS.yellow).toBe('#fff3cd');
      expect(COLORS.green).toBe('#d4edda');
      expect(COLORS.blue).toBe('#cce7ff');
      expect(COLORS.red).toBe('#f8d7da');
    });
  });

  describe('convertBgColorToName', () => {
    test('should convert HEX colors to names', () => {
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

    test('should return default color for unknown values', () => {
      expect(convertBgColorToName('#000000')).toBe('yellow');
      expect(convertBgColorToName('rgb(0, 0, 0)')).toBe('yellow');
      expect(convertBgColorToName('invalid')).toBe('yellow');
      expect(convertBgColorToName('')).toBe('yellow');
    });

    test('should handle undefined and null', () => {
      expect(convertBgColorToName()).toBe('yellow');
      expect(convertBgColorToName(null)).toBe('yellow');
    });
  });

  describe('getColorCSSVar', () => {
    test('should return correct CSS variable names', () => {
      expect(getColorCSSVar('yellow')).toBe('--highlight-yellow');
      expect(getColorCSSVar('green')).toBe('--highlight-green');
      expect(getColorCSSVar('blue')).toBe('--highlight-blue');
      expect(getColorCSSVar('red')).toBe('--highlight-red');
    });

    test('should work with any string', () => {
      expect(getColorCSSVar('custom')).toBe('--highlight-custom');
      expect(getColorCSSVar('')).toBe('--highlight-');
    });
  });
});
