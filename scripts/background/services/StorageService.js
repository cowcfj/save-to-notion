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
import { sanitizeUrlForLogging } from '../../utils/securityUtils.js';
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
      notion: savedData
        ? {
            pageId: pickFirstNonEmptyString(savedData.notionPageId, savedData.pageId),
            url: pickFirstNonEmptyString(savedData.notionUrl, savedData.url),
            title: savedData.title || null,
            savedAt: savedData.savedAt ?? savedData.lastUpdated ?? now,
            lastVerifiedAt: savedData.lastVerifiedAt ?? null,
          }
        : null,
      highlights: Array.isArray(highlights) ? highlights : highlights?.highlights || [],
      metadata: {
        createdAt: savedData?.savedAt ?? savedData?.lastUpdated ?? now,
        lastUpdated: now,
        ...(migratedFrom ? { migratedFrom } : {}),
      },
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
      .map(item => ({
        ...item,
        id: typeof item.id === 'string' ? item.id : '',
        text: typeof item.text === 'string' ? item.text : '',
        color: typeof item.color === 'string' ? item.color : 'yellow',
        rangeInfo:
          item.rangeInfo && typeof item.rangeInfo === 'object' && !Array.isArray(item.rangeInfo)
            ? item.rangeInfo
            : {},
        timestamp: Number.isFinite(item.timestamp) ? item.timestamp : Date.now(),
      }));
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
   * @private
   */
  _triggerReadTimeUpgrade(targetUrl, savedData, savedKey) {
    const now = Date.now();
    if (!this._canRetryUpgrade(targetUrl, now)) {
      return;
    }

    const pageKey = `${PAGE_PREFIX}${targetUrl}`;
    const highlightKey = `${HIGHLIGHTS_PREFIX}${targetUrl}`;

    // 在鎖的保護下進行升級，避免併發覆蓋
    this._withLock(targetUrl, async () => {
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
        let finalObj;
        if (
          existingPage &&
          (existingPage.metadata?.lastUpdated ?? 0) > (builtObj.metadata?.lastUpdated ?? 0)
        ) {
          finalObj = {
            ...builtObj,
            ...existingPage,
            highlights: existingPage.highlights?.length
              ? existingPage.highlights
              : builtObj.highlights,
          };
        } else {
          finalObj = builtObj;
        }

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
        // 新格式：返回 notion 子欄位，並映射為調用者預期的欄位名
        // 內部儲存格式: { pageId, url, title, savedAt, lastVerifiedAt }
        // 調用者預期格式: { notionPageId, notionUrl, title, savedAt, lastVerifiedAt }
        const notion = state.data.notion;
        if (!notion) {
          return null;
        }
        return {
          notionPageId: notion.pageId ?? null,
          notionUrl: notion.url ?? null,
          title: notion.title || null,
          savedAt: notion.savedAt ?? null,
          lastVerifiedAt: notion.lastVerifiedAt ?? null,
        };
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

    try {
      // 步驟 1：批量讀取所有需要的 keys（包含 alias + 所有可能的 page_* 和 highlights_*）
      // 計算 alias lookup keys
      const aliasKeys = getAliasLookupKeys(normalizedUrl);
      // 等待 alias query 後建立 contract，所以先讀取 alias data
      const preloadKeys = [
        ...aliasKeys,
        `${PAGE_PREFIX}${normalizedUrl}`,
        `${HIGHLIGHTS_PREFIX}${normalizedUrl}`,
      ];

      const preloadResult = await this.storage.local.get(preloadKeys);

      // 步驟 2：從讀取結果選出 alias candidate
      const aliasCandidate = pickAliasCandidate(preloadResult, normalizedUrl);

      // 步驟 3：產生 lookup contract
      const contract = resolveHighlightLookupKeys(normalizedUrl, aliasCandidate);

      // 步驟 4：若 alias 已用，補取 stableUrl 的 page_* 和 highlights_*
      // （無 alias 時 stableUrl === normalizedUrl，兩者都已在 preloadKeys 中）
      let storageData = preloadResult;
      if (aliasCandidate && aliasCandidate !== normalizedUrl) {
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
          storageData = { ...preloadResult, ...extra };
        }
      }

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
    const pageKey = `${PAGE_PREFIX}${normalizedUrl}`;

    return this._withLock(normalizedUrl, async () => {
      try {
        // Phase 3：一次寫入統一 page_* 物件（鎖內序列化，避免並發覆寫）
        const pageObj = this._buildPageObject(pageData, highlights || [], normalizedUrl);
        await this.storage.local.set({ [pageKey]: pageObj });
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

    return this._withLock(normalizedUrl, async () => {
      try {
        const pageKey = `${PAGE_PREFIX}${normalizedUrl}`;
        const hlKey = `${HIGHLIGHTS_PREFIX}${normalizedUrl}`;
        const existing = await this.storage.local.get([pageKey, hlKey]);
        const current = existing[pageKey] || {};

        // 保留現有 highlights；若 page_* 不存在，從舊格式 highlights_* 取回
        // 支援舊格式：純陣列 [...] 和物件格式 { highlights: [...] }
        const legacyHighlights = existing[hlKey];
        let legacyArray = [];
        if (Array.isArray(legacyHighlights)) {
          legacyArray = legacyHighlights;
        } else if (Array.isArray(legacyHighlights?.highlights)) {
          legacyArray = legacyHighlights.highlights;
        }
        // ?? 確保：若 current.highlights 為 undefined（page_* 不存在），才回退到 legacyArray
        const existingHighlights = this._normalizeHighlightsArray(
          current.highlights ?? legacyArray
        );

        // 將傳入的 data 轉換為 notion 子欄位格式
        const notionData = {
          pageId: pickFirstNonEmptyString(data.notionPageId, data.pageId, current.notion?.pageId),
          url: pickFirstNonEmptyString(data.notionUrl, data.url, current.notion?.url),
          title: data.title || current.notion?.title || null,
          savedAt: data.savedAt ?? current.notion?.savedAt ?? Date.now(),
          lastVerifiedAt: data.lastVerifiedAt ?? current.notion?.lastVerifiedAt ?? null,
        };

        const newData = {
          ...current,
          highlights: existingHighlights,
          notion: notionData,
          metadata: {
            ...current.metadata,
            lastUpdated: Date.now(),
          },
        };

        await this.storage.local.set({ [pageKey]: newData });

        // 過渡期：刪除舊 saved_* key；若 highlights_* 已遷移到 page_*，一併清理
        const oldKey = `${SAVED_PREFIX}${normalizedUrl}`;
        const keysToRemove = [oldKey];
        if (existing[hlKey]) {
          keysToRemove.push(hlKey);
        }
        this.storage.local.remove(keysToRemove).catch(error => {
          this.logger.debug?.('[StorageService] Failed to remove legacy keys', {
            keys: keysToRemove,
            error: error?.message ?? error,
          });
        });
      } catch (error) {
        this.logger.error?.('[StorageService] setSavedPageData failed', { error });
        throw error;
      }
    });
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

    return this._withLock(normalizedUrl, async () => {
      try {
        const pageKey = `${PAGE_PREFIX}${normalizedUrl}`;
        const existing = await this.storage.local.get([pageKey]);
        const current = existing[pageKey];

        if (current) {
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

    // Phase 3：清除新格式 key
    const keysToRemove = [`${PAGE_PREFIX}${normalizedUrl}`];

    // 如果有穩定 URL 且與原始 URL 不同，也清理穩定 URL 的 key
    if (stableUrl && stableUrl !== normalizedUrl) {
      keysToRemove.push(`${PAGE_PREFIX}${stableUrl}`);
    }

    // 過渡期：同時清理舊格式 key
    keysToRemove.push(`${SAVED_PREFIX}${normalizedUrl}`);
    if (stableUrl && stableUrl !== normalizedUrl) {
      keysToRemove.push(`${SAVED_PREFIX}${stableUrl}`);
    }

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

    return this._withLock(normalizedUrl, async () => {
      // 使用與 getSavedPageData 相同的 URL 別名解析路徑，確保清除的 key 與讀取的 key 一致
      const state = await this._getPageState(normalizedUrl);

      if (state?.format === 'new') {
        if (
          expectedPageId &&
          state.data.notion?.pageId &&
          state.data.notion.pageId !== expectedPageId
        ) {
          this.logger.warn?.('[StorageService] clearNotionState skipped: pageId mismatch', {
            expectedPageId: expectedPageId.slice(0, 4),
            foundPageId: state.data.notion.pageId.slice(0, 4),
            url: sanitizeUrlForLogging(normalizedUrl),
          });
          return { skipped: true, reason: 'pageId_mismatch' };
        }

        await this.storage.local.set({
          [state.key]: {
            ...state.data,
            notion: null,
            metadata: { ...state.data.metadata, lastUpdated: Date.now() },
          },
        });
      }

      // 清理舊格式 saved_* key（無 highlights，可安全刪除）
      const oldKeys = [`${SAVED_PREFIX}${normalizedUrl}`];
      if (stableUrl && stableUrl !== normalizedUrl) {
        oldKeys.push(`${SAVED_PREFIX}${stableUrl}`);
      }
      if (state?.format === 'legacy') {
        oldKeys.push(state.savedKey);
      }
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
        return await this._executeClearAttempt(pageUrl, options, safeUrl, source, attempt);
      } catch (error) {
        lastError = error;
        const isTerminal = attempt >= maxAttempts;

        this._logClearAttemptFailure(source, attempt, safeUrl, error, isTerminal);

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
   * @param {string} pageUrl - 頁面 URL
   * @param {object} options - 補充上下文
   * @param {string} [options.expectedPageId] - 預期綁定的 Notion pageId
   * @param {string} safeUrl - 已脫敏的 URL
   * @param {string} source - 呼叫來源
   * @param {number} attempt - 當前嘗試次數
   * @returns {Promise<{cleared: true, attempts: number, recovered: boolean} | {cleared: false, skipped: true, reason: string, attempts: number, recovered: false}>}
   * @private
   */
  async _executeClearAttempt(pageUrl, options, safeUrl, source, attempt) {
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
   * @param {string} source - 呼叫來源
   * @param {number} attempt - 當前嘗試次數
   * @param {string} safeUrl - 已脫敏的 URL
   * @param {Error} error - 失敗錯誤
   * @param {boolean} isTerminal - 是否為最後一次嘗試
   * @returns {void}
   * @private
   */
  _logClearAttemptFailure(source, attempt, safeUrl, error, isTerminal) {
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

    if (!normalizedOriginal || !normalizedStable || normalizedOriginal === normalizedStable) {
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

    const localConfig = {};
    const syncConfig = {};

    for (const [key, value] of Object.entries(config)) {
      if (LOCAL_STORAGE_KEYS.has(key)) {
        localConfig[key] = value;
      } else {
        syncConfig[key] = value;
      }
    }

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
   * 規範化舊格式標註資料，確保回傳形狀一律為 { highlights: [...] }
   *
   * @param {any} value - 原始儲存值（可能是陣列或含 highlights 欄位的物件）
   * @returns {object} 統一為 { highlights: [...] } 格式
   * @private
   */
  _normalizeLegacyHighlight(value) {
    if (value && typeof value === 'object' && 'highlights' in value) {
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
      const result = {};

      // Phase 3：優先處理 page_* 格式（新格式）
      for (const [key, value] of Object.entries(data)) {
        if (!key.startsWith(PAGE_PREFIX)) {
          continue;
        }
        const url = key.slice(PAGE_PREFIX.length);
        result[url] = { url, highlights: value.highlights || [] };
      }

      // 過渡期：補充尚未升級的 highlights_* 格式（同 URL 不覆蓋 page_* 結果）
      for (const [key, value] of Object.entries(data)) {
        if (!key.startsWith(HIGHLIGHTS_PREFIX)) {
          continue;
        }
        const url = key.slice(HIGHLIGHTS_PREFIX.length);
        if (result[url]) {
          continue;
        }
        result[url] = this._normalizeLegacyHighlight(value);
      }

      return result;
    } catch (error) {
      this.logger.error?.('[StorageService] getAllHighlights failed', { error });
      throw error;
    }
  }

  /**
   * 更新指定 URL 的標註陣列（Phase 3：partial update page_*.highlights，含互斥鎖）
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

    return this._withLock(normalizedUrl, async () => {
      try {
        const pageKey = `${PAGE_PREFIX}${normalizedUrl}`;
        const hlKey = `${HIGHLIGHTS_PREFIX}${normalizedUrl}`;

        // 讀取現有資料（優先 page_*，回退 highlights_*）
        const existing = await this.storage.local.get([pageKey, hlKey]);
        const current = existing[pageKey];

        let newData;
        if (current) {
          // 新格式：partial update highlights 欄位
          newData = {
            ...current,
            highlights,
            metadata: { ...current.metadata, lastUpdated: Date.now() },
          };
        } else {
          // 尚無 page_* → 建立新物件（notion 為 null，表示未保存到 Notion）
          const oldHl = existing[hlKey];
          newData = this._buildPageObject(
            null,
            highlights,
            normalizedUrl,
            oldHl ? hlKey : undefined
          );
        }

        await this.storage.local.set({ [pageKey]: newData });

        // 過渡期：若讀到舊 highlights_* key，非阻塞刪除
        if (existing[hlKey]) {
          this.storage.local.remove([hlKey]).catch(error => {
            this.logger.debug?.('[StorageService] Failed to remove legacy highlights key', {
              hlKey,
              error: error?.message ?? error,
            });
          });
        }
      } catch (error) {
        this.logger.error?.('[StorageService] updateHighlights failed', { error });
        throw error;
      }
    });
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
        if (key.startsWith(PAGE_PREFIX) && value.notion) {
          // 新格式：有 notion 欄位代表已保存
          urlSet.add(key.slice(PAGE_PREFIX.length));
        } else if (key.startsWith(SAVED_PREFIX)) {
          // 舊格式（過渡期）
          urlSet.add(key.slice(SAVED_PREFIX.length));
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
