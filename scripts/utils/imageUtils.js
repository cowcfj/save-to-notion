/**
 * 圖片處理工具函數庫
 * 統一的圖片 URL 處理、驗證和提取邏輯
 */

/* global SrcsetParser */

import { sanitizeUrlForLogging } from './securityUtils.js';
import Logger from './Logger.js';
import {
  EMBEDDED_URL_ENCODED_HTTP_PROTOCOL_REGEX,
  IMAGE_VALIDATION,
} from '../config/shared/content.js';

// ==========================================
// 圖片驗證常量（原 config/patterns.js Group A）
// ==========================================

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

export const IMAGE_EXTENSIONS = /\.(?:jpg|jpeg|png|webp|svg|bmp|ico|tiff|tif|avif|heic|heif)$/i;

export const IMAGE_PATH_PATTERNS = [
  /\/images?\//i,
  /\/imgs?\//i,
  /\/photos?\//i,
  /\/pictures?\//i,
  /\/media\//i,
  /\/uploads?\//i,
  /\/assets?\//i,
  /\/files?\//i,
  /\/content\//i,
  /\/wp-content\//i,
  /\/cdn\//i,
  /cdn\d*\./i,
  /\/static\//i,
  /\/thumbs?\//i,
  /\/thumbnails?\//i,
  /\/resize\//i,
  /\/crop\//i,
  /\/(\d{4})\/(\d{2})\//,
  /\/avatars?\//i,
  /\/u\/\d+(?:$|\/|\?)/i,
  /\/profile_images\//i,
  /\/creatr-uploaded-images\//i,
  /\/ny\/api\/res\//i,
  /\.gtimg\.com\//i, // 騰訊圖片 CDN (例如 news.qq.com 上的無副檔名圖片)
];

const EXCLUDE_PATTERNS = [
  /\.(js|css|html|htm|php|asp|jsp|json|xml)(\?|$)/i,
  /\/api\//i,
  /\/ajax\//i,
  /\/callback/i,
  /\/track/i,
  /\/analytics/i,
  /\/pixel/i,
];

