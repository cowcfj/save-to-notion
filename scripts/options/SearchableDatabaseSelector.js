/**
 * SearchableDatabaseSelector.js
 * 可搜索的資料來源選擇器 UI 組件
 */

import Logger from '../utils/Logger.js';
import { createSafeIcon, sanitizeApiError } from '../utils/securityUtils.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { UI_ICONS } from '../config/index.js';

/**
 * 可搜索的資料來源選擇器組件
 * 提供帶有搜索功能的下拉選單，用於選擇保存目標（Page 或 Data Source）
 */
export class SearchableDatabaseSelector {
  constructor(dependencies = {}) {
    const { showStatus, loadDataSources, getApiKey } = dependencies;

    if (typeof showStatus !== 'function') {
      throw new TypeError('SearchableDatabaseSelector 需要 showStatus 函式');
    }
    if (typeof loadDataSources !== 'function') {
      throw new TypeError('SearchableDatabaseSelector 需要 loadDataSources 函式');
    }
    if (typeof getApiKey !== 'function') {
      throw new TypeError('SearchableDatabaseSelector 需要 getApiKey 函式');
    }

    this.showStatus = showStatus;
    this.loadDataSources = loadDataSources;
    this.getApiKey = getApiKey;
    this.dataSources = [];
    this.initialDataSources = []; // 儲存初始列表，用於清空搜尋時還原
    this.filteredDataSources = [];
    this.selectedDataSource = null;
    this.isOpen = false;
    this.focusedIndex = -1;
    this.searchTimeout = null; // 防抖動計時器
    this.isSearching = false; // 搜尋狀態標記

    this.initializeElements();
    this.setupEventListeners();
  }

  initializeElements() {
    this.container = document.querySelector('#database-selector-container');
    this.searchInput = document.querySelector('#database-search');
    this.toggleButton = document.querySelector('#selector-toggle');
    this.dropdown = document.querySelector('#database-dropdown');
    this.dataSourceList = document.querySelector('#data-source-list');
    this.dataSourceCount = document.querySelector('#data-source-count');
    this.refreshButton = document.querySelector('#refresh-databases');
    this.databaseIdInput = document.querySelector('#database-id');

    Logger.info('[Selector] 元素初始化完成', {
      hasContainer: Boolean(this.container),
      hasSearchInput: Boolean(this.searchInput),
      hasToggleButton: Boolean(this.toggleButton),
      hasDropdown: Boolean(this.dropdown),
      hasDataSourceList: Boolean(this.dataSourceList),
      hasRefreshButton: Boolean(this.refreshButton),
    });

    if (!this.container) {
      Logger.error('[Selector] 找不到 #database-selector-container 元素');
    }
  }

  setupEventListeners() {
    this._handleSearchInput = event => {
      const query = event.target.value.trim();

      if (this.searchTimeout) {
        clearTimeout(this.searchTimeout);
      }

      if (!query) {
        this.restoreInitialDataSources();
        this.showDropdown();
        return;
      }

      this.filterDataSourcesLocally(query);
      this.showDropdown();

      this.searchTimeout = setTimeout(() => {
        this.performServerSearch(query);
      }, 500);
    };

    this._handleSearchFocus = () => {
      if (this.dataSources.length > 0) {
        this.showDropdown();
      }
    };

    this._handleToggleClick = event => {
      event.preventDefault();
      this.toggleDropdown();
    };

    this._handleRefreshClick = event => {
      event.preventDefault();
      this.refreshDataSources();
    };

    this._handleDocumentClick = event => {
      if (this.container && !this.container.contains(event.target)) {
        this.hideDropdown();
      }
    };

    this._handleKeydown = event => {
      this.handleKeyNavigation(event);
    };

    this.searchInput?.addEventListener('input', this._handleSearchInput);
    this.searchInput?.addEventListener('focus', this._handleSearchFocus);
    this.toggleButton?.addEventListener('click', this._handleToggleClick);
    this.refreshButton?.addEventListener('click', this._handleRefreshClick);
    document.addEventListener('click', this._handleDocumentClick);
    this.searchInput?.addEventListener('keydown', this._handleKeydown);
  }

