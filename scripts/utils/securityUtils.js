/**
 * 安全驗證工具
 *
 * 提供 URL 和請求來源的安全驗證功能。
 *
 * @module utils/securityUtils
 */

/* global chrome */

import Logger from './Logger.js';

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
 * maskSensitiveString('secret-token-example-1234567890')
 * // 返回: 'secr***7890'
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

/**
 * 清理外部 API 錯誤訊息，防止洩露技術細節
 *
 * 安全考量：
 * - 外部 API 錯誤可能包含內部實現細節、stack traces、技術資訊
 * - 這些資訊可能被攻擊者利用來探測系統弱點
 * - 應將技術錯誤轉換為用戶友好的通用訊息
 *
 * @param {string|Object} apiError - API 錯誤訊息或錯誤對象
 * @param {string} context - 錯誤上下文（如 'create_page', 'update_page'）
 * @returns {string} 清理後的用戶友好錯誤訊息
 *
 * @example
 * // API 返回技術錯誤
 * sanitizeApiError('invalid_request_url: The request URL is not valid', 'create_page')
 * // 返回: '操作失敗，請稍後再試'
 *
 * @example
 * // 權限錯誤
 * sanitizeApiError('unauthorized: API token is invalid', 'save_page')
 * // 返回: 'API Key 無效或已過期，請檢查設置'
 */
export function sanitizeApiError(apiError, context = 'operation') {
  const errorMessage = typeof apiError === 'string' ? apiError : apiError?.message || '';
  const lowerMessage = errorMessage.toLowerCase();

  // 權限/認證錯誤
  if (
    lowerMessage.includes('unauthorized') ||
    lowerMessage.includes('invalid token') ||
    lowerMessage.includes('invalid api') ||
    lowerMessage.includes('authentication')
  ) {
    return 'API Key 無效或已過期，請檢查設置';
  }

  // 權限不足錯誤
  if (
    lowerMessage.includes('forbidden') ||
    lowerMessage.includes('permission') ||
    lowerMessage.includes('access denied')
  ) {
    return '權限不足，請確認已授予擴充功能適當的 Notion 權限';
  }

  // 速率限制錯誤
  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
    return '請求過於頻繁，請稍候再試';
  }

  // 資源不存在錯誤
  if (lowerMessage.includes('not found') || lowerMessage.includes('does not exist')) {
    return '找不到指定的資源，可能已被刪除';
  }

  // 驗證錯誤（圖片、數據格式等）
  if (
    lowerMessage.includes('validation') ||
    lowerMessage.includes('image') ||
    lowerMessage.includes('media')
  ) {
    return '數據格式不符合要求，已嘗試自動修正';
  }

  // 網絡錯誤
  if (
    lowerMessage.includes('network') ||
    lowerMessage.includes('fetch') ||
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('enotfound')
  ) {
    return '網絡連接失敗，請檢查網絡狀態後重試';
  }

  // Notion 服務錯誤
  if (lowerMessage.includes('service unavailable') || lowerMessage.includes('internal error')) {
    return 'Notion 服務暫時不可用，請稍後再試';
  }

  // 數據庫相關錯誤
  if (lowerMessage.includes('database') && context.includes('page')) {
    return '無法訪問目標數據庫，請確認 API Key 權限設置';
  }

  // 通用錯誤（最後的兜底）
  // 不洩露任何技術細節
  return '操作失敗，請稍後再試。如問題持續，請查看擴充功能設置';
}

// ============================================================================
// DOM 安全驗證函數
// ============================================================================

/**
 * 驗證 DOM 元素的安全性和有效性
 * 防禦第三方腳本篡改或無效的 DOM 引用
 *
 * @param {Element} element - 待驗證的 DOM 元素
 * @param {Document} contextDocument - 預期的文檔上下文（通常是 document）
 * @param {string} [expectedSelector] - 預期的 CSS 選擇器（可選）
 * @returns {boolean} 是否為安全有效的元素
 */
