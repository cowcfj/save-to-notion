/**
 * NotionService - Notion API 交互服務
 *
 * 職責：封裝所有與 Notion API 的交互，包括：
 * - 請求重試機制（處理 5xx/429/409 錯誤）
 * - 區塊批次處理（每批 100 個）
 * - 速率限制（350ms 間隔）
 *
 * @module services/NotionService
 */

// 嘗試從集中式常量模組導入，測試環境中使用默認值
const NOTION_API_CONSTANTS = (() => {
  // ES Module 環境（瀏覽器）
  if (typeof window !== 'undefined' && window.NOTION_API) {
    return window.NOTION_API;
  }
  // 預設值（用於 Node.js 測試環境或常量未加載時）
  return {
    VERSION: '2025-09-03',
    BASE_URL: 'https://api.notion.com/v1',
    BLOCKS_PER_BATCH: 100,
    DELAY_BETWEEN_BATCHES: 350,
    MAX_RETRIES: 3,
    BASE_RETRY_DELAY: 800,
  };
})();

// 使用統一常量構建配置
const NOTION_CONFIG = {
  API_VERSION: NOTION_API_CONSTANTS.VERSION,
  BASE_URL: NOTION_API_CONSTANTS.BASE_URL,
  BLOCKS_PER_BATCH: NOTION_API_CONSTANTS.BLOCKS_PER_BATCH,
  DELAY_BETWEEN_BATCHES: NOTION_API_CONSTANTS.DELAY_BETWEEN_BATCHES,
  DEFAULT_MAX_RETRIES: NOTION_API_CONSTANTS.MAX_RETRIES || 2,
  DEFAULT_BASE_DELAY: NOTION_API_CONSTANTS.BASE_RETRY_DELAY || 600,
};

/**
 * 帶重試的 fetch 請求（處理暫時性錯誤）
 * @param {string} url - 請求 URL
 * @param {Object} options - fetch 選項
 * @param {Object} retryOptions - 重試配置
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options, retryOptions = {}) {
  const {
    maxRetries = NOTION_CONFIG.DEFAULT_MAX_RETRIES,
    baseDelay = NOTION_CONFIG.DEFAULT_BASE_DELAY,
  } = retryOptions;

  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    try {
      const res = await fetch(url, options);

      if (res.ok) {
        return res;
      }

      // 嘗試解析錯誤訊息
      let message = '';
      try {
        const data = await res.clone().json();
        message = data?.message || '';
      } catch {
        /* ignore parse errors */
      }

      const retriableStatus = res.status >= 500 || res.status === 429 || res.status === 409;
      const retriableMessage = /Unsaved transactions|DatastoreInfraError/i.test(message);

      if (attempt < maxRetries && (retriableStatus || retriableMessage)) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
        continue;
      }

      // 非可重試錯誤或已達最大重試次數
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
        continue;
      }
      throw err;
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error('fetchWithRetry failed unexpectedly');
}

/**
 * NotionService 類
 * 封裝 Notion API 操作
 */
