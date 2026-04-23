/**
 * Notion Handlers
 *
 * 處理通用的 Notion API 請求，如搜索、驗證等。
 *
 * @module handlers/notionHandlers
 */

import { ErrorHandler } from '../../utils/ErrorHandler.js';
import { RUNTIME_ACTIONS } from '../../config/shared/messaging/runtime/index.js';
import { sanitizeApiError, validateInternalRequest } from '../../utils/securityUtils.js';
import { refreshOAuthToken as refreshOAuthTokenCoordinator } from '../../utils/notionAuth.js';

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
      // 1. 安全驗證：確保請求來自擴充功能內部 (Options/Popup)
      const validationError = validateInternalRequest(sender);
      if (validationError) {
        sendResponse(validationError);
        return;
      }

      try {
        const { apiKey, searchParams } = request;

        // 優先使用封裝的 searchParams，防止命名空間衝突；否則回退到扁平結構以保持相容
        const params =
          searchParams ||
          (() => {
            const fallback = {};
            const fields = ['query', 'filter', 'sort', 'page_size', 'start_cursor'];

            for (const field of fields) {
              if (request[field] !== undefined) {
                fallback[field] = request[field];
              }
            }
            return fallback;
          })();

        // 以無狀態方式執行搜索，如果提供了 apiKey 則覆蓋全域配置
        const result = await notionService.search(params, { apiKey });
        sendResponse({ success: true, data: result });
      } catch (error) {
        const safeMessage = sanitizeApiError(error, 'search_notion');
        sendResponse({
          success: false,
          error: ErrorHandler.formatUserMessage(safeMessage),
        });
      }
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
