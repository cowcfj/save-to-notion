/**
 * Notion Handlers
 *
 * 處理通用的 Notion API 請求，如搜索、驗證等。
 *
 * @module handlers/notionHandlers
 */

import { ErrorHandler } from '../../utils/ErrorHandler.js';
import { sanitizeApiError, validateInternalRequest } from '../../utils/securityUtils.js';

export function createNotionHandlers({ notionService }) {
  return {
    /**
     * 搜索 Notion 資源 (Database/Page)
     *
     * @param {object} request
     * @param {chrome.runtime.MessageSender} sender
     * @param {Function} sendResponse
     */
    searchNotion: async (request, sender, sendResponse) => {
      // 1. 安全驗證：確保請求來自擴充功能內部 (Options/Popup)
      const validationError = validateInternalRequest(sender);
      if (validationError) {
        sendResponse(validationError);
        return;
      }

      try {
        const { apiKey, searchParams } = request;

        // 優先使用封裝的 searchParams，防止命名空間衝突；否則回退到扁平結構以保持相容
        const params = searchParams || {
          query: request.query,
          filter: request.filter,
          sort: request.sort,
          page_size: request.page_size,
          start_cursor: request.start_cursor,
        };

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
  };
}
