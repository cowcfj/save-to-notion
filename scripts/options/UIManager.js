/**
 * UIManager.js
 * 負責選項頁面的共用 UI 邏輯
 */

import { validateSafeSvg, separateIconAndText } from '../utils/securityUtils.js';
import { UI_ICONS, NOTION_API, UI_STATUS_TYPES, OPTIONS_PAGE_SELECTORS } from '../config/index.js';

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
   *
   * @param {object} dependencies - 依賴項 (e.g., { loadDatabases })
   */
  init(dependencies = {}) {
    this.dependencies = dependencies;

    // 快取主要 DOM 元素
    this.elements.status = document.querySelector(OPTIONS_PAGE_SELECTORS.STATUS_CONTAINER);
    this.elements.manualSection = document.querySelector(OPTIONS_PAGE_SELECTORS.MANUAL_SECTION);
    this.elements.testApiButton = document.querySelector(OPTIONS_PAGE_SELECTORS.TEST_API_BUTTON);
  }

  /**
   * 顯示狀態消息（安全版本：分離圖標與文本）
   *
   * NOTE: 此函數僅應接收內部可信的訊息字串
   * - SVG 圖標內容應由系統內部生成，不應來自外部輸入
   * - 所有外部錯誤訊息必須先經過 sanitizeApiError() 清理
   * - message 參數不應直接包含未經驗證的用戶輸入或 API 響應
   *
   * @param {string|object} message - 訊息內容（字串或對象 {icon, text}）
   *   - 字串格式：可包含系統生成的 SVG 標籤（會自動分離）或純文本
   *   - 對象格式：{icon: '內部生成的SVG', text: '已清理的文本'}
   * @param {string} type - 訊息類型 (info, success, error)
   * @param {string} [targetId='status'] - 目標元素 ID
   */
  showStatus(message, type = UI_STATUS_TYPES.INFO, targetId = 'status') {
    const selector =
      targetId === 'status' ? OPTIONS_PAGE_SELECTORS.STATUS_CONTAINER : `#${targetId}`;
    const status = document.querySelector(selector) || this.elements.status;
    if (!status) {
      return;
    }

    const { icon, text } = this._resolveMessage(message, type);

    // SVG 安全驗證
    const safeIcon = icon && validateSafeSvg(icon) ? icon : '';

    this._renderStatus(status, safeIcon, text, type);
  }

  /**
   * 解析圖標與文本 (私有)
   *
   * @param {string|object} message - 原始消息
   * @param {string} type - 消息類型
   * @returns {object} 解析後的 {icon, text}
   */
  _resolveMessage(message, type) {
    if (typeof message === 'object' && message !== null) {
      return { icon: message.icon || '', text: message.text || '' };
    }

    // 僅處理字串類型的訊息，非字串則預設為空
    const messageStr = typeof message === 'string' ? message : '';
    const separated = separateIconAndText(messageStr);
    let icon = separated.icon;
    const text = separated.text;

    if (!icon) {
      const defaults = {
        success: UI_ICONS.SUCCESS,
        error: UI_ICONS.ERROR,
        warning: UI_ICONS.WARNING,
      };
      icon = defaults[type] || UI_ICONS.INFO;
    }

    return { icon, text };
  }

  /**
   * 渲染狀態內容 (私有)
   *
   * @param {HTMLElement} status - 容器元素
   * @param {string} icon - SVG 圖標字串
   * @param {string} text - 文字內容
   * @param {string} type - 狀態類型
   */
  _renderStatus(status, icon, text, type) {
    status.innerHTML = '';

    if (icon) {
      const iconSpan = document.createElement('span');
      iconSpan.className = 'status-icon';
      if (icon.startsWith('<svg')) {
        iconSpan.innerHTML = icon;
      } else {
        iconSpan.textContent = icon;
      }
      status.append(iconSpan);
    }

    if (text) {
      const textSpan = document.createElement('span');
      textSpan.className = 'status-text';
      textSpan.textContent = text;
      status.append(textSpan);
    }

    status.classList.remove(
      UI_STATUS_TYPES.SUCCESS,
      UI_STATUS_TYPES.ERROR,
      UI_STATUS_TYPES.INFO,
      UI_STATUS_TYPES.WARNING,
      OPTIONS_PAGE_SELECTORS.STATUS_MESSAGE_CLASS
    );
    status.classList.add(OPTIONS_PAGE_SELECTORS.STATUS_MESSAGE_CLASS, type);

    if (type === UI_STATUS_TYPES.SUCCESS) {
      setTimeout(() => {
        status.innerHTML = '';
        status.classList.remove(
          UI_STATUS_TYPES.SUCCESS,
          UI_STATUS_TYPES.ERROR,
          UI_STATUS_TYPES.INFO,
          UI_STATUS_TYPES.WARNING,
          OPTIONS_PAGE_SELECTORS.STATUS_MESSAGE_CLASS
        );
      }, 3000);
    }
  }

  /**
   * 顯示資料來源升級通知橫幅
   *
   * @param {string} legacyDatabaseId - 舊的資料庫ID
   */
  showDataSourceUpgradeNotice(legacyDatabaseId = '') {
    const manualSection =
      this.elements.manualSection || document.querySelector(OPTIONS_PAGE_SELECTORS.MANUAL_SECTION);
    if (!manualSection) {
      return;
    }

    if (!this.upgradeNoticeBanner) {
      this.upgradeNoticeBanner = document.createElement('div');
      this.upgradeNoticeBanner.className = 'upgrade-notice';
      this.upgradeNoticeBanner.innerHTML = `
                <strong>Notion API 已升級至 ${NOTION_API.VERSION} 版本</strong>
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
            this.elements.testApiButton ||
            document.querySelector(OPTIONS_PAGE_SELECTORS.TEST_API_BUTTON);
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
    const manualSection =
      this.elements.manualSection || document.querySelector(OPTIONS_PAGE_SELECTORS.MANUAL_SECTION);
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
