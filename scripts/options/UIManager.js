/**
 * UIManager.js
 * 負責選項頁面的共用 UI 邏輯
 */

export class UIManager {
  constructor() {
    this.elements = {};
    this.upgradeNoticeBanner = null;
    this.dependencies = {};
  }

  /**
   * 初始化 UI 管理器
   * @param {Object} dependencies - 依賴項 (e.g., { loadDatabases })
   */
  init(dependencies = {}) {
    this.dependencies = dependencies;

    // 快取主要 DOM 元素
    this.elements.status = document.getElementById('status');
    this.elements.manualSection = document.querySelector('.manual-section');
    this.elements.testApiButton = document.getElementById('test-api-button');
  }

  /**
   * 顯示狀態消息
   * @param {string} message - 訊息內容
   * @param {string} type - 訊息類型 (info, success, error)
   * @param {string} [targetId='status'] - 目標元素 ID
   */
  showStatus(message, type = 'info', targetId = 'status') {
    const status = document.getElementById(targetId) || this.elements.status;
    if (!status) {
      return;
    }

    status.textContent = message;
    status.classList.remove('success', 'error', 'info', 'status-message'); // 清除舊類
    status.classList.add('status-message', type); // 添加基礎類和類型類

    if (type === 'success') {
      setTimeout(() => {
        status.textContent = '';
        status.classList.remove('success', 'error', 'info', 'status-message');
      }, 3000);
    }
  }

  /**
   * 顯示資料來源升級通知橫幅
   * @param {string} legacyDatabaseId - 舊的資料庫ID
   */
  showDataSourceUpgradeNotice(legacyDatabaseId = '') {
    const manualSection = this.elements.manualSection || document.querySelector('.manual-section');
    if (!manualSection) {
      return;
    }

    if (!this.upgradeNoticeBanner) {
      this.upgradeNoticeBanner = document.createElement('div');
      this.upgradeNoticeBanner.className = 'upgrade-notice';
      this.upgradeNoticeBanner.innerHTML = `
                <strong>Notion API 已升級至 2025-09-03 版本</strong>
                <p>偵測到您仍在使用舊的 Database ID：<code class="upgrade-notice-id">${legacyDatabaseId || '未設定'}</code>。請重新載入並選擇資料來源（Data Source），以儲存新的 Data Source ID，確保同步與標註完全正常。</p>
                <div class="upgrade-hint">提示：點擊下方按鈕重新載入資料來源後，從列表重新選擇並儲存設定即可完成升級。</div>
                <div class="upgrade-actions">
                    <button type="button" class="upgrade-refresh-button">🔄 重新載入資料來源</button>
                </div>
            `;

      manualSection.insertBefore(this.upgradeNoticeBanner, manualSection.firstChild);

      const refreshButton = this.upgradeNoticeBanner.querySelector('.upgrade-refresh-button');
      if (refreshButton) {
        refreshButton.addEventListener('click', () => {
          const testApiButton =
            this.elements.testApiButton || document.getElementById('test-api-button');
          if (testApiButton && !testApiButton.disabled) {
            testApiButton.click();
          }
        });
      }
    }

    const idDisplay = this.upgradeNoticeBanner.querySelector('.upgrade-notice-id');
    if (idDisplay) {
      idDisplay.textContent = legacyDatabaseId || '未設定';
    }
  }

  /**
   * 隱藏資料來源升級通知橫幅
   */
  hideDataSourceUpgradeNotice() {
    this.upgradeNoticeBanner?.remove();
    this.upgradeNoticeBanner = null;
  }

  /**
   * 顯示簡化設置指南
   */
  showSetupGuide() {
    const manualSection = this.elements.manualSection || document.querySelector('.manual-section');
    if (!manualSection) {
      return;
    }

    const guideHtml = `
            <div style="background: #e6fffa; border: 1px solid #38b2ac; border-radius: 6px; padding: 15px; margin: 15px 0;">
                <h3 style="margin: 0 0 10px 0; color: #2c7a7b;">📋 快速設置</h3>
                <ol style="margin: 0; padding-left: 20px; line-height: 1.6;">
                    <li>點擊 <strong>"+ New integration"</strong> 創建新的集成</li>
                    <li>複製 <strong>"Internal Integration Token"</strong></li>
                    <li>將 Token 貼到下方的 API Key 欄位</li>
                    <li>系統會自動載入可用的資料來源列表</li>
                </ol>
            </div>
        `;

    const existingGuide = document.querySelector('.setup-guide');
    if (existingGuide) {
      existingGuide.remove();
    }

    const guideDiv = document.createElement('div');
    guideDiv.className = 'setup-guide';
    guideDiv.innerHTML = guideHtml;

    manualSection.insertBefore(guideDiv, manualSection.firstChild);
  }
}
