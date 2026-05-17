import { CONTENT_BRIDGE_ACTIONS } from '../../config/runtimeActions/contentBridgeActions.js';

const ERROR_TO_TOAST = {
  UNAUTHORIZED: 'SYNC_FAILED_AUTH',
  INVALID_API_KEY_FORMAT: 'SYNC_FAILED_AUTH',
  API_KEY_NOT_CONFIGURED: 'SYNC_FAILED_AUTH',
  INTEGRATION_DISCONNECTED: 'SYNC_FAILED_AUTH',
  RATE_LIMITED: 'SYNC_FAILED_RATE_LIMIT',
  NETWORK_ERROR: 'SYNC_FAILED_NETWORK',
  TIMEOUT: 'SYNC_FAILED_NETWORK',
  OBJECT_NOT_FOUND: 'SYNC_FAILED_PAGE',
  PAGE_NOT_SAVED: 'SYNC_FAILED_PAGE',
};

export function classifyErrorForToast(errorCode) {
  if (!errorCode) {
    return null;
  }
  return ERROR_TO_TOAST[errorCode] ?? null;
}

export function sendToastToTab(tabId, messageKey, level) {
  if (!Number.isInteger(tabId) || tabId < 0) {
    return Promise.resolve();
  }
  return Promise.resolve(
    chrome.tabs.sendMessage(tabId, {
      action: CONTENT_BRIDGE_ACTIONS.SHOW_TOAST,
      messageKey,
      level,
    })
  ).catch(() => {});
}
