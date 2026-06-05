import { mountWindowAPI } from '../../../scripts/highlighter/windowAPI.js';
import { HighlightManager } from '../../../scripts/highlighter/core/HighlightManager.js';

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

describe('windowAPI.clearPageHighlights — skipStorage contract', () => {
  let manager;
  let mockStorage;
  let mockStyleManager;

  beforeEach(() => {
    delete globalThis.HighlighterV2;
    delete globalThis.notionHighlighter;
    delete globalThis.initHighlighter;
    delete globalThis.collectHighlights;
    delete globalThis.clearPageHighlights;

    mockStyleManager = {
      clearAllHighlights: jest.fn(),
      getHighlightObject: jest.fn(),
      initialize: jest.fn(),
    };
    mockStorage = {
      save: jest.fn().mockResolvedValue(undefined),
      restore: jest.fn().mockResolvedValue(undefined),
    };

    manager = new HighlightManager();
    manager.setDependencies({
      styleManager: mockStyleManager,
      interaction: null,
      storage: mockStorage,
      migration: null,
    });

    manager.highlights.set('h1', {
      id: 'h1',
      range: { startOffset: 0, endOffset: 5 },
      color: 'yellow',
      text: 'hello',
      timestamp: 1,
      rangeInfo: {},
    });
  });

  afterEach(() => {
    delete globalThis.HighlighterV2;
    delete globalThis.notionHighlighter;
    delete globalThis.initHighlighter;
    delete globalThis.collectHighlights;
    delete globalThis.clearPageHighlights;
  });

  test('globalThis.clearPageHighlights() 應走 skipStorage 路徑、不觸發 storage.save', () => {
    mountWindowAPI({ manager, toolbar: null, storage: mockStorage });

    globalThis.clearPageHighlights();

    expect(manager.highlights.size).toBe(0);
    expect(mockStyleManager.clearAllHighlights).toHaveBeenCalledTimes(1);
    expect(mockStorage.save).not.toHaveBeenCalled();
  });

  test('notionHighlighter.clearAll() 預設行為（無參）仍會觸發 storage.save', () => {
    mountWindowAPI({ manager, toolbar: null, storage: mockStorage });

    globalThis.notionHighlighter.clearAll();

    expect(manager.highlights.size).toBe(0);
    expect(mockStyleManager.clearAllHighlights).toHaveBeenCalledTimes(1);
    expect(mockStorage.save).toHaveBeenCalledTimes(1);
  });

  test('notionHighlighter.clearAll({ skipStorage: true }) 應跳過 storage.save', () => {
    mountWindowAPI({ manager, toolbar: null, storage: mockStorage });

    globalThis.notionHighlighter.clearAll({ skipStorage: true });

    expect(manager.highlights.size).toBe(0);
    expect(mockStyleManager.clearAllHighlights).toHaveBeenCalledTimes(1);
    expect(mockStorage.save).not.toHaveBeenCalled();
  });
});
