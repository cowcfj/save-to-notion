/**
 * 工具欄主控制器
 * 整合所有 UI 組件，管理事件和狀態
 */

import { ToolbarStates, ToolbarStateManager } from './ToolbarState.js';
import { injectGlobalStyles } from './styles/toolbarStyles.js';
import { createToolbarContainer } from './components/ToolbarContainer.js';
import { createMiniIcon, bindMiniIconEvents } from './components/MiniIcon.js';
import { renderColorPicker } from './components/ColorPicker.js';
import { TOOLBAR_SELECTORS } from '../../config/ui-selectors.js';
import { UI_ICONS } from '../../config/icons.js';
import { UI_MESSAGES } from '../../config/messages.js';
import { sanitizeApiError, createSafeIcon } from '../../utils/securityUtils.js';
import { ErrorHandler } from '../../utils/ErrorHandler.js';
import Logger from '../../utils/Logger.js';

const STYLE_INLINE_BLOCK = 'inline-block';
const STYLE_TEXT_BOTTOM = 'text-bottom';
const STYLE_INLINE_FLEX = 'inline-flex';
const STYLE_NONE = 'none';
const STYLE_BLOCK = 'block';

/**
 * 工具欄管理器類別
 */
export class Toolbar {
  /**
   * 創建工具欄實例
   *
   * @param {HighlightManager} highlightManager - 標註管理器實例
   */
  constructor(highlightManager) {
    if (!highlightManager) {
      throw new Error('HighlightManager is required');
    }

    this.manager = highlightManager;
    this.stateManager = new ToolbarStateManager();
    this.isHighlightModeActive = false;
    this._initialized = false;

    // 注入全局樣式
    injectGlobalStyles();

    // 創建 UI 元素
    this.container = createToolbarContainer();
    this.miniIcon = createMiniIcon();

    // 插入到 DOM（默認隱藏）
    this.container.style.display = 'none';
    this.miniIcon.style.display = 'none';
    document.body.append(this.container);
    document.body.append(this.miniIcon);

    // 綁定事件
    this.bindEvents();
  }

  /**
   * 異步初始化：從 storage 讀取狀態並應用
   */
  initialize() {
    if (this._initialized) {
      return;
    }

    // 初始化 stateManager（從 sessionStorage 讀取狀態）
    this.stateManager.initialize();

    // 應用保存的狀態
    this.handleStateChange(this.stateManager.currentState);

    this._initialized = true;
  }

  /**
   * 綁定所有事件
   */
  bindEvents() {
    // 工具欄控制按鈕
    this.bindControlButtons();

    // 顏色選擇器
    this.bindColorPicker();

    // 操作按鈕
    this.bindActionButtons();

    // 最小化圖標
    bindMiniIconEvents(this.miniIcon, () => this.expand());

    // 選擇事件（標註模式）
    this.bindSelectionEvents();

    // Ctrl+點擊刪除標註
    this.bindClickDeleteEvents();

    // 監聽 Storage 變更以即時更新按鈕狀態
    this.bindStorageEvents();
  }

  /**
   * 綁定 Storage 變更事件
   */
  bindStorageEvents() {
    this._storageListener = (changes, namespace) => {
      if (namespace !== 'local') {
        return;
      }

      const hasRelevantChanges = Object.keys(changes).some(
        key => key.startsWith('page_') || key.startsWith('saved_')
      );

      if (hasRelevantChanges) {
        // storage 變更可能代表其他地方（例如 Popup）已完成網頁保存
        this.updateSaveButtonVisibility();
      }
    };

    if (globalThis.chrome?.storage?.onChanged) {
      globalThis.chrome.storage.onChanged.addListener(this._storageListener);
    }

    // [New] 混和推播 (Hybrid Push) 策略：除 storage 事件外，額外監聽 background 主動推送的存檔完成事件
    this._messageListener = message => {
      if (message?.action === 'PAGE_SAVE_HINT' && message.isSaved) {
        this.updateSaveButtonVisibility();
      }
    };
    if (globalThis.chrome?.runtime?.onMessage) {
      globalThis.chrome.runtime.onMessage.addListener(this._messageListener);
    }
  }

