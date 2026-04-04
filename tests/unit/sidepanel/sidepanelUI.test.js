/**
 * sidepanelUI.js 單元測試
 *
 * 測試所有純 UI 函數的 DOM 行為，不需要 mock Chrome API。
 */

import {
  getElements,
  extractDomain,
  buildPreviewHighlights,
  isCurrentViewActive,
  showLoading,
  showEmpty,
  showMessage,
  hideMessage,
  renderList,
  switchView,
  appendCards,
  renderUnsyncedEmptyState,
  updateUnsyncedBadge,
  PREVIEW_HIGHLIGHT_COUNT,
  PREVIEW_TEXT_MAX_LENGTH,
} from '../../../sidepanel/sidepanelUI.js';

// ---- DOM 設置 ----

function buildDOM() {
  document.body.innerHTML = `
    <div id="loading-state" style="display:none"><div class="spinner"></div><p></p></div>
    <div id="empty-state" style="display:none">
      <p>本頁尚無標註</p>
      <div class="subtitle">選取網頁文字即可標註</div>
    </div>
    <div id="highlights-list" style="display:none"></div>
    <button id="sync-button"></button>
    <button id="open-notion-button" style="display:none"></button>
    <div id="status-message" style="display:none"></div>
    <div id="unsynced-view" style="display:none"></div>
    <div id="unsynced-toolbar" style="display:none">
      <span id="unsynced-count-label"></span>
      <button id="clear-all-btn"></button>
    </div>
    <button id="load-more-btn" style="display:none"></button>
    <span id="unsynced-badge"></span>
    <div class="view-tabs">
      <button class="view-tab active" data-view="current">本頁標註</button>
      <button class="view-tab" data-view="unsynced">待同步<span id="unsynced-badge"></span></button>
    </div>
    <template id="highlight-card-template">
      <div class="highlight-card">
        <div class="highlight-color-indicator"></div>
        <p class="highlight-text"></p>
        <button class="delete-button"></button>
      </div>
    </template>
    <template id="page-card-template">
      <div class="page-card">
        <p class="page-title"></p>
        <span class="page-meta"></span>
        <div class="page-card-previews"></div>
        <span class="page-card-remaining"></span>
        <button class="page-open-button"></button>
        <button class="page-delete-button"></button>
      </div>
    </template>
  `;
}

// ---- 測試 ----

