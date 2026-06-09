/**
 * Unsynced View 模組
 *
 * 職責：
 * - 負責「待同步」視圖的渲染與流程控制
 */

/* global chrome */

import { PAGE_PREFIX, HIGHLIGHTS_PREFIX } from '../../scripts/config/shared/storage.js';
import { UI_MESSAGES } from '../../scripts/config/shared/messages.js';
import { RUNTIME_ACTIONS } from '../../scripts/config/shared/runtimeActions.js';
import { sanitizeUrlForLogging } from '../../scripts/utils/LogSanitizer.js';
import Logger from '../../scripts/utils/Logger.js';
import * as UI from './sidepanelUI.js';
import {
  normalizeStorageSnapshot,
  resolveUnsyncedOwnership,
  _buildAliasMap,
  buildPageEntry,
  buildLegacyPageEntry,
  _collectDeletionKeys,
} from './sidepanel-data-transforms.js';
import {
  _extractUrlFromStorageKey,
  _removeStorageKeyWithCanonicalCleanup,
} from './sidepanel-storage.js';

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

async function getActiveTabIdForHighlightCleanup(pageUrl) {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs?.[0]?.id;
  } catch (error) {
    Logger.warn('[SidePanel] deleteUnsyncedPage: active tab lookup failed', {
      action: RUNTIME_ACTIONS.CLEAR_HIGHLIGHTS,
      result: 'failure',
      error,
      url: sanitizeUrlForLogging(pageUrl),
    });
    return undefined;
  }
}

async function clearDeletedPageHighlights(pageUrl) {
  if (!pageUrl) {
    return;
  }

  const tabId = await getActiveTabIdForHighlightCleanup(pageUrl);
  const message = {
    action: RUNTIME_ACTIONS.CLEAR_HIGHLIGHTS,
    url: pageUrl,
  };
  if (tabId) {
    message.tabId = tabId;
  }

  try {
    await chrome.runtime.sendMessage(message);
  } catch (error) {
    Logger.warn('[SidePanel] deleteUnsyncedPage: background CLEAR_HIGHLIGHTS failed', {
      action: RUNTIME_ACTIONS.CLEAR_HIGHLIGHTS,
      result: 'failure',
      error,
      url: sanitizeUrlForLogging(pageUrl),
    });
  }
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
 * 待同步視圖讀取失敗時，退回到安全且可預期的 UI 狀態。
 *
 * @param {object} context - 共享狀態上下文
 * @param {string} [message]
 */
export function renderUnsyncedFallbackState(context, message = UI_MESSAGES.SIDEPANEL.LOAD_FAILED) {
  context.cachedUnsyncedPages = [];
  context.displayedCardCount = 0;

  if (context.els.unsyncedView) {
    context.els.unsyncedView.textContent = '';
    const fallbackMessage = document.createElement('p');
    fallbackMessage.className = 'unsynced-empty';
    fallbackMessage.textContent = message;
    context.els.unsyncedView.append(fallbackMessage);
  }

  if (context.els.unsyncedToolbar) {
    context.els.unsyncedToolbar.style.display = 'none';
  }
  if (context.els.loadMoreBtn) {
    context.els.loadMoreBtn.style.display = 'none';
  }

  UI.updateUnsyncedBadge(context.els, []);
}

/**
 * 建立 unsynced view 的最新請求序號。
 *
 * @param {object} context - 共享狀態上下文
 * @returns {number}
 */
export function beginUnsyncedViewRequest(context) {
  context.unsyncedViewRequestId += 1;
  return context.unsyncedViewRequestId;
}

/**
 * 檢查 unsynced view 的非同步請求是否仍可安全套用 UI。
 *
 * @param {object} context - 共享狀態上下文
 * @param {number} requestId
 * @returns {boolean}
 */
export function isUnsyncedViewRequestActive(context, requestId) {
  return context.currentActiveView === 'unsynced' && context.unsyncedViewRequestId === requestId;
}

/**
 * 從 storage 抓取未同步頁面後更新 badge
 * 統一 badge 資料流，確保 storage 變更與初始化路徑一致
 *
 * @param {object} context - 共享狀態上下文
 * @param {string} [logMessage] - 失敗時使用的日誌訊息
 * @returns {Promise<void>}
 */
export async function refreshUnsyncedBadge(
  context,
  logMessage = '[SidePanel] refreshUnsyncedBadge failed'
) {
  try {
    const pages = await getUnsyncedPages(context);
    UI.updateUnsyncedBadge(context.els, pages);
  } catch (error) {
    Logger.error(logMessage, { error });
    UI.updateUnsyncedBadge(context.els, []);
  }
}

/**
 * 取出下一批卡片並插入 unsyncedView，統一 displayedCardCount / hasMore / 補位邏輯
 *
 * @param {object} context - 共享狀態上下文
 * @param {number} count - 本次渲染數量
 */
export function appendNextUnsyncedBatch(context, count) {
  const renderedCount = UI.appendCards(
    context.els,
    context.cachedUnsyncedPages,
    context.displayedCardCount,
    count,
    {
      onOpen: url => {
        chrome.tabs.create({ url }).catch(error => {
          Logger.warn('[SidePanel] Failed to open unsynced page tab', {
            error,
            url: sanitizeUrlForLogging(url),
          });
        });
      },
      onDelete: (storageKey, card) => {
        const page = context.cachedUnsyncedPages?.find(item => item.storageKey === storageKey);
        deleteUnsyncedPage(context, storageKey, card).catch(error => {
          Logger.warn('[SidePanel] Failed to delete unsynced page card', {
            error,
            storageKeyType: getStorageKeyType(storageKey),
            url: sanitizeUrlForLogging(page?.url),
          });
        });
      },
    }
  );

  context.displayedCardCount += renderedCount;
}

/**
 * 從 chrome.storage.local 取出所有未同步頁面的標註資料。
 *
 * @param {object} _context - 共享狀態上下文
 * @returns {Promise<Array<{url, storageKey, title, highlightCount, lastUpdated, previewHighlights, remainingCount}>>}
 */
export async function getUnsyncedPages(_context) {
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
      entry.deletionKeys = _collectDeletionKeys(owner.ownerUrl, owner.ownerKey, all, aliasMap);
      pages.push(entry);
    }
  }

  return pages.toSorted((pa, pb) => pb.lastUpdated - pa.lastUpdated);
}

