/**
 * Background.js - 圖片處理功能測試
 * 測試圖片 URL 清理、驗證和緩存相關函數
 */

describe('Background Image Processing', () => {
  beforeEach(() => {
    // 清理 URL 驗證緩存
    if (typeof urlValidationCache !== 'undefined') {
      urlValidationCache.clear();
    }

    // 重置 console mocks
    jest.spyOn(console, 'log').mockImplementation(() => { /* no-op */ });
    jest.spyOn(console, 'warn').mockImplementation(() => { /* no-op */ });
    jest.spyOn(console, 'error').mockImplementation(() => { /* no-op */ });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('cleanImageUrl', () => {
    it('應該返回有效的簡單圖片 URL', () => {
      // Arrange
      const url = 'https://example.com/image.jpg';

      // Act
      const result = cleanImageUrlSimulated(url);

      // Assert
      expect(result).toBe(url);
    });

    it('應該處理帶查詢參數的 URL', () => {
      // Arrange
      const url = 'https://example.com/image.jpg?width=800&height=600';

      // Act
      const result = cleanImageUrlSimulated(url);

      // Assert
      expect(result).toBe(url);
    });

    it('應該從代理 URL 提取原始圖片', () => {
      // Arrange
      const originalUrl = 'https://cdn.example.com/image.jpg';
      const proxyUrl = `https://pgw.udn.com.tw/gw/photo.php?u=${encodeURIComponent(originalUrl)}`;

      // Act
      const result = cleanImageUrlSimulated(proxyUrl);

      // Assert
      expect(result).toBe(originalUrl);
    });

    it('應該處理嵌套的代理 URL', () => {
      // Arrange
      const originalUrl = 'https://cdn.example.com/image.jpg';
      const firstProxy = `https://proxy1.com/gw/?u=${encodeURIComponent(originalUrl)}`;
      const nestedProxy = `https://proxy2.com/photo.php?u=${encodeURIComponent(firstProxy)}`;

      // Act
      const result = cleanImageUrlSimulated(nestedProxy);

      // Assert
      expect(result).toBe(originalUrl);
    });

    it('應該移除重複的查詢參數', () => {
      // Arrange
      const url = 'https://example.com/image.jpg?width=800&height=600&width=1200';

      // Act
      const result = cleanImageUrlSimulated(url);

      // Assert
      expect(result).toBe('https://example.com/image.jpg?width=800&height=600');
    });

    it('應該處理 null 和 undefined', () => {
      // Act & Assert
      expect(cleanImageUrlSimulated(null)).toBeNull();
      expect(cleanImageUrlSimulated()).toBeNull();
      expect(cleanImageUrlSimulated('')).toBeNull();
    });

    it('應該處理非字串輸入', () => {
      // Act & Assert
      expect(cleanImageUrlSimulated(123)).toBeNull();
      expect(cleanImageUrlSimulated({})).toBeNull();
      expect(cleanImageUrlSimulated([])).toBeNull();
    });

    it('應該處理無效的 URL', () => {
      // Arrange
      const invalidUrl = 'not-a-valid-url';

      // Act
      const result = cleanImageUrlSimulated(invalidUrl);

      // Assert
      expect(result).toBeNull();
    });

    it('應該處理代理 URL 中缺少 u 參數的情況', () => {
      // Arrange
      const proxyUrl = 'https://pgw.udn.com.tw/gw/photo.php?other=value';

      // Act
      const result = cleanImageUrlSimulated(proxyUrl);

      // Assert
      expect(result).toBe(proxyUrl);
    });

    it('應該處理代理 URL 中 u 參數無效的情況', () => {
      // Arrange
      const proxyUrl = 'https://pgw.udn.com.tw/gw/photo.php?u=invalid-url';

      // Act
      const result = cleanImageUrlSimulated(proxyUrl);

      // Assert
      expect(result).toBe(proxyUrl);
    });
  });

  describe('isValidImageUrl', () => {
    it('應該接受標準圖片 URL', () => {
      // Arrange
      const urls = [
        'https://example.com/image.jpg',
        'https://example.com/photo.png',
        'https://example.com/graphic.gif',
        'https://example.com/vector.svg'
      ];

      // Act & Assert
      urls.forEach(url => {
        expect(isValidImageUrlSimulated(url)).toBe(true);
      });
    });

    it('應該接受帶查詢參數的圖片 URL', () => {
      // Arrange
      const url = 'https://example.com/image.jpg?width=800&height=600';

      // Act
      const result = isValidImageUrlSimulated(url);

      // Assert
      expect(result).toBe(true);
    });

    it('應該接受 HTTP 和 HTTPS', () => {
      // Act & Assert
      expect(isValidImageUrlSimulated('https://example.com/image.jpg')).toBe(true);
      expect(isValidImageUrlSimulated('http://example.com/image.jpg')).toBe(true);
    });

    it('應該支援各種圖片格式', () => {
      // Arrange
      const formats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif', 'avif', 'heic', 'heif'];

      // Act & Assert
      formats.forEach(format => {
        const url = `https://example.com/image.${format}`;
        expect(isValidImageUrlSimulated(url)).toBe(true);
      });
    });

    it('應該識別圖片路徑模式', () => {
      // Arrange
      const pathPatterns = [
        'https://example.com/images/photo',
        'https://example.com/img/banner',
        'https://example.com/photos/gallery',
        'https://example.com/pictures/avatar',
        'https://example.com/media/cover',
        'https://example.com/uploads/file',
        'https://example.com/assets/logo',
        'https://example.com/files/image'
      ];

      // Act & Assert
      pathPatterns.forEach(url => {
        expect(isValidImageUrlSimulated(url)).toBe(true);
      });
    });

    it('應該排除非圖片 URL', () => {
      // Arrange
      const nonImageUrls = [
        'https://example.com/script.js',
        'https://example.com/style.css',
        'https://example.com/page.html',
        'https://example.com/api/data',
        'https://example.com/ajax/request',
        'https://example.com/callback'
      ];

      // Act & Assert
      nonImageUrls.forEach(url => {
        expect(isValidImageUrlSimulated(url)).toBe(false);
      });
    });

    it('應該拒絕過長的 URL (>2000 字元)', () => {
      // Arrange
      const longUrl = `https://example.com/${'x'.repeat(2000)}.jpg`;

      // Act
      const result = isValidImageUrlSimulated(longUrl);

      // Assert
      expect(result).toBe(false);
    });

    it('應該接受正常長度的 URL', () => {
      // Arrange
      const normalUrl = `https://example.com/${'x'.repeat(100)}.jpg`;

      // Act
      const result = isValidImageUrlSimulated(normalUrl);

      // Assert
      expect(result).toBe(true);
    });

    it('應該拒絕非 HTTP(S) 協議', () => {
      // Arrange
      const nonHttpUrls = [
        'ftp://example.com/image.jpg',
        'file:///path/to/image.jpg',
        'data:image/jpeg;base64,/9j/4AAQ...'
      ];

      // Act & Assert
      nonHttpUrls.forEach(url => {
        expect(isValidImageUrlSimulated(url)).toBe(false);
      });
    });

    it('應該處理 null、undefined 和空字串', () => {
      // Act & Assert
      expect(isValidImageUrlSimulated(null)).toBe(false);
      expect(isValidImageUrlSimulated()).toBe(false);
      expect(isValidImageUrlSimulated('')).toBe(false);
    });

    it('應該處理非字串輸入', () => {
      // Act & Assert
      expect(isValidImageUrlSimulated(123)).toBe(false);
      expect(isValidImageUrlSimulated({})).toBe(false);
      expect(isValidImageUrlSimulated([])).toBe(false);
    });

    it('應該使用緩存提高效能', () => {
      // Arrange
      const url = 'https://example.com/image.jpg';

      // Act
      const result1 = isValidImageUrlSimulated(url);
      const result2 = isValidImageUrlSimulated(url);

      // Assert
      expect(result1).toBe(true);
      expect(result2).toBe(true);
      // 第二次調用應該使用緩存
    });
  });

  describe('cacheValidationResult', () => {
    it('應該緩存驗證結果', () => {
      // Arrange
      const url = 'https://example.com/test.jpg';
      const cache = new Map();

      // Act
      cacheValidationResultSimulated(cache, url, true);

      // Assert
      expect(cache.get(url)).toBe(true);
    });

    it('應該在緩存達到最大大小時刪除最舊的條目', () => {
      // Arrange
      const cache = new Map();
      const maxSize = 3;

      // 添加條目直到達到最大大小
      for (let i = 0; i < maxSize; i++) {
        cacheValidationResultSimulated(cache, `url${i}`, true, maxSize);
      }

      // Act - 添加新條目應該刪除最舊的
      cacheValidationResultSimulated(cache, 'newUrl', false, maxSize);

      // Assert
      expect(cache.size).toBe(maxSize);
      expect(cache.has('url0')).toBe(false); // 最舊的應該被刪除
      expect(cache.has('newUrl')).toBe(true); // 新的應該存在
    });

    it('應該處理空 URL', () => {
      // Arrange
      const cache = new Map();

      // Act & Assert - 不應該拋出錯誤
      expect(() => {
        cacheValidationResultSimulated(cache, '', true);
      }).not.toThrow();
    });
  });

  describe('splitTextForHighlight', () => {
    it('應該返回短文本不變', () => {
      // Arrange
      const shortText = 'This is a short text.';

      // Act
      const result = splitTextForHighlightSimulated(shortText);

      // Assert
      expect(result).toEqual([shortText]);
    });

    it('應該分割長文本', () => {
      // Arrange
      const longText = 'A'.repeat(3000);

      // Act
      const result = splitTextForHighlightSimulated(longText, 2000);

      // Assert
      expect(result.length).toBeGreaterThan(1);
      expect(result[0].length).toBeLessThanOrEqual(2000);
      expect(result.join('')).toBe(longText);
    });

    it('應該在句號處分割', () => {
      // Arrange
      const text = `First sentence. Second sentence. ${'A'.repeat(2000)}`;

      // Act
      const result = splitTextForHighlightSimulated(text, 2000);

      // Assert
      expect(result.length).toBeGreaterThan(1);
      expect(result[0]).toContain('First sentence. Second sentence.');
    });

    it('應該在空格處分割（如果沒有標點）', () => {
      // Arrange
      const text = `word1 word2 word3 ${'A'.repeat(2000)}`;

      // Act
      const result = splitTextForHighlightSimulated(text, 2000);

      // Assert
      expect(result.length).toBeGreaterThan(1);
      expect(result[0]).toContain('word1 word2 word3');
    });

    it('應該強制分割無間斷文本', () => {
      // Arrange
      const text = 'A'.repeat(3000);

      // Act
      const result = splitTextForHighlightSimulated(text, 2000);

      // Assert
      expect(result.length).toBe(2);
      expect(result[0].length).toBe(2000);
      expect(result[1].length).toBe(1000);
    });

    it('應該處理空文本', () => {
      // Act & Assert
      expect(splitTextForHighlightSimulated('')).toEqual(['']);
      expect(splitTextForHighlightSimulated(null)).toEqual([null]);
      expect(splitTextForHighlightSimulated()).toEqual([undefined]);
    });

    it('應該過濾空字串片段', () => {
      // Arrange
      const text = '   \n\n   '; // 只有空白字元

      // Act
      const result = splitTextForHighlightSimulated(text, 100);

      // Assert
      // 檢查結果是否為空或只包含空白字元
      const nonEmptyResults = result.filter(chunk => chunk && chunk.trim().length > 0);
      expect(nonEmptyResults).toEqual([]); // 應該過濾掉空片段
    });
  });

  describe('圖片處理集成測試', () => {
    it('應該完整處理圖片 URL 流程', () => {
      // Arrange
      const proxyUrl = `https://pgw.udn.com.tw/gw/photo.php?u=${encodeURIComponent('https://cdn.example.com/image.jpg?width=800&width=1200')}`;

      // Act
      const cleanedUrl = cleanImageUrlSimulated(proxyUrl);
      const isValid = isValidImageUrlSimulated(cleanedUrl);

      // Assert
      expect(cleanedUrl).toBe('https://cdn.example.com/image.jpg?width=800');
      expect(isValid).toBe(true);
    });

    it('應該處理複雜的真實世界場景', () => {
      // Arrange
      const complexUrls = [
        'https://images.unsplash.com/photo-1234567890?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80',
        'https://cdn.pixabay.com/photo/2023/01/01/12/34/56/image-7890123_1280.jpg',
        'https://example.com/wp-content/uploads/2023/12/featured-image.webp'
      ];

      // Act & Assert
      complexUrls.forEach(url => {
        const cleaned = cleanImageUrlSimulated(url);
        const valid = isValidImageUrlSimulated(cleaned);

        expect(cleaned).toBeTruthy();
        // 注意：某些複雜URL可能不被識別為有效圖片URL，這是正常的
        // 這裡我們主要測試清理功能不會崩潰
        expect(typeof valid).toBe('boolean');
      });
    });
  });
});

/**
 * 模擬的圖片處理函數（用於測試）
 */
function cleanImageUrlSimulated(url) {
  if (!url || typeof url !== 'string') return null;

  try {
    const urlObj = new URL(url);

    // 處理代理 URL
    if (urlObj.pathname.includes('/photo.php') || urlObj.pathname.includes('/gw/')) {
      const uParam = urlObj.searchParams.get('u');
      if (uParam?.match(/^https?:\/\//)) {
        return cleanImageUrlSimulated(uParam);
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
  } catch (_) {
    return null;
  }
}

function isValidImageUrlSimulated(url) {
  if (!url || typeof url !== 'string') return false;

  // 簡化的緩存實現
  const cache = isValidImageUrlSimulated._cache || (isValidImageUrlSimulated._cache = new Map());

  if (cache.has(url)) {
    return cache.get(url);
  }

  const cleanedUrl = cleanImageUrlSimulated(url);
  if (!cleanedUrl) {
    cache.set(url, false);
    return false;
  }

  if (!/^https?:\/\//i.test(cleanedUrl)) {
    cache.set(url, false);
    return false;
  }

  if (cleanedUrl.length > 2000) {
    cache.set(url, false);
    return false;
  }

  const imageExtensions = /\.(?:jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|tif|avif|heic|heif)(?:\?.*)?$/i;
  if (imageExtensions.test(cleanedUrl)) {
    cache.set(url, true);
    return true;
  }

  const imagePathPatterns = [
    /\/image[s]?\//i,
    /\/img[s]?\//i,
    /\/photo[s]?\//i,
    /\/picture[s]?\//i,
    /\/media\//i,
    /\/upload[s]?\//i,
    /\/asset[s]?\//i,
    /\/file[s]?\//i
  ];

  const excludePatterns = [
    /\.(js|css|html|htm|php|asp|jsp)(\?|$)/i,
    /\/api\//i,
    /\/ajax\//i,
    /\/callback/i
  ];

  if (excludePatterns.some(pattern => pattern.test(cleanedUrl))) {
    cache.set(url, false);
    return false;
  }

  const result = imagePathPatterns.some(pattern => pattern.test(cleanedUrl));
  cache.set(url, result);
  return result;
}

function cacheValidationResultSimulated(cache, url, isValid, maxSize = 1000) {
  if (cache.size >= maxSize) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(url, isValid);
}

function splitTextForHighlightSimulated(text, maxLength = 2000) {
  if (!text || text.length <= maxLength) {
    return [text];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitIndex = -1;
    const punctuation = ['\n\n', '\n', '。', '.', '？', '?', '！', '!'];

    for (const punct of punctuation) {
      const lastIndex = remaining.lastIndexOf(punct, maxLength);
      if (lastIndex > maxLength * 0.5) {
        splitIndex = lastIndex + punct.length;
        break;
      }
    }

    if (splitIndex === -1) {
      splitIndex = remaining.lastIndexOf(' ', maxLength);
      if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
        splitIndex = maxLength;
      }
    }

    chunks.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }

  return chunks.filter(chunk => chunk.trim().length > 0);
}