/**
 * @jest-environment jsdom
 */

import { createNotionHandlers } from '../../../../scripts/background/handlers/notionHandlers.js';

// Mock Logger
globalThis.Logger = {
  debug: jest.fn(),
  success: jest.fn(),
  start: jest.fn(),
  ready: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock chrome API
globalThis.chrome = {
  runtime: {
    id: 'test-extension-id',
    lastError: null,
  },
};

describe('notionHandlers - Search Params Filtering', () => {
  let handlers = null;
  let mockNotionService = null;
  let sender = null;
  let sendResponse = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNotionService = {
      search: jest.fn().mockResolvedValue({ results: [] }),
    };
    handlers = createNotionHandlers({ notionService: mockNotionService });

    // Mock sender (internal request)
    sender = {
      id: 'test-extension-id',
      // tab undefined implies popup/background context
    };
    sendResponse = jest.fn();
  });

  test('應該優先使用提供的 searchParams 參數', async () => {
    const request = {
      apiKey: 'secret',
      searchParams: {
        query: 'explicit query',
        filter: { property: 'object', value: 'page' },
      },
      // 即使提供了扁平屬性，也應該被忽略
      query: 'ignored query',
    };

    await handlers.searchNotion(request, sender, sendResponse);

    expect(mockNotionService.search).toHaveBeenCalledWith(
      request.searchParams,
      expect.objectContaining({ apiKey: 'secret' })
    );
  });

  test('應該從扁平結構構建參數', async () => {
    const request = {
      apiKey: 'secret',
      query: 'flat query',
      filter: { type: 'database' },
      sort: { direction: 'ascending' },
      page_size: 50,
      start_cursor: 'cursor-123',
    };

    await handlers.searchNotion(request, sender, sendResponse);

    expect(mockNotionService.search).toHaveBeenCalledWith(
      {
        query: 'flat query',
        filter: { type: 'database' },
        sort: { direction: 'ascending' },
        page_size: 50,
        start_cursor: 'cursor-123',
      },
      expect.objectContaining({ apiKey: 'secret' })
    );
  });

  test('應該過濾掉 undefined 的扁平屬性', async () => {
    const request = {
      apiKey: 'secret',
      query: 'only query provided',
      // filter, sort, page_size, start_cursor 都是 undefined
    };

    await handlers.searchNotion(request, sender, sendResponse);

    // 獲取第一次調用的第一個參數
    const calls = mockNotionService.search.mock.calls;
    const params = calls[0][0];

    // 驗證 params 中只包含 query
    expect(params).toHaveProperty('query', 'only query provided');
    expect(params).not.toHaveProperty('filter');
    expect(params).not.toHaveProperty('sort');
    expect(params).not.toHaveProperty('page_size');
    expect(params).not.toHaveProperty('start_cursor');

    // 確保只包含預期的鍵
    expect(Object.keys(params)).toEqual(['query']);
  });

  test('應該忽略不在白名單中的屬性', async () => {
    const request = {
      apiKey: 'secret',
      query: 'valid query',
      maliciousField: 'should be ignored',
      randomField: 123,
    };

    await handlers.searchNotion(request, sender, sendResponse);

    const calls = mockNotionService.search.mock.calls;
    const params = calls[0][0];

    expect(params).toHaveProperty('query', 'valid query');
    expect(params).not.toHaveProperty('maliciousField');
    expect(params).not.toHaveProperty('randomField');
  });
});
