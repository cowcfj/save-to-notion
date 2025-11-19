/**
 * 高亮工具欄（highlighter-v2）集成測試：show/hide 的穩定性
 */

describe('highlighter-v2 toolbar show/hide 穩定性', () => {
  // 建立最小可行的 StorageUtil mock，避免自動初始化報錯
  const createStorageUtilMock = (highlights = []) => ({
    loadHighlights: jest.fn(() => Promise.resolve(highlights)),
    saveHighlights: jest.fn(() => Promise.resolve()),
    clearHighlights: jest.fn(() => Promise.resolve())
  });

  const loadHighlighterScript = async (highlights = []) => {
    // 乾淨的 module 隔離，確保每個測試獨立載入腳本
    jest.isolateModules(() => {
      // 提供 CSS.highlights 的最小 Mock（JSDOM 不支持）
      if (typeof window.CSS === 'undefined') {
        window.CSS = {};
      }
      if (typeof window.CSS.highlights === 'undefined') {
        // 提供 Highlight 類的最小 mock
        if (typeof window.Highlight === 'undefined') {
          window.Highlight = function Highlight() { };
        }

        const map = new Map();
        window.CSS.highlights = {
          set: (k, v) => map.set(k, v),
          get: (k) => map.get(k),
          has: (k) => map.has(k),
          delete: (k) => map.delete(k),
          clear: () => map.clear()
        };
      }

      // 準備全域依賴
      global.window = window;
      // 修正 jsdom 在 MutationObserver 報錯/URL 取用問題，並提供安全的 Mock
      if (!window._document) {
        window._document = window.document;
      }
      // 提供一個安全的 MutationObserver Mock（使用輪詢），避免 jsdom 內部報錯
      class SafeMutationObserver {
        constructor(callback) {
          this._callback = callback;
          this._timer = null;
        }
        observe() {
          // 以 10ms 間隔觸發 callback，模擬 DOM 變動
          this._timer = setInterval(() => {
            try {
              this._callback([], this);
            } catch (_e) {
              // 安全忽略，以免中斷測試
            }
          }, 10);
        }
        disconnect() {
          if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
          }
        }
        takeRecords() { return []; }
      }
      window.MutationObserver = SafeMutationObserver;
      // 提供 StorageUtil
      window.StorageUtil = createStorageUtilMock(highlights);
      window.normalizeUrl = jest.fn((url) => url);
      // 載入腳本（會自動初始化並在 window 上掛載 notionHighlighter）
      require('../../scripts/highlighter-v2.js');
    });
    // 等待任何微任務（如 autoInit 異步）
    await new Promise((r) => setTimeout(r, 0));
  };

  beforeEach(() => {
    // 清理 DOM 與全域，以免測試互相影響
    document.body.innerHTML = '';
    if (window.notionHighlighter) {
      try {
        // 嘗試隱藏並移除
        window.notionHighlighter.hide();
      } catch (_e) { /* empty: ignore cleanup errors in test teardown */ }
    }
    delete window.notionHighlighter;
  });

  test('show() 應在節點被移除後自動重新掛載並顯示', async () => {
    await loadHighlighterScript([{ id: "h1", text: "demo", color: "yellow", timestamp: Date.now(), rangeInfo: null }]);
    expect(window.notionHighlighter).toBeDefined();

    const { toolbar, show } = window.notionHighlighter;
    // 初次顯示
    show();
    expect(toolbar.style.display).toBe('block');

    // 模擬被站點動態移除
    toolbar.remove();
    expect(document.body.contains(toolbar)).toBe(false);

    // 再次顯示時應自動 re-attach
    show();
    expect(document.body.contains(toolbar)).toBe(true);
    expect(toolbar.style.display).toBe('block');
  });

  test('show() 應重申關鍵樣式（position、top/right、z-index、visibility、opacity）', async () => {
    await loadHighlighterScript([{ id: "h1", text: "demo", color: "yellow", timestamp: Date.now(), rangeInfo: null }]);
    const { toolbar, show } = window.notionHighlighter;

    // 人為設置不合理樣式，呼叫 show() 後應被糾正
    toolbar.style.position = 'static';
    toolbar.style.top = '';
    toolbar.style.right = '';
    toolbar.style.zIndex = '1';
    toolbar.style.visibility = 'hidden';
    toolbar.style.opacity = '0';

    show();

    expect(toolbar.style.position).toBe('fixed');
    expect(toolbar.style.top).toBe('20px');
    expect(toolbar.style.right).toBe('20px');
    expect(toolbar.style.zIndex).toBe('2147483647');
    expect(toolbar.style.display).toBe('block');
    expect(toolbar.style.visibility).toBe('visible');
    expect(toolbar.style.opacity).toBe('1');
  });

  test('hide() 應將 display 設為 none', async () => {
    await loadHighlighterScript([{ id: "h1", text: "demo", color: "yellow", timestamp: Date.now(), rangeInfo: null }]);
    const { toolbar, show, hide } = window.notionHighlighter;

    show();
    expect(toolbar.style.display).toBe('block');

    hide();
    expect(toolbar.style.display).toBe('none');
  });

  test('在存在高層級 overlay 的長頁情境下，toolbar z-index 應高於 overlay', async () => {
    await loadHighlighterScript([{ id: "h1", text: "demo", color: "yellow", timestamp: Date.now(), rangeInfo: null }]);

    // 建立模擬長頁與高層級 overlay
    const longContainer = document.createElement('div');
    longContainer.style.height = '5000px';
    document.body.appendChild(longContainer);

    const overlay = document.createElement('div');
    overlay.id = 'test-overlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      background: 'rgba(0,0,0,0.1)',
      zIndex: '999999' // 低於 2147483647，但高於大部分站點
    });
    document.body.appendChild(overlay);

    const { toolbar, show } = window.notionHighlighter;
    show();

    const overlayZ = parseInt(overlay.style.zIndex, 10);
    const toolbarZ = parseInt(toolbar.style.zIndex, 10);
    expect(toolbarZ).toBeGreaterThan(overlayZ);
    expect(toolbar.style.display).toBe('block');
  });

  test('MutationObserver 應在 toolbar 被移除後自動重新掛載（無需呼叫 show）', async () => {
    await loadHighlighterScript([{ id: "h1", text: "demo", color: "yellow", timestamp: Date.now(), rangeInfo: null }]);
    const { toolbar } = window.notionHighlighter;

    // 移除 toolbar
    toolbar.remove();
    expect(document.body.contains(toolbar)).toBe(false);

    // 觸發一次 DOM 更動，促使 observer 回調被調用
    const filler = document.createElement('div');
    document.body.appendChild(filler);

    // 等待 observer 輪詢觸發（10ms 間隔），保險等待 30ms
    await new Promise((r) => setTimeout(r, 30));

    expect(document.body.contains(toolbar)).toBe(true);
  });

  test('最小化按鈕應根據狀態在展開/最小化之間切換', async () => {
    await loadHighlighterScript([{ id: "h1", text: "demo", color: "yellow", timestamp: Date.now(), rangeInfo: null }]);
    const { toolbar, show } = window.notionHighlighter;
    const minimizeBtn = toolbar.querySelector('#minimize-highlight-v2');
    const miniIcon = document.querySelector('#notion-highlighter-mini');

    show();
    expect(toolbar.style.display).toBe('block');
    expect(miniIcon.style.display).toBe('none');

    minimizeBtn.click();
    expect(toolbar.style.display).toBe('none');
    expect(miniIcon.style.display).toBe('flex');

    // 模擬站點手動顯示 toolbar，但內部狀態仍為 MINIMIZED
    toolbar.style.display = 'block';
    miniIcon.style.display = 'none';

    minimizeBtn.click();
    expect(toolbar.style.display).toBe('block');
    expect(miniIcon.style.display).toBe('none');
  });
});
