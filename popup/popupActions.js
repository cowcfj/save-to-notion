/**
 * Popup Actions 業務邏輯模組
 *
 * 封裝所有 Chrome API 調用，便於 Mock 和測試。
 */

/* global chrome */

import { URL_NORMALIZATION } from '../scripts/config/constants.js';

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
export function checkPageStatus() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'checkPageStatus' }, (response, _error) => {
      resolve(response || { success: false });
    });
  });
}

/**
 * 保存頁面到 Notion
 * @returns {Promise<Object>} 保存結果
 */
export function savePage() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'savePage' }, (response, _error) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { success: false, error: 'No response' });
      }
    });
  });
}

/**
 * 啟動標記模式
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export function startHighlight() {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'startHighlight' }, (response, _error) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { success: false, error: 'No response' });
      }
    });
  });
}

/**
 * 打開 Notion 頁面
 * @param {string} url - Notion 頁面 URL
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export function openNotionPage(url) {
  return new Promise(resolve => {
    chrome.tabs.create({ url }, (tab, _error) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve({ success: true, tab });
      }
    });
  });
}

/**
 * 獲取當前活動標籤頁
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
export function getActiveTab() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs, _error) => {
      resolve(tabs?.[0] || null);
    });
  });
}

/**
 * 清除頁面上的標記
 * 這個函數在 content script 上下文中執行
 * @param {number} tabId - 標籤頁 ID
 * @returns {Promise<{success: boolean, clearedCount?: number, error?: string}>}
 */
export function clearHighlights(tabId) {
  return new Promise(resolve => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: clearHighlightsInPage,
        args: [URL_NORMALIZATION.TRACKING_PARAMS],
      },
      results => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          const clearedCount = results?.[0]?.result || 0;
          resolve({ success: true, clearedCount });
        }
      }
    );
  });
}

/**
 * 在頁面中執行清除標記的函數
 * 注意：此函數會被序列化後在 content script 中執行
 * @param {string[]} trackingParams - 要移除的追蹤參數列表
 * @returns {number} 清除的標記數量
 */
function clearHighlightsInPage(trackingParams) {
  // 清除頁面上的標記
  const highlights = document.querySelectorAll('.simple-highlight');
  highlights.forEach(highlight => {
    const parent = highlight.parentNode;
    parent.insertBefore(document.createTextNode(highlight.textContent), highlight);
    parent.removeChild(highlight);
    parent.normalize();
  });

  // 清除本地存儲
  const normalizeUrl = rawUrl => {
    try {
      const url = new URL(rawUrl);
      url.hash = '';
      trackingParams.forEach(param => url.searchParams.delete(param));
      if (url.pathname !== '/' && url.pathname.endsWith('/')) {
        url.pathname = url.pathname.replace(/\/+$/, '');
      }
      return url.toString();
    } catch (error) {
      console.warn('Failed to normalize URL:', rawUrl, error);
      return rawUrl || '';
    }
  };

  const pageKey = `highlights_${normalizeUrl(window.location.href)}`;
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
