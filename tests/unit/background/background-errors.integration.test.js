/**
 * Background.js - 錯誤分支整合測試（require 真實腳本 + 事件觸發）
 */

 

function createEvent() {
  const listeners = [];
  return {
    addListener: (fn) => listeners.push(fn),
    removeListener: (fn) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    hasListener: (fn) => listeners.includes(fn),
    _emit: (...args) => listeners.forEach((fn) => {
      try { fn(...args); } catch (_) {}
    }),
    _listeners: listeners
  };
}

describe('background error branches (integration)', () => {
  let originalChrome = null;

  beforeEach(() => {
    jest.resetModules();
    originalChrome = global.chrome;

    const onMessage = createEvent();
    const onInstalled = createEvent();
    const onUpdated = createEvent();

    const storageData = {};

    global.chrome = {
      runtime: {
        id: 'test',
        lastError: null,
        getManifest: jest.fn(() => ({ version: '2.9.5' })),
        onMessage,
        onInstalled,
        getURL: jest.fn((p) => `chrome-extension://test/${p}`)
      },
      tabs: {
        onUpdated,
        // 預設返回空，個別測試覆蓋
        query: jest.fn((queryInfo, cb) => cb([])),
        create: jest.fn((props, cb) => cb?.({ id: 101, ...props })),
        sendMessage: jest.fn((tabId, msg, cb) => cb?.({ success: true }))
      },
      action: {
        setBadgeText: jest.fn(),
        setBadgeBackgroundColor: jest.fn()
      },
      scripting: {
        executeScript: jest.fn((opts, cb) => cb?.([{ result: undefined }]))
      },
      storage: {
        local: {
          get: jest.fn((keys, cb) => {
            const res = {};
            if (Array.isArray(keys)) {
              keys.forEach((k) => { if (k in storageData) res[k] = storageData[k]; });
            } else if (typeof keys === 'string') {
              if (keys in storageData) res[keys] = storageData[keys];
            } else if (!keys) {
              Object.assign(res, storageData);
            }
            cb?.(res);
          }),
          set: jest.fn((items, cb) => { Object.assign(storageData, items); cb?.(); }),
          remove: jest.fn((keys, cb) => { (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete storageData[k]); cb?.(); })
        },
        sync: {
          get: jest.fn((keys, cb) => cb?.({})) // 預設無 API Key，個別測試覆蓋
        }
      }
    };

    // 載入背景腳本（註冊 onMessage）
    require('../../../scripts/background.js');
  });

  afterEach(() => {
    global.chrome = originalChrome;
  });

  async function waitForSend(mockFn, maxWaitMs = 800) {
    const start = Date.now();
    while (mockFn.mock.calls.length === 0 && Date.now() - start < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  test('startHighlight：無活動分頁 → 返回錯誤', async () => {
    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'startHighlight' }, {}, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: expect.stringMatching(/active tab/i) }));
  });

  test('startHighlight：注入失敗 → 返回錯誤', async () => {
    // 有活動分頁
    chrome.tabs.query.mockImplementationOnce((q, cb) => cb([{ id: 1, url: 'https://x', title: 't', active: true }]));
    // 第一次 executeScript 模擬 lastError（文件注入階段）
    chrome.scripting.executeScript.mockImplementationOnce((opts, cb) => { chrome.runtime.lastError = { message: 'Injection failed' }; cb?.(); });

    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'startHighlight' }, {}, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Injection failed' }));
    // 清理 lastError
    chrome.runtime.lastError = null;
  });

  test('updateHighlights：缺少 API Key → 返回錯誤', async () => {
    // 有活動分頁
    chrome.tabs.query.mockImplementationOnce((q, cb) => cb([{ id: 1, url: 'https://example.com/page', title: 't', active: true }]));
    // sync.get 已預設為返回 {}（無 notionApiKey）
    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'updateHighlights' }, {}, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: expect.stringMatching(/API Key is not set/i) }));
  });

  test('updateHighlights：頁面未保存 → 返回錯誤', async () => {
    // 有活動分頁
    chrome.tabs.query.mockImplementationOnce((q, cb) => cb([{ id: 1, url: 'https://example.com/page', title: 't', active: true }]));
    // 提供 notionApiKey 但不提供 saved_ 鍵 → 觸發 Page not saved yet
    chrome.storage.sync.get.mockImplementationOnce((keys, cb) => cb?.({ notionApiKey: 'k' }));

    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'updateHighlights' }, {}, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: expect.stringMatching(/Page not saved yet/i) }));
  });

  test('checkNotionPageExists：缺少 pageId → 返回錯誤', async () => {
    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'checkNotionPageExists' }, {}, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: expect.stringMatching(/Page ID is required/i) }));
  });

  test('checkNotionPageExists：未配置 API Key → 返回錯誤', async () => {
    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'checkNotionPageExists', pageId: 'pid-1' }, {}, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: expect.stringMatching(/Notion API Key not configured/i) }));
  });

  test('openNotionPage：缺少 URL → 返回錯誤', async () => {
    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'openNotionPage' }, {}, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: expect.stringMatching(/No URL provided/i) }));
  });

  test('openNotionPage：tabs.create 失敗（runtime.lastError）→ 返回錯誤', async () => {
    const sendResponse = jest.fn();
    // 讓 create callback 觸發 lastError
    chrome.tabs.create.mockImplementationOnce((props, cb) => { chrome.runtime.lastError = { message: 'Create failed' }; cb?.(); });
    chrome.runtime.onMessage._emit({ action: 'openNotionPage', url: 'https://www.notion.so/page' }, {}, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Create failed' }));
    chrome.runtime.lastError = null;
  });

  // ===== savePage 錯誤分支 =====
  test('savePage：無活動分頁 → 返回錯誤', async () => {
    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'savePage' }, {}, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: expect.stringMatching(/Could not get active tab/i) }));
  });

  test('savePage：缺少 API Key 或資料來源 ID → 返回錯誤', async () => {
    chrome.tabs.query.mockImplementationOnce((q, cb) => cb([{ id: 7, url: 'https://example.com/a', title: 'A', active: true }]));
    // 預設 sync.get 回傳 {}，觸發缺少 API Key/DB ID
    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'savePage' }, {}, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: expect.stringMatching(/API Key or Data Source ID is not set/i) }));
  });

  // ===== syncHighlights 錯誤與邊界分支 =====
  test('syncHighlights：無活動分頁 → 返回錯誤', async () => {
    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'syncHighlights' }, {}, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: expect.stringMatching(/無法獲取當前標籤頁/u) }));
  });

  test('syncHighlights：缺少 API Key → 返回錯誤', async () => {
    chrome.tabs.query.mockImplementationOnce((q, cb) => cb([{ id: 2, url: 'https://example.com/page', title: 'P', active: true }]));
    // sync.get 預設 {} → 缺少 API Key
    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'syncHighlights', highlights: [{ text: 'x', color: 'yellow' }] }, {}, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: expect.stringMatching(/API Key 未設置/u) }));
  });

  test('syncHighlights：頁面未保存 → 返回錯誤', async () => {
    chrome.tabs.query.mockImplementationOnce((q, cb) => cb([{ id: 3, url: 'https://example.com/page', title: 'P', active: true }]));
    // 提供 notionApiKey，但不提供 saved_ 鍵
    chrome.storage.sync.get.mockImplementationOnce((keys, cb) => cb?.({ notionApiKey: 'k' }));
    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'syncHighlights', highlights: [{ text: 'x', color: 'yellow' }] }, {}, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: expect.stringMatching(/頁面尚未保存到 Notion/u) }));
  });

  test('syncHighlights：空標註 → 成功且 0', async () => {
    // 活動分頁
    const url = 'https://example.com/page';
    chrome.tabs.query.mockImplementationOnce((q, cb) => cb([{ id: 4, url, title: 'P', active: true }]));
    // 有 API Key 且頁面已保存
    chrome.storage.sync.get.mockImplementationOnce((keys, cb) => cb?.({ notionApiKey: 'k' }));
    const savedKey = `saved_${url}`;
    await new Promise((r) => chrome.storage.local.set({ [savedKey]: { notionPageId: 'pid-xyz' } }, r));

    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'syncHighlights', highlights: [] }, {}, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true, highlightCount: 0, message: expect.stringMatching(/沒有新標註需要同步/u) }));
  });

  // ===== savePage 注入與 Notion API 錯誤路徑 =====
  test('savePage：injectWithResponse 函數執行失敗 → 返回錯誤', async () => {
    // 活動分頁 + 有 API/DB
    const url = 'https://example.com/article';
    chrome.tabs.query.mockImplementationOnce((q, cb) => cb([{ id: 10, url, title: 'Article', active: true }]));
    chrome.storage.sync.get.mockImplementationOnce((keys, cb) => cb?.({ notionApiKey: 'k', notionDataSourceId: 'ds', notionDatabaseId: 'db' }));

    // 追蹤 func 呼叫次序：第1次 func（injectHighlighter），第2次 func（collectHighlights），第3次 func（injectWithResponse）
    let funcCall = 0;
    chrome.scripting.executeScript.mockImplementation((opts, cb) => {
      if (opts?.func) {
        funcCall += 1;
        if (funcCall === 2) {
          // collectHighlights → 回傳空陣列
          cb?.([{ result: [] }]);
          return;
        }
        if (funcCall === 3) {
          // injectWithResponse → 模擬函數執行錯誤
          chrome.runtime.lastError = { message: 'Function execution failed' };
          cb?.();
          return;
        }
        cb?.([{ result: undefined }]);
        return;
      }
      // files 注入
      cb?.();
    });

    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'savePage' }, {}, sendResponse);
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
    const url = 'https://example.com/article';
    chrome.tabs.query.mockImplementationOnce((q, cb) => cb([{ id: 11, url, title: 'Article', active: true }]));
    chrome.storage.sync.get.mockImplementationOnce((keys, cb) => cb?.({ notionApiKey: 'k', notionDataSourceId: 'ds', notionDatabaseId: 'db' }));

    // 模擬內容注入成功：collectHighlights 空、injectWithResponse 回傳內容
    let funcCall = 0;
    chrome.scripting.executeScript.mockImplementation((opts, cb) => {
      if (opts?.func) {
        funcCall += 1;
        if (funcCall === 2) {
          cb?.([{ result: [] }]); // collectHighlights
          return;
        }
        if (funcCall === 3) {
          cb?.([{ result: { title: 'T', blocks: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: 'c' } }] } }] } }]);
          return;
        }
        cb?.([{ result: undefined }]);
        return;
      }
      // files 注入
      cb?.();
    });

    // 模擬 Notion API 回覆 400 非 image 錯誤
    const originalFetch = global.fetch;
    global.fetch = jest.fn(() => Promise.resolve({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: 'Invalid request' }),
      text: () => Promise.resolve('Invalid request'),
    }));

    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'savePage' }, {}, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Invalid request' }));

    global.fetch = originalFetch;
  });

  test('savePage：Notion API image validation_error 觸發自動重試（排除圖片）→ 成功', async () => {
    jest.useFakeTimers();

    // 活動分頁 + 有 API/DB
    const url = 'https://example.com/article';
    chrome.tabs.query.mockImplementationOnce((q, cb) => cb([{ id: 12, url, title: 'Article', active: true }]));
    chrome.storage.sync.get.mockImplementationOnce((keys, cb) => cb?.({ notionApiKey: 'k', notionDataSourceId: 'ds', notionDatabaseId: 'db' }));

    // 注入：collectHighlights 空、injectWithResponse 回傳「含圖片」的內容
    let funcCall = 0;
    chrome.scripting.executeScript.mockImplementation((opts, cb) => {
      if (opts?.func) {
        funcCall += 1;
        if (funcCall === 2) {
          cb?.([{ result: [] }]); // collectHighlights
          return;
        }
        if (funcCall === 3) {
          cb?.([{ result: {
            title: 'T',
            blocks: [
              { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: 'p' } }] } },
              { object: 'block', type: 'image', image: { type: 'external', external: { url: 'https://cdn.example.com/img.jpg' } } }
            ]
          }}]);
          return;
        }
        cb?.([{ result: undefined }]);
        return;
      }
      cb?.();
    });

    // fetch：第1次返回 validation_error（含 image 字樣），第2次返回 ok:true
    const originalFetch = global.fetch;
    let fetchCall = 0;
    global.fetch = jest.fn(() => {
      fetchCall += 1;
      if (fetchCall === 1) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ code: 'validation_error', message: 'image url invalid' }),
          text: () => Promise.resolve('image url invalid'),
        });
      }
      // 第二次重試：成功
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'new-page-id', url: 'https://www.notion.so/new' }),
        text: () => Promise.resolve('ok'),
      });
    });

    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'savePage' }, {}, sendResponse);

    // 推進 500ms 的自動重試計時器
    jest.advanceTimersByTime(500);

    // 嘗試執行待處理計時器並讓出微任務，直到回傳
    for (let i = 0; i < 30 && sendResponse.mock.calls.length === 0; i++) {
      jest.runOnlyPendingTimers();
      // 讓出微任務
       
      await Promise.resolve();
    }
    const resp = sendResponse.mock.calls[0][0];
    expect(resp.success).toBe(true);
    // 可存在 warning（All images were skipped...），但不強制檢查文案

    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  test('updateNotionPage：validation_error（含 image）→ 返回友善錯誤訊息', async () => {
    // 活動分頁 + 有 API/DB
    const url = 'https://example.com/article';
    chrome.tabs.query.mockImplementationOnce((q, cb) => cb([{ id: 21, url, title: 'Article', active: true }]));
    chrome.storage.sync.get.mockImplementationOnce((keys, cb) => cb?.({ notionApiKey: 'k', notionDataSourceId: 'ds', notionDatabaseId: 'db' }));

    // 已保存頁面 → 走 updateNotionPage 分支
    const savedKey = `saved_${url}`;
    await new Promise((r) => chrome.storage.local.set({ [savedKey]: { notionPageId: 'page-xyz' } }, r));

    // 高亮收集為 0；injectWithResponse 回傳內容（無圖片亦可）
    let funcCall = 0;
    chrome.scripting.executeScript.mockImplementation((opts, cb) => {
      if (opts?.func) {
        funcCall += 1;
        if (funcCall === 2) { cb?.([{ result: [] }]); return; }
        if (funcCall === 3) {
          cb?.([{ result: { title: 'T', blocks: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: 'x' } }] } }] } }]);
          return;
        }
        cb?.([{ result: undefined }]);
        return;
      }
      cb?.();
    });

    const originalFetch = global.fetch;
    global.fetch = jest.fn((requestUrl, init) => {
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
      if (/\/v1\/blocks\/page-xyz\/children/u.test(requestUrl) && init?.method === 'GET') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ results: [] }),
          text: () => Promise.resolve('ok'),
        });
      }
      // 更新內容 → 返回 validation_error 且 message 含 image
      if (/\/v1\/blocks\/page-xyz\/children/u.test(requestUrl) && init?.method === 'PATCH') {
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
    chrome.runtime.onMessage._emit({ action: 'savePage' }, {}, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'Update Failed. Some images may have invalid URLs. Try updating again - problematic images will be filtered out.'
    }));

    global.fetch = originalFetch;
  });

  test('updateNotionPage：一般 4xx 錯誤 → 返回原始訊息', async () => {
    const url = 'https://example.com/article2';
    chrome.tabs.query.mockImplementationOnce((q, cb) => cb([{ id: 22, url, title: 'Article2', active: true }]));
    chrome.storage.sync.get.mockImplementationOnce((keys, cb) => cb?.({ notionApiKey: 'k', notionDataSourceId: 'ds', notionDatabaseId: 'db' }));

    const savedKey = `saved_${url}`;
    await new Promise((r) => chrome.storage.local.set({ [savedKey]: { notionPageId: 'page-abc' } }, r));

    let funcCall = 0;
    chrome.scripting.executeScript.mockImplementation((opts, cb) => {
      if (opts?.func) {
        funcCall += 1;
        if (funcCall === 2) { cb?.([{ result: [] }]); return; }
        if (funcCall === 3) {
          cb?.([{ result: { title: 'T2', blocks: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: 'y' } }] } }] } }]);
          return;
        }
        cb?.([{ result: undefined }]);
        return;
      }
      cb?.();
    });

    const originalFetch = global.fetch;
    global.fetch = jest.fn((requestUrl, init) => {
      if (/\/v1\/pages\//u.test(requestUrl) && (init?.method === 'GET' || !init)) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ archived: false }) });
      }
      if (/\/v1\/blocks\/page-abc\/children/u.test(requestUrl) && init?.method === 'GET') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ results: [] }) });
      }
      if (/\/v1\/blocks\/page-abc\/children/u.test(requestUrl) && init?.method === 'PATCH') {
        return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ message: 'Bad request' }), text: () => Promise.resolve('Bad request') });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });

    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'savePage' }, {}, sendResponse);
    await waitForSend(sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'Bad request' }));

    global.fetch = originalFetch;
  });

  // ===== updateNotionPage 錯誤訊息（validation_error with image） =====
  test('updateNotionPage：validation_error 含 image → 回傳友善錯誤訊息', async () => {
    // 場景：頁面已保存且存在，沒有高亮 → 走 updateNotionPage
    const url = 'https://example.com/article';
    const normUrl = url; // normalizeUrl 會保留此格式

    // 活動分頁
    chrome.tabs.query.mockImplementationOnce((q, cb) => cb([{ id: 21, url, title: 'Article', active: true }]));
    // 配置 API/DB
    chrome.storage.sync.get.mockImplementationOnce((keys, cb) => cb?.({ notionApiKey: 'k', notionDataSourceId: 'ds', notionDatabaseId: 'db' }));
    // 已保存頁面的 storage
    await new Promise((r) => chrome.storage.local.set({ [`saved_${normUrl}`]: { notionPageId: 'page-xyz' } }, r));

    // 注入：collectHighlights 空、injectWithResponse 回傳含圖片的內容
    let funcCall = 0;
    chrome.scripting.executeScript.mockImplementation((opts, cb) => {
      if (opts?.func) {
        funcCall += 1;
        if (funcCall === 2) { cb?.([{ result: [] }]); return; } // collectHighlights
        if (funcCall === 3) {
          cb?.([{ result: {
            title: 'T',
            blocks: [
              { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: 'p' } }] } },
              { object: 'block', type: 'image', image: { type: 'external', external: { url: 'https://cdn.example.com/img.jpg' } } }
            ]
          }}]);
          return;
        }
        cb?.([{ result: undefined }]);
        return;
      }
      cb?.();
    });

    // fetch：
    // 1) checkNotionPageExists → GET /v1/pages/:id ok:true json:{ archived:false }
    // 2) GET /v1/blocks/:id/children ok:true json:{ results: [] }
    // 3) PATCH /v1/blocks/:id/children ok:false json:{ code:'validation_error', message:'image invalid' }
    const originalFetch = global.fetch;
    global.fetch = jest.fn((requestUrl, init) => {
      if (/\/v1\/pages\//u.test(requestUrl) && init?.method === 'GET') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ archived: false }) });
      }
      if (/\/v1\/blocks\/.+\/children$/u.test(requestUrl) && init?.method === 'GET') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ results: [] }) });
      }
      if (/\/v1\/blocks\/.+\/children$/u.test(requestUrl) && init?.method === 'PATCH') {
        return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ code: 'validation_error', message: 'image invalid' }) });
      }
      // 預設：成功
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });

    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'savePage' }, {}, sendResponse);
    await waitForSend(sendResponse);
    const resp = sendResponse.mock.calls[0][0];
    expect(resp.success).toBe(false);
    expect(resp.error).toMatch(/Update Failed.*images.*filtered out/i);

    global.fetch = originalFetch;
  });

  test('updateNotionPage：PATCH 失敗無 message → 返回預設錯誤訊息', async () => {
    const url = 'https://example.com/article2';
    const normUrl = url;

    chrome.tabs.query.mockImplementationOnce((q, cb) => cb([{ id: 22, url, title: 'Article', active: true }]));
    chrome.storage.sync.get.mockImplementationOnce((keys, cb) => cb?.({ notionApiKey: 'k', notionDataSourceId: 'ds', notionDatabaseId: 'db' }));
    await new Promise((r) => chrome.storage.local.set({ [`saved_${normUrl}`]: { notionPageId: 'page-abc' } }, r));

    let funcCall = 0;
    chrome.scripting.executeScript.mockImplementation((opts, cb) => {
      if (opts?.func) {
        funcCall += 1;
        if (funcCall === 2) { cb?.([{ result: [] }]); return; }
        if (funcCall === 3) {
          cb?.([{ result: { title: 'T2', blocks: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: 'p2' } }] } }] } }]);
          return;
        }
        cb?.([{ result: undefined }]);
        return;
      }
      cb?.();
    });

    const originalFetch = global.fetch;
    global.fetch = jest.fn((requestUrl, init) => {
      if (/\/v1\/pages\//u.test(requestUrl) && init?.method === 'GET') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ archived: false }) });
      }
      if (/\/v1\/blocks\/.+\/children$/u.test(requestUrl) && init?.method === 'GET') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ results: [] }) });
      }
      if (/\/v1\/blocks\/.+\/children$/u.test(requestUrl) && init?.method === 'PATCH') {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });

    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'savePage' }, {}, sendResponse);
    await waitForSend(sendResponse);
    const resp = sendResponse.mock.calls[0][0];
    expect(resp.success).toBe(false);
    expect(resp.error).toBe('Failed to update Notion page.');

    global.fetch = originalFetch;
  });
});
