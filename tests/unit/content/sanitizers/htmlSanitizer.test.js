/**
 * @jest-environment jsdom
 */

import {
  sanitizeArticleHtml,
  sanitizeAiOutputHtml,
  sanitizeHtmlToText,
  ARTICLE_HTML_ALLOWED_TAGS,
  ARTICLE_HTML_ALLOWED_ATTR,
  AI_OUTPUT_ALLOWED_TAGS,
  AI_OUTPUT_ALLOWED_ATTR,
} from '../../../../scripts/content/sanitizers/htmlSanitizer.js';

describe('htmlSanitizer', () => {
  describe('ARTICLE_HTML_ALLOWED_TAGS & ARTICLE_HTML_ALLOWED_ATTR', () => {
    test('應定義符合規劃的允許標籤與屬性清單', () => {
      expect(ARTICLE_HTML_ALLOWED_TAGS).toContain('article');
      expect(ARTICLE_HTML_ALLOWED_TAGS).toContain('div');
      expect(ARTICLE_HTML_ALLOWED_TAGS).toContain('kbd');
      expect(ARTICLE_HTML_ALLOWED_TAGS).toContain('ins');
      expect(ARTICLE_HTML_ALLOWED_TAGS).toContain('tt');
      expect(ARTICLE_HTML_ALLOWED_TAGS).toContain('strike');

      expect(ARTICLE_HTML_ALLOWED_ATTR).toContain('href');
      expect(ARTICLE_HTML_ALLOWED_ATTR).toContain('src');
      expect(ARTICLE_HTML_ALLOWED_ATTR).toContain('alt');
      expect(ARTICLE_HTML_ALLOWED_ATTR).toContain('title');

      // 確保不包含危險屬性與 class/style 等
      expect(ARTICLE_HTML_ALLOWED_ATTR).not.toContain('style');
      expect(ARTICLE_HTML_ALLOWED_ATTR).not.toContain('class');
      expect(ARTICLE_HTML_ALLOWED_ATTR).not.toContain('language');
    });

    test('應正確定義 AI 輸出的允許標籤與屬性清單', () => {
      expect(AI_OUTPUT_ALLOWED_TAGS).toContain('p');
      expect(AI_OUTPUT_ALLOWED_TAGS).toContain('a');
      expect(AI_OUTPUT_ALLOWED_TAGS).not.toContain('img');
      expect(AI_OUTPUT_ALLOWED_TAGS).not.toContain('div');

      expect(AI_OUTPUT_ALLOWED_ATTR).toContain('href');
      expect(AI_OUTPUT_ALLOWED_ATTR).not.toContain('src');
    });
  });

  describe('sanitizeArticleHtml', () => {
    test('應移除 script 標籤與 inline event handlers', () => {
      const input = '<div><script>alert(1)</script><p onclick="alert(2)">Hello</p></div>';
      const output = sanitizeArticleHtml(input);
      expect(output).not.toContain('<script>');
      expect(output).not.toContain('onclick');
      expect(output).toBe('<div><p>Hello</p></div>');
    });

    test('應移除 javascript: 與 data:text/html URLs', () => {
      const input =
        '<p><a href="javascript:alert(1)">Link 1</a> <a href="data:text/html,<html>">Link 2</a> <a href="https://google.com">Link 3</a></p>';
      const output = sanitizeArticleHtml(input);
      expect(output).not.toContain('href="javascript:');
      expect(output).not.toContain('href="data:');
      expect(output).toContain('href="https://google.com"');
    });

    test('應移除 img src 中不安全的 data URI', () => {
      const input = '<p><img src="data:text/html,<html>" alt="bad"></p>';
      const output = sanitizeArticleHtml(input);
      expect(output).toBe('<p><img alt="bad"></p>');
    });

    test('應保留安全 data URI、http、https 與相對 URL', () => {
      const input =
        '<p><img src="data:image/png;base64,abc" alt="image"><a href="/docs">Relative</a><a href="https://example.com">HTTPS</a><a href="http://example.com">HTTP</a></p>';
      const output = sanitizeArticleHtml(input);
      expect(output).toContain('src="data:image/png;base64,abc"');
      expect(output).toContain('href="/docs"');
      expect(output).toContain('href="https://example.com"');
      expect(output).toContain('href="http://example.com"');
    });

    test('non-string attribute values at the hook boundary should not throw', () => {
      const originalGetAttribute = Element.prototype.getAttribute;
      const nonStringValue = { value: 'data:text/html,<html>' };
      const getAttributeSpy = jest
        .spyOn(Element.prototype, 'getAttribute')
        .mockImplementation(function getAttribute(attributeName) {
          if (attributeName === 'src') {
            return nonStringValue;
          }
          return originalGetAttribute.call(this, attributeName);
        });

      try {
        expect(() =>
          sanitizeArticleHtml('<p><img src="data:text/html,<html>" alt="bad"></p>')
        ).not.toThrow();
      } finally {
        getAttributeSpy.mockRestore();
      }
    });

    test('應保留支援的結構與格式化標籤', () => {
      const input =
        '<article><h1>Title</h1><p>Paragraph with <strong>strong</strong>, <em>em</em>, <kbd>kbd</kbd>, <ins>ins</ins>, <tt>tt</tt> and <strike>strike</strike></p></article>';
      const output = sanitizeArticleHtml(input);
      expect(output).toContain('<article>');
      expect(output).toContain('<h1>Title</h1>');
      expect(output).toContain('<strong>strong</strong>');
      expect(output).toContain('<kbd>kbd</kbd>');
      expect(output).toContain('<ins>ins</ins>');
      expect(output).toContain('<tt>tt</tt>');
      expect(output).toContain('<strike>strike</strike>');
    });

    test('應移除 class, language, lang, data-language, data-lang 等程式碼語言標記屬性', () => {
      const input =
        '<pre><code class="language-javascript" data-language="js" lang="zh">console.log(1)</code></pre>';
      const output = sanitizeArticleHtml(input);
      expect(output).not.toContain('class=');
      expect(output).not.toContain('data-language=');
      expect(output).not.toContain('lang=');
      expect(output).toContain('<pre><code>console.log(1)</code></pre>');
    });

    test('若 code 標記屬性被移除，應仍保留 code block 的內容', () => {
      const input = '<pre><code class="language-css">body { color: red; }</code></pre>';
      const output = sanitizeArticleHtml(input);
      expect(output).toBe('<pre><code>body { color: red; }</code></pre>');
    });

    test('應移除不允許的標籤，例如 iframe, style, form, input, button', () => {
      const input =
        '<div><iframe src="https://evil.com"></iframe><style>body { background: red; }</style><form><input type="text" /><button>Submit</button></form></div>';
      const output = sanitizeArticleHtml(input);
      expect(output).toBe('<div>Submit</div>');
    });

    test('空值輸入應 safe 返回空字串', () => {
      expect(sanitizeArticleHtml('')).toBe('');
      expect(sanitizeArticleHtml(null)).toBe('');
      expect(sanitizeArticleHtml(undefined)).toBe('');
    });
  });

  describe('sanitizeAiOutputHtml', () => {
    test('成功的 AI HTML 應正確消毒並返回 success: true 狀態', () => {
      const input = '<p>Hello <a href="https://example.com">World</a></p>';
      const result = sanitizeAiOutputHtml(input);
      expect(result.success).toBe(true);
      expect(result.html).toBe('<p>Hello <a href="https://example.com">World</a></p>');
    });

    test('應排除不支援的標籤如 img, form, div 並且只允許特定的 AI output tags', () => {
      const input = '<div><p>Paragraph</p><img src="test.jpg" /><form></form></div>';
      const result = sanitizeAiOutputHtml(input);
      expect(result.success).toBe(true);
      // 應移除 div 與 img/form，但保留 p 內容。由於 div 不是 allowed tag，其內容 p 被保留，而 div 標籤本身被剝離
      expect(result.html).toBe('<p>Paragraph</p>');
    });

    test('應處理 empty 輸入', () => {
      const result = sanitizeAiOutputHtml('');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('empty');
      expect(result.html).toBe('');
    });

    test('應處理過長的輸入限制', () => {
      // 預設長度限制為 100,000 字元，我們可以傳入 options 測試
      const longInput = 'a'.repeat(101);
      const result = sanitizeAiOutputHtml(longInput, { maxLength: 100 });
      expect(result.success).toBe(false);
      expect(result.reason).toBe('too_long');
      expect(result.html).toBe('');
    });

    test('應處理經過消毒後為空的輸入 (sanitized_empty)', () => {
      const input = '<script>alert(1)</script><style>body{}</style>';
      const result = sanitizeAiOutputHtml(input);
      expect(result.success).toBe(false);
      expect(result.reason).toBe('sanitized_empty');
      expect(result.html).toBe('');
    });
  });

  describe('sanitizeHtmlToText', () => {
    test('應去除所有標籤並轉換為純文字', () => {
      const input = '<div><h1>Title</h1><p>Hello <strong>World</strong>!</p></div>';
      const output = sanitizeHtmlToText(input);
      expect(output).toBe('TitleHello World!');
    });

    test('應徹底過濾 script/style 標籤內部的文字內容，避免殘留', () => {
      const input =
        '<div><script>const a = 1;</script><style>body { color: red; }</style><p>Hello</p></div>';
      const output = sanitizeHtmlToText(input);
      expect(output).toBe('Hello');
    });

    test('應正確解碼 HTML Entities', () => {
      const input = '<p>Hello &amp; Welcome &lt;world&gt; &quot;AI&quot;</p>';
      const output = sanitizeHtmlToText(input);
      expect(output).toBe('Hello & Welcome <world> "AI"');
    });

    test('空值輸入應 safe 返回空字串', () => {
      expect(sanitizeHtmlToText('')).toBe('');
      expect(sanitizeHtmlToText(null)).toBe('');
      expect(sanitizeHtmlToText(undefined)).toBe('');
    });
  });
});
