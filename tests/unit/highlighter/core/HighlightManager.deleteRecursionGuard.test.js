/**
 * 遞迴守門：刪除最後一個 highlight 後，background 注入回的
 * `globalThis.clearPageHighlights()` 不應再次觸發 CLEAR_HIGHLIGHTS。
 *
 * 修復前：page → background → page 形成自我遞迴閉環，sendMessage('CLEAR_HIGHLIGHTS') ≥ 2 次。
 * 修復後：clearPageHighlights() 走 skipStorage: true，sendMessage 計數固定 = 1。
 */

jest.mock('../../../../scripts/highlighter/ui/Toolbar.js', () => ({
  Toolbar: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    updateHighlightCount: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    minimize: jest.fn(),
    stateManager: { currentState: 'hidden' },
  })),
}));

jest.mock('../../../../scripts/utils/Logger.js', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    success: jest.fn(),
    start: jest.fn(),
    ready: jest.fn(),
  },
}));

import { HighlightManager } from '../../../../scripts/highlighter/core/HighlightManager.js';
import { HighlightStorage } from '../../../../scripts/highlighter/core/HighlightStorage.js';
import { mountWindowAPI } from '../../../../scripts/highlighter/windowAPI.js';

describe('HighlightManager delete recursion guard', () => {
  let manager;
  let storage;
  let mockStyleManager;
  let sendMessage;

  beforeEach(() => {
    delete globalThis.HighlighterV2;
    delete globalThis.notionHighlighter;
    delete globalThis.clearPageHighlights;
    delete globalThis.collectHighlights;
    delete globalThis.initHighlighter;
    delete globalThis.__NOTION_STABLE_URL__;

    globalThis.window = globalThis;
    globalThis.__NOTION_STABLE_URL__ = 'https://example.com/page';

    sendMessage = jest.fn(() => Promise.resolve({ success: true }));
    globalThis.chrome = {
      runtime: {
        id: 'test-extension-id',
        sendMessage,
        lastError: null,
      },
      storage: {
        local: {
          get: jest.fn((_, cb) => cb?.({})),
          set: jest.fn((_, cb) => cb?.()),
          remove: jest.fn((_, cb) => cb?.()),
        },
      },
    };

    const fakeHighlightObject = {
      add: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
    };
    mockStyleManager = {
      initialize: jest.fn(),
      clearAllHighlights: jest.fn(),
      getHighlightObject: jest.fn(() => fakeHighlightObject),
      injectStyles: jest.fn(),
    };

    manager = new HighlightManager();
    storage = new HighlightStorage(manager);
    manager.setDependencies({
      styleManager: mockStyleManager,
      interaction: null,
      storage,
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

    mountWindowAPI(manager, null, storage);
  });

  afterEach(() => {
    delete globalThis.HighlighterV2;
    delete globalThis.notionHighlighter;
    delete globalThis.clearPageHighlights;
    delete globalThis.chrome;
  });

  function countClearHighlights() {
    return sendMessage.mock.calls.filter(args => args[0]?.action === 'CLEAR_HIGHLIGHTS').length;
  }

  const flush = () => new Promise(resolve => setTimeout(resolve, 0));

  test('removeHighlight 後 background 注入的 clearPageHighlights 不應再次觸發 CLEAR_HIGHLIGHTS', async () => {
    manager.removeHighlight('h1');
    await flush();

    expect(countClearHighlights()).toBe(1);

    globalThis.clearPageHighlights();
    await flush();

    expect(countClearHighlights()).toBe(1);
    expect(manager.highlights.size).toBe(0);
  });

  test('rail/toolbar 主動呼叫 manager.clearAll() 仍會觸發 CLEAR_HIGHLIGHTS（契約未退化）', async () => {
    manager.clearAll();
    await flush();

    expect(countClearHighlights()).toBe(1);
  });
});
