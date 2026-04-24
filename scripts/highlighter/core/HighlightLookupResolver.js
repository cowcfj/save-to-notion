/**
 * HighlightLookupResolver — Highlight 查找契約（純函數層）
 *
 * 職責：
 * - 根據輸入的 URL 資訊與 alias 資料，產生統一的查找順序與 mutation 目標
 * - 純函數，不直接讀取 storage，不依賴 window / document
 * - 所有消費者（background、content restore、sidepanel）共用同一套規則
 *
 * 設計原則（對應計劃 §8 Target Contract）：
 * 1. Lookup order：page_<stableUrl> → page_<normalizedUrl> → highlights_<normalizedUrl>
 * 2. url_alias MAY 輔助解析 stableUrl，但 MUST NOT 遮蔽仍存在的 page_<normalizedUrl>
 * 3. page_* MUST 永遠優先於 highlights_*
 * 4. mutation 目標為 page_<canonicalUrl>（alias 解析後的最終 canonical key）
 * 5. legacyCleanupKeys 由 resolver 提供，避免各 consumer 各自決定清理順序
 *
 * 使用方式（典型流程）：
 * 1. 呼叫端先從 storage 讀取 alias 資料（可批量讀取）
 * 2. 呼叫 resolveKeys(rawUrl, normalizedUrl, aliasCandidate) 取得 contract
 * 3. 依 contract.lookupOrder 查詢 storage，找到第一個有資料的 key
 * 4. Mutation 時寫入 contract.mutationTargetKey
 * 5. Mutation 後清理 contract.legacyCleanupKeys 中存在的 key
 */

import { HIGHLIGHTS_PREFIX, PAGE_PREFIX, URL_ALIAS_PREFIX } from '../../config/shared/storage.js';
import { isSafeStableUrl } from '../../utils/urlUtils.js';

export const KEY_PREFIX = Object.freeze({
  PAGE: PAGE_PREFIX,
  HIGHLIGHTS: HIGHLIGHTS_PREFIX,
  URL_ALIAS: URL_ALIAS_PREFIX,
});

/**
 * @typedef {object} HighlightLookupContract
 * @property {string} canonicalUrl       - mutation 的唯一寫入目標 URL（alias-resolved stableUrl 或 normalizedUrl）
 * @property {string} stableUrl          - alias 解析後的穩定 URL（若無 alias 等於 normalizedUrl）
 * @property {string} normalizedUrl      - normalizeUrl(rawUrl) 的結果
 * @property {string[]} lookupOrder      - 按優先順序排列的 storage keys（consumer 應依序查詢，找到第一個有效值即停止）
 * @property {string[]} pageKeys         - lookupOrder 中的 page_* 系列 keys
 * @property {string[]} legacyKeys       - lookupOrder 中的 highlights_* 系列 keys
 * @property {boolean} aliasUsed         - 是否有 alias 被採用（stableUrl !== normalizedUrl）
 * @property {string} mutationTargetKey  - 所有 mutation（save / update / clear）應寫入的 key
 * @property {string[]} legacyCleanupKeys - mutation 後應清理的 legacy keys（不含 mutationTargetKey 本身）
 */

/**
 * 根據輸入 URL 與 alias 資料，產生統一的 highlight lookup contract。
 *
 * 此函數為純函數：相同輸入必定產生相同輸出，不依賴任何外部狀態。
 * Alias 查詢由呼叫端負責（呼叫端批量讀取後傳入 aliasCandidate）。
 *
 * @param {string} normalizedUrl      - 已標準化的頁面 URL（呼叫端負責 normalizeUrl）
 * @param {string | null} [aliasCandidate] - 從 storage 讀取的 alias 值（已安全性驗證後傳入），若無則為 null
 * @returns {HighlightLookupContract}
 */
