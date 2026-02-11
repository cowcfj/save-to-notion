/**
 * URL 工具函數
 * 提供 URL 標準化功能，用於生成一致的存儲鍵
 */

// 從統一配置導入 TRACKING_PARAMS（Single Source of Truth）
import { URL_NORMALIZATION, STABLE_URL_RULES } from '../config/constants.js';

// Logger 回退定義：在 Rollup 打包時由 intro 注入自 self.Logger
// 在直接載入時使用回退定義
const Logger = (globalThis.self !== undefined && globalThis.Logger) || {
  log: () => {
    /* no-op */
  },
  warn: () => {
    /* no-op */
  },
  error: () => {
    /* no-op */
  },
  debug: () => {
    /* no-op */
  },
  info: () => {
    /* no-op */
  },
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
    while (urlObj.pathname.length > 1 && urlObj.pathname.endsWith('/')) {
      urlObj.pathname = urlObj.pathname.slice(0, -1);
    }

    return urlObj.toString();
  } catch (error) {
    Logger.error?.('normalizeUrl 標準化失敗', { action: 'normalizeUrl', error });
    return rawUrl || '';
  }
}

/**
 * 計算穩定 URL — 對已知網站移除可變的 slug 段
 * 純字串操作，不需 DOM 訪問，適用於零延遲場景
 *
 * @param {string} rawUrl - 原始 URL
 * @returns {string|null} 穩定 URL，若無匹配規則返回 null
 */
export function computeStableUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.includes('://')) {
    return null;
  }

  try {
    const urlObj = new URL(rawUrl);
    const { hostname, pathname } = urlObj;

    for (const rule of STABLE_URL_RULES) {
      const pattern = rule.hostPattern.toLowerCase();
      const host = hostname.toLowerCase();

      // 嚴格域名檢查：必須完全匹配或為子域名
      if (host !== pattern && !host.endsWith(`.${pattern}`)) {
        continue;
      }

      // 檢查 path 是否包含必要字串（如果有指定）
      if (rule.pathRequires && !pathname.includes(rule.pathRequires)) {
        continue;
      }

      // 嘗試匹配 path pattern
      const match = rule.pathPattern.exec(pathname);
      if (match) {
        urlObj.pathname = pathname.replace(rule.pathPattern, rule.stablePath);
        return normalizeUrl(urlObj.toString());
      }
    }
  } catch (error) {
    Logger.error?.('computeStableUrl 失敗', { action: 'computeStableUrl', error });
  }

  return null;
}

/**
 * 解析存儲用的 URL — 優先使用穩定 URL
 * 這是 normalizeUrl 的增強版，優先嘗試穩定 URL，再回退到標準化
 *
 * @param {string} rawUrl - 原始 URL
 * @returns {string} 穩定 URL 或標準化的原始 URL
 */
export function resolveStorageUrl(rawUrl) {
  return computeStableUrl(rawUrl) || normalizeUrl(rawUrl);
}
