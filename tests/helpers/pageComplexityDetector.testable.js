/**
 * Page Complexity Detector - Testable Wrapper
 * 將 ESM 模組邏輯封裝為可在 Jest(CommonJS) 中測試的純函數版本。
 */

function isDocumentationSite(urlStr) {
  try {
    const url = new URL(urlStr || 'https://example.com');
    const hostname = url.hostname.toLowerCase();
    const pathname = url.pathname.toLowerCase();

    const docHostPatterns = [
      /\.github\.io$/,
      /^docs?\./,
      /\.readthedocs\.io$/,
      /\.gitbook\.io$/,
      /^wiki\./,
      /^api\./,
      /^developer\./,
      /^guide\./
    ];

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
      /\/tutorial\//
    ];

    const isDocHost = docHostPatterns.some((p) => p.test(hostname));
    const isDocPath = docPathPatterns.some((p) => p.test(pathname));
    return isDocHost || isDocPath;
  } catch {
    return false;
  }
}

function countElements(container, selector) {
  try {
    const elements = container.querySelectorAll(selector);
    return elements ? elements.length : 0;
  } catch {
    return 0;
  }
}

function calculateLinkDensity(document) {
  try {
    const links = document.querySelectorAll('a');
    const totalText = document.body?.textContent?.trim() || '';
    if (totalText.length === 0) return 0;
    let linkTextLength = 0;
    if (links && typeof links.forEach === 'function') {
      links.forEach((l) => {
        linkTextLength += (l.textContent?.trim() || '').length;
      });
    } else {
      for (let i = 0; i < (links?.length || 0); i++) {
        linkTextLength += (links[i].textContent?.trim() || '').length;
      }
    }
    return linkTextLength / totalText.length;
  } catch {
    return 0;
  }
}

function hasTechnicalFeatures(document) {
  const textContent = (document.body?.textContent || '').toLowerCase();
  const technicalTerms = [
    'command','option','parameter','syntax','usage','example',
    'install','configure','api','method','function','class','import','export',
    'npm','git','docker','kubernetes','javascript','python','react','vue','angular','node'
  ];
  let technicalTermCount = 0;
  technicalTerms.forEach((term) => {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    const matches = textContent.match(regex);
    if (matches) technicalTermCount += matches.length;
  });
  const wordCount = textContent.split(/\s+/).length;
  const technicalRatio = technicalTermCount / Math.max(wordCount, 1);
  return {
    technicalTermCount,
    technicalRatio,
    isTechnical: technicalRatio > 0.02 || technicalTermCount > 10
  };
}

function detectPageComplexity(document, urlStr = 'https://example.com') {
  try {
    const metrics = {
      isDocSite: isDocumentationSite(urlStr),
      adElements: countElements(document, '[class*="ad"], [id*="ad"], .advertisement, .sponsor, .banner'),
      navElements: countElements(document, 'nav, header, footer, aside, .sidebar, .navigation'),
      contentElements: countElements(document, 'article, main, .content, .post, .entry, section'),
      codeBlocks: countElements(document, 'pre, code, .highlight, .codehilite'),
      lists: countElements(document, 'ul li, ol li'),
      headings: countElements(document, 'h1, h2, h3, h4, h5, h6'),
      images: countElements(document, 'img'),
      videos: countElements(document, 'video, iframe[src*="youtube"], iframe[src*="vimeo"]'),
      links: countElements(document, 'a'),
      linkDensity: calculateLinkDensity(document),
      textLength: (document.body?.textContent?.trim() || '').length
    };

    const technicalFeatures = hasTechnicalFeatures(document);

    return {
      isClean: metrics.isDocSite || (
        metrics.adElements <= 2 && metrics.navElements <= 3 && metrics.contentElements >= 1
      ),
      hasMarkdownFeatures: metrics.codeBlocks >= 3 || metrics.lists >= 10,
      hasTechnicalContent: technicalFeatures.isTechnical,
      hasAds: metrics.adElements > 3,
      isComplexLayout: metrics.navElements > 5 ||
        (metrics.contentElements > 0 && metrics.navElements / metrics.contentElements > 3),
      linkDensity: metrics.linkDensity,
      hasHighLinkDensity: metrics.linkDensity > 0.3,
      isLongForm: metrics.textLength > 5000,
      hasRichMedia: metrics.images > 10 || metrics.videos > 2,
      metrics,
      technicalFeatures
    };
  } catch {
    return {
      isClean: false,
      hasMarkdownFeatures: false,
      hasTechnicalContent: false,
      hasAds: true,
      isComplexLayout: true,
      linkDensity: 0.5,
      hasHighLinkDensity: true,
      isLongForm: false,
      hasRichMedia: false,
      metrics: {},
      technicalFeatures: { isTechnical: false }
    };
  }
}

