/**
 * 顏色管理模組
 * 提供標註顏色常量和轉換功能
 */

/**
 * 標註顏色常量
 *
 * @type {Object.<string, string>}
 */
export const COLORS = {
  yellow: '#fff3cd',
  green: '#d4edda',
  blue: '#cce7ff',
  red: '#f8d7da',
};

/**
 * 標註文字顏色常量 (用於 Text Mode)
 * 使用較深/飽和的顏色以確保在淺色背景上的可讀性
 *
 * @type {Object.<string, string>}
 */
export const TEXT_COLORS = {
  yellow: '#d97706', // Amber 600
  green: '#059669', // Emerald 600
  blue: '#2563eb', // Blue 600
  red: '#dc2626', // Red 600
};

/**
 * 有效的標註樣式模式
 *
 * @type {string[]}
 */
export const VALID_STYLES = ['background', 'text', 'underline'];

/**
 * 轉換背景顏色（RGB 或 HEX）到顏色名稱
 *
 * @param {string} bgColor - 背景顏色（RGB 格式或 HEX 格式）
 * @returns {string} 顏色名稱（yellow|green|blue|red），默認 'yellow'
 * @example
 * convertBgColorToName('#fff3cd') // 'yellow'
 * convertBgColorToName('rgb(255, 243, 205)') // 'yellow'
 */
export function convertBgColorToName(bgColor) {
  const colorMap = {
    // RGB 格式
    'rgb(255, 243, 205)': 'yellow',
    'rgb(212, 237, 218)': 'green',
    'rgb(204, 231, 255)': 'blue',
    'rgb(248, 215, 218)': 'red',
    // HEX 格式
    '#fff3cd': 'yellow',
    '#d4edda': 'green',
    '#cce7ff': 'blue',
    '#f8d7da': 'red',
  };

  return colorMap[bgColor] || 'yellow';
}

/**
 * 獲取顏色的 CSS 變數名
 *
 * @param {string} colorName - 顏色名稱
 * @returns {string} CSS 變數名
 * @example
 * getColorCSSVar('yellow') // '--highlight-yellow'
 */
export function getColorCSSVar(colorName) {
  return `--highlight-${colorName}`;
}
