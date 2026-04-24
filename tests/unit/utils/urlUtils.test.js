/**
 * @jest-environment node
 */

import {
  normalizeUrl,
  computeStableUrl,
  resolveStorageUrl,
  buildStableUrlFromNextData,
  isRootUrl,
  isSafeStableUrl,
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

  describe('buildStableUrlFromNextData', () => {
    describe('基本路由解析', () => {
      it('應該從含 slug 的路由移除 slug 段', () => {
        const routeInfo = {
          page: '/[category]/[id]/[slug]',
          query: { category: 'news', id: '123', slug: 'article-title' },
        };
        const result = buildStableUrlFromNextData(
          routeInfo,
          'https://example.com/news/123/article-title'
        );

        // slug 被移除，保留 category 和 id
        expect(result).toBe('https://example.com/news/123');
      });

      it('應該從含 title 的路由移除 title 段', () => {
        const routeInfo = {
          page: '/[section]/[articleId]/[title]',
          query: { section: 'tech', articleId: '456', title: 'some-title' },
        };
        const result = buildStableUrlFromNextData(
          routeInfo,
          'https://example.com/tech/456/some-title'
        );

        expect(result).toBe('https://example.com/tech/456');
      });

      it('應該識別含非 ASCII 字符的值為 slug', () => {
        const routeInfo = {
          page: '/[category]/[id]/[name]',
          query: { category: 'news', id: '789', name: '示威者遭警方拘捕' },
        };
        const result = buildStableUrlFromNextData(
          routeInfo,
          'https://example.com/news/789/示威者遭警方拘捕'
        );

        // 'name' 的值含中文 → 視為 slug → 移除
        expect(result).toBe('https://example.com/news/789');
      });
    });

    describe('HK01 風格路由', () => {
      it('應該處理 HK01 的 /[category]/[id]/[slug] 結構', () => {
        const routeInfo = {
          page: '/[category]/[id]/[slug]',
          query: { category: '社會新聞', id: '60320801', slug: '示威者遭警方拘捕' },
        };
        const result = buildStableUrlFromNextData(
          routeInfo,
          'https://www.hk01.com/社會新聞/60320801/示威者遭警方拘捕'
        );

        // category 名稱被視為穩定段而保留，slug 被移除
        expect(result).toBe('https://www.hk01.com/%E7%A4%BE%E6%9C%83%E6%96%B0%E8%81%9E/60320801');
      });
    });

    describe('無法識別 slug 的情況', () => {
      it('應該返回 null 當沒有 slug-like 欄位', () => {
        const routeInfo = {
          page: '/[category]/[id]',
          query: { category: 'news', id: '123' },
        };
        const result = buildStableUrlFromNextData(routeInfo, 'https://example.com/news/123');

        // 沒有欄位名含 slug/title，且沒有非 ASCII 值 → 無法識別
        expect(result).toBeNull();
      });

      it('應該返回 null 當路由無動態段', () => {
        const routeInfo = {
          page: '/about',
          query: {},
        };
        const result = buildStableUrlFromNextData(routeInfo, 'https://example.com/about');

        expect(result).toBeNull();
      });
    });

    describe('純數字 slug 值豁免', () => {
      it('應該保留純數字 slug 值（如 scitw.cc 的文章 ID）', () => {
        const routeInfo = {
          page: '/posts/[slug]',
          query: { slug: '10615' },
        };
        const result = buildStableUrlFromNextData(routeInfo, 'https://www.scitw.cc/posts/10615');
        // 唯一動態段的值是純數字 → 視為穩定 ID → 無法產生穩定 URL → 返回 null
        expect(result).toBeNull();
      });

      it('應該在混合路由中保留純數字 ID 並移除文字 slug', () => {
        const routeInfo = {
          page: '/posts/[id]/[slug]',
          query: { id: '10615', slug: 'article-title-here' },
        };
        const result = buildStableUrlFromNextData(
          routeInfo,
          'https://www.scitw.cc/posts/10615/article-title-here'
        );
        // id 為純數字 → 豁免；slug 為文字 → 移除
        expect(result).toBe('https://www.scitw.cc/posts/10615');
      });

      it('應該移除非純數字的 slug 值（不觸發豁免，但需有穩定段以避開安全閥）', () => {
        const routeInfo = {
          page: '/category/[id]/[slug]',
          query: { id: '123', slug: 'hello-world' },
        };
        const result = buildStableUrlFromNextData(
          routeInfo,
          'https://example.com/category/123/hello-world'
        );
        // slug 含字母 → 不豁免 → 移除，剩餘 id 段 → 返回穩定 URL
        expect(result).toBe('https://example.com/category/123');
      });

      it('應該移除含字母與數字混合的 slug 值（需有穩定段以避開安全閥）', () => {
        const routeInfo = {
          page: '/category/[id]/[slug]',
          query: { id: '123', slug: '123-hello' },
        };
        const result = buildStableUrlFromNextData(
          routeInfo,
          'https://example.com/category/123/123-hello'
        );
        // 值非純數字 → 不豁免
        expect(result).toBe('https://example.com/category/123');
      });
    });

    describe('安全閥：所有動態段均被移除時', () => {
      it('當單一動態段被移除時（如 scitw.cc 的文字 slug），應返回 null 避免靜態殼', () => {
        const routeInfo = {
          page: '/posts/[slug]',
          query: { slug: 'Wiki-Curious-tw' },
        };
        const result = buildStableUrlFromNextData(
          routeInfo,
          'https://www.scitw.cc/posts/Wiki-Curious-tw'
        );
        expect(result).toBeNull();
      });

      it('當多個動態段皆被移除時，應返回 null 避免靜態殼', () => {
        // 假設 section 值含中文/非 ASCII 且不在已知穩定段清單中，這將導致 section 也被視為 slug
        // 為了簡單起見，直接讓它名字叫 [slug2]
        const routeInfo2 = {
          page: '/[slug1]/[slug2]',
          query: { slug1: 'post', slug2: 'hello-world' },
        };
        const result = buildStableUrlFromNextData(
          routeInfo2,
          'https://example.com/post/hello-world'
        );
        expect(result).toBeNull();
      });
    });

    describe('邊界情況', () => {
      it('應該處理 null routeInfo', () => {
        expect(buildStableUrlFromNextData(null, 'https://example.com')).toBeNull();
      });

      it('應該處理缺少 page 的 routeInfo', () => {
        expect(buildStableUrlFromNextData({ query: {} }, 'https://example.com')).toBeNull();
      });

      it('應該處理缺少 query 的 routeInfo', () => {
        expect(buildStableUrlFromNextData({ page: '/[id]' }, 'https://example.com')).toBeNull();
      });

      it('應該處理 null originalUrl', () => {
        const routeInfo = { page: '/[id]/[slug]', query: { id: '1', slug: 'test' } };
        expect(buildStableUrlFromNextData(routeInfo, null)).toBeNull();
      });

      it('應該處理無效 originalUrl', () => {
        const routeInfo = { page: '/[id]/[slug]', query: { id: '1', slug: 'test' } };
        expect(buildStableUrlFromNextData(routeInfo, 'not-a-url')).toBeNull();
      });
    });
  });

  describe('resolveStorageUrl', () => {
    it('應該優先使用穩定 URL 對於 HK01（Phase 1）', () => {
      const url = 'https://www.hk01.com/社會新聞/60320801/示威者遭警方拘捕';
      const result = resolveStorageUrl(url);

      expect(result).toBe('https://www.hk01.com/%E7%A4%BE%E6%9C%83%E6%96%B0%E8%81%9E/60320801');
    });

    it('應該降級到 normalizeUrl 對於非已知網站（無 preloaderData）', () => {
      const url = 'https://example.com/article?utm_source=test#fragment';
      const result = resolveStorageUrl(url);

      // 應該移除 tracking params 和 fragment
      expect(result).toBe('https://example.com/article');
    });

    it('應該處理空值', () => {
      expect(resolveStorageUrl('')).toBe('');
      expect(resolveStorageUrl(null)).toBe('');
    });

    describe('Phase 2a: Next.js preloaderData', () => {
      it('應該使用 Next.js routeInfo 構建穩定 URL', () => {
        const url = 'https://blog.example.com/tech/999/some-long-slug';
        const preloaderData = {
          nextRouteInfo: {
            page: '/[category]/[id]/[slug]',
            query: { category: 'tech', id: '999', slug: 'some-long-slug' },
          },
        };

        const result = resolveStorageUrl(url, preloaderData);
        expect(result).toBe('https://blog.example.com/tech/999');
      });

      it('Phase 1 應優先於 Phase 2a', () => {
        const url = 'https://www.hk01.com/社會新聞/60320801/示威者遭警方拘捕';
        const preloaderData = {
          nextRouteInfo: {
            page: '/[category]/[id]/[slug]',
            query: { category: '社會新聞', id: '60320801', slug: '示威者遭警方拘捕' },
          },
        };

        const result = resolveStorageUrl(url, preloaderData);
        // 應使用 Phase 1 規則（computeStableUrl），而非 Phase 2a
        expect(result).toBe('https://www.hk01.com/%E7%A4%BE%E6%9C%83%E6%96%B0%E8%81%9E/60320801');
      });

      it('應該在 Phase 2a 回退到 normalizeUrl 並保留完整純數字 slug URL（scitw.cc regression）', () => {
        const url = 'https://www.scitw.cc/posts/10615';
        const preloaderData = {
          nextRouteInfo: {
            page: '/posts/[slug]',
            query: { slug: '10615' },
          },
        };

        const result = resolveStorageUrl(url, preloaderData);

        // buildStableUrlFromNextData 返回 null 後，應回退到 normalizeUrl，
        // 最終仍保留完整文章 URL，而不是被截成 /posts
        expect(result).toBe('https://www.scitw.cc/posts/10615');
      });

      it('應該在 Phase 2a 回退到 normalizeUrl 並保留完整文字 slug URL（安全閥機制）', () => {
        const url = 'https://www.scitw.cc/posts/Wiki-Curious-tw';
        const preloaderData = {
          nextRouteInfo: {
            page: '/posts/[slug]',
            query: { slug: 'Wiki-Curious-tw' },
          },
        };

        const result = resolveStorageUrl(url, preloaderData);

        // buildStableUrlFromNextData 返回 null 後，應回退到 normalizeUrl
        expect(result).toBe('https://www.scitw.cc/posts/Wiki-Curious-tw');
      });
    });

    describe('Phase 2a+: WordPress shortlink', () => {
      it('應該使用有 query 參數的 shortlink（?p=ID）', () => {
        const url = 'https://blog.example.com/2024/01/01/very-long-slug-title/';
        const preloaderData = {
          shortlink: 'https://blog.example.com/?p=12345',
        };

        const result = resolveStorageUrl(url, preloaderData);
        expect(result).toBe('https://blog.example.com/?p=12345');
      });

      it('應該拒絕沒有 query 參數的 shortlink（首頁 URL）', () => {
        const url = 'https://blog.example.com/2024/01/01/some-post/';
        const preloaderData = {
          shortlink: 'https://blog.example.com/',
        };

        const result = resolveStorageUrl(url, preloaderData);
        expect(result).toBe(normalizeUrl(url));
      });

      it('應該拒絕跨域 shortlink 並回退到 normalizeUrl', () => {
        const url = 'https://blog.example.com/2024/01/01/some-post/';
        const preloaderData = {
          shortlink: 'https://evil.com/?p=12345',
        };

        const result = resolveStorageUrl(url, preloaderData);
        expect(result).toBe(normalizeUrl(url));
      });

      it('應該使用帶 query 參數的 shortlink（無 nextRouteInfo 時）', () => {
        const url = 'https://blog.example.com/tech/999/some-long-slug';
        const preloaderData = {
          shortlink: 'https://blog.example.com/?p=999',
        };

        const result = resolveStorageUrl(url, preloaderData);
        expect(result).toBe('https://blog.example.com/?p=999');
      });
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

  describe('isRootUrl', () => {
    it('應該對根路徑（/）回傳 true', () => {
      expect(isRootUrl('https://example.com/')).toBe(true);
    });

    it('應該對帶 query 參數的根路徑回傳 false', () => {
      expect(isRootUrl('https://example.com/?p=123')).toBe(false);
    });

    it('應該對有路徑的 URL 回傳 false', () => {
      expect(isRootUrl('https://example.com/some-post')).toBe(false);
    });

    it('應該對 null 回傳 true（視為根路徑）', () => {
      expect(isRootUrl(null)).toBe(true);
    });

    it('應該對空字串回傳 true（視為根路徑）', () => {
      expect(isRootUrl('')).toBe(true);
    });

    it('應該對無效 URL 回傳 false', () => {
      expect(isRootUrl('not-a-valid-url')).toBe(false);
    });
  });

  describe('isSafeStableUrl', () => {
    it('應該接受非 root 的 http(s) URL', () => {
      expect(isSafeStableUrl('https://example.com/?p=123')).toBe(true);
      expect(isSafeStableUrl('http://example.com/posts/1')).toBe(true);
    });

    it('應該拒絕 root URL、非 http(s) 與無效值', () => {
      expect(isSafeStableUrl('https://example.com/')).toBe(false);
      expect(isSafeStableUrl('ftp://example.com/file')).toBe(false);
      expect(isSafeStableUrl('not-a-valid-url')).toBe(false);
      expect(isSafeStableUrl('')).toBe(false);
    });

    it('requireNormalized=true 時應拒絕未正規化的 URL', () => {
      expect(
        isSafeStableUrl('https://example.com/path/?utm_source=fb#frag', {
          requireNormalized: true,
        })
      ).toBe(false);
      expect(
        isSafeStableUrl('https://example.com/path', {
          requireNormalized: true,
        })
      ).toBe(true);
    });

    it('[REGRESSION] normalize 後變成 site root 的 URL 應視為 unsafe', () => {
      expect(isSafeStableUrl('https://example.com/?utm_source=fb')).toBe(false);
    });
  });
});
