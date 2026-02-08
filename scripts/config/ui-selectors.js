/**
 * UI 選擇器配置文件
 * 包含 Extension Options 頁面與 Content Script Toolbar 的相關選擇器
 */

// ==========================================
// UI 選擇器 (Options & Toolbar)
// ==========================================

export const OPTIONS_PAGE_SELECTORS = {
  STATUS_CONTAINER: '#status',
  MANUAL_SECTION: '.manual-section',
  TEST_API_BUTTON: '#test-api-button',
  HIDDEN_CLASS: 'hidden',
  STATUS_MESSAGE_CLASS: 'status-message',
};

export const TOOLBAR_SELECTORS = {
  CONTAINER: '#notion-highlighter-v2',
  MINI_ICON: '#notion-highlighter-mini-icon',
  TOGGLE_HIGHLIGHT: '#toggle-highlight-v2',
  MINIMIZE: '#minimize-highlight-v2',
  CLOSE: '#close-highlight-v2',
  COLOR_PICKER: '#color-picker-v2',
  SYNC_TO_NOTION: '#sync-to-notion-v2',
  OPEN_NOTION: '#open-notion-v2',
  MANAGE_HIGHLIGHTS: '#manage-highlights-v2',
  HIGHLIGHT_LIST: '#highlight-list-v2',
  STATUS_CONTAINER: '#highlight-status-v2',
  COUNT_DISPLAY: '#highlight-count-v2',
  LIST_OPEN_NOTION: '#list-open-notion-v2',
};
