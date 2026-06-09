/**
 * Side Panel 入口文件
 *
 * 職責：
 * - 監聽分頁切換，獲取當前分頁的穩定 URL
 * - 從 Storage 讀取標註並渲染 UI
 * - 監聽 Storage 變化自動更新
 */

/* global chrome */

import { normalizeUrl, computeStableUrl } from '../../scripts/utils/urlUtils.js';
import {
  SAVED_PREFIX,
  HIGHLIGHTS_PREFIX,
  PAGE_PREFIX,
  URL_ALIAS_PREFIX,
} from '../../scripts/config/shared/storage.js';
import { RESTRICTED_PROTOCOLS } from '../../scripts/config/shared/core.js';
import { UI_MESSAGES } from '../../scripts/config/shared/messages.js';
import { RUNTIME_ACTIONS } from '../../scripts/config/shared/runtimeActions.js';
import { sanitizeApiError } from '../../scripts/utils/ApiErrorSanitizer.js';
import { sanitizeUrlForLogging } from '../../scripts/utils/LogSanitizer.js';
import { ErrorHandler } from '../../scripts/utils/ErrorHandler.js';
import Logger from '../../scripts/utils/Logger.js';
import * as UI from './sidepanelUI.js';
import { pickHighlightsFromStorage } from '../../scripts/highlighter/core/HighlightLookupResolver.js';
import {
  normalizeStorageSnapshot,
  getHighlightList,
  buildPageEntry,
  buildLegacyPageEntry,
  _buildAliasMap,
  _collectDeletionKeys,
  resolveUnsyncedOwnership,
} from './sidepanel-data-transforms.js';
import {
  _resolveStorageForUrl,
  findPageStateFromStorage,
  checkSavedData,
  _computeDeleteResult,
  _removeStorageKeyWithCanonicalCleanup,
  _extractUrlFromStorageKey,
} from './sidepanel-storage.js';

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

// === UI 協調層 ===

/**
 * 將 storage key 壓縮為非敏感類型標識，避免日誌洩漏完整 URL。
 *
 * @param {string} storageKey
 * @returns {'page' | 'highlights' | 'unknown'}
 */
function getStorageKeyType(storageKey) {
  if (storageKey.startsWith(PAGE_PREFIX)) {
    return 'page';
  }
  if (storageKey.startsWith(HIGHLIGHTS_PREFIX)) {
    return 'highlights';
  }
  return 'unknown';
}

/**
 * 待同步視圖讀取失敗時，退回到安全且可預期的 UI 狀態。
 *
 * @param {string} message
 */
function renderUnsyncedFallbackState(message = UI_MESSAGES.SIDEPANEL.LOAD_FAILED) {
  cachedUnsyncedPages = [];
  displayedCardCount = 0;

  if (els.unsyncedView) {
    els.unsyncedView.textContent = '';
    const fallbackMessage = document.createElement('p');
    fallbackMessage.className = 'unsynced-empty';
    fallbackMessage.textContent = message;
    els.unsyncedView.append(fallbackMessage);
  }

  if (els.unsyncedToolbar) {
    els.unsyncedToolbar.style.display = 'none';
  }
  if (els.loadMoreBtn) {
    els.loadMoreBtn.style.display = 'none';
  }

  UI.updateUnsyncedBadge(els, []);
}

/**
 * 記錄目前啟用中的視圖名稱。
 *
 * @param {'current' | 'unsynced'} viewName
 */
function setActiveView(viewName) {
  currentActiveView = viewName;
}

/**
 * 建立 current view 的最新請求序號。
 *
 * @returns {number}
 */
function beginCurrentViewRequest() {
  currentViewRequestId += 1;
  return currentViewRequestId;
}

/**
 * 建立 unsynced view 的最新請求序號。
 *
 * @returns {number}
 */
function beginUnsyncedViewRequest() {
  unsyncedViewRequestId += 1;
  return unsyncedViewRequestId;
}

/**
 * 檢查 current view 的非同步請求是否仍可安全套用 UI。
 *
 * @param {number} requestId
 * @returns {boolean}
 */
