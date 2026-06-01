/**
 * TabService - 標籤頁管理服務
 *
 * 職責：管理標籤頁相關操作，包括：
 * - 標籤頁狀態更新（徽章顯示）
 * - 標籤事件監聽（onUpdated, onActivated）
 * - 舊版標註數據遷移
 *
 * @module services/TabService
 */

/* global chrome */

import { TAB_SERVICE, HANDLER_CONSTANTS } from '../../config/shared/core.js';
import { URL_NORMALIZATION } from '../../config/shared/content.js';
import { RUNTIME_ACTIONS } from '../../config/shared/runtimeActions.js';
import { URL_ALIAS_PREFIX } from '../../config/shared/storage.js';
import Logger from '../../utils/Logger.js';
import { resolveStorageUrl, isRootUrl } from '../../utils/urlUtils.js';
import { sanitizeUrlForLogging } from '../../utils/LogSanitizer.js';
import { ERROR_MESSAGES } from '../../config/shared/messages.js';
import {
  KEY_PREFIX as HIGHLIGHT_KEY_PREFIX,
  resolveKeys as resolveHighlightLookupKeys,
  getAliasLookupKeys,
  pickAliasCandidate,
  pickHighlightsFromStorage,
} from '../../highlighter/core/HighlightLookupResolver.js';

const DELETION_CONFIRMATION_WINDOW_MS = 5 * 60 * 1000;
const NOTION_HOST_SUFFIXES = ['notion.so', 'notion.com', 'notion.site'];
const CLOSED_OR_MISSING_TAB_ERROR_FRAGMENTS = ['The tab was closed', 'No tab with id'];

const identityUrl = url => url;
const resolveNull = () => Promise.resolve(null);
const resolveVoid = () => Promise.resolve();
const returnFalse = () => false;

function sanitizeHighlightStorageKeyForLogging(key) {
  if (typeof key !== 'string') {
    return '[invalid-storage-key]';
  }

  if (key.startsWith(HIGHLIGHT_KEY_PREFIX.PAGE)) {
    return `${HIGHLIGHT_KEY_PREFIX.PAGE}${sanitizeUrlForLogging(
      key.slice(HIGHLIGHT_KEY_PREFIX.PAGE.length)
    )}`;
  }

  if (key.startsWith(HIGHLIGHT_KEY_PREFIX.HIGHLIGHTS)) {
    return `${HIGHLIGHT_KEY_PREFIX.HIGHLIGHTS}${sanitizeUrlForLogging(
      key.slice(HIGHLIGHT_KEY_PREFIX.HIGHLIGHTS.length)
    )}`;
  }

  if (key.startsWith(URL_ALIAS_PREFIX)) {
    return `${URL_ALIAS_PREFIX}${sanitizeUrlForLogging(key.slice(URL_ALIAS_PREFIX.length))}`;
  }

  return '[non-highlight-storage-key]';
}

/**
 * 檢查 hostname 是否為 Notion 主機
 *
 * @param {string} hostname
 * @returns {boolean}
 */
function isNotionHost(hostname) {
  if (!hostname) {
    return false;
  }
  if (NOTION_HOST_SUFFIXES.includes(hostname)) {
    return true;
  }
  return NOTION_HOST_SUFFIXES.some(suffix => hostname.endsWith(`.${suffix}`));
}

/**
 * 檢查 URL 是否為 Notion 頁面 URL
 *
 * @param {string} url
 * @returns {boolean}
 */
function isNotionPageUrl(url) {
  if (!url) {
    return false;
  }
  try {
    const { hostname } = new URL(url);
    return isNotionHost(hostname);
  } catch {
    return false;
  }
}

/**
 * 根據 Preloader 數據獲取解析階段
 *
 * @param {object|null} preloaderData
 * @returns {string}
 */
function getPreloaderResolutionPhase(preloaderData) {
  if (!preloaderData) {
    return 'fallback';
  }
  if (preloaderData.nextRouteInfo) {
    return '2a(nextjs)';
  }
  if (preloaderData.shortlink) {
    return '2a+(shortlink)';
  }
  return 'fallback';
}

/**
 * 檢查錯誤是否為標籤頁關閉或找不到的常見錯誤
 *
 * @param {Error} error
 * @returns {boolean}
 */
function isClosedOrMissingTabError(error) {
  const message = error?.message;
  if (!message) {
    return false;
  }
  return CLOSED_OR_MISSING_TAB_ERROR_FRAGMENTS.some(fragment => message.includes(fragment));
}

/**
 * 檢查是否有穩定的頁面證據
 *
 * @param {object|null|undefined} stablePage
 * @returns {boolean}
 */
function hasStablePageEvidence(stablePage) {
  if (!stablePage) {
    return false;
  }
  const hasHighlights = Array.isArray(stablePage.highlights) && stablePage.highlights.length > 0;
  return hasHighlights || Boolean(stablePage.notion);
}

/**
 * 檢查是否有穩定的舊版證據
 *
 * @param {object} evidence
 * @param {string} stableLegacyKey
 * @returns {boolean}
 */
function hasStableLegacyEvidence(evidence, stableLegacyKey) {
  if (!evidence) {
    return false;
  }
  return evidence[stableLegacyKey] !== undefined && evidence[stableLegacyKey] !== null;
}

function isProcessableTabUrl(url) {
  if (!url) {
    return false;
  }
  if (!/^https?:/i.test(url)) {
    return false;
  }
  return true;
}

function shouldRejectStableRootUrl(hasStableUrl, stableUrl) {
  if (!hasStableUrl) {
    return false;
  }
  return isRootUrl(stableUrl);
}