  populateDataSources(dataSources, isSearchResult = false) {
    const mappedDataSources = dataSources.map(ds => ({
      id: ds.id,
      title: SearchableDatabaseSelector.extractDataSourceTitle(ds),
      type: ds.object, // 'page' 或 'data_source'
      isWorkspace: ds.parent?.type === 'workspace',
      parent: ds.parent,
      raw: ds,
      created: ds.created_time,
      lastEdited: ds.last_edited_time,
    }));

    this.dataSources = mappedDataSources;

    if (!isSearchResult) {
      this.initialDataSources = [...mappedDataSources];
      Logger.info('已保存初始資料來源列表:', this.initialDataSources.length);
    }

    Logger.info('保存目標列表處理完成', { count: this.dataSources.length });

    this.filteredDataSources = [...this.dataSources];
    this.isSearching = false;
    this.updateDataSourceCount();
    this.renderDataSourceList();

    if (this.container) {
      this.container.style.display = 'block';
    }

    const pageCount = dataSources.filter(ds => ds.object === 'page').length;
    const dsCount = dataSources.filter(ds => ds.object === 'data_source').length;
    if (this.searchInput) {
      this.searchInput.placeholder = `搜索 ${dataSources.length} 個保存目標（${dsCount} 個資料來源 + ${pageCount} 個頁面）`;
    }

    if (this.databaseIdInput?.value) {
      const selectedDs = this.dataSources.find(ds => ds.id === this.databaseIdInput.value);
      if (selectedDs) {
        if (this.searchInput) {
          this.searchInput.value = selectedDs.title;
        }
        this.selectedDataSource = selectedDs;
      }
    }
  }

  filterDataSourcesLocally(query) {
    const lowerQuery = query.toLowerCase().trim();

    if (lowerQuery) {
      this.filteredDataSources = this.dataSources.filter(
        ds =>
          ds.title.toLowerCase().includes(lowerQuery) || ds.id.toLowerCase().includes(lowerQuery)
      );
    } else {
      this.filteredDataSources = [...this.dataSources];
    }

    this.focusedIndex = -1;
    this.updateDataSourceCount();
    this.renderDataSourceList();
  }

  restoreInitialDataSources() {
    this.dataSources = [...this.initialDataSources];
    this.filteredDataSources = [...this.initialDataSources];
    this.isSearching = false;
    this.focusedIndex = -1;
    this.updateDataSourceCount();
    this.renderDataSourceList();
    Logger.info('已還原初始資料來源列表');
  }

  async performServerSearch(query) {
    if (!query || query.length < 2) {
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
      await this.loadDataSources(apiKey, query);
      Logger.info('伺服器端搜尋完成', { queryLength: query.length });
    } catch (error) {
      Logger.error('[Selector] 伺服器端搜尋失敗', { error: error.message });

      // 安全地處理錯誤訊息
      const safeError = sanitizeApiError(error, 'server_search');
      const errorMsg = ErrorHandler.formatUserMessage(safeError);

      this.showStatus(`搜尋失敗: ${errorMsg}`, 'error');
    } finally {
      this.isSearching = false;
    }
  }

  showSearchingState(query) {
    if (this.dataSourceList) {
      this.dataSourceList.innerHTML = '';

      const container = document.createElement('div');
      container.className = 'loading-state';

      const spinner = document.createElement('div');
      spinner.className = 'spinner';
      container.append(spinner);

      const textSpan = document.createElement('span');
      textSpan.textContent = '正在搜尋「';
      const querySpan = document.createElement('span');
      querySpan.textContent = query;
      textSpan.append(querySpan);
      textSpan.append(document.createTextNode('」...'));
      container.append(textSpan);

      this.dataSourceList.append(container);
    }
  }

  renderDataSourceList() {
    if (!this.dataSourceList) {
      return;
    }

    this.dataSourceList.innerHTML = '';

    if (this.filteredDataSources.length === 0) {
      const noResultsDiv = document.createElement('div');
      noResultsDiv.className = 'no-results';

      const iconSpan = document.createElement('span');
      iconSpan.className = 'icon';
      iconSpan.append(createSafeIcon(UI_ICONS.SEARCH));
      noResultsDiv.append(iconSpan);

      const msgDiv = document.createElement('div');
      msgDiv.textContent = '未找到匹配的資料來源';
      noResultsDiv.append(msgDiv);

      const small = document.createElement('small');
      small.textContent = '嘗試使用不同的關鍵字搜索';
      noResultsDiv.append(small);

      this.dataSourceList.append(noResultsDiv);
      return;
    }

    const fragment = document.createDocumentFragment();

    this.filteredDataSources.forEach((ds, index) => {
      const itemElement = this.createDataSourceItem(ds, index);
      itemElement.addEventListener('click', () => {
        this.selectDataSource(this.filteredDataSources[index]);
      });
      fragment.append(itemElement);
    });

    this.dataSourceList.append(fragment);
  }