function isCurrentViewRequestActive(requestId) {
  return currentActiveView === 'current' && currentViewRequestId === requestId;
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
 * 檢查 unsynced view 的非同步請求是否仍可安全套用 UI。
 *
 * @param {number} requestId
 * @returns {boolean}
 */
function isUnsyncedViewRequestActive(requestId) {
  return currentActiveView === 'unsynced' && unsyncedViewRequestId === requestId;
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
 * 從 storage 抓取未同步頁面後更新 badge
 * 統一 badge 資料流，確保 storage 變更與初始化路徑一致
 *
 * @param {string} [logMessage] - 失敗時使用的日誌訊息
 * @returns {Promise<void>}
 */
async function refreshUnsyncedBadge(logMessage = '[SidePanel] refreshUnsyncedBadge failed') {
  try {
    const pages = await getUnsyncedPages();
    UI.updateUnsyncedBadge(els, pages);
  } catch (error) {
    Logger.error(logMessage, { error });
    UI.updateUnsyncedBadge(els, []);
  }
}

/**
 * 取出下一批卡片並插入 unsyncedView，統一 displayedCardCount / hasMore / 補位邏輯
 *
 * @param {number} count - 本次渲染數量
 */
function appendNextUnsyncedBatch(count) {
  const renderedCount = UI.appendCards(els, cachedUnsyncedPages, displayedCardCount, count, {
    onOpen: url => {
      chrome.tabs.create({ url }).catch(error => {
        Logger.warn('[SidePanel] Failed to open unsynced page tab', {
          error,
          url: sanitizeUrlForLogging(url),
        });
      });
    },
    onDelete: (storageKey, card) => {
      const page = cachedUnsyncedPages?.find(item => item.storageKey === storageKey);
      deleteUnsyncedPage(storageKey, card).catch(error => {
        Logger.warn('[SidePanel] Failed to delete unsynced page card', {
          error,
          storageKeyType: getStorageKeyType(storageKey),
          url: sanitizeUrlForLogging(page?.url),
        });
      });
    },
  });

  displayedCardCount += renderedCount;
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

/**
 * 從 chrome.storage.local 取出所有未同步頁面的標註資料。
 *
 * Phase 4：透過 resolveUnsyncedOwnership 將 page_* / highlights_* / url_alias:* 歸併到
 * 單一 canonical identity，避免 stable / original 雙 canonical 同時顯示為兩張卡片。
 *
 * @returns {Promise<Array<{url, storageKey, title, highlightCount, lastUpdated, previewHighlights, remainingCount}>>}
 */
async function getUnsyncedPages() {
  const all = normalizeStorageSnapshot(await chrome.storage.local.get(null));
  const owners = resolveUnsyncedOwnership(all);

  // alias map：buildLegacyPageEntry 仍需用以查詢 saved_<canonical>，避免重複建構
  const aliasMap = _buildAliasMap(all);

  const pages = [];
  for (const [, owner] of owners) {
    let entry;
    if (owner.format === 'page') {
      entry = buildPageEntry(owner.ownerKey, owner.ownerUrl, owner.ownerValue);
    } else {
      entry = buildLegacyPageEntry(owner.ownerKey, owner.ownerUrl, owner.ownerValue, {
        all,
        aliasMap,
      });
    }
    if (entry) {
      // Phase 4 follow-up（2026-05-03 plan §3）：每筆 entry 預先計算 canonical-aware deletionKeys,
      // 讓 deleteAllUnsyncedPages 與 deleteUnsyncedPage 共用同一條規則。
      entry.deletionKeys = _collectDeletionKeys(owner.ownerUrl, owner.ownerKey, all, aliasMap);
      pages.push(entry);
    }
  }

  return pages.toSorted((pa, pb) => pb.lastUpdated - pa.lastUpdated);
}

async function init() {
  els = UI.getElements();
  els.startHighlightButton = requireElement(els.startHighlightButton, 'startHighlightButton');
  setActiveView('current');

  // 1. 綁定按鈕事件
  els.startHighlightButton.addEventListener('click', handleStartHighlightClick);
  els.syncButton.addEventListener('click', handleSyncClick);
  els.openNotionButton.addEventListener('click', handleOpenNotionClick);
  els.clearAllBtn?.addEventListener('click', deleteAllUnsyncedPages);

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
    loadMoreBtn.addEventListener('click', loadMoreCards);
  }

  // 6. 初始化載入當前分頁，並更新 badge
  await loadCurrentTab(null, beginCurrentViewRequest());
  await refreshUnsyncedBadge('[SidePanel] refreshUnsyncedBadge failed during init');
}

/**
 * 處理分頁切換
 *
 * @param {chrome.tabs.TabActiveInfo} activeInfo
 */
async function handleTabChange(activeInfo) {
  await loadCurrentTab(activeInfo.tabId, beginCurrentViewRequest());
}

/**
 * @param {number|null} specificTabId
 * @returns {Promise<chrome.tabs.Tab|undefined>}
 */
async function resolveCurrentTab(specificTabId) {
  if (specificTabId) {
    return chrome.tabs.get(specificTabId);
  }
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

/**
 * @param {chrome.tabs.Tab|undefined} tab
 * @returns {boolean}
 */
function isUnsupportedTab(tab) {
  if (!tab?.url) {
    return true;
  }
  try {
    return RESTRICTED_PROTOCOLS.includes(new URL(tab.url).protocol);
  } catch {
    return true;
  }
}

/**
 * @param {number} requestId
 * @param {string} message
 */
function showCurrentViewEmptyIfActive(requestId, message) {
  if (isCurrentViewRequestActive(requestId)) {
    UI.showEmpty(els, message);
  }
}

/**
 * 主要載入流程
 *
 * @param {number|null} specificTabId
 * @param {number} [requestId]
 */
async function loadCurrentTab(specificTabId = null, requestId = beginCurrentViewRequest()) {
  cachedStableUrl = null;
  cachedTabUrl = null;
  // 重置 banner 與 sync 按鈕，避免上一個分頁的「未保存」提示殘留到 NOT_SUPPORTED / LOAD_FAILED 等狀態
  resetSyncButtonForNoPage();
  if (isCurrentViewRequestActive(requestId)) {
    UI.showLoading(els);
  }

  try {
    const tab = await resolveCurrentTab(specificTabId);
    if (isUnsupportedTab(tab)) {
      showCurrentViewEmptyIfActive(requestId, UI_MESSAGES.SIDEPANEL.NOT_SUPPORTED);
      return;
    }

    // 核心: 解析穩定 URL (3層 Fallback)
    const stableUrl = await getStableUrlForTab(tab.id, tab.url);

    if (!isCurrentViewRequestActive(requestId)) {
      return;
    }

    // 快取 URL 供 handleStorageChange 快速路徑使用
    cachedStableUrl = stableUrl;
    cachedTabUrl = tab.url;

    // 獲取資料
    await renderHighlightsForUrl(stableUrl, tab.url, requestId);
  } catch (error) {
    Logger.error('[SidePanel] Failed to load tab', { error });
    showCurrentViewEmptyIfActive(requestId, UI_MESSAGES.SIDEPANEL.LOAD_FAILED);
  }
}

/**
 * 獲取穩定 URL (3層 Fallback)
 *
 * @param {number} tabId
 * @param {string} url
 * @returns {Promise<string>}
 */
async function getStableUrlForTab(tabId, url) {
  // 1. 向 Content Script 請求已解析的 __NOTION_STABLE_URL__
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      action: RUNTIME_ACTIONS.GET_STABLE_URL,
    });
    if (response?.stableUrl) {
      return response.stableUrl;
    }
  } catch {
    // Content script 還沒準備好或不存在，默默允許進入 Fallback
  }

  // 2. Fallback: 使用純字串規則 computeStableUrl
  const computed = computeStableUrl(url);
  if (computed) {
    return computed;
  }

  // 3. 最終 Fallback: 直接 normalizeUrl
  return normalizeUrl(url);
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
 * @param {string} targetUrl
 * @param {string} originalTabUrl
 * @param {boolean} hasSavedData
 */
function applyCurrentPageTargets(targetUrl, originalTabUrl, hasSavedData) {
  els.syncButton.dataset.targetUrl = targetUrl;
  els.openNotionButton.dataset.targetUrl = originalTabUrl;

  currentPageHasSavedData = hasSavedData;
  applySyncButtonSavedState(hasSavedData);
}

/**
 * @param {boolean} hasSavedData
 */
function renderCurrentEmptyState(hasSavedData) {
  UI.showEmpty(els);
  els.openNotionButton.style.display = hasSavedData ? 'inline-flex' : 'none';
}

/**
 * @param {Array} highlights
 * @param {string|null|undefined} targetKey
 * @param {boolean} hasSavedData
 */
function renderCurrentHighlightList(highlights, targetKey, hasSavedData) {
  UI.renderList(els, highlights, targetKey, handleDelete);
  els.openNotionButton.style.display = hasSavedData ? 'inline-flex' : 'none';
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

  if (!isCurrentViewRequestActive(requestId)) {
    return;
  }

  const highlights = getHighlightList(rawHighlights);
  const hasSavedData = await checkSavedData(notionData, targetKey);

  if (!isCurrentViewRequestActive(requestId)) {
    return;
  }

  applyCurrentPageTargets(resolveTargetUrlFromKey(targetKey), originalTabUrl, hasSavedData);

  if (highlights.length === 0) {
    renderCurrentEmptyState(hasSavedData);
    return;
  }

  renderCurrentHighlightList(highlights, targetKey, hasSavedData);
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

function scheduleUnsyncedBadgeRefresh() {
  clearTimeout(unsyncedBadgeTimer);
  unsyncedBadgeTimer = setTimeout(() => {
    refreshUnsyncedBadge('[SidePanel] refreshUnsyncedBadge failed after storage change');
  }, 300);
}

function reloadCurrentViewAfterStorageChange() {
  // 快速路徑：如果已有快取 URL，直接重新渲染，跳過 tab 查詢和 sendMessage
  if (cachedStableUrl && cachedTabUrl) {
    renderHighlightsForUrl(cachedStableUrl, cachedTabUrl, beginCurrentViewRequest()).catch(error =>
      Logger.error('[SidePanel] renderHighlightsForUrl failed', { error })
    );
    return;
  }

  // 初始狀態尚無快取，走完整路徑
  loadCurrentTab(null, beginCurrentViewRequest());
}

/**
 * 當使用者在 unsynced tab 時，重新渲染 unsynced 列表以反映 storage 變更。
 */
function refreshUnsyncedViewIfActive() {
  if (currentActiveView === 'unsynced') {
    renderUnsyncedView(
      '[SidePanel] renderUnsyncedView failed after storage change',
      beginUnsyncedViewRequest()
    );
  }
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
  scheduleUnsyncedBadgeRefresh();
  reloadCurrentViewAfterStorageChange();
  refreshUnsyncedViewIfActive();
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
      '[SidePanel] renderUnsyncedView failed after tab switch',
      beginUnsyncedViewRequest()
    );
  } else {
    loadCurrentTab(null, beginCurrentViewRequest());
  }
}

