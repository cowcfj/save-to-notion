/**
 * 圖片處理工具函數庫
 * 統一的圖片 URL 處理、驗證和提取邏輯
 */

/* global SrcsetParser */

import { sanitizeUrlForLogging } from './securityUtils.js';
import Logger from './Logger.js';
import { IMAGE_VALIDATION } from '../config/constants.js';
import {
  IMAGE_ATTRIBUTES,
  IMAGE_EXTENSIONS,
  IMAGE_PATH_PATTERNS,
  EXCLUDE_PATTERNS,
  PLACEHOLDER_KEYWORDS,
} from '../config/patterns.js';

// 重新導出 IMAGE_ATTRIBUTES 以維持向後兼容

/**
 * 解析 URL 字串，支援相對路徑與路徑簡化
 *
 * @param {string} url - 原始 URL
 * @returns {object|null} 解析結果 { urlObj, isRelative } 或 null
 * @private
 */
function _resolveUrl(url) {
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

  // 特殊字符編碼修復
  try {
    const decoded = decodeURI(normalized);
    normalized = encodeURI(decoded);
    // 使用 'char' 替代 'c' 以滿足變數命名長度規範
    normalized = normalized.replaceAll(/[[]\]^|{}<>]/g, char => encodeURIComponent(char));
  } catch {
    // 忽略編碼錯誤
  }

  return normalized;
}

/**
 * 清理和標準化圖片 URL (整合 normalizeImageUrl)
 *
 * @param {string} url - 原始圖片 URL
 * @param {number} depth - 當前遞迴深度（用於防止無限遞迴）
 * @returns {string|null} 清理後的 URL 或 null（如果無效）
 */
function cleanImageUrl(url, depth = 0) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  if (depth >= IMAGE_VALIDATION.MAX_RECURSION_DEPTH) {
    Logger.warn('達到最大遞迴深度', {
      action: 'cleanImageUrl',
      depth,
      url: sanitizeUrlForLogging(url),
    });
    return url;
  }

  // 1. 標準化 (Normalization)
  const normalized = _normalizeUrlInternal(url);

  // 基本格式驗證
  if (
    normalized.startsWith('data:') ||
    normalized.startsWith('blob:') ||
    !/^https?:\/\//i.test(normalized)
  ) {
    // 雖然這裡不直接返回 null，但後續的 URL 解析可能會失敗
  }

  const resolved = _resolveUrl(normalized);
  if (!resolved) {
    Logger.error('URL 轉換失敗', {
      action: 'cleanImageUrl',
      url: sanitizeUrlForLogging(normalized),
    });
    return null;
  }

  const { urlObj, isRelative } = resolved;

  try {
    // 處理代理 URL
    if (urlObj.pathname.includes('/photo.php') || urlObj.pathname.includes('/gw/')) {
      const uParam = urlObj.searchParams.get('u');
      if (uParam && /^https?:\/\//.test(uParam)) {
        return cleanImageUrl(uParam, depth + 1);
      }
    }

    // 移除重複的查詢參數
    const params = new URLSearchParams();
    for (const [key, value] of urlObj.searchParams.entries()) {
      if (!params.has(key)) {
        params.set(key, value);
      }
    }
    urlObj.search = params.toString();

    if (isRelative) {
      return urlObj.pathname + urlObj.search + urlObj.hash;
    }

    return urlObj.href;
  } catch {
    return null;
  }
}

/**
 * 檢查 URL 是否為有效的圖片格式 (Notion 兼容性驗證)
 *
 * @param {string} url - 要檢查的 URL
 * @returns {boolean} 是否為有效的圖片 URL
 */
