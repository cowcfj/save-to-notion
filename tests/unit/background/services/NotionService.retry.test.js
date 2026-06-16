// NotionService.retry.test.js
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

import { fetchWithRetry } from '../../../../scripts/utils/RetryManager.js';

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

  it.each([
    {
      desc: '應該在 5xx 錯誤時重試',
      setupMock: () => {
        globalThis.fetch = jest
          .fn()
          .mockResolvedValueOnce(createMockResponse({}, false, 500))
          .mockResolvedValueOnce(createMockResponse({ ok: true }));
      },
    },
    {
      desc: '應該在網絡錯誤時重試',
      setupMock: () => {
        globalThis.fetch = jest
          .fn()
          .mockRejectedValueOnce(new Error('Failed to fetch'))
          .mockResolvedValueOnce(createMockResponse({ ok: true }));
      },
    },
  ])('$desc', async ({ setupMock }) => {
    jest.useRealTimers();
    setupMock();

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

  it('應該在達到最大重試次數後拋出網絡錯誤', async () => {
    const error = new Error('Network error');
    error.name = 'NetworkError';
    globalThis.fetch = jest.fn().mockRejectedValue(error);

    const promise = fetchWithRetry(
      'https://api.notion.com/test',
      {},
      { maxRetries: 1, baseDelay: 1000 }
    );

    const flushMicrotasks = async (count = 10) => {
      for (let i = 0; i < count; i++) {
        await Promise.resolve();
      }
    };
    await flushMicrotasks();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(2000);

    await flushMicrotasks();

    await expect(promise).rejects.toThrow('Network error');

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