/**
 * @param {object} context - 共享狀態上下文
 */
export function scheduleUnsyncedBadgeRefresh(context) {
  clearTimeout(context.unsyncedBadgeTimer);
  context.unsyncedBadgeTimer = setTimeout(() => {
    refreshUnsyncedBadge(context, '[SidePanel] refreshUnsyncedBadge failed after storage change');
  }, 300);
}

/**
 * @param {object} context - 共享狀態上下文
 */
export function refreshUnsyncedViewIfActive(context) {
  if (context.currentActiveView === 'unsynced') {
    renderUnsyncedView(
      context,
      '[SidePanel] renderUnsyncedView failed after storage change',
      beginUnsyncedViewRequest(context)
    );
  }
}

/**
 * @param {object} context - 共享狀態上下文
 * @param {HTMLElement|null|undefined} loadMoreBtn
 */
export function renderUnsyncedEmptyPages(context, loadMoreBtn) {
  UI.renderUnsyncedEmptyState(context.els);
  if (loadMoreBtn) {
    loadMoreBtn.style.display = 'none';
  }
  if (context.els.unsyncedToolbar) {
    context.els.unsyncedToolbar.style.display = 'none';
  }
  UI.updateUnsyncedBadge(context.els, context.cachedUnsyncedPages);
}

/**
 * @param {object} context - 共享狀態上下文
 */
export function renderUnsyncedPageToolbar(context) {
  if (context.els.unsyncedToolbar) {
    context.els.unsyncedToolbar.style.display = 'flex';
  }
  if (context.els.unsyncedCountLabel) {
    const count = context.cachedUnsyncedPages.length;
    context.els.unsyncedCountLabel.textContent = UI_MESSAGES.SIDEPANEL.PAGE_COUNT(count);
  }
}

/**
 * @param {object} context - 共享狀態上下文
 */
export function renderUnsyncedPageList(context) {
  renderUnsyncedPageToolbar(context);
  appendNextUnsyncedBatch(context, UI.PAGE_BATCH_SIZE);
  UI.updateUnsyncedBadge(context.els, context.cachedUnsyncedPages);
}

/**
 * 渲染「待同步」視圖（含分頁）
 *
 * @param {object} context - 共享狀態上下文
 * @param {string} [logMessage] - 失敗時使用的日誌訊息
 * @param {number} [requestId] - 本次 unsynced view 請求序號
 */
export async function renderUnsyncedView(
  context,
  logMessage = '[SidePanel] renderUnsyncedView failed',
  requestId = beginUnsyncedViewRequest(context)
) {
  const loadMoreBtn = context.els.loadMoreBtn;

  try {
    // 每次進入時重新抓取資料
    const nextUnsyncedPages = await getUnsyncedPages(context);
    if (!isUnsyncedViewRequestActive(context, requestId)) {
      return;
    }
    context.cachedUnsyncedPages = nextUnsyncedPages;
    context.displayedCardCount = 0;
    context.els.unsyncedView.textContent = '';

    if (context.cachedUnsyncedPages.length === 0) {
      renderUnsyncedEmptyPages(context, loadMoreBtn);
      return;
    }

    renderUnsyncedPageList(context);
  } catch (error) {
    if (!isUnsyncedViewRequestActive(context, requestId)) {
      return;
    }
    Logger.error(logMessage, { error });
    renderUnsyncedFallbackState(context);
  }
}

/**
 * @param {object} context - 共享狀態上下文
 * @param {string} storageKey
 */
export function removeUnsyncedPageFromCache(context, storageKey) {
  context.cachedUnsyncedPages = context.cachedUnsyncedPages.filter(
    page => page.storageKey !== storageKey
  );
  context.displayedCardCount = Math.max(
    0,
    Math.min(context.displayedCardCount - 1, context.cachedUnsyncedPages.length)
  );
}

