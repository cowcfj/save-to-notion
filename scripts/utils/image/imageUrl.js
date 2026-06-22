/**
 * 圖片處理工具 - URL 處理與驗證葉模組
 * 負責圖片 URL 標準化、代理拆包與 Notion 兼容性驗證
 */

import { sanitizeUrlForLogging } from '../LogSanitizer.js';
import Logger from '../Logger.js';
import {
  EMBEDDED_URL_ENCODED_HTTP_PROTOCOL_REGEX,
  IMAGE_VALIDATION,
} from '../../config/shared/content.js';

// ==========================================
// 圖片驗證常量
// ==========================================

export const IMAGE_EXTENSIONS = /\.(?:jpg|jpeg|png|webp|svg|bmp|ico|tiff|tif|avif|heic|heif)$/i;

export const IMAGE_PATH_PATTERNS = [
  /\/images?\//i,
  /\/imgs?\//i,
  /\/photos?\//i,
  /\/pictures?\//i,
  /\/media\//i,
  /\/uploads?\//i,
  /\/assets?\//i,
  /\/files?\//i,
  /\/content\//i,
  /\/wp-content\//i,
  /\/cdn\//i,
  /cdn\d*\./i,
  /\/static\//i,
  /\/thumbs?\//i,
  /\/thumbnails?\//i,
  /\/resize\//i,
  /\/crop\//i,
  /\/(\d{4})\/(\d{2})\//,
  /\/avatars?\//i,
  /\/u\/\d+(?:$|\/|\?)/i,
  /\/profile_images\//i,
  /\/creatr-uploaded-images\//i,
  /\/ny\/api\/res\//i,
  /\.gtimg\.com\//i, // 騰訊圖片 CDN (例如 news.qq.com 上的無副檔名圖片)
];

const EXCLUDE_PATTERNS = [
  /\.(js|css|html|htm|php|asp|jsp|json|xml)(\?|$)/i,
  /\/api\//i,
  /\/ajax\//i,
  /\/callback/i,
  /\/track/i,
  /\/analytics/i,
  /\/pixel/i,
];

/** 圖片佔位符關鍵字 */
const PLACEHOLDER_KEYWORDS = [
  'placeholder',
  'loading',
  'spinner',
  'blank',
  'empty',
  '1x1',
  'transparent',
  'miscellaneous_sprite', // 排除雜項佈局圖片 (e.g., miscellaneous_sprite.png)
  '.gif', // 排除 GIF 圖片（通常為動畫圖標或佔位符，非內容圖片）
];

/**
 * 解析 URL 字串，支援相對路徑與路徑簡化
 *
 * @param {string} url - 原始 URL
 * @returns {object|null} 解析結果 { urlObj, isRelative } 或 null
 */
export function resolveImageUrl(url) {
  try {
    return { urlObj: new URL(url), isRelative: false };
  } catch {
    // 嘗試作為相對 URL 解析
    try {
      const isPathLike =
        url.startsWith('/') ||
        url.startsWith('./') ||
        url.startsWith('../') ||
        /\.[\dA-Za-z]{2,4}$/.test(url);

      if (!isPathLike) {
        throw new Error('Invalid format');
      }

      if (url.startsWith('//')) {
        return { urlObj: new URL(`https:${url}`), isRelative: false };
      }

      // 使用假域名作為基底來解析相對路徑
      return { urlObj: new URL(url, 'https://dummy-base.com'), isRelative: true };
    } catch {
      return null;
    }
  }
}

/**
 * 內部使用的 URL 標準化邏輯
 *
 * 「第一階段」編碼：讓 `new URL()` 能夠正確解析輸入 URL
 *
 * @param {string} url - 原始 URL
 * @returns {string} 標準化後的 URL
 * @private
 */
