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
  });
});
