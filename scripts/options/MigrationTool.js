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
      // 計算實際的標註總數
      const totalHighlights = result.items.reduce((sum, item) => sum + item.highlightCount, 0);
      scanStatus.innerHTML = `
        <div class="warning-box">
          <strong>⚠️ 發現 ${result.items.length} 個頁面包含舊版標記</strong>
          <p>共檢測到 ${totalHighlights} 個舊版標記需遷移。請選擇要遷移或刪除的項目。</p>
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
    const {
      migrationList,
      migrationItems,
      executeButton,
      deleteButton,
      progressContainer,
      migrationResult,
      selectAllCheckbox,
    } = this.elements;

    if (migrationList) {
      migrationList.style.display = 'none';
    }
    if (migrationItems) {
      migrationItems.innerHTML = '';
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

    // 清空選擇狀態，防止過時選擇殘留
    this.selectedUrls.clear();
    this.updateSelectedCount();

    // 重置全選勾選框
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = false;
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
   * 執行選中項目的遷移（使用批量 API）
   */
  async performSelectedMigration() {
    if (this.selectedUrls.size === 0) {
      return;
    }

    const urls = Array.from(this.selectedUrls);
    const { progressContainer, progressBar, progressText } = this.elements;

    // 禁用按鈕
    this.setButtonsDisabled(true);

    // 顯示進度（批量操作很快，顯示不確定進度）
    if (progressContainer) {
      progressContainer.style.display = 'block';
    }
    if (progressBar) {
      progressBar.style.width = '50%';
    }
    if (progressText) {
      progressText.textContent = '處理中...';
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'migration_batch',
        urls,
      });

      // 完成進度
      if (progressBar) {
        progressBar.style.width = '100%';
      }
      if (progressText) {
        progressText.textContent = '100%';
      }

      if (response?.success) {
        this.showBatchMigrationResult(response.results);
        this.selectedUrls.clear();
        // 不自動重新掃描，讓用戶能看到結果連結
        // 用戶可點擊連結打開頁面完成 rangeInfo 生成
        // 或手動點擊掃描按鈕重新掃描
      } else {
        this.showErrorResult(response?.error || '批量遷移失敗');
      }
    } catch (error) {
      this.showErrorResult(error.message);
    } finally {
      // 隱藏進度條
      if (progressContainer) {
        progressContainer.style.display = 'none';
      }
      this.setButtonsDisabled(false);

      // 觸發刷新儲存使用量
      document.dispatchEvent(new CustomEvent('storageUsageUpdate'));
    }
  }

  /**
   * 執行選中項目的刪除（使用批量 API）
   */
  async performSelectedDeletion() {
    if (this.selectedUrls.size === 0) {
      return;
    }

    // 確認刪除（使用原生對話框確保用戶明確確認）

    const confirmed = window.confirm(
      `確定要刪除 ${this.selectedUrls.size} 個頁面的舊版標註數據嗎？\n此操作無法還原！`
    );

    if (!confirmed) {
      return;
    }

    const urls = Array.from(this.selectedUrls);
    const { progressContainer, progressBar, progressText } = this.elements;

    // 禁用按鈕
    this.setButtonsDisabled(true);

    // 顯示進度
    if (progressContainer) {
      progressContainer.style.display = 'block';
    }
    if (progressBar) {
      progressBar.style.width = '50%';
    }
    if (progressText) {
      progressText.textContent = '刪除中...';
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'migration_batch_delete',
        urls,
      });

      // 完成進度
      if (progressBar) {
        progressBar.style.width = '100%';
      }
      if (progressText) {
        progressText.textContent = '100%';
      }

      if (response?.success) {
        this.showDeleteResult(response.count);
        this.selectedUrls.clear();
        // 延遲後重新掃描
        setTimeout(() => this.scanForLegacyHighlights(), 1500);
      } else {
        this.showErrorResult(response?.error || '批量刪除失敗');
      }
    } catch (error) {
      this.showErrorResult(error.message);
    } finally {
      // 隱藏進度條
      if (progressContainer) {
        progressContainer.style.display = 'none';
      }
      this.setButtonsDisabled(false);

      // 觸發刷新儲存使用量
      document.dispatchEvent(new CustomEvent('storageUsageUpdate'));
    }
  }

  /**
   * 設置按鈕禁用狀態
   * @param {boolean} disabled
   */
  setButtonsDisabled(disabled) {
    const { executeButton, deleteButton, scanButton } = this.elements;
    if (executeButton) {
      executeButton.disabled = disabled;
    }
    if (deleteButton) {
      deleteButton.disabled = disabled;
    }
    if (scanButton) {
      scanButton.disabled = disabled;
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
   * 顯示批量遷移結果（帶打開頁面連結）
   * @param {Object} results - 批量遷移結果
   */
  showBatchMigrationResult(results) {
    const { migrationResult } = this.elements;

    if (!migrationResult) {
      return;
    }

    // 構建成功項目列表（帶連結）
    const successItems = results.details.filter(detail => detail.status === 'success');
    const listHtml = successItems
      .map(
        detail => `
        <div class="migration-result-item">
          <span class="result-url" title="${MigrationTool.escapeHtml(detail.url)}">
            ✅ ${MigrationTool.escapeHtml(MigrationTool.truncateUrl(detail.url))}
            <span class="count-badge">${detail.count} 個標註${detail.pending > 0 ? `，${detail.pending} 待完成` : ''}</span>
          </span>
          <a href="${MigrationTool.escapeHtml(detail.url)}" target="_blank" class="open-page-link">
            打開頁面
          </a>
        </div>
      `
      )
      .join('');

    // 計算總計
    const totalHighlights = successItems.reduce((sum, detail) => sum + detail.count, 0);
    const totalPending = successItems.reduce((sum, detail) => sum + (detail.pending || 0), 0);

    migrationResult.innerHTML = `
      <div class="success-box">
        <strong>✅ 批量遷移完成</strong>
        <p>已轉換 ${results.success} 個頁面，共 ${totalHighlights} 個標註。</p>
        ${
          totalPending > 0
            ? `
          <p class="hint">
            💡 <strong>${totalPending}</strong> 個標註等待完成位置定位。
            訪問以下頁面時會自動完成，或點擊「打開頁面」立即完成。
          </p>
        `
            : '<p class="hint">所有標註已完成遷移！</p>'
        }
        ${listHtml ? `<div class="result-list">${listHtml}</div>` : ''}
      </div>
    `;
  }

  /**
   * 顯示批量刪除結果
   * @param {number} count - 刪除的頁面數量
   */
  showDeleteResult(count) {
    const { migrationResult } = this.elements;

    if (!migrationResult) {
      return;
    }

    migrationResult.innerHTML = `
      <div class="success-box">
        <strong>✅ 刪除成功</strong>
        <p>已刪除 ${count} 個頁面的舊版標註數據。</p>
      </div>
    `;
  }

  /**
   * 顯示錯誤結果
   * @param {string} errorMessage - 錯誤訊息
   */
  showErrorResult(errorMessage) {
    const { migrationResult } = this.elements;

    if (!migrationResult) {
      return;
    }

    migrationResult.innerHTML = `
      <div class="error-box">
        <strong>❌ 操作失敗</strong>
        <p>${MigrationTool.escapeHtml(errorMessage)}</p>
      </div>
    `;
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
