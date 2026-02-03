/**
 * StorageManager.js
 * 負責存儲空間分析、清理與優化
 */

/* global chrome */

import Logger from '../utils/Logger.js';
import {
  sanitizeApiError,
  validateSafeSvg,
  separateIconAndText,
  createSafeIcon,
} from '../utils/securityUtils.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { UI_ICONS } from '../config/icons.js';
import { UI_MESSAGES } from '../config/messages.js';

/**
 * 管理存儲空間的類別
 * 處理數據的備份、恢復、檢查、清理與優化
 */
export class StorageManager {
  constructor(uiManager) {
    this.ui = uiManager;
    this.elements = {};
    this.cleanupPlan = null;
    this.optimizationPlan = null;
  }

  /**
   * 輔助方法：分析單個頁面是否需要清理
   *
   * @param {object} page 頁面物件
   * @param {object} data 存儲數據
   * @param {object} plan 清理計劃
   * @private
   */
  async _analyzePageForCleanup(page, data, plan) {
    try {
      const exists = await StorageManager.checkNotionPageExists(page.data.notionPageId);

      if (!exists) {
        const { key: savedKey, url } = page;
        const highlightsKey = `highlights_${url}`;

        const savedSize = new Blob([JSON.stringify({ [savedKey]: page.data })]).size;
        const highlightsData = data[highlightsKey];
        const highlightsSize = highlightsData
          ? new Blob([JSON.stringify({ [highlightsKey]: highlightsData })]).size
          : 0;
        const totalSize = savedSize + highlightsSize;

        plan.items.push({
          key: savedKey,
          url,
          size: savedSize,
          reason: '已刪除頁面的保存狀態',
        });

        if (highlightsData) {
          plan.items.push({
            key: highlightsKey,
            url,
            size: highlightsSize,
            reason: '已刪除頁面的標註數據',
          });
        }

        plan.spaceFreed += totalSize;
        plan.deletedPages++;
      }
    } catch (error) {
      Logger.error('Page existence check failed', {
        action: 'check_page_existence',
        url: page.url,
        error,
      });
    }
  }

  init() {
    this.initializeElements();
    this.setupEventListeners();
    this.updateStorageUsage();
  }

  initializeElements() {
    this.elements = {
      // 備份/恢復按鈕
      exportButton: document.querySelector('#export-data-button'),
      importButton: document.querySelector('#import-data-button'),
      importFile: document.querySelector('#import-data-file'),
      checkButton: document.querySelector('#check-data-button'),
      dataStatus: document.querySelector('#data-status'),

      // 使用量統計
      refreshUsageButton: document.querySelector('#refresh-usage-button'),
      usageFill: document.querySelector('#usage-fill'),
      usagePercentage: document.querySelector('#usage-percentage'),
      usageDetails: document.querySelector('#usage-details'),
      pagesCount: document.querySelector('#pages-count'),
      highlightsCount: document.querySelector('#highlights-count'),
      configCount: document.querySelector('#config-count'),

      // 清理與優化
      previewCleanupButton: document.querySelector('#preview-cleanup-button'),
      executeCleanupButton: document.querySelector('#execute-cleanup-button'),
      analyzeOptimizationButton: document.querySelector('#analyze-optimization-button'),
      executeOptimizationButton: document.querySelector('#execute-optimization-button'),
      cleanupPreview: document.querySelector('#cleanup-preview'),
      optimizationPreview: document.querySelector('#optimization-preview'),
      cleanupDeletedPages: document.querySelector('#cleanup-deleted-pages'),
    };
  }

  setupEventListeners() {
    // 備份
    this.elements.exportButton?.addEventListener('click', () => this.exportData());

    // 恢復
    this.elements.importButton?.addEventListener('click', () => {
      this.elements.importFile?.click();
    });
    this.elements.importFile?.addEventListener('change', event => this.importData(event));

    // 檢查數據
    this.elements.checkButton?.addEventListener('click', () => this.checkDataIntegrity());

    // 刷新使用量
    this.elements.refreshUsageButton?.addEventListener('click', () => this.updateStorageUsage());

    // 清理與優化
    this.elements.previewCleanupButton?.addEventListener('click', () => this.previewSafeCleanup());
    this.elements.executeCleanupButton?.addEventListener('click', () => this.executeSafeCleanup());
    this.elements.analyzeOptimizationButton?.addEventListener('click', () =>
      this.analyzeOptimization()
    );
    this.elements.executeOptimizationButton?.addEventListener('click', () =>
      this.executeOptimization()
    );
  }

