/**
 * @jest-environment node
 */

import {
  normalizeUrl,
  computeStableUrl,
  resolveStorageUrl,
} from '../../../scripts/utils/urlUtils.js';

describe('urlUtils', () => {
  describe('computeStableUrl', () => {
    describe('HK01 URLs', () => {
      it('應該移除 HK01 文章 slug 段', () => {
        const url = 'https://www.hk01.com/社會新聞/60320801/示威者遭警方拘捕';
        const result = computeStableUrl(url);

        // 應該保留 category 和 articleId，移除 slug（中文會被 URL 編碼）
        expect(result).toBe('https://www.hk01.com/%E7%A4%BE%E6%9C%83%E6%96%B0%E8%81%9E/60320801');
      });

      it('應該保留 HK01 文章的 category 和 articleId', () => {
        const url = 'https://www.hk01.com/財經快訊/123456/公司宣布重組方案';
        const result = computeStableUrl(url);

        expect(result).toBe('https://www.hk01.com/%E8%B2%A1%E7%B6%93%E5%BF%AB%E8%A8%8A/123456');
      });

      it('應該處理沒有 slug 的 HK01 URL（不匹配規則）', () => {
        const url = 'https://www.hk01.com/社會新聞/60320801';
        const result = computeStableUrl(url);

        // 沒有 slug 段，規則不匹配，返回 null
        expect(result).toBeNull();
      });
    });

    describe('明報 URLs', () => {
      it('應該移除明報文章的 slug 段', () => {
        const url = 'https://news.mingpao.com/article/20240101/s00001/示威者遭警方拘捕';
        const result = computeStableUrl(url);

        expect(result).toBe('https://news.mingpao.com/article/20240101/s00001');
      });

      it('應該處理包含 /article/ 路徑的明報 URL', () => {
        const url = 'https://news.mingpao.com/article/20231225/s00002/新聞標題';
        const result = computeStableUrl(url);

        expect(result).toBe('https://news.mingpao.com/article/20231225/s00002');
      });

      it('應該跳過不包含 /article/ 的明報 URL', () => {
        const url = 'https://news.mingpao.com/other/20240101/s00001/內容';
        const result = computeStableUrl(url);

        // pathRequires 不匹配
        expect(result).toBeNull();
      });

      it('應該處理沒有 slug 的明報 URL（不匹配規則）', () => {
        const url = 'https://news.mingpao.com/article/20240101/s00001';
        const result = computeStableUrl(url);

        // 路徑過短（只有三段：date/section），正則不會匹配
        // 這是正確行為：/article/20240101/s00001 不應被截斷
        expect(result).toBeNull();
      });
    });

    describe('非已知網站', () => {
      it('應該返回 null 對於非已知網站', () => {
        const url = 'https://example.com/article/123/title';
        const result = computeStableUrl(url);

        expect(result).toBeNull();
      });

      it('應該返回 null 對於 Google', () => {
        const url = 'https://www.google.com/search?q=test';
        const result = computeStableUrl(url);

        expect(result).toBeNull();
      });
    });

    describe('邊界情況', () => {
      it('應該處理空值', () => {
        expect(computeStableUrl('')).toBeNull();
        expect(computeStableUrl(null)).toBeNull();
        expect(computeStableUrl(undefined)).toBeNull();
      });

      it('應該處理非 URL 字串', () => {
        expect(computeStableUrl('not-a-url')).toBeNull();
      });

      it('應該處理非字串輸入', () => {
        expect(computeStableUrl(123)).toBeNull();
        expect(computeStableUrl({})).toBeNull();
      });

      it('應該處理無效 URL', () => {
        expect(computeStableUrl('ht!tp://invalid')).toBeNull();
      });
    });
  });

  describe('resolveStorageUrl', () => {
    it('應該優先使用穩定 URL 對於 HK01', () => {
      const url = 'https://www.hk01.com/社會新聞/60320801/示威者遭警方拘捕';
      const result = resolveStorageUrl(url);

      expect(result).toBe('https://www.hk01.com/%E7%A4%BE%E6%9C%83%E6%96%B0%E8%81%9E/60320801');
    });

    it('應該降級到 normalizeUrl 對於非已知網站', () => {
      const url = 'https://example.com/article?utm_source=test#fragment';
      const result = resolveStorageUrl(url);

      // 應該移除 tracking params 和 fragment
      expect(result).toBe('https://example.com/article');
    });

    it('應該處理空值', () => {
      expect(resolveStorageUrl('')).toBe('');
      expect(resolveStorageUrl(null)).toBe('');
    });
  });

  describe('normalizeUrl - 回歸測試', () => {
    it('應該移除 hash fragment', () => {
      const url = 'https://example.com/page#section';
      expect(normalizeUrl(url)).toBe('https://example.com/page');
    });

    it('應該移除 tracking parameters', () => {
      const url = 'https://example.com/page?utm_source=test&utm_medium=email&gclid=123';
      expect(normalizeUrl(url)).toBe('https://example.com/page');
    });

    it('應該保留非 tracking parameters', () => {
      const url = 'https://example.com/page?id=123&category=news';
      expect(normalizeUrl(url)).toBe('https://example.com/page?id=123&category=news');
    });

    it('應該移除尾部斜杠（非根路徑）', () => {
      const url = 'https://example.com/page/';
      expect(normalizeUrl(url)).toBe('https://example.com/page');
    });

    it('應該保留根路徑的斜杠', () => {
      const url = 'https://example.com/';
      expect(normalizeUrl(url)).toBe('https://example.com/');
    });
  });
});
