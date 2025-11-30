/**
 * 工具欄容器組件
 * 負責創建工具欄的 DOM 結構
 */

import { getToolbarStyles } from '../styles/toolbarStyles.js';

/**
 * 創建工具欄容器
 * @returns {HTMLElement} 工具欄 DOM 元素
 */
export function createToolbarContainer() {
    const toolbar = document.createElement('div');
    toolbar.id = 'notion-highlighter-v2';

    // 應用樣式
    const styles = getToolbarStyles();
    Object.assign(toolbar.style, styles);

    // 設置 HTML 結構
    toolbar.innerHTML = `
        <div style="margin-bottom: 10px; font-weight: bold; text-align: center; color: #333;">
            📝 標註工具
        </div>
        
        <!-- 控制按鈕區 -->
        <div class="toolbar-controls" style="display: flex; gap: 8px; margin-bottom: 10px;">
            <button id="toggle-highlight-v2" class="btn-primary">開始標註</button>
            <button id="minimize-highlight-v2" class="btn-icon" title="最小化">－</button>
            <button id="close-highlight-v2" class="btn-icon" title="關閉">✕</button>
        </div>
        
        <!-- 顏色選擇器 -->
        <div id="color-picker-v2" class="color-picker"></div>
        
        <!-- 操作按鈕 -->
        <div class="toolbar-actions" style="display: flex; gap: 6px; margin-bottom: 10px;">
            <button id="sync-to-notion-v2" class="btn-action">🔄 同步</button>
            <button id="open-notion-v2" class="btn-action" style="display: none;">🔗 打開</button>
            <button id="manage-highlights-v2" class="btn-action">📝 管理</button>
        </div>
        
        <!-- 標註列表 -->
        <div id="highlight-list-v2" class="highlight-list" style="display: none;"></div>
        
        <!-- 狀態顯示 -->
        <div id="highlight-status-v2" class="toolbar-status" style="margin-top: 10px; padding: 6px 8px; background: #f8f9fa; border-radius: 4px; font-size: 12px; color: #666; text-align: center;">
            已標註: <span id="highlight-count-v2">0</span> 段
        </div>
        
        <div class="toolbar-hint" style="margin-top: 8px; font-size: 11px; color: #999; text-align: center;">
            💡 Ctrl+點擊標註可快速刪除
        </div>
    `;

    return toolbar;
}
