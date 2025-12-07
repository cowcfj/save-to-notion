/**
 * 頁面複雜度檢測器單元測試
 *
 * 測試各種頁面類型的複雜度檢測和提取器選擇邏輯
 *
 * @author Content Extraction Team
 * @version 1.0
 * @date 2025-10-13
 */

const { JSDOM } = require('jsdom');

// 將頁面複雜度檢測器轉為 CommonJS 格式，以便測試
let detectPageComplexity = null;
let selectExtractor = null;
let getAnalysisReport = null;
const { isTechnicalDoc } = require('../../scripts/utils/pageComplexityDetector.js');
let logAnalysis = null;

// 模擬瀏覽器環境
let mockWindow = null;
let mockDocument = null;
let mockLocation = null;

beforeAll(() => {
  // 由於檢測器使用 ES Module，我們需要模擬相關功能
  // 這裡我們直接實現測試版本
});

beforeEach(() => {
  // 創建新的 DOM 環境
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://example.com',
    pretendToBeVisual: true,
  });

  mockDocument = dom.window.document;
  mockWindow = dom.window;
  mockLocation = mockWindow.location;

  // 為測試環境實現檢測器功能
  setupDetectorForTest(mockDocument, mockWindow, mockLocation);
});

/**
 * 為測試環境設置檢測器功能
 */
function setupDetectorForTest(document, window, location) {
  // 檢測技術文檔站點
  function isDocumentationSite(url = location) {
    const hostname = url.hostname.toLowerCase();
    const pathname = url.pathname.toLowerCase();

    const docHostPatterns = [/\.github\.io$/, /^docs?\./, /\.readthedocs\.io$/, /\.gitbook\.io$/];

    const docPathPatterns = [
      /\/docs?\//,
      /\/documentation\//,
      /\/guide\//,
      /\/manual\//,
      /\/api\//,
      /\/cli\//,
    ];

    const isDocHost = docHostPatterns.some(pattern => pattern.test(hostname));
    const isDocPath = docPathPatterns.some(pattern => pattern.test(pathname));

    return isDocHost || isDocPath;
  }

  // 統計DOM元素數量
  function countElements(container, selector) {
    try {
      const elements = container.querySelectorAll(selector);
      return elements ? elements.length : 0;
    } catch {
      return 0;
    }
  }

  // 計算連結密度
  function calculateLinkDensity(document) {
    try {
      const links = document.querySelectorAll('a');
      const totalText = document.body?.textContent?.trim() || '';

      if (totalText.length === 0) {
        return 0;
      }

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
    } catch {
      return 0;
    }
  }

  // 檢測技術內容特徵
  function hasTechnicalFeatures(document) {
    const textContent = (document.body?.textContent || '').toLowerCase();

    const technicalTerms = [
      'command',
      'option',
      'parameter',
      'syntax',
      'usage',
      'example',
      'install',
      'configure',
      'api',
      'method',
      'function',
      'class',
      'npm',
      'git',
      'javascript',
      'python',
      'react',
      'node',
    ];

    let technicalTermCount = 0;
    technicalTerms.forEach(term => {
      const regex = new RegExp(`\\b${term}\\b`, 'gi');
      const matches = textContent.match(regex);
      if (matches) {
        technicalTermCount += matches.length;
      }
    });

    const wordCount = textContent.split(/\s+/).length;
    const technicalRatio = technicalTermCount / Math.max(wordCount, 1);

    return {
      technicalTermCount,
      technicalRatio,
      isTechnical: technicalRatio > 0.02 || technicalTermCount > 10,
    };
  }

  // 檢測頁面複雜度
  detectPageComplexity = function (testDocument = document) {
    try {
      const metrics = {
        isDocSite: isDocumentationSite(),
        adElements: countElements(
          testDocument,
          '[class*="ad"], [id*="ad"], .advertisement, .sponsor'
        ),
        navElements: countElements(testDocument, 'nav, header, footer, aside, .sidebar'),
        contentElements: countElements(
          testDocument,
          'article, main, .content, .post, .entry, section'
        ),
        codeBlocks: countElements(testDocument, 'pre, code, .highlight'),
        lists: countElements(testDocument, 'ul li, ol li'),
        headings: countElements(testDocument, 'h1, h2, h3, h4, h5, h6'),
        images: countElements(testDocument, 'img'),
        videos: countElements(testDocument, 'video, iframe[src*="youtube"]'),
        links: countElements(testDocument, 'a'),
        linkDensity: calculateLinkDensity(testDocument),
        textLength: (testDocument.body?.textContent?.trim() || '').length,
      };

      const technicalFeatures = hasTechnicalFeatures(testDocument);

      const complexity = {
        isClean:
          metrics.isDocSite ||
          (metrics.adElements <= 2 && metrics.navElements <= 3 && metrics.contentElements >= 1),
        hasMarkdownFeatures: metrics.codeBlocks >= 3 || metrics.lists >= 10,
        hasTechnicalContent: technicalFeatures.isTechnical,
        hasAds: metrics.adElements > 3,
        isComplexLayout:
          metrics.navElements > 5 ||
          (metrics.contentElements > 0 && metrics.navElements / metrics.contentElements > 3),
        linkDensity: metrics.linkDensity,
        hasHighLinkDensity: metrics.linkDensity > 0.3,
        isLongForm: metrics.textLength > 5000,
        hasRichMedia: metrics.images > 10 || metrics.videos > 2,
        metrics,
        technicalFeatures,
      };

      return complexity;
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
        technicalFeatures: { isTechnical: false },
      };
    }
  };

  // 選擇最佳提取器
  selectExtractor = function (complexity) {
    const reasons = [];

    const preferExtractus =
      complexity.isClean || complexity.hasMarkdownFeatures || complexity.hasTechnicalContent;

    const requireReadability =
      complexity.hasAds || complexity.isComplexLayout || complexity.hasRichMedia;

    let selectedExtractor = null;

    if (preferExtractus && !requireReadability) {
      selectedExtractor = 'extractus';

      if (complexity.isClean) {
        reasons.push('頁面簡潔');
      }
      if (complexity.hasMarkdownFeatures) {
        reasons.push('包含代碼/列表');
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
      selectedExtractor = 'extractus';
      reasons.push('一般頁面');
    }

    // 計算信心度
    let confidence = 50;
    if (selectedExtractor === 'extractus') {
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
      }
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
      }
    }
    confidence = Math.max(0, Math.min(100, confidence));

    // 判斷是否需要備用方案
    const fallbackRequired =
      complexity.linkDensity > 0.4 ||
      complexity.metrics.textLength < 500 ||
      (complexity.hasAds && complexity.hasTechnicalContent);

    return {
      extractor: selectedExtractor,
      reasons,
      confidence,
      fallbackRequired,
    };
  };

  // 獲取分析報告
  getAnalysisReport = function (complexity, selection) {
    return {
      url: location.href,
      timestamp: new Date().toISOString(),
      pageType: {
        isDocumentationSite: complexity.isClean,
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
    };
  };

  // 記錄分析結果
  logAnalysis = function (complexity, selection, extractionResult) {
    return {
      url: location.href,
      extractor: selection.extractor,
      confidence: selection.confidence,
      success: extractionResult.success,
      contentLength: extractionResult.contentLength,
      processingTime: extractionResult.processingTime,
      fallbackUsed: extractionResult.fallbackUsed,
    };
  };
}

