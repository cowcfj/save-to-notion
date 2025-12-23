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

// 導入統一配置
import { NOTION_API, IMAGE_VALIDATION_CONSTANTS } from '../../config/index.js';
// 導入安全工具
import { sanitizeUrlForLogging, sanitizeApiError } from '../../utils/securityUtils.js';

// 使用統一常量構建配置
const NOTION_CONFIG = {
  API_VERSION: NOTION_API.VERSION,
  BASE_URL: NOTION_API.BASE_URL,
  BLOCKS_PER_BATCH: NOTION_API.BLOCKS_PER_BATCH,
  DEFAULT_MAX_RETRIES: NOTION_API.MAX_RETRIES,
  DEFAULT_BASE_DELAY: NOTION_API.BASE_RETRY_DELAY,
  // 操作特定配置
  CHECK_RETRIES: NOTION_API.CHECK_RETRIES,
  CHECK_DELAY: NOTION_API.CHECK_DELAY,
  CREATE_RETRIES: NOTION_API.CREATE_RETRIES,
  CREATE_DELAY: NOTION_API.CREATE_DELAY,
  DELETE_RETRIES: NOTION_API.DELETE_RETRIES,
  DELETE_DELAY: NOTION_API.DELETE_DELAY,
  RATE_LIMIT_DELAY: NOTION_API.RATE_LIMIT_DELAY,
  PAGE_SIZE: NOTION_API.PAGE_SIZE,
  // 頁面結構配置
  HIGHLIGHT_SECTION_HEADER: NOTION_API.HIGHLIGHT_SECTION_HEADER,
};

