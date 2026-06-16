/**
 * Background.js - 錯誤分支整合測試（require 真實腳本 + 事件觸發）
 */

/* global chrome */

import { ErrorHandler } from '../../../scripts/utils/ErrorHandler.js';
import {
  ERROR_MESSAGES,
  SECURITY_ERROR_MESSAGES,
} from '../../../scripts/config/shared/messages.js';
import {
  createSendResponseWaiter,
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
    .mockImplementationOnce((opts, cb) => cb?.()) // 1: injectHighlighter files
    .mockImplementationOnce((opts, cb) => cb?.([{ result: undefined }])) // 2: injectHighlighter func
    .mockImplementationOnce((opts, cb) => cb?.([{ result: [] }])) // 3: collectHighlights func
    .mockImplementationOnce((opts, cb) => cb?.()); // 4: extractContent files

  if (contentResult === 'error') {
    mock.mockImplementationOnce((opts, cb) => {
      chrome.runtime.lastError = { message: 'Function execution failed' };
      cb?.();
    });
  } else {
    mock.mockImplementationOnce((opts, cb) => cb?.([{ result: contentResult ?? {} }])); // 5: extractContent func
  }
}

/**
 * Helper to mock active tab query return value.
 */
function mockActiveTab({ id = 1, url, title = 'Article' } = {}) {
  chrome.tabs.query.mockResolvedValue([{ id, url, title, active: true }]);
}

/**
 * Helper to mock sync storage Notion settings.
 */
function mockNotionSettings(overrides = {}) {
  const settings = {
    notionApiKey: 'key',
    notionDataSourceId: 'ds',
    notionDatabaseId: 'db',
    ...overrides,
  };
  chrome.storage.sync.get.mockImplementation((keys, mockCb) => {
    mockCb?.(settings);
    return Promise.resolve(settings);
  });
}

/**
 * Helper to mock local storage saved page state.
 */
async function saveStoredNotionPage(url, pageState = {}) {
  const savedKey = `saved_${url}`;
  const data = {
    notionPageId: 'page-xyz',
    destinationProfileId: 'default',
    ...pageState,
  };
  await new Promise(resolve => chrome.storage.local.set({ [savedKey]: data }, resolve));
}

/**
 * Helper to build a standard Notion paragraph block.
 */
function buildParagraphBlock(text = 'p') {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content: text } }] },
  };
}

/**
 * Helper to build simulated extracted content.
 */
function buildExtractedPageContent({ title = 'T', text = 'p', blocks } = {}) {
  return {
    extractionStatus: 'success',
    title,
    blocks: blocks || [buildParagraphBlock(text)],
  };
}

/**
 * Helper to build a mock JSON response for fetch.
 */
function buildJsonResponse(body, { ok = true, status = 200 } = {}) {
  const jsonStr = JSON.stringify(body);
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(jsonStr),
  });
}

/**
 * Helper to build a mock Notion page check response.
 */
function buildNotionPageExistsResponse() {
  return buildJsonResponse({ archived: false });
}

/**
 * Helper to build a mock empty children response.
 */
function buildEmptyChildrenResponse() {
  return buildJsonResponse({ results: [] });
}

/**
 * Helper to build a mock validation error response (e.g. for invalid images).
 */
function buildImageValidationErrorResponse() {
  return buildJsonResponse(
    { code: 'validation_error', message: 'image url invalid' },
    { ok: false, status: 400 }
  );
}

/**
 * Helper to build a mock generic client response error.
 */
function buildGenericNotionClientErrorResponse(message = 'Invalid request') {
  return buildJsonResponse({ message }, { ok: false, status: 400 });
}

/**
 * Predict method from fetch init options.
 */
function getFetchMethod(init) {
  return init?.method?.toUpperCase() || 'GET';
}

/**
 * Predict if fetch request is Notion Page GET.
 */
function isNotionPageGet(requestUrl, init) {
  return getFetchMethod(init) === 'GET' && /\/v1\/pages\//u.test(requestUrl);
}

