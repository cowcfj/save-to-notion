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

import { TAB_SERVICE } from '../../config/constants.js';

/**
 * TabService 類
 */
class TabService {
  /**
   * @param {object} options - 配置選項
   * @param {object} options.logger - 日誌對象
   * @param {object} options.injectionService - 注入服務實例
   * @param {Function} options.normalizeUrl - URL 標準化函數
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
    this.logger = options.logger || console;
    this.injectionService = options.injectionService;
    this.normalizeUrl = options.normalizeUrl || (url => url);
    this.getSavedPageData = options.getSavedPageData || (() => Promise.resolve(null));
    this.isRestrictedUrl = options.isRestrictedUrl || (() => false);
    this.isRecoverableError = options.isRecoverableError || (() => false);
    // 回調：無標註時觸發（可用於遷移或其他邏輯）
    this.onNoHighlightsFound = options.onNoHighlightsFound || null;
    // 追蹤每個 tabId 的待處理監聽器，防止重複註冊
    this.pendingListeners = new Map();
    // 追蹤正在處理中的 tab，防止並發調用
    this.processingTabs = new Map();
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
      this.logger.debug?.(`[TabService] Tab ${tabId} is already being processed, skipping`);
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
   * 內部方法：實際的狀態更新邏輯
   *
   * @param {number} tabId - 標籤頁 ID
   * @param {string} url - 標籤頁 URL
   * @private
   */
  async _updateTabStatusInternal(tabId, url) {
    const normUrl = this.normalizeUrl(url);

    try {
      await this._updateBadgeStatus(tabId, normUrl);

      const highlights = await this._getHighlightsFromStorage(normUrl);
      if (!highlights) {
        // 沒有找到現有標註，執行回調或預設遷移
        const handler = this.onNoHighlightsFound ?? this.migrateLegacyHighlights.bind(this);
        await handler(tabId, normUrl, `highlights_${normUrl}`);
        return;
      }

      this.logger.debug?.(
        `📦 [TabService] Found ${highlights.length} highlights, preparing to inject bundle...`
      );

      const tab = await this._waitForTabCompilation(tabId);
      if (tab) {
        this.logger.debug?.(`[TabService] Tab ${tabId} is complete, injecting bundle now...`);
        await this.injectionService.ensureBundleInjected(tabId);
      }
    } catch (error) {
      if (!this.logger.error) {
        return;
      }
      // Avoid logging recoverable errors as true errors to reduce noise
      if (this.injectionService && error.message?.includes('The tab was closed')) {
        this.logger.debug?.(`[TabService] Tab closed during update: ${error.message}`);
      } else {
        this.logger.error('[TabService] Error updating tab status:', error);
      }
    }
  }

  async _updateBadgeStatus(tabId, normUrl) {
    const savedData = await this.getSavedPageData(normUrl);
    if (savedData) {
      await chrome.action.setBadgeText({ text: '✓', tabId });
      await chrome.action.setBadgeBackgroundColor({ color: '#48bb78', tabId });
    } else {
      await chrome.action.setBadgeText({ text: '', tabId });
    }
  }

  async _getHighlightsFromStorage(normUrl) {
    const key = `highlights_${normUrl}`;
    const data = await chrome.storage.local.get([key]);
    const storedData = data[key];
    const highlights = Array.isArray(storedData) ? storedData : storedData?.highlights;

    const hasHighlights = Array.isArray(highlights) && highlights.length > 0;

    this.logger.debug?.(`🔍 [TabService] Checking highlights for ${key}:`, {
      found: hasHighlights,
      count: hasHighlights ? highlights.length : 0,
    });

    return hasHighlights ? highlights : null;
  }

  async _waitForTabCompilation(tabId) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) {
      return null;
    }

    if (tab.status === 'complete') {
      return tab;
    }

    if (this.pendingListeners.has(tabId)) {
      this.logger.debug?.(`[TabService] Tab ${tabId} already has pending listener, skipping`);
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
        this.logger.warn?.(`[TabService] Tab ${tabId} loading timeout`);
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
        this.logger.debug?.(`[TabService] Failed to get tab ${activeInfo.tabId}:`, error);
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
      this.logger.warn?.('Skipping legacy migration: missing normalized URL or storage key');
      return;
    }

    if (!/^https?:/i.test(normUrl)) {
      this.logger.warn?.('Skipping legacy migration for non-http URL:', normUrl);
      return;
    }

    try {
      // 檢查標籤頁是否仍然有效且不是錯誤頁面
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab?.url || tab.url.startsWith('chrome-error://')) {
        this.logger.log('⚠️ Skipping migration: tab is invalid or showing error page');
        return;
      }

      const result = await this.injectionService.injectWithResponse(tabId, _migrationScript);

      // injectWithResponse 已經解包回傳值，直接使用 result
      const res = result;
      if (res?.migrated && Array.isArray(res.data) && res.data.length > 0) {
        // 不記錄 foundKey 以保護用戶 URL 隱私
        this.logger.log(`Migrating ${res.data.length} legacy highlights`);

        await chrome.storage.local.set({ [storageKey]: res.data });

        this.logger.log('Legacy highlights migrated successfully, injecting restore script');
        await this.injectionService.injectHighlightRestore(tabId);
      }
    } catch (error) {
      // 檢查是否為可恢復的注入錯誤（如錯誤頁面、標籤已關閉等）
      const errorMessage = error?.message || String(error);
      if (this.isRecoverableError(errorMessage)) {
        this.logger.log('⚠️ Migration skipped due to recoverable error:', errorMessage);
      } else {
        this.logger.error?.('❌ Error handling migration results:', error);
      }
    }
  }
}

/**
 * 此函數將被注入到頁面中執行
 * 必須保持完全獨立，不能依賴外部變數
 *
 * @returns {{migrated: boolean, data?: any[], foundKey?: string, error?: string}}
 */
function _migrationScript() {
  // 檢測開發環境
  const isDev = chrome?.runtime?.getManifest?.()?.version_name?.includes('dev');

  // 內部輔助函數：日誌
  const logError = (msg, err) => {
    if (isDev) {
      console.error(`[InjectedScript:legacyMigration] ${msg}:`, err);
    } else {
      console.error(`[InjectedScript:legacyMigration] ${msg}`);
    }
  };

  // 內部輔助函數：URL 標準化
  // eslint-disable-next-line unicorn/consistent-function-scoping
  const normalize = raw => {
    try {
      const urlObj = new URL(raw);
      urlObj.hash = '';
      const params = [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
        'gclid',
        'fbclid',
        'mc_cid',
        'mc_eid',
        'igshid',
        'vero_id',
      ];
      params.forEach(param => urlObj.searchParams.delete(param));
      while (urlObj.pathname.length > 1 && urlObj.pathname.endsWith('/')) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }
      return urlObj.toString();
    } catch {
      return raw || '';
    }
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
    // 注意：這可能會找到不相關的其他頁面數據，但在舊版邏輯中也是如此
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('highlights_')) {
        return k;
      }
    }
    return null;
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
      logError('Parse error', parseError);
    }

    return { migrated: false };
  } catch (error) {
    logError('Migration error', error);
    return { migrated: false };
  }
}

// 導出
export { TabService };
