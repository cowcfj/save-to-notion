/**
 * Save Handlers
 *
 * 處理頁面保存、狀態檢查與相關導航操作。
 *
 * @module handlers/saveHandlers
 */

/* global chrome, Logger */

// resolveStorageUrl 已由 tabService.resolveTabUrl() 內部處理，此處不再需要直接匯入
import {
  validateInternalRequest,
  validateContentScriptRequest,
  isValidNotionUrl,
  sanitizeApiError,
  sanitizeUrlForLogging,
} from '../../utils/securityUtils.js';
import { buildHighlightBlocks } from '../utils/BlockBuilder.js';
import { parseArgsToContext } from '../../utils/Logger.js';
import {
  mergeHighlightsWithStyle,
  HIGHLIGHT_STYLE_OPTIONS,
} from '../utils/highlightStyleMerger.js';
import { ErrorHandler } from '../../utils/ErrorHandler.js';
import { CONTENT_QUALITY } from '../../config/shared/content.js';
import { ERROR_MESSAGES } from '../../config/shared/messages.js';
import { RUNTIME_ACTIONS } from '../../config/shared/runtimeActions.js';
import { SAVE_STATUS_KINDS, createSaveStatusResponse } from '../../config/saveStatus.js';
import { isRestrictedInjectionUrl } from '../services/InjectionService.js';
import { resolveSaveStatus } from '../services/SaveStatusCoordinator.js';
import { getActiveNotionToken, ensureNotionApiKey } from '../../utils/notionAuth.js';
import { DATA_SOURCE_KEYS } from '../../config/shared/storage.js';
import { getActiveTab } from './handlerUtils.js';

const VALID_HIGHLIGHT_STYLE_KEYS = new Set(Object.keys(HIGHLIGHT_STYLE_OPTIONS));

// ============================================================================
// 內部輔助函數 (Local Helpers)
// ============================================================================

/**
 * 主動通知指定 tab 保存狀態已更新（混合式推播策略）
 * 使用保存時記錄的 activeTabId，避免儲存完成後重新查詢活動 tab 造成 race condition
 *
 * @param {number|undefined} activeTabId - 發起保存的 tab ID
 * @param {boolean} isSaved - 是否已保存
 */
function sendPageSaveHint(activeTabId, isSaved) {
  if (!activeTabId) {
    return;
  }
  if (!chrome.tabs?.sendMessage) {
    return;
  }
  chrome.tabs
    .sendMessage(activeTabId, { action: RUNTIME_ACTIONS.PAGE_SAVE_HINT, isSaved })
    .catch(() => {
      /* 忽略錯誤，由 storage.onChanged 兜底 */
    });
}

/**
 * 處理內容提取結果
 *
 * @param {object} rawResult - 注入腳本返回的原始結果
 * @param {Array} highlights - 標註數據
 * @param {string} [highlightContentStyle='COLOR_SYNC'] - Notion 同步樣式設定（'COLOR_SYNC' | 'COLOR_TEXT' | 'BOLD' | 'NONE'）
 * @returns {object} 處理後的內容結果 { title, blocks, siteIcon, coverImage }
 */
export function processContentResult(rawResult, highlights, highlightContentStyle = 'COLOR_SYNC') {
  // 正規化所有欄位，確保不修改原始輸入
  const title = rawResult?.title || CONTENT_QUALITY.DEFAULT_PAGE_TITLE;
  const siteIcon = rawResult?.siteIcon ?? null;
  const coverImage = rawResult?.coverImage ?? null; // 封面圖片 URL
  const blocks = Array.isArray(rawResult?.blocks) ? [...rawResult.blocks] : [];

  // 將標註樣式合併到原文 blocks（首次保存時生效）
  const mergedBlocks = mergeHighlightsWithStyle(blocks, highlights, highlightContentStyle);

  // 添加標註區塊
  if (highlights && highlights.length > 0) {
    const highlightBlocks = buildHighlightBlocks(highlights);
    mergedBlocks.push(...highlightBlocks);
  }

  return { title, blocks: mergedBlocks, siteIcon, coverImage, highlightContentStyle };
}

/**
 * 統一處理錯誤回應
 *
 * @param {object} result - 操作結果
 * @param {Function} sendResponse - 回應函數
 */
