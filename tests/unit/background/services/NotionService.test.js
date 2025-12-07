/**
 * NotionService 單元測試
 */

const {
  NotionService,
  fetchWithRetry,
  NOTION_CONFIG,
} = require('../../../../scripts/background/services/NotionService');

describe('fetchWithRetry', () => {
  let originalFetch = null;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('應該在成功時直接返回響應', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const result = await fetchWithRetry('https://api.notion.com/test', {});
    expect(result.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('應該在 5xx 錯誤時重試', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        clone: () => ({ json: () => Promise.resolve({}) }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

    const result = await fetchWithRetry(
      'https://api.notion.com/test',
      {},
      { maxRetries: 1, baseDelay: 10 }
    );
    expect(result.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('應該在達到最大重試次數後返回錯誤響應', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      clone: () => ({ json: () => Promise.resolve({}) }),
    });

    const result = await fetchWithRetry(
      'https://api.notion.com/test',
      {},
      { maxRetries: 1, baseDelay: 10 }
    );
    expect(result.ok).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('應該在網絡錯誤時重試', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

    const result = await fetchWithRetry(
      'https://api.notion.com/test',
      {},
      { maxRetries: 1, baseDelay: 10 }
    );
    expect(result.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('應該在達到最大重試次數後拋出網絡錯誤', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    await expect(
      fetchWithRetry('https://api.notion.com/test', {}, { maxRetries: 1, baseDelay: 10 })
    ).rejects.toThrow('Network error');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('NotionService', () => {
  let service = null;
  let mockLogger = null;
  let originalFetch = null;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    service = new NotionService({
      apiKey: 'test-api-key',
      logger: mockLogger,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('constructor', () => {
    it('應該正確初始化', () => {
      expect(service.apiKey).toBe('test-api-key');
      expect(service.config.API_VERSION).toBe(NOTION_CONFIG.API_VERSION);
    });

    it('setApiKey 應該更新 API Key', () => {
      service.setApiKey('new-api-key');
      expect(service.apiKey).toBe('new-api-key');
    });
  });

  describe('checkPageExists', () => {
    it('應該在頁面存在時返回 true', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ archived: false }),
      });

      const result = await service.checkPageExists('page-123');
      expect(result).toBe(true);
    });

    it('應該在頁面被歸檔時返回 false', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ archived: true }),
      });

      const result = await service.checkPageExists('page-123');
      expect(result).toBe(false);
    });

    it('應該在 404 時返回 false', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await service.checkPageExists('page-123');
      expect(result).toBe(false);
    });

    it('應該在其他錯誤時返回 null', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        clone: () => ({ json: () => Promise.resolve({}) }),
      });

      const result = await service.checkPageExists('page-123');
      expect(result).toBeNull();
    });

    it('應該在沒有 API Key 時拋出錯誤', async () => {
      service.setApiKey(null);
      await expect(service.checkPageExists('page-123')).rejects.toThrow('API Key not configured');
    });
  });

  describe('appendBlocksInBatches', () => {
    it('應該成功分批添加區塊', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const blocks = Array.from({ length: 150 }, (_, i) => ({ type: 'paragraph', id: i }));
      const result = await service.appendBlocksInBatches('page-123', blocks);

      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(150);
      expect(result.totalCount).toBe(150);
      expect(global.fetch).toHaveBeenCalledTimes(2); // 100 + 50
    });

    it('應該處理空區塊數組', async () => {
      const result = await service.appendBlocksInBatches('page-123', []);
      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(0);
    });

    it('應該處理批次失敗', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: () => Promise.resolve('Bad request'),
        });

      const blocks = Array.from({ length: 150 }, (_, i) => ({ type: 'paragraph', id: i }));
      const result = await service.appendBlocksInBatches('page-123', blocks);

      expect(result.success).toBe(false);
      expect(result.addedCount).toBe(100);
      expect(result.error).toContain('批次添加失敗');
    });
  });

  describe('createPage', () => {
    it('應該成功創建頁面', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'new-page-id',
            url: 'https://notion.so/new-page',
          }),
      });

      const result = await service.createPage({ title: 'Test Page' });
      expect(result.success).toBe(true);
      expect(result.pageId).toBe('new-page-id');
      expect(result.url).toBe('https://notion.so/new-page');
    });

    it('應該處理創建失敗', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: 'Invalid page data' }),
      });

      const result = await service.createPage({ title: 'Test Page' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid page data');
    });
  });

  describe('updatePageTitle', () => {
    it('應該成功更新標題', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      const result = await service.updatePageTitle('page-123', 'New Title');
      expect(result.success).toBe(true);
    });
  });

  describe('deleteAllBlocks', () => {
    it('應該成功刪除所有區塊', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [{ id: 'block-1' }, { id: 'block-2' }],
            }),
        })
        .mockResolvedValue({ ok: true });

      const result = await service.deleteAllBlocks('page-123');
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);
    });

    it('應該處理沒有區塊的情況', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      const result = await service.deleteAllBlocks('page-123');
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(0);
    });
    it('應該處理分頁情況', async () => {
      global.fetch = jest
        .fn()
        // First page
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [{ id: 'block-1' }],
              has_more: true,
              next_cursor: 'cursor-1',
            }),
        })
        // Second page
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [{ id: 'block-2' }],
              has_more: false, // Explicitly false or omit
            }),
        })
        // Delete block 1
        .mockResolvedValueOnce({ ok: true })
        // Delete block 2
        .mockResolvedValueOnce({ ok: true });

      const result = await service.deleteAllBlocks('page-123');
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);
      // Calls: 1. List page 1, 2. List page 2, 3. Delete block 1, 4. Delete block 2
      expect(global.fetch).toHaveBeenCalledTimes(4);
    });
  });

  describe('filterValidImageBlocks', () => {
    it('should return empty array for null or undefined input', () => {
      const result1 = service.filterValidImageBlocks(null);
      // skipcq: JS-0356 - Intentionally testing undefined input handling
      const result2 = service.filterValidImageBlocks(undefined);

      expect(result1.validBlocks).toEqual([]);
      expect(result1.skippedCount).toBe(0);
      expect(result2.validBlocks).toEqual([]);
    });

    it('should return empty array for non-array input', () => {
      const result = service.filterValidImageBlocks('not an array');
      expect(result.validBlocks).toEqual([]);
    });

    it('should pass through non-image blocks', () => {
      const blocks = [
        { type: 'paragraph', paragraph: { rich_text: [] } },
        { type: 'heading_1', heading_1: { rich_text: [] } },
      ];

      const result = service.filterValidImageBlocks(blocks);
      expect(result.validBlocks).toEqual(blocks);
      expect(result.skippedCount).toBe(0);
    });

    it('should exclude all images when excludeImages is true', () => {
      const blocks = [
        { type: 'paragraph', paragraph: { rich_text: [] } },
        { type: 'image', image: { external: { url: 'https://example.com/img.jpg' } } },
        { type: 'heading_1', heading_1: { rich_text: [] } },
      ];

      const result = service.filterValidImageBlocks(blocks, true);
      expect(result.validBlocks.length).toBe(2);
      expect(result.skippedCount).toBe(1);
      expect(result.validBlocks.every(block => block.type !== 'image')).toBe(true);
    });

    it('should filter out images without URL', () => {
      const blocks = [
        { type: 'image', image: { external: {} } },
        { type: 'image', image: {} },
      ];

      const result = service.filterValidImageBlocks(blocks);
      expect(result.validBlocks).toEqual([]);
      expect(result.skippedCount).toBe(2);
    });

    it('should filter out images with too long URLs', () => {
      const longUrl = `https://example.com/${'a'.repeat(1600)}`;
      const blocks = [{ type: 'image', image: { external: { url: longUrl } } }];

      const result = service.filterValidImageBlocks(blocks);
      expect(result.validBlocks).toEqual([]);
      expect(result.skippedCount).toBe(1);
    });

    it('should filter out images with problematic characters', () => {
      const blocks = [
        { type: 'image', image: { external: { url: 'https://example.com/img<script>.jpg' } } },
        { type: 'image', image: { external: { url: 'https://example.com/img{}.jpg' } } },
        { type: 'image', image: { external: { url: 'https://example.com/img|test.jpg' } } },
      ];

      const result = service.filterValidImageBlocks(blocks);
      expect(result.validBlocks).toEqual([]);
      expect(result.skippedCount).toBe(3);
    });

    it('should filter out images with invalid protocol', () => {
      const blocks = [
        { type: 'image', image: { external: { url: 'ftp://example.com/img.jpg' } } },
        { type: 'image', image: { external: { url: 'data:image/png;base64,abc' } } },
      ];

      const result = service.filterValidImageBlocks(blocks);
      expect(result.validBlocks).toEqual([]);
      expect(result.skippedCount).toBe(2);
    });

    it('should filter out images with invalid hostname', () => {
      const blocks = [{ type: 'image', image: { external: { url: 'https://ab/img.jpg' } } }];

      const result = service.filterValidImageBlocks(blocks);
      expect(result.validBlocks).toEqual([]);
      expect(result.skippedCount).toBe(1);
    });

    it('should filter out images with invalid URL format', () => {
      const blocks = [{ type: 'image', image: { external: { url: 'not-a-valid-url' } } }];

      const result = service.filterValidImageBlocks(blocks);
      expect(result.validBlocks).toEqual([]);
      expect(result.skippedCount).toBe(1);
    });

    it('should keep valid image blocks', () => {
      const validImage = {
        type: 'image',
        image: { external: { url: 'https://example.com/image.jpg' } },
      };
      const blocks = [validImage];

      const result = service.filterValidImageBlocks(blocks);
      expect(result.validBlocks).toEqual([validImage]);
      expect(result.skippedCount).toBe(0);
    });

    it('should handle mixed blocks correctly', () => {
      const validImage = {
        type: 'image',
        image: { external: { url: 'https://example.com/valid.jpg' } },
      };
      const invalidImage = {
        type: 'image',
        image: { external: { url: 'ftp://invalid.com/img.jpg' } },
      };
      const paragraph = { type: 'paragraph', paragraph: { rich_text: [] } };

      const blocks = [paragraph, validImage, invalidImage];

      const result = service.filterValidImageBlocks(blocks);
      expect(result.validBlocks.length).toBe(2);
      expect(result.validBlocks).toContain(paragraph);
      expect(result.validBlocks).toContain(validImage);
      expect(result.skippedCount).toBe(1);
    });
  });

  describe('buildPageData', () => {
    it('should build page data for data_source type', () => {
      const result = service.buildPageData({
        title: 'Test Page',
        pageUrl: 'https://example.com',
        dataSourceId: 'db-123',
        dataSourceType: 'data_source',
        blocks: [{ type: 'paragraph', paragraph: { rich_text: [] } }],
      });

      expect(result.pageData.parent.type).toBe('data_source_id');
      expect(result.pageData.parent.data_source_id).toBe('db-123');
      expect(result.pageData.properties.Title.title[0].text.content).toBe('Test Page');
      expect(result.pageData.properties.URL.url).toBe('https://example.com');
    });

    it('should build page data for page type', () => {
      const result = service.buildPageData({
        title: 'Child Page',
        pageUrl: 'https://example.com',
        dataSourceId: 'page-456',
        dataSourceType: 'page',
        blocks: [],
      });

      expect(result.pageData.parent.type).toBe('page_id');
      expect(result.pageData.parent.page_id).toBe('page-456');
    });

    it('should add site icon when provided', () => {
      const result = service.buildPageData({
        title: 'With Icon',
        pageUrl: 'https://example.com',
        dataSourceId: 'db-123',
        blocks: [],
        siteIcon: 'https://example.com/icon.png',
      });

      expect(result.pageData.icon).toEqual({
        type: 'external',
        external: { url: 'https://example.com/icon.png' },
      });
    });

    it('should filter image blocks and return skipped count', () => {
      const blocks = [
        { type: 'paragraph', paragraph: { rich_text: [] } },
        { type: 'image', image: { external: { url: 'ftp://invalid.com/img.jpg' } } },
      ];

      const result = service.buildPageData({
        title: 'Test',
        pageUrl: 'https://example.com',
        dataSourceId: 'db-123',
        blocks,
      });

      expect(result.skippedCount).toBe(1);
      expect(result.validBlocks.length).toBe(1);
    });

    it('should limit children to BATCH_SIZE', () => {
      const blocks = Array(150)
        .fill(null)
        .map(() => ({ type: 'paragraph', paragraph: { rich_text: [] } }));

      const result = service.buildPageData({
        title: 'Long Article',
        pageUrl: 'https://example.com',
        dataSourceId: 'db-123',
        blocks,
      });

      expect(result.pageData.children.length).toBe(100);
      expect(result.validBlocks.length).toBe(150);
    });

    it('should use default values for missing options', () => {
      const result = service.buildPageData({
        dataSourceId: 'db-123',
      });

      expect(result.pageData.properties.Title.title[0].text.content).toBe('Untitled');
      expect(result.pageData.properties.URL.url).toBe('');
    });
  });

  describe('refreshPageContent', () => {
    let originalFetch = null;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should return error when delete fails', async () => {
      // Mock deleteAllBlocks 失敗
      service.deleteAllBlocks = jest.fn().mockResolvedValue({
        success: false,
        deletedCount: 0,
        error: 'Delete failed',
      });

      const result = await service.refreshPageContent('page-123', []);

      expect(result.success).toBe(false);
      expect(result.error).toContain('刪除區塊失敗');
    });

    it('should update title when option is set', async () => {
      service.updatePageTitle = jest.fn().mockResolvedValue({ success: true });
      service.deleteAllBlocks = jest.fn().mockResolvedValue({ success: true, deletedCount: 5 });
      service.appendBlocksInBatches = jest.fn().mockResolvedValue({ success: true, addedCount: 2 });

      await service.refreshPageContent('page-123', [], {
        updateTitle: true,
        title: 'New Title',
      });

      expect(service.updatePageTitle).toHaveBeenCalledWith('page-123', 'New Title');
    });

    it('should return success with counts on completion', async () => {
      service.deleteAllBlocks = jest.fn().mockResolvedValue({ success: true, deletedCount: 5 });
      service.appendBlocksInBatches = jest.fn().mockResolvedValue({ success: true, addedCount: 3 });

      const result = await service.refreshPageContent('page-123', [
        { type: 'paragraph', paragraph: { rich_text: [] } },
      ]);

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(5);
    });

    it('should handle exceptions gracefully', async () => {
      service.deleteAllBlocks = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await service.refreshPageContent('page-123', []);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });
});
