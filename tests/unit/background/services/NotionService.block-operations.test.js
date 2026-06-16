// NotionService.block-operations.test.js
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

import { NotionService } from '../../../../scripts/background/services/NotionService.js';
import { NOTION_API } from '../../../../scripts/config/extension/notionApi.js';
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

describe('NotionService - Block Operations', () => {
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
      expect(result.error).toBe('VALIDATION_ERROR');
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

    it.each([
      { desc: '等於 blocks.length', getStartIndex: blocks => blocks.length },
      { desc: '大於 blocks.length', getStartIndex: blocks => blocks.length + 1 },
    ])('startIndex $desc 時應回傳空結果且不發送請求', async ({ getStartIndex }) => {
      const blocks = Array.from({ length: TOTAL_BLOCKS }, (_, i) => ({ type: 'paragraph', id: i }));

      const promise = service.appendBlocksInBatches('page-123', blocks, getStartIndex(blocks));
      await jest.advanceTimersByTimeAsync(TIMER_ADVANCE_MS);
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(0);
      expect(result.totalCount).toBe(0);
      expect(globalThis.fetch).not.toHaveBeenCalled();
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
      const [, warnContext] = Logger.warn.mock.calls.find(([message]) =>
        message.includes('部分區塊刪除失敗')
      );
      expect(warnContext).toEqual(
        expect.objectContaining({
          result: 'partial_failure',
          failedBlockIds: ['block-2'],
          sanitizedError: expect.any(Array),
        })
      );
      expect(warnContext).not.toHaveProperty('errors');
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

  describe('內部方法與邊界情況', () => {
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

      it('應該彙整單一 worker unexpected reject 而不中斷整批刪除', async () => {
        service.config.DELETE_CONCURRENCY = 3;
        service._deleteBlockById = jest.fn(blockId => {
          if (blockId === 'b2') {
            return Promise.reject(new Error('worker crashed'));
          }
          return Promise.resolve({ success: true, id: blockId });
        });

        const result = await service._deleteBlocksByIds(['b1', 'b2', 'b3']);

        expect(service._deleteBlockById).toHaveBeenCalledTimes(3);
        expect(result).toEqual({
          successCount: 2,
          failureCount: 1,
          errors: [{ id: 'b2', error: 'worker crashed' }],
        });
      });

      it('應該保留非 Error rejection 的原始訊息（字串、plain object）', async () => {
        service.config.DELETE_CONCURRENCY = 3;
        service._deleteBlockById = jest.fn(blockId => {
          if (blockId === 'b1') {
            return Promise.reject('string reason token');
          }
          if (blockId === 'b2') {
            return Promise.reject({ message: 'plain object reason' });
          }
          return Promise.reject(null);
        });

        const result = await service._deleteBlocksByIds(['b1', 'b2', 'b3']);

        expect(result).toEqual({
          successCount: 0,
          failureCount: 3,
          errors: [
            { id: 'b1', error: 'string reason token' },
            { id: 'b2', error: 'plain object reason' },
            { id: 'b3', error: 'Unknown error' },
          ],
        });
      });

      it('應該在批次間執行延遲', async () => {
        jest.useRealTimers();
        service.config.DELETE_CONCURRENCY = 1;
        service.config.DELETE_BATCH_DELAY_MS = 1;
        service._executeWithRetry = jest.fn().mockResolvedValue({ success: true });

        await service._deleteBlocksByIds(['b1', 'b2']);

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
