/**
 * Side Panel Data Transforms 模組
 *
 * 提供資料轉換與頁面建立（page building, canonical mapping）的純函數。
 * 此模組不包含 runtime 共享狀態或 DOM 操作。
 */

import {
  SAVED_PREFIX,
  HIGHLIGHTS_PREFIX,
  PAGE_PREFIX,
  URL_ALIAS_PREFIX,
} from '../../scripts/config/shared/storage.js';
import { isRootUrl } from '../../scripts/utils/urlUtils.js';
import { compareKeysAlphabetically } from '../../scripts/utils/keyOrdering.js';
import {
  resolveKeys as resolveHighlightLookupKeys,
  pickAliasCandidate,
} from '../../scripts/highlighter/core/HighlightLookupResolver.js';
import * as UI from './sidepanelUI.js';

/**
 * @param {*} snapshot
 * @returns {Record<string, any>}
 */
export function normalizeStorageSnapshot(snapshot) {
  if (Object.prototype.toString.call(snapshot) !== '[object Object]') {
    return {};
  }
  return snapshot;
}

/**
 * @param {*} value
 * @returns {Array}
 */
export function getHighlightList(value) {
  if (Array.isArray(value)) {
    return value;
  }
  const highlights = value?.highlights;
  return Array.isArray(highlights) ? highlights : [];
}

/**
 * @param {Array} highlights
 * @returns {object}
 */
export function buildHighlightSummary(highlights) {
  return {
    highlightCount: highlights.length,
    previewHighlights: UI.buildPreviewHighlights(highlights),
    remainingCount: Math.max(0, highlights.length - UI.PREVIEW_HIGHLIGHT_COUNT),
  };
}

/**
 * @param {object} value
 * @returns {boolean}
 */
export function hasSyncedPageValue(value) {
  return Boolean(value?.notion?.pageId);
}

/**
 * @param {object} value
 * @param {string} url
 * @returns {string}
 */
export function resolvePageEntryTitle(value, url) {
  const notion = value?.notion;
  if (notion?.title) {
    return notion.title;
  }
  const metadata = value?.metadata;
  if (metadata?.title) {
    return metadata.title;
  }
  return UI.extractDomain(url);
}

/**
 * @param {object} value
 * @returns {number}
 */
export function resolvePageLastUpdated(value) {
  return value?.metadata?.lastUpdated || 0;
}

/**
 * 從 page_* 對象建立頁面條目（新格式）
 *
 * @param {string} key - storage key
 * @param {string} url - normalized url
 * @param {object} value - page_* 物件
 * @returns {object|null} 頁面條目，若應跳過則返回 null
 */
export function buildPageEntry(key, url, value) {
  if (hasSyncedPageValue(value)) {
    return null; // 已同步，跳過
  }
  if (isRootUrl(url)) {
    return null; // 已同步或根路徑，跳過
  }
  const highlights = getHighlightList(value);
  if (highlights.length === 0) {
    return null; // 無標註不顯示
  }
  return {
    url,
    storageKey: key,
    title: resolvePageEntryTitle(value, url),
    lastUpdated: resolvePageLastUpdated(value),
    ...buildHighlightSummary(highlights),
  };
}

/**
 * @param {object} all
 * @param {string} url
 * @param {string} canonicalUrl
 * @returns {{isSaved: boolean, savedData: any}}
 */
export function resolveLegacySavedState(all, url, canonicalUrl) {
  const storageSnapshot = normalizeStorageSnapshot(all);
  const savedDataOriginal = storageSnapshot[`${SAVED_PREFIX}${url}`];
  if (savedDataOriginal?.notionPageId) {
    return { isSaved: true, savedData: savedDataOriginal };
  }

  const savedDataCanonical = storageSnapshot[`${SAVED_PREFIX}${canonicalUrl}`];
  if (savedDataCanonical?.notionPageId) {
    return { isSaved: true, savedData: savedDataCanonical };
  }

  return { isSaved: false, savedData: savedDataOriginal || savedDataCanonical };
}

/**
 * @param {*} savedData
 * @param {*} value
 * @param {string} url
 * @returns {string}
 */
export function resolveLegacyEntryTitle(savedData, value, url) {
  if (savedData?.title) {
    return savedData.title;
  }
  if (value?.title) {
    return value.title;
  }
  return UI.extractDomain(url);
}

/**
 * @param {*} value
 * @returns {number}
 */
export function resolveLegacyLastUpdated(value) {
  return value?.updatedAt || 0;
}

/**
 * 從 highlights_* 對象建立頁面條目（舊格式）
 *
 * @param {string} key - storage key
 * @param {string} url - normalized url
 * @param {*} value - highlights_* 值
 * @param {{all: object, aliasMap: Map}} context
 * @returns {object|null}
 */
