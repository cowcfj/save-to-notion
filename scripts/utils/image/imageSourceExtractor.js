/**
 * 圖片處理工具 - 來源提取葉模組
 * 負責從各種 DOM 元素與屬性中提取最佳圖片來源 URL
 */

/* global SrcsetParser */

import Logger from '../Logger.js';
import {
  EMBEDDED_URL_ENCODED_HTTP_PROTOCOL_REGEX,
  IMAGE_VALIDATION,
} from '../../config/shared/content.js';
import { resolveImageUrl, hasRejectedImageProtocol } from './imageUrl.js';

const HTTP_URL_PROTOCOL_REGEX = /^https?:\/\//i;

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
 * @returns {{url: string, metric: number}|null} 解析結果
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
 * srcset fallback：當主迴圈未找到任何具有 width/density descriptor 的條目時，
 * 從尾部往回掃，回傳第一個非 data: URL 的條目作為保底
 *
 * @param {string[]} srcsetEntries - 已 trim 的 srcset 條目陣列
 * @returns {string|null} 保底 URL 或 null
 * @private
 */
function _findFallbackSrcsetUrl(srcsetEntries) {
  for (let i = srcsetEntries.length - 1; i >= 0; i--) {
    const url = srcsetEntries[i].split(/\s+/)[0];
    if (url && !url.startsWith('data:')) {
      return url;
    }
  }
  return null;
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
    if (!result || result.metric <= 0) {
      continue;
    }
    if (result.metric <= bestMetric) {
      continue;
    }
    bestMetric = result.metric;
    bestUrl = result.url;
  }

  return bestUrl ?? _findFallbackSrcsetUrl(srcsetEntries);
}

/**
 * 從 srcset 字符串中提取最佳圖片 URL
 * 優先使用 SrcsetParser 進行精確解析，回退到簡單實現
 *
 * @param {string} srcset - srcset 屬性值
 * @returns {string|null} 最佳圖片 URL 或 null
 */
export function extractBestUrlFromSrcset(srcset) {
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
export function extractFromSrcset(imgNode) {
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
export function extractFromAttributes(imgNode) {
  for (const attr of IMAGE_ATTRIBUTES) {
    const value = imgNode.getAttribute(attr);
    const trimmed = value?.trim();
    if (!trimmed) {
      continue;
    }
    if (hasRejectedImageProtocol(trimmed)) {
      continue;
    }
    return trimmed;
  }
  return null;
}

/**
 * 從 picture 元素提取 URL
 *
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string|null} 提取的 URL 或 null
 */
export function extractFromPicture(imgNode) {
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
 * 從給定節點的 computedStyle 中解析 background-image url() 並做 4-條件 guard 校驗
 *
 * @param {HTMLElement} node - 元素
 * @returns {string|null} 驗證過的 URL 或 null
 * @private
 */
function _extractValidUrlFromComputedStyle(node) {
  const backgroundImage = _getBackgroundImageValue(node);
  const rawUrl = _extractBackgroundImageUrl(backgroundImage);

  if (_shouldRejectBackgroundImageUrl(rawUrl)) {
    return null;
  }

  return rawUrl;
}

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
  if (_shouldSkipBackgroundImageValue(backgroundImage)) {
    return null;
  }

  const bgPattern = /url\(["']?([^"']+)["']?\)/i;
  return bgPattern.exec(backgroundImage)?.[1] ?? null;
}

function _shouldSkipBackgroundImageValue(backgroundImage) {
  if (!backgroundImage) {
    return true;
  }

  return backgroundImage === 'none';
}

function _shouldRejectBackgroundImageUrl(rawUrl) {
  if (!rawUrl) {
    return true;
  }

  if (rawUrl.startsWith('data:')) {
    return true;
  }

  if (rawUrl.length > IMAGE_VALIDATION.MAX_URL_LENGTH) {
    return true;
  }

  return rawUrl.length >= IMAGE_VALIDATION.MAX_BACKGROUND_URL_LENGTH;
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

/**
 * 使用正則表達式從 HTML 提取圖片 src
 *
 * @param {string} html - HTML 字串
 * @returns {string|null} 圖片 src 或 null
 * @private
 */
function _extractWithRegex(html) {
  const imgPattern = /<img[^>]+src=["']([^"']+)["']/i;
  const match = imgPattern.exec(html);
  const src = match?.[1];
  if (!src || src.length > IMAGE_VALIDATION.MAX_URL_LENGTH) {
    return null;
  }
  if (hasRejectedImageProtocol(src)) {
    return null;
  }
  return src;
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
      const MAX_LENGTH = IMAGE_VALIDATION.MAX_URL_LENGTH * 2;
      if (html.length > MAX_LENGTH) {
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

/**
 * 從 Anchor 標籤提取 href
 *
 * @param {HTMLElement} node - 元素
 * @returns {string|null} 提取的 URL 或 null
 * @private
 */
function _extractFromAnchorHref(node) {
  if (node.tagName !== 'A') {
    return null;
  }
  const href = node.getAttribute('href');
  if (!href) {
    return null;
  }
  if (/^javascript:/i.test(href)) {
    return null;
  }
  if (href.startsWith('#')) {
    return null;
  }
  return href;
}

/**
 * 快速檢查 URL 是否為合理的圖片 URL 格式
 *
 * @param {string} url - 待驗證的 URL 字串
 * @returns {boolean} 是否為合理的 URL 格式
 * @private
 */
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
 * 對 `<a>` 元素優先嘗試 href 作為圖片來源。
 *
 * @param {HTMLElement} imgNode - 圖片元素或容器
 * @returns {string|null} anchor href 或 null
 * @private
 */
function _tryAnchorHref(imgNode) {
  if (imgNode.tagName !== 'A') {
    const anchor = imgNode.closest?.('a');
    return anchor ? _extractFromAnchorHref(anchor) : null;
  }
  return _extractFromAnchorHref(imgNode);
}

/**
 * 取 srcset 結果並驗證是否為未截斷的合理 URL。
 *
 * @param {HTMLElement} imgNode - 圖片元素
 * @returns {string|null} 驗證通過的 srcset URL 或 null
 */
export function extractValidatedSrcsetUrl(imgNode) {
  const srcsetUrl = extractFromSrcset(imgNode);
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
  const anchorHref = _tryAnchorHref(imgNode);
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
