import { TECHNICAL_CONTENT_SELECTORS, AD_SELECTORS } from '../config/shared/content.js';
import { TECHNICAL_TERM_RULES, TYPE_WORD } from '../config/shared/technicalTerms.js';
import Logger from './Logger.js';

// ==========================================
// 文檔站點識別模式（原 config/patterns.js Group C）
// ==========================================

/** 文檔站點主機名模式 */
const DOC_HOST_PATTERNS = [
  /\.github\.io$/,
  /^docs?\./,
  /\.readthedocs\.io$/,
  /\.gitbook\.io$/,
  /^wiki\./,
  /^api\./,
  /^developer\./,
  /^guide\./,
];

/** 基礎文檔路徑模式（共用基礎，減少重複） */
const BASE_DOC_PATH_PATTERNS = [
  /\/docs?\//,
  /\/documentation\//,
  /\/guide\//,
  /\/manual\//,
  /\/api\//,
  /\/reference\//,
  /\/cli\//,
];

/** 文檔站點路徑模式 */
const DOC_PATH_PATTERNS = [
  ...BASE_DOC_PATH_PATTERNS,
  /\/wiki\//,
  /\/getting-started\//,
  /\/tutorial\//,
];

/** 技術文檔 URL 模式 */
const TECHNICAL_DOC_URL_PATTERNS = [
  ...BASE_DOC_PATH_PATTERNS,
  /\/commands?\//,
  /github\.io.*docs/,
  /\.github\.io/,
];

/** 技術文檔標題模式 */
const TECHNICAL_DOC_TITLE_PATTERNS = [
  /documentation/,
  /commands?/,
  /reference/,
  /guide/,
  /manual/,
  /cli/,
  /api/,
];

/** 預編譯 aggregate regex：依 rule type 與 caseSensitive 分組，各合併為單一正則 */
const WORD_TERMS = [];
const CASE_SENSITIVE_WORD_TERMS = [];
const SPECIAL_TERMS = [];
for (const rule of TECHNICAL_TERM_RULES) {
  const escaped = rule.term.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
  if (rule.type === TYPE_WORD) {
    if (rule.caseSensitive) {
      CASE_SENSITIVE_WORD_TERMS.push(escaped);
    } else {
      WORD_TERMS.push(escaped);
    }
  } else {
    SPECIAL_TERMS.push(escaped);
  }
}
WORD_TERMS.sort((termA, termB) => termB.length - termA.length);
CASE_SENSITIVE_WORD_TERMS.sort((termA, termB) => termB.length - termA.length);
SPECIAL_TERMS.sort((termA, termB) => termB.length - termA.length);

const WORD_TERMS_REGEX =
  // eslint-disable-next-line security/detect-non-literal-regexp
  WORD_TERMS.length > 0 ? new RegExp(String.raw`\b(?:${WORD_TERMS.join('|')})\b`, 'gi') : null;
const CASE_SENSITIVE_WORD_REGEX =
  CASE_SENSITIVE_WORD_TERMS.length > 0
    ? // eslint-disable-next-line security/detect-non-literal-regexp
      new RegExp(String.raw`\b(?:${CASE_SENSITIVE_WORD_TERMS.join('|')})\b`, 'g')
    : null;
const SPECIAL_TERMS_REGEX =
  SPECIAL_TERMS.length > 0
    ? // eslint-disable-next-line security/detect-non-literal-regexp
      new RegExp(`(?<![A-Za-z0-9_])(?:${SPECIAL_TERMS.join('|')})(?![A-Za-z0-9_])`, 'gi')
    : null;
const OGHAM_SPACE_MARK_CODE_POINT = 0x16_80;
const EN_QUAD_CODE_POINT = 0x20_00;
const HAIR_SPACE_CODE_POINT = 0x20_0a;
const LINE_SEPARATOR_CODE_POINT = 0x20_28;
const PARAGRAPH_SEPARATOR_CODE_POINT = 0x20_29;
const NARROW_NO_BREAK_SPACE_CODE_POINT = 0x20_2f;
const MEDIUM_MATHEMATICAL_SPACE_CODE_POINT = 0x20_5f;
const IDEOGRAPHIC_SPACE_CODE_POINT = 0x30_00;
const ZERO_WIDTH_NO_BREAK_SPACE_CODE_POINT = 0xfe_ff;

