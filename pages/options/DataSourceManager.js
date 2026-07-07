/**
 * DataSourceManager.js
 * 負責資料來源清單的載入、篩選與選擇邏輯
 */
import { SearchableDatabaseSelector } from './SearchableDatabaseSelector.js';
import Logger from '../../scripts/utils/Logger.js';
import { RUNTIME_ACTIONS } from '../../scripts/config/shared/runtimeActions.js';
import { sanitizeApiError } from '../../scripts/utils/ApiErrorSanitizer.js';
import { ErrorHandler } from '../../scripts/utils/ErrorHandler.js';
import { UI_MESSAGES } from '../../scripts/config/shared/messages.js';

const MAX_SEARCH_RESULTS = 100;
const MESSAGE_TIMEOUT_MS = 30_000; // 30 seconds

const VALID_OBJECT_TYPES = new Set(['page', 'database', 'data_source']);
const DB_OBJECT_TYPES = new Set(['database', 'data_source']);
const DB_CHILD_PARENT_TYPES = new Set(['database_id', 'data_source_id']);

/**
 * 判斷物件是否為支援的 Notion 物件類型
 *
 * @param {object} item - Notion 物件項目
 * @returns {boolean} 是否為支援的類型
 */
function isValidObjectType(item) {
  return VALID_OBJECT_TYPES.has(item.object);
}

/**
 * 判斷物件是否為資料庫或資料來源
 *
 * @param {object} item - Notion 物件項目
 * @returns {boolean} 是否為資料庫或資料來源
 */
function isDatabaseOrDataSource(item) {
  return DB_OBJECT_TYPES.has(item.object);
}

/**
 * 判斷頁面是否為資料庫子頁面
 *
 * @param {object} page - Notion 頁面物件
 * @returns {boolean} 是否為資料庫子頁面
 */
function isDbChildPage(page) {
  const parentType = page.parent?.type;
  return DB_CHILD_PARENT_TYPES.has(parentType);
}

/**
 * 根據物件特徵，決定其分類桶名稱
 *
 * @param {object} item - Notion 物件項目
 * @returns {string} 分類桶名稱
 */
function resolveCategoryBucket(item) {
  if (isDatabaseOrDataSource(item)) {
    return DataSourceManager.hasUrlProperty(item) ? 'urlDataSources' : 'otherDataSources';
  }

  if (item.object === 'page') {
    const parentType = item.parent?.type;
    if (parentType === 'workspace') {
      return 'workspacePages';
    }
    if (parentType === 'page_id') {
      return 'categoryPages';
    }
  }

  return 'otherPages';
}

/**
 * 資料來源管理器
 * 負責從 Notion API 載入、篩選和處理資料來源與頁面清單
 */
export class DataSourceManager {
  /**
   * 建構資料來源管理器
   *
   * @param {object} uiManager - UI 管理器實例
   * @param {Function} getApiKey - 取得 API Key 的函式（必填）
   */
  constructor(uiManager, getApiKey) {
    if (typeof getApiKey !== 'function') {
      throw new TypeError('DataSourceManager 需要 getApiKey 函式');
    }
    this.ui = uiManager;
    this.getApiKey = getApiKey;
    this.selector = null;
    this.elements = {};
  }

  init() {
    this.elements.dataSourceIdInput = document.querySelector('#database-id');
  }

  /**
   * 載入資料來源列表（支援頁面和資料來源）
   *
   * @param {string} apiKey - Notion API Key
   * @param {string|null} query - 可選的搜尋關鍵字
   * @returns {Promise<Array>} 過濾後的資料來源列表
   */

  async loadDataSources(apiKey, query = null) {
    if (!apiKey) {
      Logger.warn('[DataSource] loadDataSources 呼叫時未提供 API Key，忽略請求');
      return [];
    }
    const isSearchQuery = Boolean(query);

    try {
      this._showLoadingStatus(query);

      const params = this._prepareSearchParams(query);
      const response = await this._fetchFromNotion(apiKey, params);

      if (response?.success) {
        return this._handleLoadSuccess(response.data, query, isSearchQuery);
      }

      this._handleLoadFailure(response, query, isSearchQuery);
    } catch (error) {
      this._handleLoadError(error);
    }
    return [];
  }

