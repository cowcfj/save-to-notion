/**
 * URL 工具函數
 * 提供 URL 標準化功能，用於生成一致的存儲鍵
 */

// 從統一配置導入 TRACKING_PARAMS（Single Source of Truth）
import { URL_NORMALIZATION } from '../config/constants.js';

// Logger 回退定義：在 Rollup 打包時由 intro 注入自 self.Logger
// 在直接載入時使用回退定義
const Logger = (typeof self !== 'undefined' && self.Logger) || {
  log: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  info: () => {},
};

// 從配置導出 TRACKING_PARAMS（維持向後兼容）
export const TRACKING_PARAMS = URL_NORMALIZATION.TRACKING_PARAMS;

/**
 * 標準化 URL，用於生成一致的存儲鍵
 *
 * @param {string} rawUrl - 完整的絕對 URL
 * @returns {string} 標準化後的 URL，相對/無效 URL 返回原始輸入
 */
export function normalizeUrl(rawUrl) {
  // 空值檢查
  if (!rawUrl) {
    return '';
  }

  // 確保轉換為字符串
  if (typeof rawUrl !== 'string') {
    rawUrl = String(rawUrl);
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
    TRACKING_PARAMS.forEach(param => {
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
