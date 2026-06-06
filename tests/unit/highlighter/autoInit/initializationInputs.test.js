jest.mock('../../../../scripts/utils/Logger.js', () => ({
  default: require('../../../helpers/loggerMock.js').createLoggerMock(),
  __esModule: true,
}));

const Logger = require('../../../../scripts/utils/Logger.js').default;
const {
  fetchHighlighterSettings,
  fetchPageStatus,
  resolveStyleMode,
} = require('../../../../scripts/highlighter/autoInit/initializationInputs.js');

describe('autoInit/initializationInputs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('resolveStyleMode 應接受有效 highlightStyle', () => {
    expect(resolveStyleMode({ highlightStyle: 'underline' })).toBe('underline');
    expect(Logger.warn).not.toHaveBeenCalled();
  });

  test('resolveStyleMode 應回退無效 highlightStyle 並記錄 warning', () => {
    expect(resolveStyleMode({ highlightStyle: 'invalid-style' })).toBe('background');

    expect(Logger.warn).toHaveBeenCalledWith(
      '[Highlighter] highlightStyle 設定值無效',
      expect.objectContaining({
        action: 'initializeExtension',
        value: 'invalid-style',
      })
    );
  });

  test('fetchPageStatus 應用 check page status action 呼叫 runtime', async () => {
    const pageStatus = { isSaved: true, stableUrl: 'https://example.com' };
    const sendMessage = jest.fn().mockResolvedValue(pageStatus);
    const globalScope = {
      chrome: {
        runtime: { sendMessage },
      },
    };

    await expect(fetchPageStatus({ globalScope })).resolves.toBe(pageStatus);
    expect(sendMessage).toHaveBeenCalledWith({ action: 'checkPageStatus' });
  });

  test('fetchPageStatus 應在 runtime 不可用或失敗時回傳 null', async () => {
    await expect(fetchPageStatus({ globalScope: {} })).resolves.toBeNull();

    const error = new Error('runtime unavailable');
    const globalScope = {
      chrome: {
        runtime: {
          sendMessage: jest.fn().mockRejectedValue(error),
        },
      },
    };

    await expect(fetchPageStatus({ globalScope })).resolves.toBeNull();
    expect(Logger.warn).toHaveBeenCalledWith(
      '[Highlighter] checkPageStatus 失敗',
      expect.objectContaining({
        action: 'checkPageStatus',
        error: error.message,
      })
    );
  });

  test('fetchHighlighterSettings 應讀取 style 與 rail 設定並在缺失時回傳空物件', async () => {
    const settings = { highlightStyle: 'background', floatingRailEnabled: false };
    const get = jest.fn().mockResolvedValue(settings);
    const globalScope = {
      chrome: {
        storage: {
          sync: { get },
        },
      },
    };

    await expect(fetchHighlighterSettings({ globalScope })).resolves.toBe(settings);
    expect(get).toHaveBeenCalledWith(['highlightStyle', 'floatingRailEnabled']);
    await expect(fetchHighlighterSettings({ globalScope: {} })).resolves.toEqual({});
  });

  test('fetchHighlighterSettings 應在讀取失敗時回傳空物件並記錄 warning', async () => {
    const error = new Error('sync unavailable');
    const globalScope = {
      chrome: {
        storage: {
          sync: {
            get: jest.fn().mockRejectedValue(error),
          },
        },
      },
    };

    await expect(fetchHighlighterSettings({ globalScope })).resolves.toEqual({});
    expect(Logger.warn).toHaveBeenCalledWith(
      '[Highlighter] 載入設定失敗',
      expect.objectContaining({
        action: 'initializeExtension',
        error: error.message,
      })
    );
  });
});
