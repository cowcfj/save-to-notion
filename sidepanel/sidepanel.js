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
  URL_ALIAS_PREFIX,
  RESTRICTED_PROTOCOLS,
} from '../scripts/config/constants.js';
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
 * 從 chrome.storage.local 取出所有 highlights_ key，
 * 過濾已同步（有 notionPageId）的頁面，回傳未同步頁面的摘要列表。
 *
 * @returns {Promise<Array<{url, storageKey, title, highlightCount, lastUpdated, previewHighlights, remainingCount}>>}
 */
async function getUnsyncedPages() {
  const all = await chrome.storage.local.get(null);
  const pages = [];

  // 收集所有 url_alias 映射，用於去重
  const aliasMap = new Map();
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(URL_ALIAS_PREFIX)) {
      aliasMap.set(key.slice(URL_ALIAS_PREFIX.length), value);
    }
  }

  // 追蹤已處理的 canonical URL，避免同一個 stable URL 產生重複的卡片
  const seenCanonicalUrls = new Set();

  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(HIGHLIGHTS_PREFIX)) {
      continue;
    }
    const url = key.slice(HIGHLIGHTS_PREFIX.length);

    // 跳過根路徑（首頁），通常是不正確的短網址回退結果
    if (isRootUrl(url)) {
      continue;
    }

    // 去重：如果這個 url 有 alias，我們追蹤 alias 的目標。
    // 如果 alias 的目標已處理過，跳過它。
    const canonicalUrl = aliasMap.get(url) || url;
    if (seenCanonicalUrls.has(canonicalUrl)) {
      continue;
    }
    seenCanonicalUrls.add(canonicalUrl);
    // 預防其他 alias 直接指向這個 url 產生重複
    seenCanonicalUrls.add(url);

    // 同時檢查原 URL 和 canonical URL 是否已同步
    const savedDataOriginal = all[`${SAVED_PREFIX}${url}`];
    const savedDataCanonical = all[`${SAVED_PREFIX}${canonicalUrl}`];
    if (savedDataOriginal?.notionPageId || savedDataCanonical?.notionPageId) {
      continue;
    }

    const savedData = savedDataOriginal || savedDataCanonical;

    const highlights = Array.isArray(value) ? value : value?.highlights || [];
    const previewHighlights = highlights.slice(0, PREVIEW_HIGHLIGHT_COUNT).map(hl => {
      const rawText = hl.text || '';
      return {
        text: rawText.slice(0, PREVIEW_TEXT_MAX_LENGTH),
        truncated: rawText.length > PREVIEW_TEXT_MAX_LENGTH,
        color: hl.color || 'yellow',
      };
    });

    pages.push({
      url,
      storageKey: key,
      title: savedData?.title || value?.title || extractDomain(url),
      highlightCount: highlights.length,
      lastUpdated: value?.updatedAt || 0,
      previewHighlights,
      remainingCount: Math.max(0, highlights.length - PREVIEW_HIGHLIGHT_COUNT),
    });
  }

  // 最近更新的頁面排最前
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
      showEmpty('Not supported on this page.');
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
    showEmpty('Failed to load annotations.');
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
 * 根據 URL 渲染標註列表
 * 使用兩層查找法 (直接查 + Alias 查)
 *
 * @param {string} url
 * @param {string} originalTabUrl
 */
