/**
 * @jest-environment jsdom
 */

/**
 * Highlighter Index 覆蓋率補強測試
 *
 * 針對未覆蓋的分支和邊界情況
 */

// Mock Logger
const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};
global.Logger = mockLogger;

// Mock HighlightManager
const mockManager = {
  initialize: jest.fn().mockResolvedValue(),
  enable: jest.fn(),
  disable: jest.fn(),
  toggle: jest.fn(),
  collectHighlightsForNotion: jest.fn().mockReturnValue([]),
  clearAll: jest.fn(),
  getCount: jest.fn().mockReturnValue(3),
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
};

// Mock modules
jest.mock('../../../scripts/highlighter/core/HighlightManager.js', () => ({
  HighlightManager: jest.fn(() => mockManager),
}));

jest.mock('../../../scripts/highlighter/ui/Toolbar.js', () => ({
  Toolbar: jest.fn(() => mockToolbar),
}));

describe('Highlighter Index 覆蓋率補強', () => {
  // 輔助函數：載入模組並等待異步初始化完成
  const loadModuleAndWait = async () => {
    require('../../../scripts/highlighter/index.js');
    // 等待兩個 microtask tick 確保異步初始化完成
    await Promise.resolve();
    await Promise.resolve();
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // 清除全局變數
    delete window.HighlighterV2;
    delete window.notionHighlighter;
    delete window.initHighlighter;
    delete window.collectHighlights;
    delete window.clearPageHighlights;

    // 重新模擬 chrome API
    global.chrome = {
      runtime: {
        onMessage: {
          addListener: jest.fn(_listener => {
            // 不需要儲存 listener
          }),
        },
        sendMessage: jest.fn((_msg, callback) => {
          if (callback) {
            const response = {};
            callback(response);
          }
        }),
        lastError: null,
      },
    };

    // 重新設置 mock
    global.Logger = mockLogger;

    jest.resetModules();
  });

  afterEach(() => {
    delete window.HighlighterV2;
    delete window.notionHighlighter;
    delete window.initHighlighter;
    delete window.collectHighlights;
    delete window.clearPageHighlights;
  });

  describe('chrome.runtime.onMessage 處理', () => {
    test('應該在 initHighlighter 中設置消息監聽器', () => {
      // 驗證 addListener 被調用（在模組載入過程中）
      // 由於模組自動初始化，addListener 應該已經被調用
      require('../../../scripts/highlighter/index.js');

      // 重新調用 initHighlighter
      jest.resetModules();

      // 重新設置 chrome mock
      const mockAddListener = jest.fn();
      global.chrome = {
        runtime: {
          onMessage: {
            addListener: mockAddListener,
          },
          sendMessage: jest.fn(),
        },
      };

      jest.isolateModules(() => {
        const { initHighlighter: init } = require('../../../scripts/highlighter/index.js');
        init();
      });

      expect(mockAddListener).toHaveBeenCalled();
    });
  });

  describe('notionHighlighter.toggle 分支覆蓋', () => {
    test('toggle 在非 hidden 狀態時應該調用 hide()', async () => {
      await loadModuleAndWait();

      // 設置狀態為非 hidden
      mockToolbar.stateManager.currentState = 'expanded';

      window.notionHighlighter.toggle();

      expect(mockToolbar.hide).toHaveBeenCalled();
      expect(mockToolbar.show).not.toHaveBeenCalled();
    });

    test('toggle 在 hidden 狀態時應該調用 show()', async () => {
      await loadModuleAndWait();

      // 設置狀態為 hidden
      mockToolbar.stateManager.currentState = 'hidden';

      window.notionHighlighter.toggle();

      expect(mockToolbar.show).toHaveBeenCalled();
    });
  });

  describe('全局函數別名實際調用', () => {
    test('window.initHighlighter 應該調用 show() 並返回 notionHighlighter', async () => {
      await loadModuleAndWait();

      const result = window.initHighlighter();

      expect(mockToolbar.show).toHaveBeenCalled();
      expect(result).toBe(window.notionHighlighter);
    });

    test('window.collectHighlights 應該調用 collectHighlightsForNotion()', async () => {
      await loadModuleAndWait();

      const result = window.collectHighlights();

      expect(mockManager.collectHighlightsForNotion).toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    test('window.clearPageHighlights 應該調用 clearAll()', async () => {
      await loadModuleAndWait();

      window.clearPageHighlights();

      expect(mockManager.clearAll).toHaveBeenCalled();
    });

    test('window.collectHighlights 在 notionHighlighter 不存在時返回空數組', async () => {
      await loadModuleAndWait();

      // 暫時移除 notionHighlighter
      const original = window.notionHighlighter;
      delete window.notionHighlighter;

      const result = window.collectHighlights();

      expect(result).toEqual([]);

      // 恢復
      window.notionHighlighter = original;
    });

    test('window.clearPageHighlights 在 notionHighlighter 不存在時安全返回', async () => {
      await loadModuleAndWait();

      const original = window.notionHighlighter;
      delete window.notionHighlighter;

      expect(() => window.clearPageHighlights()).not.toThrow();

      window.notionHighlighter = original;
    });

    test('window.initHighlighter 在 notionHighlighter 不存在時返回 undefined', async () => {
      await loadModuleAndWait();

      const original = window.notionHighlighter;
      delete window.notionHighlighter;

      const result = window.initHighlighter();

      expect(result).toBeUndefined();

      window.notionHighlighter = original;
    });
  });

  describe('HighlighterV2 API', () => {
    test('getInstance 應該返回 manager', async () => {
      await loadModuleAndWait();

      const instance = window.HighlighterV2.getInstance();

      expect(instance).toBeDefined();
    });

    test('getToolbar 應該返回 toolbar', async () => {
      await loadModuleAndWait();

      const toolbar = window.HighlighterV2.getToolbar();

      expect(toolbar).toBeDefined();
    });
  });

  describe('notionHighlighter.minimize', () => {
    test('minimize 應該調用 toolbar.minimize()', async () => {
      await loadModuleAndWait();
      // 先調用 show 確保 toolbar 已創建
      window.notionHighlighter.show();
      jest.clearAllMocks();

      window.notionHighlighter.minimize();

      expect(mockToolbar.minimize).toHaveBeenCalled();
    });
  });
});
