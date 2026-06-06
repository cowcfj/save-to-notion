/**
 * 安全驗證工具
 *
 * 提供 URL 和請求來源的安全驗證功能。
 *
 * @module utils/securityUtils
 */

/* global chrome */

import Logger from './Logger.js';
import { SECURITY_CONSTANTS } from '../config/shared/core.js';

import { SECURITY_ERROR_MESSAGES, ERROR_MESSAGES } from '../config/shared/errorMessages.js';

const NOTION_ALLOWED_DOMAINS = new Set([
  'notion.so',
  'www.notion.so',
  'notion.com',
  'www.notion.com',
]);
const NOTION_ALLOWED_SUFFIXES = ['.notion.so', '.notion.com'];

// ============================================================================
// URL 驗證函數
// ============================================================================

/**
 * 驗證 URL 格式是否有效
 *
 * @param {string} urlString - 要驗證的 URL 字串
 * @returns {boolean} 是否為有效的 URL
 */
export function isValidUrl(urlString) {
  try {
    const url = new URL(urlString);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

/**
 * 驗證是否為安全的 Notion URL
 *
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

    const hostname = _normalizeHostname(url.hostname);
    return _isAllowedNotionHostname(hostname);
  } catch {
    return false;
  }
}

// === URL 驗證私有輔助函數 ===

function _normalizeHostname(hostname) {
  let normalized = String(hostname ?? '').toLowerCase();
  while (normalized.endsWith('.')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function _isAllowedNotionHostname(hostname) {
  if (NOTION_ALLOWED_DOMAINS.has(hostname)) {
    return true;
  }

  return NOTION_ALLOWED_SUFFIXES.some(suffix => hostname.endsWith(suffix));
}

// ============================================================================
// 請求來源驗證函數（僅 Background 使用）
// ============================================================================

/**
 * 驗證請求來源是否為擴充功能內部
 *
 * @param {object} sender - Chrome message sender object
 * @returns {object|null} 錯誤對象或 null（驗證通過）
 */
export function validateInternalRequest(sender) {
  if (!_isExtensionSender(sender)) {
    return { success: false, error: SECURITY_ERROR_MESSAGES.INTERNAL_ONLY };
  }

  if (sender.tab && !_isExtensionPageSender(sender)) {
    return { success: false, error: SECURITY_ERROR_MESSAGES.INTERNAL_ONLY };
  }

  return null; // 驗證通過
}

/**
 * 驗證請求是否來自我們自己的 content script
 *
 * @param {object} sender - Chrome message sender object
 * @returns {object|null} 錯誤對象或 null（驗證通過）
 */
export function validateContentScriptRequest(sender) {
  if (!_isExtensionSender(sender)) {
    return { success: false, error: SECURITY_ERROR_MESSAGES.CONTENT_SCRIPT_ONLY };
  }

  if (!sender.tab?.id) {
    return { success: false, error: SECURITY_ERROR_MESSAGES.TAB_CONTEXT_REQUIRED };
  }

  return null; // 驗證通過
}

// === 請求來源驗證私有輔助函數 ===

function _isExtensionSender(sender) {
  return sender?.id === chrome.runtime.id;
}

function _isExtensionPageSender(sender) {
  return sender?.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`);
}

// ============================================================================
// 日誌安全函數（防止敏感資訊洩露）
// ============================================================================

// [REMOVED] maskSensitiveString moved to LogSanitizer.js

// [REMOVED] escapeHtml as it is no longer needed with DOM API refactoring

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
 * @example
 * // 安全的 SVG
 * validateSafeSvg('<svg width="16" height="16"><circle cx="8" cy="8" r="8"/></svg>')
 * // 返回: true
 * @example
 * // 危險的 SVG（包含 script）
 * validateSafeSvg('<svg><script>alert("XSS")</script></svg>')
 * // 返回: false
 * @example
 * // 格式不完整的 SVG（缺少結束標籤）
 * validateSafeSvg('<svg width="16" height="16"><circle/>')
 * // 返回: false
 */
export function validateSafeSvg(svgContent) {
  if (!svgContent || typeof svgContent !== 'string') {
    return true; // 空內容視為安全（會被忽略）
  }

  if (!_isSvgContent(svgContent)) {
    return true; // 非 SVG 內容不在此函數驗證範圍
  }

  const trimmedContent = svgContent.trim();

  // 1. 格式完整性驗證
  if (!_isCompleteSvgMarkup(trimmedContent)) {
    Logger.warn('[Security] SVG 格式不完整（缺少結束標籤），已拒絕', svgContent);
    return false;
  }

  // 2. 危險模式偵測
  if (_hasDangerousSvgContent(svgContent)) {
    Logger.warn('[Security] 偵測到可疑的 SVG 內容（包含危險模式），已拒絕', svgContent);
    return false;
  }

  // 3. 白名單機制
  const disallowedTag = _findDisallowedSvgTag(svgContent);
  if (disallowedTag) {
    Logger.warn(`[Security] SVG 包含未在白名單中的標籤 <${disallowedTag}>,已拒絕`, svgContent);
    return false;
  }

  return true;
}

// === SVG 驗證私有輔助常置與函數 ===

const SVG_DANGEROUS_PATTERNS =
  /<script|<embed|<object|<iframe|<foreignobject|javascript:|data:text\/html|onerror|onload|onclick|onmouseover|onfocus|onblur|onanimationstart|onanimationend|ontransitionend/i;

function _isSvgContent(svgContent) {
  if (typeof svgContent !== 'string') {
    return false;
  }

  return svgContent.trim().startsWith('<svg');
}

function _isCompleteSvgMarkup(trimmedContent) {
  return trimmedContent.endsWith('</svg>');
}

function _hasDangerousSvgContent(svgContent) {
  return SVG_DANGEROUS_PATTERNS.test(svgContent);
}

function _findDisallowedSvgTag(svgContent) {
  const allowedTags = SECURITY_CONSTANTS.SVG_ALLOWED_TAGS;
  const tagPattern = /<\/?([a-z][\da-z]*)/gi;
  let match = null;
  while ((match = tagPattern.exec(svgContent)) !== null) {
    const tag = match[1].toLowerCase();
    if (!allowedTags.includes(tag)) {
      return tag;
    }
  }
  return null;
}

/**
 * 從訊息字串中分離圖標（Emoji 或 SVG）和純文本內容
 *
 * 此函數統一處理 UIManager 和 StorageManager 中的圖標分離邏輯，
 * 避免重複維護相同的正則表達式模式。
 *
 * 支持的圖標格式：
 * - Unicode Emoji（範圍：U+1F300 to U+1F9FF）
 * - SVG 標籤（格式：<svg...>...</svg>）
 *
 * @param {string} message - 原始訊息字串（可能包含圖標前綴）
 * @returns {{icon: string, text: string}} 分離後的圖標和文本
 * @example
 * // SVG 圖標 + 文本
 * separateIconAndText('<svg>...</svg> 操作成功')
 * // 返回: {icon: '<svg>...</svg>', text: ' 操作成功'}
 * @example
 * // Emoji 圖標 + 文本
 * separateIconAndText('✅ 操作成功')
 * // 返回: {icon: '✅', text: ' 操作成功'}
 * @example
 * // 純文本（無圖標）
 * separateIconAndText('操作成功')
 * // 返回: {icon: '', text: '操作成功'}
 */
export function separateIconAndText(message) {
  if (!message || typeof message !== 'string') {
    return { icon: '', text: '' };
  }

  // 升級版正則表達式，支持現代 Emoji 序列（膚色、ZWJ、旗幟等）：
  // 1. SVG 標籤：<svg...>...</svg>
  // 2. Emoji 序列：
  //    - 旗幟 (Regional Indicators): \p{RI}\p{RI}
  //    - 複雜 Emoji 序列 (含 ZWJ, 膚色修飾符, 變體選擇符): \p{Emoji}(...)*
  // 使用 'u' 標誌啟用 Unicode 屬性轉義
  // Note: Removed (.*) group to prevent ReDoS by avoiding backtracking interaction between emoji quantifier and catch-all.
  const iconPattern =
    /^(?:<svg[^>]*>.*?<\/svg>|(?:\p{RI}\p{RI}|\p{Emoji}(?:\p{Emoji_Modifier}|\u{FE0F}|\u{200D}\p{Emoji})*))/su;

  const match = iconPattern.exec(message);

  if (match) {
    const icon = match[0];
    return {
      icon,
      text: message.slice(icon.length),
    };
  }

  // 無匹配：視為純文本訊息
  return {
    icon: '',
    text: message,
  };
}

/**
 * 創建安全的 SVG 圖示元素
 * 使用 DOMParser 解析 SVG 字串，避免直接使用 innerHTML
 *
 * @param {string} svgString - SVG 字串
 * @returns {HTMLElement} 包含 SVG 的 span 元素
 */
export const createSafeIcon = svgString => {
  if (!svgString?.startsWith('<svg')) {
    return _createTextIconSpan(svgString);
  }

  if (!validateSafeSvg(svgString)) {
    return _createEmptyIconSpan();
  }

  const validSvgString = _normalizeSvgNamespace(svgString);
  const parser = new DOMParser();
  const doc = parser.parseFromString(validSvgString, 'image/svg+xml');
  const svgElement = _getValidatedParsedSvgElement(doc, svgString);

  if (!svgElement) {
    return _createEmptyIconSpan();
  }

  if (!svgElement.classList.contains('icon-svg')) {
    svgElement.classList.add('icon-svg');
  }

  const span = document.createElement('span');
  span.className = 'icon';
  span.append(svgElement);
  return span;
};

// === 安全圖示創建私有輔助函數 ===

function _createEmptyIconSpan() {
  return document.createElement('span');
}

function _createTextIconSpan(svgString) {
  const span = document.createElement('span');
  span.textContent = svgString || '';
  return span;
}

function _normalizeSvgNamespace(svgString) {
  if (!svgString.includes('xmlns=')) {
    return svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return svgString;
}

function _getValidatedParsedSvgElement(doc, originalSvg) {
  const svgElement = doc.documentElement;

  if (svgElement.tagName === 'parsererror') {
    Logger.warn(ERROR_MESSAGES.TECHNICAL.SVG_PARSE_ERROR, {
      action: 'create_safe_icon',
      reason: 'xml_parser_error',
      content: originalSvg,
    });
    return null;
  }

  if (svgElement.tagName !== 'svg') {
    Logger.warn('[Security] Parsed element is not an SVG', {
      action: 'create_safe_icon',
      content: originalSvg,
    });
    return null;
  }

  return svgElement;
}

/**
 * 允許的 SVG 屬性白名單與安全協議（屬性級過濾）
 * 注意：定義已移動至 app.js，此函數負責邏輯檢查
 *
 * @param {string} name - 屬性名
 * @param {string} value - 屬性值
 * @returns {boolean} 是否安全
 */
export function isSafeSvgAttribute(name, value) {
  const attrName = String(name || '').toLowerCase();

  // 阻擋 on* 事件屬性
  if (attrName.startsWith('on')) {
    return false;
  }

  // 白名單屬性檢查
  if (!_isSvgAttributeAllowed(attrName)) {
    return false;
  }

  // URL 相關屬性需要協議安全檢查
  if (_isSvgUrlAttribute(attrName)) {
    return _isSafeSvgUrlAttributeValue(value);
  }

  return true;
}

// === SVG 屬性驗證私有輔助函數 ===

function _isSvgAttributeAllowed(attrName) {
  const allowedAttrs = SECURITY_CONSTANTS.SVG_ALLOWED_ATTRS.map(attr => attr.toLowerCase());
  return allowedAttrs.includes(attrName);
}

// Match namespace href or standard href/src.
function _isSvgUrlAttribute(attrName) {
  return /(?:^|:)href$|^src$/i.test(attrName);
}

function _isSafeSvgUrlAttributeValue(value) {
  const attrValue = String(value || '').trim();
  if (_hasUnsafeSvgUrlScheme(attrValue)) {
    return false;
  }

  return _hasSafeSvgUrlProtocol(attrValue);
}

function _hasUnsafeSvgUrlScheme(attrValue) {
  if (/^\s*javascript:/i.test(attrValue)) {
    return true;
  }

  return /^\s*data:text\/html/i.test(attrValue);
}

function _hasSafeSvgUrlProtocol(attrValue) {
  try {
    const url = new URL(attrValue, 'https://example.com');
    return SECURITY_CONSTANTS.SAFE_URL_PROTOCOLS.includes(url.protocol);
  } catch {
    return false;
  }
}

/**
 * 驗證備份數據的結構安全性
 *
 * @param {object} backup - 用戶上傳的備份對象
 * @throws {Error} 如果驗證失敗
 */
export function validateBackupData(backup) {
  if (!backup || typeof backup !== 'object') {
    throw new Error('Invalid backup format: root must be an object');
  }

  _assertRequiredBackupField(backup.version, 'string', 'Invalid backup version');
  _assertRequiredBackupField(backup.timestamp, 'string', 'Invalid backup timestamp');
  _assertRequiredBackupField(backup.data, 'object', 'Invalid backup data structure');

  _checkForbiddenKeys(backup.data);
}

// === 備份數據驗證私有輔助函數 ===

function _assertRequiredBackupField(field, expectedType, errorMessage) {
  if (!field || typeof field !== expectedType) {
    throw new Error(errorMessage);
  }
}

/**
 * 遞歸檢查對象中的禁止鍵
 * 防止 Prototype Pollution 攻擊
 *
 * @param {object} obj - 待檢查的對象
 * @throws {Error} 如果發現禁止的鍵
 */
function _checkForbiddenKeys(obj) {
  // 禁止的鍵名列表
  const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

  if (!obj || typeof obj !== 'object') {
    return;
  }

  // 檢查當前對象的鍵
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(`Security Alert: Malicious key detected (${key})`);
    }

    // 遞歸檢查值 (如果是對象 or 陣列)
    const value = obj[key];
    if (value && typeof value === 'object') {
      _checkForbiddenKeys(value);
    }
  }
}
