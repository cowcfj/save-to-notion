/**
 * Save Handlers
 *
 * 處理頁面保存、狀態檢查與相關導航操作。
 *
 * @module handlers/saveHandlers
 */

/* global chrome, Logger */

import { normalizeUrl } from '../../utils/urlUtils.js';
import {
  validateInternalRequest,
  validateContentScriptRequest,
  isValidNotionUrl,
  sanitizeApiError,
  sanitizeUrlForLogging,
} from '../../utils/securityUtils.js';
import { buildHighlightBlocks } from '../utils/BlockBuilder.js';
import { ErrorHandler } from '../../utils/ErrorHandler.js';
import { HANDLER_CONSTANTS } from '../../config/constants.js';
import { ERROR_MESSAGES } from '../../config/messages.js';
import { isRestrictedInjectionUrl } from '../services/InjectionService.js';

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
 * 獲取獲 Notion API Key
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
 * 處理內容提取結果
 *
 * @param {object} rawResult - 注入腳本返回的原始結果
 * @param {Array} highlights - 標註數據
 * @returns {object} 處理後的內容結果 { title, blocks, siteIcon }
 */
export function processContentResult(rawResult, highlights) {
  // 正規化所有欄位，確保不修改原始輸入
  const title = rawResult?.title || 'Untitled';
  const siteIcon = rawResult?.siteIcon ?? null;
  const blocks = Array.isArray(rawResult?.blocks) ? [...rawResult.blocks] : [];

  // 添加標註區塊
  if (highlights && highlights.length > 0) {
    const buildBlocks = buildHighlightBlocks || (() => []);
    const highlightBlocks = buildBlocks(highlights);
    blocks.push(...highlightBlocks);
  }

  return { title, blocks, siteIcon };
}

// ============================================================================
// 工廠函數
// ============================================================================

/**
 * 創建 Save Handlers
 *
 * @param {object} services - 服務實例集合
 * @returns {object} 處理函數映射
 */
