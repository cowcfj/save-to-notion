/**
 * 圖片處理工具 - srcset 提取葉模組
 * 負責 srcset 解析、候選 URL 選擇與截斷 URL 過濾
 */

/* global SrcsetParser */

import Logger from '../Logger.js';
import {
  EMBEDDED_URL_ENCODED_HTTP_PROTOCOL_REGEX,
  IMAGE_VALIDATION,
} from '../../config/shared/content.js';
import { resolveImageUrl, hasRejectedImageProtocol } from './imageUrl.js';

const HTTP_URL_PROTOCOL_REGEX = /^https?:\/\//i;

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
