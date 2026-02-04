/**
 * 工具欄狀態管理器
 * 負責管理工具欄的三種狀態：展開、最小化、隱藏
 *
 * 使用 sessionStorage 儲存狀態（每個標籤頁獨立，刷新頁面後保持）
 * 注意：chrome.storage.session 在 Content Script 中無法訪問
 */

import Logger from '../../utils/Logger.js';

const STORAGE_KEY = 'notion-highlighter-toolbar-state';

/**
 * 工具欄狀態常量
 */
export const ToolbarStates = {
  EXPANDED: 'expanded',
  MINIMIZED: 'minimized',
  HIDDEN: 'hidden',
};

/**
 * 管理工具欄狀態的類
 */
export class ToolbarStateManager {
  constructor() {
    this.listeners = new Set();
    // 默認為 HIDDEN，稍後通過 initialize() 從 storage 讀取
    this._currentState = ToolbarStates.HIDDEN;
    this._initialized = false;
  }

  /**
   * 初始化：從 sessionStorage 讀取狀態
   */
  initialize() {
    if (this._initialized) {
      return;
    }

    try {
      // 使用 sessionStorage（每個標籤頁獨立，刷新頁面後保持）
      if (globalThis.window !== undefined && globalThis.sessionStorage) {
        const savedState = globalThis.sessionStorage.getItem(STORAGE_KEY);

        if (savedState && Object.values(ToolbarStates).includes(savedState)) {
          this._currentState = savedState;
        }
      }
    } catch (error) {
      // 在某些環境（如隱私模式）sessionStorage 可能不可用
      Logger.warn('[ToolbarState] 無法從 storage 讀取狀態:', error);
    }

    this._initialized = true;
  }

  /**
   * 獲取當前狀態
   */
  get currentState() {
    return this._currentState;
  }

  /**
   * 設置新狀態並通知監聽器
   *
   * @param {string} newState - 新狀態 (必須是 ToolbarStates 的值)
   */
  set currentState(newState) {
    if (!Object.values(ToolbarStates).includes(newState)) {
      Logger.warn(`[ToolbarState] 無效的狀態: ${newState}`);
      return;
    }

    if (this._currentState !== newState) {
      this._currentState = newState;

      // 保存狀態到 sessionStorage
      this._saveState(newState);

      this.notifyListeners();
    }
  }

  /**
   * 保存狀態到 storage
   *
   * @param {string} state
   * @private
   */
  // DeepSource: 此方法故意不使用 this，因為它是純工具函數
  // skipcq: JS-0105
  _saveState(state) {
    try {
      if (globalThis.window !== undefined && globalThis.sessionStorage) {
        globalThis.sessionStorage.setItem(STORAGE_KEY, state);
      }
    } catch (error) {
      Logger.warn('[ToolbarState] 無法保存狀態:', error);
    }
  }

  /**
   * 添加狀態變更監聽器
   *
   * @param {Function} listener - 回調函數 (state) => void
   */
  addListener(listener) {
    this.listeners.add(listener);
    // 立即通知當前狀態
    try {
      listener(this._currentState);
    } catch (error) {
      Logger.error('[ToolbarState] 監聽器執行錯誤:', error);
    }
  }

  /**
   * 移除監聽器
   *
   * @param {Function} listener
   */
  removeListener(listener) {
    this.listeners.delete(listener);
  }

  /**
   * 通知所有監聽器
   */
  notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this._currentState);
      } catch (error) {
        Logger.error('[ToolbarState] 監聽器執行錯誤:', error);
      }
    });
  }
}
