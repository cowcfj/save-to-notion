/**
 * Side Panel UI 狀態管理模組
 *
 * 提供純函數來更新 Side Panel UI 狀態，便於單元測試。
 * 這些函數不直接依賴 Chrome API，僅操作 DOM 元素。
 */

import { UI_MESSAGES } from '../scripts/config/shared/messaging/index.js';

// === 常數 ===

/** @type {number} 每批次渲染的頁面卡片數量 */
export const PAGE_BATCH_SIZE = 10;
/** @type {number} 狀態訊息顯示時長 */
export const MESSAGE_DISPLAY_DURATION_MS = 3000;
/** @type {number} 同步按鈕重新啟用延遲 */
export const SYNC_BUTTON_DEBOUNCE_MS = 2000;
/** @type {number} 開啟按鈕重新啟用延遲 */
export const OPEN_BUTTON_DEBOUNCE_MS = 1000;
/** @type {number} 預覽標註的最大顯示數量 */
export const PREVIEW_HIGHLIGHT_COUNT = 3;
/** @type {number} 預覽文字的最大長度 */
export const PREVIEW_TEXT_MAX_LENGTH = 80;

/** 高亮顏色對應 CSS 變數映射表 */
const COLOR_MAP = {
  yellow: '--hl-yellow',
  green: '--hl-green',
  blue: '--hl-blue',
  red: '--hl-red',
};

/** CSS 變數缺失時的保底色值 */
const COLOR_FALLBACK_VALUES = {
  yellow: '#fde047',
  green: '#86efac',
  blue: '#93c5fd',
  red: '#fca5a5',
};

/** 預設高亮顏色 */
const DEFAULT_HIGHLIGHT_COLOR = 'yellow';

/**
 * 將高亮顏色正規化為 side panel 支援的色票
 *
 * @param {string} color
 * @returns {'yellow'|'green'|'blue'|'red'}
 */
function normalizeHighlightColor(color) {
  if (typeof color !== 'string' || color.length === 0) {
    return DEFAULT_HIGHLIGHT_COLOR;
  }

  return COLOR_MAP[color] ? color : DEFAULT_HIGHLIGHT_COLOR;
}

/**
 * 一次解析 side panel 用到的 highlight 色票，避免迴圈中重複讀取 computed style
 *
 * @returns {Record<'yellow'|'green'|'blue'|'red', string>}
 */
function buildHighlightColorCache() {
  const rootStyle = globalThis.getComputedStyle(document.documentElement);

  return Object.fromEntries(
    Object.entries(COLOR_MAP).map(([color, tokenName]) => {
      const normalizedColor = normalizeHighlightColor(color);
      const resolvedColor = rootStyle.getPropertyValue(tokenName).trim();

      return [
        normalizedColor,
        resolvedColor ||
          COLOR_FALLBACK_VALUES[normalizedColor] ||
          COLOR_FALLBACK_VALUES[DEFAULT_HIGHLIGHT_COLOR],
      ];
    })
  );
}

/**
 * 解析可安全指派給 DOM 的實際背景色
 *
 * @param {string} color
 * @param {Record<string, string>} [colorCache]
 * @returns {string}
 */
function resolveHighlightColor(color, colorCache) {
  const normalizedColor = normalizeHighlightColor(color);

  return (
    colorCache?.[normalizedColor] ||
    COLOR_FALLBACK_VALUES[normalizedColor] ||
    COLOR_FALLBACK_VALUES[DEFAULT_HIGHLIGHT_COLOR]
  );
}

// === 型別定義 ===

