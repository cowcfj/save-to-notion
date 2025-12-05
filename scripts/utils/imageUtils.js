/**
 * 圖片處理工具函數庫
 * 統一的圖片 URL 處理、驗證和提取邏輯
 */

/* global ErrorHandler, SrcsetParser */

/**
 * 圖片驗證常數
 * 用於 URL 長度、參數數量等限制
 */
const IMAGE_VALIDATION_CONSTANTS = {
  MAX_URL_LENGTH: 2000, // Notion API URL 長度限制
  MAX_QUERY_PARAMS: 10, // 查詢參數數量閾值（超過可能為動態 URL）
  SRCSET_WIDTH_MULTIPLIER: 1000, // srcset w 描述符權重（優先於 x）
  MAX_BACKGROUND_URL_LENGTH: 2000, // 背景圖片 URL 最大長度（防止 ReDoS）
};

// Node.js 環境適配：嘗試從配置模組加載
if (typeof module !== 'undefined' && typeof require !== 'undefined') {
  try {
    const config = require('../config/constants');
    if (config.IMAGE_VALIDATION_CONSTANTS) {
      // 使用 Object.assign 確保不覆蓋引用，雖然這裡是替換整個對象
      // 但考慮到代碼結構，直接賦值更簡單
      Object.assign(IMAGE_VALIDATION_CONSTANTS, config.IMAGE_VALIDATION_CONSTANTS);
    }
  } catch (_err) {
    // 忽略加載錯誤，保持默認值
  }
}

/**
 * 清理和標準化圖片 URL
 * @param {string} url - 原始圖片 URL
 * @returns {string|null} 清理後的 URL 或 null（如果無效）
 */
function cleanImageUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  let urlObj = null;
  let isRelative = false;

  try {
    urlObj = new URL(url);
  } catch (error) {
    // 嘗試作為相對 URL 解析
    try {
      // 簡單啟發式檢查：如果是相對路徑，應該看起來像路徑
      // 1. 以 / 或 ./ 或 ../ 開頭
      // 2. 或者包含文件擴展名
      const isPathLike =
        url.startsWith('/') ||
        url.startsWith('./') ||
        url.startsWith('../') ||
        /\.[a-zA-Z0-9]{2,4}$/.test(url);

      if (!isPathLike) {
        throw new Error('Invalid relative URL format');
      }

      if (url.startsWith('//')) {
        urlObj = new URL(`https:${url}`);
        isRelative = false;
      } else {
        // 使用假域名作為基底來解析相對路徑
        urlObj = new URL(url, 'http://dummy-base.com');
        isRelative = true;
      }
    } catch (_e) {
      /*
       * URL 解析錯誤：通常是格式不正確的 URL
       * 返回 null 表示無法處理，調用者應該有適當的回退處理
       *
       * ErrorHandler 是全局變量，由 scripts/errorHandling/ErrorHandler.js 提供
       * 在瀏覽器環境中掛載到 window.ErrorHandler
       * 在 Node.js 測試環境中通過 require 引入
       */
      const ErrorHandlerRef =
        typeof window !== 'undefined'
          ? window.ErrorHandler
          : typeof ErrorHandler !== 'undefined'
            ? ErrorHandler
            : null;

      if (ErrorHandlerRef) {
        ErrorHandlerRef.logError({
          type: 'invalid_url',
          context: `URL cleaning: ${url}`,
          originalError: error,
          timestamp: Date.now(),
        });
      }
      return null;
    }
  }

  try {
    // 處理代理 URL（如 pgw.udn.com.tw/gw/photo.php）
    if (urlObj.pathname.includes('/photo.php') || urlObj.pathname.includes('/gw/')) {
      const uParam = urlObj.searchParams.get('u');
      if (uParam?.match(/^https?:\/\//)) {
        // 使用代理中的原始圖片 URL
        return cleanImageUrl(uParam);
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
      // 重建相對 URL
      // 注意：pathname 總是從 / 開始，如果原始 URL 是 'image.jpg'，這裡會變成 '/image.jpg'
      // 這通常是可以接受的標準化
      return urlObj.pathname + urlObj.search + urlObj.hash;
    }

    return urlObj.href;
  } catch (_error) {
    return null;
  }
}

/**
 * 檢查 URL 是否為有效的圖片格式
 * 整合了 AttributeExtractor 和 background.js 的驗證邏輯
 * @param {string} url - 要檢查的 URL
 * @returns {boolean} 是否為有效的圖片 URL
 */
function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // 排除 data: 和 blob: URL（來自 AttributeExtractor）
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return false;
  }

  // 排除明顯的佔位符（來自 AttributeExtractor）
  const placeholders = [
    'placeholder',
    'loading',
    'spinner',
    'blank',
    'empty',
    '1x1',
    'transparent',
  ];

  const lowerUrl = url.toLowerCase();
  if (placeholders.some(placeholder => lowerUrl.includes(placeholder))) {
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
  if (cleanedUrl.length > IMAGE_VALIDATION_CONSTANTS.MAX_URL_LENGTH) {
    return false;
  }

  try {
    // 為了後續檢查，如果是相對路徑，再次轉為對象
    const urlObj = isAbsolute ? new URL(cleanedUrl) : new URL(cleanedUrl, 'http://dummy-base.com');

    // 檢查是否為 data URL (再次檢查，以防 cleanImageUrl 改變了什麼)
    if (urlObj.protocol === 'data:') {
      return urlObj.href.startsWith('data:image/');
    }

    // 檢查文件擴展名
    const pathname = urlObj.pathname.toLowerCase();
    const imageExtensions = [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.webp',
      '.svg',
      '.bmp',
      '.ico',
      '.tiff',
      '.tif',
      '.avif',
      '.heic',
      '.heif',
    ];
    const hasImageExtension = imageExtensions.some(ext => pathname.endsWith(ext));

    // 如果 URL 包含圖片擴展名，直接返回 true
    if (hasImageExtension) {
      return true;
    }

    // 對於沒有明確擴展名的 URL（如 CDN 圖片），檢查是否包含圖片相關的路徑或關鍵字
    const imagePathPatterns = [
      /\/image[s]?\//i,
      /\/img[s]?\//i,
      /\/photo[s]?\//i,
      /\/picture[s]?\//i,
      /\/media\//i,
      /\/upload[s]?\//i,
      /\/asset[s]?\//i,
      /\/file[s]?\//i,
      /\/content\//i,
      /\/wp-content\//i,
      /\/cdn\//i,
      /cdn\d*\./i, // cdn1.example.com, cdn2.example.com
      /\/static\//i,
      /\/thumb[s]?\//i,
      /\/thumbnail[s]?\//i,
      /\/resize\//i,
      /\/crop\//i,
      /\/(\d{4})\/(\d{2})\//, // 日期路徑如 /2025/10/
    ];

    // 排除明顯不是圖片的 URL
    const excludePatterns = [
      /\.(js|css|html|htm|php|asp|jsp|json|xml)(\?|$)/i,
      /\/api\//i,
      /\/ajax\//i,
      /\/callback/i,
      /\/track/i,
      /\/analytics/i,
      /\/pixel/i,
    ];

    if (excludePatterns.some(pattern => pattern.test(cleanedUrl))) {
      return false;
    }

    return imagePathPatterns.some(pattern => pattern.test(cleanedUrl));
  } catch (_error) {
    return false;
  }
}

/**
 * 檢查 URL 是否可能被 Notion API 接受（更嚴格的驗證）
 * @param {string} url - 要檢查的 URL
 * @returns {boolean} 是否可能被 Notion 接受
 */
