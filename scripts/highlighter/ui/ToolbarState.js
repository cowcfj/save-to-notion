/**
 * 工具欄狀態管理器
 * 負責管理工具欄的三種狀態：展開、最小化、隱藏
 */

/**
 * 工具欄狀態常量
 */
export const ToolbarStates = {
    EXPANDED: 'expanded',
    MINIMIZED: 'minimized',
    HIDDEN: 'hidden'
};

/**
 * 管理工具欄狀態的類
 */
export class ToolbarStateManager {
    constructor() {
        this.listeners = new Set();
        // 從 localStorage 讀取初始狀態，默認為 HIDDEN
        const savedState = localStorage.getItem('notion-highlighter-state');
        this._currentState = Object.values(ToolbarStates).includes(savedState)
            ? savedState
            : ToolbarStates.HIDDEN;
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
            // 保存狀態到 localStorage
            try {
                localStorage.setItem('notion-highlighter-state', newState);
            } catch (error) {
                console.warn('[ToolbarState] 無法保存狀態到 localStorage:', error);
            }
            this.notifyListeners();
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
            console.error('[ToolbarState] 監聽器執行錯誤:', error);
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