/**
 * @param {HTMLElement|null|undefined} loadMoreBtn
 */
function renderUnsyncedEmptyPages(loadMoreBtn) {
  UI.renderUnsyncedEmptyState(els);
  if (loadMoreBtn) {
    loadMoreBtn.style.display = 'none';
  }
  if (els.unsyncedToolbar) {
    els.unsyncedToolbar.style.display = 'none';
  }
  UI.updateUnsyncedBadge(els, cachedUnsyncedPages);
}

function renderUnsyncedPageToolbar() {
  if (els.unsyncedToolbar) {
    els.unsyncedToolbar.style.display = 'flex';
  }
  if (els.unsyncedCountLabel) {
    const count = cachedUnsyncedPages.length;
    els.unsyncedCountLabel.textContent = UI_MESSAGES.SIDEPANEL.PAGE_COUNT(count);
  }
}

function renderUnsyncedPageList() {
  renderUnsyncedPageToolbar();
  appendNextUnsyncedBatch(UI.PAGE_BATCH_SIZE);
  UI.updateUnsyncedBadge(els, cachedUnsyncedPages);
}

/**
 * 渲染「待同步」視圖（含分頁）
 *
 * @param {string} [logMessage] - 失敗時使用的日誌訊息
 * @param {number} [requestId] - 本次 unsynced view 請求序號
 */
