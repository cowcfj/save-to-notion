/**
 * Popup Actions 業務邏輯模組
 *
 * 封裝所有 Chrome API 調用，便於 Mock 和測試。
 */

/* global chrome */

import { URL_NORMALIZATION } from '../scripts/config/constants.js';
import { normalizeUrl } from '../scripts/utils/urlUtils.js';

/**
 * 檢查設置是否完整
 * @returns {Promise<{valid: boolean, apiKey?: string, dataSourceId?: string}>}
 */
export async function checkSettings() {
  try {
    const result = await chrome.storage.sync.get([
      'notionApiKey',
      'notionDataSourceId',
      'notionDatabaseId',
    ]);
    const dataSourceId = result.notionDataSourceId || result.notionDatabaseId;
    return {
      valid: Boolean(result.notionApiKey && dataSourceId),
      apiKey: result.notionApiKey,
      dataSourceId,
    };
  } catch (error) {
    console.warn('Failed to check settings:', error);
    return { valid: false };
  }
}

/**
 * 檢查頁面狀態
 * @returns {Promise<{success: boolean, isSaved?: boolean, notionUrl?: string, wasDeleted?: boolean}>}
 */
export async function checkPageStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkPageStatus' });
    return response || { success: false };
  } catch (error) {
    // 當 background 未準備好或連接失敗時
    console.warn('checkPageStatus failed:', error.message);
    return { success: false };
  }
}

/**
 * 保存頁面到 Notion
 * @returns {Promise<Object>} 保存結果
 */
export async function savePage() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'savePage' });
    return response || { success: false, error: 'No response' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 啟動標記模式
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function startHighlight() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'startHighlight' });
    return response || { success: false, error: 'No response' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 打開 Notion 頁面
 * @param {string} url - Notion 頁面 URL
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function openNotionPage(url) {
  try {
    const tab = await chrome.tabs.create({ url });
    return { success: true, tab };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 獲取當前活動標籤頁
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
export async function getActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs?.[0] || null;
  } catch (error) {
    console.warn('getActiveTab failed:', error.message);
    return null;
  }
}

/**
 * 清除高亮
 * @param {number} tabId - 標籤頁 ID
 * @param {string} tabUrl - 標籤頁 URL
 * @returns {Promise<{success: boolean, clearedCount?: number, error?: string}>}
 */
export async function clearHighlights(tabId, tabUrl) {
  const pageKey = `highlights_${normalizeUrl(tabUrl)}`;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: clearHighlightsInPage,
      args: [URL_NORMALIZATION.TRACKING_PARAMS, pageKey],
    });
    const clearedCount = results?.[0]?.result || 0;
    return { success: true, clearedCount };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 在頁面中執行清除標記的函數
 * 注意：此函數會被序列化後在 content script 中執行
 * @param {string[]} trackingParams - 要移除的追蹤參數列表
 * @param {string} pageKey - 用於清除存儲的鍵
 * @returns {number} 清除的標記數量
 */
function clearHighlightsInPage(trackingParams, pageKey) {
  // 清除頁面上的標記
  const highlights = document.querySelectorAll('.simple-highlight');
  highlights.forEach(highlight => {
    const parent = highlight.parentNode;
    parent.insertBefore(document.createTextNode(highlight.textContent), highlight);
    parent.removeChild(highlight);
    parent.normalize();
  });

  // 清除本地存儲
  try {
    chrome.storage?.local?.remove([pageKey]);
  } catch (_) {
    localStorage.removeItem(pageKey);
  }

  // 更新工具欄計數（如果存在）
  if (window.simpleHighlighter) {
    window.simpleHighlighter.updateHighlightCount();
  }

  return highlights.length;
}
