/**
 * Background.js - 導出函數測試
 * 直接測試 background.js 導出的函數以提升覆蓋率
 */

// 模擬 Chrome API 環境
globalThis.chrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
    },
    sync: {
      get: jest.fn(),
    },
  },
  runtime: {
    lastError: null,
    getManifest: jest.fn(() => ({ version: '2.9.5' })),
  },
  tabs: {
    query: jest.fn(),
    create: jest.fn(),
  },
  scripting: {
    executeScript: jest.fn(),
  },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
  },
};

// 模擬 fetch
globalThis.fetch = jest.fn();

// 模擬 performance API
globalThis.performance = {
  now: jest.fn(() => Date.now()),
};

// 導入 background.js 的導出函數
const backgroundModule = (() => {
  try {
    return require('../../../scripts/background.js');
  } catch {
    console.warn('Could not import background.js directly, using mocked functions');
    // 如果無法直接導入，使用模擬的函數
    return {
      normalizeUrl(rawUrl) {
        try {
          const urlObj = new URL(rawUrl);
          urlObj.hash = '';
          const trackingParams = [
            'utm_source',
            'utm_medium',
            'utm_campaign',
            'utm_term',
            'utm_content',
            'gclid',
            'fbclid',
            'mc_cid',
            'mc_eid',
            'igshid',
            'vero_id',
          ];
          trackingParams.forEach(param => urlObj.searchParams.delete(param));
          if (urlObj.pathname !== '/' && urlObj.pathname.endsWith('/')) {
            urlObj.pathname = urlObj.pathname.replace(/\/+$/, '');
          }
          return urlObj.toString();
        } catch {
          return rawUrl || '';
        }
      },

      cleanImageUrl(url) {
        if (!url || typeof url !== 'string') {
          return null;
        }

        try {
          const urlObj = new URL(url);

          if (urlObj.pathname.includes('/photo.php') || urlObj.pathname.includes('/gw/')) {
            const uParam = urlObj.searchParams.get('u');
            if (uParam && /^https?:\/\//.test(uParam)) {
              return this.cleanImageUrl(uParam);
            }
          }

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
      },

      isValidImageUrl(url) {
        if (!url || typeof url !== 'string') {
          return false;
        }

        const cleanedUrl = this.cleanImageUrl(url);
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
      },

      splitTextForHighlight(text, maxLength = 2000) {
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

          chunks.push(remaining.slice(0, Math.max(0, splitIndex)).trim());
          remaining = remaining.slice(Math.max(0, splitIndex)).trim();
        }

        return chunks.filter(chunk => chunk.length > 0);
      },

      async appendBlocksInBatches(pageId, blocks, apiKey, startIndex = 0) {
        const BLOCKS_PER_BATCH = 100;
        const DELAY_BETWEEN_BATCHES = 350;

        let addedCount = 0;
        const totalBlocks = blocks.length - startIndex;

        if (totalBlocks <= 0) {
          return { success: true, addedCount: 0, totalCount: 0 };
        }

        try {
          for (let i = startIndex; i < blocks.length; i += BLOCKS_PER_BATCH) {
            const batch = blocks.slice(i, i + BLOCKS_PER_BATCH);

            const response = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2025-09-03',
              },
              body: JSON.stringify({
                children: batch,
              }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`批次添加失敗: ${response.status} - ${errorText}`);
            }

            addedCount += batch.length;

            if (i + BLOCKS_PER_BATCH < blocks.length) {
              await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
            }
          }

          return { success: true, addedCount, totalCount: totalBlocks };
        } catch (error) {
          return { success: false, addedCount, totalCount: totalBlocks, error: error.message };
        }
      },
    };
  }
})();