async function renderHighlightsForUrl(url, originalTabUrl) {
  const normalizedUrl = normalizeUrl(url);
  const normalizedOriginal = normalizeUrl(originalTabUrl);

  const key = `${HIGHLIGHTS_PREFIX}${normalizedUrl}`;
  const origKey = `${HIGHLIGHTS_PREFIX}${normalizedOriginal}`;
  const aliasKeyOrig = `${URL_ALIAS_PREFIX}${normalizedOriginal}`;
  const aliasKeyNorm = `${URL_ALIAS_PREFIX}${normalizedUrl}`;

  // 批量查詢所有可能的 Key
  const result = await chrome.storage.local.get([key, origKey, aliasKeyOrig, aliasKeyNorm]);

  // 查找邏輯
  let highlightsData = null;
  let targetKey = null;

  if (result[key]) {
    highlightsData = result[key];
    targetKey = key;
  } else if (result[origKey]) {
    highlightsData = result[origKey];
    targetKey = origKey;
  } else {
    // Check aliases
    const stableUrlFromAlias = result[aliasKeyOrig] || result[aliasKeyNorm];
    if (stableUrlFromAlias) {
      const aliasActualKey = `${HIGHLIGHTS_PREFIX}${stableUrlFromAlias}`;
      const aliasResult = await chrome.storage.local.get(aliasActualKey);
      if (aliasResult[aliasActualKey]) {
        highlightsData = aliasResult[aliasActualKey];
        targetKey = aliasActualKey;
      }
    }
  }

  if (!highlightsData?.highlights || highlightsData.highlights.length === 0) {
    showEmpty();
    return;
  }

  // 渲染列表
  renderList(highlightsData.highlights, targetKey);

  // 檢查是否已儲存到 Notion 以啟用 Sync 按鈕
  const savedKey = targetKey.replace(HIGHLIGHTS_PREFIX, SAVED_PREFIX);
  const savedResult = await chrome.storage.local.get(savedKey);

  if (savedResult[savedKey]) {
    els.syncButton.disabled = false; // If saved, enable sync button
    els.openNotionButton.style.display = 'inline-flex'; // Show open in notion button
  } else {
    els.syncButton.disabled = true; // If not saved, disable sync button
    els.openNotionButton.style.display = 'none';
  }

  // Store the target page url for syncing / opening
  els.syncButton.dataset.targetUrl = targetKey.replace(HIGHLIGHTS_PREFIX, '');
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
 * 刪除單個標註
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

    const data = result[storageKey];
    data.highlights = data.highlights.filter(hl => hl.id !== highlightId);

    // 儲存回 storage, 會自動觸發 onChanged 重繪
    if (data.highlights.length === 0) {
      await chrome.storage.local.remove(storageKey);
    } else {
      await chrome.storage.local.set({ [storageKey]: data });
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
  showMessage('Syncing...', 'info');

  try {
    const response = await chrome.runtime.sendMessage({ action: 'savePage' });
    if (response?.success) {
      showMessage('Synced successfully!', 'success');
    } else {
      showMessage(response?.error || 'Sync failed', 'error');
    }
  } catch {
    showMessage('Sync failed', 'error');
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
  showMessage('Opening...', 'info');

  try {
    const url = els.openNotionButton.dataset.targetUrl;
    const response = await chrome.runtime.sendMessage({ action: 'openNotionPage', url });
    if (response?.success) {
      showMessage('Opened successfully!', 'success');
    } else {
      showMessage(response?.error || 'Failed to open', 'error');
    }
  } catch {
    showMessage('Failed to open', 'error');
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
  // 只要 highlights 或 saved 有變，就重整當前頁面資料
  const hasRelevantChanges = Object.keys(changes).some(
    key => key.startsWith(HIGHLIGHTS_PREFIX) || key.startsWith(SAVED_PREFIX)
  );

  if (!hasRelevantChanges) {
    return;
  }

  // Always keep the unsynced badge in sync with storage
  updateUnsyncedBadge(null).catch(() => {});

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
    els.emptyState.querySelector('p').textContent = 'No highlights found on this page.';
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
    unsyncedView.style.display = 'block';
    renderUnsyncedView();
  } else {
    unsyncedView.style.display = 'none';
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
    return;
  }

  // 顯示工具列並更新計數
  if (els.unsyncedToolbar) {
    els.unsyncedToolbar.style.display = 'flex';
  }
  if (els.unsyncedCountLabel) {
    const count = cachedUnsyncedPages.length;
    els.unsyncedCountLabel.textContent = `${count} page${count === 1 ? '' : 's'}`;
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
      `${extractDomain(page.url)} • ${page.highlightCount} highlight${page.highlightCount === 1 ? '' : 's'}`;

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
      remainingEl.textContent = `+${page.remainingCount} more`;
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
  emptyMessage.textContent = 'All highlights are synced!';
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

  // 移除 DOM 卡片（fade out）
  cardEl.classList.add('card-removing');
  cardEl.addEventListener('animationend', () => cardEl.remove(), { once: true });

  // 更新工具列計數和 badge
  const count = cachedUnsyncedPages.length;
  if (els.unsyncedCountLabel) {
    els.unsyncedCountLabel.textContent = `${count} page${count === 1 ? '' : 's'}`;
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
  updateUnsyncedBadge();
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

  updateUnsyncedBadge();
}
