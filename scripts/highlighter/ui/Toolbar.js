/**
 * 工具欄主控制器
 * 整合所有 UI 組件，管理事件和狀態
 */

import { ToolbarStates, ToolbarStateManager } from './ToolbarState.js';
import { injectStylesIntoShadowRoot } from './styles/toolbarStyles.js';
import { createToolbarContainer } from './components/ToolbarContainer.js';
import { createMiniIcon, bindMiniIconEvents } from './components/MiniIcon.js';
import { renderColorPicker } from './components/ColorPicker.js';
import { TOOLBAR_SELECTORS } from '../../config/ui.js';
import { UI_MESSAGES } from '../../config/messages.js';
import { sanitizeApiError } from '../../utils/securityUtils.js';
import { ErrorHandler } from '../../utils/ErrorHandler.js';
import Logger from '../../utils/Logger.js';
import {
  checkPageStatus,
  savePageFromToolbar,
  syncHighlights,
  openSidePanel,
} from './ToolbarRuntime.js';
import { getToolbarElements, applySaveSyncVisibility, renderStatusIcon } from './ToolbarUI.js';

const STYLE_BLOCK = 'block';
const STYLE_NONE = 'none';
const TOOLBAR_HOST_ID = 'notion-highlighter-host';
const TOOLBAR_HOST_SELECTOR = `#${TOOLBAR_HOST_ID}`;
const TOOLBAR_HOST_OWNER_ATTR = 'data-highlighter-owner';
const TOOLBAR_HOST_OWNER_VALUE = 'true';
const TOOLBAR_OWNED_HOST_SELECTOR = `${TOOLBAR_HOST_SELECTOR}[${TOOLBAR_HOST_OWNER_ATTR}="${TOOLBAR_HOST_OWNER_VALUE}"]`;

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
    this._eventsBound = false;
    this._globalEventsBound = false;
    this._cleanedUp = false;

    // 僅重用由擴展建立且帶有擁有權標記的 host，避免誤用宿主頁同 ID 元素
    const existingHost = document.querySelector(TOOLBAR_OWNED_HOST_SELECTOR);
    if (existingHost) {
      this.host = existingHost;
      this.shadowRoot = this.host.shadowRoot || this.host.attachShadow({ mode: 'open' });
    } else {
      this.host = document.createElement('div');
      this.host.id = TOOLBAR_HOST_ID;
      this.host.setAttribute(TOOLBAR_HOST_OWNER_ATTR, TOOLBAR_HOST_OWNER_VALUE);
      this.shadowRoot = this.host.attachShadow({ mode: 'open' });
      document.body.append(this.host);
    }

    // 僅在首次建立 host 時注入樣式，重用時不重複注入
    if (this.host.dataset.toolbarStylesInjected !== 'true') {
      injectStylesIntoShadowRoot(this.shadowRoot);
      this.host.dataset.toolbarStylesInjected = 'true';
    }

    // 創建 UI 元素
    this.container = createToolbarContainer();
    this.miniIcon = createMiniIcon();

    // 插入到 Shadow Root（默認隱藏）
    this.container.style.display = 'none';
    this.miniIcon.style.display = 'none';

    // 重用 host 時，先移除 shadowRoot 內既有的 TOOLBAR_SELECTORS.CONTAINER / MINI_ICON，
    // 再 append 新 instance 的 this.container / this.miniIcon。
    // 被移除的舊 instance 節點會變成 detached（不在 DOM），不可重用舊引用；
    // 新 instance 需重新建立或重新查詢元素。若 this.host 未連接，稍後會補 append 到 body。
    this.shadowRoot.querySelectorAll(TOOLBAR_SELECTORS.CONTAINER).forEach(el => el.remove());
    this.shadowRoot.querySelectorAll(TOOLBAR_SELECTORS.MINI_ICON).forEach(el => el.remove());
    this.shadowRoot.append(this.container);
    this.shadowRoot.append(this.miniIcon);

    // 防禦：若 host 尚未連接到 DOM，補上插入
    if (!this.host.isConnected) {
      document.body.append(this.host);
    }

    Toolbar._sharedState.instances.add(this);

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
    if (this._eventsBound) {
      return;
    }
    this._eventsBound = true;

    // 工具欄控制按鈕
    this.bindControlButtons();

    // 顏色選擇器
    this.bindColorPicker();

    // 操作按鈕
    this.bindActionButtons();

    // 最小化圖標
    bindMiniIconEvents(this.miniIcon, () => this.expand());

    const sharedState = Toolbar._sharedState;
    if (!sharedState.globalOwner) {
      sharedState.globalOwner = this;
    }

    // 全域事件僅由單一 active instance 管理，避免重複監聽
    if (sharedState.globalOwner === this) {
      this._bindGlobalEvents();
    }
  }

  /**
   * 綁定全域事件（僅 owner instance 可執行）
   */
  _bindGlobalEvents() {
    if (this._globalEventsBound) {
      return;
    }

    // 選擇事件（標註模式）
    this.bindSelectionEvents();

    // Ctrl+點擊刪除標註
    this.bindClickDeleteEvents();

    // 監聽 Storage / Message 事件
    this.bindStorageEvents();

    this._globalEventsBound = true;
  }

  /**
   * 移除全域事件（可重入）
   */
  _unbindGlobalEvents() {
    if (!this._globalEventsBound) {
      return;
    }

    if (this.selectionHandler) {
      document.removeEventListener('mouseup', this.selectionHandler);
      this.selectionHandler = null;
    }

    if (this.clickDeleteHandler) {
      document.removeEventListener('click', this.clickDeleteHandler);
      this.clickDeleteHandler = null;
    }

    if (this._storageListener && globalThis.chrome?.storage?.onChanged) {
      globalThis.chrome.storage.onChanged.removeListener(this._storageListener);
      this._storageListener = null;
    }

    if (this._messageListener && globalThis.chrome?.runtime?.onMessage) {
      globalThis.chrome.runtime.onMessage.removeListener(this._messageListener);
      this._messageListener = null;
    }

    this._globalEventsBound = false;
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
        key => key.startsWith('page_') || key.startsWith('saved_') || key.startsWith('highlights_')
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
        openSidePanel().catch(error => Logger.error('[Toolbar] OPEN_SIDE_PANEL failed', error));
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
      // 使用 composedPath() 以正確辨識穿越 Shadow Boundary 的點擊來源
      if (event.composedPath().some(el => el === this.host || el === this.container)) {
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
   * 查詢當前頁面保存狀態，切換「保存網頁」和「同步」按鈕的可見性
   */
  async updateSaveButtonVisibility() {
    const { saveBtn, syncBtn } = getToolbarElements(this.container);

    if (!saveBtn || !syncBtn) {
      return;
    }

    try {
      const response = await checkPageStatus();
      applySaveSyncVisibility(saveBtn, syncBtn, response?.success && response.isSaved);
    } catch {
      // 查詢失敗時預設顯示保存按鈕
      applySaveSyncVisibility(saveBtn, syncBtn, false);
    }
  }

  /**
   * 保存頁面到 Notion（從 Toolbar 發起）
   */
  async savePageToNotion() {
    const { saveBtn, statusDiv } = getToolbarElements(this.container);
    let success = false;

    if (saveBtn) {
      saveBtn.disabled = true;
    }

    if (statusDiv) {
      statusDiv.style.display = STYLE_BLOCK;
      renderStatusIcon(statusDiv, 'SYNC', null, '正在保存...');
    }

    try {
      const response = await savePageFromToolbar();

      if (response?.success) {
        success = true;
        if (statusDiv) {
          renderStatusIcon(statusDiv, 'CHECK', null, '保存成功！');
        }

        // await 確保按鈕切換完成後 finally 才執行，避免閃爍
        await this.updateSaveButtonVisibility();
      } else {
        const rawError = sanitizeApiError(response?.error || 'Unknown error');
        const errorMsg = ErrorHandler.formatUserMessage(rawError);
        if (statusDiv) {
          renderStatusIcon(statusDiv, 'X', null, errorMsg);
        }
      }
    } catch (error) {
      if (statusDiv) {
        renderStatusIcon(statusDiv, 'X', null, '保存失敗');
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
    const { statusDiv } = getToolbarElements(this.container);

    if (statusDiv) {
      statusDiv.style.display = 'block'; // Ensure it's visible during sync

      // Update UI to Loading State
      renderStatusIcon(statusDiv, 'SYNC', 'SYNCING');

      Logger.start('準備同步標註到 Notion');
      try {
        // 收集標註數據
        const highlights = this.manager.collectHighlightsForNotion();

        const response = await syncHighlights(highlights);

        if (response?.success) {
          renderStatusIcon(statusDiv, 'CHECK', 'SYNC_SUCCESS');
        } else {
          switch (response?.errorCode) {
            case 'PAGE_DELETED': {
              renderStatusIcon(
                statusDiv,
                'X',
                null,
                response?.error || UI_MESSAGES.POPUP.DELETED_PAGE
              );
              await this.updateSaveButtonVisibility();
              break;
            }
            case 'PAGE_DELETION_PENDING': {
              renderStatusIcon(
                statusDiv,
                'X',
                null,
                response?.error || UI_MESSAGES.POPUP.DELETION_PENDING
              );
              break;
            }
            case 'PAGE_NOT_SAVED': {
              // 頁面尚未保存到 Notion，提供引導性訊息
              renderStatusIcon(statusDiv, 'X', null, '請先保存頁面到 Notion');
              break;
            }
            default: {
              const rawError = sanitizeApiError(response?.error || 'Unknown error');
              const errorMsg = ErrorHandler.formatUserMessage(rawError);
              renderStatusIcon(statusDiv, 'X', null, errorMsg);
            }
          }
        }
      } catch (error) {
        renderStatusIcon(statusDiv, 'X', 'SYNC_FAILED');

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
    if (this._cleanedUp) {
      return;
    }
    this._cleanedUp = true;

    const sharedState = Toolbar._sharedState;
    sharedState.instances.delete(this);

    if (sharedState.globalOwner === this) {
      this._unbindGlobalEvents();

      if (sharedState.instances.size > 0) {
        const nextOwner = Toolbar._getLatestInstance(sharedState.instances);
        sharedState.globalOwner = nextOwner;
        nextOwner._bindGlobalEvents();
      } else {
        sharedState.globalOwner = null;
      }
    } else if (this._globalEventsBound) {
      // 防禦：理論上只有 owner 會綁全域事件，仍保留清理保障
      this._unbindGlobalEvents();
    }

    // 僅在最後一個 instance 清理時移除共享 host
    if (sharedState.instances.size === 0 && this.host) {
      this.host.remove();
    }
  }

  /**
   * 取得最近建立且仍存活的 instance
   *
   * @param {Set<Toolbar>} instances
   * @returns {Toolbar|null}
   * @private
   */
  static _getLatestInstance(instances) {
    const latestInstance = [...instances].pop();
    return latestInstance ?? null;
  }
}

Toolbar._sharedState = {
  instances: new Set(),
  globalOwner: null,
};
