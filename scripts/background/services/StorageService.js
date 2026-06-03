/**
 * StorageService - 存儲操作封裝
 *
 * 職責：封裝 chrome.storage 操作，提供統一的異步接口
 * - 頁面保存狀態管理（Phase 3：統一 page_* 格式）
 * - 標註 (Highlights) 數據管理與遷移
 * - 向後兼容舊 saved_* / highlights_* 格式（讀時升級）
 * - 配置讀取
 * - URL 標準化（使用統一的 urlUtils）
 *
 * Phase 3 設計：
 * - 所有寫入一律寫入 page_* 格式
 * - 讀取時先查 page_*，沒有才查舊格式，找到舊格式則觸發讀時升級
 * - _withLock 確保同一 URL 的 read-modify-write 序列化
 *
 * @module services/StorageService
 */

/* global chrome */

// 從統一工具函數導入（Single Source of Truth）
import { normalizeUrl, computeStableUrl } from '../../utils/urlUtils.js';
import { sanitizeUrlForLogging } from '../../utils/LogSanitizer.js';
import { compareKeysAlphabetically } from '../../utils/keyOrdering.js';
import {
  LOCAL_STORAGE_KEYS,
  URL_ALIAS_PREFIX,
  PAGE_PREFIX,
  SAVED_PREFIX,
  HIGHLIGHTS_PREFIX,
} from '../../config/shared/storage.js';
import { ERROR_MESSAGES } from '../../config/shared/messages.js';
import {
  resolveKeys as resolveHighlightLookupKeys,
  getAliasLookupKeys,
  pickAliasCandidate,
  pickHighlightsFromStorage,
} from '../../highlighter/core/HighlightLookupResolver.js';

/**
 * URL 標準化相關常量（向後兼容：既有代碼可繼續導入這些常量）
 */
// URL_ALIAS_PREFIX/PAGE_PREFIX/SAVED_PREFIX/HIGHLIGHTS_PREFIX 在底部統一從 config/shared/storage.js 重新導出

export const STORAGE_ERROR = ERROR_MESSAGES.TECHNICAL.CHROME_STORAGE_UNAVAILABLE;

// Shared debug log prefix（多個 page-state writers 共用同一條 cleanup 失敗訊息）
const FAILED_REMOVE_LEGACY_KEYS_LOG = '[StorageService] Failed to remove legacy keys';

const UPGRADE_RETRY_MAX_ATTEMPTS = 5;
const UPGRADE_RETRY_BASE_DELAY_MS = 1000;
const UPGRADE_RETRY_MAX_DELAY_MS = 60_000;
const UPGRADE_RETRY_TTL_MS = 30 * 60 * 1000;
const NOTION_STATE_CLEAR_RETRY_DELAY_MS = 100;

/**
 * 取第一個有效的非空字串候選值
 *
 * @param {...any} candidates - 候選值
 * @returns {string|null}
 */
function pickFirstNonEmptyString(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }

    const trimmed = candidate.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

/**
 * 取第一個非 null 且非 undefined 的候選值
 *
 * @param {...any} candidates - 候選值
 * @returns {any}
 */
function pickFirstNonNullish(...candidates) {
  for (const candidate of candidates) {
    if (candidate !== null && candidate !== undefined) {
      return candidate;
    }
  }
  return null;
}

/**
 * highlight 各欄位的類型強制轉換與預設值表格
 */
const HIGHLIGHT_FIELD_COERCERS = {
  id: val => (typeof val === 'string' ? val : ''),
  text: val => (typeof val === 'string' ? val : ''),
  color: val => (typeof val === 'string' ? val : 'yellow'),
  rangeInfo: val => (val && typeof val === 'object' && !Array.isArray(val) ? val : {}),
  timestamp: val => (Number.isFinite(val) ? val : Date.now()),
};

/**
 * StorageService 類
 */
class StorageService {
  /**
   * @param {object} options - 配置選項
   * @param {object} options.chromeStorage - chrome.storage 對象（用於測試注入）
   * @param {object} options.logger - 日誌對象
   */
  constructor(options = {}) {
    this.storage = options.chromeStorage || (typeof chrome === 'undefined' ? null : chrome.storage);
    this.logger = options.logger || console;
    // Phase 3: URL-keyed Promise Chain Mutex（防止並發 read-modify-write 衝突）
    this._locks = new Map();
    // 記錄讀時升級失敗狀態（URL -> retry metadata），避免暫時性錯誤被永久跳過
    this._failedUpgradeAttempts = new Map();
  }

  /**
   * 互斥鎖（Promise Chain per URL）
   *
   * 確保同一 URL 的 read-modify-write 操作序列化執行，防止並發覆蓋。
   *
   * @param {string} url - 正規化後的 URL（作為鎖的 key）
   * @param {Function} fn - 要序列化執行的 async 函式
   * @returns {Promise<any>}
   * @private
   */
  async _withLock(url, fn) {
    const prev = this._locks.get(url) || Promise.resolve();
    let resolveNext;
    const next = new Promise(resolve => {
      resolveNext = resolve;
    });
    this._locks.set(url, next);
    try {
      await prev;
      return await fn();
    } finally {
      resolveNext();
      // 若此 Promise 仍是最新的，則清除（避免 Map 無限增長）
      if (this._locks.get(url) === next) {
        this._locks.delete(url);
      }
    }
  }

  /**
   * 解析 canonical lock key（所有 page-state writers 共用的 lock 推導規則）。
   *
   * Phase 4 follow-up（2026-05-03 plan §1）：
   * 為避免 stable / original 兩個 URL 在不同 _withLock namespace 下互不互斥，
   * 所有 page-state writers MUST 透過此 helper 取得 lock key —
   * 即 `contract.mutationTargetKey`（= `page_<canonicalUrl>`）。
   *
   * @param {string} normalizedUrl - normalizeUrl(pageUrl) 結果
   * @param {string|null} [rawUrl] - 原始 pageUrl（與 normalizedUrl 不同時用以 alias preload）
   * @returns {Promise<{lockKey: string, aliasCandidate: string|null, contract: import('../../highlighter/core/HighlightLookupResolver.js').HighlightLookupContract}>}
   * @private
   */
  async _resolveCanonicalLockKey(normalizedUrl, rawUrl = null) {
    const aliasKeys = getAliasLookupKeys(normalizedUrl, rawUrl);
    const aliasResult = aliasKeys.length > 0 ? await this.storage.local.get(aliasKeys) : {};
    const aliasCandidate = pickAliasCandidate(aliasResult, normalizedUrl, rawUrl);
    const contract = resolveHighlightLookupKeys(normalizedUrl, aliasCandidate);
    return { lockKey: contract.mutationTargetKey, aliasCandidate, contract };
  }