  async exportData() {
    try {
      this.showDataStatus(UI_MESSAGES.STORAGE.BACKUP_START, 'info');

      const data = await new Promise(resolve => {
        chrome.storage.local.get(null, resolve);
      });

      const backup = {
        timestamp: new Date().toISOString(),
        version: chrome.runtime.getManifest().version,
        data,
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: 'application/json',
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `notion-clipper-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      const icon = UI_ICONS.SUCCESS;
      this.showDataStatus(`${icon} ${UI_MESSAGES.STORAGE.BACKUP_SUCCESS}`, 'success');
    } catch (error) {
      Logger.error('Backup failed', { action: 'export_backup', error });
      const icon = UI_ICONS.ERROR;
      const safeMessage = sanitizeApiError(error, 'export_backup');
      const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
      this.showDataStatus(`${icon} ${UI_MESSAGES.STORAGE.BACKUP_FAILED}${errorMsg}`, 'error');
    }
  }

  async importData(event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    try {
      this.showDataStatus(UI_MESSAGES.STORAGE.RESTORE_START, 'info');

      const text = await file.text();
      const backup = JSON.parse(text);

      // 防呆檢查：確保是有效的備份格式（基本結構檢查）
      // 要求 backup.data 必須存在，必須是物件，且不能是陣列
      if (!backup?.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) {
        throw new Error(UI_MESSAGES.STORAGE.INVALID_BACKUP_FORMAT);
      }

      await new Promise(resolve => {
        chrome.storage.local.set(backup.data, resolve);
      });

      const icon = UI_ICONS.SUCCESS;
      this.showDataStatus(
        `${icon} ${UI_MESSAGES.STORAGE.RESTORE_SUCCESS(Object.keys(backup.data).length)}`,
        'success'
      );

      // 清除文件選擇
      this.elements.importFile.value = '';

      // 重新載入頁面或狀態
      setTimeout(() => {
        globalThis.window.location.reload();
      }, 2000);
    } catch (error) {
      Logger.error('Import failed', { action: 'import_backup', error });
      const icon = UI_ICONS.ERROR;
      const safeMessage = sanitizeApiError(error, 'import_backup');
      const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
      this.showDataStatus(`${icon} ${UI_MESSAGES.STORAGE.RESTORE_FAILED}${errorMsg}`, 'error');
      this.elements.importFile.value = '';
    }
  }

  async checkDataIntegrity() {
    try {
      this.showDataStatus(UI_MESSAGES.STORAGE.CHECKING, 'info');

      const data = await new Promise(resolve => {
        chrome.storage.local.get(null, resolve);
      });

      const report = StorageManager.analyzeData(data);

      let statusText = `${UI_MESSAGES.STORAGE.REPORT_TITLE}\n`;
      statusText += `${UI_MESSAGES.STORAGE.TOTAL_ITEMS(report.totalKeys)}\n`;
      statusText += `${UI_MESSAGES.STORAGE.HIGHLIGHT_PAGES(report.highlightPages)}\n`;
      statusText += `${UI_MESSAGES.STORAGE.CONFIG_ITEMS(report.configKeys)}\n`;

      if (report.migrationKeys > 0) {
        const migrationSizeKB = (report.migrationDataSize / 1024).toFixed(1);
        statusText += `${UI_MESSAGES.STORAGE.MIGRATION_DATA(report.migrationKeys, migrationSizeKB)}\n`;
      }

      if (report.corruptedData.length > 0) {
        statusText += UI_MESSAGES.STORAGE.CORRUPTED_DATA(report.corruptedData.length);
        this.showDataStatus(statusText, 'error');
      } else if (report.migrationKeys > 0) {
        statusText += UI_MESSAGES.STORAGE.OPTIMIZATION_SUGGESTION;
        this.showDataStatus(statusText, 'warning');
      } else {
        statusText += UI_MESSAGES.STORAGE.INTEGRITY_OK;
        this.showDataStatus(statusText, 'success');
      }
    } catch (error) {
      Logger.error('Data check failed', { action: 'check_integrity', error });
      const icon = UI_ICONS.ERROR;
      const safeMessage = sanitizeApiError(error, 'check_duplicates');
      const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
      this.showDataStatus(`${icon} ${UI_MESSAGES.STORAGE.CHECK_FAILED}${errorMsg}`, 'error');
    }
  }

  static analyzeData(data) {
    const report = {
      totalKeys: Object.keys(data).length,
      highlightPages: 0,
      configKeys: 0,
      migrationKeys: 0,
      migrationDataSize: 0,
      corruptedData: [],
    };

    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('highlights_')) {
        report.highlightPages++;
        if (!Array.isArray(value) && (!value || !Array.isArray(value.highlights))) {
          report.corruptedData.push(key);
        }
      } else if (key.startsWith('config_') || key.includes('notion')) {
        report.configKeys++;
      } else if (key.includes('migration') || key.includes('_v1_') || key.includes('_backup_')) {
        report.migrationKeys++;
        const size = new Blob([JSON.stringify({ [key]: value })]).size;
        report.migrationDataSize += size;
      }
    }

    return report;
  }

  /**
   * 確保按鈕具有正確的 DOM 結構（圖標與文字容器）
   *
   * @param {HTMLElement} btn
   * @returns {{iconWrap: HTMLElement, textSpan: HTMLElement}}
   * @private
   */
  _ensureUsageButtonStructure(btn) {
    let iconWrap = btn.querySelector('span.icon');
    if (!iconWrap) {
      iconWrap = document.createElement('span');
      iconWrap.className = 'icon';
      btn.insertBefore(iconWrap, btn.firstChild);
    }
    let textSpan = btn.querySelector('span.button-text');
    if (!textSpan) {
      textSpan = document.createElement('span');
      textSpan.className = 'button-text';
      btn.append(textSpan);
    }
    return { iconWrap, textSpan };
  }

  async updateStorageUsage() {
    const button = this.elements.refreshUsageButton;
    if (!button) {
      return;
    }

    // 添加加載狀態
    this._updateUsageButtonState(button, 'loading', '更新中...', true);

    try {
      const usage = await StorageManager.getStorageUsage();
      this.updateUsageDisplay(usage);

      // 顯示成功提示
      this._updateUsageButtonState(button, 'success', '已更新');
      setTimeout(() => {
        this._updateUsageButtonState(button, 'default', '刷新統計', false);
      }, 1500);
    } catch (error) {
      Logger.error('Failed to get storage usage', { action: 'get_usage', error });

      // 顯示錯誤狀態
      this._updateUsageButtonState(button, 'error', '更新失敗');
      setTimeout(() => {
        this._updateUsageButtonState(button, 'default', '刷新統計', false);
      }, 2000);
    }
  }

  /**
   * 輔助方法：統一更新使用量按鈕的狀態
   *
   * @param {HTMLElement} button
   * @param {string} state 狀態 (loading, success, error, default)
   * @param {string} text 顯示文字
   * @param {boolean} disabled 是否禁用
   * @private
   */
  _updateUsageButtonState(button, state, text, disabled = false) {
    if (!button) {
      return;
    }

    const { iconWrap, textSpan } = this._ensureUsageButtonStructure(button);

    // SVG Icons
    const stateIcons = {
      success: UI_ICONS.SUCCESS,
      error: UI_ICONS.ERROR,
      loading: UI_ICONS.REFRESH,
      default: UI_ICONS.REFRESH,
    };
    const iconHtml = stateIcons[state] || stateIcons.default;

    // 更新圖標（安全方式）
    iconWrap.innerHTML = '';
    const safe = createSafeIcon(iconHtml);
    const svg = safe.querySelector('svg');

    if (svg) {
      if (!svg.classList.contains('icon-svg')) {
        svg.classList.add('icon-svg');
      }
      if (state === 'loading') {
        svg.classList.add('spin');
      }
      iconWrap.append(svg);
    } else {
      iconWrap.append(safe);
    }

    // 更新文字
    textSpan.textContent = text;
    button.disabled = disabled;
  }

  static async getStorageUsage() {
    const data = await new Promise((resolve, reject) => {
      chrome.storage.local.get(null, result => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(result);
      });
    });

    const jsonString = JSON.stringify(data);
    const sizeInBytes = new Blob([jsonString]).size;
    const referenceSize = 100 * 1024 * 1024; // 100MB

    let pagesCount = 0;
    let highlightsCount = 0;
    let configCount = 0;

    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('highlights_')) {
        pagesCount++;
        if (Array.isArray(value)) {
          highlightsCount += value.length;
        }
      } else if (key.includes('notion') || key.startsWith('config_')) {
        configCount++;
      }
    }

    const percentage = Math.min((sizeInBytes / referenceSize) * 100, 100).toFixed(1);

    return {
      used: sizeInBytes,
      percentage,
      usedMB: (sizeInBytes / (1024 * 1024)).toFixed(2),
      pages: pagesCount,
      highlights: highlightsCount,
      configs: configCount,
      isUnlimited: true,
    };
  }

  updateUsageDisplay(usage) {
    if (!this.elements.usageFill) {
      return;
    }

    this.elements.usageFill.style.width = `${usage.percentage}%`;
    const usedMB = Number.parseFloat(usage.usedMB);

    this.elements.usageFill.className = 'usage-fill';
    if (usedMB > 80) {
      this.elements.usageFill.classList.add('danger');
    } else if (usedMB > 50) {
      this.elements.usageFill.classList.add('warning');
    }

    this.elements.usagePercentage.textContent = `${usage.percentage}%`;

    if (usage.isUnlimited) {
      this.elements.usageDetails.textContent = `${usage.usedMB} MB（無限存儲）`;
    } else {
      this.elements.usageDetails.textContent = `${usage.usedMB} MB`;
    }

    this.elements.pagesCount.textContent = usage.pages.toLocaleString();
    this.elements.highlightsCount.textContent = usage.highlights.toLocaleString();
    this.elements.configCount.textContent = usage.configs;

    // 條件判斷順序：先檢查更高的閾值（>100MB），再檢查較低的閾值（>80MB）
    if (usedMB > 100) {
      const alertIcon = UI_ICONS.WARNING;
      this.showDataStatus(
        `${alertIcon} ${UI_MESSAGES.STORAGE.USAGE_TOO_LARGE(usage.usedMB)}`,
        'error'
      );
    } else if (usedMB > 80) {
      const icon = UI_ICONS.WARNING;
      this.showDataStatus(`${icon} ${UI_MESSAGES.STORAGE.USAGE_LARGE(usage.usedMB)}`, 'warning');
    }
  }

  async previewSafeCleanup() {
    const cleanDeletedPages = this.elements.cleanupDeletedPages?.checked;

    this.setPreviewButtonLoading(true);

    try {
      const plan = await this.generateSafeCleanupPlan(cleanDeletedPages);
      this.cleanupPlan = plan;
      this.displayCleanupPreview(plan);

      if (plan.items.length > 0) {
        if (this.elements.executeCleanupButton) {
          this.elements.executeCleanupButton.style.display = 'inline-block';
        }
      } else if (this.elements.executeCleanupButton) {
        this.elements.executeCleanupButton.style.display = 'none';
      }
    } catch (error) {
      Logger.error('Cleanup preview failed', { action: 'cleanup_preview', error });
      const safeMessage = sanitizeApiError(error, 'preview_cleanup');
      const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
      this.showDataStatus(`${UI_MESSAGES.STORAGE.PREVIEW_CLEANUP_FAILED}${errorMsg}`, 'error');
    } finally {
      this.setPreviewButtonLoading(false);
    }
  }

  setPreviewButtonLoading(loading) {
    const button = this.elements.previewCleanupButton;
    if (!button) {
      return;
    }
    const buttonText = button.querySelector('.button-text');

    if (loading) {
      button.classList.add('loading');
      button.disabled = true;
      if (buttonText) {
        // 僅更新文字，保留原有圖標
        buttonText.textContent = ' 檢查中...';
      }
    } else {
      button.classList.remove('loading');
      button.disabled = false;
      if (buttonText) {
        // 僅更新文字，保留原有圖標
        buttonText.textContent = ' 預覽清理效果';
      }
    }
  }

  updateCheckProgress(current, total) {
    const button = this.elements.previewCleanupButton;
    if (!button) {
      return;
    }
    const buttonText = button.querySelector('.button-text');

    if (total > 0 && buttonText) {
      const percentage = Math.round((current / total) * 100);
      // 僅更新文字，避免重複插入圖標
      buttonText.textContent = ` 檢查中... ${current}/${total} (${percentage}%)`;
    }
  }

  async generateSafeCleanupPlan(cleanDeletedPages) {
    const data = await new Promise(resolve => {
      chrome.storage.local.get(null, resolve);
    });

    const plan = {
      items: [],
      totalKeys: 0,
      spaceFreed: 0,
      deletedPages: 0,
    };

    if (cleanDeletedPages) {
      const savedPages = Object.keys(data)
        .filter(key => key.startsWith('saved_'))
        .map(key => ({
          key,
          url: key.replace('saved_', ''),
          data: data[key],
        }));

      this.updateCheckProgress(0, savedPages.length);

      for (let i = 0; i < savedPages.length; i++) {
        const page = savedPages[i];
        this.updateCheckProgress(i + 1, savedPages.length);

        if (!page.data?.notionPageId) {
          continue;
        }

        await this._analyzePageForCleanup(page, data, plan);

        if (i < savedPages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 350));
        }
      }
    }

    plan.totalKeys = plan.items.length;
    return plan;
  }

  static async checkNotionPageExists(pageId) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'checkNotionPageExists',
        pageId,
      });
      return response?.exists === true;
    } catch (error) {
      Logger.error('Batch page check failed', { action: 'batch_check_existence', error });
      return true;
    }
  }

  displayCleanupPreview(plan) {
    if (!this.elements.cleanupPreview) {
      return;
    }
    this.elements.cleanupPreview.className = 'cleanup-preview show';

    if (plan.items.length === 0) {
      const container = document.createElement('div');
      container.className = 'cleanup-summary';

      const strong = document.createElement('strong');
      const icon = UI_ICONS.SUCCESS;
      strong.append(createSafeIcon(icon));
      strong.append(document.createTextNode(' 沒有發現需要清理的數據'));
      container.append(strong);

      const paragraph = document.createElement('p');
      paragraph.textContent = '所有頁面記錄都是有效的，無需清理。';
      container.append(paragraph);

      this.elements.cleanupPreview.textContent = '';
      this.elements.cleanupPreview.append(container);
      return;
    }

    const spaceMB = (plan.spaceFreed / (1024 * 1024)).toFixed(3);

    const summaryLines = [
      UI_MESSAGES.STORAGE.CLEANUP_TITLE,
      '',
      UI_MESSAGES.STORAGE.CLEANUP_WILL_CLEAN,
    ];

    if (plan.deletedPages > 0) {
      summaryLines.push(UI_MESSAGES.STORAGE.DELETED_PAGES_DATA(plan.deletedPages));
    }

    summaryLines.push('', UI_MESSAGES.STORAGE.SPACE_FREED_ESTIMATE(spaceMB));

    // summaryText variable removed as it was unused

    const icon = UI_ICONS.WARNING;

    this.elements.cleanupPreview.textContent = '';

    // 1. 構建 Summary 區塊
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'cleanup-summary';

    const paragraph = document.createElement('p');
    // 處理換行
    summaryLines.forEach((line, index) => {
      paragraph.append(document.createTextNode(line));
      if (index < summaryLines.length - 1) {
        paragraph.append(document.createElement('br'));
      }
    });
    summaryDiv.append(paragraph);

    const warningDiv = document.createElement('div');
    warningDiv.className = 'warning-notice';
    // icon 是受信任的 SVG 字串
    warningDiv.append(createSafeIcon(icon));

    // " 重要提醒："
    warningDiv.append(document.createTextNode(' '));
    const labelStrong = document.createElement('strong');
    labelStrong.textContent = '重要提醒：';
    warningDiv.append(labelStrong);
    warningDiv.append(document.createTextNode('這只會清理擴展中的無效記錄，'));

    // "絕對不會影響您在 Notion 中保存的任何頁面"
    const panicStrong = document.createElement('strong');
    panicStrong.textContent = '絕對不會影響您在 Notion 中保存的任何頁面';
    warningDiv.append(panicStrong);
    warningDiv.append(document.createTextNode('。'));

    summaryDiv.append(warningDiv);
    this.elements.cleanupPreview.append(summaryDiv);

    // 2. 構建 List 區塊
    const listDiv = document.createElement('div');
    listDiv.className = 'cleanup-list';

    // 使用 DocumentFragment 優化效能
    const fragment = document.createDocumentFragment();

    plan.items.slice(0, 10).forEach(item => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'cleanup-item';

      const urlStrong = document.createElement('strong');
      // 安全核心：textContent 自動轉義
      try {
        urlStrong.textContent = decodeURIComponent(item.url);
      } catch (error) {
        // 如果 URL 編碼格式錯誤，則回退顯示原始 URL 並記錄警告
        Logger.warn('Failed to decode URL in cleanup preview', {
          action: 'preview_decode_url',
          url: item.url,
          error,
        });
        urlStrong.textContent = item.url;
      }
      itemDiv.append(urlStrong);

      itemDiv.append(document.createTextNode(` - ${item.reason}`));
      itemDiv.append(document.createElement('br'));

      const sizeSmall = document.createElement('small');
      sizeSmall.textContent = `${(item.size / 1024).toFixed(1)} KB`;
      itemDiv.append(sizeSmall);

      fragment.append(itemDiv);
    });

    if (plan.items.length > 10) {
      const moreDiv = document.createElement('div');
      moreDiv.className = 'cleanup-item';
      const em = document.createElement('em');
      em.textContent = `... 還有 ${plan.items.length - 10} 個項目`;
      moreDiv.append(em);
      fragment.append(moreDiv);
    }

    listDiv.append(fragment);
    this.elements.cleanupPreview.append(listDiv);
  }

  async executeSafeCleanup() {
    if (!this.cleanupPlan || this.cleanupPlan.items.length === 0) {
      const icon = UI_ICONS.ERROR;
      this.showDataStatus(`${icon} ${UI_MESSAGES.STORAGE.EXECUTE_CLEANUP_NONE}`, 'error');
      return;
    }

    try {
      const icon = UI_ICONS.REFRESH;
      this.showDataStatus(`${icon} ${UI_MESSAGES.STORAGE.CLEANUP_EXECUTING}`, 'info');

      const keysToRemove = this.cleanupPlan.items.map(item => item.key);

      await chrome.storage.local.remove(keysToRemove);

      const spaceKB = (this.cleanupPlan.spaceFreed / 1024).toFixed(1);
      const successIcon = UI_ICONS.SUCCESS;
      let message = `${successIcon} ${UI_MESSAGES.STORAGE.CLEANUP_SUCCESS(this.cleanupPlan.totalKeys, spaceKB)}`;

      if (this.cleanupPlan.deletedPages > 0) {
        message += `\n${UI_MESSAGES.STORAGE.CLEANUP_DELETED_PAGES(this.cleanupPlan.deletedPages)}`;
      }

      this.showDataStatus(message, 'success');

      this.updateStorageUsage();
      if (this.elements.executeCleanupButton) {
        this.elements.executeCleanupButton.style.display = 'none';
      }
      if (this.elements.cleanupPreview) {
        this.elements.cleanupPreview.className = 'cleanup-preview';
      }
      this.cleanupPlan = null;
    } catch (error) {
      Logger.error('Cleanup execution failed', { action: 'execute_cleanup', error });
      const failIcon = UI_ICONS.ERROR;
      const safeMessage = sanitizeApiError(error, 'cleanup');
      const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
      this.showDataStatus(`${failIcon} ${UI_MESSAGES.STORAGE.CLEANUP_FAILED}${errorMsg}`, 'error');
    }
  }

  async analyzeOptimization() {
    const plan = await StorageManager.generateOptimizationPlan();
    this.optimizationPlan = plan;
    this.displayOptimizationPreview(plan);

    if (plan.canOptimize) {
      if (this.elements.executeOptimizationButton) {
        this.elements.executeOptimizationButton.style.display = 'inline-block';
      }
    } else if (this.elements.executeOptimizationButton) {
      this.elements.executeOptimizationButton.style.display = 'none';
    }
  }

  static generateOptimizationPlan() {
    return new Promise(resolve => {
      chrome.storage.local.get(null, data => {
        const plan = {
          canOptimize: false,
          originalSize: 0,
          optimizedSize: 0,
          spaceSaved: 0,
          optimizations: [],
          highlightPages: 0,
          totalHighlights: 0,
          keysToRemove: [],
          optimizedData: {},
        };

        const originalData = JSON.stringify(data);
        plan.originalSize = new Blob([originalData]).size;

        // 使用輔助方法分析數據結構
        StorageManager._analyzeStructureForOptimization(data, plan);

        if (plan.highlightPages > 0 || plan.keysToRemove.length > 0) {
          const optimizedJson = JSON.stringify(plan.optimizedData);
          plan.optimizedSize = new Blob([optimizedJson]).size;
          plan.spaceSaved = plan.originalSize - plan.optimizedSize;
        }

        resolve(plan);
      });
    });
  }

  /**
   * 輔助方法：分析存儲數據結構並填充優化計劃
   *
   * @param {object} data 存儲數據
   * @param {object} plan 優化計劃
   * @private
   */
  static _analyzeStructureForOptimization(data, plan) {
    const stats = {
      migrationDataSize: 0,
      migrationKeysCount: 0,
      emptyHighlightKeys: 0,
      emptyHighlightSize: 0,
    };

    for (const [key, value] of Object.entries(data)) {
      StorageManager._processOptimizationEntry(key, value, plan, stats);
    }

    if (stats.migrationDataSize > 1024) {
      const sizeKB = (stats.migrationDataSize / 1024).toFixed(1);
      plan.optimizations.push(`清理遷移數據（${stats.migrationKeysCount} 項，${sizeKB} KB）`);
      plan.canOptimize = true;
    }

    if (stats.emptyHighlightKeys > 0) {
      const sizeKB = (stats.emptyHighlightSize / 1024).toFixed(1);
      plan.optimizations.push(`移除空標註紀錄（${stats.emptyHighlightKeys} 項，${sizeKB} KB）`);
      plan.canOptimize = true;
    }

    const hasFragmentation = Object.keys(data).some(
      key => key.startsWith('highlights_') && (!data[key] || !Array.isArray(data[key]))
    );

    if (hasFragmentation) {
      plan.optimizations.push('修復數據碎片');
      plan.canOptimize = true;
    }
  }

  /**
   * 輔助方法：處理單個數據項的優化分析
   *
   * @param {string} key 鍵名
   * @param {any} value 值
   * @param {object} plan 計劃
   * @param {object} stats 統計
   * @private
   */
  static _processOptimizationEntry(key, value, plan, stats) {
    if (key.includes('migration') || key.includes('_v1_') || key.includes('_backup_')) {
      stats.migrationKeysCount++;
      const size = new Blob([JSON.stringify({ [key]: value })]).size;
      stats.migrationDataSize += size;
      plan.keysToRemove.push(key);
      return;
    }

    if (key.startsWith('highlights_')) {
      const highlightsArray = Array.isArray(value) ? value : value?.highlights;
      if (Array.isArray(highlightsArray) && highlightsArray.length > 0) {
        plan.highlightPages++;
        plan.totalHighlights += highlightsArray.length;
        plan.optimizedData[key] = value;
      } else {
        stats.emptyHighlightKeys++;
        stats.emptyHighlightSize += new Blob([JSON.stringify({ [key]: value })]).size;
        plan.keysToRemove.push(key);
      }
    } else {
      plan.optimizedData[key] = value;
    }
  }

  displayOptimizationPreview(plan) {
    if (!this.elements.optimizationPreview) {
      return;
    }
    this.elements.optimizationPreview.className = 'optimization-preview show';

    // 清空舊內容
    this.elements.optimizationPreview.textContent = '';

    // Use shared createSafeIcon helper

    if (!plan.canOptimize) {
      const container = document.createElement('div');
      container.className = 'optimization-summary';

      // Header
      const strong = document.createElement('strong');
      strong.append(createSafeIcon(UI_ICONS.SUCCESS));
      strong.append(document.createTextNode(' 數據已經處於最佳狀態'));
      container.append(strong);

      // Description
      const paragraph = document.createElement('p');
      paragraph.textContent = '當前數據結構已經很好，暫時不需要重整優化。';
      container.append(paragraph);

      // Stats
      const statsDiv = document.createElement('div');
      statsDiv.className = 'data-stats';

      const items = [
        { icon: UI_ICONS.INFO, text: ` 標記頁面：${plan.highlightPages}` },
        { icon: UI_ICONS.INFO, text: ` 總標記數：${plan.totalHighlights}` },
        { icon: UI_ICONS.INFO, text: ` 數據大小：${(plan.originalSize / 1024).toFixed(1)} KB` },
      ];

      items.forEach(item => {
        const div = document.createElement('div');
        div.append(createSafeIcon(item.icon));
        div.append(document.createTextNode(item.text));
        statsDiv.append(div);
      });

      container.append(statsDiv);
      this.elements.optimizationPreview.append(container);
      return;
    }

    const spaceSavedMB = (plan.spaceSaved / (1024 * 1024)).toFixed(3);
    const percentSaved = ((plan.spaceSaved / plan.originalSize) * 100).toFixed(1);

    const container = document.createElement('div');
    container.className = 'optimization-summary';

    // Header
    const strong = document.createElement('strong');
    strong.append(createSafeIcon(UI_ICONS.BOLT));
    strong.append(document.createTextNode(' 數據重整分析結果'));
    container.append(strong);

    // Description
    const paragraph = document.createElement('p');
    paragraph.append(document.createTextNode('可以優化您的數據結構，預計節省 '));

    const mbStrong = document.createElement('strong');
    mbStrong.textContent = `${spaceSavedMB} MB`;
    paragraph.append(mbStrong);

    paragraph.append(document.createTextNode(' 空間（'));

    const pctStrong = document.createElement('strong');
    pctStrong.textContent = `${percentSaved}%`;
    paragraph.append(pctStrong);

    paragraph.append(document.createTextNode('）'));
    container.append(paragraph);

    // Details Container
    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'optimization-details';

    // Size Comparison Grid
    const comparisonDiv = document.createElement('div');
    comparisonDiv.className = 'size-comparison';

    const comparisonItems = [
      {
        icon: UI_ICONS.BAR_CHART,
        label: ' 當前大小：',
        value: `${(plan.originalSize / 1024).toFixed(1)} KB`,
        className: 'highlight-text',
      },
      {
        icon: UI_ICONS.BAR_CHART,
        label: ' 優化後：',
        value: `${(plan.optimizedSize / 1024).toFixed(1)} KB`,
        className: 'highlight-success',
      },
      {
        icon: UI_ICONS.SAVE,
        label: ' 節省空間：',
        value: `${(plan.spaceSaved / 1024).toFixed(1)} KB`,
        className: 'highlight-primary',
      },
    ];

    comparisonItems.forEach(item => {
      const div = document.createElement('div');
      div.append(createSafeIcon(item.icon));
      div.append(document.createTextNode(item.label));

      const span = document.createElement('span');
      span.className = item.className;
      span.textContent = item.value;
      div.append(span);

      comparisonDiv.append(div);
    });

    detailsDiv.append(comparisonDiv);

    // Optimization List
    const listDiv = document.createElement('div');
    listDiv.className = 'optimization-list';

    const listStrong = document.createElement('strong');
    listStrong.textContent = '將執行的優化：';
    listDiv.append(listStrong);

    plan.optimizations.forEach(opt => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'optimization-item';
      itemDiv.append(createSafeIcon(UI_ICONS.CHECK));
      itemDiv.append(document.createTextNode(` ${opt}`));
      listDiv.append(itemDiv);
    });

    detailsDiv.append(listDiv);
    container.append(detailsDiv);
    this.elements.optimizationPreview.append(container);
  }

  async executeOptimization() {
    try {
      if (!this.optimizationPlan?.canOptimize) {
        const icon = UI_ICONS.ERROR;
        this.showDataStatus(`${icon} ${UI_MESSAGES.STORAGE.OPTIMIZE_EXECUTE_NONE}`, 'error');
        return;
      }

      const icon = UI_ICONS.REFRESH;
      this.showDataStatus(`${icon} ${UI_MESSAGES.STORAGE.OPTIMIZING}`, 'info');

      const optimizedData = this.optimizationPlan.optimizedData;
      const keysToRemove = this.optimizationPlan.keysToRemove;

      if (keysToRemove.length > 0) {
        await new Promise((resolve, reject) => {
          chrome.storage.local.remove(keysToRemove, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });
      }

      const currentData = await new Promise(resolve => {
        chrome.storage.local.get(null, resolve);
      });

      const needsUpdate = Object.keys(optimizedData).some(key => {
        return JSON.stringify(currentData[key]) !== JSON.stringify(optimizedData[key]);
      });

      if (needsUpdate) {
        await new Promise((resolve, reject) => {
          chrome.storage.local.set(optimizedData, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });
      }

      const spaceSavedKB = (this.optimizationPlan.spaceSaved / 1024).toFixed(1);
      const successIcon = UI_ICONS.SUCCESS;
      this.showDataStatus(
        `${successIcon} ${UI_MESSAGES.STORAGE.OPTIMIZE_SUCCESS(spaceSavedKB)}`,
        'success'
      );

      this.updateStorageUsage();
      if (this.elements.executeOptimizationButton) {
        this.elements.executeOptimizationButton.style.display = 'none';
      }
      if (this.elements.optimizationPreview) {
        this.elements.optimizationPreview.className = 'optimization-preview';
      }
      this.optimizationPlan = null;
    } catch (error) {
      Logger.error('Optimization failed', { action: 'execute_optimization', error });
      const failIcon = UI_ICONS.ERROR;
      const safeMessage = sanitizeApiError(error, 'optimization');
      const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
      this.showDataStatus(`${failIcon} ${UI_MESSAGES.STORAGE.OPTIMIZE_FAILED}${errorMsg}`, 'error');
    }
  }

  /**
   * 顯示資料管理狀態消息（安全版本）
   *
   * Security Note: 此函數僅應接收內部可信的訊息字串
   * - SVG/Emoji 圖標內容應由系統內部生成，不應來自外部輸入
   * - 所有外部錯誤訊息必須先經過 sanitizeApiError() 清理
   * - message 參數不應直接包含未經驗證的用戶輸入或 API 響應
   *
   * @param {string} message - 訊息內容（可包含 Emoji 或系統生成的 SVG）
   * @param {string} type - 訊息類型（success, error, info）
   */
  showDataStatus(message, type) {
    if (!this.elements.dataStatus) {
      return;
    }

    // 使用共用函數分離圖標和文本（統一處理 Emoji 和 SVG）
    const { icon, text } = separateIconAndText(message);

    // SVG 安全驗證：使用 securityUtils 統一處理
    // 即使預期只接收內部生成的 SVG，仍進行驗證作為縱深防禦
    let safeIcon = icon;
    if (icon && !validateSafeSvg(icon)) {
      safeIcon = ''; // 拒絕不安全的 SVG
    }

    // [優化] 如果訊息本身不帶圖標，根據 type 自動匹配預設圖標
    if (!safeIcon) {
      switch (type) {
        case 'success': {
          safeIcon = UI_ICONS.SUCCESS;
          break;
        }
        case 'error': {
          safeIcon = UI_ICONS.ERROR;
          break;
        }
        case 'warning': {
          safeIcon = UI_ICONS.WARNING;
          break;
        }
        case 'info': {
          safeIcon = UI_ICONS.INFO;
          break;
        }
        default: {
          safeIcon = UI_ICONS.INFO;
          break;
        }
      }
    }

    // 清空內容
    this.elements.dataStatus.textContent = '';

    // 如果有圖標，插入圖標
    if (safeIcon) {
      const iconSpan = createSafeIcon(safeIcon);
      iconSpan.className = 'status-icon';
      this.elements.dataStatus.append(iconSpan);
    }

    // 使用 textContent 設置文本（防止 XSS），並支持換行
    if (text) {
      const textSpan = document.createElement('span');
      textSpan.className = 'status-text';

      // 處理換行符：將文本按 \n 分割，並插入 <br> 標籤
      const lines = text.split('\n');
      const numberRegex = /^\d+$/; // 嚴格匹配純數字

      lines.forEach((line, index) => {
        // Tokenization: 將字串分割為 [文字, 數字, 文字...]
        // 使用 capture group Keeping the separator in the result
        const tokens = line.split(/(\d+)/);

        tokens.forEach(token => {
          if (!token) {
            return;
          } // 忽略空字串

          if (numberRegex.test(token)) {
            // 如果是純數字，這是我們生成的數據，安全地套用樣式
            const numSpan = document.createElement('span');
            numSpan.className = 'highlight-primary';
            numSpan.textContent = token; // 使用 textContent
            textSpan.append(numSpan);
          } else {
            // 其他文字，使用 TextNode 自動轉義
            textSpan.append(document.createTextNode(token));
          }
        });

        if (index < lines.length - 1) {
          textSpan.append(document.createElement('br'));
        }
      });

      this.elements.dataStatus.append(textSpan);
    }

    this.elements.dataStatus.className = `data-status ${type}`;
  }
}
