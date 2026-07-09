/**
 * @jest-environment node
 */

import loggerMock from '../../helpers/loggerMock.cjs';

const { installGlobalLoggerMock } = loggerMock;

installGlobalLoggerMock();

let normalizeUrl;
let computeStableUrl;
let resolveStorageUrl;
let buildStableUrlFromNextData;
let hasSameOrigin;
let isRootUrl;
let isSafeStableUrl;

beforeAll(async () => {
  ({
    normalizeUrl,
    computeStableUrl,
    resolveStorageUrl,
    buildStableUrlFromNextData,
    hasSameOrigin,
    isRootUrl,
    isSafeStableUrl,
  } = await import('../../../scripts/utils/urlUtils.js'));
});

describe('urlUtils', () => {
  describe('computeStableUrl', () => {
    describe('HK01 URLs', () => {
      it.each([
        [
          '應該移除 HK01 文章 slug 段',
          'https://www.hk01.com/社會新聞/60320801/示威者遭警方拘捕',
          'https://www.hk01.com/%E7%A4%BE%E6%9C%83%E6%96%B0%E8%81%9E/60320801',
        ],
        [
          '應該保留 HK01 文章的 category 和 articleId',
          'https://www.hk01.com/財經快訊/123456/公司宣布重組方案',
          'https://www.hk01.com/%E8%B2%A1%E7%B6%93%E5%BF%AB%E8%A8%8A/123456',
        ],
        [
          '應該處理沒有 slug 的 HK01 URL（不匹配規則）',
          'https://www.hk01.com/社會新聞/60320801',
          null,
        ],
      ])('%s', (_name, url, expected) => {
        const result = computeStableUrl(url);
        expect(result).toBe(expected);
      });
    });

    describe('明報 URLs', () => {
      it.each([
        [
          '應該移除明報文章的 slug 段',
          'https://news.mingpao.com/article/20240101/s00001/示威者遭警方拘捕',
          'https://news.mingpao.com/article/20240101/s00001',
        ],
        [
          '應該處理包含 /article/ 路徑的明報 URL',
          'https://news.mingpao.com/article/20231225/s00002/新聞標題',
          'https://news.mingpao.com/article/20231225/s00002',
        ],
        [
          '應該跳過不包含 /article/ 的明報 URL',
          'https://news.mingpao.com/other/20240101/s00001/內容',
          null,
        ],
        [
          '應該處理沒有 slug 的明報 URL（不匹配規則）',
          'https://news.mingpao.com/article/20240101/s00001',
          null,
        ],
      ])('%s', (_name, url, expected) => {
        const result = computeStableUrl(url);
        expect(result).toBe(expected);
      });
    });

    describe('非已知網站', () => {
      it.each([
        ['非已知網站', 'https://example.com/article/123/title'],
        ['Google', 'https://www.google.com/search?q=test'],
      ])('應該返回 null 對於 %s', (_name, url) => {
        expect(computeStableUrl(url)).toBeNull();
      });
    });

    describe('邊界情況', () => {
      it.each(['', null, undefined, 'not-a-url', 123, {}, 'ht!tp://invalid'])(
        '應該處理 %p',
        input => {
          expect(computeStableUrl(input)).toBeNull();
        }
      );
    });
  });

  describe('buildStableUrlFromNextData', () => {
    describe('基本路由解析', () => {
      it.each([
        [
          '應該從含 slug 的路由移除 slug 段',
          {
            page: '/[category]/[id]/[slug]',
            query: { category: 'news', id: '123', slug: 'article-title' },
          },
          'https://example.com/news/123/article-title',
          'https://example.com/news/123',
        ],
        [
          '應該從含 title 的路由移除 title 段',
          {
            page: '/[section]/[articleId]/[title]',
            query: { section: 'tech', articleId: '456', title: 'some-title' },
          },
          'https://example.com/tech/456/some-title',
          'https://example.com/tech/456',
        ],
        [
          '應該識別含非 ASCII 字符的值為 slug',
          {
            page: '/[category]/[id]/[name]',
            query: { category: 'news', id: '789', name: '示威者遭警方拘捕' },
          },
          'https://example.com/news/789/示威者遭警方拘捕',
          'https://example.com/news/789',
        ],
      ])('%s', (_name, routeInfo, originalUrl, expected) => {
        const result = buildStableUrlFromNextData(routeInfo, originalUrl);
        expect(result).toBe(expected);
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
      it.each([
        [
          '沒有 slug-like 欄位',
          { page: '/[category]/[id]', query: { category: 'news', id: '123' } },
          'https://example.com/news/123',
        ],
        ['路由無動態段', { page: '/about', query: {} }, 'https://example.com/about'],
      ])('應該返回 null 當%s', (_name, routeInfo, originalUrl) => {
        const result = buildStableUrlFromNextData(routeInfo, originalUrl);
        expect(result).toBeNull();
      });
    });

    describe('純數字 slug 值豁免', () => {
      it.each([
        [
          '應該保留純數字 slug 值（如 scitw.cc 的文章 ID）',
          { page: '/posts/[slug]', query: { slug: '10615' } },
          'https://www.scitw.cc/posts/10615',
          null,
        ],
        [
          '應該在混合路由中保留純數字 ID 並移除文字 slug',
          { page: '/posts/[id]/[slug]', query: { id: '10615', slug: 'article-title-here' } },
          'https://www.scitw.cc/posts/10615/article-title-here',
          'https://www.scitw.cc/posts/10615',
        ],
        [
          '應該移除非純數字的 slug 值（不觸發豁免，但需有穩定段以避開安全閥）',
          { page: '/category/[id]/[slug]', query: { id: '123', slug: 'hello-world' } },
          'https://example.com/category/123/hello-world',
          'https://example.com/category/123',
        ],
        [
          '應該移除含字母與數字混合的 slug 值（需有穩定段以避開安全閥）',
          { page: '/category/[id]/[slug]', query: { id: '123', slug: '123-hello' } },
          'https://example.com/category/123/123-hello',
          'https://example.com/category/123',
        ],
      ])('%s', (_name, routeInfo, originalUrl, expected) => {
        const result = buildStableUrlFromNextData(routeInfo, originalUrl);
        expect(result).toBe(expected);
      });
    });

    describe('安全閥：所有動態段均被移除時', () => {
      it.each([
        [
          '當單一動態段被移除時（如 scitw.cc 的文字 slug），應返回 null 避免靜態殼',
          { page: '/posts/[slug]', query: { slug: 'Wiki-Curious-tw' } },
          'https://www.scitw.cc/posts/Wiki-Curious-tw',
        ],
        [
          '當多個動態段皆被移除時，應返回 null 避免靜態殼',
          { page: '/[slug1]/[slug2]', query: { slug1: 'post', slug2: 'hello-world' } },
          'https://example.com/post/hello-world',
        ],
      ])('%s', (_name, routeInfo, originalUrl) => {
        const result = buildStableUrlFromNextData(routeInfo, originalUrl);
        expect(result).toBeNull();
      });
    });

    describe('邊界情況', () => {
      it.each([
        ['null routeInfo', null, 'https://example.com'],
        ['缺少 page 的 routeInfo', { query: {} }, 'https://example.com'],
        ['缺少 query 的 routeInfo', { page: '/[id]' }, 'https://example.com'],
        ['null originalUrl', { page: '/[id]/[slug]', query: { id: '1', slug: 'test' } }, null],
        [
          '無效 originalUrl',
          { page: '/[id]/[slug]', query: { id: '1', slug: 'test' } },
          'not-a-url',
        ],
      ])('應該處理%s', (_name, routeInfo, originalUrl) => {
        expect(buildStableUrlFromNextData(routeInfo, originalUrl)).toBeNull();
      });

      it('應該拒絕相對 originalUrl 且不記錄錯誤', async () => {
        const routeInfo = { page: '/[id]/[slug]', query: { id: '1', slug: 'test' } };
        const originalSelf = globalThis.self;

        try {
          globalThis.self = globalThis;
          globalThis.Logger.error.mockClear();
          let buildStableUrlWithLogger;

          await jest.isolateModulesAsync(async () => {
            ({ buildStableUrlFromNextData: buildStableUrlWithLogger } =
              await import('../../../scripts/utils/urlUtils.js'));
          });

          expect(buildStableUrlWithLogger(routeInfo, '/news/1/test')).toBeNull();
          expect(globalThis.Logger.error).not.toHaveBeenCalledWith(
            'buildStableUrlFromNextData 失敗',
            expect.anything()
          );
        } finally {
          if (originalSelf === undefined) {
            delete globalThis.self;
          } else {
            globalThis.self = originalSelf;
          }
        }
      });
    });
  });

  describe('resolveStorageUrl', () => {
    it.each([
      [
        '應該優先使用穩定 URL 對於 HK01（Phase 1）',
        'https://www.hk01.com/社會新聞/60320801/示威者遭警方拘捕',
        undefined,
        'https://www.hk01.com/%E7%A4%BE%E6%9C%83%E6%96%B0%E8%81%9E/60320801',
      ],
      [
        '應該降級到 normalizeUrl 對於非已知網站（無 preloaderData）',
        'https://example.com/article?utm_source=test#fragment',
        undefined,
        'https://example.com/article',
      ],
      ['應該處理空字串', '', undefined, ''],
      ['應該處理 null', null, undefined, ''],
    ])('%s', (_name, url, preloaderData, expected) => {
      const result = resolveStorageUrl(url, preloaderData);
      expect(result).toBe(expected);
    });

    describe('Phase 2a: Next.js preloaderData', () => {
      it.each([
        [
          '應該使用 Next.js routeInfo 構建穩定 URL',
          'https://blog.example.com/tech/999/some-long-slug',
          {
            nextRouteInfo: {
              page: '/[category]/[id]/[slug]',
              query: { category: 'tech', id: '999', slug: 'some-long-slug' },
            },
          },
          'https://blog.example.com/tech/999',
        ],
        [
          'Phase 1 應優先於 Phase 2a',
          'https://www.hk01.com/社會新聞/60320801/示威者遭警方拘捕',
          {
            nextRouteInfo: {
              page: '/[category]/[id]/[slug]',
              query: { category: '社會新聞', id: '60320801', slug: '示威者遭警方拘捕' },
            },
          },
          'https://www.hk01.com/%E7%A4%BE%E6%9C%83%E6%96%B0%E8%81%9E/60320801',
        ],
        [
          '應該在 Phase 2a 回退到 normalizeUrl 並保留完整純數字 slug URL（scitw.cc regression）',
          'https://www.scitw.cc/posts/10615',
          { nextRouteInfo: { page: '/posts/[slug]', query: { slug: '10615' } } },
          'https://www.scitw.cc/posts/10615',
        ],
        [
          '應該在 Phase 2a 回退到 normalizeUrl 並保留完整文字 slug URL（安全閥機制）',
          'https://www.scitw.cc/posts/Wiki-Curious-tw',
          { nextRouteInfo: { page: '/posts/[slug]', query: { slug: 'Wiki-Curious-tw' } } },
          'https://www.scitw.cc/posts/Wiki-Curious-tw',
        ],
      ])('%s', (_name, url, preloaderData, expected) => {
        const result = resolveStorageUrl(url, preloaderData);
        expect(result).toBe(expected);
      });
    });

    describe('Phase 2a+: WordPress shortlink', () => {
      it.each([
        [
          '應該使用有 query 參數的 shortlink（?p=ID）',
          'https://blog.example.com/2024/01/01/very-long-slug-title/',
          { shortlink: 'https://blog.example.com/?p=12345' },
          'https://blog.example.com/?p=12345',
        ],
        [
          '應該拒絕沒有 query 參數的 shortlink（首頁 URL）',
          'https://blog.example.com/2024/01/01/some-post/',
          { shortlink: 'https://blog.example.com/' },
          'https://blog.example.com/2024/01/01/some-post',
        ],
        [
          '應該拒絕跨域 shortlink 並回退到 normalizeUrl',
          'https://blog.example.com/2024/01/01/some-post/',
          { shortlink: 'https://evil.com/?p=12345' },
          'https://blog.example.com/2024/01/01/some-post',
        ],
        [
          '應該使用帶 query 參數的 shortlink（無 nextRouteInfo 時）',
          'https://blog.example.com/tech/999/some-long-slug',
          { shortlink: 'https://blog.example.com/?p=999' },
          'https://blog.example.com/?p=999',
        ],
      ])('%s', (_name, url, preloaderData, expected) => {
        const result = resolveStorageUrl(url, preloaderData);
        expect(result).toBe(expected);
      });
    });
  });

  describe('normalizeUrl - 回歸測試', () => {
    it.each([
      ['應該移除 hash fragment', 'https://example.com/page#section', 'https://example.com/page'],
      [
        '應該移除 tracking parameters',
        'https://example.com/page?utm_source=test&utm_medium=email&gclid=123',
        'https://example.com/page',
      ],
      [
        '應該保留非 tracking parameters',
        'https://example.com/page?id=123&category=news',
        'https://example.com/page?id=123&category=news',
      ],
      ['應該移除尾部斜杠（非根路徑）', 'https://example.com/page/', 'https://example.com/page'],
      ['應該保留根路徑的斜杠', 'https://example.com/', 'https://example.com/'],
      ['應該處理 null 輸入', null, ''],
      ['應該處理空字串輸入', '', ''],
      ['應該處理 undefined 輸入', undefined, ''],
    ])('%s', (_name, input, expected) => {
      expect(normalizeUrl(input)).toBe(expected);
    });

    it('應該將非字串輸入轉換為字串', () => {
      // 傳入一個自定義 toString 的物件，使其在轉換為字串後能被視為相對 URL
      const obj = { toString: () => '/relative/path' };
      expect(normalizeUrl(obj)).toBe('/relative/path');

      // 數字會被轉為字串
      expect(normalizeUrl(12_345)).toBe('12345');
    });

    it('應該返回原始輸入對於無法解析的 URL（如惡意/無效格式）', () => {
      // 在 node 的 URL 實作中，某些格式會拋出錯誤
      const invalidUrl = 'https://%';
      expect(normalizeUrl(invalidUrl)).toBe(invalidUrl);
    });
  });

  describe('hasSameOrigin', () => {
    it.each([
      ['相同 HTTPS 來源', 'https://example.com/page1', 'https://example.com/page2', true],
      ['相同含 port 來源', 'http://test.com:8080/a', 'http://test.com:8080/b', true],
      ['protocol 不同', 'https://example.com/page1', 'http://example.com/page2', false],
      ['subdomain 不同', 'https://a.example.com', 'https://b.example.com', false],
      ['port 不同', 'https://example.com:8080', 'https://example.com:8081', false],
      ['左側空值', '', 'https://example.com', false],
      ['右側 null', 'https://example.com', null, false],
      ['兩側 undefined', undefined, undefined, false],
      ['左側無效 URL', 'invalid-url-1', 'https://example.com', false],
      ['右側無效 URL', 'https://example.com', 'invalid-url-2', false],
      ['兩側無效 URL', 'https://%', 'https://%', false],
      ['相對路徑', '/path1', '/path2', false],
      ['無協定相對路徑', 'path1', 'path2', false],
      ['協定與主機名稱大小寫不同', 'HTTPS://EXAMPLE.COM/page', 'https://example.com/page', true],
      ['主機名稱大小寫不同', 'https://EXAMPLE.com', 'https://example.com', true],
    ])('%s', (_name, leftUrl, rightUrl, expected) => {
      expect(hasSameOrigin(leftUrl, rightUrl)).toBe(expected);
    });
  });

  describe('isRootUrl', () => {
    it.each([
      ['根路徑（/）', 'https://example.com/', true],
      ['帶 query 參數的根路徑', 'https://example.com/?p=123', false],
      ['有路徑的 URL', 'https://example.com/some-post', false],
      ['null（視為根路徑）', null, true],
      ['空字串（視為根路徑）', '', true],
      ['無效 URL', 'not-a-valid-url', false],
    ])('應該對%s回傳 %s', (_name, url, expected) => {
      expect(isRootUrl(url)).toBe(expected);
    });
  });

  describe('isSafeStableUrl', () => {
    it.each([
      ['非 root HTTPS URL', 'https://example.com/?p=123', undefined, true],
      ['非 root HTTP URL', 'http://example.com/posts/1', undefined, true],
      ['root URL', 'https://example.com/', undefined, false],
      ['非 http(s) URL', 'ftp://example.com/file', undefined, false],
      ['無效值', 'not-a-valid-url', undefined, false],
      ['空字串', '', undefined, false],
      [
        'requireNormalized=true 時拒絕未正規化的 URL',
        'https://example.com/path/?utm_source=fb#frag',
        { requireNormalized: true },
        false,
      ],
      [
        'requireNormalized=true 時接受已正規化的 URL',
        'https://example.com/path',
        { requireNormalized: true },
        true,
      ],
      [
        'normalize 後變成 site root 的 URL 應視為 unsafe',
        'https://example.com/?utm_source=fb',
        undefined,
        false,
      ],
    ])('應該處理%s', (_name, url, options, expected) => {
      expect(isSafeStableUrl(url, options)).toBe(expected);
    });
  });
});
