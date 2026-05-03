/**
 * temporaryImageUrl
 *
 * 偵測 temporary / signed image URL（如 Patreon CDN 的 *.patreonusercontent.com
 * 帶 token-time / token-hash 的 URL）。
 *
 * 拆出獨立模組是為了讓 background-side 不需 import imageUtils.js：
 * imageUtils.js 結尾有 globalThis side-effect (`globalThis.ImageUtils = ImageUtils`)，
 * 一旦 background-side 對 imageUtils 的 named export 做 import，rollup 會被迫
 * 保留整個 ImageUtils 物件含所有函數，造成 background bundle 大幅膨脹。
 * 透過拆獨立模組，background 端只 import 此處的 isTemporaryImageUrl，
 * 不再觸發 imageUtils 全模組評估。
 */

const PATREON_TEMP_HOSTNAME_REGEX = /(?:^|\.)patreonusercontent\.com$/i;

/**
 * 偵測高風險的 temporary / signed image URL
 *
 * 目前僅針對 Patreon CDN：hostname 為 *.patreonusercontent.com 且帶有
 * token-time / token-hash 參數的 URL。這類 URL 在 Notion 伺服器端拉取時
 * 容易因 token 過期或缺失 referer 而 404，導致 broken image。
 *
 * @param {string} url - 待檢查的 URL
 * @returns {boolean} 是否為已知的 temporary / signed URL
 */
export function isTemporaryImageUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (PATREON_TEMP_HOSTNAME_REGEX.test(parsed.hostname)) {
    return parsed.searchParams.has('token-time') || parsed.searchParams.has('token-hash');
  }

  return false;
}
