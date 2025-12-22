/**
 * MigrationTool.js
 * 負責舊版標註數據的遷移 UI 與協調
 */
/* global chrome */
import { MigrationScanner } from './MigrationScanner.js';

/**
 * 遷移工具類別
 * 負責協調舊版數據的掃描與遷移過程，並管理相關 UI
 */
export class MigrationTool {
  constructor(uiManager) {
    this.ui = uiManager;
    this.scanner = new MigrationScanner();
    this.elements = {};
    this.scanResult = null;
    /** @type {Set<string>} 已選擇的 URL 集合 */
    this.selectedUrls = new Set();
  }

  init() {
    this.initializeElements();
    this.setupEventListeners();
  }

  initializeElements() {
    this.elements = {
      // 掃描相關
      scanButton: document.getElementById('migration-scan-button'),
      scanStatus: document.getElementById('scan-status'),
      // 遷移列表相關
      migrationList: document.getElementById('migration-list'),
      selectAllCheckbox: document.getElementById('migration-select-all'),
      selectedCount: document.getElementById('migration-selected-count'),
      migrationItems: document.getElementById('migration-items'),
      // 操作按鈕
      executeButton: document.getElementById('migration-execute-button'),
      deleteButton: document.getElementById('migration-delete-button'),
      // 進度相關
      progressContainer: document.getElementById('migration-progress'),
      progressBar: document.getElementById('migration-progress-bar'),
      progressText: document.getElementById('migration-progress-text'),
      // 結果顯示
      migrationResult: document.getElementById('migration-result'),
    };
  }

  setupEventListeners() {
    // 掃描按鈕
    this.elements.scanButton?.addEventListener('click', () => this.scanForLegacyHighlights());

    // 全選勾選框
    this.elements.selectAllCheckbox?.addEventListener('change', event =>
      this.handleSelectAll(event.target.checked)
    );

    // 遷移按鈕
    this.elements.executeButton?.addEventListener('click', () => this.performSelectedMigration());

    // 刪除按鈕
    this.elements.deleteButton?.addEventListener('click', () => this.performSelectedDeletion());
  }

  /**
   * 掃描存儲空間中的舊版標註數據
   * @returns {Promise<void>}
   */
  async scanForLegacyHighlights() {
    const { scanStatus, scanButton } = this.elements;

    // 顯示掃描中狀態
    if (scanStatus) {
      scanStatus.innerHTML = '<span class="loading"></span> 正在掃描...';
    }

    // 隱藏列表和操作按鈕
    this.hideMigrationList();

    if (scanButton) {
      scanButton.disabled = true;
    }

    try {
      const result = await this.scanner.scanStorage();
      this.scanResult = result;
      this.selectedUrls.clear();
      this.handleScanResult(result);
    } catch (error) {
      if (scanStatus) {
        scanStatus.textContent = `掃描錯誤: ${error.message}`;
        scanStatus.className = 'error';
      }
    } finally {
      if (scanButton) {
        scanButton.disabled = false;
      }
    }
  }

  /**
   * 處理掃描結果
   * @param {Object} result - 掃描結果
   */
  handleScanResult(result) {
    const { scanStatus, migrationList } = this.elements;

    if (!result.needsMigration) {
      if (scanStatus) {
        scanStatus.textContent = '✅ 未發現舊版格式的標註，所有數據均為最新格式。';
        scanStatus.className = 'success';
      }
      this.hideMigrationList();
      return;
    }

    // 顯示警告訊息
    if (scanStatus) {
      scanStatus.innerHTML = `
        <div class="warning-box">
          <strong>⚠️ 發現 ${result.items.length} 個頁面包含舊版標記</strong>
          <p>共檢測到 ${result.legacyCount} 個舊版標記需遷移。請選擇要遷移或刪除的項目。</p>
        </div>
      `;
      scanStatus.className = '';
    }

    // 渲染遷移列表
    this.renderMigrationList(result.items);

    // 顯示列表
    if (migrationList) {
      migrationList.style.display = 'block';
    }
  }

  /**
   * 隱藏遷移列表和相關元素
   */
  hideMigrationList() {
    const { migrationList, executeButton, deleteButton, progressContainer, migrationResult } =
      this.elements;

    if (migrationList) {
      migrationList.style.display = 'none';
    }
    if (executeButton) {
      executeButton.disabled = true;
    }
    if (deleteButton) {
      deleteButton.disabled = true;
    }
    if (progressContainer) {
      progressContainer.style.display = 'none';
    }
    if (migrationResult) {
      migrationResult.innerHTML = '';
    }
  }

