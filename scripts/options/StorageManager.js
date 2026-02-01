/**
 * StorageManager.js
 * 負責存儲空間分析、清理與優化
 */

/* global chrome */

import Logger from '../utils/Logger.js';
import { sanitizeApiError, validateSafeSvg, separateIconAndText } from '../utils/securityUtils.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';

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
      this.showDataStatus('正在備份數據...', 'info');

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

      const icon =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><polyline points="20 6 9 17 4 12"/></svg>';
      this.showDataStatus(`${icon} 數據備份成功！備份文件已下載。`, 'success');
    } catch (error) {
      Logger.error('Backup failed:', error);
      const icon =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
      const safeMessage = sanitizeApiError(error, 'export_backup');
      const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
      this.showDataStatus(`${icon} 備份失敗：${errorMsg}`, 'error');
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
        this.showDataStatus('正在恢復數據...', 'info');

        const backup = JSON.parse(readerEvent.target.result);

        if (!backup.data) {
          throw new Error('無效的備份文件格式');
        }

        await new Promise(resolve => {
          chrome.storage.local.set(backup.data, resolve);
        });

        const icon =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><polyline points="20 6 9 17 4 12"/></svg>';
        this.showDataStatus(
          `${icon} 數據恢復成功！已恢復 ${Object.keys(backup.data).length} 項數據。正在重新整理...`,
          'success'
        );

        // 清除文件選擇
        this.elements.importFile.value = '';

        // 重新載入頁面或狀態
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } catch (error) {
        Logger.error('Import failed:', error);
        const icon =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        const safeMessage = sanitizeApiError(error, 'import_backup');
        const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
        this.showDataStatus(`${icon} 恢復失敗：${errorMsg}`, 'error');
        this.elements.importFile.value = '';
      }
    };
    reader.readAsText(file);
  }

  async checkDataIntegrity() {
    try {
      this.showDataStatus('正在檢查數據完整性...', 'info');

      const data = await new Promise(resolve => {
        chrome.storage.local.get(null, resolve);
      });

      const report = StorageManager.analyzeData(data);

      let statusText = '📊 數據完整性報告：\n';
      statusText += `• 總共 ${report.totalKeys} 個數據項\n`;
      statusText += `• ${report.highlightPages} 個頁面有標記\n`;
      statusText += `• ${report.configKeys} 個配置項\n`;

      if (report.migrationKeys > 0) {
        const migrationSizeKB = (report.migrationDataSize / 1024).toFixed(1);
        statusText += `• ⚠️ ${report.migrationKeys} 個遷移數據（${migrationSizeKB} KB，可清理）\n`;
      }

      if (report.corruptedData.length > 0) {
        statusText += `• ⚠️ ${report.corruptedData.length} 個損壞的數據項`;
        this.showDataStatus(statusText, 'error');
      } else if (report.migrationKeys > 0) {
        statusText += '• 💡 建議使用「數據重整」功能清理遷移數據';
        this.showDataStatus(statusText, 'warning');
      } else {
        statusText += '• ✅ 所有數據完整無損';
        this.showDataStatus(statusText, 'success');
      }
    } catch (error) {
      Logger.error('Data check failed:', error);
      const icon =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
      const safeMessage = sanitizeApiError(error, 'check_duplicates');
      const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
      this.showDataStatus(`${icon} 檢查失敗：${errorMsg}`, 'error');
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
      refresh:
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-svg"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M21 21v-5h-5"/></svg>',
      check:
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-svg"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      error:
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-svg"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    };

    // Helper to update button content
    const setButtonState = (state, text, disabled = false) => {
      if (!button) {
        return;
      }

      let icon = ICONS.refresh; // default
      if (state === 'success') {
        icon = ICONS.check;
      }
      if (state === 'error') {
        icon = ICONS.error;
      }

      // Add spinning class for loading state if needed, or handle via CSS
      if (state === 'loading') {
        // You might want to add a spinning class to the svg if you have one
        // icon = icon.replace('class="icon-svg"', 'class="icon-svg spin"');
      }

      button.innerHTML = `${icon} ${text}`;
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
      Logger.error('Failed to get storage usage:', error);

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
      const alertIcon =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
      this.showDataStatus(
        `${alertIcon} 數據量過大 (${usage.usedMB} MB)，可能影響擴展性能，建議立即清理`,
        'error'
      );
    } else if (usedMB > 80) {
      const icon =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
      this.showDataStatus(
        `${icon} 數據量較大 (${usage.usedMB} MB)，建議清理不需要的標記數據以維持最佳性能`,
        'warning'
      );
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
      Logger.error('預覽清理失敗:', error);
      const safeMessage = sanitizeApiError(error, 'preview_cleanup');
      const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
      this.showDataStatus(`❌ 預覽清理失敗: ${errorMsg}`, 'error');
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
        const icon =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
        buttonText.innerHTML = `${icon} 檢查中...`;
      }
    } else {
      button.classList.remove('loading');
      button.disabled = false;
      if (buttonText) {
        const icon =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
        buttonText.innerHTML = `${icon} 預覽清理效果`;
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
      const icon =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
      buttonText.innerHTML = `${icon} 檢查中... ${current}/${total} (${percentage}%)`;
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
          Logger.error(`檢查頁面失敗: ${page.url}`, error);
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
      Logger.error('檢查頁面存在失敗:', error);
      return true;
    }
  }

  displayCleanupPreview(plan) {
    if (!this.elements.cleanupPreview) {
      return;
    }
    this.elements.cleanupPreview.className = 'cleanup-preview show';

    if (plan.items.length === 0) {
      const icon =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><polyline points="20 6 9 17 4 12"/></svg>';
      this.elements.cleanupPreview.innerHTML = `
                <div class="cleanup-summary">
                    <strong>${icon} 沒有發現需要清理的數據</strong>
                    <p>所有頁面記錄都是有效的，無需清理。</p>
                </div>
            `;
      return;
    }

    const spaceMB = (plan.spaceFreed / (1024 * 1024)).toFixed(3);

    let summaryText = '🧹 安全清理預覽\n\n將清理：\n';
    if (plan.deletedPages > 0) {
      summaryText += `• ${plan.deletedPages} 個已刪除頁面的數據\n`;
    }
    summaryText += `\n釋放約 <span class="highlight-success">${spaceMB} MB</span> 空間`;

    const icon =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    const warnIcon =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

    this.elements.cleanupPreview.innerHTML = `
            <div class="cleanup-summary">
                <strong>${icon} 安全清理預覽</strong>
                <p>${summaryText.replace(/\n/g, '<br>')}</p>
                <div class="warning-notice">
                    ${warnIcon} <strong>重要提醒：</strong>這只會清理擴展中的無效記錄，<strong>絕對不會影響您在 Notion 中保存的任何頁面</strong>。
                </div>
            </div>
            <div class="cleanup-list">
                ${plan.items
                  .slice(0, 10)
                  .map(
                    item => `
                    <div class="cleanup-item">
                        <strong>${decodeURIComponent(item.url)}</strong> - ${item.reason}
                        <br><small>${(item.size / 1024).toFixed(1)} KB</small>
                    </div>
                `
                  )
                  .join('')}
                ${plan.items.length > 10 ? `<div class="cleanup-item"><em>... 還有 ${plan.items.length - 10} 個項目</em></div>` : ''}
            </div>
        `;
  }

  async executeSafeCleanup() {
    if (!this.cleanupPlan || this.cleanupPlan.items.length === 0) {
      const icon =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
      this.showDataStatus(`${icon} 沒有清理計劃可執行`, 'error');
      return;
    }

    try {
      const icon =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>';
      this.showDataStatus(`${icon} 正在執行安全清理...`, 'info');

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
      const successIcon =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><polyline points="20 6 9 17 4 12"/></svg>';
      let message = `${successIcon} 安全清理完成！已移除 ${this.cleanupPlan.totalKeys} 個無效記錄，釋放 ${spaceKB} KB 空間`;

      if (this.cleanupPlan.deletedPages > 0) {
        message += `\n• 清理了 ${this.cleanupPlan.deletedPages} 個已刪除頁面的數據`;
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
      Logger.error('Cleanup failed:', error);
      const failIcon =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
      const safeMessage = sanitizeApiError(error, 'cleanup');
      const errorMsg = ErrorHandler.formatUserMessage(safeMessage);
      this.showDataStatus(`${failIcon} 清理失敗：${errorMsg}`, 'error');
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

    if (!plan.canOptimize) {
      const icon =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><polyline points="20 6 9 17 4 12"/></svg>';
      const statsIcon1 =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';
      const statsIcon2 =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>';
      const statsIcon3 =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';

      this.elements.optimizationPreview.innerHTML = `
                <div class="optimization-summary">
                    <strong>${icon} 數據已經處於最佳狀態</strong>
                    <p>當前數據結構已經很好，暫時不需要重整優化。</p>
                    <div class="data-stats">
                        <div>${statsIcon1} 標記頁面：${plan.highlightPages}</div>
                        <div>${statsIcon2} 總標記數：${plan.totalHighlights}</div>
                        <div>${statsIcon3} 數據大小：${(plan.originalSize / 1024).toFixed(1)} KB</div>
                    </div>
                </div>
            `;
      return;
    }

    const spaceSavedMB = (plan.spaceSaved / (1024 * 1024)).toFixed(3);
    const percentSaved = ((plan.spaceSaved / plan.originalSize) * 100).toFixed(1);

    const icon =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
    const chartIcon =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>';
    const diskIcon =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';
    const checkIcon =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><polyline points="20 6 9 17 4 12"/></svg>';

    this.elements.optimizationPreview.innerHTML = `
            <div class="optimization-summary">
                <strong>${icon} 數據重整分析結果</strong>
                <p>可以優化您的數據結構，預計節省 <strong>${spaceSavedMB} MB</strong> 空間（<strong>${percentSaved}%</strong>）</p>
                <div class="optimization-details">
                    <div class="size-comparison">
                        <div>${chartIcon} 當前大小：<span class="highlight-text">${(plan.originalSize / 1024).toFixed(1)} KB</span></div>
                        <div>${chartIcon} 優化後：<span class="highlight-success">${(plan.optimizedSize / 1024).toFixed(1)} KB</span></div>
                        <div>${diskIcon} 節省空間：<span class="highlight-primary">${(plan.spaceSaved / 1024).toFixed(1)} KB</span></div>
                    </div>
                    <div class="optimization-list">
                        <strong>將執行的優化：</strong>
                        ${plan.optimizations.map(opt => `<div class="optimization-item">${checkIcon} ${opt}</div>`).join('')}
                    </div>
                </div>
            </div>
        `;
  }

  async executeOptimization() {
    if (!this.optimizationPlan || !this.optimizationPlan.canOptimize) {
      const icon =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
      this.showDataStatus(`${icon} 沒有優化計劃可執行`, 'error');
      return;
    }

    try {
      const icon =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>';
      this.showDataStatus(`${icon} 正在執行數據重整...`, 'info');

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
      const successIcon =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><polyline points="20 6 9 17 4 12"/></svg>';
      this.showDataStatus(
        `${successIcon} 數據重整完成！已清理遷移數據，節省 ${spaceSavedKB} KB 空間，所有標記內容完整保留`,
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
      Logger.error('Optimization failed:', error);
      const failIcon =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
      const safeMessage = sanitizeApiError(error, 'organize_highlights');
      const translated = ErrorHandler.formatUserMessage(safeMessage);
      this.showDataStatus(`${failIcon} 數據重整失敗：${translated}`, 'error');
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

    // 清空內容
    this.elements.dataStatus.innerHTML = '';

    // 如果有圖標，插入圖標
    if (safeIcon) {
      const iconSpan = document.createElement('span');
      iconSpan.className = 'status-icon';
      // Emoji 可以直接用 textContent，SVG 需要 innerHTML（已通過安全驗證）
      if (safeIcon.startsWith('<svg')) {
        iconSpan.innerHTML = safeIcon;
      } else {
        iconSpan.textContent = safeIcon;
      }
      this.elements.dataStatus.appendChild(iconSpan);
    }

    // 使用 textContent 設置文本（防止 XSS），並支持換行
    if (text) {
      const textSpan = document.createElement('span');
      textSpan.className = 'status-text';

      // 處理換行符：將文本按 \n 分割，並插入 <br> 標籤
      const lines = text.split('\n');
      lines.forEach((line, index) => {
        textSpan.appendChild(document.createTextNode(line));
        if (index < lines.length - 1) {
          textSpan.appendChild(document.createElement('br'));
        }
      });

      this.elements.dataStatus.appendChild(textSpan);
    }

    this.elements.dataStatus.className = `data-status ${type}`;
  }
}