function sendErrorResponse(result, sendResponse) {
  const userMessage = ErrorHandler.formatUserMessage(result.error);
  const phaseInfo = result.details?.phase ? ` (在 ${result.details.phase} 階段)` : '';
  sendResponse({
    ...result,
    error: `${userMessage}${phaseInfo}`,
  });
}

function _validateCheckPageStatusSender(sender) {
  const isContentScript = Boolean(sender.tab);
  return isContentScript ? validateContentScriptRequest(sender) : validateInternalRequest(sender);
}

async function _resolveStatusTab(sender) {
  let activeTab = sender.tab;
  if (!activeTab?.url) {
    activeTab = await getActiveTab();
  }
  return activeTab;
}

function buildSaveSuccessStatus(savedData, extra = {}) {
  return createSaveStatusResponse({
    statusKind: SAVE_STATUS_KINDS.SAVED,
    stableUrl: extra.stableUrl,
    savedData,
    extra,
  });
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
  const {
    notionService,
    storageService,
    injectionService,
    pageContentService,
    tabService,
    migrationService, // Added MigrationService
  } = services;

  if (
    typeof tabService?.confirmRemotePageMissing !== 'function' ||
    typeof tabService?.resetRemotePageMissingState !== 'function'
  ) {
    throw new TypeError(
      'createSaveHandlers requires tabService.confirmRemotePageMissing and resetRemotePageMissingState functions'
    );
  }

  const NOTION_CONFIG_KEYS = ['notionApiKey', ...DATA_SOURCE_KEYS];

  /**
   * 連續不存在確認：false/false 才允許清理
   * 委託 TabService，確保背景自動同步與 Popup 查詢共用同一套狀態。
   *
   * @param {string|null|undefined} notionPageId
   * @param {boolean|null} exists
   * @returns {{ shouldDelete: boolean, deletionPending: boolean }}
   */
  function resolveDeletionConfirmation(notionPageId, exists) {
    if (exists === false) {
      return tabService.confirmRemotePageMissing(notionPageId);
    }

    return tabService.resetRemotePageMissingState(notionPageId);
  }

  async function clearNotionStateWithCanonicalPath(pageUrl, source, expectedPageId) {
    return await storageService.clearNotionStateWithRetry(pageUrl, { source, expectedPageId });
  }

  async function resolveDeletionCleanupUrl(activeTab, fallbackUrl) {
    const tabId = activeTab?.id;
    const tabUrl = activeTab?.url || fallbackUrl;

    if (!tabId || !tabUrl || typeof tabService.resolveTabUrl !== 'function') {
      return fallbackUrl;
    }

    try {
      const refreshed = await tabService.resolveTabUrl(tabId, tabUrl);
      return refreshed?.stableUrl || fallbackUrl;
    } catch (error) {
      Logger.warn('重新解析刪除清理 URL 失敗，回退至既有路徑', {
        action: 'checkPageStatus',
        operation: 'resolveDeletionCleanupUrl',
        url: sanitizeUrlForLogging(fallbackUrl),
        error,
      });
      return fallbackUrl;
    }
  }

  /**
   * 載入並驗證 Notion 必要設定
   *
   * @param {Function} sendResponse - 回應函數
   * @returns {Promise<object|null>} 配置對象或 null
   */
  async function _loadAndValidateNotionConfig(sendResponse) {
    const config = await storageService.getConfig(NOTION_CONFIG_KEYS);
    const { token: apiKey } = await getActiveNotionToken();

    if (!apiKey) {
      sendResponse({
        success: false,
        error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.MISSING_API_KEY),
      });
      return null;
    }

    const dataSourceId = config.notionDataSourceId || config.notionDatabaseId;
    if (!dataSourceId) {
      sendResponse({
        success: false,
        error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.MISSING_DATA_SOURCE),
      });
      return null;
    }

    // 正規化至二元語意：'page' | 'database'
    // 其餘所有值（含 'data_source'、無效值）一律回退為 'database'
    const rawDataSourceType = config.notionDataSourceType;
    const dataSourceType = rawDataSourceType === 'page' ? 'page' : 'database';
    return { config, dataSourceId, dataSourceType, apiKey };
  }

  /**
   * 驗證請求並獲取配置
   *
   * @param {object} sender - 請求發送者
   * @param {Function} sendResponse - 回應函數
   * @returns {Promise<object|null>} 配置對象或 null
   */
  async function validateRequestAndGetConfig(sender, sendResponse) {
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
      return null;
    }

    const activeTab = await getActiveTab();

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
      return null;
    }

    const configData = await _loadAndValidateNotionConfig(sendResponse);
    if (!configData) {
      return null;
    }

    return { ...configData, activeTab };
  }

  /**
   * 驗證 Toolbar (Content Script) 請求並獲取配置
   * 邏輯與 validateRequestAndGetConfig 相同，但使用 Content Script 安全性驗證，
   * 且 activeTab 從 sender.tab 獲取（而非查詢活動標籤頁）。
   *
   * @param {object} sender - 請求發送者
   * @param {Function} sendResponse - 回應函數
   * @returns {Promise<object|null>} 配置對象或 null
   */
  async function _validateToolbarRequestAndGetConfig(sender, sendResponse) {
    // Content Script 安全性驗證
    const validationError = validateContentScriptRequest(sender);
    if (validationError) {
      Logger.warn('安全性阻擋', {
        action: 'SAVE_PAGE_FROM_TOOLBAR',
        reason: 'invalid_content_script_request',
        error: validationError.error,
        senderId: sender?.id,
        tabId: sender?.tab?.id,
      });
      sendResponse(validationError);
      return null;
    }

    const activeTab = sender.tab;
    if (!activeTab) {
      sendResponse({
        success: false,
        error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB),
      });
      return null;
    }

    if (typeof activeTab.url !== 'string' || activeTab.url.trim().length === 0) {
      sendResponse({
        success: false,
        error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB),
      });
      return null;
    }

    if (isRestrictedInjectionUrl(activeTab.url)) {
      sendResponse({
        success: false,
        error: ERROR_MESSAGES.USER_MESSAGES.SAVE_NOT_SUPPORTED_RESTRICTED_PAGE,
      });
      return null;
    }

    const configData = await _loadAndValidateNotionConfig(sendResponse);
    if (!configData) {
      return null;
    }

    return { ...configData, activeTab };
  }

  /**
   * 解析頁面數據與回退查詢
   *
   * @param {object} activeTab - 活動標籤頁
   * @returns {Promise<object>} 解析結果
   */
  async function resolvePageData(activeTab) {
    const {
      stableUrl: normUrl,
      originalUrl,
      migrated,
      hasStableUrl,
    } = await tabService.resolveTabUrl(activeTab.id, activeTab.url || '', migrationService);

    let savedData = await storageService.getSavedPageData(normUrl);
    let resolvedUrl = normUrl;

    if (!savedData && !migrated && hasStableUrl) {
      const originalData = await storageService.getSavedPageData(originalUrl);
      if (originalData) {
        savedData = originalData;
        resolvedUrl = originalUrl;
      }
    }

    return { savedData, normUrl, originalUrl, resolvedUrl, migrated };
  }

  /**
   * 提取並驗證頁面內容
   *
   * @param {object} activeTab - 活動標籤頁
   * @param {Function} sendResponse - 回應函數
   * @returns {Promise<object|null>} 提取結果或 null
   */
  async function extractPageContent(activeTab, sendResponse) {
    await injectionService.injectHighlighter(activeTab.id);
    const highlights = await injectionService.collectHighlights(activeTab.id);

    Logger.log('收集到的標註數據', { action: 'collectHighlights', count: highlights.length });

    let result = null;

    try {
      result = await pageContentService.extractContent(activeTab.id);
      Logger.log('內容提取成功', { action: 'extractContent' });
    } catch (error) {
      Logger.error('內容提取發生異常', {
        action: 'extractContent',
        error: error.message,
        stack: error.stack,
      });
    }

    const hasSuccessfulExtraction =
      result?.extractionStatus === 'success' &&
      Boolean(result?.title) &&
      Array.isArray(result?.blocks);

    if (!hasSuccessfulExtraction) {
      Logger.error('內容提取結果驗證失敗', {
        action: 'validateContent',
        hasResult: Boolean(result),
        extractionStatus: result?.extractionStatus ?? 'missing',
        hasTitle: Boolean(result?.title),
        hasBlocks: Array.isArray(result?.blocks),
        blocksCount: result?.blocks?.length ?? 0,
        extractionError: result?.error ?? null,
        url: sanitizeUrlForLogging(activeTab.url),
      });

      let error = ERROR_MESSAGES.USER_MESSAGES.CONTENT_EXTRACTION_FAILED;
      if (result && result?.extractionStatus !== 'failed') {
        error = result.title
          ? ERROR_MESSAGES.USER_MESSAGES.CONTENT_BLOCKS_MISSING
          : ERROR_MESSAGES.USER_MESSAGES.CONTENT_TITLE_MISSING;
      }

      sendResponse({ success: false, error });
      return null;
    }

    return { result, highlights };
  }

  /**
   * 執行頁面創建（單次嘗試）
   *
   * @param {object} params - 參數對象
   * @param {string} params.normUrl - 正規化的 URL
   * @param {string} params.dataSourceId - Notion 數據源 ID
   * @param {string} params.dataSourceType - 數據源類型
   * @param {object} params.contentResult - 內容提取結果
   * @returns {Promise<object>} 保存結果
   */
  async function performCreatePage(params) {
    const {
      normUrl,
      originalUrl,
      dataSourceId,
      dataSourceType,
      contentResult,
      apiKey,
      activeTabId,
    } = params;

    // 第一次嘗試
    const buildOptions = {
      title: contentResult.title,
      pageUrl: normUrl,
      dataSourceId,
      dataSourceType,
      blocks: contentResult.blocks,
      siteIcon: contentResult.siteIcon,
      coverImage: contentResult.coverImage, // 封面圖片 URL
    };

    const { pageData } = notionService.buildPageData(buildOptions);

    const result = await notionService.createPage(pageData, {
      autoBatch: true,
      allBlocks: contentResult.blocks,
      apiKey,
    });

    if (result.success) {
      // 保存狀態
      await storageService.setSavedPageData(normUrl, {
        notionPageId: result.pageId,
        notionUrl: result.url,
        title: contentResult.title,
        savedAt: Date.now(),
        lastVerifiedAt: Date.now(),
      });

      // 建立 URL alias 映射，讓後續在 preloader PING 失敗時
      // 也能透過 originalUrl 找到以 stableUrl（normUrl）存儲的 savedData
      await storageService.setUrlAlias(originalUrl, normUrl).catch(error => {
        Logger.warn('設定 URL alias 失敗（不影響主流程）', {
          action: 'setUrlAlias',
          error: error.message,
        });
      });

      // 清除 originalUrl 下可能殘留的舊 savedPageData（含已刪除的 pageId）
      // 防止 autoSyncLocalState 在 fallback 查詢時找到舊條目並觸發破壞性清理
      if (originalUrl && originalUrl !== normUrl) {
        const staleData = await storageService.getSavedPageData(originalUrl);
        if (staleData && staleData.notionPageId !== result.pageId) {
          await storageService.removeSavedPageData(originalUrl).catch(error => {
            Logger.warn('清除 originalUrl 舊 savedData 失敗（不影響主流程）', {
              action: 'cleanStaleOriginalUrl',
              error: error.message,
            });
          });
        }
      }

      // 補充統計數據
      result.imageCount = contentResult.blocks.filter(block => block.type === 'image').length;
      result.blockCount = contentResult.blocks.length;
      result.created = true;
      result.title = contentResult.title;
      Object.assign(
        result,
        buildSaveSuccessStatus(
          {
            notionPageId: result.pageId,
            notionUrl: result.url,
            title: contentResult.title,
          },
          {
            url: result.url,
            pageId: result.pageId,
            notionPageId: result.pageId,
            stableUrl: normUrl,
          }
        )
      );

      // [New] 混合式推播 (Hybrid Push) 策略：主動通知 Toolbar 刷新 UI
      sendPageSaveHint(activeTabId, true);
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
    const { savedData, highlights, contentResult, normUrl, sendResponse, apiKey, activeTabId } =
      params;
    const imageCount = contentResult.blocks.filter(block => block.type === 'image').length;

    if (highlights.length > 0) {
      const highlightBlocks = buildHighlightBlocks(highlights);
      const result = await notionService.updateHighlightsSection(
        savedData.notionPageId,
        highlightBlocks,
        { apiKey }
      );

      if (result.success) {
        result.highlightCount = highlights.length;
        result.highlightsUpdated = true;
        result.title = savedData.title;
        await storageService.setSavedPageData(normUrl, {
          ...savedData,
          lastUpdated: Date.now(),
        });
        Object.assign(
          result,
          buildSaveSuccessStatus(savedData, {
            url: savedData.notionUrl,
            pageId: savedData.notionPageId,
            notionPageId: savedData.notionPageId,
            stableUrl: normUrl,
          })
        );

        // 混合式推播
        sendPageSaveHint(activeTabId, true);

        sendResponse(result);
      } else {
        sendErrorResponse(result, sendResponse);
      }
    } else {
      const result = await notionService.refreshPageContent(
        savedData.notionPageId,
        contentResult.blocks,
        { updateTitle: true, title: contentResult.title, apiKey }
      );

      if (result.success) {
        result.imageCount = imageCount;
        result.blockCount = contentResult.blocks.length;
        result.updated = true;
        result.title = contentResult.title;
        await storageService.setSavedPageData(normUrl, {
          ...savedData,
          lastUpdated: Date.now(),
        });
        Object.assign(
          result,
          buildSaveSuccessStatus(
            {
              ...savedData,
              title: contentResult.title,
            },
            {
              url: savedData.notionUrl,
              pageId: savedData.notionPageId,
              notionPageId: savedData.notionPageId,
              stableUrl: normUrl,
            }
          )
        );

        // 混合式推播
        sendPageSaveHint(activeTabId, true);

        sendResponse(result);
      } else {
        sendErrorResponse(result, sendResponse);
      }
    }
  }

  /**
   * 處理頁面重新創建邏輯
   *
   * @param {object} params - 參數對象
   * @returns {Promise<object>}
   * @private
   */
  async function _handlePageRecreation(params) {
    const { normUrl, resolvedUrl } = params;
    Logger.log('Notion 頁面已被刪除，正在清理本地狀態並重新創建', {
      action: 'recreatePage',
      url: sanitizeUrlForLogging(normUrl),
    });

    // 只清理頁面 metadata（notionPageId 等），保留本地標註
    // Highlight-First：標註獨立於 Notion 頁面生命週期
    const clearResult = await clearNotionStateWithCanonicalPath(
      resolvedUrl,
      'saveHandlers._handlePageRecreation',
      params.savedData.notionPageId
    );
    if (clearResult.skipped) {
      Logger.warn('重建前清理略過：本地 notion 綁定已變更，取消本次重建', {
        action: 'recreatePage',
        operation: 'clearNotionStateWithCanonicalPath',
        url: sanitizeUrlForLogging(normUrl),
        reason: clearResult.reason,
        result: 'cleanup_skipped',
      });
      return {
        success: false,
        error: ERROR_MESSAGES.USER_MESSAGES.CHECK_PAGE_EXISTENCE_FAILED,
      };
    }
    if (!clearResult.cleared) {
      Logger.error('重建頁面前清除本地 Notion 狀態失敗，改以內部自癒處理', {
        action: 'recreatePage',
        operation: 'clearNotionStateWithCanonicalPath',
        url: sanitizeUrlForLogging(normUrl),
        attempts: clearResult.attempts,
        error: clearResult.error,
      });
      // Re-arm: 清除失敗，恢復 pending token 供下次重試
      tabService.confirmRemotePageMissing(params.savedData.notionPageId);
    }

    return await performCreatePage(params);
  }

  /**
   * 處理新頁面創建邏輯
   *
   * @param {object} params - 參數對象
   * @returns {Promise<void>}
   * @private
   */
  async function _handleNewPageCreation(params) {
    const { sendResponse } = params;
    const result = await performCreatePage(params);

    if (result.success) {
      sendResponse(result);
    } else {
      sendErrorResponse(result, sendResponse);
    }
  }

  /**
   * 根據頁面狀態決定並執行保存操作
   *
   * @param {object} params - 參數對象
   */
  async function determineAndExecuteSaveAction(params) {
    // 注意：params 還包含 highlights 和 apiKey，透過 _handleExistingPageUpdate(params) 傳遞
    const { savedData, apiKey, sendResponse } = params;

    // 1. 新頁面路徑
    if (!savedData?.notionPageId) {
      await _handleNewPageCreation(params);
      return;
    }

    // 2. 已有保存記錄：檢查頁面是否仍存在
    const pageExists = await notionService.checkPageExists(savedData.notionPageId, { apiKey });

    if (pageExists === null) {
      resolveDeletionConfirmation(savedData.notionPageId, null);
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

    const deletionCheck = resolveDeletionConfirmation(savedData.notionPageId, pageExists);

    if (pageExists) {
      await _handleExistingPageUpdate(params);
    } else if (deletionCheck.shouldDelete) {
      // 頁面已刪除：清理狀態並重新創建新頁面
      const result = await _handlePageRecreation(params);

      if (result.success) {
        result.recreated = true;
        sendResponse(result);
      } else {
        sendErrorResponse(result, sendResponse);
      }
    } else {
      Logger.warn('首次檢測頁面不存在，暫不清理本地狀態', {
        action: 'checkPageExists',
        pageId: savedData.notionPageId?.slice(0, 4) ?? 'unknown',
      });
      sendResponse({
        success: false,
        deletionPending: true,
        error: ERROR_MESSAGES.USER_MESSAGES.CHECK_PAGE_EXISTENCE_FAILED,
      });
    }
  }

  async function _loadStatusContext(activeTab) {
    return resolvePageData(activeTab);
  }

  /**
   * 執行完整的頁面保存流程（兩個保存入口共用）
   *
   * 封裝了從 URL 解析到最終保存的完整後段邏輯：
   * resolvePageData → extractPageContent → processContentResult → determineAndExecuteSaveAction
   *
   * @param {object} activeTab - 活動標籤頁
   * @param {object} configData - 驗證階段返回的配置數據 { config, dataSourceId, dataSourceType }
   * @param {Function} sendResponse - 回應函數
   * @returns {Promise<void>}
   */
  async function _runSaveFlow(activeTab, configData, sendResponse) {
    const { dataSourceId, dataSourceType, apiKey } = configData;

    const { savedData, normUrl, originalUrl, resolvedUrl } = await resolvePageData(activeTab);

    const extractionData = await extractPageContent(activeTab, sendResponse);
    if (!extractionData) {
      return;
    }
    const { result, highlights } = extractionData;

    // 讀取用戶的 Notion 同步樣式設定（預設為 COLOR_SYNC）
    let highlightContentStyle = 'COLOR_SYNC';
    try {
      const syncConfig = await chrome.storage.sync.get({ highlightContentStyle: 'COLOR_SYNC' });
      const storedStyle = syncConfig?.highlightContentStyle;
      if (typeof storedStyle === 'string' && VALID_HIGHLIGHT_STYLE_KEYS.has(storedStyle)) {
        highlightContentStyle = storedStyle;
      }
    } catch (error) {
      Logger.warn('讀取同步樣式失敗，使用預設值', {
        action: 'getHighlightContentStyle',
        error: error?.message,
      });
    }
    const contentResult = processContentResult(result, highlights, highlightContentStyle);

    await determineAndExecuteSaveAction({
      savedData,
      normUrl,
      originalUrl,
      resolvedUrl,
      dataSourceId,
      dataSourceType,
      contentResult,
      highlights,
      apiKey,
      activeTabId: activeTab.id,
      sendResponse,
    });
  }

  return {
    /**
     * 保存頁面
     *
     * @param {object} request - 請求對象
     * @param {chrome.runtime.MessageSender} sender - 發送者信息
     * @param {Function} sendResponse - 回應函數
     */
    [RUNTIME_ACTIONS.SAVE_PAGE]: async (request, sender, sendResponse) => {
      try {
        const configData = await validateRequestAndGetConfig(sender, sendResponse);
        if (!configData) {
          return;
        }

        await _runSaveFlow(configData.activeTab, configData, sendResponse);
      } catch (error) {
        Logger.error('保存頁面時發生未預期錯誤', { action: 'savePage', error: error.message });
        const safeMessage = sanitizeApiError(error, 'save_page_unknown');
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
      }
    },

    /**
     * 從 Toolbar (Content Script) 保存頁面
     * 與 savePage 邏輯完全一致，但使用 Content Script 安全性驗證
     *
     * @param {object} request - 請求對象
     * @param {chrome.runtime.MessageSender} sender - 發送者信息
     * @param {Function} sendResponse - 回應函數
     */
    [RUNTIME_ACTIONS.SAVE_PAGE_FROM_TOOLBAR]: async (request, sender, sendResponse) => {
      try {
        const configData = await _validateToolbarRequestAndGetConfig(sender, sendResponse);
        if (!configData) {
          return;
        }

        // 複用完整保存邏輯（穩定 URL、遷移、alias 等）
        await _runSaveFlow(configData.activeTab, configData, sendResponse);
      } catch (error) {
        Logger.error('從 Toolbar 保存頁面時發生錯誤', {
          action: 'SAVE_PAGE_FROM_TOOLBAR',
          error: error.message,
        });
        const safeMessage = sanitizeApiError(error, 'save_page_toolbar');
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
    [RUNTIME_ACTIONS.OPEN_NOTION_PAGE]: async (request, sender, sendResponse) => {
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

        // 使用 tabService.resolveTabUrl 取得完整的 Phase 1+2 穩定 URL
        // 這樣即使頁面以 Next.js 路由或 shortlink 儲存，也能正確查找
        const activeTab = await getActiveTab();
        const { stableUrl, originalUrl } = await tabService.resolveTabUrl(activeTab.id, pageUrl);

        let savedData = await storageService.getSavedPageData(stableUrl);

        // 回退查詢：如果穩定 URL 查不到，嘗試原始 URL
        if (!savedData?.notionPageId && originalUrl !== stableUrl) {
          savedData = await storageService.getSavedPageData(originalUrl);
        }

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

        const tab = await chrome.tabs.create({ url: notionUrl });
        Logger.log('成功在分頁中打開 Notion 頁面', {
          action: 'openNotionPage',
          notionUrl: sanitizeUrlForLogging(notionUrl),
        });
        sendResponse({ success: true, tabId: tab.id, notionUrl });
      } catch (error) {
        Logger.error('打開 Notion 頁面失敗', {
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
    [RUNTIME_ACTIONS.CHECK_NOTION_PAGE_EXISTS]: async (request, sender, sendResponse) => {
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

        const apiKey = await ensureNotionApiKey();

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
    [RUNTIME_ACTIONS.CHECK_PAGE_STATUS]: async (request, sender, sendResponse) => {
      try {
        const validationError = _validateCheckPageStatusSender(sender);
        if (validationError) {
          sendResponse(validationError);
          return;
        }

        const activeTab = await _resolveStatusTab(sender);

        // Phase 2: 統一 URL 解析 + 自動遷移
        // 使用 resolvePageData 复用逻辑，减少 cognitive complexity
        const {
          normUrl,
          savedData,
          migrated: migratedFromOldKey,
          resolvedUrl,
        } = await _loadStatusContext(activeTab);

        // Debug Log for forceRefresh
        if (request.forceRefresh) {
          Logger.log('強制刷新頁面狀態', {
            action: 'checkPageStatus',
            url: sanitizeUrlForLogging(normUrl),
            migrated: migratedFromOldKey,
          });
        }

        const statusResult = await resolveSaveStatus(
          {
            savedData,
            normUrl,
            resolvedUrl,
            migratedFromOldKey,
            forceRefresh: request.forceRefresh,
          },
          {
            notionService,
            storageService,
            tabService,
            getActiveToken: getActiveNotionToken,
            resolveCleanupUrl: async () => resolveDeletionCleanupUrl(activeTab, resolvedUrl),
            logger: Logger,
          }
        );

        if (statusResult.statusKind === SAVE_STATUS_KINDS.DELETED_REMOTE) {
          try {
            chrome.action.setBadgeText({ text: '', tabId: activeTab.id });
          } catch {
            /* ignore */
          }
        }

        sendResponse(statusResult);
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

        // 驗證並標準化日誌層級
        const allowedLevels = ['log', 'info', 'warn', 'error', 'debug'];
        let level = request.level;

        if (!allowedLevels.includes(level) || typeof Logger[level] !== 'function') {
          level = 'log';
        }

        const message = request.message || '';
        const args = Array.isArray(request.args) ? request.args : [];

        // 1. 輸出到日誌系統 (Logger 會處理緩衝與層級)
        const logMethod = Logger[level];
        logMethod(`[ClientLog] ${message}`, ...args);

        // 2. 寫入 LogBuffer (保留原始時間戳與來源)
        // 使用統一的 parseArgsToContext 解析 args，避免邏輯重複
        const context = parseArgsToContext(args);

        // 顯式調用 addLogToBuffer
        Logger.addLogToBuffer({
          level,
          message: `[ClientLog] ${message}`,
          context,
          source: 'content_script', // 明確標記來源
        });

        sendResponse({ success: true });
      } catch (error) {
        // 日誌處理不應崩潰
        const safeMessage = sanitizeApiError(error, 'dev_log_sink');
        console.error('❌ [錯誤] [ClientLog] dev_log_sink:', safeMessage);
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
      }
    },
  };
}