  /**
   * 顯示載入狀態
   *
   * @param {string|null} query - 搜尋關鍵字
   * @private
   */
  _showLoadingStatus(query) {
    const statusMessage = query
      ? UI_MESSAGES.DATA_SOURCE.SEARCHING(query)
      : UI_MESSAGES.DATA_SOURCE.LOADING;
    this.ui.showStatus(statusMessage, 'info');

    Logger.start('[DataSource] 開始載入保存目標', {
      action: 'loadDataSources',
      hasApiKey: true, // 此方法僅在 apiKey 驗證後呼叫（Line 45-48）
      query: query || null,
    });
  }

  /**
   * 準備搜尋參數
   *
   * @param {string|null} query - 搜尋關鍵字
   * @returns {object} 搜尋參數
   * @private
   */
  _prepareSearchParams(query) {
    const params = { page_size: MAX_SEARCH_RESULTS };
    if (query) {
      params.query = query;
    } else {
      params.sort = {
        direction: 'descending',
        timestamp: 'last_edited_time',
      };
    }
    return params;
  }

  /**
   * 從 Notion 載入資料
   *
   * @param {string} apiKey - API Key
   * @param {object} params - 搜尋參數
   * @returns {Promise<object>} 背景腳本的回應
   * @private
   */
  async _fetchFromNotion(apiKey, params) {
    return new Promise(resolve => {
      let resolved = false;

      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({
            success: false,
            error: 'Extension messaging timeout',
          });
        }
      }, MESSAGE_TIMEOUT_MS);