export function createSaveHandlers(services) {
  const { notionService, storageService, injectionService, pageContentService } = services;

  /**
   * 清理頁面標記的輔助函數 (跨模組調用時可能需要，暫時保留在此，若 highlightHandlers 也需要則各自實現)
   * 注意：savePage 中會調用 clearPageHighlights
   *
   * @param {number} tabId - 標籤頁 ID
   */
  async function clearPageHighlights(tabId) {
    try {
      await injectionService.injectHighlighter(tabId);
      await injectionService.inject(tabId, () => {
        if (globalThis.clearPageHighlights) {
          globalThis.clearPageHighlights();
        }
      });
    } catch (error) {
      Logger.warn('清除頁面標註失敗', { action: 'clearPageHighlights', error: error.message });
    }
  }

  /**
   * 執行頁面創建（包含圖片錯誤重試邏輯）
   *
   * @param {object} params - 參數對象
   * @param {string} params.normUrl - 正規化的 URL
   * @param {string} params.dataSourceId - Notion 數據源 ID
   * @param {string} params.dataSourceType - 數據源類型
   * @param {object} params.contentResult - 內容提取結果
   * @returns {Promise<object>} 保存結果
   */
  async function performCreatePage(params) {
    const { normUrl, dataSourceId, dataSourceType, contentResult } = params;

    // 第一次嘗試
    const buildOptions = {
      title: contentResult.title,
      pageUrl: normUrl,
      dataSourceId,
      dataSourceType,
      blocks: contentResult.blocks,
      siteIcon: contentResult.siteIcon,
    };

    const { pageData, validBlocks } = notionService.buildPageData(buildOptions);

    let result = await notionService.createPage(pageData, {
      autoBatch: true,
      allBlocks: validBlocks,
      apiKey: params.apiKey,
    });

    // 失敗重試邏輯：如果是圖片驗證錯誤或標準化後的驗證錯誤
    if (
      !result.success &&
      result.error &&
      /image|media|validation|validation_error/i.test(result.error)
    ) {
      Logger.warn('收到 Notion 圖片驗證錯誤，準備重試', {
        action: 'performCreatePage',
        delay: HANDLER_CONSTANTS.IMAGE_RETRY_DELAY,
        reason: 'image_validation_error',
      });

      await new Promise(resolve => setTimeout(resolve, HANDLER_CONSTANTS.IMAGE_RETRY_DELAY));

      // 重建數據，排除圖片
      buildOptions.excludeImages = true;
      const rebuild = notionService.buildPageData(buildOptions);

      result = await notionService.createPage(rebuild.pageData, {
        autoBatch: true,
        allBlocks: rebuild.validBlocks,
        apiKey: params.apiKey,
      });
    }

    if (result.success) {
      // 保存狀態
      await storageService.setSavedPageData(normUrl, {
        notionPageId: result.pageId,
        notionUrl: result.url,
        title: contentResult.title,
        savedAt: Date.now(),
      });

      // 補充統計數據
      result.imageCount = contentResult.blocks.filter(block => block.type === 'image').length;
      result.blockCount = contentResult.blocks.length;
      result.created = true;
    }

    return result;
  }

  /**
   * 處理現有頁面的更新邏輯
   *
   * @param {object} params - 參數對象
   * @returns {Promise<void>}
   * @private
   */
  async function _handleExistingPageUpdate(params) {
    const { savedData, highlights, contentResult, normUrl, sendResponse } = params;
    const imageCount = contentResult.blocks.filter(block => block.type === 'image').length;

    if (highlights.length > 0) {
      const buildBlocks = buildHighlightBlocks || (() => []);
      const highlightBlocks = buildBlocks(highlights);
      const result = await notionService.updateHighlightsSection(
        savedData.notionPageId,
        highlightBlocks,
        { apiKey: params.apiKey }
      );

      if (result.success) {
        result.highlightCount = highlights.length;
        result.highlightsUpdated = true;
        await storageService.setSavedPageData(normUrl, {
          ...savedData,
          lastUpdated: new Date().toISOString(),
        });
        sendResponse(result);
      } else {
        const userMessage = ErrorHandler.formatUserMessage(result.error);
        const phaseInfo = result.details?.phase ? ` (在 ${result.details.phase} 階段)` : '';
        sendResponse({
          ...result,
          error: `${userMessage}${phaseInfo}`,
        });
      }
    } else {
      const result = await notionService.refreshPageContent(
        savedData.notionPageId,
        contentResult.blocks,
        { updateTitle: true, title: contentResult.title, apiKey: params.apiKey }
      );

      if (result.success) {
        result.imageCount = imageCount;
        result.blockCount = contentResult.blocks.length;
        result.updated = true;
        await storageService.setSavedPageData(normUrl, {
          ...savedData,
          lastUpdated: new Date().toISOString(),
        });
        sendResponse(result);
      } else {
        const userMessage = ErrorHandler.formatUserMessage(result.error);
        const phaseInfo = result.details?.phase ? ` (在 ${result.details.phase} 階段)` : '';
        sendResponse({
          ...result,
          error: `${userMessage}${phaseInfo}`,
        });
      }
    }
  }

  /**
   * 根據頁面狀態決定並執行保存操作
   *
   * @param {object} params - 參數對象
   */
  async function determineAndExecuteSaveAction(params) {
    const {
      savedData,
      normUrl,
      dataSourceId,
      dataSourceType,
      contentResult,
      activeTabId,
      sendResponse,
    } = params;

    // 已有保存記錄：檢查頁面是否仍存在
    if (savedData?.notionPageId) {
      const pageExists = await notionService.checkPageExists(savedData.notionPageId, {
        apiKey: params.apiKey,
      });

      if (pageExists === null) {
        Logger.warn('無法確認 Notion 頁面存在性', {
          action: 'checkPageExists',
          pageId: savedData.notionPageId?.slice(0, 4) ?? 'unknown',
          result: 'aborted',
        });
        sendResponse({
          success: false,
          error: ERROR_MESSAGES.USER_MESSAGES.CHECK_PAGE_EXISTENCE_FAILED,
        });
        return;
      }

      if (pageExists) {
        await _handleExistingPageUpdate(params);
      } else {
        // 頁面已刪除：清理狀態並重新創建新頁面
        Logger.log('Notion 頁面已被刪除，正在清理本地狀態並重新創建', {
          action: 'recreatePage',
          url: sanitizeUrlForLogging(normUrl),
        });
        await storageService.clearPageState(normUrl);
        await clearPageHighlights(activeTabId);

        const result = await performCreatePage({
          normUrl,
          dataSourceId,
          dataSourceType,
          contentResult,
          apiKey: params.apiKey,
        });

        if (result.success) {
          result.recreated = true;
          sendResponse(result);
        } else {
          const userMessage = ErrorHandler.formatUserMessage(result.error);
          sendResponse({ ...result, error: userMessage });
        }
      }
    } else {
      const result = await performCreatePage({
        normUrl,
        dataSourceId,
        dataSourceType,
        contentResult,
        apiKey: params.apiKey,
      });
      if (result.success) {
        sendResponse(result);
      } else {
        const userMessage = ErrorHandler.formatUserMessage(result.error);
        sendResponse({ ...result, error: userMessage });
      }
    }
  }

  return {
    /**
     * 保存頁面
     *
     * @param {object} request - 請求對象
     * @param {chrome.runtime.MessageSender} sender - 發送者信息
     * @param {Function} sendResponse - 回應函數
     */
    savePage: async (request, sender, sendResponse) => {
      try {
        // 安全性驗證：檢查請求來源
        // savePage 會執行腳本注入和內容提取，必須確保僅限內部調用
        const validationError = validateInternalRequest(sender);
        if (validationError) {
          Logger.warn('安全性阻擋', {
            action: 'savePage',
            reason: 'invalid_internal_request',
            error: validationError.error,
            senderId: sender?.id,
            origin: sender?.origin,
          });
          sendResponse(validationError);
          return;
        }

        const activeTab = await getActiveTab();

        // 檢查是否為受限頁面（chrome://、chrome-extension://、擴展商店等）
        if (isRestrictedInjectionUrl(activeTab.url)) {
          Logger.warn('受限頁面無法保存', {
            action: 'savePage',
            url: sanitizeUrlForLogging(activeTab.url),
            result: 'blocked',
            reason: 'restricted_url',
          });
          sendResponse({
            success: false,
            error: ERROR_MESSAGES.USER_MESSAGES.SAVE_NOT_SUPPORTED_RESTRICTED_PAGE,
          });
          return;
        }
        const config = await storageService.getConfig([
          'notionApiKey',
          'notionDataSourceId',
          'notionDatabaseId',
          'notionDataSourceType',
        ]);

        const dataSourceId = config.notionDataSourceId || config.notionDatabaseId;
        const dataSourceType = config.notionDataSourceType || 'data_source';

        if (!config.notionApiKey) {
          sendResponse({
            success: false,
            error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.MISSING_API_KEY),
          });
          return;
        }

        if (!dataSourceId) {
          sendResponse({
            success: false,
            error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.MISSING_DATA_SOURCE),
          });
          return;
        }

        const apiKey = config.notionApiKey;

        const normalize = normalizeUrl || (url => url);
        const normUrl = normalize(activeTab.url || '');
        const savedData = await storageService.getSavedPageData(normUrl);

        // 注入 highlighter 並收集標記
        await injectionService.injectHighlighter(activeTab.id);
        const highlights = await injectionService.collectHighlights(activeTab.id);

        Logger.log('收集到的標註數據', { action: 'collectHighlights', count: highlights.length });

        // 注入並執行內容提取
        let result = null;

        try {
          result = await pageContentService.extractContent(activeTab.id);
          Logger.log('內容提取成功', { action: 'extractContent' });
        } catch (error) {
          Logger.error('內容提取失敗', { action: 'extractContent', error: error.message });
        }

        if (!result?.title || !result?.blocks) {
          Logger.error('內容提取結果驗證失敗', {
            action: 'validateContent',
            hasResult: Boolean(result),
            hasTitle: Boolean(result?.title),
            hasBlocks: Array.isArray(result?.blocks),
            blocksCount: result?.blocks?.length ?? 0,
            url: sanitizeUrlForLogging(activeTab.url),
          });

          let error = ERROR_MESSAGES.USER_MESSAGES.CONTENT_EXTRACTION_FAILED;
          if (result) {
            error = result.title
              ? ERROR_MESSAGES.USER_MESSAGES.CONTENT_BLOCKS_MISSING
              : ERROR_MESSAGES.USER_MESSAGES.CONTENT_TITLE_MISSING;
          }

          sendResponse({ success: false, error });
          return;
        }

        // 處理內容結果並添加標註
        const contentResult = processContentResult(result, highlights);

        // 執行保存操作
        await determineAndExecuteSaveAction({
          savedData,
          normUrl,
          dataSourceId,
          dataSourceType,
          contentResult,
          highlights,
          apiKey,
          activeTabId: activeTab.id,
          sendResponse,
        });
      } catch (error) {
        Logger.error('保存頁面時發生未預期錯誤', { action: 'savePage', error: error.message });
        const safeMessage = sanitizeApiError(error, 'save_page');
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
      }
    },

    /**
     * 打開 Notion 頁面
     *
     * @param {object} request - 請求對象
     * @param {chrome.runtime.MessageSender} sender - 發送者信息
     * @param {Function} sendResponse - 回應函數
     */
    openNotionPage: async (request, sender, sendResponse) => {
      try {
        // 安全性驗證：檢查請求來源
        const validationError = validateInternalRequest(sender);
        if (validationError) {
          Logger.warn('安全性阻擋', {
            action: 'openNotionPage',
            reason: 'invalid_internal_request',
            error: validationError.error,
            senderId: sender?.id,
            origin: sender?.origin,
          });
          sendResponse(validationError);
          return;
        }

        const pageUrl = request.url;
        if (!pageUrl) {
          sendResponse({
            success: false,
            error: ERROR_MESSAGES.USER_MESSAGES.MISSING_URL,
          });
          return;
        }

        const normalize = normalizeUrl || (url => url);
        const normUrl = normalize(pageUrl);
        const savedData = await storageService.getSavedPageData(normUrl);

        if (!savedData?.notionPageId) {
          sendResponse({
            success: false,
            error: ERROR_MESSAGES.USER_MESSAGES.PAGE_NOT_SAVED_TO_NOTION,
          });
          return;
        }

        let notionUrl = savedData.notionUrl;
        if (!notionUrl && savedData.notionPageId) {
          notionUrl = `https://www.notion.so/${savedData.notionPageId.replaceAll('-', '')}`;
          Logger.log('為頁面生成 Notion URL', {
            action: 'generateNotionUrl',
            notionUrl: sanitizeUrlForLogging(notionUrl),
          });
        }

        if (!notionUrl) {
          sendResponse({ success: false, error: ERROR_MESSAGES.USER_MESSAGES.NO_NOTION_PAGE_URL });
          return;
        }

        // 安全性驗證：確保 URL 是有效的 Notion URL
        if (!isValidNotionUrl(notionUrl)) {
          Logger.error('非法 Notion URL 被阻擋', {
            action: 'openNotionPage',
            notionUrl: sanitizeUrlForLogging(notionUrl),
          });
          sendResponse({
            success: false,
            error: ERROR_MESSAGES.USER_MESSAGES.NOTION_DOMAIN_ONLY,
          });
          return;
        }

        chrome.tabs.create({ url: notionUrl }, tab => {
          if (chrome.runtime.lastError) {
            Logger.error('打開 Notion 頁面失敗', {
              action: 'openNotionPage',
              error: chrome.runtime.lastError.message,
            });
            const safeMessage = sanitizeApiError(chrome.runtime.lastError, 'open_page');
            sendResponse({
              success: false,
              error: ErrorHandler.formatUserMessage(safeMessage),
            });
          } else {
            Logger.log('成功在分頁中打開 Notion 頁面', {
              action: 'openNotionPage',
              notionUrl: sanitizeUrlForLogging(notionUrl),
            });
            sendResponse({ success: true, tabId: tab.id, notionUrl });
          }
        });
      } catch (error) {
        Logger.error('執行 openNotionPage 時出錯', {
          action: 'openNotionPage',
          error: error.message,
        });
        const safeMessage = sanitizeApiError(error, 'open_page');
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
      }
    },

    /**
     * 檢查頁面是否存在
     *
     * @param {object} request - 請求對象
     * @param {chrome.runtime.MessageSender} sender - 發送者信息
     * @param {Function} sendResponse - 回應函數
     */
    checkNotionPageExists: async (request, sender, sendResponse) => {
      try {
        // 安全性驗證：確保請求來自擴充功能內部 (Popup)
        const validationError = validateInternalRequest(sender);
        if (validationError) {
          sendResponse(validationError);
          return;
        }

        const { pageId } = request;
        if (!pageId) {
          sendResponse({
            success: false,
            error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.MISSING_PAGE_ID),
          });
          return;
        }

        const apiKey = await ensureNotionApiKey(storageService);

        const exists = await notionService.checkPageExists(pageId, { apiKey });
        sendResponse({ success: true, exists });
      } catch (error) {
        const safeMessage = sanitizeApiError(error, 'check_page_exists');
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
      }
    },

    /**
     * 檢查頁面保存狀態
     *
     * @param {object} request - 請求對象
     * @param {chrome.runtime.MessageSender} sender - 發送者信息
     * @param {Function} sendResponse - 回應函數
     * @returns {Promise<void>}
     */
    checkPageStatus: async (request, sender, sendResponse) => {
      try {
        // 安全性驗證：確保請求來自擴充功能內部 (Popup)
        const validationError = validateInternalRequest(sender);
        if (validationError) {
          sendResponse(validationError);
          return;
        }

        const activeTab = await getActiveTab();
        const normUrl = (normalizeUrl || (url => url))(activeTab.url || '');
        const savedData = await storageService.getSavedPageData(normUrl);

        if (!savedData?.notionPageId) {
          return sendResponse({ success: true, isSaved: false });
        }

        const TTL = HANDLER_CONSTANTS.PAGE_STATUS_CACHE_TTL;
        const now = Date.now();
        if (!request.forceRefresh && now - (savedData.lastVerifiedAt || 0) < TTL) {
          return sendResponse({
            success: true,
            isSaved: true,
            notionPageId: savedData.notionPageId,
            notionUrl: savedData.notionUrl,
            title: savedData.title,
          });
        }

        const config = await storageService.getConfig(['notionApiKey']);
        if (!config.notionApiKey) {
          return sendResponse({
            success: true,
            isSaved: true,
            notionPageId: savedData.notionPageId,
            notionUrl: savedData.notionUrl,
            title: savedData.title,
          });
        }

        const apiKey = config.notionApiKey;
        let exists = await notionService.checkPageExists(savedData.notionPageId, { apiKey });

        if (exists === null) {
          Logger.warn('首次檢查頁面存在性失敗，正在重試', {
            action: 'checkPageExists',
            pageId: savedData.notionPageId?.slice(0, 4) ?? 'unknown',
          });
          await new Promise(resolve => setTimeout(resolve, HANDLER_CONSTANTS.CHECK_DELAY));
          exists = await notionService.checkPageExists(savedData.notionPageId, { apiKey });
        }

        if (exists === false) {
          Logger.log('頁面已在 Notion 中刪除，正在清理狀態', {
            action: 'syncLocalState',
            pageId: savedData.notionPageId?.slice(0, 4) ?? 'unknown',
          });
          await storageService.clearPageState(normUrl);
          try {
            chrome.action.setBadgeText({ text: '', tabId: activeTab.id });
          } catch {
            /* ignore */
          }
          return sendResponse({ success: true, isSaved: false, wasDeleted: true });
        }

        if (exists === true) {
          savedData.lastVerifiedAt = now;
          await storageService.setSavedPageData(normUrl, savedData);
        }

        sendResponse({
          success: true,
          isSaved: true,
          notionPageId: savedData.notionPageId,
          notionUrl: savedData.notionUrl,
          title: savedData.title,
        });
      } catch (error) {
        Logger.error('檢查頁面狀態時出錯', { action: 'checkPageStatus', error: error.message });
        const safeMessage = sanitizeApiError(error, 'check_page_status');
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
      }
    },

    /**
     * 處理來自 Content Script 的日誌轉發
     * 用於將 Content Script 的日誌集中到 Background Console
     *
     * @param {object} request - 請求對象
     * @param {chrome.runtime.MessageSender} sender - 發送者信息
     * @param {Function} sendResponse - 回應函數
     */
    devLogSink: (request, sender, sendResponse) => {
      try {
        // 安全性驗證：確保請求來自我們自己的 content script
        const validationError = validateContentScriptRequest(sender);
        if (validationError) {
          sendResponse(validationError);
          return;
        }

        const level = request.level || 'log';
        const message = request.message || '';
        const args = Array.isArray(request.args) ? request.args : [];

        // 1. 輸出到日誌系統 (Logger 會處理緩衝與層級)
        const logMethod = Logger[level] || Logger.log;
        logMethod(`[ClientLog] ${message}`, ...args);

        // 2. 寫入 LogBuffer (保留原始時間戳與來源)
        // 解析 args 作為 context
        let context = {};
        if (args.length > 0) {
          if (typeof args[0] === 'object' && args[0] !== null) {
            context = { ...args[0] };
            if (args.length > 1) {
              context.details = args.slice(1);
            }
          } else {
            context = { details: args };
          }
        }

        // 顯式調用 addLogToBuffer
        Logger.addLogToBuffer({
          level,
          message: `[ClientLog] ${message}`,
          context,
          source: 'content_script', // 明確標記來源
          timestamp: request.timestamp, // 假設前端有傳，或者在這裡生成
        });

        sendResponse({ success: true });
      } catch (error) {
        // 日誌處理不應崩潰
        const safeMessage = sanitizeApiError(error, 'dev_log_sink');
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
      }
    },
  };
}
