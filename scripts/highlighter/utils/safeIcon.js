/* eslint-disable sonarjs/dompurify-unsafe-config */
import DOMPurify from 'dompurify';
import Logger from '../../utils/Logger.js';

/**
 * 消毒 SVG 字串
 *
 * @param {string} svgString - 原始 SVG 字串
 * @returns {string} 消毒後的 SVG 字串
 */
export function sanitizeSvgIcon(svgString) {
  if (!svgString) {
    return '';
  }

  // 消毒設定，針對 SVG 僅允許其核心與路徑標籤/屬性
  return DOMPurify.sanitize(svgString, {
    USE_PROFILES: { svg: true }, // 僅啟用 svg 剖面
    ALLOWED_TAGS: ['svg', 'path', 'g', 'circle', 'rect', 'line', 'polyline', 'polygon'],
    ALLOWED_ATTR: [
      'id',
      'class',
      'viewbox',
      'd',
      'fill',
      'stroke',
      'stroke-width',
      'stroke-linecap',
      'stroke-linejoin',
      'cx',
      'cy',
      'r',
      'x',
      'y',
      'width',
      'height',
      'points',
      'data-rail-icon',
    ],
    FORBID_TAGS: [
      'script',
      'style',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'button',
      'textarea',
      'select',
      'base',
      'link',
      'meta',
    ],
    FORBID_ATTR: ['style', 'srcset', 'formaction', 'action'],
    ALLOW_DATA_ATTR: true,
    ALLOW_ARIA_ATTR: false,
    RETURN_TRUSTED_TYPE: false,
  });
}

/**
 * 建立安全的 Icon 元素 (與 securityUtils.createSafeIcon 介面相容)
 *
 * @param {string} svgString - SVG 字串或一般純文字
 * @returns {HTMLElement} 包含 SVG 的 span 元素
 */
export function createSafeIcon(svgString) {
  const span = document.createElement('span');
  span.className = 'icon';

  if (!svgString?.startsWith('<svg')) {
    span.textContent = svgString || '';
    return span;
  }

  const sanitized = sanitizeSvgIcon(svgString);

  // 如果消毒後為空，返回空 span
  if (!sanitized) {
    return span;
  }

  // 確保 SVG 具有 XML 命名空間，這對於 DOMParser ('image/svg+xml') 是必須的
  let validSvgString = sanitized;
  if (!validSvgString.includes('xmlns=')) {
    validSvgString = validSvgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(validSvgString, 'image/svg+xml');
  const svgElement = doc.documentElement;

  if (svgElement.tagName === 'parsererror') {
    Logger.warn('SVG parse error in safeIcon helper', {
      action: 'create_safe_icon',
      reason: 'xml_parser_error',
      content: svgString,
    });
    return span;
  }

  if (svgElement.tagName !== 'svg') {
    Logger.warn('[Security] Parsed element is not an SVG', {
      action: 'create_safe_icon',
      content: svgString,
    });
    return span;
  }

  // 標準化：為 SVG 添加 CSS 類以便正確樣式化
  svgElement.classList.add('icon-svg');
  span.append(svgElement);
  return span;
}
