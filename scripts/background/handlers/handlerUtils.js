/**
 * Handler Utils
 *
 * Background Handlers 共用工具函數
 *
 * @module handlers/handlerUtils
 */

/* global chrome */

import { ERROR_MESSAGES } from '../../config/shared/messaging/index.js';

/**
 * 獲取活動標籤頁
 *
 * @returns {Promise<chrome.tabs.Tab>}
 * @throws {Error} 如果無法獲取標籤頁
 */
export async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const [activeTab] = tabs ?? [];
  if (!activeTab?.id) {
    throw new Error(ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB);
  }
  return activeTab;
}
