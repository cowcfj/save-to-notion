import { mountWindowAPI } from '../../../scripts/highlighter/windowAPI.js';

describe('windowAPI (Rail-only)', () => {
  let mockManager, mockStorage, warnSpy;

  function mountWithMocks() {
    mountWindowAPI({ manager: mockManager, storage: mockStorage });
  }

  beforeEach(() => {
    mockManager = {
      collectHighlightsForNotion: jest.fn().mockReturnValue(['mock-highlight']),
      clearAll: jest.fn(),
      getCount: jest.fn().mockReturnValue(3),
    };
    mockStorage = {
      restore: jest.fn(),
    };
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Reset globals
    delete globalThis.HighlighterV2;
    delete globalThis.notionHighlighter;
    delete globalThis.initHighlighter;
    delete globalThis.collectHighlights;
    delete globalThis.clearPageHighlights;
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test('mountWindowAPI 應掛載 API 並提供輔助方法', () => {
    mountWithMocks();

    expect(globalThis.HighlighterV2).toBeDefined();
    expect(globalThis.notionHighlighter).toBeDefined();

    expect(globalThis.HighlighterV2.getRestoreManager()).toBe(mockStorage);
  });

  test('mountWindowAPI 在 fns 為 null 時仍應正常掛載', () => {
    mountWindowAPI({ manager: mockManager, storage: mockStorage, fns: null });

    expect(globalThis.HighlighterV2).toBeDefined();
    expect(globalThis.HighlighterV2.init).toBeUndefined();
  });

  test('notionHighlighter 其他委派方法', () => {
    mountWithMocks();
    globalThis.notionHighlighter.collectHighlights();
    expect(mockManager.collectHighlightsForNotion).toHaveBeenCalled();

    globalThis.notionHighlighter.clearAll();
    expect(mockManager.clearAll).toHaveBeenCalled();

    expect(globalThis.notionHighlighter.getCount()).toBe(3);

    globalThis.notionHighlighter.forceRestoreHighlights();
    expect(mockStorage.restore).toHaveBeenCalled();
  });

  test('全球向後兼容別名方法', () => {
    mountWithMocks();

    // initHighlighter 應安全執行（如果 rail 不存在會警告，但不會拋錯）
    globalThis.initHighlighter();
    expect(warnSpy).toHaveBeenCalled();

    const hl = globalThis.collectHighlights();
    expect(hl).toEqual(['mock-highlight']);
    expect(mockManager.collectHighlightsForNotion).toHaveBeenCalled();

    globalThis.clearPageHighlights();
    expect(mockManager.clearAll).toHaveBeenCalled();
  });

  test('全局兼容別名在沒有掛載時應安全返回', () => {
    mountWithMocks();
    const notionHL = globalThis.notionHighlighter;
    delete globalThis.notionHighlighter;

    expect(globalThis.initHighlighter()).toBeUndefined();
    expect(globalThis.collectHighlights()).toEqual([]);
    expect(() => globalThis.clearPageHighlights()).not.toThrow();

    // Restore for any other tests
    globalThis.notionHighlighter = notionHL;
  });

  test('show() 在 rail 缺席時應 Logger.warn 一次並帶 metadata', () => {
    mountWithMocks();
    // 確保 rail 不存在
    delete globalThis.HighlighterV2.rail;

    globalThis.notionHighlighter.show();

    const matched = warnSpy.mock.calls.find(
      args => typeof args[2] === 'object' && args[2]?.action === 'getLegacyUiController'
    );
    expect(matched).toBeDefined();
    expect(matched[1]).toContain('舊版 UI 控制器不可用');
    expect(matched[2]).toEqual(
      expect.objectContaining({
        action: 'getLegacyUiController',
        reason: 'rail_missing',
      })
    );
  });

  test('isActive() 在 rail 缺席時應 Logger.warn 一次並回 false', () => {
    mountWithMocks();
    delete globalThis.HighlighterV2.rail;

    const result = globalThis.notionHighlighter.isActive();

    expect(result).toBe(false);
    const matched = warnSpy.mock.calls.find(
      args => typeof args[2] === 'object' && args[2]?.action === 'isActive'
    );
    expect(matched).toBeDefined();
    expect(matched[1]).toContain('isActive 在無 UI 時被調用');
    expect(matched[2]).toEqual(
      expect.objectContaining({
        action: 'isActive',
        reason: 'rail_missing',
        result: 'blocked',
      })
    );
  });

  test('isActive() 在 rail 存在時不應觸發 warn', () => {
    mountWithMocks();
    globalThis.HighlighterV2.rail = {
      stateManager: { currentState: 'visible' },
      host: { style: { display: 'block' } },
    };

    const result = globalThis.notionHighlighter.isActive();

    expect(result).toBe(true);
    const matched = warnSpy.mock.calls.find(
      args => typeof args[2] === 'object' && args[2]?.action === 'isActive'
    );
    expect(matched).toBeUndefined();
  });

  test.each([
    [
      'collapsed',
      {
        stateManager: { currentState: 'collapsed' },
        host: { style: { display: 'block' } },
      },
    ],
    [
      'hidden',
      {
        stateManager: { currentState: 'hidden' },
        host: { style: { display: 'block' } },
      },
    ],
    [
      'display none',
      {
        stateManager: { currentState: 'visible' },
        host: { style: { display: 'none' } },
      },
    ],
    [
      'state missing',
      {
        stateManager: {},
        host: { style: { display: 'block' } },
      },
    ],
  ])('isActive() 在 rail %s 時應回 false', (_caseName, rail) => {
    mountWithMocks();
    globalThis.HighlighterV2.rail = rail;

    expect(globalThis.notionHighlighter.isActive()).toBe(false);
  });

  test('toggle() 在 rail collapsed 或 display none 時應呼叫 show()', () => {
    mountWithMocks();
    const railShow = jest.fn();
    const railHide = jest.fn();
    globalThis.HighlighterV2.rail = {
      show: railShow,
      hide: railHide,
      stateManager: { currentState: 'collapsed' },
      host: { style: { display: 'block' } },
    };

    globalThis.notionHighlighter.toggle();

    expect(railShow).toHaveBeenCalledTimes(1);
    expect(railHide).not.toHaveBeenCalled();

    globalThis.HighlighterV2.rail.stateManager.currentState = 'visible';
    globalThis.HighlighterV2.rail.host.style.display = 'none';

    globalThis.notionHighlighter.toggle();

    expect(railShow).toHaveBeenCalledTimes(2);
    expect(railHide).not.toHaveBeenCalled();

    globalThis.HighlighterV2.rail.stateManager = {};
    globalThis.HighlighterV2.rail.host.style.display = 'block';

    globalThis.notionHighlighter.toggle();

    expect(railShow).toHaveBeenCalledTimes(3);
    expect(railHide).not.toHaveBeenCalled();
  });

  test('toggle() 在 rail visible 時應呼叫 hide()', () => {
    mountWithMocks();
    const railShow = jest.fn();
    const railHide = jest.fn();
    globalThis.HighlighterV2.rail = {
      show: railShow,
      hide: railHide,
      stateManager: { currentState: 'visible' },
      host: { style: { display: 'block' } },
    };

    globalThis.notionHighlighter.toggle();

    expect(railHide).toHaveBeenCalledTimes(1);
    expect(railShow).not.toHaveBeenCalled();
  });

  test('minimize() 在 rail-only 環境下應呼叫 rail.collapse()', () => {
    mountWithMocks();
    const railCollapse = jest.fn();
    globalThis.HighlighterV2.rail = {
      collapse: railCollapse,
      stateManager: { currentState: 'visible' },
      host: { style: { display: 'block' } },
    };

    globalThis.notionHighlighter.minimize();

    expect(railCollapse).toHaveBeenCalledTimes(1);
  });
});
