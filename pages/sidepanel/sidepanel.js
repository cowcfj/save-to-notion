/**
 * Side Panel 入口文件
 *
 * 職責：
 * - 監聽分頁切換，獲取當前分頁的穩定 URL
 * - 從 Storage 讀取標註並渲染 UI
 * - 監聽 Storage 變化自動更新
 */

/* global chrome */

import { normalizeUrl } from '../../scripts/utils/urlUtils.js';
import {
  SAVED_PREFIX,
  HIGHLIGHTS_PREFIX,
  PAGE_PREFIX,
  URL_ALIAS_PREFIX,
} from '../../scripts/config/shared/storage.js';
import { UI_MESSAGES } from '../../scripts/config/shared/messages.js';
import { RUNTIME_ACTIONS } from '../../scripts/config/shared/runtimeActions.js';
import { sanitizeApiError } from '../../scripts/utils/ApiErrorSanitizer.js';
import { ErrorHandler } from '../../scripts/utils/ErrorHandler.js';
import Logger from '../../scripts/utils/Logger.js';
import * as UI from './sidepanelUI.js';
import { pickHighlightsFromStorage } from '../../scripts/highlighter/core/HighlightLookupResolver.js';
import { getHighlightList } from './sidepanel-data-transforms.js';
import {
  _resolveStorageForUrl,
  findPageStateFromStorage,
  checkSavedData,
  _computeDeleteResult,
  _removeStorageKeyWithCanonicalCleanup,
} from './sidepanel-storage.js';
import {
  beginCurrentViewRequest,
  isCurrentViewRequestActive,
  loadCurrentTab,
  applyCurrentPageTargets,
  renderCurrentEmptyState,
  renderCurrentHighlightList,
} from './sidepanel-current-view.js';
import {
  beginUnsyncedViewRequest,
  refreshUnsyncedBadge,
  scheduleUnsyncedBadgeRefresh,
  refreshUnsyncedViewIfActive,
  renderUnsyncedView,
  deleteAllUnsyncedPages,
  loadMoreCards,
} from './sidepanel-unsynced-view.js';

// === 共享狀態（保留於入口，UI 模組不直接存取） ===

let els = {};

let statusMessageTimeoutId;

// 快取：避免每次 storage 變化都重新解析 URL
let cachedStableUrl = null;
let cachedTabUrl = null;
let currentPageHasSavedData = false;
let currentActiveView = 'current';
let currentViewRequestId = 0;
let unsyncedViewRequestId = 0;
const START_HIGHLIGHT_ERROR_CONTEXT = 'sidepanel_start_highlight';
const UNKNOWN_ERROR_MESSAGE = 'Unknown error';

/** @type {Array<object> | null} 快取的未同步頁面資料 */
let cachedUnsyncedPages = null;
/** @type {number} 目前已渲染的卡片數量 */
let displayedCardCount = 0;
/** @type {ReturnType<typeof setTimeout> | null} 未同步 badge 更新的 debounce timer */
let unsyncedBadgeTimer = null;

// === 共享狀態上下文 (State Context) ===