  /**
   * 渲染遷移項目列表
   * @param {Array<{url: string, highlightCount: number}>} items - 待遷移項目
   */
  renderMigrationList(items) {
    const { migrationItems, selectAllCheckbox } = this.elements;

    if (!migrationItems) {
      return;
    }

    if (items.length === 0) {
      migrationItems.innerHTML = '<div class="empty-state">沒有找到舊版數據</div>';
      return;
    }

    // 渲染每個項目
    migrationItems.innerHTML = items
      .map(
        item => `
          <div class="migration-item" data-url="${MigrationTool.escapeHtml(item.url)}">
            <label class="item-checkbox">
              <input type="checkbox" value="${MigrationTool.escapeHtml(item.url)}" />
            </label>
            <div class="item-info">
              <div class="item-url" title="${MigrationTool.escapeHtml(item.url)}">${MigrationTool.escapeHtml(MigrationTool.truncateUrl(item.url))}</div>
              <div class="item-count">${item.highlightCount} 個標註</div>
            </div>
          </div>
        `
      )
      .join('');

    // 為每個 checkbox 添加事件監聽
    const checkboxes = migrationItems.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => this.handleItemSelection(checkbox));
    });

    // 重置全選狀態
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    }

    // 更新選擇計數
    this.updateSelectedCount();
  }

  /**
   * 處理單個項目的選擇狀態變化
   * @param {HTMLInputElement} checkbox - 變更的 checkbox
   */
  handleItemSelection(checkbox) {
    const url = checkbox.value;

    if (checkbox.checked) {
      this.selectedUrls.add(url);
    } else {
      this.selectedUrls.delete(url);
    }

    this.updateSelectAllState();
    this.updateSelectedCount();
    this.updateActionButtons();
  }

  /**
   * 處理全選/取消全選
   * @param {boolean} checked - 是否選中
   */
  handleSelectAll(checked) {
    const { migrationItems } = this.elements;

    if (!migrationItems) {
      return;
    }

    const checkboxes = migrationItems.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.checked = checked;
      const url = checkbox.value;

      if (checked) {
        this.selectedUrls.add(url);
      } else {
        this.selectedUrls.delete(url);
      }
    });

    this.updateSelectedCount();
    this.updateActionButtons();
  }

  /**
   * 更新「全選」checkbox 的狀態
   */
  updateSelectAllState() {
    const { selectAllCheckbox, migrationItems } = this.elements;

    if (!selectAllCheckbox || !migrationItems) {
      return;
    }

    const checkboxes = migrationItems.querySelectorAll('input[type="checkbox"]');
    const totalCount = checkboxes.length;
    const checkedCount = this.selectedUrls.size;

    if (checkedCount === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    } else if (checkedCount === totalCount) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
    }
  }

  /**
   * 更新選中項目計數顯示
   */
  updateSelectedCount() {
    const { selectedCount } = this.elements;

    if (selectedCount) {
      selectedCount.textContent = `已選 ${this.selectedUrls.size} 項`;
    }
  }

  /**
   * 更新操作按鈕的啟用狀態
   */
  updateActionButtons() {
    const { executeButton, deleteButton } = this.elements;
    const hasSelection = this.selectedUrls.size > 0;

    if (executeButton) {
      executeButton.disabled = !hasSelection;
    }
    if (deleteButton) {
      deleteButton.disabled = !hasSelection;
    }
  }

  /**
   * 執行選中項目的遷移
   */
  async performSelectedMigration() {
    if (this.selectedUrls.size === 0) {
      return;
    }

    const urls = Array.from(this.selectedUrls);
    await this.executeMigration(urls, 'migrate');
  }

  /**
   * 執行選中項目的刪除
   */
  async performSelectedDeletion() {
    if (this.selectedUrls.size === 0) {
      return;
    }

    // 確認刪除
    const confirmed = window.confirm(
      `確定要刪除 ${this.selectedUrls.size} 個頁面的舊版標註數據嗎？\n此操作無法還原！`
    );

    if (!confirmed) {
      return;
    }

    const urls = Array.from(this.selectedUrls);
    await this.executeMigration(urls, 'delete');
  }

  /**
   * 執行遷移或刪除操作
   * @param {string[]} urls - 要處理的 URL 清單
   * @param {'migrate'|'delete'} action - 操作類型
   */
  async executeMigration(urls, action) {
    const {
      executeButton,
      deleteButton,
      progressContainer,
      progressBar,
      progressText,
      scanButton,
    } = this.elements;

    // 禁用按鈕
    if (executeButton) {
      executeButton.disabled = true;
    }
    if (deleteButton) {
      deleteButton.disabled = true;
    }
    if (scanButton) {
      scanButton.disabled = true;
    }

    // 顯示進度條
    if (progressContainer) {
      progressContainer.style.display = 'block';
    }
    if (progressBar) {
      progressBar.style.width = '0%';
    }
    if (progressText) {
      progressText.textContent = '0%';
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [],
    };

    try {
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const percent = Math.round(((i + 1) / urls.length) * 100);

        // 更新進度
        if (progressBar) {
          progressBar.style.width = `${percent}%`;
        }
        if (progressText) {
          progressText.textContent = `${percent}%`;
        }

        try {
          const messageAction = action === 'delete' ? 'migration_delete' : 'migration_execute';
          const response = await chrome.runtime.sendMessage({
            action: messageAction,
            url,
          });

          if (response?.success) {
            results.success++;
          } else {
            results.failed++;
            results.errors.push(`${url}: ${response?.error || '未知錯誤'}`);
          }
        } catch (error) {
          results.failed++;
          results.errors.push(`${url}: ${error.message}`);
        }
      }

      // 顯示結果
      this.showMigrationResult(results, action);

      // 如果成功，清除選擇並重新掃描
      if (results.failed === 0) {
        this.selectedUrls.clear();
        // 延遲後重新掃描
        setTimeout(() => this.scanForLegacyHighlights(), 1500);
      }
    } finally {
      // 隱藏進度條
      if (progressContainer) {
        progressContainer.style.display = 'none';
      }

      // 恢復按鈕狀態
      if (scanButton) {
        scanButton.disabled = false;
      }

      // 觸發刷新儲存使用量
      const storageUsageEvent = new CustomEvent('storageUsageUpdate');
      document.dispatchEvent(storageUsageEvent);
    }
  }

  /**
   * 顯示遷移/刪除結果
   * @param {Object} results - 操作結果
   * @param {'migrate'|'delete'} action - 操作類型
   */
  showMigrationResult(results, action) {
    const { migrationResult } = this.elements;
    const actionText = action === 'delete' ? '刪除' : '遷移';

    if (!migrationResult) {
      return;
    }

    if (results.failed === 0) {
      migrationResult.innerHTML = `
        <div class="success-box">
          <strong>✅ ${actionText}成功！</strong>
          <p>已成功${actionText} ${results.success} 個頁面的數據。</p>
        </div>
      `;
    } else if (results.success > 0) {
      migrationResult.innerHTML = `
        <div class="warning-box">
          <strong>⚠️ 部分${actionText}完成</strong>
          <p>成功: ${results.success}, 失敗: ${results.failed}</p>
          <div class="error-list">
            ${results.errors.map(err => `<div class="error-item">${MigrationTool.escapeHtml(err)}</div>`).join('')}
          </div>
        </div>
      `;
    } else {
      migrationResult.innerHTML = `
        <div class="error-box">
          <strong>❌ ${actionText}失敗</strong>
          <p>所有項目${actionText}失敗</p>
          <div class="error-list">
            ${results.errors.map(err => `<div class="error-item">${MigrationTool.escapeHtml(err)}</div>`).join('')}
          </div>
        </div>
      `;
    }
  }

  /**
   * 截斷 URL 用於顯示
   * @param {string} url - URL 字符串
   * @param {number} maxLength - 最大長度
   * @returns {string} 截斷後的 URL
   */
  static truncateUrl(url, maxLength = 60) {
    if (url.length <= maxLength) {
      return url;
    }
    return `${url.substring(0, maxLength - 3)}...`;
  }

  /**
   * HTML 轉義防止 XSS
   * @param {string} str - 要轉義的字符串
   * @returns {string} 轉義後的字符串
   */
  static escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
