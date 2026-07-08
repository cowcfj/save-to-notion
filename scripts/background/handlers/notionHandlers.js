/**
 * Notion Handlers
 *
 * 處理通用的 Notion API 請求，如搜索、驗證等。
 *
 * @module handlers/notionHandlers
 */

import { ErrorHandler } from '../../utils/ErrorHandler.js';
import { RUNTIME_ACTIONS } from '../../config/shared/runtimeActions.js';
import { validateInternalRequest } from '../../utils/securityUtils.js';
import { sanitizeApiError } from '../../utils/ApiErrorSanitizer.js';
import {
  getActiveNotionToken,
  refreshOAuthToken as refreshOAuthTokenCoordinator,
} from '../../utils/notionAuth.js';
import { ERROR_MESSAGES } from '../../config/messages/errorMessages.js';

const SEARCH_PARAM_FIELDS = ['query', 'filter', 'sort', 'page_size', 'start_cursor'];

function buildNotionSearchParams(request) {
  if (request.searchParams) {
    return request.searchParams;
  }

  const fallback = {};
  for (const field of SEARCH_PARAM_FIELDS) {
    if (request[field] !== undefined) {
      fallback[field] = request[field];
    }
  }
  return fallback;
}

async function resolveSearchApiKey(apiKey) {
  if (apiKey) {
    return apiKey;
  }

  const active = await getActiveNotionToken();
  return active?.token ?? null;
}

function sendMissingApiKeyResponse(sendResponse) {
  sendResponse({
    success: false,
    error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.API_KEY_NOT_CONFIGURED),
  });
}

async function searchNotionWithResolvedToken({ request, notionService, sendResponse }) {
  const params = buildNotionSearchParams(request);
  const resolvedApiKey = await resolveSearchApiKey(request.apiKey);

  if (!resolvedApiKey) {
    sendMissingApiKeyResponse(sendResponse);
    return;
  }

  const result = await notionService.search(params, { apiKey: resolvedApiKey });
  sendResponse({ success: true, data: result });
}

async function handleSearchNotion({ request, sender, sendResponse, notionService }) {
  // 安全驗證：確保請求來自擴充功能內部 (Options/Popup)
  const validationError = validateInternalRequest(sender);
  if (validationError) {
    sendResponse(validationError);
    return;
  }

  try {
    await searchNotionWithResolvedToken({ request, notionService, sendResponse });
  } catch (error) {
    const safeMessage = sanitizeApiError(error, 'search_notion');
    sendResponse({
      success: false,
      error: ErrorHandler.formatUserMessage(safeMessage),
    });
  }
}

export function createNotionHandlers({ notionService }) {
  return {
    /**
     * 搜索 Notion 資源 (Database/Page)
     *
     * @param {object} request
     * @param {chrome.runtime.MessageSender} sender
     * @param {Function} sendResponse
     */
    [RUNTIME_ACTIONS.SEARCH_NOTION]: async (request, sender, sendResponse) => {
      await handleSearchNotion({ request, sender, sendResponse, notionService });
    },

    /**
     * 刷新 OAuth Token（統一交由 Background 協調）
     *
     * @param {object} _request
     * @param {chrome.runtime.MessageSender} sender
     * @param {Function} sendResponse
     */
    [RUNTIME_ACTIONS.REFRESH_OAUTH_TOKEN]: async (_request, sender, sendResponse) => {
      const validationError = validateInternalRequest(sender);
      if (validationError) {
        sendResponse(validationError);
        return;
      }

      try {
        const token = await refreshOAuthTokenCoordinator();
        sendResponse({ success: Boolean(token), token: token ?? null });
      } catch (error) {
        const safeMessage = sanitizeApiError(error, 'refresh_oauth_token');
        sendResponse({
          success: false,
          token: null,
          error: ErrorHandler.formatUserMessage(safeMessage),
        });
      }
    },
  };
}
