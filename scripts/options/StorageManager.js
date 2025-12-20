/**
 * StorageManager.js
 * 負責存儲空間分析、清理與優化
 */

/* global chrome */

import Logger from '../utils/Logger.js';

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

      this.showDataStatus('✅ 數據備份成功！備份文件已下載。', 'success');
    } catch (error) {
      Logger.error('Backup failed:', error);
      this.showDataStatus(`❌ 備份失敗：${error.message}`, 'error');
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

        this.showDataStatus(
          `✅ 數據恢復成功！已恢復 ${Object.keys(backup.data).length} 項數據。正在重新整理...`,
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
        this.showDataStatus(`❌ 恢復失敗：${error.message}`, 'error');
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

      const report = this.analyzeData(data);

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
      this.showDataStatus(`❌ 檢查失敗：${error.message}`, 'error');
    }
  }

  analyzeData(data) {
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

    // 添加加載狀態
    if (button) {
      button.disabled = true;
      button.textContent = '🔄 更新中...';
    }

    try {
      const usage = await this.getStorageUsage();
      this.updateUsageDisplay(usage);

      // 顯示成功提示
      if (button) {
        button.textContent = '✅ 已更新';
        setTimeout(() => {
          button.textContent = '🔄 刷新使用情況';
          button.disabled = false;
        }, 1500);
      }
    } catch (error) {
      Logger.error('Failed to get storage usage:', error);

      // 顯示錯誤狀態
      if (button) {
        button.textContent = '❌ 更新失敗';
        setTimeout(() => {
          button.textContent = '🔄 刷新使用情況';
          button.disabled = false;
        }, 2000);
      }
    }
  }

  async getStorageUsage() {
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

    if (usedMB > 80) {
      this.showDataStatus(
        `⚠️ 數據量較大 (${usage.usedMB} MB)，建議清理不需要的標記數據以維持最佳性能`,
        'warning'
      );
    } else if (usedMB > 100) {
      this.showDataStatus(
        `🚨 數據量過大 (${usage.usedMB} MB)，可能影響擴展性能，建議立即清理`,
        'error'
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
      this.showDataStatus(`❌ 預覽清理失敗: ${error.message}`, 'error');
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
        buttonText.textContent = '🔍 檢查中...';
      }
    } else {
      button.classList.remove('loading');
      button.disabled = false;
      if (buttonText) {
        buttonText.textContent = '👀 預覽清理效果';
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
      buttonText.textContent = `🔍 檢查中... ${current}/${total} (${percentage}%)`;
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
          const exists = await this.checkNotionPageExists(page.data.notionPageId);

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

  async checkNotionPageExists(pageId) {
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
      this.elements.cleanupPreview.innerHTML = `
                <div class="cleanup-summary">
                    <strong>✅ 沒有發現需要清理的數據</strong>
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
    summaryText += `\n釋放約 ${spaceMB} MB 空間`;

    this.elements.cleanupPreview.innerHTML = `
            <div class="cleanup-summary">
                <strong>🧹 安全清理預覽</strong>
                <p>${summaryText.replace(/\n/g, '<br>')}</p>
                <div class="warning-notice">
                    ⚠️ <strong>重要提醒：</strong>這只會清理擴展中的無效記錄，<strong>絕對不會影響您在 Notion 中保存的任何頁面</strong>。
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
      this.showDataStatus('❌ 沒有清理計劃可執行', 'error');
      return;
    }

    try {
      this.showDataStatus('🔄 正在執行安全清理...', 'info');

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
      let message = `✅ 安全清理完成！已移除 ${this.cleanupPlan.totalKeys} 個無效記錄，釋放 ${spaceKB} KB 空間`;

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
      this.showDataStatus(`❌ 清理失敗：${error.message}`, 'error');
    }
  }

  async analyzeOptimization() {
    const plan = await this.generateOptimizationPlan();
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

  generateOptimizationPlan() {
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
      this.elements.optimizationPreview.innerHTML = `
                <div class="optimization-summary">
                    <strong>✅ 數據已經處於最佳狀態</strong>
                    <p>當前數據結構已經很好，暫時不需要重整優化。</p>
                    <div class="data-stats">
                        <div>📑 標記頁面：${plan.highlightPages}</div>
                        <div>🎯 總標記數：${plan.totalHighlights}</div>
                        <div>💾 數據大小：${(plan.originalSize / 1024).toFixed(1)} KB</div>
                    </div>
                </div>
            `;
      return;
    }

    const spaceSavedMB = (plan.spaceSaved / (1024 * 1024)).toFixed(3);
    const percentSaved = ((plan.spaceSaved / plan.originalSize) * 100).toFixed(1);

    this.elements.optimizationPreview.innerHTML = `
            <div class="optimization-summary">
                <strong>⚡ 數據重整分析結果</strong>
                <p>可以優化您的數據結構，預計節省 <strong>${spaceSavedMB} MB</strong> 空間（<strong>${percentSaved}%</strong>）</p>
                <div class="optimization-details">
                    <div class="size-comparison">
                        <div>📊 當前大小：${(plan.originalSize / 1024).toFixed(1)} KB</div>
                        <div>📊 優化後：${(plan.optimizedSize / 1024).toFixed(1)} KB</div>
                        <div>💾 節省空間：${(plan.spaceSaved / 1024).toFixed(1)} KB</div>
                    </div>
                    <div class="optimization-list">
                        <strong>將執行的優化：</strong>
                        ${plan.optimizations.map(opt => `<div class="optimization-item">✅ ${opt}</div>`).join('')}
                    </div>
                </div>
            </div>
        `;
  }

  async executeOptimization() {
    if (!this.optimizationPlan || !this.optimizationPlan.canOptimize) {
      this.showDataStatus('❌ 沒有優化計劃可執行', 'error');
      return;
    }

    try {
      this.showDataStatus('🔄 正在執行數據重整...', 'info');

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
      this.showDataStatus(
        `✅ 數據重整完成！已清理遷移數據，節省 ${spaceSavedKB} KB 空間，所有標記內容完整保留`,
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
      this.showDataStatus(`❌ 數據重整失敗：${error.message}`, 'error');
    }
  }

  showDataStatus(message, type) {
    if (!this.elements.dataStatus) {
      return;
    }
    this.elements.dataStatus.textContent = message;
    this.elements.dataStatus.className = `data-status ${type}`;
  }
}
