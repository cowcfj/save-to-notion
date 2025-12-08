/**
 * DOM 工具模組（Testable 版本）
 * 提供 DOM 操作相關的工具函式
 *
 * 此檔案為測試版本，使用 CommonJS 格式
 * 源檔案：scripts/highlighter/utils/dom.js (ES6 模組)
 */

/**
 * 檢查瀏覽器是否支持 CSS Custom Highlight API
 * @returns {boolean} 如果支持則返回 true
 */
function supportsHighlightAPI() {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && CSS.highlights !== undefined;
}

/**
 * 檢查元素是否有效（非 null 且為 Element）
 * @param {*} element - 要檢查的元素
 * @returns {boolean} 如果是有效的 Element 則返回 true
 */
function isValidElement(element) {
  return element !== null && element !== undefined && element instanceof Element;
}

/**
 * 獲取元素的可見文本內容
 * @param {Element} element - DOM 元素
 * @returns {string} 可見文本內容
 */
function getVisibleText(element) {
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
 */
function isInViewport(element) {
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
 */
function getAttribute(element, attribute, defaultValue = null) {
  if (!isValidElement(element)) {
    return defaultValue;
  }

  return element.getAttribute(attribute) ?? defaultValue;
}

// CommonJS exports for testing
if (typeof module !== 'undefined') {
  module.exports = {
    supportsHighlightAPI,
    isValidElement,
    getVisibleText,
    isInViewport,
    getAttribute,
  };
}
