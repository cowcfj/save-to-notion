/**
 * URL 工具函數
 * 提供 URL 標準化功能，用於生成一致的存儲鍵
 */

// 從統一配置導入 TRACKING_PARAMS（Single Source of Truth）
import { URL_NORMALIZATION } from '../config/shared/content.js';

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

function removeHashFragment(urlObj) {
  if (urlObj.hash) {
    urlObj.hash = '';
  }
}

function removeTrackingParams(urlObj) {
  TRACKING_PARAMS.forEach(param => {
    if (urlObj.searchParams.has(param)) {
      urlObj.searchParams.delete(param);
    }
  });
}

function shouldTrimTrailingPathSlash(pathname) {
  if (pathname.length <= 1) {
    return false;
  }

  return pathname.endsWith('/');
}

function trimTrailingPathSlashes(urlObj) {
  while (shouldTrimTrailingPathSlash(urlObj.pathname)) {
    urlObj.pathname = urlObj.pathname.slice(0, -1);
  }
}

/**
 * 標準化 URL，用於生成一致的存儲鍵
 *
 * @param {string} rawUrl - 完整的絕對 URL
 * @returns {string} 標準化後的 URL，相對/無效 URL 返回原始輸入
 */
export function normalizeUrl(rawUrl) {
  if (!rawUrl) {
    return '';
  }

  if (typeof rawUrl !== 'string') {
    rawUrl = String(rawUrl);
  }

  if (!rawUrl.includes('://')) {
    return rawUrl;
  }

  try {
    const urlObj = new URL(rawUrl);
    removeHashFragment(urlObj);
    removeTrackingParams(urlObj);
    trimTrailingPathSlashes(urlObj);

    return urlObj.toString();
  } catch (error) {
    Logger.error?.('normalizeUrl 標準化失敗', { action: 'normalizeUrl', error });
    return rawUrl;
  }
}

/**
 * 穩定 URL 規則 — 用於移除已知網站的可變 slug 段
 * 每個規則定義如何從 URL 中識別並移除動態標題段，保留穩定的標識符
 *
 * 注意: rule.stablePath 是一個 `String.prototype.replace` 置換字串，
 * 透過 `pathname.replace(rule.pathPattern, rule.stablePath)` 套用。
 * 因此，它支援 `$n` 捕獲組變數（例如 `$1`）。如果有字面的金錢符號（$）需注意跳脫，
 * 這不是一個路徑模板，而是替換模式。
 */
export const STABLE_URL_RULES = [
  {
    name: 'hk01',
    hostPattern: 'hk01.com',
    // 匹配: /category/[數字ID]/[slug]
    // 範例: /社會新聞/60320801/示威者遭警方拘捕
    pathPattern: /^(\/[^/]+\/\d+)\/.+$/,
    // 保留: /category/[數字ID]
    stablePath: '$1',
  },
  {
    name: 'mingpao',
    hostPattern: 'mingpao.com',
    pathRequires: '/article/',
    // 匹配並移除最後的 slug 段 (至少需要 4 段: /article/<date>/<section>/<slug>)
    // 範例: /article/20240101/s00001/title-here → /article/20240101/s00001
    // 避免誤傷: /article/20240101/s00001 (不含 slug)
    pathPattern: /^(\/article\/[^/]+\/[^/]+)\/.+$/,
    stablePath: '$1',
  },
];

const NEXT_DYNAMIC_SEGMENT_PATTERN = /\[(\w+)\]/g;
const ROUTE_SLUG_KEY_PATTERN = /slug|title/i;
const ROUTE_STABLE_KEY_PATTERN = /category|section|channel|topic|tag/i;
const NUMERIC_STRING_PATTERN = /^\d+$/;
const NON_ASCII_PATTERN = /[^\u0020-\u007E]/;
const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const ROOT_PATHS = new Set(['/', '']);

function isAbsoluteUrlString(rawUrl) {
  if (!rawUrl) {
    return false;
  }

  if (typeof rawUrl !== 'string') {
    return false;
  }

  return rawUrl.includes('://');
}

function isStableRuleHostMatch(hostname, hostPattern) {
  const host = hostname.toLowerCase();
  const pattern = hostPattern.toLowerCase();

  if (host === pattern) {
    return true;
  }

  return host.endsWith(`.${pattern}`);
}

function isStableRulePathMatch(rule, pathname) {
  if (!rule.pathRequires) {
    return rule.pathPattern.test(pathname);
  }

  if (!pathname.includes(rule.pathRequires)) {
    return false;
  }

  return rule.pathPattern.test(pathname);
}

function getNextDynamicSegments(page) {
  return [...page.matchAll(NEXT_DYNAMIC_SEGMENT_PATTERN)].map(match => match[1]);
}

function isNumericString(value) {
  if (typeof value !== 'string') {
    return false;
  }

  return NUMERIC_STRING_PATTERN.test(value);
}

