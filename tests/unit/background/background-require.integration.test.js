/**
 * Background.js require-style 整合測試
 *
 * 目標：
 * - 真正 require `scripts/background.js` 以納入覆蓋率（非僅測試 testable 包裝）
 * - 透過事件發射器模擬 onInstalled/onMessage，覆蓋初始化與訊息處理路徑
 */

/* eslint-disable no-undef */

// 簡單事件工具：保存 listener 並允許 _emit 觸發
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
      try { fn(...args); } catch (e) { /* 忽略 listener 內部錯誤以避免中斷測試 */ }
    }),
    _listeners: listeners
  };
}

describe('scripts/background.js require integration', () => {
  let originalChrome = null;
  let originalFetch = null;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();

    // 保存原始全域
    originalChrome = global.chrome;
    originalFetch = global.fetch;

    // 建立可觸發的 Chrome 模擬
    const onInstalled = createEvent();
    const onMessage = createEvent();
    const onUpdated = createEvent();
    const onRemoved = createEvent();

    const storageData = {};

    global.chrome = {
      runtime: {
        id: 'test-id',
        lastError: null,
        getManifest: jest.fn(() => ({ version: '2.9.5' })),
        onInstalled,
        onMessage,
        getURL: jest.fn((p) => `chrome-extension://test/${p}`)
      },
      tabs: {
        onUpdated,
        onRemoved,
        query: jest.fn((queryInfo, cb) => {
          cb?.([{ id: 1, url: 'https://example.com/article', title: 'Article', active: true }]);
        }),
        create: jest.fn((createProps) => Promise.resolve({ id: 99, ...createProps })),
        sendMessage: jest.fn(() => Promise.resolve({ success: true }))
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
          remove: jest.fn((keys, cb) => {
            (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete storageData[k]);
            cb?.();
          })
        },
        sync: {
          get: jest.fn((keys, cb) => {
            const res = {};
            // 預設提供 API Key 以走到正向流程
            if (Array.isArray(keys)) {
              keys.forEach((k) => { if (k === 'notionApiKey') res[k] = 'test-key'; });
            } else if (typeof keys === 'string' && keys === 'notionApiKey') {
              res[keys] = 'test-key';
            }
            cb?.(res);
          })
        }
      }
    };

    // 全域 fetch mock（避免網路）
    global.fetch = jest.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ archived: false, results: [] }),
      text: async () => 'ok'
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
    // 還原全域
    global.chrome = originalChrome;
    global.fetch = originalFetch;
  });

  test('onInstalled(update) 會顯示更新通知並傳送版本訊息', async () => {
    // 載入背景腳本（會註冊事件 listener）
    jest.isolateModules(() => {
      require('../../../scripts/background.js');
    });

    // 觸發安裝事件（更新場景）
    // 使用次版本升級（2.8.x -> 2.9.5）以命中顯示更新通知的條件
    chrome.runtime.onInstalled._emit({ reason: 'update', previousVersion: '2.8.5' });

    // 應開啟更新通知頁
    await Promise.resolve(); // 等待微任務
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: expect.stringContaining('update-notification/update-notification.html'),
      active: true
    });

    // setTimeout 傳送版本訊息
    jest.advanceTimersByTime(1000);
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ type: 'UPDATE_INFO', previousVersion: '2.8.5', currentVersion: '2.9.5' })
    );
  });

  test('onMessage(openNotionPage) 會開新分頁並回傳成功', async () => {
    jest.isolateModules(() => {
      require('../../../scripts/background.js');
    });

    const sendResponse = jest.fn();
    chrome.runtime.onMessage._emit({ action: 'openNotionPage', url: 'https://www.notion.so/test' }, {}, sendResponse);

    await Promise.resolve();
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://www.notion.so/test' }, expect.any(Function));
    // 模擬 tabs.create callback（background.js 使用 callback 風格）
    const createCall = chrome.tabs.create.mock.calls[0];
    const createdTab = await createCall[0];
    // 直接觸發 callback
    createCall[1]?.(createdTab);

    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  // 備註：checkPageStatus 路徑較重，已由其他單元測試覆蓋。
  // 這裡側重於初始化（onInstalled）與開頁動作（openNotionPage）的真實路徑，以增進 scripts 覆蓋率。
});
