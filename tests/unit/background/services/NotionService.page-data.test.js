// NotionService.page-data.test.js
// 1. Mocks MUST be at the very top
jest.mock('../../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: require('../../../helpers/loggerMock.js').createLoggerMock({
    debugEnabled: true,
  }),
}));

jest.mock('../../../../scripts/utils/notionAuth.js', () => ({
  getActiveNotionToken: jest.fn(),
  refreshOAuthToken: jest.fn(),
}));

import { NotionService } from '../../../../scripts/background/services/NotionService.js';
import { CONTENT_QUALITY } from '../../../../scripts/config/index.js';
import { NOTION_API } from '../../../../scripts/config/extension/notionApi.js';
import { getActiveNotionToken, refreshOAuthToken } from '../../../../scripts/utils/notionAuth.js';
import { buildPageDataOptions } from '../../../helpers/notionServiceTestHarness.js';

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

describe('NotionService - Page Data and Request Body', () => {
  let service = null;
  let mockLogger = null;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    getActiveNotionToken.mockResolvedValue({ token: 'test-api-key', mode: 'manual' });
    refreshOAuthToken.mockResolvedValue(null);
    mockLogger = require('../../../helpers/loggerMock.js').createLoggerMock({
      debugEnabled: true,
    });
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

  const buildPageData = (overrides = {}) => service.buildPageData(buildPageDataOptions(overrides));

  describe('buildPageData', () => {
    it.each([
      {
        desc: '應該為 data_source 類型構建頁面資料',
        options: { dataSourceId: 'db-123', dataSourceType: 'data_source' },
        expectedType: 'data_source_id',
        expectedIdKey: 'data_source_id',
        expectedId: 'db-123',
      },
      {
        desc: '應該透過 data_source_id 父節點為 database 類型構建頁面資料',
        options: { dataSourceId: 'db-456', dataSourceType: 'database' },
        expectedType: 'data_source_id',
        expectedIdKey: 'data_source_id',
        expectedId: 'db-456',
      },
      {
        desc: '應該為 page 類型構建頁面資料',
        options: { dataSourceId: 'page-456', dataSourceType: 'page' },
        expectedType: 'page_id',
        expectedIdKey: 'page_id',
        expectedId: 'page-456',
      },
    ])('$desc', ({ options, expectedType, expectedIdKey, expectedId }) => {
      const result = buildPageData({
        title: 'Test Title',
        pageUrl: 'https://example.com',
        ...options,
      });

      expect(result.pageData.parent.type).toBe(expectedType);
      expect(result.pageData.parent[expectedIdKey]).toBe(expectedId);
      if (expectedType === 'data_source_id') {
        expect(result.pageData.properties.Title.title[0].text.content).toBe('Test Title');
        expect(result.pageData.properties.URL.url).toBe('https://example.com');
      }
    });

    it('page parent 應使用 Notion page title property，不應送出 data source schema properties', () => {
      const result = buildPageData({
        title: 'Child Page',
        dataSourceId: 'page-456',
        dataSourceType: 'page',
      });

      expect(result.pageData.properties).toEqual({
        title: {
          title: [{ text: { content: 'Child Page' } }],
        },
      });
      expect(result.pageData.properties.Title).toBeUndefined();
      expect(result.pageData.properties.URL).toBeUndefined();
    });

    it('當提供時應該加入網站圖示', () => {
      const url = 'https://example.com/icon.png';

      const result = buildPageData({ siteIcon: url });

      expect(result.pageData.icon).toEqual({
        type: 'external',
        external: { url },
      });
    });

    it('應該為一般 https URL 設定 page cover', () => {
      const url = 'https://example.com/cover.jpg';

      const result = buildPageData({ coverImage: url });

      expect(result.pageData.cover).toEqual({
        type: 'external',
        external: { url },
      });
    });

    it('應該忽略非字串 coverImage 而不拋出錯誤', () => {
      const result = buildPageData({
        coverImage: { url: 'https://example.com/cover.jpg' },
      });

      expect(result.pageData.cover).toBeUndefined();
    });

    it('應該對 Patreon signed URL 跳過 page cover (defense in depth)', () => {
      const tempUrl =
        'https://c10.patreonusercontent.com/4/patreon-media/p/post/157239355/abc/eyJ3IjoxMDgwfQ==/1.png?token-hash=ABC123&token-time=1700000000';

      const result = buildPageData({ coverImage: tempUrl });

      expect(result.pageData.cover).toBeUndefined();
    });

    it('應該對 patreonusercontent.com 帶 token-time 的 URL 跳過 page cover', () => {
      const tempUrl =
        'https://c8.patreonusercontent.com/4/patreon-media/foo.png?token-time=1700000000';

      const result = buildPageData({ coverImage: tempUrl });

      expect(result.pageData.cover).toBeUndefined();
    });

    it('應該包含所有圖片區塊並回傳有效的頁面資料', () => {
      const blocks = [
        { type: 'paragraph', paragraph: { rich_text: [] } },
        { type: 'image', image: { external: { url: 'sftp://invalid.com/img.jpg' } } },
      ];

      const result = buildPageData({ blocks });

      expect(result.pageData.children).toHaveLength(2);
    });

    it('子區塊數量不應超過配置 of BATCH_SIZE', () => {
      const TOTAL_BLOCKS = 150;
      const blocks = Array.from({ length: TOTAL_BLOCKS })
        .fill(null)
        .map(() => ({ type: 'paragraph', paragraph: { rich_text: [] } }));

      const result = buildPageData({ blocks });

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

  describe('_apiRequest', () => {
    it.each([{ desc: 'body 為 undefined', body: undefined }])(
      '應該在 $desc 時不包含 body',
      async ({ body }) => {
        await service._apiRequest('/test', { method: 'POST', body });

        expect(globalThis.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/test'),
          expect.not.objectContaining({
            body: expect.anything(),
          })
        );
      }
    );

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
});