/**
 * @typedef {object} SidePanelElements
 * @property {HTMLElement} loadingState - 載入中狀態容器
 * @property {HTMLElement} emptyState - 空狀態容器
 * @property {HTMLElement} highlightsList - 標註列表容器
 * @property {HTMLButtonElement} syncButton - 同步按鈕
 * @property {HTMLButtonElement} openNotionButton - 開啟 Notion 按鈕
 * @property {HTMLElement} statusMessage - 狀態訊息容器
 * @property {HTMLTemplateElement} template - 標註卡片範本
 * @property {HTMLElement} unsyncedView - 待同步視圖容器
 * @property {NodeListOf<HTMLButtonElement>|HTMLButtonElement[]} viewTabs - 視圖切換 tab 按鈕集合
 * @property {HTMLButtonElement} loadMoreBtn - 載入更多按鈕
 * @property {HTMLElement} unsyncedBadge - 待同步數量 badge
 * @property {HTMLTemplateElement} pageCardTemplate - 頁面卡片範本
 * @property {HTMLElement} unsyncedToolbar - 待同步工具列
 * @property {HTMLElement} unsyncedCountLabel - 待同步頁面計數標籤
 * @property {HTMLButtonElement} clearAllBtn - 清除全部按鈕
 * @property {HTMLButtonElement} startHighlightButton - 開始標註按鈕
 */

// === 元素獲取 ===

/**
 * 獲取所有 Side Panel DOM 元素
 *
 * @returns {SidePanelElements}
 */
export function getElements() {
  return {
    loadingState: document.querySelector('#loading-state'),
    emptyState: document.querySelector('#empty-state'),
    highlightsList: document.querySelector('#highlights-list'),
    syncButton: document.querySelector('#sync-button'),
    openNotionButton: document.querySelector('#open-notion-button'),
    statusMessage: document.querySelector('#status-message'),
    template: document.querySelector('#highlight-card-template'),
    unsyncedView: document.querySelector('#unsynced-view'),
    viewTabs: document.querySelectorAll('.view-tab'),
    loadMoreBtn: document.querySelector('#load-more-btn'),
    unsyncedBadge: document.querySelector('#unsynced-badge'),
    pageCardTemplate: document.querySelector('#page-card-template'),
    unsyncedToolbar: document.querySelector('#unsynced-toolbar'),
    unsyncedCountLabel: document.querySelector('#unsynced-count-label'),
    clearAllBtn: document.querySelector('#clear-all-btn'),
    startHighlightButton: document.querySelector('#start-highlight-button'),
  };
}

// === 工具函數 ===

/**
 * 從 URL 中提取 domain 名稱
 *
 * @param {string} url
 * @returns {string}
 */
export function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * 將標註陣列轉換為預覽清單
 *
 * @param {Array} highlights
 * @returns {Array<{text, truncated, color}>}
 */
export function buildPreviewHighlights(highlights) {
  return highlights.slice(0, PREVIEW_HIGHLIGHT_COUNT).map(hl => {
    const rawText = String(hl && typeof hl.text === 'string' ? hl.text : '');
    return {
      text: rawText.slice(0, PREVIEW_TEXT_MAX_LENGTH),
      truncated: rawText.length > PREVIEW_TEXT_MAX_LENGTH,
      color: normalizeHighlightColor(hl?.color),
    };
  });
}

// === 狀態切換 ===

/**
 * 判斷「本頁標註」視圖是否為當前啟用的 tab
 *
 * @param {SidePanelElements} elements
 * @returns {boolean}
 */
export function isCurrentViewActive(elements) {
  const currentTab = elements.viewTabs
    ? Array.from(elements.viewTabs).find(tab => tab.dataset.view === 'current')
    : null;
  return currentTab ? currentTab.classList.contains('active') : true;
}

/**
 * 顯示載入中狀態
 *
 * @param {SidePanelElements} elements
 */
export function showLoading(elements) {
  const isActive = isCurrentViewActive(elements);
  elements.loadingState.style.display = isActive ? 'flex' : 'none';
  elements.emptyState.style.display = 'none';
  elements.highlightsList.style.display = 'none';
  elements.openNotionButton.style.display = 'none';
}

/**
 * 顯示空狀態
 *
 * @param {SidePanelElements} elements
 * @param {string|null} [msg] - 自訂訊息，null 時顯示預設文字
 */
