/**
 * DataSourceManager.js
 * 負責資料來源清單的載入、篩選與選擇邏輯
 */
import { SearchableDatabaseSelector } from './SearchableDatabaseSelector.js';
import Logger from '../utils/Logger.js';
import { sanitizeApiError } from '../utils/securityUtils.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { UI_MESSAGES } from '../config/index.js';

/**
 * 資料來源管理器
 * 負責從 Notion API 載入、篩選和處理資料來源與頁面清單
 */
export class DataSourceManager {
  constructor(uiManager) {
    this.ui = uiManager;
    this.selector = null;
    this.elements = {};
  }

  init() {
    this.elements.dataSourceSelect = document.querySelector('#database-select');
    this.elements.dataSourceIdInput = document.querySelector('#database-id');

    // 綁定舊的選擇框邏輯（回退用）
    if (this.elements.dataSourceSelect) {
      this.elements.dataSourceSelect.addEventListener('change', () =>
        this.handleDataSourceSelect()
      );
    }
  }

  handleDataSourceSelect() {
    if (this.elements.dataSourceSelect?.value) {
      if (this.elements.dataSourceIdInput) {
        this.elements.dataSourceIdInput.value = this.elements.dataSourceSelect.value;
      }
      this.ui.showStatus(UI_MESSAGES.DATA_SOURCE.SELECT_REMINDER, 'info');
    }
  }

  /**
   * 載入資料來源列表（支援頁面和資料來源）
   *
   * @param {string} apiKey - Notion API Key
   * @param {string|null} query - 可選的搜尋關鍵字
   * @returns {Promise<Array>} 過濾後的資料來源列表
   */
  async loadDataSources(apiKey, query = null) {
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
      hasApiKey: true,
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
    const params = { page_size: 100 };
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
      chrome.runtime.sendMessage(
        {
          action: 'searchNotion',
          apiKey,
          query: params.query,
          filter: params.filter,
          sort: params.sort,
          page_size: params.page_size,
        },
        response => {
          if (chrome.runtime.lastError) {
            resolve({
              success: false,
              error: chrome.runtime.lastError.message || 'Messaging error',
            });
          } else {
            resolve(response);
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
        100,
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
    if (this.elements.dataSourceSelect) {
      this.elements.dataSourceSelect.style.display = 'none';
    }
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
      error: rawError,
      isSearchQuery,
    });
    this.ui.showStatus(UI_MESSAGES.DATA_SOURCE.LOAD_FAILED(errorMsg), 'error');
    if (this.elements.dataSourceSelect) {
      this.elements.dataSourceSelect.style.display = 'none';
    }
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
    if (this.elements.dataSourceSelect) {
      this.elements.dataSourceSelect.style.display = 'none';
    }
  }

  populateDataSourceSelect(dataSources, isSearchResult = false) {
    Logger.debug('[DataSource] populateDataSourceSelect 被調用', {
      action: 'populateDataSourceSelect',
      count: dataSources.length,
      isSearchResult,
    });

    if (!this.selector) {
      this.selector = new SearchableDatabaseSelector({
        showStatus: this.ui.showStatus.bind(this.ui),
        loadDataSources: this.loadDataSources.bind(this),
        getApiKey: () => document.querySelector('#api-key')?.value || '',
      });
    }

    this.selector.populateDataSources(dataSources, isSearchResult);

    if (this.elements.dataSourceSelect) {
      this.elements.dataSourceSelect.style.display = 'none';
      this.elements.dataSourceSelect.innerHTML = '';
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = UI_MESSAGES.DATA_SOURCE.DEFAULT_OPTION;
      this.elements.dataSourceSelect.append(defaultOption);

      dataSources.forEach(ds => {
        const option = document.createElement('option');
        option.value = ds.id;
        const title = SearchableDatabaseSelector.extractDataSourceTitle(ds);
        option.textContent = title;
        this.elements.dataSourceSelect.append(option);
      });
    }

    if (dataSources.length > 0) {
      this.ui.showStatus(UI_MESSAGES.DATA_SOURCE.FOUND_COUNT(dataSources.length), 'success');
    } else {
      this.ui.showStatus(UI_MESSAGES.DATA_SOURCE.NO_DATA_SOURCE_FOUND, 'error');
    }
  }

  static filterAndSortResults(results, maxResults = 100, preserveOrder = false) {
    const validItems = [];

    for (const item of results) {
      if (item.object !== 'page' && item.object !== 'database' && item.object !== 'data_source') {
        continue;
      }
      if (DataSourceManager.isSavedWebPage(item)) {
        continue;
      }
      validItems.push(item);
    }

    if (preserveOrder) {
      return validItems.slice(0, maxResults);
    }

    const workspacePages = [];
    const urlDataSources = [];
    const categoryPages = [];
    const otherDataSources = [];
    const otherPages = [];

    validItems.forEach(item => {
      if (item.object === 'database' || item.object === 'data_source') {
        if (DataSourceManager.hasUrlProperty(item)) {
          urlDataSources.push(item);
        } else {
          otherDataSources.push(item);
        }
      } else if (item.object === 'page') {
        if (item.parent?.type === 'workspace') {
          workspacePages.push(item);
        } else if (item.parent?.type === 'page_id') {
          categoryPages.push(item);
        } else {
          otherPages.push(item);
        }
      }
    });

    return [
      ...workspacePages,
      ...urlDataSources,
      ...categoryPages,
      ...otherDataSources,
      ...otherPages,
    ].slice(0, maxResults);
  }

  static hasUrlProperty(dataSource) {
    if (
      (dataSource.object !== 'database' && dataSource.object !== 'data_source') ||
      !dataSource.properties
    ) {
      return false;
    }
    return Object.values(dataSource.properties).some(prop => prop.type === 'url');
  }

  static isSavedWebPage(page) {
    if (page.object !== 'page') {
      return false;
    }

    // 檢查頁面是否為資料庫或 DataSource 的子項目
    // 'database_id': 標準 Notion Database 子頁面（最常見）
    // 'data_source_id': DataSource 類型子頁面
    const parentType = page.parent?.type;
    const isDbChildPage = parentType === 'database_id' || parentType === 'data_source_id';

    if (isDbChildPage && page.properties) {
      return Object.entries(page.properties).some(([key, prop]) => {
        return key.toLowerCase().includes('url') || prop.type === 'url';
      });
    }
    return false;
  }
}
