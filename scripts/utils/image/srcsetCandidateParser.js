/**
 * srcset candidate 手動解析與排序
 */

import { IMAGE_VALIDATION } from '../../config/shared/content.js';

function _isDecimalDensityValue(value) {
  if (!value || value.startsWith('.') || value.endsWith('.')) {
    return false;
  }

  let dotCount = 0;
  for (const char of value) {
    if (char === '.') {
      dotCount++;
      if (dotCount > 1) {
        return false;
      }
      continue;
    }
    if (char < '0' || char > '9') {
      return false;
    }
  }
  return true;
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

function _parseSrcsetEntry(entry) {
  const [url, descriptor] = entry.trim().split(/\s+/);
  if (!url || url.startsWith('data:')) {
    return null;
  }

  let metric = 0;
  const wMatch = descriptor ? /^(\d+)w$/i.exec(descriptor) : null;
  const density = _parseDensityDescriptor(descriptor);

  if (wMatch) {
    metric = Number.parseInt(wMatch[1], 10) * IMAGE_VALIDATION.SRCSET_WIDTH_MULTIPLIER;
  } else if (density !== null) {
    metric = density;
  }

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
