/**
 * @jest-environment jsdom
 */

/**
 * Highlighter Index (scripts/highlighter/index.js) 單元測試
 *
 * 測試 Highlighter 入口點的各種功能：
 * - initHighlighter
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
  setDependencies: jest.fn(),
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

// Mock HighlightStorage
const mockStorage = {
  restore: jest.fn(),
};

const registerHighlighterMocks = () => {
  const managerModuleMock = {
    HighlightManager: jest.fn(() => mockManager),
  };
  const storageModuleMock = {
    HighlightStorage: jest.fn(() => mockStorage),
    RestoreManager: jest.fn(() => mockStorage),
  };
  const styleManagerModuleMock = {
    StyleManager: jest.fn(() => ({})),
  };
  const interactionModuleMock = {
    HighlightInteraction: jest.fn(() => ({})),
  };
  const migrationModuleMock = {
    HighlightMigration: jest.fn(() => ({})),
  };
  const toastModuleMock = {
    Toast: jest.fn(() => ({})),
  };
  const urlUtilsModuleMock = {
    normalizeUrl: jest.fn(url => url),
  };

  jest.unstable_mockModule(
    '../../../scripts/highlighter/core/HighlightManager.js',
    () => managerModuleMock
  );
  jest.unstable_mockModule(
    '../../../scripts/highlighter/core/HighlightStorage.js',
    () => storageModuleMock
  );
  jest.unstable_mockModule(
    '../../../scripts/highlighter/core/StyleManager.js',
    () => styleManagerModuleMock
  );
  jest.unstable_mockModule(
    '../../../scripts/highlighter/core/HighlightInteraction.js',
    () => interactionModuleMock
  );
  jest.unstable_mockModule(
    '../../../scripts/highlighter/core/HighlightMigration.js',
    () => migrationModuleMock
  );
  jest.unstable_mockModule('../../../scripts/highlighter/ui/Toast.js', () => toastModuleMock);
  jest.unstable_mockModule('../../../scripts/utils/urlUtils.js', () => urlUtilsModuleMock);
  jest.doMock('../../../scripts/highlighter/core/HighlightManager.js', () => managerModuleMock);
  jest.doMock('../../../scripts/highlighter/core/HighlightStorage.js', () => storageModuleMock);
  jest.doMock('../../../scripts/highlighter/core/StyleManager.js', () => styleManagerModuleMock);
  jest.doMock(
    '../../../scripts/highlighter/core/HighlightInteraction.js',
    () => interactionModuleMock
  );
  jest.doMock('../../../scripts/highlighter/core/HighlightMigration.js', () => migrationModuleMock);
  jest.doMock('../../../scripts/highlighter/ui/Toast.js', () => toastModuleMock);
  jest.doMock('../../../scripts/utils/urlUtils.js', () => urlUtilsModuleMock);
};

const registerWindowAPIMock = mountWindowAPI => {
  const windowAPIModuleMock = {
    mountWindowAPI,
  };

  jest.unstable_mockModule('../../../scripts/highlighter/windowAPI.js', () => windowAPIModuleMock);
  jest.doMock('../../../scripts/highlighter/windowAPI.js', () => windowAPIModuleMock);
};

describe('Highlighter Index', () => {
  let initHighlighter = null;
  let highlighterModule = null;

  beforeEach(async () => {
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
    registerHighlighterMocks();

    // 載入模組
    highlighterModule = await import('../../../scripts/highlighter/index.js');
    initHighlighter = highlighterModule.initHighlighter;
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
      expect(typeof globalThis.HighlighterV2.getInstance).toBe('function');
      expect(globalThis.HighlighterV2.getToolbar).toBeUndefined();
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

  describe('setupHighlighter Edge Cases', () => {
    test('能正常初始化並傳遞正確參數，包含掛載別名函數', async () => {
      await jest.isolateModulesAsync(async () => {
        const mountWindowAPI = jest.fn();
        registerHighlighterMocks();
        registerWindowAPIMock(mountWindowAPI);
        const indexMock = await import('../../../scripts/highlighter/index.js');

        const { setupHighlighter } = indexMock;
        setupHighlighter({ skipRestore: true });

        expect(mountWindowAPI).toHaveBeenCalled();

        const mountOptions = mountWindowAPI.mock.calls[0][0];
        const funcs = mountOptions.fns;

        funcs.init();
        expect(mountWindowAPI).toHaveBeenCalledTimes(2);
      });
    });
  });
});