const context = {
  get els() {
    return els;
  },
  get currentActiveView() {
    return currentActiveView;
  },
  set currentActiveView(val) {
    currentActiveView = val;
  },
  get currentViewRequestId() {
    return currentViewRequestId;
  },
  set currentViewRequestId(val) {
    currentViewRequestId = val;
  },
  get unsyncedViewRequestId() {
    return unsyncedViewRequestId;
  },
  set unsyncedViewRequestId(val) {
    unsyncedViewRequestId = val;
  },
  get cachedStableUrl() {
    return cachedStableUrl;
  },
  set cachedStableUrl(val) {
    cachedStableUrl = val;
  },
  get cachedTabUrl() {
    return cachedTabUrl;
  },
  set cachedTabUrl(val) {
    cachedTabUrl = val;
  },
  get currentPageHasSavedData() {
    return currentPageHasSavedData;
  },
  set currentPageHasSavedData(val) {
    currentPageHasSavedData = val;
  },
  get cachedUnsyncedPages() {
    return cachedUnsyncedPages;
  },
  set cachedUnsyncedPages(val) {
    cachedUnsyncedPages = val;
  },
  get displayedCardCount() {
    return displayedCardCount;
  },
  set displayedCardCount(val) {
    displayedCardCount = val;
  },
  get unsyncedBadgeTimer() {
    return unsyncedBadgeTimer;
  },
  set unsyncedBadgeTimer(val) {
    unsyncedBadgeTimer = val;
  },
  // 核心協調與訊息方法
  showTimedMessage,
  applySyncButtonSavedState,
  resetSyncButtonForNoPage,
  setActiveView,
  // 其他視圖模組所需的協調方法
  renderHighlightsForUrl,
  handleDelete,
};

// === UI 協調層 ===

/**
 * 記錄目前啟用中的視圖名稱。
 *
 * @param {'current' | 'unsynced'} viewName
 */
function setActiveView(viewName) {
  currentActiveView = viewName;
}

function applySyncButtonSavedState(hasSavedData) {
  els.syncButton.disabled = !hasSavedData;
  els.syncButton.title = hasSavedData ? '' : UI_MESSAGES.SIDEPANEL.PAGE_NOT_SAVED;
  UI.applyUnsavedPageNotice(els, hasSavedData);
}

/**
 * 將同步按鈕與未保存提示 banner 重置為「無載入頁面」狀態。
 *
 * 用於 loadCurrentTab 的早期退出與錯誤分支：當頁面不支援、stale request 或抓取失敗時，
 * 上一個分頁殘留的 banner 不應繼續顯示在 NOT_SUPPORTED / LOAD_FAILED 文案之上。
 */
function resetSyncButtonForNoPage() {
  if (els.syncButton) {
    els.syncButton.disabled = true;
    els.syncButton.title = '';
  }
  if (els.openNotionButton) {
    els.openNotionButton.style.display = 'none';
    els.openNotionButton.disabled = true;
    if (els.openNotionButton.dataset.targetUrl) {
      delete els.openNotionButton.dataset.targetUrl;
    }
    els.openNotionButton.title = '';
    els.openNotionButton.removeAttribute('aria-label');
  }
  UI.applyUnsavedPageNotice(els, true);
  currentPageHasSavedData = false;
}

/**
 * 顯示計時狀態訊息，timer 到期後自動隱藏
 * 統一管理 statusMessageTimeoutId，避免 timer 狀態分散
 *
 * @param {string} text
 * @param {string} type - 'info' | 'success' | 'error'
 */
function showTimedMessage(text, type) {
  clearTimeout(statusMessageTimeoutId);
  UI.showMessage(els, text, type);
  statusMessageTimeoutId = setTimeout(() => {
    UI.hideMessage(els);
  }, UI.MESSAGE_DISPLAY_DURATION_MS);
}

/**
 * 取得必要 DOM 元素，缺失時立即失敗以暴露模板退化。
 *
 * @template {Element} T
 * @param {T | null | undefined} element
 * @param {string} elementName
 * @returns {T}
 */
function requireElement(element, elementName) {
  if (!element) {
    throw new Error(`[SidePanel] 缺少必要的 DOM 元素：${elementName}`);
  }
  return element;
}

// === 業務邏輯 ===

