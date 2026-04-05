/**
 * Side Panel 入口文件
 *
 * 職責：
 * - 監聽分頁切換，獲取當前分頁的穩定 URL
 * - 從 Storage 讀取標註並渲染 UI
 * - 監聽 Storage 變化自動更新
 */

/* global chrome */

import { normalizeUrl, computeStableUrl, isRootUrl } from '../scripts/utils/urlUtils.js';
import {
  SAVED_PREFIX,
  HIGHLIGHTS_PREFIX,
  PAGE_PREFIX,
  URL_ALIAS_PREFIX,
} from '../scripts/config/storageKeys.js';
import { RESTRICTED_PROTOCOLS } from '../scripts/config/app.js';
import { UI_MESSAGES } from '../scripts/config/messages.js';
import { sanitizeApiError, sanitizeUrlForLogging } from '../scripts/utils/securityUtils.js';
import Logger from '../scripts/utils/Logger.js';
import * as UI from './sidepanelUI.js';

// === 共享狀態（保留於入口，UI 模組不直接存取） ===

let els = {};

let statusMessageTimeoutId;

// 快取：避免每次 storage 變化都重新解析 URL
let cachedStableUrl = null;
let cachedTabUrl = null;
let currentActiveView = 'current';
let currentViewRequestId = 0;
let unsyncedViewRequestId = 0;

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

// === 業務邏輯 ===

/**
 * 從 page_* 對象建立頁面條目（新格式）
 *
 * @param {string} key - storage key
 * @param {string} url - normalized url
 * @param {object} value - page_* 物件
 * @returns {object|null} 頁面條目，若應跳過則返回 null
 */
function buildPageEntry(key, url, value) {
  if (value.notion?.pageId || isRootUrl(url)) {
    return null; // 已同步或根路徑，跳過
  }
  const highlights = Array.isArray(value.highlights) ? value.highlights : [];
  if (highlights.length === 0) {
    return null; // 無標註不顯示
  }
  return {
    url,
    storageKey: key,
    title: value.notion?.title || value.metadata?.title || UI.extractDomain(url),
    highlightCount: highlights.length,
    lastUpdated: value.metadata?.lastUpdated || 0,
    previewHighlights: UI.buildPreviewHighlights(highlights),
    remainingCount: Math.max(0, highlights.length - UI.PREVIEW_HIGHLIGHT_COUNT),
  };
}

/**
 * 從 highlights_* 對象建立頁面條目（舊格式）
 *
 * @param {string} key - storage key
 * @param {string} url - normalized url
 * @param {*} value - highlights_* 值
 * @param {object} all - 完整 storage 資料
 * @param {Map} aliasMap - alias 映射
 * @returns {object|null}
 */
function buildLegacyPageEntry(key, url, value, all, aliasMap) {
  if (isRootUrl(url)) {
    return null;
  }
  const canonicalUrl = aliasMap.get(url) || url;
  const savedDataOriginal = all[`${SAVED_PREFIX}${url}`];
  const savedDataCanonical = all[`${SAVED_PREFIX}${canonicalUrl}`];
  if (savedDataOriginal?.notionPageId || savedDataCanonical?.notionPageId) {
    return null; // 已同步
  }
  const savedData = savedDataOriginal || savedDataCanonical;
  const highlights = Array.isArray(value) ? value : value?.highlights || [];
  if (highlights.length === 0) {
    return null;
  }
  return {
    url,
    storageKey: key,
    title: savedData?.title || value?.title || UI.extractDomain(url),
    highlightCount: highlights.length,
    lastUpdated: value?.updatedAt || 0,
    previewHighlights: UI.buildPreviewHighlights(highlights),
    remainingCount: Math.max(0, highlights.length - UI.PREVIEW_HIGHLIGHT_COUNT),
  };
}

/**
 * 從 chrome.storage.local 取出所有未同步頁面的標註資料。
 *
 * Phase 3：同時掃描 page_* 新格式和 highlights_* 舊格式，去重。
 *
 * @returns {Promise<Array<{url, storageKey, title, highlightCount, lastUpdated, previewHighlights, remainingCount}>>}
 */