export function validateSafeDomElement(element, contextDocument, expectedSelector) {
  // 1. 基礎類型檢查
  if (!element || typeof element !== 'object' || element.nodeType !== 1) {
    Logger.debug('[Security] Invalid element type:', element);
    return false;
  }

  // 2. 防篡改：必須屬於當前文檔上下文
  // 防止惡意腳本注入來自 iframe 或其他上下文的元素
  if (contextDocument && element.ownerDocument !== contextDocument) {
    return false;
  }

  // 3. 防過期：必須連接到 DOM 樹
  // 防止引用已被移除的節點（避免內存洩漏和邏輯錯誤）
  if (!element.isConnected) {
    return false;
  }

  // 4. 正確性：如果提供了選擇器，必須匹配
  // 防止元素標籤或屬性被篡改
  if (expectedSelector && typeof element.matches === 'function') {
    if (!element.matches(expectedSelector)) {
      return false;
    }
  }

  return true;
}

/**
 * 驗證 Preloader 快取對象的結構完整性
 *
 * @param {Object} cache - 待驗證的快取對象
 * @returns {boolean} 是否為有效的快取結構
 */
export function validatePreloaderCache(cache) {
  // Check 1: Must be non-null object
  if (!cache || typeof cache !== 'object') {
    return false;
  }

  // Check 2: timestamp must be a valid finite number
  // 使用 Number.isFinite 比 !isNaN 更嚴格，排除 Infinity
  return typeof cache.timestamp === 'number' && Number.isFinite(cache.timestamp);
}

/**
 * 驗證 SVG 內容是否安全（防止 XSS 攻擊）
 *
 * 安全考量：
 * - 即使在預期只接收內部生成的 SVG 的情況下，仍應驗證內容
 * - 作為縱深防禦（Defense in Depth）的一環
 * - 防止意外引入外部或未清理的 SVG 內容
 *
 * 驗證策略：
 * 1. 格式完整性：必須以 <svg 開頭且以 </svg> 結尾
 * 2. 危險模式偵測：拒絕包含可執行代碼的 SVG
 * 3. 白名單機制：只允許已知安全的 SVG 屬性和標籤
 *
 * @param {string} svgContent - SVG 字串內容
 * @returns {boolean} 是否為安全的 SVG（true = 安全，false = 包含危險內容）
 *
 * @example
 * // 安全的 SVG
 * validateSafeSvg('<svg width="16" height="16"><circle cx="8" cy="8" r="8"/></svg>')
 * // 返回: true
 *
 * @example
 * // 危險的 SVG（包含 script）
 * validateSafeSvg('<svg><script>alert("XSS")</script></svg>')
 * // 返回: false
 *
 * @example
 * // 格式不完整的 SVG（缺少結束標籤）
 * validateSafeSvg('<svg width="16" height="16"><circle/>')
 * // 返回: false
 */