export function showEmpty(elements, msg = null) {
  const isActive = isCurrentViewActive(elements);
  elements.loadingState.style.display = 'none';
  elements.emptyState.style.display = isActive ? 'flex' : 'none';
  elements.highlightsList.style.display = 'none';
  elements.openNotionButton.style.display = 'none';

  if (msg) {
    elements.emptyState.querySelector('p').textContent = msg;
    elements.emptyState.querySelector('.subtitle').style.display = 'none';
  } else {
    elements.emptyState.querySelector('p').textContent = UI_MESSAGES.SIDEPANEL.NO_HIGHLIGHTS;
    elements.emptyState.querySelector('.subtitle').textContent =
      UI_MESSAGES.SIDEPANEL.NO_HIGHLIGHTS_SUBTITLE;
    elements.emptyState.querySelector('.subtitle').style.display = 'block';
  }
}

/**
 * 顯示狀態訊息（不含 timer，timer 由呼叫端的 showTimedMessage 管理）
 *
 * @param {SidePanelElements} elements
 * @param {string} text
 * @param {string} type - 'info' | 'success' | 'error'
 */
export function showMessage(elements, text, type) {
  elements.statusMessage.textContent = text;
  elements.statusMessage.className = `status-message ${type}`;
  elements.statusMessage.style.display = 'block';
}

/**
 * 隱藏狀態訊息，由 sidepanel.js 的 timer callback 呼叫
 *
 * @param {SidePanelElements} elements
 */
export function hideMessage(elements) {
  elements.statusMessage.style.display = 'none';
}

// === 列表渲染 ===

/**
 * 渲染標註列表
 *
 * @param {SidePanelElements} elements
 * @param {Array} highlights
 * @param {string} storageKey
 * @param {(highlightId: string, storageKey: string) => void} onDelete - 刪除回調
 */
export function renderList(elements, highlights, storageKey, onDelete) {
  elements.highlightsList.textContent = '';
  const highlightColorCache = buildHighlightColorCache();

  highlights.forEach(hl => {
    const clone = elements.template.content.cloneNode(true);
    const card = clone.querySelector('.highlight-card');
    const textEl = clone.querySelector('.highlight-text');
    const colorInd = clone.querySelector('.highlight-color-indicator');
    const delBtn = clone.querySelector('.delete-button');

    textEl.textContent = hl.text;

    // side panel 僅接受專案支援色票，未知值一律回退 yellow
    colorInd.style.backgroundColor = resolveHighlightColor(hl?.color, highlightColorCache);

    // 綁定刪除事件（回調由呼叫端 sidepanel.js 的 handleDelete 提供）
    delBtn.addEventListener('click', () => onDelete(hl.id, storageKey));

    elements.highlightsList.append(card);
  });

  elements.loadingState.style.display = 'none';
  elements.emptyState.style.display = 'none';
  elements.highlightsList.style.display = isCurrentViewActive(elements) ? 'flex' : 'none';
}

// === 待同步視圖 ===

/**
 * 切換視圖，只負責 DOM 顯隱與 tab active class，不觸發任何資料載入
 *
 * @param {SidePanelElements} elements
 * @param {'current'|'unsynced'} viewName
 */
export function switchView(elements, viewName) {
  const currentViewEls = [
    elements.loadingState,
    elements.emptyState,
    elements.highlightsList,
    elements.statusMessage,
  ];

  if (viewName === 'unsynced') {
    currentViewEls.forEach(el => el && (el.style.display = 'none'));
    if (elements.syncButton) {
      elements.syncButton.style.display = 'none';
    }
    if (elements.openNotionButton) {
      elements.openNotionButton.style.display = 'none';
    }
    elements.unsyncedView.style.display = 'block';
  } else {
    elements.unsyncedView.style.display = 'none';
    if (elements.syncButton) {
      elements.syncButton.style.display = '';
    }
    if (elements.openNotionButton) {
      elements.openNotionButton.style.display = '';
    }
    if (elements.loadMoreBtn) {
      elements.loadMoreBtn.style.display = 'none';
    }
    if (elements.unsyncedToolbar) {
      elements.unsyncedToolbar.style.display = 'none';
    }
  }

  // 更新 tab 的 active 樣式
  elements.viewTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === viewName);
  });
}

