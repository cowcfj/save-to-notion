/**
 * noscript HTML 圖片來源提取
 */

import Logger from '../Logger.js';
import { IMAGE_VALIDATION } from '../../config/shared/content.js';
import { hasRejectedImageProtocol } from './imageUrl.js';

function _extractWithRegex(html) {
  const imgPattern = /<img[^>]+src=["']([^"']+)["']/i;
  const match = imgPattern.exec(html);
  const src = match?.[1]?.trim();
  if (!src || src.length > IMAGE_VALIDATION.MAX_URL_LENGTH) {
    return null;
  }
  if (hasRejectedImageProtocol(src)) {
    return null;
  }
  return src;
}

function _isOversizedNoscriptHtml(html) {
  return html.length > IMAGE_VALIDATION.MAX_URL_LENGTH * 2;
}

/**
 * 從 noscript 標籤提取 URL
 *
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string|null} 提取的 URL 或 null
 */
export function extractFromNoscript(imgNode) {
  try {
    const candidates = [imgNode, imgNode.parentElement].filter(Boolean);
    for (const el of candidates) {
      const noscript = el.querySelector?.('noscript');
      if (!noscript?.textContent) {
        continue;
      }

      const html = noscript.textContent;
      if (_isOversizedNoscriptHtml(html)) {
        Logger.warn('noscript 內容過長', { action: 'extractFromNoscript', length: html.length });
        continue;
      }

      const src = _extractWithRegex(html);
      if (src) {
        return src;
      }
    }
  } catch {
    // 忽略 noscript 解析錯誤
  }
  return null;
}