function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // 統一驗證：確保 patterns.js 常量已正確載入
  const patternsLoaded =
    IMAGE_EXTENSIONS && EXCLUDE_PATTERNS && IMAGE_PATH_PATTERNS && PLACEHOLDER_KEYWORDS;
  if (!patternsLoaded) {
    Logger.warn?.('Pattern 常量未載入，回退到基本驗證', { action: 'isValidImageUrl' });
    return /^https:\/\//i.test(url); // Notion 要求 HTTPS
  }

  // 1. 攔截非 HTTP/HTTPS (Notion 要求 HTTPS，但我們會嘗試自動升級)
  // 如果是 data: 或 blob: 則直接拒絕
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return false;
  }

  // 允許相對路徑（因為後續會補全域名）
  if (!url.startsWith('http') && !url.startsWith('/')) {
    // 這裡可能過濾掉了其他協議如 ftp, file 等，這正是我們想要的
    return false;
  }

  // 排除明顯的佔位符
  const lowerUrl = url.toLowerCase();
  if (PLACEHOLDER_KEYWORDS.some(placeholder => lowerUrl.includes(placeholder))) {
    return false;
  }

  // 2. 清理與標準化
  // 注意：調用方通常應該先調用 cleanImageUrl，但這裡為了防禦性編程再次檢查
  // cleanImageUrl 內部會調用 normalizeImageUrl
  const cleanedUrl = cleanImageUrl(url);
  if (!cleanedUrl) {
    return false;
  }

  // 3. 檢查基本 URL 結構
  const isAbsolute = /^https:\/\//i.test(cleanedUrl);
  const isRelative = cleanedUrl.startsWith('/');

  if (!isAbsolute && !isRelative) {
    return false;
  }

  // 4. 檢查 URL 長度 (Notion 限制 2000)
  if (cleanedUrl.length > IMAGE_VALIDATION.MAX_URL_LENGTH) {
    return false;
  }

  // 5. 檢查非法字符 (URL 規範)
  if (/[<>[\]^|{}]/.test(cleanedUrl)) {
    return false;
  }

  return _checkUrlPatterns(cleanedUrl, isAbsolute);
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

    // 排除特定模式
    if (EXCLUDE_PATTERNS.some(pattern => pattern.test(url))) {
      return false;
    }

    // 檢查路徑模式
    return IMAGE_PATH_PATTERNS.some(pattern => pattern.test(url));
  } catch {
    return false;
  }
}

/**
 * 獲取 Srcset 解析器（支援多環境）
 *
 * @returns {object|null} SrcsetParser 引用
 * @private
 */
function _getSrcsetParser() {
  if (typeof SrcsetParser !== 'undefined') {
    return SrcsetParser;
  }
  if (globalThis.window !== undefined && globalThis.SrcsetParser) {
    return globalThis.SrcsetParser;
  }
  return null;
}

/**
 * 解析單個 srcset 條目並計算其度量值
 *
 * @param {string} entry - srcset 條目（例如 "image.jpg 1000w"）
 * @returns {{url: string, metric: number}|null}
 * @private
 */
function _parseSrcsetEntry(entry) {
  const [url, descriptor] = entry.trim().split(/\s+/);
  if (!url || url.startsWith('data:')) {
    return null;
  }

  let metric = 0;
  const wMatch = descriptor ? /^(\d+)w$/i.exec(descriptor) : null;
  const xMatch = descriptor ? /^(\d+)x$/i.exec(descriptor) : null;

  if (wMatch) {
    metric = Number.parseInt(wMatch[1], 10) * IMAGE_VALIDATION.SRCSET_WIDTH_MULTIPLIER;
  } else if (xMatch) {
    metric = Number.parseInt(xMatch[1], 10);
  }

  return { url, metric };
}

/**
 * 手動解析 srcset
 *
 * @param {string[]} srcsetEntries - 分割後的條目數組
 * @returns {string|null} 最佳 URL 或 null
 * @private
 */
function _manualParseSrcset(srcsetEntries) {
  let bestUrl = null;
  let bestMetric = -1;

  for (const entry of srcsetEntries) {
    const result = _parseSrcsetEntry(entry);
    if (result && result.metric > bestMetric) {
      bestMetric = result.metric;
      bestUrl = result.url;
    }
  }

  // 回退邏輯：如果沒找到度量值最高的，取最後一個有效條目
  if (!bestUrl && srcsetEntries.length > 0) {
    const valid = srcsetEntries.map(item => item.trim()).filter(Boolean);
    if (valid.length > 0) {
      bestUrl = valid.at(-1).split(/\s+/)[0] || null;
    }
  }

  return bestUrl;
}

