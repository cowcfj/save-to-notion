/**
 * SearchableDatabaseSelector.js
 * 可搜索的資料來源選擇器 UI 組件
 */

import Logger from '../utils/Logger.js';
import { UI_ICONS } from '../config/index.js';

/**
 * 可搜索的資料來源選擇器組件
 * 提供帶有搜索功能的下拉選單，用於選擇保存目標（Page 或 Database）
 */
export class SearchableDatabaseSelector {
  constructor(dependencies = {}) {
    const { showStatus, loadDatabases, getApiKey } = dependencies;

    if (typeof showStatus !== 'function') {
      throw new Error('SearchableDatabaseSelector 需要 showStatus 函式');
    }
    if (typeof loadDatabases !== 'function') {
      throw new Error('SearchableDatabaseSelector 需要 loadDatabases 函式');
    }
    if (typeof getApiKey !== 'function') {
      throw new Error('SearchableDatabaseSelector 需要 getApiKey 函式');
    }

    this.showStatus = showStatus;
    this.loadDatabases = loadDatabases;
    this.getApiKey = getApiKey;
    this.databases = [];
    this.initialDatabases = []; // 儲存初始列表，用於清空搜尋時還原
    this.filteredDatabases = [];
    this.selectedDatabase = null;
    this.isOpen = false;
    this.focusedIndex = -1;
    this.searchTimeout = null; // 防抖動計時器
    this.isSearching = false; // 搜尋狀態標記

    this.initializeElements();
    this.setupEventListeners();
  }

  initializeElements() {
    this.container = document.getElementById('database-selector-container');
    this.searchInput = document.getElementById('database-search');
    this.toggleButton = document.getElementById('selector-toggle');
    this.dropdown = document.getElementById('database-dropdown');
    this.databaseList = document.getElementById('database-list');
    this.databaseCount = document.getElementById('database-count');
    this.refreshButton = document.getElementById('refresh-databases');
    this.databaseIdInput = document.getElementById('database-id');

    Logger.info('SearchableDatabaseSelector 元素初始化:', {
      container: this.container,
      searchInput: this.searchInput,
      toggleButton: this.toggleButton,
      dropdown: this.dropdown,
      databaseList: this.databaseList,
      databaseCount: this.databaseCount,
      refreshButton: this.refreshButton,
      databaseIdInput: this.databaseIdInput,
    });

    if (!this.container) {
      Logger.error('找不到 database-selector-container 元素！');
    }
    if (!this.searchInput) {
      Logger.error('找不到 database-search 元素！');
    }
  }

  setupEventListeners() {
    // 儲存綁定的事件處理函式以便後續移除
    this._handleSearchInput = event => {
      const query = event.target.value.trim();

      // 清除之前的計時器
      if (this.searchTimeout) {
        clearTimeout(this.searchTimeout);
      }

      // 如果搜尋框為空，立即還原初始列表（無需等待）
      if (!query) {
        this.restoreInitialDatabases();
        this.showDropdown();
        return;
      }

      // 先進行本地過濾（即時回饋）
      this.filterDatabasesLocally(query);
      this.showDropdown();

      // 防抖動：500ms 後觸發伺服器端搜尋
      this.searchTimeout = setTimeout(() => {
        this.performServerSearch(query);
      }, 500);
    };

    this._handleSearchFocus = () => {
      if (this.databases.length > 0) {
        this.showDropdown();
      }
    };

    this._handleToggleClick = event => {
      event.preventDefault();
      this.toggleDropdown();
    };

    this._handleRefreshClick = event => {
      event.preventDefault();
      this.refreshDatabases();
    };

    this._handleDocumentClick = event => {
      if (this.container && !this.container.contains(event.target)) {
        this.hideDropdown();
      }
    };

    this._handleKeydown = event => {
      this.handleKeyNavigation(event);
    };

    // 綁定事件監聽器
    this.searchInput?.addEventListener('input', this._handleSearchInput);
    this.searchInput?.addEventListener('focus', this._handleSearchFocus);
    this.toggleButton?.addEventListener('click', this._handleToggleClick);
    this.refreshButton?.addEventListener('click', this._handleRefreshClick);
    document.addEventListener('click', this._handleDocumentClick);
    this.searchInput?.addEventListener('keydown', this._handleKeydown);
  }

