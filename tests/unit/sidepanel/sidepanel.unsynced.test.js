import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  clickUnsyncedTab,
  createDeferred,
  flushMicrotasks,
  initModule,
  Logger,
  RUNTIME_ACTIONS,
  sanitizeUrlForLogging,
  setupUnsyncedTestEnvironment,
  UI_MESSAGES,
} from './sidepanel.shared.js';

describe('Unsynced View (getUnsyncedPages integration)', () => {
  beforeEach(() => {
    setupUnsyncedTestEnvironment();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should filter out synced pages (with notionPageId)', async () => {
    await initModule({
      'highlights_https://a.com/p': {
        highlights: [{ id: '1', text: 'Synced text', color: 'yellow' }],
        updatedAt: 2000,
      },
      'saved_https://a.com/p': { notionPageId: 'page-aaa' }, // 已同步
      'highlights_https://b.com/p': {
        highlights: [{ id: '2', text: 'Unsynced text', color: 'blue' }],
        updatedAt: 1000,
      },
      // b.com 沒有 saved_，是未同步
    });

    // 切換到待同步 tab
    await clickUnsyncedTab();

    const cards = document.querySelectorAll('#unsynced-view .page-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].querySelector('.page-title').textContent).toContain('b.com');
  });

  it('[REGRESSION] should treat a non-object storage snapshot as an empty unsynced list', async () => {
    await initModule(async key => {
      if (key === null) {
        return null;
      }
      return {};
    });
    Logger.error.mockClear();

    await clickUnsyncedTab();

    const emptyMessage = document.querySelector('#unsynced-view .unsynced-empty');
    expect(emptyMessage.textContent).toBe(UI_MESSAGES.SIDEPANEL.ALL_SYNCED);
    expect(Logger.error).not.toHaveBeenCalledWith(
      '[SidePanel] renderUnsyncedView failed after tab switch',
      expect.any(Object)
    );
  });

  it('should show preview text truncated to 80 chars', async () => {
    const longText = 'A'.repeat(100);
    await initModule({
      'highlights_https://c.com/p': {
        highlights: [{ id: '1', text: longText, color: 'yellow' }],
        updatedAt: 1000,
      },
    });

    await clickUnsyncedTab();

    const previewRow = document.querySelector('.preview-row');
    expect(previewRow).not.toBeNull();
    // 文字本身被截斷至 80 字元，加上省略號和引號後顯示
    expect(previewRow.textContent).toContain('...');
    expect(previewRow.textContent).toBe(`"${longText.slice(0, 80)}..."`);
  });

  it('should show +N more when highlights exceed PREVIEW_COUNT (3)', async () => {
    const highlights = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      text: `Highlight ${i}`,
      color: 'yellow',
    }));
    await initModule({
      'highlights_https://d.com/p': { highlights, updatedAt: 1000 },
    });

    await clickUnsyncedTab();

    const remaining = document.querySelector('.page-card-remaining');
    expect(remaining.textContent).toContain('還有 2 筆');
  });

  it('should show load-more button when unsynced pages exceed 10', async () => {
    const storageData = {};
    for (let i = 0; i < 15; i++) {
      storageData[`highlights_https://example.com/page${i}`] = {
        highlights: [{ id: '1', text: 'x', color: 'yellow' }],
        updatedAt: i,
      };
    }
    await initModule(storageData);
    await clickUnsyncedTab();

    const cards = document.querySelectorAll('#unsynced-view .page-card');
    expect(cards).toHaveLength(10); // 第一批只顯示 10 張
    expect(document.querySelector('#load-more-btn').style.display).not.toBe('none');
  });

  it('should load more cards on load-more click', async () => {
    const storageData = {};
    for (let i = 0; i < 15; i++) {
      storageData[`highlights_https://example.com/page${i}`] = {
        highlights: [{ id: '1', text: 'x', color: 'yellow' }],
        updatedAt: i,
      };
    }
    await initModule(storageData);
    await clickUnsyncedTab();

    // 確認點擊前只有 10 張
    const container = document.querySelector('#unsynced-view');
    expect(container.querySelectorAll('.page-card')).toHaveLength(10);

    // 點擊「載入更多」
    document.querySelector('#load-more-btn').click();
    await flushMicrotasks(5);

    const cardsAfter = document.querySelectorAll('#unsynced-view .page-card');
    // 點擊後應比原來多（至少 > 10）
    expect(cardsAfter.length).toBeGreaterThan(10);
    expect(document.querySelector('#load-more-btn').style.display).toBe('none');
  });

  it('should show safe fallback UI when renderUnsyncedView fails after tab switch', async () => {
    await initModule({});

    const error = new Error('unsynced load failed');
    chrome.storage.local.get.mockImplementation(async key => {
      if (key === null) {
        throw error;
      }
      return {};
    });

    await clickUnsyncedTab();

    expect(Logger.error).toHaveBeenCalledWith(
      '[SidePanel] renderUnsyncedView failed after tab switch',
      expect.objectContaining({
        action: 'renderUnsyncedView',
        result: 'failure',
        error,
      })
    );
    expect(document.querySelector('#unsynced-view').textContent).toContain('載入標註失敗');
    expect(document.querySelector('#unsynced-toolbar').style.display).toBe('none');
    expect(document.querySelector('#load-more-btn').style.display).toBe('none');
    expect(document.querySelector('#unsynced-badge').textContent).toBe('');
  });

  it('should ignore stale unsynced render results after switching back to current quickly', async () => {
    await initModule({});

    const deferredUnsyncedLoad = createDeferred();
    chrome.storage.local.get.mockImplementation(async key => {
      if (key === null) {
        return deferredUnsyncedLoad.promise;
      }
      return {};
    });

    const unsyncedTab = document.querySelector('[data-view="unsynced"]');
    const currentTab = document.querySelector('[data-view="current"]');

    unsyncedTab.click();
    await flushMicrotasks(1);
    currentTab.click();
    await flushMicrotasks(1);

    const storageData = {};
    for (let i = 0; i < 15; i++) {
      storageData[`highlights_https://example.com/page${i}`] = {
        highlights: [{ id: '1', text: `x${i}`, color: 'yellow' }],
        updatedAt: i,
      };
    }
    deferredUnsyncedLoad.resolve(storageData);
    await flushMicrotasks(10);

    expect(currentTab.classList.contains('active')).toBe(true);
    expect(unsyncedTab.classList.contains('active')).toBe(false);
    expect(document.querySelector('#unsynced-toolbar').style.display).toBe('none');
    expect(document.querySelector('#load-more-btn').style.display).toBe('none');
  });

  it('should log warning when opening unsynced page fails', async () => {
    await initModule({
      'highlights_https://example.com/p': {
        highlights: [{ id: '1', text: 'open fail', color: 'yellow' }],
        updatedAt: 1000,
      },
    });
    await clickUnsyncedTab();

    const error = new Error('open failed');
    chrome.tabs.create.mockRejectedValueOnce(error);

    document.querySelector('.page-open-button').click();
    await flushMicrotasks(1);

    expect(Logger.warn).toHaveBeenCalledWith(
      '[SidePanel] Failed to open unsynced page tab',
      expect.objectContaining({
        action: 'openUnsyncedPageTab',
        result: 'failure',
        error,
        url: sanitizeUrlForLogging('https://example.com/p'),
      })
    );
  });

  it('badge should show correct unsynced count on init', async () => {
    await initModule({
      'highlights_https://x.com/p': {
        highlights: [{ id: '1', text: 'x', color: 'yellow' }],
        updatedAt: 1,
      },
      'highlights_https://y.com/p': {
        highlights: [{ id: '2', text: 'y', color: 'blue' }],
        updatedAt: 2,
      },
    });

    // badge 在初始化時就應更新
    const badge = document.querySelector('#unsynced-badge');
    expect(badge.textContent).toBe('2');
  });

  it('should log and clear badge when refreshUnsyncedBadge fails during init', async () => {
    const error = new Error('init badge failed');

    await initModule(async key => {
      if (key === null) {
        throw error;
      }
      return {};
    });

    expect(Logger.error).toHaveBeenCalledWith(
      '[SidePanel] refreshUnsyncedBadge failed during init',
      expect.objectContaining({
        action: 'refreshUnsyncedBadge',
        result: 'failure',
        error,
      })
    );
    expect(document.querySelector('#unsynced-badge').textContent).toBe('');
  });

  it('should show empty message when all highlights are synced', async () => {
    await initModule({
      'highlights_https://synced.com/p': {
        highlights: [{ id: '1', text: 'synced', color: 'yellow' }],
        updatedAt: 1000,
      },
      'saved_https://synced.com/p': { notionPageId: 'notion-page-id' },
    });

    await clickUnsyncedTab();

    const unsyncedView = document.querySelector('#unsynced-view');
    expect(unsyncedView.textContent).toContain('已全部同步');
  });

  it('should skip root urls inside getUnsyncedPages (page_* format)', async () => {
    await initModule({
      'page_https://example.com/': { highlights: [{ id: '1', text: 'root' }] },
      'page_https://example.org/': { highlights: [{ id: '2', text: 'another root' }] },
    });
    await clickUnsyncedTab();
    const cards = document.querySelectorAll('#unsynced-view .page-card');
    expect(cards).toHaveLength(0); // root urls are skipped
  });

  it('should skip empty highlights inside getUnsyncedPages (page_* format)', async () => {
    await initModule({
      'page_https://example.com/p': { highlights: [] },
      'page_https://example.com/q': { highlights: null },
    });
    await clickUnsyncedTab();
    const cards = document.querySelectorAll('#unsynced-view .page-card');
    expect(cards).toHaveLength(0);
  });

  it('should include valid page_* items without notion data inside getUnsyncedPages', async () => {
    await initModule({
      'page_https://example.com/p': {
        highlights: [{ id: '1', text: 'valid' }],
        metadata: { title: 'example.com/p' },
      },
    });
    await clickUnsyncedTab();
    const cards = document.querySelectorAll('#unsynced-view .page-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].querySelector('.page-title').textContent).toContain('example.com/p');
  });

  it('should skip root urls inside getUnsyncedPages (highlights_* format)', async () => {
    await initModule({
      'highlights_https://example.com/': { highlights: [{ id: '1', text: 'root legacy' }] },
    });
    await clickUnsyncedTab();
    const cards = document.querySelectorAll('#unsynced-view .page-card');
    expect(cards).toHaveLength(0);
  });

  it('should skip empty highlights inside getUnsyncedPages (highlights_* format)', async () => {
    await initModule({
      'highlights_https://example.com/p': { highlights: [] },
      'highlights_https://example.com/q': [],
    });
    await clickUnsyncedTab();
    const cards = document.querySelectorAll('#unsynced-view .page-card');
    expect(cards).toHaveLength(0);
  });

  // === Step 3: Canonical ownership tests（2026-05-03 completion plan） ===

  it('[CANONICAL] page_<stable> 與 page_<original> 並存時應只顯示一張卡片', async () => {
    await initModule({
      // alias: original → stable
      'url_alias:https://example.com/article?ref=x': 'https://example.com/article',
      // canonical（stable）entry：應被選為 owner
      'page_https://example.com/article': {
        notion: null,
        highlights: [{ id: 'h-stable', text: 'stable text', color: 'yellow' }],
        metadata: { lastUpdated: 2000, title: 'Stable Title' },
      },
      // 殘留的 original entry：alias 命中後應併入同一 canonical group
      'page_https://example.com/article?ref=x': {
        notion: null,
        highlights: [{ id: 'h-orphan', text: 'orphan', color: 'blue' }],
        metadata: { lastUpdated: 1000, title: 'Orphan Title' },
      },
    });

    await clickUnsyncedTab();
    const cards = document.querySelectorAll('#unsynced-view .page-card');
    expect(cards).toHaveLength(1);
    // owner 應為 page_<stable>，title 對應 stable entry
    expect(cards[0].querySelector('.page-title').textContent).toContain('Stable Title');
  });

  it('[CANONICAL] alias 指向空 stable key 時應回退顯示 original page', async () => {
    await initModule({
      // alias 存在但 page_<stable> 不存在
      'url_alias:https://example.com/post?utm=x': 'https://example.com/post',
      // 只剩 page_<original>
      'page_https://example.com/post?utm=x': {
        notion: null,
        highlights: [{ id: 'h-orig', text: 'original content', color: 'yellow' }],
        metadata: { lastUpdated: 5000, title: 'Original Page' },
      },
    });

    await clickUnsyncedTab();
    const cards = document.querySelectorAll('#unsynced-view .page-card');
    // 不應因為 alias 指向空 stable 而消失；canonical group 仍有 page_<original> 作為 fallback owner
    expect(cards).toHaveLength(1);
    expect(cards[0].querySelector('.page-title').textContent).toContain('Original Page');
  });

  it('[CANONICAL] page_<stable> + highlights_<original> 並存時應依 owner 優先序選 page_<stable>', async () => {
    await initModule({
      'url_alias:https://example.com/news?from=fb': 'https://example.com/news',
      'page_https://example.com/news': {
        notion: null,
        highlights: [{ id: 'h1', text: 'canonical', color: 'yellow' }],
        metadata: { lastUpdated: 9000, title: 'Canonical News' },
      },
      'highlights_https://example.com/news?from=fb': [
        { id: 'h2', text: 'legacy orphan', color: 'blue' },
      ],
    });

    await clickUnsyncedTab();
    const cards = document.querySelectorAll('#unsynced-view .page-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].querySelector('.page-title').textContent).toContain('Canonical News');
  });

  describe('deleteUnsyncedPage', () => {
    it('should remove the page from storage, cache, and DOM', async () => {
      const mockKey = 'highlights_https://example.com/delete-test';
      const mockUrl = 'https://example.com/delete-test';
      const mockHl = { text: 'delete me', color: 'yellow', id: '1' };

      // 使用 initModule 正確初始化 sidepanel 的 DOM 與內部資源
      await initModule({
        [mockKey]: [mockHl],
      });

      await clickUnsyncedTab();

      const card = document.querySelector('.page-card');
      expect(card).toBeTruthy();

      const deleteBtn = card.querySelector('.page-delete-button');

      // 模擬 Storage 剛好被清空的狀態（因為只有一台），使後續 getUnsyncedPages 回傳空陣列
      chrome.storage.local.get.mockResolvedValue({});
      chrome.runtime.sendMessage.mockResolvedValue({ success: true });
      chrome.tabs.query.mockResolvedValue([{ id: 777, url: mockUrl }]);

      // Action: 點擊刪除
      deleteBtn.click();
      await jest.runAllTimersAsync();

      // Assert storage
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(mockKey);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.CLEAR_HIGHLIGHTS,
        url: mockUrl,
        tabId: 777,
      });
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalledWith(
        777,
        expect.objectContaining({
          action: RUNTIME_ACTIONS.REMOVE_HIGHLIGHT_DOM,
        })
      );

      // Get the current unsynced count label
      const countLabel = document.querySelector('#unsynced-count-label');
      expect(countLabel.textContent).toBe('0 個頁面');

      // Trigger CSS animation end to remove card
      const animationEndEvent = new Event('animationend');
      card.dispatchEvent(animationEndEvent);

      expect(document.querySelector('.page-card')).toBeNull();
      expect(document.querySelector('.unsynced-empty')).toBeTruthy();
    });

    it('[CANONICAL] 從 canonical owner 刪除時 MUST 清除 reverse alias 對應的 page_<original> 與 highlights_<original>', async () => {
      // Follow-up plan 2026-05-03-highlight-canonical-lock-and-delete-all-cleanup-followup §2：
      // 當 owner 為 page_<stable> 但 storage 中仍存在 page_<original> / highlights_<original>
      // （aliasMap 紀錄 <original> → <stable>），刪除應透過 reverse alias 收集並清掉同 canonical group 全體。
      const stableUrl = 'https://example.com/canonical-target';
      const originalUrl = 'https://example.com/canonical-target?ref=x';
      const stablePageKey = `page_${stableUrl}`;
      const originalPageKey = `page_${originalUrl}`;
      const originalLegacyKey = `highlights_${originalUrl}`;

      await initModule({
        [`url_alias:${originalUrl}`]: stableUrl,
        [stablePageKey]: {
          notion: null,
          highlights: [{ id: 'h-stable', text: 'canonical', color: 'yellow' }],
          metadata: { lastUpdated: 5000, title: 'Canonical Target' },
        },
        [originalPageKey]: {
          notion: null,
          highlights: [{ id: 'h-orphan', text: 'orphan', color: 'blue' }],
          metadata: { lastUpdated: 4000, title: 'Orphan Page' },
        },
        [originalLegacyKey]: [{ id: 'h-legacy', text: 'legacy', color: 'green' }],
      });

      await clickUnsyncedTab();

      const card = document.querySelector('.page-card');
      expect(card).toBeTruthy();
      expect(card.querySelector('.page-title').textContent).toContain('Canonical Target');

      const deleteBtn = card.querySelector('.page-delete-button');
      deleteBtn.click();
      await jest.runAllTimersAsync();

      // chrome.storage.local.remove MUST 被呼叫至少一次,且 keys 涵蓋同 canonical group 全部 member
      // （listener 可能因 jest.isolateModules 多次重綁,但每次參數應一致;只需任一 call 滿足即可）
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(
        expect.arrayContaining([stablePageKey, originalPageKey, originalLegacyKey])
      );
    });
  });

  describe('deleteAllUnsyncedPages', () => {
    it('should remove all unsynced pages when toolbar Clear All is clicked', async () => {
      // Setup 2 pages
      const key1 = 'highlights_https://example.com/p1';
      const key2 = 'highlights_https://example.com/p2';

      await initModule({
        [key1]: [{ text: 'hl 1', color: 'yellow', id: '1' }],
        [key2]: [{ text: 'hl 2', color: 'blue', id: '2' }],
      });

      await clickUnsyncedTab();

      expect(document.querySelectorAll('.page-card')).toHaveLength(2);

      // 模擬 Storage 已被清空，這樣 await getUnsyncedPages() 才會拿到 0
      chrome.storage.local.get.mockResolvedValue({});

      // Action: 點擊全部清除
      const clearBtn = document.querySelector('#clear-all-btn');
      clearBtn.click();

      await jest.runAllTimersAsync();

      // Assert storage
      expect(chrome.storage.local.remove).toHaveBeenCalledWith([key1, key2]);

      // Assert DOM
      expect(document.querySelector('#unsynced-toolbar').style.display).toBe('none');
      expect(document.querySelector('.unsynced-empty')).toBeTruthy();
      expect(document.querySelector('#unsynced-badge').textContent).toBe('');
    });

    it('should do nothing if cachedUnsyncedPages is empty', async () => {
      await initModule({});
      await clickUnsyncedTab();

      const clearBtn = document.querySelector('#clear-all-btn');
      chrome.storage.local.remove.mockClear();

      if (clearBtn && clearBtn.style.display !== 'none') {
        clearBtn.click();
      }
      expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    });

    it('[CANONICAL] deleteAllUnsyncedPages MUST 清除每張卡片同 canonical group 的全部 keys', async () => {
      // Follow-up plan 2026-05-03-highlight-canonical-lock-and-delete-all-cleanup-followup §3：
      // clear-all 路徑必須與 single-delete 一致,使用 canonical-aware 的 cleanup helper,
      // 不能只刪 entry.storageKey 而漏掉同 canonical group 的其他 member。
      const stable1 = 'https://example.com/article-one';
      const original1 = 'https://example.com/article-one?utm=fb';
      const stable2 = 'https://example.com/article-two';

      await initModule({
        // Page 1: alias 命中,canonical owner 為 page_<stable1>,但 page_<original1> 殘留
        [`url_alias:${original1}`]: stable1,
        [`page_${stable1}`]: {
          notion: null,
          highlights: [{ id: 'a-1', text: 'a', color: 'yellow' }],
          metadata: { lastUpdated: 1000, title: 'Article One' },
        },
        [`page_${original1}`]: {
          notion: null,
          highlights: [{ id: 'a-orphan', text: 'orphan', color: 'blue' }],
          metadata: { lastUpdated: 900, title: 'Orphan One' },
        },
        // Page 2: 無 alias,canonical owner 直接是 page_<stable2>
        [`page_${stable2}`]: {
          notion: null,
          highlights: [{ id: 'b-1', text: 'b', color: 'yellow' }],
          metadata: { lastUpdated: 2000, title: 'Article Two' },
        },
      });

      await clickUnsyncedTab();
      expect(document.querySelectorAll('.page-card')).toHaveLength(2);

      // 隔離本次 click 觸發的 remove 呼叫,排除 init / render 階段的雜訊
      chrome.storage.local.remove.mockClear();

      const clearBtn = document.querySelector('#clear-all-btn');
      clearBtn.click();
      await jest.runAllTimersAsync();

      // 至少要有一次 remove call 涵蓋所有 canonical group keys（含 page 1 的 alias original 殘留）
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(
        expect.arrayContaining([`page_${stable1}`, `page_${original1}`, `page_${stable2}`])
      );
    });
  });
});