async function renderUnsyncedView(
  logMessage = '[SidePanel] renderUnsyncedView failed',
  requestId = beginUnsyncedViewRequest()
) {
  const loadMoreBtn = els.loadMoreBtn;

  try {
    // 每次進入時重新抓取資料
    const nextUnsyncedPages = await getUnsyncedPages();
    if (!isUnsyncedViewRequestActive(requestId)) {
      return;
    }
    cachedUnsyncedPages = nextUnsyncedPages;
    displayedCardCount = 0;
    els.unsyncedView.textContent = '';

    if (cachedUnsyncedPages.length === 0) {
      renderUnsyncedEmptyPages(loadMoreBtn);
      return;
    }

    renderUnsyncedPageList();
  } catch (error) {
    if (!isUnsyncedViewRequestActive(requestId)) {
      return;
    }
    Logger.error(logMessage, { error });
    renderUnsyncedFallbackState();
  }
}

/**
 * 「載入更多」按鈕的 handler
 */
function loadMoreCards() {
  if (!cachedUnsyncedPages) {
    return;
  }
  appendNextUnsyncedBatch(UI.PAGE_BATCH_SIZE);
}

/**
 * @param {string} storageKey
 */
function removeUnsyncedPageFromCache(storageKey) {
  cachedUnsyncedPages = cachedUnsyncedPages.filter(page => page.storageKey !== storageKey);
  displayedCardCount = Math.max(0, Math.min(displayedCardCount - 1, cachedUnsyncedPages.length));
}

