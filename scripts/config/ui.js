/**
 * UI 選擇器配置文件
 * 包含 Extension Options 頁面與 Content Script Toolbar 的相關選擇器
 */

// ==========================================
// UI 選擇器 (Options & Toolbar)
// ==========================================

export const TOOLBAR_SELECTORS = {
  CONTAINER: '#notion-highlighter-v2',
  MINI_ICON: '#notion-highlighter-mini-icon',
  TOGGLE_HIGHLIGHT: '#toggle-highlight-v2',
  MINIMIZE: '#minimize-highlight-v2',
  CLOSE: '#close-highlight-v2',
  COLOR_PICKER: '#color-picker-v2',
  SYNC_TO_NOTION: '#sync-to-notion-v2',
  MANAGE_HIGHLIGHTS: '#manage-highlights-v2',
  SAVE_PAGE: '#save-page-v2',
  STATUS_CONTAINER: '#highlight-status-v2',
  COUNT_DISPLAY: '#sync-count-badge-v2',
};

// ==========================================
// 統一日誌圖標定義 (Centralized Emoji Config)
// ==========================================

/**
 * 統一日誌圖標定義 (Centralized Emoji Config)
 * 用於 Logger.success/start/ready 等語義化方法
 */
export const LOG_ICONS = {
  SUCCESS: '✅',
  ERROR: '❌',
  WARN: '⚠️',
  START: '🚀',
  READY: '📦',
};

// ==========================================
// UI 狀態與 CSS 類名常量
// ==========================================

/** UI 提示狀態類型 */
export const UI_STATUS_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  INFO: 'info',
  WARNING: 'warning',
};

/** 通用 UI 組件 CSS 類名（用於盒子、徽章等） */
export const COMMON_CSS_CLASSES = {
  SUCCESS_BOX: 'success-box',
  ERROR_BOX: 'error-box',
  WARNING_BOX: 'warning-box',
  RESULT_URL: 'result-url',
  RESULT_ITEM: 'migration-result-item',
  COUNT_BADGE: 'count-badge',
};