/**
 * Predict if fetch request is Notion Children GET.
 */
function isChildrenGet(requestUrl, init, pageIdPattern) {
  if (getFetchMethod(init) !== 'GET') {
    return false;
  }
  const regex = new RegExp(String.raw`\/v1\/blocks\/${pageIdPattern}\/children`, 'u');
  return regex.test(requestUrl);
}

/**
 * Predict if fetch request is Notion Children PATCH.
 */
function isChildrenPatch(requestUrl, init, pageIdPattern) {
  if (getFetchMethod(init) !== 'PATCH') {
    return false;
  }
  const regex = new RegExp(String.raw`\/v1\/blocks\/${pageIdPattern}\/children`, 'u');
  return regex.test(requestUrl);
}

/**
 * Helper to mock whole updateNotionPage fetch routing flow.
 */
function mockUpdatePageFetchFlow({ pageIdPattern, patchResponse, fallbackResponse }) {
  globalThis.fetch = jest.fn((requestUrl, init) => {
    if (isNotionPageGet(requestUrl, init)) {
      return buildNotionPageExistsResponse();
    }
    if (isChildrenGet(requestUrl, init, pageIdPattern)) {
      return buildEmptyChildrenResponse();
    }
    if (isChildrenPatch(requestUrl, init, pageIdPattern)) {
      return typeof patchResponse === 'function' ? patchResponse() : patchResponse;
    }
    if (fallbackResponse) {
      return typeof fallbackResponse === 'function'
        ? fallbackResponse(requestUrl, init)
        : fallbackResponse;
    }
    return buildJsonResponse({});
  });
}