  /**
   * 批量讀取頁面狀態（新舊格式統一入口）
   *
   * 一次讀取同時嘗試 page_* / saved_* / url_alias_*，
   * 回傳統一格式的 state 物件或 null。
   *
   * @param {string} normalizedUrl - 已正規化的 URL
   * @returns {Promise<{format: 'new', key: string, data: object} | {format: 'legacy', savedKey: string, savedData: object} | null>}
   * @private
   */
  async _getPageState(normalizedUrl) {
    const pageKey = `${PAGE_PREFIX}${normalizedUrl}`;
    const savedKey = `${SAVED_PREFIX}${normalizedUrl}`;
    const aliasKey = `${URL_ALIAS_PREFIX}${normalizedUrl}`;

    const result = await this.storage.local.get([pageKey, savedKey, aliasKey]);

    // 已是新格式（page_*）
    if (result[pageKey]) {
      return { format: 'new', key: pageKey, data: result[pageKey] };
    }

    // 有 alias → 嘗試查詢 stable URL 的 page_*
    const stableUrl = result[aliasKey];
    if (stableUrl) {
      const stablePageKey = `${PAGE_PREFIX}${stableUrl}`;
      const stableSavedKey = `${SAVED_PREFIX}${stableUrl}`;
      const r2 = await this.storage.local.get([stablePageKey, stableSavedKey]);
      if (r2[stablePageKey]) {
        return { format: 'new', key: stablePageKey, data: r2[stablePageKey] };
      }
      if (r2[stableSavedKey]) {
        // 使用 stableUrl（而非 normalizedUrl）觸發升級，確保寫入正確的 key
        return {
          format: 'legacy',
          savedKey: stableSavedKey,
          savedData: r2[stableSavedKey],
          resolvedUrl: stableUrl,
        };
      }
    }

    // 舊格式（saved_*）
    if (result[savedKey]) {
      return { format: 'legacy', savedKey, savedData: result[savedKey] };
    }

    return null;
  }

  _resolvePageStateTargetUrl(state, fallbackUrl) {
    if (typeof state?.key === 'string' && state.key.startsWith(PAGE_PREFIX)) {
      return state.key.slice(PAGE_PREFIX.length);
    }
    if (typeof state?.resolvedUrl === 'string' && state.resolvedUrl) {
      return state.resolvedUrl;
    }
    return fallbackUrl;
  }

  /**
   * 構造 page_* 物件中的 notion 欄位
   *
   * @param {object|null} savedData - 舊 saved_* 資料
   * @param {number} now - 當前時間戳
   * @returns {object|null} notion 格式物件
   * @private
   */
  _buildPageNotion(savedData, now) {
    if (!savedData) {
      return null;
    }
    return {
      pageId: pickFirstNonEmptyString(savedData.notionPageId, savedData.pageId),
      url: pickFirstNonEmptyString(savedData.notionUrl, savedData.url),
      title: savedData.title || null,
      savedAt: savedData.savedAt ?? savedData.lastUpdated ?? now,
      lastVerifiedAt: savedData.lastVerifiedAt ?? null,
    };
  }

  /**
   * 構造 page_* 物件中的 metadata 欄位
   *
   * @param {object|null} savedData - 舊 saved_* 資料
   * @param {number} now - 當前時間戳
   * @param {string} [migratedFrom] - 遷移來源 key
   * @returns {object} metadata 格式物件
   * @private
   */
  _buildPageMetadata(savedData, now, migratedFrom) {
    const createdAt = savedData?.savedAt ?? savedData?.lastUpdated ?? now;
    return {
      createdAt,
      lastUpdated: now,
      ...(migratedFrom ? { migratedFrom } : {}),
    };
  }

  /**
   * 構造 page_* 物件中的 highlights 陣列
   *
   * @param {any} highlights - 舊 highlights_* 資料
   * @returns {Array} 標注陣列
   * @private
   */
  _buildPageHighlights(highlights) {
    if (Array.isArray(highlights)) {
      return highlights;
    }
    return highlights?.highlights || [];
  }

  /**
   * 將舊格式資料轉換為 page_* 物件結構
   *
   * @param {object|null} savedData - 舊 saved_* 資料
   * @param {Array} highlights - 舊 highlights_* 資料
   * @param {string} normalizedUrl - 正規化 URL
   * @param {string} [migratedFrom] - 遷移來源 key（可選）
   * @returns {object} page_* 格式物件
   * @private
   */
  _buildPageObject(savedData, highlights, normalizedUrl, migratedFrom) {
    const now = Date.now();
    return {
      notion: this._buildPageNotion(savedData, now),
      highlights: this._buildPageHighlights(highlights),
      metadata: this._buildPageMetadata(savedData, now, migratedFrom),
    };
  }

  /**
   * 規範化 highlights 陣列，確保符合 schema 最低要求
   *
   * @param {any} highlights - 原始 highlights 值
   * @returns {Array<object>} 規範化後的 highlights
   * @private
   */
  _normalizeHighlightsArray(highlights) {
    if (!Array.isArray(highlights)) {
      return [];
    }

    return highlights
      .filter(item => item && typeof item === 'object' && !Array.isArray(item))
      .map(item => {
        const coerced = Object.fromEntries(
          Object.entries(HIGHLIGHT_FIELD_COERCERS).map(([key, coerce]) => [key, coerce(item[key])])
        );
        return {
          ...item,
          ...coerced,
        };
      });
  }

  /**
   * 清理舊格式鍵名（在持有 canonical lock 的同一 lock 範圍內、依字典序執行）
   *
   * @param {string} targetKey - 當前寫入的主鍵名
   * @param {Array<string>} candidateKeys - 待清理候選鍵名
   * @param {object} existing - 既有數據字典
   * @param {Array<string>} [forceIncludePrefixes=[]] - 強制包含的鍵名首碼（即使 existing 中不存在也強制移除）
   * @returns {Promise<void>}
   * @private
   */
  async _runLegacyKeyCleanup(targetKey, candidateKeys, existing, forceIncludePrefixes = []) {
    const cleanupKeys = candidateKeys
      .filter(k => {
        if (k === targetKey) {
          return false;
        }
        if (Object.hasOwn(existing, k)) {
          return true;
        }
        return forceIncludePrefixes.some(prefix => k.startsWith(prefix));
      })
      .toSorted(compareKeysAlphabetically);

    if (cleanupKeys.length > 0) {
      await this.storage.local.remove(cleanupKeys).catch(error => {
        this.logger.debug?.(FAILED_REMOVE_LEGACY_KEYS_LOG, {
          keys: cleanupKeys,
          error: error?.message ?? error,
        });
      });
    }
  }

  /**
   * 構造 notion 結構化欄位
   *
   * 內部先把 `currentNotion` 預設化為空物件，避免每個欄位重複 `?.` 短路
   * （cc 來源屬於 [[refactor-cc-source-taxonomy]] 的「N 次重複 rule + optional chaining」混合）。
   *
   * @param {object} data - 傳入的更新數據
   * @param {number} now - 當前時間戳
   * @param {object} [currentNotion=null] - 既有 notion 數據
   * @returns {object} notion 欄位對象
   * @private
   */
  _buildNotionField(data, now, currentNotion = null) {
    const fallback = currentNotion ?? {};
    const destinationProfileId = Object.hasOwn(data, 'destinationProfileId')
      ? (data.destinationProfileId ?? null)
      : (fallback.destinationProfileId ?? null);
    return {
      pageId: pickFirstNonEmptyString(data.notionPageId, data.pageId, fallback.pageId),
      url: pickFirstNonEmptyString(data.notionUrl, data.url, fallback.url),
      title: data.title || fallback.title || null,
      savedAt: pickFirstNonNullish(data.savedAt, fallback.savedAt, now),
      lastVerifiedAt: pickFirstNonNullish(data.lastVerifiedAt, fallback.lastVerifiedAt, null),
      destinationProfileId,
    };
  }

  /**
   * 構造需要清除的頁面鍵名列表
   *
   * @param {string} normalizedUrl - 正規化後的 URL
   * @param {string} stableUrl - 穩定版 URL
   * @returns {Array<string>} 待清除的鍵名陣列
   * @private
   */
  _buildClearPageKeys(normalizedUrl, stableUrl) {
    const keys = [`${PAGE_PREFIX}${normalizedUrl}`, `${SAVED_PREFIX}${normalizedUrl}`];
    if (stableUrl && stableUrl !== normalizedUrl) {
      keys.push(`${PAGE_PREFIX}${stableUrl}`, `${SAVED_PREFIX}${stableUrl}`);
    }
    return keys;
  }