/** 用於高效匹配 Unicode 空白字元的 Set */
const SPACES_SET = new Set([
  160,
  OGHAM_SPACE_MARK_CODE_POINT,
  LINE_SEPARATOR_CODE_POINT,
  PARAGRAPH_SEPARATOR_CODE_POINT,
  NARROW_NO_BREAK_SPACE_CODE_POINT,
  MEDIUM_MATHEMATICAL_SPACE_CODE_POINT,
  IDEOGRAPHIC_SPACE_CODE_POINT,
  ZERO_WIDTH_NO_BREAK_SPACE_CODE_POINT,
]);

function _resolveCurrentLocationHref() {
  if (globalThis.window === undefined) {
    return '';
  }
  return globalThis.location.href;
}

function _resolveCurrentDocumentTitle() {
  if (typeof document === 'undefined') {
    return '';
  }
  return document.title;
}

function _resolvePreferredValue(value, fallback) {
  if (value) {
    return value;
  }
  return fallback;
}

function _isRelativePathUrl(urlStr) {
  if (typeof urlStr !== 'string') {
    return false;
  }
  return urlStr.startsWith('/');
}

/**
 * 頁面複雜度檢測器
 *
 * 根據頁面特徵智能選擇最適合的內容提取器：
 * - 技術文檔/簡潔頁面 → @extractus (速度快、格式好)
 * - 新聞/複雜頁面 → Readability (穩定、完整性高)
 *
 * @author Content Extraction Team
 */

/**
 * 檢測技術文檔站點
 * 基於URL特徵識別文檔類網站
 *
 * @param {string|Location} urlOrLocation - URL 字符串或 Location 對象
 */
/**
 * 檢測頁面是否為文檔類型的網站
 * 結合 URL 模式、Host 模式和標題模式進行綜合判斷
 *
 * @param {object} options - 檢測選項
 * @param {string} options.url - 頁面 URL (可選，默認使用 window.location.href)
 * @param {string} options.title - 頁面標題 (可選，默認使用 document.title)
 * @returns {{isDoc: boolean, isTechnical: boolean, matched: {host: boolean, path: boolean, techUrl: boolean, techTitle: boolean}}}
 */
/**
 * 預解析 URL 與標題以利後作判斷
 *
 * @private
 * @param {object} options - 檢測選項
 * @returns {{hostname: string, pathname: string, urlStr: string, title: string}} 解析後的 URL 與標題資訊
 */
function _parseUrlAndTitle(options) {
  const urlStr = _resolvePreferredValue(options.url, _resolveCurrentLocationHref());
  const title = _resolvePreferredValue(options.title, _resolveCurrentDocumentTitle()).toLowerCase();

  let hostname = '';
  let pathname = '';

  try {
    const url = new URL(urlStr);
    hostname = url.hostname.toLowerCase();
    pathname = url.pathname.toLowerCase();
  } catch {
    if (_isRelativePathUrl(urlStr)) {
      pathname = urlStr.toLowerCase();
    }
  }

  return { hostname, pathname, urlStr, title };
}

/**
 * 比對文檔模式並回傳匹配結果旗標
 *
 * @private
 * @param {string} hostname - 主機名稱
 * @param {string} pathname - 路徑名稱
 * @param {string} urlStr - 原始 URL 屬性
 * @param {string} title - 小寫化後的標題
 * @returns {{host: boolean, path: boolean, techUrl: boolean, techTitle: boolean}} 匹配結果旗標
 */