describe('sidepanelUI', () => {
  beforeEach(() => {
    buildDOM();
  });

  // === 工具函數 ===

  describe('extractDomain', () => {
    it('應正確擷取 hostname', () => {
      expect(extractDomain('https://example.com/path?q=1')).toBe('example.com');
    });

    it('遇到非法 URL 應回傳原始字串', () => {
      expect(extractDomain('not-a-url')).toBe('not-a-url');
    });
  });

  describe('buildPreviewHighlights', () => {
    it('應截取前 PREVIEW_HIGHLIGHT_COUNT 個標註', () => {
      const highlights = Array.from({ length: 5 }, (_, i) => ({
        text: `hl-${i}`,
        color: 'yellow',
      }));
      const result = buildPreviewHighlights(highlights);
      expect(result).toHaveLength(PREVIEW_HIGHLIGHT_COUNT);
    });

    it('應截斷超過 PREVIEW_TEXT_MAX_LENGTH 的文字並標記 truncated', () => {
      const longText = 'A'.repeat(PREVIEW_TEXT_MAX_LENGTH + 10);
      const result = buildPreviewHighlights([{ text: longText, color: 'blue' }]);
      expect(result[0].text).toHaveLength(PREVIEW_TEXT_MAX_LENGTH);
      expect(result[0].truncated).toBe(true);
    });

    it('短文字不應標記 truncated', () => {
      const result = buildPreviewHighlights([{ text: 'short', color: 'green' }]);
      expect(result[0].truncated).toBe(false);
    });

    it('應正確傳遞顏色，並為缺失顏色補預設值', () => {
      const result = buildPreviewHighlights([{ text: 'x' }]);
      expect(result[0].color).toBe('yellow');
    });
  });

  // === 元素獲取 ===

  describe('getElements', () => {
    it('應回傳所有必要的 DOM 元素', () => {
      const elements = getElements();
      expect(elements.loadingState).toBeTruthy();
      expect(elements.emptyState).toBeTruthy();
      expect(elements.highlightsList).toBeTruthy();
      expect(elements.syncButton).toBeTruthy();
      expect(elements.statusMessage).toBeTruthy();
      expect(elements.unsyncedView).toBeTruthy();
      expect(elements.viewTabs.length).toBeGreaterThan(0);
    });
  });

  // === 狀態切換 ===

  describe('isCurrentViewActive', () => {
    it('current tab 有 active class 時應回傳 true', () => {
      const elements = getElements();
      const currentTab = document.querySelector('.view-tab[data-view="current"]');
      currentTab.classList.add('active');
      expect(isCurrentViewActive(elements)).toBe(true);
    });

    it('current tab 無 active class 時應回傳 false', () => {
      const elements = getElements();
      const currentTab = document.querySelector('.view-tab[data-view="current"]');
      currentTab.classList.remove('active');
      expect(isCurrentViewActive(elements)).toBe(false);
    });
  });

  describe('showLoading', () => {
    it('當 current view 為 active 時應顯示 loadingState', () => {
      const elements = getElements();
      showLoading(elements);
      expect(elements.loadingState.style.display).toBe('flex');
      expect(elements.emptyState.style.display).toBe('none');
      expect(elements.highlightsList.style.display).toBe('none');
    });

    it('當 current view 非 active 時 loadingState 應隱藏', () => {
      const elements = getElements();
      // 切換到 unsynced tab
      document.querySelector('.view-tab[data-view="current"]').classList.remove('active');
      showLoading(elements);
      expect(elements.loadingState.style.display).toBe('none');
    });
  });

  describe('showEmpty', () => {
    it('不傳訊息時應顯示預設文字', () => {
      const elements = getElements();
      showEmpty(elements);
      expect(elements.emptyState.style.display).toBe('flex');
      expect(elements.emptyState.querySelector('.subtitle').style.display).toBe('block');
    });

    it('傳入自訂訊息時應隱藏 subtitle', () => {
      const elements = getElements();
      showEmpty(elements, '不支援此頁面');
      expect(elements.emptyState.querySelector('p').textContent).toBe('不支援此頁面');
      expect(elements.emptyState.querySelector('.subtitle').style.display).toBe('none');
    });
  });

  describe('showMessage / hideMessage', () => {
    it('showMessage 應設置文字、class 並顯示元素', () => {
      const elements = getElements();
      showMessage(elements, '同步成功', 'success');
      expect(elements.statusMessage.textContent).toBe('同步成功');
      expect(elements.statusMessage.className).toBe('status-message success');
      expect(elements.statusMessage.style.display).toBe('block');
    });

    it('hideMessage 應隱藏 statusMessage', () => {
      const elements = getElements();
      showMessage(elements, '訊息', 'info');
      hideMessage(elements);
      expect(elements.statusMessage.style.display).toBe('none');
    });
  });

  // === 列表渲染 ===

  describe('renderList', () => {
    it('應渲染正確數量的卡片', () => {
      const elements = getElements();
      const highlights = [
        { id: '1', text: 'Hi', color: 'yellow' },
        { id: '2', text: 'Bye', color: 'green' },
      ];
      const onDelete = jest.fn();

      renderList(elements, highlights, 'highlights_https://test.com', onDelete);

      expect(elements.highlightsList.querySelectorAll('.highlight-card')).toHaveLength(2);
    });

    it('點擊刪除按鈕應呼叫 onDelete 回調並傳入正確參數', () => {
      const elements = getElements();
      const highlights = [{ id: 'hl-1', text: 'Delete me', color: 'red' }];
      const storageKey = 'highlights_https://test.com';
      const onDelete = jest.fn();

      renderList(elements, highlights, storageKey, onDelete);

      const delBtn = elements.highlightsList.querySelector('.delete-button');
      delBtn.click();

      expect(onDelete).toHaveBeenCalledWith('hl-1', storageKey);
    });

    it('應正確設定顏色指示條的背景顏色', () => {
      const elements = getElements();
      renderList(elements, [{ id: '1', text: 'test', color: 'blue' }], 'key', jest.fn());
      const indicator = elements.highlightsList.querySelector('.highlight-color-indicator');
      expect(indicator.style.backgroundColor).toBe('var(--hl-blue)');
    });
  });

  // === 視圖切換 ===

  describe('switchView', () => {
    it('切換到 unsynced 時應顯示 unsyncedView 並更新 tab active class', () => {
      const elements = getElements();
      switchView(elements, 'unsynced');

      expect(elements.unsyncedView.style.display).toBe('block');
      expect(elements.loadingState.style.display).toBe('none');

      const unsyncedTab = document.querySelector('.view-tab[data-view="unsynced"]');
      expect(unsyncedTab.classList.contains('active')).toBe(true);

      const currentTab = document.querySelector('.view-tab[data-view="current"]');
      expect(currentTab.classList.contains('active')).toBe(false);
    });

    it('切換到 current 時應隱藏 unsyncedView', () => {
      const elements = getElements();
      // 先切到 unsynced
      switchView(elements, 'unsynced');
      // 再切回 current
      switchView(elements, 'current');

      expect(elements.unsyncedView.style.display).toBe('none');
      const currentTab = document.querySelector('.view-tab[data-view="current"]');
      expect(currentTab.classList.contains('active')).toBe(true);
    });

    it('switchView 不應觸發 loadCurrentTab 或 renderUnsyncedView', () => {
      // 此測試確保 switchView 是純 DOM 操作
      // 若它不呼叫任何外部函數，就不會拋出 ReferenceError
      const elements = getElements();
      expect(() => switchView(elements, 'unsynced')).not.toThrow();
      expect(() => switchView(elements, 'current')).not.toThrow();
    });
  });

  // === appendCards ===

  describe('appendCards', () => {
    function makePage(i) {
      return {
        url: `https://example.com/page${i}`,
        storageKey: `highlights_https://example.com/page${i}`,
        title: `Page ${i}`,
        highlightCount: 1,
        previewHighlights: [{ text: `text ${i}`, truncated: false, color: 'yellow' }],
        remainingCount: 0,
      };
    }

    it('應渲染指定範圍的卡片並回傳 renderedCount', () => {
      const elements = getElements();
      const pages = [makePage(1), makePage(2), makePage(3)];

      const result = appendCards(elements, pages, 0, 2, {
        onOpen: jest.fn(),
        onDelete: jest.fn(),
      });

      expect(result.renderedCount).toBe(2);
      expect(elements.unsyncedView.querySelectorAll('.page-card')).toHaveLength(2);
    });

    it('當還有更多卡片時 hasMore 應為 true', () => {
      const elements = getElements();
      const pages = [makePage(1), makePage(2), makePage(3)];

      const result = appendCards(elements, pages, 0, 2, {
        onOpen: jest.fn(),
        onDelete: jest.fn(),
      });

      expect(result.hasMore).toBe(true);
    });

    it('當已渲染全部卡片時 hasMore 應為 false', () => {
      const elements = getElements();
      const pages = [makePage(1), makePage(2)];

      const result = appendCards(elements, pages, 0, 10, {
        onOpen: jest.fn(),
        onDelete: jest.fn(),
      });

      expect(result.hasMore).toBe(false);
    });

    it('點擊開啟按鈕應呼叫 onOpen 回調', () => {
      const elements = getElements();
      const onOpen = jest.fn();
      const pages = [makePage(1)];

      appendCards(elements, pages, 0, 1, { onOpen, onDelete: jest.fn() });

      const openBtn = elements.unsyncedView.querySelector('.page-open-button');
      openBtn.click();

      expect(onOpen).toHaveBeenCalledWith('https://example.com/page1');
    });

    it('點擊刪除按鈕應呼叫 onDelete 回調並傳入正確參數', () => {
      const elements = getElements();
      const onDelete = jest.fn();
      const pages = [makePage(1)];

      appendCards(elements, pages, 0, 1, { onOpen: jest.fn(), onDelete });

      const card = elements.unsyncedView.querySelector('.page-card');
      const delBtn = card.querySelector('.page-delete-button');
      delBtn.click();

      expect(onDelete).toHaveBeenCalledWith('highlights_https://example.com/page1', card);
    });
  });

  // === renderUnsyncedEmptyState ===

  describe('renderUnsyncedEmptyState', () => {
    it('應清空 unsyncedView 並插入 unsynced-empty 元素', () => {
      const elements = getElements();
      // 先放一些內容
      elements.unsyncedView.innerHTML = '<p>old content</p>';

      renderUnsyncedEmptyState(elements);

      expect(elements.unsyncedView.querySelector('.unsynced-empty')).toBeTruthy();
      expect(elements.unsyncedView.querySelectorAll('p')).toHaveLength(1);
    });
  });

  // === updateUnsyncedBadge ===

  describe('updateUnsyncedBadge', () => {
    it('有頁面時應顯示數字', () => {
      const elements = getElements();
      const pages = [{ storageKey: 'a' }, { storageKey: 'b' }];

      updateUnsyncedBadge(elements, pages);

      expect(elements.unsyncedBadge.textContent).toBe('2');
    });

    it('空陣列時 badge 應清空文字', () => {
      const elements = getElements();

      updateUnsyncedBadge(elements, []);

      expect(elements.unsyncedBadge.textContent).toBe('');
    });
  });
});