export function validateSafeSvg(svgContent) {
  if (!svgContent || typeof svgContent !== 'string') {
    return true; // 空內容視為安全（會被忽略）
  }

  const trimmedContent = svgContent.trim();

  // 只驗證 SVG 標籤
  if (!trimmedContent.startsWith('<svg')) {
    return true; // 非 SVG 內容不在此函數驗證範圍
  }

  // ============================================================================
  // 防禦性檢查 1：格式完整性驗證
  // ============================================================================
  // 審核建議：驗證 SVG 是否真的以 <svg 開頭且以 </svg> 結尾
  if (!trimmedContent.endsWith('</svg>')) {
    Logger.warn('[Security] SVG 格式不完整（缺少結束標籤），已拒絕', svgContent);
    return false;
  }

  // ============================================================================
  // 防禦性檢查 2：危險模式偵測（擴展清單）
  // ============================================================================
  // 危險模式列表（擴展版）：
  // - <script> 標籤：可執行 JavaScript
  // - <embed>, <object>, <iframe>：可嵌入外部資源
  // - javascript: 協議：可在事件或連結中執行 JavaScript
  // - data: 協議：可能包含 base64 編碼的惡意代碼
  // - on* 事件處理器：
  //   - onclick, onload, onerror, onmouseover（常見）
  //   - onanimationstart, onanimationend（CSS 動畫觸發）
  //   - ontransitionend（CSS 過渡觸發）
  //   - onfocus, onblur（焦點事件）
  // - <foreignObject>：可嵌入 HTML 內容（潛在風險）
  const dangerousPatterns =
    /<script|<embed|<object|<iframe|<foreignObject|javascript:|data:text\/html|onerror|onload|onclick|onmouseover|onfocus|onblur|onanimationstart|onanimationend|ontransitionend/i;

  const hasDangerousContent = dangerousPatterns.test(svgContent);

  if (hasDangerousContent) {
    Logger.warn('[Security] 偵測到可疑的 SVG 內容（包含危險模式），已拒絕', svgContent);
    return false;
  }

  // ============================================================================
  // 防禦性檢查 3：白名單機制（基礎實現）
  // ============================================================================
  // 允許的 SVG 標籤（常見且安全的圖形元素）
  // 注意：這是基礎白名單，可根據實際需求擴展
  const allowedTags = [
    'svg',
    'path',
    'circle',
    'rect',
    'line',
    'polyline',
    'polygon',
    'ellipse',
    'g',
    'defs',
    'use',
    'symbol',
    'title',
    'desc',
    'lineargradient', // 注意：轉為小寫比較
    'radialgradient',
    'stop',
    'clippath',
    'mask',
    'pattern',
    'text',
    'tspan',
    'image', // 允許圖片（但已在危險模式中檢查 data: 協議）
    'a', // 允許連結（但已在危險模式中檢查 javascript: 協議）
  ];

  // 提取所有標籤名稱（簡化驗證，不使用完整 XML 解析器）
  // 正則說明：匹配 <tagname 或 </tagname 格式，支援駝峰命名
  const tagPattern = /<\/?([a-z][a-z0-9]*)/gi;
  const foundTags = new Set();
  let match = null;

  while ((match = tagPattern.exec(svgContent)) !== null) {
    foundTags.add(match[1].toLowerCase()); // 轉為小寫進行比較
  }

  // 檢查是否所有標籤都在白名單中
  for (const tag of foundTags) {
    if (!allowedTags.includes(tag)) {
      Logger.warn(`[Security] SVG 包含未在白名單中的標籤 <${tag}>,已拒絕`, svgContent);
      return false;
    }
  }

  // 通過所有安全檢查
  return true;
}

/**
 * 從消息字串中分離圖標（Emoji 或 SVG）和純文本內容
 *
 * 此函數統一處理 UIManager 和 StorageManager 中的圖標分離邏輯，
 * 避免重複維護相同的正則表達式模式。
 *
 * 支持的圖標格式：
 * - Unicode Emoji（範圍：U+1F300 to U+1F9FF）
 * - SVG 標籤（格式：<svg...>...</svg>）
 *
 * @param {string} message - 原始消息字串（可能包含圖標前綴）
 * @returns {{icon: string, text: string}} 分離後的圖標和文本
 *
 * @example
 * // SVG 圖標 + 文本
 * separateIconAndText('<svg>...</svg> 操作成功')
 * // 返回: {icon: '<svg>...</svg>', text: ' 操作成功'}
 *
 * @example
 * // Emoji 圖標 + 文本
 * separateIconAndText('✅ 操作成功')
 * // 返回: {icon: '✅', text: ' 操作成功'}
 *
 * @example
 * // 純文本（無圖標）
 * separateIconAndText('操作成功')
 * // 返回: {icon: '', text: '操作成功'}
 */
export function separateIconAndText(message) {
  if (!message || typeof message !== 'string') {
    return { icon: '', text: '' };
  }

  // 統一的正則表達式模式（支持 Emoji 和 SVG）
  // Emoji 範圍包括：
  // - \u{2600}-\u{27BF}：雜項符號（Miscellaneous Symbols），包括 ✅ ❌ 等
  // - \u{1F300}-\u{1F9FF}：表情符號與符號（Emoticons and Pictographs）
  // - \u{1FA00}-\u{1FA6F}：擴展符號 A
  // SVG：<svg[^>]*>.*?</svg> 匹配 SVG 標籤（使用非貪婪匹配防止 ReDoS）
  // 使用 'su' 標誌：s = dotAll 模式，u = Unicode 模式
  const iconPattern =
    /^([\u{2600}-\u{27BF}\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FA6F}]|<svg[^>]*>.*?<\/svg>)(.*)$/su;

  const match = message.match(iconPattern);

  if (match) {
    return {
      icon: match[1], // 第一個捕獲組：Emoji 或 SVG
      text: match[2], // 第二個捕獲組：剩餘文本
    };
  }

  // 無匹配：視為純文本消息
  return {
    icon: '',
    text: message,
  };
}