function _matchDocPatterns(hostname, pathname, urlStr, title) {
  const isDocHost = DOC_HOST_PATTERNS.some(pattern => pattern.test(hostname));
  const isDocPath = DOC_PATH_PATTERNS.some(pattern => pattern.test(pathname));
  const isTechUrl = TECHNICAL_DOC_URL_PATTERNS.some(pattern => pattern.test(urlStr.toLowerCase()));
  const isTechTitle = TECHNICAL_DOC_TITLE_PATTERNS.some(pattern => pattern.test(title));

  return {
    host: isDocHost,
    path: isDocPath,
    techUrl: isTechUrl,
    techTitle: isTechTitle,
  };
}

function _matchesEitherTechnicalDocSource(matched) {
  if (matched.techUrl) {
    return true;
  }
  return matched.techTitle;
}

function _matchesAnyDocumentationSource(matched) {
  if (matched.host) {
    return true;
  }
  if (matched.path) {
    return true;
  }
  return _matchesEitherTechnicalDocSource(matched);
}

export function isDocumentation(options = {}) {
  const { hostname, pathname, urlStr, title } = _parseUrlAndTitle(options);
  const matched = _matchDocPatterns(hostname, pathname, urlStr, title);

  const isTechnical = _matchesEitherTechnicalDocSource(matched);
  const isDoc = _matchesAnyDocumentationSource(matched);

  return {
    isDoc,
    isTechnical,
    matched,
  };
}

/**
 * 檢測是否為技術文檔頁面
 * 結合 URL 模式和標題模式進行綜合判斷
 *
 * @param {object} options - 檢測選項
 * @param {string} options.url - 頁面 URL (可選，默認使用 window.location.href)
 * @param {string} options.title - 頁面標題 (可選，默認使用 document.title)
 * @returns {{isTechnical: boolean, matchedUrl: boolean, matchedTitle: boolean}}
 */
// isTechnicalDoc 已合併至 isDocumentation

/**
 * 統計DOM元素數量
 *
 * @param {Document|Element} container - DOM 容器
 * @param {string} selector - CSS 選擇器
 * @returns {number} 元素數量
 */
function countElements(container, selector) {
  try {
    const elements = container.querySelectorAll(selector);
    return elements ? elements.length : 0;
  } catch (error) {
    Logger.warn(`無法統計元素 ${selector}`, { action: 'countElements', error: error.message });
    return 0;
  }
}

/**
 * 統計 regex 在文字中匹配的次數，並確保 lastIndex 被重置
 *
 * @private
 * @param {RegExp|null} regex - 正則表達式
 * @param {string} text - 待統計的文字
 * @returns {number} 匹配次數
 */
function _countRegexMatches(regex, text) {
  if (!regex) {
    return 0;
  }
  regex.lastIndex = 0;
  let count = 0;
  while (regex.test(text)) {
    count++;
  }
  return count;
}

/**
 * 統計所有技術詞彙在原始/小寫化文本中的出現次數
 *
 * @private
 * @param {string} rawText - 原始本文
 * @param {string} textContent - 小寫化文本
 * @returns {number} 技術詞彙總出現次數
 */
function _countTechnicalTerms(rawText, textContent) {
  let count = 0;
  count += _countRegexMatches(WORD_TERMS_REGEX, textContent);
  count += _countRegexMatches(CASE_SENSITIVE_WORD_REGEX, rawText);
  count += _countRegexMatches(SPECIAL_TERMS_REGEX, textContent);
  return count;
}

function _isEnQuadToHairSpace(code) {
  if (code < EN_QUAD_CODE_POINT) {
    return false;
  }
  return code <= HAIR_SPACE_CODE_POINT;
}

/**
 * 判斷一個 code point 是否為單字分隔符號（空白字元等）
 *
 * @private
 * @param {number} code - 字元的 code point
 * @returns {boolean} 是否為分隔符號
 */
function _isWordSeparatorCodePoint(code) {
  if (code <= 32) {
    return true;
  }
  if (_isEnQuadToHairSpace(code)) {
    return true;
  }
  return SPACES_SET.has(code);
}

/**
 * 使用高效字元迴圈統計文字中的單字數量，避免昂貴的 split
 *
 * @private
 * @param {string} textContent - 待統計的文字
 * @returns {number} 單字數量
 */
