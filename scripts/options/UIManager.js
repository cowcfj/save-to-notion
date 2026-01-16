/**
 * UIManager.js
 * 負責選項頁面的共用 UI 邏輯
 */

import { validateSafeSvg, separateIconAndText } from '../utils/securityUtils.js';

/**
 * UI 管理器類別
 * 負責選項頁面的共用 UI 邏輯，包括狀態顯示、升級通知和設置指南
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
   * 顯示狀態消息（安全版本：分離圖標與文本）
   *
   * @SECURITY_NOTE 此函數僅應接收內部可信的訊息字串
   * - SVG 圖標內容應由系統內部生成，不應來自外部輸入
   * - 所有外部錯誤訊息必須先經過 sanitizeApiError() 清理
   * - message 參數不應直接包含未經驗證的用戶輸入或 API 響應
   *
   * @param {string|Object} message - 訊息內容（字串或對象 {icon, text}）
   *   - 字串格式：可包含系統生成的 SVG 標籤（會自動分離）或純文本
   *   - 對象格式：{icon: '內部生成的SVG', text: '已清理的文本'}
   * @param {string} type - 訊息類型 (info, success, error)
   * @param {string} [targetId='status'] - 目標元素 ID
   */
  showStatus(message, type = 'info', targetId = 'status') {
    const status = document.getElementById(targetId) || this.elements.status;
    if (!status) {
      return;
    }

    // 向後兼容：支持對象或字串格式
    let icon = '';
    let text = '';

    if (typeof message === 'object' && message !== null) {
      // 新格式：{icon: '...', text: '...'}
      icon = message.icon || '';
      text = message.text || '';
    } else if (typeof message === 'string') {
      // 使用共用函數分離圖標和文本（統一處理 Emoji 和 SVG）
      const separated = separateIconAndText(message);
      icon = separated.icon;
      text = separated.text;
    }

    // SVG 安全驗證：使用 securityUtils 統一處理
    // 即使預期只接收內部生成的 SVG，仍進行驗證作為縱深防禦
    if (icon && !validateSafeSvg(icon)) {
      icon = ''; // 拒絕不安全的 SVG
    }

    // 清空並重建內容（安全方式）
    status.innerHTML = '';

    // 如果有圖標，使用 innerHTML 插入（圖標已通過安全驗證）
    if (icon) {
      const iconSpan = document.createElement('span');
      iconSpan.className = 'status-icon';
      iconSpan.innerHTML = icon;
      status.appendChild(iconSpan);
    }

    // 使用 textContent 設置文本（防止 XSS）
    if (text) {
      const textSpan = document.createElement('span');
      textSpan.className = 'status-text';
      textSpan.textContent = text;
      status.appendChild(textSpan);
    }

    status.classList.remove('success', 'error', 'info', 'status-message'); // 清除舊類
    status.classList.add('status-message', type); // 添加基礎類和類型類

    if (type === 'success') {
      setTimeout(() => {
        status.innerHTML = '';
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
