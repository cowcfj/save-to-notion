/**
 * Highlight Handlers
 *
 * 處理標註工具的激活、更新與同步操作。
 *
 * @module handlers/highlightHandlers
 */

/* global chrome, Logger */

import {
  validateInternalRequest,
  validateContentScriptRequest,
  sanitizeApiError,
} from '../../utils/securityUtils.js';
import { buildHighlightBlocks } from '../utils/BlockBuilder.js';
import { isRestrictedInjectionUrl } from '../services/InjectionService.js';
import { ErrorHandler } from '../../utils/ErrorHandler.js';
import { HANDLER_CONSTANTS } from '../../config/constants.js';
import { ERROR_MESSAGES } from '../../config/messages.js';

// ============================================================================
// 內部輔助函數 (Local Helpers)
// ============================================================================

/**
 * 獲取活動標籤頁
 *
 * @returns {Promise<chrome.tabs.Tab>}
 * @throws {Error} 如果無法獲取標籤頁
 */
async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  if (!activeTab?.id) {
    throw new Error(ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB);
  }
  return activeTab;
}

/**
 * 獲取 Notion API Key
 *
 * @param {StorageService} storageService
 * @returns {Promise<string>} API Key
 * @throws {Error} 如果 API Key 未設置
 */
async function ensureNotionApiKey(storageService) {
  const config = await storageService.getConfig(['notionApiKey']);
  if (!config.notionApiKey) {
    throw new Error(ERROR_MESSAGES.TECHNICAL.API_KEY_NOT_CONFIGURED);
  }
  return config.notionApiKey;
}
/**
 * 確保 Bundle 已就緒
 *
 * @param {number} tabId
 * @param {number} maxRetries
 * @returns {Promise<boolean>}
 */
async function ensureBundleReady(tabId, maxRetries = HANDLER_CONSTANTS.BUNDLE_READY_MAX_RETRIES) {
  const retryDelay = HANDLER_CONSTANTS.BUNDLE_READY_RETRY_DELAY;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const pingResponse = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { action: 'PING' }, result => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      });

      if (pingResponse?.status === 'bundle_ready') {
        Logger.ready('Bundle 已就緒', { action: 'ensureBundleReady', attempts: i + 1 });
        return true;
      }
    } catch {
      // Bundle 還未就緒，等待後重試
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  return false;
}

// ============================================================================
// 工廠函數
// ============================================================================

/**
 * 創建 Highlight Handlers
 *
 * @param {object} services - 服務實例集合
 * @returns {object} 處理函數映射
 */