/**
 * 從 srcset 字符串中提取最佳圖片 URL
 * 優先使用 SrcsetParser 進行精確解析，回退到簡單實現
 *
 * @param {string} srcset - srcset 屬性值
 * @returns {string|null} 最佳圖片 URL 或 null
 */
function extractBestUrlFromSrcset(srcset) {
  if (!srcset || typeof srcset !== 'string') {
    return null;
  }

  const parser = _getSrcsetParser();
  if (typeof parser?.parse === 'function') {
    try {
      const bestUrl = parser.parse(srcset, { preferredWidth: 1920, preferredDensity: 2 });
      if (bestUrl) {
        return bestUrl;
      }
    } catch (error) {
      Logger.error('SrcsetParser 失敗', {
        action: 'extractBestUrlFromSrcset',
        error: error.message,
      });
    }
  }

  const entries = srcset.split(',').map(entry => entry.trim());
  return entries.length > 0 ? _manualParseSrcset(entries) : null;
}

/**
 * 從 srcset 屬性提取 URL
 *
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string|null} 提取的 URL 或 null
 */
function extractFromSrcset(imgNode) {
  const srcset =
    imgNode.getAttribute('srcset') || imgNode.dataset.srcset || imgNode.dataset.lazySrcset;

  if (srcset) {
    const bestUrl = extractBestUrlFromSrcset(srcset);
    if (bestUrl) {
      return bestUrl;
    }
  }
  return null;
}

/**
 * 從圖片屬性提取 URL
 *
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string|null} 提取的 URL 或 null
 */
function extractFromAttributes(imgNode) {
  for (const attr of IMAGE_ATTRIBUTES) {
    const value = imgNode.getAttribute(attr);
    if (value?.trim() && !value.startsWith('data:') && !value.startsWith('blob:')) {
      return value.trim();
    }
  }
  return null;
}

/**
 * 從 picture 元素提取 URL
 *
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string|null} 提取的 URL 或 null
 */
function extractFromPicture(imgNode) {
  const parentPicture = imgNode.closest('picture');
  if (!parentPicture) {
    return null;
  }

  const sources = parentPicture.querySelectorAll('source');
  for (const source of sources) {
    const sourceSrcset = source.getAttribute('srcset');
    if (sourceSrcset) {
      const bestUrl = extractBestUrlFromSrcset(sourceSrcset);
      if (bestUrl) {
        return bestUrl;
      }
    }
  }
  return null;
}

/**
 * 從背景圖片 CSS 屬性提取 URL
 *
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string|null} 提取的 URL 或 null
 */
function extractFromBackgroundImage(imgNode) {
  try {
    if (globalThis.window === undefined || !globalThis.getComputedStyle) {
      return null;
    }

    const computedStyle = globalThis.getComputedStyle(imgNode);
    const backgroundImage =
      computedStyle.backgroundImage || computedStyle.getPropertyValue?.('background-image');

    if (backgroundImage && backgroundImage !== 'none') {
      // 使用 RegExp.exec() 取代 .match() 以符合 Lint 規範，優化 Regex 模式
      const bgPattern = /url\(["']?([^"']+)["']?\)/i;
      const match = bgPattern.exec(backgroundImage);
      const rawUrl = match?.[1];
      if (
        rawUrl &&
        rawUrl.length <= IMAGE_VALIDATION.MAX_URL_LENGTH &&
        !rawUrl.startsWith('data:') &&
        rawUrl.length < IMAGE_VALIDATION.MAX_BACKGROUND_URL_LENGTH
      ) {
        return rawUrl;
      }
    }

    // 檢查父節點的背景圖片
    const parent = imgNode.parentElement;
    if (parent) {
      const parentStyle = globalThis.getComputedStyle(parent);
      const parentBg =
        parentStyle.backgroundImage || parentStyle.getPropertyValue?.('background-image');

      if (parentBg && parentBg !== 'none') {
        const parentPattern = /url\(["']?([^"']+)["']?\)/i;
        const parentMatch = parentPattern.exec(parentBg);
        const parentUrl = parentMatch?.[1];
        if (
          parentUrl &&
          parentUrl.length <= IMAGE_VALIDATION.MAX_URL_LENGTH &&
          !parentUrl.startsWith('data:') &&
          parentUrl.length < IMAGE_VALIDATION.MAX_BACKGROUND_URL_LENGTH
        ) {
          return parentUrl;
        }
      }
    }
  } catch {
    // 忽略樣式計算錯誤
  }
  return null;
}

