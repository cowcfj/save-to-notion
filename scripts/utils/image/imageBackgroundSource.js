/**
 * CSS background-image 圖片來源提取
 */

import { IMAGE_VALIDATION } from '../../config/shared/content.js';
import { hasRejectedImageProtocol } from './imageUrl.js';

function _getBackgroundImageValue(node) {
  const style = globalThis.getComputedStyle(node);
  if (style.backgroundImage) {
    return style.backgroundImage;
  }

  if (typeof style.getPropertyValue === 'function') {
    return style.getPropertyValue('background-image');
  }

  return undefined;
}

function _extractBackgroundImageUrl(backgroundImage) {
  if (!backgroundImage || backgroundImage === 'none') {
    return null;
  }

  const bgPattern = /url\(["']?([^"']+)["']?\)/i;
  return bgPattern.exec(backgroundImage)?.[1] ?? null;
}

function _shouldRejectBackgroundImageUrl(rawUrl) {
  if (!rawUrl) {
    return true;
  }
  const normalized = rawUrl.trim();

  if (hasRejectedImageProtocol(normalized)) {
    return true;
  }

  if (normalized.length > IMAGE_VALIDATION.MAX_URL_LENGTH) {
    return true;
  }

  return normalized.length >= IMAGE_VALIDATION.MAX_BACKGROUND_URL_LENGTH;
}

function _extractValidUrlFromComputedStyle(node) {
  const backgroundImage = _getBackgroundImageValue(node);
  const rawUrl = _extractBackgroundImageUrl(backgroundImage)?.trim();

  if (_shouldRejectBackgroundImageUrl(rawUrl)) {
    return null;
  }

  return rawUrl;
}

/**
 * 從背景圖片 CSS 屬性提取 URL
 *
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string|null} 提取的 URL 或 null
 */
export function extractFromBackgroundImage(imgNode) {
  try {
    if (globalThis.window === undefined || !globalThis.getComputedStyle) {
      return null;
    }

    const selfUrl = _extractValidUrlFromComputedStyle(imgNode);
    if (selfUrl) {
      return selfUrl;
    }

    const parent = imgNode.parentElement;
    if (parent) {
      return _extractValidUrlFromComputedStyle(parent);
    }
  } catch {
    // 忽略樣式計算錯誤
  }
  return null;
}
