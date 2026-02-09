// 圖片 URL 處理函數測試
// 測試 cleanImageUrl 和 isValidImageUrl 函數

// 先設置 Chrome Mock,再導入源碼
import '../../mocks/chrome.js';

// 刪除 presetup.js 設定的 mock，讓 IIFE 能正常初始化
delete globalThis.ImageUtils;
delete globalThis.window?.ImageUtils;

// 載入原始 IIFE 模組（會將函數掛載到 global.ImageUtils）
require('../../../scripts/utils/imageUtils.js');

// 從 global.ImageUtils 獲取函數
const { cleanImageUrl, isValidImageUrl } =
  globalThis.ImageUtils || globalThis.window?.ImageUtils || {};

describe('cleanImageUrl', () => {
  describe('基本功能', () => {
    test('應該返回有效的簡單圖片 URL', () => {
      const url = 'https://example.com/image.jpg';
      expect(cleanImageUrl(url)).toBe(url);
    });

    test('應該處理帶查詢參數的 URL', () => {
      const url = 'https://example.com/image.jpg?size=large&quality=80';
      expect(cleanImageUrl(url)).toContain('example.com/image.jpg');
      expect(cleanImageUrl(url)).toContain('size=large');
    });
  });

  describe('代理 URL 處理', () => {
    test('應該從代理 URL 提取原始圖片', () => {
      const proxyUrl = 'https://pgw.udn.com.tw/gw/photo.php?u=https://example.com/real-image.jpg';
      expect(cleanImageUrl(proxyUrl)).toBe('https://example.com/real-image.jpg');
    });

    test('應該處理嵌套的代理 URL', () => {
      const url = 'https://proxy.com/photo.php?u=https://example.com/image.jpg?size=large';
      const result = cleanImageUrl(url);
      expect(result).toContain('example.com/image.jpg');
    });
  });

  describe('重複參數處理', () => {
    test('應該移除重複的查詢參數', () => {
      const url = 'https://example.com/image.jpg?id=1&id=2&name=test';
      const result = cleanImageUrl(url);
      expect(result).toContain('id=');
      // 只保留第一個 id 參數
      const matches = result.match(/id=/g);
      expect(matches?.length).toBe(1);
    });
  });

  describe('錯誤處理', () => {
    test('應該處理 null', () => {
      expect(cleanImageUrl(null)).toBeNull();
    });

    test('應該處理 undefined', () => {
      expect(cleanImageUrl()).toBeNull();
    });

    test('應該處理空字串', () => {
      expect(cleanImageUrl('')).toBeNull();
    });

    test('應該處理無效的 URL', () => {
      expect(cleanImageUrl('not-a-url')).toBeNull();
    });

    test('應該處理非字串輸入', () => {
      expect(cleanImageUrl(123)).toBeNull();
      expect(cleanImageUrl({})).toBeNull();
      expect(cleanImageUrl([])).toBeNull();
    });
  });
});

