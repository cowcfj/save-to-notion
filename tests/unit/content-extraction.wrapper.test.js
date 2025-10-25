const { JSDOM } = require('jsdom');
const { isContentGood, findContentCmsFallback, MIN_CONTENT_LENGTH } = require('../helpers/content-extraction.testable');

describe('Content Extraction - Testable Wrapper', () => {
  let dom, window, document;

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    window = dom.window;
    document = window.document;
    // 使用 Jest 的 jsdom 環境提供的全域 document，無需覆蓋/刪除
    global.window = window;
    global.document = document;
  });

  afterEach(() => {
    // 清理 DOM 內容，但保留 jsdom 的全域 document
    if (document?.body) {
      document.body.innerHTML = '';
    }
  });

  test('isContentGood: 拒絕過短內容與高連結密度', () => {
    const short = { content: '<p>short</p>', length: 10 };
    expect(isContentGood(short)).toBe(false);

    const longLinkText = 'linktext-'.repeat(40); // ~400字元
    const longWithLinks = {
      content: `<p>${'text '.repeat(10)} <a href="#">${longLinkText}</a> <a href="#">${longLinkText}</a></p>`,
      // 人為設定文章長度，模擬 Readability 的 length 欄位
      length: MIN_CONTENT_LENGTH + 1 // 251
    };
    // 連結文字長度 ~800，相對長度 800/251 > 0.3 → 應拒絕
    expect(isContentGood(longWithLinks)).toBe(false);
  });

  test('isContentGood: 接受合格內容', () => {
    const good = {
      content: `<p>${'content '.repeat(MIN_CONTENT_LENGTH / 3)}</p>`,
      length: MIN_CONTENT_LENGTH + 300
    };
    expect(isContentGood(good)).toBe(true);
  });

  test('findContentCmsFallback: Drupal 結構', () => {
    document.body.innerHTML = `
      <div class="node__content">
        <div class="field--name-field-image"><img src="x"></div>
        <div class="field--name-field-body">${'text '.repeat(MIN_CONTENT_LENGTH / 4)}</div>
      </div>`;
    const html = findContentCmsFallback(document);
    expect(html).toMatch(/img/);
    expect(html).toMatch(/text/);
  });

  test('findContentCmsFallback: WordPress 選擇器', () => {
    document.body.innerHTML = `
      <div class="entry-content">${'paragraph '.repeat(MIN_CONTENT_LENGTH / 3)}</div>`;
    const html = findContentCmsFallback(document);
    expect(html).toContain('paragraph');
  });

  test('findContentCmsFallback: Article 結構', () => {
    document.body.innerHTML = `
      <article role="main">${'lorem '.repeat(MIN_CONTENT_LENGTH / 3)}</article>`;
    const html = findContentCmsFallback(document);
    expect(html).toContain('lorem');
  });

  test('findContentCmsFallback: 通用最大內容塊', () => {
    document.body.innerHTML = `
      <main>
        <section><p>${'x '.repeat(MIN_CONTENT_LENGTH / 4)}</p><img src="a"></section>
        <div id="small">small</div>
        <div id="candidate"><p>${'y '.repeat(MIN_CONTENT_LENGTH / 3)}</p>${'<img src="i">'.repeat(2)}</div>
      </main>`;
    const html = findContentCmsFallback(document);
    expect(html).toMatch(/y/);
  });
});
