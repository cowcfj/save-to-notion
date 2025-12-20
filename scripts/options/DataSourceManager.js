/**
 * DataSourceManager.js
 * 負責資料庫清單的載入、篩選與選擇邏輯
 */
import { SearchableDatabaseSelector } from './SearchableDatabaseSelector.js';
import Logger from '../utils/Logger.js';

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
   */
  async loadDatabases(apiKey) {
    try {
      this.ui.showStatus('正在載入保存目標列表...', 'info');
      this.ui.showStatus('正在載入保存目標列表...', 'info');
      Logger.info(`開始載入保存目標，API Key: ${apiKey.substring(0, 20)}...`);

      const response = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2025-09-03',
        },
        body: JSON.stringify({
          page_size: 100,
          sort: {
            direction: 'descending',
            timestamp: 'last_edited_time',
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();

        Logger.info(`API 返回 ${data.results?.length || 0} 個項目`);

        if (data.results && data.results.length > 0) {
          // 客戶端智能篩選和排序
          const filteredResults = this.filterAndSortResults(data.results, 100);

          if (filteredResults.length > 0) {
            this.populateDatabaseSelect(filteredResults);
          } else {
            this.ui.showStatus(
              '未找到可用的保存目標。請確保：1) API Key 正確 2) Integration 已連接到頁面或資料來源',
              'error'
            );
            if (this.elements.databaseSelect) {
              this.elements.databaseSelect.style.display = 'none';
            }
          }
        } else {
          this.ui.showStatus(
            '未找到任何保存目標。請確保：1) API Key 正確 2) Integration 已連接到頁面或資料來源',
            'error'
          );
          if (this.elements.databaseSelect) {
            this.elements.databaseSelect.style.display = 'none';
          }
        }
      } else {
        const errorData = await response.json();
        Logger.error('API 錯誤:', errorData);

        let errorMessage = '載入保存目標失敗: ';
        if (response.status === 401) {
          errorMessage += 'API Key 無效或已過期';
        } else if (response.status === 403) {
          errorMessage += 'API Key 沒有足夠的權限';
        } else {
          errorMessage += errorData.message || `HTTP ${response.status}`;
        }

        this.ui.showStatus(errorMessage, 'error');
        if (this.elements.databaseSelect) {
          this.elements.databaseSelect.style.display = 'none';
        }
      }
    } catch (error) {
      Logger.error('載入保存目標失敗:', error);

      let errorMessage = '載入保存目標失敗: ';
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        errorMessage += '網絡連接問題，請檢查網絡連接';
      } else {
        errorMessage += error.message;
      }

      this.ui.showStatus(errorMessage, 'error');
      if (this.elements.databaseSelect) {
        this.elements.databaseSelect.style.display = 'none';
      }
    }
  }

  populateDatabaseSelect(databases) {
    Logger.info('populateDatabaseSelect 被調用，資料來源數量:', databases.length);

    // 初始化搜索式選擇器（如果還沒有）
    if (!this.selector) {
      this.selector = new SearchableDatabaseSelector({
        showStatus: this.ui.showStatus.bind(this.ui),
        loadDatabases: this.loadDatabases.bind(this),
      });
    }

    // 使用新的搜索式選擇器
    this.selector.populateDatabases(databases);

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

  filterAndSortResults(results, maxResults = 100) {
    Logger.info(`開始篩選 ${results.length} 個項目，目標: ${maxResults} 個`);

    const workspacePages = [];
    const urlDatabases = [];
    const categoryPages = [];
    const otherDatabases = [];
    const otherPages = [];

    let excludedCount = 0;

    results.forEach(item => {
      if (item.object !== 'page' && item.object !== 'data_source') {
        return;
      }

      if (DataSourceManager.isSavedWebPage(item)) {
        excludedCount++;
        return;
      }

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
