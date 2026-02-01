/**
 * Highlight Handlers
 *
 * 處理標註工具的激活、更新與同步操作。
 *
 * @module handlers/highlightHandlers
 */

/* global chrome, Logger */

import { normalizeUrl } from '../../utils/urlUtils.js';
import {
  validateInternalRequest,
  validateContentScriptRequest,
  sanitizeApiError,
} from '../../utils/securityUtils.js';
import { buildHighlightBlocks } from '../utils/BlockBuilder.js';
import { isRestrictedInjectionUrl } from '../services/InjectionService.js';
import { ErrorHandler } from '../../utils/ErrorHandler.js';
import { HANDLER_CONSTANTS, ERROR_MESSAGES } from '../../config/constants.js';

// ============================================================================
// 內部輔助函數 (Local Helpers)
// ============================================================================

/**
 * 獲取活動標籤頁
 * @returns {Promise<chrome.tabs.Tab>}
 * @throws {Error} 如果無法獲取標籤頁
 */
async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  if (!activeTab || !activeTab.id) {
    throw new Error(ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB);
  }
  return activeTab;
}

/**
 * 獲取並設置 Notion API Key
 * @param {StorageService} storageService
 * @param {NotionService} notionService
 * @returns {Promise<string>} API Key
 * @throws {Error} 如果 API Key 未設置
 */
async function ensureNotionApiKey(storageService, notionService) {
  const config = await storageService.getConfig(['notionApiKey']);
  if (!config.notionApiKey) {
    throw new Error(ERROR_MESSAGES.TECHNICAL.API_KEY_NOT_CONFIGURED);
  }
  notionService.setApiKey(config.notionApiKey);
  return config.notionApiKey;
}
/**
 * 確保 Bundle 已就緒
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
        Logger.log(`[USER_ACTIVATE_SHORTCUT] Bundle ready on attempt ${i + 1}`);
        return true;
      }
    } catch (_pingError) {
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
 * @param {Object} services - 服務實例集合
 * @returns {Object} 處理函數映射
 */