export function buildLegacyPageEntry(key, url, value, context) {
  if (isRootUrl(url)) {
    return null;
  }
  const { all, aliasMap } = context;
  const canonicalUrl = aliasMap.get(url) || url;
  const { isSaved, savedData } = resolveLegacySavedState(all, url, canonicalUrl);
  if (isSaved) {
    return null; // 已同步
  }
  const highlights = getHighlightList(value);
  if (highlights.length === 0) {
    return null;
  }
  return {
    url,
    storageKey: key,
    title: resolveLegacyEntryTitle(savedData, value, url),
    lastUpdated: resolveLegacyLastUpdated(value),
    ...buildHighlightSummary(highlights),
  };
}

/**
 * 從 allStorageData 建立 url → canonicalUrl 的 alias map。
 *
 * @param {Record<string, any>} allStorageData
 * @returns {Map<string, string>}
 * @private
 */
export function _buildAliasMap(allStorageData) {
  const storageSnapshot = normalizeStorageSnapshot(allStorageData);
  const aliasMap = new Map();
  for (const [key, value] of Object.entries(storageSnapshot)) {
    if (key.startsWith(URL_ALIAS_PREFIX)) {
      aliasMap.set(key.slice(URL_ALIAS_PREFIX.length), value);
    }
  }
  return aliasMap;
}

/**
 * Pure helper：根據 contract + reverse alias scan 計算同 canonical group 應刪除的 keys。
 *
 * @param {string} pageUrl - 由 storage key 抽出的 raw URL
 * @param {string} fallbackKey - 呼叫端傳入的 owner storageKey
 * @param {Record<string, any>} allStorageData - chrome.storage.local.get(null) 結果
 * @param {Map<string, string>} aliasMap - URL_ALIAS_PREFIX 解析結果
 * @returns {string[]} 應呼叫 chrome.storage.local.remove 的 key 清單（已字典序）
 */
export function _collectDeletionKeys(pageUrl, fallbackKey, allStorageData, aliasMap) {
  const storageSnapshot = normalizeStorageSnapshot(allStorageData);
  // Forward alias：用 pickAliasCandidate 走相同的 alias validation 規則
  const synthAliasData = {
    [`${URL_ALIAS_PREFIX}${pageUrl}`]: aliasMap.get(pageUrl) ?? null,
  };
  const aliasCandidate = pickAliasCandidate(synthAliasData, pageUrl);
  const contract = resolveHighlightLookupKeys(pageUrl, aliasCandidate);

  const reverseMembers = _buildReverseAliasDeletionKeys(aliasMap, contract.canonicalUrl, pageUrl);

  // 候選集 = contract.mutationTargetKey + contract.legacyCleanupKeys + reverseMembers + fallbackKey
  const candidateSet = new Set([
    contract.mutationTargetKey,
    ...contract.legacyCleanupKeys,
    ...reverseMembers,
    fallbackKey,
  ]);

  // 僅保留 snapshot 中實際存在的 key（避免無謂 remove）
  const result = [...candidateSet].filter(
    k => typeof k === 'string' && storageSnapshot[k] !== undefined && storageSnapshot[k] !== null
  );

  return result.toSorted(compareKeysAlphabetically);
}

/**
 * Reverse alias：找 aliasMap 中所有 value === canonicalUrl 的 from-URL,
 * 收集對應的 page_<other> / highlights_<other>（不在 contract 內,但屬同 canonical group）。
 *
 * @param {Map<string, string>} aliasMap
 * @param {string} canonicalUrl
 * @param {string} pageUrl
 * @returns {string[]}
 * @private
 */
export function _buildReverseAliasDeletionKeys(aliasMap, canonicalUrl, pageUrl) {
  const reverseMembers = [];
  for (const [aliasFromUrl, aliasToUrl] of aliasMap) {
    if (!_isReverseAliasMember(aliasFromUrl, aliasToUrl, canonicalUrl, pageUrl)) {
      continue;
    }
    reverseMembers.push(`${PAGE_PREFIX}${aliasFromUrl}`, `${HIGHLIGHTS_PREFIX}${aliasFromUrl}`);
  }
  return reverseMembers;
}

/**
 * @param {string} aliasFromUrl
 * @param {*} aliasToUrl
 * @param {string} canonicalUrl
 * @param {string} pageUrl
 * @returns {boolean}
 * @private
 */
export function _isReverseAliasMember(aliasFromUrl, aliasToUrl, canonicalUrl, pageUrl) {
  if (typeof aliasToUrl !== 'string' || aliasToUrl !== canonicalUrl) {
    return false;
  }
  return ![canonicalUrl, pageUrl].includes(aliasFromUrl);
}