  /**
   * 綁定控制按鈕（開始標註、最小化、關閉）
   */
  bindControlButtons() {
    const toggleBtn = this.container.querySelector(TOOLBAR_SELECTORS.TOGGLE_HIGHLIGHT);
    const minimizeBtn = this.container.querySelector(TOOLBAR_SELECTORS.MINIMIZE);
    const closeBtn = this.container.querySelector(TOOLBAR_SELECTORS.CLOSE);

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggleHighlightMode());
    }

    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => this.minimize());
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hide());
    }
  }

  /**
   * 綁定顏色選擇器
   */
  bindColorPicker() {
    const container = this.container.querySelector(TOOLBAR_SELECTORS.COLOR_PICKER);
    if (container) {
      renderColorPicker(container, this.manager.colors, this.manager.currentColor, color => {
        this.manager.setColor(color);
      });
    }
  }

  /**
   * 綁定操作按鈕（保存、同步、管理）
   */
  bindActionButtons() {
    const saveBtn = this.container.querySelector(TOOLBAR_SELECTORS.SAVE_PAGE);
    const syncBtn = this.container.querySelector(TOOLBAR_SELECTORS.SYNC_TO_NOTION);
    const manageBtn = this.container.querySelector(TOOLBAR_SELECTORS.MANAGE_HIGHLIGHTS);

    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.savePageToNotion());
    }

    if (syncBtn) {
      syncBtn.addEventListener('click', () => this.syncToNotion());
    }

    if (manageBtn) {
      manageBtn.addEventListener('click', () => {
        Toolbar._sendMessageAsync({ action: 'OPEN_SIDE_PANEL' }).catch(error =>
          Logger.error('[Toolbar] OPEN_SIDE_PANEL failed', error)
        );
      });
    }
  }

  /**
   * 綁定選擇事件（用於標註模式）
   */
  bindSelectionEvents() {
    this.selectionHandler = event => {
      // 檢查是否在標註模式
      if (!this.isHighlightModeActive) {
        return;
      }

      // 忽略工具欄內的點擊
      if (event.target.closest(TOOLBAR_SELECTORS.CONTAINER)) {
        return;
      }

      // 延遲處理以確保選擇完成
      setTimeout(() => {
        const selection = globalThis.getSelection();
        if (!selection || selection.isCollapsed) {
          return;
        }

        const text = selection.toString().trim();
        if (!text) {
          return;
        }

        try {
          const range = selection.getRangeAt(0);
          const id = this.manager.addHighlight(range, this.manager.currentColor);

          if (id) {
            // 更新計數
            this.updateHighlightCount();

            // 清除選擇
            selection.removeAllRanges();
          }
        } catch (error) {
          Logger.error('添加標註失敗', {
            action: 'selectionHandler',
            error,
          });
        }
      }, 10);
    };

    document.addEventListener('mouseup', this.selectionHandler);
  }

  /**
   * 綁定 Ctrl+點擊刪除標註事件
   */
  bindClickDeleteEvents() {
    this.clickDeleteHandler = event => {
      if (this.manager.handleDocumentClick(event)) {
        // 更新計數
        this.updateHighlightCount();

        // 如果側邊欄是打開的，可以透過 storage 事件自動更新，這裡不需要處理
      }
    };

    document.addEventListener('click', this.clickDeleteHandler);
  }

  /**
   * 處理狀態變更
   *
   * @param {string} state - 新狀態
   */
  handleStateChange(state) {
    switch (state) {
      case ToolbarStates.EXPANDED: {
        this.show();
        break;
      }
      case ToolbarStates.MINIMIZED: {
        this.minimize();
        break;
      }
      case ToolbarStates.HIDDEN: {
        this.hide();
        break;
      }
      default: {
        Logger.warn('Toolbar received unknown state', {
          action: 'handleStateChange',
          state,
          component: 'Toolbar',
        });
        this.hide();
      }
    }
  }

  /**
   * 顯示工具欄
   */
  show() {
    this.stateManager.currentState = ToolbarStates.EXPANDED;
    this.container.style.display = 'block';
    this.miniIcon.style.display = 'none';

    // 更新計數
    this.updateHighlightCount();

    // 根據頁面保存狀態切換 Save / Sync 按鈕
    this.updateSaveButtonVisibility();
  }

  /**
   * 隱藏工具欄
   */
  hide() {
    this.stateManager.currentState = ToolbarStates.HIDDEN;
    this.container.style.display = 'none';
    this.miniIcon.style.display = 'none';

    // 如果標註模式開啟，關閉它
    if (this.isHighlightModeActive) {
      this.toggleHighlightMode();
    }
  }

  /**
   * 最小化工具欄
   */
  minimize() {
    this.stateManager.currentState = ToolbarStates.MINIMIZED;
    this.container.style.display = 'none';
    this.miniIcon.style.display = 'flex';
  }

  /**
   * 展開工具欄
   */
  expand() {
    this.show();
  }

  /**
   * 切換標註模式
   */
  toggleHighlightMode() {
    this.isHighlightModeActive = !this.isHighlightModeActive;
    const btn = this.container.querySelector(TOOLBAR_SELECTORS.TOGGLE_HIGHLIGHT);

    if (!btn) {
      return;
    }

    if (this.isHighlightModeActive) {
      btn.textContent = '停止標註';
      btn.style.background = '#48bb78';
      btn.style.color = 'white';
      btn.style.borderColor = '#48bb78';
    } else {
      btn.textContent = '開始標註';
      btn.style.background = 'white';
      btn.style.color = '#48bb78';
      btn.style.borderColor = '#48bb78';
    }
  }

  /**
   * 更新標註計數
   */
  updateHighlightCount() {
    const countSpan = this.container.querySelector(TOOLBAR_SELECTORS.COUNT_DISPLAY);
    if (countSpan) {
      const count = this.manager.getCount();
      countSpan.textContent = count.toString();
      countSpan.style.display = count > 0 ? 'inline-block' : 'none';
    }
  }

  /**
   * 封裝 chrome.runtime.sendMessage 為 Promise
   *
   * @param {object} message - 要發送的訊息
   * @returns {Promise<object>}
   * @private
   */
  static _sendMessageAsync(message) {
    return new Promise((resolve, reject) => {
      if (globalThis.window === undefined || !globalThis.chrome?.runtime?.sendMessage) {
        reject(new Error('無法連接擴展'));
        return;
      }

      globalThis.chrome.runtime.sendMessage(message, response => {
        if (globalThis.chrome.runtime.lastError) {
          reject(new Error(globalThis.chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  /**
   * 設置狀態欄圖標與文字，封裝共用語意與樣式
   *
   * @param {HTMLElement} statusDiv
   * @param {string} iconKey
   * @param {string} messageKey
   * @param {string} [customMessage]
   * @private
   */
  static _setStatusIcon(statusDiv, iconKey, messageKey, customMessage) {
    statusDiv.textContent = '';
    const icon = createSafeIcon(UI_ICONS[iconKey]);
    icon.style.display = STYLE_INLINE_BLOCK;
    icon.style.marginRight = '4px';
    icon.style.verticalAlign = STYLE_TEXT_BOTTOM;

    if (iconKey === 'SYNC') {
      icon.style.animation = 'spin 1s linear infinite';
    }

    statusDiv.append(icon);

    // UI_MESSAGES.TOOLBAR 查找對應多語言常數字串，如果 customMessage 提供則取代
    const textMsg = customMessage ?? UI_MESSAGES.TOOLBAR[messageKey];
    statusDiv.append(document.createTextNode(` ${textMsg}`));
  }

  /**
   * 查詢當前頁面保存狀態，切換「保存網頁」和「同步」按鈕的可見性
   */
  async updateSaveButtonVisibility() {
    const saveBtn = this.container.querySelector(TOOLBAR_SELECTORS.SAVE_PAGE);
    const syncBtn = this.container.querySelector(TOOLBAR_SELECTORS.SYNC_TO_NOTION);

    if (!saveBtn || !syncBtn) {
      return;
    }

    try {
      const response = await Toolbar._sendMessageAsync({ action: 'checkPageStatus' });

      if (response?.success && response.isSaved) {
        // 已保存 → 顯示同步按鈕，隱藏保存按鈕
        saveBtn.style.display = STYLE_NONE;
        syncBtn.style.display = STYLE_INLINE_FLEX;
      } else {
        // 未保存 → 顯示保存按鈕，隱藏同步按鈕
        saveBtn.style.display = STYLE_INLINE_FLEX;
        syncBtn.style.display = STYLE_NONE;
      }
    } catch {
      // 查詢失敗時預設顯示保存按鈕
      saveBtn.style.display = STYLE_INLINE_FLEX;
      syncBtn.style.display = STYLE_NONE;
    }
  }

  /**
   * 保存頁面到 Notion（從 Toolbar 發起）
   */
  async savePageToNotion() {
    const statusDiv = this.container.querySelector(TOOLBAR_SELECTORS.STATUS_CONTAINER);
    const saveBtn = this.container.querySelector(TOOLBAR_SELECTORS.SAVE_PAGE);
    let success = false;

    if (saveBtn) {
      saveBtn.disabled = true;
    }

    if (statusDiv) {
      statusDiv.style.display = STYLE_BLOCK;
      Toolbar._setStatusIcon(statusDiv, 'SYNC', null, '正在保存...');
    }

    try {
      const response = await Toolbar._sendMessageAsync({
        action: 'SAVE_PAGE_FROM_TOOLBAR',
      });

      if (response?.success) {
        success = true;
        if (statusDiv) {
          Toolbar._setStatusIcon(statusDiv, 'CHECK', null, '保存成功！');
        }

        // await 確保按鈕切換完成後 finally 才執行，避免閃爍
        await this.updateSaveButtonVisibility();
      } else {
        const rawError = sanitizeApiError(response?.error || 'Unknown error');
        const errorMsg = ErrorHandler.formatUserMessage(rawError);
        if (statusDiv) {
          Toolbar._setStatusIcon(statusDiv, 'X', null, errorMsg);
        }
      }
    } catch (error) {
      if (statusDiv) {
        Toolbar._setStatusIcon(statusDiv, 'X', null, '保存失敗');
      }
      Logger.error('從 Toolbar 保存頁面失敗', {
        action: 'savePageToNotion',
        error: error?.message ?? String(error),
      });
    } finally {
      // 失敗時才重新啟用按鈕（成功時按鈕已被 updateSaveButtonVisibility 隱藏）
      if (!success && saveBtn) {
        saveBtn.disabled = false;
      }

      // updateSaveButtonVisibility 已 await 完成，setTimeout 排程在其後
      if (statusDiv) {
        setTimeout(() => {
          statusDiv.textContent = '';
          statusDiv.style.display = STYLE_NONE;
        }, 2000);
      }
    }
  }

  /**
   * 同步到 Notion
   */
  async syncToNotion() {
    const statusDiv = this.container.querySelector(TOOLBAR_SELECTORS.STATUS_CONTAINER);

    if (statusDiv) {
      statusDiv.style.display = 'block'; // Ensure it's visible during sync

      // Update UI to Loading State
      Toolbar._setStatusIcon(statusDiv, 'SYNC', 'SYNCING');

      Logger.start('準備同步標註到 Notion');
      try {
        // 收集標註數據
        const highlights = this.manager.collectHighlightsForNotion();

        const response = await Toolbar._sendMessageAsync({
          action: 'syncHighlights',
          highlights,
        });

        if (response?.success) {
          Toolbar._setStatusIcon(statusDiv, 'CHECK', 'SYNC_SUCCESS');
        } else if (response?.errorCode === 'PAGE_NOT_SAVED') {
          // 頁面尚未保存到 Notion，提供引導性訊息
          Toolbar._setStatusIcon(statusDiv, 'X', null, '請先保存頁面到 Notion');
        } else {
          const rawError = sanitizeApiError(response?.error || 'Unknown error');
          const errorMsg = ErrorHandler.formatUserMessage(rawError);
          Toolbar._setStatusIcon(statusDiv, 'X', null, errorMsg);
        }
      } catch (error) {
        Toolbar._setStatusIcon(statusDiv, 'X', 'SYNC_FAILED');

        Logger.error('同步失敗:', {
          action: 'syncToNotion',
          error: error?.message ?? String(error),
          stack: error?.stack,
          details: {
            name: error?.name,
            code: error?.code,
          },
        });
      }

      setTimeout(() => {
        statusDiv.textContent = '';
        statusDiv.style.display = 'none';
      }, 2000);
    }
  }

  /**
   * 清理資源
   */
  cleanup() {
    // 移除事件監聽器
    if (this.selectionHandler) {
      document.removeEventListener('mouseup', this.selectionHandler);
    }

    if (this.clickDeleteHandler) {
      document.removeEventListener('click', this.clickDeleteHandler);
    }

    if (this._storageListener && globalThis.chrome?.storage?.onChanged) {
      globalThis.chrome.storage.onChanged.removeListener(this._storageListener);
      this._storageListener = null;
    }

    if (this._messageListener && globalThis.chrome?.runtime?.onMessage) {
      globalThis.chrome.runtime.onMessage.removeListener(this._messageListener);
      this._messageListener = null;
    }

    // 移除 DOM 元素
    if (this.container) {
      this.container.remove();
    }

    if (this.miniIcon) {
      this.miniIcon.remove();
    }
  }
}
