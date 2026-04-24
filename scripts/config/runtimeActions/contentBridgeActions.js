/**
 * Content bridge 專用 runtime actions
 *
 * 供 content script 與 background/preloader 之間的橋接訊息使用。
 */
export const CONTENT_BRIDGE_ACTIONS = Object.freeze({
  PING: 'PING',
  SET_STABLE_URL: 'SET_STABLE_URL',
  GET_STABLE_URL: 'GET_STABLE_URL',
  INIT_BUNDLE: 'INIT_BUNDLE',
  REPLAY_BUFFERED_EVENTS: 'REPLAY_BUFFERED_EVENTS',
});