function _countWords(textContent) {
  let wordCount = 0;
  let inWord = false;
  for (let i = 0; i < textContent.length; i++) {
    const code = textContent.codePointAt(i);
    if (_isWordSeparatorCodePoint(code)) {
      inWord = false;
    } else if (!inWord) {
      inWord = true;
      wordCount++;
    }
  }
  return wordCount;
}

function _getDocumentBodyText(document) {
  return _resolvePreferredValue(document?.body?.textContent, '');
}

function _isTechnicalText(technicalRatio, technicalTermCount) {
  if (technicalRatio > 0.02) {
    return true;
  }
  return technicalTermCount > 10;
}

/**
 * 檢測技術內容特徵
 * 檢查頁面是否包含大量技術相關的內容
 *
 * @param {Document} document - DOM 文檔對象
 * @returns {{technicalTermCount: number, technicalRatio: number, isTechnical: boolean}} 技術特徵分析結果
 */
function hasTechnicalFeatures(document) {
  const rawText = _getDocumentBodyText(document);
  const textContent = rawText.toLowerCase();

  const technicalTermCount = _countTechnicalTerms(rawText, textContent);
  const wordCount = _countWords(textContent);

  const technicalRatio = technicalTermCount / Math.max(wordCount, 1);

  return {
    technicalTermCount,
    technicalRatio,
    isTechnical: _isTechnicalText(technicalRatio, technicalTermCount),
  };
}

function _resolveDocumentUrl(document) {
  if (document?.location?.href) {
    return document.location.href;
  }
  if (document?.URL) {
    return document.URL;
  }
  return globalThis.location.href;
}

/**
 * 解析 document 的 URL 與標題資訊，提供 Location 回退
 *
 * @private
 * @param {Document} document - DOM 文檔對象
 * @returns {{url: string, title: string}} 解析後的 URL 與標題
 */
function _resolvePageUrlAndTitle(document) {
  const url = _resolveDocumentUrl(document);
  const title = _resolvePreferredValue(document?.title, '');
  return { url, title };
}

/**
 * 統計頁面的各項基礎指標
 *
 * @private
 * @param {Document} document - DOM 文檔對象
 * @returns {object} 統計後的指標對象
 */
function _buildPageMetrics(document) {
  const { url, title } = _resolvePageUrlAndTitle(document);
  const isDocSite = isDocumentation({ url, title }).isDoc;

  return {
    isDocSite,
    adElements: countElements(document, AD_SELECTORS.join(', ')),
    navElements: countElements(document, 'nav, header, footer, aside, .sidebar, .navigation'),
    contentElements: countElements(document, 'article, main, .content, .post, .entry, section'),
    codeBlocks: countElements(document, 'pre, code, .highlight, .codehilite'),
    markdownContainers: countElements(document, TECHNICAL_CONTENT_SELECTORS.join(', ')),
    images: countElements(document, 'img'),
    videos: countElements(document, 'video, iframe[src*="youtube"], iframe[src*="vimeo"]'),
    textLength: _getDocumentBodyText(document).trim().length,
  };
}

/**
 * 判斷頁面結構是否符合乾淨內容頁的基礎條件
 *
 * @private
 * @param {object} metrics - 基礎指標對象
 * @returns {boolean} 是否為乾淨內容結構
 */
function _hasCleanContentStructure(metrics) {
  if (metrics.adElements > 2) {
    return false;
  }
  if (metrics.navElements > 3) {
    return false;
  }
  return metrics.contentElements >= 1;
}

/**
 * 判斷頁面是否應視為乾淨頁面
 *
 * @private
 * @param {object} metrics - 基礎指標對象
 * @returns {boolean} 是否為乾淨頁面
 */
function _isCleanPage(metrics) {
  if (metrics.isDocSite) {
    return true;
  }
  return _hasCleanContentStructure(metrics);
}

/**
 * 判斷頁面是否具有 Markdown / 技術文檔結構特徵
 *
 * @private
 * @param {object} metrics - 基礎指標對象
 * @returns {boolean} 是否具有 Markdown 結構特徵
 */