/**
 * @param {HTMLElement} cardEl
 */
function animateUnsyncedCardRemoval(cardEl) {
  cardEl.classList.add('card-removing');
  cardEl.addEventListener('animationend', () => cardEl.remove(), { once: true });
}

function updateUnsyncedToolbarAfterDeletion() {
  const count = cachedUnsyncedPages.length;
  if (els.unsyncedCountLabel) {
    els.unsyncedCountLabel.textContent = UI_MESSAGES.SIDEPANEL.PAGE_COUNT(count);
  }
  if (count > 0) {
    return;
  }
  if (els.unsyncedToolbar) {
    els.unsyncedToolbar.style.display = 'none';
  }
  if (els.loadMoreBtn) {
    els.loadMoreBtn.style.display = 'none';
  }
  UI.renderUnsyncedEmptyState(els);
}

function backfillUnsyncedCardAfterDeletion() {
  if (cachedUnsyncedPages.length === 0) {
    return;
  }
  if (displayedCardCount < cachedUnsyncedPages.length) {
    appendNextUnsyncedBatch(1);
  }
}

/**
 * 刪除單一頁面的所有標注
 *
 * Phase 4：透過共享 cleanup helper（planDeleteCleanup）取得 canonical-aware
 * 的 cleanup key 集合，避免只刪呼叫端傳入的 storageKey 卻遺留 page_<other> 或
 * highlights_*。
 *
 * @param {string} storageKey  storage 中的 page_* 或 highlights_* key
 * @param {HTMLElement} cardEl 對應的卡片 DOM 節點（用於移除）
 */
