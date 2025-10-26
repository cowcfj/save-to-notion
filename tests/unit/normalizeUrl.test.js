// URL 標準化函數測試
// 測試 normalizeUrl 函數的各種場景

// 先設置 Chrome Mock,再導入源碼
require('../mocks/chrome.js');

// 導入實際的源碼函數
const { normalizeUrl } = require('../../scripts/background.js');

describe('normalizeUrl', () => {

  describe('基本功能', () => {
    test('應該返回不變的簡單 URL', () => {
      const url = 'https://example.com/page';
      expect(normalizeUrl(url)).toBe(url);
    });

    test('應該處理根路徑', () => {
      const url = 'https://example.com/';
      expect(normalizeUrl(url)).toBe(url);
    });

    test('應該保持查詢參數（非追蹤參數）', () => {
      const url = 'https://example.com/page?id=123&name=test';
      expect(normalizeUrl(url)).toBe(url);
    });
  });

  describe('移除 Hash Fragment', () => {
    test('應該移除 hash fragment', () => {
      const url = 'https://example.com/page#section';
      const expected = 'https://example.com/page';
      expect(normalizeUrl(url)).toBe(expected);
    });

    test('應該移除複雜的 hash', () => {
      const url = 'https://example.com/page#section-1.2.3';
      const expected = 'https://example.com/page';
      expect(normalizeUrl(url)).toBe(expected);
    });
  });

  describe('移除追蹤參數', () => {
    test('應該移除 utm_source', () => {
      const url = 'https://example.com/page?utm_source=google&id=123';
      const expected = 'https://example.com/page?id=123';
      expect(normalizeUrl(url)).toBe(expected);
    });

    test('應該移除所有 UTM 參數', () => {
      const url = 'https://example.com/page?utm_source=google&utm_medium=cpc&utm_campaign=test&id=123';
      const expected = 'https://example.com/page?id=123';
      expect(normalizeUrl(url)).toBe(expected);
    });

    test('應該移除 fbclid', () => {
      const url = 'https://example.com/page?fbclid=abc123&id=456';
      const expected = 'https://example.com/page?id=456';
      expect(normalizeUrl(url)).toBe(expected);
    });

    test('應該移除 gclid', () => {
      const url = 'https://example.com/page?gclid=xyz789&id=456';
      const expected = 'https://example.com/page?id=456';
      expect(normalizeUrl(url)).toBe(expected);
    });

    test('應該移除多個追蹤參數', () => {
      const url = 'https://example.com/page?utm_source=fb&fbclid=abc&gclid=xyz&id=123';
      const expected = 'https://example.com/page?id=123';
      expect(normalizeUrl(url)).toBe(expected);
    });
  });

  describe('標準化尾部斜杠', () => {
    test('應該移除非根路徑的尾部斜杠', () => {
      const url = 'https://example.com/page/';
      const expected = 'https://example.com/page';
      expect(normalizeUrl(url)).toBe(expected);
    });

    test('應該保留根路徑的斜杠', () => {
      const url = 'https://example.com/';
      expect(normalizeUrl(url)).toBe(url);
    });

    test('應該移除多個尾部斜杠', () => {
      const url = 'https://example.com/page///';
      const expected = 'https://example.com/page';
      expect(normalizeUrl(url)).toBe(expected);
    });
  });

  describe('組合場景', () => {
    test('應該處理包含所有變體的 URL', () => {
      const url = 'https://example.com/page/?utm_source=google&utm_medium=cpc&id=123#section';
      const expected = 'https://example.com/page?id=123';
      expect(normalizeUrl(url)).toBe(expected);
    });

    test('應該處理複雜的真實世界 URL', () => {
      const url = 'https://blog.example.com/article/2024/10/05/?utm_source=twitter&utm_campaign=launch&fbclid=abc123#comments';
      const expected = 'https://blog.example.com/article/2024/10/05?';
      expect(normalizeUrl(url)).toContain('https://blog.example.com/article/2024/10/05');
      expect(normalizeUrl(url)).not.toContain('utm_');
      expect(normalizeUrl(url)).not.toContain('fbclid');
      expect(normalizeUrl(url)).not.toContain('#');
    });
  });

  describe('錯誤處理', () => {
    test('應該處理無效的 URL', () => {
      const url = 'not-a-valid-url';
      expect(normalizeUrl(url)).toBe(url);
    });

    test('應該處理空字串', () => {
      expect(normalizeUrl('')).toBe('');
    });

    test('應該處理 null', () => {
      expect(normalizeUrl(null)).toBe('');
    });

    test('應該處理 undefined', () => {
      expect(normalizeUrl()).toBe('');
    });
  });

  describe('特殊字符和編碼', () => {
    test('應該處理 URL 編碼(可能會被轉換)', () => {
      const url = 'https://example.com/search?q=hello%20world&id=123';
      const result = normalizeUrl(url);
      // URL API 可能會將 %20 轉換為 +
      expect(result).toContain('example.com/search');
      expect(result).toContain('id=123');
      expect(result).toMatch(/hello[\+%20]+world/);
    });

    test('應該處理中文字符', () => {
      const url = 'https://example.com/文章?utm_source=test';
      const result = normalizeUrl(url);
      expect(result).toContain('example.com');
      expect(result).not.toContain('utm_source');
    });
  });
});
