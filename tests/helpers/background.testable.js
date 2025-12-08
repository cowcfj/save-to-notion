/**
 * background.js 可測試版本
 *
 * 從 scripts/background.js 提取純函數用於測試
 * 這樣 Jest 可以正確追蹤覆蓋率
 */

// ==========================================
// URL UTILITIES
// ==========================================

/**
 * 清理和標準化圖片 URL
 */
function cleanImageUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  try {
    const urlObj = new URL(url);

    // 處理代理 URL（如 pgw.udn.com.tw/gw/photo.php）
    if (urlObj.pathname.includes('/photo.php') || urlObj.pathname.includes('/gw/')) {
      const uParam = urlObj.searchParams.get('u');
      if (uParam && /^https?:\/\//.test(uParam)) {
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

    return urlObj.href;
  } catch (_) {
    return null;
  }
}

/**
 * 檢查 URL 是否為有效的圖片格式
 */
function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // 先清理 URL
  const cleanedUrl = cleanImageUrl(url);
  if (!cleanedUrl) {
    return false;
  }

  // 檢查是否為有效的 HTTP/HTTPS URL
  if (!/^https?:\/\//i.test(cleanedUrl)) {
    return false;
  }

  // 檢查 URL 長度（Notion 有限制）
  if (cleanedUrl.length > 2000) {
    return false;
  }

  // 檢查常見的圖片文件擴展名
  const imageExtensions = /\.(?:jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|tif)(?:\?.*)?$/i;

  // 如果 URL 包含圖片擴展名，直接返回 true
  if (imageExtensions.test(cleanedUrl)) {
    return true;
  }

  // 對於沒有明確擴展名的 URL（如 CDN 圖片），檢查是否包含圖片相關的路徑
  const imagePathPatterns = [
    /\/image[s]?\//i,
    /\/img[s]?\//i,
    /\/photo[s]?\//i,
    /\/picture[s]?\//i,
    /\/media\//i,
    /\/upload[s]?\//i,
    /\/asset[s]?\//i,
    /\/file[s]?\//i,
  ];

  // 排除明顯不是圖片的 URL
  const excludePatterns = [
    /\.(js|css|html|htm|php|asp|jsp)(\?|$)/i,
    /\/api\//i,
    /\/ajax\//i,
    /\/callback/i,
  ];

  if (excludePatterns.some(pattern => pattern.test(cleanedUrl))) {
    return false;
  }

  return imagePathPatterns.some(pattern => pattern.test(cleanedUrl));
}

// ==========================================
// TEXT UTILITIES
// ==========================================

/**
 * 將長文本分割成符合 Notion 限制的片段
 * Notion API 限制每個 rich_text 區塊最多 2000 字符
 */
function splitTextForHighlight(text, maxLength = 2000) {
  if (!text || text.length <= maxLength) {
    return [text];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // 嘗試在句號、問號、驚嘆號、換行符處分割
    let splitIndex = -1;
    const punctuation = ['\n\n', '\n', '。', '.', '？', '?', '！', '!'];

    for (const punct of punctuation) {
      const lastIndex = remaining.lastIndexOf(punct, maxLength);
      if (lastIndex > maxLength * 0.5) {
        // 至少分割到一半以上，避免片段太短
        splitIndex = lastIndex + punct.length;
        break;
      }
    }

    // 如果找不到合適的標點，嘗試在空格處分割
    if (splitIndex === -1) {
      splitIndex = remaining.lastIndexOf(' ', maxLength);
      if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
        // 實在找不到，強制在 maxLength 處分割
        splitIndex = maxLength;
      }
    }

    chunks.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }

  return chunks.filter(chunk => chunk.length > 0); // 過濾空字符串
}

/**
 * 規範化 URL（與 utils.js 中的函數相同）
 */
function normalizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return rawUrl;
  }

  try {
    const url = new URL(rawUrl);

    // 移除 hash fragment
    url.hash = '';

    // 移除常見的追蹤參數
    const trackingParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
    ];
    trackingParams.forEach(param => url.searchParams.delete(param));

    // 標準化尾部斜杠（根路徑保留斜杠，其他路徑移除）
    if (url.pathname !== '/' && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }

    return url.href;
  } catch (_) {
    return rawUrl; // 無效的 URL，返回原值
  }
}

// Node.js 環境導出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    cleanImageUrl,
    isValidImageUrl,
    splitTextForHighlight,
    normalizeUrl,
  };
}
