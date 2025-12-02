/**
 * 工具欄主控制器
 * 整合所有 UI 組件，管理事件和狀態
 */

import { ToolbarStates, ToolbarStateManager } from './ToolbarState.js';
import { injectGlobalStyles } from './styles/toolbarStyles.js';
import { createToolbarContainer } from './components/ToolbarContainer.js';
import { createMiniIcon, bindMiniIconEvents } from './components/MiniIcon.js';
import { renderColorPicker } from './components/ColorPicker.js';
import { renderHighlightList } from './components/HighlightList.js';

/**
 * 工具欄管理器類別
 */
export class Toolbar {
  /**
   * 創建工具欄實例
   * @param {HighlightManager} highlightManager - 標註管理器實例
   */
  constructor(highlightManager) {
    if (!highlightManager) {
      throw new Error('HighlightManager is required');
    }

    this.manager = highlightManager;
    this.stateManager = new ToolbarStateManager();
    this.isHighlightModeActive = false;

    // 注入全局樣式
    injectGlobalStyles();

    // 創建 UI 元素
    this.container = createToolbarContainer();
    this.miniIcon = createMiniIcon();

    // 插入到 DOM
    document.body.appendChild(this.container);
    document.body.appendChild(this.miniIcon);

    // 初始化
    this.bindEvents();
    this.handleStateChange(this.stateManager.currentState);
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
  }

  /**
   * 綁定控制按鈕（開始標註、最小化、關閉）
   */
  bindControlButtons() {
    const toggleBtn = this.container.querySelector('#toggle-highlight-v2');
    const minimizeBtn = this.container.querySelector('#minimize-highlight-v2');
    const closeBtn = this.container.querySelector('#close-highlight-v2');

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
    const container = this.container.querySelector('#color-picker-v2');
    if (container) {
      renderColorPicker(container, this.manager.colors, this.manager.currentColor, color => {
        this.manager.setColor(color);
      });
    }
  }

  /**
   * 綁定操作按鈕（同步、打開、管理）
   */
  bindActionButtons() {
    const syncBtn = this.container.querySelector('#sync-to-notion-v2');
    const openBtn = this.container.querySelector('#open-notion-v2');
    const manageBtn = this.container.querySelector('#manage-highlights-v2');

    if (syncBtn) {
      syncBtn.addEventListener('click', () => this.syncToNotion());
    }

    if (openBtn) {
      openBtn.addEventListener('click', () => Toolbar.openInNotion());
    }

    if (manageBtn) {
      manageBtn.addEventListener('click', () => this.toggleHighlightList());
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
      if (event.target.closest('#notion-highlighter-v2')) {
        return;
      }

      // 延遲處理以確保選擇完成
      setTimeout(() => {
        const selection = window.getSelection();
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
          if (typeof window.Logger !== 'undefined') {
            window.Logger?.error('添加標註失敗:', error);
          }
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

        // 如果列表是打開的，刷新列表
        const listContainer = this.container.querySelector('#highlight-list-v2');
        if (listContainer && listContainer.style.display !== 'none') {
          this.refreshHighlightList();
        }
      }
    };

    document.addEventListener('click', this.clickDeleteHandler);
  }

  /**
   * 處理狀態變更
   * @param {string} state - 新狀態
   */
  handleStateChange(state) {
    switch (state) {
      case ToolbarStates.EXPANDED:
        this.show();
        break;
      case ToolbarStates.MINIMIZED:
        this.minimize();
        break;
      case ToolbarStates.HIDDEN:
        this.hide();
        break;
      default:
        console.warn(`[Toolbar] 未知狀態: ${state}`);
        this.hide();
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
    const btn = this.container.querySelector('#toggle-highlight-v2');

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
    const countSpan = this.container.querySelector('#highlight-count-v2');
    if (countSpan) {
      const count = this.manager.getCount();
      countSpan.textContent = count.toString();
    }
  }

  /**
   * 切換標註列表顯示
   */
  toggleHighlightList() {
    const listContainer = this.container.querySelector('#highlight-list-v2');

    if (!listContainer) {
      return;
    }

    const isVisible = listContainer.style.display !== 'none';

    if (isVisible) {
      listContainer.style.display = 'none';
    } else {
      const highlights = Array.from(this.manager.highlights.values());

      renderHighlightList(
        listContainer,
        highlights,
        id => {
          this.manager.removeHighlight(id);
          this.updateHighlightCount();
          this.refreshHighlightList(); // 刷新列表
        },
        () => Toolbar.openInNotion()
      );

      listContainer.style.display = 'block';
    }
  }

  /**
   * 刷新標註列表（僅在列表可見時）
   */
  refreshHighlightList() {
    const listContainer = this.container.querySelector('#highlight-list-v2');

    if (!listContainer) {
      return;
    }

    // 僅在列表可見時刷新
    if (listContainer.style.display === 'none') {
      return;
    }

    const highlights = Array.from(this.manager.highlights.values());

    renderHighlightList(
      listContainer,
      highlights,
      id => {
        this.manager.removeHighlight(id);
        this.updateHighlightCount();
        this.refreshHighlightList(); // 刷新列表
      },
      () => Toolbar.openInNotion()
    );
  }

  /**
   * 同步到 Notion
   */
  /**
   * 封裝 chrome.runtime.sendMessage 為 Promise
   * @param {Object} message - 要發送的消息
   * @returns {Promise<Object>}
   * @private
   */
  static _sendMessageAsync(message) {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.chrome?.runtime?.sendMessage) {
        reject(new Error('無法連接擴展'));
        return;
      }

      window.chrome.runtime.sendMessage(message, response => {
        if (window.chrome.runtime.lastError) {
          reject(new Error(window.chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  /**
   * 同步到 Notion
   */
  async syncToNotion() {
    const statusDiv = this.container.querySelector('#highlight-status-v2');

    if (statusDiv) {
      const originalText = statusDiv.innerHTML;
      statusDiv.textContent = '🔄 正在同步...';

      try {
        // 收集標註數據
        const highlights = this.manager.collectHighlightsForNotion();

        const response = await Toolbar._sendMessageAsync({
          action: 'syncHighlights',
          highlights,
        });

        if (response?.success) {
          statusDiv.textContent = '✅ 同步成功';
        } else {
          const errorMsg = response?.error || '未知錯誤';
          statusDiv.textContent = `❌ ${errorMsg}`;
        }

        setTimeout(() => {
          statusDiv.innerHTML = originalText;
        }, 2000);
      } catch (error) {
        statusDiv.textContent = '❌ 同步失敗';
        setTimeout(() => {
          statusDiv.innerHTML = originalText;
        }, 2000);

        if (typeof window.Logger !== 'undefined') {
          window.Logger?.error('同步失敗:', error);
        }
      }
    }
  }

  /**
   * 在 Notion 中打開當前頁面
   * 發送當前頁面 URL 給 background,由 background 查詢對應的 Notion 頁面 URL
   * @static
   */
  static openInNotion() {
    if (typeof window !== 'undefined' && window.chrome?.runtime?.sendMessage) {
      window.chrome.runtime.sendMessage({
        action: 'openNotionPage',
        url: window.location.href,
      });
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

    // 移除 DOM 元素
    if (this.container?.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }

    if (this.miniIcon?.parentNode) {
      this.miniIcon.parentNode.removeChild(this.miniIcon);
    }
  }
}