  createDataSourceItem(ds, index) {
    const isSelected = this.selectedDataSource && this.selectedDataSource.id === ds.id;
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
    itemDiv.dataset.type = ds.type;

    const titleRow = document.createElement('div');
    titleRow.className = 'database-title';

    const query = this.searchInput ? this.searchInput.value.trim() : '';
    const highlightedTitleFragment = SearchableDatabaseSelector._createHighlightedText(
      ds.title,
      query
    );
    titleRow.append(highlightedTitleFragment);

    if (ds.isWorkspace) {
      const badge = document.createElement('span');
      badge.className = 'workspace-badge';
      badge.textContent = '工作區';
      titleRow.append(document.createTextNode(' '));
      titleRow.append(badge);
    }

    itemDiv.append(titleRow);

    const metaRow = document.createElement('div');
    metaRow.className = 'database-meta-compact';

    if (ds.parent) {
      let parentIcon = '';
      let parentText = '';

      switch (ds.parent.type) {
        case 'workspace': {
          parentIcon = UI_ICONS.WORKSPACE;
          parentText = ' 工作區';
          break;
        }
        case 'page_id': {
          parentIcon = UI_ICONS.PAGE;
          parentText = ' 子頁面';
          break;
        }
        case 'data_source_id':
        case 'database_id': {
          parentIcon = UI_ICONS.DATABASE;
          parentText = ' 資料庫項目';
          break;
        }
        case 'block_id': {
          parentIcon = UI_ICONS.BLOCK;
          parentText = ' 區塊項目';
          break;
        }
        default: {
          parentText = `❓ 其他 (${ds.parent.type})`;
        }
      }

      const parentGroup = document.createElement('span');
      parentGroup.className = 'meta-group';
      parentGroup.append(createSafeIcon(parentIcon));
      parentGroup.append(document.createTextNode(parentText));
      metaRow.append(parentGroup);

      const separator = document.createElement('span');
      separator.className = 'meta-separator';
      separator.textContent = '|';
      metaRow.append(separator);
    }

    const typeGroup = document.createElement('span');
    typeGroup.className = 'meta-group';
    const typeIconSpan = document.createElement('span');
    typeIconSpan.className = 'database-icon';
    typeIconSpan.append(createSafeIcon(ds.type === 'page' ? UI_ICONS.PAGE : UI_ICONS.DATABASE));
    typeGroup.append(typeIconSpan);
    const typeLabelSpan = document.createElement('span');
    typeLabelSpan.textContent = ds.type === 'page' ? '頁面' : '資料來源';
    typeGroup.append(typeLabelSpan);
    metaRow.append(typeGroup);

    itemDiv.append(metaRow);
    return itemDiv;
  }

  static _createHighlightedText(text, query) {
    const fragment = document.createDocumentFragment();
    if (!query) {
      fragment.append(document.createTextNode(text));
      return fragment;
    }

    try {
      // 轉義正則表達式特殊字元以防止注入攻擊
      const escapedQuery = query.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
      // skipcq: JS-0113, JS-G103 - 安全性說明：query 已在上方明確轉義，動態正則在此為必要且受控
      // eslint-disable-next-line security/detect-non-literal-regexp
      const regex = new RegExp(`(${escapedQuery})`, 'gi');
      const parts = text.split(regex);

      parts.forEach(part => {
        if (part.toLowerCase() === query.toLowerCase()) {
          const span = document.createElement('span');
          span.className = 'search-highlight';
          span.textContent = part;
          fragment.append(span);
        } else if (part) {
          fragment.append(document.createTextNode(part));
        }
      });
    } catch {
      fragment.append(document.createTextNode(text));
    }

    return fragment;
  }