function isUnstableRouteSegment(key, value) {
  if (ROUTE_SLUG_KEY_PATTERN.test(key)) {
    return !isNumericString(value);
  }

  if (ROUTE_STABLE_KEY_PATTERN.test(key)) {
    return false;
  }

  if (typeof value !== 'string') {
    return false;
  }

  return NON_ASCII_PATTERN.test(value);
}

function removeDynamicRouteSegment(stablePath, key) {
  // eslint-disable-next-line security/detect-non-literal-regexp
  return stablePath.replace(new RegExp(String.raw`/\[${key}\]`), '');
}

function applyDynamicRouteSegment(stablePath, key, query, slugKeySet) {
  if (slugKeySet.has(key)) {
    return removeDynamicRouteSegment(stablePath, key);
  }

  return stablePath.replace(`[${key}]`, () => String(query[key] ?? ''));
}

function buildNextStablePath(page, query) {
  // 找出所有動態段（如 [id], [slug], [category]）
  const dynamicSegments = getNextDynamicSegments(page);
  if (dynamicSegments.length === 0) {
    return null; // 無動態段 → 非動態路由，不需處理
  }

  // 識別「不穩定」的段（即 slug）
  const slugKeys = dynamicSegments.filter(key => isUnstableRouteSegment(key, query[key]));

  // 無法識別任何 slug → 放棄，避免誤判
  if (slugKeys.length === 0) {
    return null;
  }

  // 安全閥：當所有動態段都是 slug 時，移除後只剩靜態路由殼
  // （如 /posts），無法唯一識別頁面 → 放棄，讓 resolveStorageUrl 回退 normalizeUrl
  if (slugKeys.length === dynamicSegments.length) {
    return null;
  }

  const slugKeySet = new Set(slugKeys);
  let stablePath = page;
  for (const key of dynamicSegments) {
    stablePath = applyDynamicRouteSegment(stablePath, key, query, slugKeySet);
  }

  return { stablePath, slugKeys };
}

function parseHttpUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return HTTP_PROTOCOLS.has(parsedUrl.protocol) ? parsedUrl : null;
  } catch {
    return null;
  }
}

function buildNormalizedUrlFromNextRoute(routeInfo, originalUrl) {
  const { page, query } = routeInfo;
  const stableRoute = buildNextStablePath(page, query);
  if (!stableRoute) {
    return null;
  }

  const { stablePath, slugKeys } = stableRoute;
  const origin = new URL(originalUrl).origin;

  return {
    page,
    stablePath,
    slugKeys,
    stableUrl: normalizeUrl(`${origin}${stablePath}`),
  };
}

function hasNextStableRouteInput(routeInfo, originalUrl) {
  if (!routeInfo?.page) {
    return false;
  }

  if (!routeInfo.query) {
    return false;
  }

  return Boolean(originalUrl);
}

function logNextStableUrlResolved(resolvedRoute) {
  Logger.debug?.('buildStableUrlFromNextData 成功', {
    action: 'buildStableUrlFromNextData',
    page: resolvedRoute.page,
    stablePath: resolvedRoute.stablePath,
    slugKeys: resolvedRoute.slugKeys,
  });
}

function isInvalidStableUrlInput(url) {
  if (typeof url !== 'string') {
    return true;
  }

  return url.trim() === '';
}

function isAlreadyNormalizedWhenRequired(url, normalizedUrl, requireNormalized) {
  if (!requireNormalized) {
    return true;
  }

  return normalizedUrl === url;
}

function getStableUrlValidationTarget(url, normalizedUrl, requireNormalized) {
  return requireNormalized ? url : normalizedUrl;
}

function buildNextStableUrl(preloaderData, rawUrl) {
  if (!preloaderData?.nextRouteInfo) {
    return null;
  }

  return buildStableUrlFromNextData(preloaderData.nextRouteInfo, rawUrl);
}

function getSameOriginShortlink(shortlink, rawUrl) {
  if (!shortlink) {
    return null;
  }

  if (!hasSameOrigin(shortlink, rawUrl)) {
    return null;
  }

  try {
    const shortlinkUrl = new URL(shortlink);
    return shortlinkUrl.search.length > 0 ? shortlink : null;
  } catch {
    return null;
  }
}

function isRootPathWithoutQuery(path, hasQuery) {
  if (hasQuery) {
    return false;
  }

  return ROOT_PATHS.has(path);
}

/**
 * 計算穩定 URL — 對已知網站移除可變的 slug 段
 * 純字串操作，不需 DOM 訪問，適用於零延遲場景
 *
 * @param {string} rawUrl - 原始 URL
 * @returns {string|null} 穩定 URL，若無匹配規則返回 null
 */
