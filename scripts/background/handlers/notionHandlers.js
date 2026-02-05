/**
 * Notion Handlers
 *
 * 處理通用的 Notion API 請求，如搜索、驗證等。
 *
 * @module handlers/notionHandlers
 */

import { ErrorHandler } from '../../utils/ErrorHandler.js';
import { sanitizeApiError } from '../../utils/securityUtils.js';

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
      try {
        const { query, filter, sort, apiKey } = request;

        const params = {
          query,
          filter,
          sort,
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