  selectDataSource(dataSource) {
    this.selectedDataSource = dataSource;

    if (this.searchInput) {
      this.searchInput.value = dataSource.title;
    }

    if (this.databaseIdInput) {
      this.databaseIdInput.value = dataSource.id;

      const typeInput = document.querySelector('#database-type');
      if (typeInput) {
        typeInput.value = dataSource.type;
      }
    }

    Logger.info('已選擇保存目標', {
      type: dataSource.type,
      id: dataSource.id,
    });

    this.renderDataSourceList();
    this.hideDropdown();
    this.showStatus(
      `已選擇${dataSource.type === 'page' ? '頁面' : '資料來源'}: ${dataSource.title}`,
      'success'
    );

    if (this.onDataSourceSelected) {
      this.onDataSourceSelected(dataSource);
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
    this.renderDataSourceList();
  }

  toggleDropdown() {
    if (this.isOpen) {
      this.hideDropdown();
    } else if (this.dataSources.length > 0) {
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
      case 'ArrowDown': {
        event.preventDefault();
        this.focusedIndex = Math.min(this.focusedIndex + 1, this.filteredDataSources.length - 1);
        this.renderDataSourceList();
        this.scrollToFocused();
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        this.focusedIndex = Math.max(this.focusedIndex - 1, -1);
        this.renderDataSourceList();
        this.scrollToFocused();
        break;
      }
      case 'Enter': {
        event.preventDefault();
        if (this.focusedIndex >= 0 && this.filteredDataSources[this.focusedIndex]) {
          this.selectDataSource(this.filteredDataSources[this.focusedIndex]);
        }
        break;
      }
      case 'Escape': {
        event.preventDefault();
        this.hideDropdown();
        break;
      }
    }
  }

  scrollToFocused() {
    if (this.focusedIndex >= 0 && this.dataSourceList) {
      const focusedElement = this.dataSourceList.querySelector('.keyboard-focus');
      if (focusedElement) {
        focusedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  updateDataSourceCount() {
    if (!this.dataSourceCount) {
      return;
    }
    const total = this.dataSources.length;
    const filtered = this.filteredDataSources.length;

    if (filtered === total) {
      this.dataSourceCount.textContent = `${total} 個保存目標`;
    } else {
      this.dataSourceCount.textContent = `${filtered} / ${total} 個保存目標`;
    }
  }

  refreshDataSources() {
    const apiKey = this.getApiKey();
    if (apiKey) {
      this.showLoading();
      this.loadDataSources(apiKey);
    }
  }

  showLoading() {
    if (this.dataSourceList) {
      this.dataSourceList.innerHTML = '';
      const container = document.createElement('div');
      container.className = 'loading-state';
      const spinner = document.createElement('div');
      spinner.className = 'spinner';
      container.append(spinner);
      const span = document.createElement('span');
      span.textContent = '重新載入資料來源中...';
      container.append(span);
      this.dataSourceList.append(container);
    }
    this.showDropdown();
  }

  static extractDataSourceTitle(ds) {
    let title = ds.object === 'page' ? '未命名頁面' : '未命名資料來源';
    if (ds.object === 'page' && ds.properties?.title?.title) {
      const titleContent = ds.properties.title.title;
      if (titleContent.length > 0) {
        title = titleContent[0].plain_text || titleContent[0].text?.content || title;
      }
    } else if (ds.title && ds.title.length > 0) {
      title = ds.title[0].plain_text || ds.title[0].text?.content || title;
    } else if (ds.properties) {
      const titleProp = Object.values(ds.properties).find(prop => prop.type === 'title');
      if (titleProp?.title && titleProp.title.length > 0) {
        title = titleProp.title[0].plain_text || titleProp.title[0].text?.content || title;
      }
    }
    return title;
  }

  static formatDate(dateString) {
    try {
      const date = new Date(dateString);
      if (Number.isNaN(date.getTime())) {
        return '';
      }
      return date.toLocaleDateString('zh-TW', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }

  destroy() {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }
    if (this._handleSearchInput) {
      this.searchInput?.removeEventListener('input', this._handleSearchInput);
      this.searchInput?.removeEventListener('focus', this._handleSearchFocus);
      this.searchInput?.removeEventListener('keydown', this._handleKeydown);
      this.toggleButton?.removeEventListener('click', this._handleToggleClick);
      this.refreshButton?.removeEventListener('click', this._handleRefreshClick);
      document.removeEventListener('click', this._handleDocumentClick);
      this._handleSearchInput = null;
      this._handleSearchFocus = null;
      this._handleToggleClick = null;
      this._handleRefreshClick = null;
      this._handleDocumentClick = null;
      this._handleKeydown = null;
    }
  }
}