export function resolveKeys(normalizedUrl, aliasCandidate = null) {
  if (!normalizedUrl || typeof normalizedUrl !== 'string') {
    throw new TypeError('[HighlightLookupResolver] normalizedUrl 必須是非空字串');
  }

  // 計算 stableUrl：若 aliasCandidate 有效，採用之；否則等同 normalizedUrl
  const stableUrl =
    aliasCandidate && aliasCandidate !== normalizedUrl ? aliasCandidate : normalizedUrl;
  const aliasUsed = stableUrl !== normalizedUrl;

  // 建立各 key
  const stablePageKey = `${PAGE_PREFIX}${stableUrl}`;
  const normalizedPageKey = `${PAGE_PREFIX}${normalizedUrl}`;
  const legacyNormKey = `${HIGHLIGHTS_PREFIX}${normalizedUrl}`;
  const legacyStableKey = `${HIGHLIGHTS_PREFIX}${stableUrl}`;

  // Lookup order（計劃 §8 最小查找順序）：
  // 1. page_<stableUrl>          — alias 命中的 canonical key（若 aliasUsed）
  // 2. page_<normalizedUrl>      — 資料可能仍在 original permalink
  // 3. highlights_<stableUrl>    — 舊格式 alias-resolved URL（若 aliasUsed）
  // 4. highlights_<normalizedUrl> — 舊格式回退（正規化後的 URL）
  //
  // 去重：若 stableUrl === normalizedUrl，page_* / highlights_* 各只放一次
  const pageKeys = aliasUsed ? [stablePageKey, normalizedPageKey] : [normalizedPageKey];

  // 舊格式：alias 命中時同時涵蓋兩個 URL 的 highlights_* key
  const legacyKeys = aliasUsed ? [legacyStableKey, legacyNormKey] : [legacyNormKey];

  const lookupOrder = [...pageKeys, ...legacyKeys];

  // Mutation target：優先寫入 alias-resolved stableUrl 的 page_* key
  // 理由：若 stableUrl 存在且有效，代表系統已知更穩定的 canonical key，
  //       應優先在此寫入，避免 normalizedUrl 與 stableUrl 並存產生雙 canonical
  const mutationTargetKey = stablePageKey;

  // Legacy cleanup：mutation 後應清理（若存在）的 key（不含 mutationTargetKey 本身）
  // 若 stableUrl === normalizedUrl，則 normalizedPageKey === stablePageKey，不需清理自己
  const legacyCleanupKeys = [];

  if (aliasUsed) {
    // stableUrl 與 normalizedUrl 不同時，normalizedUrl 的 page_* 可能需要清理
    legacyCleanupKeys.push(normalizedPageKey);
  }
  // 舊格式 highlights_* 永遠在 cleanup 名單（若存在才清理）
  legacyCleanupKeys.push(...legacyKeys);

  return Object.freeze({
    canonicalUrl: stableUrl,
    stableUrl,
    normalizedUrl,
    lookupOrder,
    pageKeys,
    legacyKeys,
    aliasUsed,
    mutationTargetKey,
    legacyCleanupKeys,
  });
}

/**
 * 計算 alias 查詢所需的 storage keys。
 *
 * 呼叫端批量讀取這些 keys 後，從結果中選出有效的 aliasCandidate，
 * 再傳入 resolveKeys()。
 *
 * @param {string} normalizedUrl  - 已標準化的頁面 URL
 * @param {string | null} [rawUrl] - 原始頁面 URL（可能與 normalizedUrl 不同）
 * @returns {string[]} 應查詢的 alias key 陣列
 */
export function getAliasLookupKeys(normalizedUrl, rawUrl = null) {
  if (!normalizedUrl || typeof normalizedUrl !== 'string') {
    return [];
  }

  const keys = [`${URL_ALIAS_PREFIX}${normalizedUrl}`];

  // 若 rawUrl 與 normalizedUrl 不同，也查詢 rawUrl 版本的 alias
  if (rawUrl && typeof rawUrl === 'string' && rawUrl !== normalizedUrl) {
    keys.push(`${URL_ALIAS_PREFIX}${rawUrl}`);
  }

  return keys;
}

