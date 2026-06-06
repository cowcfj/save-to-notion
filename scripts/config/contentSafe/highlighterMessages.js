/**
 * Highlighter-safe UI messages, supporting tree-shaking for content-injected modules.
 */

import { deepFreeze } from '../shared/deepFreeze.js';

export const HIGHLIGHTER_MESSAGES = deepFreeze({
  FLOATING_RAIL: {
    CONTAINER_LABEL: 'Save to Notion 工具列',
    TRIGGER_LABEL: '展開工具列，長按可拖曳',
    SAVE_LABEL: '保存網頁',
    SYNC_LABEL: '同步標註',
    HIGHLIGHT_LABEL: '開始標註',
    STOP_HIGHLIGHT_LABEL: '停止標註',
    COLOR_PALETTE_LABEL: '標註顏色',
    MANAGE_LABEL: '管理標註',
    SAVE_FAILED: '保存失敗',
    CLOSE_LABEL: '關閉本頁工具列',
  },
  TOOLBAR: {
    COLOR_PICKER_NAMES: {
      yellow: '黃',
      green: '綠',
      blue: '藍',
      red: '紅',
    },
    COLOR_PICKER_TITLE: colorName => `${colorName}色標註`,
    COLOR_PICKER_ARIA_LABEL: colorName => `選擇${colorName}色標註`,
  },
  POPUP: {
    DELETED_PAGE: '原頁面已刪除，請重新儲存。',
    DELETION_PENDING: '正在確認原頁面是否已刪除，請稍後再試。',
  },
  TOAST: {
    DEFAULT: '發生錯誤，請稍後再試',
    HIGHLIGHT_DELETED: '標註已刪除',
    HIGHLIGHT_DUPLICATE: '此文字已標註',
    HIGHLIGHT_FAILED: '標註失敗，請重試',
    SYNC_FAILED_AUTH: '同步失敗：Notion 授權已失效，請重新連接',
    SYNC_FAILED_RATE_LIMIT: '同步失敗：請求過於頻繁，請稍後再試',
    SYNC_FAILED_NETWORK: '同步失敗：網路連線異常，請檢查網路',
    SYNC_FAILED_PAGE: '同步失敗：找不到目標頁面，請確認頁面存在',
  },
});
