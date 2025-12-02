/**
 * 工具欄容器組件
 * 負責創建工具欄的 DOM 結構
 */

/**
 * 創建工具欄容器
 * @returns {HTMLElement} 工具欄 DOM 元素
 */
export function createToolbarContainer() {
  const toolbar = document.createElement('div');
  toolbar.id = 'notion-highlighter-v2';

  // 設置 HTML 結構
  toolbar.innerHTML = `
        <div class="nh-header">
            📝 標註工具
        </div>
        
        <!-- 控制按鈕區 -->
        <div style="display: flex; gap: 8px; margin-bottom: 16px;">
            <button id="toggle-highlight-v2" class="nh-btn nh-btn-primary">開始標註</button>
            <button id="minimize-highlight-v2" class="nh-btn nh-btn-icon" title="最小化">
                <svg width="14" height="2" viewBox="0 0 14 2" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
            <button id="close-highlight-v2" class="nh-btn nh-btn-icon" title="關閉">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
        </div>
        
        <!-- 顏色選擇器 -->
        <div id="color-picker-v2" class="nh-color-picker"></div>
        
        <!-- 操作按鈕 -->
        <div style="display: flex; gap: 8px; margin-bottom: 12px;">
            <button id="sync-to-notion-v2" class="nh-btn nh-btn-action">🔄 同步</button>
            <button id="open-notion-v2" class="nh-btn nh-btn-action" style="display: none;">🔗 打開</button>
            <button id="manage-highlights-v2" class="nh-btn nh-btn-action">📝 管理</button>
        </div>
        
        <!-- 標註列表 -->
        <div id="highlight-list-v2" class="nh-list" style="display: none;"></div>
        
        <!-- 狀態顯示 -->
        <div id="highlight-status-v2" class="nh-status">
            已標註: <span id="highlight-count-v2">0</span> 段
        </div>
        
        <div class="nh-hint">
            💡 Ctrl+點擊標註可快速刪除
        </div>
    `;

  return toolbar;
}
