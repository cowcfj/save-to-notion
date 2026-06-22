/**
 * SrcsetParser adapter
 */

/* global SrcsetParser */

import Logger from '../Logger.js';

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
 * 優先使用環境中的 SrcsetParser 解析 srcset。
 *
 * @param {string} srcset - srcset 屬性值
 * @returns {string|null} parser 回傳 URL 或 null
 */
export function parseWithSrcsetParser(srcset) {
  const parser = _getSrcsetParser();
  if (typeof parser?.parse !== 'function') {
    return null;
  }

  try {
    const bestUrl = parser.parse(srcset, { preferredWidth: 1920, preferredDensity: 2 });
    return bestUrl || null;
  } catch (error) {
    Logger.error('SrcsetParser 失敗', {
      action: 'extractBestUrlFromSrcset',
      error: error.message,
    });
    return null;
  }
}