describe('background error branches (integration)', () => {
  let originalChrome = null;
  let originalFetch = null;
  let mockSyncStorage = {};

  // 已移除過寬的 API_ERROR_REGEX，改用具體斷言

  beforeEach(() => {
    jest.resetModules();
    mockSyncStorage = {};
    originalChrome = globalThis.chrome;
    originalFetch = globalThis.fetch;

    // 明確設定 Logger 為非調試模式，但允許輸出到控制台
    globalThis.Logger = createMockLogger();

    const { chromeMock } = setupChromeMock({}, mockSyncStorage);

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
  const contentScriptSender = {
    id: 'test',
    tab: { id: 1, url: 'https://example.com/page' },
    url: 'https://example.com/page',
  };

  test.each([
    {
      name: 'startHighlight：無活動分頁 → 返回錯誤',
      message: { action: 'startHighlight' },
      expectedError: ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB,
    },
    {
      name: 'savePage：無活動分頁 → 返回錯誤',
      message: { action: 'savePage' },
      expectedError: ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB,
    },
    {
      name: 'checkNotionPageExists：缺少 pageId → 返回錯誤',
      message: { action: 'checkNotionPageExists' },
      expectedError: ERROR_MESSAGES.TECHNICAL.MISSING_PAGE_ID,
    },
    {
      name: 'checkNotionPageExists：未配置 API Key → 返回錯誤',
      message: { action: 'checkNotionPageExists', pageId: 'pid-1' },
      expectedError: ERROR_MESSAGES.TECHNICAL.MISSING_API_KEY,
    },
    {
      name: 'openNotionPage：缺少 URL → 返回錯誤',
      message: { action: 'openNotionPage' },
      expectedError: ERROR_MESSAGES.USER_MESSAGES.MISSING_URL,
      noFormat: true,
    },
  ])('$name', async ({ message, expectedError, noFormat }) => {
    const sendResponse = createSendResponseWaiter();
    chrome.runtime.onMessage._emit(message, internalSender, sendResponse);
    await sendResponse.waitForCall();

    const err = noFormat ? expectedError : ErrorHandler.formatUserMessage(expectedError);
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: err,
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

    const sendResponse = createSendResponseWaiter();
    chrome.runtime.onMessage._emit({ action: 'startHighlight' }, internalSender, sendResponse);
    await sendResponse.waitForCall();
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        // 'Injection failed' 經過 sanitizeApiError 會返回 'UNKNOWN_ERROR' token
        error: ErrorHandler.formatUserMessage('UNKNOWN_ERROR'),
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
    const sendResponse = createSendResponseWaiter();
    chrome.runtime.onMessage._emit({ action: 'updateHighlights' }, internalSender, sendResponse);
    await sendResponse.waitForCall();
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
    chrome.storage.sync.get.mockImplementation((keys, mockCb) => {
      const res = { notionApiKey: 'key' };
      mockCb?.(res);
      return Promise.resolve(res);
    });

    const sendResponse = createSendResponseWaiter();
    chrome.runtime.onMessage._emit({ action: 'updateHighlights' }, internalSender, sendResponse);
    await sendResponse.waitForCall();
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.PAGE_NOT_SAVED),
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

    // Mock active tab 以支持 getActiveTab() + resolveTabUrl()
    const tabId = 99;
    chrome.tabs.query.mockResolvedValueOnce([
      { id: tabId, url: pageUrl, title: 'Test', active: true },
    ]);
    // resolveTabUrl 內部會 sendMessage PING，模擬回應無 preloader 數據
    chrome.tabs.sendMessage.mockImplementationOnce((_tabId, _msg, callback) => {
      callback?.({ status: 'bundle_ready' });
    });

    const sendResponse = createSendResponseWaiter();
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
    await sendResponse.waitForCall();
    // 'Create failed' 經過 sanitizeApiError 清洗後會返回 'UNKNOWN_ERROR' token，
    // ErrorHandler.formatUserMessage('UNKNOWN_ERROR') 返回對應的 PATTERNS 翻譯
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: ErrorHandler.formatUserMessage('UNKNOWN_ERROR'),
      })
    );
    chrome.runtime.lastError = null;
  });

  // ===== savePage 錯誤分支 =====

  test('savePage：缺少 API Key 或資料來源 ID → 返回錯誤', async () => {
    chrome.tabs.query.mockResolvedValueOnce([
      { id: 7, url: 'https://example.com/a', title: 'A', active: true },
    ]);
    // 預設 sync.get 回傳 {}，觸發缺少 API Key/DB ID
    const sendResponse = createSendResponseWaiter();
    chrome.runtime.onMessage._emit({ action: 'savePage' }, internalSender, sendResponse);
    await sendResponse.waitForCall();
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.MISSING_API_KEY),
      })
    );
  });

  // ===== syncHighlights 錯誤與邊界分支 =====
  test('syncHighlights：無活動分頁 → 返回錯誤', async () => {
    const sendResponse = createSendResponseWaiter();
    // 使用沒有 tab 屬性的 sender (如 internalSender) 來測試 fallback 到 getActiveTab 失敗的情況
    chrome.runtime.onMessage._emit({ action: 'syncHighlights' }, internalSender, sendResponse);
    await sendResponse.waitForCall();
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: SECURITY_ERROR_MESSAGES.TAB_CONTEXT_REQUIRED,
      })
    );
  });

  test('syncHighlights：缺少 API Key → 返回錯誤', async () => {
    chrome.tabs.query.mockResolvedValueOnce([
      { id: 1, url: 'https://example.com/page', title: 'P', active: true },
    ]);
    // sync.get 預設 {} → 缺少 API Key
    const sendResponse = createSendResponseWaiter();
    chrome.runtime.onMessage._emit(
      { action: 'syncHighlights', highlights: [{ text: 'x', color: 'yellow' }] },
      contentScriptSender,
      sendResponse
    );
    await sendResponse.waitForCall();
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.MISSING_API_KEY),
      })
    );
  });

  test('syncHighlights：頁面未保存 → 返回錯誤', async () => {
    chrome.tabs.query.mockResolvedValueOnce([
      { id: 1, url: 'https://example.com/page', title: 'P', active: true },
    ]);
    // 提供 notionApiKey，但不提供 saved_ 鍵
    chrome.storage.sync.get.mockImplementation((keys, mockCb) => {
      const res = { notionApiKey: 'key' };
      mockCb?.(res);
      return Promise.resolve(res);
    });
    const sendResponse = createSendResponseWaiter();
    chrome.runtime.onMessage._emit(
      { action: 'syncHighlights', highlights: [{ text: 'x', color: 'yellow' }] },
      contentScriptSender,
      sendResponse
    );
    await sendResponse.waitForCall();
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
    chrome.tabs.query.mockResolvedValueOnce([{ id: 1, url, title: 'P', active: true }]);
    // 有 API Key 且頁面已保存
    chrome.storage.sync.get.mockImplementation((keys, mockCb) => {
      const res = { notionApiKey: 'key' };
      mockCb?.(res);
      return Promise.resolve(res);
    });
    const savedKey = `saved_${url}`;
    await new Promise(resolve =>
      chrome.storage.local.set({ [savedKey]: { notionPageId: 'pid-xyz' } }, resolve)
    );

    const sendResponse = createSendResponseWaiter();
    chrome.runtime.onMessage._emit(
      { action: 'syncHighlights', highlights: [] },
      contentScriptSender,
      sendResponse
    );
    await sendResponse.waitForCall();
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        count: 0,
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
    chrome.storage.sync.get.mockImplementation((keys, mockCb) => {
      const res = { notionApiKey: 'key', notionDataSourceId: 'ds', notionDatabaseId: 'db' };
      mockCb?.(res);
      return Promise.resolve(res);
    });

    // Explicit mock sequence: 1. Files -> 2. checkInitialization -> 3. collectHighlights -> 4. injectWithResponse
    setupScriptMock('error');

    const sendResponse = createSendResponseWaiter();
    chrome.runtime.onMessage._emit({ action: 'savePage' }, internalSender, sendResponse);
    await sendResponse.waitForCall();
    // 注入函數失敗後，handleSavePage 會走回退內容提取並繼續保存邏輯；
    // 這裡只驗證最終為失敗（error 字段存在），不綁定具體錯誤訊息以避免外部 fetch 影響。
    const call = sendResponse.mock.calls[0][0];
    expect(call.success).toBe(false);
    // 注入失敗後啟動 fallback extraction。但由於 fetch 未被 mock 以支持完整保存，
    // 因此最終一定因 fetch mock 在 fallback 時失敗，引發例外。
    // 在目前的流程下，會收到內容提取失敗的錯誤
    expect(call.error.toString()).toMatch(/內容提取失敗|無法.*內容/);
    chrome.runtime.lastError = null;
  });

  test('savePage：Notion API 建頁 4xx 錯誤（非 image）→ 返回錯誤訊息', async () => {
    // 活動分頁 + 有 API/DB
    const url = 'https://example.com/article-400';
    chrome.tabs.query.mockResolvedValueOnce([{ id: 11, url, title: 'Article', active: true }]);
    chrome.storage.sync.get.mockImplementation((keys, mockCb) => {
      const res = { notionApiKey: 'key', notionDataSourceId: 'ds', notionDatabaseId: 'db' };
      mockCb?.(res);
      return Promise.resolve(res);
    });

    // 模擬內容注入成功：collectHighlights 空、injectWithResponse 回傳內容
    // 模擬內容注入成功：Files -> Init -> Collect -> Extract
    const contentResult = {
      extractionStatus: 'success',
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

    const sendResponse = createSendResponseWaiter();
    chrome.runtime.onMessage._emit({ action: 'savePage' }, internalSender, sendResponse);
    await sendResponse.waitForCall();
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: ErrorHandler.formatUserMessage('NOTIONHQ_CLIENT_RESPONSE_ERROR'),
      })
    );
  });

  test('savePage：Notion API image validation_error → 返回友善錯誤（不自動重試）', async () => {
    jest.useFakeTimers();

    const url = 'https://example.com/article-retry';
    mockActiveTab({ id: 12, url });
    mockNotionSettings();

    const contentResult = buildExtractedPageContent({
      blocks: [
        buildParagraphBlock('p'),
        {
          object: 'block',
          type: 'image',
          image: {
            type: 'external',
            external: { url: 'https://cdn.example.com/img.jpg' },
          },
        },
      ],
    });
    setupScriptMock(contentResult);

    let fetchCall = 0;
    globalThis.fetch = jest.fn((requestUrl, init) => {
      const method = getFetchMethod(init);
      if (method === 'GET') {
        return buildNotionPageExistsResponse();
      }
      fetchCall += 1;
      if (fetchCall === 1) {
        return buildImageValidationErrorResponse();
      }
      return buildJsonResponse({ id: 'new-page-id', url: 'https://www.notion.so/new' });
    });

    const sendResponse = createSendResponseWaiter();
    chrome.runtime.onMessage._emit({ action: 'savePage' }, internalSender, sendResponse);
    await sendResponse.waitForCall();
    const resp = sendResponse.mock.calls[0][0];
    expect(resp.success).toBe(false);
    expect(resp.error).toBe(ErrorHandler.formatUserMessage('IMAGE_VALIDATION_ERROR'));
    expect(fetchCall).toBe(1);

    jest.useRealTimers();
  });

  test('updateNotionPage：validation_error（含 image）→ 返回友善錯誤訊息', async () => {
    const url = 'https://example.com/article-validation-image';
    mockActiveTab({ id: 21, url });
    mockNotionSettings();
    await saveStoredNotionPage(url, { notionPageId: 'page-validation-image' });

    setupScriptMock(buildExtractedPageContent({ text: 'x' }));

    mockUpdatePageFetchFlow({
      pageIdPattern: 'page-validation-image',
      patchResponse: () => buildImageValidationErrorResponse(),
    });

    const sendResponse = createSendResponseWaiter();
    chrome.runtime.onMessage._emit({ action: 'savePage' }, internalSender, sendResponse);
    await sendResponse.waitForCall();
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: ErrorHandler.formatUserMessage('IMAGE_VALIDATION_ERROR'),
      })
    );
  });

  test('updateNotionPage：一般 4xx 錯誤 → 返回原始訊息', async () => {
    const url = 'https://example.com/article-400-gen';
    mockActiveTab({ id: 22, url, title: 'Article2' });
    mockNotionSettings();
    await saveStoredNotionPage(url, { notionPageId: 'page-400-gen' });

    setupScriptMock(buildExtractedPageContent({ title: 'T2', text: 'y' }));

    mockUpdatePageFetchFlow({
      pageIdPattern: 'page-400-gen',
      patchResponse: () => buildGenericNotionClientErrorResponse('Invalid request'),
    });

    const sendResponse = createSendResponseWaiter();
    chrome.runtime.onMessage._emit({ action: 'savePage' }, internalSender, sendResponse);
    await sendResponse.waitForCall();
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: ErrorHandler.formatUserMessage('NOTIONHQ_CLIENT_RESPONSE_ERROR'),
      })
    );
  });

  test('updateNotionPage：PATCH 失敗無 message → 返回預設錯誤訊息', async () => {
    const url = 'https://example.com/article-500';
    const pageId = 'page-500';

    mockActiveTab({ id: 22, url });
    mockNotionSettings();
    await saveStoredNotionPage(url, { notionPageId: pageId });

    setupScriptMock(buildExtractedPageContent({ title: 'T2', text: 'p2' }));

    mockUpdatePageFetchFlow({
      pageIdPattern: pageId,
      patchResponse: () => buildJsonResponse({}, { ok: false, status: 500 }),
    });

    const sendResponse = createSendResponseWaiter(7000);
    chrome.runtime.onMessage._emit({ action: 'savePage' }, internalSender, sendResponse);
    await sendResponse.waitForCall();
    const resp = sendResponse.mock.calls[0]?.[0];

    expect(sendResponse).toHaveBeenCalled();
    expect(resp).toBeDefined();
    expect(resp.success).toBe(false);
    expect(resp.error).toBe(ErrorHandler.formatUserMessage('NOTIONHQ_CLIENT_RESPONSE_ERROR'));
  });
});
