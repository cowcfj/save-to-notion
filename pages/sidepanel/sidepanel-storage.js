/**
 * Side Panel Storage CRUD 與 Canonical 清理模組
 *
 * 職責：
 * - 對 chrome.storage.local 進行直接 CRUD 存取、比對
 * - 處理新舊資料格式相容（page_* 與 highlights_*、saved_*）
 * - 提供 Canonical 狀態清理輔助函數
 */

/* global chrome */

import {
  SAVED_PREFIX,
  HIGHLIGHTS_PREFIX,
  PAGE_PREFIX,
} from '../../scripts/config/shared/storage.js';

import {
  resolveKeys as resolveHighlightLookupKeys,
  getAliasLookupKeys,
  pickAliasCandidate,
} from '../../scripts/highlighter/core/HighlightLookupResolver.js';

import {
  normalizeStorageSnapshot,
  _buildAliasMap,
  _collectDeletionKeys,
} from './sidepanel-data-transforms.js';

/**
 * 從 storage key 抽出 raw URL（去除前綴）。
 *
 * @param {string} storageKey - 預期為 page_<url> 或 highlights_<url>
 * @returns {string|null}
 */
export function _extractUrlFromStorageKey(storageKey) {
  if (typeof storageKey !== 'string') {
    return null;
  }
  if (storageKey.startsWith(PAGE_PREFIX)) {
    return storageKey.slice(PAGE_PREFIX.length);
  }
  if (storageKey.startsWith(HIGHLIGHTS_PREFIX)) {
    return storageKey.slice(HIGHLIGHTS_PREFIX.length);
  }
  return null;
}

/**
 * @param {string} targetKey
 * @returns {Promise<boolean>}
 */
export async function hasStoredPageNotionData(targetKey) {
  const result = await chrome.storage.local.get(targetKey);
  return Boolean(result[targetKey]?.notion?.pageId);
}

/**
 * @param {string} targetKey
 * @returns {string|null}
 */
export function resolveLegacySavedKey(targetKey) {
  if (!targetKey.startsWith(HIGHLIGHTS_PREFIX)) {
    return null;
  }
  return targetKey.replace(HIGHLIGHTS_PREFIX, SAVED_PREFIX);
}

/**
 * @param {string} savedKey
 * @returns {Promise<boolean>}
 */
export async function hasStoredLegacySavedData(savedKey) {
  const savedResult = await chrome.storage.local.get(savedKey);
  const savedData = savedResult[savedKey];
  return Boolean(savedData?.notionPageId);
}

/**
 * 判斷頁面是否已儲存到 Notion
 *
 * @param {*} notionData - page_*.notion（或 null 疋於未升級）
 * @param {string|null} targetKey - 目標 storage key
 * @returns {Promise<boolean>}
 */
export async function checkSavedData(notionData, targetKey) {
  if (notionData !== null && notionData !== undefined) {
    return Boolean(notionData?.pageId);
  }
  if (!targetKey) {
    return false;
  }

  // Phase 3 新格式：若剛新增標註但尚未同步，notionData 為 null，但稍後同步時 storage 會更新
  if (targetKey.startsWith(PAGE_PREFIX)) {
    return hasStoredPageNotionData(targetKey);
  }

  // 舊格式：僅當 targetKey 以 HIGHLIGHTS_PREFIX 開頭才對應查詢 saved_* key
  const savedKey = resolveLegacySavedKey(targetKey);
  if (!savedKey) {
    return false;
  }
  return hasStoredLegacySavedData(savedKey);
}

/**
 * 批量讀取 storage 並回傳 contract 與 storageData（内部 helper）
 *
 * @param {string} normalizedUrl
 * @param {string} normalizedOriginal
 * @returns {Promise<{contract: import('../../scripts/highlighter/core/HighlightLookupResolver.js').HighlightLookupContract, storageData: object}>}
 */
export async function _resolveStorageForUrl(normalizedUrl, normalizedOriginal) {
  // 批量讀取 alias + 所有可能 keys
  const aliasKeys = getAliasLookupKeys(normalizedUrl, normalizedOriginal);
  const preloadKeys = [
    ...aliasKeys,
    `${PAGE_PREFIX}${normalizedUrl}`,
    `${PAGE_PREFIX}${normalizedOriginal}`,
    `${HIGHLIGHTS_PREFIX}${normalizedUrl}`,
    `${HIGHLIGHTS_PREFIX}${normalizedOriginal}`,
  ];

  const preloadResult = await chrome.storage.local.get([...new Set(preloadKeys)]);
  // 同時為兩個 URL 選 alias
  const aliasFromUrl = pickAliasCandidate(preloadResult, normalizedUrl);
  const aliasFromOriginal = pickAliasCandidate(preloadResult, normalizedOriginal);

  // 補取尚未預先讀取的 alias-resolved keys（page_* 和 highlights_*）
  const extraKeys = [];
  const addExtraIfMissing = key => {
    if (!(key in preloadResult) && !extraKeys.includes(key)) {
      extraKeys.push(key);
    }
  };

  if (aliasFromUrl && aliasFromUrl !== normalizedUrl) {
    addExtraIfMissing(`${PAGE_PREFIX}${aliasFromUrl}`);
    addExtraIfMissing(`${HIGHLIGHTS_PREFIX}${aliasFromUrl}`);
  }
  if (aliasFromOriginal && aliasFromOriginal !== normalizedOriginal) {
    addExtraIfMissing(`${PAGE_PREFIX}${aliasFromOriginal}`);
    addExtraIfMissing(`${HIGHLIGHTS_PREFIX}${aliasFromOriginal}`);
  }

  let storageData = preloadResult;
  if (extraKeys.length > 0) {
    const extra = await chrome.storage.local.get(extraKeys);
    storageData = { ...preloadResult, ...extra };
  }

  // 各自建立 contract，合併 lookupOrder（去重）
  const contractA = resolveHighlightLookupKeys(normalizedUrl, aliasFromUrl);
  const contractB = resolveHighlightLookupKeys(normalizedOriginal, aliasFromOriginal);

  const mergedPageKeys = [...new Set([...contractA.pageKeys, ...contractB.pageKeys])];
  const mergedLegacyKeys = [...new Set([...contractA.legacyKeys, ...contractB.legacyKeys])];
  const mergedLookupOrder = [...mergedPageKeys, ...mergedLegacyKeys];
  const mergedContract = { ...contractA, lookupOrder: mergedLookupOrder };

  return { contract: mergedContract, storageData };
}