  /**
   * 解析當前頁面狀態資料
   *
   * @param {object} existing - 既有資料字典
   * @param {object} state - _getPageState 回傳的狀態
   * @param {string} targetKey - 當前寫入的主鍵名
   * @param {string} fallbackPageKey - 備用頁面鍵名
   * @returns {object} 當前頁面資料
   * @private
   */
  _resolveCurrentPageState(existing, state, targetKey, fallbackPageKey) {
    const current = existing[targetKey];
    if (current) {
      return current;
    }
    if (state?.format === 'new') {
      return state.data;
    }
    return existing[fallbackPageKey] || {};
  }

  /**
   * 解析舊格式 highlights 資料
   *
   * @param {object} existing - 既有資料字典
   * @param {string} fallbackHlKey - 備用 highlights 鍵名
   * @param {string} normalizedHlKey - 正規化 highlights 鍵名
   * @returns {Array<object>} 舊 highlights 陣列
   * @private
   */
  _resolveLegacyHighlights(existing, fallbackHlKey, normalizedHlKey) {
    const legacyHighlights = existing[fallbackHlKey] ?? existing[normalizedHlKey];
    if (Array.isArray(legacyHighlights)) {
      return legacyHighlights;
    }
    if (Array.isArray(legacyHighlights?.highlights)) {
      return legacyHighlights.highlights;
    }
    return [];
  }

  /**
   * 檢查 Notion pageId 是否與預期的 expectedPageId 不匹配
   *
   * @param {object|null} state - 頁面狀態
   * @param {string} expectedPageId - 預期的 pageId
   * @returns {boolean} 是否不匹配
   * @private
   */
  _isMismatchedPageId(state, expectedPageId) {
    return Boolean(
      expectedPageId && state?.data?.notion?.pageId && state.data.notion.pageId !== expectedPageId
    );
  }

  /**
   * 清除 state 物件中的 notion 綁定，回傳寫入 storage 的 payload
   *
   * @param {object} state - 當前頁面狀態
   * @param {number} now - 當前時間戳
   * @returns {object} 要寫入儲存體的資料 payload
   * @private
   */
  _clearNotionFromPage(state, now) {
    return {
      [state.key]: {
        ...state.data,
        notion: null,
        metadata: {
          ...state.data.metadata,
          lastUpdated: now,
        },
      },
    };
  }

  /**
   * 收集需要清理的 Notion 舊格式鍵名
   *
   * @param {string} normalizedUrl - 正規化 URL
   * @param {string} stableUrl - 穩定版 URL
   * @param {object|null} state - 頁面狀態
   * @returns {Array<string>} 待清理鍵名陣列
   * @private
   */
  _collectClearNotionLegacyKeys(normalizedUrl, stableUrl, state) {
    const oldKeys = [`${SAVED_PREFIX}${normalizedUrl}`];
    if (stableUrl && stableUrl !== normalizedUrl) {
      oldKeys.push(`${SAVED_PREFIX}${stableUrl}`);
    }
    if (state?.format === 'legacy') {
      oldKeys.push(state.savedKey);
    }
    return oldKeys;
  }

  /**
   * 檢查現有的 page_* 資料是否比建置出來的 page 物件更新
   *
   * @param {object|null} existingPage - 現有 page 資料
   * @param {object} builtObj - 新建置的 page 資料
   * @returns {boolean} 是否現有資料更新
   * @private
   */
  _isExistingPageNewer(existingPage, builtObj) {
    return Boolean(
      existingPage &&
      (existingPage.metadata?.lastUpdated ?? 0) > (builtObj.metadata?.lastUpdated ?? 0)
    );
  }

  /**
   * 合併現有較新 page 資料與新建置的 page 資料（讀時升級用）
   *
   * @param {object} existingPage - 現有較新 page 資料
   * @param {object} builtObj - 新建置的 page 資料
   * @returns {object} 合併後的 page 資料物件
   * @private
   */
  _mergeUpgradePage(existingPage, builtObj) {
    return {
      ...builtObj,
      ...existingPage,
      highlights: existingPage.highlights?.length ? existingPage.highlights : builtObj.highlights,
    };
  }

  /**
   * 構造 getHighlights 批量預讀取所需的鍵名列表
   *
   * @param {string} normalizedUrl - 正規化 URL
   * @param {string|null} rawUrl - 原始 URL
   * @param {Array<string>} aliasKeys - 別名鍵名列表
   * @returns {Array<string>} 預讀取鍵名列表
   * @private
   */
  _buildHighlightsPreloadKeys(normalizedUrl, rawUrl, aliasKeys) {
    const keys = [
      ...aliasKeys,
      `${PAGE_PREFIX}${normalizedUrl}`,
      `${HIGHLIGHTS_PREFIX}${normalizedUrl}`,
    ];
    if (rawUrl && rawUrl !== normalizedUrl) {
      keys.push(`${PAGE_PREFIX}${rawUrl}`, `${HIGHLIGHTS_PREFIX}${rawUrl}`);
    }
    return Array.from(new Set(keys));
  }

  /**
   * 當 alias 已啟用時，補取 stableUrl 的 page_* 和 highlights_*（getHighlights 用）
   *
   * @param {string|null} aliasCandidate - 別名候選
   * @param {string} normalizedUrl - 正規化 URL
   * @param {object} preloadResult - 預讀取的資料結果
   * @returns {Promise<object>} 合併補取結果後的資料字典
   * @private
   */
  async _resolveStableExtraKeys(aliasCandidate, normalizedUrl, preloadResult) {
    if (!aliasCandidate || aliasCandidate === normalizedUrl) {
      return preloadResult;
    }

    const extraKeys = [];
    const stablePageKey = `${PAGE_PREFIX}${aliasCandidate}`;
    const stableHlKey = `${HIGHLIGHTS_PREFIX}${aliasCandidate}`;

    if (!(stablePageKey in preloadResult)) {
      extraKeys.push(stablePageKey);
    }
    if (!(stableHlKey in preloadResult)) {
      extraKeys.push(stableHlKey);
    }

    if (extraKeys.length > 0) {
      const extra = await this.storage.local.get(extraKeys);
      return { ...preloadResult, ...extra };
    }

    return preloadResult;
  }

  /**
   * 從全量儲存空間數據中收集新格式 page_* 的 highlights 資料
   *
   * @param {object} allData - 全量數據
   * @returns {Record<string, object>} 收集結果
   * @private
   */
  _collectPageHighlights(allData) {
    const result = {};
    for (const [key, value] of Object.entries(allData)) {
      if (!key.startsWith(PAGE_PREFIX)) {
        continue;
      }
      if (!value || typeof value !== 'object') {
        this.logger.warn?.('[StorageService] page_* entry has invalid shape, skipped', { key });
        continue;
      }
      const url = key.slice(PAGE_PREFIX.length);
      result[url] = { url, highlights: Array.isArray(value.highlights) ? value.highlights : [] };
    }
    return result;
  }

