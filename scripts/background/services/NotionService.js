/**
 * NotionService - Notion API 交互服務
 *
 * 職責：封裝所有與 Notion API 的交互，包括：
 * - 使用官方 @notionhq/client SDK
 * - 請求重試機制（SDK 內建 + 自定義邏輯）
 * - 區塊批次處理（每批 100 個）
 * - 速率限制
 *
 * @module services/NotionService
 */

import { Client } from '@notionhq/client';
// 導入統一配置
import { ERROR_MESSAGES, CONTENT_QUALITY, HIGHLIGHT_ERROR_CODES } from '../../config/index.js';
import { NOTION_API } from '../../config/extension/notionApi.js';
import { AuthMode } from '../../config/extension/authMode.js';
// 導入安全工具
import { sanitizeApiError } from '../../utils/securityUtils.js';
// 導入統一日誌記錄器
import Logger from '../../utils/Logger.js';
// 導入重試管理器
import { RetryManager } from '../../utils/RetryManager.js';
import { getActiveNotionToken, refreshOAuthToken } from '../../utils/notionAuth.js';

/**
 * 延遲函數
 *
 * @param {number} ms - 毫秒
 * @returns {Promise<void>}
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * NotionService 類
 * 封裝 Notion API 操作，使用官方 SDK
 */