/**
 * 依 lookupOrder 尋找第一個存在的 page_* 物件，供 page-only 狀態使用。
 *
 * @param {import('../../scripts/highlighter/core/HighlightLookupResolver.js').HighlightLookupContract} contract
 * @param {object} storageData
 * @returns {{ pageKey: string | null, pageData: object | null, notionData: object | null }}
 */
export function findPageStateFromStorage(contract, storageData) {
  if (!storageData || typeof storageData !== 'object') {
    return { pageKey: null, pageData: null, notionData: null };
  }

  for (const key of contract.lookupOrder) {
    if (!key.startsWith(PAGE_PREFIX)) {
      continue;
    }

    const value = storageData[key];
    if (!value || typeof value !== 'object') {
      continue;
    }

    return {
      pageKey: key,
      pageData: value,
      notionData: value.notion ?? null,
    };
  }

  return { pageKey: null, pageData: null, notionData: null };
}

/**
 * @param {object} data
 * @param {string} highlightId
 * @returns {Array}
 */
export function _removeHighlightFromObjectData(data, highlightId) {
  const highlights = Array.isArray(data.highlights) ? data.highlights : [];
  return highlights.filter(hl => hl.id !== highlightId);
}

/**
 * @param {object} data
 * @param {string} highlightId
 * @param {boolean} keepWhenNotionExists
 * @returns {{ newData: object, shouldRemove: boolean }}
 */
export function _computeObjectDeleteResult(data, highlightId, keepWhenNotionExists) {
  const highlights = _removeHighlightFromObjectData(data, highlightId);
  const hasValidNotion = Boolean(
    keepWhenNotionExists && data.notion && typeof data.notion === 'object' && data.notion.pageId
  );
  const shouldRemove = highlights.length === 0 && !hasValidNotion;
  const newData = {
    ...data,
    highlights,
  };
  if (!shouldRemove) {
    const metadata = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
    newData.metadata = {
      ...metadata,
      lastUpdated: Date.now(),
    };
  }
  return { newData, shouldRemove };
}

/**
 * 根據資料格式計算刪除後的結果
 *
 * @param {object|Array} data - 目前 storage 中的資料
 * @param {string} highlightId - 要刪除的標註 ID
 * @param {string} storageKey - storage key
 * @returns {{ newData: any, shouldRemove: boolean }}
 */
export function _computeDeleteResult(data, highlightId, storageKey) {
  if (storageKey.startsWith(PAGE_PREFIX)) {
    // Phase 3：page_* 新格式的 partial 刪除
    return _computeObjectDeleteResult(data, highlightId, true);
  }

  if (data.highlights) {
    // 舊格式：有 highlights 物件結構
    return _computeObjectDeleteResult(data, highlightId, false);
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
 * 透過共享 cleanup helper 計算「整頁刪除」要移除的 key 集合。
 *
 * Phase 4：sidepanel 不得自行決定 legacy key 範圍；此 helper 包裝
 * resolver contract + planDeleteCleanup，產出實際應 remove 的 key 清單。
 *
 * Phase 4 follow-up（2026-05-03 plan §2）：
 * 改為走 `chrome.storage.local.get(null)` + `_collectDeletionKeys` 純函數,
 * 同時涵蓋 forward alias（contract）與 reverse alias（aliasMap value-side scan），
 * 避免 owner = canonical 時遺漏 page_<original> / highlights_<original>。
 *
 * @param {string} pageUrl - 由 storage key 抽出的 raw URL
 * @param {string} fallbackKey - 呼叫端傳入的 storageKey（防禦：確保即使 contract 沒涵蓋也會被刪）
 * @returns {Promise<string[]>} 應呼叫 chrome.storage.local.remove() 的 key 清單
 */
export async function _resolvePageDeletionKeys(pageUrl, fallbackKey) {
  const all = normalizeStorageSnapshot(await chrome.storage.local.get(null));
  const aliasMap = _buildAliasMap(all);
  return _collectDeletionKeys(pageUrl, fallbackKey, all, aliasMap);
}

/**
 * @param {string} storageKey
 * @returns {Promise<void>}
 */
export async function _removeStorageKeyWithCanonicalCleanup(storageKey) {
  const pageUrl = _extractUrlFromStorageKey(storageKey);
  if (!pageUrl) {
    await chrome.storage.local.remove(storageKey);
    return;
  }

  const keysToRemove = await _resolvePageDeletionKeys(pageUrl, storageKey);
  await chrome.storage.local.remove(keysToRemove.length > 0 ? keysToRemove : storageKey);
}
