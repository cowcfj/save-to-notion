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

  init() {
    this.initializeElements();
    this.setupEventListeners();
    this.updateStorageUsage();
  }

  initializeElements() {
    this.elements = {
      // 備份/恢復按鈕
      exportButton: document.getElementById('export-data-button'),
      importButton: document.getElementById('import-data-button'),
      importFile: document.getElementById('import-data-file'),
      checkButton: document.getElementById('check-data-button'),
      dataStatus: document.getElementById('data-status'),

      // 使用量統計
      refreshUsageButton: document.getElementById('refresh-usage-button'),
      usageFill: document.getElementById('usage-fill'),
      usagePercentage: document.getElementById('usage-percentage'),
      usageDetails: document.getElementById('usage-details'),
      pagesCount: document.getElementById('pages-count'),
      highlightsCount: document.getElementById('highlights-count'),
      configCount: document.getElementById('config-count'),

      // 清理與優化
      previewCleanupButton: document.getElementById('preview-cleanup-button'),
      executeCleanupButton: document.getElementById('execute-cleanup-button'),
      analyzeOptimizationButton: document.getElementById('analyze-optimization-button'),
      executeOptimizationButton: document.getElementById('execute-optimization-button'),
      cleanupPreview: document.getElementById('cleanup-preview'),
      optimizationPreview: document.getElementById('optimization-preview'),
      cleanupDeletedPages: document.getElementById('cleanup-deleted-pages'),
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
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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

  importData(event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = async readerEvent => {
      try {
        this.showDataStatus(UI_MESSAGES.STORAGE.RESTORE_START, 'info');

        const backup = JSON.parse(readerEvent.target.result);

        // 防呆檢查：確保是有效的備份格式（基本結構檢查）
        if (!backup || !backup.data) {
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
          window.location.reload();
        }, 2000);
      } catch (error) {
        Logger.error('Import failed', { action: 'import_backup', error });
        const icon = UI_ICONS.ERROR;
        const safeMessage = sanitizeApiError(error, 'import_backup');
        const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
        this.showDataStatus(`${icon} ${UI_MESSAGES.STORAGE.RESTORE_FAILED}${errorMsg}`, 'error');
        this.elements.importFile.value = '';
      }
    };
    reader.readAsText(file);
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

  async updateStorageUsage() {
    const button = this.elements.refreshUsageButton;

    // SVG Icons
    const ICONS = {
      refresh: UI_ICONS.REFRESH,
      check: UI_ICONS.SUCCESS,
      error: UI_ICONS.ERROR,
    };

    // Helper to update button content
    const setButtonState = (state, text, disabled = false) => {
      if (!button) {
        return;
      }

      let iconHtml = ICONS.refresh; // default
      if (state === 'success') {
        iconHtml = ICONS.check;
      }
      if (state === 'error') {
        iconHtml = ICONS.error;
      }

      // Add spinning class for loading state
      if (state === 'loading') {
        // 簡單的替換來添加旋轉類
        iconHtml = iconHtml.replace('<svg', '<svg class="icon-svg spin"');
      } else if (!iconHtml.includes('class="icon-svg"')) {
        // 確保有 icon-svg 類（如果不是 loading 狀態）
        iconHtml = iconHtml.replace('<svg', '<svg class="icon-svg"');
      }

      // 嘗試獲取現有的元素
      const iconElement = button.querySelector('.icon-svg') || button.querySelector('svg');
      let textElement = button.querySelector('.button-text');

      // 更新或創建 Text
      if (textElement) {
        textElement.textContent = text;
      } else {
        // 如果結構不符，創建 .button-text
        // 注意：這裡可能會清除舊的文本節點，但為了統一結構是必要的
        // 先移除所有非 SVG 節點
        Array.from(button.childNodes).forEach(node => {
          if (node !== iconElement && (!iconElement || !iconElement.contains(node))) {
            button.removeChild(node);
          }
        });

        textElement = document.createElement('span');
        textElement.className = 'button-text';
        textElement.textContent = text;
        button.appendChild(textElement);
      }

      // 更新或創建 Icon
      // 使用 createSafeIcon 生成新的 icon 結構
      const newIconContainer = createSafeIcon(iconHtml);
      // createSafeIcon 返回的是 span.icon > svg.icon-svg
      // 我們需要提取 svg 或使用整個 span，取決於 DOM 結構
      // 由於 options.html 定義的是 button > svg.icon-svg，我們嘗試保持這種結構
      // 或者如果 createSafeIcon 強制 span 包裹，我們就使用 span

      const newSvg = newIconContainer.querySelector('svg');

      if (iconElement) {
        // 如果原本是 svg 直接作為子元素 (HTML 定義的結構)
        if (iconElement.tagName.toLowerCase() === 'svg' && iconElement.parentNode === button) {
          if (newSvg) {
            // 替換舊 SVG
            button.replaceChild(newSvg, iconElement);
          } else {
            // 如果 createSafeIcon 沒返回 SVG (例如是純文字或 emoji)，則替換為容器
            button.replaceChild(newIconContainer, iconElement);
          }
        } else {
          // 如果原本是在 wrapper 裡，直接替換 wrapper
          // 尋找 wrapper
          const wrapper = iconElement.closest('.icon') || iconElement.closest('.icon-wrapper');
          if (wrapper && wrapper.parentNode === button) {
            button.replaceChild(newIconContainer, wrapper);
          } else {
            // Fallback: remove iconElement and prepend new one
            iconElement.remove();
            button.insertBefore(newIconContainer, button.firstChild);
          }
        }
      } else {
        // 沒有圖標，插入到最前面
        button.insertBefore(newIconContainer, button.firstChild);
      }

      button.disabled = disabled;
    };

    // 添加加載狀態
    if (button) {
      setButtonState('loading', '更新中...', true);
    }

    try {
      const usage = await StorageManager.getStorageUsage();
      this.updateUsageDisplay(usage);

      // 顯示成功提示
      if (button) {
        setButtonState('success', '已更新');
        setTimeout(() => {
          setButtonState('default', '刷新統計');
          button.disabled = false;
        }, 1500);
      }
    } catch (error) {
      Logger.error('Failed to get storage usage', { action: 'get_usage', error });

      // 顯示錯誤狀態
      if (button) {
        setButtonState('error', '更新失敗');
        setTimeout(() => {
          setButtonState('default', '刷新統計');
          button.disabled = false;
        }, 2000);
      }
    }
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
    const usedMB = parseFloat(usage.usedMB);

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
        const icon = UI_ICONS.INFO; // 使用資訊或搜索圖標
        buttonText.textContent = '';
        buttonText.appendChild(createSafeIcon(icon));
        buttonText.appendChild(document.createTextNode(' 檢查中...'));
      }
    } else {
      button.classList.remove('loading');
      button.disabled = false;
      if (buttonText) {
        buttonText.textContent = '';
        const defaultIcon = UI_ICONS.INFO; // 使用預設圖標
        buttonText.appendChild(createSafeIcon(defaultIcon));
        buttonText.appendChild(document.createTextNode(' 預覽清理效果'));
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
      const icon = UI_ICONS.INFO;
      buttonText.textContent = '';
      buttonText.appendChild(createSafeIcon(icon));
      buttonText.appendChild(
        document.createTextNode(` 檢查中... ${current}/${total} (${percentage}%)`)
      );
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

        if (!page.data || !page.data.notionPageId) {
          continue;
        }

        try {
          const exists = await StorageManager.checkNotionPageExists(page.data.notionPageId);

          if (!exists) {
            const savedKey = page.key;
            const highlightsKey = `highlights_${page.url}`;

            const savedSize = new Blob([JSON.stringify({ [savedKey]: page.data })]).size;
            const highlightsData = data[highlightsKey];
            const highlightsSize = highlightsData
              ? new Blob([JSON.stringify({ [highlightsKey]: highlightsData })]).size
              : 0;
            const totalSize = savedSize + highlightsSize;

            plan.items.push({
              key: savedKey,
              url: page.url,
              size: savedSize,
              reason: '已刪除頁面的保存狀態',
            });

            if (highlightsData) {
              plan.items.push({
                key: highlightsKey,
                url: page.url,
                size: highlightsSize,
                reason: '已刪除頁面的標註數據',
              });
            }

            plan.spaceFreed += totalSize;
            plan.deletedPages++;
          }

          if (i < savedPages.length - 1) {
            await new Promise(sleep => setTimeout(sleep, 350));
          }
        } catch (error) {
          Logger.error('Page existence check failed', {
            action: 'check_page_existence',
            url: page.url,
            error,
          });
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
      return response && response.exists === true;
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
      strong.appendChild(createSafeIcon(icon));
      strong.appendChild(document.createTextNode(' 沒有發現需要清理的數據'));
      container.appendChild(strong);

      const paragraph = document.createElement('p');
      paragraph.textContent = '所有頁面記錄都是有效的，無需清理。';
      container.appendChild(paragraph);

      this.elements.cleanupPreview.textContent = '';
      this.elements.cleanupPreview.appendChild(container);
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

    summaryLines.push('');
    summaryLines.push(UI_MESSAGES.STORAGE.SPACE_FREED_ESTIMATE(spaceMB));

    // summaryText variable removed as it was unused

    const icon = UI_ICONS.WARNING;

    this.elements.cleanupPreview.textContent = '';

    // 1. 構建 Summary 區塊
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'cleanup-summary';

    const paragraph = document.createElement('p');
    // 處理換行
    summaryLines.forEach((line, index) => {
      paragraph.appendChild(document.createTextNode(line));
      if (index < summaryLines.length - 1) {
        paragraph.appendChild(document.createElement('br'));
      }
    });
    summaryDiv.appendChild(paragraph);

    const warningDiv = document.createElement('div');
    warningDiv.className = 'warning-notice';
    // icon 是受信任的 SVG 字串
    warningDiv.appendChild(createSafeIcon(icon));

    // " 重要提醒："
    warningDiv.appendChild(document.createTextNode(' '));
    const labelStrong = document.createElement('strong');
    labelStrong.textContent = '重要提醒：';
    warningDiv.appendChild(labelStrong);
    warningDiv.appendChild(document.createTextNode('這只會清理擴展中的無效記錄，'));

    // "絕對不會影響您在 Notion 中保存的任何頁面"
    const panicStrong = document.createElement('strong');
    panicStrong.textContent = '絕對不會影響您在 Notion 中保存的任何頁面';
    warningDiv.appendChild(panicStrong);
    warningDiv.appendChild(document.createTextNode('。'));

    summaryDiv.appendChild(warningDiv);
    this.elements.cleanupPreview.appendChild(summaryDiv);

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
      itemDiv.appendChild(urlStrong);

      itemDiv.appendChild(document.createTextNode(` - ${item.reason}`));
      itemDiv.appendChild(document.createElement('br'));

      const sizeSmall = document.createElement('small');
      sizeSmall.textContent = `${(item.size / 1024).toFixed(1)} KB`;
      itemDiv.appendChild(sizeSmall);

      fragment.appendChild(itemDiv);
    });

    if (plan.items.length > 10) {
      const moreDiv = document.createElement('div');
      moreDiv.className = 'cleanup-item';
      const em = document.createElement('em');
      em.textContent = `... 還有 ${plan.items.length - 10} 個項目`;
      moreDiv.appendChild(em);
      fragment.appendChild(moreDiv);
    }

    listDiv.appendChild(fragment);
    this.elements.cleanupPreview.appendChild(listDiv);
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

      await new Promise((resolve, reject) => {
        chrome.storage.local.remove(keysToRemove, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

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

        let migrationDataSize = 0;
        let migrationKeysCount = 0;
        let emptyHighlightKeys = 0;
        let emptyHighlightSize = 0;

        const optimizedData = {};
        const keysToRemove = [];

        for (const [key, value] of Object.entries(data)) {
          if (key.includes('migration') || key.includes('_v1_') || key.includes('_backup_')) {
            migrationKeysCount++;
            const size = new Blob([JSON.stringify({ [key]: value })]).size;
            migrationDataSize += size;
            keysToRemove.push(key);
            continue;
          }

          if (key.startsWith('highlights_')) {
            const highlightsArray = Array.isArray(value) ? value : value?.highlights;
            if (Array.isArray(highlightsArray) && highlightsArray.length > 0) {
              plan.highlightPages++;
              plan.totalHighlights += highlightsArray.length;
              optimizedData[key] = value;
            } else {
              emptyHighlightKeys++;
              emptyHighlightSize += new Blob([JSON.stringify({ [key]: value })]).size;
              keysToRemove.push(key);
            }
          } else {
            optimizedData[key] = value;
          }
        }

        if (migrationDataSize > 1024) {
          const sizeKB = (migrationDataSize / 1024).toFixed(1);
          plan.optimizations.push(`清理遷移數據（${migrationKeysCount} 項，${sizeKB} KB）`);
          plan.canOptimize = true;
        }

        if (emptyHighlightKeys > 0) {
          const sizeKB = (emptyHighlightSize / 1024).toFixed(1);
          plan.optimizations.push(`移除空標註紀錄（${emptyHighlightKeys} 項，${sizeKB} KB）`);
          plan.canOptimize = true;
        }

        plan.keysToRemove = keysToRemove;
        plan.optimizedData = optimizedData;

        const optimizedJson = JSON.stringify(optimizedData);
        plan.optimizedSize = new Blob([optimizedJson]).size;
        plan.spaceSaved = plan.originalSize - plan.optimizedSize;

        if (migrationKeysCount > 0 || emptyHighlightKeys > 0) {
          plan.canOptimize = true;
        }

        const hasFragmentation = Object.keys(data).some(
          key => key.startsWith('highlights_') && (!data[key] || !Array.isArray(data[key]))
        );

        if (hasFragmentation) {
          plan.optimizations.push('修復數據碎片');
          plan.canOptimize = true;
        }

        resolve(plan);
      });
    });
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
      strong.appendChild(createSafeIcon(UI_ICONS.SUCCESS));
      strong.appendChild(document.createTextNode(' 數據已經處於最佳狀態'));
      container.appendChild(strong);

      // Description
      const paragraph = document.createElement('p');
      paragraph.textContent = '當前數據結構已經很好，暫時不需要重整優化。';
      container.appendChild(paragraph);

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
        div.appendChild(createSafeIcon(item.icon));
        div.appendChild(document.createTextNode(item.text));
        statsDiv.appendChild(div);
      });

      container.appendChild(statsDiv);
      this.elements.optimizationPreview.appendChild(container);
      return;
    }

    const spaceSavedMB = (plan.spaceSaved / (1024 * 1024)).toFixed(3);
    const percentSaved = ((plan.spaceSaved / plan.originalSize) * 100).toFixed(1);

    const container = document.createElement('div');
    container.className = 'optimization-summary';

    // Header
    const strong = document.createElement('strong');
    strong.appendChild(createSafeIcon(UI_ICONS.BOLT));
    strong.appendChild(document.createTextNode(' 數據重整分析結果'));
    container.appendChild(strong);

    // Description
    const paragraph = document.createElement('p');
    paragraph.appendChild(document.createTextNode('可以優化您的數據結構，預計節省 '));

    const mbStrong = document.createElement('strong');
    mbStrong.textContent = `${spaceSavedMB} MB`;
    paragraph.appendChild(mbStrong);

    paragraph.appendChild(document.createTextNode(' 空間（'));

    const pctStrong = document.createElement('strong');
    pctStrong.textContent = `${percentSaved}%`;
    paragraph.appendChild(pctStrong);

    paragraph.appendChild(document.createTextNode('）'));
    container.appendChild(paragraph);

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
      div.appendChild(createSafeIcon(item.icon));
      div.appendChild(document.createTextNode(item.label));

      const span = document.createElement('span');
      span.className = item.className;
      span.textContent = item.value;
      div.appendChild(span);

      comparisonDiv.appendChild(div);
    });

    detailsDiv.appendChild(comparisonDiv);

    // Optimization List
    const listDiv = document.createElement('div');
    listDiv.className = 'optimization-list';

    const listStrong = document.createElement('strong');
    listStrong.textContent = '將執行的優化：';
    listDiv.appendChild(listStrong);

    plan.optimizations.forEach(opt => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'optimization-item';
      itemDiv.appendChild(createSafeIcon(UI_ICONS.CHECK));
      itemDiv.appendChild(document.createTextNode(` ${opt}`));
      listDiv.appendChild(itemDiv);
    });

    detailsDiv.appendChild(listDiv);
    container.appendChild(detailsDiv);
    this.elements.optimizationPreview.appendChild(container);
  }

  async executeOptimization() {
    try {
      if (!this.optimizationPlan || !this.optimizationPlan.canOptimize) {
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
   * @SECURITY_NOTE 此函數僅應接收內部可信的訊息字串
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
        case 'success':
          safeIcon = UI_ICONS.SUCCESS;
          break;
        case 'error':
          safeIcon = UI_ICONS.ERROR;
          break;
        case 'warning':
          safeIcon = UI_ICONS.WARNING;
          break;
        case 'info':
          safeIcon = UI_ICONS.INFO;
          break;
        default:
          safeIcon = UI_ICONS.INFO;
          break;
      }
    }

    // 清空內容
    this.elements.dataStatus.textContent = '';

    // 如果有圖標，插入圖標
    if (safeIcon) {
      const iconSpan = createSafeIcon(safeIcon);
      iconSpan.className = 'status-icon';
      this.elements.dataStatus.appendChild(iconSpan);
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
            textSpan.appendChild(numSpan);
          } else {
            // 其他文字，使用 TextNode 自動轉義
            textSpan.appendChild(document.createTextNode(token));
          }
        });

        if (index < lines.length - 1) {
          textSpan.appendChild(document.createElement('br'));
        }
      });

      this.elements.dataStatus.appendChild(textSpan);
    }

    this.elements.dataStatus.className = `data-status ${type}`;
  }
}
