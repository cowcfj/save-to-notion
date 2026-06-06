/**
 * FloatingRailRuntime.js
 *
 * 封裝 Floating Rail 與 Background Script 的 Chrome runtime 通訊。
 * 沿用 ToolbarRuntime 的模式：每個函數對應一個 background action。
 */

import { HIGHLIGHTER_ACTIONS } from '../../config/runtimeActions/highlighterActions.js';
import { PAGE_SAVE_ACTIONS } from '../../config/runtimeActions/pageSaveActions.js';
import { RUNTIME_ERROR_MESSAGES } from '../../config/messages/runtimeErrorMessages.js';

function ensureChromeRuntimeAvailable() {
  if (globalThis.window === undefined || !globalThis.chrome?.runtime?.sendMessage) {
    throw new Error(RUNTIME_ERROR_MESSAGES.EXTENSION_UNAVAILABLE);
  }
  return globalThis.chrome.runtime.sendMessage;
}

export async function checkPageStatus() {
  const sendMessage = ensureChromeRuntimeAvailable();
  return sendMessage({ action: PAGE_SAVE_ACTIONS.CHECK_PAGE_STATUS });
}

export async function savePageFromRail() {
  const sendMessage = ensureChromeRuntimeAvailable();
  return sendMessage({ action: PAGE_SAVE_ACTIONS.SAVE_PAGE_FROM_TOOLBAR });
}

export async function syncHighlights(highlights) {
  const sendMessage = ensureChromeRuntimeAvailable();
  return sendMessage({ action: HIGHLIGHTER_ACTIONS.SYNC_HIGHLIGHTS, highlights });
}

export async function openSidePanel() {
  const sendMessage = ensureChromeRuntimeAvailable();
  return sendMessage({ action: PAGE_SAVE_ACTIONS.OPEN_SIDE_PANEL });
}
