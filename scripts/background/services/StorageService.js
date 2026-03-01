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
import { ERROR_MESSAGES } from '../../config/messages.js';
import { URL_ALIAS_PREFIX, PAGE_PREFIX } from '../../config/constants.js';

/**
 * URL 標準化相關常量（向後兼容：既有代碼可繼續導入這些常量）
 */
export const SAVED_PREFIX = 'saved_';
export const HIGHLIGHTS_PREFIX = 'highlights_';
// PAGE_PREFIX 在底部統一從 constants.js 重新導出

export const STORAGE_ERROR = ERROR_MESSAGES.TECHNICAL.CHROME_STORAGE_UNAVAILABLE;

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
            pageId: savedData.notionPageId || savedData.pageId || null,
            url: savedData.notionUrl || savedData.url || null,
            title: savedData.title || null,
            savedAt: savedData.savedAt || savedData.lastUpdated || now,
            lastVerifiedAt: savedData.lastVerifiedAt || null,
          }
        : null,
      highlights: Array.isArray(highlights) ? highlights : highlights?.highlights || [],
      metadata: {
        createdAt: savedData?.savedAt || savedData?.lastUpdated || now,
        lastUpdated: now,
        ...(migratedFrom ? { migratedFrom } : {}),
      },
    };
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
    const pageKey = `${PAGE_PREFIX}${targetUrl}`;
    const highlightKey = `${HIGHLIGHTS_PREFIX}${targetUrl}`;

    // 在鎖的保護下進行升級，避免併發覆蓋
    this._withLock(targetUrl, async () => {
      // 同時讀取現有 page_* 和 highlights_*，防止覆寫鎖等待期間寫入的較新資料
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
          notionPageId: notion.pageId || null,
          notionUrl: notion.url || null,
          title: notion.title || null,
          savedAt: notion.savedAt || null,
          lastVerifiedAt: notion.lastVerifiedAt || null,
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
   * 查找優先順序：page_* 新格式 → highlights_* 舊格式
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
      const pageKey = `${PAGE_PREFIX}${normalizedUrl}`;
      const hlKey = `${HIGHLIGHTS_PREFIX}${normalizedUrl}`;

      // 批量讀取：同時查詢新舊格式
      const result = await this.storage.local.get([pageKey, hlKey]);

      if (result[pageKey]) {
        // 新格式：返回 highlights 陣列
        return result[pageKey].highlights || [];
      }

      if (result[hlKey]) {
        // 舊格式：返回資料（觸發讀時升級由 getSavedPageData 路徑處理）
        return result[hlKey];
      }

      return null;
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
        const existingHighlights = current.highlights ?? legacyArray;

        // 將傳入的 data 轉換為 notion 子欄位格式
        const notionData = {
          pageId: data.notionPageId || data.pageId || current.notion?.pageId || null,
          url: data.notionUrl || data.url || current.notion?.url || null,
          title: data.title || current.notion?.title || null,
          savedAt: data.savedAt || current.notion?.savedAt || Date.now(),
          lastVerifiedAt: data.lastVerifiedAt || current.notion?.lastVerifiedAt || null,
        };

        const newData = {
          highlights: existingHighlights,
          ...current,
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
   * @returns {Promise<void>}
   */
  async clearNotionState(pageUrl) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const stableUrl = computeStableUrl(pageUrl);

    return this._withLock(normalizedUrl, async () => {
      const pageKey = `${PAGE_PREFIX}${normalizedUrl}`;
      const stableKey =
        stableUrl && stableUrl !== normalizedUrl ? `${PAGE_PREFIX}${stableUrl}` : null;

      const keysToRead = stableKey ? [pageKey, stableKey] : [pageKey];
      const existing = await this.storage.local.get(keysToRead);

      const updates = {};

      if (existing[pageKey]) {
        updates[pageKey] = {
          ...existing[pageKey],
          notion: null,
          metadata: { ...existing[pageKey].metadata, lastUpdated: Date.now() },
        };
      }

      if (stableKey && existing[stableKey]) {
        updates[stableKey] = {
          ...existing[stableKey],
          notion: null,
          metadata: { ...existing[stableKey].metadata, lastUpdated: Date.now() },
        };
      }

      if (Object.keys(updates).length > 0) {
        await this.storage.local.set(updates);
      }

      // 清理舊格式 saved_* key（無 highlights，可安全刪除）
      const oldKeys = [`${SAVED_PREFIX}${normalizedUrl}`];
      if (stableUrl && stableUrl !== normalizedUrl) {
        oldKeys.push(`${SAVED_PREFIX}${stableUrl}`);
      }
      await this.storage.local.remove(oldKeys).catch(() => {});

      this.logger.log?.('Cleared Notion metadata (highlights preserved)', {
        url: sanitizeUrlForLogging(normalizedUrl),
      });
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
   * 獲取配置（從 sync storage）
   *
   * @param {string[]} keys - 要獲取的配置鍵
   * @returns {Promise<object>}
   */
  async getConfig(keys) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    try {
      return await this.storage.sync.get(keys);
    } catch (error) {
      this.logger.error?.('[StorageService] getConfig failed', { error });
      throw error;
    }
  }

  /**
   * 設置配置（到 sync storage）
   *
   * @param {object} config - 配置對象
   * @returns {Promise<void>}
   */
  async setConfig(config) {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    try {
      await this.storage.sync.set(config);
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
   * @returns {Promise<Record<string, object>>} key 為 URL，value 為完整標註資料
   */
  async getAllHighlights() {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    try {
      const allData = await this.storage.local.get(null);
      const result = {};

      // Phase 3：優先處理 page_* 格式（新格式）
      for (const [key, value] of Object.entries(allData)) {
        if (!key.startsWith(PAGE_PREFIX)) {
          continue;
        }
        const url = key.slice(PAGE_PREFIX.length);
        result[url] = { url, highlights: value.highlights || [] };
      }

      // 過渡期：補充尚未升級的 highlights_* 格式（同 URL 不覆蓋 page_* 結果）
      for (const [key, value] of Object.entries(allData)) {
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
   * @returns {Promise<string[]>}
   */
  async getAllSavedPageUrls() {
    if (!this.storage) {
      throw new Error(STORAGE_ERROR);
    }

    try {
      const result = await this.storage.local.get(null);
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
export { URL_ALIAS_PREFIX, PAGE_PREFIX } from '../../config/constants.js'; // Phase 3: PAGE_PREFIX 統一從此處導出
