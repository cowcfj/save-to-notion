/**
 * API 錯誤清理與標準化工具
 *
 * 將外部/API/runtime 錯誤標準化為內部 Error Code 或友善訊息。
 *
 * @module utils/ApiErrorSanitizer
 */

import Logger from './Logger.js';
import { API_ERROR_PATTERNS, ERROR_MESSAGES } from '../config/shared/messages.js';

/**
 * 內部 API 錯誤分類器 (私有實現，引用純配置數據)
 *
 * @param {string} lowerMessage - 已轉小寫的錯誤訊息
 * @returns {string|null} 分類後的錯誤關鍵字
 */
function _classifyApiError(lowerMessage) {
  const patterns = API_ERROR_PATTERNS;

  const direct = _classifyDirectApiError(lowerMessage, patterns);
  if (direct) {
    return direct;
  }

  const auth = _classifyAuthApiError(lowerMessage, patterns);
  if (auth) {
    return auth;
  }

  const validation = _classifyValidationApiError(lowerMessage, patterns);
  if (validation) {
    return validation;
  }

  const permission = _classifyPermissionApiError(lowerMessage, patterns);
  if (permission) {
    return permission;
  }

  const dataSource = _classifyDataSourceApiError(lowerMessage, patterns);
  if (dataSource) {
    return dataSource;
  }

  const server = _classifyServerApiError(lowerMessage, patterns);
  if (server) {
    return server;
  }

  return null;
}

// === API 錯誤分類私有輔助函數 ===

function _hasPatternMatch(lowerMessage, patterns) {
  if (!patterns) {
    return false;
  }

  return patterns.some(k => lowerMessage.includes(k));
}

function _classifyDirectApiError(lowerMessage, patterns) {
  // TIMEOUT 必須早於 NETWORK_ERROR 檢查，否則 'timeout' 等關鍵字會被歸類為
  // NETWORK_ERROR 而喪失「請求超時」的精確語意（PATTERNS.TIMEOUT vs PATTERNS.NETWORK_ERROR）。
  // chrome.tabs / runtime 三條 mapping 必須早於 MISSING_PAGE_ID：
  // NOT_FOUND 含 'does not exist'，會搶吃 'Receiving end does not exist'。
  // RUNTIME_DISCONNECTED 早於 CONNECTION_NOT_ESTABLISHED：chrome 複合訊息
  // 'Could not establish connection. Receiving end does not exist.' 兩段都命中時，
  // 更具體的「content script 已 unmount」axis 應勝出。
  const mappings = [
    ['RATE_LIMITED', patterns.RATE_LIMIT],
    ['NO_TAB_WITH_ID', patterns.TAB_NOT_FOUND],
    ['CONTENT_SCRIPT_NOT_READY', patterns.RUNTIME_DISCONNECTED],
    ['TAB_COMMUNICATION_FAILED', patterns.CONNECTION_NOT_ESTABLISHED],
    ['MISSING_PAGE_ID', patterns.NOT_FOUND],
    ['NO_ACTIVE_TAB', patterns.ACTIVE_TAB],
    ['TIMEOUT', patterns.TIMEOUT],
    ['NETWORK_ERROR', patterns.NETWORK],
  ];

  for (const [result, keyPatterns] of mappings) {
    if (_hasPatternMatch(lowerMessage, keyPatterns)) {
      return result;
    }
  }
  return null;
}

function _classifyAuthApiError(lowerMessage, patterns) {
  const authClassifiers = [
    ['INTEGRATION_DISCONNECTED', patterns.AUTH_DISCONNECTED],
    ['INVALID_API_KEY_FORMAT', patterns.AUTH_INVALID],
    ['INTEGRATION_FORBIDDEN', patterns.AUTH_FORBIDDEN],
  ];

  for (const [result, keyPatterns] of authClassifiers) {
    if (_hasPatternMatch(lowerMessage, keyPatterns)) {
      return result;
    }
  }

  // Default to generic API Key error if matched main AUTH pattern
  if (_hasPatternMatch(lowerMessage, patterns.AUTH)) {
    return 'API_KEY_NOT_CONFIGURED';
  }

  return null;
}

function _classifyValidationApiError(lowerMessage, patterns) {
  if (_hasPatternMatch(lowerMessage, patterns.VALIDATION)) {
    return 'VALIDATION_ERROR';
  }
  return null;
}