  populateDatabases(databases, isSearchResult = false) {
    // 映射數據，添加類型和父級信息
    const mappedDatabases = databases.map(db => ({
      id: db.id,
      title: SearchableDatabaseSelector.extractDatabaseTitle(db),
      type: db.object, // 'page' 或 'data_source'
      isWorkspace: db.parent?.type === 'workspace', // 是否為工作區直屬項目
      parent: db.parent, // 保留完整父級信息
      raw: db,
      created: db.created_time,
      lastEdited: db.last_edited_time,
    }));

    this.databases = mappedDatabases;

    // 只有非搜尋結果才保存為初始列表
    if (!isSearchResult) {
      this.initialDatabases = [...mappedDatabases];
      Logger.info('已保存初始資料來源列表:', this.initialDatabases.length);
    }

    Logger.info('處理後的保存目標:', this.databases);

    this.filteredDatabases = [...this.databases];
    this.isSearching = false;
    this.updateDatabaseCount();
    this.renderDatabaseList();

    // 顯示選擇器
    if (this.container) {
      this.container.style.display = 'block';
    }

    // 更新搜索框提示
    const pageCount = databases.filter(db => db.object === 'page').length;
    const dsCount = databases.filter(db => db.object === 'data_source').length;
    if (this.searchInput) {
      this.searchInput.placeholder = `搜索 ${databases.length} 個保存目標（${dsCount} 個資料來源 + ${pageCount} 個頁面）`;
    }

    // 如果當前有選中的保存目標，在搜索框中顯示
    if (this.databaseIdInput?.value) {
      const selectedDb = this.databases.find(db => db.id === this.databaseIdInput.value);
      if (selectedDb) {
        if (this.searchInput) {
          this.searchInput.value = selectedDb.title;
        }
        this.selectedDatabase = selectedDb;
      }
    }
  }

  /**
   * 本地過濾資料庫（即時回饋，不觸發 API）
   * @param {string} query - 搜尋關鍵字
   */
  filterDatabasesLocally(query) {
    const lowerQuery = query.toLowerCase().trim();

    if (!lowerQuery) {
      this.filteredDatabases = [...this.databases];
    } else {
      this.filteredDatabases = this.databases.filter(
        db =>
          db.title.toLowerCase().includes(lowerQuery) || db.id.toLowerCase().includes(lowerQuery)
      );
    }

    this.focusedIndex = -1;
    this.updateDatabaseCount();
    this.renderDatabaseList();
  }

  /**
   * 還原初始資料來源列表
   *
   * @performance 使用淺拷貝 (O(n)) 而非深拷貝以提升效能
   * @note 淺拷貝在此情境下是安全的，因為：
   *   1. 資料庫物件在組件內是唯讀的（不會修改物件屬性）
   *   2. 物件僅用於顯示和選擇，不會被外部修改
   *   3. Notion API 每次返回的是新物件，不存在共享引用問題
   */
  restoreInitialDatabases() {
    this.databases = [...this.initialDatabases];
    this.filteredDatabases = [...this.initialDatabases];
    this.isSearching = false;
    this.focusedIndex = -1;
    this.updateDatabaseCount();
    this.renderDatabaseList();
    Logger.info('已還原初始資料來源列表');
  }

