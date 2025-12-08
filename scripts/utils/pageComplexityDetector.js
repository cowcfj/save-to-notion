import { TECHNICAL_CONTENT_SELECTORS } from '../config/selectors.js';
import { TECHNICAL_TERMS } from '../config/index.js';

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
 * @param {string|Location} urlOrLocation - URL 字符串或 Location 對象
 */
function isDocumentationSite(urlOrLocation = window.location) {
  let hostname = '';
  let pathname = '';

  if (typeof urlOrLocation === 'string') {
    try {
      const url = new URL(urlOrLocation);
      hostname = url.hostname.toLowerCase();
      pathname = url.pathname.toLowerCase();
    } catch (_error) {
      // 如果不是有效的 URL，嘗試直接作為路徑處理或忽略
      return false;
    }
  } else {
    hostname = (urlOrLocation.hostname || '').toLowerCase();
    pathname = (urlOrLocation.pathname || '').toLowerCase();
  }

  // GitHub Pages 和常見文檔站點
  const docHostPatterns = [
    /\.github\.io$/,
    /^docs?\./,
    /\.readthedocs\.io$/,
    /\.gitbook\.io$/,
    /^wiki\./,
    /^api\./,
    /^developer\./,
    /^guide\./,
  ];

  // 路徑中包含文檔特徵
  const docPathPatterns = [
    /\/docs?\//,
    /\/documentation\//,
    /\/guide\//,
    /\/manual\//,
    /\/wiki\//,
    /\/api\//,
    /\/reference\//,
    /\/cli\//,
    /\/getting-started\//,
    /\/tutorial\//,
  ];

  const isDocHost = docHostPatterns.some(pattern => pattern.test(hostname));
  const isDocPath = docPathPatterns.some(pattern => pattern.test(pathname));

  return isDocHost || isDocPath;
}

/**
 * 檢測是否為技術文檔頁面
 * 結合 URL 模式和標題模式進行綜合判斷
 * @param {Object} options - 檢測選項
 * @param {string} options.url - 頁面 URL (可選，默認使用 window.location.href)
 * @param {string} options.title - 頁面標題 (可選，默認使用 document.title)
 * @returns {{isTechnical: boolean, matchedUrl: boolean, matchedTitle: boolean}}
 */
export function isTechnicalDoc(options = {}) {
  const url = (
    options.url || (typeof window !== 'undefined' ? window.location.href : '')
  ).toLowerCase();
  const title = (
    options.title || (typeof document !== 'undefined' ? document.title : '')
  ).toLowerCase();

  // URL 模式檢測
  const urlPatterns = [
    /\/docs?\//,
    /\/api\//,
    /\/documentation\//,
    /\/guide\//,
    /\/manual\//,
    /\/reference\//,
    /\/cli\//,
    /\/commands?\//,
    /github\.io.*docs/,
    /\.github\.io/,
  ];

  // 標題模式檢測
  const titlePatterns = [
    /documentation/,
    /commands?/,
    /reference/,
    /guide/,
    /manual/,
    /cli/,
    /api/,
  ];

  const matchedUrl = urlPatterns.some(pattern => pattern.test(url));
  const matchedTitle = titlePatterns.some(pattern => pattern.test(title));

  return {
    isTechnical: matchedUrl || matchedTitle,
    matchedUrl,
    matchedTitle,
  };
}

/**
 * 統計DOM元素數量
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
 */
function hasTechnicalFeatures(document) {
  const textContent = (document.body?.textContent || '').toLowerCase();

  // 技術關鍵詞計數 (使用統一配置)
  const technicalTermCount = TECHNICAL_TERMS.reduce((count, term) => {
    // Escape special characters in the term to support terms like 'c++'
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedTerm}\\b`, 'gi');
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
 */
export function detectPageComplexity(document = window.document) {
  try {
    // 基礎指標統計
    const metrics = {
      // 網站類型
      isDocSite: isDocumentationSite(document.location || document.URL || window.location),

      // DOM結構分析
      adElements: countElements(
        document,
        '.advertisement, .ad-container, [id^="div-gpt-ad"], .google-auto-placed, .adsbygoogle'
      ),
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
 */
export function getAnalysisReport(complexity, selection) {
  const report = {
    url: window.location.href,
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
 */
export function logAnalysis(complexity, selection, extractionResult) {
  if (typeof console === 'undefined') {
    return;
  }

  const logData = {
    url: window.location.href,
    extractor: selection.extractor,
    confidence: selection.confidence,
    success: extractionResult.success,
    contentLength: extractionResult.contentLength,
    processingTime: extractionResult.processingTime,
    fallbackUsed: extractionResult.fallbackUsed,
  };

  // 發送到監控系統 (如果需要)
  if (window.analytics) {
    window.analytics.track('content_extraction_analysis', logData);
  }
}

// 匯出主要功能
export default {
  detectPageComplexity,
  selectExtractor,
  getAnalysisReport,
  logAnalysis,
  isTechnicalDoc,
};