async function deleteUnsyncedPage(storageKey, cardEl) {
  // 抽取 URL 用於後續的 background cleanup 與 foreground 清理
  const pageUrl = _extractUrlFromStorageKey(storageKey);

  try {
    await _removeStorageKeyWithCanonicalCleanup(storageKey);
  } catch (error) {
    Logger.error('[SidePanel] deleteUnsyncedPage: storage remove failed', { error });
    return; // bail out — don't mutate UI if storage failed
  }

  // 透過 background 執行 canonical CLEAR_HIGHLIGHTS 路徑
  if (pageUrl) {
    chrome.runtime
      .sendMessage({
        action: RUNTIME_ACTIONS.CLEAR_HIGHLIGHTS,
        url: pageUrl,
      })
      .catch(error => {
        Logger.warn('[SidePanel] deleteUnsyncedPage: background CLEAR_HIGHLIGHTS failed', {
          action: RUNTIME_ACTIONS.CLEAR_HIGHLIGHTS,
          result: 'failure',
          error,
          url: sanitizeUrlForLogging(pageUrl),
        });
      });

    // Best-effort foreground 清理：嘗試通知 active tab 清除視覺高亮
    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(tabs => {
        if (tabs?.[0]?.id) {
          return chrome.tabs.sendMessage(tabs[0].id, {
            action: RUNTIME_ACTIONS.REMOVE_HIGHLIGHT_DOM,
            url: pageUrl,
          });
        }
      })
      .catch(error => {
        Logger.warn('[SidePanel] deleteUnsyncedPage: foreground cleanup failed', {
          action: RUNTIME_ACTIONS.REMOVE_HIGHLIGHT_DOM,
          result: 'failure',
          error,
          url: sanitizeUrlForLogging(pageUrl),
        });
      });
  }

  // 從快取移除
  removeUnsyncedPageFromCache(storageKey);

  // 移除 DOM 卡片（fade out）
  animateUnsyncedCardRemoval(cardEl);

  // 更新工具列計數和 badge
  updateUnsyncedToolbarAfterDeletion();
  backfillUnsyncedCardAfterDeletion();
  UI.updateUnsyncedBadge(els, cachedUnsyncedPages);
}

/**
 * @param {object} page
 * @returns {string[]}
 */
function resolveUnsyncedPageDeletionKeys(page) {
  if (Array.isArray(page.deletionKeys) && page.deletionKeys.length > 0) {
    return page.deletionKeys;
  }
  return [page.storageKey];
}

/**
 * @param {Set<string>} aggregatedKeys
 * @param {string[]} keys
 */
function addValidStorageKeys(aggregatedKeys, keys) {
  for (const key of keys) {
    if (typeof key === 'string' && key.length > 0) {
      aggregatedKeys.add(key);
    }
  }
}

/**
 * @param {Array<object>} unsyncedPages
 * @returns {string[]}
 */
function collectUnsyncedDeletionKeys(unsyncedPages) {
  const aggregatedKeys = new Set();
  for (const page of unsyncedPages) {
    addValidStorageKeys(aggregatedKeys, resolveUnsyncedPageDeletionKeys(page));
  }
  return [...aggregatedKeys];
}

function renderClearedUnsyncedPages() {
  cachedUnsyncedPages = [];
  displayedCardCount = 0;

  if (els.unsyncedToolbar) {
    els.unsyncedToolbar.style.display = 'none';
  }
  if (els.loadMoreBtn) {
    els.loadMoreBtn.style.display = 'none';
  }
  UI.renderUnsyncedEmptyState(els);

  UI.updateUnsyncedBadge(els, cachedUnsyncedPages);
}

/**
 * 刪除所有未同步頁面的標注
 *
 * Phase 4 follow-up（2026-05-03 plan §3）：使用每筆 entry 預先計算的 deletionKeys，
 * 確保整批清除涵蓋同 canonical group 的全部 member（page_<other> / highlights_<other>），
 * 與 deleteUnsyncedPage 共用同一條 cleanup 規則。
 */
async function deleteAllUnsyncedPages() {
  if (!cachedUnsyncedPages || cachedUnsyncedPages.length === 0) {
    return;
  }

  const keysToRemove = collectUnsyncedDeletionKeys(cachedUnsyncedPages);

  try {
    await chrome.storage.local.remove(keysToRemove);
  } catch (error) {
    Logger.error('[SidePanel] deleteAllUnsyncedPages: storage remove failed', { error });
    return; // bail out — don't mutate UI if storage failed
  }

  renderClearedUnsyncedPages();
}
