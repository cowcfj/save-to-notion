/**
 * Preloader 專用 runtime actions
 *
 * 僅供 scripts/performance/preloader.js 使用，避免載入完整 aggregate registry。
 */
export const PRELOADER_ACTIONS = Object.freeze({
  USER_ACTIVATE_SHORTCUT: 'USER_ACTIVATE_SHORTCUT',
  PING: 'PING',
  INIT_BUNDLE: 'INIT_BUNDLE',
  REPLAY_BUFFERED_EVENTS: 'REPLAY_BUFFERED_EVENTS',
});
