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

// ============================================================================
// 日誌安全函數（防止敏感資訊洩露）
// ============================================================================

/**
 * 清理 URL 用於日誌記錄，移除可能包含敏感資訊的部分
 *
 * 安全考量：
 * - 移除查詢參數（可能包含 tokens、signatures、API keys）
 * - 移除片段標識符（fragment）
 * - 僅保留協議、主機名和路徑
 *
 * @param {string} url - 原始 URL
 * @returns {string} 清理後的 URL（僅保留協議、主機名和路徑）
 *
 * @example
 * // 敏感 URL（包含 token）
 * sanitizeUrlForLogging('https://api.example.com/data?token=secret123&sig=xyz')
 * // 返回: 'https://api.example.com/data'
 *
 * @example
 * // 無效 URL
 * sanitizeUrlForLogging('not-a-valid-url')
 * // 返回: '[invalid-url]'
 */
export function sanitizeUrlForLogging(url) {
  if (!url || typeof url !== 'string') {
    return '[empty-url]';
  }

  try {
    const urlObj = new URL(url);
    // 只返回協議、主機名和路徑，移除查詢參數和片段
    return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
  } catch {
    // 如果無法解析，返回通用描述（避免洩露無效 URL 內容）
    return '[invalid-url]';
  }
}

/**
 * 遮蔽字串中的敏感部分（如 API keys、tokens）
 *
 * @param {string} text - 原始文字
 * @param {number} visibleStart - 開始顯示的字元數（默認 4）
 * @param {number} visibleEnd - 結尾顯示的字元數（默認 4）
 * @returns {string} 遮蔽後的文字
 *
 * @example
 * maskSensitiveString('sk_live_1234567890abcdefghijklmn')
 * // 返回: 'sk_l***klmn'
 */
export function maskSensitiveString(text, visibleStart = 4, visibleEnd = 4) {
  if (!text || typeof text !== 'string') {
    return '[empty]';
  }

  if (text.length <= visibleStart + visibleEnd) {
    // 太短無法遮蔽，全部遮蔽
    return '***';
  }

  const start = text.substring(0, visibleStart);
  const end = text.substring(text.length - visibleEnd);
  return `${start}***${end}`;
}
