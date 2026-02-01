/**
 * DataSourceManager.js
 * 負責資料庫清單的載入、篩選與選擇邏輯
 */
import { SearchableDatabaseSelector } from './SearchableDatabaseSelector.js';
import Logger from '../utils/Logger.js';
import { sanitizeApiError } from '../utils/securityUtils.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';

/**
 * 資料來源管理器
 * 負責從 Notion API 載入、篩選和處理資料庫與頁面清單
 */
export class DataSourceManager {
  constructor(uiManager) {
    this.ui = uiManager;
    this.selector = null;
    this.elements = {};
  }

  init() {
    this.elements.databaseSelect = document.getElementById('database-select');
    this.elements.databaseIdInput = document.getElementById('database-id');

    // 綁定舊的選擇框邏輯（回退用）
    if (this.elements.databaseSelect) {
      this.elements.databaseSelect.addEventListener('change', () => this.handleDatabaseSelect());
    }
  }

  handleDatabaseSelect() {
    if (this.elements.databaseSelect?.value) {
      if (this.elements.databaseIdInput) {
        this.elements.databaseIdInput.value = this.elements.databaseSelect.value;
      }
      this.ui.showStatus('資料來源已選擇，請點擊保存設置', 'info');
    }
  }

  /**
   * 載入資料來源列表（支援頁面和數據庫）
   * @param {string} apiKey - Notion API Key
   * @param {string|null} query - 可選的搜尋關鍵字
   * @returns {Promise<Array>} 過濾後的資料來源列表
   */
  async loadDatabases(apiKey, query = null) {
    const isSearchQuery = Boolean(query);

    try {
      // 狀態訊息中使用純文字格式，showStatus 內部會使用 textContent 防止 XSS
      const statusMessage = query ? `正在搜尋 "${query}"...` : '正在載入保存目標列表...';
      this.ui.showStatus(statusMessage, 'info');
      // 不記錄 API Key 內容以避免敏感資訊洩漏
      Logger.info(`開始載入保存目標，API Key: [已提供], Query: ${query || '(無)'}`);

      // 構建請求主體
      const requestBody = {
        page_size: 100,
      };

      if (query) {
        // 有搜尋關鍵字時，使用 query 參數（Notion API 限制：有 query 時不能使用 sort）
        requestBody.query = query;
      } else {
        // 無搜尋時，按最近編輯時間排序
        requestBody.sort = {
          direction: 'descending',
          timestamp: 'last_edited_time',
        };
      }

      const response = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2025-09-03',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();

        Logger.info(`API 返回 ${data.results?.length || 0} 個項目`);

        if (data.results && data.results.length > 0) {
          // 客戶端智能篩選和排序（搜尋結果保留關聯度排序）
          const filteredResults = DataSourceManager.filterAndSortResults(
            data.results,
            100,
            isSearchQuery
          );

          if (filteredResults.length > 0) {
            this.populateDatabaseSelect(filteredResults, isSearchQuery);
            return filteredResults;
          }
          this.ui.showStatus(
            '未找到可用的保存目標。請確保：1) API Key 正確 2) Integration 已連接到頁面或資料來源',
            'error'
          );
          if (this.elements.databaseSelect) {
            this.elements.databaseSelect.style.display = 'none';
          }
        } else {
          // 狀態訊息使用純文字，避免 XSS 風險
          const msg = isSearchQuery
            ? `未找到 "${query}" 相關的保存目標`
            : '未找到任何保存目標。請確保：1) API Key 正確 2) Integration 已連接到頁面或資料來源';
          this.ui.showStatus(msg, isSearchQuery ? 'info' : 'error');
          if (this.elements.databaseSelect) {
            this.elements.databaseSelect.style.display = 'none';
          }
        }
      } else {
        const errorData = await response.json();
        Logger.error('API 錯誤:', errorData);

        // HTTP 狀態碼到錯誤關鍵字的映射（宣告式，易於擴展）
        const HTTP_ERROR_KEY_MAP = {
          401: 'API Key',
          403: 'Cannot access contents',
          429: 'rate limit',
        };

        const errorKey = HTTP_ERROR_KEY_MAP[response.status] || 'Invalid request';

        const translated = ErrorHandler.formatUserMessage(errorKey);
        this.ui.showStatus(`載入保存目標失敗: ${translated}`, 'error');

        if (this.elements.databaseSelect) {
          this.elements.databaseSelect.style.display = 'none';
        }
      }
    } catch (error) {
      Logger.error('載入保存目標失敗:', error);

      const safeMessage = sanitizeApiError(error, 'load_databases');
      const translated = ErrorHandler.formatUserMessage(safeMessage);
      this.ui.showStatus(`載入保存目標失敗: ${translated}`, 'error');
      if (this.elements.databaseSelect) {
        this.elements.databaseSelect.style.display = 'none';
      }
    }

