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
    mountWindowAPI(mockManager, null, mockStorage);

    expect(globalThis.HighlighterV2).toBeDefined();
    expect(globalThis.notionHighlighter).toBeDefined();

    // Check custom methods Uncovered lines: 107
    expect(globalThis.HighlighterV2.getRestoreManager()).toBe(mockStorage);
    expect(globalThis.HighlighterV2.getToolbar()).toBeNull();
  });

  test('ensureToolbar 和 notionHighlighter 方法應能正確運作 (toggle/hide/minimize)', () => {
    mountWindowAPI(mockManager, null, mockStorage);

    // Uncovered: 122 minimize
    globalThis.notionHighlighter.minimize(); // Should be safe since toolbar is null

    // Create toolbar via toggle
    globalThis.notionHighlighter.toggle();
    expect(Toolbar).toHaveBeenCalled();
    const tbInstance = globalThis.HighlighterV2.getToolbar();
    expect(tbInstance).toBeDefined();
    expect(tbInstance.show).toHaveBeenCalled();

    // Change state and toggle again (Uncovered: 133 tb.hide)
    tbInstance.stateManager.currentState = 'visible';
    globalThis.notionHighlighter.toggle();
    expect(tbInstance.hide).toHaveBeenCalled();

    // Call minimize when toolbar exists (Uncovered: 122)
    globalThis.notionHighlighter.minimize();
    expect(tbInstance.minimize).toHaveBeenCalled();
  });

  test('ensureToolbar 防止並行創建', () => {
    mountWindowAPI(mockManager, null, mockStorage);
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
    mountWindowAPI(mockManager, null, mockStorage);
    globalThis.notionHighlighter.collectHighlights();
    expect(mockManager.collectHighlightsForNotion).toHaveBeenCalled();

    globalThis.notionHighlighter.clearAll();
    expect(mockManager.clearAll).toHaveBeenCalled();

    expect(globalThis.notionHighlighter.getCount()).toBe(3);

    globalThis.notionHighlighter.forceRestoreHighlights();
    expect(mockStorage.restore).toHaveBeenCalled();
  });

  test('全球向後兼容別名方法', () => {
    mountWindowAPI(mockManager, null, mockStorage);

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
    mountWindowAPI(mockManager, null, mockStorage);
    const notionHL = globalThis.notionHighlighter;
    delete globalThis.notionHighlighter;

    expect(globalThis.initHighlighter()).toBeUndefined();
    expect(globalThis.collectHighlights()).toEqual([]);
    expect(() => globalThis.clearPageHighlights()).not.toThrow();

    // Restore for any other tests
    globalThis.notionHighlighter = notionHL;
  });
});
