/**
 * NextJsExtractor.js
 * 專門負責處理 Next.js 網站的結構化數據提取
 *
 * 職責:
 * 1. 檢測頁面是否為 Next.js 網站 (檢查 __NEXT_DATA__)
 * 2. 解析 JSON 數據並提取文章內容
 * 3. 將 JSON blocks 轉換為 Notion Block 格式
 */

import Logger from '../../utils/Logger.js';
import { NEXTJS_CONFIG } from '../../config/shared/content.js';
import { isTitleConsistent } from '../../utils/contentUtils.js';
import { sanitizeUrlForLogging } from '../../utils/LogSanitizer.js';
import * as BbcBlockConverter from './blocks/BbcBlockConverter.js';
import * as StoryAtomsConverter from './blocks/StoryAtomsConverter.js';

const PAGES_ROUTER = 'pages-router';
const APP_ROUTER = 'app-router';

const PAYLOAD_PAGEPROPS_PATHS = [
  'pageProps',
  'props.pageProps',
  'props.initialProps.pageProps',
  'initialProps.pageProps',
  'props',
];

const ARTICLE_METADATA_PATHS = {
  title: ['title', 'promo.headlines.seoHeadline'],
  excerpt: ['excerpt', 'description', 'summary'],
  byline: ['byline', 'author.name', 'author'],
};

const CONVERT_BLOCK_DISPATCH = {
  image: (self, block) => self._convertImageBlock(block),
  heading_1: (self, block, type) => self._convertHeadingBlock(block, type),
  heading_2: (self, block, type) => self._convertHeadingBlock(block, type),
  heading_3: (self, block, type) => self._convertHeadingBlock(block, type),
  quote: (self, block) => self._convertQuoteBlock(block),
};

const getComponentPageProps = comp =>
  comp?.props?.initialProps?.pageProps || comp?.props?.pageProps || null;

const pickFirstDefinedField = (sources, field, defaultValue) =>
  sources.map(source => source?.[field]).find(value => value !== undefined && value !== null) ??
  defaultValue;

const isUsableBuildId = buildId => typeof buildId === 'string' && buildId.length > 0;

const isSafeHttpOrigin = origin => {
  if (typeof origin !== 'string' || !origin) {
    return false;
  }

  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const normalizeNextDataPathname = pathname => {
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) {
    return null;
  }

  const cleaned = cleanPath(pathname.trim());
  if (!cleaned.startsWith('/')) {
    return null;
  }

  if (cleaned === '/') {
    return '/index';
  }

  return cleaned.endsWith('/') ? cleaned.slice(0, -1) : cleaned;
};

/**
 * 清理路徑：移除查詢參數與 hash 片段
 *
 * @param {string} path
 * @returns {string}
 */
const cleanPath = path => {
  if (!path) {
    return '';
  }
  // 先移除 hash (#)，再移除查詢參數 (?)
  return path.split('#')[0].split('?')[0];
};

const appendPathVariants = (rawPath, keys) => {
  if (!rawPath) {
    return;
  }
  const cleaned = cleanPath(rawPath);
  keys.push(cleaned);
  try {
    const decoded = decodeURIComponent(cleaned);
    if (decoded !== cleaned) {
      keys.push(decoded);
    }
  } catch {
    // 忽略解碼錯誤
  }
};

/**
 * 建立候選鍵列表，包含原始路徑、清理後路徑、以及解碼後的變體
 *
 * @param {object} router
 * @param {string} currentPath
 * @returns {Array<string>}
 */
const buildRouterComponentKeys = (router, currentPath) => {
  const keys = [];

  // 收集原始路徑
  if (router?.pathname) {
    keys.push(router.pathname);
  }
  if (router?.route) {
    keys.push(router.route);
  }

  appendPathVariants(router?.asPath, keys);
  appendPathVariants(currentPath, keys);

  // 去重並過濾空值
  return [...new Set(keys.filter(Boolean))];
};

