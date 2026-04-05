/**
 * @jest-environment jsdom
 */

describe('entryAutoInit', () => {
  const flushMicrotasks = async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  };

  let listeners;
  let mockSetupHighlighter;
  let mockLogger;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    listeners = [];
    mockSetupHighlighter = jest.fn();
    mockLogger = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      success: jest.fn(),
    };

    globalThis.__NOTION_STABLE_URL__ = undefined;
    delete globalThis.HighlighterV2;
    delete globalThis.notionHighlighter;

    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener: jest.fn(listener => {
            listeners.push(listener);
          }),
          removeListener: jest.fn(listener => {
            listeners = listeners.filter(item => item !== listener);
          }),
        },
        sendMessage: jest.fn().mockResolvedValue({ isSaved: false }),
      },
      storage: {
        sync: {
          get: jest.fn().mockResolvedValue({}),
        },
        onChanged: {
          addListener: jest.fn(),
        },
      },
    };

    jest.doMock('../../../scripts/highlighter/index.js', () => ({
      setupHighlighter: mockSetupHighlighter,
    }));
    jest.doMock('../../../scripts/highlighter/utils/color.js', () => ({
      VALID_STYLES: ['background', 'underline'],
    }));
    jest.doMock('../../../scripts/utils/Logger.js', () => mockLogger);
  });

  afterEach(() => {
    delete globalThis.chrome;
    delete globalThis.HighlighterV2;
    delete globalThis.notionHighlighter;
    delete globalThis.__NOTION_STABLE_URL__;
    jest.restoreAllMocks();
  });

  test('SET_STABLE_URL 晚到重試應直接串接 restore Promise 並保留錯誤處理', async () => {
    jest.isolateModules(() => {
      require('../../../scripts/highlighter/entryAutoInit.js');
    });

    const restore = jest.fn().mockRejectedValue(new Error('restore failed'));
    globalThis.HighlighterV2 = {
      manager: {
        getCount: jest.fn().mockReturnValue(0),
      },
      restoreManager: {
        restore,
      },
    };

    const promiseResolveSpy = jest.spyOn(Promise, 'resolve');
    const messageHandler = listeners.at(-1);

    messageHandler(
      { action: 'SET_STABLE_URL', stableUrl: 'https://example.com/posts/123/' },
      {},
      jest.fn()
    );

    await flushMicrotasks();

    expect(restore).toHaveBeenCalledTimes(1);
    expect(promiseResolveSpy).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[Highlighter] Late stable URL restore retry failed',
      expect.objectContaining({
        action: 'SET_STABLE_URL',
        error: 'restore failed',
      })
    );
  });
});
