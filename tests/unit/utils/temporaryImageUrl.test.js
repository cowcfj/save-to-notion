let isTemporaryImageUrl;

beforeAll(async () => {
  ({ isTemporaryImageUrl } = await import('../../../scripts/utils/temporaryImageUrl.js'));
});

describe('isTemporaryImageUrl', () => {
  describe('Patreon signed CDN URL', () => {
    test.each([
      [
        '完整 token-hash + token-time 的 patreonusercontent.com URL',
        'https://c10.patreonusercontent.com/4/patreon-media/p/post/157239355/abc/eyJ3IjoxMDgwfQ==/1.png?token-hash=ABC123&token-time=1700000000',
      ],
      [
        '只有 token-time 的 patreonusercontent.com URL',
        'https://c10.patreonusercontent.com/4/patreon-media/p/post/x/y/z/1.png?token-time=1700000000',
      ],
      [
        '只有 token-hash 的 patreonusercontent.com URL',
        'https://c10.patreonusercontent.com/4/patreon-media/p/post/x/y/z/1.png?token-hash=ABCDEF',
      ],
      [
        '不同 subdomain 的 patreonusercontent.com URL',
        'https://c8.patreonusercontent.com/4/patreon-media/foo.png?token-time=1700000000&token-hash=xyz',
      ],
    ])('應該偵測%s', (_name, url) => {
      expect(isTemporaryImageUrl(url)).toBe(true);
    });
  });

  describe('應視為 safe 的情況', () => {
    test.each([
      [
        '沒有 token query 的 patreonusercontent.com',
        'https://c10.patreonusercontent.com/static/logo.png',
      ],
      ['一般 patreon.com 文章 URL', 'https://www.patreon.com/posts/liang-wen-dao-he-157239355'],
      [
        '帶 token-time 但 hostname 非 patreonusercontent.com 的 URL',
        'https://example.com/image.png?token-time=1700000000&token-hash=ABC',
      ],
      ['一般 https 圖片 URL', 'https://example.com/img.jpg'],
    ])('%s 視為 safe', (_name, url) => {
      expect(isTemporaryImageUrl(url)).toBe(false);
    });
  });

  describe('無效輸入', () => {
    test.each([null, undefined, '', 123, {}, 'not-a-url', '://broken'])(
      '%p 應回傳 false 而非拋例外',
      input => {
        expect(isTemporaryImageUrl(input)).toBe(false);
      }
    );
  });
});
