/**
 * StorageService - 存儲操作封裝
 *
 * 職責：封裝 chrome.storage 操作，提供統一的異步接口
 * - 頁面保存狀態管理
 * - 配置讀取
 * - URL 標準化
 *
 * @module services/StorageService
 */

/**
 * URL 標準化相關常量
 */
const URL_TRACKING_PARAMS = [
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

/**
 * 標準化 URL，用於生成一致的存儲鍵
 * @param {string} rawUrl - 原始 URL
 * @returns {string} 標準化後的 URL
 */
function normalizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return rawUrl || '';
  }

  // 相對 URL 直接返回
  if (!rawUrl.includes('://')) {
    return rawUrl;
  }

  try {
    const urlObj = new URL(rawUrl);
    urlObj.hash = '';

    // 移除追蹤參數
    URL_TRACKING_PARAMS.forEach(param => urlObj.searchParams.delete(param));

    // 標準化尾部斜線
    if (urlObj.pathname !== '/' && urlObj.pathname.endsWith('/')) {
      urlObj.pathname = urlObj.pathname.replace(/\/+$/, '');
    }

    return urlObj.toString();
  } catch {
    return rawUrl || '';
  }
}

/**
 * StorageService 類
 */
class StorageService {
  /**
   * @param {Object} options - 配置選項
   * @param {Object} options.chromeStorage - chrome.storage 對象（用於測試注入）
   * @param {Object} options.logger - 日誌對象
   */
  constructor(options = {}) {
    this.storage = options.chromeStorage || (typeof chrome !== 'undefined' ? chrome.storage : null);
    this.logger = options.logger || console;
  }

  /**
   * 獲取頁面保存狀態
   * @param {string} pageUrl - 頁面 URL
   * @returns {Promise<Object|null>}
   */
  async getSavedPageData(pageUrl) {
    if (!this.storage) {
      throw new Error('Chrome storage not available');
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const key = `saved_${normalizedUrl}`;

    return new Promise(resolve => {
      this.storage.local.get([key], result => {
        resolve(result[key] || null);
      });
    });
  }

  /**
   * 設置頁面保存狀態
   * @param {string} pageUrl - 頁面 URL
   * @param {Object} data - 保存數據
   * @returns {Promise<void>}
   */
  async setSavedPageData(pageUrl, data) {
    if (!this.storage) {
      throw new Error('Chrome storage not available');
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const key = `saved_${normalizedUrl}`;

    return new Promise(resolve => {
      this.storage.local.set(
        {
          [key]: {
            ...data,
            lastUpdated: Date.now(),
          },
        },
        resolve
      );
    });
  }

  /**
   * 清除頁面狀態
   * @param {string} pageUrl - 頁面 URL
   * @returns {Promise<void>}
   */
  async clearPageState(pageUrl) {
    if (!this.storage) {
      throw new Error('Chrome storage not available');
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const savedKey = `saved_${normalizedUrl}`;
    const highlightsKey = `highlights_${normalizedUrl}`;

    return new Promise(resolve => {
      this.storage.local.remove([savedKey, highlightsKey], () => {
        this.logger.log?.('✅ Cleared all data for:', normalizedUrl);
        resolve();
      });
    });
  }

  /**
   * 獲取配置（從 sync storage）
   * @param {string[]} keys - 要獲取的配置鍵
   * @returns {Promise<Object>}
   */
  async getConfig(keys) {
    if (!this.storage) {
      throw new Error('Chrome storage not available');
    }

    return new Promise(resolve => {
      this.storage.sync.get(keys, resolve);
    });
  }

  /**
   * 設置配置（到 sync storage）
   * @param {Object} config - 配置對象
   * @returns {Promise<void>}
   */
  async setConfig(config) {
    if (!this.storage) {
      throw new Error('Chrome storage not available');
    }

    return new Promise(resolve => {
      this.storage.sync.set(config, resolve);
    });
  }

  /**
   * 獲取標註數據
   * @param {string} pageUrl - 頁面 URL
   * @returns {Promise<Array>}
   */
  async getHighlights(pageUrl) {
    if (!this.storage) {
      throw new Error('Chrome storage not available');
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const key = `highlights_${normalizedUrl}`;

    return new Promise(resolve => {
      this.storage.local.get([key], result => {
        resolve(result[key] || []);
      });
    });
  }

  /**
   * 設置標註數據
   * @param {string} pageUrl - 頁面 URL
   * @param {Array} highlights - 標註數組
   * @returns {Promise<void>}
   */
  async setHighlights(pageUrl, highlights) {
    if (!this.storage) {
      throw new Error('Chrome storage not available');
    }

    const normalizedUrl = normalizeUrl(pageUrl);
    const key = `highlights_${normalizedUrl}`;

    return new Promise(resolve => {
      this.storage.local.set({ [key]: highlights }, resolve);
    });
  }

  /**
   * 獲取所有已保存頁面的 URL
   * @returns {Promise<string[]>}
   */
  async getAllSavedPageUrls() {
    if (!this.storage) {
      throw new Error('Chrome storage not available');
    }

    return new Promise(resolve => {
      this.storage.local.get(null, result => {
        const urls = Object.keys(result)
          .filter(key => key.startsWith('saved_'))
          .map(key => key.replace('saved_', ''));
        resolve(urls);
      });
    });
  }
}

// 導出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StorageService, normalizeUrl, URL_TRACKING_PARAMS };
} else if (typeof window !== 'undefined') {
  window.StorageService = StorageService;
  window.normalizeUrl = normalizeUrl;
}