class NotionService {
  /**
   * @param {object} options - 配置選項
   * @param {string} options.apiKey - Notion API Key
   * @param {object} options.logger - 日誌對象
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey || null;
    this.config = { ...NOTION_API, ...options.config };
    this.client = null;

    // 初始化共用 RetryManager
    this._retryManager = new RetryManager();

    if (this.apiKey) {
      this._initClient();
    }
  }

  /**
   * 初始化 Notion SDK Client
   *
   * @private
   */
  _initClient() {
    if (!this.apiKey) {
      return;
    }

    this.client = new Client({
      auth: this.apiKey,
      notionVersion: this.config.API_VERSION,
      // SDK 內建重試，我們設置較小值，主要依賴外層邏輯控制
      retry: {
        retries: 0, // 禁用 SDK 內建重試，以便我們控制自定義重試邏輯
      },
      // 自定義 fetch 適配器，防止 Illegal Invocation 錯誤
      fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }),
    });
  }

  /**
   * 設置 API Key 並重新初始化 Client
   *
   * @param {string} apiKey
   */
  setApiKey(apiKey) {
    this.apiKey = apiKey;
    this._initClient();
  }

  /**
   * 根據選項獲取適用的 Client
   *
   * @param {object} options - 請求選項
   * @param {string} [options.apiKey] - 臨時 API Key
   * @param {object} [options.client] - 預先創建的 Client
   * @returns {object} Notion Client 實例
   * @private
   */
  _getScopedClient(options = {}) {
    // 1. 優先使用傳入的 client
    if (options.client) {
      return options.client;
    }

    // 2. 如果提供了臨時 apiKey，則創建一個次級實例
    if (options.apiKey) {
      // 如果臨時 key 與當前全域 key 相同，則復用全域 client
      if (this.apiKey === options.apiKey && this.client) {
        return this.client;
      }

      // 創建臨時 Client
      return new Client({
        auth: options.apiKey,
        notionVersion: this.config.API_VERSION,
        retry: { retries: 0 },
        fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }),
      });
    }

    // 3. 回退到全域 client
    this._ensureClient();
    return this.client;
  }

  /**
   * 確保 Client 已初始化
   *
   * @param {object} [providedClient] - 可選的預設 Client
   * @private
   */
  _ensureClient(providedClient) {
    if (providedClient) {
      return;
    }
    if (!this.apiKey) {
      throw new Error(ERROR_MESSAGES.TECHNICAL.API_KEY_NOT_CONFIGURED);
    }
    if (!this.client) {
      this._initClient();
    }
  }

  /**
   * 判斷 Notion API 錯誤是否可重試
   *
   * @param {Error} error - 錯誤對象
   * @returns {boolean} 是否應該重試
   * @private
   */
  _isNotionRetriableError(error) {
    if (!error || typeof error !== 'object') {
      return false;
    }

    // SDK 錯誤代碼: rate_limited (429), internal_server_error (500), service_unavailable (503)
    const isRateLimit = error.status === 429 || error.code === 'rate_limited';
    const isServerErr =
      (error.status >= 500 && error.status < 600) ||
      ['internal_server_error', 'service_unavailable'].includes(error.code);
    // 處理 409 conflict
    const isConflict = error.status === 409 || error.code === 'conflict_error';
    // 處理特定錯誤訊息
    const isRetriableMessage = /unsaved transactions|datastoreinfraerror/i.test(error.message);

    return isRateLimit || isServerErr || isConflict || isRetriableMessage;
  }

  /**
   * 執行帶重試的 SDK 操作（委託給 RetryManager）
   *
   * @param {Function} operation - 執行 SDK 調用的函數 (接收 client 作為參數)
   * @param {object} options - 配置與重試選項
   * @returns {Promise<any>}
   * @private
   */
  async _executeWithRetry(operation, options = {}) {
    const client = this._getScopedClient(options);
    const {
      maxRetries = this.config.DEFAULT_MAX_RETRIES,
      baseDelay = this.config.DEFAULT_BASE_DELAY,
      label = 'operation',
    } = options;

    return this._retryManager.execute(() => operation(client), {
      maxRetries,
      baseDelay,
      shouldRetry: error => this._isNotionRetriableError(error),
      contextType: label,
      shouldLogFailure: options.shouldLogFailure,
    });
  }

  /**
   * 判斷是否為授權失敗錯誤
   *
   * @param {Error|object} error
   * @returns {boolean}
   * @private
   */
  _isUnauthorizedError(error) {
    return error?.status === 401 || error?.code === 'unauthorized';
  }

  /**
   * 執行 Notion API 請求，遇到 OAuth 401 時自動刷新 token 並重試一次
   *
   * @param {Function} operation - 執行 SDK 調用的函數 (接收 client 作為參數)
   * @param {object} options - 配置與重試選項
   * @returns {Promise<any>}
   * @private
   */
  async _callNotionApiWithRetry(operation, options = {}) {
    try {
      return await this._executeWithRetry(operation, options);
    } catch (error) {
      if (!this._isUnauthorizedError(error)) {
        throw error;
      }

      const currentApiKey = options.apiKey || this.apiKey;
      const activeToken = await getActiveNotionToken();
      const isOAuthRequest =
        activeToken.mode === AuthMode.OAUTH &&
        Boolean(activeToken.token) &&
        currentApiKey === activeToken.token;

      if (!isOAuthRequest) {
        throw error;
      }

      const refreshedToken = await refreshOAuthToken();
      if (!refreshedToken) {
        throw error;
      }

      const shouldSyncGlobalClient = !options.apiKey || this.apiKey === activeToken.token;

      if (shouldSyncGlobalClient) {
        this.setApiKey(refreshedToken);
      }

      const retryOptions = { ...options, apiKey: refreshedToken };
      delete retryOptions.client;

      return this._executeWithRetry(operation, {
        ...retryOptions,
      });
    }
  }

  /**
   * (Legacy/Internal) 執行原始 API 請求
   * 封裝 SDK 的 request 方法，支持 Scoped Client
   *
   * @param {string} path - API 路徑 (如 'pages' 或 '/pages')
   * @param {object} [options={}] - 請求選項
   * @param {string} [options.method='GET'] - HTTP 方法
   * @param {object} [options.body] - 請求體
   * @param {object} [options.queryParams] - 查詢參數 (SDK 稱為 query)
   * @param {string} [options.apiKey] - 臨時 API Key
   * @returns {Promise<any>}
   * @private
   */
  async _apiRequest(path, options = {}) {
    const { method = 'GET', body, queryParams, apiKey } = options;

    return await this._callNotionApiWithRetry(
      client =>
        client.request({
          path: path.startsWith('/') ? path.slice(1) : path,
          method,
          body: body === undefined ? undefined : body,
          query: queryParams,
        }),
      { ...options, apiKey, label: `APIRequest:${path}` }
    );
  }

  /**
   * 搜索 Database 或 Page
   * 取代原 DataSourceManager 中的 fetch 邏輯
   *
   * @param {object} params - 搜索參數
   * @param {string} params.query - 關鍵字
   * @param {object} params.filter - 過濾條件
   * @param {object} params.sort - 排序條件
   * @param {object} [options={}] - 請求選項 (可包含 apiKey)
   * @returns {Promise<{results: Array, next_cursor: string|null}>}
   */
  async search(params = {}, options = {}) {
    const { query, filter, sort, start_cursor, page_size } = params;

    try {
      // 構建搜索參數
      const searchParams = {
        query,
        sort,
        start_cursor,
        page_size: page_size || this.config.PAGE_SIZE,
      };

      if (filter) {
        searchParams.filter = filter;
      }

      const response = await this._callNotionApiWithRetry(client => client.search(searchParams), {
        ...options,
        label: 'Search',
      });

      return response;
    } catch (error) {
      Logger.error('[NotionService] 搜索失敗', {
        action: 'search',
        error,
      });
      throw error; // 讓調用者處理錯誤
    }
  }

  /**
   * 獲取頁面區塊列表
   *
   * @param {string} pageId - 頁面 ID
   * @param {object} [options={}] - 請求選項 (可包含 apiKey)
   * @returns {Promise<{success: boolean, blocks?: Array, error?: string}>}
   * @private
   */
  async _fetchPageBlocks(pageId, options = {}) {
    const allBlocks = [];
    let hasMore = true;
    let startCursor; // SDK 使用 undefined 表示無 cursor

    try {
      while (hasMore) {
        const response = await this._callNotionApiWithRetry(
          client =>
            client.blocks.children.list({
              block_id: pageId,
              page_size: this.config.PAGE_SIZE,
              start_cursor: startCursor,
            }),
          {
            ...options,
            ...this._getRetryPolicy('check'),
            label: 'FetchBlocks',
          }
        );

        const results = response.results || [];
        allBlocks.push(...results);

        hasMore = response.has_more;
        startCursor = response.next_cursor || undefined;
      }

      return { success: true, blocks: allBlocks };
    } catch (error) {
      return {
        success: false,
        error: sanitizeApiError(error, 'fetch_blocks'),
      };
    }
  }

  /**
   * 批量刪除區塊（並發控制版本）
   * 使用 3 並發符合 Notion API 限流 (3 req/s)
   *
   * @param {Array<string>} blockIds - 區塊 ID 列表
   * @param {object} [options={}] - 請求選項 (可包含 apiKey)
   * @returns {Promise<{successCount: number, failureCount: number, errors: Array<{id: string, error: string}>}>}
   * @private
   */
  async _deleteBlocksByIds(blockIds, options = {}) {
    // 並發數配合批次間延遲，共同確保遵守 Notion API 速率限制（3 req/s）
    // - 單請求模式：由 NOTION_API.RATE_LIMIT_DELAY (350ms) 控制間隔
    // - 並發刪除模式：每批請求後等待延遲（見下方批次延遲邏輯）
    // 兩者適用於不同場景，不會同時生效
    const { DELETE_CONCURRENCY: CONCURRENCY, DELETE_BATCH_DELAY_MS } = this.config;
    const retryPolicy = this._getRetryPolicy('delete');
    const errors = [];
    let successCount = 0;

    const batches = this._createDeleteBatches(blockIds, CONCURRENCY);

    // 分批並發處理（每批 CONCURRENCY 個）
    for (const [batchIndex, batch] of batches.entries()) {
      const results = await Promise.all(
        batch.map(blockId => this._deleteBlockById(blockId, options, retryPolicy))
      );

      successCount += this._collectDeleteBatchResults(results, errors);

      // 批次間延遲：確保符合 Notion API 限制
      if (batchIndex < batches.length - 1) {
        await sleep(DELETE_BATCH_DELAY_MS);
      }
    }

    return { successCount, failureCount: errors.length, errors };
  }

  /**
   * 檢查頁面是否存在
   *
   * @param {string} pageId - Notion 頁面 ID
   * @param {object} [options={}] - 請求選項 (可包含 apiKey)
   * @returns {Promise<boolean|null>} true=存在, false=不存在, null=不確定
   */
  async checkPageExists(pageId, options = {}) {
    try {
      const response = await this._callNotionApiWithRetry(
        client => client.pages.retrieve({ page_id: pageId }),
        {
          ...options,
          ...this._getRetryPolicy('check'),
          label: 'CheckPage',
          shouldLogFailure: error => {
            // 404 or object_not_found is expected result (page deleted), so apply silent failure
            return error.status !== 404 && error.code !== 'object_not_found';
          },
        }
      );

      return !response.archived;
    } catch (error) {
      if (error.status === 404 || error.code === 'object_not_found') {
        return false;
      }
      if (error.message?.includes('API Key') || error.message?.includes('config')) {
        throw error;
      }
      Logger.error('[NotionService] 無法確定頁面存續狀態', {
        action: 'checkPageExists',
        error,
      });
      return null;
    }
  }

  /**
   * 清理區塊：移除內部使用的 _meta 欄位
   *
   * @param {object} block - 原始區塊對象
   * @returns {object} 清理後的區塊對象
   * @private
   */
  _cleanBlock(block) {
    const { _meta, ...cleanBlock } = block;
    return cleanBlock;
  }

  /**
   * 依操作類型回傳對應的重試參數
   *
   * @param {'default'|'check'|'create'|'delete'} profile
   * @returns {{maxRetries: number, baseDelay: number}}
   * @private
   */
  _getRetryPolicy(profile = 'default') {
    const policyMap = {
      default: {
        maxRetries: this.config.DEFAULT_MAX_RETRIES,
        baseDelay: this.config.DEFAULT_BASE_DELAY,
      },
      check: {
        maxRetries: this.config.CHECK_RETRIES,
        baseDelay: this.config.CHECK_DELAY,
      },
      create: {
        maxRetries: this.config.CREATE_RETRIES,
        baseDelay: this.config.CREATE_DELAY,
      },
      delete: {
        maxRetries: this.config.DELETE_RETRIES,
        baseDelay: this.config.DELETE_DELAY,
      },
    };

    return policyMap[profile] || policyMap.default;
  }

  /**
   * 將區塊 ID 依批次大小切分
   *
   * @param {Array<string>} blockIds
   * @param {number} batchSize
   * @returns {Array<Array<string>>}
   * @private
   */
  _createDeleteBatches(blockIds, batchSize) {
    const batches = [];

    for (let i = 0; i < blockIds.length; i += batchSize) {
      batches.push(blockIds.slice(i, i + batchSize));
    }

    return batches;
  }

  /**
   * 刪除單一區塊
   *
   * @param {string} blockId
   * @param {object} options
   * @param {{maxRetries: number, baseDelay: number}} retryPolicy
   * @returns {Promise<{success: boolean, id: string, error?: string}>}
   * @private
   */
  async _deleteBlockById(blockId, options, retryPolicy) {
    try {
      await this._callNotionApiWithRetry(client => client.blocks.delete({ block_id: blockId }), {
        ...options,
        ...retryPolicy,
        label: 'DeleteBlock',
      });

      return { success: true, id: blockId };
    } catch (deleteError) {
      const errorText = deleteError.message || 'Unknown error';
      Logger.warn('[NotionService] 刪除區塊異常', {
        action: 'deleteBlocksByIds',
        phase: 'deleteBlock',
        blockId,
        error: deleteError,
      });
      return { success: false, id: blockId, error: errorText };
    }
  }

  /**
   * 聚合單批次刪除結果
   *
   * @param {Array<{success: boolean, id: string, error?: string}>} results
   * @param {Array<{id: string, error: string}>} errors
   * @returns {number}
   * @private
   */
  _collectDeleteBatchResults(results, errors) {
    let successCount = 0;

    for (const result of results) {
      if (result.success) {
        successCount++;
      } else {
        errors.push({ id: result.id, error: result.error });
      }
    }

    return successCount;
  }

  /**
   * 分批添加區塊到頁面
   *
   * @param {string} pageId - Notion 頁面 ID
   * @param {Array} blocks - 區塊數組
   * @param {number} startIndex - 開始索引
   * @param {object} [options={}] - 請求選項 (可包含 apiKey)
   * @returns {Promise<{success: boolean, addedCount: number, totalCount: number, error?: string}>}
   */
  async appendBlocksInBatches(pageId, blocks, startIndex = 0, options = {}) {
    const { BLOCKS_PER_BATCH, RATE_LIMIT_DELAY } = this.config;
    const retryPolicy = this._getRetryPolicy('create');
    let addedCount = 0;
    const totalBlocks = blocks.length - startIndex;

    if (totalBlocks <= 0) {
      return { success: true, addedCount: 0, totalCount: 0 };
    }

    Logger.info('[NotionService] 準備分批添加區塊', {
      action: 'appendBlocksInBatches',
      totalBlocks,
      startIndex,
    });

    try {
      for (let i = startIndex; i < blocks.length; i += BLOCKS_PER_BATCH) {
        const batch = blocks.slice(i, i + BLOCKS_PER_BATCH);
        // 清理區塊：移除內部使用的 _meta 欄位
        // Note: _cleanBlock 是冪等的 (idempotent)。即使區塊在 buildPageData 中已被清理過，
        // 這裡再次執行也是安全的。這是為了確保所有進入 API 的區塊都是乾淨的防禦性措施。
        const sanitizedBatch = batch.map(block => this._cleanBlock(block));
        const batchNumber = Math.floor((i - startIndex) / BLOCKS_PER_BATCH) + 1;
        const totalBatches = Math.ceil(totalBlocks / BLOCKS_PER_BATCH);

        Logger.info('[NotionService] 發送批次', {
          action: 'appendBlocksInBatches',
          batchNumber,
          totalBatches,
          batchSize: sanitizedBatch.length,
        });

        await this._callNotionApiWithRetry(
          client =>
            client.blocks.children.append({
              block_id: pageId,
              children: sanitizedBatch,
            }),
          {
            ...options,
            ...retryPolicy,
            label: `AppendBatch-${batchNumber}`,
          }
        );

        addedCount += batch.length;
        Logger.info('[NotionService] 批次成功', {
          action: 'appendBlocksInBatches',
          batchNumber,
          addedCount,
          totalBlocks,
        });

        // 速率限制：批次間延遲
        if (i + BLOCKS_PER_BATCH < blocks.length) {
          await sleep(RATE_LIMIT_DELAY);
        }
      }

      Logger.success('[NotionService] 所有區塊添加完成', {
        action: 'appendBlocksInBatches',
        addedCount,
        totalBlocks,
      });
      return { success: true, addedCount, totalCount: totalBlocks };
    } catch (error) {
      Logger.error('[NotionService] 分批添加區塊失敗', {
        action: 'appendBlocksInBatches',
        error,
      });
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
   *
   * @param {object} pageData - 頁面數據
   * @param {object} [options] - 選項
   * @param {boolean} [options.autoBatch=false] - 是否自動批次添加超過 100 的區塊
   * @param {Array} [options.allBlocks] - 完整區塊列表（當 autoBatch 為 true 時使用）
   * @param {string} [options.apiKey] - 臨時 API Key
   * @returns {Promise<{success: boolean, pageId?: string, url?: string, appendResult?: object, error?: string}>}
   */
  async createPage(pageData, options = {}) {
    const { autoBatch = false, allBlocks = [] } = options;

    try {
      const response = await this._callNotionApiWithRetry(client => client.pages.create(pageData), {
        ...options,
        ...this._getRetryPolicy('create'),
        label: 'CreatePage',
      });

      const result = {
        success: true,
        pageId: response.id,
        url: response.url,
      };

      // 自動批次添加超過配置限制的區塊
      if (autoBatch && allBlocks.length > this.config.BLOCKS_PER_BATCH) {
        Logger.info('[NotionService] 超長文章批次添加', {
          action: 'createPage',
          phase: 'autoBatch',
          totalBlocks: allBlocks.length,
        });
        const appendResult = await this.appendBlocksInBatches(
          response.id,
          allBlocks,
          this.config.BLOCKS_PER_BATCH,
          options
        );
        result.appendResult = appendResult;

        if (!appendResult.success) {
          Logger.warn('[NotionService] 部分區塊添加失敗', {
            action: 'createPage',
            phase: 'autoBatch',
            addedCount: appendResult.addedCount,
            totalCount: appendResult.totalCount,
          });
        }
      }

      return result;
    } catch (error) {
      const safeError = sanitizeApiError(error, 'create_page');
      Logger.error('[NotionService] 創建頁面失敗', {
        action: 'createPage',
        error: safeError,
      });
      return { success: false, error: safeError };
    }
  }

  /**
   * 更新頁面標題
   *
   * @param {string} pageId - 頁面 ID
   * @param {string} title - 新標題
   * @param {object} [options] - 其他選項 (含 apiKey)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async updatePageTitle(pageId, title, options = {}) {
    try {
      await this._callNotionApiWithRetry(
        client =>
          client.pages.update({
            page_id: pageId,
            properties: {
              title: {
                title: [{ type: 'text', text: { content: title } }],
              },
            },
          }),
        {
          ...options,
          ...this._getRetryPolicy('create'),
          label: 'UpdateTitle',
        }
      );

      return { success: true };
    } catch (error) {
      Logger.error('[NotionService] 更新標題失敗', {
        action: 'updatePageTitle',
        error,
      });
      return { success: false, error: sanitizeApiError(error, 'update_title') };
    }
  }

  /**
   * 刪除頁面所有區塊
   *
   * @param {string} pageId - 頁面 ID
   * @param {object} [options] - 其他選項 (含 apiKey)
   * @returns {Promise<{
   *   success: boolean,
   *   deletedCount: number,
   *   failureCount?: number,
   *   errors?: Array<{id: string, error: string}>,
   *   error?: string
   * }>}
   *
   * `success: true` 只代表刪除流程已執行完成，不代表所有區塊都成功刪除。
   * 當 `failureCount > 0` 時，呼叫端必須進一步檢查 `failureCount` 與 `errors`
   * 以處理部分失敗；`errors` 會包含每個失敗區塊的 `{ id, error }` 明細。
   * `error` 只會在整體失敗時返回，例如列出區塊失敗或執行過程拋出例外。
   */
  async deleteAllBlocks(pageId, options = {}) {
    try {
      // 收集所有區塊（處理分頁）
      const { success, blocks, error } = await this._fetchPageBlocks(pageId, options);

      if (!success) {
        return { success: false, deletedCount: 0, error: error || 'Failed to list blocks' };
      }

      if (!blocks || blocks.length === 0) {
        return { success: true, deletedCount: 0 };
      }

      // 提取區塊 ID 並委託給 _deleteBlocksByIds
      const blockIds = blocks.map(block => block.id);
      const { successCount, failureCount, errors } = await this._deleteBlocksByIds(
        blockIds,
        options
      );

      if (failureCount > 0) {
        Logger.warn('[NotionService] 部分區塊刪除失敗', {
          action: 'deleteAllBlocks',
          failureCount,
          totalBlocks: blocks.length,
          errors,
        });
      }

      return { success: true, deletedCount: successCount, failureCount, errors };
    } catch (error) {
      Logger.error('[NotionService] 刪除區塊失敗', {
        action: 'deleteAllBlocks',
        error,
      });
      return { success: false, deletedCount: 0, error: sanitizeApiError(error, 'delete_blocks') };
    }
  }

  /**
   * 構建頁面數據結構
   * 簡化 saveToNotion 中的頁面數據構建邏輯
   *
   * @param {object} options - 頁面配置選項
   * @param {string} options.title - 頁面標題
   * @param {string} options.pageUrl - 原始頁面 URL
   * @param {string} options.dataSourceId - 數據源 ID (database 或 page)
   * @param {string} options.dataSourceType - 類型 ('page' 或 'database')
   * @param {Array} options.blocks - 內容區塊 (最多取前 100 個)
   * @param {string} [options.siteIcon] - 網站 Icon URL
   * @param {string} [options.coverImage] - 封面圖片 URL（用於頁面封面）
   * @returns {{pageData: object}}
   */
  buildPageData(options) {
    const {
      title,
      pageUrl,
      dataSourceId,
      dataSourceType = 'database',
      blocks = [],
      siteIcon = null,
      coverImage = null,
    } = options;

    // 前端已驗證圖片，此處直接使用

    // 構建 parent 配置：僅 'page' 走 page_id，其餘（'database'）走 data_source_id
    const parentConfig =
      dataSourceType === 'page'
        ? { type: 'page_id', page_id: dataSourceId }
        : { type: 'data_source_id', data_source_id: dataSourceId };
    const pageTitle = title || CONTENT_QUALITY.DEFAULT_PAGE_TITLE;
    const properties =
      dataSourceType === 'page'
        ? {
            title: {
              title: [{ text: { content: pageTitle } }],
            },
          }
        : {
            Title: {
              title: [{ text: { content: pageTitle } }],
            },
            URL: {
              url: pageUrl || '', // 符合現有測試預期
            },
          };

    // 清理區塊：移除內部使用的 _meta 欄位，確保只有 Notion API 認可的欄位被發送
    // Note: 雖然 appendBlocksInBatches 也會執行清理，但此處清理是為了滿足 createPage
    // 直接使用這些區塊時的 API 格式要求。雙重清理是安全的（冪等操作）。
    // 這是防禦性編程，防止內部元數據洩漏到外部 API
    const sanitizedBlocks = blocks
      .slice(0, this.config.BLOCKS_PER_BATCH)
      .map(block => this._cleanBlock(block));

    // 構建頁面數據
    const pageData = {
      parent: parentConfig,
      properties,
      children: sanitizedBlocks,
    };

    // 添加網站 Icon（如果有）
    if (siteIcon) {
      pageData.icon = {
        type: 'external',
        external: { url: siteIcon },
      };
    }

    // 添加封面圖片（如果有且有效）
    // 確保協議正確以避免 API 錯誤
    if (coverImage && (coverImage.startsWith('http://') || coverImage.startsWith('https://'))) {
      pageData.cover = {
        type: 'external',
        external: { url: coverImage },
      };
    }

    return { pageData };
  }

  /**
   * 刷新頁面內容（刪除舊區塊並添加新區塊）
   * 簡化 updateNotionPage 的內容更新邏輯
   *
   * @param {string} pageId - Notion 頁面 ID
   * @param {Array} newBlocks - 新的內容區塊
   * @param {object} [options] - 選項
   * @param {boolean} [options.updateTitle] - 是否同時更新標題
   * @param {string} [options.title] - 新標題（當 updateTitle 為 true 時）
   * @param {string} [options.apiKey] - 臨時 API Key
   * @returns {Promise<{
   *   success: boolean,
   *   addedCount?: number,
   *   deletedCount?: number,
   *   error?: string,
   *   errorType?: string,
   *   details?: {
   *     phase: string,
   *     deletedCount?: number,
   *     totalFailures?: number,
   *     failedBlockIds?: Array<string>,
   *     firstErrorMessage?: string
   *   }
   * }>}
   *
   * 回傳 shape 包含 `success`, `deletedCount`, `error`，以及失敗時的
   * `details.phase`, `details.deletedCount`, `details.totalFailures`,
   * `details.failedBlockIds`, `details.firstErrorMessage`。
   * 其中 `success: true` 代表整個刷新流程成功完成；若刪除階段出現部分失敗，
   * `refreshPageContent` 會基於 `deleteAllBlocks` 的 `failureCount` 額外判斷並直接回傳失敗。
   * 完全失敗時會透過 `error` 返回摘要錯誤；部分失敗時只回傳安全摘要，
   * 避免把底層逐筆錯誤明細直接暴露給呼叫端。
   */
  async refreshPageContent(pageId, newBlocks, options = {}) {
    const { updateTitle = false, title = '' } = options;

    try {
      // 前端已驗證圖片，此處直接使用

      // 步驟 1: 更新標題（如果需要）
      if (updateTitle && title) {
        const titleResult = await this.updatePageTitle(pageId, title, options);
        if (!titleResult.success) {
          Logger.warn('[NotionService] 標題更新失敗', {
            action: 'refreshPageContent',
            phase: 'updateTitle',
            error: titleResult.error,
          });
        }
      }

      // 步驟 2: 刪除現有區塊
      const deleteResult = await this.deleteAllBlocks(pageId, options);
      if (!deleteResult.success || deleteResult.failureCount > 0) {
        const failedBlockIds = deleteResult.errors?.map(errorEntry => errorEntry.id) || [];
        const firstErrorMessage = deleteResult.errors?.[0]?.error
          ? sanitizeApiError(deleteResult.errors[0].error, 'delete_blocks')
          : undefined;

        return {
          success: false,
          error: deleteResult.error || '部分區塊刪除失敗',
          errorType: 'notion_api',
          details: {
            phase: 'delete_existing',
            deletedCount: deleteResult.deletedCount,
            totalFailures: deleteResult.failureCount,
            failedBlockIds,
            firstErrorMessage,
          },
        };
      }

      // 步驟 3: 添加新區塊
      const appendResult = await this.appendBlocksInBatches(pageId, newBlocks, 0, options);

      return {
        success: appendResult.success,
        addedCount: appendResult.addedCount,
        deletedCount: deleteResult.deletedCount,
        error: appendResult.error,
      };
    } catch (error) {
      Logger.error('[NotionService] 刷新頁面內容失敗', {
        action: 'refreshPageContent',
        error,
      });
      return {
        success: false,
        error: sanitizeApiError(error, 'refresh_page'),
        errorType: 'internal',
        details: { phase: 'catch_all' },
      };
    }
  }

  /**
   * 更新頁面的標記區域（僅更新 "📝 頁面標記" 部分）
   *
   * @param {string} pageId - Notion 頁面 ID
   * @param {Array} highlightBlocks - 新的標記區塊（已構建好的 Notion block 格式）
   * @param {object} [options] - 其他選項 (含 apiKey)
   * @returns {Promise<{success: boolean, deletedCount?: number, addedCount?: number, error?: string}>}
   */
  async updateHighlightsSection(pageId, highlightBlocks, options = {}) {
    try {
      Logger.info('[NotionService] 開始更新標記區域', { action: 'updateHighlightsSection' });

      // 步驟 1: 獲取現有區塊
      const fetchResult = await this._fetchPageBlocks(pageId, options);
      if (!fetchResult.success) {
        return {
          success: false,
          error: fetchResult.error,
          errorType: 'notion_api',
          details: { phase: 'fetch_blocks' },
        };
      }

      // 步驟 2: 找出需要刪除的標記區塊
      const blocksToDelete = NotionService._findHighlightSectionBlocks(fetchResult.blocks);

      // 步驟 3: 刪除舊的標記區塊
      const {
        successCount: deletedCount,
        failureCount,
        errors: deleteErrors,
      } = await this._deleteBlocksByIds(blocksToDelete, options);

      if (failureCount > 0) {
        Logger.warn('[NotionService] 部分標記區塊刪除失敗', {
          action: 'updateHighlightsSection',
          phase: 'delete',
          failureCount,
          errors: deleteErrors,
        });

        return {
          success: false,
          error: HIGHLIGHT_ERROR_CODES.DELETE_INCOMPLETE,
          errorType: 'notion_api',
          details: {
            phase: HIGHLIGHT_ERROR_CODES.PHASE_DELETE,
            retryable: true,
            deletedCount,
            failureCount,
            failedBlockIds: deleteErrors.map(errorEntry => errorEntry.id),
          },
        };
      }
      Logger.info('[NotionService] 刪除舊標記區塊', {
        action: 'updateHighlightsSection',
        phase: 'delete',
        deletedCount,
        totalCount: blocksToDelete.length,
      });

      // 步驟 4: 添加新的標記區塊
      if (highlightBlocks.length > 0) {
        const response = await this._callNotionApiWithRetry(
          client =>
            client.blocks.children.append({
              block_id: pageId,
              children: highlightBlocks,
            }),
          {
            ...options,
            ...this._getRetryPolicy('create'),
            label: 'AppendHighlights',
          }
        );

        const addedCount = response.results?.length || 0;
        Logger.success('[NotionService] 添加新標記區塊成功', {
          action: 'updateHighlightsSection',
          phase: 'append',
          addedCount,
        });

        return {
          success: true,
          deletedCount,
          addedCount,
        };
      }

      return { success: true, deletedCount, addedCount: 0 };
    } catch (error) {
      Logger.error('[NotionService] 更新標記區域失敗', {
        action: 'updateHighlightsSection',
        error,
      });
      return {
        success: false,
        error: sanitizeApiError(error, 'update_highlights'),
        errorType: 'internal',
        details: { phase: 'catch_all' },
      };
    }
  }

  /**
   * 找出標記區域的區塊 ID（靜態方法）
   *
   * @param {Array} blocks - 區塊列表
   * @param {string} [headerText] - 標記區域標題
   * @returns {Array<string>} 需要刪除的區塊 ID 列表
   * @static
   * @private
   */
  static _findHighlightSectionBlocks(blocks, headerText = NOTION_API.HIGHLIGHT_SECTION_HEADER) {
    const blocksToDelete = [];
    let foundHighlightSection = false;

    if (!blocks || !Array.isArray(blocks)) {
      return [];
    }

    for (const block of blocks) {
      const isHighlightHeader =
        block.type === 'heading_3' && block.heading_3?.rich_text?.[0]?.text?.content === headerText;

      if (foundHighlightSection) {
        // 如果已經在標記區域中，遇到任何標題（包括重複的目標標題）都停止收集
        // Note: 當前邏輯假設標記區域內不包含子標題 (heading_2, heading_3 等)。
        // 如果未來允許標記區域內包含子結構，需調整此終止條件。
        if (block.type?.startsWith('heading_')) {
          break;
        }
        // 收集區域內的內容區塊
        if (block.id) {
          blocksToDelete.push(block.id);
        }
      } else if (isHighlightHeader) {
        // 找到標記區域的開始
        foundHighlightSection = true;
        if (block.id) {
          blocksToDelete.push(block.id);
        }
      }
    }

    return blocksToDelete;
  }
}

// 導出
export { NotionService };