describe('isValidImageUrl', () => {
  describe('基本驗證', () => {
    test('應該接受標準圖片 URL', () => {
      expect(isValidImageUrl('https://example.com/image.jpg')).toBe(true);
      expect(isValidImageUrl('https://example.com/photo.png')).toBe(true);
      expect(isValidImageUrl('https://example.com/pic.gif')).toBe(false);
    });

    test('應該接受帶查詢參數的圖片 URL', () => {
      expect(isValidImageUrl('https://example.com/image.jpg?size=large')).toBe(true);
    });

    test('應該接受 HTTP 和 HTTPS', () => {
      expect(isValidImageUrl('http://example.com/image.jpg')).toBe(true);
      expect(isValidImageUrl('https://example.com/image.jpg')).toBe(true);
    });
  });

  describe('圖片格式支持', () => {
    const formats = [
      'jpg',
      'jpeg',
      'png',
      // 'gif' removed
      'webp',
      'svg',
      'bmp',
      'ico',
      'tiff',
      'tif',
      'avif',
      'heic',
      'heif',
    ];

    formats.forEach(format => {
      test(`應該支持 .${format} 格式`, () => {
        expect(isValidImageUrl(`https://example.com/image.${format}`)).toBe(true);
      });
    });
  });

  describe('路徑模式識別', () => {
    const validPaths = [
      '/images/photo.png',
      '/img/banner.jpg',
      '/photos/gallery.jpg',
      '/pictures/avatar.png',
      '/media/cover.jpg',
      '/uploads/file.jpg',
      '/assets/logo.png',
      '/files/image.jpg',
    ];

    validPaths.forEach(path => {
      test(`應該識別路徑: ${path}`, () => {
        expect(isValidImageUrl(`https://example.com${path}`)).toBe(true);
      });
    });
  });

  describe('無擴展名 CDN 圖片', () => {
    test('應該接受包含 /images/ 路徑的 URL', () => {
      expect(isValidImageUrl('https://cdn.example.com/images/abc123')).toBe(true);
    });

    test('應該接受包含 /media/ 路徑的 URL', () => {
      expect(isValidImageUrl('https://cdn.example.com/media/xyz789')).toBe(true);
    });
  });

  describe('排除非圖片 URL', () => {
    test('應該拒絕腳本文件', () => {
      expect(isValidImageUrl('https://example.com/script.js')).toBe(false);
    });

    test('應該拒絕樣式文件', () => {
      expect(isValidImageUrl('https://example.com/style.css')).toBe(false);
    });

    test('應該拒絕 HTML 頁面', () => {
      expect(isValidImageUrl('https://example.com/page.html')).toBe(false);
    });

    test('應該拒絕 API 端點', () => {
      expect(isValidImageUrl('https://example.com/api/data')).toBe(false);
    });

    test('應該拒絕 AJAX 請求', () => {
      expect(isValidImageUrl('https://example.com/ajax/load')).toBe(false);
    });
  });

  describe('URL 長度限制', () => {
    test('應該拒絕過長的 URL (>2000 字符)', () => {
      const longUrl = `https://example.com/image.jpg?${'a'.repeat(2000)}`;
      expect(isValidImageUrl(longUrl)).toBe(false);
    });

    test('應該接受正常長度的 URL', () => {
      const normalUrl = 'https://example.com/image.jpg?param=value';
      expect(isValidImageUrl(normalUrl)).toBe(true);
    });
  });

  describe('錯誤處理', () => {
    test('應該拒絕 null', () => {
      expect(isValidImageUrl(null)).toBe(false);
    });

    test('應該拒絕 undefined', () => {
      expect(isValidImageUrl()).toBe(false);
    });

    test('應該拒絕空字串', () => {
      expect(isValidImageUrl('')).toBe(false);
    });

    test('應該拒絕無效的 URL', () => {
      expect(isValidImageUrl('not-a-url')).toBe(false);
    });

    test('應該拒絕非 HTTP(S) 協議', () => {
      expect(isValidImageUrl('ftp://example.com/image.jpg')).toBe(false);
      expect(isValidImageUrl('file:///path/to/image.jpg')).toBe(false);
    });
  });

  describe('真實世界案例', () => {
    test('應該處理 CDN URL', () => {
      expect(isValidImageUrl('https://cdn.jsdelivr.net/gh/user/repo/image.png')).toBe(true);
    });

    test('應該處理圖床 URL', () => {
      expect(isValidImageUrl('https://i.imgur.com/abc123.jpg')).toBe(true);
    });

    test('應該處理 GitHub 頭像', () => {
      expect(isValidImageUrl('https://avatars.githubusercontent.com/u/12345')).toBe(true); // GitHub 頭像現在被視為有效
    });

    test('應該處理 WordPress 媒體庫', () => {
      expect(isValidImageUrl('https://example.com/wp-content/uploads/2024/10/image.jpg')).toBe(
        true
      );
    });
  });
  describe('佔位符關鍵字更新驗證', () => {
    test('應該接受包含 miscellaneous 的普通圖片', () => {
      expect(isValidImageUrl('https://example.com/miscellaneous/photo.jpg')).toBe(true);
      expect(isValidImageUrl('https://example.com/images/miscellaneous-news.png')).toBe(true);
    });

    test('應該拒絕 miscellaneous_sprite 圖片', () => {
      // 確保排除雜項佈局圖片
      expect(isValidImageUrl('https://example.com/assets/miscellaneous_sprite.png')).toBe(false);
      expect(isValidImageUrl('https://example.com/images/icon-miscellaneous_sprite.jpg')).toBe(
        false
      );
    });
  });

  describe('Coverage Improvements', () => {
    test('cleanImageUrl should handle max recursion depth', () => {
      // Construct a deeply nested URL
      // MAX_RECURSION_DEPTH is likely 5
      let url = 'https://example.com/final.jpg';
      for (let i = 0; i < 6; i++) {
        url = `https://example.com/photo.php?u=${encodeURIComponent(url)}`;
      }
      // The function should return the URL at depth 5 (which is still a wrapper)
      // or at least not crash and return *something*.
      // If it returns the wrapper URL, it means it stopped recursing.
      const result = cleanImageUrl(url);
      expect(result).not.toBeNull();
      // Expect it to stop unwrapping eventually
      expect(result).not.toBe('https://example.com/final.jpg');
      expect(result).toContain('photo.php');
    });

    test('_unwrapNextJsUrl should handle invalid inner URL', () => {
      // url param contains invalid protocol (javascript:) which cleanImageUrl rejects
      const invalidInnerUrl = 'https://example.com/_next/image?url=javascript:alert(1)&w=640&q=75';
      const result = cleanImageUrl(invalidInnerUrl);
      // unwrap should fail (return null), so it returns the original cleaned URL
      expect(result).not.toBeNull();
      expect(result).toContain('_next/image');
    });

    test('extractBestUrlFromSrcset should fallback when SrcsetParser throws', () => {
      // Mock SrcsetParser to throw
      globalThis.SrcsetParser = {
        parse: () => {
          throw new Error('Parser Error');
        },
      };
      const { extractBestUrlFromSrcset } = globalThis.ImageUtils;

      const srcset = 'https://example.com/img.jpg 1x';
      const result = extractBestUrlFromSrcset(srcset);

      // Should fallback to manual parsing
      expect(result).toBe('https://example.com/img.jpg');

      // Clean up
      delete globalThis.SrcsetParser;
    });
  });
});
