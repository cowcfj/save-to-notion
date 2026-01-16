/**
 * SearchableDatabaseSelector.js
 * 可搜索的資料來源選擇器 UI 組件
 */

import Logger from '../utils/Logger.js';

/**
 * 可搜索的資料來源選擇器組件
 * 提供帶有搜索功能的下拉選單，用於選擇保存目標（Page 或 Database）
 */
export class SearchableDatabaseSelector {
  constructor(dependencies = {}) {
    const { showStatus, loadDatabases } = dependencies;

    if (typeof showStatus !== 'function') {
      throw new Error('SearchableDatabaseSelector 需要 showStatus 函式');
    }
    if (typeof loadDatabases !== 'function') {
      throw new Error('SearchableDatabaseSelector 需要 loadDatabases 函式');
    }

    this.showStatus = showStatus;
    this.loadDatabases = loadDatabases;
    this.databases = [];
    this.filteredDatabases = [];
    this.selectedDatabase = null;
    this.isOpen = false;
    this.focusedIndex = -1;

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
    // 搜索輸入
    this.searchInput?.addEventListener('input', event => {
      this.filterDatabases(event.target.value);
      this.showDropdown();
    });

    // 搜索框焦點事件
    this.searchInput?.addEventListener('focus', () => {
      if (this.databases.length > 0) {
        this.showDropdown();
      }
    });

    // 切換下拉選單
    this.toggleButton?.addEventListener('click', event => {
      event.preventDefault();
      this.toggleDropdown();
    });

    // 重新載入資料來源
    this.refreshButton?.addEventListener('click', event => {
      event.preventDefault();
      this.refreshDatabases();
    });

    // 點擊外部關閉
    document.addEventListener('click', event => {
      if (this.container && !this.container.contains(event.target)) {
        this.hideDropdown();
      }
    });

    // 鍵盤導航
    this.searchInput?.addEventListener('keydown', event => {
      this.handleKeyNavigation(event);
    });
  }

  populateDatabases(databases) {
    // 映射數據，添加類型和父級信息
    this.databases = databases.map(db => ({
      id: db.id,
      title: SearchableDatabaseSelector.extractDatabaseTitle(db),
      type: db.object, // 'page' 或 'data_source'
      isWorkspace: db.parent?.type === 'workspace', // 是否為工作區直屬項目
      parent: db.parent, // 保留完整父級信息
      raw: db,
      created: db.created_time,
      lastEdited: db.last_edited_time,
    }));

    Logger.info('處理後的保存目標:', this.databases);

    this.filteredDatabases = [...this.databases];
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

  filterDatabases(query) {
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

  renderDatabaseList() {
    if (!this.databaseList) {
      return;
    }

    if (this.filteredDatabases.length === 0) {
      this.databaseList.innerHTML = `
                <div class="no-results">
                    <span class="icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-svg"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    </span>
                    <div>未找到匹配的資料來源</div>
                    <small>嘗試使用不同的關鍵字搜索</small>
                </div>
            `;
      return;
    }

    this.databaseList.innerHTML = this.filteredDatabases
      .map((db, index) => this.createDatabaseItemHTML(db, index))
      .join('');

    // 添加點擊事件
    this.databaseList.querySelectorAll('.database-item').forEach((item, index) => {
      item.addEventListener('click', () => {
        this.selectDatabase(this.filteredDatabases[index]);
      });
    });
  }

  createDatabaseItemHTML(db, index) {
    const isSelected = this.selectedDatabase && this.selectedDatabase.id === db.id;
    const isFocused = index === this.focusedIndex;

    // 先轉義 HTML 以防止 XSS
    let highlightedTitle = SearchableDatabaseSelector.escapeHtml(db.title);

    // 然後進行搜索關鍵字高亮
    const query = this.searchInput ? this.searchInput.value.toLowerCase().trim() : '';
    if (query) {
      // 也需要轉義 query 以確保正確匹配已轉義的標題
      const escapedQuery = SearchableDatabaseSelector.escapeHtml(query);
      const regex = new RegExp(`(${SearchableDatabaseSelector.escapeRegex(escapedQuery)})`, 'gi');
      highlightedTitle = highlightedTitle.replace(
        regex,
        '<span class="search-highlight">$1</span>'
      );
    }

    // 類型圖標和標籤
    const typeIcon =
      db.type === 'page'
        ? '<svg class="icon-page" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>'
        : '<svg class="icon-database" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>';
    const typeLabel = db.type === 'page' ? '頁面' : '資料來源';

    // 工作區標記
    const workspaceBadge = db.isWorkspace ? '<span class="workspace-badge">工作區</span>' : '';

    // Container badge
    const isLikelyContainer = db.type === 'page' && db.parent?.type === 'workspace';
    const containerBadge = isLikelyContainer
      ? '<span class="container-badge"><svg class="icon-folder" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> 容器</span>'
      : '';

    // Category badge
    const isLikelyCategory = db.type === 'page' && db.parent?.type === 'page_id';
    const categoryBadge = isLikelyCategory
      ? '<span class="category-badge"><svg class="icon-category" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg> 分類</span>'
      : '';

    // Parent 路徑信息
    let parentPath = '';
    if (db.parent) {
      switch (db.parent.type) {
        case 'workspace':
          parentPath =
            '<svg class="icon-workspace" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align: text-bottom"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> 工作區';
          break;
        case 'page_id':
          parentPath =
            '<svg class="icon-page" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align: text-bottom"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> 子頁面';
          break;
        case 'data_source_id':
        case 'database_id': // 舊版 API 命名，映射到相同顯示
          parentPath =
            '<svg class="icon-database" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align: text-bottom"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> 資料庫項目';
          break;
        case 'block_id':
          parentPath =
            '<svg class="icon-block" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align: text-bottom"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> 區塊項目';
          break;
        default:
          // 記錄未知類型以便調試
          parentPath = `❓ 其他 (${db.parent.type})`;
      }
    }

    return `
            <div class="database-item ${isSelected ? 'selected' : ''} ${isFocused ? 'keyboard-focus' : ''}"
                 data-index="${index}"
                 data-type="${db.type}"
                 data-is-workspace="${db.isWorkspace}"
                 data-is-container="${isLikelyContainer}"
                 data-is-category="${isLikelyCategory}">
                <div class="database-title">
                    ${highlightedTitle}
                    ${workspaceBadge}
                    ${containerBadge}
                    ${categoryBadge}
                </div>
                <div class="database-parent-path">${parentPath}</div>
                <div class="database-id">${db.id}</div>
                <div class="database-meta">
                    <span class="database-icon">${typeIcon}</span>
                    <span>${typeLabel}</span>
                    ${db.created ? `<span>•</span><span>創建於 ${SearchableDatabaseSelector.formatDate(db.created)}</span>` : ''}
                </div>
            </div>
        `;
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
    const apiKey = document.getElementById('api-key')?.value;
    if (apiKey) {
      this.showLoading();
      this.loadDatabases(apiKey);
    }
  }

  showLoading() {
    if (this.databaseList) {
      this.databaseList.innerHTML = `
                <div class="loading-state">
                    <div class="spinner"></div>
                    <span>重新載入資料來源中...</span>
                </div>
            `;
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
   * 轉義 HTML 特殊字符
   */
  static escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
