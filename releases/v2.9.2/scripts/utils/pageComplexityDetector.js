/**
 * 頁面複雜度檢測器
 *
 * 根據頁面特徵智能選擇最適合的內容提取器：
 * - 技術文檔/簡潔頁面 → @extractus (速度快、格式好)
 * - 新聞/複雜頁面 → Readability (穩定、完整性高)
 *
 * @author Content Extraction Team
 * @version 1.0
 * @date 2025-10-13
 */

/**
 * 檢測技術文檔站點
 * 基於URL特徵識別文檔類網站
 */
function isDocumentationSite(url = window.location) {
    const hostname = url.hostname.toLowerCase();
    const pathname = url.pathname.toLowerCase();

    // GitHub Pages 和常見文檔站點
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
        /\/tutorial\//
    ];

    const isDocHost = docHostPatterns.some(pattern => pattern.test(hostname));
    const isDocPath = docPathPatterns.some(pattern => pattern.test(pathname));

    return isDocHost || isDocPath;
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
 * 計算連結密度
 * 連結文字長度 / 總文字長度
 */
function calculateLinkDensity(document) {
    try {
        const links = document.querySelectorAll('a');
        const totalText = document.body?.textContent?.trim() || '';

        if (totalText.length === 0) return 0;

        let linkTextLength = 0;
        // 確保 links 是可迭代的數組或類數組對象
        if (links && typeof links.forEach === 'function') {
            links.forEach(link => {
                const linkText = link.textContent?.trim() || '';
                linkTextLength += linkText.length;
            });
        } else {
            // 回退到 for 循環
            for (let i = 0; i < (links.length || 0); i++) {
                const link = links[i];
                const linkText = link.textContent?.trim() || '';
                linkTextLength += linkText.length;
            }
        }

        return linkTextLength / totalText.length;
    } catch (error) {
        console.warn('❌ 計算連結密度失敗:', error.message);
        return 0;
    }
}

/**
 * 檢測技術內容特徵
 * 檢查頁面是否包含大量技術相關的內容
 */
function hasTechnicalFeatures(document) {
    const textContent = (document.body?.textContent || '').toLowerCase();

    // 技術關鍵詞
    const technicalTerms = [
        'command', 'option', 'parameter', 'syntax', 'usage', 'example',
        'install', 'configure', 'api', 'method', 'function', 'class',
        'import', 'export', 'npm', 'git', 'docker', 'kubernetes',
        'javascript', 'python', 'react', 'vue', 'angular', 'node'
    ];

    let technicalTermCount = 0;
    technicalTerms.forEach(term => {
        const regex = new RegExp(`\\b${term}\\b`, 'gi');
        const matches = textContent.match(regex);
        if (matches) {
            technicalTermCount += matches.length;
        }
    });

    // 如果技術詞彙出現頻率高，認為是技術文檔
    const wordCount = textContent.split(/\s+/).length;
    const technicalRatio = technicalTermCount / Math.max(wordCount, 1);

    return {
        technicalTermCount,
        technicalRatio,
        isTechnical: technicalRatio > 0.02 || technicalTermCount > 10
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
            isDocSite: isDocumentationSite(),

            // DOM結構分析
            adElements: countElements(document, '[class*="ad"], [id*="ad"], .advertisement, .sponsor, .banner'),
            navElements: countElements(document, 'nav, header, footer, aside, .sidebar, .navigation'),
            contentElements: countElements(document, 'article, main, .content, .post, .entry, section'),

            // Markdown/技術文檔特徵
            codeBlocks: countElements(document, 'pre, code, .highlight, .codehilite'),
            lists: countElements(document, 'ul li, ol li'),
            headings: countElements(document, 'h1, h2, h3, h4, h5, h6'),

            // 媒體內容
            images: countElements(document, 'img'),
            videos: countElements(document, 'video, iframe[src*="youtube"], iframe[src*="vimeo"]'),

            // 連結分析
            links: countElements(document, 'a'),
            linkDensity: calculateLinkDensity(document),

            // 文字內容
            textLength: (document.body?.textContent?.trim() || '').length
        };

        // 技術特徵檢測
        const technicalFeatures = hasTechnicalFeatures(document);

        // 計算複雜度評分
        const complexity = {
            // 簡潔度指標 (越高越簡潔)
            isClean: metrics.isDocSite || (
                metrics.adElements <= 2 &&
                metrics.navElements <= 3 &&
                metrics.contentElements >= 1
            ),

            // 技術文檔特徵
            hasMarkdownFeatures: metrics.codeBlocks >= 3 || metrics.lists >= 10,
            hasTechnicalContent: technicalFeatures.isTechnical,

            // 干擾因素
            hasAds: metrics.adElements > 3,
            isComplexLayout: metrics.navElements > 5 ||
                           (metrics.contentElements > 0 && metrics.navElements / metrics.contentElements > 3),

            // 連結密度 (技術文檔通常連結密度較高)
            linkDensity: metrics.linkDensity,
            hasHighLinkDensity: metrics.linkDensity > 0.3,

            // 內容特徵
            isLongForm: metrics.textLength > 5000,
            hasRichMedia: metrics.images > 10 || metrics.videos > 2,

            // 原始指標
            metrics,
            technicalFeatures
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
            linkDensity: 0.5,
            hasHighLinkDensity: true,
            isLongForm: false,
            hasRichMedia: false,
            metrics: {},
            technicalFeatures: { isTechnical: false }
        };
    }
}