/**
 * @param {object} _context - 共享狀態上下文
 * @param {HTMLElement} cardEl
 */
export function animateUnsyncedCardRemoval(_context, cardEl) {
  cardEl.classList.add('card-removing');
  cardEl.addEventListener('animationend', () => cardEl.remove(), { once: true });
}

/**
 * @param {object} context - 共享狀態上下文
 */
export function updateUnsyncedToolbarAfterDeletion(context) {
  const count = context.cachedUnsyncedPages.length;
  if (context.els.unsyncedCountLabel) {
    context.els.unsyncedCountLabel.textContent = UI_MESSAGES.SIDEPANEL.PAGE_COUNT(count);
  }
  if (count > 0) {
    return;
  }
  if (context.els.unsyncedToolbar) {
    context.els.unsyncedToolbar.style.display = 'none';
  }
  if (context.els.loadMoreBtn) {
    context.els.loadMoreBtn.style.display = 'none';
  }
  UI.renderUnsyncedEmptyState(context.els);
}

/**
 * @param {object} context - 共享狀態上下文
 */
export function backfillUnsyncedCardAfterDeletion(context) {
  if (context.cachedUnsyncedPages.length === 0) {
    return;
  }
  if (context.displayedCardCount < context.cachedUnsyncedPages.length) {
    appendNextUnsyncedBatch(context, 1);
  }
}

/**
 * 刪除單一頁面的所有標注
 *
 * @param {object} context - 共享狀態上下文
 * @param {string} storageKey  storage 中的 page_* 或 highlights_* key
 * @param {HTMLElement} cardEl 對應的卡片 DOM 節點（用於移除）
 */
export async function deleteUnsyncedPage(context, storageKey, cardEl) {
  // 抽取 URL 用於後續的 background cleanup 與 foreground 清理
  const pageUrl = _extractUrlFromStorageKey(storageKey);

  try {
    await _removeStorageKeyWithCanonicalCleanup(storageKey);
  } catch (error) {
    Logger.error('[SidePanel] deleteUnsyncedPage: storage remove failed', { error });
    return; // bail out — don't mutate UI if storage failed
  }

  // 透過 background 執行 canonical CLEAR_HIGHLIGHTS 路徑；tabId 讓 background 順手清理頁面視覺狀態。
  await clearDeletedPageHighlights(pageUrl);

  // 從快取移除
  removeUnsyncedPageFromCache(context, storageKey);

  // 移除 DOM 卡片（fade out）
  animateUnsyncedCardRemoval(context, cardEl);

  // 更新工具列計數和 badge
  updateUnsyncedToolbarAfterDeletion(context);
  backfillUnsyncedCardAfterDeletion(context);
  UI.updateUnsyncedBadge(context.els, context.cachedUnsyncedPages);
}

/**
 * @param {object} _context - 共享狀態上下文
 * @param {object} page
 * @returns {string[]}
 */
export function resolveUnsyncedPageDeletionKeys(_context, page) {
  if (Array.isArray(page.deletionKeys) && page.deletionKeys.length > 0) {
    return page.deletionKeys;
  }
  return [page.storageKey];
}

/**
 * @param {object} context - 共享狀態上下文
 * @param {Array<object>} unsyncedPages
 * @returns {string[]}
 */
export function collectUnsyncedDeletionKeys(context, unsyncedPages) {
  const aggregatedKeys = new Set();
  for (const page of unsyncedPages) {
    addValidStorageKeys(aggregatedKeys, resolveUnsyncedPageDeletionKeys(context, page));
  }
  return [...aggregatedKeys];
}

/**
 * @param {object} context - 共享狀態上下文
 */
export function renderClearedUnsyncedPages(context) {
  context.cachedUnsyncedPages = [];
  context.displayedCardCount = 0;

  if (context.els.unsyncedToolbar) {
    context.els.unsyncedToolbar.style.display = 'none';
  }
  if (context.els.loadMoreBtn) {
    context.els.loadMoreBtn.style.display = 'none';
  }
  UI.renderUnsyncedEmptyState(context.els);

  UI.updateUnsyncedBadge(context.els, context.cachedUnsyncedPages);
}

/**
 * 刪除所有未同步頁面的標注
 *
 * @param {object} context - 共享狀態上下文
 */
export async function deleteAllUnsyncedPages(context) {
  if (!context.cachedUnsyncedPages || context.cachedUnsyncedPages.length === 0) {
    return;
  }

  const keysToRemove = collectUnsyncedDeletionKeys(context, context.cachedUnsyncedPages);

  try {
    await chrome.storage.local.remove(keysToRemove);
  } catch (error) {
    Logger.error('[SidePanel] deleteAllUnsyncedPages: storage remove failed', { error });
    return; // bail out — don't mutate UI if storage failed
  }

  renderClearedUnsyncedPages(context);
}

/**
 * 「載入更多」按鈕的 handler
 *
 * @param {object} context - 共享狀態上下文
 */
export function loadMoreCards(context) {
  if (!context.cachedUnsyncedPages) {
    return;
  }
  appendNextUnsyncedBatch(context, UI.PAGE_BATCH_SIZE);
}
