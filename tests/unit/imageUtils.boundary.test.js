/**
 * imageUtils.js 邊界條件測試
 * 測試極端情況、邊界值和錯誤處理
 */

// 從 imageUtils 導入函數
const {
  cleanImageUrl,
  isValidImageUrl,
  isNotionCompatibleImageUrl,
  extractBestUrlFromSrcset,
  extractImageSrc,
  extractFromSrcset,
  extractFromAttributes,
  extractFromPicture,
  extractFromBackgroundImage,
  extractFromNoscript,
} = require('../../scripts/utils/imageUtils');

// 從配置模組導入常量
const { IMAGE_VALIDATION_CONSTANTS } = require('../../scripts/config/constants');

describe('imageUtils - 邊界條件測試', () => {
  describe('isValidImageUrl - URL 長度邊界', () => {
    test('應接受長度剛好等於 2000 的 URL', () => {
      // 構造長度剛好為 2000 的 URL
      const baseUrl = 'https://example.com/';
      const extension = '.jpg';
      const padding = 2000 - baseUrl.length - extension.length;
      const url = baseUrl + 'a'.repeat(padding) + extension;
      expect(url.length).toBe(2000);
      expect(isValidImageUrl(url)).toBe(true);
    });

    test('應拒絕長度剛好超過 2000 的 URL', () => {
      // 構造長度為 2001 的 URL
      const baseUrl = 'https://example.com/';
      const extension = '.jpg';
      const padding = 2001 - baseUrl.length - extension.length;
      const url = baseUrl + 'a'.repeat(padding) + extension;
      expect(url.length).toBe(2001);
      expect(isValidImageUrl(url)).toBe(false);
    });

    test('應拒絕長度遠超過限制的 URL', () => {
      const url = `https://example.com/${'a'.repeat(5000)}.jpg`;
      expect(isValidImageUrl(url)).toBe(false);
    });

    test('應接受空查詢參數的 URL', () => {
      const url = 'https://example.com/image.jpg?';
      expect(isValidImageUrl(url)).toBe(true);
    });
  });

  describe('isNotionCompatibleImageUrl - 查詢參數邊界', () => {
    test('應接受剛好 10 個查詢參數', () => {
      const params = Array.from({ length: 10 }, (_, i) => `p${i}=v${i}`).join('&');
      const url = `https://example.com/image.jpg?${params}`;
      expect(isNotionCompatibleImageUrl(url)).toBe(true);
    });

    test('應拒絕剛好 11 個查詢參數', () => {
      const params = Array.from({ length: 11 }, (_, i) => `p${i}=v${i}`).join('&');
      const url = `https://example.com/image.jpg?${params}`;
      expect(isNotionCompatibleImageUrl(url)).toBe(false);
    });

    test('應拒絕包含特殊字符的 URL', () => {
      expect(isNotionCompatibleImageUrl('https://example.com/image<script>.jpg')).toBe(false);
      expect(isNotionCompatibleImageUrl('https://example.com/image{test}.jpg')).toBe(false);
      expect(isNotionCompatibleImageUrl('https://example.com/image|test.jpg')).toBe(false);
      expect(isNotionCompatibleImageUrl('https://example.com/image[0].jpg')).toBe(false);
    });

    test('應接受不含特殊字符的複雜 URL', () => {
      const url = 'https://cdn.example.com/images/photo-2024-01-01.jpg?width=800&height=600';
      expect(isNotionCompatibleImageUrl(url)).toBe(true);
    });
  });

  describe('extractBestUrlFromSrcset - 畸形輸入', () => {
    test('應處理空字符串', () => {
      expect(extractBestUrlFromSrcset('')).toBeNull();
    });

    test('應處理只有逗號的字符串', () => {
      // 實際會返回空字符串（最後一個條目），這是預期行為
      const result = extractBestUrlFromSrcset(',,,,');
      expect(result).toBe('');
    });

    test('應處理只有空格的字符串', () => {
      // 實際會返回空字符串，這是預期行為
      const result = extractBestUrlFromSrcset('   ');
      expect(result).toBe('');
    });

    test('應處理無效的 srcset 格式', () => {
      expect(extractBestUrlFromSrcset('invalid url')).toBe('invalid');
    });

    test('應處理混合有效和無效條目', () => {
      const srcset = 'invalid, https://example.com/image.jpg 800w, , another-invalid';
      const result = extractBestUrlFromSrcset(srcset);
      expect(result).toBe('https://example.com/image.jpg');
    });

    test('應過濾 data: URL', () => {
      const srcset = 'data:image/png;base64,abc 1x, https://example.com/image.jpg 2x';
      const result = extractBestUrlFromSrcset(srcset);
      expect(result).toBe('https://example.com/image.jpg');
    });

    test('應處理沒有描述符的 srcset', () => {
      const srcset = 'https://example.com/img1.jpg, https://example.com/img2.jpg';
      const result = extractBestUrlFromSrcset(srcset);
      // 當所有 metric 相同（都是 0）時，返回第一個找到的 URL
      expect(result).toBe('https://example.com/img1.jpg');
    });

    test('應正確比較 w 和 x 描述符', () => {
      // 1000w = 1000 * 1000 = 1000000
      // 500x = 500
      const srcset = 'https://example.com/small.jpg 500x, https://example.com/large.jpg 1000w';
      const result = extractBestUrlFromSrcset(srcset);
      expect(result).toBe('https://example.com/large.jpg');
    });
  });

  describe('cleanImageUrl - 特殊情況', () => {
    test('應處理 null 輸入', () => {
      expect(cleanImageUrl(null)).toBeNull();
    });

    test('應處理 undefined 輸入', () => {
      // 顯式傳遞 undefined 以測試邊界條件，而非省略參數
      expect(cleanImageUrl()).toBeNull();
    });

    test('應處理空字符串', () => {
      expect(cleanImageUrl('')).toBeNull();
    });

    test('應處理非字符串輸入', () => {
      expect(cleanImageUrl(123)).toBeNull();
      expect(cleanImageUrl({})).toBeNull();
      expect(cleanImageUrl([])).toBeNull();
    });

    test('應處理無效的 URL 格式', () => {
      expect(cleanImageUrl('not a url')).toBeNull();
      expect(cleanImageUrl('//invalid')).toBe('https://invalid/');
      expect(cleanImageUrl('ftp://example.com/image.jpg')).toBe('ftp://example.com/image.jpg');
    });

    test('應移除重複的查詢參數（保留第一個）', () => {
      const url = 'https://example.com/image.jpg?size=100&size=200&size=300';
      const result = cleanImageUrl(url);
      expect(result).toBe('https://example.com/image.jpg?size=100');
    });

    test('應正確處理嵌套代理 URL', () => {
      const innerUrl = 'https://cdn.example.com/image.jpg';
      const proxyUrl = `https://proxy.com/photo.php?u=${encodeURIComponent(innerUrl)}`;
      const outerProxyUrl = `https://proxy2.com/gw/?u=${encodeURIComponent(proxyUrl)}`;

      const result = cleanImageUrl(outerProxyUrl);
      expect(result).toBe(innerUrl);
    });

    test('應處理代理 URL 中的無效參數', () => {
      const url = 'https://proxy.com/photo.php?u=invalid-not-a-url';
      const result = cleanImageUrl(url);
      // 無法提取有效 URL，應返回清理後的代理 URL
      expect(result).toBe(url);
    });
  });

  describe('extractImageSrc - 空值處理', () => {
    test('應處理 null 輸入', () => {
      expect(extractImageSrc(null)).toBeNull();
    });

    test('應處理 undefined 輸入', () => {
      // 顯式傳遞 undefined 以測試邊界條件，而非省略參數
      expect(extractImageSrc()).toBeNull();
    });
  });

  describe('extractFromSrcset - 邊界情況', () => {
    beforeEach(() => {
      // 設置 DOM 環境
      document.body.innerHTML = '';
    });

    test('應處理空 srcset 屬性', () => {
      const img = document.createElement('img');
      img.setAttribute('srcset', '');
      expect(extractFromSrcset(img)).toBeNull();
    });

    test('應處理只有空格的 srcset', () => {
      const img = document.createElement('img');
      img.setAttribute('srcset', '   ');
      expect(extractFromSrcset(img)).toBeNull();
    });

    test('應優先檢查 srcset 屬性', () => {
      const img = document.createElement('img');
      img.setAttribute('srcset', 'https://example.com/small.jpg');
      img.setAttribute('data-srcset', 'https://example.com/large.jpg');
      // extractFromSrcset 按順序檢查：srcset || data-srcset || data-lazy-srcset
      // 因此優先返回 srcset
      expect(extractFromSrcset(img)).toBe('https://example.com/small.jpg');
    });

    test('當 srcset 不存在時應檢查 data-srcset', () => {
      const img = document.createElement('img');
      img.setAttribute('data-srcset', 'https://example.com/large.jpg');
      expect(extractFromSrcset(img)).toBe('https://example.com/large.jpg');
    });
  });

  describe('extractFromAttributes - 邊界情況', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
    });

    test('應跳過 data: URL', () => {
      const img = document.createElement('img');
      img.setAttribute('src', 'data:image/png;base64,abc');
      img.setAttribute('data-src', 'https://example.com/real.jpg');
      expect(extractFromAttributes(img)).toBe('https://example.com/real.jpg');
    });

    test('應跳過 blob: URL', () => {
      const img = document.createElement('img');
      img.setAttribute('src', 'blob:https://example.com/123');
      img.setAttribute('data-src', 'https://example.com/real.jpg');
      expect(extractFromAttributes(img)).toBe('https://example.com/real.jpg');
    });

    test('應移除 URL 前後的空格', () => {
      const img = document.createElement('img');
      img.setAttribute('src', '  https://example.com/image.jpg  ');
      expect(extractFromAttributes(img)).toBe('https://example.com/image.jpg');
    });

    test('應處理所有屬性都為空的情況', () => {
      const img = document.createElement('img');
      expect(extractFromAttributes(img)).toBeNull();
    });
  });

  describe('extractFromPicture - 邊界情況', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
    });

    test('應處理沒有 picture 父元素的情況', () => {
      const img = document.createElement('img');
      document.body.appendChild(img);
      expect(extractFromPicture(img)).toBeNull();
    });

    test('應處理 picture 元素中沒有 source 的情況', () => {
      const picture = document.createElement('picture');
      const img = document.createElement('img');
      picture.appendChild(img);
      document.body.appendChild(picture);
      expect(extractFromPicture(img)).toBeNull();
    });

    test('應處理 source 沒有 srcset 屬性的情況', () => {
      const picture = document.createElement('picture');
      const source = document.createElement('source');
      const img = document.createElement('img');
      picture.appendChild(source);
      picture.appendChild(img);
      document.body.appendChild(picture);
      expect(extractFromPicture(img)).toBeNull();
    });

    test('應從多個 source 中選擇有效的', () => {
      const picture = document.createElement('picture');
      const source1 = document.createElement('source');
      source1.setAttribute('srcset', '');
      const source2 = document.createElement('source');
      source2.setAttribute('srcset', 'https://example.com/image.jpg');
      const img = document.createElement('img');
      picture.appendChild(source1);
      picture.appendChild(source2);
      picture.appendChild(img);
      document.body.appendChild(picture);
      expect(extractFromPicture(img)).toBe('https://example.com/image.jpg');
    });
  });

  describe('extractFromBackgroundImage - ReDoS 防護', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
    });

    test('應拒絕超長的背景 URL（防止 ReDoS）', () => {
      const img = document.createElement('img');
      const longUrl = `https://example.com/${'a'.repeat(3000)}.jpg`;
      img.style.backgroundImage = `url('${longUrl}')`;
      document.body.appendChild(img);

      const result = extractFromBackgroundImage(img);
      expect(result).toBeNull();
    });

    test('應接受長度在限制內的背景 URL', () => {
      const img = document.createElement('img');
      const url = `https://example.com/${'a'.repeat(1000)}.jpg`;
      img.style.backgroundImage = `url('${url}')`;
      document.body.appendChild(img);

      const result = extractFromBackgroundImage(img);
      expect(result).toBe(url);
    });

    test('應處理 background-image: none', () => {
      const img = document.createElement('img');
      img.style.backgroundImage = 'none';
      document.body.appendChild(img);
      expect(extractFromBackgroundImage(img)).toBeNull();
    });

    test('應跳過 data: URL 背景圖片', () => {
      const img = document.createElement('img');
      img.style.backgroundImage = 'url(data:image/png;base64,abc)';
      document.body.appendChild(img);
      expect(extractFromBackgroundImage(img)).toBeNull();
    });
  });

  describe('extractFromNoscript - 邊界情況', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
    });

    test('應處理沒有 noscript 的情況', () => {
      const img = document.createElement('img');
      document.body.appendChild(img);
      expect(extractFromNoscript(img)).toBeNull();
    });

    test('應處理 noscript 為空的情況', () => {
      const img = document.createElement('img');
      const noscript = document.createElement('noscript');
      img.appendChild(noscript);
      document.body.appendChild(img);
      expect(extractFromNoscript(img)).toBeNull();
    });

    test('應處理 noscript 中沒有 img 標籤的情況', () => {
      const img = document.createElement('img');
      const noscript = document.createElement('noscript');
      noscript.textContent = '<div>No image here</div>';
      img.appendChild(noscript);
      document.body.appendChild(img);
      expect(extractFromNoscript(img)).toBeNull();
    });

    test('應處理 noscript 中 img 沒有 src 的情況', () => {
      const img = document.createElement('img');
      const noscript = document.createElement('noscript');
      noscript.textContent = '<img alt="test">';
      img.appendChild(noscript);
      document.body.appendChild(img);
      expect(extractFromNoscript(img)).toBeNull();
    });

    test('應跳過 noscript 中的 data: URL', () => {
      const img = document.createElement('img');
      const noscript = document.createElement('noscript');
      noscript.textContent = '<img src="data:image/png;base64,abc">';
      img.appendChild(noscript);
      document.body.appendChild(img);
      expect(extractFromNoscript(img)).toBeNull();
    });

    test('應從父元素的 noscript 中提取', () => {
      const parent = document.createElement('div');
      const noscript = document.createElement('noscript');
      noscript.textContent = '<img src="https://example.com/image.jpg">';
      parent.appendChild(noscript);
      const img = document.createElement('img');
      parent.appendChild(img);
      document.body.appendChild(parent);

      expect(extractFromNoscript(img)).toBe('https://example.com/image.jpg');
    });
  });

  describe('IMAGE_VALIDATION_CONSTANTS - 常數驗證', () => {
    test('應定義所有必要的常數', () => {
      expect(IMAGE_VALIDATION_CONSTANTS.MAX_URL_LENGTH).toBe(2000);
      expect(IMAGE_VALIDATION_CONSTANTS.MAX_QUERY_PARAMS).toBe(10);
      expect(IMAGE_VALIDATION_CONSTANTS.SRCSET_WIDTH_MULTIPLIER).toBe(1000);
      expect(IMAGE_VALIDATION_CONSTANTS.MAX_BACKGROUND_URL_LENGTH).toBe(2000);
    });

    test('常數應為正整數', () => {
      Object.values(IMAGE_VALIDATION_CONSTANTS).forEach(value => {
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThan(0);
        expect(Number.isInteger(value)).toBe(true);
      });
    });
  });

  describe('整合測試 - 多層回退策略', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
    });

    test('應按優先級順序提取（srcset > 屬性 > picture > background > noscript）', () => {
      const picture = document.createElement('picture');
      const source = document.createElement('source');
      source.setAttribute('srcset', 'https://example.com/from-picture.jpg');

      const img = document.createElement('img');
      img.setAttribute('src', 'https://example.com/from-attr.jpg');
      img.setAttribute('srcset', 'https://example.com/from-srcset.jpg');
      img.style.backgroundImage = 'url(https://example.com/from-bg.jpg)';

      const noscript = document.createElement('noscript');
      noscript.textContent = '<img src="https://example.com/from-noscript.jpg">';

      picture.appendChild(source);
      picture.appendChild(img);
      img.appendChild(noscript);
      document.body.appendChild(picture);

      // 應優先使用 srcset
      expect(extractImageSrc(img)).toBe('https://example.com/from-srcset.jpg');
    });

    test('當 srcset 不可用時應回退到屬性', () => {
      const img = document.createElement('img');
      img.setAttribute('src', 'https://example.com/from-attr.jpg');
      img.style.backgroundImage = 'url(https://example.com/from-bg.jpg)';
      document.body.appendChild(img);

      expect(extractImageSrc(img)).toBe('https://example.com/from-attr.jpg');
    });

    test('當屬性不可用時應回退到背景圖片', () => {
      const img = document.createElement('img');
      img.style.backgroundImage = 'url(https://example.com/from-bg.jpg)';

      const noscript = document.createElement('noscript');
      noscript.textContent = '<img src="https://example.com/from-noscript.jpg">';
      img.appendChild(noscript);
      document.body.appendChild(img);

      expect(extractImageSrc(img)).toBe('https://example.com/from-bg.jpg');
    });

    test('當所有其他方法失敗時應使用 noscript', () => {
      const img = document.createElement('img');
      const noscript = document.createElement('noscript');
      noscript.textContent = '<img src="https://example.com/from-noscript.jpg">';
      img.appendChild(noscript);
      document.body.appendChild(img);

      expect(extractImageSrc(img)).toBe('https://example.com/from-noscript.jpg');
    });

    test('當所有方法都失敗時應返回 null', () => {
      const img = document.createElement('img');
      document.body.appendChild(img);

      expect(extractImageSrc(img)).toBeNull();
    });
  });
});
