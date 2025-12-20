/**
 * MigrationTool.js
 * 負責舊版標註數據的遷移 UI 與協調
 */
import { MigrationScanner } from './MigrationScanner.js';

export class MigrationTool {
  constructor(uiManager) {
    this.ui = uiManager;
    this.scanner = new MigrationScanner();
    this.elements = {};
    this.scanResult = null;
  }

  init() {
    this.initializeElements();
    this.setupEventListeners();
  }

  initializeElements() {
    this.elements = {
      scanButton: document.getElementById('scan-legacy-button'),
      scanStatus: document.getElementById('scan-status'),
      migrationList: document.getElementById('migration-list'),
      migrateAllButton: document.getElementById('migrate-all-button'),
    };
  }

  setupEventListeners() {
    this.elements.scanButton?.addEventListener('click', () => this.scanForLegacyHighlights());
    this.elements.migrateAllButton?.addEventListener('click', () => this.performMigration());
  }

  async scanForLegacyHighlights() {
    const { scanStatus, migrateAllButton, _migrationList, scanButton } = this.elements;

    if (scanStatus) {
      scanStatus.innerHTML = '<span class="loading"></span> 正在掃描...';
    }
    if (migrateAllButton) {
      migrateAllButton.style.display = 'none';
    }
    if (scanButton) {
      scanButton.disabled = true;
    }

    try {
      const result = await this.scanner.scanStorage();
      this.scanResult = result;
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

  handleScanResult(result) {
    const { scanStatus, migrateAllButton, migrationList } = this.elements;

    if (!result.needsMigration) {
      if (scanStatus) {
        scanStatus.textContent = '✅ 未發現舊版格式的標註，所有數據均為最新格式。';
        scanStatus.className = 'success';
      }
      if (migrationList) {
        migrationList.innerHTML = '';
      }
      return;
    }

    if (scanStatus) {
      scanStatus.innerHTML = `
        <div class="warning-box">
            <strong>⚠️ 發現 ${result.items.length} 個頁面包含舊版標記</strong>
            <p>共檢測到 ${result.legacyCount} 個舊版標記需遷移。建議執行遷移以確保最佳體驗。</p>
        </div>
      `;
      scanStatus.className = '';
    }

    this.renderMigrationList(result.items);

    if (migrateAllButton) {
      migrateAllButton.style.display = 'inline-block';
      migrateAllButton.textContent = `🔄 一鍵遷移所有舊版標註 (${result.items.length} 頁)`;
    }
  }

  renderMigrationList(items) {
    if (!this.elements.migrationList) {
      return;
    }

    if (items.length === 0) {
      this.elements.migrationList.innerHTML = '';
      return;
    }

    const html = items
      .map(
        item => `
          <div class="migration-item">
            <div class="url" title="${item.url}">${MigrationTool.truncateUrl(item.url)}</div>
            <div class="count">${item.highlightCount} 個標註</div>
          </div>
        `
      )
      .join('');

    this.elements.migrationList.innerHTML = `
      <div class="migration-list-header">
        <span>待遷移頁面</span>
        <span>標註數量</span>
      </div>
      ${html}
    `;
  }

  async performMigration() {
    if (!this.scanResult || !this.scanResult.needsMigration) {
      return;
    }

    const urls = this.scanResult.items.map(item => item.url);
    const { scanStatus, migrateAllButton } = this.elements;

    if (migrateAllButton) {
      migrateAllButton.disabled = true;
      migrateAllButton.innerHTML = '<span class="loading"></span> 遷移中...';
    }

    try {
      const results = await this.scanner.requestBatchMigration(urls, (current, total, status) => {
        if (scanStatus) {
          const percent = Math.round((current / total) * 100);
          scanStatus.innerHTML = `
            <div class="progress-box">
                <div>正在遷移... ${percent}% (${current}/${total})</div>
                <div class="progress-bar"><div class="fill" style="width: ${percent}%"></div></div>
                <small>${status}</small>
            </div>
          `;
        }
      });

      if (results.failed === 0) {
        if (scanStatus) {
          scanStatus.innerHTML = `
            <div class="success-box">
                <strong>✅ 遷移成功！</strong>
                <p>已成功遷移 ${results.success} 個頁面的數據。現在所有標註都已轉換為新版格式。</p>
            </div>
          `;
          scanStatus.className = 'success';
        }
        if (this.elements.migrationList) {
          this.elements.migrationList.innerHTML = '';
        }
        if (migrateAllButton) {
          migrateAllButton.style.display = 'none';
        }

        // 觸發刷新儲存使用量
        const storageUsageEvent = new CustomEvent('storageUsageUpdate');
        document.dispatchEvent(storageUsageEvent);
      } else {
        if (scanStatus) {
          scanStatus.innerHTML = `
            <div class="warning-box">
                <strong>⚠️ 遷移部分完成</strong>
                <p>成功: ${results.success}, 失敗: ${results.failed}</p>
                <div class="error-list">
                    ${results.errors.map(err => `<div>${err}</div>`).join('')}
                </div>
            </div>
          `;
          scanStatus.className = 'warning';
        }
        if (migrateAllButton) {
          migrateAllButton.disabled = false;
          migrateAllButton.textContent = '重試失敗的項目';
        }
      }
    } catch (error) {
      if (scanStatus) {
        scanStatus.textContent = `遷移過程發生錯誤: ${error.message}`;
        scanStatus.className = 'error';
      }
      if (migrateAllButton) {
        migrateAllButton.disabled = false;
        migrateAllButton.textContent = '重試遷移';
      }
    }
  }

  static truncateUrl(url, maxLength = 60) {
    if (url.length <= maxLength) {
      return url;
    }
    return `${url.substring(0, maxLength - 3)}...`;
  }
}
