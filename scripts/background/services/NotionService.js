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
import { ERROR_MESSAGES, HIGHLIGHT_ERROR_CODES } from '../../config/shared/errorMessages.js';
import { CONTENT_QUALITY } from '../../config/shared/content.js';
import { NOTION_API } from '../../config/extension/notionApi.js';
import { AuthMode } from '../../config/extension/authMode.js';
// 導入安全工具
import { sanitizeApiError } from '../../utils/ApiErrorSanitizer.js';
// 導入暫存圖片 URL 偵測（用於 page cover 防護）
// 從獨立模組 import，避免 rollup 被迫保留 imageUtils 整個物件含所有函數
import { isTemporaryImageUrl } from '../../utils/temporaryImageUrl.js';
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

const UNKNOWN_ERROR_FALLBACK = 'Unknown error';
const RETRIABLE_NOTION_ERROR_CODES = new Set([
  'rate_limited',
  'internal_server_error',
  'service_unavailable',
  'conflict_error',
]);
const RETRIABLE_NOTION_ERROR_MESSAGE_PATTERN = /unsaved transactions|datastoreinfraerror/i;
const BLOCK_DELETE_ENTRY_ID_FIELDS = ['id', 'blockId'];
const BLOCK_DELETE_ERROR_SOURCE_RESOLVERS = [
  deleteResult => deleteResult?.errors,
  deleteResult => deleteResult?.deleteErrors,
  deleteResult => getFailedDeleteItems(deleteResult?.items),
];

function getMessageOrFallback(message) {
  return message || UNKNOWN_ERROR_FALLBACK;
}

function hasStringMessage(value) {
  return Boolean(
    value && typeof value === 'object' && typeof value.message === 'string' && value.message
  );
}

function isNotionRateLimitError(error) {
  return error.status === 429 || error.code === 'rate_limited';
}

function isNotionServerError(error) {
  return (
    (error.status >= 500 && error.status < 600) ||
    ['internal_server_error', 'service_unavailable'].includes(error.code)
  );
}

function isNotionConflictError(error) {
  return error.status === 409 || error.code === 'conflict_error';
}

function hasRetriableNotionMessage(error) {
  return RETRIABLE_NOTION_ERROR_MESSAGE_PATTERN.test(error.message);
}

function isHttpUrl(url) {
  return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'));
}

/**
 * 從任意 rejection / thrown value 中萃取人類可讀訊息。
 * 涵蓋三種來源：Error、字串、含 message 欄位的 plain object；其餘退回 fallback token。
 *
 * @param {unknown} reason
 * @returns {string}
 */
function extractRejectionMessage(reason) {
  if (reason instanceof Error) {
    return getMessageOrFallback(reason.message);
  }
  if (typeof reason === 'string') {
    return getMessageOrFallback(reason);
  }
  if (hasStringMessage(reason)) {
    return reason.message;
  }
  return UNKNOWN_ERROR_FALLBACK;
}

function getBlockDeleteErrorEntries(deleteResult) {
  const deleteErrors = BLOCK_DELETE_ERROR_SOURCE_RESOLVERS.map(resolveSource =>
    resolveSource(deleteResult)
  ).find(source => hasBlockDeleteErrorSource(source));

  return normalizeBlockDeleteErrorEntries(deleteErrors);
}

function getFailedDeleteItems(items) {
  return Array.isArray(items) ? items.filter(item => isFailedDeleteItem(item)) : null;
}

function isFailedDeleteItem(item) {
  return item?.success === false || Boolean(item?.error);
}

function hasBlockDeleteErrorSource(deleteErrors) {
  return deleteErrors !== undefined && deleteErrors !== null;
}

function normalizeBlockDeleteErrorEntries(deleteErrors) {
  if (!deleteErrors) {
    return [];
  }

  return Array.isArray(deleteErrors) ? deleteErrors : [deleteErrors];
}

function getBlockDeleteEntryId(errorEntry) {
  const idField = BLOCK_DELETE_ENTRY_ID_FIELDS.find(
    fieldName => typeof errorEntry?.[fieldName] === 'string'
  );

  return idField ? errorEntry[idField] : null;
}