function _normalizeUrlInternal(url) {
  let normalized = url.trim();

  // 確保是 HTTP/HTTPS 協議
  if (normalized.startsWith('//')) {
    normalized = `https:${normalized}`;
  } else if (normalized.startsWith('http://')) {
    normalized = normalized.replace(/^http:\/\//i, 'https://');
  }

  // 偵測 CDN 代理 URL（如 Substack/Cloudinary/imgix）
  if (EMBEDDED_URL_ENCODED_HTTP_PROTOCOL_REGEX.test(normalized)) {
    // 仍需執行 Markdown/Notion 兼容字元編碼，避免特殊字元破壞解析
    return normalized.replaceAll(/[()'[\]^|{}<>]/g, char => encodeURIComponent(char));
  }

  // 特殊字符編碼修復
  try {
    const decoded = decodeURI(normalized);
    normalized = encodeURI(decoded);
    normalized = normalized.replaceAll(/[()'[\]^|{}<>]/g, char => encodeURIComponent(char));
  } catch {
    // 忽略編碼錯誤
  }

  return normalized;
}

/**
 * 處理 Next.js 圖片優化 URL 的拆包邏輯
 *
 * @param {URL} urlObj - 解析後的 URL 對象
 * @param {number} depth - 當前遞迴深度
 * @returns {string|null} 拆包後的標準 URL 或 null
 * @private
 */
function _unwrapNextJsUrl(urlObj, depth) {
  // 檢查路徑特徵
  if (!urlObj.pathname.includes('/_next/image')) {
    return null;
  }

  const urlParam = urlObj.searchParams.get('url');
  if (!urlParam) {
    return null;
  }

  try {
    let nextUrl = urlParam;

    // 處理 _normalizeUrlInternal 可能引入的雙重編碼問題
    if (!/^https?:\/\//i.test(nextUrl) && /^(?:https?%3A%2F%2F|%2F)/i.test(nextUrl)) {
      try {
        nextUrl = decodeURIComponent(nextUrl);
      } catch {
        // 解碼失敗則保持原樣
      }
    }

    // 如果是相對路徑，則繼承當前 URL 的 origin
    const isAbsolute = /^https?:\/\//i.test(nextUrl);
    if (!isAbsolute) {
      nextUrl = new URL(nextUrl, urlObj.origin).href;
    }

    return cleanImageUrl(nextUrl, depth + 1);
  } catch {
    return null;
  }
}

/**
 * 將 raw URL 字串標準化並解析為 URL 物件
 *
 * @param {string} url - 已通過型別 / depth guard 的原始 URL
 * @returns {{urlObj: URL, isRelative: boolean, normalized: string}|null} 解析結果或 null
 * @private
 */
function _normalizeAndResolveImageUrl(url) {
  const normalized = _normalizeUrlInternal(url);

  const resolved = resolveImageUrl(normalized);
  if (!resolved) {
    Logger.error('URL 轉換失敗', {
      action: 'cleanImageUrl',
      result: 'failed',
      url: sanitizeUrlForLogging(normalized),
    });
    return null;
  }

  // Notion 僅支援 HTTP/HTTPS 協議；相對路徑由後續 isRelative 分支保留。
  const protocol = resolved.urlObj.protocol;
  if (hasRejectedImageProtocol(protocol)) {
    return null;
  }
  if (!resolved.isRelative && !['http:', 'https:'].includes(protocol)) {
    return null;
  }

  return { urlObj: resolved.urlObj, isRelative: resolved.isRelative, normalized };
}

/**
 * 對已解析的 URL 物件執行 output-side transformation pipeline
 *
 * @param {{urlObj: URL, isRelative: boolean}} resolved - `_normalizeAndResolveImageUrl` 結果
 * @param {number} depth - 當前遞迴深度
 * @returns {string|null} 清理後的 URL，或 null
 * @private
 */
function _processResolvedImageUrl(resolved, depth) {
  const { urlObj, isRelative } = resolved;
  try {
    const unwrappedNextUrl = _unwrapNextJsUrl(urlObj, depth);
    if (unwrappedNextUrl) {
      return unwrappedNextUrl;
    }

    const specialResult = _handleSpecialDomainRules(urlObj, depth);
    if (specialResult) {
      return specialResult;
    }

    _standardizeSearchParams(urlObj);

    if (isRelative) {
      return urlObj.pathname + urlObj.search + urlObj.hash;
    }

    return _applyNotionCompatibilityEncoding(urlObj.href);
  } catch {
    return null;
  }
}

/**
 * 清理和標準化圖片 URL
 *
 * @param {string} url - 原始圖片 URL
 * @param {number} depth - 當前遞迴深度
 * @returns {string|null} 清理後的 URL 或 null
 */
export function cleanImageUrl(url, depth = 0) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  if (depth >= IMAGE_VALIDATION.MAX_RECURSION_DEPTH) {
    Logger.warn('達到最大遞迴深度', {
      action: 'cleanImageUrl',
      result: 'max_depth',
      depth,
      url: sanitizeUrlForLogging(url),
    });
    return url;
  }

  const resolved = _normalizeAndResolveImageUrl(url);
  if (!resolved) {
    return null;
  }

  return _processResolvedImageUrl(resolved, depth);
}

/**
 * 處理特定域名的特殊規則
 *
 * @param {URL} urlObj - URL 物件
 * @param {number} depth - 遞迴深度
 * @returns {string|null} 處理後的 URL 或 null
 * @private
 */
function _handleSpecialDomainRules(urlObj, depth) {
  // 處理代理 URL
  if (urlObj.pathname.includes('/photo.php') || urlObj.pathname.includes('/gw/')) {
    const uParam = urlObj.searchParams.get('u');
    if (uParam) {
      const targetUrl = uParam.includes('%') ? decodeURIComponent(uParam) : uParam;
      if (/^https?:\/\//i.test(targetUrl)) {
        return cleanImageUrl(targetUrl, depth + 1);
      }
    }
  }

  const isInMediaHK = /(?:^|\.)inmediahk\.net$/i.test(urlObj.hostname);
  if (isInMediaHK && urlObj.searchParams.has('itok')) {
    urlObj.searchParams.delete('itok');
  }

  return null;
}

/**
 * 標準化查詢參數 (移除重複項)
 *
 * @param {URL} urlObj - URL 物件
 * @private
 */
function _standardizeSearchParams(urlObj) {
  const params = new URLSearchParams();
  for (const [key, value] of urlObj.searchParams.entries()) {
    if (!params.has(key)) {
      params.set(key, value);
    }
  }
  urlObj.search = params.toString();
}

/**
 * 應用 Notion/Markdown 兼容性編碼
 *
 * @param {string} url - 原始 URL 字串
 * @returns {string} 編碼後的 URL
 * @private
 */
function _applyNotionCompatibilityEncoding(url) {
  return url.replaceAll(/[()']/g, char => {
    const map = {
      '(': '%28',
      ')': '%29',
      "'": '%27',
    };
    return map[char] || char;
  });
}

function _createRejectedImageUrlGuard(fallbackResult = false) {
  return { rejected: true, fallbackResult };
}

function _areImageValidationPatternsLoaded() {
  return [IMAGE_EXTENSIONS, EXCLUDE_PATTERNS, IMAGE_PATH_PATTERNS, PLACEHOLDER_KEYWORDS].every(
    Boolean
  );
}

function _runPatternLoadGuard(url) {
  if (_areImageValidationPatternsLoaded()) {
    return null;
  }

  Logger.warn?.('Pattern 常量未載入，回退到基本驗證', {
    action: '_runEarlyRejectGuards',
  });
  return _createRejectedImageUrlGuard(/^https:\/\//i.test(url));
}

function _shouldRejectImageUrlInput(url) {
  if (typeof url !== 'string') {
    return true;
  }

  return url.length === 0;
}

/**
 * 檢查是否為拒絕的圖片協議
 *
 * @param {string} url - 圖片 URL
 * @returns {boolean} 是否被拒絕
 */
export function hasRejectedImageProtocol(url) {
  return ['data:', 'blob:'].some(prefix => url.startsWith(prefix));
}

function _shouldRejectRelativeImageUrl(url, allowRelative) {
  if (allowRelative) {
    return false;
  }

  return ['http', '/'].every(prefix => !url.startsWith(prefix));
}

function _shouldRejectGifImageUrl(url, useGifRegex) {
  if (!useGifRegex) {
    return false;
  }

  return /\.gif(?:\?|$)/i.test(url);
}

function _hasPlaceholderKeyword(url, useGifRegex) {
  const lowerUrl = url.toLowerCase();
  let placeholderKeywords = PLACEHOLDER_KEYWORDS;

  if (useGifRegex) {
    placeholderKeywords = PLACEHOLDER_KEYWORDS.filter(keyword => keyword !== '.gif');
  }

  return placeholderKeywords.some(keyword => lowerUrl.includes(keyword));
}

function _shouldRejectDecorativeImageUrl(url, useGifRegex) {
  if (_shouldRejectGifImageUrl(url, useGifRegex)) {
    return true;
  }

  return _hasPlaceholderKeyword(url, useGifRegex);
}

/**
 * 共用的圖片 URL early-reject guard pipeline
 *
 * @param {string} url - 待驗證的 URL
 * @param {object} options - 驗證選項
 * @param {boolean} options.allowRelative - 是否允許相對路徑
 * @param {boolean} options.useGifRegex - 是否使用 GIF 正則
 * @returns {object} 拒絕狀態與 fallback 值
 * @private
 */
function _runEarlyRejectGuards(url, { allowRelative, useGifRegex }) {
  if (_shouldRejectImageUrlInput(url)) {
    return _createRejectedImageUrlGuard();
  }

  const patternLoadGuard = _runPatternLoadGuard(url);
  if (patternLoadGuard) {
    return patternLoadGuard;
  }

  if (hasRejectedImageProtocol(url)) {
    return _createRejectedImageUrlGuard();
  }

  if (_shouldRejectRelativeImageUrl(url, allowRelative)) {
    return _createRejectedImageUrlGuard();
  }

  if (_shouldRejectDecorativeImageUrl(url, useGifRegex)) {
    return _createRejectedImageUrlGuard();
  }

  return { rejected: false };
}

/**
 * 檢查已清理的圖片 URL 是否有效 (Notion 兼容性驗證)
 *
 * @param {string} cleanedUrl - 已清理的圖片 URL
 * @returns {boolean} 是否為有效的圖片 URL
 */
export function isValidCleanedImageUrl(cleanedUrl) {
  const guard = _runEarlyRejectGuards(cleanedUrl, {
    allowRelative: true,
    useGifRegex: false,
  });
  if (guard.rejected) {
    return guard.fallbackResult;
  }

  const isAbsolute = /^https:\/\//i.test(cleanedUrl);
  const isRelative = cleanedUrl.startsWith('/');

  if (!isAbsolute && !isRelative) {
    return false;
  }

  if (cleanedUrl.length > IMAGE_VALIDATION.MAX_URL_LENGTH) {
    return false;
  }

  if (/[<>[\]^|{}]/.test(cleanedUrl)) {
    return false;
  }

  return _checkUrlPatterns(cleanedUrl, isAbsolute);
}

/**
 * 檢查 URL 是否為有效的圖片格式 (Notion 兼容性驗證)
 *
 * @param {string} url - 要檢查的 URL
 * @returns {boolean} 是否為有效的圖片 URL
 */
export function isValidImageUrl(url) {
  const guard = _runEarlyRejectGuards(url, {
    allowRelative: true,
    useGifRegex: true,
  });
  if (guard.rejected) {
    return guard.fallbackResult;
  }

  const cleanedUrl = cleanImageUrl(url);
  if (!cleanedUrl) {
    return false;
  }

  return isValidCleanedImageUrl(cleanedUrl);
}

/**
 * 內部使用的 URL 模式檢查
 *
 * @param {string} url - 清理後的 URL
 * @param {boolean} isAbsolute - 是否為絕對路徑
 * @returns {boolean} 是否符合模式
 * @private
 */
function _checkUrlPatterns(url, isAbsolute) {
  try {
    const urlObj = isAbsolute ? new URL(url) : new URL(url, 'https://dummy-base.com');

    // 檢查文件擴展名
    const pathname = urlObj.pathname.toLowerCase();
    const hasImageExtension = IMAGE_EXTENSIONS.test(pathname);

    if (hasImageExtension) {
      return true;
    }

    // 2. 先檢查正向圖片路徑模式
    if (IMAGE_PATH_PATTERNS.some(pattern => pattern.test(url))) {
      const isExplicitlyExcluded = EXCLUDE_PATTERNS.some(pattern => {
        return pattern.source.includes(String.raw`\.`) && pattern.test(url);
      });

      if (!isExplicitlyExcluded) {
        return true;
      }
    }

    // 3. 排除特定模式 (如 /api/, /callback/)
    if (EXCLUDE_PATTERNS.some(pattern => pattern.test(url))) {
      return false;
    }

    // 4. 回退
    return false;
  } catch {
    return false;
  }
}
