import { isTemporaryImageUrl } from '../../../scripts/utils/imageUtils.js';

describe('isTemporaryImageUrl', () => {
  describe('Patreon signed CDN URL', () => {
    test('應該偵測完整 token-hash + token-time 的 patreonusercontent.com URL', () => {
      const url =
        'https://c10.patreonusercontent.com/4/patreon-media/p/post/157239355/abc/eyJ3IjoxMDgwfQ==/1.png?token-hash=ABC123&token-time=1700000000';
      expect(isTemporaryImageUrl(url)).toBe(true);
    });

    test('應該偵測只有 token-time 的 patreonusercontent.com URL', () => {
      const url =
        'https://c10.patreonusercontent.com/4/patreon-media/p/post/x/y/z/1.png?token-time=1700000000';
      expect(isTemporaryImageUrl(url)).toBe(true);
    });

    test('應該偵測只有 token-hash 的 patreonusercontent.com URL', () => {
      const url =
        'https://c10.patreonusercontent.com/4/patreon-media/p/post/x/y/z/1.png?token-hash=ABCDEF';
      expect(isTemporaryImageUrl(url)).toBe(true);
    });

    test('應該偵測不同 subdomain 的 patreonusercontent.com URL', () => {
      const url =
        'https://c8.patreonusercontent.com/4/patreon-media/foo.png?token-time=1700000000&token-hash=xyz';
      expect(isTemporaryImageUrl(url)).toBe(true);
    });
  });

  describe('應視為 safe 的情況', () => {
    test('沒有 token query 的 patreonusercontent.com 視為 safe', () => {
      const url = 'https://c10.patreonusercontent.com/static/logo.png';
      expect(isTemporaryImageUrl(url)).toBe(false);
    });

    test('一般 patreon.com 文章 URL 視為 safe', () => {
      const url = 'https://www.patreon.com/posts/liang-wen-dao-he-157239355';
      expect(isTemporaryImageUrl(url)).toBe(false);
    });

    test('帶 token-time 但 hostname 非 patreonusercontent.com 視為 safe (避免 false positive)', () => {
      const url = 'https://example.com/image.png?token-time=1700000000&token-hash=ABC';
      expect(isTemporaryImageUrl(url)).toBe(false);
    });

    test('一般 https 圖片 URL 視為 safe', () => {
      expect(isTemporaryImageUrl('https://example.com/img.jpg')).toBe(false);
    });
  });

  describe('無效輸入', () => {
    test('null / undefined / empty / non-string 應回傳 false', () => {
      expect(isTemporaryImageUrl(null)).toBe(false);
      expect(isTemporaryImageUrl(undefined)).toBe(false);
      expect(isTemporaryImageUrl('')).toBe(false);
      expect(isTemporaryImageUrl(123)).toBe(false);
      expect(isTemporaryImageUrl({})).toBe(false);
    });

    test('malformed URL 應回傳 false 而非拋例外', () => {
      expect(isTemporaryImageUrl('not-a-url')).toBe(false);
      expect(isTemporaryImageUrl('://broken')).toBe(false);
    });
  });
});
