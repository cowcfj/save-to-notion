/**
 * Side Panel 入口文件
 *
 * 職責：
 * - 監聽分頁切換，獲取當前分頁的穩定 URL
 * - 從 Storage 讀取標註並渲染 UI
 * - 監聽 Storage 變化自動更新
 */

/* global chrome */

import { normalizeUrl, computeStableUrl } from '../utils/urlUtils.js';
import { SAVED_PREFIX, HIGHLIGHTS_PREFIX, URL_ALIAS_PREFIX } from '../config/constants.js';

// DOM 元素
let els = {};

async function init() {
  els = {
    loadingState: document.querySelector('#loading-state'),
    emptyState: document.querySelector('#empty-state'),
    highlightsList: document.querySelector('#highlights-list'),
    syncButton: document.querySelector('#sync-button'),
    statusMessage: document.querySelector('#status-message'),
    template: document.querySelector('#highlight-card-template'),
  };

  // 1. 綁定按鈕事件
  els.syncButton.addEventListener('click', handleSyncClick);

  // 2. 監聽當前分頁變化
  chrome.tabs.onActivated.addListener(handleTabChange);
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, _tab) => {
    if (changeInfo.status === 'complete') {
      handleTabChange({ tabId });
    }
  });

  // 3. 監聽 Storage 變化 (即時更新)
  chrome.storage.onChanged.addListener(handleStorageChange);

  // 4. 初始化載入當前分頁
  await loadCurrentTab();
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
  showLoading();

  try {
    let tab;
    if (specificTabId) {
      tab = await chrome.tabs.get(specificTabId);
    } else {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = tabs[0];
    }

    if (!tab?.url || tab.url.startsWith('chrome://')) {
      showEmpty('Not supported on this page.');
      return;
    }

    // 核心: 解析穩定 URL (3層 Fallback)
    const stableUrl = await getStableUrlForTab(tab.id, tab.url);

    // 獲取資料
    await renderHighlightsForUrl(stableUrl, tab.url);
  } catch (error) {
    console.error('[SidePanel] Failed to load tab:', error);
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
      expect(() => jest.runAllTimers()).not.toThrow();
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
  }

  // 渲染列表
  if (highlightsData?.highlights && highlightsData.highlights.length > 0) {
    renderList(highlightsData.highlights, targetKey);
  }

  // 檢查是否已儲存到 Notion 以啟用 Sync 按鈕
  const savedKey = targetKey.replace(HIGHLIGHTS_PREFIX, SAVED_PREFIX);
  const savedResult = await chrome.storage.local.get(savedKey);

  if (savedResult[savedKey]) {
    els.syncButton.disabled = false; // If saved, enable sync button
  } else {
    els.syncButton.disabled = true; // If not saved, disable sync button
  }

  // Store the target page url for syncing
  els.syncButton.dataset.targetUrl = targetKey.replace(HIGHLIGHTS_PREFIX, '');
}

/**
 * 實體渲染 DOM
 *
 * @param {Array} highlights
 * @param {string} storageKey
 */
function renderList(highlights, storageKey) {
  els.highlightsList.innerHTML = '';

  highlights.forEach(hl => {
    const clone = els.template.content.cloneNode(true);
    const card = clone.querySelector('.highlight-card');
    const textEl = clone.querySelector('.highlight-text');
    const colorInd = clone.querySelector('.highlight-color-indicator');
    const delBtn = clone.querySelector('.delete-button');

    textEl.textContent = hl.text;

    // 設置顏色指示條
    if (hl.color) {
      // 假設 hl.color 是 'yellow', 'green', 需要對應到 CSS 變數或 hex
      const colorMap = {
        yellow: 'var(--hl-yellow)',
        green: 'var(--hl-green)',
        blue: 'var(--hl-blue)',
        red: 'var(--hl-red)',
        purple: 'var(--hl-purple)',
        pink: 'var(--hl-pink)',
      };
      colorInd.style.backgroundColor = colorMap[hl.color] || colorMap.yellow;
    }

    // 綁定刪除事件
    delBtn.addEventListener('click', () => handleDelete(hl.id, storageKey));

    els.highlightsList.append(card);
  });

  els.loadingState.style.display = 'none';
  els.emptyState.style.display = 'none';
  els.highlightsList.style.display = 'flex';
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
          console.warn('Failed to send remove highlight DOM message', error);
        });
    }
  } catch (error) {
    console.error('Failed to delete highlight', error);
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
 * 處理 Storage 變化
 *
 * @param {object} changes
 * @param {string} namespace
 */
function handleStorageChange(changes, namespace) {
  if (namespace !== 'local') {
    return;
  }
  // 簡單粗暴：只要 highlights 有變，就重整當前頁面資料
  const hasHighlightChanges = Object.keys(changes).some(key => key.startsWith(HIGHLIGHTS_PREFIX));

  if (hasHighlightChanges) {
    loadCurrentTab();
  }
}

// === UI 輔助函數 ===

function showLoading() {
  els.loadingState.style.display = 'flex';
  els.emptyState.style.display = 'none';
  els.highlightsList.style.display = 'none';
  els.syncButton.disabled = true;
}

function showEmpty(msg = null) {
  els.loadingState.style.display = 'none';
  els.emptyState.style.display = 'flex';
  els.highlightsList.style.display = 'none';
  els.syncButton.disabled = true;

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

  setTimeout(() => {
    els.statusMessage.style.display = 'none';
  }, 3000);
}

// 啟動
document.addEventListener('DOMContentLoaded', init);