async function init() {
  els = UI.getElements();
  els.startHighlightButton = requireElement(els.startHighlightButton, 'startHighlightButton');
  setActiveView('current');

  // 1. 綁定按鈕事件
  els.startHighlightButton.addEventListener('click', handleStartHighlightClick);
  els.syncButton.addEventListener('click', handleSyncClick);
  els.openNotionButton.addEventListener('click', handleOpenNotionClick);
  els.clearAllBtn?.addEventListener('click', () => deleteAllUnsyncedPages(context));

  // 2. 監聽當前分頁變化
  chrome.tabs.onActivated.addListener(handleTabChange);
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active) {
      handleTabChange({ tabId });
    }
  });

  // 3. 監聽 Storage 變化 (即時更新)
  chrome.storage.onChanged.addListener(handleStorageChange);

  // 4. Tab bar 切換
  document.querySelectorAll('.view-tab').forEach(tab => {
    tab.addEventListener('click', handleViewTabClick);
  });

  // 5. 載入更多
  const loadMoreBtn = els.loadMoreBtn;
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => loadMoreCards(context));
  }

  // 6. 初始化載入當前分頁，並更新 badge
  await loadCurrentTab(context, null, beginCurrentViewRequest(context));
  await refreshUnsyncedBadge(context, '[SidePanel] refreshUnsyncedBadge failed during init');
}

/**
 * 處理分頁切換
 *
 * @param {chrome.tabs.TabActiveInfo} activeInfo
 */
async function handleTabChange(activeInfo) {
  await loadCurrentTab(context, activeInfo.tabId, beginCurrentViewRequest(context));
}

/**
 * @param {string|null|undefined} targetKey
 * @returns {string}
 */
function resolveTargetUrlFromKey(targetKey) {
  if (!targetKey) {
    return '';
  }
  if (targetKey.startsWith(PAGE_PREFIX)) {
    return targetKey.slice(PAGE_PREFIX.length);
  }
  return targetKey.replace(HIGHLIGHTS_PREFIX, '');
}

/**
 * 根據 URL 渲染標註列表
 * Phase 3：優先讀取 page_* 新格式，再回退 highlights_*。
 *
 * @param {string} url
 * @param {string} originalTabUrl
 * @param {number} requestId
 */
async function renderHighlightsForUrl(url, originalTabUrl, requestId) {
  const normalizedUrl = normalizeUrl(url);
  const normalizedOriginal = normalizeUrl(originalTabUrl);

  const { contract, storageData } = await _resolveStorageForUrl(normalizedUrl, normalizedOriginal);
  const { highlights: rawHighlights, resolvedKey } = pickHighlightsFromStorage(
    contract,
    storageData
  );
  const { pageKey, notionData } = findPageStateFromStorage(contract, storageData);

  const targetKey = resolvedKey ?? pageKey;

  if (!isCurrentViewRequestActive(context, requestId)) {
    return;
  }

  const highlights = getHighlightList(rawHighlights);
  const hasSavedData = await checkSavedData(notionData, targetKey);

  if (!isCurrentViewRequestActive(context, requestId)) {
    return;
  }

  applyCurrentPageTargets(
    context,
    resolveTargetUrlFromKey(targetKey),
    originalTabUrl,
    hasSavedData
  );

  if (highlights.length === 0) {
    renderCurrentEmptyState(context, hasSavedData);
    return;
  }

  renderCurrentHighlightList(context, highlights, targetKey, hasSavedData);
}

/**
 * @param {string} highlightId
 * @returns {Promise<void>}
 * @private
 */
async function _notifyActiveTabHighlightRemoved(highlightId) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs?.[0]?.id) {
    return;
  }

  await chrome.tabs
    .sendMessage(tabs[0].id, {
      action: RUNTIME_ACTIONS.REMOVE_HIGHLIGHT_DOM,
      highlightId,
    })
    .catch(error => {
      Logger.error('Failed to send remove highlight DOM message', {
        action: RUNTIME_ACTIONS.REMOVE_HIGHLIGHT_DOM,
        result: 'failure',
        error,
        description: 'Content script message delivery failed',
      });
    });
}

/**
 * 刪除單個標註
 *
 * Phase 4：當刪除導致整個 storageKey 不再有意義（無 highlights 且無 notion），
 * 透過共享 cleanup helper（planDeleteCleanup）取得相關 legacy key 一併清除，
 * 不在 sidepanel 端自行決定 legacy key 範圍。
 *
 * @param {string} highlightId
 * @param {string} storageKey
 */
