import { TOOLBAR_SELECTORS } from '../../../config/shared/ui/index.js';

/**
 * 創建工具欄容器
 *
 * @returns {HTMLElement} 工具欄 DOM 元素
 */
export function createToolbarContainer() {
  const toolbar = document.createElement('div');
  toolbar.id = TOOLBAR_SELECTORS.CONTAINER.slice(1);

  // 設置 HTML 結構
  toolbar.innerHTML = `
        <div class="nh-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="nh-icon"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> 標註工具
        </div>

        <!-- 控制按鈕區 -->
        <div style="display: flex; gap: 8px; margin-bottom: 16px;">
            <button id="${TOOLBAR_SELECTORS.TOGGLE_HIGHLIGHT.slice(
              1
            )}" class="nh-btn nh-btn-primary" title="Ctrl+點擊標註可快速刪除">開始標註</button>
            <button id="${TOOLBAR_SELECTORS.MINIMIZE.slice(
              1
            )}" class="nh-btn nh-btn-icon" title="最小化">
                <svg width="14" height="2" viewBox="0 0 14 2" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
            <button id="${TOOLBAR_SELECTORS.CLOSE.slice(1)}" class="nh-btn nh-btn-icon" title="關閉">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
        </div>

        <!-- 顏色選擇器 -->
        <div id="${TOOLBAR_SELECTORS.COLOR_PICKER.slice(1)}" class="nh-color-picker"></div>

        <!-- 操作按鈕 -->
        <div style="display: flex; gap: 8px; margin-bottom: 12px;">
            <button id="${TOOLBAR_SELECTORS.SAVE_PAGE.slice(
              1
            )}" class="nh-btn nh-btn-save"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> 保存網頁</button>
            <button id="${TOOLBAR_SELECTORS.SYNC_TO_NOTION.slice(
              1
            )}" class="nh-btn nh-btn-action" style="display: none; position: relative; overflow: visible;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M21 21v-5h-5"/></svg> 同步<span id="${TOOLBAR_SELECTORS.COUNT_DISPLAY.slice(1)}" class="nh-sync-badge" style="display: none;">0</span></button>
            <button id="${TOOLBAR_SELECTORS.MANAGE_HIGHLIGHTS.slice(
              1
            )}" class="nh-btn nh-btn-action"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> 管理</button>
        </div>

        <!-- 狀態顯示 (僅同步時顯示) -->
        <div id="${TOOLBAR_SELECTORS.STATUS_CONTAINER.slice(1)}" class="nh-status" style="display: none;"></div>
    `;

  return toolbar;
}