function shouldMigrateStableUrl(hasStableUrl, migrationService) {
  if (!hasStableUrl) {
    return false;
  }
  return Boolean(migrationService);
}

function createDefaultClearNotionStateWithRetry(service) {
  return async (url, retryOptions) => {
    try {
      const clearResult = await service.clearNotionState(url, retryOptions);
      if (clearResult?.skipped) {
        return {
          cleared: false,
          skipped: true,
          reason: clearResult.reason,
          attempts: 1,
          recovered: false,
        };
      }
      return { cleared: true, attempts: 1, recovered: false };
    } catch (error) {
      return { cleared: false, attempts: 1, error };
    }
  };
}

function hasMigratedHighlightData(result) {
  if (!result?.migrated) {
    return false;
  }
  if (!Array.isArray(result.data)) {
    return false;
  }
  return result.data.length > 0;
}

/**
 * TabService 類
 */
class TabService {
  /**
   * @param {object} options - 配置選項
   * @param {object} options.logger - 日誌對象
   * @param {object} options.injectionService - 注入服務實例
   * @param {Function} options.normalizeUrl - URL 標準化函數
   * @param {Function} [options.computeStableUrl] - 計算穩定 URL 的函數（Phase 1）
   * @param {Function} options.getSavedPageData - 獲取已保存頁面數據的函數
   * @param {Function} options.isRestrictedUrl - 檢查受限 URL 的函數
   * @param {Function} options.isRecoverableError - 檢查可恢復錯誤的函數
   * @param {Function} [options.onNoHighlightsFound] - 無標註時的回調（用於遷移邏輯解耦）
   *   簽名: (tabId: number, normUrl: string, highlightsKey: string) => Promise<void>
   *   - tabId: 標籤頁 ID
   *   - normUrl: 標準化後的 URL
   *   - highlightsKey: 標註存儲鍵名（格式: "highlights_{normUrl}"）
   */
  constructor(options = {}) {
    // === 核心依賴 ===
    this.logger = options.logger ?? Logger;
    this.injectionService = options.injectionService;

    // === URL 處理 ===
    this.normalizeUrl = options.normalizeUrl ?? identityUrl;
    this.computeStableUrl = options.computeStableUrl ?? null;

    // === 存儲查詢 ===
    this.getSavedPageData = options.getSavedPageData ?? resolveNull;

    // === 安全檢查 ===
    this.isRestrictedUrl = options.isRestrictedUrl ?? returnFalse;
    this.isRecoverableError = options.isRecoverableError ?? returnFalse;

    // === 回調與狀態 ===
    // 無標註時觸發（可用於遷移或其他邏輯）
    this.onNoHighlightsFound = options.onNoHighlightsFound ?? null;
    // 追蹤每個 tabId 的待處理監聽器，防止重複註冊
    this.pendingListeners = new Map();
    // 追蹤正在處理中的 tab，防止並發調用
    this.processingTabs = new Map();

    // === 頁面驗證邏輯 (_verifyAndUpdateStatus 使用) ===
    this.checkPageExists = options.checkPageExists ?? resolveNull;
    this.getApiKey = options.getApiKey ?? resolveNull;
    this.clearPageState = options.clearPageState ?? resolveVoid;
    this.clearNotionState = options.clearNotionState ?? resolveVoid;
    this.clearNotionStateWithRetry =
      options.clearNotionStateWithRetry ?? createDefaultClearNotionStateWithRetry(this);
    this.setSavedPageData = options.setSavedPageData ?? resolveVoid;

    // 連續不存在保護：短時間窗內連續兩次 false 才清理。
    // Map metadata 讓暫時性 false negative 過期後重新視為第一次失敗。
    this.deletionPendingPages = new Map();
  }

  /**
   * 更新標籤頁狀態（徽章和標註注入）
   *
   * @param {number} tabId - 標籤頁 ID
   * @param {string} url - 標籤頁 URL
   */
  async updateTabStatus(tabId, url) {
    if (!isProcessableTabUrl(url) || this.isRestrictedUrl(url)) {
      return;
    }

    // 防止並發調用：檢查是否正在處理
    if (this.processingTabs.has(tabId)) {
      this.logger.debug(`[TabService] Tab ${tabId} is already being processed, skipping`);
      return;
    }

    // 標記為處理中
    this.processingTabs.set(tabId, Date.now());

    try {
      await this._updateTabStatusInternal(tabId, url);
    } finally {
      // 無論成功或失敗，都移除處理中標記
      this.processingTabs.delete(tabId);
    }
  }

