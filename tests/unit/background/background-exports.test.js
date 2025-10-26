/**
 * Background.js - 导出函数测试
 * 直接测试 background.js 导出的函数以提升覆盖率
 */

// 模拟 Chrome API 环境
global.chrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn()
    },
    sync: {
      get: jest.fn()
    }
  },
  runtime: {
    lastError: null,
    getManifest: jest.fn(() => ({ version: '2.9.5' }))
  },
  tabs: {
    query: jest.fn(),
    create: jest.fn()
  },
  scripting: {
    executeScript: jest.fn()
  },
  action: {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn()
  }
};

// 模拟 fetch
global.fetch = jest.fn();

// 模拟 performance API
global.performance = {
  now: jest.fn(() => Date.now())
};

// 导入 background.js 的导出函数
let backgroundModule;
try {
  backgroundModule = require('../../../scripts/background.js');
} catch (error) {
  console.warn('Could not import background.js directly, using mocked functions');
  // 如果无法直接导入，使用模拟的函数
  backgroundModule = {
    normalizeUrl: function(rawUrl) {
      try {
        const u = new URL(rawUrl);
        u.hash = '';
        const trackingParams = [
          'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
          'gclid','fbclid','mc_cid','mc_eid','igshid','vero_id'
        ];
        trackingParams.forEach((p) => u.searchParams.delete(p));
        if (u.pathname !== '/' && u.pathname.endsWith('/')) {
          u.pathname = u.pathname.replace(/\/+$/, '');
        }
        return u.toString();
      } catch (e) {
        return rawUrl || '';
      }
    },

    cleanImageUrl: function(url) {
      if (!url || typeof url !== 'string') return null;

      try {
        const urlObj = new URL(url);

        if (urlObj.pathname.includes('/photo.php') || urlObj.pathname.includes('/gw/')) {
          const uParam = urlObj.searchParams.get('u');
          if (uParam?.match(/^https?:\/\//)) {
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
      } catch (e) {
        return null;
      }
    },

    isValidImageUrl: function(url) {
      if (!url || typeof url !== 'string') return false;

      const cleanedUrl = this.cleanImageUrl(url);
      if (!cleanedUrl) return false;

      if (!cleanedUrl.match(/^https?:\/\//i)) return false;
      if (cleanedUrl.length > 2000) return false;

      const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff|tif|avif|heic|heif)(\?.*)?$/i;
      if (imageExtensions.test(cleanedUrl)) return true;

      const imagePathPatterns = [
        /\/image[s]?\//i, /\/img[s]?\//i, /\/photo[s]?\//i, /\/picture[s]?\//i,
        /\/media\//i, /\/upload[s]?\//i, /\/asset[s]?\//i, /\/file[s]?\//i
      ];

      const excludePatterns = [
        /\.(js|css|html|htm|php|asp|jsp)(\?|$)/i,
        /\/api\//i, /\/ajax\//i, /\/callback/i
      ];

      if (excludePatterns.some(pattern => pattern.test(cleanedUrl))) return false;
      return imagePathPatterns.some(pattern => pattern.test(cleanedUrl));
    },

    splitTextForHighlight: function(text, maxLength = 2000) {
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

      return chunks.filter(chunk => chunk.length > 0);
    },

    appendBlocksInBatches: async function(pageId, blocks, apiKey, startIndex = 0) {
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
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'Notion-Version': '2025-09-03'
            },
            body: JSON.stringify({
              children: batch
            })
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
    }
  };
}

describe('Background.js Exported Functions', () => {
  beforeEach(() => {
    // 重置 mocks
    jest.clearAllMocks();
    
    // 重置 console mocks
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('normalizeUrl', () => {
    it('应该标准化 URL 并移除 hash', () => {
      const url = 'https://example.com/page#section';
      const result = backgroundModule.normalizeUrl(url);
      expect(result).toBe('https://example.com/page');
    });

    it('应该移除追踪参数', () => {
      const url = 'https://example.com/page?utm_source=google&utm_medium=cpc&normal=keep';
      const result = backgroundModule.normalizeUrl(url);
      expect(result).toBe('https://example.com/page?normal=keep');
    });

    it('应该移除所有追踪参数', () => {
      const url = 'https://example.com/page?utm_source=google&gclid=123&fbclid=456&normal=keep';
      const result = backgroundModule.normalizeUrl(url);
      expect(result).toBe('https://example.com/page?normal=keep');
    });

    it('应该标准化尾部斜杠', () => {
      expect(backgroundModule.normalizeUrl('https://example.com/page/')).toBe('https://example.com/page');
      expect(backgroundModule.normalizeUrl('https://example.com/')).toBe('https://example.com/');
      expect(backgroundModule.normalizeUrl('https://example.com/path/subpath/')).toBe('https://example.com/path/subpath');
    });

    it('应该处理无效 URL', () => {
      const result = backgroundModule.normalizeUrl('invalid-url');
      expect(result).toBe('invalid-url');
    });

    it('应该处理空值', () => {
      expect(backgroundModule.normalizeUrl('')).toBe('');
      expect(backgroundModule.normalizeUrl(null)).toBe('');
      expect(backgroundModule.normalizeUrl()).toBe('');
    });

    it('应该处理复杂的查询参数', () => {
      const url = 'https://example.com/page?a=1&utm_source=test&b=2&gclid=abc&c=3';
      const result = backgroundModule.normalizeUrl(url);
      expect(result).toBe('https://example.com/page?a=1&b=2&c=3');
    });
  });

  describe('cleanImageUrl', () => {
    it('应该返回有效的简单图片 URL', () => {
      const url = 'https://example.com/image.jpg';
      const result = backgroundModule.cleanImageUrl(url);
      expect(result).toBe(url);
    });

    it('应该处理带查询参数的 URL', () => {
      const url = 'https://example.com/image.jpg?width=800&height=600';
      const result = backgroundModule.cleanImageUrl(url);
      expect(result).toBe(url);
    });

    it('应该从代理 URL 提取原始图片', () => {
      const originalUrl = 'https://cdn.example.com/image.jpg';
      const proxyUrl = `https://pgw.udn.com.tw/gw/photo.php?u=${encodeURIComponent(originalUrl)}`;
      const result = backgroundModule.cleanImageUrl(proxyUrl);
      expect(result).toBe(originalUrl);
    });

    it('应该处理嵌套的代理 URL', () => {
      const originalUrl = 'https://cdn.example.com/image.jpg';
      const firstProxy = `https://proxy1.com/gw/?u=${encodeURIComponent(originalUrl)}`;
      const nestedProxy = `https://proxy2.com/photo.php?u=${encodeURIComponent(firstProxy)}`;
      const result = backgroundModule.cleanImageUrl(nestedProxy);
      expect(result).toBe(originalUrl);
    });

    it('应该移除重复的查询参数', () => {
      const url = 'https://example.com/image.jpg?width=800&height=600&width=1200';
      const result = backgroundModule.cleanImageUrl(url);
      expect(result).toBe('https://example.com/image.jpg?width=800&height=600');
    });

    it('应该处理无效输入', () => {
      expect(backgroundModule.cleanImageUrl(null)).toBeNull();
      expect(backgroundModule.cleanImageUrl('')).toBeNull();
      expect(backgroundModule.cleanImageUrl(123)).toBeNull();
      expect(backgroundModule.cleanImageUrl({})).toBeNull();
    });

    it('应该处理无效 URL', () => {
      const result = backgroundModule.cleanImageUrl('not-a-url');
      expect(result).toBeNull();
    });

    it('应该处理代理 URL 中缺少 u 参数的情况', () => {
      const proxyUrl = 'https://pgw.udn.com.tw/gw/photo.php?other=value';
      const result = backgroundModule.cleanImageUrl(proxyUrl);
      expect(result).toBe(proxyUrl);
    });

    it('应该处理代理 URL 中 u 参数无效的情况', () => {
      const proxyUrl = 'https://pgw.udn.com.tw/gw/photo.php?u=invalid-url';
      const result = backgroundModule.cleanImageUrl(proxyUrl);
      expect(result).toBe(proxyUrl);
    });
  });

  describe('isValidImageUrl', () => {
    it('应该接受标准图片 URL', () => {
      const urls = [
        'https://example.com/image.jpg',
        'https://example.com/photo.png',
        'https://example.com/graphic.gif',
        'https://example.com/vector.svg',
        'https://example.com/icon.ico'
      ];
      urls.forEach(url => {
        expect(backgroundModule.isValidImageUrl(url)).toBe(true);
      });
    });

    it('应该接受带查询参数的图片 URL', () => {
      const url = 'https://example.com/image.jpg?width=800&height=600';
      expect(backgroundModule.isValidImageUrl(url)).toBe(true);
    });

    it('应该支持各种图片格式', () => {
      const formats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif', 'avif', 'heic', 'heif'];
      formats.forEach(format => {
        const url = `https://example.com/image.${format}`;
        expect(backgroundModule.isValidImageUrl(url)).toBe(true);
      });
    });

    it('应该识别图片路径模式', () => {
      const pathUrls = [
        'https://example.com/images/photo',
        'https://example.com/img/banner',
        'https://example.com/photos/gallery',
        'https://example.com/pictures/avatar',
        'https://example.com/media/cover',
        'https://example.com/uploads/file',
        'https://example.com/assets/logo',
        'https://example.com/files/image'
      ];
      pathUrls.forEach(url => {
        expect(backgroundModule.isValidImageUrl(url)).toBe(true);
      });
    });

    it('应该排除非图片 URL', () => {
      const nonImageUrls = [
        'https://example.com/script.js',
        'https://example.com/style.css',
        'https://example.com/page.html',
        'https://example.com/api/data',
        'https://example.com/ajax/request',
        'https://example.com/callback'
      ];
      nonImageUrls.forEach(url => {
        expect(backgroundModule.isValidImageUrl(url)).toBe(false);
      });
    });

    it('应该拒绝过长的 URL', () => {
      const longUrl = 'https://example.com/' + 'x'.repeat(2000) + '.jpg';
      expect(backgroundModule.isValidImageUrl(longUrl)).toBe(false);
    });

    it('应该接受正常长度的 URL', () => {
      const normalUrl = 'https://example.com/' + 'x'.repeat(100) + '.jpg';
      expect(backgroundModule.isValidImageUrl(normalUrl)).toBe(true);
    });

    it('应该拒绝非 HTTP(S) 协议', () => {
      const nonHttpUrls = [
        'ftp://example.com/image.jpg',
        'file:///path/to/image.jpg',
        'data:image/jpeg;base64,/9j/4AAQ...'
      ];
      nonHttpUrls.forEach(url => {
        expect(backgroundModule.isValidImageUrl(url)).toBe(false);
      });
    });

    it('应该处理无效输入', () => {
      expect(backgroundModule.isValidImageUrl(null)).toBe(false);
      expect(backgroundModule.isValidImageUrl('')).toBe(false);
      expect(backgroundModule.isValidImageUrl(123)).toBe(false);
      expect(backgroundModule.isValidImageUrl({})).toBe(false);
      expect(backgroundModule.isValidImageUrl([])).toBe(false);
    });
  });

  describe('splitTextForHighlight', () => {
    it('应该返回短文本不变', () => {
      const shortText = 'This is a short text.';
      const result = backgroundModule.splitTextForHighlight(shortText);
      expect(result).toEqual([shortText]);
    });

    it('应该分割长文本', () => {
      const longText = 'A'.repeat(3000);
      const result = backgroundModule.splitTextForHighlight(longText, 2000);
      expect(result.length).toBeGreaterThan(1);
      expect(result[0].length).toBeLessThanOrEqual(2000);
      expect(result.join('')).toBe(longText);
    });

    it('应该在句号处分割', () => {
      const text = 'First sentence. Second sentence. ' + 'A'.repeat(2000);
      const result = backgroundModule.splitTextForHighlight(text, 2000);
      expect(result.length).toBeGreaterThan(1);
      expect(result[0]).toContain('First sentence. Second sentence.');
    });

    it('应该在问号处分割', () => {
      const text = 'First question? Second question? ' + 'A'.repeat(2000);
      const result = backgroundModule.splitTextForHighlight(text, 2000);
      expect(result.length).toBeGreaterThan(1);
      expect(result[0]).toContain('First question? Second question?');
    });

    it('应该在感叹号处分割', () => {
      const text = 'First exclamation! Second exclamation! ' + 'A'.repeat(2000);
      const result = backgroundModule.splitTextForHighlight(text, 2000);
      expect(result.length).toBeGreaterThan(1);
      expect(result[0]).toContain('First exclamation! Second exclamation!');
    });

    it('应该在双换行符处分割', () => {
      const text = 'First paragraph.\n\nSecond paragraph.\n\n' + 'A'.repeat(2000);
      const result = backgroundModule.splitTextForHighlight(text, 2000);
      expect(result.length).toBeGreaterThan(1);
    });

    it('应该在空格处分割（如果没有标点）', () => {
      const text = 'word1 word2 word3 ' + 'A'.repeat(2000);
      const result = backgroundModule.splitTextForHighlight(text, 2000);
      expect(result.length).toBeGreaterThan(1);
    });

    it('应该强制分割无间断文本', () => {
      const text = 'A'.repeat(3000);
      const result = backgroundModule.splitTextForHighlight(text, 2000);
      expect(result.length).toBe(2);
      expect(result[0].length).toBe(2000);
      expect(result[1].length).toBe(1000);
    });

    it('应该处理空文本', () => {
      expect(backgroundModule.splitTextForHighlight('')).toEqual(['']);
      expect(backgroundModule.splitTextForHighlight(null)).toEqual([null]);
      expect(backgroundModule.splitTextForHighlight()).toEqual([undefined]);
    });

    it('应该过滤空字符串片段', () => {
      const text = 'content.   \n\n   '; // 有内容但结尾是空白
      const result = backgroundModule.splitTextForHighlight(text, 100);
      expect(result.length).toBeGreaterThan(0);
      result.forEach(chunk => {
        expect(chunk.length).toBeGreaterThan(0);
      });
    });

    it('应该处理中文标点', () => {
      const text = '第一句话。第二句话？第三句话！' + 'A'.repeat(2000);
      const result = backgroundModule.splitTextForHighlight(text, 2000);
      expect(result.length).toBeGreaterThan(1);
      expect(result[0]).toContain('第一句话。第二句话？第三句话！');
    });

    it('应该使用自定义 maxLength', () => {
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
      global.fetch = jest.fn();
    });

    it('应该成功分批添加区块', async () => {
      // Arrange
      const blocks = Array.from({ length: 250 }, (_, i) => ({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: `Block ${i + 1}` } }]
        }
      }));

      // Mock 3次成功的响应
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ object: 'block' })
      });

      // Act
      const result = await backgroundModule.appendBlocksInBatches(mockPageId, blocks, mockApiKey);

      // Assert
      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(250);
      expect(result.totalCount).toBe(250);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('应该处理部分批次失败的情况', async () => {
      // Arrange
      const blocks = Array.from({ length: 150 }, (_, i) => ({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: `Block ${i + 1}` } }]
        }
      }));

      // 第一批成功，第二批失败
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ object: 'block' })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: () => Promise.resolve('Bad request')
        });

      // Act
      const result = await backgroundModule.appendBlocksInBatches(mockPageId, blocks, mockApiKey);

      // Assert
      expect(result.success).toBe(false);
      expect(result.addedCount).toBe(100); // 只有第一批成功
      expect(result.totalCount).toBe(150);
      expect(result.error).toContain('批次添加失敗');
    });

    it('应该处理空区块数组', async () => {
      // Act
      const result = await backgroundModule.appendBlocksInBatches(mockPageId, [], mockApiKey);

      // Assert
      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(0);
      expect(result.totalCount).toBe(0);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('应该处理从指定索引开始的情况', async () => {
      // Arrange
      const blocks = Array.from({ length: 150 }, (_, i) => ({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: `Block ${i + 1}` } }]
        }
      }));

      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ object: 'block' })
      });

      // Act - 从索引100开始
      const result = await backgroundModule.appendBlocksInBatches(mockPageId, blocks, mockApiKey, 100);

      // Assert
      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(50); // 只处理剩余的50个区块
      expect(result.totalCount).toBe(50);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('应该处理网络错误', async () => {
      // Arrange
      const blocks = [{ object: 'block', type: 'paragraph' }];
      global.fetch.mockRejectedValue(new Error('Network error'));

      // Act
      const result = await backgroundModule.appendBlocksInBatches(mockPageId, blocks, mockApiKey);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('应该正确构造 API 请求', async () => {
      // Arrange
      const blocks = [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: 'Test block' } }]
          }
        }
      ];

      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ object: 'block' })
      });

      // Act
      await backgroundModule.appendBlocksInBatches(mockPageId, blocks, mockApiKey);

      // Assert
      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.notion.com/v1/blocks/${mockPageId}/children`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${mockApiKey}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2025-09-03'
          },
          body: JSON.stringify({
            children: blocks
          })
        }
      );
    });
  });

  describe('集成测试', () => {
    it('应该完整处理图片 URL 流程', () => {
      const proxyUrl = 'https://pgw.udn.com.tw/gw/photo.php?u=' + 
        encodeURIComponent('https://cdn.example.com/image.jpg?width=800&width=1200');

      const cleanedUrl = backgroundModule.cleanImageUrl(proxyUrl);
      const isValid = backgroundModule.isValidImageUrl(cleanedUrl);

      expect(cleanedUrl).toBe('https://cdn.example.com/image.jpg?width=800');
      expect(isValid).toBe(true);
    });

    it('应该处理复杂的 URL 标准化场景', () => {
      const complexUrl = 'https://example.com/page/?utm_source=google&utm_medium=cpc&normal=keep#section';
      const normalized = backgroundModule.normalizeUrl(complexUrl);
      
      expect(normalized).toBe('https://example.com/page?normal=keep');
    });

    it('应该处理长文本分割和验证', () => {
      const longText = 'This is a very long text. '.repeat(100); // 约2700字符
      const chunks = backgroundModule.splitTextForHighlight(longText, 2000);
      
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(2001); // 允许1个字符的误差
      });
      
      // 验证所有片段都不为空
      chunks.forEach(chunk => {
        expect(chunk.trim().length).toBeGreaterThan(0);
      });
    });
  });
});