    return [];
  }

  populateDatabaseSelect(databases, isSearchResult = false) {
    Logger.info(
      'populateDatabaseSelect 被調用，資料來源數量:',
      databases.length,
      '是否為搜尋結果:',
      isSearchResult
    );

    // 初始化搜索式選擇器（如果還沒有）
    if (!this.selector) {
      this.selector = new SearchableDatabaseSelector({
        showStatus: this.ui.showStatus.bind(this.ui),
        loadDatabases: this.loadDatabases.bind(this),
        getApiKey: () => document.getElementById('api-key')?.value || '',
      });
    }

    // 使用新的搜索式選擇器，傳入 isSearchResult 標記
    this.selector.populateDatabases(databases, isSearchResult);

    // 隱藏原有的簡單選擇器
    if (this.elements.databaseSelect) {
      this.elements.databaseSelect.style.display = 'none';
      this.elements.databaseSelect.innerHTML = '<option value="">選擇資料來源...</option>';

      databases.forEach(db => {
        const option = document.createElement('option');
        option.value = db.id;
        const title = SearchableDatabaseSelector.extractDatabaseTitle(db);
        option.textContent = title;
        this.elements.databaseSelect.appendChild(option);
      });
    }

    if (databases.length > 0) {
      this.ui.showStatus(`找到 ${databases.length} 個資料來源，請從下拉選單中選擇`, 'success');
    } else {
      this.ui.showStatus('未找到任何資料來源，請確保 API Key 有權限訪問資料來源', 'error');
    }
  }

  /**
   * 篩選並排序搜索結果
   * @param {Array} results - 原始結果列表
   * @param {number} maxResults - 最大結果數量
   * @param {boolean} preserveOrder - 是否保留原始順序（用於搜尋結果的關聯度排序）
   * @returns {Array} 篩選後的結果
   */
  static filterAndSortResults(results, maxResults = 100, preserveOrder = false) {
    Logger.info(
      `開始篩選 ${results.length} 個項目，目標: ${maxResults} 個，保留順序: ${preserveOrder}`
    );

    // 使用 reduce 同時完成篩選和計數
    // 使用 push 修改累積器陣列（O(n)），而非展開運算子（O(n²)）
    const { validItems, excludedCount } = results.reduce(
      (acc, item) => {
        // 過濾非頁面/資料來源
        if (item.object !== 'page' && item.object !== 'data_source') {
          return acc;
        }

        // 過濾已保存的網頁
        if (DataSourceManager.isSavedWebPage(item)) {
          acc.excludedCount += 1;
          return acc;
        }

        acc.validItems.push(item);
        return acc;
      },
      { validItems: [], excludedCount: 0 }
    );

    // 如果是搜尋結果，保留 Notion API 的關聯度排序
    if (preserveOrder) {
      const filtered = validItems.slice(0, maxResults);
      Logger.info(
        `篩選完成（保留關聯度順序）: ${filtered.length} 個項目（排除 ${excludedCount} 個已保存網頁）`
      );
      return filtered;
    }

    // 否則按類型重新排序（用於初始列表載入）
    const workspacePages = [];
    const urlDatabases = [];
    const categoryPages = [];
    const otherDatabases = [];
    const otherPages = [];

    validItems.forEach(item => {
      if (item.object === 'data_source') {
        if (DataSourceManager.hasUrlProperty(item)) {
          urlDatabases.push(item);
        } else {
          otherDatabases.push(item);
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

    const filtered = [
      ...workspacePages,
      ...urlDatabases,
      ...categoryPages,
      ...otherDatabases,
      ...otherPages,
    ].slice(0, maxResults);

    Logger.info(`篩選完成: ${filtered.length} 個項目（排除 ${excludedCount} 個已保存網頁）`);

    return filtered;
  }

  static hasUrlProperty(database) {
    if (database.object !== 'data_source' || !database.properties) {
      return false;
    }
    return Object.values(database.properties).some(prop => prop.type === 'url');
  }

  static isSavedWebPage(page) {
    if (page.object !== 'page') {
      return false;
    }

    if (page.parent?.type === 'data_source_id') {
      if (page.properties) {
        const hasUrl = Object.entries(page.properties).some(([key, prop]) => {
          return key.toLowerCase().includes('url') || prop.type === 'url';
        });
        if (hasUrl) {
          return true;
        }
      }
      return false;
    }

    return false;
  }
}
