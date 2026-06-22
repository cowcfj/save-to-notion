/**
 * 圖片處理工具 - srcset 提取葉模組
 * 負責 srcset 解析、候選 URL 選擇與截斷 URL 過濾
 */

import { parseBestCandidateSrcsetUrl } from './srcsetCandidateParser.js';
import { parseWithSrcsetParser } from './srcsetParserAdapter.js';
import { validateSrcsetUrl } from './srcsetUrlValidator.js';

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

  const parserResult = parseWithSrcsetParser(srcset);
  if (parserResult) {
    return parserResult;
  }

  const entries = srcset.split(',').map(entry => entry.trim());
  return entries.length > 0 ? parseBestCandidateSrcsetUrl(entries) : null;
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
 * 取 srcset 結果並驗證是否為未截斷的合理 URL。
 *
 * @param {HTMLElement} imgNode - 圖片元素
 * @returns {string|null} 驗證通過的 srcset URL 或 null
 */
export function extractValidatedSrcsetUrl(imgNode) {
  return validateSrcsetUrl(extractFromSrcset(imgNode));
}
