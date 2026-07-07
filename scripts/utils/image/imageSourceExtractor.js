/**
 * 圖片處理工具 - 來源提取 facade
 * 負責協調各種 DOM 來源提取器並維持既有 export surface
 */

import { extractFromAnchor } from './imageAnchorSource.js';
import { extractFromAttributes } from './imageAttributeSource.js';
import { extractFromBackgroundImage } from './imageBackgroundSource.js';
import { extractFromNoscript } from './imageNoscriptSource.js';
import { extractFromPicture } from './imagePictureSource.js';
import { extractValidatedSrcsetUrl } from './srcsetExtractor.js';

/**
 * 從圖片元素中提取最佳的 src URL
 *
 * @param {HTMLImageElement|HTMLElement} imgNode - 圖片元素或容器
 * @returns {string|null} 提取的圖片 URL 或 null
 */
export function extractImageSrc(imgNode) {
  if (!imgNode) {
    return null;
  }
  const anchorHref = extractFromAnchor(imgNode);
  if (anchorHref) {
    return anchorHref;
  }
  const validatedSrcset = extractValidatedSrcsetUrl(imgNode);
  if (validatedSrcset) {
    return validatedSrcset;
  }
  return (
    extractFromAttributes(imgNode) ||
    extractFromPicture(imgNode) ||
    extractFromBackgroundImage(imgNode) ||
    extractFromNoscript(imgNode)
  );
}

export {
  IMAGE_ATTRIBUTES,
  extractFromAttributes,
  generateImageCacheKey,
} from './imageAttributeSource.js';

export { extractFromBackgroundImage } from './imageBackgroundSource.js';
export { extractFromNoscript } from './imageNoscriptSource.js';
export { extractFromPicture } from './imagePictureSource.js';