  /**
   * 執行伺服器端搜尋
   * @param {string} query - 搜尋關鍵字
   */
  async performServerSearch(query) {
    if (!query || query.length < 2) {
      // 關鍵字太短，不觸發伺服器搜尋
      return;
    }

    const apiKey = this.getApiKey();
    if (!apiKey) {
      Logger.warn('無法執行伺服器端搜尋：缺少 API Key');
      return;
    }

    this.isSearching = true;
    this.showSearchingState(query);

    try {
      // 呼叫 DataSourceManager.loadDatabases 並傳入 query
      await this.loadDatabases(apiKey, query);
      Logger.info(`伺服器端搜尋完成: "${query}"`);
    } catch (error) {
      Logger.error('伺服器端搜尋失敗:', error);
      // 使用安全的錯誤訊息（避免 undefined）
      const errorMessage = error?.message || '未知錯誤';
      this.showStatus(`搜尋失敗: ${errorMessage}`, 'error');
    } finally {
      // 確保在所有路徑下都重置搜尋狀態
      this.isSearching = false;
    }
  }

  /**
   * 顯示搜尋中狀態
   * @param {string} query - 搜尋關鍵字
   */
  showSearchingState(query) {
    if (this.databaseList) {
      this.databaseList.innerHTML = '';

      const container = document.createElement('div');
      container.className = 'loading-state';

      const spinner = document.createElement('div');
      spinner.className = 'spinner';
      container.appendChild(spinner);

      const textSpan = document.createElement('span');
      textSpan.textContent = '正在搜尋「';
      const querySpan = document.createElement('span');
      querySpan.textContent = query;
      textSpan.appendChild(querySpan);
      textSpan.appendChild(document.createTextNode('」...'));
      container.appendChild(textSpan);

      this.databaseList.appendChild(container);
    }
  }

  /**
   * 原有的 filterDatabases 方法（保留兼容性）
   * @deprecated 請使用 filterDatabasesLocally
   */
  filterDatabases(query) {
    this.filterDatabasesLocally(query);
  }

  renderDatabaseList() {
    if (!this.databaseList) {
      return;
    }

    this.databaseList.innerHTML = '';

    if (this.filteredDatabases.length === 0) {
      const noResultsDiv = document.createElement('div');
      noResultsDiv.className = 'no-results';

      const iconSpan = document.createElement('span');
      iconSpan.className = 'icon';
      iconSpan.innerHTML = UI_ICONS.SEARCH;
      noResultsDiv.appendChild(iconSpan);

      const msgDiv = document.createElement('div');
      msgDiv.textContent = '未找到匹配的資料來源';
      noResultsDiv.appendChild(msgDiv);

      const small = document.createElement('small');
      small.textContent = '嘗試使用不同的關鍵字搜索';
      noResultsDiv.appendChild(small);

      this.databaseList.appendChild(noResultsDiv);
      return;
    }

    const fragment = document.createDocumentFragment();

    this.filteredDatabases.forEach((db, index) => {
      const itemElement = this.createDatabaseItem(db, index);
      // 直接綁定點擊事件
      itemElement.addEventListener('click', () => {
        this.selectDatabase(this.filteredDatabases[index]);
      });
      fragment.appendChild(itemElement);
    });

    this.databaseList.appendChild(fragment);
  }

