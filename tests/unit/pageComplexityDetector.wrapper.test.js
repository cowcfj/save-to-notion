const { JSDOM } = require('jsdom');
const {
  detectPageComplexity,
  selectExtractor,
  getAnalysisReport,
  logAnalysis,
} = require('../helpers/pageComplexityDetector.testable');

describe('PageComplexityDetector - Testable Wrapper', () => {
  /** @type {JSDOM} JSDOM 實例,在 beforeEach 中初始化 */
  let dom = null;
  /** @type {Document} 文檔對象,在 beforeEach 中初始化 */
  let document = null;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    document = dom.window.document;
  });

  test('技術文檔頁面 → prefer extractus', () => {
    document.body.innerHTML = `
      <main>
        <pre><code class="language-js">console.log(1)</code></pre>
        <ul><li>a</li><li>b</li><li>c</li></ul>
        <ul><li>d</li><li>e</li><li>f</li></ul>
      </main>`;
    const complexity = detectPageComplexity(document, 'https://docs.example.com/guide/intro');
    const sel = selectExtractor(complexity);
    expect(sel.extractor).toBe('extractus');
    expect(sel.confidence).toBeGreaterThanOrEqual(70);
  });

  test('新聞/複雜頁面 → require readability', () => {
    document.body.innerHTML = `
      <header></header><nav></nav><aside class="sidebar"></aside>
      <footer></footer><div class="navigation"></div><nav></nav>
      <div class="ad"></div><div id="ad_banner"></div>
      <div class="advertisement"></div><div class="sponsor"></div>
      <article><p>${'content '.repeat(200)}</p></article>
      ${'<img src="x">'.repeat(12)}
    `;
    const complexity = detectPageComplexity(document, 'https://news.example.com/article/123');
    const sel = selectExtractor(complexity);
    expect(sel.extractor).toBe('readability');
    expect(sel.confidence).toBeGreaterThanOrEqual(60);
  });

  test('分析報告包含推薦與指標', () => {
    document.body.textContent = 'install npm command option api method function class';
    const complexity = detectPageComplexity(document, 'https://developer.example.com/docs/api');
    const sel = selectExtractor(complexity);
    const report = getAnalysisReport(complexity, sel, 'https://developer.example.com/docs/api');
    expect(report.url).toContain('developer.example.com');
    expect(report.selection.extractor).toMatch(/extractus|readability/);
    expect(Array.isArray(report.recommendations)).toBe(true);
  });

  test('logAnalysis 輸出到 console 與 analytics', () => {
    const spy = jest.fn();
    global.console = { log: spy };
    const complexity = detectPageComplexity(document);
    const sel = selectExtractor(complexity);
    logAnalysis(
      complexity,
      sel,
      { success: true, contentLength: 1000, processingTime: 200, fallbackUsed: false },
      {
        url: 'https://example.com',
        analytics: { track: spy },
      }
    );
    expect(spy).toHaveBeenCalled();
  });
});