/**
 * 渲染未同步列表空狀態
 *
 * @param {SidePanelElements} elements
 */
export function renderUnsyncedEmptyState(elements) {
  const container = elements.unsyncedView;
  if (!container) {
    return;
  }

  container.textContent = '';
  const emptyMessage = document.createElement('p');
  emptyMessage.className = 'unsynced-empty';
  emptyMessage.textContent = UI_MESSAGES.SIDEPANEL.ALL_SYNCED;
  container.append(emptyMessage);
}

/**
 * 計算未同步頁面數量，更新 Tab 上的 badge
 * 不自行抓取資料，由呼叫端 sidepanel.js 的 refreshUnsyncedBadge() 提供 pages
 *
 * @param {SidePanelElements} elements
 * @param {Array} pages - 已取得的未同步頁面陣列
 */
export function updateUnsyncedBadge(elements, pages) {
  const badge = elements.unsyncedBadge;
  if (!badge) {
    return;
  }
  badge.textContent = pages.length > 0 ? String(pages.length) : '';
}

/**
 * 從 pages 取出指定範圍的卡片並插入 unsyncedView 容器
 *
 * @param {SidePanelElements} elements
 * @param {Array} pages - 完整的未同步頁面陣列
 * @param {number} startIndex - 起始索引
 * @param {number} count - 本次渲染數量
 * @param {{ onOpen: (url: string) => void, onDelete: (storageKey: string, card: HTMLElement) => void }} callbacks
 * @returns {number} 本次渲染的卡片數量
 */
export function appendCards(elements, pages, startIndex, count, callbacks) {
  const container = elements.unsyncedView;
  const template = elements.pageCardTemplate;
  if (!container || !template?.content) {
    return 0;
  }
  const batch = pages.slice(startIndex, startIndex + count);

  batch.forEach(page => {
    const cardNode = template.content.cloneNode(true);
    const card = cardNode.querySelector('.page-card');
    if (!card) {
      return;
    }

    const titleEl = card.querySelector('.page-title');
    if (titleEl) {
      titleEl.textContent = page.title;
    }

    const metaEl = card.querySelector('.page-meta');
    if (metaEl) {
      metaEl.textContent = `${extractDomain(page.url)} • ${UI_MESSAGES.SIDEPANEL.HIGHLIGHT_COUNT(page.highlightCount)}`;
    }

    // 標註預覽
    const previewContainer = card.querySelector('.page-card-previews');
    if (previewContainer) {
      const previewHighlights = Array.isArray(page.previewHighlights) ? page.previewHighlights : [];
      previewHighlights.forEach(highlight => {
        const row = document.createElement('p');
        row.className = `preview-row color-${normalizeHighlightColor(highlight?.color)}`;
        row.textContent = `"${highlight.text}${highlight.truncated ? '...' : ''}"`;
        previewContainer.append(row);
      });
    }

    // +N more
    const remainingEl = card.querySelector('.page-card-remaining');
    if (remainingEl && page.remainingCount > 0) {
      remainingEl.textContent = UI_MESSAGES.SIDEPANEL.REMAINING_COUNT(page.remainingCount);
    }

    // 開啟頁面
    const openButton = card.querySelector('.page-open-button');
    if (openButton && typeof callbacks.onOpen === 'function') {
      openButton.addEventListener('click', () => {
        callbacks.onOpen(page.url);
      });
    }

    // 刪除單頁標注
    const deleteButton = card.querySelector('.page-delete-button');
    if (deleteButton && typeof callbacks.onDelete === 'function') {
      deleteButton.addEventListener('click', () => {
        callbacks.onDelete(page.storageKey, card);
      });
    }

    container.append(card);
  });

  const renderedCount = batch.length;
  const hasMore = startIndex + renderedCount < pages.length;
  if (elements.loadMoreBtn) {
    elements.loadMoreBtn.style.display = hasMore ? 'block' : 'none';
  }

  return renderedCount;
}