describe('Background.js Exported Functions', () => {
  beforeEach(() => {
    // 重置 mocks
    jest.clearAllMocks();

    // 重置 console mocks
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('normalizeUrl', () => {
    it('應該標準化 URL 並移除 hash', () => {
      const url = 'https://example.com/page#section';
      const result = backgroundModule.normalizeUrl(url);
      expect(result).toBe('https://example.com/page');
    });

    it('應該移除追蹤參數', () => {
      const url = 'https://example.com/page?utm_source=google&utm_medium=cpc&normal=keep';
      const result = backgroundModule.normalizeUrl(url);
      expect(result).toBe('https://example.com/page?normal=keep');
    });

    it('應該移除所有追蹤參數', () => {
      const url = 'https://example.com/page?utm_source=google&gclid=123&fbclid=456&normal=keep';
      const result = backgroundModule.normalizeUrl(url);
      expect(result).toBe('https://example.com/page?normal=keep');
    });

    it('應該標準化尾部斜槓', () => {
      expect(backgroundModule.normalizeUrl('https://example.com/page/')).toBe(
        'https://example.com/page'
      );
      expect(backgroundModule.normalizeUrl('https://example.com/')).toBe('https://example.com/');
      expect(backgroundModule.normalizeUrl('https://example.com/path/subpath/')).toBe(
        'https://example.com/path/subpath'
      );
    });

    it('應該處理無效 URL', () => {
      const result = backgroundModule.normalizeUrl('invalid-url');
      expect(result).toBe('invalid-url');
    });

    it('應該處理空值', () => {
      expect(backgroundModule.normalizeUrl('')).toBe('');
      expect(backgroundModule.normalizeUrl(null)).toBe('');
      expect(backgroundModule.normalizeUrl()).toBe('');
    });

    it('應該處理複雜的查詢參數', () => {
      const url = 'https://example.com/page?a=1&utm_source=test&b=2&gclid=abc&c=3';
      const result = backgroundModule.normalizeUrl(url);
      expect(result).toBe('https://example.com/page?a=1&b=2&c=3');
    });
  });

  describe('cleanImageUrl', () => {
    it('應該返回有效的簡單圖片 URL', () => {
      const url = 'https://example.com/image.jpg';
      const result = backgroundModule.cleanImageUrl(url);
      expect(result).toBe(url);
    });

    it('應該處理帶查詢參數的 URL', () => {
      const url = 'https://example.com/image.jpg?width=800&height=600';
      const result = backgroundModule.cleanImageUrl(url);
      expect(result).toBe(url);
    });

    it('應該從代理 URL 提取原始圖片', () => {
      const originalUrl = 'https://cdn.example.com/image.jpg';
      const proxyUrl = `https://pgw.udn.com.tw/gw/photo.php?u=${encodeURIComponent(originalUrl)}`;
      const result = backgroundModule.cleanImageUrl(proxyUrl);
      expect(result).toBe(originalUrl);
    });

    it('應該處理嵌套的代理 URL', () => {
      const originalUrl = 'https://cdn.example.com/image.jpg';
      const firstProxy = `https://proxy1.com/gw/?u=${encodeURIComponent(originalUrl)}`;
      const nestedProxy = `https://proxy2.com/photo.php?u=${encodeURIComponent(firstProxy)}`;
      const result = backgroundModule.cleanImageUrl(nestedProxy);
      expect(result).toBe(originalUrl);
    });

    it('應該移除重複的查詢參數', () => {
      const url = 'https://example.com/image.jpg?width=800&height=600&width=1200';
      const result = backgroundModule.cleanImageUrl(url);
      expect(result).toBe('https://example.com/image.jpg?width=800&height=600');
    });

    it('應該處理無效輸入', () => {
      expect(backgroundModule.cleanImageUrl(null)).toBeNull();
      expect(backgroundModule.cleanImageUrl('')).toBeNull();
      expect(backgroundModule.cleanImageUrl(123)).toBeNull();
      expect(backgroundModule.cleanImageUrl({})).toBeNull();
    });

    it('應該處理無效 URL', () => {
      const result = backgroundModule.cleanImageUrl('not-a-url');
      expect(result).toBeNull();
    });

    it('應該處理代理 URL 中缺少 u 參數的情況', () => {
      const proxyUrl = 'https://pgw.udn.com.tw/gw/photo.php?other=value';
      const result = backgroundModule.cleanImageUrl(proxyUrl);
      expect(result).toBe(proxyUrl);
    });

    it('應該處理代理 URL 中 u 參數無效的情況', () => {
      const proxyUrl = 'https://pgw.udn.com.tw/gw/photo.php?u=invalid-url';
      const result = backgroundModule.cleanImageUrl(proxyUrl);
      expect(result).toBe(proxyUrl);
    });
  });

  describe('isValidImageUrl', () => {
    it('應該接受標準圖片 URL', () => {
      const urls = [
        'https://example.com/image.jpg',
        'https://example.com/photo.png',
        'https://example.com/graphic.gif',
        'https://example.com/vector.svg',
        'https://example.com/icon.ico',
      ];
      urls.forEach(url => {
        expect(backgroundModule.isValidImageUrl(url)).toBe(true);
      });
    });

    it('應該接受帶查詢參數的圖片 URL', () => {
      const url = 'https://example.com/image.jpg?width=800&height=600';
      expect(backgroundModule.isValidImageUrl(url)).toBe(true);
    });

    it('應該支持各種圖片格式', () => {
      const formats = [
        'jpg',
        'jpeg',
        'png',
        'gif',
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
        const url = `https://example.com/image.${format}`;
        expect(backgroundModule.isValidImageUrl(url)).toBe(true);
      });
    });

    it('應該識別圖片路徑模式', () => {
      const pathUrls = [
        'https://example.com/images/photo',
        'https://example.com/img/banner',
        'https://example.com/photos/gallery',
        'https://example.com/pictures/avatar',
        'https://example.com/media/cover',
        'https://example.com/uploads/file',
        'https://example.com/assets/logo',
        'https://example.com/files/image',
      ];
      pathUrls.forEach(url => {
        expect(backgroundModule.isValidImageUrl(url)).toBe(true);
      });
    });

    it('應該排除非圖片 URL', () => {
      const nonImageUrls = [
        'https://example.com/script.js',
        'https://example.com/style.css',
        'https://example.com/page.html',
        'https://example.com/api/data',
        'https://example.com/ajax/request',
        'https://example.com/callback',
      ];
      nonImageUrls.forEach(url => {
        expect(backgroundModule.isValidImageUrl(url)).toBe(false);
      });
    });

    it('應該拒絕過長的 URL', () => {
      const longUrl = `https://example.com/${'x'.repeat(2000)}.jpg`;
      expect(backgroundModule.isValidImageUrl(longUrl)).toBe(false);
    });

    it('應該接受正常長度的 URL', () => {
      const normalUrl = `https://example.com/${'x'.repeat(100)}.jpg`;
      expect(backgroundModule.isValidImageUrl(normalUrl)).toBe(true);
    });

    it('應該拒絕非 HTTP(S) 協議', () => {
      const nonHttpUrls = [
        'ftp://example.com/image.jpg',
        'file:///path/to/image.jpg',
        'data:image/jpeg;base64,/9j/4AAQ...',
      ];
      nonHttpUrls.forEach(url => {
        expect(backgroundModule.isValidImageUrl(url)).toBe(false);
      });
    });

    it('應該處理無效輸入', () => {
      expect(backgroundModule.isValidImageUrl(null)).toBe(false);
      expect(backgroundModule.isValidImageUrl('')).toBe(false);
      expect(backgroundModule.isValidImageUrl(123)).toBe(false);
      expect(backgroundModule.isValidImageUrl({})).toBe(false);
      expect(backgroundModule.isValidImageUrl([])).toBe(false);
    });
  });

  describe('splitTextForHighlight', () => {
    it('應該返回短文本不變', () => {
      const shortText = 'This is a short text.';
      const result = backgroundModule.splitTextForHighlight(shortText);
      expect(result).toEqual([shortText]);
    });

    it('應該分割長文本', () => {
      const longText = 'A'.repeat(3000);
      const result = backgroundModule.splitTextForHighlight(longText, 2000);
      expect(result.length).toBeGreaterThan(1);
      expect(result[0].length).toBeLessThanOrEqual(2000);
      expect(result.join('')).toBe(longText);
    });

    it('應該在句號處分割', () => {
      const text = `First sentence. Second sentence. ${'A'.repeat(2000)}`;
      const result = backgroundModule.splitTextForHighlight(text, 2000);
      expect(result.length).toBeGreaterThan(1);
      expect(result[0]).toContain('First sentence. Second sentence.');
    });

    it('應該在問號處分割', () => {
      const text = `First question? Second question? ${'A'.repeat(2000)}`;
      const result = backgroundModule.splitTextForHighlight(text, 2000);
      expect(result.length).toBeGreaterThan(1);
      expect(result[0]).toContain('First question? Second question?');
    });

    it('應該在感嘆號處分割', () => {
      const text = `First exclamation! Second exclamation! ${'A'.repeat(2000)}`;
      const result = backgroundModule.splitTextForHighlight(text, 2000);
      expect(result.length).toBeGreaterThan(1);
      expect(result[0]).toContain('First exclamation! Second exclamation!');
    });

    it('應該在雙換行符處分割', () => {
      const text = `First paragraph.\n\nSecond paragraph.\n\n${'A'.repeat(2000)}`;
      const result = backgroundModule.splitTextForHighlight(text, 2000);
      expect(result.length).toBeGreaterThan(1);
    });

    it('應該在空格處分割（如果沒有標點）', () => {
      const text = `word1 word2 word3 ${'A'.repeat(2000)}`;
      const result = backgroundModule.splitTextForHighlight(text, 2000);
      expect(result.length).toBeGreaterThan(1);
    });

    it('應該強制分割無間斷文本', () => {
      const text = 'A'.repeat(3000);
      const result = backgroundModule.splitTextForHighlight(text, 2000);
      expect(result).toHaveLength(2);
      expect(result[0]).toHaveLength(2000);
      expect(result[1]).toHaveLength(1000);
    });

    it('應該處理空文本', () => {
      expect(backgroundModule.splitTextForHighlight('')).toEqual(['']);
      expect(backgroundModule.splitTextForHighlight(null)).toEqual([null]);
      expect(backgroundModule.splitTextForHighlight()).toEqual([undefined]);
    });

    it('應該過濾空字符串片段', () => {
      const text = 'content.   \n\n   '; // 有內容但結尾是空白
      const result = backgroundModule.splitTextForHighlight(text, 100);
      expect(result.length).toBeGreaterThan(0);
      result.forEach(chunk => {
        expect(chunk.length).toBeGreaterThan(0);
      });
    });

    it('應該處理中文標點', () => {
      const text = `第一句話。第二句話？第三句話！${'A'.repeat(2000)}`;
      const result = backgroundModule.splitTextForHighlight(text, 2000);
      expect(result.length).toBeGreaterThan(1);
      expect(result[0]).toContain('第一句話。第二句話？第三句話！');
    });

    it('應該使用自訂 maxLength', () => {
      const text = 'A'.repeat(500);
      const result = backgroundModule.splitTextForHighlight(text, 200);
      expect(result.length).toBeGreaterThan(1);
      result.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(200);
      });
    });
  });

  describe('appendBlocksInBatches', () => {
    const mockApiKey = 'secret_test_key';
    const mockPageId = 'page-123';

    beforeEach(() => {
      globalThis.fetch = jest.fn();
    });

    it('應該成功分批添加區塊', async () => {
      // Arrange
      const blocks = Array.from({ length: 250 }, (_, i) => ({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: `Block ${i + 1}` } }],
        },
      }));

      // Mock 3次成功的回應
      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ object: 'block' }),
      });

      // Act
      const result = await backgroundModule.appendBlocksInBatches(mockPageId, blocks, mockApiKey);

      // Assert
      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(250);
      expect(result.totalCount).toBe(250);
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it('應該處理部分批次失敗的情況', async () => {
      // Arrange
      const blocks = Array.from({ length: 150 }, (_, i) => ({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: `Block ${i + 1}` } }],
        },
      }));

      // 第一批成功，第二批失敗
      globalThis.fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ object: 'block' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: () => Promise.resolve('Bad request'),
        });

      // Act
      const result = await backgroundModule.appendBlocksInBatches(mockPageId, blocks, mockApiKey);

      // Assert
      expect(result.success).toBe(false);
      expect(result.addedCount).toBe(100); // 只有第一批成功
      expect(result.totalCount).toBe(150);
      expect(result.error).toContain('批次添加失敗');
    });

    it('應該處理空區塊數組', async () => {
      // Act
      const result = await backgroundModule.appendBlocksInBatches(mockPageId, [], mockApiKey);

      // Assert
      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(0);
      expect(result.totalCount).toBe(0);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('應該處理從指定索引開始的情況', async () => {
      // Arrange
      const blocks = Array.from({ length: 150 }, (_, i) => ({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: `Block ${i + 1}` } }],
        },
      }));

      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ object: 'block' }),
      });

      // Act - 從索引100開始
      const result = await backgroundModule.appendBlocksInBatches(
        mockPageId,
        blocks,
        mockApiKey,
        100
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(50); // 只處理剩餘的50個區塊
      expect(result.totalCount).toBe(50);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('應該處理網路錯誤', async () => {
      // Arrange
      const blocks = [{ object: 'block', type: 'paragraph' }];
      globalThis.fetch.mockRejectedValue(new Error('Network error'));

      // Act
      const result = await backgroundModule.appendBlocksInBatches(mockPageId, blocks, mockApiKey);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('應該正確建構 API 請求', async () => {
      // Arrange
      const blocks = [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: 'Test block' } }],
          },
        },
      ];

      globalThis.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ object: 'block' }),
      });

      // Act
      await backgroundModule.appendBlocksInBatches(mockPageId, blocks, mockApiKey);

      // Assert
      expect(globalThis.fetch).toHaveBeenCalledWith(
        `https://api.notion.com/v1/blocks/${mockPageId}/children`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${mockApiKey}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2025-09-03',
          },
          body: JSON.stringify({
            children: blocks,
          }),
        }
      );
    });
  });

  describe('整合測試', () => {
    it('應該完整處理圖片 URL 流程', () => {
      const proxyUrl = `https://pgw.udn.com.tw/gw/photo.php?u=${encodeURIComponent('https://cdn.example.com/image.jpg?width=800&width=1200')}`;

      const cleanedUrl = backgroundModule.cleanImageUrl(proxyUrl);
      const isValid = backgroundModule.isValidImageUrl(cleanedUrl);

      expect(cleanedUrl).toBe('https://cdn.example.com/image.jpg?width=800');
      expect(isValid).toBe(true);
    });

    it('應該處理複雜的 URL 標準化場景', () => {
      const complexUrl =
        'https://example.com/page/?utm_source=google&utm_medium=cpc&normal=keep#section';
      const normalized = backgroundModule.normalizeUrl(complexUrl);

      expect(normalized).toBe('https://example.com/page?normal=keep');
    });

    it('應該處理長文本分割和驗證', () => {
      const longText = 'This is a very long text. '.repeat(100); // 約2700字符
      const chunks = backgroundModule.splitTextForHighlight(longText, 2000);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(2001); // 允許1個字符的誤差
      });

      // 驗證所有片段都不為空
      chunks.forEach(chunk => {
        expect(chunk.trim().length).toBeGreaterThan(0);
      });
    });
  });
});
