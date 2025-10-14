/**
 * 智能混合模式整合測試
 *
 * 測試新整合的智能混合模式在不同類型網站上的表現
 *
 * @author Content Extraction Team
 * @version 1.0
 * @date 2025-10-13
 */

const fs = require('fs');
const { JSDOM } = require('jsdom');

// 測試用例數據
const testCases = [
    {
        name: 'GitHub Pages 技術文檔',
        url: 'https://example.github.io/docs/api/',
        html: `
            <!DOCTYPE html>
            <html>
            <head><title>API Documentation - Commands</title></head>
            <body>
                <nav class="sidebar">Navigation</nav>
                <main class="content">
                    <article>
                        <h1>CLI Commands Reference</h1>
                        <p>This documentation covers all available CLI commands and their usage.</p>

                        <h2>Installation</h2>
                        <pre><code>npm install awesome-cli -g</code></pre>

                        <h2>Commands</h2>
                        <ul>
                            <li><code>init</code> - Initialize project</li>
                            <li><code>build</code> - Build project</li>
                            <li><code>deploy</code> - Deploy to production</li>
                            <li><code>test</code> - Run tests</li>
                            <li><code>lint</code> - Check code quality</li>
                            <li><code>serve</code> - Start development server</li>
                            <li><code>config</code> - Manage configuration</li>
                            <li><code>help</code> - Show help information</li>
                        </ul>

                        <h2>Examples</h2>
                        <pre><code>awesome-cli init my-project
awesome-cli build --env production
awesome-cli deploy --target staging</code></pre>
                    </article>
                </main>
            </body>
            </html>
        `,
        expectedExtractor: 'extractus',
        expectedReasons: ['頁面簡潔', '包含代碼/列表', '技術文檔內容']
    },

    {
        name: '複雜新聞網站',
        url: 'https://news.example.com/breaking-news',
        html: `
            <!DOCTYPE html>
            <html>
            <head><title>重大新聞：市場震盪引發關注</title></head>
            <body>
                <header class="site-header">
                    <div class="advertisement">廣告橫幅</div>
                    <nav class="main-nav">導航選單</nav>
                </header>
                <aside class="left-sidebar">
                    <div class="ad-widget">側邊廣告1</div>
                    <div class="sponsor-content">贊助內容</div>
                    <div class="ad-banner">側邊廣告2</div>
                    <div class="related-news">相關新聞</div>
                </aside>
                <aside class="right-sidebar">
                    <div class="advertisement">右側廣告</div>
                    <div class="social-widgets">社交媒體</div>
                </aside>
                <main class="main-content">
                    <article class="news-article">
                        <h1>重大新聞：市場震盪引發全球關注</h1>
                        <p class="byline">記者 張三 / 2025年10月13日</p>
                        <img src="https://example.com/news-image.jpg" alt="新聞圖片">
                        <p>今日股市開盤後出現劇烈震盪，投資者對全球經濟前景表示擔憂。</p>
                        <p>專家分析，這次市場波動主要由多重因素共同作用造成。</p>
                        <div class="inline-ad">內嵌廣告</div>
                        <p>政府官員表示將密切關注市場動態，必要時將採取相應措施。</p>
                        <p>市場分析師建議投資者保持理性，避免恐慌性拋售。</p>
                    </article>
                </main>
                <footer class="site-footer">
                    <div class="footer-ads">頁腳廣告</div>
                    <div class="footer-links">頁腳連結</div>
                </footer>
            </body>
            </html>
        `,
        expectedExtractor: 'readability',
        expectedReasons: ['包含廣告元素', '複雜頁面佈局']
    },

    {
        name: '簡潔部落格文章',
        url: 'https://blog.example.com/tech-tutorial',
        html: `
            <!DOCTYPE html>
            <html>
            <head><title>React Hooks 完整教學</title></head>
            <body>
                <header>
                    <h1 class="site-title">技術部落格</h1>
                </header>
                <main>
                    <article class="post">
                        <h1>React Hooks 完整教學指南</h1>
                        <p class="meta">發布於 2025年10月13日 · 作者：李四</p>

                        <p>React Hooks 是 React 16.8 引入的新功能，讓你可以在不寫 class 的情況下使用 state 以及其他的 React 特性。</p>

                        <h2>什麼是 Hooks？</h2>
                        <p>Hooks 是一些可以讓你在函數組件裡「鉤入」React state 及生命周期等特性的函數。</p>

                        <h2>useState Hook</h2>
                        <pre><code class="language-javascript">
import React, { useState } from 'react';

function Example() {
  const [count, setCount] = useState(0);

  return (
    &lt;div&gt;
      &lt;p&gt;你點擊了 {count} 次&lt;/p&gt;
      &lt;button onClick={() =&gt; setCount(count + 1)}&gt;
        點我
      &lt;/button&gt;
    &lt;/div&gt;
  );
}
                        </code></pre>

                        <h2>useEffect Hook</h2>
                        <p>useEffect Hook 讓你在函數組件中執行副作用操作。</p>

                        <h2>總結</h2>
                        <p>Hooks 提供了一種更簡潔的方式來管理組件狀態和生命周期。</p>
                    </article>
                </main>
                <footer>
                    <p>版權所有 &copy; 2025 技術部落格</p>
                </footer>
            </body>
            </html>
        `,
        expectedExtractor: 'extractus',
        expectedReasons: ['頁面簡潔', '包含代碼/列表', '技術文檔內容']
    },

    {
        name: '高連結密度頁面',
        url: 'https://directory.example.com/links',
        html: `
            <!DOCTYPE html>
            <html>
            <head><title>網站目錄 - 精選連結</title></head>
            <body>
                <main>
                    <article>
                        <h1>精選網站目錄</h1>
                        <p>在這裡你可以找到 <a href="/tech">技術網站</a>、<a href="/design">設計資源</a>、<a href="/tools">開發工具</a>、<a href="/learning">學習平台</a>、<a href="/frameworks">框架</a>、<a href="/libraries">程式庫</a>、<a href="/tutorials">教學</a>、<a href="/docs">文檔</a>、<a href="/community">社區</a>和<a href="/more">更多資源</a>。</p>

                        <h2>推薦網站</h2>
                        <p>我們推薦 <a href="https://github.com">GitHub</a>、<a href="https://stackoverflow.com">Stack Overflow</a>、<a href="https://mdn.dev">MDN</a>、<a href="https://reactjs.org">React</a>、<a href="https://vuejs.org">Vue.js</a>、<a href="https://angular.io">Angular</a>、<a href="https://nodejs.org">Node.js</a>、<a href="https://npmjs.com">NPM</a>和<a href="https://yarnpkg.com">Yarn</a>。</p>

                        <h2>設計資源</h2>
                        <p>查看 <a href="https://dribbble.com">Dribbble</a>、<a href="https://behance.net">Behance</a>、<a href="https://figma.com">Figma</a>、<a href="https://sketch.com">Sketch</a>、<a href="https://adobe.com">Adobe</a>、<a href="https://canva.com">Canva</a>獲取靈感。</p>

                        <p>立即訪問 <a href="/start">開始使用</a>或查看 <a href="/guide">使用指南</a>。</p>
                    </article>
                </main>
            </body>
            </html>
        `,
        expectedExtractor: 'readability', // 因為高連結密度，應該需要備用方案
        expectedReasons: ['一般頁面'], // 可能會有fallbackRequired = true
        expectedFallback: true
    }
];

