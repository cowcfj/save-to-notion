/**
 * HighlightStorageGateway - 標註存儲 Gateway / Adapter 層
 *
 * 職責：管理 Highlights 從 Content Script 到持久化層的所有 transport 邏輯：
 * - 透過 Background message 路徑保存/清除標註（含互斥鎖保護）
 * - 多層 fallback 策略（Background → chrome.storage.local → localStorage）
 * - 重試機制（最多 3 次 Background 重試，save / clear 對稱）
 * - URL alias 解譯（normalizedUrl → stableUrl）
 * - 格式兼容（page_* 新格式 / highlights_* 舊格式）
 *
 * 此模組刻意不承擔業務協調邏輯（何時保存、保存哪些標註），
 * 業務協調由 HighlightStorage / HighlightMigration 負責。
 *
 * 使用環境：Content Script / Highlighter
 *
 * @module core/HighlightStorageGateway
 */

/* global chrome */

import { isRootUrl, normalizeUrl } from '../../utils/urlUtils.js';
import Logger from '../../utils/Logger.js';
import { ERROR_MESSAGES } from '../../config/shared/messages.js';
import { HIGHLIGHTER_ACTIONS } from '../../config/runtimeActions/highlighterActions.js';
import { HIGHLIGHTS_PREFIX, PAGE_PREFIX, URL_ALIAS_PREFIX } from '../../config/shared/storage.js';
import { sanitizeUrlForLogging } from '../../utils/securityUtils.js';
import {
  resolveKeys as resolveHighlightLookupKeys,
  getAliasLookupKeys,
  pickHighlightsFromStorage,
} from './HighlightLookupResolver.js';

const MESSAGES = ERROR_MESSAGES.TECHNICAL;
export const STORAGE_GATEWAY_RETRY = Object.freeze({
  maxAttempts: 3,
  delayMs: 500,
});

/**
 * 共用的 Background 重試 helper
 *
 * @param {Function} actionFn - 返回 Promise<boolean> 的 action 函數（true = 成功）
 * @param {string} actionName - 用於日誌的 action 名稱
 * @returns {Promise<boolean>} true 表示 action 成功執行
 * @private
 */
async function _withBackgroundRetry(actionFn, actionName) {
  const canRetryBackground =
    typeof chrome !== 'undefined' &&
    chrome?.runtime &&
    typeof chrome.runtime.sendMessage === 'function';
  const attemptLimit = canRetryBackground ? STORAGE_GATEWAY_RETRY.maxAttempts : 1;

  for (let attempt = 1; attempt <= attemptLimit; attempt++) {
    if (attempt > 1) {
      await new Promise(resolve => setTimeout(resolve, STORAGE_GATEWAY_RETRY.delayMs));
      Logger.warn(
        `[HighlightStorageGateway] ${actionName} sendMessage 失敗，嘗試重試 ${attempt}/${attemptLimit}`,
        { action: actionName }
      );
    }
    if (await actionFn()) {
      return true;
    }
  }
  return false;
}

function sanitizeHighlightStorageKeyForLogging(key) {
  if (typeof key !== 'string') {
    return '[invalid-storage-key]';
  }

  if (key.startsWith(PAGE_PREFIX)) {
    return `${PAGE_PREFIX}${sanitizeUrlForLogging(key.slice(PAGE_PREFIX.length))}`;
  }

  if (key.startsWith(HIGHLIGHTS_PREFIX)) {
    return `${HIGHLIGHTS_PREFIX}${sanitizeUrlForLogging(key.slice(HIGHLIGHTS_PREFIX.length))}`;
  }

  if (key.startsWith(URL_ALIAS_PREFIX)) {
    return `${URL_ALIAS_PREFIX}${sanitizeUrlForLogging(key.slice(URL_ALIAS_PREFIX.length))}`;
  }

  return '[non-highlight-storage-key]';
}

function isSafeStableAliasUrl(candidate) {
  if (typeof candidate !== 'string' || candidate.trim() === '') {
    return false;
  }

  const normalizedCandidate = normalizeUrl(candidate);
  if (normalizedCandidate !== candidate) {
    return false;
  }

  try {
    const parsedUrl = new URL(candidate);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return false;
    }
  } catch {
    return false;
  }

  return !isRootUrl(candidate);
}

/**
 * HighlightStorageGateway 對象
 */