function _hasMarkdownFeatures(metrics) {
  if (metrics.codeBlocks >= 3) {
    return true;
  }
  return metrics.markdownContainers > 0;
}

/**
 * 判斷導覽元素是否相對正文過於密集
 *
 * @private
 * @param {object} metrics - 基礎指標對象
 * @returns {boolean} 是否為導覽密集型佈局
 */
function _hasNavigationDenseLayout(metrics) {
  if (metrics.contentElements <= 0) {
    return false;
  }
  return metrics.navElements / metrics.contentElements > 3;
}

/**
 * 判斷頁面是否屬於複雜佈局
 *
 * @private
 * @param {object} metrics - 基礎指標對象
 * @returns {boolean} 是否為複雜佈局
 */
function _isComplexLayout(metrics) {
  if (metrics.navElements > 5) {
    return true;
  }
  return _hasNavigationDenseLayout(metrics);
}

/**
 * 判斷頁面是否包含大量媒體內容
 *
 * @private
 * @param {object} metrics - 基礎指標對象
 * @returns {boolean} 是否包含大量媒體內容
 */
function _hasRichMedia(metrics) {
  if (metrics.images > 10) {
    return true;
  }
  return metrics.videos > 2;
}

/**
 * 根據基礎指標與技術特徵推導複雜度旗標
 *
 * @private
 * @param {object} metrics - 基礎指標對象
 * @param {object} technicalFeatures - 技術特徵對象
 * @returns {object} 複雜度分析結果
 */
function _deriveComplexityFlags(metrics, technicalFeatures) {
  return {
    isClean: _isCleanPage(metrics),
    hasMarkdownFeatures: _hasMarkdownFeatures(metrics),
    hasTechnicalContent: technicalFeatures.isTechnical,
    hasAds: metrics.adElements > 3,
    isComplexLayout: _isComplexLayout(metrics),
    isLongForm: metrics.textLength > 5000,
    hasRichMedia: _hasRichMedia(metrics),
    metrics,
    technicalFeatures,
  };
}

export function detectPageComplexity(document = globalThis.document) {
  try {
    const metrics = _buildPageMetrics(document);
    const technicalFeatures = hasTechnicalFeatures(document);
    return _deriveComplexityFlags(metrics, technicalFeatures);
  } catch (error) {
    Logger.error('頁面複雜度檢測失敗', { action: 'detectPageComplexity', error });
    // 回退到安全的預設值
    return {
      isClean: false,
      hasMarkdownFeatures: false,
      hasTechnicalContent: false,
      hasAds: true,
      isComplexLayout: true,
      isLongForm: false,
      hasRichMedia: false,
      metrics: {},
      technicalFeatures: { isTechnical: false },
    };
  }
}

/**
 * 頁面複雜度檢測器
 *
 * 根據頁面特徵智能選擇最適合的內容提取器：
 * - 技術文檔/簡潔頁面 → @markdown (速度快、格式好)
 * - 新聞/複雜頁面 → Readability (穩定、完整性高)
 *
 * @author Content Extraction Team
 */

/**
 * 選擇最佳提取器
 * 基於頁面複雜度分析結果，選擇最適合的提取器
 *
 * @param {object} complexity - 複雜度分析結果
 * @returns {object} 選擇結果 {extractor, reasons, confidence, fallbackRequired}
 */
export function selectExtractor(complexity) {
  const reasons = [];

  // 1. 強制規則：明確的 Markdown 容器 -> Markdown
  if (complexity.metrics.markdownContainers > 0) {
    return {
      extractor: 'markdown',
      reasons: ['檢測到明確的 Markdown 容器 (.markdown-body 等)'],
      confidence: 95,
      fallbackRequired: false,
    };
  }

  // Determine extractor and gather reasons
  const { hasAds, isComplexLayout, hasRichMedia, isLongForm } = complexity;
  const requireReadability = _requiresReadabilityExtractor({
    hasAds,
    isComplexLayout,
    hasRichMedia,
    isLongForm,
  });

  const selectedExtractor = requireReadability ? 'readability' : 'markdown';

  if (requireReadability) {
    _addReadabilityReasons(reasons, complexity);
  } else {
    _addMarkdownReasons(reasons, complexity);
  }

  return {
    extractor: selectedExtractor,
    reasons,
    confidence: calculateConfidence(complexity, selectedExtractor),
    fallbackRequired: shouldUseFallback(complexity),
  };
}

