/**
 * Anchor href 圖片來源提取
 */

import { cleanImageUrl, hasRejectedImageProtocol, isValidCleanedImageUrl } from './imageUrl.js';

/**
 * 檢查是否為可以讀取 href 的 anchor 元素
 *
 * @param {HTMLElement} node - DOM 節點
 * @returns {boolean} 是否可讀取
 */
function _canReadAnchorHref(node) {
  return node?.tagName === 'A' && typeof node.getAttribute === 'function';
}

/**
 * 獲取並規範化 anchor href
 *
 * @param {HTMLElement} node - DOM 節點
 * @returns {string|null} 規範化後的 href 或 null
 */
function _normalizeAnchorHref(node) {
  const href = node.getAttribute('href');
  return href ? href.trim() : null;
}

/**
 * 判斷是否應該跳過該 href
 *
 * @param {string|null} normalizedHref - 規範化後的 href
 * @returns {boolean} 是否應跳過
 */
function _shouldSkipAnchorHref(normalizedHref) {
  if (!normalizedHref) {
    return true;
  }
  if (hasRejectedImageProtocol(normalizedHref)) {
    return true;
  }
  if (normalizedHref.startsWith('#')) {
    return true;
  }
  return false;
}

/**
 * 解析並清理 anchor 圖片 URL
 *
 * @param {string} normalizedHref - 規範化後的 href
 * @returns {string|null} 清理後的有效圖片 URL 或 null
 */
function _resolveCleanedAnchorImageUrl(normalizedHref) {
  const cleaned = cleanImageUrl(normalizedHref);
  if (!cleaned) {
    return null;
  }
  return isValidCleanedImageUrl(cleaned) ? cleaned : null;
}

function _extractFromAnchorHref(node) {
  if (!_canReadAnchorHref(node)) {
    return null;
  }
  const normalized = _normalizeAnchorHref(node);
  if (_shouldSkipAnchorHref(normalized)) {
    return null;
  }
  return _resolveCleanedAnchorImageUrl(normalized);
}

/**
 * 對 `<a>` 元素優先嘗試 href 作為圖片來源。
 *
 * @param {HTMLElement} imgNode - 圖片元素或容器
 * @returns {string|null} anchor href 或 null
 */
export function extractFromAnchor(imgNode) {
  if (!imgNode) {
    return null;
  }

  if (imgNode.tagName !== 'A') {
    const anchor = imgNode.closest?.('a');
    return anchor ? _extractFromAnchorHref(anchor) : null;
  }
  return _extractFromAnchorHref(imgNode);
}
