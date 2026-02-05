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

        // 如果提供了臨時 API Key，則更新 Service
        // 注意：這會影響全域 Service 狀態，但在 Options 頁面配置場景下通常是預期的
        if (apiKey) {
          notionService.setApiKey(apiKey);
        }

        const params = {
          query,
          filter,
          sort,
        };

        const result = await notionService.search(params);
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