/** 圖片佔位符關鍵字 */
const PLACEHOLDER_KEYWORDS = [
  'placeholder',
  'loading',
  'spinner',
  'blank',
  'empty',
  '1x1',
  'transparent',
  'miscellaneous_sprite', // 排除雜項佈局圖片 (e.g., miscellaneous_sprite.png)
  '.gif', // 排除 GIF 圖片（通常為動畫圖標或佔位符，非內容圖片）
];

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
 * 「第一階段」編碼：讓 `new URL()` 能夠正確解析輸入 URL
 *
 * 設計說明：
 * 1. `decodeURI` 先解碼現有 %XX，避免後續 `encodeURI` 產生雙重編碼（%25XX）。
 * 2. `encodeURI` 再編碼，修復未編碼字元，但保留 URL 語義分隔符（`? & = / :`）。
 * 3. 字元層編碼：對 `( ) ' [ ] ^ | { } < >` 做 `encodeURIComponent`，
 *    這些字元 `encodeURI` 不處理，但在 Notion/Markdown 語境下會破壞解析。
 *
 * ❗ 此函數後，`new URL(normalized).href` 會再次語法標準化，
 *    將 `%28` 自動解碼回 `(`。因此 `_applyNotionCompatibilityEncoding`
 *    必須在 `urlObj.href` 從 URL 對象取出後才執行（後置編碼）。
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

  // 偵測 CDN 代理 URL（如 Substack/Cloudinary/imgix）
  // 這類 URL 在路徑中嵌入另一個 percent-encoded 的 URL，例如：
  //   https://substackcdn.com/image/fetch/.../https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com/...
  // 若執行 decodeURI()，%3A%2F%2F 會被解碼為 ://，而 encodeURI() 不會重新編碼
  // `:` 和 `/`（URI-safe 字符），導致路徑結構被永久破壞。
  // 解法：偵測到嵌入式 percent-encoded URL 時直接返回，跳過 decode/encode。
  if (EMBEDDED_URL_ENCODED_HTTP_PROTOCOL_REGEX.test(normalized)) {
    // 仍需執行 Markdown/Notion 兼容字元編碼，避免特殊字元破壞解析
    return normalized.replaceAll(/[()'[\]^|{}<>]/g, char => encodeURIComponent(char));
  }

  // 特殊字符編碼修復
  try {
    const decoded = decodeURI(normalized);
    normalized = encodeURI(decoded);
    // 使用 'char' 替代 'c' 以滿足變數命名長度規範
    // [Changed] Also encode parentheses and single quotes which can cause issues in Notion/Markdown
    normalized = normalized.replaceAll(/[()'[\]^|{}<>]/g, char => encodeURIComponent(char));
  } catch {
    // 忽略編碼錯誤
  }

  return normalized;
}

/**
 * 處理 Next.js 圖片優化 URL 的拆包邏輯 (私有輔助函數)
 *
 * @param {URL} urlObj - 解析後的 URL 對象
 * @param {number} depth - 當前遞迴深度
 * @returns {string|null} 拆包後的標準 URL 或 null
 * @private
 */
function _unwrapNextJsUrl(urlObj, depth) {
  // 檢查路徑特徵
  if (!urlObj.pathname.includes('/_next/image')) {
    return null;
  }

  const urlParam = urlObj.searchParams.get('url');
  if (!urlParam) {
    return null;
  }

  try {
    let nextUrl = urlParam;

    // 處理 _normalizeUrlInternal 可能引入的雙重編碼問題
    // 如果 URL 參數看起來仍被編碼 (如 https%3A%2F%2F 或 %2F 開頭)，嘗試解碼
    if (!/^https?:\/\//i.test(nextUrl) && /^(?:https?%3A%2F%2F|%2F)/i.test(nextUrl)) {
      try {
        nextUrl = decodeURIComponent(nextUrl);
      } catch {
        // 解碼失敗則保持原樣
      }
    }

    // 如果是相對路徑，則繼承當前 URL 的 origin
    const isAbsolute = /^https?:\/\//i.test(nextUrl);
    if (!isAbsolute) {
      nextUrl = new URL(nextUrl, urlObj.origin).href;
    }

    return cleanImageUrl(nextUrl, depth + 1);
  } catch {
    return null;
  }
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
  // 基本格式驗證：Notion 僅支援 HTTP/HTTPS 協議
  if (
    normalized.startsWith('data:') ||
    normalized.startsWith('blob:') ||
    !/^https?:\/\//i.test(normalized)
  ) {
    return null;
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
    // 優先處理 Next.js 拆包
    const unwrappedNextUrl = _unwrapNextJsUrl(urlObj, depth);
    if (unwrappedNextUrl) {
      return unwrappedNextUrl;
    }

    // 處理特定域名規則 (代理 URL、itok 等)
    const specialResult = _handleSpecialDomainRules(urlObj, depth);
    if (specialResult) {
      return specialResult;
    }

    // 標準化查詢參數
    _standardizeSearchParams(urlObj);

    if (isRelative) {
      return urlObj.pathname + urlObj.search + urlObj.hash;
    }

    // Notion 兼容性編碼修復
    return _applyNotionCompatibilityEncoding(urlObj.href);
  } catch {
    return null;
  }
}

/**
 * 處理特定域名的特殊規則 (如代理 URL 提取、Drupal itok 移除等)
 *
 * @param {URL} urlObj - URL 物件
 * @param {number} depth - 遞迴深度
 * @returns {string|null} 處理後的 URL (如有特殊轉換) 或 null
 * @private
 */
function _handleSpecialDomainRules(urlObj, depth) {
  // 處理代理 URL (photo.php, gw/)
  if (urlObj.pathname.includes('/photo.php') || urlObj.pathname.includes('/gw/')) {
    const uParam = urlObj.searchParams.get('u');
    if (uParam) {
      // 確保 u 參數是有效的 URL (解碼後再校驗以提高兼容性)
      const targetUrl = uParam.includes('%') ? decodeURIComponent(uParam) : uParam;
      if (/^https?:\/\//i.test(targetUrl)) {
        return cleanImageUrl(targetUrl, depth + 1);
      }
    }
  }

  // [Fixed] inmediahk.net 專門處理：移除 itok 查詢參數以解決 Notion 加載失敗問題
  // 使用嚴格匹配確保安全性，防止 evil-inmediahk.net 等欺騙域名
  const isInMediaHK = /(?:^|\.)inmediahk\.net$/i.test(urlObj.hostname);
  if (isInMediaHK && urlObj.searchParams.has('itok')) {
    urlObj.searchParams.delete('itok');
  }

  return null;
}

/**
 * 標準化查詢參數 (移除重複項)
 *
 * @param {URL} urlObj - URL 物件
 * @private
 */
function _standardizeSearchParams(urlObj) {
  const params = new URLSearchParams();
  for (const [key, value] of urlObj.searchParams.entries()) {
    if (!params.has(key)) {
      params.set(key, value);
    }
  }
  urlObj.search = params.toString();
}

/**
 * 應用 Notion/Markdown 兼容性編碼
 *
 * 「第二階段」編碼：修復 `new URL().href` 自動解碼引起的問題
 *
 * 設計說明：
 * `new URL(url).href` 會將 `%28` 解碼回 `(`。即使 `_normalizeUrlInternal`
 * 已將 `(` 編碼為 `%28`，`urlObj.href` 仍會將它解回。
 * 因此必須在此後置步驟再次編碼。
 *
 * 不會雙重編碼的原因：
 * 此函數只用字面字元比對（`'('`, `')'`, `"'"`），
 * 而 `urlObj.href` 中不會出現已是 `%28` 形式的對應字元，
 * 因此此函數不會引發 `%2528`（雙重編碼）。
 *
 * ⚠️ 維護注意：`_normalizeUrlInternal` 先對原始輸入做前置編碼（供 `new URL()` 正確解析）；
 * 此函數後置修復 `urlObj.href` 取出後可能被自動解碼的字元。
 * 如果未來修改其中任一步驟，請確認不會圖謀雙重編碼。
 *
 * @param {string} url - 原始 URL 字串（`urlObj.href` 取出後）
 * @returns {string} 編碼後的 URL
 * @private
 */
function _applyNotionCompatibilityEncoding(url) {
  // new URL() 會自動解碼 "安全" 字符 (如括號)，但在 Markdown 語境中它們需要被編碼
  return url.replaceAll(/[()']/g, char => {
    const map = {
      '(': '%28',
      ')': '%29',
      "'": '%27',
    };
    return map[char] || char;
  });
}

/**
 * 檢查已清理的圖片 URL 是否有效 (Notion 兼容性驗證)
 *
 * 此函數假設輸入 URL 已經過 cleanImageUrl 處理（標準化、協議升級等）。
 * 用於已持有 cleanedUrl 的場景，避免重複執行清理邏輯。
 *
 * @param {string} cleanedUrl - 已清理的圖片 URL
 * @returns {boolean} 是否為有效的圖片 URL
 */
function isValidCleanedImageUrl(cleanedUrl) {
  if (!cleanedUrl || typeof cleanedUrl !== 'string') {
    return false;
  }

  // 統一驗證：確保 patterns.js 常量已正確載入
  const patternsLoaded =
    IMAGE_EXTENSIONS && EXCLUDE_PATTERNS && IMAGE_PATH_PATTERNS && PLACEHOLDER_KEYWORDS;
  if (!patternsLoaded) {
    Logger.warn?.('Pattern 常量未載入，回退到基本驗證', { action: 'isValidCleanedImageUrl' });
    return /^https:\/\//i.test(cleanedUrl); // Notion 要求 HTTPS
  }

  // 1. 攔截非 HTTP/HTTPS (已清理的 URL 不應包含 data: 或 blob:)
  if (cleanedUrl.startsWith('data:') || cleanedUrl.startsWith('blob:')) {
    return false;
  }

  // 2. 排除明顯的佔位符
  const lowerUrl = cleanedUrl.toLowerCase();
  if (PLACEHOLDER_KEYWORDS.some(placeholder => lowerUrl.includes(placeholder))) {
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
 * 檢查 URL 是否為有效的圖片格式 (Notion 兼容性驗證)
 *
 * 注意：此函數會調用 cleanImageUrl 來進行標準化（如 http→https 升級與編碼修復）。
 * 因此其驗證結果是基於清理後的 URL。
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
  // [Optimization] 下列檢查（data:/blob:、非 http 開頭、佔位符）與 isValidCleanedImageUrl 內的邏輯重疊。
  // 這是有意為之的 Early Exit 優化，旨在避免對明顯無效的 URL 執行昂貴的 cleanImageUrl 操作。

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

  // 優化：針對 .gif 使用正則表達式進行精確匹配（避免誤殺包含 gif 的非擴展名路徑）
  if (/\.gif(?:\?|$)/i.test(url)) {
    return false;
  }

  // 其他簡單關鍵字匹配
  if (
    PLACEHOLDER_KEYWORDS.some(
      placeholder => placeholder !== '.gif' && lowerUrl.includes(placeholder)
    )
  ) {
    return false;
  }

  // 2. 清理與標準化
  const cleanedUrl = cleanImageUrl(url);
  if (!cleanedUrl) {
    return false;
  }

  // 3. 使用清理後的 URL 進行驗證
  return isValidCleanedImageUrl(cleanedUrl);
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

    // 2. 先檢查正向圖片路徑模式 (優先於排除)
    if (IMAGE_PATH_PATTERNS.some(pattern => pattern.test(url))) {
      // 但必須確保它不是被明確排除的文件類型 (如 .js, .json)
      // 這解決了 https://example.com/api/images/data.js 的誤判問題
      const isExplicitlyExcluded = EXCLUDE_PATTERNS.some(pattern => {
        // 只檢查文件擴展名相關的排除模式 (通常包含 \.)
        // WARNING: 这是一个启发式检查，假设包含 "\." 的模式是为了匹配文件扩展名。
        // 如果 EXCLUDE_PATTERNS 中包含像 /\.internal\.domain/ 这样的非扩展名模式，这里可能会产生假阴性。
        // Future improvement: 在 patterns.js 中明确区分 "扩展名排除" 和 "路径排除"。
        return pattern.source.includes(String.raw`\.`) && pattern.test(url);
      });

      if (!isExplicitlyExcluded) {
        return true;
      }
    }

    // 3. 排除特定模式 (如 /api/, /callback/)
    if (EXCLUDE_PATTERNS.some(pattern => pattern.test(url))) {
      return false;
    }

    // 4. 回退：如果沒有匹配任何模式，拒絕
    return false;
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
 * 使用正則表達式掃描 src 屬性（避免不必要的 DOM 解析以縮小攻擊面）
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
 * 從 Anchor 標籤提取 href (內部輔助函數)
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
  if (href && !/^javascript:/i.test(href) && !href.startsWith('#')) {
    return href;
  }
  return null;
}

/**
 * 快速檢查 URL 是否為合理的圖片 URL 格式
 *
 * 用於驗證 srcset 解析結果。某些 CDN（Substack/Cloudinary）的 URL
 * 在 transform 參數中包含逗號，與 srcset 的逗號分隔符衝突，
 * 導致 URL 被截斷為無效片段（如 "fl_progressive:steep/https%3A..."）。
 *
 * @param {string} url - 待驗證的 URL 字串
 * @returns {boolean} 是否為合理的 URL 格式
 * @private
 */
function _isPlausibleImageUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  // 偵測 CDN URL 被 srcset 逗號分割截斷的特徵：
  // 截斷片段含嵌入式 percent-encoded URL（https%3A%2F%2F），但本身不以 http(s):// 或 // 開頭
  // 例如 "fl_progressive:steep/https%3A%2F%2Fsubstack-post-media..." 是截斷結果
  // 而 "https://substackcdn.com/image/fetch/.../https%3A%2F%2F..." 是完整 URL
  // 而 "//substackcdn.com/image/fetch/.../https%3A%2F%2F..." 是合法的 protocol-relative URL
  if (
    EMBEDDED_URL_ENCODED_HTTP_PROTOCOL_REGEX.test(url) &&
    !/^https?:\/\//i.test(url) &&
    !url.startsWith('//')
  ) {
    return false;
  }
  return true;
}

/**
 * 從圖片元素中提取最佳的 src URL
 * 使用多層回退策略：
 * - 對於 Anchor 元素：優先使用 href（用於畫廊圖片）
 * - 對於其他元素：srcset → 屬性 → picture → background → noscript → anchor
 *
 * @param {HTMLImageElement|HTMLElement} imgNode - 圖片元素或容器
 * @returns {string|null} 提取的圖片 URL 或 null
 */
function extractImageSrc(imgNode) {
  if (!imgNode) {
    return null;
  }

  // [IMPORTANT] 對於 Anchor 元素，優先使用 href
  // 這解決了像明報畫廊這樣的情況，<a> 的 href 包含高解析度圖片，
  // 而其子 <img> 的 src 只是加載佔位符 (loading.gif)
  if (imgNode.tagName === 'A') {
    const hrefResult = _extractFromAnchorHref(imgNode);
    if (hrefResult) {
      return hrefResult;
    }
    // 如果 href 無效（如 javascript: 或空），則回退到子元素提取
  }

  // srcset 優先，但需驗證結果有效性
  // Substack/Cloudinary CDN URL 的 transform 參數含逗號（如 w_424,c_limit,f_auto,...）
  // 與 srcset 的逗號分隔符衝突，導致 URL 被截斷為無效片段。
  // 必須驗證 srcset 結果是否為合理的圖片 URL，否則回退到 src 屬性。
  const srcsetUrl = extractFromSrcset(imgNode);
  if (srcsetUrl && _isPlausibleImageUrl(srcsetUrl)) {
    return srcsetUrl;
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

/**
 * 合併圖片區塊，過濾掉已存在於主區塊列表中的重複圖片
 *
 * @param {Array} contentBlocks - 主內容區塊列表
 * @param {Array} additionalImages - 待合併的額外圖片列表
 * @returns {Array} 去重後的額外圖片列表
 */
function mergeUniqueImages(contentBlocks, additionalImages) {
  if (!Array.isArray(additionalImages) || additionalImages.length === 0) {
    return [];
  }

  const existingUrls = new Set();

  if (Array.isArray(contentBlocks)) {
    // 收集 contentBlocks 中的圖片 URL
    contentBlocks.forEach(block => {
      if (block.type === 'image' && block.image?.external?.url) {
        existingUrls.add(block.image.external.url);
      }
    });
  }

  // 過濾 additionalImages
  return additionalImages.filter(imgBlock => {
    const url = imgBlock.image?.external?.url;
    if (!url) {
      return false;
    }

    if (existingUrls.has(url)) {
      return false;
    }

    // 防止 additionalImages 內部自我重複
    existingUrls.add(url);
    return true;
  });
}

const ImageUtils = {
  cleanImageUrl,
  isValidImageUrl,
  isValidCleanedImageUrl,
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
  mergeUniqueImages,
};

// Global assignment for backward compatibility
if (globalThis.window !== undefined) {
  globalThis.ImageUtils = ImageUtils;
}

export {
  cleanImageUrl,
  isValidImageUrl,
  isValidCleanedImageUrl,
  extractImageSrc,
  extractBestUrlFromSrcset,
  generateImageCacheKey,
  extractFromSrcset,
  extractFromAttributes,
  extractFromPicture,
  extractFromBackgroundImage,
  extractFromNoscript,
  mergeUniqueImages,
};

export default ImageUtils;