      chrome.runtime.sendMessage(
        {
          action: RUNTIME_ACTIONS.SEARCH_NOTION,
          apiKey,
          searchParams: params,
        },
        response => {
          clearTimeout(timeoutId);
          // 必須先讀取 lastError 以清除 "Unchecked runtime.lastError" 警告
          const lastError = chrome.runtime.lastError;

          if (!resolved) {
            resolved = true;
            if (lastError) {
              resolve({
                success: false,
                error: lastError.message || 'Messaging error',
              });
            } else {
              resolve(
                response || {
                  success: false,
                  error: 'No response from background script',
                }
              );
            }
          }
        }
      );
    });
  }

  /**
   * 處理載入成功
   *
   * @param {object} data - API 返回的資料
   * @param {string|null} query - 搜尋關鍵字
   * @param {boolean} isSearchQuery - 是否為搜尋請求
   * @returns {Array} 過濾後的結果
   * @private
   */
  _handleLoadSuccess(data, query, isSearchQuery) {
    Logger.success('[DataSource] API 返回結果', {
      action: 'loadDataSources',
      count: data.results?.length || 0,
    });

    if (data.results?.length > 0) {
      const filteredResults = DataSourceManager.filterAndSortResults(
        data.results,
        MAX_SEARCH_RESULTS,
        isSearchQuery
      );

      if (filteredResults.length > 0) {
        this.populateDataSourceSelect(filteredResults, isSearchQuery);
        return filteredResults;
      }
    }

    this._handleNoResults(query, isSearchQuery);
    return [];
  }

  /**
   * 處理無結果情況
   *
   * @param {string|null} query - 搜尋關鍵字
   * @param {boolean} isSearchQuery - 是否為搜尋請求
   * @private
   */
  _handleNoResults(query, isSearchQuery) {
    const msg = isSearchQuery
      ? UI_MESSAGES.DATA_SOURCE.NO_RESULT(query)
      : UI_MESSAGES.DATA_SOURCE.NO_DATA_SOURCE_FOUND;

    this.ui.showStatus(msg, isSearchQuery ? 'info' : 'error');
  }

  /**
   * 處理 API 失敗
   *
   * @param {object} response - background 的錯誤回應
   * @param {string|null} query - 搜尋關鍵字
   * @param {boolean} isSearchQuery - 是否為搜尋請求
   * @private
   */
  _handleLoadFailure(response, query, isSearchQuery) {
    const rawError = response?.error;

    // 安全地處理錯誤訊息，避免洩漏 API 細節
    const safeError = sanitizeApiError(rawError, 'load_data_sources_api');
    const errorMsg = ErrorHandler.formatUserMessage(safeError);

    Logger.error('[DataSource] API 載入保存目標失敗', {
      action: 'loadDataSources',
      error: safeError,
      isSearchQuery,
    });
    this.ui.showStatus(UI_MESSAGES.DATA_SOURCE.LOAD_FAILED(errorMsg), 'error');
  }

  /**
   * 處理執行階段錯誤
   *
   * @param {Error} error - 錯誤對象
   * @private
   */
  _handleLoadError(error) {
    Logger.error('[DataSource] 載入保存目標執行錯誤', {
      action: 'loadDataSources',
      error: error.message,
    });
    const safeMessage = sanitizeApiError(error, 'load_data_sources');
    const translated = ErrorHandler.formatUserMessage(safeMessage);
    this.ui.showStatus(UI_MESSAGES.DATA_SOURCE.LOAD_FAILED(translated), 'error');
  }

  populateDataSourceSelect(dataSources, isSearchResult = false) {
    Logger.debug('[DataSource] populateDataSourceSelect 被調用', {
      action: 'populateDataSourceSelect',
      count: dataSources.length,
      isSearchResult,
    });

    const selector = this._getOrCreateSelector();
    selector.populateDataSources(dataSources, isSearchResult);

    this._showPopulateStatus(dataSources.length, isSearchResult);
  }

  /**
   * 取得或建立可搜尋的資料來源選擇器組件
   *
   * @returns {SearchableDatabaseSelector} 可搜尋的資料來源選擇器組件
   * @private
   */
  _getOrCreateSelector() {
    if (!this.selector) {
      this.selector = new SearchableDatabaseSelector({
        showStatus: this.ui.showStatus.bind(this.ui),
        loadDataSources: this.loadDataSources.bind(this),
        getApiKey: this.getApiKey,
      });
    }
    return this.selector;
  }

  /**
   * 顯示資料來源填充狀態
   *
   * @param {number} count - 資料來源數量
   * @param {boolean} isSearchResult - 是否為搜尋結果
   * @private
   */
  _showPopulateStatus(count, isSearchResult) {
    if (count > 0) {
      const message = isSearchResult
        ? UI_MESSAGES.DATA_SOURCE.FOUND_COUNT(count)
        : UI_MESSAGES.DATA_SOURCE.LOAD_SUCCESS(count);
      this.ui.showStatus(message, 'success');
    } else {
      // 防禦性檢查：雖然當前呼叫點已確保非空陣列，但保留此分支以處理未來可能的其他呼叫路徑
      this.ui.showStatus(UI_MESSAGES.DATA_SOURCE.NO_DATA_SOURCE_FOUND, 'error');
    }
  }

  /**
   * 過濾並排序搜尋結果
   *
   * @param {Array} results - 原始搜尋結果
   * @param {number} maxResults - 最大結果數量限制
   * @param {boolean} preserveOrder - 是否保持原始順序
   * @returns {Array} 過濾與排序後的結果
   */
  static filterAndSortResults(results, maxResults = MAX_SEARCH_RESULTS, preserveOrder = false) {
    const validItems = results.filter(
      item => isValidObjectType(item) && !DataSourceManager.isSavedWebPage(item)
    );

    if (preserveOrder) {
      return validItems.slice(0, maxResults);
    }

    const buckets = {
      workspacePages: [],
      urlDataSources: [],
      categoryPages: [],
      otherDataSources: [],
      otherPages: [],
    };

    validItems.forEach(item => {
      const bucketName = resolveCategoryBucket(item);
      buckets[bucketName].push(item);
    });

    return [
      ...buckets.workspacePages,
      ...buckets.urlDataSources,
      ...buckets.categoryPages,
      ...buckets.otherDataSources,
      ...buckets.otherPages,
    ].slice(0, maxResults);
  }

  /**
   * 檢查資料庫或資料來源是否具有 URL 屬性
   *
   * @param {object} dataSource - 資料庫或資料來源物件
   * @returns {boolean} 是否具有 URL 屬性
   */
  static hasUrlProperty(dataSource) {
    if (!isDatabaseOrDataSource(dataSource) || !dataSource.properties) {
      return false;
    }
    return Object.values(dataSource.properties).some(prop => prop.type === 'url');
  }

  /**
   * 判斷頁面是否為已保存的網頁
   *
   * @param {object} page - 頁面物件
   * @returns {boolean} 是否為已保存網頁
   */
  static isSavedWebPage(page) {
    if (page.object !== 'page') {
      return false;
    }

    if (isDbChildPage(page) && page.properties) {
      return Object.values(page.properties).some(prop => prop.type === 'url');
    }
    return false;
  }
}