function sanitizeBlockDeleteErrors(deleteResult) {
  return getBlockDeleteErrorEntries(deleteResult).map(errorEntry =>
    sanitizeApiError(errorEntry?.error || errorEntry, 'delete_blocks')
  );
}

function getFailedBlockIds(deleteResult) {
  return getBlockDeleteErrorEntries(deleteResult)
    .map(errorEntry => getBlockDeleteEntryId(errorEntry))
    .filter(Boolean);
}

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

    return (
      RETRIABLE_NOTION_ERROR_CODES.has(error.code) ||
      isNotionRateLimitError(error) ||
      isNotionServerError(error) ||
      isNotionConflictError(error) ||
      hasRetriableNotionMessage(error)
    );
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

      return this._retryOAuthRequestAfterUnauthorized(operation, options, error);
    }
  }

  async _retryOAuthRequestAfterUnauthorized(operation, options, originalError) {
    const retryContext = await this._resolveOAuthRetryContext(options);

    if (!retryContext) {
      throw originalError;
    }

    if (retryContext.shouldSyncGlobalClient) {
      this.setApiKey(retryContext.refreshedToken);
    }

    return this._executeWithRetry(
      operation,
      this._buildOAuthRetryOptions(options, retryContext.refreshedToken)
    );
  }

  async _resolveOAuthRetryContext(options) {
    if (this._isClientOnlyScopedRequest(options)) {
      return null;
    }

    const currentApiKey = options.apiKey || this.apiKey;
    const activeToken = await getActiveNotionToken();
    if (!this._isActiveOAuthTokenRequest(activeToken, currentApiKey)) {
      return null;
    }

    const refreshedToken = await refreshOAuthToken().catch(() => null);
    if (!refreshedToken) {
      return null;
    }

    return {
      refreshedToken,
      shouldSyncGlobalClient: this._shouldSyncGlobalOAuthClient(options, activeToken),
    };
  }

  _isClientOnlyScopedRequest(options) {
    return Boolean(options.client && !options.apiKey);
  }

  _isActiveOAuthTokenRequest(activeToken, currentApiKey) {
    return (
      activeToken.mode === AuthMode.OAUTH &&
      Boolean(activeToken.token) &&
      currentApiKey === activeToken.token
    );
  }

  _shouldSyncGlobalOAuthClient(options, activeToken) {
    return !options.apiKey || this.apiKey === activeToken.token;
  }

  _buildOAuthRetryOptions(options, refreshedToken) {
    const retryOptions = { ...options, apiKey: refreshedToken };
    delete retryOptions.client;
    return retryOptions;
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
      const errorCode = sanitizeApiError(error, 'fetch_blocks');
      return {
        success: false,
        error: errorCode,
        errorCode,
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
      const settledResults = await Promise.allSettled(
        batch.map(blockId => this._deleteBlockById(blockId, options, retryPolicy))
      );
      const results = settledResults.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        }

        return {
          success: false,
          id: batch[index],
          error: extractRejectionMessage(result.reason),
        };
      });

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
      return this._resolvePageExistsFailure(error);
    }
  }

  _resolvePageExistsFailure(error) {
    if (this._isPageNotFoundError(error)) {
      return false;
    }
    if (this._isConfigurationError(error)) {
      throw error;
    }
    Logger.error('[NotionService] 無法確定頁面存續狀態', {
      action: 'checkPageExists',
      error,
    });
    return null;
  }

  _isPageNotFoundError(error) {
    return error.status === 404 || error.code === 'object_not_found';
  }

  _isConfigurationError(error) {
    const configurationError = ERROR_MESSAGES.TECHNICAL.API_KEY_NOT_CONFIGURED;
    return [
      error === configurationError,
      error?.message === configurationError,
      this._isSanitizedConfigurationError(error, configurationError),
    ].includes(true);
  }

  _isSanitizedConfigurationError(error, configurationError) {
    if (!error?.code) {
      return false;
    }

    return sanitizeApiError(error, 'check_page_exists') === configurationError;
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
      const errorText = extractRejectionMessage(deleteError);
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
    try {
      const response = await this._callNotionApiWithRetry(client => client.pages.create(pageData), {
        ...options,
        ...this._getRetryPolicy('create'),
        label: 'CreatePage',
      });

      const result = this._buildCreatePageResult(response);
      await this._appendRemainingBlocksAfterCreate(result, response.id, options);
      return result;
    } catch (error) {
      const safeError = sanitizeApiError(error, 'create_page');
      Logger.error('[NotionService] 創建頁面失敗', {
        action: 'createPage',
        error: safeError,
      });
      return { success: false, error: safeError, errorCode: safeError };
    }
  }

  _buildCreatePageResult(response) {
    return {
      success: true,
      pageId: response.id,
      url: response.url,
    };
  }

  async _appendRemainingBlocksAfterCreate(result, pageId, options) {
    if (!this._shouldAutoBatchAfterCreate(options)) {
      return;
    }

    const { allBlocks } = options;
    Logger.info('[NotionService] 超長文章批次添加', {
      action: 'createPage',
      phase: 'autoBatch',
      totalBlocks: allBlocks.length,
    });

    const appendResult = await this.appendBlocksInBatches(
      pageId,
      allBlocks,
      this.config.BLOCKS_PER_BATCH,
      options
    );
    result.appendResult = appendResult;
    this._logCreatePageAppendFailure(appendResult);
  }

  _shouldAutoBatchAfterCreate(options) {
    const { autoBatch = false, allBlocks = [] } = options;
    return autoBatch && allBlocks.length > this.config.BLOCKS_PER_BATCH;
  }

  _logCreatePageAppendFailure(appendResult) {
    if (appendResult.success) {
      return;
    }

    Logger.warn('[NotionService] 部分區塊添加失敗', {
      action: 'createPage',
      phase: 'autoBatch',
      addedCount: appendResult.addedCount,
      totalCount: appendResult.totalCount,
    });
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

      return await this._deleteFetchedBlocks(blocks, options);
    } catch (error) {
      Logger.error('[NotionService] 刪除區塊失敗', {
        action: 'deleteAllBlocks',
        error,
      });
      return { success: false, deletedCount: 0, error: sanitizeApiError(error, 'delete_blocks') };
    }
  }

  async _deleteFetchedBlocks(blocks, options) {
    if (!blocks || blocks.length === 0) {
      return { success: true, deletedCount: 0 };
    }

    const blockIds = blocks.map(block => block.id);
    const deleteResult = await this._deleteBlocksByIds(blockIds, options);
    this._logPartialBlockDeleteFailure(deleteResult, blocks.length);

    return {
      success: true,
      deletedCount: deleteResult.successCount,
      failureCount: deleteResult.failureCount,
      errors: deleteResult.errors,
    };
  }

  _logPartialBlockDeleteFailure(deleteResult, totalBlocks) {
    if (deleteResult.failureCount === 0) {
      return;
    }

    Logger.warn('[NotionService] 部分區塊刪除失敗', {
      action: 'deleteAllBlocks',
      result: 'partial_failure',
      failureCount: deleteResult.failureCount,
      totalBlocks,
      failedBlockIds: getFailedBlockIds(deleteResult),
      sanitizedError: sanitizeBlockDeleteErrors(deleteResult),
    });
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

    const pageTitle = title || CONTENT_QUALITY.DEFAULT_PAGE_TITLE;
    // 清理區塊：移除內部使用的 _meta 欄位，確保只有 Notion API 認可的欄位被發送
    // Note: 雖然 appendBlocksInBatches 也會執行清理，但此處清理是為了滿足 createPage
    // 直接使用這些區塊時的 API 格式要求。雙重清理是安全的（冪等操作）。
    // 這是防禦性編程，防止內部元數據洩漏到外部 API
    const sanitizedBlocks = blocks
      .slice(0, this.config.BLOCKS_PER_BATCH)
      .map(block => this._cleanBlock(block));

    // 構建頁面數據
    const pageData = {
      parent: this._buildParentConfig(dataSourceId, dataSourceType),
      properties: this._buildPageProperties({ dataSourceType, pageTitle, pageUrl }),
      children: sanitizedBlocks,
    };

    this._applyPageIcon(pageData, siteIcon);
    this._applyPageCover(pageData, coverImage);

    return { pageData };
  }

  _buildParentConfig(dataSourceId, dataSourceType) {
    if (dataSourceType === 'page') {
      return { type: 'page_id', page_id: dataSourceId };
    }
    return { type: 'data_source_id', data_source_id: dataSourceId };
  }

  _buildPageProperties({ dataSourceType, pageTitle, pageUrl }) {
    if (dataSourceType === 'page') {
      return {
        title: {
          title: [{ text: { content: pageTitle } }],
        },
      };
    }

    return {
      Title: {
        title: [{ text: { content: pageTitle } }],
      },
      URL: {
        url: pageUrl || '', // 符合現有測試預期
      },
    };
  }

  _applyPageIcon(pageData, siteIcon) {
    if (!siteIcon) {
      return;
    }

    pageData.icon = {
      type: 'external',
      external: { url: siteIcon },
    };
  }

  _applyPageCover(pageData, coverImage) {
    const { cover, skippedTemporary } = this._resolveExternalCover(coverImage);

    if (cover) {
      pageData.cover = cover;
      return;
    }

    if (skippedTemporary) {
      Logger.warn('[NotionService] 跳過 temporary cover URL', {
        action: 'buildPageData',
        reason: 'temporary_image_url',
      });
    }
  }

  _resolveExternalCover(coverImage) {
    if (!coverImage) {
      return { cover: null, skippedTemporary: false };
    }

    if (isTemporaryImageUrl(coverImage)) {
      return { cover: null, skippedTemporary: true };
    }

    if (!isHttpUrl(coverImage)) {
      return { cover: null, skippedTemporary: false };
    }

    return {
      cover: {
        type: 'external',
        external: { url: coverImage },
      },
      skippedTemporary: false,
    };
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
    try {
      // 前端已驗證圖片，此處直接使用

      // 步驟 1: 更新標題（如果需要）
      await this._updateTitleForRefresh(pageId, options);

      // 步驟 2: 刪除現有區塊
      const deleteResult = await this.deleteAllBlocks(pageId, options);
      if (this._hasDeleteExistingFailure(deleteResult)) {
        return this._buildDeleteExistingFailure(deleteResult);
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

  async _updateTitleForRefresh(pageId, options) {
    if (!this._shouldUpdateTitleForRefresh(options)) {
      return;
    }

    const titleResult = await this.updatePageTitle(pageId, options.title, options);
    this._logRefreshTitleUpdateFailure(titleResult);
  }

  _shouldUpdateTitleForRefresh(options) {
    return options.updateTitle && options.title;
  }

  _logRefreshTitleUpdateFailure(titleResult) {
    if (titleResult.success) {
      return;
    }

    Logger.warn('[NotionService] 標題更新失敗', {
      action: 'refreshPageContent',
      phase: 'updateTitle',
      error: titleResult.error,
    });
  }

  _hasDeleteExistingFailure(deleteResult) {
    return !deleteResult.success || deleteResult.failureCount > 0;
  }

  _buildDeleteExistingFailure(deleteResult) {
    const errors = deleteResult.errors || [];

    return {
      success: false,
      error: deleteResult.error || '部分區塊刪除失敗',
      errorType: 'notion_api',
      details: {
        phase: 'delete_existing',
        deletedCount: deleteResult.deletedCount,
        totalFailures: deleteResult.failureCount,
        failedBlockIds: errors.map(errorEntry => errorEntry.id),
        firstErrorMessage: this._sanitizeFirstDeleteError(errors[0]),
      },
    };
  }

  _sanitizeFirstDeleteError(errorEntry) {
    if (!errorEntry?.error) {
      return undefined;
    }

    return sanitizeApiError(errorEntry.error, 'delete_blocks');
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
        return this._buildFetchBlocksFailure(fetchResult);
      }

      // 步驟 2: 找出需要刪除的標記區塊
      const deleteResult = await this._deleteHighlightSectionBlocks(fetchResult.blocks, options);
      if (deleteResult.failureCount > 0) {
        return this._buildHighlightDeleteFailure(deleteResult);
      }
      this._logHighlightDeleteSuccess(deleteResult.deletedCount, deleteResult.totalCount);

      // 步驟 4: 添加新的標記區塊
      return await this._appendHighlightBlocks(
        pageId,
        highlightBlocks,
        deleteResult.deletedCount,
        options
      );
    } catch (error) {
      Logger.error('[NotionService] 更新標記區域失敗', {
        action: 'updateHighlightsSection',
        error,
      });
      const errorCode = sanitizeApiError(error, 'update_highlights');
      return {
        success: false,
        error: errorCode,
        errorCode,
        errorType: 'internal',
        details: { phase: 'catch_all' },
      };
    }
  }

  _buildFetchBlocksFailure(fetchResult) {
    return {
      success: false,
      error: fetchResult.error,
      errorCode: fetchResult.errorCode,
      errorType: 'notion_api',
      details: { phase: 'fetch_blocks' },
    };
  }

  async _deleteHighlightSectionBlocks(blocks, options) {
    const blocksToDelete = NotionService._findHighlightSectionBlocks(blocks);
    const deleteResult = await this._deleteBlocksByIds(blocksToDelete, options);

    return {
      deletedCount: deleteResult.successCount,
      failureCount: deleteResult.failureCount,
      deleteErrors: deleteResult.errors,
      totalCount: blocksToDelete.length,
    };
  }

  _logHighlightDeleteSuccess(deletedCount, totalCount) {
    Logger.info('[NotionService] 刪除舊標記區塊', {
      action: 'updateHighlightsSection',
      phase: 'delete',
      deletedCount,
      totalCount,
    });
  }

  _buildHighlightDeleteFailure(deleteResult) {
    Logger.warn('[NotionService] 部分標記區塊刪除失敗', {
      action: 'updateHighlightsSection',
      result: 'partial_failure',
      phase: 'delete',
      failureCount: deleteResult.failureCount,
      failedBlockIds: getFailedBlockIds(deleteResult),
      sanitizedError: sanitizeBlockDeleteErrors(deleteResult),
    });

    return {
      success: false,
      error: HIGHLIGHT_ERROR_CODES.DELETE_INCOMPLETE,
      errorCode: HIGHLIGHT_ERROR_CODES.DELETE_INCOMPLETE,
      errorType: 'notion_api',
      details: {
        phase: HIGHLIGHT_ERROR_CODES.PHASE_DELETE,
        retryable: true,
        deletedCount: deleteResult.deletedCount,
        failureCount: deleteResult.failureCount,
        failedBlockIds: deleteResult.deleteErrors.map(errorEntry => errorEntry.id),
      },
    };
  }

  async _appendHighlightBlocks(pageId, highlightBlocks, deletedCount, options) {
    if (highlightBlocks.length === 0) {
      return { success: true, deletedCount, addedCount: 0 };
    }

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
    if (!blocks || !Array.isArray(blocks)) {
      return [];
    }

    const sectionStartIndex = blocks.findIndex(block =>
      NotionService._isHighlightSectionHeader(block, headerText)
    );

    if (sectionStartIndex === -1) {
      return [];
    }

    return NotionService._sliceHighlightSectionBlocks(blocks, sectionStartIndex)
      .map(block => block?.id)
      .filter(Boolean);
  }

  static _isHighlightSectionHeader(block, headerText) {
    return NotionService._getHeading3Text(block) === headerText;
  }

  static _getHeading3Text(block) {
    const heading = NotionService._getTypedBlockPayload(block, 'heading_3');
    return NotionService._getFirstRichTextContent(heading?.rich_text);
  }

  static _getTypedBlockPayload(block, blockType) {
    return block?.type === blockType ? block[blockType] : null;
  }

  static _getFirstRichTextContent(richText) {
    return richText?.[0]?.text?.content || null;
  }

  static _sliceHighlightSectionBlocks(blocks, sectionStartIndex) {
    // 當前邏輯假設標記區域內不包含子標題。遇到任何 heading_* 代表區域結束。
    const nextHeadingOffset = blocks
      .slice(sectionStartIndex + 1)
      .findIndex(block => !block || NotionService._isHeadingBlock(block));
    const sectionEndIndex =
      nextHeadingOffset === -1 ? blocks.length : sectionStartIndex + 1 + nextHeadingOffset;

    return blocks.slice(sectionStartIndex, sectionEndIndex);
  }

  static _isHeadingBlock(block) {
    return block?.type?.startsWith('heading_') === true;
  }
}

// 導出
export { NotionService };
