/**
 * DOM 工具模組
 * 提供 DOM 操作相關的工具函式
 */

/**
 * 檢查瀏覽器是否支持 CSS Custom Highlight API
 * @returns {boolean} 如果支持則返回 true
 *
 * @example
 * if (supportsHighlightAPI()) {
 *   // 使用 CSS Highlight API
 * }
 */
export function supportsHighlightAPI() {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && CSS.highlights !== undefined;
}

/**
 * 檢查元素是否有效（非 null 且為 Element）
 * @param {*} element - 要檢查的元素
 * @returns {boolean} 如果是有效的 Element 則返回 true
 *
 * @example
 * if (isValidElement(node)) {
 *   // 處理元素
 * }
 */
export function isValidElement(element) {
  return element !== null && element !== undefined && element instanceof Element;
}

/**
 * 獲取元素的可見文本內容
 * @param {Element} element - DOM 元素
 * @returns {string} 可見文本內容
 *
 * @example
 * const text = getVisibleText(element);
 */
export function getVisibleText(element) {
  if (!isValidElement(element)) {
    return '';
  }

  // 排除不可見元素
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return '';
  }

  return element.textContent?.trim() || '';
}

/**
 * 檢查元素是否在視口內
 * @param {Element} element - 要檢查的元素
 * @returns {boolean} 如果在視口內則返回 true
 *
 * @example
 * if (isInViewport(element)) {
 *   // 元素可見
 * }
 */
export function isInViewport(element) {
  if (!isValidElement(element)) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

/**
 * 安全地獲取元素屬性
 * @param {Element} element - DOM 元素
 * @param {string} attribute - 屬性名稱
 * @param {*} defaultValue - 默認值
 * @returns {*} 屬性值或默認值
 *
 * @example
 * const id = getAttribute(element, 'data-id', null);
 */
export function getAttribute(element, attribute, defaultValue = null) {
  if (!isValidElement(element)) {
    return defaultValue;
  }

  return element.getAttribute(attribute) ?? defaultValue;
}
