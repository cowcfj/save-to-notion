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
  RESTRICTED_PROTOCOLS,
} from '../scripts/config/constants.js';
import { UI_MESSAGES } from '../scripts/config/messages.js';
import Logger from '../scripts/utils/Logger.js';

let els = {};

let statusMessageTimeoutId;

// 快取：避免每次 storage 變化都重新解析 URL
let cachedStableUrl = null;
let cachedTabUrl = null;

// === 待同步視圖設定 ===
const PAGE_BATCH_SIZE = 10;
const PREVIEW_HIGHLIGHT_COUNT = 3;
const PREVIEW_TEXT_MAX_LENGTH = 80;

/** @type {Array<object> | null} 快取的未同步頁面資料 */
let cachedUnsyncedPages = null;
/** @type {number} 目前已渲染的卡片數量 */
let displayedCardCount = 0;
/** @type {ReturnType<typeof setTimeout> | null} 未同步 badge 更新的 debounce timer */
let unsyncedBadgeTimer = null;

/**
 * 從 URL 中提取 domain 名稱
 *
 * @param {string} url
 * @returns {string}
 */
function extractDomain(url) {
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
function buildPreviewHighlights(highlights) {
  return highlights.slice(0, PREVIEW_HIGHLIGHT_COUNT).map(hl => {
    const rawText = hl.text || '';
    return {
      text: rawText.slice(0, PREVIEW_TEXT_MAX_LENGTH),
      truncated: rawText.length > PREVIEW_TEXT_MAX_LENGTH,
      color: hl.color || 'yellow',
    };
  });
}

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
    title: value.notion?.title || value.metadata?.title || extractDomain(url),
    highlightCount: highlights.length,
    lastUpdated: value.metadata?.lastUpdated || 0,
    previewHighlights: buildPreviewHighlights(highlights),
    remainingCount: Math.max(0, highlights.length - PREVIEW_HIGHLIGHT_COUNT),
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
    title: savedData?.title || value?.title || extractDomain(url),
    highlightCount: highlights.length,
    lastUpdated: value?.updatedAt || 0,
    previewHighlights: buildPreviewHighlights(highlights),
    remainingCount: Math.max(0, highlights.length - PREVIEW_HIGHLIGHT_COUNT),
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
    seenUrls.add(url); // 基給 page_* 的 url 都記錄，避免舊格式重複
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
  els = {
    loadingState: document.querySelector('#loading-state'),
    emptyState: document.querySelector('#empty-state'),
    highlightsList: document.querySelector('#highlights-list'),
    syncButton: document.querySelector('#sync-button'),
    openNotionButton: document.querySelector('#open-notion-button'),
    statusMessage: document.querySelector('#status-message'),
    template: document.querySelector('#highlight-card-template'),
    unsyncedView: document.querySelector('#unsynced-view'),
    loadMoreBtn: document.querySelector('#load-more-btn'),
    unsyncedBadge: document.querySelector('#unsynced-badge'),
    pageCardTemplate: document.querySelector('#page-card-template'),
    unsyncedToolbar: document.querySelector('#unsynced-toolbar'),
    unsyncedCountLabel: document.querySelector('#unsynced-count-label'),
    clearAllBtn: document.querySelector('#clear-all-btn'),
  };

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
  await loadCurrentTab();
  const unsyncedPages = await getUnsyncedPages();
  updateUnsyncedBadge(unsyncedPages);
}

/**
 * 處理分頁切換
 *
 * @param {chrome.tabs.TabActiveInfo} activeInfo
 */
async function handleTabChange(activeInfo) {
  await loadCurrentTab(activeInfo.tabId);
}

/**
 * 主要載入流程
 *
 * @param {number|null} specificTabId
 */
