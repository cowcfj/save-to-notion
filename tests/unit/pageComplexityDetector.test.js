/**
 * 頁面複雜度檢測器單元測試
 *
 * 測試各種頁面類型的複雜度檢測和提取器選擇邏輯
 *
 * @author Content Extraction Team
 */

// 將頁面複雜度檢測器轉為 CommonJS 格式，以便測試
// 【重構】直接導入源代碼而非測試替身
const {
  detectPageComplexity,
  selectExtractor,
  getAnalysisReport,
  logAnalysis,
  isDocumentation,
} = require('../../scripts/utils/pageComplexityDetector.js');
const {
  TECHNICAL_TERM_RULES,
  TECHNICAL_TERM_GROUPS,
} = require('../../scripts/config/shared/technicalTerms.js');

describe('頁面複雜度檢測器', () => {
  describe('isDocumentation 函數 (替代 isTechnicalDoc)', () => {
    test('should detect documentation by hostname pattern - docs.*', () => {
      const result = isDocumentation({ url: 'https://docs.example.com/' });
      expect(result.isDoc).toBe(true);
      expect(result.matched.host).toBe(true);
    });

    test('should detect documentation by pathname pattern - /wiki/', () => {
      const result = isDocumentation({ url: 'https://example.com/wiki/home' });
      expect(result.isDoc).toBe(true);
      expect(result.matched.path).toBe(true);
    });

    test('should verify matched.path boolean field', () => {
      const result = isDocumentation({ url: 'https://example.com/documentation/api' });
      expect(result.isDoc).toBe(true);
      expect(result.matched.path).toBe(true);
      expect(result.matched.host).toBe(false); // Host doesn't match
    });

    test('should detect technical doc by URL pattern - /docs/', () => {
      const result = isDocumentation({ url: 'https://example.com/docs/getting-started' });
      expect(result.isTechnical).toBe(true);
      expect(result.matched.techUrl).toBe(true);
      expect(result.isDoc).toBe(true); // Should be true as tech doc is a subset of doc
    });

    test('should detect technical doc by URL pattern - /api/', () => {
      const result = isDocumentation({ url: 'https://example.com/api/v1/users' });
      expect(result.isTechnical).toBe(true);
      expect(result.matched.techUrl).toBe(true);
    });

    test('should detect technical doc by URL pattern - github.io', () => {
      const result = isDocumentation({ url: 'https://project.github.io/guide/' });
      expect(result.isTechnical).toBe(true);
      expect(result.matched.techUrl).toBe(true);
    });

    test('should detect technical doc by title pattern - Documentation', () => {
      const result = isDocumentation({
        url: 'https://example.com/',
        title: 'API Documentation v2',
      });
      expect(result.isTechnical).toBe(true);
      expect(result.matched.techTitle).toBe(true);
    });

    test('should detect technical doc by title pattern - CLI Commands', () => {
      const result = isDocumentation({
        url: 'https://example.com/',
        title: 'CLI Commands Reference',
      });
      expect(result.isTechnical).toBe(true);
      expect(result.matched.techTitle).toBe(true);
    });

    test('should return false for non-technical pages', () => {
      const result = isDocumentation({
        url: 'https://example.com/blog/post',
        title: 'My Blog Post',
      });
      expect(result.isTechnical).toBe(false);
      expect(result.matched.techUrl).toBe(false);
      expect(result.matched.techTitle).toBe(false);
    });

    test('should handle empty inputs', () => {
      const result = isDocumentation({});
      expect(result.isTechnical).toBe(false);
    });
  });

  describe('技術文檔頁面檢測', () => {
    test('GitHub Pages 文檔站檢測', () => {
      // 模擬 GitHub Pages 文檔站
      document.documentElement.innerHTML = `
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
            `;

      const complexity = detectPageComplexity(document);
      const selection = selectExtractor(complexity);

      expect(complexity.isClean).toBe(true);
      // GitHub Pages 測試：至少有1個代碼塊和3個列表項
      expect(complexity.metrics.codeBlocks).toBeGreaterThanOrEqual(1);
      // 源代碼不再統計 lists，改用 markdownContainers
      expect(selection.extractor).toBe('markdown');
      expect(selection.reasons).toContain('頁面簡潔');
      expect(selection.confidence).toBeGreaterThan(70);
    });

    test('包含大量代碼塊的技術文檔', () => {
      document.documentElement.innerHTML = `
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
            `;

      const complexity = detectPageComplexity(document);
      const selection = selectExtractor(complexity);

      expect(complexity.hasMarkdownFeatures).toBe(true);
      expect(complexity.metrics.codeBlocks).toBeGreaterThanOrEqual(3);
      expect(selection.extractor).toBe('markdown');
    });

    test('包含大量列表的文檔頁面', () => {
      document.documentElement.innerHTML = `
                <body>
                    <article>
                        <h1>Configuration Options</h1>
                        <ul>
                            ${Array.from({ length: 15 }, (_, i) => `<li>Option ${i + 1}</li>`).join('')}
                        </ul>
                    </article>
                </body>
            `;

      const complexity = detectPageComplexity(document);
      const selection = selectExtractor(complexity);

      // 源代碼 hasMarkdownFeatures 依賴 codeBlocks >= 3 或 markdownContainers > 0
      // 測試 DOM 沒有代碼塊也沒有 .markdown-body，所以 hasMarkdownFeatures 為 false
      expect(complexity.hasMarkdownFeatures).toBe(false);
      // 但因為 isClean=true (沒有廣告/簡單佈局)，仍選 markdown
      expect(selection.extractor).toBe('markdown');
    });
  });

  describe('新聞網站頁面檢測', () => {
    test('包含廣告的新聞頁面', () => {
      document.documentElement.innerHTML = `
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
            `;

      const complexity = detectPageComplexity(document);
      const selection = selectExtractor(complexity);

      // 擴充後的 AD_SELECTORS 現在能匹配所有 5 個廣告元素
      // .advertisement, .ad-banner ([class^="ad-"]), #ad-section ([id^="ad-"]), .sponsor-content, .ad-widget ([class^="ad-"])
      expect(complexity.metrics.adElements).toBe(5);
      // 因為 > 3 個（5 > 3），hasAds 為 true
      expect(complexity.hasAds).toBe(true);
      // 因此選 readability
      expect(selection.extractor).toBe('readability');
      expect(selection.reasons).toContain('包含廣告元素');
    });

    test('複雜佈局的媒體網站', () => {
      document.documentElement.innerHTML = `
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
            `;

      const complexity = detectPageComplexity(document);
      const selection = selectExtractor(complexity);

      expect(complexity.isComplexLayout).toBe(true);
      expect(complexity.metrics.navElements).toBeGreaterThan(5);
      expect(selection.extractor).toBe('readability');
      expect(selection.reasons).toContain('複雜頁面佈局');
    });
  });

  describe('邊界情況測試', () => {
    test('高連結密度頁面', () => {
      document.documentElement.innerHTML = `
                <body>
                    <article>
                        <p>
                            Check out <a href="/link1">this link</a> and
                            <a href="/link2">this other link</a> and
                            <a href="/link3">yet another link</a>
                        </p>
                    </article>
                </body>
            `;

      const complexity = detectPageComplexity(document);
      const selection = selectExtractor(complexity);

      // 源代碼不再計算 linkDensity，改為純靠文本長度和廣告組合觸發 fallback
      // 這裡文本太短，觸發 fallbackRequired
      expect(complexity.metrics.textLength).toBeLessThan(500);
      expect(selection.fallbackRequired).toBe(true);
    });

    test('內容過短的頁面', () => {
      document.documentElement.innerHTML = `
                <body>
                    <article>
                        <h1>Short</h1>
                        <p>Very brief content.</p>
                    </article>
                </body>
            `;

      const complexity = detectPageComplexity(document);
      const selection = selectExtractor(complexity);

      expect(complexity.metrics.textLength).toBeLessThan(500);
      expect(selection.fallbackRequired).toBe(true);
    });

    test('長文內容頁面', () => {
      const longContent = 'This is a very long article with lots of content. '.repeat(200);
      document.documentElement.innerHTML = `
                <body>
                    <article>
                        <h1>Long Article</h1>
                        <p>${longContent}</p>
                    </article>
                </body>
            `;

      const complexity = detectPageComplexity(document);

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

        expect(selection.extractor).toBe('markdown');
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

      expect(highConfidenceExtractus.extractor).toBe('markdown');
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
          isDocSite: true,
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
      expect(report.selection.extractor).toBe('markdown');
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

      // Mock analytics
      const originalAnalytics = globalThis.analytics;
      globalThis.analytics = { track: jest.fn() };

      logAnalysis(complexity, selection, extractionResult);

      expect(globalThis.analytics.track).toHaveBeenCalledWith(
        'content_extraction_analysis',
        expect.objectContaining({
          extractor: 'extractus',
          confidence: 85,
          success: true,
          contentLength: 1500,
        })
      );

      // Cleanup
      globalThis.analytics = originalAnalytics;
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
      document.documentElement.innerHTML = `
                <body>
                    <article>
                        <h1>Title
                        <p>Unclosed paragraph
                        <div>Broken structure
                    </article>
                </body>
            `;

      // 應該能夠處理損壞的 HTML 而不崩潰
      expect(() => {
        const complexity = detectPageComplexity(document);
        selectExtractor(complexity);
      }).not.toThrow();
    });
  });

  describe('Technical term boundary regression (c++)', () => {
    test('standalone "c++" token should be detected as technical term', () => {
      document.documentElement.innerHTML =
        '<body><article><p>Learn c++ programming with modern c++ features and c++ templates</p></article></body>';
      const result = detectPageComplexity(document);
      expect(result.technicalFeatures.technicalTermCount).toBeGreaterThanOrEqual(3);
    });

    test('"c++" at end of text should be detected', () => {
      document.documentElement.innerHTML =
        '<body><article><p>This guide covers c++</p></article></body>';
      const result = detectPageComplexity(document);
      expect(result.technicalFeatures.technicalTermCount).toBeGreaterThanOrEqual(1);
    });

    test('"c++" followed by space should be detected', () => {
      document.documentElement.innerHTML =
        '<body><article><p>c++ is a powerful language</p></article></body>';
      const result = detectPageComplexity(document);
      expect(result.technicalFeatures.technicalTermCount).toBeGreaterThanOrEqual(1);
    });

    test('"objective-c++ish" should NOT match as standalone c++', () => {
      document.documentElement.innerHTML =
        '<body><article><p>objective-c++ish is not a real language</p></article></body>';
      const result = detectPageComplexity(document);
      expect(result.technicalFeatures.technicalTermCount).toBe(0);
    });

    test('c++ technical term should contribute to hasTechnicalContent', () => {
      document.documentElement.innerHTML =
        '<body><article><p>c++ c++ c++ c++ c++ c++ c++ c++ c++ c++ c++ short text</p></article></body>';
      const result = detectPageComplexity(document);
      expect(result.technicalFeatures.isTechnical).toBe(true);
      expect(result.hasTechnicalContent).toBe(true);
    });
  });

  describe('Technical term matching baseline (performance refactor guard)', () => {
    test('word-only terms should be counted correctly', () => {
      document.documentElement.innerHTML =
        '<body><p>function class method function async await syntax parameter function</p></body>';
      const result = detectPageComplexity(document);
      // function x3, class x1, method x1, async x1, await x1, syntax x1, parameter x1 = 9
      expect(result.technicalFeatures.technicalTermCount).toBe(9);
    });

    test('special-char term (c++) should be counted correctly', () => {
      document.documentElement.innerHTML =
        '<body><p>learn c++ programming with c++ templates and c++ features</p></body>';
      const result = detectPageComplexity(document);
      expect(result.technicalFeatures.technicalTermCount).toBe(3);
    });

    test('mixed word and special-char terms should sum correctly', () => {
      document.documentElement.innerHTML =
        '<body><p>c++ function class c++ method async c++</p></body>';
      const result = detectPageComplexity(document);
      // c++ x3, function x1, class x1, method x1, async x1 = 7
      expect(result.technicalFeatures.technicalTermCount).toBe(7);
    });

    test('technicalRatio should reflect term density', () => {
      const padding = 'word '.repeat(100);
      document.documentElement.innerHTML = `<body><p>function class method ${padding}</p></body>`;
      const result = detectPageComplexity(document);
      expect(result.technicalFeatures.technicalRatio).toBeGreaterThan(0);
      expect(result.technicalFeatures.technicalRatio).toBeLessThan(0.1);
    });

    test('isTechnical threshold: ratio > 0.02 triggers true', () => {
      // 10 words total, 1 technical term → ratio = 0.1 > 0.02
      document.documentElement.innerHTML =
        '<body><p>function one two three four five six seven eight nine</p></body>';
      const result = detectPageComplexity(document);
      expect(result.technicalFeatures.isTechnical).toBe(true);
    });

    test('isTechnical threshold: count > 10 triggers true', () => {
      const padding = 'word '.repeat(1000);
      const terms =
        'function class method variable constant interface callback async await syntax parameter';
      document.documentElement.innerHTML = `<body><p>${terms} ${padding}</p></body>`;
      const result = detectPageComplexity(document);
      // 11 terms, ratio will be low due to padding, but count > 10
      expect(result.technicalFeatures.technicalTermCount).toBe(11);
      expect(result.technicalFeatures.isTechnical).toBe(true);
    });

    test('extractor selection stability: technical content selects markdown', () => {
      const terms =
        'function class method variable constant interface callback async await syntax parameter argument';
      document.documentElement.innerHTML = `<body><article><h1>API Docs</h1><p>${terms} ${terms}</p></article></body>`;
      const result = detectPageComplexity(document);
      const selection = selectExtractor(result);
      expect(result.hasTechnicalContent).toBe(true);
      expect(selection.extractor).toBe('markdown');
    });

    test('extractor selection stability: non-technical content without clean layout selects readability', () => {
      const padding = 'news article content about politics and economy '.repeat(50);
      document.documentElement.innerHTML = `
        <body>
          <nav>nav1</nav><nav>nav2</nav><nav>nav3</nav>
          <nav>nav4</nav><nav>nav5</nav><nav>nav6</nav>
          <article><p>${padding}</p></article>
        </body>`;
      const result = detectPageComplexity(document);
      const selection = selectExtractor(result);
      expect(result.hasTechnicalContent).toBe(false);
      expect(selection.extractor).toBe('readability');
    });
  });

  describe('Coverage 補強', () => {
    test('detectPageComplexity 應該在例外時回退到安全預設值', () => {
      const badDoc = {
        get body() {
          throw new Error('發生錯誤');
        },
        location: { href: 'https://example.com' },
        title: '測試',
      };

      const result = detectPageComplexity(badDoc);

      expect(result).toEqual(
        expect.objectContaining({
          isClean: false,
          hasMarkdownFeatures: false,
          hasTechnicalContent: false,
          hasAds: true,
          isComplexLayout: true,
        })
      );
    });

    test('Markdown 信心度應該正確加分', () => {
      const complexity = {
        isClean: true,
        hasMarkdownFeatures: true,
        hasTechnicalContent: true,
        hasAds: false,
        isComplexLayout: false,
        hasRichMedia: false,
        isLongForm: false,
        metrics: {
          markdownContainers: 0,
          textLength: 1000,
        },
      };

      const selection = selectExtractor(complexity);

      expect(selection.extractor).toBe('markdown');
      expect(selection.confidence).toBe(100);
    });

    test('Readability 信心度應該正確反映複雜度', () => {
      const complexity = {
        isClean: false,
        hasMarkdownFeatures: false,
        hasTechnicalContent: false,
        hasAds: true,
        isComplexLayout: true,
        hasRichMedia: false,
        isLongForm: false,
        metrics: {
          markdownContainers: 0,
          textLength: 1000,
        },
      };

      const selection = selectExtractor(complexity);

      expect(selection.extractor).toBe('readability');
      expect(selection.confidence).toBe(85);
    });
  });
});