async function handleDelete(highlightId, storageKey) {
  try {
    const result = await chrome.storage.local.get(storageKey);
    if (!result[storageKey]) {
      return;
    }

    const { newData, shouldRemove } = _computeDeleteResult(
      result[storageKey],
      highlightId,
      storageKey
    );

    if (shouldRemove) {
      // Phase 4：透過 helper 找出所有相關 legacy key 一併移除
      await _removeStorageKeyWithCanonicalCleanup(storageKey);
    } else {
      await chrome.storage.local.set({ [storageKey]: newData });
    }

    // 通知 Content script 清除 DOM 高亮
    await _notifyActiveTabHighlightRemoved(highlightId);
  } catch (error) {
    Logger.error('Failed to delete highlight', { error });
  }
}

/**
 * 點擊開始標註按鈕
 */
async function handleStartHighlightClick() {
  els.startHighlightButton.disabled = true;
  showTimedMessage(UI_MESSAGES.POPUP.HIGHLIGHT_STARTING, 'info');

  try {
    const response = await chrome.runtime.sendMessage({
      action: RUNTIME_ACTIONS.START_HIGHLIGHT,
    });

    if (response?.success) {
      showTimedMessage(UI_MESSAGES.POPUP.HIGHLIGHT_ACTIVATED, 'success');
    } else {
      const safe = sanitizeApiError(
        response?.error || UNKNOWN_ERROR_MESSAGE,
        START_HIGHLIGHT_ERROR_CONTEXT
      );
      const msg = ErrorHandler.formatUserMessage(safe);

      Logger.error('[SidePanel] startHighlight failed', {
        action: 'startHighlight',
        operation: 'highlight-init',
        result: 'failure',
        error: safe,
      });
      showTimedMessage(`${UI_MESSAGES.POPUP.HIGHLIGHT_FAILED_PREFIX}${msg}`, 'error');
    }
  } catch (error) {
    const safe = sanitizeApiError(error, START_HIGHLIGHT_ERROR_CONTEXT);
    const msg = ErrorHandler.formatUserMessage(safe);

    Logger.error('[SidePanel] startHighlight failed', {
      action: 'startHighlight',
      operation: 'runtime-sendMessage',
      result: 'failure',
      error,
      reason: safe,
    });
    showTimedMessage(`${UI_MESSAGES.POPUP.HIGHLIGHT_FAILED_PREFIX}${msg}`, 'error');
  } finally {
    setTimeout(() => {
      els.startHighlightButton.disabled = false;
    }, UI.SYNC_BUTTON_DEBOUNCE_MS);
  }
}

/**
 * 點擊同步按鈕
 */
async function handleSyncClick() {
  els.syncButton.disabled = true;
  showTimedMessage(UI_MESSAGES.SIDEPANEL.SYNCING, 'info');

  try {
    const response = await chrome.runtime.sendMessage({ action: RUNTIME_ACTIONS.SAVE_PAGE });
    if (response?.success) {
      showTimedMessage(UI_MESSAGES.SIDEPANEL.SYNC_SUCCESS, 'success');
    } else {
      Logger.error('[SidePanel] savePage failed', {
        error: sanitizeApiError(response?.error || UNKNOWN_ERROR_MESSAGE, 'save_page'),
      });
      showTimedMessage(UI_MESSAGES.SIDEPANEL.SYNC_FAILED, 'error');
      applySyncButtonSavedState(currentPageHasSavedData);
    }
  } catch (error) {
    Logger.error('[SidePanel] savePage failed', {
      error: sanitizeApiError(error, 'save_page'),
    });
    showTimedMessage(UI_MESSAGES.SIDEPANEL.SYNC_FAILED, 'error');
    applySyncButtonSavedState(currentPageHasSavedData);
  }
}

/**
 * 點擊在 Notion 打開按鈕
 */
