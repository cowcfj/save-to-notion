import { TECHNICAL_CONTENT_SELECTORS, AD_SELECTORS } from '../config/selectors.js';
import {
  TECHNICAL_TERMS,
  DOC_HOST_PATTERNS,
  DOC_PATH_PATTERNS,
  TECHNICAL_DOC_URL_PATTERNS,
  TECHNICAL_DOC_TITLE_PATTERNS,
} from '../config/index.js';

/**
 * 頁面複雜度檢測器
 *
 * 根據頁面特徵智能選擇最適合的內容提取器：
 * - 技術文檔/簡潔頁面 → @extractus (速度快、格式好)
 * - 新聞/複雜頁面 → Readability (穩定、完整性高)
 *
 * @author Content Extraction Team
 * @version 1.1
 * @date 2025-11-17
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
 * @param container
 * @param selector
 */
function countElements(container, selector) {
  try {
    const elements = container.querySelectorAll(selector);
    return elements ? elements.length : 0;
  } catch (error) {
    console.warn(`❌ 無法統計元素 ${selector}:`, error.message);
    return 0;
  }
}

/**
 * 檢測技術內容特徵
 * 檢查頁面是否包含大量技術相關的內容
 *
 * @param document
 */
function hasTechnicalFeatures(document) {
  const textContent = (document.body?.textContent || '').toLowerCase();

  // 技術關鍵詞計數 (使用統一配置)
  const technicalTermCount = TECHNICAL_TERMS.reduce((count, term) => {
    // Escape special characters in the term to support terms like 'c++'
    const escapedTerm = term.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
    const regex = new RegExp(String.raw`\b${escapedTerm}\b`, 'gi');
    const termMatches = textContent.match(regex);
    return count + (termMatches ? termMatches.length : 0);
  }, 0);

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
 * @param document
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
    console.error('❌ 頁面複雜度檢測失敗:', error);
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
 * @version 1.2
 * @date 2025-12-08
 */

/**
 * 選擇最佳提取器
 * 基於頁面複雜度分析結果，選擇最適合的提取器
 *
 * @param complexity
 */
export function selectExtractor(complexity) {
  const reasons = [];

  // 1. 強制規則：明確的 Markdown 容器 -> Markdown
  // 這是最可信的信號，通常意味著這是一個專門的文檔頁面
  if (complexity.metrics.markdownContainers > 0) {
    return {
      extractor: 'markdown',
      reasons: ['檢測到明確的 Markdown 容器 (.markdown-body 等)'],
      confidence: 95,
      fallbackRequired: false,
    };
  }

  // 2. 正常規則
  // 優先選擇 @markdown 的條件
  const preferMarkdown =
    complexity.isClean || complexity.hasMarkdownFeatures || complexity.hasTechnicalContent;

  // 必須使用 Readability 的條件
  // 注意：即使有 Markdown 特徵 (如列表)，如果有廣告或複雜佈局，也應傾向於 Readability 以獲得清洗能力
  const requireReadability =
    complexity.hasAds || complexity.isComplexLayout || complexity.hasRichMedia;

  let selectedExtractor = 'markdown'; // 預設提取器

  if (preferMarkdown && !requireReadability) {
    selectedExtractor = 'markdown';
    if (complexity.isClean) {
      reasons.push('頁面簡潔');
    }
    if (complexity.hasMarkdownFeatures) {
      // 只有在沒有干擾的情況下，才信任 Markdown 特徵
      reasons.push('包含代碼/列表且佈局乾淨');
    }
    if (complexity.hasTechnicalContent) {
      reasons.push('技術文檔內容');
    }
  } else if (requireReadability) {
    selectedExtractor = 'readability';
    if (complexity.hasAds) {
      reasons.push('包含廣告元素');
    }
    if (complexity.isComplexLayout) {
      reasons.push('複雜頁面佈局');
    }
    if (complexity.hasRichMedia) {
      reasons.push('大量媒體內容');
    }
  } else if (complexity.isLongForm) {
    selectedExtractor = 'readability';
    reasons.push('長文內容');
  } else {
    selectedExtractor = 'markdown';
    reasons.push('一般頁面');
  }

  return {
    extractor: selectedExtractor,
    reasons,
    confidence: calculateConfidence(complexity, selectedExtractor),
    fallbackRequired: shouldUseFallback(complexity),
  };
}

/**
 * 計算選擇信心度
 * 返回 0-100 的信心分數
 *
 * @param complexity
 * @param selectedExtractor
 */
function calculateConfidence(complexity, selectedExtractor) {
  let confidence = 50; // 基礎信心度

  if (selectedExtractor === 'markdown') {
    if (complexity.isClean) {
      confidence += 20;
    }
    if (complexity.hasMarkdownFeatures) {
      confidence += 15;
    }
    if (complexity.hasTechnicalContent) {
      confidence += 15;
    }
    if (complexity.hasAds) {
      confidence -= 25;
    } // 有廣告會降低信心度
    if (complexity.isComplexLayout) {
      confidence -= 15;
    }
  } else {
    if (complexity.hasAds) {
      confidence += 20;
    }
    if (complexity.isComplexLayout) {
      confidence += 15;
    }
    if (complexity.hasRichMedia) {
      confidence += 10;
    }
    if (complexity.isLongForm) {
      confidence += 10;
    }
    if (complexity.isClean && !complexity.hasAds) {
      confidence -= 15;
    } // 簡潔頁面用 Readability 信心度較低
  }

  return Math.max(0, Math.min(100, confidence));
}

/**
 * 判斷是否需要備用方案
 *
 * @param complexity
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
 * @param complexity
 * @param selection
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
 * @param complexity
 * @param selection
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
 * 記錄分析結果 (用於效能監控)
 *
 * @param complexity
 * @param selection
 * @param extractionResult
 */
export function logAnalysis(complexity, selection, extractionResult) {
  if (typeof console === 'undefined') {
    return;
  }

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
}

// 匯出主要功能
export default {
  detectPageComplexity,
  selectExtractor,
  getAnalysisReport,
  logAnalysis,
  isDocumentation,
};
