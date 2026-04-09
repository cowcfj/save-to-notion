/**
 * background.js 工具函數單元測試
 * 測試 URL 和文本處理工具函數
 */

describe('background.js - 工具函數', () => {
  // Mock cleanImageUrl 函數
  globalThis.cleanImageUrl = function (url) {
    if (!url || typeof url !== 'string') {
      return null;
    }

    try {
      const urlObj = new URL(url);

      // 處理代理 URL
      if (urlObj.pathname.includes('/photo.php') || urlObj.pathname.includes('/gw/')) {
        const uParam = urlObj.searchParams.get('u');
        if (uParam && /^https?:\/\//.test(uParam)) {
          return cleanImageUrl(uParam);
        }
      }

      // 移除重複的查詢參數
      const params = new URLSearchParams();
      for (const [key, value] of urlObj.searchParams.entries()) {
        if (!params.has(key)) {
          params.set(key, value);
        }
      }
      urlObj.search = params.toString();

      return urlObj.href;
    } catch {
      return null;
    }
  };

  // Mock isValidImageUrl 函數
  globalThis.isValidImageUrl = function (url) {
    if (!url || typeof url !== 'string') {
      return false;
    }

    const cleanedUrl = cleanImageUrl(url);
    if (!cleanedUrl) {
      return false;
    }

    if (!/^https?:\/\//i.test(cleanedUrl)) {
      return false;
    }
    if (cleanedUrl.length > 2000) {
      return false;
    }

    const imageExtensions =
      /\.(?:jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|tif|avif|heic|heif)(?:\?.*)?$/i;
    if (imageExtensions.test(cleanedUrl)) {
      return true;
    }

    const imagePathPatterns = [
      /\/images?\//i,
      /\/imgs?\//i,
      /\/photos?\//i,
      /\/pictures?\//i,
      /\/media\//i,
      /\/uploads?\//i,
      /\/assets?\//i,
      /\/files?\//i,
    ];

    const excludePatterns = [
      /\.(js|css|html|htm|php|asp|jsp)(\?|$)/i,
      /\/api\//i,
      /\/ajax\//i,
      /\/callback/i,
    ];

    if (excludePatterns.some(pattern => pattern.test(cleanedUrl))) {
      return false;
    }

    return imagePathPatterns.some(pattern => pattern.test(cleanedUrl));
  };

  describe('cleanImageUrl', () => {
    test('應該返回有效的圖片 URL', () => {
      const url = 'https://example.com/image.jpg';
      const result = cleanImageUrl(url);

      expect(result).toBe(url);
    });

    test('應該處理代理 URL', () => {
      const proxyUrl = 'https://pgw.udn.com.tw/gw/photo.php?u=https://example.com/image.jpg';
      const result = cleanImageUrl(proxyUrl);

      expect(result).toBe('https://example.com/image.jpg');
    });

    test('應該移除重複的查詢參數', () => {
      const url = 'https://example.com/image.jpg?size=large&size=small&quality=high';
      const result = cleanImageUrl(url);

      // 應該只保留第一個 size 參數
      expect(result).toContain('size=large');
      expect(result).toContain('quality=high');
      // 計算 size 出現次數
      const sizeCount = (result.match(/size=/g) || []).length;
      expect(sizeCount).toBe(1);
    });

    test('應該處理無效 URL', () => {
      const result = cleanImageUrl('not-a-url');

      expect(result).toBeNull();
    });

    test('應該處理 null', () => {
      const result = cleanImageUrl(null);

      expect(result).toBeNull();
    });

    test('應該處理 undefined', () => {
      const result = cleanImageUrl();

      expect(result).toBeNull();
    });

    test('應該處理非字符串', () => {
      const result = cleanImageUrl(123);

      expect(result).toBeNull();
    });

    test('應該處理嵌套的代理 URL', () => {
      const nestedProxy =
        'https://proxy1.com/photo.php?u=https://proxy2.com/photo.php?u=https://example.com/image.jpg';
      const result = cleanImageUrl(nestedProxy);

      expect(result).toBe('https://example.com/image.jpg');
    });
  });

  describe('isValidImageUrl', () => {
    test('應該識別有效的圖片 URL（帶擴展名）', () => {
      const urls = [
        'https://example.com/image.jpg',
        'https://example.com/photo.jpeg',
        'https://example.com/pic.png',
        'https://example.com/animation.gif',
        'https://example.com/modern.webp',
        'https://example.com/hdr.avif',
        'https://example.com/livephoto.heic',
        'https://example.com/proraw.heif',
      ];

      urls.forEach(url => {
        expect(isValidImageUrl(url)).toBe(true);
      });
    });

    test('應該識別圖片路徑模式', () => {
      const urls = [
        'https://example.com/images/123',
        'https://example.com/img/photo',
        'https://example.com/photos/456',
        'https://example.com/media/789',
      ];

      urls.forEach(url => {
        expect(isValidImageUrl(url)).toBe(true);
      });
    });

    test('應該拒絕非圖片 URL', () => {
      const urls = [
        'https://example.com/script.js',
        'https://example.com/style.css',
        'https://example.com/page.html',
        'https://example.com/api/data',
      ];

      urls.forEach(url => {
        expect(isValidImageUrl(url)).toBe(false);
      });
    });

    test('應該拒絕過長的 URL', () => {
      const longUrl = `https://example.com/${'a'.repeat(2000)}.jpg`;

      expect(isValidImageUrl(longUrl)).toBe(false);
    });

    test('應該拒絕非 HTTP/HTTPS URL', () => {
      const urls = [
        'ftp://example.com/image.jpg',
        'file:///local/image.jpg',
        'data:image/png;base64,iVBOR...',
      ];

      urls.forEach(url => {
        expect(isValidImageUrl(url)).toBe(false);
      });
    });

    test('應該處理帶查詢參數的圖片 URL', () => {
      const url = 'https://example.com/image.jpg?size=large&quality=high';

      expect(isValidImageUrl(url)).toBe(true);
    });

    test('應該處理 null', () => {
      expect(isValidImageUrl(null)).toBe(false);
    });

    test('應該處理 undefined', () => {
      expect(isValidImageUrl()).toBe(false);
    });

    test('應該處理空字符串', () => {
      expect(isValidImageUrl('')).toBe(false);
    });
  });
});
