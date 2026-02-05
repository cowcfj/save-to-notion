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
import { NOTION_CONFIG, ERROR_MESSAGES } from '../../config/index.js';
// 導入安全工具
import { sanitizeApiError, sanitizeUrlForLogging } from '../../utils/securityUtils.js';
// 導入圖片區塊過濾函數（整合自 imageUtils）
import { filterNotionImageBlocks } from '../../utils/imageUtils.js';
// 導入統一日誌記錄器
import Logger from '../../utils/Logger.js';

// (NOTION_CONFIG 已遷移至 scripts/config/constants.js)

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
    this.config = { ...NOTION_CONFIG, ...options.config };
    this.client = null;

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
      fetch: (url, options) => fetch(url, options),
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
        fetch: (url, opts) => fetch(url, opts),
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
   * 執行帶重試的 SDK 操作
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

    let attempt = 0;
    let lastError = null;

    while (attempt <= maxRetries) {
      try {
        return await operation(client);
      } catch (error) {
        lastError = error;

        // 詳細記錄錯誤供除錯使用
        Logger.error('[NotionService] 執行出錯', {
          action: label,
          operation: 'executeWithRetry',
          message: error.message,
          code: error.code,
          status: error.status,
          name: error.name,
        });

        // 檢查是否為可重試錯誤

        // SDK 錯誤代碼: rate_limited (429), internal_server_error (500), service_unavailable (503)
        // 另外處理 409 conflict
        const isRateLimit = error.status === 429 || error.code === 'rate_limited';
        const isServerErr =
          error.status >= 500 ||
          ['internal_server_error', 'service_unavailable'].includes(error.code);
        const isConflict = error.status === 409 || error.code === 'conflict_error';
        const isRetriableMessage = /unsaved transactions|datastoreinfraerror/i.test(error.message);

        const shouldRetry = isRateLimit || isServerErr || isConflict || isRetriableMessage;

        if (attempt < maxRetries && shouldRetry) {
          // 計算延遲 (指數退避 + Jitter)
          const jitter = this._getJitter(200);
          const delay = baseDelay * Math.pow(2, attempt) + jitter;

          Logger.warn(`[NotionService] ${label} 失敗，將重試`, {
            action: label,
            operation: 'retry',
            attempt: attempt + 1,
            maxRetries,
            error: error.code || error.message,
            delay,
          });

          await sleep(delay);
          attempt++;
          continue;
        }

        // 不可重試或重試耗盡
        throw lastError;
      }
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

    return await this._executeWithRetry(
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
   * 獲取隨機抖動 (Jitter)
   * 使用加密安全隨機數生成器並消除模數偏差 (Modulo Bias)
   *
   * @param {number} max - 最大值 (不包含)
   * @returns {number} 隨機整數
   * @private
   */
  _getJitter(max) {
    try {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        // 修正模數偏差 (Modulo Bias)
        // 使用拒絕採樣 (Rejection Sampling) 確保隨機性均勻分布
        // Uint32 的最大值為 2^32 - 1 = 4294967295
        // 總共有 2^32 = 4294967296 個可能的隨機值
        const totalValues = 4_294_967_296;
        const limit = totalValues - (totalValues % max);
        const array = new Uint32Array(1);

        let randomInt;
        do {
          crypto.getRandomValues(array);
          randomInt = array[0];
        } while (randomInt >= limit);

        return randomInt % max;
      }
    } catch (error) {
      // 僅在加密環境不可用時回退
      Logger.debug('[NotionService] 加密隨機數生成不可用，回退至 Math.random', {
        error: error.message,
      });
    }
    // eslint-disable-next-line sonarjs/pseudo-random
    return Math.floor(Math.random() * max);
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

      // 2025-09-03 API 使用 'data_source' 而非 'database'
      if (filter) {
        searchParams.filter = filter;
      }

      const response = await this._executeWithRetry(client => client.search(searchParams), {
        ...options,
        label: 'Search',
      });

      return response;
    } catch (error) {
      Logger.error('[NotionService] 搜索失敗', {
        action: 'search',
        error: error.message,
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
        const response = await this._executeWithRetry(
          client =>
            client.blocks.children.list({
              block_id: pageId,
              page_size: this.config.PAGE_SIZE,
              start_cursor: startCursor,
            }),
          {
            ...options,
            maxRetries: this.config.CHECK_RETRIES,
            baseDelay: this.config.CHECK_DELAY,
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
   * 找出標記區域的區塊 ID
   *
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
        // 收集所有非標題類型的區塊（包含 paragraph, quote, callout 等）
        blocksToDelete.push(block.id);
      }
    }

    return blocksToDelete;
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
    const {
      DELETE_CONCURRENCY: CONCURRENCY,
      DELETE_BATCH_DELAY_MS,
      DELETE_RETRIES,
      DELETE_DELAY,
    } = this.config;
    const errors = [];
    let successCount = 0;

    // 刪除單個區塊的函數
    const deleteBlock = async blockId => {
      try {
        await this._executeWithRetry(client => client.blocks.delete({ block_id: blockId }), {
          ...options,
          maxRetries: DELETE_RETRIES,
          baseDelay: DELETE_DELAY,
          label: 'DeleteBlock',
        });

        return { success: true, id: blockId };
      } catch (deleteError) {
        const errorText = deleteError.message || 'Unknown error';
        Logger.warn('[NotionService] 刪除區塊異常', {
          action: 'deleteAllBlocks',
          operation: 'deleteBlock',
          blockId,
          error: errorText,
        });
        return { success: false, id: blockId, error: errorText };
      }
    };

    // 分批並發處理（每批 CONCURRENCY 個）
    for (let i = 0; i < blockIds.length; i += CONCURRENCY) {
      const batch = blockIds.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(id => deleteBlock(id)));

      for (const result of results) {
        if (result.success) {
          successCount++;
        } else {
          errors.push({ id: result.id, error: result.error });
        }
      }

      // 批次間延遲：確保符合 Notion API 限制
      if (i + CONCURRENCY < blockIds.length) {
        await sleep(DELETE_BATCH_DELAY_MS);
      }
    }

    return { successCount, failureCount: errors.length, errors };
  }

  /**
   * 過濾有效的圖片區塊
   * 委託給 imageUtils.filterNotionImageBlocks 處理，保留日誌輸出
   *
   * @param {Array} blocks - 區塊數組
   * @param {boolean} excludeImages - 是否排除所有圖片（重試模式）
   * @returns {{validBlocks: Array, skippedCount: number}}
   */
  filterValidImageBlocks(blocks, excludeImages = false) {
    // 防禦性檢查：確保 filterNotionImageBlocks 存在
    if (typeof filterNotionImageBlocks !== 'function') {
      Logger.error('[NotionService] filterNotionImageBlocks 不可用', {
        action: 'filterValidImageBlocks',
        operation: 'checkDependency',
        error: 'filterNotionImageBlocks is not available',
      });
      return { validBlocks: blocks ?? [], skippedCount: 0 };
    }

    const { validBlocks, skippedCount, invalidReasons } = filterNotionImageBlocks(
      blocks,
      excludeImages
    );

    // 日誌輸出（保留原有行為）
    if (excludeImages && skippedCount > 0) {
      Logger.info('[NotionService] 重試模式排除所有圖片', {
        action: 'filterValidImageBlocks',
        excludeImages: true,
        skippedCount,
      });
    }

    if (skippedCount > 0 && !excludeImages) {
      Logger.info('[NotionService] 過濾圖片區塊', {
        action: 'filterValidImageBlocks',
        skippedCount,
        totalBlocks: blocks.length,
      });
    }

    // 詳細日誌（供調試，設定上限避免日誌爆炸）
    const MAX_DETAILED_LOGS = 5;
    const loggedCount = Math.min(invalidReasons.length, MAX_DETAILED_LOGS);

    for (let i = 0; i < loggedCount; i++) {
      const reason = invalidReasons[i];
      switch (reason.reason) {
        case 'invalid_structure': {
          Logger.warn('[NotionService] 跳過無效區塊', {
            action: 'filterValidImageBlocks',
            reason: 'invalid_structure',
            detail: 'missing type or type property',
          });

          break;
        }
        case 'missing_url': {
          Logger.warn('[NotionService] 跳過無 URL 圖片', {
            action: 'filterValidImageBlocks',
            reason: 'missing_url',
          });

          break;
        }
        case 'invalid_url': {
          Logger.warn('[NotionService] 跳過無效 URL 圖片', {
            action: 'filterValidImageBlocks',
            reason: 'invalid_url',
            url: sanitizeUrlForLogging(reason.url),
          });

          break;
        }
        // No default
      }
    }

    // 如有更多問題，輸出摘要
    if (invalidReasons.length > MAX_DETAILED_LOGS) {
      Logger.warn('[NotionService] 更多區塊被跳過', {
        action: 'filterValidImageBlocks',
        additionalSkipped: invalidReasons.length - MAX_DETAILED_LOGS,
      });
    }

    return { validBlocks, skippedCount };
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
      const response = await this._executeWithRetry(
        client => client.pages.retrieve({ page_id: pageId }),
        {
          ...options,
          maxRetries: this.config.CHECK_RETRIES,
          baseDelay: this.config.CHECK_DELAY,
          label: 'CheckPage',
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
        error: error.message,
      });
      return null;
    }
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
    const { BLOCKS_PER_BATCH, CREATE_RETRIES, CREATE_DELAY, RATE_LIMIT_DELAY } = this.config;
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
        const batchNumber = Math.floor((i - startIndex) / BLOCKS_PER_BATCH) + 1;
        const totalBatches = Math.ceil(totalBlocks / BLOCKS_PER_BATCH);

        Logger.info('[NotionService] 發送批次', {
          action: 'appendBlocksInBatches',
          batchNumber,
          totalBatches,
          batchSize: batch.length,
        });

        await this._executeWithRetry(
          client =>
            client.blocks.children.append({
              block_id: pageId,
              children: batch,
            }),
          {
            ...options,
            maxRetries: CREATE_RETRIES,
            baseDelay: CREATE_DELAY,
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
        error: error.message,
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
      const response = await this._executeWithRetry(client => client.pages.create(pageData), {
        ...options,
        maxRetries: this.config.CREATE_RETRIES,
        baseDelay: this.config.CREATE_DELAY,
        label: 'CreatePage',
      });

      const result = {
        success: true,
        pageId: response.id,
        url: response.url,
      };

      // 自動批次添加超過 100 的區塊
      if (autoBatch && allBlocks.length > 100) {
        Logger.info('[NotionService] 超長文章批次添加', {
          action: 'createPage',
          phase: 'autoBatch',
          totalBlocks: allBlocks.length,
        });
        const appendResult = await this.appendBlocksInBatches(response.id, allBlocks, 100, options);
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
      Logger.error('[NotionService] 創建頁面失敗', { action: 'createPage', error: error.message });
      return { success: false, error: sanitizeApiError(error, 'create_page') };
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
      await this._executeWithRetry(
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
          maxRetries: this.config.CREATE_RETRIES,
          baseDelay: this.config.CREATE_DELAY,
          label: 'UpdateTitle',
        }
      );

      return { success: true };
    } catch (error) {
      Logger.error('[NotionService] 更新標題失敗', {
        action: 'updatePageTitle',
        error: error.message,
      });
      return { success: false, error: sanitizeApiError(error, 'update_title') };
    }
  }

  /**
   * 刪除頁面所有區塊
   *
   * @param {string} pageId - 頁面 ID
   * @param {object} [options] - 其他選項 (含 apiKey)
   * @returns {Promise<{success: boolean, deletedCount: number, error?: string}>}
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
        error: error.message,
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
   * @param {string} options.dataSourceType - 類型 ('database' 或 'page')
   * @param {Array} options.blocks - 內容區塊 (最多取前 100 個)
   * @param {string} [options.siteIcon] - 網站 Icon URL
   * @param {boolean} [options.excludeImages] - 是否排除圖片
   * @returns {{pageData: object, validBlocks: Array, skippedCount: number}}
   */
  buildPageData(options) {
    const {
      title,
      pageUrl,
      dataSourceId,
      dataSourceType = 'database',
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
          url: pageUrl || '', // 符合現有測試預期
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
   *
   * @param {string} pageId - Notion 頁面 ID
   * @param {Array} newBlocks - 新的內容區塊
   * @param {object} [options] - 選項
   * @param {boolean} [options.excludeImages] - 是否排除圖片
   * @param {boolean} [options.updateTitle] - 是否同時更新標題
   * @param {string} [options.title] - 新標題（當 updateTitle 為 true 時）
   * @param {string} [options.apiKey] - 臨時 API Key
   * @returns {Promise<{success: boolean, addedCount?: number, deletedCount?: number, error?: string}>}
   */
  async refreshPageContent(pageId, newBlocks, options = {}) {
    const { excludeImages = false, updateTitle = false, title = '' } = options;

    try {
      // 過濾有效區塊
      const { validBlocks, skippedCount } = this.filterValidImageBlocks(newBlocks, excludeImages);

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
      if (!deleteResult.success) {
        return {
          success: false,
          error: deleteResult.error,
          errorType: 'notion_api',
          details: {
            phase: 'delete_existing',
            deletedCount: deleteResult.deletedCount,
            totalFailures: deleteResult.failureCount,
          },
        };
      }

      // 步驟 3: 添加新區塊
      const appendResult = await this.appendBlocksInBatches(pageId, validBlocks, 0, options);

      return {
        success: appendResult.success,
        addedCount: appendResult.addedCount,
        deletedCount: deleteResult.deletedCount,
        skippedImageCount: skippedCount,
        error: appendResult.error,
      };
    } catch (error) {
      Logger.error('[NotionService] 刷新頁面內容失敗', {
        action: 'refreshPageContent',
        error: error.message,
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
      const { successCount: deletedCount, errors: deleteErrors } = await this._deleteBlocksByIds(
        blocksToDelete,
        options
      );

      if (deleteErrors.length > 0) {
        Logger.warn('[NotionService] 部分標記區塊刪除失敗', {
          action: 'updateHighlightsSection',
          phase: 'delete',
          failureCount: deleteErrors.length,
          errors: deleteErrors,
        });
      }
      Logger.info('[NotionService] 刪除舊標記區塊', {
        action: 'updateHighlightsSection',
        phase: 'delete',
        deletedCount,
        totalCount: blocksToDelete.length,
      });

      // 步驟 4: 添加新的標記區塊
      if (highlightBlocks.length > 0) {
        const response = await this._executeWithRetry(
          client =>
            client.blocks.children.append({
              block_id: pageId,
              children: highlightBlocks,
            }),
          {
            ...options,
            maxRetries: this.config.CREATE_RETRIES,
            baseDelay: this.config.CREATE_DELAY,
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
        error: error.message,
      });
      return {
        success: false,
        error: sanitizeApiError(error, 'update_highlights'),
        errorType: 'internal',
        details: { phase: 'catch_all' },
      };
    }
  }
}

// 導出
export { NotionService };
export { NOTION_CONFIG } from '../../config/index.js';