/**
 * @param {string} key
 * @param {*} value
 * @returns {{key:string,url:string,value:any,format:'page'|'legacy'} | null}
 * @private
 */
export function _parseHighlightStorageEntry(key, value) {
  if (key.startsWith(PAGE_PREFIX)) {
    return { key, url: key.slice(PAGE_PREFIX.length), value, format: 'page' };
  }
  if (key.startsWith(HIGHLIGHTS_PREFIX)) {
    return { key, url: key.slice(HIGHLIGHTS_PREFIX.length), value, format: 'legacy' };
  }
  return null;
}

/**
 * @param {Map<string, {pages: Array<{key:string,url:string,value:any}>, legacies: Array<{key:string,url:string,value:any}>}>} groups
 * @param {string} canonical
 * @returns {{pages: Array<{key:string,url:string,value:any}>, legacies: Array<{key:string,url:string,value:any}>}}
 * @private
 */
export function _ensureStorageEntryGroup(groups, canonical) {
  if (!groups.has(canonical)) {
    groups.set(canonical, { pages: [], legacies: [] });
  }
  return groups.get(canonical);
}

/**
 * 將 allStorageData 中的 page_* / highlights_* 按 canonical URL 分群。
 *
 * @param {Record<string, any>} allStorageData
 * @param {Map<string, string>} aliasMap
 * @returns {Map<string, {pages: Array<{key:string,url:string,value:any}>, legacies: Array<{key:string,url:string,value:any}>}>}
 * @private
 */
export function _groupStorageEntries(allStorageData, aliasMap) {
  const storageSnapshot = normalizeStorageSnapshot(allStorageData);
  /** @type {Map<string, {pages: Array<{key:string,url:string,value:any}>, legacies: Array<{key:string,url:string,value:any}>}>} */
  const groups = new Map();
  for (const [key, value] of Object.entries(storageSnapshot)) {
    const entry = _parseHighlightStorageEntry(key, value);
    if (!entry) {
      continue;
    }

    const canonical = aliasMap.get(entry.url) || entry.url;
    const group = _ensureStorageEntryGroup(groups, canonical);
    if (entry.format === 'page') {
      group.pages.push({ key: entry.key, url: entry.url, value: entry.value });
    } else {
      group.legacies.push({ key: entry.key, url: entry.url, value: entry.value });
    }
  }
  return groups;
}

/**
 * 從同一 canonical URL 的 group 中選出最優先的 owner descriptor。
 *
 * @param {string} canonicalUrl
 * @param {{pages: Array<{key:string,url:string,value:any}>, legacies: Array<{key:string,url:string,value:any}>}} group
 * @returns {{ownerKey: string, ownerUrl: string, ownerValue: any, format: 'page'|'legacy'} | null}
 * @private
 */
export function _pickGroupOwner(canonicalUrl, group) {
  // Priority 1: page_<canonical> that can build a valid entry
  const canonicalPage = group.pages.find(page => page.url === canonicalUrl);
  if (canonicalPage) {
    const entry = buildPageEntry(canonicalPage.key, canonicalPage.url, canonicalPage.value);
    if (entry) {
      return {
        ownerKey: canonicalPage.key,
        ownerUrl: canonicalPage.url,
        ownerValue: canonicalPage.value,
        format: 'page',
      };
    }
  }

  // Priority 2: 任意其他 page_* 可建立有效 entry（例如 alias 指向空 stable key 時的 page_<original>）
  for (const page of group.pages) {
    const entry = buildPageEntry(page.key, page.url, page.value);
    if (entry) {
      return { ownerKey: page.key, ownerUrl: page.url, ownerValue: page.value, format: 'page' };
    }
  }

  // Priority 3: highlights_*（舊格式）
  const legacy = group.legacies[0];
  if (!legacy) {
    return null;
  }

  return {
    ownerKey: legacy.key,
    ownerUrl: legacy.url,
    ownerValue: legacy.value,
    format: 'legacy',
  };
}

/**
 * @param {Record<string, any>} allStorageData
 * @returns {Map<string, {ownerKey: string, ownerUrl: string, ownerValue: any, format: 'page'|'legacy'}>}
 */
export function resolveUnsyncedOwnership(allStorageData) {
  const storageSnapshot = normalizeStorageSnapshot(allStorageData);
  const aliasMap = _buildAliasMap(storageSnapshot);
  const groups = _groupStorageEntries(storageSnapshot, aliasMap);

  const owners = new Map();
  for (const [canonicalUrl, group] of groups) {
    const owner = _pickGroupOwner(canonicalUrl, group);
    if (owner) {
      owners.set(canonicalUrl, owner);
    }
  }

  return owners;
}