/**
 * 從 storage 讀取結果中，選出最佳的 alias candidate。
 *
 * 規則：
 * - 只接受字串型 alias 值
 * - MUST NOT 接受空字串、太短的值或非 http(s) URL
 * - 由呼叫端在批量讀取後呼叫此 helper 過濾
 *
 * @param {object} aliasData            - chrome.storage.local.get 的結果
 * @param {string} normalizedUrl        - 已標準化的頁面 URL（用作第一優先 alias key 的主鍵）
 * @param {string | null} [rawUrl]      - 原始頁面 URL（用作第二優先 alias key 的主鍵）
 * @returns {string | null} 有效的 alias candidate，或 null
 */
export function pickAliasCandidate(aliasData, normalizedUrl, rawUrl = null) {
  if (!aliasData || typeof aliasData !== 'object') {
    return null;
  }

  const normalizedAliasKey = `${URL_ALIAS_PREFIX}${normalizedUrl}`;
  const hasRawKey = rawUrl && rawUrl !== normalizedUrl;
  const rawAliasKey = hasRawKey ? `${URL_ALIAS_PREFIX}${rawUrl}` : null;

  // 優先取 normalizedUrl 版本，次取 rawUrl 版本
  const fromNorm = aliasData[normalizedAliasKey];
  const fromRaw = rawAliasKey ? aliasData[rawAliasKey] : null;
  const candidate = fromNorm ?? fromRaw ?? null;

  return isValidAliasCandidate(candidate) ? candidate : null;
}

/**
 * 驗證 alias candidate 是否安全可用。
 *
 * @param {any} candidate
 * @returns {boolean}
 */
export function isValidAliasCandidate(candidate) {
  if (typeof candidate !== 'string' || candidate.length < 10) {
    return false;
  }

  return isSafeStableUrl(candidate);
}

/**
 * 從 page_* 格式的儲存內容中解析 highlights 陣列。
 *
 * @param {any} value - storage 讀到的內容
 * @returns {any[] | null}
 * @private
 */
function _parsePageHighlights(value) {
  if (!value) {
    return null;
  }
  return Array.isArray(value.highlights) ? value.highlights : null;
}

/**
 * 從 highlights_* 格式的儲存內容中解析 highlights 陣列。
 *
 * @param {any} value - storage 讀到的內容
 * @returns {any[] | null}
 * @private
 */
function _parseLegacyHighlights(value) {
  if (!value) {
    return null;
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (Array.isArray(value?.highlights)) {
    return value.highlights;
  }
  return null;
}

/**
 * 從 storage 查詢結果中，依 lookupOrder 取出第一個有效的 highlights 陣列。
 *
 * 此為便利 helper，消費者可直接使用，也可自行依 lookupOrder 查詢。
 *
 * @param {HighlightLookupContract} contract  - resolveKeys() 回傳的 contract
 * @param {object} storageData               - chrome.storage.local.get(contract.lookupOrder) 的結果
 * @returns {{ highlights: any[] | null, resolvedKey: string | null }} highlights 陣列（null 表示未找到）與命中的 key
 */
export function pickHighlightsFromStorage(contract, storageData) {
  if (!storageData || typeof storageData !== 'object') {
    return { highlights: null, resolvedKey: null };
  }

  for (const key of contract.lookupOrder) {
    const value = storageData[key];
    if (!value) {
      continue;
    }

    if (key.startsWith(PAGE_PREFIX)) {
      const highlights = _parsePageHighlights(value);
      if (highlights !== null) {
        return { highlights, resolvedKey: key };
      }
      continue;
    }

    if (key.startsWith(HIGHLIGHTS_PREFIX)) {
      const highlights = _parseLegacyHighlights(value);
      if (highlights !== null) {
        return { highlights, resolvedKey: key };
      }
    }
  }

  return { highlights: null, resolvedKey: null };
}
