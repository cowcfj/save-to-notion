/**
 * Background.js - 錯誤分支整合測試（require 真實腳本 + 事件觸發）
 */

/* global chrome */

import { ErrorHandler } from '../../../scripts/utils/ErrorHandler.js';
import { ERROR_MESSAGES, SECURITY_ERROR_MESSAGES } from '../../../scripts/config/messages.js';
import {
  createEvent,
  waitForSend,
  createMockLogger,
  setupChromeMock,
} from '../../helpers/integration-test-helper.js';

/**
 * Helper to mock chrome.scripting.executeScript for sequential calls.
 * 1. Files injection (always succeeds).
 * 2. checkInitialization (returns undefined).
 * 3. collectHighlights (returns empty array).
 * 4. injectWithResponse (returns content object or simulates error).
 *
 * @param {object|string} [contentResult] - Content object to return, or 'error' to simulate failure.
 */
function setupScriptMock(contentResult) {
  const mock = chrome.scripting.executeScript
    .mockImplementationOnce((opts, cb) => cb?.())
    .mockImplementationOnce((opts, cb) => cb?.([{ result: undefined }]))
    .mockImplementationOnce((opts, cb) => cb?.([{ result: [] }]));

  if (contentResult === 'error') {
    mock.mockImplementationOnce((opts, cb) => {
      chrome.runtime.lastError = { message: 'Function execution failed' };
      cb?.();
    });
  } else {
    mock.mockImplementationOnce((opts, cb) => cb?.([{ result: contentResult ?? {} }]));
  }
}