function calculateConfidence(complexity, selectedExtractor) {
  let confidence = 50;
  if (selectedExtractor === 'extractus') {
    if (complexity.isClean) confidence += 20;
    if (complexity.hasMarkdownFeatures) confidence += 15;
    if (complexity.hasTechnicalContent) confidence += 15;
    if (complexity.hasAds) confidence -= 25;
    if (complexity.isComplexLayout) confidence -= 15;
  } else {
    if (complexity.hasAds) confidence += 20;
    if (complexity.isComplexLayout) confidence += 15;
    if (complexity.hasRichMedia) confidence += 10;
    if (complexity.isLongForm) confidence += 10;
    if (complexity.isClean && !complexity.hasAds) confidence -= 15;
  }
  return Math.max(0, Math.min(100, confidence));
}

function shouldUseFallback(complexity) {
  return (
    complexity.linkDensity > 0.4 ||
    complexity.metrics.textLength < 500 ||
    (complexity.hasAds && complexity.hasTechnicalContent)
  );
}

function selectExtractor(complexity) {
  const reasons = [];
  const preferExtractus = complexity.isClean || complexity.hasMarkdownFeatures || complexity.hasTechnicalContent;
  const requireReadability = complexity.hasAds || complexity.isComplexLayout || complexity.hasRichMedia;
  let selectedExtractor;
  if (preferExtractus && !requireReadability) {
    selectedExtractor = 'extractus';
    if (complexity.isClean) reasons.push('頁面簡潔');
    if (complexity.hasMarkdownFeatures) reasons.push('包含代碼/列表');
    if (complexity.hasTechnicalContent) reasons.push('技術文檔內容');
  } else if (requireReadability) {
    selectedExtractor = 'readability';
    if (complexity.hasAds) reasons.push('包含廣告元素');
    if (complexity.isComplexLayout) reasons.push('複雜頁面佈局');
    if (complexity.hasRichMedia) reasons.push('大量媒體內容');
  } else {
    if (complexity.isLongForm) {
      selectedExtractor = 'readability';
      reasons.push('長文內容');
    } else {
      selectedExtractor = 'extractus';
      reasons.push('一般頁面');
    }
  }
  return {
    extractor: selectedExtractor,
    reasons,
    confidence: calculateConfidence(complexity, selectedExtractor),
    fallbackRequired: shouldUseFallback(complexity)
  };
}

function generateRecommendations(complexity, selection) {
  const recommendations = [];
  if (selection.confidence < 70) recommendations.push('建議使用備用提取器驗證結果品質');
  if (complexity.hasHighLinkDensity && selection.extractor === 'extractus') {
    recommendations.push('@extractus 對高連結密度頁面可能較弱，考慮降級 Readability');
  }
  if (complexity.isClean && selection.extractor === 'readability') {
    recommendations.push('頁面簡潔，可優先嘗試 @extractus 以提升速度');
  }
  if (complexity.hasAds && selection.extractor === 'extractus') {
    recommendations.push('存在廣告，@extractus 可能無法完全過濾');
  }
  return recommendations;
}

function getAnalysisReport(complexity, selection, urlStr = 'https://example.com') {
  return {
    url: urlStr,
    timestamp: new Date().toISOString(),
    pageType: {
      isDocumentationSite: complexity.isClean,
      isTechnicalContent: complexity.hasTechnicalContent,
      isNewsOrBlog: !complexity.isClean && complexity.isLongForm
    },
    metrics: complexity.metrics,
    selection: {
      extractor: selection.extractor,
      reasons: selection.reasons,
      confidence: selection.confidence,
      fallbackRequired: selection.fallbackRequired
    },
    recommendations: generateRecommendations(complexity, selection)
  };
}

function logAnalysis(complexity, selection, extractionResult, opts = {}) {
  const { url = 'https://example.com', analytics } = opts;
  const payload = {
    url,
    extractor: selection.extractor,
    confidence: selection.confidence,
    success: extractionResult.success,
    contentLength: extractionResult.contentLength,
    processingTime: extractionResult.processingTime,
    fallbackUsed: extractionResult.fallbackUsed
  };
  if (typeof console !== 'undefined' && console.log) {
    console.log('📊 頁面分析結果:', payload);
  }
  if (analytics && typeof analytics.track === 'function') {
    analytics.track('content_extraction_analysis', payload);
  }
}

module.exports = {
  detectPageComplexity,
  selectExtractor,
  getAnalysisReport,
  logAnalysis
};