  /**
   * 從全量儲存空間數據中收集舊格式 highlights_* 的 highlights 資料，且不覆寫已存在的 result
   *
   * @param {object} allData - 全量數據
   * @param {Record<string, object>} existingResult - 已收集到的 highlights 結果
   * @returns {Record<string, object>} 補充過渡期格式後的完整收集結果
   * @private
   */
  _collectLegacyHighlights(allData, existingResult) {
    const result = { ...existingResult };
    for (const [key, value] of Object.entries(allData)) {
      if (key.startsWith(HIGHLIGHTS_PREFIX)) {
        const url = key.slice(HIGHLIGHTS_PREFIX.length);
        if (!result[url]) {
          result[url] = this._normalizeLegacyHighlight(value);
        }
      }
    }
    return result;
  }

  /**
   * 將內部儲存的 notion 欄位映射為公開的預期欄位名
   *
   * @param {object|null} notion - 內部儲存的 notion 資料
   * @returns {object|null} 映射後的資料，若無 notion 則為 null
   * @private
   */
  _mapNotionToPublic(notion) {
    if (!notion) {
      return null;
    }
    return {
      notionPageId: notion.pageId ?? null,
      notionUrl: notion.url ?? null,
      title: notion.title || null,
      savedAt: notion.savedAt ?? null,
      lastVerifiedAt: notion.lastVerifiedAt ?? null,
      destinationProfileId: notion.destinationProfileId ?? null,
    };
  }

  /**
   * 從儲存體項目的鍵名與值中解析並提取已保存的頁面 URL
   *
   * @param {string} key - 儲存體鍵名
   * @param {any} value - 儲存體值
   * @returns {string|null} 提取出的頁面 URL，若未保存則為 null
   * @private
   */
  _extractSavedUrlFromEntry(key, value) {
    if (key.startsWith(PAGE_PREFIX) && value?.notion) {
      // 新格式：有 notion 欄位代表已保存
      return key.slice(PAGE_PREFIX.length);
    }
    if (key.startsWith(SAVED_PREFIX)) {
      // 舊格式（過渡期）
      return key.slice(SAVED_PREFIX.length);
    }
    return null;
  }

  /**
   * 從 lookupOrder 找出第一個有資料的遷移來源鍵名與值
   *
   * @param {object} contract - 鍵名解析合約
   * @param {object} existing - 既有資料字典
   * @param {string} targetKey - 當前寫入的主鍵名
   * @returns {{key: string, value: any} | null} 遷移來源，若無則為 null
   * @private
   */
  _findMigrationSource(contract, existing, targetKey) {
    for (const key of contract.lookupOrder) {
      if (key !== targetKey && existing[key]) {
        return { key, value: existing[key] };
      }
    }
    return null;
  }

  /**
   * 構造 highlights 更新/遷移後的 page 物件
   *
   * `metadata.lastUpdated` 由 helper 內部以 `Date.now()` 蓋章，避免 caller 多傳一個
   * 衍生參數而觸發 CodeScene `Number of Arguments` 上限。
   *
   * @param {object|null} canonicalCurrent - 既有 canonical page 資料
   * @param {{key: string, value: any}|null} migrationSource - 遷移來源
   * @param {Array<object>} highlights - 更新的 highlights 陣列
   * @param {string} normalizedUrl - 正規化 URL
   * @returns {object} 新的 page 資料物件
   * @private
   */
  _buildHighlightsUpdate(canonicalCurrent, migrationSource, highlights, normalizedUrl) {
    const now = Date.now();
    if (canonicalCurrent) {
      return {
        ...canonicalCurrent,
        highlights,
        metadata: {
          ...canonicalCurrent.metadata,
          lastUpdated: now,
        },
      };
    }

    if (migrationSource?.key?.startsWith(PAGE_PREFIX)) {
      return {
        ...migrationSource.value,
        highlights,
        metadata: {
          ...migrationSource.value.metadata,
          lastUpdated: now,
          migratedFrom: migrationSource.key,
        },
      };
    }

    return this._buildPageObject(
      null,
      highlights,
      normalizedUrl,
      migrationSource?.key || undefined
    );
  }

  /**
   * 清理超過 TTL 的升級失敗追蹤狀態
   *
   * @param {string} url - 目標 URL
   * @param {number} now - 當前時間戳
   * @returns {object | null}
   * @private
   */
  _pruneExpiredUpgradeFailure(url, now) {
    const state = this._failedUpgradeAttempts.get(url);
    if (!state) {
      return null;
    }

    if (now - state.firstFailureAt >= UPGRADE_RETRY_TTL_MS) {
      this._failedUpgradeAttempts.delete(url);
      return null;
    }

    return state;
  }

  /**
   * 判斷當前是否允許重試讀時升級
   *
   * @param {string} url - 目標 URL
   * @param {number} now - 當前時間戳
   * @returns {boolean}
   * @private
   */
  _canRetryUpgrade(url, now) {
    const state = this._pruneExpiredUpgradeFailure(url, now);
    if (!state) {
      return true;
    }

    if (
      state.attempts >= UPGRADE_RETRY_MAX_ATTEMPTS &&
      now - state.firstFailureAt < UPGRADE_RETRY_TTL_MS
    ) {
      return false;
    }

    return now >= state.nextRetryAt;
  }

  /**
   * 記錄讀時升級失敗並更新退避時間
   *
   * @param {string} url - 目標 URL
   * @param {number} now - 當前時間戳
   * @returns {object} 更新後的狀態
   * @private
   */
  _recordUpgradeFailure(url, now) {
    const existing = this._pruneExpiredUpgradeFailure(url, now);
    const attempts = (existing?.attempts || 0) + 1;
    const firstFailureAt = existing?.firstFailureAt || now;
    const reachedMaxAttempts = attempts >= UPGRADE_RETRY_MAX_ATTEMPTS;

    let nextRetryAt;
    if (reachedMaxAttempts) {
      nextRetryAt = firstFailureAt + UPGRADE_RETRY_TTL_MS;
    } else {
      const delay = Math.min(
        UPGRADE_RETRY_MAX_DELAY_MS,
        UPGRADE_RETRY_BASE_DELAY_MS * Math.pow(2, attempts - 1)
      );
      const jitterDelay = Math.floor(delay * (0.5 + Math.random() * 0.5)); // eslint-disable-line sonarjs/pseudo-random
      nextRetryAt = now + jitterDelay;
    }

    const state = {
      attempts,
      firstFailureAt,
      lastFailureAt: now,
      nextRetryAt,
    };
    this._failedUpgradeAttempts.set(url, state);
    return state;
  }

  /**
   * 清除讀時升級失敗追蹤狀態
   *
   * @param {string} url - 目標 URL
   * @private
   */
  _clearUpgradeFailure(url) {
    this._failedUpgradeAttempts.delete(url);
  }