export function createHighlightHandlers(services) {
  const { notionService, storageService, injectionService } = services;

  return {
    /**
     * 處理用戶快捷鍵激活（來自 Preloader）
     */
    USER_ACTIVATE_SHORTCUT: async (request, sender, sendResponse) => {
      try {
        // 安全性驗證：確保請求來自我們自己的 content script
        // 這個處理器會執行腳本注入，必須確保僅限我們的 preloader.js 調用
        const validationError = validateContentScriptRequest(sender);
        if (validationError) {
          Logger.warn('⚠️ [USER_ACTIVATE_SHORTCUT] 安全性阻擋:', validationError.error, {
            sender,
          });
          sendResponse(validationError);
          return;
        }

        if (!sender.tab || !sender.tab.id) {
          Logger.warn('[USER_ACTIVATE_SHORTCUT] No tab context');
          sendResponse({ success: false, error: 'No tab context' });
          return;
        }

        const tabId = sender.tab.id;
        const tabUrl = sender.tab.url;
        Logger.log(`⚡ [USER_ACTIVATE_SHORTCUT] Triggered from tab ${tabId}`);

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
          Logger.error('[USER_ACTIVATE_SHORTCUT] Bundle injection failed:', injectionError);
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
          Logger.warn('[USER_ACTIVATE_SHORTCUT] Bundle not ready after retries');
          sendResponse({
            success: false,
            error: ERROR_MESSAGES.USER_MESSAGES.BUNDLE_INIT_TIMEOUT,
          });
          return;
        }

        // 發送消息顯示 highlighter
        chrome.tabs.sendMessage(tabId, { action: 'showHighlighter' }, response => {
          if (chrome.runtime.lastError) {
            Logger.warn(
              '[USER_ACTIVATE_SHORTCUT] Failed to show highlighter:',
              chrome.runtime.lastError.message
            );
            const safeMessage = sanitizeApiError(
              chrome.runtime.lastError.message,
              'show_highlighter'
            );
            sendResponse({
              success: false,
              error: ErrorHandler.formatUserMessage(safeMessage),
            });
          } else {
            Logger.log('[USER_ACTIVATE_SHORTCUT] Highlighter shown successfully');
            sendResponse({ success: true, response });
          }
        });
      } catch (error) {
        Logger.error('[USER_ACTIVATE_SHORTCUT] Unexpected error:', error);
        const safeMessage = sanitizeApiError(error, 'user_activate_shortcut');
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
      }
    },

    /**
     * 啟動/切換高亮工具
     */
    startHighlight: async (request, sender, sendResponse) => {
      try {
        // 安全性驗證：檢查請求來源
        // startHighlight 會執行腳本注入，必須確保僅限內部調用
        const validationError = validateInternalRequest(sender);
        if (validationError) {
          Logger.warn('⚠️ [startHighlight] 安全性阻擋:', validationError.error, { sender });
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

        // 嘗試先發送消息切換（如果腳本已加載）
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
          // 消息發送失敗，說明腳本可能未加載，繼續執行注入
          Logger.log('發送 toggleHighlighter 失敗，嘗試注入腳本:', error);
        }

        const result = await injectionService.injectHighlighter(activeTab.id);
        if (result?.initialized) {
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Highlighter initialization failed' });
        }
      } catch (error) {
        Logger.error('Error in startHighlight:', error);
        const safeMessage = sanitizeApiError(error, 'start_highlight');
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
      }
    },

    /**
     * 更新現有頁面的標註
     */
    updateHighlights: async (request, sender, sendResponse) => {
      try {
        const activeTab = await getActiveTab();

        await ensureNotionApiKey(storageService, notionService);

        const normalize = normalizeUrl || (url => url);
        const normUrl = normalize(activeTab.url || '');
        const savedData = await storageService.getSavedPageData(normUrl);

        if (!savedData || !savedData.notionPageId) {
          sendResponse({
            success: false,
            error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.PAGE_NOT_SAVED),
          });
          return;
        }

        const highlights = await injectionService.collectHighlights(activeTab.id);

        // 轉換標記為 Blocks
        const highlightBlocks = buildHighlightBlocks(highlights);

        // 調用 NotionService 更新標記
        const result = await notionService.updateHighlightsSection(
          savedData.notionPageId,
          highlightBlocks
        );

        if (result.success) {
          result.highlightsUpdated = true;
          result.highlightCount = highlights.length;
        }
        sendResponse(result);
      } catch (error) {
        Logger.error('Error in handleUpdateHighlights:', error);
        const safeMessage = sanitizeApiError(error, 'update_highlights');
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
      }
    },

    /**
     * 同步標註 (從請求 payload 中獲取)
     */
    syncHighlights: async (request, sender, sendResponse) => {
      try {
        const activeTab = await getActiveTab();

        await ensureNotionApiKey(storageService, notionService);

        const normalize = normalizeUrl || (url => url);
        const normUrl = normalize(activeTab.url || '');
        const savedData = await storageService.getSavedPageData(normUrl);

        if (!savedData || !savedData.notionPageId) {
          sendResponse({
            success: false,
            error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.PAGE_NOT_SAVED),
          });
          return;
        }

        const highlights = request.highlights || [];
        Logger.log(`📊 準備同步 ${highlights.length} 個標註到頁面: ${savedData.notionPageId}`);

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

        // 調用 NotionService 更新標記
        const result = await notionService.updateHighlightsSection(
          savedData.notionPageId,
          highlightBlocks
        );

        if (result.success) {
          Logger.log(`✅ 成功同步 ${highlights.length} 個標註`);
          result.highlightCount = highlights.length;
          result.message = `成功同步 ${highlights.length} 個標註`;
        } else {
          Logger.error('❌ 同步標註失敗:', result.error);
        }
        sendResponse(result);
      } catch (error) {
        Logger.error('❌ handleSyncHighlights 錯誤:', error);
        const safeMessage = sanitizeApiError(error, 'sync_highlights');
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
      }
    },
  };
}
