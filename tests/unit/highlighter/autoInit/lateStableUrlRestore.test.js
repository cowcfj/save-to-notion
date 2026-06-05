jest.mock('../../../../scripts/utils/Logger.js', () => ({
  default: {
    warn: jest.fn(),
  },
  __esModule: true,
}));

const Logger = require('../../../../scripts/utils/Logger.js').default;
const {
  createLateStableUrlRestoreController,
} = require('../../../../scripts/highlighter/autoInit/lateStableUrlRestore.js');

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('autoInit/lateStableUrlRestore', () => {
  let globalScope;

  beforeEach(() => {
    jest.clearAllMocks();
    globalScope = {};
  });

  test('SET_STABLE_URL 應更新全域 stable URL 並在 skip restore 時不重試', () => {
    const restore = jest.fn();
    const sendResponse = jest.fn();
    globalScope.HighlighterV2 = {
      manager: { getCount: jest.fn().mockReturnValue(0) },
      restoreManager: { restore },
    };
    const controller = createLateStableUrlRestoreController({ globalScope });

    controller.markSkipLateRestore(true);
    const result = controller.handleSetStableUrl(
      { stableUrl: 'https://example.com/stable' },
      sendResponse
    );

    expect(result).toBe(true);
    expect(globalScope.__NOTION_STABLE_URL__).toBe('https://example.com/stable');
    expect(restore).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  test('SET_STABLE_URL 應在尚無 highlights 時只重試 restore 一次', async () => {
    const restore = jest.fn().mockResolvedValue(undefined);
    const sendResponse = jest.fn();
    globalScope.HighlighterV2 = {
      manager: { getCount: jest.fn().mockReturnValue(0) },
      restoreManager: { restore },
    };
    const controller = createLateStableUrlRestoreController({ globalScope });

    controller.handleSetStableUrl({ stableUrl: 'https://example.com/first' }, sendResponse);
    await flushPromises();
    controller.handleSetStableUrl({ stableUrl: 'https://example.com/second' }, sendResponse);

    expect(restore).toHaveBeenCalledTimes(1);
    expect(globalScope.__NOTION_STABLE_URL__).toBe('https://example.com/second');
    expect(sendResponse).toHaveBeenLastCalledWith({ success: true });
  });

  test('SET_STABLE_URL restore 失敗時應回傳錯誤並記錄 warning', async () => {
    const restoreError = new Error('restore failed');
    const sendResponse = jest.fn();
    globalScope.HighlighterV2 = {
      manager: { getCount: jest.fn().mockReturnValue(0) },
      restoreManager: {
        restore: jest.fn().mockRejectedValue(restoreError),
      },
    };
    const controller = createLateStableUrlRestoreController({ globalScope });

    controller.handleSetStableUrl({ stableUrl: 'https://example.com/stable' }, sendResponse);
    await flushPromises();

    expect(Logger.warn).toHaveBeenCalledWith(
      '[Highlighter] 延後收到穩定 URL，重試恢復標註失敗',
      expect.objectContaining({
        action: 'SET_STABLE_URL',
        error: restoreError,
      })
    );
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: String(restoreError),
    });
  });
});
