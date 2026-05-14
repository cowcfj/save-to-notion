/**
 * @jest-environment jsdom
 */

/**
 * Highlighter Index (scripts/highlighter/index.js) 單元測試
 *
 * 測試 Highlighter 入口點的各種功能：
 * - initHighlighter / initHighlighterWithToolbar
 * - setupHighlighter
 * - 全局 API 設置
 * - Chrome runtime message 監聽
 */

// Mock Logger
const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};
globalThis.Logger = mockLogger;

// Mock Chrome API
const mockChrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    sendMessage: jest.fn((_msg, callback) => {
      if (callback) {
        callback({});
      }
    }),
    lastError: null,
  },
};
globalThis.chrome = mockChrome;

// Mock HighlightManager
const mockManager = {
  initialize: jest.fn().mockResolvedValue(),
  setDependencies: jest.fn(), // 添加依賴注入方法
  enable: jest.fn(),
  disable: jest.fn(),
  toggle: jest.fn(),
  colorChange: jest.fn(),
  collect: jest.fn().mockReturnValue([]),
  collectHighlightsForNotion: jest.fn().mockReturnValue([]),
  clearAll: jest.fn(),
  getCount: jest.fn().mockReturnValue(5),
  exportHighlights: jest.fn().mockReturnValue([]),
  importHighlights: jest.fn(),
  isEnabled: false,
  initializationComplete: Promise.resolve(),
};

// Mock Toolbar
const mockToolbar = {
  initialize: jest.fn(),
  show: jest.fn(),
  hide: jest.fn(),
  toggle: jest.fn(),
  minimize: jest.fn(),
  updateHighlightCount: jest.fn(),
  stateManager: {
    currentState: 'hidden',
  },
  isVisible: false,
};

// Mock modules
jest.mock('../../../scripts/highlighter/core/HighlightManager.js', () => ({
  HighlightManager: jest.fn(() => mockManager),
}));

jest.mock('../../../scripts/highlighter/ui/Toolbar.js', () => ({
  Toolbar: jest.fn(() => mockToolbar),
}));