async function handleOpenNotionClick() {
  els.openNotionButton.disabled = true;
  showTimedMessage(UI_MESSAGES.SIDEPANEL.OPENING, 'info');

  try {
    const url = els.openNotionButton.dataset.targetUrl;
    const response = await chrome.runtime.sendMessage({
      action: RUNTIME_ACTIONS.OPEN_NOTION_PAGE,
      url,
    });
    if (response?.success) {
      showTimedMessage(UI_MESSAGES.SIDEPANEL.OPEN_SUCCESS, 'success');
    } else {
      Logger.error('[SidePanel] openNotionPage failed', {
        error: sanitizeApiError(response?.error || UNKNOWN_ERROR_MESSAGE, 'open_page'),
      });
      showTimedMessage(UI_MESSAGES.SIDEPANEL.OPEN_FAILED, 'error');
    }
  } catch (error) {
    Logger.error('[SidePanel] openNotionPage failed', {
      error: sanitizeApiError(error, 'open_page'),
    });
    showTimedMessage(UI_MESSAGES.SIDEPANEL.OPEN_FAILED, 'error');
  } finally {
    setTimeout(() => {
      els.openNotionButton.disabled = false;
    }, UI.OPEN_BUTTON_DEBOUNCE_MS);
  }
}

/**
 * @param {string} key
 * @returns {boolean}
 */
function isSidepanelRefreshStorageKey(key) {
  return (
    key.startsWith(PAGE_PREFIX) ||
    key.startsWith(HIGHLIGHTS_PREFIX) ||
    key.startsWith(SAVED_PREFIX) ||
    key.startsWith(URL_ALIAS_PREFIX)
  );
}

function reloadCurrentViewAfterStorageChange() {
  // 快速路徑：如果已有快取 URL，直接重新渲染，跳過 tab 查詢和 sendMessage
  if (cachedStableUrl && cachedTabUrl) {
    renderHighlightsForUrl(cachedStableUrl, cachedTabUrl, beginCurrentViewRequest(context)).catch(
      error => Logger.error('[SidePanel] renderHighlightsForUrl failed', { error })
    );
    return;
  }

  // 初始狀態尚無快取，走完整路徑
  loadCurrentTab(context, null, beginCurrentViewRequest(context));
}

/**
 * 處理 Storage 變化
 * 使用快取 URL 避免重新查詢 tab 和 sendMessage，大幅降低延遲
 *
 * @param {object} changes
 * @param {string} namespace
 */
function handleStorageChange(changes, namespace) {
  if (namespace !== 'local') {
    return;
  }
  // Phase 3：只要 page_*、highlights_*、saved_* 或 url_alias:* 有變，就重整當前頁面資料
  const hasRelevantChanges = Object.keys(changes).some(key => isSidepanelRefreshStorageKey(key));

  if (!hasRelevantChanges) {
    return;
  }

  // Always keep the unsynced badge in sync with storage (debounced to avoid rapid get(null) calls)
  scheduleUnsyncedBadgeRefresh(context);
  reloadCurrentViewAfterStorageChange();
  refreshUnsyncedViewIfActive(context);
}

// 啟動
document.addEventListener('DOMContentLoaded', init);

// === 待同步視圖切換邏輯 ===

/**
 * Tab bar 點擊事件處理
 *
 * @param {Event} event
 */
function handleViewTabClick(event) {
  const viewName = event.currentTarget.dataset.view;
  if (!viewName) {
    return;
  }
  setActiveView(viewName);
  // UI 層只做 DOM 切換，業務回調在此協調
  UI.switchView(els, viewName);
  if (viewName === 'unsynced') {
    renderUnsyncedView(
      context,
      '[SidePanel] renderUnsyncedView failed after tab switch',
      beginUnsyncedViewRequest(context)
    );
  } else {
    loadCurrentTab(context, null, beginCurrentViewRequest(context));
  }
}