export const NextJsExtractor = {
  /**
   * 檢測頁面是否為 Next.js 網站
   *
   * @param {Document} doc
   * @returns {boolean}
   */
  detect(doc) {
    if (doc.querySelector('#__NEXT_DATA__')) {
      return true;
    }
    // Check for App Router (Next.js 13+)
    const appRouterScripts = doc.querySelectorAll(NEXTJS_CONFIG.APP_ROUTER_SELECTOR);
    for (const script of appRouterScripts) {
      if (script.textContent.includes('self.__next_f.push')) {
        return true;
      }
    }
    return false;
  },

  /**
   * 從 __NEXT_DATA__ 提取內容
   *
   * @param {Document} doc
   * @returns {{ content: string, blocks: Array, metadata: object, type: 'nextjs' } | null}
   */
  extract(doc) {
    const action = 'NextJsExtractor.extract';
    try {
      const { rawData, extractionSource } = this._resolveInitialData(doc);

      if (!rawData) {
        Logger.warn('未能提取任何 Next.js 數據', { action });
        return null; // 讓 fallback 機制接手 (如 Readability)
      }

      // 檢查 Pages Router 數據是否因 SPA 導航而過期
      if (this._shouldSkipPagesRouterData(rawData, extractionSource, doc)) {
        return null;
      }

      return this._extractFromRawData(rawData, extractionSource, doc, action);
    } catch (error) {
      Logger.error('Next.js 提取過程發生錯誤', {
        action,
        error: error.message,
      });
      return null;
    }
  },

  _shouldSkipPagesRouterData(rawData, extractionSource, doc) {
    if (extractionSource !== PAGES_ROUTER) {
      return false;
    }
    return !this._validatePagesRouterData(rawData, doc);
  },

  /**
   * Async 提取：在 SPA stale 時嘗試使用 _next/data
   *
   * @param {Document} doc
   * @returns {Promise<{ content: string, blocks: Array, metadata: object, type: 'nextjs' } | null>}
   */
  async extractAsync(doc) {
    const action = 'NextJsExtractor.extractAsync';
    try {
      const { rawData, extractionSource } = this._resolveInitialData(doc);

      if (!rawData) {
        Logger.warn('未能提取任何 Next.js 數據', { action });
        return null;
      }

      if (extractionSource !== PAGES_ROUTER) {
        return this._extractFromRawData(rawData, extractionSource, doc, action);
      }

      const validation = this._validatePagesRouterDataDetailed(rawData, doc);
      if (validation.isValid) {
        return this._extractFromRawData(rawData, extractionSource, doc, action);
      }
      if (validation.reason !== 'stale') {
        return null;
      }

      const fallbackResult = await this._handleStalePagesRouterData(doc, rawData, action);
      return fallbackResult || null;
    } catch (error) {
      Logger.error('Next.js 提取過程發生錯誤', {
        action,
        error: error.message,
      });
      return null;
    }
  },

  /**
   * 解析並獲取初始提取數據
   *
   * @param {Document} doc
   * @returns {{ rawData: object|null, extractionSource: string }}
   */
  _resolveInitialData(doc) {
    const rawPagesData = this._getPagesRouterData(doc);
    if (rawPagesData) {
      return { rawData: rawPagesData, extractionSource: PAGES_ROUTER };
    }

    const rawAppData = this._getAppRouterData(doc);
    if (rawAppData) {
      return { rawData: rawAppData, extractionSource: APP_ROUTER };
    }

    return { rawData: null, extractionSource: 'unknown' };
  },

  /**
   * 處理過期的 Pages Router 數據
   *
   * 優先順序：
   * 1. 嘗試從 Next.js router 組件讀取 SPA 導航後的最新數據
   * 2. 後備：透過 _next/data 端點重新取得
   *
   * @param {Document} doc
   * @param {object} rawData
   * @param {string} action
   * @returns {Promise<object|null>}
   */
  async _handleStalePagesRouterData(doc, rawData, action) {
    // 優先：嘗試從 Next.js router 組件讀取 SPA 導航後的數據
    const routerData = this._getRouterComponentData(doc);
    if (routerData) {
      const result = this._extractFromRawData(routerData, 'router-component', doc, action);
      if (result) {
        return result;
      }
    }

    // 後備：嘗試從 _next/data 端點取得
    const nextData = await this._fetchNextData(doc, rawData?.buildId);
    if (!nextData) {
      return null;
    }

    const normalized = this._normalizeNextDataPayload(nextData, rawData);
    return this._extractFromRawData(normalized, 'next-data', doc, action);
  },

  /**
   * 遍歷 router.components 找到第一個有 pageProps 的組件
   *
   * @param {object} components
   * @param {Array<string>} preferredKeys
   * @returns {object|null}
   */
  _findFirstComponentWithProps(components, preferredKeys) {
    for (const key of preferredKeys) {
      const pageProps = getComponentPageProps(components[key]);
      if (this._hasPageProps(pageProps)) {
        return { props: { pageProps } };
      }
    }

    for (const [, comp] of Object.entries(components)) {
      const pageProps = getComponentPageProps(comp);
      if (this._hasPageProps(pageProps)) {
        return { props: { pageProps } };
      }
    }

    return null;
  },

  _hasPageProps(pageProps) {
    if (!pageProps) {
      return false;
    }
    return Object.keys(pageProps).length > 0;
  },

  /**
   * 從 Next.js router.components 讀取 SPA 導航後的最新 pageProps
   *
   * Next.js Pages Router 在 SPA 導航後會將最新的 pageProps 存於
   * window.next.router.components 中，各 key 為路由 pattern（如 '/article'）。
   *
   * @param {Document} doc
   * @returns {{ props: { pageProps: object } }|null}
   */
  _getRouterComponentData(doc) {
    const action = 'NextJsExtractor._getRouterComponentData';
    try {
      const win = doc.defaultView || globalThis;
      const router = win?.next?.router;
      if (!router?.components) {
        return null;
      }

      const currentPath = this._resolveCurrentPathname(doc);
      const preferredKeys = buildRouterComponentKeys(router, currentPath);

      return this._findFirstComponentWithProps(router.components, preferredKeys);
    } catch (error) {
      Logger.debug('NextJsExtractor._getRouterComponentData 讀取失敗', {
        action,
        error,
      });
      return null;
    }
  },

  /**
   * 取得當前頁面 pathname，doc.defaultView 優先，fallback 至 globalThis
   *
   * @param {Document} doc
   * @returns {string|undefined}
   */
  _resolveCurrentPathname(doc) {
    return doc.defaultView?.location?.pathname || globalThis.location?.pathname;
  },

  /**
   * 檢查 __NEXT_DATA__.asPath 是否與當前 URL 匹配
   * 用於偵測 SPA 導航導致的數據過期
   *
   * asPath 在頁面初次載入時寫入，SPA 導航後不會更新。
   * 因此 asPath ≠ pathname 代表用戶已 SPA 導航到其他頁面。
   *
   * @param {string} asPath - __NEXT_DATA__ 中的 asPath (e.g. "/社會新聞/60320801/slug")
   * @param {string} currentPath - 當前 window.location.pathname
   * @returns {boolean} true 表示數據仍然有效
   */
  _isAsPathMatch(asPath, currentPath) {
    if (!asPath || !currentPath) {
      return true; // 無法比對時默認匹配，避免誤殺
    }

    try {
      // 有些版本 currentPath 可能帶有 query string，防禦性處理
      const cleanCurrentPath = currentPath.split('?')[0];
      const cleanAsPath = asPath.split('?')[0];

      return decodeURIComponent(cleanCurrentPath) === decodeURIComponent(cleanAsPath);
    } catch {
      // decodeURIComponent 可能因格式錯誤拋出異常，此時放行
      return true;
    }
  },

  /**
   * 驗證 Pages Router 數據的有效性 (針對 SPA 導航場景)
   *
   * @param {object} rawData - __NEXT_DATA__ 原始數據
   * @param {Document} doc - 當前文檔對象
   * @returns {boolean} true 表示數據有效，false 表示數據已過期
   */
  _validatePagesRouterData(rawData, doc) {
    return this._validatePagesRouterDataDetailed(rawData, doc).isValid;
  },

  /**
   * 驗證 Pages Router 數據的有效性（含原因）
   *
   * @param {object} rawData - __NEXT_DATA__ 原始數據
   * @param {Document} doc - 當前文檔對象
   * @returns {{ isValid: boolean, reason: 'valid' | 'stale' | 'unknown' }}
   */
  _validatePagesRouterDataDetailed(rawData, doc) {
    const { currentPath, logContext } = this._buildValidationLogContext(rawData, doc);

    if (this._isSpaNavigationFromHome(rawData, currentPath)) {
      Logger.info('SPA 導航偵測：__NEXT_DATA__ 為首頁資料，跳過結構化提取', logContext);
      return { isValid: false, reason: 'stale' };
    }

    if (this._isAsPathStale(rawData, currentPath)) {
      Logger.warn('SPA 導航偵測：__NEXT_DATA__.asPath 數據已過時', logContext);
      return { isValid: false, reason: 'stale' };
    }

    return { isValid: true, reason: 'valid' };
  },

  /**
   * 建構 Pages Router 驗證所需的 log context
   *
   * @param {object} rawData - __NEXT_DATA__ 原始數據
   * @param {Document} doc - 當前文檔對象
   * @returns {{ currentPath: string | undefined, logContext: object }}
   */
  _buildValidationLogContext(rawData, doc) {
    const currentPath = doc.defaultView?.location?.pathname;
    const currentOrigin = doc.defaultView?.location?.origin;
    return {
      currentPath,
      logContext: {
        action: '_validatePagesRouterData',
        page: sanitizeUrlForLogging(rawData?.page, currentOrigin),
        asPath: sanitizeUrlForLogging(rawData?.asPath, currentOrigin),
        currentPath: sanitizeUrlForLogging(currentPath, currentOrigin),
      },
    };
  },

  /**
   * SPA stale 偵測：__NEXT_DATA__ 為首頁但當前路徑是其他頁
   *
   * @param {object} rawData
   * @param {string} currentPath
   * @returns {boolean}
   */
  _isSpaNavigationFromHome(rawData, currentPath) {
    if (!rawData?.page) {
      return false;
    }
    if (!currentPath) {
      return false;
    }
    if (rawData.page !== '/') {
      return false;
    }
    return currentPath !== '/';
  },

  _isAsPathStale(rawData, currentPath) {
    if (!rawData?.asPath) {
      return false;
    }
    if (!currentPath) {
      return false;
    }
    return !this._isAsPathMatch(rawData.asPath, currentPath);
  },

  /**
   * 從 rawData 提取文章內容
   *
   * @param {object} rawData
   * @param {string} extractionSource
   * @param {Document} doc
   * @param {string} action
   * @returns {object|null}
   */
  _extractFromRawData(rawData, extractionSource, doc, action = 'NextJsExtractor.extract') {
    const articleData = this._findArticleData(rawData);

    if (!articleData) {
      Logger.info('在數據中未找到結構化文章內容，將使用標準提取', {
        action,
        source: extractionSource,
      });
      return null;
    }

    const docTitle = doc.title;
    if (this._isStructuredTitleStale(articleData, docTitle, extractionSource)) {
      Logger.warn('SPA 導航偵測：結構化數據標題與 document.title 不符，放棄結構化提取', {
        action,
        source: extractionSource,
        reason: 'title_mismatch',
        result: 'skip_structured',
        hasTitle: Boolean(articleData?.title),
        hasDocTitle: Boolean(docTitle),
        isTitleConsistent: false,
      });
      return null;
    }

    Logger.log('成功提取 Next.js 文章數據', {
      action,
      source: extractionSource,
      result: 'structured',
      hasTitle: Boolean(articleData?.title),
    });

    const blocks = this._processArticleContent(articleData);

    // 品質門檻：blocks 數量不足代表格式可能不相容，回退到標準提取
    if (blocks.length < NEXTJS_CONFIG.MIN_VALID_BLOCKS) {
      Logger.info(
        `結構化提取品質不足 (${blocks.length}/${NEXTJS_CONFIG.MIN_VALID_BLOCKS} blocks)，回退到標準提取`,
        { action, source: extractionSource }
      );
      return null;
    }

    const metadata = Object.fromEntries(
      Object.entries(ARTICLE_METADATA_PATHS).map(([field, paths]) => [
        field,
        paths.map(path => this._getValueByPath(articleData, path)).find(Boolean),
      ])
    );

    return {
      content: '', // Next.js 提取器不生成 HTML content
      blocks,
      metadata,
      type: 'nextjs',
      rawArticle: articleData,
    };
  },

  /**
   * 判定結構化提取是否應因 SPA 導航標題不一致而放棄
   *
   * App Router 不適用（其數據總對應當前 URL）；
   * Pages Router / next-data / router-component 在 SPA 導航後可能殘留舊頁 title。
   *
   * @param {object} articleData
   * @param {string} docTitle
   * @param {string} extractionSource
   * @returns {boolean}
   */
  _isStructuredTitleStale(articleData, docTitle, extractionSource) {
    if (extractionSource === APP_ROUTER) {
      return false;
    }
    if (!this._hasTitleMaterialToCompare(articleData, docTitle)) {
      return false;
    }
    return !isTitleConsistent(articleData.title, docTitle);
  },

  /**
   * 判斷是否有足夠的 title 資訊可進行 stale 比對
   *
   * @param {object} articleData
   * @param {string} docTitle
   * @returns {boolean}
   */
  _hasTitleMaterialToCompare(articleData, docTitle) {
    return Boolean(articleData?.title) && Boolean(docTitle);
  },

  /**
   * 建立 Next.js _next/data URL
   *
   * @param {string} origin
   * @param {string} pathname
   * @param {string} buildId
   * @returns {string|null}
   */
  _buildNextDataUrl(origin, pathname, buildId) {
    if (!isSafeHttpOrigin(origin)) {
      return null;
    }
    if (!isUsableBuildId(buildId)) {
      return null;
    }

    const normalizedPath = normalizeNextDataPathname(pathname);
    if (!normalizedPath) {
      return null;
    }

    return `${origin}/_next/data/${buildId}${normalizedPath}.json`;
  },

  /**
   * 從 Document 對象中解析網頁的 Origin 與 Pathname
   *
   * @param {Document} doc
   * @returns {{ origin: string, pathname: string }}
   */
  _resolvePageOriginAndPath(doc) {
    const locations = [doc?.defaultView?.location, doc?.location, globalThis.location];
    const pickField = field => locations.map(loc => loc?.[field]).find(Boolean) ?? '';
    return {
      origin: pickField('origin'),
      pathname: pickField('pathname'),
    };
  },

  /**
   * 取得 Next.js _next/data JSON
   *
   * @param {Document} doc
   * @param {string} buildId
   * @returns {Promise<object|null>}
   */
  async _fetchNextData(doc, buildId) {
    const action = '_fetchNextData';
    const { origin, pathname } = this._resolvePageOriginAndPath(doc);
    const dataUrl = this._buildNextDataUrl(origin, pathname, buildId);

    if (!dataUrl) {
      Logger.warn('無法構建 Next.js data URL', {
        action,
        buildId: Boolean(buildId),
      });
      return null;
    }

    try {
      const response = await fetch(dataUrl, { credentials: 'same-origin' });
      if (!response?.ok) {
        Logger.debug('Next.js data 取得失敗', {
          action,
          status: response?.status,
          url: sanitizeUrlForLogging(dataUrl),
        });
        return null;
      }
      return await response.json();
    } catch (error) {
      Logger.debug('Next.js data 取得失敗', {
        action,
        error: error.message,
        url: sanitizeUrlForLogging(dataUrl),
      });
      return null;
    }
  },

  /**
   * 正規化 _next/data 回傳格式，對齊 __NEXT_DATA__ 結構
   *
   * @param {object} payload
   * @param {object} fallbackRawData
   * @returns {object|null}
   */
  _normalizeNextDataPayload(payload, fallbackRawData) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const sources = [fallbackRawData, payload];
    return {
      page: pickFirstDefinedField(sources, 'page', ''),
      query: pickFirstDefinedField(sources, 'query', {}),
      buildId: pickFirstDefinedField(sources, 'buildId', undefined),
      props: this._buildNormalizedProps(payload),
    };
  },

  /**
   * 從 payload 多條候選 path 解析 pageProps，並包成 __NEXT_DATA__ 形狀的 props 物件
   *
   * @param {object} payload
   * @returns {{ pageProps: object, initialProps: { pageProps: object } }}
   */
  _buildNormalizedProps(payload) {
    const pageProps =
      PAYLOAD_PAGEPROPS_PATHS.map(path => this._getValueByPath(payload, path)).find(
        value => value !== undefined && value !== null
      ) ?? payload;

    return {
      pageProps,
      initialProps: { pageProps },
    };
  },

  /**
   * 處理文章內容轉換為 Notion Blocks
   *
   * @param {object} articleData
   * @returns {Array} blocks
   */
  _processArticleContent(articleData) {
    const rawBlocks = [...this._getStructuredContentBlocks(articleData)];

    // [BBC] 偵測 BBC {type, model} 巢狀格式，使用專用轉換器
    if (this._shouldUseBbcConverter(rawBlocks)) {
      return this._convertBbcBlocks(rawBlocks);
    }

    if (this._shouldUseStoryAtomsFallback(articleData, rawBlocks)) {
      return this._convertStoryAtoms(articleData.storyAtoms);
    }

    if (rawBlocks.length === 0) {
      this._appendYahooBodyOrMarkupBlock(articleData, rawBlocks);
    }

    if (this._hasTeaser(articleData)) {
      rawBlocks.unshift({
        blockType: 'summary',
        summary: articleData.teaser,
      });
    }

    return this.convertBlocks(rawBlocks);
  },

  _shouldUseBbcConverter(rawBlocks) {
    if (rawBlocks.length === 0) {
      return false;
    }
    return this._isBbcFormat(rawBlocks);
  },

  _shouldUseStoryAtomsFallback(articleData, rawBlocks) {
    if (rawBlocks.length > 0) {
      return false;
    }
    return this._hasStoryAtoms(articleData);
  },

  /**
   * 檢查 articleData 是否含有 Yahoo storyAtoms 結構化內容
   *
   * @param {object} articleData
   * @returns {boolean}
   */
  _hasStoryAtoms(articleData) {
    return Array.isArray(articleData.storyAtoms) && articleData.storyAtoms.length > 0;
  },

  /**
   * 檢查 articleData 是否含有可作 summary 的 teaser 內容
   *
   * @param {object} articleData
   * @returns {boolean}
   */
  _hasTeaser(articleData) {
    return Array.isArray(articleData.teaser) && articleData.teaser.length > 0;
  },

  /**
   * 取得結構化內容 block 來源，優先使用非空 blocks，否則回退到巢狀 content.model.blocks
   *
   * @param {object} articleData
   * @returns {Array}
   */
  _getStructuredContentBlocks(articleData) {
    if (Array.isArray(articleData.blocks) && articleData.blocks.length > 0) {
      return articleData.blocks;
    }

    return articleData.content?.model?.blocks || [];
  },

  /**
   * 將 Yahoo 風格的 body/markup 內容轉為暫存 raw block
   *
   * @param {object} articleData
   * @param {Array} rawBlocks
   * @returns {void}
   */
  _appendYahooBodyOrMarkupBlock(articleData, rawBlocks) {
    let textContent = '';

    if (typeof articleData.body === 'string') {
      textContent = articleData.body;
    } else if (typeof articleData.markup === 'string') {
      textContent = articleData.markup;
    }

    if (!textContent) {
      return;
    }

    rawBlocks.push({
      blockType: 'paragraph',
      text: textContent
        .replaceAll(/<\/p>/gi, '\n\n')
        .replaceAll(/<br\s*\/?>/gi, '\n')
        .trim(),
    });
  },

  /**
   * 遞歸查找文章數據
   *
   * @param {object} data
   * @returns {object|null}
   */
  _findArticleData(data) {
    if (!data) {
      return null;
    }

    // 1. 嘗試已知路徑 (Fast Path)
    // 對於 App Router，需要在每個 fragment 中搜索
    const searchTargets = data.appRouterFragments ? [...data.appRouterFragments, data] : [data];

    const result = this._searchByKnownPaths(searchTargets);
    if (result) {
      return result;
    }

    // 2. 啟發式搜索 (Slow Path / Deep Search)
    Logger.log('NextJsExtractor: 使用啟發式搜索');
    return this._heuristicSearch(data);
  },

  /**
   * 檢查提取到的結果是否含有可用的文章內容結構
   *
   * @param {object} result
   * @returns {boolean}
   */
  _resultHasUsableContent(result) {
    if (!result) {
      return false;
    }

    const detectors = [
      () => Array.isArray(result.blocks),
      () => Array.isArray(result.content?.model?.blocks),
      () => typeof result.content === 'string',
      () => typeof result.body === 'string',
      () => typeof result.markup === 'string',
      () => Array.isArray(result.storyAtoms),
    ];

    return detectors.some(detect => detect());
  },

  /**
   * 在目標對象列表中使用已知路徑搜索數據
   *
   * @param {Array<object>} targets
   * @returns {object|null}
   */
  _searchByKnownPaths(targets) {
    const match = targets.map(target => this._findKnownPathMatch(target)).find(Boolean);
    if (!match) {
      return null;
    }

    Logger.log(`NextJsExtractor: 使用路徑 "${match.path}" 提取成功`);
    return match.result;
  },

  _findKnownPathMatch(target) {
    if (!this._isSearchableTarget(target)) {
      return null;
    }

    return NEXTJS_CONFIG.ARTICLE_PATHS.map(path => ({
      path,
      result: this._getValueByPath(target, path),
    })).find(({ result }) => this._resultHasUsableContent(result));
  },

  _isSearchableTarget(target) {
    if (!target) {
      return false;
    }
    return typeof target === 'object';
  },

  /**
   * 獲取 Pages Router 數據
   *
   * @param {Document} doc
   * @returns {object|null}
   */
  _getPagesRouterData(doc) {
    const script = doc.querySelector('#__NEXT_DATA__');
    if (!script) {
      return null;
    }

    const jsonData = script.textContent;
    if (!jsonData || jsonData.length > NEXTJS_CONFIG.MAX_JSON_SIZE) {
      Logger.warn('Next.js 數據過大或為空', {
        length: jsonData?.length,
      });
      return null;
    }

    try {
      return JSON.parse(jsonData);
    } catch (error) {
      Logger.warn('解析 __NEXT_DATA__ 失敗', { error: error.message });
      return null;
    }
  },

  /**
   * App Router 數據提取
   * 解析 self.__next_f.push 的內容
   *
   * @param {Document} doc
   * @returns {object|null}
   */
  _getAppRouterData(doc) {
    const scripts = doc.querySelectorAll(NEXTJS_CONFIG.APP_ROUTER_SELECTOR);
    const fragments = [];

    scripts.forEach(script => {
      const scriptFragments = this._parseAppRouterScript(script.textContent);
      fragments.push(...scriptFragments);
    });

    if (fragments.length === 0) {
      return null;
    }

    return { appRouterFragments: fragments };
  },

  /**
   * 解析 App Router 腳本內容
   *
   * @param {string} content
   * @returns {Array} fragments
   */
  /**
   * 提取 App Router push payload
   *
   * @param {string} part
   * @returns {any}
   */
  _extractAppRouterPushPayload(part) {
    const lastParen = part.lastIndexOf(')');
    if (lastParen === -1) {
      return null;
    }

    try {
      const args = JSON.parse(part.slice(0, lastParen));
      if (!this._hasAppRouterPushPayload(args)) {
        return null;
      }
      return args[1];
    } catch {
      return null;
    }
  },

  _hasAppRouterPushPayload(args) {
    if (!Array.isArray(args)) {
      return false;
    }
    return args.length > 1;
  },

  _parseAppRouterScript(content) {
    if (!content?.includes('self.__next_f.push')) {
      return [];
    }

    return content
      .split('self.__next_f.push(')
      .slice(1)
      .map(part => this._extractAppRouterPushPayload(part))
      .filter(payload => payload !== null && payload !== undefined)
      .map(payload => this._parseRscPayload(payload));
  },

  /**
   * 解析 RSC Payload
   * 嘗試將 "1:{"... 格式的字串解析為對象
   *
   * @param {any} chunk
   * @returns {any}
   */
  _parseRscPayload(chunk) {
    if (typeof chunk !== 'string') {
      return chunk;
    }

    const objects = this._parseMultiLineRsc(chunk);

    if (objects.length > 1) {
      return { _rscItems: objects };
    }
    if (objects.length === 1) {
      return objects[0];
    }

    return this._fallbackParseRsc(chunk) || chunk;
  },

  /**
   * 解析多行 RSC 內容
   *
   * @param {string} chunk
   * @returns {Array<object>}
   */
  _parseMultiLineRsc(chunk) {
    const lines = chunk.split('\n').filter(line => line.trim());
    const objects = [];

    for (const line of lines) {
      const parsed = this._tryParseRscLine(line);
      if (parsed) {
        objects.push(parsed);
      }
    }
    return objects;
  },

  /**
   * 提取冒號後的 payload 內容
   *
   * @param {string} chunk
   * @returns {string|null}
   */
  _extractColonPayload(chunk) {
    const colonIndex = chunk.indexOf(':');
    if (colonIndex === -1) {
      return null;
    }
    return chunk.slice(colonIndex + 1);
  },

  /**
   * 解析 RSC JSON payload
   *
   * @param {string} payload
   * @returns {any}
   */
  _parseRscJsonPayload(payload) {
    if (!payload) {
      return null;
    }
    if (!this._isRscJsonPayload(payload)) {
      return null;
    }

    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  },

  /**
   * 判定 RSC payload 是否為可直接 JSON.parse 的物件或陣列文字
   *
   * @param {string} payload
   * @returns {boolean}
   */
  _isRscJsonPayload(payload) {
    return ['{', '['].includes(payload[0]);
  },

  /**
   * 解析結構化 RSC payload
   *
   * @param {string} chunk
   * @returns {any}
   */
  _parseStructuredRscPayload(chunk) {
    const payload = this._extractColonPayload(chunk);
    const parsed = this._parseRscJsonPayload(payload);
    if (parsed === null) {
      return null;
    }
    return this._extractRscDataObject(parsed) || parsed;
  },

  /**
   * 嘗試解析單行 RSC
   *
   * @param {string} line
   * @returns {object|null}
   */
  _tryParseRscLine(line) {
    const parsed = this._parseStructuredRscPayload(line);
    if (!parsed) {
      return null;
    }
    if (typeof parsed !== 'object') {
      return null;
    }
    return parsed;
  },

  /**
   * 回退：嘗試解析整個 chunk
   *
   * @param {string} chunk
   * @returns {object|null}
   */
  _fallbackParseRsc(chunk) {
    return this._parseStructuredRscPayload(chunk);
  },

  /**
   * 提取 RSC 陣列中的數據對象
   * Yahoo RSC 格式: ["$", "$L2a", null, { pageData: {...} }]
   *
   * @param {any} parsed
   * @returns {object|null}
   */
  _extractRscDataObject(parsed) {
    if (!Array.isArray(parsed)) {
      return null;
    }
    // RSC 陣列格式: ["$", "$L...", null, { actualData }]
    // 檢查 index 3 是否為對象
    const indexedData = this._getIndexedRscDataObject(parsed);
    if (indexedData) {
      return indexedData;
    }
    // 有時數據在其他索引位置，搜索第一個有意義的對象
    return parsed.find(item => this._isMeaningfulObject(item)) ?? null;
  },

  _getIndexedRscDataObject(parsed) {
    if (parsed.length < 4) {
      return null;
    }
    if (!this._isMeaningfulObject(parsed[3])) {
      return null;
    }
    return parsed[3];
  },

  /**
   * 判定是否為有意義的非空、非 array 物件（RSC payload 候選）
   *
   * @param {any} value
   * @returns {boolean}
   */
  _isMeaningfulObject(value) {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0
    );
  },

  /**
   * 啟發式搜索
   * 遞歸遍歷物件，尋找最像文章數據的節點
   *
   * @param {object} root
   * @param {number} depth
   * @param {number} maxDepth
   * @returns {object|null}
   */
  _heuristicSearch(root, depth = 0, maxDepth = 6) {
    if (depth > maxDepth) {
      return null;
    }
    if (!this._isObjectLike(root)) {
      return null;
    }

    // 1. 計算當前節點分數
    const score = this._calculateScore(root);

    if (score >= 35) {
      Logger.log(`NextJsExtractor: 找到高可信度節點 (分數=${score})`);
      return root;
    }

    // 2. 遞歸遍歷子節點
    return this._searchChildren(root, depth, maxDepth);
  },

  /**
   * 遞歸遍歷子節點
   *
   * @param {object} root
   * @param {number} depth
   * @param {number} maxDepth
   * @returns {object|null}
   */
  _searchChildren(root, depth, maxDepth) {
    let matchedCandidate = null;
    this._getSearchableChildValues(root).some(value => {
      matchedCandidate = this._heuristicSearch(value, depth + 1, maxDepth);
      return Boolean(matchedCandidate);
    });
    return matchedCandidate;
  },

  _getSearchableChildValues(root) {
    return Object.entries(root)
      .filter(([key]) => !this._shouldSkipKey(key))
      .map(([, value]) => value)
      .filter(value => this._isObjectLike(value));
  },

  _isObjectLike(value) {
    if (value === null) {
      return false;
    }
    return typeof value === 'object';
  },

  /**
   * 檢查是否應跳過遍歷該鍵
   *
   * @param {string} key
   * @returns {boolean}
   */
  _shouldSkipKey(key) {
    const lowerKey = key.toLowerCase();
    return NEXTJS_CONFIG.HEURISTIC_PATTERNS.EXCLUDE_KEYS.some(exclude => {
      const lowerExclude = exclude.toLowerCase();
      // 統一轉為小寫比對，確保像 'MyPOSTARTICLESTREAMData' 這樣的大小寫混合鍵名也能被過濾
      return lowerKey === lowerExclude || lowerKey.includes(lowerExclude);
    });
  },

  /**
   * 計算節點分數
   *
   * @param {object} node
   * @returns {number}
   */
  _calculateScore(node) {
    if (!node || typeof node !== 'object') {
      return 0;
    }

    let score = 0;
    score += this._scoreStandardBlocks(node);
    score += this._scoreStructureAndText(node);
    score += this._scoreSpecialCmsFields(node);

    return score;
  },

  /**
   * 計算標準區塊分數
   *
   * @param {object} node
   * @returns {number}
   */
  _scoreStandardBlocks(node) {
    let score = 0;
    // 規則 1: 包含 blocks 陣列且非空
    if (Array.isArray(node.blocks) && node.blocks.length > 0) {
      score += 50;
    }
    // 規則 2: 包含 htmlTokens (HK01 特有)
    // 提高權重，因為這通常是我們想要的內容
    if (Array.isArray(node.htmlTokens) && node.htmlTokens.length > 0) {
      score += 60;
    }
    // 規則 3: 包含 rich_text (Notion 格式)
    if (Array.isArray(node.rich_text)) {
      score += 30;
    }
    return score;
  },

  /**
   * 計算鍵名（標題、作者）維度的特徵分數
   *
   * @param {object} node
   * @returns {number}
   */
  _scoreKeysDimension(node) {
    let score = 0;
    if (node.title && typeof node.title === 'string') {
      score += 10;
    }
    if (node.author) {
      score += 5;
    }
    return score;
  },

  /**
   * 計算文章結構維度（如段落陣列）的特徵分數
   *
   * @param {object} node
   * @returns {number}
   */
  _scoreStructuralDimension(node) {
    let score = 0;
    if (Array.isArray(node.paragraphs) && node.paragraphs.length > 0) {
      score += 40;
    }
    return score;
  },

  /**
   * 計算文本與內文維度（如 text 或 content 長度）的特徵分數
   *
   * @param {object} node
   * @returns {number}
   */
  _scoreContentDimension(node) {
    let score = 0;
    if (node.text && typeof node.text === 'string' && node.id) {
      score += 15;
    }
    if (node.content && typeof node.content === 'string' && node.content.length > 100) {
      score += 20;
    }
    return score;
  },

  /**
   * 計算結構和文本特徵分數
   *
   * @param {object} node
   * @returns {number}
   */
  _scoreStructureAndText(node) {
    let score = 0;
    score += this._scoreKeysDimension(node);
    score += this._scoreStructuralDimension(node);
    score += this._scoreContentDimension(node);
    return score;
  },

  /**
   * 計算特殊 CMS 欄位分數
   *
   * @param {object} node
   * @returns {number}
   */
  _scoreSpecialCmsFields(node) {
    let score = 0;
    // 規則 6: Yahoo 風格的 body 欄位（HTML 字串）
    if (node.body && typeof node.body === 'string' && node.body.length > 200) {
      score += 40;
    }
    // 規則 7: 包含 markup 欄位
    if (node.markup && typeof node.markup === 'string') {
      score += 35;
    }
    // 規則 8: Yahoo storyAtoms
    if (Array.isArray(node.storyAtoms) && node.storyAtoms.length > 0) {
      score += 60;
    }
    return score;
  },

  /**
   * 根據路徑獲取對象值
   *
   * @param {object} obj
   * @param {string} path 'a.b.c'
   * @returns {any}
   */
  _getValueByPath(obj, path) {
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }
    return current;
  },

  /**
   * 轉換 image 類型區塊
   *
   * @param {object} block
   * @returns {Array<object>}
   */
  _convertImageBlock(block) {
    return [
      {
        object: 'block',
        type: 'image',
        image: {
          type: 'external',
          external: {
            url: block.image?.cdnUrl || block.image?.url || '',
          },
          caption: this._createRichTextChunks(block.image?.caption),
        },
      },
    ];
  },

  /**
   * 轉換 heading 類型區塊
   *
   * @param {object} block
   * @param {string} type
   * @returns {Array<object>}
   */
  _convertHeadingBlock(block, type) {
    return [
      {
        object: 'block',
        type,
        [type]: {
          rich_text: this._createRichTextChunks(block.text ? this._stripHtml(block.text) : ''),
        },
      },
    ];
  },

  /**
   * 轉換 quote 類型區塊
   *
   * @param {object} block
   * @returns {Array<object>}
   */
  _convertQuoteBlock(block) {
    return [
      {
        object: 'block',
        type: 'quote',
        quote: {
          rich_text: this._createRichTextChunks(block.text ? this._stripHtml(block.text) : ''),
        },
      },
    ];
  },

  /**
   * 轉換 paragraph 類型區塊
   *
   * @param {object} block
   * @returns {Array<object>}
   */
  _convertParagraphBlock(block) {
    const content = block.text ? this._stripHtml(block.text) : '';
    // 如果默認處理產生空內容，且不是已處理的特殊類型，則嘗試返回空
    // 但為了保持一致性，如果確實沒有 text 字段，可能是一個未知類型的塊
    if (!content) {
      return [];
    }

    return [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: this._createRichTextChunks(content),
        },
      },
    ];
  },

  /**
   * 將 JSON blocks 轉換為 Notion blocks
   *
   * @param {Array} jsonBlocks
   * @returns {Array}
   */
  convertBlocks(jsonBlocks) {
    if (!Array.isArray(jsonBlocks)) {
      return [];
    }

    return jsonBlocks
      .flatMap(block => this._convertSingleBlock(block))
      .filter(block => {
        if (block.type === 'image') {
          return Boolean(block.image.external.url);
        }
        return true;
      });
  },

  /**
   * 將單一 JSON block 轉換為 Notion block(s)
   *
   * 先按順序試 summary / htmlTokens / list 三個 pre-handler，
   * 任一返回非 null 即用其結果；否則依 BLOCK_TYPE_MAP 查表 dispatch。
   *
   * @param {object} block
   * @returns {Array<object>|object}
   */
  _convertSingleBlock(block) {
    const preConverted =
      this._convertSummaryBlock(block) ||
      this._convertHtmlTokensBlock(block) ||
      this._convertListBlock(block);
    if (preConverted) {
      return preConverted;
    }

    const type = NEXTJS_CONFIG.BLOCK_TYPE_MAP[block.blockType] || 'paragraph';
    const dispatch = CONVERT_BLOCK_DISPATCH[type];
    if (dispatch) {
      return dispatch(this, block, type);
    }
    return this._convertParagraphBlock(block);
  },

  _stripHtml(html) {
    if (!html) {
      return '';
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // Remove script and style tags to prevent their content from being included in textContent
    doc.querySelectorAll('script, style').forEach(el => el.remove());
    return doc.body.textContent || '';
  },

  /**
   * 將長文本分割為 Notion rich_text 對象數組
   * 每個文本對象不超過 2000 字符，且數組總長度不超過 100
   *
   * @param {string} text
   * @returns {Array} rich_text 數組
   */
  _createRichTextChunks(text) {
    if (!text) {
      return [];
    }

    const MAX_LENGTH = 2000;
    const MAX_ITEMS = 100;
    const chunks = [];

    for (let i = 0; i < text.length; i += MAX_LENGTH) {
      if (chunks.length >= MAX_ITEMS) {
        break; // 達到 Notion 限制，截斷剩餘內容
      }
      chunks.push({
        type: 'text',
        text: {
          content: text.slice(i, i + MAX_LENGTH),
        },
      });
    }

    return chunks;
  },

  /**
   * 轉換 Yahoo storyAtoms 為 Notion Blocks
   *
   * @param {Array} atoms
   * @returns {Array}
   */
  _convertStoryAtoms(atoms) {
    return StoryAtomsConverter.convertStoryAtoms(atoms, {
      richTextChunkBuilder: this._createRichTextChunks.bind(this),
      stripHtml: this._stripHtml.bind(this),
    });
  },

  /**
   * 轉換 summary 區塊
   *
   * @param {object} block
   * @returns {Array|null}
   */
  _convertSummaryBlock(block) {
    if (!this._isSummaryBlock(block)) {
      return null;
    }

    const summaryText = block.summary.join('\n');
    return [
      {
        object: 'block',
        type: 'quote',
        quote: {
          rich_text: this._createRichTextChunks(summaryText),
        },
      },
    ];
  },

  _isSummaryBlock(block) {
    if (block.blockType !== 'summary') {
      return false;
    }
    return Array.isArray(block.summary);
  },

  /**
   * 轉換 htmlTokens 區塊
   *
   * @param {object} block
   * @returns {Array|null}
   */
  /**
   * 提取 HTML token 組的文字內容
   *
   * @param {Array} tokenGroup
   * @returns {string}
   */
  _extractHtmlTokenGroupText(tokenGroup) {
    if (!Array.isArray(tokenGroup)) {
      return '';
    }
    return tokenGroup.map(token => token?.content || '').join('');
  },

  /**
   * 建立 HTML token 的段落區塊
   *
   * @param {Array} tokenGroup
   * @returns {object|null}
   */
  _buildHtmlTokenParagraph(tokenGroup) {
    const paragraphText = this._extractHtmlTokenGroupText(tokenGroup);
    if (!paragraphText.trim()) {
      return null;
    }

    return {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: this._createRichTextChunks(paragraphText),
      },
    };
  },

  _convertHtmlTokensBlock(block) {
    if (!this._isHtmlTokensBlock(block)) {
      return null;
    }

    return block.htmlTokens
      .map(tokenGroup => this._buildHtmlTokenParagraph(tokenGroup))
      .filter(Boolean);
  },

  _isHtmlTokensBlock(block) {
    if (block.blockType !== 'text') {
      return false;
    }
    return Array.isArray(block.htmlTokens);
  },

  /**
   * 轉換 list 區塊
   *
   * @param {object} block
   * @returns {Array|null}
   */
  _convertListBlock(block) {
    if (!this._isListBlock(block)) {
      return null;
    }

    const listType = block.ordered ? 'numbered_list_item' : 'bulleted_list_item';
    return block.items.map(item => ({
      object: 'block',
      type: listType,
      [listType]: {
        rich_text: this._createRichTextChunks(this._stripHtml(item)),
      },
    }));
  },

  _isListBlock(block) {
    if (block.blockType !== 'list') {
      return false;
    }
    return Array.isArray(block.items);
  },

  /**
   * 根據文本 Atom 創建 Block
   *
   * @param {object} atom
   * @returns {object|null}
   */
  _createBlockFromTextAtom(atom) {
    return StoryAtomsConverter.createBlockFromTextAtom(atom, {
      richTextChunkBuilder: this._createRichTextChunks.bind(this),
      stripHtml: this._stripHtml.bind(this),
    });
  },

  _createBlockFromImageAtom(atom) {
    return StoryAtomsConverter.createBlockFromImageAtom(atom, {
      richTextChunkBuilder: this._createRichTextChunks.bind(this),
    });
  },

  _isBbcFormat(blocks) {
    return BbcBlockConverter.isBbcFormat(blocks);
  },

  _convertBbcBlocks(blocks) {
    return BbcBlockConverter.convertBbcBlocks(blocks, {
      richTextChunkBuilder: this._createRichTextChunks.bind(this),
    });
  },

  _processSingleBbcBlock(block, result) {
    return BbcBlockConverter.processSingleBbcBlock(block, result, {
      richTextChunkBuilder: this._createRichTextChunks.bind(this),
    });
  },

  _extractBbcText(model) {
    return BbcBlockConverter.extractBbcText(model);
  },

  _buildBbcHeadingBlock(model, isSubheading) {
    return BbcBlockConverter.buildBbcHeadingBlock(model, isSubheading, {
      richTextChunkBuilder: this._createRichTextChunks.bind(this),
    });
  },

  _buildBbcTextBlocks(model) {
    return BbcBlockConverter.buildBbcTextBlocks(model, {
      richTextChunkBuilder: this._createRichTextChunks.bind(this),
    });
  },

  _buildBbcImageBlock(model) {
    return BbcBlockConverter.buildBbcImageBlock(model, {
      richTextChunkBuilder: this._createRichTextChunks.bind(this),
    });
  },

  _buildBbcFallbackBlock(model) {
    return BbcBlockConverter.buildBbcFallbackBlock(model, {
      richTextChunkBuilder: this._createRichTextChunks.bind(this),
    });
  },
};