async function loadCurrentTab(specificTabId = null) {
  cachedStableUrl = null;
  cachedTabUrl = null;
  showLoading();

  try {
    let tab;
    if (specificTabId) {
      tab = await chrome.tabs.get(specificTabId);
    } else {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = tabs[0];
    }

    if (!tab?.url || RESTRICTED_PROTOCOLS.includes(new URL(tab.url).protocol)) {
      showEmpty(UI_MESSAGES.SIDEPANEL.NOT_SUPPORTED);
      return;
    }

    // 核心: 解析穩定 URL (3層 Fallback)
    const stableUrl = await getStableUrlForTab(tab.id, tab.url);

    // 快取 URL 供 handleStorageChange 快速路徑使用
    cachedStableUrl = stableUrl;
    cachedTabUrl = tab.url;

    // 獲取資料
    await renderHighlightsForUrl(stableUrl, tab.url);
  } catch (error) {
    Logger.error('[SidePanel] Failed to load tab', { error });
    showEmpty(UI_MESSAGES.SIDEPANEL.LOAD_FAILED);
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
 */
async function renderHighlightsForUrl(url, originalTabUrl) {
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

  const highlights = Array.isArray(highlightsData)
    ? highlightsData
    : highlightsData?.highlights || [];
  if (highlights.length === 0) {
    showEmpty();
    return;
  }

  renderList(highlights, targetKey);

  const hasSavedData = await checkSavedData(notionData, targetKey);
  els.syncButton.disabled = !hasSavedData;
  els.openNotionButton.style.display = hasSavedData ? 'inline-flex' : 'none';

  const targetUrl = targetKey?.startsWith(PAGE_PREFIX)
    ? targetKey.slice(PAGE_PREFIX.length)
    : (targetKey?.replace(HIGHLIGHTS_PREFIX, '') ?? '');

  els.syncButton.dataset.targetUrl = targetUrl;
  els.openNotionButton.dataset.targetUrl = originalTabUrl;
}

/**
 * 實體渲染 DOM
 *
 * @param {Array} highlights
 * @param {string} storageKey
 */
function renderList(highlights, storageKey) {
  els.highlightsList.textContent = '';

  const COLOR_MAP = {
    yellow: 'var(--hl-yellow)',
    green: 'var(--hl-green)',
    blue: 'var(--hl-blue)',
    red: 'var(--hl-red)',
    purple: 'var(--hl-purple)',
    pink: 'var(--hl-pink)',
  };

  highlights.forEach(hl => {
    const clone = els.template.content.cloneNode(true);
    const card = clone.querySelector('.highlight-card');
    const textEl = clone.querySelector('.highlight-text');
    const colorInd = clone.querySelector('.highlight-color-indicator');
    const delBtn = clone.querySelector('.delete-button');

    textEl.textContent = hl.text;

    // 設置顏色指示條
    if (hl.color) {
      colorInd.style.backgroundColor = COLOR_MAP[hl.color] || COLOR_MAP.yellow;
    }

    // 綁定刪除事件
    delBtn.addEventListener('click', () => handleDelete(hl.id, storageKey));

    els.highlightsList.append(card);
  });

  els.loadingState.style.display = 'none';
  els.emptyState.style.display = 'none';
  els.highlightsList.style.display = isCurrentViewActive() ? 'flex' : 'none';
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
  showMessage(UI_MESSAGES.SIDEPANEL.SYNCING, 'info');

  try {
    const response = await chrome.runtime.sendMessage({ action: 'savePage' });
    if (response?.success) {
      showMessage(UI_MESSAGES.SIDEPANEL.SYNC_SUCCESS, 'success');
    } else {
      showMessage(response?.error || UI_MESSAGES.SIDEPANEL.SYNC_FAILED, 'error');
    }
  } catch {
    showMessage(UI_MESSAGES.SIDEPANEL.SYNC_FAILED, 'error');
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
  showMessage(UI_MESSAGES.SIDEPANEL.OPENING, 'info');

  try {
    const url = els.openNotionButton.dataset.targetUrl;
    const response = await chrome.runtime.sendMessage({ action: 'openNotionPage', url });
    if (response?.success) {
      showMessage(UI_MESSAGES.SIDEPANEL.OPEN_SUCCESS, 'success');
    } else {
      showMessage(response?.error || UI_MESSAGES.SIDEPANEL.OPEN_FAILED, 'error');
    }
  } catch {
    showMessage(UI_MESSAGES.SIDEPANEL.OPEN_FAILED, 'error');
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
    updateUnsyncedBadge(null).catch(() => {});
  }, 300);

  // 快速路徑：如果已有快取 URL，直接重新渲染，跳過 tab 查詢和 sendMessage
  if (cachedStableUrl && cachedTabUrl) {
    renderHighlightsForUrl(cachedStableUrl, cachedTabUrl).catch(error =>
      Logger.error('[SidePanel] renderHighlightsForUrl failed', { error })
    );
    return;
  }

  // 初始狀態尚無快取，走完整路徑
  loadCurrentTab();
}

// === UI 輔助函數 ===

function isCurrentViewActive() {
  const currentTab = document.querySelector('.view-tab[data-view="current"]');
  return currentTab ? currentTab.classList.contains('active') : true;
}

function showLoading() {
  const isActive = isCurrentViewActive();
  els.loadingState.style.display = isActive ? 'flex' : 'none';
  els.emptyState.style.display = 'none';
  els.highlightsList.style.display = 'none';
  els.syncButton.disabled = true;
  els.openNotionButton.style.display = 'none';
}

function showEmpty(msg = null) {
  const isActive = isCurrentViewActive();
  els.loadingState.style.display = 'none';
  els.emptyState.style.display = isActive ? 'flex' : 'none';
  els.highlightsList.style.display = 'none';
  els.syncButton.disabled = true;
  els.openNotionButton.style.display = 'none';

  if (msg) {
    els.emptyState.querySelector('p').textContent = msg;
    els.emptyState.querySelector('.subtitle').style.display = 'none';
  } else {
    els.emptyState.querySelector('p').textContent = UI_MESSAGES.SIDEPANEL.NO_HIGHLIGHTS;
    els.emptyState.querySelector('.subtitle').textContent =
      UI_MESSAGES.SIDEPANEL.NO_HIGHLIGHTS_SUBTITLE;
    els.emptyState.querySelector('.subtitle').style.display = 'block';
  }
}

function showMessage(text, type) {
  els.statusMessage.textContent = text;
  els.statusMessage.className = `status-message ${type}`;
  els.statusMessage.style.display = 'block';

  clearTimeout(statusMessageTimeoutId);
  statusMessageTimeoutId = setTimeout(() => {
    els.statusMessage.style.display = 'none';
  }, 3000);
}

// 啟動
document.addEventListener('DOMContentLoaded', init);

// === 待同步視圖切換邏輯 ===

/**
 * 切換視圖：'current' 或 'unsynced'
 *
 * @param {'current'|'unsynced'} viewName
 */
function switchView(viewName) {
  const currentViewEls = [els.loadingState, els.emptyState, els.highlightsList, els.statusMessage];
  const unsyncedView = els.unsyncedView;
  const loadMoreBtn = els.loadMoreBtn;

  if (viewName === 'unsynced') {
    currentViewEls.forEach(el => el && (el.style.display = 'none'));
    if (els.syncButton) {
      els.syncButton.style.display = 'none';
    }
    if (els.openNotionButton) {
      els.openNotionButton.style.display = 'none';
    }
    unsyncedView.style.display = 'block';
    renderUnsyncedView();
  } else {
    unsyncedView.style.display = 'none';
    if (els.syncButton) {
      els.syncButton.style.display = '';
    }
    if (els.openNotionButton) {
      els.openNotionButton.style.display = '';
    }
    if (loadMoreBtn) {
      loadMoreBtn.style.display = 'none';
    }
    if (els.unsyncedToolbar) {
      els.unsyncedToolbar.style.display = 'none';
    }
    loadCurrentTab();
  }

  // 更新 tab 的 active 樣式
  document.querySelectorAll('.view-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === viewName);
  });
}

/**
 * Tab bar 點擊事件處理
 *
 * @param {Event} event
 */
function handleViewTabClick(event) {
  const viewName = event.currentTarget.dataset.view;
  if (viewName) {
    switchView(viewName);
  }
}

/**
 * 渲染「待同步」視圖（含分頁）
 */
async function renderUnsyncedView() {
  const container = els.unsyncedView;
  const loadMoreBtn = els.loadMoreBtn;

  // 每次進入時重新抓取資料
  cachedUnsyncedPages = await getUnsyncedPages();
  displayedCardCount = 0;
  container.textContent = '';

  if (cachedUnsyncedPages.length === 0) {
    renderUnsyncedEmptyState();
    if (loadMoreBtn) {
      loadMoreBtn.style.display = 'none';
    }
    if (els.unsyncedToolbar) {
      els.unsyncedToolbar.style.display = 'none';
    }
    updateUnsyncedBadge(cachedUnsyncedPages);
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

  appendCards(container, PAGE_BATCH_SIZE);
  updateUnsyncedBadge(cachedUnsyncedPages);
}

/**
 * 從 cachedUnsyncedPages 取出下一批卡片並插入 container
 *
 * @param {HTMLElement} container
 * @param {number} count
 */
function appendCards(container, count) {
  const loadMoreBtn = els.loadMoreBtn;
  const template = els.pageCardTemplate;
  const batch = cachedUnsyncedPages.slice(displayedCardCount, displayedCardCount + count);

  batch.forEach(page => {
    const cardNode = template.content.cloneNode(true);
    const card = cardNode.querySelector('.page-card');

    card.querySelector('.page-title').textContent = page.title;
    card.querySelector('.page-meta').textContent =
      `${extractDomain(page.url)} • ${UI_MESSAGES.SIDEPANEL.HIGHLIGHT_COUNT(page.highlightCount)}`;

    // 標註預覽
    const previewContainer = card.querySelector('.page-card-previews');
    page.previewHighlights.forEach(highlight => {
      const row = document.createElement('p');
      row.className = `preview-row color-${highlight.color}`;
      row.textContent = `"${highlight.text}${highlight.truncated ? '...' : ''}"`;
      previewContainer.append(row);
    });

    // +N more
    const remainingEl = card.querySelector('.page-card-remaining');
    if (page.remainingCount > 0) {
      remainingEl.textContent = UI_MESSAGES.SIDEPANEL.REMAINING_COUNT(page.remainingCount);
    }

    // 開啟頁面
    card.querySelector('.page-open-button').addEventListener('click', () => {
      chrome.tabs.create({ url: page.url });
    });

    // 刪除單頁標注
    card.querySelector('.page-delete-button').addEventListener('click', () => {
      deleteUnsyncedPage(page.storageKey, card);
    });

    container.append(card);
  });

  displayedCardCount += batch.length;

  // 更新「載入更多」按鈕
  if (loadMoreBtn) {
    const hasMore = displayedCardCount < cachedUnsyncedPages.length;
    loadMoreBtn.style.display = hasMore ? 'block' : 'none';
  }
}

/**
 * 渲染未同步列表空狀態
 */
function renderUnsyncedEmptyState() {
  const container = els.unsyncedView;
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
 * 「載入更多」按鈕的 handler
 */
function loadMoreCards() {
  if (!cachedUnsyncedPages) {
    return;
  }
  const container = els.unsyncedView;
  appendCards(container, PAGE_BATCH_SIZE);
}

/**
 * 計算未同步頁面數量，更新 Tab 上的 badge
 *
 * @param {Array|undefined} [pages] - 已取得的未同步頁面陣列；若未提供則自行呼叫 getUnsyncedPages()
 */
async function updateUnsyncedBadge(pages) {
  const resolvedPages = pages ?? (await getUnsyncedPages());
  const badge = els.unsyncedBadge;
  if (!badge) {
    return;
  }
  badge.textContent = resolvedPages.length > 0 ? String(resolvedPages.length) : '';
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
    renderUnsyncedEmptyState();
  }
  if (count > 0 && displayedCardCount < cachedUnsyncedPages.length) {
    appendCards(els.unsyncedView, 1);
  }
  updateUnsyncedBadge(cachedUnsyncedPages);
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
  renderUnsyncedEmptyState();

  updateUnsyncedBadge(cachedUnsyncedPages);
}
