// Logger 由 Rollup intro 從 self.Logger/window.Logger 注入

// 默認追蹤參數列表
export const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'vero_id',
];

/**
 * 標準化 URL，用於生成一致的存儲鍵
 *
 * @param {string} rawUrl - 完整的絕對 URL
 * @returns {string} 標準化後的 URL，相對/無效 URL 返回原始輸入
 */
export function normalizeUrl(rawUrl) {
  // 輸入驗證
  if (!rawUrl || typeof rawUrl !== 'string') {
    return rawUrl || '';
  }

  // 快速檢查：相對 URL 直接返回（不進行標準化）
  if (!rawUrl.includes('://')) {
    return rawUrl;
  }

  try {
    const urlObj = new URL(rawUrl);

    // 1. 移除 fragment (hash)
    if (urlObj.hash) {
      urlObj.hash = '';
    }

    // 2. 移除常見的追蹤參數
    const trackingParams = TRACKING_PARAMS;
    trackingParams.forEach(param => {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.delete(param);
      }
    });

    // 3. 標準化尾部斜杠（保留根路徑 "/"）
    if (urlObj.pathname !== '/' && urlObj.pathname.endsWith('/')) {
      urlObj.pathname = urlObj.pathname.replace(/\/+$/, '');
    }

    return urlObj.toString();
  } catch (error) {
    Logger.error?.('❌ [normalizeUrl] 標準化失敗:', error);
    return rawUrl || '';
  }
}
