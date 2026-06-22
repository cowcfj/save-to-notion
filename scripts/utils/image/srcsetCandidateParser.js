/**
 * srcset candidate 手動解析與排序
 */

import { IMAGE_VALIDATION } from '../../config/shared/content.js';

/**
 * 檢查值是否具有點（.）邊界錯誤（為空、以點開頭、或以點結尾）
 *
 * @param {string} value - 待檢查的值
 * @returns {boolean} 是否有錯誤
 */
function _hasDotBoundaryError(value) {
  return !value || value.startsWith('.') || value.endsWith('.');
}

/**
 * 檢查是否僅包含數字與最多一個點
 *
 * @param {string} value - 待檢查的值
 * @returns {boolean} 是否僅包含數字與最多一個點
 */
function _hasOnlyDigitsAndSingleDot(value) {
  let dotCount = 0;
  for (const char of value) {
    if (char === '.') {
      dotCount++;
    } else if (char < '0' || char > '9') {
      return false;
    }
  }
  return dotCount <= 1;
}

function _isDecimalDensityValue(value) {
  if (_hasDotBoundaryError(value)) {
    return false;
  }
  return _hasOnlyDigitsAndSingleDot(value);
}

function _parseDensityDescriptor(descriptor) {
  if (!descriptor?.toLowerCase().endsWith('x')) {
    return null;
  }

  const value = descriptor.slice(0, -1);
  if (!_isDecimalDensityValue(value)) {
    return null;
  }

  const density = Number.parseFloat(value);
  return Number.isFinite(density) ? density : null;
}

/**
 * 解析描述符度量值 (width 或 density)
 *
 * @param {string|null} descriptor - 描述符（如 '2x', '500w'）
 * @returns {number|null} 解析後的度量值，失敗時返回 null
 */
function _parseDescriptorMetric(descriptor) {
  if (!descriptor) {
    return null;
  }

  const wMatch = /^(\d+)w$/i.exec(descriptor);
  if (wMatch) {
    return Number.parseInt(wMatch[1], 10) * IMAGE_VALIDATION.SRCSET_WIDTH_MULTIPLIER;
  }

  return _parseDensityDescriptor(descriptor);
}

function _parseSrcsetEntry(entry) {
  const [url, descriptor] = entry.trim().split(/\s+/);
  if (!url || url.startsWith('data:')) {
    return null;
  }

  const parsedMetric = _parseDescriptorMetric(descriptor);
  const metric = parsedMetric === null ? 0 : parsedMetric;

  return { url, metric };
}

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
 */
export function parseBestCandidateSrcsetUrl(srcsetEntries) {
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
