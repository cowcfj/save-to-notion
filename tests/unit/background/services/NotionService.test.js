// 1. Mocks MUST be at the very top
jest.mock('../../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    success: jest.fn(),
    debug: jest.fn(),
    debugEnabled: true,
  },
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
  debug: jest.fn(),
  debugEnabled: true,
}));

jest.mock('../../../../scripts/utils/notionAuth.js', () => ({
  getActiveNotionToken: jest.fn(),
  refreshOAuthToken: jest.fn(),
}));

// 2. Imports
import { NotionService } from '../../../../scripts/background/services/NotionService.js';
import { CONTENT_QUALITY } from '../../../../scripts/config/index.js';
import { HIGHLIGHT_ERROR_CODES } from '../../../../scripts/config/messages.js';
import { NOTION_API } from '../../../../scripts/config/api.js';
import { fetchWithRetry } from '../../../../scripts/utils/RetryManager.js';
import Logger from '../../../../scripts/utils/Logger.js';
import { getActiveNotionToken, refreshOAuthToken } from '../../../../scripts/utils/notionAuth.js';
import notionBlockFixtures from '../../../fixtures/json/notion-api-blocks.json';

const createMockResponse = (data, ok = true, status = 200) => ({
  ok,
  status,
  headers: new Headers([['content-type', 'application/json']]),
  clone() {
    return this;
  },
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data)),
});

const mockFetchResponse = createMockResponse({});

const createMockNotionBlock = (id, fixtureType = 'paragraph') => ({
  id,
  ...structuredClone(notionBlockFixtures[fixtureType]),
});

