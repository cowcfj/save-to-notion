/**
 * MigrationTool.js
 * 負責舊版標註數據的遷移 UI 與協調
 */
/* global chrome */
import { UI_ICONS } from '../config/index.js';
import Logger from '../utils/Logger.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { sanitizeApiError, createSafeIcon } from '../utils/securityUtils.js';
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
    // 頁面載入時自動載入待完成列表
    this.loadPendingMigrations();
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
      // 待完成列表
      pendingSection: document.getElementById('pending-migration-section'),
      pendingList: document.getElementById('pending-migration-list'),
      // 失敗列表
      failedSection: document.getElementById('failed-migration-section'),
      failedList: document.getElementById('failed-migration-list'),
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
      scanStatus.textContent = '';
      const span = document.createElement('span');
      span.className = 'loading';
      scanStatus.appendChild(span);
      scanStatus.appendChild(document.createTextNode(' 正在掃描...'));
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
        const safeMessage = sanitizeApiError(error, 'scan_legacy_highlights');
        const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
        scanStatus.textContent = `掃描錯誤: ${errorMsg}`;
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
        scanStatus.textContent = '';
        const iconSpan = createSafeIcon(UI_ICONS.CHECK);
        scanStatus.appendChild(iconSpan);
        scanStatus.appendChild(
          document.createTextNode(' 未發現舊版格式的標註，所有數據均為最新格式。')
        );
        scanStatus.className = 'success';
      }
      this.hideMigrationList();
      return;
    }

    // 顯示警告訊息
    if (scanStatus) {
      scanStatus.textContent = '';
      const warningBox = document.createElement('div');
      warningBox.className = 'warning-box';

      const strong = document.createElement('strong');
      const iconSpan = createSafeIcon(UI_ICONS.WARNING);
      strong.appendChild(iconSpan);
      strong.appendChild(
        document.createTextNode(` 發現 ${result.items.length} 個頁面包含舊版標記`)
      );
      warningBox.appendChild(strong);

      const paragraph = document.createElement('p');
      const totalHighlights = result.items.reduce((sum, item) => sum + item.highlightCount, 0);
      paragraph.textContent = `共檢測到 ${totalHighlights} 個舊版標記需遷移。請選擇要遷移或刪除的項目。`;
      warningBox.appendChild(paragraph);

      scanStatus.appendChild(warningBox);
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
      migrationItems.textContent = '';
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
      migrationResult.textContent = '';
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

    migrationItems.textContent = '';

    if (items.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-state';
      emptyDiv.textContent = '沒有找到舊版數據';
      migrationItems.appendChild(emptyDiv);
      return;
    }

    const fragment = document.createDocumentFragment();

    items.forEach(item => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'migration-item';
      itemDiv.dataset.url = item.url;

      const label = document.createElement('label');
      label.className = 'item-checkbox';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = item.url;
      // 直接綁定事件，不依賴 querySelectorAll
      checkbox.addEventListener('change', () => this.handleItemSelection(checkbox));

      label.appendChild(checkbox);
      itemDiv.appendChild(label);

      const infoDiv = document.createElement('div');
      infoDiv.className = 'item-info';

      const urlDiv = document.createElement('div');
      urlDiv.className = 'item-url';
      urlDiv.title = item.url;
      urlDiv.textContent = MigrationTool.truncateUrl(item.url);
      infoDiv.appendChild(urlDiv);

      const countDiv = document.createElement('div');
      countDiv.className = 'item-count';
      countDiv.textContent = `${item.highlightCount} 個標註`;
      infoDiv.appendChild(countDiv);

      itemDiv.appendChild(infoDiv);
      fragment.appendChild(itemDiv);
    });

    migrationItems.appendChild(fragment);

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
    const { executeButton, deleteButton, scanButton } = this.elements;
    const hasSelection = this.selectedUrls.size > 0;

    if (executeButton) {
      executeButton.disabled = !hasSelection;
    }
    if (deleteButton) {
      deleteButton.disabled = !hasSelection;
    }
    // 掃描按鈕始終啟用（除非正在處理中）
    if (scanButton) {
      scanButton.disabled = false;
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
      const safeMessage = sanitizeApiError(error, 'batch_migration');
      const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
      this.showErrorResult(errorMsg);
    } finally {
      // 隱藏進度條
      if (progressContainer) {
        progressContainer.style.display = 'none';
      }
      // 根據實際選擇狀態更新按鈕（而非無條件啟用）
      this.updateActionButtons();

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
      const safeMessage = sanitizeApiError(error, 'batch_deletion');
      const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
      this.showErrorResult(errorMsg);
    } finally {
      // 隱藏進度條
      if (progressContainer) {
        progressContainer.style.display = 'none';
      }
      // 根據實際選擇狀態更新按鈕（而非無條件啟用）
      this.updateActionButtons();

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

    migrationResult.textContent = '';
    const box = document.createElement('div');

    if (results.failed === 0) {
      box.className = 'success-box';
      const strong = document.createElement('strong');
      const iconSpan = createSafeIcon(UI_ICONS.CHECK);
      strong.appendChild(iconSpan);
      strong.appendChild(document.createTextNode(` ${actionText}成功！`));
      box.appendChild(strong);

      const paragraph = document.createElement('p');
      paragraph.textContent = `已成功${actionText} ${results.success} 個頁面的數據。`;
      box.appendChild(paragraph);
    } else if (results.success > 0) {
      box.className = 'warning-box';
      const strong = document.createElement('strong');
      const iconSpan = createSafeIcon(UI_ICONS.WARNING);
      strong.appendChild(iconSpan);
      strong.appendChild(document.createTextNode(` 部分${actionText}完成`));
      box.appendChild(strong);

      const paragraph = document.createElement('p');
      paragraph.textContent = `成功: ${results.success}, 失敗: ${results.failed}`;
      box.appendChild(paragraph);

      const list = document.createElement('div');
      list.className = 'error-list';
      results.errors.forEach(err => {
        const item = document.createElement('div');
        item.className = 'error-item';
        item.textContent = err;
        list.appendChild(item);
      });
      box.appendChild(list);
    } else {
      box.className = 'error-box';
      const strong = document.createElement('strong');
      const iconSpan = createSafeIcon(UI_ICONS.ERROR);
      strong.appendChild(iconSpan);
      strong.appendChild(document.createTextNode(` ${actionText}失敗`));
      box.appendChild(strong);

      const paragraph = document.createElement('p');
      paragraph.textContent = `所有項目${actionText}失敗`;
      box.appendChild(paragraph);

      const list = document.createElement('div');
      list.className = 'error-list';
      results.errors.forEach(err => {
        const item = document.createElement('div');
        item.className = 'error-item';
        item.textContent = err;
        list.appendChild(item);
      });
      box.appendChild(list);
    }

    migrationResult.appendChild(box);
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

    // 防禦性驗證：確保 results.details 是數組
    const details = Array.isArray(results?.details) ? results.details : [];
    const successCount = results?.success ?? 0;

    // 計算總計
    const successItems = details.filter(detail => detail?.status === 'success');
    const totalHighlights = successItems.reduce((sum, detail) => sum + (detail.count ?? 0), 0);
    const totalPending = successItems.reduce((sum, detail) => sum + (detail.pending ?? 0), 0);

    migrationResult.textContent = '';

    const box = document.createElement('div');
    box.className = 'success-box';

    const headerStrong = document.createElement('strong');
    const headerIcon = createSafeIcon(UI_ICONS.CHECK);
    headerStrong.appendChild(headerIcon);
    headerStrong.appendChild(document.createTextNode(' 批量遷移完成'));
    box.appendChild(headerStrong);

    const summaryP = document.createElement('p');
    summaryP.textContent = `已轉換 ${successCount} 個頁面，共 ${totalHighlights} 個標註。`;
    box.appendChild(summaryP);

    if (totalPending > 0) {
      const hintP = document.createElement('p');
      hintP.className = 'hint';

      const infoIcon = createSafeIcon(UI_ICONS.INFO);
      hintP.appendChild(infoIcon);
      hintP.appendChild(document.createTextNode(' '));

      const pendingStrong = document.createElement('strong');
      pendingStrong.textContent = totalPending;
      hintP.appendChild(pendingStrong);

      hintP.appendChild(
        document.createTextNode(
          ' 個標註等待完成位置定位。\n訪問以下頁面時會自動完成，或點擊「打開頁面」立即完成。'
        )
      );
      box.appendChild(hintP);
    } else {
      const hintP = document.createElement('p');
      hintP.className = 'hint';
      hintP.textContent = '所有標註已完成遷移！';
      box.appendChild(hintP);
    }

    if (successItems.length > 0) {
      const listDiv = document.createElement('div');
      listDiv.className = 'result-list';

      successItems.forEach(detail => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'migration-result-item';

        const spanUrl = document.createElement('span');
        spanUrl.className = 'result-url';
        const urlTitle = detail.url || '';
        spanUrl.title = urlTitle;

        const checkIcon = createSafeIcon(UI_ICONS.CHECK);
        spanUrl.appendChild(checkIcon);
        spanUrl.appendChild(document.createTextNode(` ${MigrationTool.truncateUrl(urlTitle)}`));

        const badge = document.createElement('span');
        badge.className = 'count-badge';
        const pendingCount = detail.pending ?? 0;
        badge.textContent = `${detail.count ?? 0} 個標註${pendingCount > 0 ? `，${pendingCount} 待完成` : ''}`;
        spanUrl.appendChild(badge);

        itemDiv.appendChild(spanUrl);

        const link = document.createElement('a');
        link.href = urlTitle;
        link.target = '_blank';
        link.className = 'open-page-link';
        link.textContent = '打開頁面';
        itemDiv.appendChild(link);

        listDiv.appendChild(itemDiv);
      });
      box.appendChild(listDiv);
    }

    migrationResult.appendChild(box);
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

    migrationResult.textContent = '';
    const box = document.createElement('div');
    box.className = 'success-box';

    const strong = document.createElement('strong');
    const iconSpan = createSafeIcon(UI_ICONS.CHECK);
    strong.appendChild(iconSpan);
    strong.appendChild(document.createTextNode(' 刪除成功'));
    box.appendChild(strong);

    const paragraph = document.createElement('p');
    paragraph.textContent = `已刪除 ${count} 個頁面的舊版標註數據。`;
    box.appendChild(paragraph);

    migrationResult.appendChild(box);
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

    migrationResult.textContent = '';
    const box = document.createElement('div');
    box.className = 'error-box';

    const strong = document.createElement('strong');
    const iconSpan = createSafeIcon(UI_ICONS.ERROR);
    strong.appendChild(iconSpan);
    strong.appendChild(document.createTextNode(' 操作失敗'));
    box.appendChild(strong);

    const paragraph = document.createElement('p');
    paragraph.textContent = errorMessage; // textContent 自動轉義
    box.appendChild(paragraph);

    migrationResult.appendChild(box);
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

  /* escapeHtml static method removed as it is no longer needed with DOM API refactoring */

  /**
   * 載入待完成的遷移項目
   * 獲取所有包含 needsRangeInfo 標記的標註
   */
  async loadPendingMigrations() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'migration_get_pending',
      });

      if (response?.success) {
        this.renderPendingList(response.items);
        this.renderFailedList(response.failedItems);
      }
    } catch (error) {
      // 靜默失敗，不影響頁面正常使用
      Logger.warn('載入待完成遷移列表失敗', {
        action: 'loadPendingMigrations',
        error: error.message || error,
      });
    }
  }

  /**
   * 渲染待完成遷移列表
   * @param {Array<{url: string, totalCount: number, pendingCount: number}>} items
   */
  renderPendingList(items) {
    const { pendingSection, pendingList } = this.elements;

    if (!pendingSection || !pendingList) {
      return;
    }

    // 如果沒有待完成項目，隱藏區塊
    if (!items || items.length === 0) {
      pendingSection.style.display = 'none';
      return;
    }

    // 顯示區塊
    pendingSection.style.display = 'block';

    pendingList.textContent = '';
    const fragment = document.createDocumentFragment();

    items.forEach(item => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'migration-result-item';

      const spanUrl = document.createElement('span');
      spanUrl.className = 'result-url';
      spanUrl.title = item.url;

      const iconSpan = createSafeIcon(UI_ICONS.STAR);
      spanUrl.appendChild(iconSpan);
      spanUrl.appendChild(document.createTextNode(` ${MigrationTool.truncateUrl(item.url)}`));

      const badge = document.createElement('span');
      badge.className = 'count-badge';
      badge.textContent = `${item.pendingCount} / ${item.totalCount} 待完成`;
      spanUrl.appendChild(badge);

      itemDiv.appendChild(spanUrl);

      const link = document.createElement('a');
      link.href = item.url;
      link.target = '_blank';
      link.className = 'open-page-link';
      link.textContent = '打開頁面';
      itemDiv.appendChild(link);

      fragment.appendChild(itemDiv);
    });

    pendingList.appendChild(fragment);
  }

  /**
   * 渲染失敗遷移列表
   * @param {Array<{url: string, totalCount: number, failedCount: number}>} items
   */
  renderFailedList(items) {
    const { failedSection, failedList } = this.elements;

    if (!failedSection || !failedList) {
      return;
    }

    // 如果沒有失敗項目，隱藏區塊
    if (!items || items.length === 0) {
      failedSection.style.display = 'none';
      return;
    }

    // 顯示區塊
    failedSection.style.display = 'block';

    failedList.innerHTML = '';
    const fragment = document.createDocumentFragment();

    items.forEach(item => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'migration-result-item failed-item';

      const spanUrl = document.createElement('span');
      spanUrl.className = 'result-url';
      spanUrl.title = item.url;

      const iconSpan = createSafeIcon(UI_ICONS.WARNING);
      spanUrl.appendChild(iconSpan);
      spanUrl.appendChild(document.createTextNode(` ${MigrationTool.truncateUrl(item.url)}`));

      const badge = document.createElement('span');
      badge.className = 'count-badge failed';
      badge.textContent = `${item.failedCount} 個無法恢復`;
      spanUrl.appendChild(badge);

      itemDiv.appendChild(spanUrl);

      const button = document.createElement('button');
      button.className = 'btn-danger btn-small delete-failed-btn';
      button.dataset.url = item.url;
      button.textContent = '刪除';
      // 直接綁定事件
      button.addEventListener('click', () => this.deleteFailedHighlights(item.url));

      itemDiv.appendChild(button);

      fragment.appendChild(itemDiv);
    });

    failedList.appendChild(fragment);
  }

  /**
   * 刪除指定 URL 的失敗標註
   * @param {string} url
   */
  async deleteFailedHighlights(url) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'migration_delete_failed',
        url,
      });

      if (response?.success) {
        // 重新載入列表
        await this.loadPendingMigrations();
      } else {
        Logger.error('刪除失敗標註失敗', {
          action: 'deleteFailedHighlights',
          url,
          error: response?.error,
        });
      }
    } catch (error) {
      Logger.error('執行刪除失敗標註時出錯', {
        action: 'deleteFailedHighlights',
        url,
        error: error.message || error,
      });
    }
  }
}
