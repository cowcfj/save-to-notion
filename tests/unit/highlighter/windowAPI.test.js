import { mountWindowAPI } from '../../../scripts/highlighter/windowAPI.js';
import { Toolbar } from '../../../scripts/highlighter/ui/Toolbar.js';

jest.mock('../../../scripts/highlighter/ui/Toolbar.js', () => ({
  Toolbar: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    updateHighlightCount: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    minimize: jest.fn(),
    stateManager: { currentState: 'hidden' },
  })),
}));

describe('windowAPI', () => {
  let mockManager, mockStorage;

  function mountWithMocks() {
    mountWindowAPI({ manager: mockManager, toolbar: null, storage: mockStorage });
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
    Toolbar.mockClear();

    // Reset globals
    delete globalThis.HighlighterV2;
    delete globalThis.notionHighlighter;
    delete globalThis.initHighlighter;
    delete globalThis.collectHighlights;
    delete globalThis.clearPageHighlights;
  });

  test('mountWindowAPI 應掛載 API 並提供輔助方法', () => {
    mountWithMocks();

    expect(globalThis.HighlighterV2).toBeDefined();
    expect(globalThis.notionHighlighter).toBeDefined();

    // Check custom methods Uncovered lines: 107
    expect(globalThis.HighlighterV2.getRestoreManager()).toBe(mockStorage);
    expect(globalThis.HighlighterV2.getToolbar()).toBeNull();
  });

  test('mountWindowAPI 在 fns 為 null 時仍應正常掛載', () => {
    mountWindowAPI({ manager: mockManager, toolbar: null, storage: mockStorage, fns: null });

    expect(globalThis.HighlighterV2).toBeDefined();
    expect(globalThis.HighlighterV2.init).toBeUndefined();
    expect(globalThis.HighlighterV2.initWithToolbar).toBeUndefined();
  });

  test('ensureToolbar 和 notionHighlighter 方法應能正確運作 (toggle/hide/minimize)', () => {
    mountWithMocks();

    expect(() => globalThis.notionHighlighter.minimize()).not.toThrow();

    globalThis.notionHighlighter.toggle();
    expect(Toolbar).toHaveBeenCalled();
    const tbInstance = globalThis.HighlighterV2.getToolbar();
    expect(tbInstance).toBeDefined();
    expect(tbInstance.show).toHaveBeenCalled();

    tbInstance.stateManager.currentState = 'visible';
    globalThis.notionHighlighter.toggle();
    expect(tbInstance.hide).toHaveBeenCalled();

    globalThis.notionHighlighter.minimize();
    expect(tbInstance.minimize).toHaveBeenCalled();
  });

  test('ensureToolbar 防止並行創建', () => {
    mountWithMocks();
    // Simulate concurrent creation in ensureToolbar
    Toolbar.mockImplementationOnce(() => {
      // While creating, try to call toggle which calls ensureToolbar again
      try {
        globalThis.notionHighlighter.toggle();
      } catch (error) {
        expect(error.message).toContain('Toolbar is being created');
        throw new Error('Toolbar is being created, please wait: nested');
      }
      return {
        initialize: jest.fn(),
        updateHighlightCount: jest.fn(),
        show: jest.fn(),
        stateManager: { currentState: 'hidden' },
      };
    });

    expect(() => {
      globalThis.notionHighlighter.toggle();
    }).toThrow('Toolbar is being created, please wait: nested');
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

    // Uncovered: 149-152 initHighlighter
    globalThis.initHighlighter();
    const tbInstance = globalThis.HighlighterV2.getToolbar();
    expect(tbInstance.show).toHaveBeenCalled();

    // Uncovered: 156-159 collectHighlights
    const hl = globalThis.collectHighlights();
    expect(hl).toEqual(['mock-highlight']);
    expect(mockManager.collectHighlightsForNotion).toHaveBeenCalled();

    // Uncovered: 163-164 clearPageHighlights
    globalThis.clearPageHighlights();
    expect(mockManager.clearAll).toHaveBeenCalled();
  });

  test('全局兼容別名在沒有掛載時應安全返回', () => {
    // Delete notionHighlighter entirely
    delete globalThis.notionHighlighter;

    // Require windowAPI manually since the previous test deleted globalThis.notionHighlighter
    // and no fresh mountWindowAPI was called
    // We already have the top level exports, but global methods are injected into globalThis during mount
    // So we just simulate them not existing or existing but without notionHighlighter

    // We mount it but then wipe the global
    mountWithMocks();
    const notionHL = globalThis.notionHighlighter;
    delete globalThis.notionHighlighter;

    expect(globalThis.initHighlighter()).toBeUndefined();
    expect(globalThis.collectHighlights()).toEqual([]);
    expect(() => globalThis.clearPageHighlights()).not.toThrow();

    // Restore for any other tests
    globalThis.notionHighlighter = notionHL;
  });

  describe('Production-path observability (TOOLBAR_TEST_FIXTURE_ENABLED=false)', () => {
    let warnSpy;
    let prodMountWindowAPI;
    let prodManager;
    let prodStorage;

    function prodMountWithMocks() {
      prodMountWindowAPI({ manager: prodManager, toolbar: null, storage: prodStorage });
    }

    beforeEach(() => {
      jest.resetModules();
      globalThis.__UNIT_TESTING__ = false;
      delete globalThis.HighlighterV2;
      delete globalThis.notionHighlighter;

      jest.isolateModules(() => {
        jest.doMock('../../../scripts/highlighter/ui/Toolbar.js', () => ({
          Toolbar: jest.fn().mockImplementation(() => ({
            initialize: jest.fn(),
            updateHighlightCount: jest.fn(),
            show: jest.fn(),
            hide: jest.fn(),
            minimize: jest.fn(),
            stateManager: { currentState: 'hidden' },
          })),
        }));

        // 重新載入 windowAPI，使其在 production gate 下凍結 TOOLBAR_TEST_FIXTURE_ENABLED=false
        ({
          mountWindowAPI: prodMountWindowAPI,
        } = require('../../../scripts/highlighter/windowAPI.js'));
      });

      prodManager = {
        collectHighlightsForNotion: jest.fn().mockReturnValue([]),
        clearAll: jest.fn(),
        getCount: jest.fn().mockReturnValue(0),
      };
      prodStorage = { restore: jest.fn() };
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
      delete globalThis.__UNIT_TESTING__;
      delete globalThis.HighlighterV2;
      delete globalThis.notionHighlighter;
    });

    test('show() 在 toolbar 與 rail 皆缺席時應 Logger.warn 一次並帶 metadata', () => {
      prodMountWithMocks();
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
          reason: 'toolbar_disabled_and_rail_missing',
          toolbarTestFixtureEnabled: false,
        })
      );
    });

    test('isActive() 在 toolbar state 與 rail 皆缺席時應 Logger.warn 一次並回 false', () => {
      prodMountWithMocks();
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
          reason: 'toolbar_disabled_and_rail_missing',
        })
      );
    });

    test('isActive() 在 rail 存在時不應觸發 warn', () => {
      prodMountWithMocks();
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

    test('isActive() 在 rail collapsed 或 hidden 時應回 false', () => {
      prodMountWithMocks();
      globalThis.HighlighterV2.rail = {
        stateManager: { currentState: 'collapsed' },
        host: { style: { display: 'block' } },
      };

      expect(globalThis.notionHighlighter.isActive()).toBe(false);

      globalThis.HighlighterV2.rail.stateManager.currentState = 'hidden';

      expect(globalThis.notionHighlighter.isActive()).toBe(false);
    });

    test('isActive() 在 rail display none 或 state 缺失時應回 false', () => {
      prodMountWithMocks();
      globalThis.HighlighterV2.rail = {
        stateManager: { currentState: 'visible' },
        host: { style: { display: 'none' } },
      };

      expect(globalThis.notionHighlighter.isActive()).toBe(false);

      globalThis.HighlighterV2.rail = {
        stateManager: {},
        host: { style: { display: 'block' } },
      };

      expect(globalThis.notionHighlighter.isActive()).toBe(false);
    });

    test('toggle() 在 rail collapsed 或 display none 時應呼叫 show()', () => {
      prodMountWithMocks();
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
    });

    test('toggle() 在 rail visible 時應呼叫 hide()', () => {
      prodMountWithMocks();
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
      prodMountWithMocks();
      const railCollapse = jest.fn();
      globalThis.HighlighterV2.rail = {
        collapse: railCollapse,
        stateManager: { currentState: 'visible' },
        host: { style: { display: 'block' } },
      };

      globalThis.notionHighlighter.minimize();

      expect(railCollapse).toHaveBeenCalledTimes(1);
    });

    test('Branch A indirect alive: notionHighlighter.collectHighlights() 應委派到 manager', () => {
      prodManager.collectHighlightsForNotion.mockReturnValue([{ id: 'mock' }]);
      prodMountWithMocks();

      const result = globalThis.notionHighlighter.collectHighlights();

      expect(prodManager.collectHighlightsForNotion).toHaveBeenCalledTimes(1);
      expect(result).toEqual([{ id: 'mock' }]);
    });

    test('Branch A indirect alive: notionHighlighter.clearAll() 應委派到 manager', () => {
      prodMountWithMocks();

      globalThis.notionHighlighter.clearAll();

      expect(prodManager.clearAll).toHaveBeenCalledTimes(1);
    });

    test('Branch A direct alive: globalThis.collectHighlights() 應透過 alias 委派到 manager (executeScript page-context contract)', () => {
      prodManager.collectHighlightsForNotion.mockReturnValue([{ id: 'via-alias' }]);
      prodMountWithMocks();

      const result = globalThis.collectHighlights();

      expect(prodManager.collectHighlightsForNotion).toHaveBeenCalledTimes(1);
      expect(result).toEqual([{ id: 'via-alias' }]);
    });

    test('Branch A direct alive: globalThis.clearPageHighlights() 應透過 alias 委派到 manager (executeScript page-context contract)', () => {
      prodMountWithMocks();

      globalThis.clearPageHighlights();

      expect(prodManager.clearAll).toHaveBeenCalledTimes(1);
    });
  });
});
