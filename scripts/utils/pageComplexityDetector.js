import { TECHNICAL_CONTENT_SELECTORS, AD_SELECTORS } from '../config/extraction.js';
import {
  TECHNICAL_TERMS,
  DOC_HOST_PATTERNS,
  DOC_PATH_PATTERNS,
  TECHNICAL_DOC_URL_PATTERNS,
  TECHNICAL_DOC_TITLE_PATTERNS,
} from '../config/index.js';
import Logger from './Logger.js';

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
export function isDocumentation(options = {}) {
  const urlStr = options.url || (globalThis.window === undefined ? '' : globalThis.location.href);
  const title = (
    options.title || (typeof document === 'undefined' ? '' : document.title)
  ).toLowerCase();

  let hostname = '';
  let pathname = '';

  try {
    const url = new URL(urlStr);
    hostname = url.hostname.toLowerCase();
    pathname = url.pathname.toLowerCase();
  } catch {
    if (typeof urlStr === 'string' && urlStr.startsWith('/')) {
      pathname = urlStr.toLowerCase();
    }
  }

  // 1. 檢測通用文檔特徵
  const isDocHost = DOC_HOST_PATTERNS.some(pattern => pattern.test(hostname));
  const isDocPath = DOC_PATH_PATTERNS.some(pattern => pattern.test(pathname));

  // 2. 檢測技術文檔特徵
  const isTechUrl = TECHNICAL_DOC_URL_PATTERNS.some(pattern => pattern.test(urlStr.toLowerCase()));
  const isTechTitle = TECHNICAL_DOC_TITLE_PATTERNS.some(pattern => pattern.test(title));

  const isTechnical = isTechUrl || isTechTitle;
  const isDoc = isDocHost || isDocPath || isTechnical;

  return {
    isDoc,
    isTechnical,
    matched: {
      host: isDocHost,
      path: isDocPath,
      techUrl: isTechUrl,
      techTitle: isTechTitle,
    },
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
 * 檢測技術內容特徵
 * 檢查頁面是否包含大量技術相關的內容
 *
 * @param {Document} document - DOM 文檔對象
 * @returns {{technicalTermCount: number, technicalRatio: number, isTechnical: boolean}} 技術特徵分析結果
 */
function hasTechnicalFeatures(document) {
  const textContent = (document.body?.textContent || '').toLowerCase();

  // 技術關鍵詞計數 (使用統一配置)
  let technicalTermCount = 0;
  for (const term of TECHNICAL_TERMS) {
    // Escape special characters in the term to support terms like 'c++'
    const escapedTerm = term.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
    /* eslint-disable-next-line security/detect-non-literal-regexp */
    const regex = new RegExp(String.raw`\b${escapedTerm}\b`, 'gi');
    const termMatches = textContent.match(regex);
    technicalTermCount += termMatches ? termMatches.length : 0;
  }

  // 如果技術詞彙出現頻率高，認為是技術文檔
  const wordCount = textContent.split(/\s+/).length;
  const technicalRatio = technicalTermCount / Math.max(wordCount, 1);

  return {
    technicalTermCount,
    technicalRatio,
    isTechnical: technicalRatio > 0.02 || technicalTermCount > 10,
  };
}

/**
 * 檢測頁面複雜度
 * 分析頁面結構，返回複雜度指標
 *
 * @param {Document} [document=globalThis.document] - DOM 文檔對象
 * @returns {object} 複雜度分析結果
 */
export function detectPageComplexity(document = globalThis.document) {
  try {
    // 基礎指標統計
    const metrics = {
      // 網站類型
      isDocSite: isDocumentation({
        url: document?.location?.href || document?.URL || globalThis.location.href,
        title: document?.title,
      }).isDoc,

      // 廣告元素檢測（使用統一配置 scripts/config/selectors.js）
      adElements: countElements(document, AD_SELECTORS.join(', ')),
      navElements: countElements(document, 'nav, header, footer, aside, .sidebar, .navigation'),
      contentElements: countElements(document, 'article, main, .content, .post, .entry, section'),

      // Markdown/技術文檔特徵
      codeBlocks: countElements(document, 'pre, code, .highlight, .codehilite'),
      // Markdown 容器檢測（GitHub, GitBook 等 Markdown 渲染頁面）
      // 注意：必須保持與 scripts/config/selectors.js 中的 TECHNICAL_CONTENT_SELECTORS 一致 (嚴格模式)
      markdownContainers: countElements(document, TECHNICAL_CONTENT_SELECTORS.join(', ')),

      // 媒體內容
      images: countElements(document, 'img'),
      videos: countElements(document, 'video, iframe[src*="youtube"], iframe[src*="vimeo"]'),

      // 文字內容
      textLength: (document.body?.textContent?.trim() || '').length,
    };

    // 技術特徵檢測
    const technicalFeatures = hasTechnicalFeatures(document);

    // 計算複雜度評分
    const complexity = {
      // 簡潔度指標 (越高越簡潔)
      isClean:
        metrics.isDocSite ||
        (metrics.adElements <= 2 && metrics.navElements <= 3 && metrics.contentElements >= 1),

      // 技術文檔特徵
      hasMarkdownFeatures: metrics.codeBlocks >= 3 || metrics.markdownContainers > 0,
      hasTechnicalContent: technicalFeatures.isTechnical,

      // 干擾因素
      hasAds: metrics.adElements > 3,
      isComplexLayout:
        metrics.navElements > 5 ||
        (metrics.contentElements > 0 && metrics.navElements / metrics.contentElements > 3),

      // 內容特徵
      isLongForm: metrics.textLength > 5000,
      hasRichMedia: metrics.images > 10 || metrics.videos > 2,

      // 原始指標
      metrics,
      technicalFeatures,
    };

    return complexity;
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
  const requireReadability = hasAds || isComplexLayout || hasRichMedia || isLongForm;

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
  if (isClean && !hasAds) {
    score -= 15;
  }
  return score;
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
  return (
    complexity.metrics.textLength < 500 || // 內容過短
    (complexity.hasAds && complexity.hasTechnicalContent) // 技術文檔但有廣告干擾
  );
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
      isNewsOrBlog: !complexity.isClean && complexity.isLongForm,
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

  if (complexity.isClean && selection.extractor === 'readability') {
    recommendations.push('簡潔頁面建議優先嘗試 @markdown 以獲得更好速度');
  }

  if (complexity.hasAds && selection.extractor === 'markdown') {
    recommendations.push('檢測到廣告內容，@markdown 可能無法完全過濾');
  }

  return recommendations;
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
  if (!isClean && !hasMarkdownFeatures && !hasTechnicalContent) {
    reasons.push('一般頁面');
  }
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