describe('background error branches (integration)', () => {
  let originalChrome = null;
  let originalFetch = null;
  let mockSyncStorage = {};

  // 統一錯誤匹配模式，避免過於寬泛的 "失敗" 匹配
  const API_ERROR_REGEX =
    /Invalid request|請求無效|無法解析頁面內容|Notion API 請求失敗|發生未知錯誤|操作失敗|網路錯誤|資料驗證失敗/u;

  beforeEach(() => {
    jest.resetModules();
    mockSyncStorage = {};
    originalChrome = globalThis.chrome;
    originalFetch = globalThis.fetch;

    // 明確設定 Logger 為非調試模式，但允許輸出到控制台
    globalThis.Logger = createMockLogger();

    const { chromeMock, events } = setupChromeMock({}, mockSyncStorage);

    // Override specific mocks for this test suite
    chromeMock.runtime.id = 'test';
    chromeMock.tabs.get = jest.fn((tabId, mockCb) =>
      mockCb?.({ id: tabId, url: 'https://example.com' })
    );
    chromeMock.storage.sync.get = jest.fn((keys, mockCb) => {
      const res = { ...mockSyncStorage };
      mockCb?.(res);
      return Promise.resolve(res);
    });

    globalThis.chrome = chromeMock;

    // Convert events to what the test expects if needed (the helper returns the object directly)
    // The test accesses chrome.runtime.onMessage._emit directly which is supported by our helper

    // 載入背景腳本（註冊 onMessage）
    require('../../../scripts/background.js');
  });

  afterEach(() => {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
  });

  const internalSender = { id: 'test', url: 'chrome-extension://test/popup.html' };
  const contentScriptSender = { id: 'test', tab: { id: 1 }, url: 'https://example.com' };

  test('startHighlight：無活動分頁 → 返回錯誤', async () => {
    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'startHighlight' }, internalSender, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB),
      })
    );
  });

  test('startHighlight：注入失敗 → 返回錯誤', async () => {
    // 有活動分頁
    chrome.tabs.query.mockResolvedValueOnce([
      { id: 1, url: 'https://x', title: 't', active: true },
    ]);
    // 模擬 sendMessage 失敗，強制走注入邏輯
    chrome.tabs.sendMessage.mockImplementationOnce((tabId, msg, mockCb) => {
      chrome.runtime.lastError = { message: 'Message failed' };
      mockCb?.();
    });
    // 第一次 executeScript 模擬 lastError（文件注入階段）
    chrome.scripting.executeScript.mockImplementationOnce((opts, mockCb) => {
      chrome.runtime.lastError = { message: 'Injection failed' };
      mockCb?.();
    });

    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'startHighlight' }, internalSender, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        // 'Injection failed' 經過 sanitizeApiError 會返回 'Unknown Error'
        error: ErrorHandler.formatUserMessage('Unknown Error'),
      })
    );
    // 清理 lastError
    chrome.runtime.lastError = null;
  });

  test('updateHighlights：缺少 API Key → 返回錯誤', async () => {
    // 有活動分頁
    chrome.tabs.query.mockResolvedValueOnce([
      { id: 1, url: 'https://example.com/page', title: 't', active: true },
    ]);
    // sync.get 已預設為返回 {}（無 notionApiKey）
    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'updateHighlights' }, internalSender, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.MISSING_API_KEY),
      })
    );
  });

  test('updateHighlights：頁面未保存 → 返回錯誤', async () => {
    // 有活動分頁
    chrome.tabs.query.mockResolvedValueOnce([
      { id: 1, url: 'https://example.com/page', title: 't', active: true },
    ]);
    // 提供 notionApiKey 但不提供 saved_ 鍵 → 觸發 Page not saved yet
    chrome.storage.sync.get.mockImplementationOnce((keys, mockCb) => {
      const res = { notionApiKey: 'key' };
      mockCb?.(res);
      return Promise.resolve(res);
    });

    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'updateHighlights' }, internalSender, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.PAGE_NOT_SAVED),
      })
    );
  });

  test('checkNotionPageExists：缺少 pageId → 返回錯誤', async () => {
    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit(
      { action: 'checkNotionPageExists' },
      internalSender,
      sendResponse
    );
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.MISSING_PAGE_ID),
      })
    );
  });

  test('checkNotionPageExists：未配置 API Key → 返回錯誤', async () => {
    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit(
      { action: 'checkNotionPageExists', pageId: 'pid-1' },
      internalSender,
      sendResponse
    );
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.MISSING_API_KEY),
      })
    );
  });

  test('openNotionPage：缺少 URL → 返回錯誤', async () => {
    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'openNotionPage' }, internalSender, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: ERROR_MESSAGES.USER_MESSAGES.MISSING_URL,
      })
    );
  });

  test('openNotionPage：tabs.create 失敗（runtime.lastError）→ 返回錯誤', async () => {
    // 設置已保存的頁面數據
    const pageUrl = 'https://example.com/article-open';
    const savedKey = `saved_${pageUrl}`;
    await new Promise(resolve =>
      chrome.storage.local.set(
        {
          [savedKey]: {
            notionPageId: 'page-123',
            notionUrl: 'https://www.notion.so/page123',
          },
        },
        resolve
      )
    );

    const sendResponse = jest.fn();
    // 讓 create callback 觸發 lastError
    chrome.tabs.create.mockImplementationOnce((props, mockCb) => {
      chrome.runtime.lastError = { message: 'Create failed' };
      mockCb?.();
    });
    chrome.runtime.onMessage._emit(
      { action: 'openNotionPage', url: pageUrl },
      internalSender,
      sendResponse
    );
    await waitForSend(sendResponse);
    // 'Create failed' 經過 sanitizeApiError 清洗後會返回 'Unknown Error'，
    // ErrorHandler.formatUserMessage('Unknown Error') 返回預設錯誤訊息
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: ErrorHandler.formatUserMessage('Unknown Error'),
      })
    );
    chrome.runtime.lastError = null;
  });

  // ===== savePage 錯誤分支 =====
  test('savePage：無活動分頁 → 返回錯誤', async () => {
    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'savePage' }, internalSender, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB),
      })
    );
  });

  test('savePage：缺少 API Key 或資料來源 ID → 返回錯誤', async () => {
    chrome.tabs.query.mockResolvedValueOnce([
      { id: 7, url: 'https://example.com/a', title: 'A', active: true },
    ]);
    // 預設 sync.get 回傳 {}，觸發缺少 API Key/DB ID
    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'savePage' }, internalSender, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.MISSING_API_KEY),
      })
    );
  });

  // ===== syncHighlights 錯誤與邊界分支 =====
  test('syncHighlights：無活動分頁 → 返回錯誤', async () => {
    const sendResponse = jest.fn();
    // 使用沒有 tab 屬性的 sender (如 internalSender) 來測試 fallback 到 getActiveTab 失敗的情況
    chrome.runtime.onMessage._emit({ action: 'syncHighlights' }, internalSender, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: SECURITY_ERROR_MESSAGES.TAB_CONTEXT_REQUIRED,
      })
    );
  });

  test('syncHighlights：缺少 API Key → 返回錯誤', async () => {
    chrome.tabs.query.mockResolvedValueOnce([
      { id: 2, url: 'https://example.com/page', title: 'P', active: true },
    ]);
    // sync.get 預設 {} → 缺少 API Key
    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit(
      { action: 'syncHighlights', highlights: [{ text: 'x', color: 'yellow' }] },
      contentScriptSender,
      sendResponse
    );
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.MISSING_API_KEY),
      })
    );
  });

  test('syncHighlights：頁面未保存 → 返回錯誤', async () => {
    chrome.tabs.query.mockResolvedValueOnce([
      { id: 3, url: 'https://example.com/page', title: 'P', active: true },
    ]);
    // 提供 notionApiKey，但不提供 saved_ 鍵
    chrome.storage.sync.get.mockImplementationOnce((keys, mockCb) => {
      const res = { notionApiKey: 'key' };
      mockCb?.(res);
      return Promise.resolve(res);
    });
    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit(
      { action: 'syncHighlights', highlights: [{ text: 'x', color: 'yellow' }] },
      contentScriptSender,
      sendResponse
    );
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.PAGE_NOT_SAVED),
      })
    );
  });

  test('syncHighlights：空標註 → 成功且 0', async () => {
    // 活動分頁
    const url = 'https://example.com/page';
    chrome.tabs.query.mockResolvedValueOnce([{ id: 4, url, title: 'P', active: true }]);
    // 有 API Key 且頁面已保存
    chrome.storage.sync.get.mockImplementationOnce((keys, mockCb) => {
      const res = { notionApiKey: 'key' };
      mockCb?.(res);
      return Promise.resolve(res);
    });
    const savedKey = `saved_${url}`;
    await new Promise(resolve =>
      chrome.storage.local.set({ [savedKey]: { notionPageId: 'pid-xyz' } }, resolve)
    );

    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit(
      { action: 'syncHighlights', highlights: [] },
      contentScriptSender,
      sendResponse
    );
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        highlightCount: 0,
        message: expect.stringMatching(/沒有新標註需要同步/u),
      })
    );
  });

  // ===== savePage 注入與 Notion API 錯誤路徑 =====
  test('savePage：injectWithResponse 函數執行失敗 → 返回錯誤', async () => {
    // 活動分頁 + 有 API/DB
    const url = 'https://example.com/article-inject-fail';
    chrome.tabs.query.mockResolvedValueOnce([{ id: 10, url, title: 'Article', active: true }]);
    chrome.storage.sync.get.mockImplementationOnce((keys, mockCb) => {
      const res = { notionApiKey: 'key', notionDataSourceId: 'ds', notionDatabaseId: 'db' };
      mockCb?.(res);
      return Promise.resolve(res);
    });

    // Explicit mock sequence: 1. Files -> 2. checkInitialization -> 3. collectHighlights -> 4. injectWithResponse
    setupScriptMock('error');

    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'savePage' }, internalSender, sendResponse);
    await waitForSend(sendResponse);
    // 注入函數失敗後，handleSavePage 會走回退內容提取並繼續保存邏輯；
    // 這裡只驗證最終為失敗（error 字段存在），不綁定具體錯誤訊息以避免外部 fetch 影響。
    const call = sendResponse.mock.calls[0][0];
    expect(call.success).toBe(false);
    expect(typeof call.error).toBe('string');
    chrome.runtime.lastError = null;
  });

  test('savePage：Notion API 建頁 4xx 錯誤（非 image）→ 返回錯誤訊息', async () => {
    // 活動分頁 + 有 API/DB
    const url = 'https://example.com/article-400';
    chrome.tabs.query.mockResolvedValueOnce([{ id: 11, url, title: 'Article', active: true }]);
    chrome.storage.sync.get.mockImplementationOnce((keys, mockCb) => {
      const res = { notionApiKey: 'key', notionDataSourceId: 'ds', notionDatabaseId: 'db' };
      mockCb?.(res);
      return Promise.resolve(res);
    });

    // 模擬內容注入成功：collectHighlights 空、injectWithResponse 回傳內容
    // 模擬內容注入成功：Files -> Init -> Collect -> Extract
    const contentResult = {
      title: 'T',
      blocks: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content: 'c' } }] },
        },
      ],
    };
    setupScriptMock(contentResult);

    // 模擬 Notion API 回覆 400 非 image 錯誤
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ message: 'Invalid request' }),
        text: () => Promise.resolve('Invalid request'),
      })
    );

    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'savePage' }, internalSender, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        // 400 + 'Invalid request' 經過 sanitizeApiError 會返回 'Invalid request'
        error: expect.stringMatching(API_ERROR_REGEX),
      })
    );
  });

  test('savePage：Notion API image validation_error 觸發自動重試（排除圖片）→ 成功', async () => {
    jest.useFakeTimers();

    // 活動分頁 + 有 API/DB
    const url = 'https://example.com/article-retry';
    chrome.tabs.query.mockResolvedValueOnce([{ id: 12, url, title: 'Article', active: true }]);

    // 使用 mockImplementation 確保此測試期間所有呼叫都能拿到 API Key
    chrome.storage.sync.get.mockImplementation((keys, mockCb) => {
      const res = {
        notionApiKey: 'key',
        notionDataSourceId: 'ds',
        notionDatabaseId: 'db',
      };
      mockCb?.(res);
      return Promise.resolve(res);
    });

    // 注入：collectHighlights 空、injectWithResponse 回傳「含圖片」的內容
    // 注入：Files -> Init -> Collect -> Extract (含圖片)
    const contentResult = {
      title: 'T',
      blocks: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content: 'p' } }] },
        },
        {
          object: 'block',
          type: 'image',
          image: {
            type: 'external',
            external: { url: 'https://cdn.example.com/img.jpg' },
          },
        },
      ],
    };
    setupScriptMock(contentResult);

    // fetch：第1次返回 validation_error（含 image 字樣），第2次返回 ok:true
    let fetchCall = 0;
    globalThis.fetch = jest.fn((requestUrl, init) => {
      const method = init?.method?.toUpperCase() || 'GET';
      // 1. 攔截 checkPageExists (GET)
      if (method === 'GET') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ archived: false }),
          text: () => Promise.resolve(JSON.stringify({ archived: false })),
        });
      }
      // 2. 攔截建頁 (POST) -> 第1次 400, 第2次 200
      fetchCall += 1;
      if (fetchCall === 1) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ code: 'validation_error', message: 'image url invalid' }),
          text: () =>
            Promise.resolve(
              JSON.stringify({ code: 'validation_error', message: 'image url invalid' })
            ),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'new-page-id', url: 'https://www.notion.so/new' }),
        text: () =>
          Promise.resolve(JSON.stringify({ id: 'new-page-id', url: 'https://www.notion.so/new' })),
      });
    });

    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'savePage' }, internalSender, sendResponse);

    // 嘗試執行待處理計時器並讓出微任務，直到回傳
    for (let i = 0; i < 50; i++) {
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      if (sendResponse.mock.calls.length > 0) {
        break;
      }
    }
    if (sendResponse.mock.calls.length === 0) {
      throw new Error('sendResponse was not called within the timeout');
    }
    const resp = sendResponse.mock.calls[0][0];
    expect(resp.success).toBe(true);
    // 可存在 warning（All images were skipped...），但不強制檢查文案

    jest.useRealTimers();
  });

  test('updateNotionPage：validation_error（含 image）→ 返回友善錯誤訊息', async () => {
    // 活動分頁 + 有 API/DB
    const url = 'https://example.com/article-validation-image';
    chrome.tabs.query.mockResolvedValueOnce([{ id: 21, url, title: 'Article', active: true }]);
    chrome.storage.sync.get.mockImplementationOnce((keys, mockCb) => {
      const res = { notionApiKey: 'key', notionDataSourceId: 'ds', notionDatabaseId: 'db' };
      mockCb?.(res);
      return Promise.resolve(res);
    });

    // 已保存頁面 → 走 updateNotionPage 分支
    const savedKey = `saved_${url}`;
    await new Promise(resolve =>
      chrome.storage.local.set({ [savedKey]: { notionPageId: 'page-validation-image' } }, resolve)
    );

    // 高亮收集為 0；injectWithResponse 回傳內容（無圖片亦可）

    const contentResult = {
      title: 'T',
      blocks: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content: 'x' } }] },
        },
      ],
    };
    setupScriptMock(contentResult);

    globalThis.fetch = jest.fn((requestUrl, init) => {
      // 檢查頁面存在
      if (/\/v1\/pages\//u.test(requestUrl) && (init?.method === 'GET' || !init)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ archived: false }),
          text: () => Promise.resolve('ok'),
        });
      }
      // 讀取既有內容
      if (
        /\/v1\/blocks\/page-validation-image\/children/u.test(requestUrl) &&
        init?.method === 'GET'
      ) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ results: [] }),
          text: () => Promise.resolve('ok'),
        });
      }
      // 更新內容 → 返回 validation_error 且 message 含 image
      if (
        /\/v1\/blocks\/page-validation-image\/children/u.test(requestUrl) &&
        init?.method === 'PATCH'
      ) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ code: 'validation_error', message: 'image url invalid' }),
          text: () => Promise.resolve('image url invalid'),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('ok'),
      });
    });

    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'savePage' }, internalSender, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        // 'image url invalid' 包含 'image'，經過 sanitizeApiError 返回 'Invalid request'
        error: expect.stringMatching(API_ERROR_REGEX),
      })
    );
  });

  test('updateNotionPage：一般 4xx 錯誤 → 返回原始訊息', async () => {
    const url = 'https://example.com/article-400-gen';
    chrome.tabs.query.mockResolvedValueOnce([{ id: 22, url, title: 'Article2', active: true }]);
    chrome.storage.sync.get.mockImplementationOnce((keys, mockCb) => {
      const res = { notionApiKey: 'key', notionDataSourceId: 'ds', notionDatabaseId: 'db' };
      mockCb?.(res);
      return Promise.resolve(res);
    });

    const savedKey = `saved_${url}`;
    await new Promise(resolve =>
      chrome.storage.local.set({ [savedKey]: { notionPageId: 'page-400-gen' } }, resolve)
    );

    const contentResult = {
      title: 'T2',
      blocks: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content: 'y' } }] },
        },
      ],
    };
    setupScriptMock(contentResult);

    globalThis.fetch = jest.fn((requestUrl, init) => {
      if (/\/v1\/pages\//u.test(requestUrl) && (init?.method === 'GET' || !init)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ archived: false }),
          text: () => Promise.resolve('ok'),
        });
      }
      if (/\/v1\/blocks\/page-400-gen\/children/u.test(requestUrl) && init?.method === 'GET') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ results: [] }),
          text: () => Promise.resolve('ok'),
        });
      }
      if (/\/v1\/blocks\/page-400-gen\/children/u.test(requestUrl) && init?.method === 'PATCH') {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ message: 'Invalid request' }),
          text: () => Promise.resolve('Invalid request'),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('ok'),
      });
    });

    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'savePage' }, internalSender, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        // 當前 Fallback 訊息或經過翻譯後的訊息均包含「失敗」或「無效」
        error: expect.stringMatching(API_ERROR_REGEX),
      })
    );
  });

  test('updateNotionPage：PATCH 失敗無 message → 返回預設錯誤訊息', async () => {
    const url = 'https://example.com/article-500';
    const pageId = 'page-500';

    chrome.tabs.query.mockResolvedValueOnce([{ id: 22, url, title: 'Article', active: true }]);
    chrome.storage.sync.get.mockImplementationOnce((keys, mockCb) => {
      const res = { notionApiKey: 'key', notionDataSourceId: 'ds', notionDatabaseId: 'db' };
      mockCb?.(res);
      return Promise.resolve(res);
    });
    await new Promise(resolve =>
      chrome.storage.local.set({ [`saved_${url}`]: { notionPageId: pageId } }, resolve)
    );

    const contentResult = {
      title: 'T2',
      blocks: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content: 'p2' } }] },
        },
      ],
    };
    setupScriptMock(contentResult);

    globalThis.fetch = jest.fn((requestUrl, init) => {
      if (/\/v1\/pages\//u.test(requestUrl) && init?.method === 'GET') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ archived: false }),
          text: () => Promise.resolve(JSON.stringify({ archived: false })),
        });
      }
      if (/\/v1\/blocks\/.+\/children$/u.test(requestUrl) && init?.method === 'GET') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ results: [] }),
          text: () => Promise.resolve(JSON.stringify({ results: [] })),
        });
      }
      if (/\/v1\/blocks\/.+\/children$/u.test(requestUrl) && init?.method === 'PATCH') {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve('Internal Server Error'),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('ok'),
      });
    });

    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'savePage' }, internalSender, sendResponse);
    await waitForSend(sendResponse, 7000);
    const resp = sendResponse.mock.calls[0]?.[0];
    // 500 錯誤會觸發 fetchWithRetry 重試機制，最終可能超時
    // 但如果成功回應，應該是失敗且包含預設錯誤訊息
    expect(sendResponse).toHaveBeenCalled();
    expect(resp).toBeDefined();
    expect(resp.success).toBe(false);
    expect(typeof resp.error).toBe('string');
  });
});