  /**
   * 解析 tab 的穩定 URL，可選自動遷移
   *
   * 將 getPreloaderData + resolveStorageUrl + migrateStorageKey 三步流程收斂為一個方法，
   * 避免各 Handler 重複實作相同邏輯。
   *
   * @param {number} tabId - 標籤頁 ID
   * @param {string} url - tab 的原始 URL
   * @param {MigrationService} [migrationService] - 提供時自動觸發遷移
   * @returns {Promise<{stableUrl: string, originalUrl: string, hasStableUrl: boolean, migrated: boolean}>}
   */
  async resolveTabUrl(tabId, url, migrationService = null) {
    const isNotionPage = isNotionPageUrl(url);
    const preloaderData = isNotionPage ? null : await this.getPreloaderData(tabId);
    const stableUrl = resolveStorageUrl(url, preloaderData);
    const originalUrl = this.normalizeUrl(url);
    const hasStableUrl = stableUrl !== originalUrl;

    // 記錄 URL 解析決策，便於日後分析重複標注等問題
    const phase = getPreloaderResolutionPhase(preloaderData);
    this.logger.debug('[TabService] resolveTabUrl decision', {
      rawUrl: sanitizeUrlForLogging(url),
      stableUrl: sanitizeUrlForLogging(stableUrl),
      originalUrl: sanitizeUrlForLogging(originalUrl),
      phase,
      preloaderShortlink: preloaderData?.shortlink
        ? sanitizeUrlForLogging(preloaderData.shortlink)
        : null,
      hasStableUrl,
    });

    let migrated = false;

    // 防禦：拒絕使用根路徑 URL（首頁）作為 stableUrl
    // 成因：某些 WordPress 站點在首頁上設置 <link rel="shortlink"> 指向首頁，
    // 若不加防護，不同文章的資料將被遷移到同一個首頁 key 下互相覆寫。
    if (shouldRejectStableRootUrl(hasStableUrl, stableUrl)) {
      this.logger.warn('[TabService] Blocked root URL as stableUrl, falling back to originalUrl', {
        rejected: sanitizeUrlForLogging(stableUrl),
        fallback: sanitizeUrlForLogging(originalUrl),
      });
      return { stableUrl: originalUrl, originalUrl, hasStableUrl: false, migrated: false };
    }

    if (shouldMigrateStableUrl(hasStableUrl, migrationService)) {
      migrated = await migrationService.migrateStorageKey(stableUrl, originalUrl);
    }

    return { stableUrl, originalUrl, hasStableUrl, migrated };
  }

  /**
   * 公開方法：等標籤頁完成（包裝內部私有方法）
   *
   * @param {number} tabId
   * @returns {Promise<object|null>}
   */
  async waitForTabComplete(tabId) {
    return this._waitForTabCompilation(tabId);
  }

  /**
   * 包裝 chrome.tabs.query
   *
   * @param {object} queryInfo
   * @returns {Promise<chrome.tabs.Tab[]>}
   */
  async queryTabs(queryInfo) {
    return chrome.tabs.query(queryInfo);
  }

  /**
   * 包裝 chrome.tabs.create
   *
   * @param {object} createProperties
   * @returns {Promise<chrome.tabs.Tab>}
   */
  async createTab(createProperties) {
    return chrome.tabs.create(createProperties);
  }

  /**
   * 包裝 chrome.tabs.remove
   *
   * @param {number|number[]} tabId
   * @returns {Promise<void>}
   */
  async removeTab(tabId) {
    return chrome.tabs.remove(tabId);
  }

  async _updateTabStatusInternal(tabId, url) {
    // 按優先級計算穩定 URL（包含 Phase 1, Phase 2a/2a+, fallback）
    const { stableUrl: normUrl, originalUrl, hasStableUrl } = await this.resolveTabUrl(tabId, url);

    try {
      await this._persistUrlAliasIfNeeded(hasStableUrl, originalUrl, normUrl);

      // 1. 更新徽章狀態（雙查：若有穩定 URL，同時檢查原始 URL）
      await this._verifyAndUpdateStatus(tabId, normUrl, hasStableUrl ? originalUrl : null);

      // 2. 處理標註注入（雙查：穩定 URL 優先，回退到原始 URL）
      const highlights = await this._getHighlightsWithFallback(normUrl, hasStableUrl, originalUrl);

      if (!highlights) {
        await this._handleNoHighlights(tabId, normUrl);
        return;
      }

      await this._injectBundleWhenTabReady(
        tabId,
        normUrl,
        `[TabService] Found ${highlights.length} highlights, preparing to inject bundle...`
      );
    } catch (error) {
      if (!this.logger.error) {
        return;
      }
      // Avoid logging recoverable errors as true errors to reduce noise
      if (isClosedOrMissingTabError(error)) {
        this.logger.debug(`[TabService] Tab closed/missing during update: ${error.message}`);
      } else {
        const errorMsg = error.message || String(error);
        this.logger.error(`[TabService] Error updating tab status: ${errorMsg}`, { error });
      }
    }
  }

  /**
   * 視需要寫入 url_alias，將 originalUrl → stableUrl 的對映持久化。
   *
   * Phase 4 (tighten — Phase 0 決策)：
   * 不再僅以 `hasStableUrl=true` 為充分條件；MUST 在 stableUrl 已有有效
   * `page_<stableUrl>` 或 `highlights_<stableUrl>` evidence 時才寫入 alias。
   * 動機：避免 alias 早寫入造成 canonical 漂移（其他 consumer 透過 alias 解析到尚未實際
   * 寫入資料的 stableUrl，導致 read 命中空 key）。
   *
   * 「有效 evidence」定義：
   * - `page_<stableUrl>` 存在且 (highlights 非空 或 notion 非 null)
   * - 或 `highlights_<stableUrl>` 存在（不論內容，視為舊格式 evidence）
   *
   * @param {boolean} hasStableUrl
   * @param {string} originalUrl
   * @param {string} normUrl - stableUrl（已 normalize）
   * @returns {Promise<void>}
   * @private
   */
  async _persistUrlAliasIfNeeded(hasStableUrl, originalUrl, normUrl) {
    if (!hasStableUrl) {
      return;
    }

    try {
      // Phase 4 (tighten)：先檢查 stableUrl 是否已有有效 evidence
      const stablePageKey = `${HIGHLIGHT_KEY_PREFIX.PAGE}${normUrl}`;
      const stableLegacyKey = `${HIGHLIGHT_KEY_PREFIX.HIGHLIGHTS}${normUrl}`;
      const evidence = await chrome.storage.local.get([stablePageKey, stableLegacyKey]);

      const hasPageEvidence = hasStablePageEvidence(evidence[stablePageKey]);
      const hasLegacyEvidence = hasStableLegacyEvidence(evidence, stableLegacyKey);

      if (!hasPageEvidence && !hasLegacyEvidence) {
        // 無有效 evidence → 不寫 alias，避免漂移
        this.logger.debug?.(
          '[TabService] Skipping url_alias write: no evidence at stableUrl yet (tighten)',
          {
            originalUrl: sanitizeUrlForLogging(originalUrl),
            stableUrl: sanitizeUrlForLogging(normUrl),
          }
        );
        return;
      }

      const aliasKey = `${URL_ALIAS_PREFIX}${this.normalizeUrl(originalUrl)}`;
      await chrome.storage.local.set({ [aliasKey]: normUrl });
    } catch (error) {
      this.logger.warn?.('[TabService] url_alias 寫入或檢查失敗，將繼續後續狀態更新', {
        action: 'updateTabStatus',
        originalUrl: sanitizeUrlForLogging(originalUrl),
        stableUrl: sanitizeUrlForLogging(normUrl),
        error,
      });
    }
  }