function _requiresReadabilityExtractor({ hasAds, isComplexLayout, hasRichMedia, isLongForm }) {
  if (hasAds) {
    return true;
  }
  if (isComplexLayout) {
    return true;
  }
  if (hasRichMedia) {
    return true;
  }
  return isLongForm;
}

/**
 * 計算 Markdown 提取器的信心度
 *
 * @param {object} complexity - 複雜度分析結果
 * @returns {number} 信心分數調整值
 */
function getMarkdownConfidence(complexity) {
  let score = 0;
  const { isClean, hasMarkdownFeatures, hasTechnicalContent, hasAds, isComplexLayout } = complexity;

  if (isClean) {
    score += 20;
  }
  if (hasMarkdownFeatures) {
    score += 15;
  }
  if (hasTechnicalContent) {
    score += 15;
  }
  if (hasAds) {
    score -= 25;
  }
  if (isComplexLayout) {
    score -= 15;
  }
  return score;
}

/**
 * 計算 Readability 提取器的信心度
 *
 * @param {object} complexity - 複雜度分析結果
 * @returns {number} 信心分數調整值
 */
function getReadabilityConfidence(complexity) {
  let score = 0;
  const { hasAds, isComplexLayout, hasRichMedia, isLongForm, isClean } = complexity;

  if (hasAds) {
    score += 20;
  }
  if (isComplexLayout) {
    score += 15;
  }
  if (hasRichMedia) {
    score += 10;
  }
  if (isLongForm) {
    score += 10;
  }
  if (_shouldPenalizeReadabilityForCleanPage({ isClean, hasAds })) {
    score -= 15;
  }
  return score;
}

function _shouldPenalizeReadabilityForCleanPage({ isClean, hasAds }) {
  if (!isClean) {
    return false;
  }
  return !hasAds;
}

/**
 * 計算選擇信心度
 * 返回 0-100 的信心分數
 *
 * @param {object} complexity - 複雜度分析結果
 * @param {string} selectedExtractor - 選擇的提取器
 * @returns {number} 信心分數 (0-100)
 */
function calculateConfidence(complexity, selectedExtractor) {
  let confidence = 50; // 基礎信心度

  if (selectedExtractor === 'markdown') {
    confidence += getMarkdownConfidence(complexity);
  } else {
    confidence += getReadabilityConfidence(complexity);
  }

  return Math.max(0, Math.min(100, confidence));
}

/**
 * 判斷是否需要備用方案
 *
 * @param {object} complexity - 複雜度分析結果
 * @returns {boolean} 是否需要備用方案
 */
function shouldUseFallback(complexity) {
  // 如果頁面特徵不明顯，建議使用備用方案驗證
  if (complexity.metrics.textLength < 500) {
    return true;
  }
  if (complexity.hasAds) {
    return complexity.hasTechnicalContent;
  }
  return false;
}

function _isNewsOrBlogPage(complexity) {
  if (complexity.isClean) {
    return false;
  }
  return complexity.isLongForm;
}

/**
 * 獲取詳細的分析報告
 * 用於調試和監控
 *
 * @param {object} complexity - 複雜度分析結果
 * @param {object} selection - 選擇結果
 * @returns {object} 分析報告
 */
export function getAnalysisReport(complexity, selection) {
  const report = {
    url: globalThis.location.href,
    timestamp: new Date().toISOString(),

    pageType: {
      isDocumentationSite: complexity.metrics.isDocSite,
      isTechnicalContent: complexity.hasTechnicalContent,
      isNewsOrBlog: _isNewsOrBlogPage(complexity),
    },

    metrics: complexity.metrics,

    selection: {
      extractor: selection.extractor,
      reasons: selection.reasons,
      confidence: selection.confidence,
      fallbackRequired: selection.fallbackRequired,
    },

    recommendations: generateRecommendations(complexity, selection),
  };

  return report;
}