  /**
   * 構建資料庫項目的 DOM 元素
   * @param {Object} db - 資料庫對象
   * @param {number} index - 索引
   * @returns {HTMLElement}
   */
  createDatabaseItem(db, index) {
    const isSelected = this.selectedDatabase && this.selectedDatabase.id === db.id;
    const isFocused = index === this.focusedIndex;

    const itemDiv = document.createElement('div');
    itemDiv.className = 'database-item';
    if (isSelected) {
      itemDiv.classList.add('selected');
    }
    if (isFocused) {
      itemDiv.classList.add('keyboard-focus');
    }

    itemDiv.dataset.index = index;
    itemDiv.dataset.type = db.type;
    itemDiv.dataset.isWorkspace = db.isWorkspace;

    // Row 1: Title and Badges
    const titleRow = document.createElement('div');
    titleRow.className = 'database-title';

    // 搜索關鍵字高亮
    const query = this.searchInput ? this.searchInput.value.trim() : '';
    const highlightedTitleFragment = SearchableDatabaseSelector._createHighlightedText(
      db.title,
      query
    );
    titleRow.appendChild(highlightedTitleFragment);

    // Badges
    if (db.isWorkspace) {
      const badge = document.createElement('span');
      badge.className = 'workspace-badge';
      badge.textContent = '工作區';
      titleRow.appendChild(document.createTextNode(' ')); // Spacer
      titleRow.appendChild(badge);
    }

    const isLikelyContainer = db.type === 'page' && db.parent?.type === 'workspace';
    if (isLikelyContainer) {
      itemDiv.dataset.isContainer = 'true';
      const badge = document.createElement('span');
      badge.className = 'container-badge';
      badge.innerHTML = `${UI_ICONS.WORKSPACE} 容器`;
      titleRow.appendChild(document.createTextNode(' ')); // Spacer
      titleRow.appendChild(badge);
    }

    const isLikelyCategory = db.type === 'page' && db.parent?.type === 'page_id';
    if (isLikelyCategory) {
      itemDiv.dataset.isCategory = 'true';
      const badge = document.createElement('span');
      badge.className = 'category-badge';
      badge.innerHTML = `${UI_ICONS.CATEGORY} 分類`;
      titleRow.appendChild(document.createTextNode(' ')); // Spacer
      titleRow.appendChild(badge);
    }

    itemDiv.appendChild(titleRow);

    // Row 2: Meta Info (Compact)
    const metaRow = document.createElement('div');
    metaRow.className = 'database-meta-compact';

    // Parent 路徑信息
    if (db.parent) {
      let parentIcon = '';
      let parentText = '';

      switch (db.parent.type) {
        case 'workspace':
          parentIcon = UI_ICONS.WORKSPACE;
          parentText = ' 工作區';
          break;
        case 'page_id':
          parentIcon = UI_ICONS.PAGE;
          parentText = ' 子頁面';
          break;
        case 'data_source_id':
        case 'database_id':
          parentIcon = UI_ICONS.DATABASE;
          parentText = ' 資料庫項目';
          break;
        case 'block_id':
          parentIcon = UI_ICONS.BLOCK;
          parentText = ' 區塊項目';
          break;
        default:
          parentText = `❓ 其他 (${db.parent.type})`;
      }

      const parentGroup = document.createElement('span');
      parentGroup.className = 'meta-group';
      parentGroup.innerHTML = parentIcon + parentText;
      metaRow.appendChild(parentGroup);

      const separator = document.createElement('span');
      separator.className = 'meta-separator';
      separator.textContent = '|';
      metaRow.appendChild(separator);
    }

    // Type
    const typeGroup = document.createElement('span');
    typeGroup.className = 'meta-group';

    const typeIconSpan = document.createElement('span');
    typeIconSpan.className = 'database-icon';
    typeIconSpan.innerHTML = db.type === 'page' ? UI_ICONS.PAGE : UI_ICONS.DATABASE;
    typeGroup.appendChild(typeIconSpan);

    const typeLabelSpan = document.createElement('span');
    typeLabelSpan.textContent = db.type === 'page' ? '頁面' : '資料來源';
    typeGroup.appendChild(typeLabelSpan);

    metaRow.appendChild(typeGroup);

    // Separator
    const sep2 = document.createElement('span');
    sep2.className = 'meta-separator';
    sep2.textContent = '|';
    metaRow.appendChild(sep2);

    // ID
    const idGroup = document.createElement('span');
    idGroup.className = 'meta-group';
    idGroup.title = db.id;
    idGroup.textContent = `${db.id.slice(0, 4)}...${db.id.slice(-4)}`;
    metaRow.appendChild(idGroup);

    // Date
    if (db.created) {
      const sep3 = document.createElement('span');
      sep3.className = 'meta-separator';
      sep3.textContent = '|';
      metaRow.appendChild(sep3);

      const dateGroup = document.createElement('span');
      dateGroup.className = 'meta-group';
      dateGroup.textContent = SearchableDatabaseSelector.formatDate(db.created);
      metaRow.appendChild(dateGroup);
    }

    itemDiv.appendChild(metaRow);
    return itemDiv;
  }