  /**
   * 觸發讀時升級：將舊格式資料升級為 page_* 並刪除舊 key
   * 升級被移至 _withLock 內執行以避免併發寫入異常。
   *
   * @param {string} targetUrl - 目標 URL (可能是 normalizedUrl 或是 alias resolve 之後的 resolvedUrl)
   * @param {object|null} savedData - 舊 saved_* 資料
   * @param {string} savedKey - 舊 saved_* key
   * @returns {Promise<void>} fire-and-forget;呼叫端 MAY 忽略回傳的 Promise
   * @private
   */
  async _triggerReadTimeUpgrade(targetUrl, savedData, savedKey) {
    const now = Date.now();
    if (!this._canRetryUpgrade(targetUrl, now)) {
      return;
    }

    const pageKey = `${PAGE_PREFIX}${targetUrl}`;
    const highlightKey = `${HIGHLIGHTS_PREFIX}${targetUrl}`;

    // Phase 4 follow-up（Lite plan 2026-05-04）：lock key 改採 canonical helper,
    // 與其他 page-state writers 共用同一條 lock namespace。
    // 注意:此 function 對 caller 仍為 fire-and-forget;_withLock 內的工作 MAY 在 caller 已返回後才完成。
    // alias 預解析的失敗也須吞掉,避免 unhandled rejection 漏出（caller 不 await）。
    let lockKey;
    try {
      ({ lockKey } = await this._resolveCanonicalLockKey(targetUrl));
    } catch (error) {
      this.logger.warn?.('[StorageService] 讀時升級 alias 預解析失敗', { error });
      return;
    }

    // 在鎖的保護下進行升級，避免併發覆蓋
    this._withLock(lockKey, async () => {
      const lockNow = Date.now();
      if (!this._canRetryUpgrade(targetUrl, lockNow)) {
        return;
      }

      // 同時讀取現有 page_* 和 highlights_*，防止覆寫鎖等待期間寫入的較新資料
      try {
        const readResult = await this.storage.local.get([pageKey, highlightKey]);
        const existingPage = readResult[pageKey];
        const highlightData = readResult[highlightKey];
        const builtObj = this._buildPageObject(savedData, highlightData, targetUrl, savedKey);

        // 若已有較新的 page_* 資料（以 metadata.lastUpdated 判斷），合併而非覆寫
        const finalObj = this._isExistingPageNewer(existingPage, builtObj)
          ? this._mergeUpgradePage(existingPage, builtObj)
          : builtObj;

        await this.storage.local.set({ [pageKey]: finalObj });
        await this.storage.local.remove([savedKey, highlightKey]);
        this._clearUpgradeFailure(targetUrl);
      } catch (error) {
        this._recordUpgradeFailure(targetUrl, Date.now());
        throw error;
      }
    }).catch(error => {
      this.logger.warn?.('[StorageService] 讀時升級失敗', { error });
    });
  }

  /**
   * 獲取頁面保存狀態
   *
   * 查找優先順序：
   * 1. page_* 新格式（返回 notion 子欄位）
   * 2. url_alias 映射後的 page_*
   * 3. 舊格式 saved_*（觸發讀時升級）
   *
   * @param {string} pageUrl - 頁面 URL
   * @returns {Promise<object | null>}
   */
  async getSavedPageData(pageUrl) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    const normalizedUrl = normalizeUrl(pageUrl);

