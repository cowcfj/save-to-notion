/**
 * srcset URL 合理性與協定驗證
 */

import { EMBEDDED_URL_ENCODED_HTTP_PROTOCOL_REGEX } from '../../config/shared/content.js';
import { resolveImageUrl, hasRejectedImageProtocol } from './imageUrl.js';

const HTTP_URL_PROTOCOL_REGEX = /^https?:\/\//i;

function _isPlausibleImageUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  if (!EMBEDDED_URL_ENCODED_HTTP_PROTOCOL_REGEX.test(url)) {
    return true;
  }
  if (HTTP_URL_PROTOCOL_REGEX.test(url)) {
    return true;
  }
  return url.startsWith('//');
}

/**
 * 驗證 srcset 結果是否為未截斷、協定安全的圖片 URL。
 *
 * @param {string|null} srcsetUrl - srcset 提取結果
 * @returns {string|null} 驗證通過的 URL 或 null
 */
export function validateSrcsetUrl(srcsetUrl) {
  if (!srcsetUrl || !_isPlausibleImageUrl(srcsetUrl)) {
    return null;
  }

  const resolved = resolveImageUrl(srcsetUrl);
  if (!resolved || hasRejectedImageProtocol(resolved.urlObj.protocol)) {
    return null;
  }
  if (!resolved.isRelative && !['http:', 'https:'].includes(resolved.urlObj.protocol)) {
    return null;
  }

  return srcsetUrl;
}
