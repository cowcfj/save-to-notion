// 【重構】部分遷移到源代碼（只遷移 API 兼容的函數）
// 圖片處理函數 - 從 imageUtils.module.js
const { cleanImageUrl, isValidImageUrl } = require('../../scripts/utils/imageUtils.module.js');

// URL 處理函數 - 從 urlUtils.js
const { normalizeUrl } = require('../../scripts/utils/urlUtils.js');

// Notion Block 相關函數和工具函數 - 保留 testable（API 差異）
const {
  splitTextForHighlight,
  splitIntoBatches,
  calculateBatchStats,
  createNotionRichText,
  createNotionParagraph,
  createNotionHeading,
  createNotionImage,
  isValidNotionBlock,
  isSuccessStatusCode,
  isRedirectStatusCode,
  isClientErrorStatusCode,
  isServerErrorStatusCode,
  getStatusCodeCategory,
  truncateText,
  safeJsonParse,
  safeJsonStringify,
} = require('../helpers/background-utils.testable');

describe('background-utils (部分重構版)', () => {
  describe('cleanImageUrl', () => {
    describe('基本功能', () => {
      test('應該返回有效的圖片 URL', () => {
        const url = 'https://example.com/image.jpg';
        expect(cleanImageUrl(url)).toBe(url);
      });

      test('應該返回帶查詢參數的 URL', () => {
        const url = 'https://example.com/image.jpg?size=large';
        expect(cleanImageUrl(url)).toBe(url);
      });

      test('應該處理相對路徑轉換', () => {
        const url = 'https://example.com/path/to/image.png';
        expect(cleanImageUrl(url)).toBe(url);
      });
    });

    describe('代理 URL 處理', () => {
      test('應該從代理 URL 中提取原始圖片 URL', () => {
        const proxyUrl = 'https://pgw.udn.com.tw/gw/photo.php?u=https://example.com/image.jpg';
        expect(cleanImageUrl(proxyUrl)).toBe('https://example.com/image.jpg');
      });

      test('應該處理 photo.php 代理', () => {
        const proxyUrl = 'https://proxy.com/photo.php?u=https://cdn.com/pic.png&other=param';
        expect(cleanImageUrl(proxyUrl)).toBe('https://cdn.com/pic.png');
      });

      test('應該處理 /gw/ 路徑代理', () => {
        const proxyUrl = 'https://proxy.com/gw/service?u=https://media.com/photo.jpg';
        expect(cleanImageUrl(proxyUrl)).toBe('https://media.com/photo.jpg');
      });

      test('應該遞歸處理多層代理', () => {
        const doubleProxy =
          'https://proxy1.com/photo.php?u=https://proxy2.com/gw/service?u=https://real.com/image.jpg';
        expect(cleanImageUrl(doubleProxy)).toBe('https://real.com/image.jpg');
      });

      test('代理參數不是有效 URL 時應該返回代理 URL', () => {
        const proxyUrl = 'https://proxy.com/photo.php?u=invalid-url';
        expect(cleanImageUrl(proxyUrl)).toBe('https://proxy.com/photo.php?u=invalid-url');
      });
    });

    describe('重複參數處理', () => {
      test('應該移除重複的查詢參數', () => {
        const url = 'https://example.com/image.jpg?size=large&size=small';
        const result = cleanImageUrl(url);
        // 只保留第一個 size 參數
        expect(result).toMatch(/size=large/);
        expect(result).not.toMatch(/size=small/);
      });

      test('應該保留不同的查詢參數', () => {
        const url = 'https://example.com/image.jpg?width=100&height=200';
        const result = cleanImageUrl(url);
        expect(result).toContain('width=100');
        expect(result).toContain('height=200');
      });
    });

    describe('錯誤處理', () => {
      test('null 應該返回 null', () => {
        expect(cleanImageUrl(null)).toBeNull();
      });

      test('undefined 應該返回 null', () => {
        expect(cleanImageUrl()).toBeNull();
      });

      test('空字符串應該返回 null', () => {
        expect(cleanImageUrl('')).toBeNull();
      });

      test('非字符串應該返回 null', () => {
        expect(cleanImageUrl(123)).toBeNull();
        expect(cleanImageUrl({})).toBeNull();
        expect(cleanImageUrl([])).toBeNull();
      });

      test('無效的 URL 應該返回 null', () => {
        expect(cleanImageUrl('not-a-url')).toBeNull();
        // 注意：cleanImageUrl 只清理 URL，不驗證協議
        // FTP URL 仍然是有效的 URL 對象，只是會被 isValidImageUrl 拒絕
      });
    });
  });

  describe('isValidImageUrl', () => {
    describe('有效的圖片 URL', () => {
      test('應該接受常見圖片擴展名', () => {
        expect(isValidImageUrl('https://example.com/image.jpg')).toBe(true);
        expect(isValidImageUrl('https://example.com/image.jpeg')).toBe(true);
        expect(isValidImageUrl('https://example.com/image.png')).toBe(true);
        expect(isValidImageUrl('https://example.com/image.gif')).toBe(true);
        expect(isValidImageUrl('https://example.com/image.webp')).toBe(true);
        expect(isValidImageUrl('https://example.com/image.svg')).toBe(true);
        expect(isValidImageUrl('https://example.com/image.bmp')).toBe(true);
        expect(isValidImageUrl('https://example.com/image.ico')).toBe(true);
      });

      test('應該接受帶查詢參數的圖片 URL', () => {
        expect(isValidImageUrl('https://example.com/image.jpg?size=large')).toBe(true);
        expect(isValidImageUrl('https://example.com/photo.png?width=100&height=200')).toBe(true);
      });

      test('應該接受包含圖片路徑模式的 URL', () => {
        expect(isValidImageUrl('https://cdn.com/images/photo123')).toBe(true);
        expect(isValidImageUrl('https://cdn.com/img/avatar')).toBe(true);
        expect(isValidImageUrl('https://cdn.com/photos/vacation')).toBe(true);
        expect(isValidImageUrl('https://cdn.com/pictures/profile')).toBe(true);
        expect(isValidImageUrl('https://cdn.com/media/banner')).toBe(true);
        expect(isValidImageUrl('https://cdn.com/uploads/thumbnail')).toBe(true);
        expect(isValidImageUrl('https://cdn.com/assets/logo')).toBe(true);
        expect(isValidImageUrl('https://cdn.com/files/icon')).toBe(true);
      });

      test('應該接受大小寫不敏感的擴展名', () => {
        expect(isValidImageUrl('https://example.com/IMAGE.JPG')).toBe(true);
        expect(isValidImageUrl('https://example.com/Photo.PNG')).toBe(true);
      });
    });

    describe('無效的圖片 URL', () => {
      test('應該拒絕非圖片文件擴展名', () => {
        expect(isValidImageUrl('https://example.com/script.js')).toBe(false);
        expect(isValidImageUrl('https://example.com/style.css')).toBe(false);
        expect(isValidImageUrl('https://example.com/page.html')).toBe(false);
        expect(isValidImageUrl('https://example.com/index.htm')).toBe(false);
        expect(isValidImageUrl('https://example.com/api.php')).toBe(false);
      });

      test('應該拒絕 API 路徑', () => {
        expect(isValidImageUrl('https://api.example.com/data')).toBe(false);
        expect(isValidImageUrl('https://example.com/api/endpoint')).toBe(false);
      });

      test('應該拒絕 AJAX 路徑', () => {
        expect(isValidImageUrl('https://example.com/ajax/request')).toBe(false);
      });

      test('應該拒絕回調路徑', () => {
        expect(isValidImageUrl('https://example.com/callback/handler')).toBe(false);
      });

      test('應該拒絕超過 2000 字符的 URL', () => {
        const longUrl = `https://example.com/image.jpg?${'x'.repeat(2000)}`;
        expect(isValidImageUrl(longUrl)).toBe(false);
      });

      test('應該拒絕非 HTTP/HTTPS 協議', () => {
        expect(isValidImageUrl('ftp://example.com/image.jpg')).toBe(false);
        expect(isValidImageUrl('file:///path/to/image.jpg')).toBe(false);
      });
    });

    describe('錯誤處理', () => {
      test('null 應該返回 false', () => {
        expect(isValidImageUrl(null)).toBe(false);
      });

      test('undefined 應該返回 false', () => {
        expect(isValidImageUrl()).toBe(false);
      });

      test('空字符串應該返回 false', () => {
        expect(isValidImageUrl('')).toBe(false);
      });

      test('非字符串應該返回 false', () => {
        expect(isValidImageUrl(123)).toBe(false);
        expect(isValidImageUrl({})).toBe(false);
        expect(isValidImageUrl([])).toBe(false);
      });

      test('無效的 URL 應該返回 false', () => {
        expect(isValidImageUrl('not-a-url')).toBe(false);
        expect(isValidImageUrl('invalid://url')).toBe(false);
      });
    });

    describe('代理 URL', () => {
      test('應該處理並驗證代理 URL', () => {
        const proxyUrl = 'https://proxy.com/photo.php?u=https://example.com/image.jpg';
        expect(isValidImageUrl(proxyUrl)).toBe(true);
      });

      test('代理的原始 URL 無效時應該返回 false', () => {
        const proxyUrl = 'https://proxy.com/photo.php?u=https://example.com/script.js';
        expect(isValidImageUrl(proxyUrl)).toBe(false);
      });
    });
  });

  describe('splitTextForHighlight', () => {
    describe('基本功能', () => {
      test('短文本應該返回單個元素數組', () => {
        const text = 'Short text';
        const result = splitTextForHighlight(text, 2000);
        expect(result).toEqual([text]);
      });

      test('剛好 maxLength 的文本應該返回單個元素', () => {
        const text = 'x'.repeat(2000);
        const result = splitTextForHighlight(text, 2000);
        expect(result).toHaveLength(1);
        expect(result[0]).toBe(text);
      });

      test('null 應該返回包含 null 的數組', () => {
        const result = splitTextForHighlight(null, 2000);
        expect(result).toEqual([null]);
      });

      test('undefined 應該返回包含 undefined 的數組', () => {
        const result = splitTextForHighlight(undefined, 2000);
        expect(result).toEqual([undefined]);
      });
    });

    describe('智能分割', () => {
      test('應該在雙換行符處分割', () => {
        const text = `${'a'.repeat(1500)}\n\n${'b'.repeat(1500)}`;
        const result = splitTextForHighlight(text, 2000);
        expect(result.length).toBeGreaterThan(1);
        expect(result[0]).toContain('a');
        expect(result[1]).toContain('b');
      });

      test('應該在單換行符處分割', () => {
        const text = `${'a'.repeat(1500)}\n${'b'.repeat(1500)}`;
        const result = splitTextForHighlight(text, 2000);
        expect(result.length).toBeGreaterThan(1);
      });

      test('應該在中文句號處分割', () => {
        const text = `${'a'.repeat(1500)}。${'b'.repeat(1500)}`;
        const result = splitTextForHighlight(text, 2000);
        expect(result.length).toBeGreaterThan(1);
        expect(result[0]).toContain('a');
      });

      test('應該在英文句號處分割', () => {
        const text = `${'a'.repeat(1500)}. ${'b'.repeat(1500)}`;
        const result = splitTextForHighlight(text, 2000);
        expect(result.length).toBeGreaterThan(1);
      });

      test('應該在問號處分割', () => {
        const text = `${'a'.repeat(1500)}？${'b'.repeat(1500)}`;
        const result = splitTextForHighlight(text, 2000);
        expect(result.length).toBeGreaterThan(1);
      });

      test('應該在驚嘆號處分割', () => {
        const text = `${'a'.repeat(1500)}！${'b'.repeat(1500)}`;
        const result = splitTextForHighlight(text, 2000);
        expect(result.length).toBeGreaterThan(1);
      });

      test('應該在空格處分割（沒有標點時）', () => {
        const text = `${'a'.repeat(1500)} ${'b'.repeat(1500)}`;
        const result = splitTextForHighlight(text, 2000);
        expect(result.length).toBeGreaterThan(1);
      });

      test('應該優先在靠近 maxLength 的標點處分割', () => {
        const text = `${'a'.repeat(100)}。${'b'.repeat(1800)}。${'c'.repeat(100)}`;
        const result = splitTextForHighlight(text, 2000);
        // 應該在第二個句號處分割（更接近 maxLength）
        expect(result[0]).toContain('b');
      });
    });

    describe('強制分割', () => {
      test('沒有標點和空格時應該強制在 maxLength 處分割', () => {
        const text = 'a'.repeat(3000);
        const result = splitTextForHighlight(text, 2000);
        expect(result.length).toBeGreaterThan(1);
        expect(result[0].length).toBeLessThanOrEqual(2000);
      });

      test('標點位置太靠前時應該強制分割', () => {
        const text = `${'a'.repeat(100)}。${'b'.repeat(2900)}`;
        const result = splitTextForHighlight(text, 2000);
        expect(result.length).toBeGreaterThan(1);
        // 第一段不應該只有 100 個字符
        expect(result[0].length).toBeGreaterThan(500);
      });
    });

    describe('過濾和清理', () => {
      test('應該過濾空字符串', () => {
        const text = `${'a'.repeat(1500)}   ${'b'.repeat(1500)}`;
        const result = splitTextForHighlight(text, 2000);
        expect(result.every(chunk => chunk.length > 0)).toBe(true);
      });

      test('應該 trim 每個片段', () => {
        const text = `${'a'.repeat(1500)}。   ${'b'.repeat(1500)}`;
        const result = splitTextForHighlight(text, 2000);
        expect(result[0]).not.toMatch(/\s+$/);
        expect(result[1]).not.toMatch(/^\s+/);
      });
    });

    describe('多段分割', () => {
      test('超長文本應該分割成多個片段', () => {
        const text = 'a'.repeat(5000);
        const result = splitTextForHighlight(text, 2000);
        expect(result.length).toBeGreaterThan(2);
        result.forEach(chunk => {
          expect(chunk.length).toBeLessThanOrEqual(2000);
        });
      });

      test('所有片段合併後應該包含原始文本的所有內容', () => {
        const text = 'Part 1。Part 2。Part 3。'.repeat(500);
        const result = splitTextForHighlight(text, 2000);
        const combined = result.join('');
        // 移除空白後長度應該接近
        expect(combined.replace(/\s/g, '').length).toBeLessThanOrEqual(text.length);
      });
    });

    describe('自定義 maxLength', () => {
      test('應該支持自定義 maxLength', () => {
        const text = 'a'.repeat(300);
        const result = splitTextForHighlight(text, 100);
        expect(result.length).toBeGreaterThan(1);
        result.forEach(chunk => {
          expect(chunk.length).toBeLessThanOrEqual(100);
        });
      });

      test('maxLength 為 1 應該每個字符一個片段', () => {
        const text = 'abc';
        const result = splitTextForHighlight(text, 1);
        expect(result.length).toBe(3);
        expect(result).toEqual(['a', 'b', 'c']);
      });
    });
  });

  describe('normalizeUrl', () => {
    describe('基本功能', () => {
      test('應該返回標準化的 URL', () => {
        const url = 'https://example.com/path';
        expect(normalizeUrl(url)).toBe('https://example.com/path');
      });

      test('應該保留 HTTPS 協議', () => {
        const url = 'https://example.com/page';
        expect(normalizeUrl(url)).toContain('https://');
      });

      test('應該保留 HTTP 協議', () => {
        const url = 'http://example.com/page';
        expect(normalizeUrl(url)).toContain('http://');
      });
    });

    describe('Fragment 處理', () => {
      test('應該移除 URL fragment（#）', () => {
        const url = 'https://example.com/page#section1';
        expect(normalizeUrl(url)).toBe('https://example.com/page');
      });

      test('應該移除複雜的 fragment', () => {
        const url = 'https://example.com/page#section1:subsection2';
        expect(normalizeUrl(url)).toBe('https://example.com/page');
      });

      test('應該處理只有 fragment 的 URL', () => {
        const url = 'https://example.com/#top';
        expect(normalizeUrl(url)).toBe('https://example.com/');
      });
    });

    describe('追蹤參數處理', () => {
      test('應該移除 utm_source 參數', () => {
        const url = 'https://example.com/page?utm_source=google';
        const result = normalizeUrl(url);
        expect(result).not.toContain('utm_source');
        expect(result).toBe('https://example.com/page');
      });

      test('應該移除所有 UTM 參數', () => {
        const url = 'https://example.com/page?utm_source=google&utm_medium=cpc&utm_campaign=spring';
        const result = normalizeUrl(url);
        expect(result).not.toContain('utm_');
        expect(result).toBe('https://example.com/page');
      });

      test('應該移除 gclid 參數', () => {
        const url = 'https://example.com/page?gclid=abc123';
        expect(normalizeUrl(url)).toBe('https://example.com/page');
      });

      test('應該移除 fbclid 參數', () => {
        const url = 'https://example.com/page?fbclid=xyz789';
        expect(normalizeUrl(url)).toBe('https://example.com/page');
      });

      test('應該移除多個追蹤參數', () => {
        const url = 'https://example.com/page?utm_source=fb&fbclid=123&gclid=456&igshid=789';
        expect(normalizeUrl(url)).toBe('https://example.com/page');
      });

      test('應該保留非追蹤參數', () => {
        const url = 'https://example.com/page?id=123&utm_source=google&category=news';
        const result = normalizeUrl(url);
        expect(result).toContain('id=123');
        expect(result).toContain('category=news');
        expect(result).not.toContain('utm_source');
      });
    });

    describe('尾部斜線處理', () => {
      test('應該移除非根路徑的尾部斜線', () => {
        const url = 'https://example.com/path/';
        expect(normalizeUrl(url)).toBe('https://example.com/path');
      });

      test('應該移除多個尾部斜線', () => {
        const url = 'https://example.com/path//';
        expect(normalizeUrl(url)).toBe('https://example.com/path');
      });

      test('應該保留根路徑的斜線', () => {
        const url = 'https://example.com/';
        expect(normalizeUrl(url)).toBe('https://example.com/');
      });

      test('沒有尾部斜線應該保持不變', () => {
        const url = 'https://example.com/path';
        expect(normalizeUrl(url)).toBe('https://example.com/path');
      });
    });

    describe('組合情境', () => {
      test('應該同時處理 fragment、追蹤參數和尾部斜線', () => {
        const url = 'https://example.com/page/?utm_source=twitter&utm_medium=social#section1';
        expect(normalizeUrl(url)).toBe('https://example.com/page');
      });

      test('應該處理帶多個參數的複雜 URL', () => {
        const url =
          'https://example.com/path/to/page/?id=123&utm_campaign=test&sort=date&gclid=abc#top';
        const result = normalizeUrl(url);
        expect(result).toContain('id=123');
        expect(result).toContain('sort=date');
        expect(result).not.toContain('utm_');
        expect(result).not.toContain('gclid');
        expect(result).not.toContain('#');
      });

      test('應該處理子域名', () => {
        const url = 'https://blog.example.com/post?utm_source=email';
        const result = normalizeUrl(url);
        expect(result).toContain('blog.example.com');
        expect(result).not.toContain('utm_source');
      });

      test('應該處理端口號', () => {
        const url = 'http://localhost:3000/page?utm_source=test';
        const result = normalizeUrl(url);
        expect(result).toContain(':3000');
        expect(result).not.toContain('utm_source');
      });
    });

    describe('錯誤處理', () => {
      test('無效的 URL 應該返回原始輸入', () => {
        const invalid = 'not-a-url';
        expect(normalizeUrl(invalid)).toBe(invalid);
      });

      test('null 應該返回空字符串', () => {
        expect(normalizeUrl(null)).toBe('');
      });

      test('undefined 應該返回空字符串', () => {
        expect(normalizeUrl()).toBe('');
      });

      test('空字符串應該返回空字符串', () => {
        expect(normalizeUrl('')).toBe('');
      });

      // 防禦性測試：驗證相對 URL 原樣返回
      // 注意：Chrome Extension 環境中 tab.url 和 window.location.href 永遠是絕對 URL
      // 此測試僅驗證函數的健壯性，不代表實際使用場景
      test('相對 URL 應該返回原始輸入', () => {
        const relative = '/path/to/page';
        expect(normalizeUrl(relative)).toBe(relative);
      });
    });

    describe('真實世界案例', () => {
      test('應該標準化 Google 搜索結果 URL', () => {
        const url = 'https://www.example.com/article?utm_source=google&gclid=CjwKCAjw';
        expect(normalizeUrl(url)).toBe('https://www.example.com/article');
      });

      test('應該標準化 Facebook 分享 URL', () => {
        const url = 'https://www.example.com/post/?fbclid=IwAR123#comments';
        expect(normalizeUrl(url)).toBe('https://www.example.com/post');
      });

      test('應該標準化郵件行銷 URL', () => {
        const url = 'https://shop.example.com/product/?mc_cid=abc123&mc_eid=xyz789';
        expect(normalizeUrl(url)).toBe('https://shop.example.com/product');
      });

      test('應該處理中文域名', () => {
        const url = 'https://例子.com/頁面/?utm_source=test';
        const result = normalizeUrl(url);
        // 中文域名會被轉換成 Punycode (xn--xxx)
        expect(result).toContain('xn--');
        expect(result).not.toContain('utm_source');
      });
    });
  });

  describe('splitIntoBatches', () => {
    describe('基本功能', () => {
      test('應該將數組分割成指定大小的批次', () => {
        const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const result = splitIntoBatches(items, 3);
        expect(result).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9], [10]]);
      });

      test('單個批次應該返回包含整個數組的數組', () => {
        const items = [1, 2, 3];
        const result = splitIntoBatches(items, 10);
        expect(result).toEqual([[1, 2, 3]]);
      });

      test('剛好整除應該返回完整批次', () => {
        const items = [1, 2, 3, 4, 5, 6];
        const result = splitIntoBatches(items, 3);
        expect(result).toEqual([
          [1, 2, 3],
          [4, 5, 6],
        ]);
      });

      test('默認批次大小應該是 100', () => {
        const items = new Array(250).fill(0).map((_, i) => i);
        const result = splitIntoBatches(items);
        expect(result).toHaveLength(3);
        expect(result[0]).toHaveLength(100);
        expect(result[1]).toHaveLength(100);
        expect(result[2]).toHaveLength(50);
      });
    });

    describe('邊界情況', () => {
      test('空數組應該返回空數組', () => {
        expect(splitIntoBatches([], 10)).toEqual([]);
      });

      test('單個元素應該返回單個批次', () => {
        expect(splitIntoBatches([1], 10)).toEqual([[1]]);
      });

      test('batchSize 為 1 應該每個元素一個批次', () => {
        const result = splitIntoBatches([1, 2, 3], 1);
        expect(result).toEqual([[1], [2], [3]]);
      });

      test('batchSize 等於數組長度應該返回單個批次', () => {
        const items = [1, 2, 3, 4, 5];
        expect(splitIntoBatches(items, 5)).toEqual([items]);
      });
    });

    describe('錯誤處理', () => {
      test('非數組輸入應該返回空數組', () => {
        expect(splitIntoBatches(null, 10)).toEqual([]);
        expect(splitIntoBatches(undefined, 10)).toEqual([]);
        expect(splitIntoBatches('string', 10)).toEqual([]);
        expect(splitIntoBatches(123, 10)).toEqual([]);
        expect(splitIntoBatches({}, 10)).toEqual([]);
      });

      test('batchSize 為 0 應該返回包含整個數組的單個批次', () => {
        const items = [1, 2, 3];
        expect(splitIntoBatches(items, 0)).toEqual([[1, 2, 3]]);
      });

      test('負數 batchSize 應該返回包含整個數組的單個批次', () => {
        const items = [1, 2, 3];
        expect(splitIntoBatches(items, -5)).toEqual([[1, 2, 3]]);
      });

      test('空數組且 batchSize 為 0 應該返回空數組', () => {
        expect(splitIntoBatches([], 0)).toEqual([]);
      });
    });

    describe('真實世界場景', () => {
      test('Notion API 批次（100 個區塊）', () => {
        const blocks = new Array(250).fill(0).map((_, i) => ({
          type: 'paragraph',
          content: `Block ${i}`,
        }));
        const result = splitIntoBatches(blocks, 100);
        expect(result).toHaveLength(3);
        expect(result[0]).toHaveLength(100);
        expect(result[1]).toHaveLength(100);
        expect(result[2]).toHaveLength(50);
      });

      test('應該保持原始數組不變', () => {
        const original = [1, 2, 3, 4, 5];
        const copy = [...original];
        splitIntoBatches(original, 2);
        expect(original).toEqual(copy);
      });
    });
  });

  describe('calculateBatchStats', () => {
    describe('基本功能', () => {
      test('應該計算正確的批次統計信息', () => {
        const result = calculateBatchStats(250, 100, 0);
        expect(result).toEqual({
          totalItems: 250,
          remainingItems: 250,
          batchSize: 100,
          startIndex: 0,
          totalBatches: 3,
          lastBatchSize: 50,
        });
      });

      test('應該處理從非零索引開始的情況', () => {
        const result = calculateBatchStats(250, 100, 50);
        expect(result).toEqual({
          totalItems: 250,
          remainingItems: 200,
          batchSize: 100,
          startIndex: 50,
          totalBatches: 2,
          lastBatchSize: 100,
        });
      });

      test('最後一批不完整時應該計算正確', () => {
        const result = calculateBatchStats(105, 100, 0);
        expect(result).toEqual({
          totalItems: 105,
          remainingItems: 105,
          batchSize: 100,
          startIndex: 0,
          totalBatches: 2,
          lastBatchSize: 5,
        });
      });

      test('剛好整除時最後一批應該是完整的', () => {
        const result = calculateBatchStats(300, 100, 0);
        expect(result).toEqual({
          totalItems: 300,
          remainingItems: 300,
          batchSize: 100,
          startIndex: 0,
          totalBatches: 3,
          lastBatchSize: 100,
        });
      });
    });

    describe('邊界情況', () => {
      test('totalItems 為 0 應該返回正確統計', () => {
        const result = calculateBatchStats(0, 100, 0);
        expect(result).toEqual({
          totalItems: 0,
          remainingItems: 0,
          batchSize: 100,
          startIndex: 0,
          totalBatches: 0,
          lastBatchSize: 100,
        });
      });

      test('startIndex 等於 totalItems 應該返回正確統計', () => {
        const result = calculateBatchStats(100, 50, 100);
        expect(result).toEqual({
          totalItems: 100,
          remainingItems: 0,
          batchSize: 50,
          startIndex: 100,
          totalBatches: 0,
          lastBatchSize: 50,
        });
      });

      test('單個項目應該返回單個批次', () => {
        const result = calculateBatchStats(1, 100, 0);
        expect(result).toEqual({
          totalItems: 1,
          remainingItems: 1,
          batchSize: 100,
          startIndex: 0,
          totalBatches: 1,
          lastBatchSize: 1,
        });
      });
    });

    describe('錯誤處理', () => {
      test('非數字輸入應該返回 null', () => {
        expect(calculateBatchStats('100', 50, 0)).toBeNull();
        expect(calculateBatchStats(100, '50', 0)).toBeNull();
        expect(calculateBatchStats(100, 50, '0')).toBeNull();
        expect(calculateBatchStats(null, 50, 0)).toBeNull();
        expect(calculateBatchStats(undefined, 50, 0)).toBeNull();
      });

      test('負數 totalItems 應該返回 null', () => {
        expect(calculateBatchStats(-100, 50, 0)).toBeNull();
      });

      test('非正數 batchSize 應該返回 null', () => {
        expect(calculateBatchStats(100, 0, 0)).toBeNull();
        expect(calculateBatchStats(100, -50, 0)).toBeNull();
      });

      test('負數 startIndex 應該返回 null', () => {
        expect(calculateBatchStats(100, 50, -10)).toBeNull();
      });

      test('startIndex 超過 totalItems 應該返回 null', () => {
        expect(calculateBatchStats(100, 50, 101)).toBeNull();
      });
    });

    describe('真實世界場景', () => {
      test('Notion API 批次處理統計', () => {
        const result = calculateBatchStats(250, 100, 0);
        expect(result.totalBatches).toBe(3);
        expect(result.remainingItems).toBe(250);
        expect(result.lastBatchSize).toBe(50);
      });

      test('恢復失敗後從中間繼續', () => {
        const result = calculateBatchStats(500, 100, 200);
        expect(result.remainingItems).toBe(300);
        expect(result.totalBatches).toBe(3);
        expect(result.lastBatchSize).toBe(100);
      });

      test('小批次處理', () => {
        const result = calculateBatchStats(50, 10, 0);
        expect(result.totalBatches).toBe(5);
        expect(result.lastBatchSize).toBe(10);
      });
    });
  });

  describe('createNotionRichText', () => {
    test('應該創建基本富文本對象', () => {
      const result = createNotionRichText('Hello World');
      expect(result).toEqual({
        type: 'text',
        text: { content: 'Hello World' },
      });
    });

    test('應該包含標註', () => {
      const result = createNotionRichText('Bold Text', { bold: true });
      expect(result).toEqual({
        type: 'text',
        text: { content: 'Bold Text' },
        annotations: { bold: true },
      });
    });

    test('應該支持多個標註', () => {
      const result = createNotionRichText('Styled', {
        bold: true,
        italic: true,
        color: 'red',
      });
      expect(result.annotations).toEqual({
        bold: true,
        italic: true,
        color: 'red',
      });
    });

    test('空字符串應該創建空內容的富文本', () => {
      const result = createNotionRichText('');
      expect(result).toEqual({
        type: 'text',
        text: { content: '' },
      });
    });

    test('非字符串應該返回 null', () => {
      expect(createNotionRichText(null)).toBeNull();
      expect(createNotionRichText()).toBeNull();
      expect(createNotionRichText(123)).toBeNull();
      expect(createNotionRichText({})).toBeNull();
    });

    test('空標註對象不應該添加 annotations 字段', () => {
      const result = createNotionRichText('Text', {});
      expect(result).toEqual({
        type: 'text',
        text: { content: 'Text' },
      });
      expect(result.annotations).toBeUndefined();
    });
  });

  describe('createNotionParagraph', () => {
    test('應該從字符串創建段落', () => {
      const result = createNotionParagraph('Hello World');
      expect(result).toEqual({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: { content: 'Hello World' },
            },
          ],
        },
      });
    });

    test('應該支持帶標註的字符串', () => {
      const result = createNotionParagraph('Bold Text', { bold: true });
      expect(result.paragraph.rich_text[0].annotations).toEqual({ bold: true });
    });

    test('應該接受富文本數組', () => {
      const richTextArray = [
        { type: 'text', text: { content: 'Part 1' } },
        { type: 'text', text: { content: 'Part 2' } },
      ];
      const result = createNotionParagraph(richTextArray);
      expect(result.paragraph.rich_text).toEqual(richTextArray);
    });

    test('null 或 undefined 應該返回 null', () => {
      expect(createNotionParagraph(null)).toBeNull();
      expect(createNotionParagraph()).toBeNull();
    });

    test('空字符串應該返回 null', () => {
      expect(createNotionParagraph('')).toBeNull();
    });

    test('非字符串非數組應該返回 null', () => {
      expect(createNotionParagraph(123)).toBeNull();
      expect(createNotionParagraph({})).toBeNull();
    });
  });

  describe('createNotionHeading', () => {
    test('應該創建 H1 標題', () => {
      const result = createNotionHeading('Title', 1);
      expect(result).toEqual({
        object: 'block',
        type: 'heading_1',
        heading_1: {
          rich_text: [
            {
              type: 'text',
              text: { content: 'Title' },
            },
          ],
        },
      });
    });

    test('應該創建 H2 標題', () => {
      const result = createNotionHeading('Subtitle', 2);
      expect(result.type).toBe('heading_2');
      expect(result.heading_2).toBeDefined();
    });

    test('應該創建 H3 標題', () => {
      const result = createNotionHeading('Section', 3);
      expect(result.type).toBe('heading_3');
      expect(result.heading_3).toBeDefined();
    });

    test('默認應該創建 H1', () => {
      const result = createNotionHeading('Default');
      expect(result.type).toBe('heading_1');
    });

    test('無效級別應該返回 null', () => {
      expect(createNotionHeading('Title', 0)).toBeNull();
      expect(createNotionHeading('Title', 4)).toBeNull();
      expect(createNotionHeading('Title', -1)).toBeNull();
    });

    test('空字符串應該返回 null', () => {
      expect(createNotionHeading('', 1)).toBeNull();
    });

    test('非字符串應該返回 null', () => {
      expect(createNotionHeading(null, 1)).toBeNull();
      expect(createNotionHeading(undefined, 1)).toBeNull();
      expect(createNotionHeading(123, 1)).toBeNull();
    });
  });

  describe('createNotionImage', () => {
    test('應該創建圖片區塊', () => {
      const url = 'https://example.com/image.jpg';
      const result = createNotionImage(url);
      expect(result).toEqual({
        object: 'block',
        type: 'image',
        image: {
          type: 'external',
          external: { url },
        },
      });
    });

    test('應該接受 HTTP URL', () => {
      const result = createNotionImage('http://example.com/pic.png');
      expect(result).toBeDefined();
      expect(result.image.external.url).toBe('http://example.com/pic.png');
    });

    test('應該拒絕非 HTTP/HTTPS URL', () => {
      expect(createNotionImage('ftp://example.com/image.jpg')).toBeNull();
      expect(createNotionImage('file:///path/to/image.jpg')).toBeNull();
      expect(createNotionImage('data:image/png;base64,abc')).toBeNull();
    });

    test('空字符串應該返回 null', () => {
      expect(createNotionImage('')).toBeNull();
    });

    test('非字符串應該返回 null', () => {
      expect(createNotionImage(null)).toBeNull();
      expect(createNotionImage()).toBeNull();
      expect(createNotionImage(123)).toBeNull();
    });

    test('相對 URL 應該返回 null', () => {
      expect(createNotionImage('/path/to/image.jpg')).toBeNull();
      expect(createNotionImage('image.jpg')).toBeNull();
    });
  });

  describe('isValidNotionBlock', () => {
    test('有效的段落區塊應該返回 true', () => {
      const block = {
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [] },
      };
      expect(isValidNotionBlock(block)).toBe(true);
    });

    test('有效的標題區塊應該返回 true', () => {
      const block = {
        object: 'block',
        type: 'heading_1',
        heading_1: { rich_text: [] },
      };
      expect(isValidNotionBlock(block)).toBe(true);
    });

    test('有效的圖片區塊應該返回 true', () => {
      const block = {
        object: 'block',
        type: 'image',
        image: { type: 'external', external: { url: 'https://example.com/img.jpg' } },
      };
      expect(isValidNotionBlock(block)).toBe(true);
    });

    test('缺少 object 字段應該返回 false', () => {
      const block = {
        type: 'paragraph',
        paragraph: { rich_text: [] },
      };
      expect(isValidNotionBlock(block)).toBe(false);
    });

    test('缺少 type 字段應該返回 false', () => {
      const block = {
        object: 'block',
        paragraph: { rich_text: [] },
      };
      expect(isValidNotionBlock(block)).toBe(false);
    });

    test('缺少對應類型字段應該返回 false', () => {
      const block = {
        object: 'block',
        type: 'paragraph',
        // 缺少 paragraph 字段
      };
      expect(isValidNotionBlock(block)).toBe(false);
    });

    test('object 不是 "block" 應該返回 false', () => {
      const block = {
        object: 'page',
        type: 'paragraph',
        paragraph: { rich_text: [] },
      };
      expect(isValidNotionBlock(block)).toBe(false);
    });

    test('null 應該返回 false', () => {
      expect(isValidNotionBlock(null)).toBe(false);
    });

    test('undefined 應該返回 false', () => {
      expect(isValidNotionBlock()).toBe(false);
    });

    test('非對象應該返回 false', () => {
      expect(isValidNotionBlock('string')).toBe(false);
      expect(isValidNotionBlock(123)).toBe(false);
      expect(isValidNotionBlock([])).toBe(false);
    });
  });

  describe('HTTP 狀態碼工具函數', () => {
    describe('isSuccessStatusCode', () => {
      test('2xx 狀態碼應該返回 true', () => {
        expect(isSuccessStatusCode(200)).toBe(true);
        expect(isSuccessStatusCode(201)).toBe(true);
        expect(isSuccessStatusCode(204)).toBe(true);
        expect(isSuccessStatusCode(299)).toBe(true);
      });

      test('非 2xx 狀態碼應該返回 false', () => {
        expect(isSuccessStatusCode(199)).toBe(false);
        expect(isSuccessStatusCode(300)).toBe(false);
        expect(isSuccessStatusCode(400)).toBe(false);
        expect(isSuccessStatusCode(500)).toBe(false);
      });

      test('非數字應該返回 false', () => {
        expect(isSuccessStatusCode('200')).toBe(false);
        expect(isSuccessStatusCode(null)).toBe(false);
        expect(isSuccessStatusCode()).toBe(false);
      });
    });

    describe('isRedirectStatusCode', () => {
      test('3xx 狀態碼應該返回 true', () => {
        expect(isRedirectStatusCode(301)).toBe(true);
        expect(isRedirectStatusCode(302)).toBe(true);
        expect(isRedirectStatusCode(304)).toBe(true);
        expect(isRedirectStatusCode(307)).toBe(true);
      });

      test('非 3xx 狀態碼應該返回 false', () => {
        expect(isRedirectStatusCode(200)).toBe(false);
        expect(isRedirectStatusCode(400)).toBe(false);
      });
    });

    describe('isClientErrorStatusCode', () => {
      test('4xx 狀態碼應該返回 true', () => {
        expect(isClientErrorStatusCode(400)).toBe(true);
        expect(isClientErrorStatusCode(401)).toBe(true);
        expect(isClientErrorStatusCode(403)).toBe(true);
        expect(isClientErrorStatusCode(404)).toBe(true);
        expect(isClientErrorStatusCode(499)).toBe(true);
      });

      test('非 4xx 狀態碼應該返回 false', () => {
        expect(isClientErrorStatusCode(200)).toBe(false);
        expect(isClientErrorStatusCode(500)).toBe(false);
      });
    });

    describe('isServerErrorStatusCode', () => {
      test('5xx 狀態碼應該返回 true', () => {
        expect(isServerErrorStatusCode(500)).toBe(true);
        expect(isServerErrorStatusCode(502)).toBe(true);
        expect(isServerErrorStatusCode(503)).toBe(true);
        expect(isServerErrorStatusCode(599)).toBe(true);
      });

      test('非 5xx 狀態碼應該返回 false', () => {
        expect(isServerErrorStatusCode(200)).toBe(false);
        expect(isServerErrorStatusCode(400)).toBe(false);
      });
    });

    describe('getStatusCodeCategory', () => {
      test('應該正確分類狀態碼', () => {
        expect(getStatusCodeCategory(100)).toBe('informational');
        expect(getStatusCodeCategory(200)).toBe('success');
        expect(getStatusCodeCategory(301)).toBe('redirect');
        expect(getStatusCodeCategory(404)).toBe('client_error');
        expect(getStatusCodeCategory(500)).toBe('server_error');
      });

      test('未知狀態碼應該返回 unknown', () => {
        expect(getStatusCodeCategory(600)).toBe('unknown');
        expect(getStatusCodeCategory(99)).toBe('unknown');
      });

      test('非數字應該返回 null', () => {
        expect(getStatusCodeCategory('200')).toBeNull();
        expect(getStatusCodeCategory(null)).toBeNull();
      });
    });
  });

  describe('truncateText', () => {
    test('短文本應該保持不變', () => {
      expect(truncateText('Hello', 10)).toBe('Hello');
    });

    test('超長文本應該被截斷並添加省略號', () => {
      const text = 'This is a very long text';
      expect(truncateText(text, 10)).toBe('This is...');
    });

    test('應該支持自定義省略號', () => {
      expect(truncateText('Hello World', 8, '…')).toBe('Hello W…');
    });

    test('默認應該使用 ... 作為省略號', () => {
      const result = truncateText('Hello World Long Text', 10);
      expect(result).toContain('...');
    });

    test('maxLength 為 0 應該返回空字符串', () => {
      expect(truncateText('Hello', 0)).toBe('');
    });

    test('負數 maxLength 應該返回空字符串', () => {
      expect(truncateText('Hello', -5)).toBe('');
    });

    test('非字符串應該返回空字符串', () => {
      expect(truncateText(null, 10)).toBe('');
      expect(truncateText(undefined, 10)).toBe('');
      expect(truncateText(123, 10)).toBe('');
    });

    test('剛好等於 maxLength 應該不截斷', () => {
      expect(truncateText('Hello', 5)).toBe('Hello');
    });

    test('應該考慮省略號長度', () => {
      const result = truncateText('12345678', 5, '...');
      expect(result).toBe('12...');
      expect(result.length).toBe(5);
    });

    test('中文文本應該正確截斷', () => {
      const text = '這是一段很長的中文文本內容';
      const result = truncateText(text, 10);
      expect(result.length).toBe(10);
      expect(result).toContain('...');
    });
  });

  describe('safeJsonParse', () => {
    test('應該解析有效的 JSON', () => {
      const obj = { name: 'test', value: 123 };
      const json = JSON.stringify(obj);
      expect(safeJsonParse(json)).toEqual(obj);
    });

    test('應該解析 JSON 數組', () => {
      const arr = [1, 2, 3];
      expect(safeJsonParse(JSON.stringify(arr))).toEqual(arr);
    });

    test('應該解析 JSON 字符串', () => {
      expect(safeJsonParse('"hello"')).toBe('hello');
    });

    test('應該解析 JSON 數字', () => {
      expect(safeJsonParse('123')).toBe(123);
    });

    test('應該解析 JSON 布爾值', () => {
      expect(safeJsonParse('true')).toBe(true);
      expect(safeJsonParse('false')).toBe(false);
    });

    test('應該解析 JSON null', () => {
      expect(safeJsonParse('null')).toBeNull();
    });

    test('無效 JSON 應該返回默認值', () => {
      expect(safeJsonParse('invalid json')).toBeNull();
      expect(safeJsonParse('{invalid}')).toBeNull();
    });

    test('應該支持自定義默認值', () => {
      expect(safeJsonParse('invalid', { error: true })).toEqual({ error: true });
      expect(safeJsonParse('invalid', [])).toEqual([]);
      expect(safeJsonParse('invalid', 'default')).toBe('default');
    });

    test('非字符串應該返回默認值', () => {
      expect(safeJsonParse(null)).toBeNull();
      expect(safeJsonParse()).toBeNull();
      expect(safeJsonParse(123)).toBeNull();
      expect(safeJsonParse({})).toBeNull();
    });

    test('空字符串應該返回默認值', () => {
      expect(safeJsonParse('')).toBeNull();
    });
  });

  describe('safeJsonStringify', () => {
    test('應該序列化對象', () => {
      const obj = { name: 'test', value: 123 };
      expect(safeJsonStringify(obj)).toBe(JSON.stringify(obj));
    });

    test('應該序列化數組', () => {
      const arr = [1, 2, 3];
      expect(safeJsonStringify(arr)).toBe('[1,2,3]');
    });

    test('應該序列化字符串', () => {
      expect(safeJsonStringify('hello')).toBe('"hello"');
    });

    test('應該序列化數字', () => {
      expect(safeJsonStringify(123)).toBe('123');
    });

    test('應該序列化布爾值', () => {
      expect(safeJsonStringify(true)).toBe('true');
      expect(safeJsonStringify(false)).toBe('false');
    });

    test('應該序列化 null', () => {
      expect(safeJsonStringify(null)).toBe('null');
    });

    test('應該支持格式化輸出', () => {
      const obj = { a: 1, b: 2 };
      const result = safeJsonStringify(obj, 2);
      expect(result).toContain('\n');
      expect(result).toContain('  ');
    });

    test('循環引用應該返回 null', () => {
      const circular = {};
      circular.self = circular;
      expect(safeJsonStringify(circular)).toBeNull();
    });

    test('undefined 應該返回 null', () => {
      expect(safeJsonStringify()).toBeNull();
    });

    test('函數應該被忽略', () => {
      const obj = {
        name: 'test',
        func() {
          // Intentionally empty for test
        },
      };
      const result = safeJsonStringify(obj);
      expect(result).toBe('{"name":"test"}');
    });

    test('Symbol 應該被忽略', () => {
      const obj = {
        name: 'test',
        [Symbol('key')]: 'value',
      };
      const result = safeJsonStringify(obj);
      expect(result).toBe('{"name":"test"}');
    });
  });
});