/**
 * 使用 DOMParser 從 HTML 提取圖片 src
 *
 * @param {string} html - HTML 字串
 * @returns {string|null} 圖片 src 或 null
 * @private
 */
function _extractWithDOMParser(html) {
  if (typeof DOMParser === 'undefined') {
    return null;
  }
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const img = doc.querySelector('img[src]');
    const src = img?.getAttribute('src');
    return src && !src.startsWith('data:') ? src : null;
  } catch {
    return null;
  }
}

/**
 * 使用正則表達式從 HTML 提取圖片 src
 *
 * @param {string} html - HTML 字串
 * @returns {string|null} 圖片 src 或 null
 * @private
 */
function _extractWithRegex(html) {
  // 使用 RegExp.exec() 取代 .match() 配合長度檢查
  const imgPattern = /<img[^>]+src=["']([^"']+)["']/i;
  const match = imgPattern.exec(html);
  const src = match?.[1];
  if (src && src.length <= IMAGE_VALIDATION.MAX_URL_LENGTH && !src.startsWith('data:')) {
    return src;
  }
  return null;
}

/**
 * 從 noscript 標籤提取 URL
 * 使用 DOMParser 優先策略（更穩健）+ Regex 回退（相容性）
 *
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string|null} 提取的 URL 或 null
 */
function extractFromNoscript(imgNode) {
  try {
    const candidates = [imgNode, imgNode.parentElement].filter(Boolean);
    for (const el of candidates) {
      const noscript = el.querySelector?.('noscript');
      if (!noscript?.textContent) {
        continue;
      }

      const html = noscript.textContent;
      const MAX_LENGTH = IMAGE_VALIDATION.MAX_URL_LENGTH * 2;
      if (html.length > MAX_LENGTH) {
        Logger.warn('noscript 內容過長', { action: 'extractFromNoscript', length: html.length });
        continue;
      }

      const src = _extractWithDOMParser(html) || _extractWithRegex(html);
      if (src) {
        return src;
      }
    }
  } catch {
    // 忽略 noscript 解析錯誤
  }
  return null;
}

/**
 * 從圖片元素中提取最佳的 src URL
 * 使用多層回退策略：srcset → 屬性 → picture → background → noscript
 *
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string|null} 提取的圖片 URL 或 null
 */
function extractImageSrc(imgNode) {
  if (!imgNode) {
    return null;
  }

  return (
    extractFromSrcset(imgNode) ||
    extractFromAttributes(imgNode) ||
    extractFromPicture(imgNode) ||
    extractFromBackgroundImage(imgNode) ||
    extractFromNoscript(imgNode)
  );
}

/**
 * 生成圖片緩存鍵
 *
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string} 緩存鍵
 */
function generateImageCacheKey(imgNode) {
  if (!imgNode) {
    return '';
  }

  const src = imgNode.getAttribute('src') || '';
  const dataSrc = imgNode.dataset.src || '';
  const className = imgNode.className || '';
  const id = imgNode.id || '';

  return `${src}|${dataSrc}|${className}|${id}`;
}

const ImageUtils = {
  cleanImageUrl,
  isValidImageUrl,
  extractImageSrc,
  extractBestUrlFromSrcset,
  generateImageCacheKey,
  IMAGE_ATTRIBUTES,
  IMAGE_VALIDATION,
  extractFromSrcset,
  extractFromAttributes,
  extractFromPicture,
  extractFromBackgroundImage,
  extractFromNoscript,
};

// Global assignment for backward compatibility
if (globalThis.window !== undefined) {
  globalThis.ImageUtils = ImageUtils;
}

export {
  cleanImageUrl,
  isValidImageUrl,
  extractImageSrc,
  extractBestUrlFromSrcset,
  generateImageCacheKey,
  extractFromSrcset,
  extractFromAttributes,
  extractFromPicture,
  extractFromBackgroundImage,
  extractFromNoscript,
};

export default ImageUtils;
export { IMAGE_ATTRIBUTES } from '../config/patterns.js';
