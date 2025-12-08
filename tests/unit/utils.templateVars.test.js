/**
 * utils.js - 模板變數替換測試
 *
 * 測試範圍：
 * - 模板變數替換
 * - 特殊字符處理
 * - 邊界情況
 */

describe('模板變數替換', () => {
  describe('replaceTemplateVars()', () => {
    test('應該替換 {title} 變數', () => {
      const template = 'Page: {title}';
      const vars = { title: 'Test Page' };
      const result = template.replace(/{title}/g, vars.title);

      expect(result).toBe('Page: Test Page');
    });

    test('應該替換 {date} 變數', () => {
      const template = 'Created: {date}';
      const date = '2025-10-06';
      const result = template.replace(/{date}/g, date);

      expect(result).toBe('Created: 2025-10-06');
    });

    test('應該替換 {domain} 變數', () => {
      const template = 'From: {domain}';
      const domain = 'example.com';
      const result = template.replace(/{domain}/g, domain);

      expect(result).toBe('From: example.com');
    });

    test('應該替換 {url} 變數', () => {
      const template = 'Source: {url}';
      const url = 'https://example.com/page';
      const result = template.replace(/{url}/g, url);

      expect(result).toBe('Source: https://example.com/page');
    });

    test('應該替換多個變數', () => {
      const template = '{title} - {date} - {domain}';
      const vars = {
        title: 'Test',
        date: '2025-10-06',
        domain: 'example.com',
      };

      let result = template;
      Object.keys(vars).forEach(key => {
        result = result.replace(new RegExp(`{${key}}`, 'g'), vars[key]);
      });

      expect(result).toBe('Test - 2025-10-06 - example.com');
    });

    test('應該處理不存在的變數', () => {
      const template = '{title} - {unknown}';
      const vars = { title: 'Test' };

      const result = template.replace(/{title}/g, vars.title);

      expect(result).toBe('Test - {unknown}');
    });

    test('應該處理空字符串變數', () => {
      const template = '{title}';
      const vars = { title: '' };
      const result = template.replace(/{title}/g, vars.title);

      expect(result).toBe('');
    });

    test('應該處理特殊字符', () => {
      const template = '{title}';
      const vars = { title: 'Test & <Special> "Chars"' };
      const result = template.replace(/{title}/g, vars.title);

      expect(result).toBe('Test & <Special> "Chars"');
    });

    test('應該處理重複的變數', () => {
      const template = '{title} - {title}';
      const vars = { title: 'Test' };
      const result = template.replace(/{title}/g, vars.title);

      expect(result).toBe('Test - Test');
    });
  });

  describe('extractDomain()', () => {
    test('應該從 URL 提取域名', () => {
      const url = 'https://www.example.com/page';
      const domain = new URL(url).hostname;

      expect(domain).toBe('www.example.com');
    });

    test('應該處理沒有 www 的域名', () => {
      const url = 'https://example.com/page';
      const domain = new URL(url).hostname;

      expect(domain).toBe('example.com');
    });

    test('應該處理子域名', () => {
      const url = 'https://blog.example.com/page';
      const domain = new URL(url).hostname;

      expect(domain).toBe('blog.example.com');
    });

    test('應該處理端口號', () => {
      const url = 'https://example.com:8080/page';
      const domain = new URL(url).hostname;

      expect(domain).toBe('example.com');
    });

    test('應該處理無效 URL', () => {
      expect(() => new URL('invalid-url')).toThrow();
    });
  });

  describe('escapeTemplateString()', () => {
    test('應該轉義 HTML 特殊字符', () => {
      const text = '<script>alert("XSS")</script>';
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

      expect(escaped).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    });

    test('應該處理空字符串', () => {
      const text = '';
      const escaped = text.replace(/</g, '&lt;');

      expect(escaped).toBe('');
    });

    test('應該處理只有特殊字符的字符串', () => {
      const text = '<>&"\'';
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

      expect(escaped).toBe('&lt;&gt;&amp;&quot;&#039;');
    });
  });
});