  /**
   * 安全地創建帶有搜尋高亮的文字片段 (DOM Node Splitting)
   * @param {string} text - 原始文字
   * @param {string} query - 搜尋關鍵字
   * @returns {DocumentFragment}
   * @static
   * @private
   */
  static _createHighlightedText(text, query) {
    const fragment = document.createDocumentFragment();
    if (!query) {
      fragment.appendChild(document.createTextNode(text));
      return fragment;
    }

    try {
      // 轉義正則特殊字符
      const escapedQuery = SearchableDatabaseSelector.escapeRegex(query);
      // 使用括號包含模式以在 split 結果中保留分隔符 (即匹配到的關鍵字)
      const regex = new RegExp(`(${escapedQuery})`, 'gi');
      const parts = text.split(regex);

      parts.forEach(part => {
        if (part.toLowerCase() === query.toLowerCase()) {
          const span = document.createElement('span');
          span.className = 'search-highlight';
          span.textContent = part;
          fragment.appendChild(span);
        } else if (part) {
          // 對於非關鍵字部分，直接作為文字節點插入（自動轉義）
          fragment.appendChild(document.createTextNode(part));
        }
      });
    } catch (_e) {
      // Fallback in case of regex error
      fragment.appendChild(document.createTextNode(text));
    }

    return fragment;
  }
  selectDatabase(database) {
    this.selectedDatabase = database;

    // 更新搜索框顯示
    if (this.searchInput) {
      this.searchInput.value = database.title;
    }

    // 更新隱藏的資料來源 ID 輸入框
    if (this.databaseIdInput) {
      this.databaseIdInput.value = database.id;

      // 保存類型信息到隱藏字段（用於後續保存）
      const typeInput = document.getElementById('database-type');
      if (typeInput) {
        typeInput.value = database.type;
      } else {
        // 如果不存在，創建隱藏字段
        const newTypeInput = document.createElement('input');
        newTypeInput.type = 'hidden';
        newTypeInput.id = 'database-type';
        newTypeInput.value = database.type;
        this.databaseIdInput.parentNode.appendChild(newTypeInput);
      }
    }

    Logger.info(
      `選擇了 ${database.type === 'page' ? '頁面' : '資料來源'}: ${database.title} (${database.id})`
    );

    // 重新渲染以顯示選中狀態
    this.renderDatabaseList();

    this.hideDropdown();

    // 顯示成功狀態
    const typeLabel = database.type === 'page' ? '頁面' : '資料來源';
    this.showStatus(`已選擇${typeLabel}: ${database.title}`, 'success');

    // 觸發選擇事件（如果需要）
    if (this.onDatabaseSelected) {
      this.onDatabaseSelected(database);
    }
  }

  showDropdown() {
    if (this.dropdown) {
      this.dropdown.style.display = 'block';
    }
    this.isOpen = true;
    this.toggleButton?.classList.add('open');
  }

  hideDropdown() {
    if (this.dropdown) {
      this.dropdown.style.display = 'none';
    }
    this.isOpen = false;
    this.focusedIndex = -1;
    this.toggleButton?.classList.remove('open');
    this.renderDatabaseList(); // 清除鍵盤焦點樣式
  }

  toggleDropdown() {
    if (this.isOpen) {
      this.hideDropdown();
    } else if (this.databases.length > 0) {
      this.showDropdown();
    }
  }

