/**
 * 圖片處理工具函數庫
 * 統一的圖片 URL 處理、驗證和提取邏輯
 */

/* global SrcsetParser */

import { sanitizeUrlForLogging } from './securityUtils.js';
import Logger from './Logger.js';
import { IMAGE_VALIDATION as CONFIG_VALIDATION } from '../config/constants.js';
import {
  IMAGE_ATTRIBUTES,
  IMAGE_EXTENSIONS,
  IMAGE_PATH_PATTERNS,
  EXCLUDE_PATTERNS,
  PLACEHOLDER_KEYWORDS,
} from '../config/patterns.js';

// 圖片驗證 constant 默認值，如果 config 導入失敗或缺漏則使用這些
const DEFAULT_VALIDATION = {
  MAX_URL_LENGTH: 2000,
  URL_LENGTH_SAFETY_MARGIN: 500,
  MAX_QUERY_PARAMS: 10,
  SRCSET_WIDTH_MULTIPLIER: 1000,
  MAX_BACKGROUND_URL_LENGTH: 2000,
  MAX_RECURSION_DEPTH: 5,
};

const IMAGE_VALIDATION = { ...DEFAULT_VALIDATION, ...CONFIG_VALIDATION };

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
 * 清理和標準化圖片 URL
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

  const resolved = _resolveUrl(url);
  if (!resolved) {
    Logger.error('URL 轉換失敗', { action: 'cleanImageUrl', url: sanitizeUrlForLogging(url) });
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
 * 檢查 URL 是否為有效的圖片格式
 * 整合了 AttributeExtractor 和 background.js 的驗證邏輯
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
    // 基本驗證：只檢查協議
    return /^https?:\/\//i.test(url);
  }

  // 排除 data: 和 blob: URL（來自 AttributeExtractor）
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return false;
  }

  // 排除明顯的佔位符（使用 patterns.js 的配置）
  const lowerUrl = url.toLowerCase();
  if (PLACEHOLDER_KEYWORDS.some(placeholder => lowerUrl.includes(placeholder))) {
    return false;
  }

  // 先清理 URL
  const cleanedUrl = cleanImageUrl(url);
  if (!cleanedUrl) {
    return false;
  }

  // 檢查是否為有效的 HTTP/HTTPS URL 或 相對路徑
  const isAbsolute = /^https?:\/\//i.test(cleanedUrl);
  // 相對路徑通常以 / 或 . 開頭，或者只是文件名（cleanImageUrl 會加上 /）
  const isRelative = cleanedUrl.startsWith('/');

  if (!isAbsolute && !isRelative) {
    return false;
  }

  // 檢查 URL 長度（Notion API 限制）
  if (cleanedUrl.length > IMAGE_VALIDATION.MAX_URL_LENGTH) {
    return false;
  }

  try {
    // 為了後續檢查，如果是相對路徑，再次轉為對象
    const urlObj = isAbsolute ? new URL(cleanedUrl) : new URL(cleanedUrl, 'https://dummy-base.com');

    // 檢查文件擴展名（使用 patterns.js 的配置）
    const pathname = urlObj.pathname.toLowerCase();
    const hasImageExtension = IMAGE_EXTENSIONS.test(pathname);

    // 如果 URL 包含圖片擴展名，直接返回 true
    if (hasImageExtension) {
      return true;
    }

    // 排除明顯不是圖片的 URL（使用 patterns.js 的配置）
    if (EXCLUDE_PATTERNS.some(pattern => pattern.test(cleanedUrl))) {
      return false;
    }

    // 對於沒有明確擴展名的 URL（如 CDN 圖片），檢查是否包含圖片相關的路徑或關鍵字
    return IMAGE_PATH_PATTERNS.some(pattern => pattern.test(cleanedUrl));
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
