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

// 預先處理 handlers，按順序試，第一個非 null 即返回
const PRE_CONVERT_BLOCK_HANDLERS = [
  '_convertSummaryBlock',
  '_convertHtmlTokensBlock',
  '_convertListBlock',
];

const CONVERT_BLOCK_DISPATCH = {
  image: (self, block) => self._convertImageBlock(block),
  heading_1: (self, block, type) => self._convertHeadingBlock(block, type),
  heading_2: (self, block, type) => self._convertHeadingBlock(block, type),
  heading_3: (self, block, type) => self._convertHeadingBlock(block, type),
  quote: (self, block) => self._convertQuoteBlock(block),
};

const getComponentPageProps = comp =>
  comp?.props?.initialProps?.pageProps || comp?.props?.pageProps || null;

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
      if (extractionSource === PAGES_ROUTER && !this._validatePagesRouterData(rawData, doc)) {
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

      if (extractionSource === PAGES_ROUTER) {
        const validation = this._validatePagesRouterDataDetailed(rawData, doc);
        if (!validation.isValid) {
          if (validation.reason !== 'stale') {
            return null;
          }
          const fallbackResult = await this._handleStalePagesRouterData(doc, rawData, action);
          return fallbackResult || null;
        }
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
      if (pageProps && Object.keys(pageProps).length > 0) {
        return { props: { pageProps } };
      }
    }

    for (const [, comp] of Object.entries(components)) {
      const pageProps = getComponentPageProps(comp);
      if (pageProps && Object.keys(pageProps).length > 0) {
        return { props: { pageProps } };
      }
    }

    return null;
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
    return Boolean(rawData?.page && currentPath && rawData.page === '/' && currentPath !== '/');
  },

  /**
   * SPA stale 偵測：__NEXT_DATA__.asPath 與當前路徑不匹配
   *
   * @param {object} rawData
   * @param {string} currentPath
   * @returns {boolean}
   */
  _isAsPathStale(rawData, currentPath) {
    return Boolean(
      rawData?.asPath && currentPath && !this._isAsPathMatch(rawData.asPath, currentPath)
    );
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
    if (extractionSource === APP_ROUTER || !articleData?.title || !docTitle) {
      return false;
    }
    return !isTitleConsistent(articleData.title, docTitle);
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
    if (!isSafeHttpOrigin(origin) || typeof buildId !== 'string' || !buildId) {
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

    const pageProps =
      PAYLOAD_PAGEPROPS_PATHS.map(path => this._getValueByPath(payload, path)).find(
        value => value !== undefined && value !== null
      ) ?? payload;

    return {
      page: fallbackRawData?.page ?? payload?.page ?? '',
      query: fallbackRawData?.query ?? payload?.query ?? {},
      buildId: fallbackRawData?.buildId ?? payload?.buildId,
      props: {
        pageProps,
        initialProps: { pageProps },
      },
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
    if (rawBlocks.length > 0 && this._isBbcFormat(rawBlocks)) {
      return this._convertBbcBlocks(rawBlocks);
    }

    if (rawBlocks.length === 0) {
      if (this._hasStoryAtoms(articleData)) {
        return this._convertStoryAtoms(articleData.storyAtoms);
      }
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
    for (const target of targets) {
      if (!target || typeof target !== 'object') {
        continue;
      }

      for (const path of NEXTJS_CONFIG.ARTICLE_PATHS) {
        const result = this._getValueByPath(target, path);

        if (result && this._resultHasUsableContent(result)) {
          Logger.log(`NextJsExtractor: 使用路徑 "${path}" 提取成功`);
          return result;
        }
      }
    }
    return null;
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
    if (jsonData && jsonData.length <= NEXTJS_CONFIG.MAX_JSON_SIZE) {
      try {
        return JSON.parse(jsonData);
      } catch (error) {
        Logger.warn('解析 __NEXT_DATA__ 失敗', { error: error.message });
      }
    } else {
      Logger.warn('Next.js 數據過大或為空', {
        length: jsonData?.length,
      });
    }
    return null;
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
  _parseAppRouterScript(content) {
    if (!content?.includes('self.__next_f.push')) {
      return [];
    }

    const fragments = [];
    const parts = content.split('self.__next_f.push(');

    // 第一個 part 是 push 之前的內容 (通常是空的或 misc)，跳過
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      // part 應該是以 JSON 開始，後面跟著 ')' 和可能的 ';' 或換行
      // 我們需要找到最後一個 ')'
      const lastParen = part.lastIndexOf(')');

      if (lastParen !== -1) {
        const potentialJson = part.slice(0, lastParen);
        try {
          const args = JSON.parse(potentialJson);
          if (Array.isArray(args) && args.length > 1) {
            fragments.push(this._parseRscPayload(args[1]));
          }
        } catch {
          // 忽略解析錯誤
        }
      }
    }

    return fragments;
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
   * 嘗試解析單行 RSC
   *
   * @param {string} line
   * @returns {object|null}
   */
  _tryParseRscLine(line) {
    try {
      const colonIndex = line.indexOf(':');
      if (colonIndex !== -1) {
        const payload = line.slice(colonIndex + 1);
        if (payload.startsWith('{') || payload.startsWith('[')) {
          const parsed = JSON.parse(payload);
          const extracted = this._extractRscDataObject(parsed);

          if (extracted) {
            return extracted;
          }
          if (typeof parsed === 'object' && parsed !== null) {
            return parsed;
          }
        }
      }
    } catch {
      // 忽略單行解析錯誤
    }
    return null;
  },

  /**
   * 回退：嘗試解析整個 chunk
   *
   * @param {string} chunk
   * @returns {object|null}
   */
  _fallbackParseRsc(chunk) {
    try {
      const colonIndex = chunk.indexOf(':');
      if (colonIndex !== -1) {
        const payload = chunk.slice(colonIndex + 1);
        if (payload.startsWith('{') || payload.startsWith('[')) {
          const parsed = JSON.parse(payload);
          const extracted = this._extractRscDataObject(parsed);
          return extracted || parsed;
        }
      }
    } catch {
      // 解析失敗
    }
    return null;
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
    if (parsed.length >= 4 && typeof parsed[3] === 'object' && parsed[3] !== null) {
      return parsed[3];
    }
    // 有時數據在其他索引位置，搜索第一個有意義的對象
    return parsed.find(item => this._isMeaningfulObject(item)) ?? null;
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
    if (depth > maxDepth || !root || typeof root !== 'object') {
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
    for (const key in root) {
      if (this._shouldSkipKey(key)) {
        continue;
      }

      const value = root[key];
      // 只遍歷物件或陣列
      if (typeof value === 'object' && value !== null) {
        const candidate = this._heuristicSearch(value, depth + 1, maxDepth);
        if (candidate) {
          return candidate;
        }
      }
    }
    return null;
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
   * 先按順序試 PRE_CONVERT_BLOCK_HANDLERS（HK01summary / htmlTokens / list），
   * 任一返回非 null 即用其結果；否則依 BLOCK_TYPE_MAP 查表 dispatch。
   *
   * @param {object} block
   * @returns {Array<object>|object}
   */
  _convertSingleBlock(block) {
    for (const handlerName of PRE_CONVERT_BLOCK_HANDLERS) {
      const result = this[handlerName](block);
      if (result) {
        return result;
      }
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
    if (block.blockType === 'summary' && Array.isArray(block.summary)) {
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
    }
    return null;
  },

  /**
   * 轉換 htmlTokens 區塊
   *
   * @param {object} block
   * @returns {Array|null}
   */
  _convertHtmlTokensBlock(block) {
    if (block.blockType === 'text' && Array.isArray(block.htmlTokens)) {
      const paragraphs = [];
      block.htmlTokens.forEach(tokenGroup => {
        if (Array.isArray(tokenGroup)) {
          let paragraphText = '';
          tokenGroup.forEach(token => {
            // 處理所有包含 content 的 token 類型 (e.g. text, specific-link, boldLink)
            if (token.content) {
              paragraphText += token.content;
            }
          });

          if (paragraphText.trim()) {
            paragraphs.push({
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: this._createRichTextChunks(paragraphText),
              },
            });
          }
        }
      });
      return paragraphs;
    }
    return null;
  },

  /**
   * 轉換 list 區塊
   *
   * @param {object} block
   * @returns {Array|null}
   */
  _convertListBlock(block) {
    if (block.blockType === 'list' && Array.isArray(block.items)) {
      const listType = block.ordered ? 'numbered_list_item' : 'bulleted_list_item';
      return block.items.map(item => ({
        object: 'block',
        type: listType,
        [listType]: {
          rich_text: this._createRichTextChunks(this._stripHtml(item)),
        },
      }));
    }
    return null;
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
