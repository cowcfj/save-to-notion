/**
 * Page save 專用 runtime actions
 *
 * 供頁面保存狀態、Toolbar 保存流程與 Side Panel 開啟流程使用。
 * 這些 action literal 是 runtime message contract 的 wire value，MUST 對齊
 * scripts/background/handlers/* 內既有 handler registry 使用的 route key，MUST NOT 單獨改名。
 * 新增、刪除或改名任何 action 時，先更新 scripts/config/shared/runtimeActions.js，
 * 再同步更新 .agents/.shared/knowledge/message_bus.json 的 payload/response contract。
 */
export const PAGE_SAVE_ACTIONS = Object.freeze({
  CHECK_PAGE_STATUS: 'checkPageStatus',
  SAVE_PAGE: 'savePage',
  SAVE_PAGE_FROM_TOOLBAR: 'SAVE_PAGE_FROM_TOOLBAR',
  PAGE_SAVE_HINT: 'PAGE_SAVE_HINT',
  OPEN_NOTION_PAGE: 'openNotionPage',
  OPEN_SIDE_PANEL: 'OPEN_SIDE_PANEL',
});