describe('fetchWithRetry', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    globalThis.fetch = jest.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('應該在成功時直接返回響應', async () => {
    globalThis.fetch.mockResolvedValue({ ...mockFetchResponse, ok: true, status: 200 });

    const result = await fetchWithRetry('https://api.notion.com/test', {});
    expect(result.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('應該在 5xx 錯誤時重試', async () => {
    jest.useRealTimers();
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce(createMockResponse({}, false, 500))
      .mockResolvedValueOnce(createMockResponse({ ok: true }));

    const result = await fetchWithRetry(
      'https://api.notion.com/test',
      {},
      { maxRetries: 1, baseDelay: 10 }
    );

    expect(result.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('應該在達到最大重試次數後返回錯誤響應', async () => {
    jest.useRealTimers();
    globalThis.fetch.mockResolvedValue(createMockResponse({}, false, 500));

    const promise = fetchWithRetry(
      'https://api.notion.com/test',
      {},
      { maxRetries: 1, baseDelay: 10 }
    );

    await expect(promise).rejects.toThrow(/HTTP 狀態：500/);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('應該在網絡錯誤時重試', async () => {
    jest.useRealTimers();
    globalThis.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce(createMockResponse({ ok: true }));

    const result = await fetchWithRetry(
      'https://api.notion.com/test',
      {},
      { maxRetries: 1, baseDelay: 10 }
    );

    expect(result.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('應該在達到最大重試次數後拋出網絡錯誤', async () => {
    const error = new Error('Network error');
    error.name = 'NetworkError';
    globalThis.fetch = jest.fn().mockRejectedValue(error);

    // 啟動請求，但不等待它完成 (Promise 會處於 pending 狀態等待重試計時器)
    const promise = fetchWithRetry(
      'https://api.notion.com/test',
      {},
      { maxRetries: 1, baseDelay: 1000 }
    );

    // 先 flush 微任務，讓初始請求失敗並排入重試計時器。
    // 這個案例需要在重試發生前先驗證中間狀態，因此保留手動 flush，
    // 而不是直接用 advanceTimersByTimeAsync 一次跑完整段非同步流程。
    const flushMicrotasks = async (count = 10) => {
      for (let i = 0; i < count; i++) {
        await Promise.resolve();
      }
    };
    await flushMicrotasks();

    // 驗證第一次調用已發生
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // 快進時間以觸發重試 (確保超過 baseDelay)
    jest.advanceTimersByTime(2000);

    // 再次 flush 以執行重試請求
    await flushMicrotasks();

    // 等待 Promise 拒絕並驗證錯誤
    await expect(promise).rejects.toThrow('Network error');

    // 驗證總共調用次數（初始 + 1次重試）
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('NotionService', () => {
  let service = null;
  let mockLogger = null;
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    getActiveNotionToken.mockResolvedValue({ token: 'test-api-key', mode: 'manual' });
    refreshOAuthToken.mockResolvedValue(null);
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      success: jest.fn(),
    };
    // 預設完整的 fetch mock 以符合 SDK 預期 (複用外部定義)
    globalThis.fetch = jest.fn().mockResolvedValue(mockFetchResponse);

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
      expect(service.config.API_VERSION).toBe(NOTION_API.API_VERSION);
    });

    it('setApiKey 應該更新 API Key', () => {
      service.setApiKey('new-api-key');
      expect(service.apiKey).toBe('new-api-key');
    });

    it('應該使用 cache: no-store 初始化 client', async () => {
      // Force init
      service._initClient();

      // Trigger a fetch to verify options
      // We need to access private client or trigger a method that uses it
      // Using a public method that triggers fetch
      await service.checkPageExists('page-123');

      // Verify the fetch mock was called with correct options in the last call
      // Note: _initClient creates the client with the custom fetch
      // We need to check if that custom fetch passes the cache option

      // Since we can't easily spy on the internal fetch wrapper without redesigning the test,
      // we can check if globalThis.fetch was called with expected options
      // when a request is made.
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ cache: 'no-store' })
      );
    });
  });

  describe('OAuth 401 retry flow', () => {
    it('401 + OAuth + refresh 成功時應重試一次', async () => {
      const unauthorizedError = new Error('Unauthorized');
      unauthorizedError.status = 401;
      const staleClient = { id: 'stale-client' };

      const executeWithRetrySpy = jest
        .spyOn(service, '_executeWithRetry')
        .mockRejectedValueOnce(unauthorizedError)
        .mockResolvedValueOnce({ ok: true });

      getActiveNotionToken.mockResolvedValueOnce({
        token: 'oauth_old_token',
        mode: 'oauth',
      });
      refreshOAuthToken.mockResolvedValueOnce('oauth_new_token');

      const result = await service._callNotionApiWithRetry(jest.fn(), {
        apiKey: 'oauth_old_token',
        label: 'TestOperation',
        client: staleClient,
      });

      expect(result).toEqual({ ok: true });
      expect(refreshOAuthToken).toHaveBeenCalledTimes(1);
      expect(executeWithRetrySpy).toHaveBeenCalledTimes(2);
      expect(executeWithRetrySpy).toHaveBeenNthCalledWith(
        2,
        expect.any(Function),
        expect.objectContaining({
          apiKey: 'oauth_new_token',
        })
      );
      expect(executeWithRetrySpy.mock.calls[1][1].client).toBeUndefined();
    });

    it('401 + OAuth + refresh 失敗時應拋出原錯誤', async () => {
      const unauthorizedError = new Error('Unauthorized');
      unauthorizedError.status = 401;

      jest.spyOn(service, '_executeWithRetry').mockRejectedValueOnce(unauthorizedError);
      getActiveNotionToken.mockResolvedValueOnce({
        token: 'oauth_old_token',
        mode: 'oauth',
      });
      refreshOAuthToken.mockResolvedValueOnce(null);

      await expect(
        service._callNotionApiWithRetry(jest.fn(), {
          apiKey: 'oauth_old_token',
          label: 'TestOperation',
        })
      ).rejects.toBe(unauthorizedError);
      expect(refreshOAuthToken).toHaveBeenCalledTimes(1);
    });

    it('401 + 非 OAuth 模式時不應刷新 token', async () => {
      const unauthorizedError = new Error('Unauthorized');
      unauthorizedError.status = 401;

      jest.spyOn(service, '_executeWithRetry').mockRejectedValueOnce(unauthorizedError);
      getActiveNotionToken.mockResolvedValueOnce({
        token: 'manual_key',
        mode: 'manual',
      });

      await expect(
        service._callNotionApiWithRetry(jest.fn(), {
          apiKey: 'manual_key',
          label: 'TestOperation',
        })
      ).rejects.toBe(unauthorizedError);
      expect(refreshOAuthToken).not.toHaveBeenCalled();
    });
  });

  describe('checkPageExists', () => {
    it('應該在頁面存在時返回 true', async () => {
      globalThis.fetch.mockResolvedValue({
        ...mockFetchResponse,
        ok: true,
        json: () => Promise.resolve({ archived: false }),
      });

      const result = await service.checkPageExists('page-123');
      expect(result).toBe(true);
    });

    it('應該在頁面被歸檔時返回 false', async () => {
      globalThis.fetch.mockResolvedValue(createMockResponse({ archived: true }));

      const result = await service.checkPageExists('page-123');
      expect(result).toBe(false);
    });

    it('應該在 404 時返回 false', async () => {
      globalThis.fetch.mockResolvedValue({ ...mockFetchResponse, ok: false, status: 404 });

      const result = await service.checkPageExists('page-123');
      expect(result).toBe(false);
    });

    it('應該在其他錯誤時返回 null', async () => {
      globalThis.fetch.mockResolvedValue({
        ...mockFetchResponse,
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
      globalThis.fetch.mockResolvedValue({
        ...mockFetchResponse,
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
    const TOTAL_BLOCKS = 150;
    const BATCH_SIZE = 50;
    const EXPECTED_ADDED = TOTAL_BLOCKS - BATCH_SIZE;
    const TIMER_ADVANCE_MS = 10_000;

    it('應該成功分批添加區塊', async () => {
      globalThis.fetch.mockResolvedValue({
        ...mockFetchResponse,
        ok: true,
        json: () => Promise.resolve({}),
      });

      const blocks = Array.from({ length: TOTAL_BLOCKS }, (_, i) => ({ type: 'paragraph', id: i }));

      const promise = service.appendBlocksInBatches('page-123', blocks);

      // 快進時間以處理批次間的延遲
      await jest.advanceTimersByTimeAsync(TIMER_ADVANCE_MS);

      const result = await promise;
      const expectedCalls = Math.ceil(blocks.length / NOTION_API.BLOCKS_PER_BATCH);

      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(TOTAL_BLOCKS);
      expect(result.totalCount).toBe(TOTAL_BLOCKS);
      expect(globalThis.fetch).toHaveBeenCalledTimes(expectedCalls);
    });

    it('應該處理空區塊數組', async () => {
      const result = await service.appendBlocksInBatches('page-123', []);
      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(0);
    });

    it('應該處理批次失敗', async () => {
      globalThis.fetch
        .mockResolvedValueOnce(createMockResponse({ results: [] }))
        .mockResolvedValueOnce(
          createMockResponse(
            {
              object: 'error',
              status: 400,
              code: 'validation_error',
              message: 'Bad request',
            },
            false,
            400
          )
        );

      const blocks = Array.from({ length: TOTAL_BLOCKS }, (_, i) => ({ type: 'paragraph', id: i }));

      const promise = service.appendBlocksInBatches('page-123', blocks);
      await jest.advanceTimersByTimeAsync(10_000);
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.addedCount).toBe(100);
      expect(result.error).toBe('validation_error');
    });

    it('應該從指定索引開始處理', async () => {
      globalThis.fetch.mockResolvedValue({
        ...mockFetchResponse,
        ok: true,
        json: () => Promise.resolve({}),
      });

      const blocks = Array.from({ length: TOTAL_BLOCKS }, (_, i) => ({ type: 'paragraph', id: i }));

      const promise = service.appendBlocksInBatches('page-123', blocks, BATCH_SIZE);

      // 快進時間以處理批次間的延遲
      await jest.advanceTimersByTimeAsync(TIMER_ADVANCE_MS);

      const result = await promise;
      const expectedCalls = Math.ceil(EXPECTED_ADDED / NOTION_API.BLOCKS_PER_BATCH);

      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(EXPECTED_ADDED);
      expect(result.totalCount).toBe(EXPECTED_ADDED);
      expect(globalThis.fetch).toHaveBeenCalledTimes(expectedCalls);

      // 驗證已略過前 BATCH_SIZE 個項目
      const fetchArg = globalThis.fetch.mock.calls[0][1];
      const reqBody = JSON.parse(fetchArg.body);
      expect(reqBody.children[0].id).toBe(BATCH_SIZE);
    });

    it('startIndex 等於 blocks.length 時應回傳空結果且不發送請求', async () => {
      const blocks = Array.from({ length: TOTAL_BLOCKS }, (_, i) => ({ type: 'paragraph', id: i }));

      const promise = service.appendBlocksInBatches('page-123', blocks, blocks.length);
      await jest.advanceTimersByTimeAsync(TIMER_ADVANCE_MS);
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(0);
      expect(result.totalCount).toBe(0);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('startIndex 大於 blocks.length 時應回傳空結果且不發送請求', async () => {
      const blocks = Array.from({ length: TOTAL_BLOCKS }, (_, i) => ({ type: 'paragraph', id: i }));

      const promise = service.appendBlocksInBatches('page-123', blocks, blocks.length + 1);
      await jest.advanceTimersByTimeAsync(TIMER_ADVANCE_MS);
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(0);
      expect(result.totalCount).toBe(0);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  describe('createPage', () => {
    it('應該成功創建頁面', async () => {
      globalThis.fetch.mockResolvedValue(
        createMockResponse({
          object: 'page',
          id: 'new-page-id',
          url: 'https://notion.so/new-page',
        })
      );

      const result = await service.createPage({ title: 'Test Page' });
      expect(result.success).toBe(true);
      expect(result.pageId).toBe('new-page-id');
      expect(result.url).toBe('https://notion.so/new-page');
    });

    it('應該處理創建失敗', async () => {
      globalThis.fetch.mockResolvedValue(
        createMockResponse(
          {
            object: 'error',
            status: 400,
            code: 'validation_error',
            message: 'Validation failed for page data',
          },
          false,
          400
        )
      );

      const result = await service.createPage({ title: 'Test Page' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('validation_error');
    });

    it('createPage 失敗時應只記錄脫敏後的錯誤字串', async () => {
      const rawError = {
        code: 'object_not_found',
        message: 'token=secret123 should not be logged',
      };
      service._callNotionApiWithRetry = jest.fn().mockRejectedValue(rawError);

      const result = await service.createPage({ title: 'Test Page' });

      expect(result).toEqual({ success: false, error: 'object_not_found' });
      expect(Logger.error).toHaveBeenCalledWith(
        '[NotionService] 創建頁面失敗',
        expect.objectContaining({
          action: 'createPage',
          error: 'object_not_found',
        })
      );
      expect(Logger.error.mock.calls.at(-1)?.[1]?.error).not.toBe(rawError);
    });
  });

  describe('updatePageTitle', () => {
    it('應該成功更新標題', async () => {
      globalThis.fetch.mockResolvedValue({ ...mockFetchResponse, ok: true });

      const result = await service.updatePageTitle('page-123', 'New Title');
      expect(result.success).toBe(true);
    });
  });

  describe('deleteAllBlocks', () => {
    it('應該成功刪除所有區塊', async () => {
      globalThis.fetch
        .mockResolvedValueOnce(
          createMockResponse({
            results: [createMockNotionBlock('block-1'), createMockNotionBlock('block-2')],
          })
        )
        .mockResolvedValue(createMockResponse({ object: 'block', id: 'deleted-block' }));

      const promise = service.deleteAllBlocks('page-123');
      await jest.advanceTimersByTimeAsync(2000);
      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);
    });

    it('部分刪除失敗時應保留 best-effort 結果並回傳失敗詳情', async () => {
      globalThis.fetch
        .mockResolvedValueOnce(
          createMockResponse({
            results: [createMockNotionBlock('block-1'), createMockNotionBlock('block-2')],
          })
        )
        .mockResolvedValueOnce(createMockResponse({ object: 'block', id: 'block-1' }))
        .mockResolvedValueOnce(createMockResponse({ message: 'Delete failed' }, false, 400));

      const promise = service.deleteAllBlocks('page-123');
      await jest.advanceTimersByTimeAsync(10_000);
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.errors).toEqual([
        expect.objectContaining({
          id: 'block-2',
          error: expect.any(String),
        }),
      ]);
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('部分區塊刪除失敗'),
        expect.objectContaining({
          action: 'deleteAllBlocks',
          failureCount: 1,
          totalBlocks: 2,
        })
      );
    });

    it('應該處理沒有區塊的情況', async () => {
      globalThis.fetch.mockResolvedValue({
        ...mockFetchResponse,
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });

      const result = await service.deleteAllBlocks('page-123');
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(0);
    });
    it('應該處理分頁情況', async () => {
      globalThis.fetch
        // First page
        .mockResolvedValueOnce(
          createMockResponse({
            results: [{ id: 'block-1' }],
            has_more: true,
            next_cursor: 'cursor-1',
          })
        )
        // Second page
        .mockResolvedValueOnce(
          createMockResponse({
            results: [{ id: 'block-2' }],
            has_more: false,
            next_cursor: null,
          })
        )
        // Delete calls
        .mockResolvedValue(createMockResponse({ object: 'block', id: 'deleted-block' }));

      const promise = service.deleteAllBlocks('page-123');

      // 無論是否有延遲，快進時間總是安全的
      await jest.advanceTimersByTimeAsync(10_000);

      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);
      // Calls: 1. List page 1, 2. List page 2, 3. Delete block 1, 4. Delete block 2
      expect(globalThis.fetch.mock.calls.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('buildPageData', () => {
    it('應該為 data_source 類型構建頁面資料', () => {
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

    it('應該透過 data_source_id 父節點為 database 類型構建頁面資料', () => {
      const result = service.buildPageData({
        title: 'Database Parent',
        pageUrl: 'https://example.com',
        dataSourceId: 'db-456',
        dataSourceType: 'database',
        blocks: [],
      });

      expect(result.pageData.parent.type).toBe('data_source_id');
      expect(result.pageData.parent.data_source_id).toBe('db-456');
    });

    it('應該為 page 類型構建頁面資料', () => {
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

    it('當提供時應該加入網站圖示', () => {
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

    it('應該包含所有圖片區塊並回傳有效的頁面資料', () => {
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

      // No longer returning skippedCount or validBlocks
      expect(result.pageData.children).toHaveLength(2);
    });

    it('子區塊數量不應超過配置的 BATCH_SIZE', () => {
      const TOTAL_BLOCKS = 150;
      const blocks = Array.from({ length: TOTAL_BLOCKS })
        .fill(null)
        .map(() => ({ type: 'paragraph', paragraph: { rich_text: [] } }));

      const result = service.buildPageData({
        title: 'Long Article',
        pageUrl: 'https://example.com',
        dataSourceId: 'db-123',
        blocks,
      });

      expect(result.pageData.children).toHaveLength(NOTION_API.BLOCKS_PER_BATCH);
    });

    it('針對缺失的選項應使用預設值', () => {
      const result = service.buildPageData({
        dataSourceId: 'db-123',
      });

      expect(result.pageData.properties.Title.title[0].text.content).toBe(
        CONTENT_QUALITY.DEFAULT_PAGE_TITLE
      );
      expect(result.pageData.properties.URL.url).toBe('');
    });
  });

  describe('refreshPageContent', () => {
    // Note: global fetch context is already managed by outer describe block
    // No need to redeclare or manage originalFetch here

    it('當刪除出現部分失敗時應該回傳錯誤', async () => {
      globalThis.fetch
        .mockResolvedValueOnce(createMockResponse({ results: [{ id: 'block-1' }] }))
        .mockResolvedValueOnce(createMockResponse({ message: 'Delete failed' }, false, 400));

      const promise = service.refreshPageContent('page-123', []);
      await jest.advanceTimersByTimeAsync(10_000);
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.errorType).toBe('notion_api');
      expect(result.details.phase).toBe('delete_existing');
      expect(result.details.deletedCount).toBe(0);
      expect(result.details.totalFailures).toBe(1);
      expect(result.details.failedBlockIds).toEqual(['block-1']);
      expect(result.details.firstErrorMessage).toEqual(expect.any(String));
      expect(result.details.errors).toBeUndefined();
    });

    it('當刪除回傳具體錯誤字串時應保留可辨識的錯誤內容', async () => {
      const deleteError = '具體刪除錯誤';
      globalThis.fetch.mockRejectedValueOnce(new Error(deleteError));

      const promise = service.refreshPageContent('page-123', []);
      await jest.advanceTimersByTimeAsync(10_000);
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain(deleteError);
      expect(result.errorType).toBe('notion_api');
      expect(result.details.phase).toBe('delete_existing');
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('當設定了選項時應該更新標題', async () => {
      globalThis.fetch
        .mockResolvedValueOnce(createMockResponse({ object: 'page' }))
        .mockResolvedValueOnce(createMockResponse({ results: [{ id: 'block-1' }] }))
        .mockResolvedValueOnce(createMockResponse({ object: 'block' }))
        .mockResolvedValueOnce(createMockResponse({ results: [{ id: 'new-block' }] }));

      const promise = service.refreshPageContent('page-123', [], {
        updateTitle: true,
        title: 'New Title',
      });
      await jest.advanceTimersByTimeAsync(10_000);
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(1);
      expect(result.addedCount).toBe(0);
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);

      const appendCreateCalls = globalThis.fetch.mock.calls.filter(([url, options]) => {
        if (!/\/blocks\/.*\/children/.test(String(url)) || !options?.body) {
          return false;
        }

        const requestBody =
          typeof options.body === 'string' ? JSON.parse(options.body) : options.body;

        return Array.isArray(requestBody.children);
      });

      expect(appendCreateCalls).toHaveLength(0);
    });

    it('完成時應該回傳成功狀態及數量', async () => {
      globalThis.fetch
        .mockResolvedValueOnce(createMockResponse({ results: [{ id: '1' }, { id: '2' }] }))
        .mockResolvedValueOnce(createMockResponse({ object: 'block' }))
        .mockResolvedValueOnce(createMockResponse({ object: 'block' }))
        .mockResolvedValueOnce(createMockResponse({ results: [{ id: 'new-1' }] }));

      const promise = service.refreshPageContent('page-123', [
        { type: 'paragraph', paragraph: { rich_text: [] } },
      ]);
      await jest.advanceTimersByTimeAsync(10_000);
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);
      expect(result.addedCount).toBe(1);
    });

    it('應該優雅地處理例外狀況', async () => {
      service.deleteAllBlocks = jest.fn().mockRejectedValue(new Error('Network error'));

      const promise = service.refreshPageContent('page-123', []);

      await jest.advanceTimersByTimeAsync(10_000);

      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
      expect(result.errorType).toBe('internal');
      expect(result.details.phase).toBe('catch_all');
    });
  });

  describe('updateHighlightsSection', () => {
    const pageId = 'page-123';
    const highlightBlocks = [
      { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'New Highlight' }] } },
    ];

    it('應該成功更新標記區域（刪除舊的並添加新的）', async () => {
      const existingBlocks = [
        { id: '1', type: 'paragraph' },
        {
          id: '2',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ text: { content: '📝 頁面標記' }, plain_text: '📝 頁面標記' }],
          },
        },
        { id: '3', type: 'paragraph' },
      ];

      globalThis.fetch
        .mockResolvedValueOnce(createMockResponse({ results: existingBlocks })) // 取得現有區塊
        .mockResolvedValueOnce(createMockResponse({ object: 'block' })) // 刪除區塊 2
        .mockResolvedValueOnce(createMockResponse({ object: 'block' })) // 刪除區塊 3
        .mockResolvedValueOnce(createMockResponse({ results: [{}] })); // 追加新標記

      const promise = service.updateHighlightsSection(pageId, highlightBlocks);
      await jest.advanceTimersByTimeAsync(10_000);
      const result = await promise;
      const appendRequest = JSON.parse(globalThis.fetch.mock.calls[3][1].body);

      expect(result).toEqual({
        success: true,
        deletedCount: 2,
        addedCount: 1,
      });
      expect(appendRequest).toEqual({
        children: highlightBlocks,
      });
    });

    it('應該處理獲取現有區塊失敗', async () => {
      globalThis.fetch.mockResolvedValueOnce(
        createMockResponse({ message: 'Fetch failed' }, false, 400)
      );

      const promise = service.updateHighlightsSection(pageId, highlightBlocks);
      await jest.advanceTimersByTimeAsync(10_000);
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.errorType).toBe('notion_api');
      expect(result.details.phase).toBe('fetch_blocks');
    });

    it('應該處理添加新標記失敗', async () => {
      globalThis.fetch
        .mockResolvedValueOnce(createMockResponse({ results: [] })) // 現有區塊為空
        .mockResolvedValueOnce(
          createMockResponse(
            {
              object: 'error',
              status: 400,
              code: 'validation_error',
              message: 'Invalid data',
            },
            false,
            400
          )
        ); // 追加失敗

      const promise = service.updateHighlightsSection(pageId, highlightBlocks);
      await jest.advanceTimersByTimeAsync(10_000);
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.errorType).toBe('internal');
      expect(result.details.phase).toBe('catch_all');
    });

    it('應該正確處理分頁以獲取所有區塊', async () => {
      globalThis.fetch
        .mockResolvedValueOnce(
          createMockResponse({
            results: [{ id: 'block-1' }],
            has_more: true,
            next_cursor: 'cursor-2',
          })
        )
        .mockResolvedValueOnce(
          createMockResponse({
            results: [{ id: 'block-2' }],
            has_more: false,
            next_cursor: null,
          })
        )
        .mockResolvedValueOnce(createMockResponse({ results: [] })); // 追加區塊

      const promise = service.updateHighlightsSection(pageId, highlightBlocks);
      await jest.advanceTimersByTimeAsync(10_000);
      const result = await promise;

      expect(result.success).toBe(true);
      expect(globalThis.fetch.mock.calls[0][0]).toMatch(/\/blocks\/.*\/children/);
      expect(globalThis.fetch.mock.calls[0][0]).not.toMatch(/start_cursor=/);
      expect(globalThis.fetch.mock.calls[1][0]).toMatch(/\/blocks\/.*\/children/);
      expect(globalThis.fetch.mock.calls[1][0]).toMatch(/start_cursor=cursor-2/);
    });

    it('應該正確處理空標記列表（只刪除不添加）', async () => {
      const existingBlocks = [
        {
          id: '2',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ text: { content: '📝 頁面標記' }, plain_text: '📝 頁面標記' }],
          },
        },
      ];

      globalThis.fetch
        .mockResolvedValueOnce(createMockResponse({ results: existingBlocks }))
        .mockResolvedValueOnce(createMockResponse({ object: 'block' }));

      const promise = service.updateHighlightsSection(pageId, []);
      await jest.advanceTimersByTimeAsync(10_000);
      const result = await promise;

      // 確認 fetch 只被呼叫兩次（取得、刪除），且未執行 append
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        success: true,
        deletedCount: 1,
        addedCount: 0,
      });
    });

    it.each([
      { scenario: '有新標記', input: highlightBlocks },
      { scenario: '空標記列表', input: [] },
    ])('刪除標記區塊部分失敗時應回傳 retryable failure（$scenario）', async ({ input }) => {
      const existingBlocks = [
        {
          id: '2',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ text: { content: '📝 頁面標記' }, plain_text: '📝 頁面標記' }],
          },
        },
      ];

      globalThis.fetch
        .mockResolvedValueOnce(createMockResponse({ results: existingBlocks }))
        .mockResolvedValueOnce(createMockResponse({ message: 'Delete failed' }, false, 400)); // 刪除失敗

      const promise = service.updateHighlightsSection(pageId, input);
      await jest.advanceTimersByTimeAsync(10_000);
      const result = await promise;

      expect(result).toEqual({
        success: false,
        error: HIGHLIGHT_ERROR_CODES.DELETE_INCOMPLETE,
        errorType: 'notion_api',
        details: {
          phase: HIGHLIGHT_ERROR_CODES.PHASE_DELETE,
          retryable: true,
          deletedCount: 0,
          failureCount: 1,
          failedBlockIds: ['2'],
        },
      });
    });

    it('混合結果刪除（header 成功、content block 失敗）應回傳 retryable failure', async () => {
      const existingBlocks = [
        {
          id: 'header-1',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ text: { content: '📝 頁面標記' }, plain_text: '📝 頁面標記' }],
          },
        },
        { id: 'content-1', type: 'paragraph' },
      ];

      globalThis.fetch
        .mockResolvedValueOnce(createMockResponse({ results: existingBlocks }))
        .mockResolvedValueOnce(createMockResponse({ object: 'block' })) // 標題區塊刪除成功
        .mockResolvedValueOnce(createMockResponse({ message: 'Delete failed' }, false, 400)); // 內容區塊刪除失敗

      const promise = service.updateHighlightsSection(pageId, highlightBlocks);
      await jest.advanceTimersByTimeAsync(10_000);
      const result = await promise;

      expect(result).toEqual({
        success: false,
        error: HIGHLIGHT_ERROR_CODES.DELETE_INCOMPLETE,
        errorType: 'notion_api',
        details: {
          phase: HIGHLIGHT_ERROR_CODES.PHASE_DELETE,
          retryable: true,
          deletedCount: 1,
          failureCount: 1,
          failedBlockIds: ['content-1'],
        },
      });
    });
  });

  describe('_apiRequest', () => {
    it('應該在 body 為 null 時不包含 body', async () => {
      await service._apiRequest('/test', { method: 'POST', body: null });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.objectContaining({
          method: 'POST',
        })
      );
      const callArgs = globalThis.fetch.mock.calls[0][1];
      expect(callArgs.body).toBeUndefined();
    });

    it('應該在 body 為 undefined 時不包含 body', async () => {
      await service._apiRequest('/test', { method: 'POST', body: undefined });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.not.objectContaining({ body: expect.anything() })
      );
      const callArgs = globalThis.fetch.mock.calls[0][1];
      expect(callArgs.body).toBeUndefined();
    });

    it('應該在 body 為空對象時不包含 body', async () => {
      await service._apiRequest('/test', { method: 'POST', body: {} });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/test'),
        expect.not.objectContaining({
          body: expect.anything(),
        })
      );
    });

    it('應該正常處理普通對象 body', async () => {
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

  describe('內部方法與邊界情況', () => {
    describe('_getScopedClient', () => {
      it('應該優先使用傳入的 client', () => {
        const mockClient = { request: jest.fn() };
        const client = service._getScopedClient({ client: mockClient });
        expect(client).toBe(mockClient);
      });

      it('應該在 API Key 相同時復用全域 client', () => {
        const client = service._getScopedClient({ apiKey: 'test-api-key' });
        expect(client).toBe(service.client);
      });

      it('應該在使用不同 API Key 時創建臨時 client', () => {
        const tempApiKey = 'different-key';
        const client = service._getScopedClient({ apiKey: tempApiKey });
        expect(client).not.toBe(service.client);
        expect(client).toBeDefined();
      });
    });

    describe('_findHighlightSectionBlocks (靜態方法)', () => {
      const HEADER = '📝 頁面標記';

      it('應該處理只有標題沒有內容的情況', () => {
        const blocks = [
          { id: '1', type: 'paragraph' },
          {
            id: '2',
            type: 'heading_3',
            heading_3: { rich_text: [{ text: { content: HEADER }, plain_text: HEADER }] },
          },
        ];

        const result = NotionService._findHighlightSectionBlocks(blocks);
        expect(result).toHaveLength(1);
        expect(result).toEqual(['2']);
      });

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

      it('應該忽略沒有 ID 的區塊', () => {
        const blocks = [
          {
            type: 'heading_3',
            id: '1',
            heading_3: { rich_text: [{ text: { content: HEADER } }] },
          },
          { type: 'paragraph' }, // 無 ID
          { type: 'paragraph', id: '3' },
        ];
        const result = NotionService._findHighlightSectionBlocks(blocks);
        expect(result).toEqual(['1', '3']);
      });

      it('應該只處理第一個匹配的標記區域', () => {
        const blocks = [
          {
            type: 'heading_3',
            id: '1',
            heading_3: { rich_text: [{ text: { content: HEADER } }] },
          },
          { type: 'paragraph', id: '2' },
          {
            type: 'heading_3',
            id: '3',
            heading_3: { rich_text: [{ text: { content: HEADER } }] }, // 第二個相同標題
          },
          { type: 'paragraph', id: '4' },
        ];
        // 遇到下一個標題類型（包括 heading_3）時應該停止
        const result = NotionService._findHighlightSectionBlocks(blocks);
        expect(result).toEqual(['1', '2']);
      });

      it('應該跳過內容不同的 heading_3', () => {
        const blocks = [
          {
            type: 'heading_3',
            id: '1',
            heading_3: { rich_text: [{ text: { content: '其他標題' } }] },
          },
          {
            type: 'heading_3',
            id: '2',
            heading_3: { rich_text: [{ text: { content: HEADER } }] },
          },
          { type: 'paragraph', id: '3' },
        ];
        const result = NotionService._findHighlightSectionBlocks(blocks);
        expect(result).toEqual(['2', '3']);
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

    describe('_ensureClient', () => {
      it('應該在提供 providedClient 時直接返回', () => {
        const mockClient = {};
        service.setApiKey(null);
        expect(() => service._ensureClient(mockClient)).not.toThrow();
      });

      it('應該在 client 為 null 時初始化它', () => {
        service.client = null;
        service._ensureClient();
        expect(service.client).toBeDefined();
      });
    });

    describe('搜尋與過濾', () => {
      it('應該成功執行搜索', async () => {
        globalThis.fetch.mockResolvedValue(createMockResponse({ results: [] }));
        await service.search({ query: 'test' });
        expect(globalThis.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/search'),
          expect.any(Object)
        );
      });

      it('應該正確傳遞過濾條件', async () => {
        globalThis.fetch.mockResolvedValue(createMockResponse({ results: [] }));
        const filter = { property: 'object', select: { equals: 'database' } };
        await service.search({ query: 'test', filter });
        const lastCallBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
        expect(lastCallBody.filter).toEqual(filter);
      });

      it('應該處理搜索失敗並記錄錯誤', async () => {
        globalThis.fetch.mockResolvedValue(createMockResponse({ message: 'fail' }, false, 400));
        await expect(service.search({ query: 'test' })).rejects.toThrow();
        expect(Logger.error).toHaveBeenCalledWith(
          expect.stringContaining('搜索失敗'),
          expect.objectContaining({ error: expect.any(Object) }) // Error object or message
        );
      });
    });

    describe('_fetchPageBlocks Error Handling', () => {
      it('應該處理獲取區塊失敗', async () => {
        globalThis.fetch.mockResolvedValue(createMockResponse({ message: 'fail' }, false, 400));
        const result = await service._fetchPageBlocks('id');
        expect(result.success).toBe(false);
      });
    });

    describe('_deleteBlocksByIds Error Handling and Delay', () => {
      it('應該處理 deleteBlock 異常並記錄警告', async () => {
        service._executeWithRetry = jest.fn().mockRejectedValue(new Error('crash'));
        await service._deleteBlocksByIds(['b1']);
        expect(Logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('刪除區塊異常'),
          expect.objectContaining({
            action: 'deleteBlocksByIds',
            phase: 'deleteBlock',
            blockId: 'b1',
            error: expect.any(Error),
          })
        );
      });

      it('應該在批次間執行延遲', async () => {
        // 使用真實時間或非常小的延遲以避免超時，並確保與 beforeEach 的 timers 狀態一致
        jest.useRealTimers();
        service.config.DELETE_CONCURRENCY = 1;
        service.config.DELETE_BATCH_DELAY_MS = 1;
        service._executeWithRetry = jest.fn().mockResolvedValue({ success: true });

        await service._deleteBlocksByIds(['b1', 'b2']);

        // 驗證 _executeWithRetry 被調用了兩次
        expect(service._executeWithRetry).toHaveBeenCalledTimes(2);
      });
    });

    describe('建立頁面自動批次處理', () => {
      it('應該在分批添加失敗時記錄警告', async () => {
        globalThis.fetch
          .mockResolvedValueOnce(createMockResponse({ id: 'id' }))
          .mockResolvedValueOnce(createMockResponse({ message: 'fail' }, false, 400));
        const manyBlocks = Array.from({ length: 110 }, () => ({ type: 'paragraph' }));
        await service.createPage(
          { parent: { data_source_id: 'db' } },
          { autoBatch: true, allBlocks: manyBlocks }
        );
        expect(Logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('部分區塊添加失敗'),
          expect.any(Object)
        );
      });
    });

    describe('更新頁面標題錯誤處理', () => {
      it('應該處理更新失敗並記錄錯誤', async () => {
        globalThis.fetch.mockResolvedValue(createMockResponse({ message: 'fail' }, false, 400));
        await service.updatePageTitle('id', 'Title');
        expect(Logger.error).toHaveBeenCalledWith(
          expect.stringContaining('更新標題失敗'),
          expect.objectContaining({ error: expect.any(Object) })
        );
      });
    });

    describe('刪除所有區塊警告處理', () => {
      it('應該在部分失敗時記錄警告', async () => {
        service._fetchPageBlocks = jest
          .fn()
          .mockResolvedValue({ success: true, blocks: [{ id: 'b1' }] });
        service._deleteBlocksByIds = jest
          .fn()
          .mockResolvedValue({ successCount: 0, failureCount: 1, errors: [{ id: 'b1' }] });
        await service.deleteAllBlocks('id');
        expect(Logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('部分區塊刪除失敗'),
          expect.any(Object)
        );
      });
    });

    describe('更新頁面內容警告處理', () => {
      it('應該在標題更新失敗時記錄警告', async () => {
        service.updatePageTitle = jest.fn().mockResolvedValue({ success: false });
        service.deleteAllBlocks = jest.fn().mockResolvedValue({ success: true });
        service.appendBlocksInBatches = jest.fn().mockResolvedValue({ success: true });
        await service.refreshPageContent('id', [], { updateTitle: true, title: 'T' });
        expect(Logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('標題更新失敗'),
          expect.any(Object)
        );
      });
    });

    describe('更新標記區塊警告處理', () => {
      it('應該在刪除標記失敗時記錄警告', async () => {
        service._fetchPageBlocks = jest.fn().mockResolvedValue({ success: true, blocks: [] });
        service._deleteBlocksByIds = jest
          .fn()
          .mockResolvedValue({ successCount: 0, failureCount: 1, errors: [{ id: 'b1' }] });
        const result = await service.updateHighlightsSection('id', []);
        expect(Logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('部分標記區塊刪除失敗'),
          expect.any(Object)
        );
        expect(result.success).toBe(false);
      });
    });
  });
});