/**
 * 選擇最佳提取器
 * 基於頁面複雜度分析結果，選擇最適合的提取器
 */
export function selectExtractor(complexity) {
    const reasons = [];

    // 優先選擇 @extractus 的條件
    const preferExtractus =
        complexity.isClean ||
        complexity.hasMarkdownFeatures ||
        complexity.hasTechnicalContent;

    // 必須使用 Readability 的條件
    const requireReadability =
        complexity.hasAds ||
        complexity.isComplexLayout ||
        complexity.hasRichMedia;

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
        // 邊界情況：根據內容長度決定
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
        reasons: reasons,
        confidence: calculateConfidence(complexity, selectedExtractor),
        fallbackRequired: shouldUseFallback(complexity)
    };
}

/**
 * 計算選擇信心度
 * 返回 0-100 的信心分數
 */
function calculateConfidence(complexity, selectedExtractor) {
    let confidence = 50; // 基礎信心度

    if (selectedExtractor === 'extractus') {
        if (complexity.isClean) confidence += 20;
        if (complexity.hasMarkdownFeatures) confidence += 15;
        if (complexity.hasTechnicalContent) confidence += 15;
        if (complexity.hasAds) confidence -= 25; // 有廣告會降低信心度
        if (complexity.isComplexLayout) confidence -= 15;
    } else {
        if (complexity.hasAds) confidence += 20;
        if (complexity.isComplexLayout) confidence += 15;
        if (complexity.hasRichMedia) confidence += 10;
        if (complexity.isLongForm) confidence += 10;
        if (complexity.isClean && !complexity.hasAds) confidence -= 15; // 簡潔頁面用 Readability 信心度較低
    }

    return Math.max(0, Math.min(100, confidence));
}

/**
 * 判斷是否需要備用方案
 */
function shouldUseFallback(complexity) {
    // 如果頁面特徵不明顯，建議使用備用方案驗證
    return (
        complexity.linkDensity > 0.4 || // 連結密度過高
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

    if (complexity.hasHighLinkDensity && selection.extractor === 'extractus') {
        recommendations.push('高連結密度可能影響 @extractus 效果，考慮降級到 Readability');
    }

    if (complexity.isClean && selection.extractor === 'readability') {
        recommendations.push('簡潔頁面建議優先嘗試 @extractus 以獲得更好速度');
    }

    if (complexity.hasAds && selection.extractor === 'extractus') {
        recommendations.push('檢測到廣告內容，@extractus 可能無法完全過濾');
    }

    return recommendations;
}

/**
 * 記錄分析結果 (用於效能監控)
 */
export function logAnalysis(complexity, selection, extractionResult) {
    if (typeof console === 'undefined') return;

    const logData = {
        url: window.location.href,
        extractor: selection.extractor,
        confidence: selection.confidence,
        success: extractionResult.success,
        contentLength: extractionResult.contentLength,
        processingTime: extractionResult.processingTime,
        fallbackUsed: extractionResult.fallbackUsed
    };

    console.log('📊 頁面分析結果:', logData);

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
    logAnalysis
};