async function getUnsyncedPages() {
  const all = await chrome.storage.local.get(null);
  const pages = [];
  const seenUrls = new Set();

  // 第一輪：處理 page_* 新格式
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(PAGE_PREFIX)) {
      continue;
    }
    const url = key.slice(PAGE_PREFIX.length);
    seenUrls.add(url); // 記錄 page_* 的 url，避免舊格式重複
    const entry = buildPageEntry(key, url, value);
    if (entry) {
      pages.push(entry);
    }
  }

  // 第二輪：處理尚未升級的 highlights_* 舊格式
  const aliasMap = new Map();
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(URL_ALIAS_PREFIX)) {
      aliasMap.set(key.slice(URL_ALIAS_PREFIX.length), value);
    }
  }

  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(HIGHLIGHTS_PREFIX)) {
      continue;
    }
    const url = key.slice(HIGHLIGHTS_PREFIX.length);
    const canonicalUrl = aliasMap.get(url) || url;

    // 若 url 或 canonical 已經在 page_* 掃描過，跳過
    if (seenUrls.has(url) || seenUrls.has(canonicalUrl)) {
      continue;
    }
    seenUrls.add(url);
    seenUrls.add(canonicalUrl);

    const entry = buildLegacyPageEntry(key, url, value, all, aliasMap);
    if (entry) {
      pages.push(entry);
    }
  }

  return pages.toSorted((pa, pb) => pb.lastUpdated - pa.lastUpdated);
}

