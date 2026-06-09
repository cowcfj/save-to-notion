/**
 * Current View 模組
 *
 * 職責：
 * - 負責「當前分頁」視圖的渲染與流程控制
 */

/* global chrome */

import { RESTRICTED_PROTOCOLS } from '../../scripts/config/shared/core.js';
import { UI_MESSAGES } from '../../scripts/config/shared/messages.js';
import { RUNTIME_ACTIONS } from '../../scripts/config/shared/runtimeActions.js';
import Logger from '../../scripts/utils/Logger.js';
import { normalizeUrl, computeStableUrl } from '../../scripts/utils/urlUtils.js';
import * as UI from './sidepanelUI.js';

/**
 * 建立 current view 的最新請求序號。
 *
 * @param {object} context - 共享狀態上下文
 * @returns {number}
 */
export function beginCurrentViewRequest(context) {
  context.currentViewRequestId += 1;
  return context.currentViewRequestId;
}

/**
 * 檢查 current view 的非同步請求是否仍可安全套用 UI。
 *
 * @param {object} context - 共享狀態上下文
 * @param {number} requestId
 * @returns {boolean}
 */
export function isCurrentViewRequestActive(context, requestId) {
  return context.currentActiveView === 'current' && context.currentViewRequestId === requestId;
}

/**
 * 解析目前分頁
 *
 * @param {object} context - 共享狀態上下文
 * @param {number|null} specificTabId
 * @returns {Promise<chrome.tabs.Tab|undefined>}
 */
export async function resolveCurrentTab(context, specificTabId) {
  if (specificTabId) {
    return chrome.tabs.get(specificTabId);
  }
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

/**
 * 檢查分頁是否為不支援的通訊協定
 *
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
 * 如果當前請求仍有效，顯示空狀態
 *
 * @param {object} context - 共享狀態上下文
 * @param {number} requestId
 * @param {string} message
 */
export function showCurrentViewEmptyIfActive(context, requestId, message) {
  if (isCurrentViewRequestActive(context, requestId)) {
    UI.showEmpty(context.els, message);
  }
}

/**
 * 主要載入流程
 *
 * @param {object} context - 共享狀態上下文
 * @param {number|null} specificTabId
 * @param {number} [requestId]
 */
export async function loadCurrentTab(
  context,
  specificTabId = null,
  requestId = beginCurrentViewRequest(context)
) {
  context.cachedStableUrl = null;
  context.cachedTabUrl = null;
  // 重置 banner 與 sync 按鈕，避免上一個分頁的「未保存」提示殘留到 NOT_SUPPORTED / LOAD_FAILED 等狀態
  context.resetSyncButtonForNoPage();
  if (isCurrentViewRequestActive(context, requestId)) {
    UI.showLoading(context.els);
  }

  try {
    const tab = await resolveCurrentTab(context, specificTabId);
    if (isUnsupportedTab(tab)) {
      showCurrentViewEmptyIfActive(context, requestId, UI_MESSAGES.SIDEPANEL.NOT_SUPPORTED);
      return;
    }

    // 核心: 解析穩定 URL (3層 Fallback)
    const stableUrl = await getStableUrlForTab(tab.id, tab.url);

    if (!isCurrentViewRequestActive(context, requestId)) {
      return;
    }

    // 快取 URL 供 handleStorageChange 快速路徑使用
    context.cachedStableUrl = stableUrl;
    context.cachedTabUrl = tab.url;

    // 獲取資料
    await context.renderHighlightsForUrl(stableUrl, tab.url, requestId);
  } catch (error) {
    Logger.error('[SidePanel] Failed to load tab', { error });
    showCurrentViewEmptyIfActive(context, requestId, UI_MESSAGES.SIDEPANEL.LOAD_FAILED);
  }
}

/**
 * 綁定當前頁面之 Notion 與同步 URL 屬性
 *
 * @param {object} context - 共享狀態上下文
 * @param {string} targetUrl
 * @param {string} originalTabUrl
 * @param {boolean} hasSavedData
 */
export function applyCurrentPageTargets(context, targetUrl, originalTabUrl, hasSavedData) {
  context.els.syncButton.dataset.targetUrl = targetUrl;
  context.els.openNotionButton.dataset.targetUrl = originalTabUrl;
  context.els.openNotionButton.disabled = !hasSavedData;

  context.currentPageHasSavedData = hasSavedData;
  context.applySyncButtonSavedState(hasSavedData);
}

/**
 * 渲染當前空狀態
 *
 * @param {object} context - 共享狀態上下文
 * @param {boolean} hasSavedData
 */
export function renderCurrentEmptyState(context, hasSavedData) {
  UI.showEmpty(context.els);
  context.els.openNotionButton.style.display = hasSavedData ? 'inline-flex' : 'none';
}

/**
 * 渲染當前高亮列表
 *
 * @param {object} context - 共享狀態上下文
 * @param {Array} highlights
 * @param {string|null|undefined} targetKey
 * @param {boolean} hasSavedData
 */
export function renderCurrentHighlightList(context, highlights, targetKey, hasSavedData) {
  UI.renderList(context.els, highlights, targetKey, context.handleDelete);
  context.els.openNotionButton.style.display = hasSavedData ? 'inline-flex' : 'none';
}
