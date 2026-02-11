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
 * 從 Next.js Pages Router 數據構建穩定 URL
 *
 * 透過分析路由 pattern（如 /[category]/[id]/[slug]）識別可變段並移除。
 * 識別邏輯：欄位名包含 slug/title，或值包含非 ASCII 字符（中文標題等）。
 *
 * @param {{ page: string, query: object, buildId?: string }} routeInfo - Preloader 提取的 Next.js 路由資訊
 * @param {string} originalUrl - 原始 URL（提供 origin）
 * @returns {string|null} 穩定 URL，若無法識別 slug 則返回 null
 */
export function buildStableUrlFromNextData(routeInfo, originalUrl) {
  if (!routeInfo?.page || !routeInfo?.query || !originalUrl) {
    return null;
  }

  try {
    const { page, query } = routeInfo;

    // 找出所有動態段（如 [id], [slug], [category]）
    const dynamicSegments = [...page.matchAll(/\[(\w+)\]/g)].map(match => match[1]);
    if (dynamicSegments.length === 0) {
      return null; // 無動態段 → 非動態路由，不需處理
    }

    // 識別「不穩定」的段：slug、title、或包含非 ASCII 字符的值
    const slugKeys = dynamicSegments.filter(key => {
      // 欄位名明確包含 slug 或 title
      if (/slug|title/i.test(key)) {
        return true;
      }
      // 值包含非 ASCII 字符（中文、日文等）→ 可能是標題 / slug
      const value = query[key];
      if (typeof value === 'string' && /[^\u0020-\u007E]/.test(value)) {
        return true;
      }
      return false;
    });

    // 無法識別任何 slug → 放棄，避免誤判
    if (slugKeys.length === 0) {
      return null;
    }

    // 構建穩定路徑：保留穩定段，移除 slug 段
    let stablePath = page;
    for (const key of dynamicSegments) {
      if (slugKeys.includes(key)) {
        // 移除 slug 段（包含前面的 /）
        // eslint-disable-next-line security/detect-non-literal-regexp
        stablePath = stablePath.replace(new RegExp(String.raw`/\[${key}\]`), '');
      } else {
        // 替換為實際值
        stablePath = stablePath.replace(`[${key}]`, query[key]);
      }
    }

    const origin = new URL(originalUrl).origin;
    const stableUrl = normalizeUrl(`${origin}${stablePath}`);

    Logger.debug?.('buildStableUrlFromNextData 成功', {
      action: 'buildStableUrlFromNextData',
      page,
      stablePath,
      slugKeys,
    });

    return stableUrl;
  } catch (error) {
    Logger.error?.('buildStableUrlFromNextData 失敗', {
      action: 'buildStableUrlFromNextData',
      error,
    });
    return null;
  }
}

/**
 * 解析存儲用的 URL — 優先使用穩定 URL
 * 這是 normalizeUrl 的增強版，優先嘗試穩定 URL，再回退到標準化
 *
 * 優先級：
 * 1. Phase 1: computeStableUrl（已知網站純字串規則）
 * 2. Phase 2a: buildStableUrlFromNextData（Next.js 路由）
 * 3. Phase 2a+: shortlink（WordPress）
 * 4. normalizeUrl（最終回退）
 *
 * @param {string} rawUrl - 原始 URL
 * @param {{ nextRouteInfo?: object, shortlink?: string }} [preloaderData] - Preloader 提供的元數據
 * @returns {string} 穩定 URL 或標準化的原始 URL
 */
export function resolveStorageUrl(rawUrl, preloaderData) {
  // Phase 1: 已知網站規則
  const phase1 = computeStableUrl(rawUrl);
  if (phase1) {
    return phase1;
  }

  // Phase 2a: Next.js 路由
  if (preloaderData?.nextRouteInfo) {
    const phase2a = buildStableUrlFromNextData(preloaderData.nextRouteInfo, rawUrl);
    if (phase2a) {
      return phase2a;
    }
  }

  // Phase 2a+: WordPress shortlink
  if (preloaderData?.shortlink) {
    return preloaderData.shortlink;
  }

  // 最終回退
  return normalizeUrl(rawUrl);
}