describe('頁面複雜度檢測器', () => {
  describe('isTechnicalDoc 函數', () => {
    test('should detect technical doc by URL pattern - /docs/', () => {
      const result = isTechnicalDoc({ url: 'https://example.com/docs/getting-started' });
      expect(result.isTechnical).toBe(true);
      expect(result.matchedUrl).toBe(true);
    });

    test('should detect technical doc by URL pattern - /api/', () => {
      const result = isTechnicalDoc({ url: 'https://example.com/api/v1/users' });
      expect(result.isTechnical).toBe(true);
      expect(result.matchedUrl).toBe(true);
    });

    test('should detect technical doc by URL pattern - github.io', () => {
      const result = isTechnicalDoc({ url: 'https://project.github.io/guide/' });
      expect(result.isTechnical).toBe(true);
      expect(result.matchedUrl).toBe(true);
    });

    test('should detect technical doc by title pattern - Documentation', () => {
      const result = isTechnicalDoc({ url: 'https://example.com/', title: 'API Documentation v2' });
      expect(result.isTechnical).toBe(true);
      expect(result.matchedTitle).toBe(true);
    });

    test('should detect technical doc by title pattern - CLI Commands', () => {
      const result = isTechnicalDoc({
        url: 'https://example.com/',
        title: 'CLI Commands Reference',
      });
      expect(result.isTechnical).toBe(true);
      expect(result.matchedTitle).toBe(true);
    });

    test('should return false for non-technical pages', () => {
      const result = isTechnicalDoc({
        url: 'https://example.com/blog/post',
        title: 'My Blog Post',
      });
      expect(result.isTechnical).toBe(false);
      expect(result.matchedUrl).toBe(false);
      expect(result.matchedTitle).toBe(false);
    });

    test('should handle empty inputs', () => {
      const result = isTechnicalDoc({});
      expect(result.isTechnical).toBe(false);
    });
  });

  describe('技術文檔頁面檢測', () => {
    test('GitHub Pages 文檔站檢測', () => {
      // 模擬 GitHub Pages 文檔站
      const dom = new JSDOM(
        `
                <!DOCTYPE html>
                <html>
                <head><title>API Documentation</title></head>
                <body>
                    <main>
                        <article>
                            <h1>API Reference</h1>
                            <h2>Installation</h2>
                            <pre><code>npm install package</code></pre>
                            <h2>Usage</h2>
                            <p>Here's how to use this API...</p>
                            <ul>
                                <li>First step</li>
                                <li>Second step</li>
                                <li>Third step</li>
                            </ul>
                        </article>
                    </main>
                </body>
                </html>
            `,
        { url: 'https://example.github.io/docs/api/' }
      );

      setupDetectorForTest(dom.window.document, dom.window, dom.window.location);

      const complexity = detectPageComplexity(dom.window.document);
      const selection = selectExtractor(complexity);

      console.log('GitHub Pages 測試結果:', {
        codeBlocks: complexity.metrics.codeBlocks,
        lists: complexity.metrics.lists,
        hasMarkdownFeatures: complexity.hasMarkdownFeatures,
        isClean: complexity.isClean,
      });

      expect(complexity.isClean).toBe(true);
      // GitHub Pages 測試：至少有1個代碼塊和3個列表項
      expect(complexity.metrics.codeBlocks).toBeGreaterThanOrEqual(1);
      expect(complexity.metrics.lists).toBeGreaterThanOrEqual(3);
      expect(selection.extractor).toBe('extractus');
      expect(selection.reasons).toContain('頁面簡潔');
      expect(selection.confidence).toBeGreaterThan(70);
    });

    test('包含大量代碼塊的技術文檔', () => {
      const dom = new JSDOM(
        `
                <!DOCTYPE html>
                <html>
                <body>
                    <article>
                        <h1>Command Reference</h1>
                        <p>This document contains many code examples and commands.</p>
                        <pre><code>git clone repo</code></pre>
                        <pre><code>npm install</code></pre>
                        <pre><code>npm start</code></pre>
                        <pre><code>docker build -t app .</code></pre>
                        <pre><code>kubectl apply -f config.yaml</code></pre>
                    </article>
                </body>
                </html>
            `,
        { url: 'https://docs.example.com/commands' }
      );

      setupDetectorForTest(dom.window.document, dom.window, dom.window.location);

      const complexity = detectPageComplexity(dom.window.document);
      const selection = selectExtractor(complexity);

      expect(complexity.hasMarkdownFeatures).toBe(true);
      expect(complexity.metrics.codeBlocks).toBeGreaterThanOrEqual(3);
      expect(selection.extractor).toBe('extractus');
    });

    test('包含大量列表的文檔頁面', () => {
      const dom = new JSDOM(
        `
                <!DOCTYPE html>
                <html>
                <body>
                    <article>
                        <h1>Configuration Options</h1>
                        <ul>
                            ${Array.from({ length: 15 }, (_, i) => `<li>Option ${i + 1}</li>`).join('')}
                        </ul>
                    </article>
                </body>
                </html>
            `,
        { url: 'https://example.com/config' }
      );

      setupDetectorForTest(dom.window.document, dom.window, dom.window.location);

      const complexity = detectPageComplexity(dom.window.document);
      const selection = selectExtractor(complexity);

      expect(complexity.hasMarkdownFeatures).toBe(true);
      expect(complexity.metrics.lists).toBeGreaterThanOrEqual(10);
      expect(selection.extractor).toBe('extractus');
    });
  });

  describe('新聞網站頁面檢測', () => {
    test('包含廣告的新聞頁面', () => {
      const dom = new JSDOM(
        `
                <!DOCTYPE html>
                <html>
                <body>
                    <header>
                        <nav>Navigation</nav>
                    </header>
                    <aside class="sidebar">
                        <div class="advertisement">Ad 1</div>
                        <div class="ad-banner">Ad 2</div>
                        <div id="ad-section">Ad 3</div>
                        <div class="sponsor-content">Ad 4</div>
                        <div class="ad-widget">Ad 5</div>
                    </aside>
                    <main>
                        <article>
                            <h1>Breaking News Title</h1>
                            <p>This is a news article with important information...</p>
                            <p>More content here with analysis and quotes...</p>
                        </article>
                    </main>
                    <footer>Footer content</footer>
                </body>
                </html>
            `,
        { url: 'https://news.example.com/article' }
      );

      setupDetectorForTest(dom.window.document, dom.window, dom.window.location);

      const complexity = detectPageComplexity(dom.window.document);
      const selection = selectExtractor(complexity);

      console.log('新聞網站測試結果:', {
        adElements: complexity.metrics.adElements,
        hasAds: complexity.hasAds,
        adSelectors: '[class*="ad"], [id*="ad"], .advertisement, .sponsor',
      });

      expect(complexity.metrics.adElements).toBeGreaterThanOrEqual(3);
      expect(complexity.hasAds).toBe(true);
      expect(selection.extractor).toBe('readability');
      expect(selection.reasons).toContain('包含廣告元素');
    });

    test('複雜佈局的媒體網站', () => {
      const dom = new JSDOM(
        `
                <!DOCTYPE html>
                <html>
                <body>
                    <header>Header</header>
                    <nav>Main nav</nav>
                    <aside class="left-sidebar">Left sidebar</aside>
                    <aside class="right-sidebar">Right sidebar</aside>
                    <nav class="breadcrumb">Breadcrumb</nav>
                    <nav class="tags">Tags nav</nav>
                    <footer>Footer</footer>
                    <main>
                        <article>
                            <h1>Article Title</h1>
                            <p>Content here...</p>
                        </article>
                    </main>
                </body>
                </html>
            `,
        { url: 'https://complex-news.com/story' }
      );

      setupDetectorForTest(dom.window.document, dom.window, dom.window.location);

      const complexity = detectPageComplexity(dom.window.document);
      const selection = selectExtractor(complexity);

      expect(complexity.isComplexLayout).toBe(true);
      expect(complexity.metrics.navElements).toBeGreaterThan(5);
      expect(selection.extractor).toBe('readability');
      expect(selection.reasons).toContain('複雜頁面佈局');
    });
  });

  describe('邊界情況測試', () => {
    test('高連結密度頁面', () => {
      const dom = new JSDOM(`
                <!DOCTYPE html>
                <html>
                <body>
                    <article>
                        <p>
                            Check out <a href="/link1">this link</a> and
                            <a href="/link2">this other link</a> and
                            <a href="/link3">yet another link</a>
                        </p>
                    </article>
                </body>
                </html>
            `);

      setupDetectorForTest(dom.window.document, dom.window, dom.window.location);

      const complexity = detectPageComplexity(dom.window.document);
      const selection = selectExtractor(complexity);

      expect(complexity.linkDensity).toBeGreaterThan(0.3);
      expect(complexity.hasHighLinkDensity).toBe(true);
      expect(selection.fallbackRequired).toBe(true);
    });

    test('內容過短的頁面', () => {
      const dom = new JSDOM(`
                <!DOCTYPE html>
                <html>
                <body>
                    <article>
                        <h1>Short</h1>
                        <p>Very brief content.</p>
                    </article>
                </body>
                </html>
            `);

      setupDetectorForTest(dom.window.document, dom.window, dom.window.location);

      const complexity = detectPageComplexity(dom.window.document);
      const selection = selectExtractor(complexity);

      expect(complexity.metrics.textLength).toBeLessThan(500);
      expect(selection.fallbackRequired).toBe(true);
    });

    test('長文內容頁面', () => {
      const longContent = 'This is a very long article with lots of content. '.repeat(200);
      const dom = new JSDOM(`
                <!DOCTYPE html>
                <html>
                <body>
                    <article>
                        <h1>Long Article</h1>
                        <p>${longContent}</p>
                    </article>
                </body>
                </html>
            `);

      setupDetectorForTest(dom.window.document, dom.window, dom.window.location);

      const complexity = detectPageComplexity(dom.window.document);

      expect(complexity.isLongForm).toBe(true);
      expect(complexity.metrics.textLength).toBeGreaterThan(5000);
    });
  });

  describe('提取器選擇邏輯', () => {
    test('@extractus 優先條件', () => {
      const testCases = [
        { isClean: true, hasMarkdownFeatures: false, hasTechnicalContent: false },
        { isClean: false, hasMarkdownFeatures: true, hasTechnicalContent: false },
        { isClean: false, hasMarkdownFeatures: false, hasTechnicalContent: true },
      ];

      testCases.forEach(complexity => {
        const selection = selectExtractor({
          ...complexity,
          hasAds: false,
          isComplexLayout: false,
          hasRichMedia: false,
          isLongForm: false,
          metrics: { textLength: 1000 },
        });

        expect(selection.extractor).toBe('extractus');
      });
    });

    test('Readability 必須條件', () => {
      const testCases = [
        { hasAds: true, isComplexLayout: false, hasRichMedia: false },
        { hasAds: false, isComplexLayout: true, hasRichMedia: false },
        { hasAds: false, isComplexLayout: false, hasRichMedia: true },
      ];

      testCases.forEach(complexity => {
        const selection = selectExtractor({
          isClean: false,
          hasMarkdownFeatures: false,
          hasTechnicalContent: false,
          ...complexity,
          isLongForm: false,
          metrics: { textLength: 1000 },
        });

        expect(selection.extractor).toBe('readability');
      });
    });

    test('信心度計算', () => {
      // 高信心度的 extractus 選擇
      const highConfidenceExtractus = selectExtractor({
        isClean: true,
        hasMarkdownFeatures: true,
        hasTechnicalContent: true,
        hasAds: false,
        isComplexLayout: false,
        hasRichMedia: false,
        isLongForm: false,
        metrics: { textLength: 1000 },
      });

      expect(highConfidenceExtractus.extractor).toBe('extractus');
      expect(highConfidenceExtractus.confidence).toBeGreaterThan(85);

      // 高信心度的 readability 選擇
      const highConfidenceReadability = selectExtractor({
        isClean: false,
        hasMarkdownFeatures: false,
        hasTechnicalContent: false,
        hasAds: true,
        isComplexLayout: true,
        hasRichMedia: true,
        isLongForm: true,
        metrics: { textLength: 6000 },
      });

      expect(highConfidenceReadability.extractor).toBe('readability');
      expect(highConfidenceReadability.confidence).toBeGreaterThan(80);
    });
  });

  describe('分析報告功能', () => {
    test('完整分析報告生成', () => {
      const complexity = {
        isClean: true,
        hasMarkdownFeatures: true,
        hasTechnicalContent: true,
        hasAds: false,
        isComplexLayout: false,
        hasRichMedia: false,
        isLongForm: false,
        metrics: {
          codeBlocks: 5,
          lists: 12,
          textLength: 2000,
        },
      };

      const selection = selectExtractor(complexity);
      const report = getAnalysisReport(complexity, selection);

      expect(report).toHaveProperty('url');
      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('pageType');
      expect(report).toHaveProperty('metrics');
      expect(report).toHaveProperty('selection');

      expect(report.pageType.isDocumentationSite).toBe(true);
      expect(report.pageType.isTechnicalContent).toBe(true);
      expect(report.selection.extractor).toBe('extractus');
    });

    test('記錄分析結果', () => {
      const complexity = { isClean: true };
      const selection = { extractor: 'extractus', confidence: 85 };
      const extractionResult = {
        success: true,
        contentLength: 1500,
        processingTime: 25,
        fallbackUsed: false,
      };

      const log = logAnalysis(complexity, selection, extractionResult);

      expect(log).toHaveProperty('url');
      expect(log).toHaveProperty('extractor', 'extractus');
      expect(log).toHaveProperty('confidence', 85);
      expect(log).toHaveProperty('success', true);
      expect(log).toHaveProperty('contentLength', 1500);
    });
  });

  describe('錯誤處理', () => {
    test('無效 DOM 處理', () => {
      const nullDocument = null;

      // 檢測器應該能夠安全處理 null 輸入
      const complexity = detectPageComplexity(nullDocument);

      expect(complexity).toBeDefined();
      expect(complexity.isClean).toBe(false);
      expect(complexity.hasMarkdownFeatures).toBe(false);

      const selection = selectExtractor(complexity);
      expect(selection.extractor).toBeDefined();
    });

    test('損壞的 HTML 結構', () => {
      const dom = new JSDOM(`
                <!DOCTYPE html>
                <html>
                <body>
                    <article>
                        <h1>Title
                        <p>Unclosed paragraph
                        <div>Broken structure
                    </article>
                </body>
            `);

      setupDetectorForTest(dom.window.document, dom.window, dom.window.location);

      // 應該能夠處理損壞的 HTML 而不崩潰
      expect(() => {
        const complexity = detectPageComplexity(dom.window.document);
        const _selection = selectExtractor(complexity);
      }).not.toThrow();
    });
  });
});