describe('Highlighter Index', () => {
  let initHighlighter = null;
  let initHighlighterWithToolbar = null;
  let highlighterModule = null;

  beforeEach(() => {
    jest.clearAllMocks();

    // 清除全局 HighlighterV2
    delete globalThis.HighlighterV2;
    delete globalThis.notionHighlighter;
    delete globalThis.initHighlighter;
    delete globalThis.collectHighlights;
    delete globalThis.clearPageHighlights;

    // 重新載入模組
    jest.resetModules();

    // 重新設置 mock
    globalThis.Logger = mockLogger;
    globalThis.chrome = mockChrome;

    // 載入模組
    highlighterModule = require('../../../scripts/highlighter/index.js');
    initHighlighter = highlighterModule.initHighlighter;
    initHighlighterWithToolbar = highlighterModule.initHighlighterWithToolbar;
  });

  afterEach(() => {
    delete globalThis.HighlighterV2;
    delete globalThis.notionHighlighter;
    delete globalThis.initHighlighter;
    delete globalThis.collectHighlights;
    delete globalThis.clearPageHighlights;
  });

  describe('initHighlighter', () => {
    test('應該創建 HighlightManager 並初始化', async () => {
      const manager = await initHighlighter();

      expect(manager).toBeDefined();
      expect(mockManager.initialize).toHaveBeenCalled();
    });

    test('應該註冊 chrome.runtime.onMessage 監聽器並忽略未知 action', async () => {
      let messageHandler;
      mockChrome.runtime.onMessage.addListener = jest.fn(handler => {
        messageHandler = handler;
      });

      await initHighlighter();
      expect(mockChrome.runtime.onMessage.addListener).toHaveBeenCalled();

      // 不處理其他 action
      const isHandled = messageHandler({ action: 'someOtherAction' }, {}, jest.fn());
      expect(isHandled).toBe(false);
    });
  });

  describe('Production-path toggle handler', () => {
    let messageHandler;

    const flushMicrotasks = async () => {
      for (let index = 0; index < 10; index += 1) {
        await Promise.resolve();
      }
    };

    beforeEach(async () => {
      // 模擬 production bundle：production-path 觀測訊號才會觸發
      globalThis.__UNIT_TESTING__ = false;

      mockChrome.runtime.onMessage.addListener = jest.fn(handler => {
        messageHandler = handler;
      });

      await initHighlighter();
    });

    afterEach(() => {
      delete globalThis.__UNIT_TESTING__;
      delete globalThis.__NOTION_RAIL_READY__;
    });

    test('Case A: __NOTION_RAIL_READY__ 不存在時回 FLOATING_RAIL_NOT_INITIALIZED', async () => {
      delete globalThis.HighlighterV2;
      delete globalThis.notionHighlighter;
      delete globalThis.__NOTION_RAIL_READY__;

      const sendResponse = jest.fn();
      const isHandled = messageHandler({ action: 'toggleHighlighter' }, {}, sendResponse);

      expect(isHandled).toBe(true);
      await flushMicrotasks();

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '浮動側欄尚未初始化',
      });
    });

    test('Case B: __NOTION_RAIL_READY__ resolve 失敗時回 typed error 並不呼叫 toggle', async () => {
      globalThis.HighlighterV2 = {};
      globalThis.notionHighlighter = {
        toggle: jest.fn(),
        isActive: jest.fn().mockReturnValue(false),
      };
      globalThis.__NOTION_RAIL_READY__ = Promise.resolve({
        success: false,
        error: '浮動側欄初始化已略過',
      });

      const sendResponse = jest.fn();
      const isHandled = messageHandler({ action: 'toggleHighlighter' }, {}, sendResponse);

      expect(isHandled).toBe(true);
      await flushMicrotasks();

      expect(globalThis.notionHighlighter.toggle).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '浮動側欄初始化已略過',
      });
    });

    test('Case B 補強: ready Promise resolve {success:false} 但無 error 字面值時退回 FLOATING_RAIL_INIT_FAILED', async () => {
      globalThis.HighlighterV2 = {};
      globalThis.notionHighlighter = {
        toggle: jest.fn(),
        isActive: jest.fn().mockReturnValue(false),
      };
      globalThis.__NOTION_RAIL_READY__ = Promise.resolve({ success: false });

      const sendResponse = jest.fn();
      messageHandler({ action: 'toggleHighlighter' }, {}, sendResponse);
      await flushMicrotasks();

      expect(globalThis.notionHighlighter.toggle).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '浮動側欄初始化失敗',
      });
    });

    test('Case C: __NOTION_RAIL_READY__ reject 時回 FLOATING_RAIL_INIT_FAILED', async () => {
      globalThis.HighlighterV2 = {};
      globalThis.notionHighlighter = {
        toggle: jest.fn(),
        isActive: jest.fn().mockReturnValue(false),
      };
      const rejectedReady = Promise.reject(new Error('boom'));
      // 在 microtask boundary 之前掛 noop catch，避免被 Node 視為 unhandled rejection
      rejectedReady.catch(() => {});
      globalThis.__NOTION_RAIL_READY__ = rejectedReady;

      const sendResponse = jest.fn();
      const isHandled = messageHandler({ action: 'toggleHighlighter' }, {}, sendResponse);

      expect(isHandled).toBe(true);
      await flushMicrotasks();

      expect(globalThis.notionHighlighter.toggle).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '浮動側欄初始化失敗',
      });
    });

    test('Case D: rail 立即可用時不等待 ready Promise，執行 toggle 並回 success', async () => {
      // rail 立即可用 → 不應 await __NOTION_RAIL_READY__
      const railNeverResolves = new Promise(() => {});
      globalThis.__NOTION_RAIL_READY__ = railNeverResolves;
      globalThis.HighlighterV2 = {
        rail: { stateManager: { currentState: 'visible' } },
      };
      globalThis.notionHighlighter = {
        toggle: jest.fn(),
        isActive: jest.fn().mockReturnValue(true),
      };

      const sendResponse = jest.fn();
      const isHandled = messageHandler({ action: 'toggleHighlighter' }, {}, sendResponse);

      expect(isHandled).toBe(true);
      await flushMicrotasks();

      expect(globalThis.notionHighlighter.toggle).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ success: true, isActive: true });
    });

    test('Case D 補強: toolbar 立即可用 + ready Promise resolve success → 執行 toggle 並回 success', async () => {
      globalThis.HighlighterV2 = { toolbar: {} };
      globalThis.notionHighlighter = {
        toggle: jest.fn(),
        isActive: jest.fn().mockReturnValue(false),
      };

      const sendResponse = jest.fn();
      messageHandler({ action: 'toggleHighlighter' }, {}, sendResponse);
      await flushMicrotasks();

      expect(globalThis.notionHighlighter.toggle).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ success: true, isActive: false });
    });

    test('Case E: rail 立即可用但 toggle() 拋異常時仍回 FLOATING_RAIL_ACTION_FAILED', async () => {
      globalThis.HighlighterV2 = {
        rail: { stateManager: { currentState: 'visible' } },
      };
      globalThis.notionHighlighter = {
        toggle: jest.fn(() => {
          throw new Error('unexpected toggle failure');
        }),
        isActive: jest.fn().mockReturnValue(false),
      };

      const sendResponse = jest.fn();
      const isHandled = messageHandler({ action: 'toggleHighlighter' }, {}, sendResponse);

      expect(isHandled).toBe(true);
      await flushMicrotasks();

      expect(sendResponse).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: '浮動側欄操作失敗',
      });
    });
  });

  describe('initHighlighterWithToolbar', () => {
    test('Phase 1 應保留 toolbar 欄位但固定回傳 null', async () => {
      const { Toolbar } = require('../../../scripts/highlighter/ui/Toolbar.js');

      const result = await initHighlighterWithToolbar();

      expect(result.manager).toBeDefined();
      expect(result.toolbar).toBeNull();
      expect(Toolbar).not.toHaveBeenCalled();
    });

    test('應該初始化 Manager', async () => {
      await initHighlighterWithToolbar();

      expect(mockManager.initialize).toHaveBeenCalled();
    });

    test('不應從 highlighter entry re-export Toolbar', () => {
      expect(highlighterModule.Toolbar).toBeUndefined();
    });
  });

  describe('setupHighlighter', () => {
    beforeEach(() => {
      highlighterModule.setupHighlighter();
    });

    test('應該設置 window.HighlighterV2', () => {
      expect(globalThis.HighlighterV2).toBeDefined();
    });

    test('window.HighlighterV2 應該包含所有必要的屬性', () => {
      expect(typeof globalThis.HighlighterV2.init).toBe('function');
      expect(typeof globalThis.HighlighterV2.initWithToolbar).toBe('function');
      expect(typeof globalThis.HighlighterV2.getInstance).toBe('function');
      expect(typeof globalThis.HighlighterV2.getToolbar).toBe('function');
    });

    test('應該設置 window.notionHighlighter 兼容層', () => {
      expect(globalThis.notionHighlighter).toBeDefined();
    });

    test('notionHighlighter 應該包含兼容方法', () => {
      expect(typeof globalThis.notionHighlighter.show).toBe('function');
      expect(typeof globalThis.notionHighlighter.hide).toBe('function');
      expect(typeof globalThis.notionHighlighter.toggle).toBe('function');
      expect(typeof globalThis.notionHighlighter.isActive).toBe('function');
      expect(typeof globalThis.notionHighlighter.collectHighlights).toBe('function');
      expect(typeof globalThis.notionHighlighter.clearAll).toBe('function');
      expect(typeof globalThis.notionHighlighter.getCount).toBe('function');
    });

    test('HighlighterV2.getToolbar 應該在延遲建立 Toolbar 後返回最新實例', () => {
      delete globalThis.HighlighterV2;
      delete globalThis.notionHighlighter;
      delete globalThis.initHighlighter;
      delete globalThis.collectHighlights;
      delete globalThis.clearPageHighlights;

      highlighterModule.setupHighlighter({ skipToolbar: true });

      expect(globalThis.HighlighterV2.getToolbar()).toBeNull();
      expect(globalThis.HighlighterV2.toolbar).toBeNull();

      const toolbar = globalThis.notionHighlighter.createAndShowToolbar();

      expect(toolbar).toBe(mockToolbar);
      expect(globalThis.HighlighterV2.getToolbar()).toBe(mockToolbar);
      expect(globalThis.HighlighterV2.toolbar).toBe(mockToolbar);
    });
  });

  describe('全局函數別名', () => {
    beforeEach(() => {
      highlighterModule.setupHighlighter();
    });

    test('window.initHighlighter 應該可用', () => {
      expect(typeof globalThis.initHighlighter).toBe('function');
    });

    test('window.collectHighlights 應該可用', () => {
      expect(typeof globalThis.collectHighlights).toBe('function');
    });

    test('window.clearPageHighlights 應該可用', () => {
      expect(typeof globalThis.clearPageHighlights).toBe('function');
    });
  });

  describe('notionHighlighter 兼容層方法', () => {
    beforeEach(() => {
      // 手動調用 setupHighlighter 以確保 notionHighlighter 被初始化
      highlighterModule.setupHighlighter();
    });

    test('show() 應該調用 toolbar.show()', async () => {
      await globalThis.notionHighlighter.show();
      expect(mockToolbar.show).toHaveBeenCalled();
    });

    test('hide() 應該調用 toolbar.hide()', async () => {
      // 先調用 show() 確保 toolbar 已創建（currentToolbar 不為 null）
      await globalThis.notionHighlighter.show();
      jest.clearAllMocks(); // 清除 show 的調用記錄
      await globalThis.notionHighlighter.hide();
      expect(mockToolbar.hide).toHaveBeenCalled();
    });

    test('toggle() 在 hidden 狀態時應該調用 toolbar.show()', async () => {
      // stateManager.currentState 預設為 'hidden'
      await globalThis.notionHighlighter.toggle();
      // 當 state === 'hidden' 時，應該調用 show()
      expect(mockToolbar.show).toHaveBeenCalled();
    });

    test('collectHighlights() 應該調用 manager.collectHighlightsForNotion()', async () => {
      const result = await globalThis.notionHighlighter.collectHighlights();
      expect(mockManager.collectHighlightsForNotion).toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    test('clearAll() 應該調用 manager.clearAll()', async () => {
      await globalThis.notionHighlighter.clearAll();
      expect(mockManager.clearAll).toHaveBeenCalled();
    });

    test('getCount() 應該調用 manager.getCount()', async () => {
      const count = await globalThis.notionHighlighter.getCount();
      expect(mockManager.getCount).toHaveBeenCalled();
      expect(count).toBe(5);
    });

    test('isActive() 應該根據 toolbar state 回傳布林值', () => {
      globalThis.notionHighlighter.createAndShowToolbar();

      mockToolbar.stateManager.currentState = 'hidden';
      expect(globalThis.notionHighlighter.isActive()).toBe(false);

      mockToolbar.stateManager.currentState = 'expanded';
      expect(globalThis.notionHighlighter.isActive()).toBe(true);
    });
  });
  describe('setupHighlighter Edge Cases', () => {
    // 無 browser 環境會拋出錯誤的測試被移除，因為 JSDOM 中 globalThis.window 無法被重新定義 (non-configurable)

    test('能正常初始化並傳遞正確參數，包含掛載別名函數', () => {
      // Create a local mock for windowAPI just for this function
      jest.isolateModules(() => {
        jest.mock('../../../scripts/highlighter/windowAPI.js', () => ({
          mountWindowAPI: jest.fn(),
        }));
        const indexMock = require('../../../scripts/highlighter/index.js');
        const windowAPIMock = require('../../../scripts/highlighter/windowAPI.js');

        const { setupHighlighter } = indexMock;
        setupHighlighter({ skipRestore: true });

        expect(windowAPIMock.mountWindowAPI).toHaveBeenCalled();

        const mountCallArgs = windowAPIMock.mountWindowAPI.mock.calls[0];
        const funcs = mountCallArgs[3];

        funcs.init();
        expect(windowAPIMock.mountWindowAPI).toHaveBeenCalledTimes(2);
        expect(mockChrome.runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
        funcs.initWithToolbar();
        expect(windowAPIMock.mountWindowAPI).toHaveBeenCalledTimes(3);
        expect(mockChrome.runtime.onMessage.removeListener).toHaveBeenCalledTimes(2);
      });
    });
  });
  // SET_STABLE_URL 晚到重試的測試已移至 tests/unit/highlighter/entryAutoInit.test.js
  // 因為此監聽器邏輯已從 index.js 搬移到 entryAutoInit.js
});