    try {
      const state = await this._getPageState(normalizedUrl);

      if (!state) {
        return null;
      }

      if (state.format === 'new') {
        return this._mapNotionToPublic(state.data.notion);
      }

      // 舊格式：觸發讀時升級（非阻塞），返回舊資料維持向後兼容
      const targetUrl = state.resolvedUrl || normalizedUrl;
      this._triggerReadTimeUpgrade(targetUrl, state.savedData, state.savedKey);
      return state.savedData;
    } catch (error) {
      this.logger.error?.('[StorageService] getSavedPageData failed', { error });
      throw error;
    }
  }

  /**
   * 獲取頁面標註數據
   *
   * 查找優先順序（符合 HighlightLookupResolver contract）：
   *   1. page_<stableUrl>          — alias 命中的 canonical key
   *   2. page_<normalizedUrl>      — 資料可能仍在 original permalink
   *   3. highlights_<stableUrl>    — alias-resolved 舊格式回退（alias 命中時）
   *   4. highlights_<normalizedUrl> — 舊格式最終回退
   *
   * alias 輔助解析：一次批量讀取 alias + page_* + highlights_*，減少 round-trip。
   *
   * @param {string} pageUrl - 頁面 URL
   * @returns {Promise<any | null>} highlights 陣列或 null
   */
  async getHighlights(pageUrl) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const rawUrl = typeof pageUrl === 'string' ? pageUrl : null;

    try {
      // 步驟 1：批量讀取所有需要的 keys（包含 alias + 所有可能的 page_* 和 highlights_*）
      const aliasKeys = getAliasLookupKeys(normalizedUrl, rawUrl);
      const preloadKeys = this._buildHighlightsPreloadKeys(normalizedUrl, rawUrl, aliasKeys);
      const preloadResult = await this.storage.local.get(preloadKeys);

      // 步驟 2：從讀取結果選出 alias candidate
      const aliasCandidate = pickAliasCandidate(preloadResult, normalizedUrl, rawUrl);

      // 步驟 3：產生 lookup contract
      const contract = resolveHighlightLookupKeys(normalizedUrl, aliasCandidate);

      // 步驟 4：若 alias 已用，補取 stableUrl 的 page_* 和 highlights_*
      const storageData = await this._resolveStableExtraKeys(
        aliasCandidate,
        normalizedUrl,
        preloadResult
      );

      // 步驟 5：依 contract 順序取出第一個有效 highlights
      const { highlights } = pickHighlightsFromStorage(contract, storageData);
      return highlights; // null 表示找不到
    } catch (error) {
      this.logger.error?.('[StorageService] getHighlights failed', { error });
      throw error;
    }
  }

  /**
   * 設置頁面標註數據
   *
   * Phase 3：委託給 updateHighlights（寫入 page_* 格式）
   *
   * @param {string} pageUrl - 頁面 URL
   * @param {any} data - 標註數據（陣列或 {url, highlights} 物件）
   * @returns {Promise<void>}
   */
  async setHighlights(pageUrl, data) {
    const highlights = Array.isArray(data) ? data : data?.highlights || [];
    return this.updateHighlights(pageUrl, highlights);
  }

  /**
   * 原子寫入頁面數據和標註（Phase 3：統一寫入 page_* 格式）
   *
   * @param {string} pageUrl - 頁面 URL
   * @param {object|null} pageData - 頁面數據（原 saved_* 格式）
   * @param {Array|null} highlights - 標註數據
   * @returns {Promise<void>}
   */
  async savePageDataAndHighlights(pageUrl, pageData, highlights) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    if (!pageData && !highlights) {
      return;
    }

    const normalizedUrl = normalizeUrl(pageUrl);

    // Phase 5 follow-up（2026-05-04）：mutation target、lock、cleanup 統一由 contract 推導,
    // 避免 alias 命中時寫入 non-canonical page_<original> 造成 split-brain。
    const { lockKey, contract } = await this._resolveCanonicalLockKey(normalizedUrl, pageUrl);
    const targetKey = contract.mutationTargetKey;

    return this._withLock(lockKey, async () => {
      try {
        // 鎖內讀取 lookupOrder 與 legacyCleanupKeys 一次,作為 cleanup 計算依據。
        const readKeys = Array.from(
          new Set([targetKey, ...contract.lookupOrder, ...contract.legacyCleanupKeys])
        );
        const existing = await this.storage.local.get(readKeys);

        const pageObj = this._buildPageObject(pageData, highlights || [], contract.canonicalUrl);
        await this.storage.local.set({ [targetKey]: pageObj });

        // Cleanup legacy keys（與 updateHighlights 同 pattern）：實際存在 + 字典序
        await this._runLegacyKeyCleanup(targetKey, contract.legacyCleanupKeys, existing);
      } catch (error) {
        this.logger.error?.('[StorageService] savePageDataAndHighlights failed', { error });
        throw error;
      }
    });
  }

  /**
   * 設置頁面保存狀態（Phase 3：partial update page_*.notion 子欄位，含互斥鎖）
   *
   * @param {string} pageUrl - 頁面 URL
   * @param {object} data - 保存數據（原 saved_* 格式）
   * @returns {Promise<void>}
   */
  async setSavedPageData(pageUrl, data) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    // Phase 5 follow-up（2026-05-04）：mutation target 改採 contract.mutationTargetKey,
    // 避免當 page_<original> 殘留資料時將寫入退回 non-canonical key。
    const { lockKey, contract } = await this._resolveCanonicalLockKey(normalizedUrl, pageUrl);
    const targetKey = contract.mutationTargetKey;

    return this._withLock(lockKey, async () => {
      try {
        const state = await this._getPageState(normalizedUrl);
        const fallbackTargetUrl = this._resolvePageStateTargetUrl(state, normalizedUrl);
        const fallbackPageKey = `${PAGE_PREFIX}${fallbackTargetUrl}`;
        const fallbackHlKey = `${HIGHLIGHTS_PREFIX}${fallbackTargetUrl}`;
        const normalizedHlKey = `${HIGHLIGHTS_PREFIX}${normalizedUrl}`;

        // 一次讀取所有可能來源:canonical target、fallback page、相關 highlights_*。
        const readKeys = Array.from(
          new Set([
            targetKey,
            fallbackPageKey,
            fallbackHlKey,
            normalizedHlKey,
            ...contract.legacyCleanupKeys,
          ])
        );
        const existing = await this.storage.local.get(readKeys);

        // current 優先取 canonical;若 canonical 尚不存在,fallback 至 _getPageState 命中的 page_*。
        const current = this._resolveCurrentPageState(existing, state, targetKey, fallbackPageKey);

        // 保留現有 highlights;若 page_* 不存在,從舊格式 highlights_* 取回
        const legacyArray = this._resolveLegacyHighlights(existing, fallbackHlKey, normalizedHlKey);
        const existingHighlights = this._normalizeHighlightsArray(
          current.highlights ?? legacyArray
        );

        // 將傳入的 data 轉換為 notion 子欄位格式
        const notionData = this._buildNotionField(data, Date.now(), current.notion);

        const newData = {
          ...current,
          highlights: existingHighlights,
          notion: notionData,
          metadata: {
            ...current.metadata,
            lastUpdated: Date.now(),
          },
        };

        await this.storage.local.set({ [targetKey]: newData });

        // Cleanup:saved_<targetUrl>、saved_<normalizedUrl>(過渡期殘留)、
        // contract.legacyCleanupKeys(含 page_<other> 與 highlights_*)、_getPageState 返回的 legacy savedKey。
        const targetUrl = targetKey.slice(PAGE_PREFIX.length);
        const candidateKeys = [`${SAVED_PREFIX}${targetUrl}`, `${SAVED_PREFIX}${normalizedUrl}`];
        if (state?.format === 'legacy' && state.savedKey) {
          candidateKeys.push(state.savedKey);
        }
        for (const key of contract.legacyCleanupKeys) {
          candidateKeys.push(key);
        }

        await this._runLegacyKeyCleanup(targetKey, candidateKeys, existing, [SAVED_PREFIX]);
      } catch (error) {
        this.logger.error?.('[StorageService] setSavedPageData failed', { error });
        throw error;
      }
    });
  }

  /**
   * 執行本地 pageKey 的移除或 notion 欄位重置
   *
   * @param {string} pageKey - 待處理的 pageKey
   * @param {object|null} current - 既有 pageKey 數據
   * @returns {Promise<void>}
   * @private
   */
  async _removeSavedPageLocal(pageKey, current) {
    if (!current) {
      return;
    }
    const highlights = current.highlights || [];
    if (highlights.length === 0) {
      // 無標注也無保存狀態 → 刪整個 key
      await this.storage.local.remove([pageKey]);
    } else {
      // 有標注 → 只清空 notion 欄位
      await this.storage.local.set({
        [pageKey]: {
          ...current,
          notion: null,
          metadata: { ...current.metadata, lastUpdated: Date.now() },
        },
      });
    }
  }

  /**
   * 移除單一 URL 的 savedPageData（不連帶清理穩定 URL）
   * Phase 3：同時清理 page_*.notion 欄位（若 highlights 為空則刪整個 key）
   *
   * @param {string} pageUrl - 頁面 URL
   * @returns {Promise<void>}
   */
  async removeSavedPageData(pageUrl) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    // Phase 4 follow-up（Lite plan 2026-05-04）：與其他 page-state writers 對齊 to canonical lock namespace
    const { lockKey } = await this._resolveCanonicalLockKey(normalizedUrl, pageUrl);

    return this._withLock(lockKey, async () => {
      try {
        const pageKey = `${PAGE_PREFIX}${normalizedUrl}`;
        const existing = await this.storage.local.get([pageKey]);
        const current = existing[pageKey];

        await this._removeSavedPageLocal(pageKey, current);

        // 過渡期：也清理舊 key
        const oldKey = `${SAVED_PREFIX}${normalizedUrl}`;
        await this.storage.local.remove([oldKey]);

        this.logger.log?.('Removed stale savedPageData', {
          url: sanitizeUrlForLogging(normalizedUrl),
        });
      } catch (error) {
        this.logger.error?.('[StorageService] removeSavedPageData failed', { error });
        throw error;
      }
    });
  }

  /**
   * 清除頁面狀態
   * Phase 3：刪除 page_* key（含 stableUrl），過渡期同時清理舊 saved_* key。
   *
   * @param {string} pageUrl - 頁面 URL
   * @returns {Promise<void>}
   */
  async clearPageState(pageUrl) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const stableUrl = computeStableUrl(pageUrl);
    const keysToRemove = this._buildClearPageKeys(normalizedUrl, stableUrl);

    try {
      await this.storage.local.remove(keysToRemove);
      this.logger.log?.('Cleared saved page metadata', {
        url: sanitizeUrlForLogging(normalizedUrl),
      });
    } catch (error) {
      this.logger.error?.('[StorageService] clearPageState failed', { error });
      throw error;
    }
  }

  /**
   * 僅清除 Notion 綁定元數據，保留標注
   * Highlight-First：標注獨立於 Notion 頁面生命週期
   * 用於 Notion 頁面已刪除但本地標注需要保留的情境
   *
   * @param {string} pageUrl - 頁面 URL
   * @param {object} [options] - 補充上下文
   * @param {string} [options.expectedPageId] - 預期綁定的 Notion pageId，不匹配時跳過清除
   * @returns {Promise<{cleared: true} | {skipped: true, reason: string}>}
   */
  async clearNotionState(pageUrl, options = {}) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    const { expectedPageId } = options;

    const normalizedUrl = normalizeUrl(pageUrl);
    const stableUrl = computeStableUrl(pageUrl);

    // Phase 4 follow-up：以 canonical lock key 序列化,與其他 page-state writers 對齊
    const { lockKey } = await this._resolveCanonicalLockKey(normalizedUrl, pageUrl);

    return this._withLock(lockKey, async () => {
      // 使用與 getSavedPageData 相同的 URL 別名解析路徑，確保清除的 key 與讀取的 key 一致
      const state = await this._getPageState(normalizedUrl);

      if (state?.format === 'new') {
        if (this._isMismatchedPageId(state, expectedPageId)) {
          this.logger.warn?.('[StorageService] clearNotionState skipped: pageId mismatch', {
            expectedPageId: expectedPageId.slice(0, 4),
            foundPageId: state.data.notion.pageId.slice(0, 4),
            url: sanitizeUrlForLogging(normalizedUrl),
          });
          return { skipped: true, reason: 'pageId_mismatch' };
        }

        const clearPayload = this._clearNotionFromPage(state, Date.now());
        await this.storage.local.set(clearPayload);
      }

      // 清理舊格式 saved_* key（無 highlights，可安全刪除）
      const oldKeys = this._collectClearNotionLegacyKeys(normalizedUrl, stableUrl, state);
      await this.storage.local.remove(oldKeys).catch(() => {});

      this.logger.log?.('Cleared Notion metadata (highlights preserved)', {
        url: sanitizeUrlForLogging(normalizedUrl),
      });

      return { cleared: true };
    });
  }

  /**
   * 清除 Notion 綁定，失敗時做一次有限重試並統一記錄日誌。
   *
   * 僅負責 storage-side cleanup policy，不承擔上層 UI / 業務決策。
   *
   * @param {string} pageUrl - 頁面 URL
   * @param {object} [options] - 補充上下文
   * @param {string} [options.expectedPageId] - 預期綁定的 Notion pageId
   * @param {string} [options.source='unknown'] - 呼叫來源
   * @param {number} [options.retryDelayMs=100] - 重試前延遲
   * @returns {Promise<{cleared: true, attempts: number, recovered: boolean} | {cleared: false, skipped: true, reason: string, attempts: number, recovered: false} | {cleared: false, attempts: number, error: Error}>}
   */
  async clearNotionStateWithRetry(pageUrl, options = {}) {
    const source = options.source || 'unknown';
    const retryDelayMs = Number.isFinite(options.retryDelayMs)
      ? options.retryDelayMs
      : NOTION_STATE_CLEAR_RETRY_DELAY_MS;
    const safeUrl = sanitizeUrlForLogging(normalizeUrl(pageUrl));
    const maxAttempts = 2;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this._executeClearAttempt({ pageUrl, options, safeUrl, source, attempt });
      } catch (error) {
        lastError = error;
        const isTerminal = attempt >= maxAttempts;

        this._logClearAttemptFailure({ source, attempt, safeUrl, error, isTerminal });

        if (isTerminal) {
          break;
        }

        if (retryDelayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
      }
    }

    return {
      cleared: false,
      attempts: maxAttempts,
      error: lastError || new Error('maxAttempts 必須大於 0'),
    };
  }

  /**
   * 執行單次 clearNotionState 嘗試，並在成功時補記錄重試成功日誌。
   *
   * @param {object} context - 嘗試上下文物件
   * @param {string} context.pageUrl - 頁面 URL
   * @param {object} context.options - 補充上下文
   * @param {string} context.safeUrl - 已脫敏的 URL
   * @param {string} context.source - 呼叫來源
   * @param {number} context.attempt - 當前嘗試次數
   * @returns {Promise<{cleared: true, attempts: number, recovered: boolean} | {cleared: false, skipped: true, reason: string, attempts: number, recovered: false}>}
   * @private
   */
  async _executeClearAttempt({ pageUrl, options, safeUrl, source, attempt }) {
    const clearResult = await this.clearNotionState(pageUrl, {
      expectedPageId: options.expectedPageId,
    });

    if (clearResult?.skipped) {
      return {
        cleared: false,
        skipped: true,
        reason: clearResult.reason,
        attempts: attempt,
        recovered: false,
      };
    }

    if (attempt > 1) {
      this.logger.success?.('[StorageService] clearNotionState 重試成功', {
        action: 'clearNotionStateWithRetry',
        source,
        attempts: attempt,
        recovered: true,
        url: safeUrl,
      });
    }

    return { cleared: true, attempts: attempt, recovered: attempt > 1 };
  }

  /**
   * 根據是否為最後一次嘗試，統一記錄 clearNotionState 失敗日誌。
   *
   * @param {object} context - 嘗試上下文物件
   * @param {string} context.source - 呼叫來源
   * @param {number} context.attempt - 當前嘗試次數
   * @param {string} context.safeUrl - 已脫敏的 URL
   * @param {Error} context.error - 失敗錯誤
   * @param {boolean} context.isTerminal - 是否為最後一次嘗試
   * @returns {void}
   * @private
   */
  _logClearAttemptFailure({ source, attempt, safeUrl, error, isTerminal }) {
    if (isTerminal) {
      this.logger.error?.('[StorageService] clearNotionState 重試最終失敗', {
        action: 'clearNotionStateWithRetry',
        source,
        attempts: attempt,
        recovered: false,
        url: safeUrl,
        error,
      });
      return;
    }

    this.logger.warn?.('[StorageService] clearNotionState 嘗試失敗，準備重試', {
      action: 'clearNotionStateWithRetry',
      source,
      attempt,
      url: safeUrl,
      error,
    });
  }

  /**
   * 檢查 URL 別名對象是否無效
   *
   * @param {string} original - 原始 URL
   * @param {string} stable - 穩定 URL
   * @returns {boolean} 是否無效
   * @private
   */
  _isInvalidAlias(original, stable) {
    return !original || !stable || original === stable;
  }

  /**
   * 設置 URL alias 映射（originalUrl → stableUrl）
   *
   * 用於解決 preloader PING 不穩定問題：
   * savePage 成功後記錄映射，後續 syncHighlights 即使 PING 失敗
   * 也能透過 originalUrl 找到以 stableUrl 存儲的 savedData。
   *
   * @param {string} originalUrl - 原始 URL（normalizeUrl 後的完整路徑）
   * @param {string} stableUrl - 穩定 URL（shortlink 或其他計算後的穩定 key）
   * @returns {Promise<void>}
   */
  async setUrlAlias(originalUrl, stableUrl) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    // 防衛性標準化
    const normalizedOriginal = normalizeUrl(originalUrl);
    const normalizedStable = normalizeUrl(stableUrl);

    if (this._isInvalidAlias(normalizedOriginal, normalizedStable)) {
      return;
    }

    const aliasKey = `${URL_ALIAS_PREFIX}${normalizedOriginal}`;

    try {
      await this.storage.local.set({ [aliasKey]: normalizedStable });
    } catch (error) {
      this.logger.error?.('[StorageService] setUrlAlias failed', { error });
      throw error;
    }
  }

  /**
   * 清理舊版 URL 的 Storage Keys（僅刪除精確 key，不使用 computeStableUrl）
   *
   * Phase 3：同時清理 page_* + 舊 saved_* + highlights_* 三種前綴。
   * 使用場景：URL 遷移後安全刪除來源 URL 的資料。
   *
   * @param {string} legacyUrl - 舊版 URL
   * @returns {Promise<void>}
   */
  async clearLegacyKeys(legacyUrl) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    const normalizedUrl = normalizeUrl(legacyUrl);
    const keysToRemove = [
      `${PAGE_PREFIX}${normalizedUrl}`,
      `${SAVED_PREFIX}${normalizedUrl}`,
      `${HIGHLIGHTS_PREFIX}${normalizedUrl}`,
    ];

    try {
      await this.storage.local.remove(keysToRemove);
      this.logger.log?.('Cleared legacy keys', { url: sanitizeUrlForLogging(normalizedUrl) });
    } catch (error) {
      this.logger.error?.('[StorageService] clearLegacyKeys failed', { error });
      throw error;
    }
  }

  /**
   * 獲取配置（合併 sync 與 local storage）
   * - notionDataSourceId 等保存目標設定存在 local
   * - 其餘設定存在 sync
   *
   * @param {string[]} keys - 要獲取的配置鍵
   * @returns {Promise<object>}
   */
  async getConfig(keys) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    try {
      const [syncConfig, localConfig] = await Promise.all([
        this.storage.sync.get(keys),
        this.storage.local.get(keys),
      ]);
      return { ...syncConfig, ...localConfig };
    } catch (error) {
      this.logger.error?.('[StorageService] getConfig failed', { error });
      throw error;
    }
  }

  /**
   * 將配置對象分區為 local 與 sync 二部
   *
   * @param {object} config - 配置對象
   * @returns {{localConfig: object, syncConfig: object}} 分區後的配置
   * @private
   */
  _partitionConfig(config) {
    const localConfig = {};
    const syncConfig = {};

    for (const [key, value] of Object.entries(config)) {
      if (LOCAL_STORAGE_KEYS.has(key)) {
        localConfig[key] = value;
      } else {
        syncConfig[key] = value;
      }
    }

    return { localConfig, syncConfig };
  }

  /**
   * 設置配置（分派至 sync 或 local storage）
   * - notionDataSourceId 等保存目標設定存在 local
   * - 其餘設定存在 sync
   *
   * @param {object} config - 配置對象
   * @returns {Promise<void>}
   */
  async setConfig(config) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    const { localConfig, syncConfig } = this._partitionConfig(config);

    try {
      const promises = [];
      if (Object.keys(syncConfig).length > 0) {
        promises.push(this.storage.sync.set(syncConfig));
      }
      if (Object.keys(localConfig).length > 0) {
        promises.push(this.storage.local.set(localConfig));
      }
      await Promise.all(promises);
    } catch (error) {
      this.logger.error?.('[StorageService] setConfig failed', { error });
      throw error;
    }
  }

  /**
   * 檢查資料是否已是規範化的 highlights 物件形狀
   *
   * @param {any} value - 待檢查的值
   * @returns {boolean} 是否為規範化物件
   * @private
   */
  _isNormalizedHighlightObject(value) {
    return value && typeof value === 'object' && 'highlights' in value;
  }

  /**
   * 規範化舊格式標註資料，確保回傳形狀一律為 { highlights: [...] }
   *
   * @param {any} value - 原始儲存值（可能是陣列或含 highlights 欄位的物件）
   * @returns {object} 統一為 { highlights: [...] } 格式
   * @private
   */
  _normalizeLegacyHighlight(value) {
    if (this._isNormalizedHighlightObject(value)) {
      return value;
    }
    return { highlights: Array.isArray(value) ? value : [] };
  }

  /**
   * 共用全量儲存空間讀取
   *
   * @returns {Promise<object>}
   * @private
   */
  async _getAllStorageData() {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }
    return await this.storage.local.get(null);
  }

  /**
   * 獲取所有 highlights_* 和 page_* 的資料（用於遷移掃描）
   *
   * ⚠️ **效能警告**：此方法透過 `storage.local.get(null)` 讀取整個 chrome.storage.local，
   * 屬於昂貴的一次性 migration-only helper，不應在 hot paths 或頻繁觸發的流程中使用。
   * 若需讀取單一 URL 的標註，請改用 `getHighlights(pageUrl)`。
   *
   * Phase 3：同時掃描 page_* + highlights_*，去重（同 URL 優先用 page_* 資料）。
   *
   * 回傳格式：
   * ```
   * {
   *   "https://example.com": { url, highlights: [...] },
   *   ...
   * }
   * ```
   *
   * @param {object} [allData] - 外部提供的全量儲存空間數據，若未提供則從 storage 讀取
   * @returns {Promise<Record<string, object>>} key 為 URL，value 為完整標註資料
   */
  async getAllHighlights(allData = null) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    try {
      const data = allData || (await this._getAllStorageData());
      const pageResult = this._collectPageHighlights(data);
      return this._collectLegacyHighlights(data, pageResult);
    } catch (error) {
      this.logger.error?.('[StorageService] getAllHighlights failed', { error });
      throw error;
    }
  }

  /**
   * 更新指定 URL 的標註陣列（Phase 4：contract-driven mutation + canonical-lock）
   *
   * 流程：
   * 1. Pre-resolve（不在 lock 內）：
   *    - 批量讀取 alias keys + page_* + highlights_*
   *    - 透過 HighlightLookupResolver 取得 contract（含 mutationTargetKey、legacyCleanupKeys）
   * 2. 以 contract.mutationTargetKey 為 lock key（取代原本的 normalizedUrl），
   *    確保 stable / original 兩個 pageUrl 同時進入時鎖到同一個 canonical key。
   * 3. Lock 內重讀 lookupOrder 上的 keys（避免 TOCTOU），
   *    若 canonical key 已有資料則 partial update；否則從第一個有資料的 legacy key 遷移。
   * 4. 寫入 mutationTargetKey。
   * 5. 在同一 lock 範圍內，依字典序執行 legacyCleanupKeys 清理（Phase 0 決策：固定 ordering，避免 ABA）。
   *
   * 若更新後陣列為空且 notion 為 null，**不**自動刪除 key（由呼叫端決定是否刪除）。
   *
   * @param {string} pageUrl - 頁面 URL
   * @param {Array} highlights - 更新後的標註陣列
   * @returns {Promise<void>}
   */
  async updateHighlights(pageUrl, highlights) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const rawUrl = typeof pageUrl === 'string' ? pageUrl : null;

    try {
      // Phase 4 follow-up：lock key 由 canonical helper 統一推導,與其他 page-state writers 共用 namespace
      const { lockKey, contract } = await this._resolveCanonicalLockKey(normalizedUrl, rawUrl);

      return await this._withLock(lockKey, async () => {
        const targetKey = contract.mutationTargetKey;
        // Lock 內重讀（避免 lock 等待期間有其他 writer 已寫入新資料）。
        const readKeys = Array.from(
          new Set([targetKey, ...contract.lookupOrder, ...contract.legacyCleanupKeys])
        );
        const existing = await this.storage.local.get(readKeys);
        const canonicalCurrent = existing[targetKey];

        // 嘗試從 lookupOrder 找出第一個有資料的 key 作為遷移來源
        const migrationSource = this._findMigrationSource(contract, existing, targetKey);

        const newData = this._buildHighlightsUpdate(
          canonicalCurrent,
          migrationSource,
          highlights,
          normalizedUrl
        );

        await this.storage.local.set({ [targetKey]: newData });

        // Cleanup legacy keys：與 updateHighlights 同 pattern：實際存在 + 字典序
        await this._runLegacyKeyCleanup(targetKey, contract.legacyCleanupKeys, existing);
      });
    } catch (error) {
      this.logger.error?.('[StorageService] updateHighlights failed', { error });
      throw error;
    }
  }

  /**
   * 獲取所有已保存頁面的 URL
   *
   * Phase 3：合併 page_*（notion 非 null）+ saved_* 的 URLs（去重）。
   *
   * @param {object} [allData] - 外部提供的全量儲存空間數據，若未提供則從 storage 讀取
   * @returns {Promise<string[]>}
   */
  async getAllSavedPageUrls(allData = null) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    try {
      const result = allData || (await this._getAllStorageData());
      const urlSet = new Set();

      for (const [key, value] of Object.entries(result)) {
        const url = this._extractSavedUrlFromEntry(key, value);
        if (url) {
          urlSet.add(url);
        }
      }

      return Array.from(urlSet);
    } catch (error) {
      this.logger.error?.('[StorageService] getAllSavedPageUrls failed', { error });
      throw error;
    }
  }
}

// 導出
export { StorageService };
export { TRACKING_PARAMS as URL_TRACKING_PARAMS, normalizeUrl } from '../../utils/urlUtils.js';
export {
  URL_ALIAS_PREFIX,
  PAGE_PREFIX,
  SAVED_PREFIX,
  HIGHLIGHTS_PREFIX,
} from '../../config/shared/storage.js'; // Phase 3: 前綴常量統一從此處導出