async function init() {
  els = UI.getElements();
  setActiveView('current');

  // 1. 綁定按鈕事件
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
 * 主要載入流程
 *
 * @param {number|null} specificTabId
 * @param {number} [requestId]
 */
async function loadCurrentTab(specificTabId = null, requestId = beginCurrentViewRequest()) {
  cachedStableUrl = null;
  cachedTabUrl = null;
  if (isCurrentViewRequestActive(requestId)) {
    UI.showLoading(els);
  }

  try {
    let tab;
    if (specificTabId) {
      tab = await chrome.tabs.get(specificTabId);
    } else {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = tabs[0];
    }

    if (!tab?.url || RESTRICTED_PROTOCOLS.includes(new URL(tab.url).protocol)) {
      if (isCurrentViewRequestActive(requestId)) {
        UI.showEmpty(els, UI_MESSAGES.SIDEPANEL.NOT_SUPPORTED);
      }
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
    if (isCurrentViewRequestActive(requestId)) {
      UI.showEmpty(els, UI_MESSAGES.SIDEPANEL.LOAD_FAILED);
    }
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
    const response = await chrome.tabs.sendMessage(tabId, { action: 'GET_STABLE_URL' });
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
 * 從 storage 查詢結果解析標註資料和目標 key
 *
 * @param {object} result - chrome.storage.local.get 結果
 * @param {{pageKey, pageOrigKey, hlKey, hlOrigKey, aliasKeyOrig, aliasKeyNorm}} keys
 * @returns {Promise<{highlightsData, targetKey, notionData}>}
 */
async function resolveHighlightData(result, keys) {
  const { pageKey, pageOrigKey, hlKey, hlOrigKey, aliasKeyOrig, aliasKeyNorm } = keys;

  if (result[pageKey]) {
    return {
      highlightsData: result[pageKey].highlights,
      notionData: result[pageKey].notion,
      targetKey: pageKey,
    };
  }
  if (result[pageOrigKey]) {
    return {
      highlightsData: result[pageOrigKey].highlights,
      notionData: result[pageOrigKey].notion,
      targetKey: pageOrigKey,
    };
  }
  if (result[hlKey]) {
    return { highlightsData: result[hlKey], notionData: null, targetKey: hlKey };
  }
  if (result[hlOrigKey]) {
    return { highlightsData: result[hlOrigKey], notionData: null, targetKey: hlOrigKey };
  }

  // 檢查 alias
  const stableUrlFromAlias = result[aliasKeyOrig] || result[aliasKeyNorm];
  if (!stableUrlFromAlias) {
    return { highlightsData: null, notionData: null, targetKey: null };
  }

  const aliaPageKey = `${PAGE_PREFIX}${stableUrlFromAlias}`;
  const aliasHlKey = `${HIGHLIGHTS_PREFIX}${stableUrlFromAlias}`;
  const aliasResult = await chrome.storage.local.get([aliaPageKey, aliasHlKey]);

  if (aliasResult[aliaPageKey]) {
    return {
      highlightsData: aliasResult[aliaPageKey].highlights,
      notionData: aliasResult[aliaPageKey].notion,
      targetKey: aliaPageKey,
    };
  }
  if (aliasResult[aliasHlKey]) {
    return { highlightsData: aliasResult[aliasHlKey], notionData: null, targetKey: aliasHlKey };
  }
  return { highlightsData: null, notionData: null, targetKey: null };
}

/**
 * 判斷頁面是否已儲存到 Notion
 *
 * @param {*} notionData - page_*.notion（或 null 疋於未升級）
 * @param {string|null} targetKey - 目標 storage key
 * @returns {Promise<boolean>}
 */
async function checkSavedData(notionData, targetKey) {
  if (notionData !== null && notionData !== undefined) {
    return Boolean(notionData?.pageId);
  }
  if (!targetKey) {
    return false;
  }

  // Phase 3 新格式：若剛新增標註但尚未同步，notionData 為 null，但稍後同步時 storage 會更新
  if (targetKey.startsWith(PAGE_PREFIX)) {
    const result = await chrome.storage.local.get(targetKey);
    return Boolean(result[targetKey]?.notion?.pageId);
  }

  // 舊格式：僅當 targetKey 以 HIGHLIGHTS_PREFIX 開頭才對應查詢 saved_* key
  if (!targetKey.startsWith(HIGHLIGHTS_PREFIX)) {
    return false;
  }
  const savedKey = targetKey.replace(HIGHLIGHTS_PREFIX, SAVED_PREFIX);
  const savedResult = await chrome.storage.local.get(savedKey);
  return Boolean(savedResult[savedKey]);
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

  const keys = {
    pageKey: `${PAGE_PREFIX}${normalizedUrl}`,
    pageOrigKey: `${PAGE_PREFIX}${normalizedOriginal}`,
    hlKey: `${HIGHLIGHTS_PREFIX}${normalizedUrl}`,
    hlOrigKey: `${HIGHLIGHTS_PREFIX}${normalizedOriginal}`,
    aliasKeyOrig: `${URL_ALIAS_PREFIX}${normalizedOriginal}`,
    aliasKeyNorm: `${URL_ALIAS_PREFIX}${normalizedUrl}`,
  };

  const result = await chrome.storage.local.get(Object.values(keys));
  const { highlightsData, notionData, targetKey } = await resolveHighlightData(result, keys);
  if (!isCurrentViewRequestActive(requestId)) {
    return;
  }

  const highlights = Array.isArray(highlightsData)
    ? highlightsData
    : highlightsData?.highlights || [];
  if (highlights.length === 0) {
    if (isCurrentViewRequestActive(requestId)) {
      UI.showEmpty(els);
    }
    return;
  }

  UI.renderList(els, highlights, targetKey, handleDelete);

  const hasSavedData = await checkSavedData(notionData, targetKey);
  if (!isCurrentViewRequestActive(requestId)) {
    return;
  }
  // Sync 按鈕始終可用（savePage 可自動建立新頁面）
  els.syncButton.disabled = false;
  els.openNotionButton.style.display = hasSavedData ? 'inline-flex' : 'none';

  const targetUrl = targetKey?.startsWith(PAGE_PREFIX)
    ? targetKey.slice(PAGE_PREFIX.length)
    : (targetKey?.replace(HIGHLIGHTS_PREFIX, '') ?? '');

  els.syncButton.dataset.targetUrl = targetUrl;
  els.openNotionButton.dataset.targetUrl = originalTabUrl;
}

/**
 * 更新物件的 metadata.lastUpdated 時間戳
 *
 * @param {object} data
 */
function _touchMetadata(data) {
  if (!data.metadata) {
    data.metadata = {};
  }
  data.metadata.lastUpdated = Date.now();
}

/**
 * 根據資料格式計算刪除後的結果
 *
 * @param {object|Array} data - 目前 storage 中的資料
 * @param {string} highlightId - 要刪除的標註 ID
 * @param {string} storageKey - storage key
 * @returns {{ newData: any, shouldRemove: boolean }}
 */
function _computeDeleteResult(data, highlightId, storageKey) {
  if (storageKey.startsWith(PAGE_PREFIX)) {
    // Phase 3：page_* 新格式的 partial 刪除
    if (!Array.isArray(data.highlights)) {
      data.highlights = [];
    }
    data.highlights = data.highlights.filter(hl => hl.id !== highlightId);
    const shouldRemove = data.highlights.length === 0 && !data.notion;
    if (!shouldRemove) {
      _touchMetadata(data);
    }
    return { newData: data, shouldRemove };
  }

  if (data.highlights) {
    // 舊格式：有 highlights 物件結構
    if (!Array.isArray(data.highlights)) {
      data.highlights = [];
    }
    data.highlights = data.highlights.filter(hl => hl.id !== highlightId);
    const shouldRemove = data.highlights.length === 0;
    if (!shouldRemove) {
      _touchMetadata(data);
    }
    return { newData: data, shouldRemove };
  }

  if (Array.isArray(data)) {
    // 舊版 array 格式
    const newData = data.filter(hl => hl.id !== highlightId);
    return { newData, shouldRemove: newData.length === 0 };
  }

  // 無法識別的格式，安全地移除
  return { newData: undefined, shouldRemove: true };
}

/**
 * 刪除單個標註
 *
 * Phase 3：如果 storageKey 為 page_*，執行 partial 刪除（保留 notion）。
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
      await chrome.storage.local.remove(storageKey);
    } else {
      await chrome.storage.local.set({ [storageKey]: newData });
    }

    // 通知 Content script 清除 DOM 高亮
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs?.[0]?.id) {
      await chrome.tabs
        .sendMessage(tabs[0].id, {
          action: 'REMOVE_HIGHLIGHT_DOM',
          highlightId,
        })
        .catch(error => {
          Logger.error('Failed to send remove highlight DOM message', { error });
        });
    }
  } catch (error) {
    Logger.error('Failed to delete highlight', { error });
  }
}

/**
 * 點擊同步按鈕
 */
async function handleSyncClick() {
  els.syncButton.disabled = true;
  showTimedMessage(UI_MESSAGES.SIDEPANEL.SYNCING, 'info');

  try {
    const response = await chrome.runtime.sendMessage({ action: 'savePage' });
    if (response?.success) {
      showTimedMessage(UI_MESSAGES.SIDEPANEL.SYNC_SUCCESS, 'success');
    } else {
      Logger.error('[SidePanel] savePage failed', {
        error: sanitizeApiError(response?.error || 'Unknown error', 'save_page'),
      });
      showTimedMessage(UI_MESSAGES.SIDEPANEL.SYNC_FAILED, 'error');
    }
  } catch (error) {
    Logger.error('[SidePanel] savePage failed', {
      error: sanitizeApiError(error, 'save_page'),
    });
    showTimedMessage(UI_MESSAGES.SIDEPANEL.SYNC_FAILED, 'error');
  } finally {
    setTimeout(() => {
      els.syncButton.disabled = false;
    }, 2000);
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
    const response = await chrome.runtime.sendMessage({ action: 'openNotionPage', url });
    if (response?.success) {
      showTimedMessage(UI_MESSAGES.SIDEPANEL.OPEN_SUCCESS, 'success');
    } else {
      Logger.error('[SidePanel] openNotionPage failed', {
        error: sanitizeApiError(response?.error || 'Unknown error', 'open_page'),
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
    }, 1000);
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
  // Phase 3：只要 page_*、highlights_* 或 saved_* 有變，就重整當前頁面資料
  const hasRelevantChanges = Object.keys(changes).some(
    key =>
      key.startsWith(PAGE_PREFIX) ||
      key.startsWith(HIGHLIGHTS_PREFIX) ||
      key.startsWith(SAVED_PREFIX)
  );

  if (!hasRelevantChanges) {
    return;
  }

  // Always keep the unsynced badge in sync with storage (debounced to avoid rapid get(null) calls)
  clearTimeout(unsyncedBadgeTimer);
  unsyncedBadgeTimer = setTimeout(() => {
    refreshUnsyncedBadge('[SidePanel] refreshUnsyncedBadge failed after storage change');
  }, 300);

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
      UI.renderUnsyncedEmptyState(els);
      if (loadMoreBtn) {
        loadMoreBtn.style.display = 'none';
      }
      if (els.unsyncedToolbar) {
        els.unsyncedToolbar.style.display = 'none';
      }
      UI.updateUnsyncedBadge(els, cachedUnsyncedPages);
      return;
    }

    // 顯示工具列並更新計數
    if (els.unsyncedToolbar) {
      els.unsyncedToolbar.style.display = 'flex';
    }
    if (els.unsyncedCountLabel) {
      const count = cachedUnsyncedPages.length;
      els.unsyncedCountLabel.textContent = UI_MESSAGES.SIDEPANEL.PAGE_COUNT(count);
    }

    appendNextUnsyncedBatch(UI.PAGE_BATCH_SIZE);
    UI.updateUnsyncedBadge(els, cachedUnsyncedPages);
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
 * 刪除單一頁面的所有標注
 *
 * @param {string} storageKey  storage 中的 highlights_ key
 * @param {HTMLElement} cardEl 對應的卡片 DOM 節點（用於移除）
 */
async function deleteUnsyncedPage(storageKey, cardEl) {
  try {
    await chrome.storage.local.remove(storageKey);
  } catch (error) {
    Logger.error('[SidePanel] deleteUnsyncedPage: storage remove failed', { error });
    return; // bail out — don't mutate UI if storage failed
  }

  // 從快取移除
  cachedUnsyncedPages = cachedUnsyncedPages.filter(page => page.storageKey !== storageKey);
  displayedCardCount = Math.max(0, Math.min(displayedCardCount - 1, cachedUnsyncedPages.length));

  // 移除 DOM 卡片（fade out）
  cardEl.classList.add('card-removing');
  cardEl.addEventListener('animationend', () => cardEl.remove(), { once: true });

  // 更新工具列計數和 badge
  const count = cachedUnsyncedPages.length;
  if (els.unsyncedCountLabel) {
    els.unsyncedCountLabel.textContent = UI_MESSAGES.SIDEPANEL.PAGE_COUNT(count);
  }
  if (count === 0) {
    if (els.unsyncedToolbar) {
      els.unsyncedToolbar.style.display = 'none';
    }
    if (els.loadMoreBtn) {
      els.loadMoreBtn.style.display = 'none';
    }
    UI.renderUnsyncedEmptyState(els);
  }
  if (count > 0 && displayedCardCount < cachedUnsyncedPages.length) {
    appendNextUnsyncedBatch(1);
  }
  UI.updateUnsyncedBadge(els, cachedUnsyncedPages);
}

/**
 * 刪除所有未同步頁面的標注
 */
async function deleteAllUnsyncedPages() {
  if (!cachedUnsyncedPages || cachedUnsyncedPages.length === 0) {
    return;
  }

  const keys = cachedUnsyncedPages.map(page => page.storageKey);
  try {
    await chrome.storage.local.remove(keys);
  } catch (error) {
    Logger.error('[SidePanel] deleteAllUnsyncedPages: storage remove failed', { error });
    return; // bail out — don't mutate UI if storage failed
  }

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
