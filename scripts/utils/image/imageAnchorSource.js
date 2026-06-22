/**
 * Anchor href 圖片來源提取
 */

import { cleanImageUrl, hasRejectedImageProtocol, isValidCleanedImageUrl } from './imageUrl.js';

function _extractFromAnchorHref(node) {
  if (node?.tagName !== 'A' || typeof node.getAttribute !== 'function') {
    return null;
  }
  const href = node.getAttribute('href');
  if (!href) {
    return null;
  }
  const normalized = href.trim();
  if (!normalized || hasRejectedImageProtocol(normalized)) {
    return null;
  }
  if (normalized.startsWith('#')) {
    return null;
  }

  const cleaned = cleanImageUrl(normalized);
  return cleaned && isValidCleanedImageUrl(cleaned) ? cleaned : null;
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
