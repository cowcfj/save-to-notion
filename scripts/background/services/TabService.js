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
   */
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.injectionService = options.injectionService;
    this.normalizeUrl = options.normalizeUrl || (url => url);
    this.getSavedPageData = options.getSavedPageData || (() => Promise.resolve(null));
    this.isRestrictedUrl = options.isRestrictedUrl || (() => false);
    this.isRecoverableError = options.isRecoverableError || (() => false);
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

    const normUrl = this.normalizeUrl(url);
    const highlightsKey = `highlights_${normUrl}`;

    try {
      // 1. 檢查是否已保存，更新徽章
      const savedData = await this.getSavedPageData(normUrl);
      if (savedData) {
        chrome.action.setBadgeText({ text: '✓', tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#48bb78', tabId });
      } else {
        chrome.action.setBadgeText({ text: '', tabId });
      }

      // 2. 檢查是否有標註，注入高亮腳本
      const data = await new Promise(resolve => chrome.storage.local.get([highlightsKey], resolve));
      const highlights = data[highlightsKey];

      if (Array.isArray(highlights) && highlights.length > 0) {
        if (this.logger.debug) {
          this.logger.debug(
            `Found ${highlights.length} highlights for ${normUrl}, ensuring highlighter is initialized`
          );
        }
        await this.injectionService.injectHighlighter(tabId);
      } else {
        // 沒有找到現有標註，若曾有遷移資料則恢復一次後清理
        await this.migrateLegacyHighlights(tabId, normUrl, highlightsKey);
      }
    } catch (error) {
      console.error('Error updating tab status:', error);
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
        }, 1000);
      }
    });

    // 監聽標籤頁切換
    chrome.tabs.onActivated.addListener(activeInfo => {
      chrome.tabs.get(activeInfo.tabId, tab => {
        if (tab?.url) {
          this.updateTabStatus(activeInfo.tabId, tab.url);
        }
      });
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
      console.warn('Skipping legacy migration: missing normalized URL or storage key');
      return;
    }

    if (!/^https?:/i.test(normUrl)) {
      console.warn('Skipping legacy migration for non-http URL:', normUrl);
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
            } catch (error) {
              console.error('Failed to parse legacy highlight data:', error);
            }
          }
        } catch (error) {
          console.error('Error during migration:', error);
        }
        return { migrated: false };
      });

      const res = result?.[0] ? result[0].result : null;
      if (res?.migrated && Array.isArray(res.data) && res.data.length > 0) {
        this.logger.log(
          `Migrating ${res.data.length} highlights from localStorage key: ${res.foundKey}`
        );

        await new Promise(resolve => {
          chrome.storage.local.set({ [storageKey]: res.data }, resolve);
        });

        this.logger.log('Legacy highlights migrated successfully, injecting restore script');
        await this.injectionService.injectHighlightRestore(tabId);
      }
    } catch (error) {
      // 檢查是否為可恢復的注入錯誤（如錯誤頁面、標籤已關閉等）
      const errorMessage = error?.message || String(error);
      if (this.isRecoverableError(errorMessage)) {
        this.logger.log('⚠️ Migration skipped due to recoverable error:', errorMessage);
      } else {
        console.error('❌ Error handling migration results:', error);
      }
    }
  }
}

// 導出
export { TabService };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TabService };
}