class NotionService {
  /**
   * @param {Object} options - 配置選項
   * @param {string} options.apiKey - Notion API Key
   * @param {Object} options.logger - 日誌對象
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey || null;
    this.logger = options.logger || console;
    this.config = { ...NOTION_CONFIG, ...options.config };
  }

  /**
   * 設置 API Key
   * @param {string} apiKey
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  /**
   * 獲取通用請求頭
   * @returns {Object}
   * @private
   */
  _getHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': this.config.API_VERSION,
    };
  }

  /**
   * 檢查頁面是否存在
   * @param {string} pageId - Notion 頁面 ID
   * @returns {Promise<boolean|null>} true=存在, false=不存在, null=不確定
   */
  async checkPageExists(pageId) {
    if (!this.apiKey) {
      throw new Error('API Key not configured');
    }

    try {
      const response = await fetchWithRetry(
        `${this.config.BASE_URL}/pages/${pageId}`,
        {
          method: 'GET',
          headers: this._getHeaders(),
        },
        { maxRetries: 2, baseDelay: 500 }
      );

      if (response.ok) {
        const pageData = await response.json();
        return !pageData.archived;
      }

      if (response.status === 404) {
        return false;
      }

      // 其他情況返回不確定
      return null;
    } catch (error) {
      this.logger.error?.('Error checking page existence:', error);
      return null;
    }
  }

  /**
   * 分批添加區塊到頁面
   * @param {string} pageId - Notion 頁面 ID
   * @param {Array} blocks - 區塊數組
   * @param {number} startIndex - 開始索引
   * @returns {Promise<{success: boolean, addedCount: number, totalCount: number, error?: string}>}
   */
  async appendBlocksInBatches(pageId, blocks, startIndex = 0) {
    if (!this.apiKey) {
      throw new Error('API Key not configured');
    }

    const { BLOCKS_PER_BATCH, DELAY_BETWEEN_BATCHES } = this.config;
    let addedCount = 0;
    const totalBlocks = blocks.length - startIndex;

    if (totalBlocks <= 0) {
      return { success: true, addedCount: 0, totalCount: 0 };
    }

    this.logger.log?.(`📦 準備分批添加區塊: 總共 ${totalBlocks} 個，從索引 ${startIndex} 開始`);

    try {
      for (let i = startIndex; i < blocks.length; i += BLOCKS_PER_BATCH) {
        const batch = blocks.slice(i, i + BLOCKS_PER_BATCH);
        const batchNumber = Math.floor((i - startIndex) / BLOCKS_PER_BATCH) + 1;
        const totalBatches = Math.ceil(totalBlocks / BLOCKS_PER_BATCH);

        this.logger.log?.(`📤 發送批次 ${batchNumber}/${totalBatches}: ${batch.length} 個區塊`);

        const response = await fetchWithRetry(
          `${this.config.BASE_URL}/blocks/${pageId}/children`,
          {
            method: 'PATCH',
            headers: this._getHeaders(),
            body: JSON.stringify({ children: batch }),
          },
          { maxRetries: 3, baseDelay: 800 }
        );

        if (!response.ok) {
          const errorText = await response.text();
          this.logger.error?.(`❌ 批次 ${batchNumber} 失敗:`, errorText);
          throw new Error(`批次添加失敗: ${response.status} - ${errorText}`);
        }

        addedCount += batch.length;
        this.logger.log?.(
          `✅ 批次 ${batchNumber} 成功: 已添加 ${addedCount}/${totalBlocks} 個區塊`
        );

        // 添加延遲以遵守速率限制
        if (i + BLOCKS_PER_BATCH < blocks.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      }

      this.logger.log?.(`🎉 所有區塊添加完成: ${addedCount}/${totalBlocks}`);
      return { success: true, addedCount, totalCount: totalBlocks };
    } catch (error) {
      this.logger.error?.('❌ 分批添加區塊失敗:', error);
      return { success: false, addedCount, totalCount: totalBlocks, error: error.message };
    }
  }

  /**
   * 創建新頁面
   * @param {Object} pageData - 頁面數據
   * @returns {Promise<{success: boolean, pageId?: string, url?: string, error?: string}>}
   */
  async createPage(pageData) {
    if (!this.apiKey) {
      throw new Error('API Key not configured');
    }

    try {
      const response = await fetchWithRetry(
        `${this.config.BASE_URL}/pages`,
        {
          method: 'POST',
          headers: this._getHeaders(),
          body: JSON.stringify(pageData),
        },
        { maxRetries: 2, baseDelay: 600 }
      );

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          pageId: data.id,
          url: data.url,
        };
      }

      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || `API Error: ${response.status}`,
      };
    } catch (error) {
      this.logger.error?.('❌ 創建頁面失敗:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 更新頁面標題
   * @param {string} pageId - 頁面 ID
   * @param {string} title - 新標題
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async updatePageTitle(pageId, title) {
    if (!this.apiKey) {
      throw new Error('API Key not configured');
    }

    try {
      const response = await fetchWithRetry(
        `${this.config.BASE_URL}/pages/${pageId}`,
        {
          method: 'PATCH',
          headers: this._getHeaders(),
          body: JSON.stringify({
            properties: {
              title: {
                title: [{ type: 'text', text: { content: title } }],
              },
            },
          }),
        },
        { maxRetries: 2, baseDelay: 600 }
      );

      return { success: response.ok };
    } catch (error) {
      this.logger.error?.('❌ 更新標題失敗:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 刪除頁面所有區塊
   * @param {string} pageId - 頁面 ID
   * @returns {Promise<{success: boolean, deletedCount: number, error?: string}>}
   */
  async deleteAllBlocks(pageId) {
    if (!this.apiKey) {
      throw new Error('API Key not configured');
    }

    try {
      // 獲取現有區塊
      const listResponse = await fetchWithRetry(
        `${this.config.BASE_URL}/blocks/${pageId}/children?page_size=100`,
        {
          method: 'GET',
          headers: this._getHeaders(),
        },
        { maxRetries: 2, baseDelay: 500 }
      );

      if (!listResponse.ok) {
        return { success: false, deletedCount: 0, error: 'Failed to list blocks' };
      }

      const data = await listResponse.json();
      const blocks = data.results || [];

      if (blocks.length === 0) {
        return { success: true, deletedCount: 0 };
      }

      // 逐個刪除區塊
      let deletedCount = 0;
      for (const block of blocks) {
        try {
          await fetchWithRetry(
            `${this.config.BASE_URL}/blocks/${block.id}`,
            {
              method: 'DELETE',
              headers: this._getHeaders(),
            },
            { maxRetries: 1, baseDelay: 300 }
          );
          deletedCount++;

          // 速率限制
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          this.logger.warn?.(`Failed to delete block ${block.id}:`, err);
        }
      }

      return { success: true, deletedCount };
    } catch (error) {
      this.logger.error?.('❌ 刪除區塊失敗:', error);
      return { success: false, deletedCount: 0, error: error.message };
    }
  }
}

// 導出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NotionService, fetchWithRetry, NOTION_CONFIG };
} else if (typeof window !== 'undefined') {
  window.NotionService = NotionService;
  window.fetchWithRetry = fetchWithRetry;
  window.NOTION_CONFIG = NOTION_CONFIG;
}