export function computeStableUrl(rawUrl) {
  if (!isAbsoluteUrlString(rawUrl)) {
    return null;
  }

  try {
    const urlObj = new URL(rawUrl);
    const { hostname, pathname } = urlObj;

    for (const rule of STABLE_URL_RULES) {
      if (!isStableRuleHostMatch(hostname, rule.hostPattern)) {
        continue;
      }

      if (!isStableRulePathMatch(rule, pathname)) {
        continue;
      }

      urlObj.pathname = pathname.replace(rule.pathPattern, rule.stablePath);
      return normalizeUrl(urlObj.toString());
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
 * 識別邏輯：
 * 1. 欄位名包含 `slug` 或 `title` -> 判定為不穩定（移除）。
 * 2. 欄位名包含 `category`, `section`, `topic`, `channel`, `tag` -> 判定為穩定（保留，即使含中文）。
 * 3. 欄位名不屬於上述，但值包含非 ASCII 字符（例如中文標題）-> 判定為不穩定（移除）。
 *
 * @param {{ page: string, query: object, buildId?: string }} routeInfo - Preloader 提取的 Next.js 路由資訊
 * @param {string} originalUrl - 原始 URL（提供 origin）
 * @returns {string|null} 穩定 URL，若無法識別 slug 則返回 null
 */
export function buildStableUrlFromNextData(routeInfo, originalUrl) {
  if (!hasNextStableRouteInput(routeInfo, originalUrl)) {
    return null;
  }

  try {
    const resolvedRoute = buildNormalizedUrlFromNextRoute(routeInfo, originalUrl);
    if (!resolvedRoute) {
      return null;
    }

    logNextStableUrlResolved(resolvedRoute);
    return resolvedRoute.stableUrl;
  } catch (error) {
    Logger.error?.('buildStableUrlFromNextData 失敗', {
      action: 'buildStableUrlFromNextData',
      error,
    });
    return null;
  }
}

/**
 * 檢查兩個 URL 是否有相同來源（protocol + host）
 *
 * @param {string} url1 - 第一個 URL
 * @param {string} url2 - 第二個 URL
 * @returns {boolean} 是否相同來源
 */
export function hasSameOrigin(url1, url2) {
  if (!url1) {
    return false;
  }

  if (!url2) {
    return false;
  }

  try {
    const origin1 = new URL(url1).origin;
    const origin2 = new URL(url2).origin;
    return origin1 === origin2;
  } catch {
    return false;
  }
}

/**
 * 檢查 URL 是否為根路徑（首頁）
 * 用於過濾掉指向首頁的無效 shortlink 及拒絕設置首頁作為穩定 URL
 *
 * @param {string|null|undefined} url - 要檢查的 URL
 * @returns {boolean} 是否為根路徑
 *
 * 行為說明：
 * - falsy 輸入（null、undefined、""）視為根路徑，回傳 true
 * - 無效 URL（無法解析）回傳 false，不視為根路徑
 * - 有效根路徑（pathname 為 "/" 或 "" 且無 query）回傳 true
 * - 有 query 參數（如 "/?p=123"）或有路徑（如 "/post"）回傳 false
 */
export function isRootUrl(url) {
  if (!url) {
    return true;
  }

  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    const hasQuery = urlObj.search.length > 0;
    // 根路徑：pathname 為 "/" 且沒有查詢參數
    return isRootPathWithoutQuery(path, hasQuery);
  } catch {
    return false;
  }
}

/**
 * 檢查 URL 是否可安全作為 stable URL 使用
 *
 * @param {string|null|undefined} url - 要檢查的 URL
 * @param {{ requireNormalized?: boolean }} [options] - 驗證選項
 * @returns {boolean} 是否為安全可用的 stable URL
 */
export function isSafeStableUrl(url, options = {}) {
  const { requireNormalized = false } = options;

  if (isInvalidStableUrlInput(url)) {
    return false;
  }

  const normalizedUrl = normalizeUrl(url);

  if (!isAlreadyNormalizedWhenRequired(url, normalizedUrl, requireNormalized)) {
    return false;
  }

  const urlToValidate = getStableUrlValidationTarget(url, normalizedUrl, requireNormalized);
  if (!parseHttpUrl(urlToValidate)) {
    return false;
  }

  return !isRootUrl(normalizedUrl);
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
  const phase2a = buildNextStableUrl(preloaderData, rawUrl);
  if (phase2a) {
    return phase2a;
  }

  // Phase 2a+: WordPress shortlink（?p=ID 格式）
  // 合法的 WordPress shortlink 一定有 query 參數（?p=12345 等），
  // 指向首頁的無效 shortlink 則沒有 query 參數。
  const phase2aPlus = getSameOriginShortlink(preloaderData?.shortlink, rawUrl);
  if (phase2aPlus) {
    return phase2aPlus;
  }

  // 最終回退
  return normalizeUrl(rawUrl);
}
