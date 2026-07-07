/**
 * 圖片屬性來源提取
 */

import { hasRejectedImageProtocol } from './imageUrl.js';
import { extractBestUrlFromSrcset } from './srcsetExtractor.js';
import { validateSrcsetUrl } from './srcsetUrlValidator.js';

/** 圖片 URL 驗證屬性列表 */
export const IMAGE_ATTRIBUTES = [
  'src',
  'data-src',
  'data-lazy-src',
  'data-original',
  'data-srcset',
  'data-lazy-srcset',
  'data-original-src',
  'data-actualsrc',
  'data-src-original',
  'data-echo',
  'data-href',
  'data-large',
  'data-bigsrc',
  'data-full-src',
  'data-hi-res-src',
  'data-large-src',
  'data-zoom-src',
  'data-image-src',
  'data-img-src',
  'data-real-src',
  'data-lazy',
  'data-url',
  'data-image',
  'data-img',
  'data-fallback-src',
  'data-origin',
];

function _extractFromSrcsetAttribute(srcset) {
  return validateSrcsetUrl(extractBestUrlFromSrcset(srcset));
}

/**
 * 解析圖片屬性候選值
 *
 * @param {string} attr - 屬性名稱
 * @param {string|null} value - 原始屬性值
 * @returns {string|null} 解析後的有效 URL 或 null
 */
function _resolveImageAttributeCandidate(attr, value) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (attr.includes('srcset')) {
    return _extractFromSrcsetAttribute(trimmed);
  }
  if (hasRejectedImageProtocol(trimmed)) {
    return null;
  }
  return trimmed;
}

/**
 * 從圖片屬性提取 URL
 *
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string|null} 提取的 URL 或 null
 */
export function extractFromAttributes(imgNode) {
  if (!imgNode || typeof imgNode.getAttribute !== 'function') {
    return null;
  }

  for (const attr of IMAGE_ATTRIBUTES) {
    const value = imgNode.getAttribute(attr);
    const resolved = _resolveImageAttributeCandidate(attr, value);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

/**
 * 生成圖片緩存鍵
 *
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string} 緩存鍵
 */
export function generateImageCacheKey(imgNode) {
  if (!imgNode) {
    return '';
  }

  const src = imgNode.getAttribute('src') || '';
  const dataSrc = imgNode.dataset.src || '';
  const className = imgNode.className || '';
  const id = imgNode.id || '';

  return `${src}|${dataSrc}|${className}|${id}`;
}