export function createHighlightHandlers(services) {
  const { notionService, storageService, injectionService } = services;

  return {
    /**
     * 處理用戶快捷鍵激活（來自 Preloader）
     *
     * @param {object} request
     * @param {chrome.runtime.MessageSender} sender
     * @param {Function} sendResponse
     */
    USER_ACTIVATE_SHORTCUT: async (request, sender, sendResponse) => {
      try {
        // 安全性驗證：確保請求來自我們自己的 content script
        // 這個處理器會執行腳本注入，必須確保僅限我們的 preloader.js 調用
        const validationError = validateContentScriptRequest(sender);
        if (validationError) {
          Logger.warn('安全性阻擋', {
            action: 'USER_ACTIVATE_SHORTCUT',
            reason: 'invalid_content_script_request',
            error: validationError.error,
            senderId: sender?.id,
            tabId: sender?.tab?.id,
          });
          sendResponse(validationError);
          return;
        }

        if (!sender.tab?.id) {
          Logger.warn('缺少標籤頁上下文', { action: 'USER_ACTIVATE_SHORTCUT' });
          sendResponse({ success: false, error: 'No tab context' });
          return;
        }

        const tabId = sender.tab.id;
        const tabUrl = sender.tab.url;
        Logger.start('觸發快捷鍵激活', { action: 'USER_ACTIVATE_SHORTCUT', tabId });

        // 檢查是否為受限頁面
        if (tabUrl && isRestrictedInjectionUrl(tabUrl)) {
          Logger.warn('受限頁面無法使用標註', {
            action: 'USER_ACTIVATE_SHORTCUT',
            url: tabUrl,
            result: 'blocked',
            reason: 'restricted_url',
          });
          sendResponse({
            success: false,
            error: ERROR_MESSAGES.USER_MESSAGES.HIGHLIGHT_NOT_SUPPORTED,
          });
          return;
        }

        // 確保 Bundle 已注入（捕獲可能的注入錯誤）
        try {
          await injectionService.ensureBundleInjected(tabId);
        } catch (injectionError) {
          Logger.error('Bundle 注入失敗', {
            action: 'USER_ACTIVATE_SHORTCUT',
            error: injectionError.message,
            stack: injectionError.stack,
          });
          const safeMessage = sanitizeApiError(injectionError, 'bundle_injection');
          sendResponse({
            success: false,
            error: ErrorHandler.formatUserMessage(safeMessage),
          });
          return;
        }

        // 等待 Bundle 完全就緒
        const bundleReady = await ensureBundleReady(tabId);

        if (!bundleReady) {
          Logger.warn('Bundle 初始化超時', { action: 'USER_ACTIVATE_SHORTCUT', tabId });
          sendResponse({
            success: false,
            error: ERROR_MESSAGES.USER_MESSAGES.BUNDLE_INIT_TIMEOUT,
          });
          return;
        }

        // 發送訊息顯示 highlighter
        try {
          const response = await new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tabId, { action: 'showHighlighter' }, result => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(result);
              }
            });
          });
          Logger.success('成功顯示高亮工具', { action: 'USER_ACTIVATE_SHORTCUT' });
          sendResponse({ success: true, response });
        } catch (error) {
          Logger.warn('顯示高亮工具失敗', {
            action: 'USER_ACTIVATE_SHORTCUT',
            error: error.message,
          });
          const safeMessage = sanitizeApiError(error, 'show_highlighter');
          sendResponse({
            success: false,
            error: ErrorHandler.formatUserMessage(safeMessage),
          });
        }
      } catch (error) {
        Logger.error('執行快捷鍵激活時發生意外錯誤', {
          action: 'USER_ACTIVATE_SHORTCUT',
          error: error.message,
        });
        const safeMessage = sanitizeApiError(error, 'user_activate_shortcut');
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
      }
    },

    /**
     * 啟動/切換高亮工具
     *
     * @param {object} request
     * @param {chrome.runtime.MessageSender} sender
     * @param {Function} sendResponse
     */
    startHighlight: async (request, sender, sendResponse) => {
      try {
        // 安全性驗證：檢查請求來源
        // startHighlight 會執行腳本注入，必須確保僅限內部調用
        const validationError = validateInternalRequest(sender);
        if (validationError) {
          Logger.warn('安全性阻擋', {
            action: 'startHighlight',
            reason: 'invalid_internal_request',
            error: validationError.error,
            senderId: sender?.id,
            tabId: sender?.tab?.id,
          });
          sendResponse(validationError);
          return;
        }

        const activeTab = await getActiveTab();

        // 檢查是否為受限頁面（chrome://、chrome-extension:// 等）
        if (isRestrictedInjectionUrl(activeTab.url)) {
          sendResponse({
            success: false,
            error: ERROR_MESSAGES.USER_MESSAGES.HIGHLIGHT_NOT_SUPPORTED,
          });
          return;
        }

        // 嘗試先發送訊息切換（如果腳本已加載）
        try {
          const response = await new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(
              activeTab.id,
              { action: 'toggleHighlighter' },
              messageResponse => {
                if (chrome.runtime.lastError) {
                  // 如果最後一個錯誤存在，說明沒有監聽器或其他問題
                  reject(chrome.runtime.lastError);
                } else {
                  resolve(messageResponse);
                }
              }
            );
          });

          if (response?.success) {
            sendResponse({ success: true });
            return;
          }
        } catch (error) {
          // 訊息發送失敗，說明腳本可能未加載，繼續執行注入
          Logger.info('發送切換訊息失敗，嘗試注入腳本', {
            action: 'startHighlight',
            error: error.message,
          });
        }

        const result = await injectionService.injectHighlighter(activeTab.id);
        if (result?.initialized) {
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Highlighter initialization failed' });
        }
      } catch (error) {
        Logger.error('啟動高亮工具時出錯', { action: 'startHighlight', error: error.message });
        const safeMessage = sanitizeApiError(error, 'start_highlight');
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
      }
    },

    /**
     * 更新現有頁面的標註
     *
     * @param {object} request
     * @param {chrome.runtime.MessageSender} sender
     * @param {Function} sendResponse
     */
    updateHighlights: async (request, sender, sendResponse) => {
      try {
        // 安全性驗證：確保請求來自擴充功能內部 (Popup)
        const validationError = validateInternalRequest(sender);
        if (validationError) {
          sendResponse(validationError);
          return;
        }

        const activeTab = await getActiveTab();

        // 1. 確保有 API Key（優先檢查，以符合測試期待）
        const apiKey = await ensureNotionApiKey(storageService);

        const url = activeTab.url || '';
        const savedData = await storageService.getSavedPageData(url);

        if (!savedData?.notionPageId) {
          sendResponse({
            success: false,
            error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.PAGE_NOT_SAVED),
          });
          return;
        }

        const highlights = await injectionService.collectHighlights(activeTab.id);

        // 轉換標記為 Blocks
        const highlightBlocks = buildHighlightBlocks(highlights);

        // 調用 NotionService 更新標記 (以無狀態方式傳遞 apiKey)
        const result = await notionService.updateHighlightsSection(
          savedData.notionPageId,
          highlightBlocks,
          { apiKey }
        );

        if (result.success) {
          result.highlightsUpdated = true;
          result.highlightCount = highlights.length;
        }
        sendResponse(result);
      } catch (error) {
        Logger.error('更新標註時出錯', { action: 'updateHighlights', error: error.message });
        const safeMessage = sanitizeApiError(error, 'update_highlights');
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
      }
    },

    /**
     * 同步標註 (從請求 payload 中獲取)
     *
     * @param {object} request - 請求對象
     * @param {chrome.runtime.MessageSender} sender - 發送者信息
     * @param {Function} sendResponse - 回應函數
     */
    syncHighlights: async (request, sender, sendResponse) => {
      try {
        // 安全性驗證：確保請求來自我們自己的 content script
        const validationError = validateContentScriptRequest(sender);
        if (validationError) {
          sendResponse(validationError);
          return;
        }

        const activeTab = await getActiveTab();

        // 1. 確保有 API Key（優先檢查，以符合測試期待）
        const apiKey = await ensureNotionApiKey(storageService);

        const url = activeTab.url || '';
        const savedData = await storageService.getSavedPageData(url);

        if (!savedData?.notionPageId) {
          sendResponse({
            success: false,
            error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.PAGE_NOT_SAVED),
          });
          return;
        }

        const highlights = request.highlights || [];
        if (highlights.length === 0) {
          sendResponse({
            success: true,
            message: '沒有新標註需要同步',
            highlightCount: 0,
          });
          return;
        }

        // 轉換標記為 Blocks
        const highlightBlocks = buildHighlightBlocks(highlights);

        // 調用 NotionService 更新標記 (以無狀態方式傳遞 apiKey)
        const result = await notionService.updateHighlightsSection(
          savedData.notionPageId,
          highlightBlocks,
          { apiKey }
        );

        if (result.success) {
          Logger.success('成功同步標註', { action: 'syncHighlights', count: highlights.length });
          result.highlightCount = highlights.length;
          result.message = `成功同步 ${highlights.length} 個標註`;
        } else {
          Logger.error('同步標註失敗', { action: 'syncHighlights', error: result.error });
        }
        sendResponse(result);
      } catch (error) {
        Logger.error('執行 syncHighlights 時出錯', {
          action: 'syncHighlights',
          error: error.message,
        });
        const safeMessage = sanitizeApiError(error, 'sync_highlights');
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
      }
    },
  };
}
