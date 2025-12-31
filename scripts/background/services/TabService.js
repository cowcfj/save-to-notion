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
   * @param {Object} options - 配置選項
   * @param {Object} options.logger - 日誌對象
   * @param {Object} options.injectionService - 注入服務實例
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
   * @param {number} tabId - 標籤頁 ID
   * @param {string} url - 標籤頁 URL
   * @private
   */
  async _updateTabStatusInternal(tabId, url) {
    const normUrl = this.normalizeUrl(url);
    const highlightsKey = `highlights_${normUrl}`;

    try {
      // 1. 獲取本地保存數據
      const savedData = await this.getSavedPageData(normUrl);

      // 2. 檢查是否已保存，更新徽章
      if (savedData) {
        chrome.action.setBadgeText({ text: '✓', tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#48bb78', tabId });
      } else {
        chrome.action.setBadgeText({ text: '', tabId });
      }

      // 3. 檢查是否有標註，注入 Bundle 以自動恢復
      const data = await chrome.storage.local.get([highlightsKey]);
      const storedData = data[highlightsKey];

      // 解析 highlights 格式（支援數組和對象兩種格式）
      // 新版格式: {highlights: [...], url: "..."} 舊版格式: [...]
      const highlights = Array.isArray(storedData) ? storedData : storedData?.highlights;
      const hasHighlights = Array.isArray(highlights) && highlights.length > 0;

      // 調試日誌：確認 storage 查找結果
      this.logger.debug?.(`🔍 [TabService] Checking highlights for ${highlightsKey}:`, {
        found: hasHighlights,
        count: hasHighlights ? highlights.length : 0,
        format: Array.isArray(storedData) ? 'array' : typeof storedData,
      });

      if (hasHighlights) {
        this.logger.debug?.(
          `📦 [TabService] Found ${highlights.length} highlights, preparing to inject bundle...`
        );

        // 確保頁面狀態是 complete 後再注入
        try {
          // 查詢 tab 的最新狀態
          const tab = await chrome.tabs.get(tabId);

          if (!tab) {
            this.logger.warn?.(`[TabService] Tab ${tabId} not found, skipping injection`);
            return;
          }

          // 如果頁面還在載入，等待 complete
          if (tab.status !== 'complete') {
            this.logger.debug?.(`[TabService] Tab ${tabId} status is ${tab.status}, waiting...`);

            // 檢查是否已經有待處理的監聽器，避免重複註冊
            if (this.pendingListeners.has(tabId)) {
              this.logger.debug?.(
                `[TabService] Tab ${tabId} already has pending listener, skipping`
              );
              return;
            }

            // 註冊一次性監聽器，等待頁面 complete
            let timeoutId = null;
            let isCleanedUp = false;

            /**
             * 清理函數（前置聲明，稍後賦值實際邏輯）
             */
            let cleanup = () => {
              /* no-op: 稍後賦值實際邏輯 */
            };

            /**
             * 標籤頁更新監聽器（等待頁面載入完成）
             * @param {number} updatedTabId - 更新的標籤頁 ID
             * @param {Object} changeInfo - 變更信息
             */
            const onUpdated = (updatedTabId, changeInfo) => {
              if (updatedTabId === tabId && changeInfo.status === 'complete') {
                cleanup();
                this.logger.debug?.(`[TabService] Tab ${tabId} now complete, injecting bundle...`);
                // 異步注入，不阻塞當前流程
                this.injectionService
                  .ensureBundleInjected(tabId)
                  .catch(err => this.logger.error?.('[TabService] Delayed injection failed:', err));
              }
            };

            /**
             * 標籤頁關閉監聽器（清理資源）
             * @param {number} removedTabId - 被關閉的標籤頁 ID
             */
            const onRemoved = removedTabId => {
              if (removedTabId === tabId) {
                cleanup();
                this.logger.debug?.(`[TabService] Tab ${tabId} was closed, cleanup listeners`);
              }
            };

            /**
             * 清理函數 - 移除所有監聽器和超時
             */
            cleanup = () => {
              if (isCleanedUp) {
                return;
              }
              isCleanedUp = true;
              chrome.tabs.onUpdated.removeListener(onUpdated);
              chrome.tabs.onRemoved.removeListener(onRemoved);
              if (timeoutId) {
                clearTimeout(timeoutId);
              }
              // 從 Map 中移除
              this.pendingListeners.delete(tabId);
            };

            // 儲存到 Map
            this.pendingListeners.set(tabId, { cleanup, onUpdated, onRemoved });

            // 添加監聽器前再次檢查狀態（防止競態條件）
            const recheckTab = await chrome.tabs.get(tabId).catch(() => null);
            if (recheckTab?.status === 'complete') {
              // Tab 已經完成，清理並直接注入
              cleanup();
              this.logger.debug?.(
                `[TabService] Tab ${tabId} completed before listener registration`
              );
              await this.injectionService
                .ensureBundleInjected(tabId)
                .catch(err =>
                  this.logger.error?.('[TabService] Race condition injection failed:', err)
                );
              return;
            }

            // Tab 仍在載入，註冊監聽器
            chrome.tabs.onUpdated.addListener(onUpdated);
            chrome.tabs.onRemoved.addListener(onRemoved);

            // 10 秒超時保護
            timeoutId = setTimeout(() => {
              cleanup();
              this.logger.warn?.(`[TabService] Tab ${tabId} loading timeout, cleanup listeners`);
            }, TAB_SERVICE.LOADING_TIMEOUT_MS);

            return;
          }

          // 頁面已 complete，直接注入
          this.logger.debug?.(`[TabService] Tab ${tabId} is complete, injecting bundle now...`);
          await this.injectionService.ensureBundleInjected(tabId);
        } catch (injectionError) {
          // 注入失敗不應該阻止整個流程
          this.logger.error?.(
            `[TabService] Failed to inject bundle for tab ${tabId}:`,
            injectionError
          );
        }
      } else {
        // 沒有找到現有標註，執行回調或預設遷移
        const handler = this.onNoHighlightsFound ?? this.migrateLegacyHighlights.bind(this);
        await handler(tabId, normUrl, highlightsKey);
      }
    } catch (error) {
      this.logger.error?.('Error updating tab status:', error);
    }
  }

  /**
   * 設置標籤事件監聽器
   */
  setupListeners() {
    // 監聽標籤頁更新
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab && tab.url) {
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
      if (!tab || !tab.url || tab.url.startsWith('chrome-error://')) {
        this.logger.log('⚠️ Skipping migration: tab is invalid or showing error page');
        return;
      }

      const result = await this.injectionService.injectWithResponse(tabId, () => {
        try {
          /**
           * 標準化 URL（移除追蹤參數和片段）
           * @param {string} raw - 原始 URL
           * @returns {string} 標準化後的 URL
           */
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
              if (urlObj.pathname !== '/' && urlObj.pathname.endsWith('/')) {
                urlObj.pathname = urlObj.pathname.replace(/\/+$/, '');
              }
              return urlObj.toString();
            } catch {
              return raw || '';
            }
          };

          const norm = normalize(window.location.href);
          const k1 = `highlights_${norm}`;
          const k2 = `highlights_${window.location.href}`;
          let key = null;
          let raw = null;

          // 嘗試找到對應的舊版標記數據
          raw = localStorage.getItem(k1);
          if (raw) {
            key = k1;
          } else {
            raw = localStorage.getItem(k2);
            if (raw) {
              key = k2;
            }
          }

          // 如果還是找不到，遍歷所有以 highlights_ 開頭的鍵
          if (!raw) {
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k?.startsWith('highlights_')) {
                key = k;
                raw = localStorage.getItem(k);
                break;
              }
            }
          }

          if (raw) {
            try {
              const data = JSON.parse(raw);
              if (Array.isArray(data) && data.length > 0) {
                localStorage.removeItem(key);
                return { migrated: true, data, foundKey: key };
              }
            } catch (_parseError) {
              // 注入腳本上下文中無法使用外部 Logger
              // 生產環境：不記錄具體錯誤以保護隱私
              // 開發環境：記錄錯誤詳情以便除錯

              const isDev = chrome?.runtime?.getManifest?.()?.version_name?.includes('dev');
              if (isDev) {
                console.error('[InjectedScript:legacyMigration] Parse error:', _parseError);
              } else {
                console.error('[InjectedScript:legacyMigration] Failed to parse highlight data');
              }
            }
          }
        } catch (_migrationError) {
          // 生產環境：不記錄具體錯誤以保護隱私
          // 開發環境：記錄錯誤詳情以便除錯

          const isDev = chrome?.runtime?.getManifest?.()?.version_name?.includes('dev');
          if (isDev) {
            console.error('[InjectedScript:legacyMigration] Migration error:', _migrationError);
          } else {
            console.error('[InjectedScript:legacyMigration] Migration error');
          }
        }
        return { migrated: false };
      });

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

// 導出
export { TabService };

// 向後兼容：掛載到 window（用於非模組環境）
if (typeof window !== 'undefined') {
  window.TabService = TabService;
}
