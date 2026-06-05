import { PAGE_SAVE_ACTIONS } from '../../config/runtimeActions/pageSaveActions.js';
import Logger from '../../utils/Logger.js';
import { VALID_STYLES } from '../utils/color.js';

function getInitGlobalScope(options) {
  return options?.globalScope ?? globalThis;
}

function getInitLogger(options) {
  return options?.logger ?? Logger;
}

function getRuntimeSendMessage(globalScope) {
  return globalScope.chrome?.runtime?.sendMessage;
}

function getStorageSync(globalScope) {
  return globalScope.chrome?.storage?.sync;
}

function readHighlightStyle(settings) {
  return settings?.highlightStyle || '';
}

function normalizeHighlighterSettings(settings) {
  return settings || {};
}

export function resolveStyleMode(settings, options) {
  const highlightStyle = readHighlightStyle(settings);
  if (!highlightStyle) {
    return 'background';
  }
  if (VALID_STYLES.includes(highlightStyle)) {
    return highlightStyle;
  }

  getInitLogger(options).warn('[Highlighter] highlightStyle 設定值無效', {
    value: highlightStyle,
    action: 'initializeExtension',
  });
  return 'background';
}

export async function fetchPageStatus(options) {
  const sendMessage = getRuntimeSendMessage(getInitGlobalScope(options));
  if (!sendMessage) {
    return null;
  }
  try {
    return await sendMessage({
      action: PAGE_SAVE_ACTIONS.CHECK_PAGE_STATUS,
    });
  } catch (error) {
    getInitLogger(options).warn('[Highlighter] checkPageStatus 失敗', {
      error: error?.message,
      action: 'checkPageStatus',
    });
    return null;
  }
}

export async function fetchHighlighterSettings(options) {
  const storageSync = getStorageSync(getInitGlobalScope(options));
  if (!storageSync) {
    return {};
  }
  try {
    const settings = await storageSync.get(['highlightStyle', 'floatingRailEnabled']);
    return normalizeHighlighterSettings(settings);
  } catch (error) {
    getInitLogger(options).warn('[Highlighter] 載入設定失敗', {
      error: error?.message,
      action: 'initializeExtension',
    });
    return {};
  }
}
