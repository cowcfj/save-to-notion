/**
 * Background handler guard helpers.
 *
 * 只收斂 handler validation failure、migration catch 與批次 URL 清理樣板。
 *
 * @module handlers/handlerGuard
 */

/* global Logger */

import { isValidUrl, validateInternalRequest } from '../../utils/securityUtils.js';
import { sanitizeApiError } from '../../utils/ApiErrorSanitizer.js';
import { sanitizeUrlForLogging } from '../../utils/LogSanitizer.js';
import { ErrorHandler } from '../../utils/ErrorHandler.js';
import { ERROR_MESSAGES } from '../../config/messages/errorMessages.js';
import { computeStableUrl } from '../../utils/urlUtils.js';

export const validatePrivilegedRequest = (sender, url = null) => {
  const senderError = validateInternalRequest(sender);
  if (senderError) {
    return senderError;
  }

  if (url && !isValidUrl(url)) {
    return { success: false, error: ERROR_MESSAGES.USER_MESSAGES.INVALID_URL_PROTOCOL };
  }

  return null;
};

export function sendGuardFailure(validationError, sendResponse, logMeta) {
  Logger.warn('安全性阻擋', logMeta);
  sendResponse(validationError);
}

export function buildMigrationGuardMeta({ action, sender, validationError, url }) {
  const meta = {
    action,
    senderId: sender?.id,
    error: validationError.error,
    result: 'blocked',
  };

  if (url) {
    meta.url = sanitizeUrlForLogging(url);
  }

  return meta;
}

export function buildContentScriptGuardMeta({ action, sender, validationError }) {
  return {
    action,
    reason: 'invalid_content_script_request',
    error: validationError.error,
    senderId: sender?.id,
    tabId: sender?.tab?.id,
    result: 'blocked',
  };
}

export function buildInternalGuardMeta({ action, sender, validationError }) {
  return {
    action,
    reason: 'invalid_internal_request',
    error: validationError.error,
    senderId: sender?.id,
    tabId: sender?.tab?.id,
    result: 'blocked',
  };
}

export function buildSimpleGuardMeta({ action, reason, validationError }) {
  return {
    action,
    reason,
    error: validationError.error,
    result: 'blocked',
  };
}

export function sendStandardHandlerError({
  error,
  logMessage,
  action,
  sanitizeContext,
  sendResponse,
}) {
  const safeMessage = sanitizeApiError(error, sanitizeContext);
  Logger.error(logMessage, { action, error: safeMessage, result: 'failed' });
  sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
}

export function validateBatchUrls(urls) {
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return { success: false, error: ERROR_MESSAGES.USER_MESSAGES.MISSING_URL };
  }

  const invalidUrls = urls.filter(urlItem => !isValidUrl(urlItem));
  if (invalidUrls.length > 0) {
    return { success: false, error: ERROR_MESSAGES.USER_MESSAGES.INVALID_URLS_IN_BATCH };
  }

  return null;
}

export async function clearLegacyKeysWithStable(storageService, url) {
  const resolvedUrl = computeStableUrl(url);
  await storageService.clearLegacyKeys(url);
  if (resolvedUrl && resolvedUrl !== url) {
    await storageService.clearLegacyKeys(resolvedUrl);
  }
}
