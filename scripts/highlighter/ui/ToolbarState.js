/**
 * 工具欄狀態管理器
 * 負責管理工具欄的三種狀態：展開、最小化、隱藏
 *
 * 使用 chrome.storage.session 儲存狀態（瀏覽器關閉後自動清除）
 */

const STORAGE_KEY = 'toolbarState';

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
   * 異步初始化：從 chrome.storage.session 讀取狀態
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._initialized) {
      return;
    }

    try {
      // 檢查 chrome.storage.session 是否可用
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        const result = await chrome.storage.session.get([STORAGE_KEY]);
        const savedState = result[STORAGE_KEY];

        if (Object.values(ToolbarStates).includes(savedState)) {
          this._currentState = savedState;
        }
      }
    } catch (error) {
      console.warn('[ToolbarState] 無法從 storage 讀取狀態:', error);
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
   * @param {string} newState - 新狀態 (必須是 ToolbarStates 的值)
   */
  set currentState(newState) {
    if (!Object.values(ToolbarStates).includes(newState)) {
      console.warn(`[ToolbarState] 無效的狀態: ${newState}`);
      return;
    }

    if (this._currentState !== newState) {
      this._currentState = newState;

      // 保存狀態到 chrome.storage.session
      this._saveState(newState);

      this.notifyListeners();
    }
  }

  /**
   * 保存狀態到 storage（異步，不阻塞）
   * @param {string} state
   * @private
   */
  _saveState(state) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.session) {
        chrome.storage.session.set({ [STORAGE_KEY]: state }).catch(error => {
          console.warn('[ToolbarState] 無法保存狀態:', error);
        });
      }
    } catch (error) {
      console.warn('[ToolbarState] 保存狀態時出錯:', error);
    }
  }

  /**
   * 添加狀態變更監聽器
   * @param {Function} listener - 回調函數 (state) => void
   */
  addListener(listener) {
    this.listeners.add(listener);
    // 立即通知當前狀態
    try {
      listener(this._currentState);
    } catch (error) {
      console.error('[ToolbarState] 監聯器執行錯誤:', error);
    }
  }

  /**
   * 移除監聽器
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
        console.error('[ToolbarState] 監聽器執行錯誤:', error);
      }
    });
  }
}