  async _getHighlightsWithFallback(normUrl, hasStableUrl, originalUrl) {
    const highlights = await this._getHighlightsFromStorage(normUrl);
    if (highlights || !hasStableUrl) {
      return highlights;
    }

    const fallbackHighlights = await this._getHighlightsFromStorage(originalUrl);
    // 這裡僅負責 stableUrl -> originalUrl 的讀取回退，不再夾帶重複 side-effect。
    // restore 正確性由 HighlightStorageGateway._loadBothFormats() 保證：
    // 它會同時查 page_<stableUrl> 與 page_<normalizedUrl>，避免 canonical key 與原 permalink
    // 暫時並存時出現 restore miss。url_alias 仍由 _persistUrlAliasIfNeeded() 在
    // hasStableUrl=true 時寫入，因此這裡的 regression fix 不是「移除 alias」，而是
    // 避免在 fallback helper 內再做一次與讀取無關的狀態寫入。

    return fallbackHighlights;
  }

  /**
   * 判斷是否應該為「無歷史標註」的頁面自動注入 content bundle，以支援 Floating Rail 自動載入。
   *
   * 預設啟用（fail-open）：未設定、讀取失敗、或 storage API 不可用時都回傳 true，
   * 對應 entryAutoInit.js 的 `settings?.floatingRailEnabled !== false` 判斷邏輯。
   *
   * @returns {Promise<boolean>}
   * @private
   */
  async _shouldAutoInjectForRail() {
    if (!chrome?.storage?.sync) {
      return true;
    }
    try {
      const result = await chrome.storage.sync.get(['floatingRailEnabled']);
      return result?.floatingRailEnabled !== false;
    } catch (error) {
      this.logger.warn?.('[TabService] 讀取 floatingRailEnabled 失敗，預設啟用 rail 注入', {
        error: error?.message,
      });
      return true;
    }
  }

  /**
   * 當標籤頁編譯/載入完成後注入 bundle 並發送穩定 URL
   *
   * @param {number} tabId
   * @param {string} normUrl
   * @param {string|null} logMessage
   * @private
   */
  async _injectBundleWhenTabReady(tabId, normUrl, logMessage = null) {
    if (logMessage) {
      this.logger.debug(logMessage);
    }
    const tab = await this._waitForTabCompilation(tabId);
    if (!tab) {
      return;
    }
    this.logger.debug(`[TabService] Tab ${tabId} is complete, injecting bundle now...`);
    await this.injectionService.ensureBundleInjected(tabId);
    this._sendStableUrl(tabId, normUrl);
  }

  /**
   * 處理沒有歷史標註時的邏輯（觸發回調/遷移，並在啟用 Floating Rail 時注入 bundle）
   *
   * @param {number} tabId
   * @param {string} normUrl
   * @private
   */
  async _handleNoHighlights(tabId, normUrl) {
    const handler = this.onNoHighlightsFound ?? this.migrateLegacyHighlights.bind(this);
    await handler(tabId, normUrl, `highlights_${normUrl}`);

    if (await this._shouldAutoInjectForRail()) {
      await this._injectBundleWhenTabReady(
        tabId,
        normUrl,
        `[TabService] No highlights, but Floating Rail enabled — injecting bundle for tab ${tabId}`
      );
    }
  }

  /**
   * 傳送穩定 URL 給 Content Script
   *
   * 防護：若 normUrl 是根路徑（首頁），不傳送——避免 WordPress 等站點的
   * tabs.onUpdated 時序問題覆寫 Content Script 中已正確設定的穩定 URL
   *
   * @param {number} tabId
   * @param {string} normUrl
   * @private
   */
  _sendStableUrl(tabId, normUrl) {
    if (isRootUrl(normUrl)) {
      this.logger.warn('[TabService] Blocked SET_STABLE_URL: resolved URL is site root', {
        tabId,
      });
      return;
    }
    try {
      chrome.tabs
        .sendMessage(tabId, { action: RUNTIME_ACTIONS.SET_STABLE_URL, stableUrl: normUrl })
        .catch(() => {}); // 忽略可能的連接錯誤 (如 tab 關閉)
    } catch (error) {
      this.logger.debug(`[TabService] Failed to send stable URL: ${error.message}`);
    }
  }

