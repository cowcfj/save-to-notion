/**
 * @jest-environment jsdom
 */

/**
 * 測試 initHighlighter 的 skipRestore 參數傳遞
 *
 * 驗證 options.skipRestore 是否正確傳遞給 HighlightManager.initialize()
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

// Mock HighlightManager with initialize spy
const mockInitialize = jest.fn().mockResolvedValue();
const mockManager = {
  initialize: mockInitialize,
  setDependencies: jest.fn(),
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

describe('initHighlighter skipRestore 參數傳遞', () => {
  let initHighlighter;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    // 重新設置 mock
    globalThis.Logger = mockLogger;
    globalThis.chrome = mockChrome;
    registerHighlighterMocks();

    // 載入模組
    const highlighterModule = await import('../../../scripts/highlighter/index.js');
    initHighlighter = highlighterModule.initHighlighter;
  });

  test('當 skipRestore=true 時，應傳遞 true 給 manager.initialize()', async () => {
    await initHighlighter({ skipRestore: true });

    expect(mockInitialize).toHaveBeenCalledWith(true);
  });

  test('當 skipRestore=false 時，應傳遞 false 給 manager.initialize()', async () => {
    await initHighlighter({ skipRestore: false });

    expect(mockInitialize).toHaveBeenCalledWith(false);
  });

  test('當未提供 skipRestore 時，應傳遞 undefined 給 manager.initialize()（依賴預設值）', async () => {
    await initHighlighter({});

    expect(mockInitialize).toHaveBeenCalledWith(undefined);
  });

  test('當未提供 options 時，應傳遞 undefined 給 manager.initialize()（依賴預設值）', async () => {
    await initHighlighter();

    expect(mockInitialize).toHaveBeenCalledWith(undefined);
  });
});
