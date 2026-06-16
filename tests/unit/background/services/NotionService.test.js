// NotionService.test.js
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
import { NOTION_API } from '../../../../scripts/config/extension/notionApi.js';
import Logger from '../../../../scripts/utils/Logger.js';
import { getActiveNotionToken, refreshOAuthToken } from '../../../../scripts/utils/notionAuth.js';
import { HIGHLIGHT_ERROR_CODES } from '../../../../scripts/config/shared/messages.js';

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
      service._initClient();

      await service.checkPageExists('page-123');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ cache: 'no-store' })
      );
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
      await expect(service.checkPageExists('page-123')).rejects.toThrow('API_KEY_NOT_CONFIGURED');
    });

    it('非 API key 設定錯誤不應只因包含 config 字樣就重新拋出', () => {
      const error = new Error('remote config fetch failed');

      const result = service._resolvePageExistsFailure(error);

      expect(result).toBeNull();
      expect(Logger.error).toHaveBeenCalledWith(
        '[NotionService] 無法確定頁面存續狀態',
        expect.objectContaining({
          action: 'checkPageExists',
          error,
        })
      );
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
      expect(result.error).toBe('VALIDATION_ERROR');
    });

    it('createPage 失敗時應只記錄脫敏後的錯誤字串', async () => {
      const rawError = {
        code: 'object_not_found',
        message: 'token=secret123 should not be logged',
      };
      service._callNotionApiWithRetry = jest.fn().mockRejectedValue(rawError);

      const result = await service.createPage({ title: 'Test Page' });

      expect(result).toEqual({
        success: false,
        error: 'OBJECT_NOT_FOUND',
        errorCode: 'OBJECT_NOT_FOUND',
      });
      expect(Logger.error).toHaveBeenCalledWith(
        '[NotionService] 創建頁面失敗',
        expect.objectContaining({
          action: 'createPage',
          error: 'OBJECT_NOT_FOUND',
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

  describe('refreshPageContent', () => {
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
      expect(result.error).toContain('NETWORK_ERROR');
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
        .mockResolvedValueOnce(createMockResponse({ results: existingBlocks }))
        .mockResolvedValueOnce(createMockResponse({ object: 'block' }))
        .mockResolvedValueOnce(createMockResponse({ object: 'block' }))
        .mockResolvedValueOnce(createMockResponse({ results: [{}] }));

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
        .mockResolvedValueOnce(createMockResponse({ results: [] }))
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
        );

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
        .mockResolvedValueOnce(createMockResponse({ results: [] }));

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
        .mockResolvedValueOnce(createMockResponse({ message: 'Delete failed' }, false, 400));

      const promise = service.updateHighlightsSection(pageId, input);
      await jest.advanceTimersByTimeAsync(10_000);
      const result = await promise;

      expect(result).toEqual({
        success: false,
        error: HIGHLIGHT_ERROR_CODES.DELETE_INCOMPLETE,
        errorCode: HIGHLIGHT_ERROR_CODES.DELETE_INCOMPLETE,
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
        .mockResolvedValueOnce(createMockResponse({ object: 'block' }))
        .mockResolvedValueOnce(createMockResponse({ message: 'Delete failed' }, false, 400));

      const promise = service.updateHighlightsSection(pageId, highlightBlocks);
      await jest.advanceTimersByTimeAsync(10_000);
      const result = await promise;

      expect(result).toEqual({
        success: false,
        error: HIGHLIGHT_ERROR_CODES.DELETE_INCOMPLETE,
        errorCode: HIGHLIGHT_ERROR_CODES.DELETE_INCOMPLETE,
        errorType: 'notion_api',
        details: {
          phase: HIGHLIGHT_ERROR_CODES.PHASE_DELETE,
          retryable: true,
          deletedCount: 1,
          failureCount: 1,
          failedBlockIds: ['content-1'],
        },
      });
      const [, warnContext] = Logger.warn.mock.calls.find(([message]) =>
        message.includes('部分標記區塊刪除失敗')
      );
      expect(warnContext).toEqual(
        expect.objectContaining({
          result: 'partial_failure',
          failedBlockIds: ['content-1'],
          sanitizedError: expect.any(Array),
        })
      );
      expect(warnContext).not.toHaveProperty('errors');
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
          expect.objectContaining({ error: expect.any(Object) })
        );
      });
    });
  });
});
