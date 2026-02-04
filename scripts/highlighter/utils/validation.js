/**
 * 驗證工具模組
 * 提供數據驗證相關的工具函式
 */

/**
 * 檢查字串是否非空
 *
 * @param {*} str - 要檢查的字串
 * @returns {boolean} 如果是非空字串則返回 true
 * @example
 * isNonEmptyString('hello') // true
 * isNonEmptyString('') // false
 * isNonEmptyString(null) // false
 */
export function isNonEmptyString(str) {
  return typeof str === 'string' && str.trim().length > 0;
}

/**
 * 檢查值是否為有效的 Range 對象
 *
 * @param {*} range - 要檢查的對象
 * @returns {boolean} 如果是有效的 Range 則返回 true
 * @example
 * const range = document.createRange();
 * isValidRange(range) // true
 * isValidRange(null) // false
 */
export function isValidRange(range) {
  return (
    range !== null &&
    range !== undefined &&
    typeof range === 'object' &&
    'startContainer' in range &&
    'endContainer' in range &&
    typeof range.cloneRange === 'function'
  );
}

/**
 * 檢查 Range 是否已折疊（空選取）
 *
 * @param {Range} range - Range 對象
 * @returns {boolean} 如果 Range 已折疊則返回 true
 * @example
 * const range = document.createRange();
 * isCollapsedRange(range) // true
 */
export function isCollapsedRange(range) {
  if (!isValidRange(range)) {
    return true;
  }
  return range.collapsed === true;
}

/**
 * 檢查顏色名稱是否有效
 *
 * @param {*} color - 顏色名稱
 * @returns {boolean} 如果是有效顏色則返回 true
 * @example
 * isValidColor('yellow') // true
 * isValidColor('purple') // false
 */
export function isValidColor(color) {
  const validColors = ['yellow', 'green', 'blue', 'red'];
  return validColors.includes(color);
}

/**
 * 檢查 URL 是否有效
 *
 * @param {*} url - URL 字串
 * @returns {boolean} 如果是有效的 URL 則返回 true
 * @example
 * isValidUrl('https://example.com') // true
 * isValidUrl('not a url') // false
 */
export function isValidUrl(url) {
  if (!isNonEmptyString(url)) {
    return false;
  }

  return URL.canParse(url);
}

/**
 * 檢查標註 ID 是否有效
 *
 * @param {*} id - 標註 ID
 * @returns {boolean} 如果是有效的 ID 則返回 true
 * @example
 * isValidHighlightId('h123') // true
 * isValidHighlightId('') // false
 * isValidHighlightId(null) // false
 */
export function isValidHighlightId(id) {
  return isNonEmptyString(id) && /^h\d+$/.test(id);
}

/**
 * 驗證標註數據對象
 *
 * @param {*} data - 標註數據對象
 * @returns {boolean} 如果數據有效則返回 true
 * @example
 * isValidHighlightData({ id: 'h1', text: 'test', color: 'yellow' }) // true
 */
export function isValidHighlightData(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }

  return isValidHighlightId(data.id) && isNonEmptyString(data.text) && isValidColor(data.color);
}