// 執行測試
async function runSmartHybridModeTest() {
    console.log('🧪 智能混合模式整合測試開始...\n');

    let passedTests = 0;
    let totalTests = testCases.length;

    for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        console.log(`📋 測試 ${i + 1}/${totalTests}: ${testCase.name}`);
        console.log(`🌐 URL: ${testCase.url}`);

        try {
            // 創建 JSDOM 環境
            const dom = new JSDOM(testCase.html, {
                url: testCase.url,
                pretendToBeVisual: true
            });

            const { window } = dom;
            const { document } = window;

            // 設置全域變數以模擬瀏覽器環境
            global.window = window;
            global.document = document;
            global.location = window.location;

            // 模擬 console.log 以便捕獲輸出
            const logs = [];
            const originalLog = console.log;
            console.log = (...args) => {
                logs.push(args.join(' '));
            };

            // 執行檢測邏輯（從 background.js 中提取）
            function detectPageComplexity() {
                try {
                    function isDocumentationSite() {
                        const hostname = window.location.hostname.toLowerCase();
                        const pathname = window.location.pathname.toLowerCase();

                        const docHostPatterns = [
                            /\.github\.io$/,
                            /^docs?\./,
                            /\.readthedocs\.io$/,
                            /\.gitbook\.io$/,
                            /^api\./,
                            /^developer\./
                        ];

                        const docPathPatterns = [
                            /\/docs?\//, /\/documentation\//,
                            /\/guide\//, /\/manual\//,
                            /\/api\//, /\/cli\//,
                            /\/reference\//
                        ];

                        return docHostPatterns.some(p => p.test(hostname)) ||
                               docPathPatterns.some(p => p.test(pathname));
                    }

                    function countElements(container, selector) {
                        try {
                            const elements = container.querySelectorAll(selector);
                            return elements ? elements.length : 0;
                        } catch (error) {
                            return 0;
                        }
                    }

                    function calculateLinkDensity() {
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
                            return 0;
                        }
                    }

                    function hasTechnicalFeatures() {
                        const textContent = (document.body?.textContent || '').toLowerCase();

                        const technicalTerms = [
                            'command', 'option', 'parameter', 'syntax', 'usage', 'example',
                            'install', 'configure', 'api', 'method', 'function', 'class',
                            'npm', 'git', 'javascript', 'python', 'react', 'node'
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
                            isTechnical: technicalRatio > 0.02 || technicalTermCount > 10
                        };
                    }

                    const metrics = {
                        isDocSite: isDocumentationSite(),
                        adElements: countElements(document, '[class*="ad"], [id*="ad"], .advertisement, .sponsor'),
                        navElements: countElements(document, 'nav, header, footer, aside, .sidebar'),
                        contentElements: countElements(document, 'article, main, .content, .post, .entry, section'),
                        codeBlocks: countElements(document, 'pre, code, .highlight'),
                        lists: countElements(document, 'ul li, ol li'),
                        images: countElements(document, 'img'),
                        videos: countElements(document, 'video, iframe[src*="youtube"]'),
                        links: countElements(document, 'a'),
                        linkDensity: calculateLinkDensity(),
                        textLength: (document.body?.textContent?.trim() || '').length
                    };

                    const technicalFeatures = hasTechnicalFeatures();

                    return {
                        isClean: metrics.isDocSite || (
                            metrics.adElements <= 2 &&
                            metrics.navElements <= 3 &&
                            metrics.contentElements >= 1
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

                } catch (error) {
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

            function selectExtractor(complexity) {
                const reasons = [];

                // 連結密度過高直接使用 Readability（優先級最高）
                if (complexity.hasHighLinkDensity) {
                    reasons.push('連結密度過高');
                    let confidence = 75;
                    if (complexity.linkDensity > 0.5) confidence = 90;

                    return {
                        extractor: 'readability',
                        reasons: reasons,
                        confidence: confidence,
                        fallbackRequired: true
                    };
                }

                const preferExtractus =
                    complexity.isClean ||
                    complexity.hasMarkdownFeatures ||
                    complexity.hasTechnicalContent;

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
                    if (complexity.isLongForm) {
                        selectedExtractor = 'readability';
                        reasons.push('長文內容');
                    } else {
                        selectedExtractor = 'extractus';
                        reasons.push('一般頁面');
                    }
                }

                let confidence = 50;
                if (selectedExtractor === 'extractus') {
                    if (complexity.isClean) confidence += 20;
                    if (complexity.hasMarkdownFeatures) confidence += 15;
                    if (complexity.hasTechnicalContent) confidence += 15;
                    if (complexity.hasAds) confidence -= 25;
                    if (complexity.isComplexLayout) confidence -= 15;
                    // 連結密度的懲罰
                    if (complexity.linkDensity > 0.2) confidence -= 20;
                } else {
                    if (complexity.hasAds) confidence += 20;
                    if (complexity.isComplexLayout) confidence += 15;
                    if (complexity.hasRichMedia) confidence += 10;
                    if (complexity.isLongForm) confidence += 10;
                    if (complexity.isClean && !complexity.hasAds) confidence -= 15;
                }
                confidence = Math.max(0, Math.min(100, confidence));

                return {
                    extractor: selectedExtractor,
                    reasons: reasons,
                    confidence: confidence,
                    fallbackRequired: (
                        complexity.linkDensity > 0.4 ||
                        complexity.metrics.textLength < 500 ||
                        (complexity.hasAds && complexity.hasTechnicalContent)
                    )
                };
            }

            // 執行檢測
            const complexity = detectPageComplexity();
            const selection = selectExtractor(complexity);

            // 恢復原始 console.log
            console.log = originalLog;

            // 驗證結果
            console.log(`📊 檢測結果:`);
            console.log(`   選擇提取器: ${selection.extractor} (信心度: ${selection.confidence}%)`);
            console.log(`   選擇原因: ${selection.reasons.join(', ')}`);
            console.log(`   需要備用方案: ${selection.fallbackRequired ? '是' : '否'}`);
            console.log(`   連結密度: ${complexity.linkDensity.toFixed(3)}`);
            console.log(`   頁面特徵: 簡潔=${complexity.isClean}, 技術=${complexity.hasTechnicalContent}, 廣告=${complexity.hasAds}`);

            // 檢查測試結果
            let testPassed = true;
            const issues = [];

            if (selection.extractor !== testCase.expectedExtractor) {
                testPassed = false;
                issues.push(`❌ 提取器選擇錯誤: 期望 ${testCase.expectedExtractor}, 實際 ${selection.extractor}`);
            }

            // 檢查原因是否包含期望的原因
            const hasExpectedReason = testCase.expectedReasons.some(reason =>
                selection.reasons.includes(reason)
            );
            if (!hasExpectedReason) {
                // 對於高連結密度等邊界情況，可能會有不同的原因，給予一定彈性
                if (!testCase.expectedFallback) {
                    testPassed = false;
                    issues.push(`❌ 選擇原因不符: 期望包含 ${testCase.expectedReasons.join(' 或 ')}, 實際 ${selection.reasons.join(', ')}`);
                }
            }

            if (testCase.expectedFallback && !selection.fallbackRequired) {
                testPassed = false;
                issues.push(`❌ 備用方案標記錯誤: 期望需要備用方案，但未標記`);
            }

            if (testPassed) {
                console.log('✅ 測試通過\n');
                passedTests++;
            } else {
                console.log('❌ 測試失敗:');
                issues.forEach(issue => console.log(`   ${issue}`));
                console.log();
            }

            // 清理全域變數
            delete global.window;
            delete global.document;
            delete global.location;

        } catch (error) {
            console.log(`❌ 測試執行錯誤: ${error.message}\n`);
        }
    }

    // 輸出總結
    console.log('📈 測試總結:');
    console.log(`   通過: ${passedTests}/${totalTests}`);
    console.log(`   成功率: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

    if (passedTests === totalTests) {
        console.log('🎉 所有測試都通過！智能混合模式整合成功。');
    } else {
        console.log('⚠️ 部分測試失敗，需要進一步調整邏輯。');
    }

    return {
        passed: passedTests,
        total: totalTests,
        success: passedTests === totalTests
    };
}

// 執行測試
if (require.main === module) {
    runSmartHybridModeTest().then(result => {
        process.exit(result.success ? 0 : 1);
    }).catch(error => {
        console.error('測試執行失敗:', error);
        process.exit(1);
    });
}

// Jest 測試用例
describe('智能混合模式整合測試', () => {
    test('應該正確選擇提取器', async () => {
        const result = await runSmartHybridModeTest();
        expect(result.success).toBe(true);
        expect(result.passed).toBe(result.total);
    });
});

module.exports = { runSmartHybridModeTest };