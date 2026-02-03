/**
 * NotionService 單元測試
 */

import {
  NotionService,
  fetchWithRetry,
  NOTION_CONFIG,
} from '../../../../scripts/background/services/NotionService.js';

describe('fetchWithRetry', () => {
  let originalFetch = null;

  beforeEach(() => {
    jest.useFakeTimers();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('應該在成功時直接返回響應', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const result = await fetchWithRetry('https://api.notion.com/test', {});
    expect(result.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('應該在 5xx 錯誤時重試', async () => {
    globalThis.fetch = jest
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

    const promise = fetchWithRetry(
      'https://api.notion.com/test',
      {},
      { maxRetries: 1, baseDelay: 1000 }
    );

    // 快進時間以處理延遲
    await jest.advanceTimersByTimeAsync(10_000);

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('應該在達到最大重試次數後返回錯誤響應', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      clone: () => ({ json: () => Promise.resolve({}) }),
    });

    const promise = fetchWithRetry(
      'https://api.notion.com/test',
      {},
      { maxRetries: 1, baseDelay: 1000 }
    );

    // 快進時間以處理延遲
    await jest.advanceTimersByTimeAsync(10_000);

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('應該在網絡錯誤時重試', async () => {
    globalThis.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

    const promise = fetchWithRetry(
      'https://api.notion.com/test',
      {},
      { maxRetries: 1, baseDelay: 1000 }
    );

    // 快進時間以處理延遲
    await jest.advanceTimersByTimeAsync(10_000);

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('應該在達到最大重試次數後拋出網絡錯誤', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const promise = fetchWithRetry(
      'https://api.notion.com/test',
      {},
      { maxRetries: 1, baseDelay: 1000 }
    );
    const expectation = await expect(promise).rejects.toThrow('Network error');

    // 快進時間以處理延遲
    jest.runAllTimers();
    // Aggressively flush microtasks to ensure async/await loop proceeds
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }

    await expectation;
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('NotionService', () => {
  let service = null;
  let mockLogger = null;
  let originalFetch = null;

  beforeEach(() => {
    jest.useFakeTimers();
    originalFetch = globalThis.fetch;
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
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
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

  describe('_buildUrl', () => {
    it('應該正確處理帶有前導斜線的路徑', () => {
      const url = service._buildUrl('/pages/123');
      expect(url).toBe('https://api.notion.com/v1/pages/123');
    });

    it('應該自動為缺少斜線的路徑添加前導斜線', () => {
      const url = service._buildUrl('pages/123');
      expect(url).toBe('https://api.notion.com/v1/pages/123');
    });

    it('應該正確處理查詢參數', () => {
      const url = service._buildUrl('/search', { query: 'test', limit: 10 });
      expect(url).toBe('https://api.notion.com/v1/search?query=test&limit=10');
    });

    it('應該過濾 null 和 undefined 的查詢參數', () => {
      const url = service._buildUrl('/search', { query: 'test', filter: null, sort: undefined });
      expect(url).toBe('https://api.notion.com/v1/search?query=test');
    });

    it('應該在路徑不是字串時拋出錯誤', () => {
      expect(() => service._buildUrl(123)).toThrow('Invalid path: must be a string');
      expect(() => service._buildUrl(null)).toThrow('Invalid path: must be a string');
      expect(() => service._buildUrl()).toThrow('Invalid path: must be a string');
    });

    it('應該正確處理包含特殊字符的路徑', () => {
      const url = service._buildUrl('/blocks/123-456/children');
      expect(url).toBe('https://api.notion.com/v1/blocks/123-456/children');
    });

    it('應該確保 Base URL 與路徑之間只有一個斜線', () => {
      // 保存原始值以確保測試隔離
      const originalBaseUrl = service.config.BASE_URL;

      try {
        // 模擬 Base URL 結尾帶有斜線的情況 (雖然 config 中通常沒有，但以防萬一)
        service.config.BASE_URL = 'https://api.notion.com/v1/';
        const url1 = service._buildUrl('/pages');
        const url2 = service._buildUrl('pages');

        expect(url1).toBe('https://api.notion.com/v1/pages');
        expect(url2).toBe('https://api.notion.com/v1/pages');
      } finally {
        // 確保即使測試失敗也恢復原始配置
        service.config.BASE_URL = originalBaseUrl;
      }
    });
  });

  describe('checkPageExists', () => {
    it('應該在頁面存在時返回 true', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ archived: false }),
      });

      const result = await service.checkPageExists('page-123');
      expect(result).toBe(true);
    });

    it('應該在頁面被歸檔時返回 false', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ archived: true }),
      });

      const result = await service.checkPageExists('page-123');
      expect(result).toBe(false);
    });

    it('應該在 404 時返回 false', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await service.checkPageExists('page-123');
      expect(result).toBe(false);
    });

    it('應該在其他錯誤時返回 null', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        clone: () => ({ json: () => Promise.resolve({}) }),
      });

      const promise = service.checkPageExists('page-123');
      await jest.advanceTimersByTimeAsync(10_000);
      const result = await promise;
      expect(result).toBeNull();
    });

    it('應該在沒有 API Key 時拋出錯誤', async () => {
      service.setApiKey(null);
      await expect(service.checkPageExists('page-123')).rejects.toThrow('API Key');
    });

    it('應該處理非 JSON 錯誤響應', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        json: () => Promise.reject(new Error('Not JSON')),
      });

      const promise = service.checkPageExists('page-123');
      await jest.advanceTimersByTimeAsync(10_000);
      const result = await promise;
      expect(result).toBeNull();
    });
  });

  describe('appendBlocksInBatches', () => {
    it('應該成功分批添加區塊', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const blocks = Array.from({ length: 150 }, (_, i) => ({ type: 'paragraph', id: i }));

      const promise = service.appendBlocksInBatches('page-123', blocks);

      // 快進時間以處理批次間的延遲
      await jest.advanceTimersByTimeAsync(10_000);

      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(150);
      expect(result.totalCount).toBe(150);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2); // 100 + 50
    });

    it('應該處理空區塊數組', async () => {
      const result = await service.appendBlocksInBatches('page-123', []);
      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(0);
    });

    it('應該處理批次失敗', async () => {
      globalThis.fetch = jest
        .fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: () => Promise.resolve('Bad request'),
        });

      const blocks = Array.from({ length: 150 }, (_, i) => ({ type: 'paragraph', id: i }));

      const promise = service.appendBlocksInBatches('page-123', blocks);
      await jest.advanceTimersByTimeAsync(10_000);
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.addedCount).toBe(100);
      // 應該返回標準化的 Invalid request
      expect(result.error).toBe('Invalid request');
    });
  });

  describe('createPage', () => {
    it('應該成功創建頁面', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
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
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: 'Validation failed for page data' }),
      });

      const result = await service.createPage({ title: 'Test Page' });
      expect(result.success).toBe(false);
      // 應該返回標準化的 Invalid request
      expect(result.error).toBe('Invalid request');
    });
  });

  describe('updatePageTitle', () => {
    it('應該成功更新標題', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({ ok: true });

      const result = await service.updatePageTitle('page-123', 'New Title');
      expect(result.success).toBe(true);
    });
  });

  describe('deleteAllBlocks', () => {
    it('應該成功刪除所有區塊', async () => {
      globalThis.fetch = jest
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
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      const result = await service.deleteAllBlocks('page-123');
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(0);
    });
    it('應該處理分頁情況', async () => {
      globalThis.fetch = jest
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

      const promise = service.deleteAllBlocks('page-123');

      // 無論是否有延遲，快進時間總是安全的
      await jest.advanceTimersByTimeAsync(10_000);

      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);
      // Calls: 1. List page 1, 2. List page 2, 3. Delete block 1, 4. Delete block 2
      expect(globalThis.fetch).toHaveBeenCalledTimes(4);
    });
  });

  describe('filterValidImageBlocks', () => {
    it('should return empty array for null or undefined input', () => {
      const result1 = service.filterValidImageBlocks(null);
      const result2 = service.filterValidImageBlocks();

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
      expect(result.validBlocks).toHaveLength(2);
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
        { type: 'image', image: { external: { url: 'sftp://example.com/img.jpg' } } },
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
        image: { external: { url: 'sftp://invalid.com/img.jpg' } },
      };
      const paragraph = { type: 'paragraph', paragraph: { rich_text: [] } };

      const blocks = [paragraph, validImage, invalidImage];

      const result = service.filterValidImageBlocks(blocks);
      expect(result.validBlocks).toHaveLength(2);
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
        { type: 'image', image: { external: { url: 'sftp://invalid.com/img.jpg' } } },
      ];

      const result = service.buildPageData({
        title: 'Test',
        pageUrl: 'https://example.com',
        dataSourceId: 'db-123',
        blocks,
      });

      expect(result.skippedCount).toBe(1);
      expect(result.validBlocks).toHaveLength(1);
    });

    it('should limit children to BATCH_SIZE', () => {
      const blocks = Array.from({ length: 150 })
        .fill(null)
        .map(() => ({ type: 'paragraph', paragraph: { rich_text: [] } }));

      const result = service.buildPageData({
        title: 'Long Article',
        pageUrl: 'https://example.com',
        dataSourceId: 'db-123',
        blocks,
      });

      expect(result.pageData.children).toHaveLength(100);
      expect(result.validBlocks).toHaveLength(150);
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
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
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

      const promise = service.refreshPageContent('page-123', []);

      await jest.advanceTimersByTimeAsync(10_000);

      const result = await promise;

      expect(result.success).toBe(false);
      // 驗證返回清理後的用戶友好錯誤訊息
      // 應該返回標準化的 Network error
      expect(result.error).toContain('Network error');
    });
  });
  describe('_findHighlightSectionBlocks', () => {
    it('應該找出標記區域的標題區塊及隨後的內容', () => {
      const blocks = [
        { id: '1', type: 'paragraph' },
        {
          id: '2',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ text: { content: '📝 頁面標記' }, plain_text: '📝 頁面標記' }],
          },
        },
        { id: '3', type: 'paragraph' }, // Changed to paragraph to match strict logic
        { id: '4', type: 'heading_2' }, // 停止點
      ];

      const result = NotionService._findHighlightSectionBlocks(blocks);
      expect(result).toHaveLength(2); // ID: 2 and 3
      expect(result).toEqual(['2', '3']);
    });

    it('應該處理只有標題沒有內容的情況', () => {
      const blocks = [
        { id: '1', type: 'paragraph' },
        {
          id: '2',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ text: { content: '📝 頁面標記' }, plain_text: '📝 頁面標記' }],
          },
        },
      ];

      const result = NotionService._findHighlightSectionBlocks(blocks);
      expect(result).toHaveLength(1);
      expect(result).toEqual(['2']);
    });

    it('應該處理沒有標記區域的情況', () => {
      const blocks = [
        { id: '1', type: 'paragraph' },
        {
          id: '2',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ text: { content: '其他標題' }, plain_text: '其他標題' }],
          },
        },
      ];

      const result = NotionService._findHighlightSectionBlocks(blocks);
      expect(result).toHaveLength(0);
    });

    it('應收集所有非標題類型的區塊', () => {
      const blocks = [
        {
          id: '1',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ text: { content: '📝 頁面標記' }, plain_text: '📝 頁面標記' }],
          },
        },
        { id: '2', type: 'bulleted_list_item', has_children: true }, // 應收集
        { id: '3', type: 'paragraph' }, // 應收集
      ];

      const result = NotionService._findHighlightSectionBlocks(blocks);
      expect(result).toEqual(['1', '2', '3']); // 收集所有非標題區塊
    });
  });

  describe('updateHighlightsSection', () => {
    const pageId = 'page-123';
    const highlightBlocks = [
      { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'New Highlight' }] } },
    ];

    it('應該成功更新標記區域（刪除舊的並添加新的）', async () => {
      // Mock 獲取現有區塊
      service._fetchPageBlocks = jest.fn().mockResolvedValue({
        success: true,
        blocks: [
          { id: '1', type: 'paragraph' },
          {
            id: '2',
            type: 'heading_3',
            heading_3: {
              rich_text: [{ text: { content: '📝 頁面標記' }, plain_text: '📝 頁面標記' }],
            },
          },
          { id: '3', type: 'paragraph' }, // 舊標記 (changed to paragraph)
        ],
      });

      // Mock 刪除操作
      service._deleteBlocksByIds = jest.fn().mockResolvedValue({
        successCount: 2, // 刪除了 ID 2 和 3
        failureCount: 0,
        errors: [],
      });

      // Mock 添加操作 (_apiRequest PATCH children)
      service._apiRequest = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ results: [{}, {}] }),
      });

      const result = await service.updateHighlightsSection(pageId, highlightBlocks);

      expect(service._fetchPageBlocks).toHaveBeenCalledWith(pageId);
      expect(service._deleteBlocksByIds).toHaveBeenCalledWith(['2', '3']);
      expect(service._apiRequest).toHaveBeenCalledWith(
        `/blocks/${pageId}/children`,
        expect.objectContaining({
          method: 'PATCH',
          body: { children: highlightBlocks },
        })
      );

      expect(result).toEqual({
        success: true,
        deletedCount: 2,
        addedCount: 2,
        skippedImageCount: undefined,
        error: undefined,
      });
    });

    it('應該處理獲取現有區塊失敗', async () => {
      service._fetchPageBlocks = jest.fn().mockResolvedValue({
        success: false,
        error: 'Fetch failed',
      });
      service._deleteBlocksByIds = jest.fn();

      const result = await service.updateHighlightsSection(pageId, highlightBlocks);

      expect(result).toEqual({
        success: false,
        error: 'Fetch failed',
      });
      expect(service._deleteBlocksByIds).not.toHaveBeenCalled();
    });

    it('應該處理添加新標記失敗', async () => {
      // Mock 獲取成功
      service._fetchPageBlocks = jest.fn().mockResolvedValue({
        success: true,
        blocks: [],
      });
      service._deleteBlocksByIds = jest.fn().mockResolvedValue({
        successCount: 0,
        failureCount: 0,
        errors: [],
      });

      // Mock 添加失敗
      service._apiRequest = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: jest.fn().mockResolvedValue({ message: 'Invalid data' }),
        text: jest.fn().mockResolvedValue('Invalid data'),
      });

      const result = await service.updateHighlightsSection(pageId, highlightBlocks);

      expect(result.success).toBe(false);
      expect(result.deletedCount).toBe(0);
      expect(result.error).toBeDefined();
    });

    it('應該正確處理分頁以獲取所有區塊', async () => {
      // 第一頁響應（還有更多）
      service._apiRequest = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [{ id: 'block-1' }],
            has_more: true,
            next_cursor: 'cursor-2',
          }),
        })
        // 第二頁響應（結束）
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({
            results: [{ id: 'block-2' }],
            has_more: false,
            next_cursor: null,
          }),
        });

      // Mock 刪除操作
      service._deleteBlocksByIds = jest.fn().mockResolvedValue({
        successCount: 0,
        failureCount: 0,
        errors: [],
      });

      // Mock 添加操作
      service._apiRequest.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ results: [] }),
      });

      // 觸發調用
      await service.updateHighlightsSection(pageId, highlightBlocks);

      // 驗證 API 調用次數
      // 1. fetch page 1
      // 2. fetch page 2
      // 3. delete (if any) - here none
      // 4. add new blocks
      // 注意：由於 _fetchPageBlocks 內部循環調用了 _apiRequest，我們需要檢查 mock 的調用參數

      // 檢查第一次調用 (Page 1)
      expect(service._apiRequest).toHaveBeenNthCalledWith(
        1,
        `/blocks/${pageId}/children`,
        expect.objectContaining({
          queryParams: expect.objectContaining({ start_cursor: null }),
        })
      );

      // 檢查第二次調用 (Page 2)
      expect(service._apiRequest).toHaveBeenNthCalledWith(
        2,
        `/blocks/${pageId}/children`,
        expect.objectContaining({
          queryParams: expect.objectContaining({ start_cursor: 'cursor-2' }),
        })
      );
    });

    it('應該正確處理空標記列表（只刪除不添加）', async () => {
      service._fetchPageBlocks = jest.fn().mockResolvedValue({
        success: true,
        blocks: [
          {
            id: '2',
            type: 'heading_3',
            heading_3: {
              rich_text: [{ text: { content: '📝 頁面標記' }, plain_text: '📝 頁面標記' }],
            },
          },
        ],
      });
      service._deleteBlocksByIds = jest.fn().mockResolvedValue({
        successCount: 1,
        failureCount: 0,
        errors: [],
      });
      service._apiRequest = jest.fn();

      const result = await service.updateHighlightsSection(pageId, []);

      expect(service._deleteBlocksByIds).toHaveBeenCalled();
      expect(service._apiRequest).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        deletedCount: 1,
        addedCount: 0,
      });
    });
  });

  describe('_apiRequest', () => {
    it('應該在 body 為 null 時不包含 body', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

      await service._apiRequest('/test', { method: 'POST', body: null });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({
          method: 'POST',
        })
      );
      const callArgs = globalThis.fetch.mock.calls[0][1];
      expect(callArgs).not.toHaveProperty('body');
    });

    it('應該在 body 為 undefined 時不包含 body', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

      await service._apiRequest('/test', { method: 'POST', body: undefined });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.not.objectContaining({ body: expect.anything() })
      );
      const callArgs = globalThis.fetch.mock.calls[0][1];
      expect(callArgs).not.toHaveProperty('body');
    });

    it('應該在 body 為空對象時包含 body', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

      await service._apiRequest('/test', { method: 'POST', body: {} });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({
          body: '{}',
        })
      );
    });

    it('應該正常處理普通對象 body', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      const body = { key: 'value' };

      await service._apiRequest('/test', { method: 'POST', body });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({
          body: JSON.stringify(body),
        })
      );
    });
  });

  describe('_findHighlightSectionBlocks (靜態方法)', () => {
    const HEADER = '📝 頁面標記';

    it('應該正確識別標記區塊', () => {
      const blocks = [
        { id: '1', type: 'paragraph' },
        {
          id: '2',
          type: 'heading_3',
          heading_3: { rich_text: [{ text: { content: HEADER } }] },
        },
        { id: '3', type: 'paragraph' },
        { id: '4', type: 'paragraph' },
      ];

      const result = NotionService._findHighlightSectionBlocks(blocks);
      expect(result).toEqual(['2', '3', '4']);
    });

    it('應該在遇到下一個標題時停止收集', () => {
      const blocks = [
        {
          id: '1',
          type: 'heading_3',
          heading_3: { rich_text: [{ text: { content: HEADER } }] },
        },
        { id: '2', type: 'paragraph' },
        { id: '3', type: 'heading_2', heading_2: { rich_text: [] } },
        { id: '4', type: 'paragraph' },
      ];

      const result = NotionService._findHighlightSectionBlocks(blocks);
      expect(result).toEqual(['1', '2']);
    });

    it('應該正確處理沒有標記區域的情況', () => {
      const blocks = [
        { id: '1', type: 'paragraph' },
        { id: '2', type: 'heading_2', heading_2: { rich_text: [] } },
      ];

      const result = NotionService._findHighlightSectionBlocks(blocks);
      expect(result).toEqual([]);
    });

    it('應該處理空區塊數組', () => {
      const result = NotionService._findHighlightSectionBlocks([]);
      expect(result).toEqual([]);
    });

    it('應收集所有非標題類型的區塊', () => {
      const blocks = [
        {
          id: '1',
          type: 'heading_3',
          heading_3: { rich_text: [{ text: { content: HEADER } }] },
        },
        { id: '2', type: 'paragraph' },
        { id: '3', type: 'image', image: {} }, // 非標題，應收集
        { id: '4', type: 'paragraph' },
      ];

      const result = NotionService._findHighlightSectionBlocks(blocks);
      expect(result).toEqual(['1', '2', '3', '4']); // 收集所有非標題區塊
    });

    it('應該處理標記區域在頁面末尾的情況', () => {
      const blocks = [
        { id: '1', type: 'paragraph' },
        { id: '2', type: 'paragraph' },
        {
          id: '3',
          type: 'heading_3',
          heading_3: { rich_text: [{ text: { content: HEADER } }] },
        },
        { id: '4', type: 'paragraph' },
      ];

      const result = NotionService._findHighlightSectionBlocks(blocks);
      expect(result).toEqual(['3', '4']);
    });
  });
});