  handleKeyNavigation(event) {
    if (!this.isOpen) {
      if (event.key === 'ArrowDown' || event.key === 'Enter') {
        event.preventDefault();
        this.showDropdown();
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.focusedIndex = Math.min(this.focusedIndex + 1, this.filteredDatabases.length - 1);
        this.renderDatabaseList();
        this.scrollToFocused();
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.focusedIndex = Math.max(this.focusedIndex - 1, -1);
        this.renderDatabaseList();
        this.scrollToFocused();
        break;

      case 'Enter':
        event.preventDefault();
        if (this.focusedIndex >= 0 && this.filteredDatabases[this.focusedIndex]) {
          this.selectDatabase(this.filteredDatabases[this.focusedIndex]);
        }
        break;

      case 'Escape':
        event.preventDefault();
        this.hideDropdown();
        break;

      default:
        // 其他按鍵不處理
        break;
    }
  }

  scrollToFocused() {
    if (this.focusedIndex >= 0 && this.databaseList) {
      const focusedElement = this.databaseList.querySelector('.keyboard-focus');
      if (focusedElement) {
        focusedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  updateDatabaseCount() {
    if (!this.databaseCount) {
      return;
    }
    const total = this.databases.length;
    const filtered = this.filteredDatabases.length;

    if (filtered === total) {
      this.databaseCount.textContent = `${total} 個資料來源`;
    } else {
      this.databaseCount.textContent = `${filtered} / ${total} 個資料來源`;
    }
  }

  refreshDatabases() {
    const apiKey = this.getApiKey();
    if (apiKey) {
      this.showLoading();
      this.loadDatabases(apiKey);
    }
  }

  showLoading() {
    if (this.databaseList) {
      this.databaseList.innerHTML = '';

      const container = document.createElement('div');
      container.className = 'loading-state';

      const spinner = document.createElement('div');
      spinner.className = 'spinner';
      container.appendChild(spinner);

      const span = document.createElement('span');
      span.textContent = '重新載入資料來源中...';
      container.appendChild(span);

      this.databaseList.appendChild(container);
    }
    this.showDropdown();
  }

  /**
   * 提取數據庫或頁面的標題
   */
  static extractDatabaseTitle(db) {
    let title = db.object === 'page' ? '未命名頁面' : '未命名資料來源';

    // 處理 page 對象（標題在 properties.title）
    if (db.object === 'page' && db.properties?.title?.title) {
      const titleContent = db.properties.title.title;
      if (titleContent.length > 0) {
        title = titleContent[0].plain_text || titleContent[0].text?.content || title;
      }
    }
    // 處理 data_source 對象（標題在 title 或 properties）
    else if (db.title && db.title.length > 0) {
      title = db.title[0].plain_text || db.title[0].text?.content || title;
    } else if (db.properties) {
      const titleProp = Object.values(db.properties).find(prop => prop.type === 'title');
      if (titleProp?.title && titleProp.title.length > 0) {
        title = titleProp.title[0].plain_text || titleProp.title[0].text?.content || title;
      }
    }

    return title;
  }

  /**
   * 格式化日期字串
   */
  static formatDate(dateString) {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return '';
      }
      return date.toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch (_e) {
      return '';
    }
  }

  /**
   * 轉義正則表示式中的特殊字符
   */
  static escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 清理組件資源（防止記憶體洩漏）
   * 應在組件銷毀時調用
   */
  destroy() {
    // 清除防抖動計時器
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }

    // 移除事件監聽器（使用儲存的處理函式引用）
    if (this._handleSearchInput) {
      this.searchInput?.removeEventListener('input', this._handleSearchInput);
      this.searchInput?.removeEventListener('focus', this._handleSearchFocus);
      this.searchInput?.removeEventListener('keydown', this._handleKeydown);
      this.toggleButton?.removeEventListener('click', this._handleToggleClick);
      this.refreshButton?.removeEventListener('click', this._handleRefreshClick);
      document.removeEventListener('click', this._handleDocumentClick);

      // 清空處理函式引用以便 GC
      this._handleSearchInput = null;
      this._handleSearchFocus = null;
      this._handleToggleClick = null;
      this._handleRefreshClick = null;
      this._handleDocumentClick = null;
      this._handleKeydown = null;
    }

    // 重置狀態
    this.isSearching = false;
    this.databases = [];
    this.initialDatabases = [];
    this.filteredDatabases = [];
    this.selectedDatabase = null;
  }
}