/**
 * 生成優化建議
 *
 * @param {object} complexity - 複雜度分析結果
 * @param {object} selection - 選擇結果
 * @returns {string[]} 建議列表
 */
function generateRecommendations(complexity, selection) {
  const recommendations = [];

  if (selection.confidence < 70) {
    recommendations.push('建議使用備用提取器驗證結果品質');
  }

  if (_shouldRecommendMarkdownForCleanPage(complexity, selection)) {
    recommendations.push('簡潔頁面建議優先嘗試 @markdown 以獲得更好速度');
  }

  if (_shouldWarnMarkdownAdInterference(complexity, selection)) {
    recommendations.push('檢測到廣告內容，@markdown 可能無法完全過濾');
  }

  return recommendations;
}

function _shouldRecommendMarkdownForCleanPage(complexity, selection) {
  if (!complexity.isClean) {
    return false;
  }
  return selection.extractor === 'readability';
}

function _shouldWarnMarkdownAdInterference(complexity, selection) {
  if (!complexity.hasAds) {
    return false;
  }
  return selection.extractor === 'markdown';
}

/**
 * Helper to add reasons for selecting Readability
 *
 * @private
 * @param {string[]} reasons - The array to push reasons to
 * @param {object} complexity - The complexity analysis result
 */
function _addReadabilityReasons(reasons, complexity) {
  const { hasAds, isComplexLayout, hasRichMedia, isLongForm } = complexity;
  if (hasAds) {
    reasons.push('包含廣告元素');
  }
  if (isComplexLayout) {
    reasons.push('複雜頁面佈局');
  }
  if (hasRichMedia) {
    reasons.push('大量媒體內容');
  }
  if (isLongForm) {
    reasons.push('長文內容');
  }
}

/**
 * Helper to add reasons for selecting Markdown
 *
 * @private
 * @param {string[]} reasons - The array to push reasons to
 * @param {object} complexity - The complexity analysis result
 */
function _addMarkdownReasons(reasons, complexity) {
  const { isClean, hasMarkdownFeatures, hasTechnicalContent } = complexity;
  if (isClean) {
    reasons.push('頁面簡潔');
  }
  if (hasMarkdownFeatures) {
    reasons.push('包含代碼/列表且佈局乾淨');
  }
  if (hasTechnicalContent) {
    reasons.push('技術文檔內容');
  }
  if (_shouldUseGeneralPageReason({ isClean, hasMarkdownFeatures, hasTechnicalContent })) {
    reasons.push('一般頁面');
  }
}

function _shouldUseGeneralPageReason({ isClean, hasMarkdownFeatures, hasTechnicalContent }) {
  if (isClean) {
    return false;
  }
  if (hasMarkdownFeatures) {
    return false;
  }
  return !hasTechnicalContent;
}

/**
 * 記錄分析結果 (用於效能監控)
 *
 * @param {object} complexity - 複雜度分析結果
 * @param {object} selection - 選擇結果
 * @param {object} extractionResult - 提取結果
 * @returns {void}
 */
export function logAnalysis(complexity, selection, extractionResult) {
  // Logger handles environment checks

  const logData = {
    url: globalThis.location.href,
    extractor: selection.extractor,
    confidence: selection.confidence,
    success: extractionResult.success,
    contentLength: extractionResult.contentLength,
    processingTime: extractionResult.processingTime,
    fallbackUsed: extractionResult.fallbackUsed,
  };

  // 發送到監控系統 (如果需要)
  if (globalThis.analytics) {
    globalThis.analytics.track('content_extraction_analysis', logData);
  }

  // Log to console/buffer using Logger
  Logger.info('Page analysis log', logData);
}

// 匯出主要功能
export default {
  detectPageComplexity,
  selectExtractor,
  getAnalysisReport,
  logAnalysis,
  isDocumentation,
};
