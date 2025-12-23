/**
 * 安全驗證工具
 *
 * 提供 URL 和請求來源的安全驗證功能。
 *
 * @module utils/securityUtils
 */

/* global chrome */

// ============================================================================
// URL 驗證函數
// ============================================================================

/**
 * 驗證 URL 格式是否有效
 * @param {string} urlString - 要驗證的 URL 字串
 * @returns {boolean} 是否為有效的 URL
 */
export function isValidUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 驗證是否為安全的 Notion URL
 * @param {string} urlString - 要驗證的 URL 字串
 * @returns {boolean} 是否為有效的 Notion URL
 */
export function isValidNotionUrl(urlString) {
  try {
    const url = new URL(urlString);

    // 僅允許 HTTPS 協議
    if (url.protocol !== 'https:') {
      return false;
    }

    // Notion 網域白名單
    const allowedDomains = ['notion.so', 'www.notion.so'];

    // 規範化 hostname：轉小寫並移除 trailing dot
    const hostname = url.hostname.toLowerCase().replace(/\.+$/, '');

    // 允許 notion.so 的子網域（例如 xxx.notion.so）
    return allowedDomains.includes(hostname) || hostname.endsWith('.notion.so');
  } catch {
    return false;
  }
}

// ============================================================================
// 請求來源驗證函數（僅 Background 使用）
// ============================================================================

/**
 * 驗證請求來源是否為擴充功能內部
 * @param {object} sender - Chrome message sender object
 * @returns {object|null} 錯誤對象或 null（驗證通過）
 */
export function validateInternalRequest(sender) {
  // 來源驗證：必須來自擴充功能內部
  const isExtensionOrigin = sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`);

  // 允許的情況：
  // 1. 沒有 tab 對象 (Popup, Background) 且 ID 匹配
  // 2. 有 tab 對象，但 URL 是擴充功能自身的 URL (Options in Tab) 且 ID 匹配
  if (sender.id !== chrome.runtime.id || (sender.tab && !isExtensionOrigin)) {
    return { success: false, error: '拒絕訪問：此操作僅限擴充功能內部調用' };
  }

  return null; // 驗證通過
}

/**
 * 驗證請求是否來自我們自己的 content script
 * @param {object} sender - Chrome message sender object
 * @returns {object|null} 錯誤對象或 null（驗證通過）
 */
export function validateContentScriptRequest(sender) {
  // Content script 的特徵：
  // 1. sender.id 必須是我們的擴充功能
  // 2. sender.tab 必須存在（在網頁上下文中）

  if (sender.id !== chrome.runtime.id) {
    return { success: false, error: '拒絕訪問：僅限本擴充功能的 content script 調用' };
  }

  if (!sender.tab || !sender.tab.id) {
    return { success: false, error: '拒絕訪問：此操作必須在標籤頁上下文中調用' };
  }

  return null; // 驗證通過
}
