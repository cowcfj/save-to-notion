/**
 * picture/source 元素圖片來源提取
 */

import { extractBestUrlFromSrcset } from './srcsetExtractor.js';
import { validateSrcsetUrl } from './srcsetUrlValidator.js';

/**
 * 從 picture 元素提取 URL
 *
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string|null} 提取的 URL 或 null
 */
export function extractFromPicture(imgNode) {
  const parentPicture = typeof imgNode?.closest === 'function' ? imgNode.closest('picture') : null;
  if (!parentPicture) {
    return null;
  }

  const sources = parentPicture.querySelectorAll('source');
  for (const source of sources) {
    const sourceSrcset = source.getAttribute('srcset');
    if (!sourceSrcset) {
      continue;
    }

    const bestUrl = extractBestUrlFromSrcset(sourceSrcset);
    const validatedUrl = validateSrcsetUrl(bestUrl);
    if (validatedUrl) {
      return validatedUrl;
    }
  }
  return null;
}