function _classifyPermissionApiError(lowerMessage, patterns) {
  // 必須早於 DATA_SOURCE 檢查：DATA_SOURCE 含 'database' 關鍵字，
  // 否則 'database permission denied' 會被誤判為 MISSING_DATA_SOURCE。
  if (_hasPatternMatch(lowerMessage, patterns.PERMISSION)) {
    return _hasPatternMatch(lowerMessage, patterns.PERMISSION_DB)
      ? 'DATABASE_ACCESS_DENIED'
      : 'TAB_RESTRICTED_PAGE';
  }
  return null;
}

function _classifyDataSourceApiError(lowerMessage, patterns) {
  if (_hasPatternMatch(lowerMessage, patterns.DATA_SOURCE)) {
    return 'MISSING_DATA_SOURCE';
  }
  return null;
}

function _classifyServerApiError(lowerMessage, patterns) {
  if (!_hasPatternMatch(lowerMessage, patterns.SERVER_ERROR)) {
    return null;
  }

  if (_messageIncludesAll(lowerMessage, ['internal', 'error'])) {
    return 'INTERNAL_SERVER_ERROR';
  }

  if (_messageIncludesAll(lowerMessage, ['service', 'unavailable'])) {
    return 'INTERNAL_SERVER_ERROR';
  }

  return null;
}

function _messageIncludesAll(message, fragments) {
  return fragments.every(fragment => message.includes(fragment));
}

/**
 * 清理外部 API 錯誤訊息，防止洩露技術細節並標準化錯誤分類
 *
 * 安全與架構考量：
 * 1. 職責分離：此函數僅負責「分類」與「清洗」，不包含 UI 文案。
 * 2. 縱深防禦：防止內部實現細節、Stack Traces 等洩露。
 * 3. 翻譯橋接：返回的關鍵字（如 'API_KEY_NOT_CONFIGURED'）由 ErrorHandler 轉換為友善語句。
 * 4. Boundary 約定：SDK 原始 code（snake_case）在此函數入口統一轉為內部 SCREAMING_SNAKE_CASE
 *    vocabulary，輸出後所有消費端皆與 PATTERNS key 對齊。
 *
 * @param {string | object} apiError - API 錯誤訊息或錯誤對象
 * @param {string} context - 錯誤上下文（如 'create_page', 'update_page'）
 * @returns {string | object} 錯誤代碼或清洗後的結構化錯誤對象
 */
export function sanitizeApiError(apiError, context = 'operation') {
  // 1. [SDK Support] 優先處理 SDK 錯誤碼
  const sdkResult = _normalizeSdkApiError(apiError);
  if (sdkResult !== null) {
    return sdkResult;
  }

  const errorMessage = _getApiErrorMessage(apiError);

  // 2. Fast-path: 內部 token 已是 PATTERNS key 時直接回傳，避免再走 keyword 比對而誤判為 UNKNOWN_ERROR。
  if (_isInternalErrorToken(errorMessage)) {
    return errorMessage;
  }

  const lowerMessage = errorMessage.toLowerCase();

  // 3. 使用內部解析器進行分類 (引用配置)
  const classification = _classifyApiError(lowerMessage);
  if (classification) {
    return classification;
  }

  // 4. 處理中文字串 (友善訊息)
  if (_isLocalizedUserMessage(errorMessage)) {
    return errorMessage;
  }

  // 5. 結構化兜底處理
  Logger.warn(
    `[Security] Unrecognized API error sanitized (context: ${context}, length: ${errorMessage.length})`
  );

  return 'UNKNOWN_ERROR';
}

// === API 錯誤清理私有輔助函數 ===

function _normalizeSdkApiError(apiError) {
  if (!apiError) {
    return null;
  }

  if (!apiError.code) {
    return null;
  }

  if (apiError.code === 'validation_error') {
    if (_isImageValidationMessage(apiError.message)) {
      return 'IMAGE_VALIDATION_ERROR';
    }
    return 'VALIDATION_ERROR';
  }

  return typeof apiError.code === 'string' ? apiError.code.toUpperCase() : apiError.code;
}

function _getApiErrorMessage(apiError) {
  if (typeof apiError === 'string') {
    return apiError;
  }

  return String(apiError?.message ?? '');
}

function _isImageValidationMessage(message) {
  const lowerMessage = String(message ?? '').toLowerCase();
  if (lowerMessage.includes('image')) {
    return true;
  }

  return lowerMessage.includes('media');
}

function _isInternalErrorToken(errorMessage) {
  if (!errorMessage) {
    return false;
  }

  return Object.hasOwn(ERROR_MESSAGES.PATTERNS, errorMessage);
}

function _isLocalizedUserMessage(errorMessage) {
  if (!errorMessage) {
    return false;
  }
  // 限制檢查長度防止 ReDoS
  return /\p{Unified_Ideograph}/u.test(errorMessage.slice(0, 500));
}
