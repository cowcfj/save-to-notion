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
    const module = require('../../../scripts/highlighter/index.js');
    initHighlighter = module.initHighlighter;
    initHighlighterWithToolbar = module.initHighlighterWithToolbar;
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

    test('應該註冊 chrome.runtime.onMessage 監聽器', async () => {
      await initHighlighter();

      expect(mockChrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });
  });

  describe('initHighlighterWithToolbar', () => {
    test('應該創建 HighlightManager 和 Toolbar', async () => {
      const result = await initHighlighterWithToolbar();

      expect(result.manager).toBeDefined();
      expect(result.toolbar).toBeDefined();
    });

    test('應該初始化 Manager', async () => {
      await initHighlighterWithToolbar();

      expect(mockManager.initialize).toHaveBeenCalled();
    });
  });

  describe('setupHighlighter', () => {
    test('應該設置 window.HighlighterV2', () => {
      // setupHighlighter 在模組載入時自動執行
      expect(globalThis.HighlighterV2).toBeDefined();
    });

    test('window.HighlighterV2 應該包含所有必要的屬性', () => {
      // 源代碼使用簡化的方法名稱
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
      expect(typeof globalThis.notionHighlighter.collectHighlights).toBe('function');
      expect(typeof globalThis.notionHighlighter.clearAll).toBe('function');
      expect(typeof globalThis.notionHighlighter.getCount).toBe('function');
    });
  });

  describe('全局函數別名', () => {
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
    beforeEach(async () => {
      // 確保 highlighter 已初始化
      await initHighlighterWithToolbar();
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
  });
});
