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

import { TAB_SERVICE, HANDLER_CONSTANTS } from '../../config/app.js';
import { URL_NORMALIZATION } from '../../config/extraction.js';
import { URL_ALIAS_PREFIX } from '../../config/storageKeys.js';
import Logger from '../../utils/Logger.js';
import { resolveStorageUrl, isRootUrl } from '../../utils/urlUtils.js';
import { sanitizeUrlForLogging } from '../../utils/LogSanitizer.js';

const DELETION_CONFIRMATION_WINDOW_MS = 5 * 60 * 1000;

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
    this.logger = options.logger || Logger;
    this.injectionService = options.injectionService;

    // === URL 處理 ===
    this.normalizeUrl = options.normalizeUrl || (url => url);
    this.computeStableUrl = options.computeStableUrl || null;

    // === 存儲查詢 ===
    this.getSavedPageData = options.getSavedPageData || (() => Promise.resolve(null));

    // === 安全檢查 ===
    this.isRestrictedUrl = options.isRestrictedUrl || (() => false);
    this.isRecoverableError = options.isRecoverableError || (() => false);

    // === 回調與狀態 ===
    // 無標註時觸發（可用於遷移或其他邏輯）
    this.onNoHighlightsFound = options.onNoHighlightsFound || null;
    // 追蹤每個 tabId 的待處理監聽器，防止重複註冊
    this.pendingListeners = new Map();
    // 追蹤正在處理中的 tab，防止並發調用
    this.processingTabs = new Map();

    // === 頁面驗證邏輯 (_verifyAndUpdateStatus 使用) ===
    this.checkPageExists = options.checkPageExists || (() => Promise.resolve(null));
    this.getApiKey = options.getApiKey || (() => Promise.resolve(null));
    this.clearPageState = options.clearPageState || (() => Promise.resolve());
    this.clearNotionState = options.clearNotionState || (() => Promise.resolve());
    this.setSavedPageData = options.setSavedPageData || (() => Promise.resolve());

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
    if (!url || !/^https?:/i.test(url) || this.isRestrictedUrl(url)) {
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
    // Notion 自身頁面不需要 Preloader 數據
    let isNotionPage = false;
    try {
      if (url) {
        const { hostname } = new URL(url);
        isNotionPage =
          hostname === 'notion.so' ||
          hostname.endsWith('.notion.so') ||
          hostname === 'notion.com' ||
          hostname.endsWith('.notion.com') ||
          hostname === 'notion.site' ||
          hostname.endsWith('.notion.site');
      }
    } catch {
      // Ignore invalid URLs
    }

    const preloaderData = isNotionPage ? null : await this.getPreloaderData(tabId);
    const stableUrl = resolveStorageUrl(url, preloaderData);
    const originalUrl = this.normalizeUrl(url);
    const hasStableUrl = stableUrl !== originalUrl;

    // 記錄 URL 解析決策，便於日後分析重複標注等問題
    let phase;
    if (!preloaderData) {
      phase = 'fallback';
    } else if (preloaderData.nextRouteInfo) {
      phase = '2a(nextjs)';
    } else if (preloaderData.shortlink) {
      phase = '2a+(shortlink)';
    } else {
      phase = 'fallback';
    }
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
    if (hasStableUrl && isRootUrl(stableUrl)) {
      this.logger.warn('[TabService] Blocked root URL as stableUrl, falling back to originalUrl', {
        rejected: sanitizeUrlForLogging(stableUrl),
        fallback: sanitizeUrlForLogging(originalUrl),
      });
      return { stableUrl: originalUrl, originalUrl, hasStableUrl: false, migrated: false };
    }

    if (hasStableUrl && migrationService) {
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

  /**
   * 內部方法：實際的狀態更新邏輯
   *
   * @param {number} tabId - 標籤頁 ID
   * @param {string} url - 標籤頁 URL
   * @private
   */
  async _updateTabStatusInternal(tabId, url) {
    // 按優先級計算穩定 URL（包含 Phase 1, Phase 2a/2a+, fallback）
    const { stableUrl: normUrl, originalUrl, hasStableUrl } = await this.resolveTabUrl(tabId, url);

    try {
      // 1. 更新徽章狀態（雙查：若有穩定 URL，同時檢查原始 URL）
      await this._verifyAndUpdateStatus(tabId, normUrl, hasStableUrl ? originalUrl : null);

      // 2. 處理標註注入（雙查：穩定 URL 優先，回退到原始 URL）
      let highlights = await this._getHighlightsFromStorage(normUrl);
      if (!highlights && hasStableUrl) {
        // 回退查詢：嘗試原始 URL（向後兼容）
        highlights = await this._getHighlightsFromStorage(originalUrl);

        // 建立 url_alias 連結：避免 shortlink 與原網址各自產生獨立的 storage key
        if (highlights) {
          const aliasKey = `${URL_ALIAS_PREFIX}${originalUrl}`;
          chrome.storage.local.set({ [aliasKey]: normUrl }).catch(() => {});
          this.logger.debug('[TabService] Created url_alias for fallback URL', {
            from: sanitizeUrlForLogging(originalUrl),
            to: sanitizeUrlForLogging(normUrl),
          });
        }
      }

      if (!highlights) {
        // 沒有找到現有標註，執行回調或預設遷移
        const handler = this.onNoHighlightsFound ?? this.migrateLegacyHighlights.bind(this);
        await handler(tabId, normUrl, `highlights_${normUrl}`);
        return;
      }

      this.logger.debug(
        `[TabService] Found ${highlights.length} highlights, preparing to inject bundle...`
      );
      const tab = await this._waitForTabCompilation(tabId);
      if (tab) {
        this.logger.debug(`[TabService] Tab ${tabId} is complete, injecting bundle now...`);
        await this.injectionService.ensureBundleInjected(tabId);
        this._sendStableUrl(tabId, normUrl);
      }
    } catch (error) {
      if (!this.logger.error) {
        return;
      }
      // Avoid logging recoverable errors as true errors to reduce noise
      if (
        error.message?.includes('The tab was closed') ||
        error.message?.includes('No tab with id')
      ) {
        this.logger.debug(`[TabService] Tab closed/missing during update: ${error.message}`);
      } else {
        const errorMsg = error.message || String(error);
        this.logger.error(`[TabService] Error updating tab status: ${errorMsg}`, { error });
      }
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
        .sendMessage(tabId, { action: 'SET_STABLE_URL', stableUrl: normUrl })
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
        chrome.tabs.sendMessage(tabId, { action: 'PING' }, result => {
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
   * 驗證並更新頁面狀態（含自動聯網檢查）
   *
   * @param {number} tabId - 標籤頁 ID
   * @param {string} normUrl - 標準化後的 URL（可能是穩定 URL）
   * @param {string|null} fallbackUrl - 回退 URL（原始 URL，用於向後兼容）
   * @private
   */
  async _verifyAndUpdateStatus(tabId, normUrl, fallbackUrl = null) {
    let savedData = await this.getSavedPageData(normUrl);
    let resolvedUrl = normUrl;

    // 雙查：若穩定 URL 未找到，嘗試原始 URL（向後兼容）
    if (!savedData && fallbackUrl && fallbackUrl !== normUrl) {
      savedData = await this.getSavedPageData(fallbackUrl);
      if (savedData) {
        resolvedUrl = fallbackUrl;
      }
    }

    if (!savedData) {
      await this._updateBadgeStatus(tabId, null);
      return;
    }

    // 檢查快取是否過期 (TTL)
    const now = Date.now();
    const lastVerifiedAt = savedData.lastVerifiedAt || 0;
    const ttl = HANDLER_CONSTANTS.PAGE_STATUS_CACHE_TTL || 60_000;

    if (now - lastVerifiedAt < ttl) {
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

      const exists = await this.checkPageExists(savedData.notionPageId, apiKey);
      const deletionCheck = this.consumeDeletionConfirmation(savedData.notionPageId, exists);

      if (exists === false && deletionCheck.shouldDelete) {
        this.logger.log('頁面已在 Notion 中刪除，自動清理本地狀態', {
          action: 'autoSyncLocalState',
          pageId: savedData.notionPageId?.slice(0, 4),
        });
        // 使用實際查到 savedData 的 URL 來清除，確保讀寫一致
        await this.clearNotionState(resolvedUrl);
        await this._updateBadgeStatus(tabId, null);
      } else if (exists === false && deletionCheck.deletionPending) {
        this.logger.warn('[TabService] First deletion check failed, mark as pending', {
          pageId: savedData.notionPageId?.slice(0, 4),
          action: 'autoSyncLocalState',
        });
        await this._updateBadgeStatus(tabId, savedData);
      } else if (exists === true) {
        const updatedData = { ...savedData, lastVerifiedAt: now };
        await this.setSavedPageData(normUrl, updatedData);
        await this._updateBadgeStatus(tabId, updatedData);
      } else {
        await this._updateBadgeStatus(tabId, savedData);
      }
    } catch (error) {
      this.logger.warn('[TabService] 自動驗證失敗，跳過並保留當前狀態', { error });
      await this._updateBadgeStatus(tabId, savedData);
    }
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

  async _getHighlightsFromStorage(normUrl) {
    const hlKey = `highlights_${normUrl}`;
    const pageKey = `page_${normUrl}`;
    // 刻意繞過 StorageService：呼叫方 resolveTabUrl 已在上游將 URL 解析為正確的 stableUrl，
    // 此處查詢的已是最終 canonical key，不需要再走 alias 解析和鎖機制，可減少不必要的開銷。
    // 雙查機制（stableUrl → originalUrl）由 _updateTabStatusInternal 負責。
    const data = await chrome.storage.local.get([hlKey, pageKey]);

    // 確定來源：優先 page_* 新格式，再查 highlights_* 舊格式
    const storedData = data[pageKey] || data[hlKey];
    const highlights = Array.isArray(storedData) ? storedData : storedData?.highlights;

    const hasHighlights = Array.isArray(highlights) && highlights.length > 0;

    const keyUsed = data[pageKey] ? pageKey : hlKey;
    this.logger.debug(`[TabService] Checking highlights for ${keyUsed}:`, {
      found: hasHighlights,
      count: hasHighlights ? highlights.length : 0,
    });

    return hasHighlights ? highlights : null;
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
      if (!tab?.url || tab.url.startsWith('chrome-error://')) {
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
      if (res?.migrated && Array.isArray(res.data) && res.data.length > 0) {
        // 不記錄 foundKey 以保護用戶 URL 隱私
        this.logger.info('[TabService] Migrating legacy highlights', {
          action: 'migrateLegacyHighlights',
          count: res.data.length,
        });

        await chrome.storage.local.set({ [storageKey]: res.data });

        this.logger.success('[TabService] Legacy highlights migrated successfully', {
          action: 'injectRestoreScript',
        });
        await this.injectionService.injectHighlightRestore(tabId);
      } else if (res?.error) {
        // 記錄注入端的結構化錯誤
        this.logger.warn('[TabService] Migration script reported error:', { error: res.error });
      }
    } catch (error) {
      const isRecoverable = this.isRecoverableError(error);
      if (isRecoverable) {
        this.logger.warn('[TabService] Migration skipped due to recoverable error:', {
          error: error.message || error,
        });
      } else {
        this.logger.error('[TabService] Fatal migration error', { error });
      }
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
  // eslint-disable-next-line unicorn/consistent-function-scoping
  const getCurrentOrigin = () => {
    try {
      return new URL(globalThis.location.href).origin;
    } catch {
      return null;
    }
  };

  // 內部輔助函數：遍歷 localStorage 尋找後備的 key
  // eslint-disable-next-line unicorn/consistent-function-scoping
  const findFallbackKey = currentOrigin => {
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
        // 若 origin 不匹配或當前 origin 不存在，繼續找下一個
      } catch {
        // URL 解析失敗（舊版非 URL 格式的 key），記錄第一個作為後備候選
        if (!legacyCandidate) {
          legacyCandidate = k;
        }
      }
    }
    return legacyCandidate;
  };

  // 內部輔助函數：查找存儲鍵
  const findKey = () => {
    const currentUrl = globalThis.location.href;
    const norm = normalize(currentUrl);

    // 優先檢查標準化 URL 和原始 URL 對應的鍵
    const directKeys = [`highlights_${norm}`, `highlights_${currentUrl}`];
    for (const k of directKeys) {
      if (localStorage.getItem(k)) {
        return k;
      }
    }

    // 後備方案：遍歷查找 highlights_ 開頭的鍵（僅當前者未找到時）
    // 優先序：
    //   1) 同 origin 且可解析的 key（避免跨頁面誤遷移）
    //   2) 首個不可解析的 legacy key（向後兼容）
    //   3) 無可用 key 時返回 null
    return findFallbackKey(getCurrentOrigin());
  };

  try {
    const key = findKey();
    if (!key) {
      return { migrated: false };
    }

    const raw = localStorage.getItem(key);
    if (!raw) {
      return { migrated: false };
    }

    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data) && data.length > 0) {
        localStorage.removeItem(key);
        return { migrated: true, data, foundKey: key };
      }
    } catch (parseError) {
      log('error', 'Parse error', { message: parseError.message });
    }

    return { migrated: false };
  } catch (error) {
    const errorInfo = { message: error.message, stack: isDev ? error.stack : undefined };
    log('error', 'Migration error', errorInfo);
    return { migrated: false, error: errorInfo };
  }
}

// 導出
export { TabService, _migrationScript };