/**
 * 延遲函數
 * @param {number} ms - 毫秒
 * @returns {Promise<void>}
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
        await sleep(delay);
        attempt++;
        continue;
      }

      // 非可重試錯誤或已達最大重試次數
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
        await sleep(delay);
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
   * 通用 API 調用方法
   * @param {string} endpoint - API 端點（相對路徑，如 '/pages'）
   * @param {Object} options - 請求選項
   * @returns {Promise<Response>}
   * @private
   */
  async _apiRequest(endpoint, options = {}) {
    if (!this.apiKey) {
      throw new Error('API Key not configured');
    }

    const {
      method = 'GET',
      body = null,
      queryParams = {},
      maxRetries = this.config.DEFAULT_MAX_RETRIES,
      baseDelay = this.config.DEFAULT_BASE_DELAY,
    } = options;

    const url = this._buildUrl(endpoint, queryParams);

    return await fetchWithRetry(
      url,
      {
        method,
        headers: this._getHeaders(),
        ...(body !== null && body !== undefined && { body: JSON.stringify(body) }),
      },
      { maxRetries, baseDelay }
    );
  }

  /**
   * 構建 API URL
   * @param {string} path - 路徑（相對於 BASE_URL）
   * @param {Object} params - 查詢參數（null 和 undefined 的值會被自動過濾）
   * @returns {string}
   * @private
   */
  _buildUrl(path, params = {}) {
    const url = new URL(`${this.config.BASE_URL}${path}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        url.searchParams.set(key, value);
      }
    });
    return url.toString();
  }

  /**
   * 獲取頁面區塊列表
   * @param {string} pageId - 頁面 ID
   * @returns {Promise<{success: boolean, blocks?: Array, error?: string}>}
   * @private
   */
  async _fetchPageBlocks(pageId) {
    const allBlocks = [];
    let hasMore = true;
    let startCursor = undefined;

    while (hasMore) {
      const response = await this._apiRequest(`/blocks/${pageId}/children`, {
        method: 'GET',
        queryParams: {
          page_size: this.config.PAGE_SIZE,
          start_cursor: startCursor,
        },
        maxRetries: this.config.CHECK_RETRIES,
        baseDelay: this.config.CHECK_DELAY,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const rawError = errorData.message || response.statusText;
        return {
          success: false,
          error: sanitizeApiError(rawError, 'fetch_blocks'),
        };
      }

      const data = await response.json();
      const results = data.results || [];
      allBlocks.push(...results);

      hasMore = data.has_more;
      startCursor = data.next_cursor;
    }

    return { success: true, blocks: allBlocks };
  }

  /**
   * 找出標記區域的區塊 ID
   * @param {Array} blocks - 區塊列表
   * @returns {Array<string>} 需要刪除的區塊 ID 列表
   * @private
   */
  static _findHighlightSectionBlocks(blocks) {
    const blocksToDelete = [];
    let foundHighlightSection = false;

    for (const block of blocks) {
      if (
        block.type === 'heading_3' &&
        block.heading_3?.rich_text?.[0]?.text?.content === NOTION_CONFIG.HIGHLIGHT_SECTION_HEADER
      ) {
        foundHighlightSection = true;
        blocksToDelete.push(block.id);
      } else if (foundHighlightSection) {
        if (block.type.startsWith('heading_')) {
          break; // 遇到下一個標題，停止收集
        }
        if (block.type === 'paragraph') {
          blocksToDelete.push(block.id);
        }
      }
    }

    return blocksToDelete;
  }

  /**
   * 批量刪除區塊
   * @param {Array<string>} blockIds - 區塊 ID 列表
   * @returns {Promise<{successCount: number, failureCount: number, errors: Array<{id: string, error: string}>}>}
   * @private
   */
  async _deleteBlocksByIds(blockIds) {
    let successCount = 0;
    const errors = [];

    for (const blockId of blockIds) {
      try {
        const response = await this._apiRequest(`/blocks/${blockId}`, {
          method: 'DELETE',
          maxRetries: this.config.DELETE_RETRIES,
          baseDelay: this.config.DELETE_DELAY,
        });

        if (response.ok) {
          successCount++;
        } else {
          // 嘗試獲取錯誤細節
          const errorText = await response.text().catch(() => response.statusText);
          errors.push({ id: blockId, error: errorText });
          this.logger.warn?.(`刪除區塊失敗 ${blockId}:`, errorText);
        }
      } catch (deleteError) {
        errors.push({ id: blockId, error: deleteError.message });
        this.logger.warn?.(`刪除區塊異常 ${blockId}:`, deleteError.message);
      }

      // 速率限制：防止快速連續刪除觸發 429 錯誤
      await sleep(this.config.RATE_LIMIT_DELAY);
    }

    return { successCount, failureCount: errors.length, errors };
  }

  /**
   * 驗證區塊基本結構
   * @param {Object} block - 區塊對象
   * @returns {boolean}
   * @private
   */
  _isValidBlock(block) {
    if (!block || typeof block !== 'object' || !block.type || !block[block.type]) {
      this.logger.warn?.('⚠️ Skipped invalid block (missing type or type property)');
      return false;
    }
    return true;
  }

  /**
   * 驗證圖片 URL 是否有效
   * @param {string} imageUrl - 圖片 URL
   * @returns {boolean}
   * @private
   */
  _isValidImageUrl(imageUrl) {
    if (!imageUrl) {
      this.logger.warn?.('⚠️ Skipped image block without URL');
      return false;
    }

    // 檢查 URL 長度
    const maxUrlLength =
      IMAGE_VALIDATION_CONSTANTS.MAX_URL_LENGTH -
      IMAGE_VALIDATION_CONSTANTS.URL_LENGTH_SAFETY_MARGIN;
    if (imageUrl.length > maxUrlLength) {
      this.logger.warn?.(`⚠️ Skipped image with too long URL (${imageUrl.length} chars)`);
      return false;
    }

    // 檢查特殊字符
    const problematicChars = /[<>{}|\\^`[\]]/;
    if (problematicChars.test(imageUrl)) {
      // 使用共用安全工具清理 URL
      const sanitizedUrl = sanitizeUrlForLogging(imageUrl);
      this.logger.warn?.(`⚠️ Skipped image with problematic characters: ${sanitizedUrl}`);
      return false;
    }

    // 驗證 URL 格式
    try {
      const urlObj = new URL(imageUrl);

      // 只接受 http/https
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        this.logger.warn?.(`⚠️ Skipped image with invalid protocol: ${urlObj.protocol}`);
        return false;
      }

      // 檢查 hostname
      if (!urlObj.hostname || urlObj.hostname.length < 3) {
        this.logger.warn?.(`⚠️ Skipped image with invalid hostname: ${urlObj.hostname}`);
        return false;
      }
    } catch (error) {
      this.logger.warn?.('⚠️ Skipped image with invalid URL format', error);
      return false;
    }

    // 驗證通過 - 不記錄日誌以避免圖片較多時產生過多輸出
    return true;
  }

  /**
   * 過濾有效的圖片區塊
   * 移除可能導致 Notion API 錯誤的圖片（URL 過長、無效格式、特殊字符等）
   * @param {Array} blocks - 區塊數組
   * @param {boolean} excludeImages - 是否排除所有圖片（重試模式）
   * @returns {{validBlocks: Array, skippedCount: number}}
   */
  filterValidImageBlocks(blocks, excludeImages = false) {
    if (!blocks || !Array.isArray(blocks)) {
      return { validBlocks: [], skippedCount: 0 };
    }

    if (excludeImages) {
      this.logger.log?.('🚫 Retry mode: Excluding ALL images');
      const validBlocks = blocks.filter(block => block.type !== 'image');
      return { validBlocks, skippedCount: blocks.length - validBlocks.length };
    }

    const validBlocks = blocks.filter(block => {
      // 基本區塊驗證
      if (!this._isValidBlock(block)) {
        return false;
      }

      // 非圖片區塊直接通過
      if (block.type !== 'image') {
        return true;
      }

      // 圖片 URL 驗證
      // Notion 支援兩種圖片類型：
      // 1. external: 外部托管的圖片 (block.image.external.url)
      // 2. file: Notion 內部托管的圖片 (block.image.file.url)
      const imageUrl = block.image?.external?.url || block.image?.file?.url;
      return this._isValidImageUrl(imageUrl);
    });

    const skippedCount = blocks.length - validBlocks.length;
    if (skippedCount > 0) {
      this.logger.log?.(
        `📊 Filtered ${skippedCount} potentially problematic image blocks from ${blocks.length} total blocks`
      );
    }

    return { validBlocks, skippedCount };
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
      const response = await this._apiRequest(`/pages/${pageId}`, {
        method: 'GET',
        maxRetries: this.config.CHECK_RETRIES,
        baseDelay: this.config.CHECK_DELAY,
      });

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

    const { BLOCKS_PER_BATCH } = this.config;
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

        const response = await this._apiRequest(`/blocks/${pageId}/children`, {
          method: 'PATCH',
          body: { children: batch },
          maxRetries: this.config.DEFAULT_MAX_RETRIES,
          baseDelay: this.config.DEFAULT_BASE_DELAY,
        });

        if (!response.ok) {
          const errorText = await response.text();
          this.logger.error?.(`❌ 批次 ${batchNumber} 失敗:`, errorText);
          throw new Error(`批次添加失敗: ${response.status} - ${errorText}`);
        }

        addedCount += batch.length;
        this.logger.log?.(
          `✅ 批次 ${batchNumber} 成功: 已添加 ${addedCount}/${totalBlocks} 個區塊`
        );

        // 速率限制：批次間延遲
        if (i + BLOCKS_PER_BATCH < blocks.length) {
          await sleep(this.config.RATE_LIMIT_DELAY);
        }
      }

      this.logger.log?.(`🎉 所有區塊添加完成: ${addedCount}/${totalBlocks}`);
      return { success: true, addedCount, totalCount: totalBlocks };
    } catch (error) {
      this.logger.error?.('❌ 分批添加區塊失敗:', error);
      return {
        success: false,
        addedCount,
        totalCount: totalBlocks,
        error: sanitizeApiError(error, 'append_blocks'),
      };
    }
  }

  /**
   * 創建新頁面
   * @param {Object} pageData - 頁面數據
   * @param {Object} [options] - 選項
   * @param {boolean} [options.autoBatch=false] - 是否自動批次添加超過 100 的區塊
   * @param {Array} [options.allBlocks] - 完整區塊列表（當 autoBatch 為 true 時使用）
   * @returns {Promise<{success: boolean, pageId?: string, url?: string, appendResult?: Object, error?: string}>}
   */
  async createPage(pageData, options = {}) {
    if (!this.apiKey) {
      throw new Error('API Key not configured');
    }

    const { autoBatch = false, allBlocks = [] } = options;

    try {
      const response = await this._apiRequest('/pages', {
        method: 'POST',
        body: pageData,
        maxRetries: this.config.CREATE_RETRIES,
        baseDelay: this.config.CREATE_DELAY,
      });

      if (response.ok) {
        const data = await response.json();
        const result = {
          success: true,
          pageId: data.id,
          url: data.url,
        };

        // 自動批次添加超過 100 的區塊
        if (autoBatch && allBlocks.length > 100) {
          this.logger.log?.(
            `📚 檢測到超長文章: ${allBlocks.length} 個區塊，開始批次添加剩餘區塊...`
          );
          const appendResult = await this.appendBlocksInBatches(data.id, allBlocks, 100);
          result.appendResult = appendResult;

          if (!appendResult.success) {
            this.logger.warn?.(
              `⚠️ 部分區塊添加失敗: ${appendResult.addedCount}/${appendResult.totalCount}`
            );
          }
        }

        return result;
      }

      const errorData = await response.json().catch(() => ({}));
      const rawError = errorData.message || `API Error: ${response.status}`;
      return {
        success: false,
        error: sanitizeApiError(rawError, 'create_page'),
      };
    } catch (error) {
      this.logger.error?.('❌ 創建頁面失敗:', error);
      return { success: false, error: sanitizeApiError(error, 'create_page') };
    }
  }

  /**
   * 更新頁面標題
   * @param {string} pageId - 頁面 ID
   * @param {string} title - 新標題
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async updatePageTitle(pageId, title) {
    try {
      const response = await this._apiRequest(`/pages/${pageId}`, {
        method: 'PATCH',
        body: {
          properties: {
            title: {
              title: [{ type: 'text', text: { content: title } }],
            },
          },
        },
        maxRetries: this.config.CREATE_RETRIES,
        baseDelay: this.config.CREATE_DELAY,
      });

      return { success: response.ok };
    } catch (error) {
      this.logger.error?.('❌ 更新標題失敗:', error);
      return { success: false, error: sanitizeApiError(error, 'update_title') };
    }
  }

  /**
   * 刪除頁面所有區塊
   * @param {string} pageId - 頁面 ID
   * @returns {Promise<{success: boolean, deletedCount: number, error?: string}>}
   */
  async deleteAllBlocks(pageId) {
    try {
      // 收集所有區塊（處理分頁）
      const allBlocks = [];
      let startCursor = null;
      let hasMore = true;

      while (hasMore) {
        const listResponse = await this._apiRequest(`/blocks/${pageId}/children`, {
          method: 'GET',
          queryParams: {
            page_size: this.config.PAGE_SIZE,
            start_cursor: startCursor,
          },
          maxRetries: this.config.CHECK_RETRIES,
          baseDelay: this.config.CHECK_DELAY,
        });

        if (!listResponse.ok) {
          return { success: false, deletedCount: 0, error: 'Failed to list blocks' };
        }

        const data = await listResponse.json();
        const blocks = data.results || [];
        allBlocks.push(...blocks);

        hasMore = data.has_more === true;
        startCursor = data.next_cursor;
      }

      if (allBlocks.length === 0) {
        return { success: true, deletedCount: 0 };
      }

      // 逐個刪除區塊
      let deletedCount = 0;
      const errors = [];

      for (const block of allBlocks) {
        try {
          const response = await this._apiRequest(`/blocks/${block.id}`, {
            method: 'DELETE',
            maxRetries: this.config.DELETE_RETRIES,
            baseDelay: this.config.DELETE_DELAY,
          });

          if (response.ok) {
            deletedCount++;
          } else {
            const errorText = await response.text().catch(() => response.statusText);
            errors.push({ id: block.id, error: errorText });
            this.logger.warn?.(`Failed to delete block ${block.id}:`, errorText);
          }
        } catch (err) {
          errors.push({ id: block.id, error: err.message });
          this.logger.warn?.(`Failed to delete block ${block.id}:`, err);
        }

        // 速率限制
        await sleep(this.config.RATE_LIMIT_DELAY);
      }

      if (errors.length > 0) {
        this.logger.warn?.(`⚠️ 部分區塊刪除失敗: ${errors.length}/${allBlocks.length}`, errors);
      }

      return { success: true, deletedCount, failureCount: errors.length, errors };
    } catch (error) {
      this.logger.error?.('❌ 刪除區塊失敗:', error);
      return { success: false, deletedCount: 0, error: sanitizeApiError(error, 'delete_blocks') };
    }
  }

  /**
   * 構建頁面數據結構
   * 簡化 saveToNotion 中的頁面數據構建邏輯
   * @param {Object} options - 頁面配置選項
   * @param {string} options.title - 頁面標題
   * @param {string} options.pageUrl - 原始頁面 URL
   * @param {string} options.dataSourceId - 數據源 ID (database 或 page)
   * @param {string} options.dataSourceType - 類型 ('data_source' 或 'page')
   * @param {Array} options.blocks - 內容區塊 (最多取前 100 個)
   * @param {string} [options.siteIcon] - 網站 Icon URL
   * @param {boolean} [options.excludeImages] - 是否排除圖片
   * @returns {{pageData: Object, validBlocks: Array, skippedCount: number}}
   */
  buildPageData(options) {
    const {
      title,
      pageUrl,
      dataSourceId,
      dataSourceType = 'data_source',
      blocks = [],
      siteIcon = null,
      excludeImages = false,
    } = options;

    // 過濾圖片區塊
    const { validBlocks, skippedCount } = this.filterValidImageBlocks(blocks, excludeImages);

    // 構建 parent 配置
    const parentConfig =
      dataSourceType === 'page'
        ? { type: 'page_id', page_id: dataSourceId }
        : { type: 'data_source_id', data_source_id: dataSourceId };

    // 構建頁面數據
    const pageData = {
      parent: parentConfig,
      properties: {
        Title: {
          title: [{ text: { content: title || 'Untitled' } }],
        },
        URL: {
          url: pageUrl || '',
        },
      },
      children: validBlocks.slice(0, this.config.BLOCKS_PER_BATCH),
    };

    // 添加網站 Icon（如果有）
    if (siteIcon) {
      pageData.icon = {
        type: 'external',
        external: { url: siteIcon },
      };
    }

    return { pageData, validBlocks, skippedCount };
  }

  /**
   * 刷新頁面內容（刪除舊區塊並添加新區塊）
   * 簡化 updateNotionPage 的內容更新邏輯
   * @param {string} pageId - Notion 頁面 ID
   * @param {Array} newBlocks - 新的內容區塊
   * @param {Object} [options] - 選項
   * @param {boolean} [options.excludeImages] - 是否排除圖片
   * @param {boolean} [options.updateTitle] - 是否同時更新標題
   * @param {string} [options.title] - 新標題（當 updateTitle 為 true 時）
   * @returns {Promise<{success: boolean, addedCount?: number, deletedCount?: number, error?: string}>}
   */
  async refreshPageContent(pageId, newBlocks, options = {}) {
    const { excludeImages = false, updateTitle = false, title = '' } = options;

    try {
      // 過濾有效區塊
      const { validBlocks, skippedCount } = this.filterValidImageBlocks(newBlocks, excludeImages);

      // 步驟 1: 更新標題（如果需要）
      if (updateTitle && title) {
        const titleResult = await this.updatePageTitle(pageId, title);
        if (!titleResult.success) {
          this.logger.warn?.('⚠️ 標題更新失敗:', titleResult.error);
        }
      }

      // 步驟 2: 刪除現有區塊
      const deleteResult = await this.deleteAllBlocks(pageId);
      if (!deleteResult.success) {
        return {
          success: false,
          error: `刪除區塊失敗: ${deleteResult.error}`,
          deletedCount: deleteResult.deletedCount,
        };
      }

      // 步驟 3: 添加新區塊
      const appendResult = await this.appendBlocksInBatches(pageId, validBlocks, 0);

      return {
        success: appendResult.success,
        addedCount: appendResult.addedCount,
        deletedCount: deleteResult.deletedCount,
        skippedImageCount: skippedCount,
        error: appendResult.error,
      };
    } catch (error) {
      this.logger.error?.('❌ 刷新頁面內容失敗:', error);
      return { success: false, error: sanitizeApiError(error, 'refresh_page') };
    }
  }

  /**
   * 更新頁面的標記區域（僅更新 "📝 頁面標記" 部分）
   * @param {string} pageId - Notion 頁面 ID
   * @param {Array} highlightBlocks - 新的標記區塊（已構建好的 Notion block 格式）
   * @returns {Promise<{success: boolean, deletedCount?: number, addedCount?: number, error?: string}>}
   */
  async updateHighlightsSection(pageId, highlightBlocks) {
    try {
      this.logger.log?.('🔄 開始更新標記區域...');

      // 步驟 1: 獲取現有區塊
      const fetchResult = await this._fetchPageBlocks(pageId);
      if (!fetchResult.success) {
        return { success: false, error: fetchResult.error };
      }

      // 步驟 2: 找出需要刪除的標記區塊
      const blocksToDelete = NotionService._findHighlightSectionBlocks(fetchResult.blocks);

      // 步驟 3: 刪除舊的標記區塊
      const { successCount: deletedCount, errors: deleteErrors } =
        await this._deleteBlocksByIds(blocksToDelete);

      if (deleteErrors.length > 0) {
        this.logger.warn?.(`⚠️ 部分標記區塊刪除失敗: ${deleteErrors.length} 個`, deleteErrors);
      }
      this.logger.log?.(`🗑️ 刪除了 ${deletedCount}/${blocksToDelete.length} 個舊標記區塊`);

      // 步驟 4: 添加新的標記區塊
      if (highlightBlocks.length > 0) {
        const addResponse = await this._apiRequest(`/blocks/${pageId}/children`, {
          method: 'PATCH',
          body: { children: highlightBlocks },
          maxRetries: this.config.CREATE_RETRIES,
          baseDelay: this.config.CREATE_DELAY,
        });

        if (!addResponse.ok) {
          const errorData = await addResponse.json().catch(() => ({}));
          const rawError = errorData.message || 'Unknown error';
          return {
            success: false,
            deletedCount,
            error: sanitizeApiError(rawError, 'add_highlights'),
          };
        }

        const addResult = await addResponse.json();
        this.logger.log?.(`✅ 添加了 ${addResult.results?.length || 0} 個新標記區塊`);

        return {
          success: true,
          deletedCount,
          addedCount: addResult.results?.length || 0,
        };
      }

      return { success: true, deletedCount, addedCount: 0 };
    } catch (error) {
      this.logger.error?.('❌ 更新標記區域失敗:', error);
      return { success: false, error: sanitizeApiError(error, 'update_highlights') };
    }
  }
}

// 導出
export { NotionService, fetchWithRetry, NOTION_CONFIG };

// TEST_EXPOSURE_START
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NotionService, fetchWithRetry, NOTION_CONFIG };
}
// TEST_EXPOSURE_END

if (typeof window !== 'undefined') {
  window.NotionService = NotionService;
  window.fetchWithRetry = fetchWithRetry;
  window.NOTION_CONFIG = NOTION_CONFIG;
}
