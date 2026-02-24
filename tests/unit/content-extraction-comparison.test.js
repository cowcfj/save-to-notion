/**
 * 內容提取方案對比測試
 * 測試 Readability vs Defuddle 在不同類型網站上的表現
 */

const { JSDOM } = require('jsdom');

// 動態引入模組以避免 ES Module 問題
const Readability = require('../../lib/Readability.js');

// 動態引入模組以避免 ES Module 問題
let Defuddle = null;
let TurndownService = null;
let gfm = null;

beforeAll(async () => {
  // 引入 Defuddle（可能需要動態引入）
  try {
    const defuddleModule = await import('defuddle/full');
    Defuddle = defuddleModule.default || defuddleModule.Defuddle;
  } catch (error) {
    console.warn('⚠️ Defuddle 引入失敗，將跳過相關測試:', error.message);
  }

  // 引入 Turndown
  try {
    TurndownService = require('turndown');
    const gfmPlugin = require('turndown-plugin-gfm');
    gfm = gfmPlugin.gfm;
  } catch (error) {
    console.warn('⚠️ Turndown 引入失敗:', error.message);
  }
});

describe('內容提取方案對比測試', () => {
  /**
   * 測試用例 1：簡單的 Markdown 文件頁面
   */
  describe('測試案例 1：Markdown 文件頁面', () => {
    let dom = null;
    let document = null;

    beforeEach(() => {
      // 模擬一個典型的 Markdown 文件站頁面
      const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>API Documentation - Getting Started</title>
                    <meta property="og:title" content="API Documentation">
                </head>
                <body>
                    <nav class="sidebar">
                        <ul>
                            <li><a href="/docs">Home</a></li>
                            <li><a href="/docs/api">API</a></li>
                        </ul>
                    </nav>
                    <main class="content">
                        <article>
                            <h1>Getting Started</h1>
                            <p>Welcome to our API documentation. This guide will help you get started quickly.</p>

                            <h2>Installation</h2>
                            <p>Install the package using npm:</p>
                            <pre><code class="language-bash">npm install awesome-package</code></pre>

                            <h2>Quick Start</h2>
                            <p>Here's a simple example:</p>
                            <pre><code class="language-javascript">
const awesome = require('awesome-package');
awesome.init();
                            </code></pre>

                            <h2>Configuration Options</h2>
                            <ul>
                                <li><code>apiKey</code>: Your API key</li>
                                <li><code>timeout</code>: Request timeout in ms</li>
                                <li><code>retries</code>: Number of retry attempts</li>
                                <li><code>debug</code>: Enable debug mode</li>
                            </ul>

                            <h2>Next Steps</h2>
                            <p>Check out the <a href="/docs/advanced">advanced guide</a> for more information.</p>
                        </article>
                    </main>
                    <footer>
                        <p>&copy; 2025 Documentation Site</p>
                    </footer>
                </body>
                </html>
            `;

      dom = new JSDOM(html, { url: 'https://docs.example.com/getting-started' });
      document = dom.window.document;
    });

    test('Readability 提取結果', () => {
      const article = new Readability(document.cloneNode(true)).parse();

      expect(article).toBeTruthy();
      expect(article.title).toBeTruthy();
      expect(article.content).toBeTruthy();

      // 檢查是否保留了代碼塊
      const hasCodeBlocks = article.content.includes('<pre>') || article.content.includes('<code>');

      // 檢查是否保留了列表
      const hasLists = article.content.includes('<ul>') || article.content.includes('<li>');

      // 輸出結果摘要
      const summary = {
        標題: article.title,
        內容長度: article.content.length,
        文字長度: article.textContent.length,
        保留代碼塊: hasCodeBlocks,
        保留列表: hasLists,
      };

      // 儲存到全域以便後續比較
      globalThis.readabilityResult = summary;
    });

    test('Defuddle 提取結果', () => {
      if (!Defuddle) {
        console.log('⚠️ Defuddle 不可用，跳過測試');
        return;
      }

      const defuddled = new Defuddle(document.cloneNode(true)).parse();

      expect(defuddled).toBeTruthy();

      console.log('\n🔍 Defuddle 結果:');
      console.log('標題:', defuddled.title);
      console.log('作者:', defuddled.author);
      console.log('發布日期:', defuddled.published);
      console.log('內容長度:', defuddled.content?.length || 0);
      console.log('字數:', defuddled.wordCount);
      console.log('解析時間:', defuddled.parseTime, 'ms');

      // 檢查內容品質
      if (defuddled.content) {
        const hasCodeBlocks =
          defuddled.content.includes('<pre>') || defuddled.content.includes('<code>');
        const hasLists = defuddled.content.includes('<ul>') || defuddled.content.includes('<li>');
        console.log('保留代碼塊:', hasCodeBlocks ? '✓' : '✗');
        console.log('保留列表:', hasLists ? '✓' : '✗');
      }
    });

    test('Turndown 轉換測試', () => {
      if (!TurndownService) {
        console.log('⚠️ Turndown 不可用，跳過測試');
        return;
      }

      // 使用 Readability 提取內容
      const article = new Readability(document.cloneNode(true)).parse();

      // 設定 Turndown
      const turndown = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        bulletListMarker: '-',
      });

      if (gfm) {
        turndown.use(gfm);
      }

      const markdown = turndown.turndown(article.content);

      console.log('\n📝 Turndown Markdown 結果:');
      console.log('Markdown 長度:', markdown.length);
      console.log('預覽 (前 200 字):\n', markdown.slice(0, 200));

      expect(markdown).toBeTruthy();
      expect(markdown.length).toBeGreaterThan(0);
    });
  });

  /**
   * 測試用例 2：複雜的新聞網站頁面
   */
  describe('測試案例 2：新聞網站頁面', () => {
    let dom = null;
    let document = null;

    beforeEach(() => {
      const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Breaking News: Important Event - News Site</title>
                </head>
                <body>
                    <header>
                        <div class="ad-banner">廣告內容</div>
                        <nav>導航選單</nav>
                    </header>
                    <aside class="sidebar">
                        <div class="ad">側邊廣告</div>
                        <div class="related-news">相關新聞</div>
                    </aside>
                    <main>
                        <article>
                            <h1>Breaking News: Important Event</h1>
                            <p class="byline">By John Doe | Published: 2025-10-13</p>
                            <img src="https://example.com/news-image.jpg" alt="News Image">
                            <p>This is the main article content with important information about the event.</p>
                            <p>The event took place yesterday and has significant implications for the industry.</p>
                            <p>Experts believe that this will lead to major changes in the coming months.</p>
                            <div class="ad-inline">內嵌廣告</div>
                            <p>More detailed analysis and quotes from industry leaders continue below.</p>
                        </article>
                    </main>
                    <footer>
                        <div class="footer-links">
                            <a href="/about">About</a>
                            <a href="/contact">Contact</a>
                        </div>
                    </footer>
                </body>
                </html>
            `;

      dom = new JSDOM(html, { url: 'https://news.example.com/breaking-news' });
      document = dom.window.document;
    });

    test('Readability 在新聞網站的表現', () => {
      const article = new Readability(document.cloneNode(true)).parse();

      expect(article).toBeTruthy();

      console.log('\n📰 Readability (新聞站):');
      console.log('標題:', article.title);
      console.log('內容長度:', article.content.length);

      // 檢查是否成功移除廣告
      const hasAds = article.content.toLowerCase().includes('廣告');
      console.log('成功移除廣告:', hasAds ? '✗' : '✓');
    });

    test('Defuddle 在新聞網站的表現', () => {
      if (!Defuddle) {
        console.log('⚠️ Defuddle 不可用，跳過測試');
        return;
      }

      const defuddled = new Defuddle(document.cloneNode(true)).parse();
      expect(defuddled).toBeTruthy();

      console.log('\n📰 Defuddle (新聞站):');
      console.log('標題:', defuddled.title);
      console.log('內容長度:', defuddled.content?.length || 0);
      console.log('解析時間:', defuddled.parseTime, 'ms');

      if (defuddled.content) {
        const hasAds = defuddled.content.toLowerCase().includes('廣告');
        console.log('成功移除廣告:', hasAds ? '✗' : '✓');
      }
    });
  });

  /**
   * 效能對比測試
   */
  describe('效能對比', () => {
    test('Readability vs Defuddle 速度對比', () => {
      const simpleHtml = `
                <html><body>
                    <article>
                        <h1>Test Article</h1>
                        <p>This is a test article with some content.</p>
                    </article>
                </body></html>
            `;

      const dom = new JSDOM(simpleHtml);
      const document = dom.window.document;

      // 測試 Readability
      const readabilityStart = Date.now();
      const article = new Readability(document.cloneNode(true)).parse();
      expect(article).toBeTruthy();
      const readabilityTime = Date.now() - readabilityStart;

      console.log('\n⚡ 效能對比:');
      console.log('Readability:', readabilityTime, 'ms');

      // 測試 Defuddle
      if (Defuddle) {
        const defuddleStart = Date.now();
        const defuddled = new Defuddle(document.cloneNode(true)).parse();
        expect(defuddled).toBeTruthy();
        const defuddleTime = Date.now() - defuddleStart;

        console.log('Defuddle:', defuddleTime, 'ms');
        console.log('速度差異:', Math.abs(readabilityTime - defuddleTime), 'ms');
      }
    });
  });
});