  /**
   * 快速取得 Preloader 元數據（Phase 2 穩定 URL 用）
   *
   * 透過 PING 訊息向 Preloader 請求頁面元數據（nextRouteInfo, shortlink）。
   * 帶 500ms 超時保護，超時或失敗時返回 null，不影響 Phase 1 行為。
   *
   * @param {number} tabId - 標籤頁 ID
   * @returns {Promise<{nextRouteInfo?: object, shortlink?: string}|null>}
   */
  async getPreloaderData(tabId) {
    try {
      const sendMessagePromise = new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: RUNTIME_ACTIONS.PING }, result => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      });

      // 防止 Unhandled Rejection：若超時發生，此 Promise 仍可能在未來 reject
      sendMessagePromise.catch(() => {});

      const response = await Promise.race([
        sendMessagePromise,
        new Promise(resolve =>
          setTimeout(() => resolve(null), TAB_SERVICE.PRELOADER_PING_TIMEOUT_MS)
        ),
      ]);

      if (!response) {
        return null;
      }

      // 只提取 Phase 2 相關數據
      return {
        nextRouteInfo: response.nextRouteInfo || null,
        shortlink: response.shortlink || null,
      };
    } catch (error) {
      this.logger.debug(`[TabService] Failed to get preloader data: ${error.message}`);
      // Preloader 未載入或 tab 不可用，靜默返回 null
      return null;
    }
  }

  /**
   * 獲取已保存的頁面數據，如果穩定的 URL 沒查到，則回退到 fallback URL 進行雙查
   *
   * @param {string} normUrl
   * @param {string|null} fallbackUrl
   * @returns {Promise<{savedData: object|null, resolvedUrl: string}>}
   * @private
   */
  async _getSavedDataWithFallback(normUrl, fallbackUrl) {
    const savedData = await this.getSavedPageData(normUrl);

    if (savedData) {
      return { savedData, resolvedUrl: normUrl };
    }

    if (!fallbackUrl) {
      return { savedData: null, resolvedUrl: normUrl };
    }

    if (fallbackUrl === normUrl) {
      return { savedData: null, resolvedUrl: normUrl };
    }

    const fallbackSavedData = await this.getSavedPageData(fallbackUrl);
    if (fallbackSavedData) {
      return { savedData: fallbackSavedData, resolvedUrl: fallbackUrl };
    }

    return { savedData: null, resolvedUrl: normUrl };
  }

  /**
   * 檢查頁面驗證快取是否仍屬新鮮 (未過期)
   *
   * @param {object} savedData
   * @param {number} now
   * @returns {boolean}
   * @private
   */
  _isStatusCacheFresh(savedData, now) {
    const lastVerifiedAt = savedData?.lastVerifiedAt || 0;
    const ttl = HANDLER_CONSTANTS.PAGE_STATUS_CACHE_TTL || 60_000;
    return now - lastVerifiedAt < ttl;
  }

  /**
   * 驗證並更新頁面狀態（含自動聯網檢查）
   *
   * @param {number} tabId - 標籤頁 ID
   * @param {string} normUrl - 標準化後的 URL（可能是穩定 URL）
   * @param {string|null} fallbackUrl - 回退 URL（原始 URL，用於向後兼容）
   * @private
   */
  async _verifyAndUpdateStatus(tabId, normUrl, fallbackUrl = null) {
    const { savedData, resolvedUrl } = await this._getSavedDataWithFallback(normUrl, fallbackUrl);

    if (!savedData) {
      await this._updateBadgeStatus(tabId, null);
      return;
    }

    const now = Date.now();
    if (this._isStatusCacheFresh(savedData, now)) {
      this.logger.debug(`[TabService] Using cached status for ${sanitizeUrlForLogging(normUrl)}`);
      await this._updateBadgeStatus(tabId, savedData);
      return;
    }

    // 快取過期，執行聯網檢查
    const maskedPageId = `${savedData.notionPageId?.slice(0, 4)}...`;
    this.logger.debug(`[TabService] Cache expired, verifying Notion page: ${maskedPageId}`);

    // 防護：notionPageId 不存在時跳過聯網驗證，直接顯示已保存狀態
    if (!savedData.notionPageId) {
      this.logger.debug('[TabService] No notionPageId in savedData, skipping Notion verification');
      await this._updateBadgeStatus(tabId, savedData);
      return;
    }

    try {
      const apiKey = await this.getApiKey();
      if (!apiKey) {
        // 沒有 API Key，無法執行聯網驗證，跳過並保留當前狀態
        // 注意：不呼叫 consumeDeletionConfirmation，避免清除由 checkPageStatus 設置的 deletionPending
        await this._updateBadgeStatus(tabId, savedData);
        return;
      }

      await this._handleNotionVerificationResult({
        tabId,
        normUrl,
        resolvedUrl,
        savedData,
        apiKey,
        now,
      });
    } catch (error) {
      this.logger.warn('[TabService] 自動驗證失敗，跳過並保留當前狀態', { error });
      await this._updateBadgeStatus(tabId, savedData);
    }
  }

  /**
   * 處理 Notion 頁面已被遠端刪除的情況（執行本地狀態清理）
   *
   * @param {number} tabId
   * @param {string} resolvedUrl
   * @param {object} savedData
   * @private
   */
  async _handleDeletedNotionPage(tabId, resolvedUrl, savedData) {
    this.logger.info('頁面已在 Notion 中刪除，自動清理本地狀態', {
      action: 'autoSyncLocalState',
      pageId: savedData.notionPageId?.slice(0, 4),
    });
    // 使用實際查到 savedData 的 URL 來清除，確保讀寫一致
    const clearResult = await this.clearNotionStateWithRetry(resolvedUrl, {
      source: 'TabService._handleNotionVerificationResult',
      expectedPageId: savedData.notionPageId,
    });
    if (clearResult.skipped) {
      this.logger.warn('[TabService] 清理已略過：本機 Notion 綁定已變更', {
        action: 'autoSyncLocalState',
        pageId: savedData.notionPageId?.slice(0, 4),
        reason: clearResult.reason,
        result: 'cleanup_skipped',
      });
      await this._updateBadgeStatus(tabId, savedData);
      return;
    }
    if (!clearResult.cleared) {
      // Re-arm: 清除失敗，恢復 pending token 供下次驗證立即重試
      this.confirmRemotePageMissing(savedData.notionPageId);
      throw clearResult.error || new Error(ERROR_MESSAGES.TECHNICAL.CLEAR_NOTION_STATE_FAILED);
    }
    await this._updateBadgeStatus(tabId, null);
  }

  /**
   * 處理第一次 Notion 遠端刪除檢查失敗（標記為 pending 狀態）
   *
   * @param {number} tabId
   * @param {object} savedData
   * @private
   */
  async _handlePendingNotionDeletion(tabId, savedData) {
    this.logger.warn('[TabService] First deletion check failed, mark as pending', {
      pageId: savedData.notionPageId?.slice(0, 4),
      action: 'autoSyncLocalState',
    });
    await this._updateBadgeStatus(tabId, savedData);
  }

  /**
   * 處理 Notion 頁面確認存在的情況（更新本地 cache 時戳與徽章）
   *
   * @param {number} tabId
   * @param {string} normUrl
   * @param {object} savedData
   * @param {number} now
   * @private
   */
  async _handleExistingNotionPage(tabId, normUrl, savedData, now) {
    const updatedData = { ...savedData, lastVerifiedAt: now };
    await this.setSavedPageData(normUrl, updatedData);
    await this._updateBadgeStatus(tabId, updatedData);
  }

  /**
   * 處理聯網檢查結果並更新狀態
   *
   * @param {object} context
   * @param {number} context.tabId - 標籤頁 ID
   * @param {string} context.normUrl - 標準化後的 URL
   * @param {string} context.resolvedUrl - 實際查到 savedData 的 URL
   * @param {object} context.savedData - 已保存數據
   * @param {string} context.apiKey - Notion API Key
   * @param {number} context.now - 當前時間戳
   * @private
   */
  async _handleNotionVerificationResult({ tabId, normUrl, resolvedUrl, savedData, apiKey, now }) {
    const exists = await this.checkPageExists(savedData.notionPageId, apiKey);
    const deletionCheck =
      exists === false
        ? this.confirmRemotePageMissing(savedData.notionPageId)
        : this.resetRemotePageMissingState(savedData.notionPageId);

    if (exists === true) {
      await this._handleExistingNotionPage(tabId, normUrl, savedData, now);
      return;
    }

    if (exists !== false) {
      await this._updateBadgeStatus(tabId, savedData);
      return;
    }

    if (deletionCheck.shouldDelete) {
      await this._handleDeletedNotionPage(tabId, resolvedUrl, savedData);
      return;
    }

    if (deletionCheck.deletionPending) {
      await this._handlePendingNotionDeletion(tabId, savedData);
      return;
    }

    await this._updateBadgeStatus(tabId, savedData);
  }

  /**
   * 連續不存在確認：時間窗內 false/false 才允許清理
   *
   * 預設確認窗口為 5 分鐘（{@link DELETION_CONFIRMATION_WINDOW_MS}）。
   * 在此窗口內，連續兩次 `exists===false` 才觸發刪除，
   * 防止 Notion API 暫時性 false negative 導致誤刪。
   *
   * - 第一次 false: deletionPending=true, shouldDelete=false
   * - 時間窗內第二次連續 false: deletionPending=false, shouldDelete=true
   * - 時間窗外第二次 false: 視為新的第一次
   * - true / null: 清除 pending
   *
   * @param {string|null|undefined} notionPageId
   * @param {boolean|null} exists
   * @returns {{ shouldDelete: boolean, deletionPending: boolean }}
   */
  consumeDeletionConfirmation(notionPageId, exists) {
    const pageId = notionPageId ? String(notionPageId) : null;
    if (!pageId) {
      return { shouldDelete: false, deletionPending: false };
    }

    if (exists !== false) {
      this.deletionPendingPages.delete(pageId);
      return { shouldDelete: false, deletionPending: false };
    }

    const now = Date.now();
    const pendingState = this.deletionPendingPages.get(pageId);

    if (pendingState) {
      const firstFailedAt = pendingState.firstFailedAt || 0;
      const withinConfirmationWindow = now - firstFailedAt <= DELETION_CONFIRMATION_WINDOW_MS;

      if (withinConfirmationWindow) {
        this.deletionPendingPages.delete(pageId);
        return { shouldDelete: true, deletionPending: false };
      }
    }

    // 首次失敗或確認窗口過期：開始新一輪確認週期
    this.deletionPendingPages.set(pageId, {
      firstFailedAt: now,
    });
    return { shouldDelete: false, deletionPending: true };
  }

  /**
   * 標記遠端頁面疑似不存在，並回傳兩階段刪除確認結果。
   *
   * 這是 save/status/highlight sync 共享的 canonical API。
   *
   * @param {string|null|undefined} notionPageId
   * @returns {{ shouldDelete: boolean, deletionPending: boolean }}
   */
  confirmRemotePageMissing(notionPageId) {
    return this.consumeDeletionConfirmation(notionPageId, false);
  }

  /**
   * 重置遠端頁面不存在的 pending 狀態。
   *
   * 用於 exists===true、exists===null 或其他不應延續 pending 的情況。
   *
   * @param {string|null|undefined} notionPageId
   * @returns {{ shouldDelete: boolean, deletionPending: boolean }}
   */
  resetRemotePageMissingState(notionPageId) {
    return this.consumeDeletionConfirmation(notionPageId, null);
  }

  /**
   * 更新徽章顯示
   *
   * @param {number} tabId - 標籤頁 ID
   * @param {object | null} savedData - 已保存數據
   * @private
   */
  async _updateBadgeStatus(tabId, savedData) {
    if (savedData) {
      await chrome.action.setBadgeText({ text: '✓', tabId });
      await chrome.action.setBadgeBackgroundColor({ color: '#48bb78', tabId });
    } else {
      await chrome.action.setBadgeText({ text: '', tabId });
    }
  }

  /**
   * 如有需要 (如別名候選與原本的標準化 URL 不同，且合約中的 lookupOrder 包含 preloadData 缺少的鍵)，則讀取額外的 highlights 存儲鍵。
   *
   * @param {object} contract
   * @param {object} preloadData
   * @param {string|null} aliasCandidate
   * @param {string} normUrl
   * @returns {Promise<object>}
   * @private
   */
  async _loadExtraHighlightKeysIfNeeded(contract, preloadData, aliasCandidate, normUrl) {
    if (!aliasCandidate || aliasCandidate === normUrl) {
      return preloadData;
    }
    const extraKeys = contract.lookupOrder.filter(key => !(key in preloadData));
    if (extraKeys.length === 0) {
      return preloadData;
    }
    const extraData = await chrome.storage.local.get(extraKeys);
    return { ...preloadData, ...extraData };
  }

  async _getHighlightsFromStorage(normUrl) {
    const preloadContract = resolveHighlightLookupKeys(normUrl, null);
    const preloadKeys = [...getAliasLookupKeys(normUrl), ...preloadContract.lookupOrder];
    const preloadData = await chrome.storage.local.get([...new Set(preloadKeys)]);
    const aliasCandidate = pickAliasCandidate(preloadData, normUrl);
    const contract = resolveHighlightLookupKeys(normUrl, aliasCandidate);

    const data = await this._loadExtraHighlightKeysIfNeeded(
      contract,
      preloadData,
      aliasCandidate,
      normUrl
    );

    const { highlights, resolvedKey } = pickHighlightsFromStorage(contract, data);

    const hasHighlights = Array.isArray(highlights) && highlights.length > 0;
    const keyUsed = resolvedKey ?? contract.lookupOrder[0];
    const safeKeyUsed = sanitizeHighlightStorageKeyForLogging(keyUsed);

    this.logger.debug(`[TabService] Checking highlights for ${safeKeyUsed}:`, {
      found: hasHighlights,
      count: hasHighlights ? highlights.length : 0,
    });

    return hasHighlights ? highlights : null;
  }

  /**
   * 建立 Promise 等待標籤頁載入完成，並管理監聽器生命週期
   *
   * @param {number} tabId
   * @returns {Promise<object|null>}
   * @private
   */
  _createTabCompletionWaiter(tabId) {
    return new Promise(resolve => {
      // 定義回調函數
      const onUpdated = (tid, changeInfo) => {
        if (tid === tabId && changeInfo.status === 'complete') {
          cleanup();
          resolve({ status: 'complete' });
        }
      };

      const onRemoved = tid => {
        if (tid === tabId) {
          cleanup();
          resolve(null);
        }
      };

      // 定義清理函數
      const cleanup = () => {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.onRemoved.removeListener(onRemoved);
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        this.pendingListeners.delete(tabId);
      };

      // 註冊監聽器
      this.pendingListeners.set(tabId, { cleanup });
      chrome.tabs.onUpdated.addListener(onUpdated);
      chrome.tabs.onRemoved.addListener(onRemoved);

      // 設定超時
      const timeoutId = setTimeout(() => {
        cleanup();
        this.logger.warn(`[TabService] Tab ${tabId} loading timeout`);
        resolve(null);
      }, TAB_SERVICE.LOADING_TIMEOUT_MS || 10_000);
    });
  }

  /**
   * 內部方法：等待標籤頁編譯/載入完成
   *
   * @param {number} tabId
   * @returns {Promise<object|null>}
   * @private
   */
  async _waitForTabCompilation(tabId) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) {
      return null;
    }

    if (tab.discarded) {
      this.logger.debug(`[TabService] Tab ${tabId} is discarded, skipping injection`);
      return null;
    }

    if (tab.status === 'complete') {
      return tab;
    }

    if (this.pendingListeners.has(tabId)) {
      this.logger.debug(`[TabService] Tab ${tabId} already has pending listener, skipping`);
      return null;
    }

    return this._createTabCompletionWaiter(tabId);
  }

  /**
   * 設置標籤事件監聽器
   */
  setupListeners() {
    // 監聽標籤頁更新
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab?.url) {
        // 添加延遲，確保頁面完全載入
        setTimeout(() => {
          this.updateTabStatus(tabId, tab.url);
        }, TAB_SERVICE.STATUS_UPDATE_DELAY_MS);
      }
    });

    // 監聽標籤頁切換
    chrome.tabs.onActivated.addListener(async activeInfo => {
      try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab?.url) {
          this.updateTabStatus(activeInfo.tabId, tab.url);
        }
      } catch (error) {
        // Tab 可能已被關閉，靜默處理
        this.logger.debug(`[TabService] Failed to get tab ${activeInfo.tabId}:`, { error });
      }
    });
  }

  /**
   * 檢查標籤頁是否為有效的遷移目標
   *
   * @param {object|null} tab
   * @returns {boolean}
   * @private
   */
  _isValidMigrationTarget(tab) {
    return Boolean(tab?.url && !tab.url.startsWith('chrome-error://'));
  }

  /**
   * 持久化已遷移的舊版標註數據，並在標籤頁中注入恢復指令
   *
   * @param {number} tabId
   * @param {string} storageKey
   * @param {any[]} data
   * @returns {Promise<void>}
   * @private
   */
  async _persistMigratedHighlights(tabId, storageKey, data) {
    this.logger.info('[TabService] Migrating legacy highlights', {
      action: 'migrateLegacyHighlights',
      count: data.length,
    });

    await chrome.storage.local.set({ [storageKey]: data });

    this.logger.success('[TabService] Legacy highlights migrated successfully', {
      action: 'injectRestoreScript',
    });
    await this.injectionService.injectHighlightRestore(tabId);
  }

  _logMigrationError(error) {
    const isRecoverable = this.isRecoverableError(error);
    if (isRecoverable) {
      this.logger.warn('[TabService] Migration skipped due to recoverable error:', {
        error: error.message || error,
      });
      return;
    }

    this.logger.error('[TabService] Fatal migration error', { error });
  }

  async _handleMigrationResponse(tabId, storageKey, res) {
    if (hasMigratedHighlightData(res)) {
      await this._persistMigratedHighlights(tabId, storageKey, res.data);
      return;
    }

    if (res?.error) {
      this.logger.warn('[TabService] Migration script reported error:', { error: res.error });
    }
  }

  /**
   * 遷移舊版 localStorage 中的標記到 chrome.storage.local
   *
   * @param {number} tabId - 標籤頁 ID
   * @param {string} normUrl - 標準化後的 URL
   * @param {string} storageKey - 存儲鍵名
   */
  async migrateLegacyHighlights(tabId, normUrl, storageKey) {
    if (!normUrl || !storageKey) {
      this.logger.warn('Skipping legacy migration: missing normalized URL or storage key');
      return;
    }

    if (!/^https?:/i.test(normUrl)) {
      this.logger.warn('Skipping legacy migration for non-http URL:', {
        normUrl: sanitizeUrlForLogging(normUrl),
      });
      return;
    }

    try {
      // 檢查標籤頁是否仍然有效且不是錯誤頁面
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!this._isValidMigrationTarget(tab)) {
        this.logger.info('[TabService] Skipping migration: tab is invalid or showing error page');
        return;
      }

      const res = await this.injectionService.injectWithResponse(
        tabId,
        _migrationScript,
        [],
        [URL_NORMALIZATION.TRACKING_PARAMS]
      );

      // injectWithResponse 已經解包回傳值，直接使用 res
      await this._handleMigrationResponse(tabId, storageKey, res);
    } catch (error) {
      this._logMigrationError(error);
    }
  }
}

