/**
 * srcset candidate 手動解析與排序
 */

import { IMAGE_VALIDATION } from '../../config/shared/content.js';

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