// ==========================================
// Technical Terms Governance Invariants
// ==========================================

describe('Technical Terms Governance', () => {
  describe('duplicate detection', () => {
    test('should have no duplicate terms', () => {
      const terms = TECHNICAL_TERM_RULES.map(rule => rule.term);
      const duplicates = terms.filter((term, index) => terms.indexOf(term) !== index);
      expect(duplicates).toEqual([]);
    });
  });

  describe('group structure invariant', () => {
    test('terms within the same group should be contiguous', () => {
      let lastGroup = null;
      const seenGroups = new Set();

      for (const rule of TECHNICAL_TERM_RULES) {
        if (rule.group !== lastGroup) {
          expect(seenGroups.has(rule.group)).toBe(false);
          seenGroups.add(rule.group);
          lastGroup = rule.group;
        }
      }
    });

    test('all groups in TECHNICAL_TERM_GROUPS should appear in rules', () => {
      const rulesGroups = new Set(TECHNICAL_TERM_RULES.map(rule => rule.group));
      for (const group of TECHNICAL_TERM_GROUPS) {
        expect(rulesGroups.has(group)).toBe(true);
      }
    });

    test('all rule groups should be declared in TECHNICAL_TERM_GROUPS', () => {
      const declaredGroups = new Set(TECHNICAL_TERM_GROUPS);
      for (const rule of TECHNICAL_TERM_RULES) {
        expect(declaredGroups.has(rule.group)).toBe(true);
      }
    });
  });

  describe('type field and matcher alignment', () => {
    test('every rule must have a valid type', () => {
      for (const rule of TECHNICAL_TERM_RULES) {
        expect(['word', 'special-char']).toContain(rule.type);
      }
    });

    test('word-type terms should contain only word characters', () => {
      const wordCharOnly = /^\w+$/;
      const wordRules = TECHNICAL_TERM_RULES.filter(rule => rule.type === 'word');
      for (const rule of wordRules) {
        expect(wordCharOnly.test(rule.term)).toBe(true);
      }
    });

    test('special-char terms should contain at least one non-word character', () => {
      const wordCharOnly = /^\w+$/;
      const specialRules = TECHNICAL_TERM_RULES.filter(rule => rule.type === 'special-char');
      for (const rule of specialRules) {
        expect(wordCharOnly.test(rule.term)).toBe(false);
      }
    });
  });

  describe('special-char boundary contract', () => {
    test('c++ should match with non-word boundary, not word boundary', () => {
      const cppRule = TECHNICAL_TERM_RULES.find(rule => rule.term === 'c++');
      expect(cppRule).toBeDefined();
      expect(cppRule.type).toBe('special-char');

      const escaped = cppRule.term.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
      const regex = new RegExp(`(?<![A-Za-z0-9_])(?:${escaped})(?![A-Za-z0-9_])`, 'gi');

      expect('learn c++ today').toMatch(regex);
      expect('c++ programming').toMatch(regex);
      expect('abc++def').not.toMatch(regex);
    });
  });

  describe('caseSensitive field contract', () => {
    test('caseSensitive rules should have word type', () => {
      const csRules = TECHNICAL_TERM_RULES.filter(rule => rule.caseSensitive);
      for (const rule of csRules) {
        expect(rule.type).toBe('word');
      }
    });

    test('Go term should be case-sensitive and match only capitalized form', () => {
      const goRule = TECHNICAL_TERM_RULES.find(rule => rule.term === 'Go');
      expect(goRule).toBeDefined();
      expect(goRule.caseSensitive).toBe(true);

      const escaped = goRule.term.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
      const regex = new RegExp(String.raw`\b(?:${escaped})\b`, 'g');

      expect('Go programming').toMatch(regex);
      expect('written in Go').toMatch(regex);
      expect('let us go home').not.toMatch(regex);
      expect('go ahead').not.toMatch(regex);
    });
  });
});