/**
 * 此函數將被注入到頁面中執行
 * 必須保持完全獨立，不能依賴外部變數
 *
 * @param {string[]} trackingParams - URL 追蹤參數列表
 * @returns {{migrated: boolean, data?: any[], foundKey?: string, error?: string}}
 */
function _migrationScript(trackingParams) {
  /* eslint-disable unicorn/consistent-function-scoping */
  // 檢測開發環境
  const isDev = chrome?.runtime?.getManifest?.()?.version_name?.includes('dev');

  // 內部輔助函數：結構化日誌
  const log = (level, msg, detail) => {
    if (level === 'error') {
      console.error(`[NotionChrome:Migration] ${msg}`, {
        detail,
        isDev,
        timestamp: new Date().toISOString(),
      });
    }
  };

  // 內部輔助函數：URL 標準化
  const normalize = raw => {
    try {
      const urlObj = new URL(raw);
      urlObj.hash = '';
      const params = trackingParams || [];
      params.forEach(param => urlObj.searchParams.delete(param));
      while (urlObj.pathname.length > 1 && urlObj.pathname.endsWith('/')) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }
      return urlObj.toString();
    } catch {
      return raw || '';
    }
  };

  // 內部輔助函數：獲取當前頁面的 origin
  const getCurrentOrigin = () => {
    try {
      return new URL(globalThis.location.href).origin;
    } catch {
      return null;
    }
  };

  // 內部輔助函數：遍歷 localStorage 尋找後備的 key
  const findLegacyHighlightFallbackKey = currentOrigin => {
    let legacyCandidate = null;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith('highlights_')) {
        continue;
      }

      try {
        const keyUrl = k.replace('highlights_', '');
        const parsedUrlOrigin = new URL(keyUrl).origin;
        if (currentOrigin && parsedUrlOrigin === currentOrigin) {
          return k;
        }
      } catch {
        if (!legacyCandidate) {
          legacyCandidate = k;
        }
      }
    }
    return legacyCandidate;
  };

  // 內部輔助函數：檢查直接匹配的 key
  const getDirectHighlightKey = (currentUrl, norm) => {
    const directKeys = [`highlights_${norm}`, `highlights_${currentUrl}`];
    for (const k of directKeys) {
      if (localStorage.getItem(k)) {
        return k;
      }
    }
    return null;
  };

  // 內部輔助函數：解析遷移的 highlights 數據
  const parseMigratedHighlights = (raw, key, logFn) => {
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data) && data.length > 0) {
        localStorage.removeItem(key);
        return { migrated: true, data, foundKey: key };
      }
    } catch (parseError) {
      logFn('error', 'Parse error', { message: parseError.message });
    }
    return { migrated: false };
  };

  try {
    const currentUrl = globalThis.location.href;
    const norm = normalize(currentUrl);

    const key =
      getDirectHighlightKey(currentUrl, norm) || findLegacyHighlightFallbackKey(getCurrentOrigin());
    if (!key) {
      return { migrated: false };
    }

    const raw = localStorage.getItem(key);
    if (!raw) {
      return { migrated: false };
    }

    return parseMigratedHighlights(raw, key, log);
  } catch (error) {
    const errorInfo = { message: error.message, stack: isDev ? error.stack : undefined };
    log('error', 'Migration error', errorInfo);
    return { migrated: false, error: errorInfo };
  }
}

// 導出
export { TabService, _migrationScript };