const HighlightStorageGateway = {
  /**
   * 保存標記數據
   *
   * Phase 3：透過訊息轉發給 Background 的 UPDATE_HIGHLIGHTS handler 處理，
   * 利用 Background 的 _withLock 互斥鎖避免並發衝突。
   *
   * @param {string} pageUrl - 頁面 URL
   * @param {object | Array} highlightData - 標註數據
   * @returns {Promise<void>}
   */
  async saveHighlights(pageUrl, highlightData) {
    if (!pageUrl || typeof pageUrl !== 'string') {
      const error = new Error(MESSAGES.INVALID_PAGE_URL);
      Logger.error(MESSAGES.LOG_INVALID_URL, { action: 'saveHighlights', error: error.message });
      throw error;
    }

    const highlights = Array.isArray(highlightData)
      ? highlightData
      : highlightData?.highlights || [];

    // 透過共用 helper 進行 Background 重試
    const success = await _withBackgroundRetry(
      () => this._tryBackgroundUpdate(pageUrl, highlights),
      'saveHighlights'
    );
    if (success) {
      return;
    }

    // Fallback：重試後仍失敗，直接寫入（過渡期安全網）
    Logger.warn(
      '[HighlightStorageGateway] 所有重試均失敗，走 fallback 直接寫入。注意：此路徑繞過 _withLock，可能發生並發衝突。',
      {
        action: 'saveHighlights',
      }
    );
    await this._fallbackDirectSave(pageUrl, highlights, highlightData);
  },

  /**
   * 嘗試透過 Background 轉發儲存標註
   *
   * @param {string} pageUrl
   * @param {Array} highlights
   * @returns {Promise<boolean>} true 表示處理成功
   * @private
   */
  async _tryBackgroundUpdate(pageUrl, highlights) {
    if (
      typeof chrome === 'undefined' ||
      !chrome?.runtime ||
      typeof chrome.runtime.sendMessage !== 'function'
    ) {
      return false;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: HIGHLIGHTER_ACTIONS.UPDATE_HIGHLIGHTS,
        url: pageUrl,
        highlights,
      });
      if (response?.success === true) {
        return true;
      }
      Logger.warn(
        '[HighlightStorageGateway] sendMessage 回傳失敗（success !== true），交由上層重試/回退策略處理',
        {
          action: 'saveHighlights',
        }
      );
    } catch {
      // sendMessage 失敗（如 Background SW 未啟動），交由上層重試/回退策略處理
      Logger.warn('[HighlightStorageGateway] sendMessage 發送異常，交由上層重試/回退策略處理', {
        action: 'saveHighlights',
      });
    }
    return false;
  },

  /**
   * 背景儲存失效或不存在時，直接寫入 Storage
   *
   * @param {string} pageUrl
   * @param {Array} highlights
   * @param {any} highlightData - 提供給 localStorage 的原始資料
   * @returns {Promise<void>}
   * @private
   */
  async _fallbackDirectSave(pageUrl, highlights, highlightData) {
    const normalizedUrl = normalizeUrl(pageUrl);

    try {
      const stableUrl = await this._resolveStableUrl(pageUrl, normalizedUrl);
      const pageKey = `${PAGE_PREFIX}${stableUrl}`;

      // 讀取現有資料以保留 notion 物件及已有 metadata 欄位
      let preservedNotionOrNull = null;
      let existingMetadata = {};
      if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
        const data = await chrome.storage.local.get([pageKey]);
        const existingPage = data?.[pageKey];
        if (existingPage?.notion) {
          preservedNotionOrNull = existingPage.notion;
        }
        if (existingPage?.metadata) {
          existingMetadata = existingPage.metadata;
        }
      }

      await this._saveToChromeStorage(pageKey, {
        notion: preservedNotionOrNull,
        highlights,
        metadata: { ...existingMetadata, lastUpdated: Date.now() },
      });
    } catch (error) {
      Logger.warn('Chrome Storage 不可用，回退到 localStorage', {
        action: 'saveHighlights',
        error: error.message,
      });
      const legacyKey = `${HIGHLIGHTS_PREFIX}${normalizedUrl}`;
      try {
        await this._saveToLocalStorage(legacyKey, highlightData);
      } catch (localError) {
        Logger.error('保存標註失敗（Chrome 與本地執行失敗）', {
          action: 'saveHighlights',
          error: localError.message,
        });
        throw localError;
      }
    }
  },

  /**
   * 保存到 Chrome Storage
   *
   * @param {string} key - 鍵名
   * @param {any} data - 數據
   * @returns {Promise<void>}
   * @private
   */
  async _saveToChromeStorage(key, data) {
    if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
      throw new Error(MESSAGES.CHROME_STORAGE_UNAVAILABLE);
    }
    await chrome.storage.local.set({ [key]: data });
  },

  /**
   * 保存到 localStorage
   *
   * @param {string} key - 鍵名
   * @param {any} data - 數據
   * @returns {Promise<void>}
   * @private
   */
  _saveToLocalStorage(key, data) {
    return new Promise((resolve, reject) => {
      try {
        localStorage.setItem(key, JSON.stringify(data));
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  },

  /**
   * 加載標記數據
   *
   * Phase 3：先查 page_*，再回退 highlights_*（舊格式）。
   *
   * @param {string} pageUrl - 頁面 URL
   * @returns {Promise<Array>}
   */
  async loadHighlights(pageUrl) {
    if (!pageUrl || typeof pageUrl !== 'string') {
      const error = new Error(MESSAGES.INVALID_PAGE_URL);
      Logger.error(MESSAGES.LOG_INVALID_URL, { action: 'loadHighlights', error: error.message });
      throw error;
    }
    const normalizedUrl = normalizeUrl(pageUrl);
    const legacyKey = `${HIGHLIGHTS_PREFIX}${normalizedUrl}`;

    try {
      // Phase 3：同時查詢新舊格式
      // null = 找不到資料（需回退），[] = 明確空陣列（不回退）
      const data = await this._loadBothFormats(pageUrl, normalizedUrl);
      if (data !== null && data !== undefined) {
        return data;
      }
    } catch {
      Logger.warn('Chrome Storage 不可用，嘗試 localStorage 備案', { action: 'loadHighlights' });
    }

    try {
      return await this._loadFromLocalStorage(legacyKey);
    } catch (error) {
      Logger.error('從 localStorage 加載標註失敗', {
        action: 'loadHighlights',
        error: error.message,
      });
      return [];
    }
  },

  /**
   * 同時查詢 page_* 和 highlights_* 格式
   *
   * @param {string} pageUrl - 原始頁面 URL
   * @param {string} normalizedUrl - 已標準化的 URL
   * @returns {Promise<Array>}
   * @private
   */
  async _loadBothFormats(pageUrl, normalizedUrl) {
    if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
      throw new Error(MESSAGES.CHROME_STORAGE_UNAVAILABLE);
    }

    const stableUrl = await this._resolveStableUrl(pageUrl, normalizedUrl);

    // 使用 resolver contract，統一 lookupOrder：
    //   有 alias: page_<stable> → page_<norm> → highlights_<stable> → highlights_<norm>
    //   無 alias: page_<norm> → highlights_<norm>
    const aliasCandidate = stableUrl === normalizedUrl ? null : stableUrl;
    const contract = resolveHighlightLookupKeys(normalizedUrl, aliasCandidate);

    // 一次 get 批量讀取所有 lookupOrder 中的 keys
    const data = await chrome.storage.local.get(contract.lookupOrder);

    // 依 contract 順序取出第一個有效 highlights
    const { highlights } = pickHighlightsFromStorage(contract, data);
    return highlights; // null 表示所有 key 均未命中
  },

  /**
   * 從 localStorage 加載並解析格式
   *
   * @param {string} key - 鍵名
   * @returns {Promise<Array>}
   * @private
   */
  _loadFromLocalStorage(key) {
    return new Promise((resolve, reject) => {
      try {
        const legacy = localStorage.getItem(key);
        if (!legacy) {
          resolve([]);
          return;
        }
        try {
          const parsed = JSON.parse(legacy);
          resolve(this._parseHighlightFormat(parsed));
        } catch (error) {
          Logger.error('解析舊版標註失敗', {
            action: 'loadHighlights',
            operation: 'parseLocalStorage',
            error: error.message,
          });
          resolve([]);
        }
      } catch (error) {
        reject(error);
      }
    });
  },

  /**
   * 解析不同版本的標注數據格式
   *
   * 支援：
   * - page_* 新格式（Phase 3）：{ notion, highlights: [...] }
   * - 對象格式（新版）：{ url, highlights: [...] }
   * - 數組格式（舊版）：[...]
   *
   * @param {any} data - 存儲的數據
   * @returns {Array} List of highlights
   * @private
   */
  _parseHighlightFormat(data) {
    if (!data) {
      return [];
    }

    // Phase 3 page_* 新格式：{ notion, highlights: [...] }
    if (data.highlights !== undefined && !Array.isArray(data)) {
      return Array.isArray(data.highlights) ? data.highlights : [];
    }

    // 支援數組（舊版）
    if (Array.isArray(data)) {
      return data;
    }

    return [];
  },

  /**
   * 清除指定頁面的標記數據
   *
   * Phase 3：透過訊息轉發給 Background 處理（含 _withLock）。
   * 重試策略與 saveHighlights 對稱：最多 3 次 Background 重試後才 fallback。
   *
   * @param {string} pageUrl - 頁面 URL
   * @returns {Promise<void>}
   */
  async clearHighlights(pageUrl) {
    if (!pageUrl || typeof pageUrl !== 'string') {
      const error = new Error(MESSAGES.INVALID_PAGE_URL);
      Logger.error(MESSAGES.LOG_INVALID_URL, { action: 'clearHighlights', error: error.message });
      throw error;
    }

    // 透過共用 helper 進行 Background 重試
    const success = await _withBackgroundRetry(
      () => this._tryBackgroundClear(pageUrl),
      'clearHighlights'
    );
    if (success) {
      return;
    }

    // Fallback：直接清除（舊格式安全網）
    Logger.warn(
      '[HighlightStorageGateway] clearHighlights 所有重試均失敗，走 fallback 直接清除。注意：此路徑繞過 _withLock，可能發生並發衝突。',
      { action: 'clearHighlights' }
    );
    await this._fallbackDirectClear(pageUrl);
  },

  /**
   * 嘗試透過 Background 轉發清除標註
   *
   * @param {string} pageUrl
   * @returns {Promise<boolean>} true 表示 Background 確認成功
   * @private
   */
  async _tryBackgroundClear(pageUrl) {
    if (
      typeof chrome === 'undefined' ||
      !chrome?.runtime ||
      typeof chrome.runtime.sendMessage !== 'function'
    ) {
      return false;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: HIGHLIGHTER_ACTIONS.CLEAR_HIGHLIGHTS,
        url: pageUrl,
      });
      if (response?.success === true) {
        return true;
      }
      Logger.warn(
        '[HighlightStorageGateway] sendMessage 回傳失敗（success !== true），交由上層重試/回退策略處理',
        { action: 'clearHighlights' }
      );
    } catch {
      Logger.warn('[HighlightStorageGateway] sendMessage 失敗，交由上層重試/回退策略處理', {
        action: 'clearHighlights',
      });
    }
    return false;
  },

  /**
   * Background 不可用時，直接清除 storage
   *
   * @param {string} pageUrl
   * @returns {Promise<void>}
   * @private
   */
  async _fallbackDirectClear(pageUrl) {
    const normalizedUrl = normalizeUrl(pageUrl);
    const legacyKey = `${HIGHLIGHTS_PREFIX}${normalizedUrl}`;

    Logger.info('開始清除標註', {
      action: 'clearHighlights',
      pageKey: `${PAGE_PREFIX}${sanitizeUrlForLogging(normalizedUrl)}`,
    });

    // 對 page_* entry 進行讀→改→寫，只清空 highlights 欄位，保留 notion 等其他狀態
    const clearPageHighlights = async () => {
      if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
        const stableUrl = await this._resolveStableUrl(pageUrl, normalizedUrl);
        const pageKey = `${PAGE_PREFIX}${stableUrl}`;
        const existing = await chrome.storage.local.get([pageKey]);
        const current = existing[pageKey];
        if (current) {
          await chrome.storage.local.set({ [pageKey]: { ...current, highlights: [] } });
        }
      }
    };

    const results = await Promise.allSettled([
      clearPageHighlights(),
      this._clearFromChromeStorage(legacyKey),
      this._clearFromLocalStorage(legacyKey),
    ]);

    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length === results.length) {
      const error = new Error('Failed to clear highlights from all storage locations');
      Logger.error('所有存儲清除失敗', {
        action: 'clearHighlights',
        reasons: failures.map(failure => failure.reason.message || failure.reason),
      });
      throw error;
    }

    if (failures.length > 0) {
      Logger.warn('部分存儲清除失敗', { action: 'clearHighlights' });
    } else {
      Logger.success('標註清除完成', { action: 'clearHighlights' });
    }
  },

  /**
   * 從 Chrome Storage 清除數據
   *
   * @param {string} key - 鍵名
   * @returns {Promise<void>}
   * @private
   */
  async _clearFromChromeStorage(key) {
    if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
      throw new Error(MESSAGES.CHROME_STORAGE_UNAVAILABLE);
    }
    await chrome.storage.local.remove([key]);
  },

  /**
   * 從 localStorage 清除數據
   *
   * @param {string} key - 鍵名
   * @returns {Promise<void>}
   * @private
   */
  _clearFromLocalStorage(key) {
    return new Promise((resolve, reject) => {
      try {
        localStorage.removeItem(key);
        resolve();
      } catch (error) {
        reject(new Error(`localStorage operation failed: ${error.message}`));
      }
    });
  },

  /**
   * 解析 pageUrl 對應的 stable URL，若沒有 alias 則回退為 normalizedUrl
   *
   * @param {string} pageUrl - 原始頁面 URL
   * @param {string} normalizedUrl - 已標準化的 URL
   * @returns {Promise<string>}
   * @private
   */
  async _resolveStableUrl(pageUrl, normalizedUrl = normalizeUrl(pageUrl)) {
    if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
      return normalizedUrl;
    }

    // 使用 resolver helper 計算 alias keys（統一 API）
    const aliasKeys = getAliasLookupKeys(
      normalizedUrl,
      typeof pageUrl === 'string' ? pageUrl : null
    );
    const aliasData = await chrome.storage.local.get(aliasKeys);

    // 取優先 alias candidate（normalizedUrl 版本 > rawUrl 版本）
    const aliasCandidate =
      aliasData?.[`${URL_ALIAS_PREFIX}${normalizedUrl}`] ??
      (aliasKeys[1] ? aliasData?.[aliasKeys[1]] : null) ??
      null;

    if (!aliasCandidate) {
      return normalizedUrl;
    }

    // 保留 Gateway 的嚴格驗證邏輯（比 isValidAliasCandidate 更嚴：要求已 normalized + 排除 rootUrl）
    if (isSafeStableAliasUrl(aliasCandidate)) {
      return aliasCandidate;
    }

    Logger.warn('[HighlightStorageGateway] Ignored invalid stable URL alias value', {
      action: '_resolveStableUrl',
      aliasKey: sanitizeHighlightStorageKeyForLogging(`${URL_ALIAS_PREFIX}${normalizedUrl}`),
      stableUrl: sanitizeUrlForLogging(aliasCandidate),
      fallbackUrl: sanitizeUrlForLogging(normalizedUrl),
    });
    return normalizedUrl;
  },

  /**
   * 列出所有標註相關的 Storage 鍵（除錯用）
   *
   * @returns {Promise<void>}
   */
  async debugListAllKeys() {
    if (typeof chrome === 'undefined' || !chrome?.storage?.local) {
      Logger.warn('Chrome Storage 不可用', { action: 'debugListAllKeys' });
      return;
    }
    const allData = await chrome.storage.local.get(null);
    const highlightKeys = Object.keys(allData).filter(
      key =>
        key.startsWith(PAGE_PREFIX) ||
        key.startsWith(HIGHLIGHTS_PREFIX) ||
        key.startsWith(URL_ALIAS_PREFIX)
    );
    const prefixCounts = {
      page: highlightKeys.filter(key => key.startsWith(PAGE_PREFIX)).length,
      highlights: highlightKeys.filter(key => key.startsWith(HIGHLIGHTS_PREFIX)).length,
      urlAlias: highlightKeys.filter(key => key.startsWith(URL_ALIAS_PREFIX)).length,
    };
    Logger.debug('標註 Storage 鍵統計', {
      action: 'debugListAllKeys',
      totalCount: highlightKeys.length,
      prefixCounts,
      sanitizedKeys: highlightKeys.map(key => sanitizeHighlightStorageKeyForLogging(key)),
    });
  },
};

// 導出
export { HighlightStorageGateway };