function isNotionCompatibleImageUrl(url) {
  if (!isValidImageUrl(url)) {
    return false;
  }

  try {
    const urlObj = new URL(url);

    // Notion 不支持某些特殊協議
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      return false;
    }

    // 檢查是否包含可能導致問題的特殊字符
    // Notion API 對某些字符敏感
    const problematicChars = /[<>{}|\\^`[\]]/;
    if (problematicChars.test(url)) {
      return false;
    }

    // 檢查是否有過多的查詢參數（可能表示動態生成的 URL）
    const paramCount = Array.from(urlObj.searchParams.keys()).length;
    if (paramCount > IMAGE_VALIDATION_CONSTANTS.MAX_QUERY_PARAMS) {
      // 使用與 ErrorHandler 相同的防禦性檢查模式
      // Logger 在瀏覽器環境中定義於 utils.js，但這裡需要防禦性檢查
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`⚠️ [圖片驗證] URL 查詢參數過多 (${paramCount}): ${url.substring(0, 100)}`);
      }
      return false;
    }

    return true;
  } catch (_error) {
    return false;
  }
}

/**
 * 統一的圖片屬性列表，涵蓋各種懶加載和響應式圖片的情況
 */
const IMAGE_ATTRIBUTES = [
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
 * 從 srcset 字符串中提取最佳圖片 URL
 * 優先使用 SrcsetParser 進行精確解析，回退到簡單實現
 * @param {string} srcset - srcset 屬性值
 * @returns {string|null} 最佳圖片 URL 或 null
 */
function extractBestUrlFromSrcset(srcset) {
  if (!srcset || typeof srcset !== 'string') {
    return null;
  }

  // 優先使用 SrcsetParser（如果可用）
  // SrcsetParser 在瀏覽器環境中掛載到 window.SrcsetParser
  // 在 Node.js 測試環境中可能通過 require 引入
  const SrcsetParserRef =
    typeof window !== 'undefined'
      ? window.SrcsetParser
      : typeof SrcsetParser !== 'undefined'
        ? SrcsetParser
        : null;

  if (SrcsetParserRef && typeof SrcsetParserRef.parse === 'function') {
    try {
      const bestUrl = SrcsetParserRef.parse(srcset, {
        preferredWidth: 1920, // 預設首選寬度
        preferredDensity: 2.0, // 預設首選密度
      });
      if (bestUrl) {
        return bestUrl;
      }
    } catch (error) {
      // SrcsetParser 失敗時回退到簡單實現
      // ErrorHandler 是全局變量，由 scripts/errorHandling/ErrorHandler.js 提供
      // 在瀏覽器環境中掛載到 window.ErrorHandler
      // 在 Node.js 測試環境中通過 require 引入
      const ErrorHandlerRef =
        typeof window !== 'undefined'
          ? window.ErrorHandler
          : typeof ErrorHandler !== 'undefined'
            ? ErrorHandler
            : null;

      if (ErrorHandlerRef) {
        ErrorHandlerRef.logError({
          type: 'srcset_parser_failed',
          context: 'SrcsetParser failed, falling back to simple implementation',
          originalError: error,
          timestamp: Date.now(),
        });
      }
    }
  }

  // 回退實現：簡單的 srcset 解析
  const srcsetEntries = srcset.split(',').map(entry => entry.trim());
  if (srcsetEntries.length === 0) {
    return null;
  }

  let bestUrl = null;
  let bestMetric = -1; // 比較值，優先使用 w，其次使用 x

  for (const entry of srcsetEntries) {
    const [url, descriptor] = entry.split(/\s+/);
    if (url && !url.startsWith('data:')) {
      let metric = -1;
      const wMatch = descriptor?.match(/(\d+)w/i);
      const xMatch = descriptor?.match(/(\d+)x/i);

      if (wMatch) {
        metric = parseInt(wMatch[1], 10) * IMAGE_VALIDATION_CONSTANTS.SRCSET_WIDTH_MULTIPLIER;
      } else if (xMatch) {
        metric = parseInt(xMatch[1], 10);
      } else {
        // 沒有描述，視為最小優先
        metric = 0;
      }

      if (metric > bestMetric) {
        bestMetric = metric;
        bestUrl = url;
      }
    }
  }

  return bestUrl || srcsetEntries[srcsetEntries.length - 1].split(/\s+/)[0];
}

/**
 * 從 srcset 屬性提取 URL
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string|null} 提取的 URL 或 null
 */
function extractFromSrcset(imgNode) {
  const srcset =
    imgNode.getAttribute('srcset') ||
    imgNode.getAttribute('data-srcset') ||
    imgNode.getAttribute('data-lazy-srcset');

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
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string|null} 提取的 URL 或 null
 */
function extractFromBackgroundImage(imgNode) {
  try {
    if (typeof window === 'undefined' || !window.getComputedStyle) {
      return null;
    }

    const computedStyle = window.getComputedStyle(imgNode);
    const backgroundImage =
      computedStyle.backgroundImage || computedStyle.getPropertyValue?.('background-image');

    if (backgroundImage && backgroundImage !== 'none') {
      // 限制捕獲組長度，防止 ReDoS 攻擊
      const urlMatch = backgroundImage.match(/url\(['"]?([^'"]{1,2000})['"]?\)/);
      if (
        urlMatch?.[1] &&
        !urlMatch[1].startsWith('data:') &&
        urlMatch[1].length < IMAGE_VALIDATION_CONSTANTS.MAX_BACKGROUND_URL_LENGTH
      ) {
        return urlMatch[1];
      }
    }

    // 檢查父節點的背景圖片
    const parent = imgNode.parentElement;
    if (parent) {
      const parentStyle = window.getComputedStyle(parent);
      const parentBg =
        parentStyle.backgroundImage || parentStyle.getPropertyValue?.('background-image');

      if (parentBg && parentBg !== 'none') {
        const parentMatch = parentBg.match(/url\(['"]?([^'"]{1,2000})['"]?\)/);
        if (
          parentMatch?.[1] &&
          !parentMatch[1].startsWith('data:') &&
          parentMatch[1].length < IMAGE_VALIDATION_CONSTANTS.MAX_BACKGROUND_URL_LENGTH
        ) {
          return parentMatch[1];
        }
      }
    }
  } catch (_error) {
    // 忽略樣式計算錯誤
  }
  return null;
}

/**
 * 從 noscript 標籤提取 URL
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string|null} 提取的 URL 或 null
 */
function extractFromNoscript(imgNode) {
  try {
    const candidates = [imgNode, imgNode.parentElement].filter(Boolean);
    for (const el of candidates) {
      const noscript = el.querySelector && el.querySelector('noscript');
      if (noscript?.textContent) {
        const html = noscript.textContent;
        const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (match?.[1] && !match[1].startsWith('data:')) {
          return match[1];
        }
      }
    }
  } catch (_error) {
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
 * @param {HTMLImageElement} imgNode - 圖片元素
 * @returns {string} 緩存鍵
 */
function generateImageCacheKey(imgNode) {
  if (!imgNode) {
    return '';
  }

  const src = imgNode.getAttribute('src') || '';
  const dataSrc = imgNode.getAttribute('data-src') || '';
  const className = imgNode.className || '';
  const id = imgNode.id || '';

  return `${src}|${dataSrc}|${className}|${id}`;
}

// 導出函數
if (typeof module !== 'undefined' && module.exports) {
  // Node.js 環境（測試）
  module.exports = {
    cleanImageUrl,
    isValidImageUrl,
    isNotionCompatibleImageUrl,
    extractImageSrc,
    extractBestUrlFromSrcset,
    generateImageCacheKey,
    IMAGE_ATTRIBUTES,
    IMAGE_VALIDATION_CONSTANTS,
    // 導出子函數供測試使用
    extractFromSrcset,
    extractFromAttributes,
    extractFromPicture,
    extractFromBackgroundImage,
    extractFromNoscript,
  };
} else if (typeof window !== 'undefined') {
  // 瀏覽器環境
  window.ImageUtils = {
    cleanImageUrl,
    isValidImageUrl,
    isNotionCompatibleImageUrl,
    extractImageSrc,
    extractBestUrlFromSrcset,
    generateImageCacheKey,
    IMAGE_ATTRIBUTES,
    IMAGE_VALIDATION_CONSTANTS,
  };
}
