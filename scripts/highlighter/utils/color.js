/**
 * 顏色管理模組
 * 提供標註顏色常量和轉換功能
 */

/**
 * 標註顏色常量
 * @type {Object.<string, string>}
 */
export const COLORS = {
    yellow: '#fff3cd',
    green: '#d4edda',
    blue: '#cce7ff',
    red: '#f8d7da'
};

/**
 * 轉換背景顏色（RGB 或 HEX）到顏色名稱
 * @param {string} bgColor - 背景顏色（RGB 格式或 HEX 格式）
 * @returns {string} 顏色名稱（yellow|green|blue|red），默認 'yellow'
 * 
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
        '#f8d7da': 'red'
    };

    return colorMap[bgColor] || 'yellow';
}

/**
 * 獲取顏色的 CSS 變數名
 * @param {string} colorName - 顏色名稱
 * @returns {string} CSS 變數名
 * 
 * @example
 * getColorCSSVar('yellow') // '--highlight-yellow'
 */
export function getColorCSSVar(colorName) {
    return `--highlight-${colorName}`;
}
