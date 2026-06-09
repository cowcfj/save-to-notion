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
} from '../../utils/securityUtils.js';
import { sanitizeApiError } from '../../utils/ApiErrorSanitizer.js';
import { buildHighlightBlocks } from '../utils/BlockBuilder.js';
import { isRestrictedInjectionUrl } from '../services/InjectionService.js';
import { ErrorHandler } from '../../utils/ErrorHandler.js';
import { HANDLER_CONSTANTS } from '../../config/shared/core.js';
import { ERROR_MESSAGES } from '../../config/messages/errorMessages.js';
import { BACKGROUND_MESSAGES } from '../../config/messages/backgroundMessages.js';
import { RUNTIME_ACTIONS } from '../../config/shared/runtimeActions.js';
import { CONTENT_BRIDGE_ACTIONS } from '../../config/runtimeActions/contentBridgeActions.js';
import { sanitizeUrlForLogging } from '../../utils/LogSanitizer.js';
import { ensureNotionApiKey } from '../../utils/notionAuth.js';
import { getActiveTab } from './handlerUtils.js';
import {
  buildContentScriptGuardMeta,
  buildInternalGuardMeta,
  buildSimpleGuardMeta,
  sendGuardFailure,
} from './handlerGuard.js';
import { sendToastToTab, classifyErrorForToast } from './toastUtils.js';

// ============================================================================
// 內部輔助函數 (Local Helpers)
// ============================================================================

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
        chrome.tabs.sendMessage(tabId, { action: RUNTIME_ACTIONS.PING }, result => {
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

/**
 * 判斷頁面資料是否包含有效的 notionPageId
 *
 * @param {object} pageData
 * @returns {boolean}
 */
function hasSavedPage(pageData) {
  return pageData?.notionPageId;
}

/**
 * 判斷是否應回退查詢原始 URL
 *
 * @param {boolean} migrated - URL 是否已成功遷移
 * @param {string} normUrl - 正規化 URL
 * @param {string} originalUrl - 原始 URL
 * @returns {boolean}
 */
function shouldFallbackToOriginalUrl(migrated, normUrl, originalUrl) {
  return !migrated && normUrl !== originalUrl;
}

/**
 * 查詢 URL 對應的已存頁面資料
 *
 * @param {string} url
 * @param {object} storageService
 * @returns {Promise<object|null>}
 */
async function queryPageDataByUrl(url, storageService) {
  const pageData = await storageService.getSavedPageData(url);
  return hasSavedPage(pageData) ? pageData : null;
}

/**
 * 嘗試從指定 URL 查詢頁面並回傳成功結果
 *
 * @param {string} url
 * @param {object} storageService
 * @returns {Promise<object|null>} 成功時回傳 {found: true, savedData, resolvedUrl}，失敗時 null
 */
async function tryResolveFromUrl(url, storageService) {
  const savedData = await queryPageDataByUrl(url, storageService);
  if (savedData) {
    return { found: true, savedData, resolvedUrl: url };
  }
  return null;
}

/**
 * 以雙查安全網策略解析頁面：優先 stable URL，失敗時回退 original URL
 *
 * @param {string} normUrl - 正規化 URL
 * @param {string} originalUrl - 原始 URL
 * @param {boolean} migrated - URL 是否已成功遷移
 * @param {object} storageService
 * @returns {Promise<object|null>}
 */
async function resolveWithFallback(normUrl, originalUrl, migrated, storageService) {
  const stableResult = await tryResolveFromUrl(normUrl, storageService);
  if (stableResult) {
    return stableResult;
  }
  if (shouldFallbackToOriginalUrl(migrated, normUrl, originalUrl)) {
    return await tryResolveFromUrl(originalUrl, storageService);
  }
  return null;
}

/**
 * 定位待更新標註的已存頁面
 *
 * 統一解析 tab URL（含自動遷移），並以「stable URL → 原始 URL」雙查安全網
 * 找出對應的 Notion 頁面綁定。遷移失敗且 stable/原始 URL 分歧時才回退查詢。
 *
 * @param {object} params
 * @param {chrome.tabs.Tab} params.activeTab - 當前標籤頁
 * @param {object} params.tabService
 * @param {object} params.storageService
 * @param {object} params.migrationService
 * @returns {Promise<{found: boolean, savedData?: object, resolvedUrl?: string}>}
 */
async function resolveSavedPageForHighlightUpdate({
  activeTab,
  tabService,
  storageService,
  migrationService,
}) {
  // Phase 2: 統一 URL 解析 + 自動遷移
  const {
    stableUrl: normUrl,
    originalUrl,
    migrated,
  } = await tabService.resolveTabUrl(activeTab.id, activeTab.url || '', migrationService);

  const result = await resolveWithFallback(normUrl, originalUrl, migrated, storageService);
  return result || { found: false };
}

/**
 * 判斷是否應核對遠端頁面刪除狀態
 *
 * @param {object} result - notionService 回傳結果
 * @returns {boolean}
 */
function shouldReconcilePageDeletion(result) {
  return (
    !result.success &&
    result.error === 'OBJECT_NOT_FOUND' &&
    result.details?.phase === 'fetch_blocks'
  );
}

/**
 * 建構待確認刪除的 response
 *
 * @param {object} result - 原始 result 物件
 * @returns {object}
 */
function buildPendingDeletionResponse(result) {
  return {
    ...result,
    errorCode: 'PAGE_DELETION_PENDING',
    error: BACKGROUND_MESSAGES.POPUP.DELETION_PENDING,
  };
}

/**
 * 建構已確認刪除的 response
 *
 * @param {object} result - 原始 result 物件
 * @returns {object}
 */
function buildConfirmedDeletionResponse(result) {
  return {
    ...result,
    errorCode: 'PAGE_DELETED',
    error: BACKGROUND_MESSAGES.POPUP.DELETED_PAGE,
  };
}

/**
 * 處理已確認的遠端頁面刪除
 *
 * @param {object} params
 * @param {object} params.result - 原始 result 物件
 * @param {string} params.pageId - Notion pageId
 * @param {string} params.resolvedUrl - 已解析的頁面 URL
 * @param {string} params.shortPageId - pageId 短碼（前 4 個字符）
 * @param {object} params.tabService
 * @param {object} params.storageService
 * @returns {Promise<object>}
 */
async function handleConfirmedDeletion({
  result,
  pageId,
  resolvedUrl,
  shortPageId,
  tabService,
  storageService,
}) {
  Logger.warn('同步標註時確認遠端頁面已刪除，清除本地 notion 綁定', {
    action: 'performHighlightUpdate',
    url: sanitizeUrlForLogging(resolvedUrl),
    pageId: shortPageId,
    result: 'confirmed_deleted',
  });

  const clearResult = await storageService.clearNotionStateWithRetry(resolvedUrl, {
    source: 'highlightHandlers.performHighlightUpdate',
    expectedPageId: pageId,
  });

  if (clearResult.skipped) {
    Logger.warn('清除本地 notion 綁定時偵測到 pageId 已變更，取消 PAGE_DELETED 狀態切換', {
      action: 'performHighlightUpdate',
      url: sanitizeUrlForLogging(resolvedUrl),
      pageId: shortPageId,
      reason: clearResult.reason,
      result: 'cleanup_skipped',
    });

    return {
      ...result,
      error: ERROR_MESSAGES.USER_MESSAGES.CHECK_PAGE_EXISTENCE_FAILED,
    };
  }

  if (!clearResult.cleared) {
    Logger.error('清除本地 Notion 狀態失敗', {
      action: 'performHighlightUpdate',
      url: sanitizeUrlForLogging(resolvedUrl),
      attempts: clearResult.attempts,
      error: clearResult.error,
      result: 'cleanup_failed',
    });

    // Re-arm: 清除失敗，恢復 pending token 供下次 sync 立即重試清除
    tabService.confirmRemotePageMissing(pageId);
  }

  return buildConfirmedDeletionResponse(result);
}

/**
 * 核對 Notion 更新失敗是否代表遠端頁面已被刪除，並據此清理本地綁定
 *
 * 僅處理「fetch_blocks 階段的 OBJECT_NOT_FOUND」失敗，其他情況回傳 null 交由
 * 呼叫端依正常流程繼續。採兩段式確認：首次僅標記 pending，再次才清除本地綁定；
 * 清除失敗時 re-arm pending token 供下次 sync 立即重試。
 *
 * @param {object} params
 * @param {object} params.result - notionService.updateHighlightsSection 回傳結果
 * @param {string} params.pageId - 本地綁定的 Notion pageId
 * @param {string} params.resolvedUrl - 已解析的頁面 URL
 * @param {object} params.tabService
 * @param {object} params.storageService
 * @returns {Promise<object|null>} 需直接回傳給用戶的 response，或 null 表示非刪除情境
 */
async function reconcileRemotePageMissing({
  result,
  pageId,
  resolvedUrl,
  tabService,
  storageService,
}) {
  if (!shouldReconcilePageDeletion(result)) {
    return null;
  }

  const shortPageId = pageId.slice(0, 4);
  const deletionCheck = tabService.confirmRemotePageMissing(pageId);

  if (!deletionCheck.shouldDelete) {
    Logger.warn('同步標註時首次發現遠端頁面疑似已刪除，暫不清除本地 notion 綁定', {
      action: 'performHighlightUpdate',
      url: sanitizeUrlForLogging(resolvedUrl),
      pageId: shortPageId,
      result: 'pending',
    });

    return buildPendingDeletionResponse(result);
  }

  return await handleConfirmedDeletion({
    result,
    pageId,
    resolvedUrl,
    shortPageId,
    tabService,
    storageService,
  });
}

/**
 * 執行標註更新的核心邏輯
 *
 * @param {object} services - 服務實例集合
 * @param {chrome.tabs.Tab} activeTab - 當前標籤頁
 * @param {Array} highlights - 標註數據
 * @returns {Promise<object>} 更新結果
 */
async function performHighlightUpdate(services, activeTab, highlights) {
  const { storageService, notionService, tabService, migrationService } = services;

  // 1. 確保有 API Key
  const apiKey = await ensureNotionApiKey();

  // 2. 定位已存頁面（URL 解析 + 雙查安全網）
  const located = await resolveSavedPageForHighlightUpdate({
    activeTab,
    tabService,
    storageService,
    migrationService,
  });
  if (!located.found) {
    return {
      success: false,
      errorCode: 'PAGE_NOT_SAVED',
      error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.PAGE_NOT_SAVED),
    };
  }
  const { savedData, resolvedUrl } = located;

  // 3. 轉換標記為 Blocks 並調用 NotionService 更新
  const highlightBlocks = buildHighlightBlocks(highlights);
  const result = await notionService.updateHighlightsSection(
    savedData.notionPageId,
    highlightBlocks,
    {
      apiKey,
    }
  );

  // 4. 核對遠端頁面是否已刪除（僅 fetch_blocks 階段的 OBJECT_NOT_FOUND）
  const deletionResponse = await reconcileRemotePageMissing({
    result,
    pageId: savedData.notionPageId,
    resolvedUrl,
    tabService,
    storageService,
  });
  if (deletionResponse) {
    return deletionResponse;
  }

  tabService.resetRemotePageMissingState(savedData.notionPageId);

  // 格式化失敗訊息為用戶友善格式（與 saveHandlers.sendErrorResponse 模式一致）
  // 建立新物件返回，避免直接修改 notionService 回傳的 result（防止副作用）
  if (!result.success && result.error) {
    return { ...result, error: ErrorHandler.formatUserMessage(result.error) };
  }

  return result;
}

async function sendActionMessageToTab(tabId, action, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { action, ...payload }, result => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

function normalizeContentResponse(response) {
  return response && typeof response === 'object'
    ? response
    : { success: false, error: 'no payload from content' };
}

function isNoActiveTabError(error) {
  return error?.message === ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB;
}

function sendNoActiveTabResponse(sendResponse) {
  sendResponse({
    success: false,
    error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB),
    errorCode: ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB,
  });
}

async function resolveActiveTabContext() {
  try {
    return { ok: true, activeTab: await getActiveTab() };
  } catch (error) {
    if (isNoActiveTabError(error)) {
      return { ok: false, kind: 'no_tab' };
    }
    throw error;
  }
}

async function ensureBundleInjectedAndReady(injectionService, tabId, action) {
  try {
    await injectionService.ensureBundleInjected(tabId);
  } catch (injectionError) {
    Logger.error('Bundle 注入失敗', {
      action,
      result: 'failed',
      error: injectionError,
    });
    return { ok: false, reason: 'inject_failed', error: injectionError };
  }

  const bundleReady = await ensureBundleReady(tabId);
  if (!bundleReady) {
    await cleanupBundleAfterReadyTimeout(injectionService, tabId, action);
    return { ok: false, reason: 'timeout' };
  }

  return { ok: true };
}

function pickBundleCleanupMethod(injectionService) {
  if (typeof injectionService?.removeBundle === 'function') {
    return 'removeBundle';
  }
  if (typeof injectionService?.cleanupInjectedBundle === 'function') {
    return 'cleanupInjectedBundle';
  }
  return null;
}

async function cleanupBundleAfterReadyTimeout(injectionService, tabId, action) {
  const cleanupMethod = pickBundleCleanupMethod(injectionService);

  if (!cleanupMethod) {
    Logger.warn('Bundle 初始化超時且無可用 cleanup API，可能留下半初始化 bundle', {
      action,
      result: 'skipped',
      reason: 'cleanup_api_missing',
      tabId,
      state: 'half_initialized_bundle',
    });
    return;
  }

  try {
    await injectionService[cleanupMethod](tabId);
  } catch (cleanupError) {
    Logger.error('Bundle 初始化超時後清理失敗', {
      action,
      result: 'failed',
      tabId,
      cleanupMethod,
      error: cleanupError,
    });
  }
}

function acceptContentScriptInjectionContext(sender, action, { logRestricted = false } = {}) {
  const validationError = validateContentScriptRequest(sender);
  if (validationError) {
    return {
      ok: false,
      kind: 'validation',
      validationError,
      guardMeta: buildContentScriptGuardMeta({ action, sender, validationError }),
    };
  }
  if (!sender.tab?.id) {
    Logger.warn('缺少標籤頁上下文', { action, result: 'failed', reason: 'no_tab' });
    return { ok: false, kind: 'no_tab' };
  }
  const { id: tabId, url: tabUrl } = sender.tab;
  if (tabUrl && isRestrictedInjectionUrl(tabUrl)) {
    if (logRestricted) {
      Logger.warn('受限頁面無法使用標註', {
        action,
        url: sanitizeUrlForLogging(tabUrl),
        result: 'blocked',
        reason: 'restricted_url',
      });
    }
    return { ok: false, kind: 'restricted' };
  }
  return { ok: true, tabId, tabUrl };
}

async function acceptInternalInjectionContext(sender, action) {
  const validationError = validateInternalRequest(sender);
  if (validationError) {
    return {
      ok: false,
      kind: 'validation',
      validationError,
      guardMeta: buildInternalGuardMeta({ action, sender, validationError }),
    };
  }
  const tabContext = await resolveActiveTabContext();
  if (!tabContext.ok) {
    return tabContext;
  }
  const { activeTab } = tabContext;
  if (isRestrictedInjectionUrl(activeTab.url)) {
    return { ok: false, kind: 'restricted' };
  }
  return { ok: true, activeTab };
}

function extractContentScriptSyncTab(sender, action) {
  const validationError = validateContentScriptRequest(sender);
  if (validationError) {
    return {
      ok: false,
      kind: 'validation',
      validationError,
      guardMeta: buildContentScriptGuardMeta({ action, sender, validationError }),
    };
  }
  const activeTab = sender.tab;
  if (!activeTab?.id || !activeTab?.url) {
    Logger.warn('syncHighlights: 缺少標籤頁上下文', {
      action,
      result: 'failed',
      reason: 'no_tab',
      senderId: sender?.id,
    });
    return { ok: false, kind: 'no_tab' };
  }
  return { ok: true, activeTab };
}

function pickClearRequestValidator(isContentScript) {
  return isContentScript ? validateContentScriptRequest : validateInternalRequest;
}

function pickClearGuardReason(isContentScript) {
  return isContentScript ? 'invalid_content_script_request' : 'invalid_internal_request';
}

function resolveClearStorageUrl(isContentScript, sender, request) {
  if (!isContentScript || !sender?.tab?.url) {
    return request.url;
  }
  return sender.tab.url;
}

function validateClearRequest(sender, request) {
  const isContentScript = Boolean(sender?.tab);
  const validate = pickClearRequestValidator(isContentScript);
  const validationError = validate(sender);
  if (validationError) {
    return {
      ok: false,
      kind: 'validation',
      validationError,
      guardMeta: buildSimpleGuardMeta({
        action: 'CLEAR_HIGHLIGHTS',
        reason: pickClearGuardReason(isContentScript),
        validationError,
      }),
    };
  }
  if (!request.url) {
    return { ok: false, kind: 'missing_url' };
  }
  const storageUrl = resolveClearStorageUrl(isContentScript, sender, request);
  return { ok: true, url: storageUrl, targetTabId: sender?.tab?.id || request.tabId };
}

function rejectShowOrUserActivateContext(ctx, sendResponse) {
  if (ctx.kind === 'validation') {
    sendGuardFailure(ctx.validationError, sendResponse, ctx.guardMeta);
    return;
  }
  if (ctx.kind === 'no_tab') {
    sendResponse({ success: false, error: '缺少標籤頁上下文' });
    return;
  }
  if (ctx.kind === 'restricted') {
    sendResponse({
      success: false,
      error: ERROR_MESSAGES.USER_MESSAGES.HIGHLIGHT_NOT_SUPPORTED,
    });
  }
}

function rejectSyncContext(ctx, sendResponse) {
  if (ctx.kind === 'validation') {
    sendGuardFailure(ctx.validationError, sendResponse, ctx.guardMeta);
    return;
  }
  sendResponse({
    success: false,
    error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB),
  });
}

function rejectClearContext(ctx, sendResponse) {
  if (ctx.kind === 'validation') {
    sendGuardFailure(ctx.validationError, sendResponse, ctx.guardMeta);
    return;
  }
  sendResponse({
    success: false,
    error: { code: 'INVALID_REQUEST', message: '請求格式錯誤：缺少 url' },
  });
}

function respondWithPrepFailure(prep, sendResponse, action, tabId) {
  if (prep.reason === 'inject_failed') {
    const safeMessage = sanitizeApiError(prep.error, 'bundle_injection');
    sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
    return;
  }
  Logger.warn('Bundle 初始化超時', { action, result: 'failed', reason: 'timeout', tabId });
  sendResponse({ success: false, error: ERROR_MESSAGES.USER_MESSAGES.BUNDLE_INIT_TIMEOUT });
}

function respondWithSanitizedError(sendResponse, error, sanitizeContext) {
  const safeMessage = sanitizeApiError(error, sanitizeContext);
  sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
}

async function dispatchFloatingRailActivation(
  tabId,
  action,
  sendResponse,
  { onSuccess, onUnsuccessful, payload = {} }
) {
  try {
    const response = await sendActionMessageToTab(
      tabId,
      RUNTIME_ACTIONS.ACTIVATE_FLOATING_RAIL_HIGHLIGHT,
      payload
    );
    if (response?.success === true) {
      Logger.success('成功啟動浮動側欄標註', { action, result: 'success' });
      sendResponse(onSuccess(response));
      return;
    }
    Logger.warn('啟動浮動側欄標註失敗', {
      action,
      result: 'failed',
      responseSuccess: response?.success,
      responseError: response?.error,
    });
    sendResponse(onUnsuccessful(response));
  } catch (error) {
    Logger.warn('啟動浮動側欄標註失敗', { action, result: 'failed', error });
    respondWithSanitizedError(sendResponse, error, 'activate_floating_rail_highlight');
  }
}

// ============================================================================
// Handler 實作（module-level，由 factory 透過 services 綁定）
// ============================================================================

async function handleShowFloatingRail(services, request, sender, sendResponse) {
  const { injectionService } = services;
  try {
    const ctx = acceptContentScriptInjectionContext(sender, 'SHOW_FLOATING_RAIL');
    if (!ctx.ok) {
      rejectShowOrUserActivateContext(ctx, sendResponse);
      return;
    }

    const injected = await injectionService.ensureBundleInjected(ctx.tabId);
    if (!injected) {
      sendResponse({ success: false, error: ERROR_MESSAGES.USER_MESSAGES.BUNDLE_INIT_TIMEOUT });
      return;
    }

    const bundleReady = await ensureBundleReady(ctx.tabId);
    if (!bundleReady) {
      sendResponse({ success: false, error: ERROR_MESSAGES.USER_MESSAGES.BUNDLE_INIT_TIMEOUT });
      return;
    }

    const response = await sendActionMessageToTab(
      ctx.tabId,
      CONTENT_BRIDGE_ACTIONS.SHOW_FLOATING_RAIL
    );
    const normalized = normalizeContentResponse(response);
    sendResponse(normalized.success ? { success: true } : normalized);
  } catch (error) {
    Logger.warn('顯示 Floating Rail 失敗', {
      action: 'SHOW_FLOATING_RAIL',
      result: 'failed',
      error,
    });
    respondWithSanitizedError(sendResponse, error, 'show_floating_rail');
  }
}

async function handleUserActivateShortcut(services, request, sender, sendResponse) {
  const { injectionService } = services;
  try {
    const ctx = acceptContentScriptInjectionContext(sender, 'USER_ACTIVATE_SHORTCUT', {
      logRestricted: true,
    });
    if (!ctx.ok) {
      rejectShowOrUserActivateContext(ctx, sendResponse);
      return;
    }

    Logger.start('觸發快捷鍵激活', {
      action: 'USER_ACTIVATE_SHORTCUT',
      result: 'started',
      tabId: ctx.tabId,
    });

    const prep = await ensureBundleInjectedAndReady(
      injectionService,
      ctx.tabId,
      'USER_ACTIVATE_SHORTCUT'
    );
    if (!prep.ok) {
      respondWithPrepFailure(prep, sendResponse, 'USER_ACTIVATE_SHORTCUT', ctx.tabId);
      return;
    }

    await dispatchFloatingRailActivation(ctx.tabId, 'USER_ACTIVATE_SHORTCUT', sendResponse, {
      onSuccess: response => ({ success: true, response }),
      onUnsuccessful: response => ({ success: false, response }),
    });
  } catch (error) {
    Logger.error('執行快捷鍵激活時發生意外錯誤', {
      action: 'USER_ACTIVATE_SHORTCUT',
      result: 'failed',
      error,
    });
    respondWithSanitizedError(sendResponse, error, 'user_activate_shortcut');
  }
}

async function handleStartHighlight(services, request, sender, sendResponse) {
  const { injectionService } = services;
  try {
    const ctx = await acceptInternalInjectionContext(sender, 'startHighlight');
    if (!ctx.ok) {
      if (ctx.kind === 'validation') {
        sendGuardFailure(ctx.validationError, sendResponse, ctx.guardMeta);
        return;
      }
      if (ctx.kind === 'no_tab') {
        sendNoActiveTabResponse(sendResponse);
        return;
      }
      sendResponse({
        success: false,
        error: ERROR_MESSAGES.USER_MESSAGES.HIGHLIGHT_NOT_SUPPORTED,
      });
      return;
    }

    const prep = await ensureBundleInjectedAndReady(
      injectionService,
      ctx.activeTab.id,
      'startHighlight'
    );
    if (!prep.ok) {
      respondWithPrepFailure(prep, sendResponse, 'startHighlight', ctx.activeTab.id);
      return;
    }

    await dispatchFloatingRailActivation(ctx.activeTab.id, 'startHighlight', sendResponse, {
      onSuccess: () => ({ success: true }),
      onUnsuccessful: response => normalizeContentResponse(response),
      payload: { sessionOverride: true },
    });
  } catch (error) {
    Logger.error('啟動高亮工具時出錯', { action: 'startHighlight', result: 'failed', error });
    respondWithSanitizedError(sendResponse, error, 'start_highlight');
  }
}

async function handleUpdateRemoteHighlights(services, request, sender, sendResponse) {
  const { injectionService } = services;
  try {
    const validationError = validateInternalRequest(sender);
    if (validationError) {
      sendGuardFailure(
        validationError,
        sendResponse,
        buildInternalGuardMeta({
          action: 'updateHighlights',
          sender,
          validationError,
        })
      );
      return;
    }

    const tabContext = await resolveActiveTabContext();
    if (!tabContext.ok) {
      sendNoActiveTabResponse(sendResponse);
      return;
    }
    const { activeTab } = tabContext;
    const highlights = await injectionService.collectHighlights(activeTab.id);
    const result = await performHighlightUpdate(services, activeTab, highlights);

    if (result.success) {
      result.highlightsUpdated = true;
      result.highlightCount = highlights.length;
      Logger.success('成功更新標註', {
        action: 'updateHighlights',
        result: 'success',
        count: highlights.length,
      });
    }
    sendResponse(result);
  } catch (error) {
    Logger.error('更新標註時出錯', { action: 'updateHighlights', result: 'failed', error });
    const safeMessage = sanitizeApiError(error, 'update_highlights');
    sendResponse({
      success: false,
      error: ErrorHandler.formatUserMessage(safeMessage),
      errorCode: 'INTERNAL_ERROR',
    });
  }
}

async function handleSyncHighlights(services, request, sender, sendResponse) {
  try {
    const ctx = extractContentScriptSyncTab(sender, 'syncHighlights');
    if (!ctx.ok) {
      rejectSyncContext(ctx, sendResponse);
      return;
    }

    const highlights = request.highlights || [];
    if (highlights.length === 0) {
      sendResponse({
        success: true,
        message: BACKGROUND_MESSAGES.HIGHLIGHTS.NO_NEW_TO_SYNC,
        count: 0,
        highlightCount: 0,
      });
      return;
    }

    const result = await performHighlightUpdate(services, ctx.activeTab, highlights);
    if (result.success) {
      Logger.success('成功同步標註', {
        action: 'syncHighlights',
        result: 'success',
        count: highlights.length,
      });
      result.count = highlights.length;
      result.highlightCount = highlights.length;
      result.message = BACKGROUND_MESSAGES.HIGHLIGHTS.SYNC_SUCCESS_COUNT(highlights.length);
    } else {
      handleSyncFailure(result, sender);
    }
    sendResponse(result);
  } catch (error) {
    Logger.error('執行 syncHighlights 時出錯', {
      action: 'syncHighlights',
      result: 'failed',
      error,
    });
    respondWithSanitizedError(sendResponse, error, 'sync_highlights');
  }
}

function handleSyncFailure(result, sender) {
  Logger.error('同步標註失敗', {
    action: 'syncHighlights',
    result: 'failed',
    error: result.error,
  });
  const toastKey = classifyErrorForToast(result.errorCode);
  if (toastKey) {
    sendToastToTab(sender.tab.id, toastKey, 'error');
  }
}
async function handleUpdateHighlights(services, request, sender, sendResponse) {
  const { storageService } = services;
  try {
    const validationError = validateContentScriptRequest(sender);
    if (validationError) {
      sendGuardFailure(
        validationError,
        sendResponse,
        buildSimpleGuardMeta({
          action: 'UPDATE_HIGHLIGHTS',
          reason: 'invalid_content_script_request',
          validationError,
        })
      );
      return;
    }

    const { url, highlights } = request;
    if (!url || !Array.isArray(highlights)) {
      sendResponse({
        success: false,
        error: { code: 'INVALID_REQUEST', message: '請求格式錯誤：缺少 url 或 highlights' },
      });
      return;
    }

    await storageService.updateHighlights(url, highlights);

    Logger.log('Phase 3: UPDATE_HIGHLIGHTS 成功', {
      action: 'UPDATE_HIGHLIGHTS',
      result: 'success',
      count: highlights.length,
    });
    sendResponse({ success: true });
  } catch (error) {
    Logger.error('Phase 3: UPDATE_HIGHLIGHTS 失敗', {
      action: 'UPDATE_HIGHLIGHTS',
      result: 'failed',
      error,
    });
    sendResponse({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '伺服器內部錯誤' },
    });
  }
}

async function clearTabVisualHighlights(injectionService, targetTabId) {
  if (!targetTabId || typeof injectionService?.clearPageHighlights !== 'function') {
    return false;
  }
  try {
    await injectionService.clearPageHighlights(targetTabId);
    return true;
  } catch (error) {
    Logger.warn('Phase 3: CLEAR_HIGHLIGHTS 視覺清除失敗，但 storage 已更新', {
      action: 'CLEAR_HIGHLIGHTS',
      result: 'failed',
      tabId: targetTabId,
      error,
    });
    return false;
  }
}

async function handleClearHighlights(services, request, sender, sendResponse) {
  const { storageService, injectionService } = services;
  try {
    const ctx = validateClearRequest(sender, request);
    if (!ctx.ok) {
      rejectClearContext(ctx, sendResponse);
      return;
    }

    const currentHighlights = (await storageService.getHighlights(ctx.url)) || [];
    const clearedCount = Array.isArray(currentHighlights) ? currentHighlights.length : 0;
    await storageService.updateHighlights(ctx.url, []);

    const visualCleared = await clearTabVisualHighlights(injectionService, ctx.targetTabId);

    Logger.log('Phase 3: CLEAR_HIGHLIGHTS 成功', {
      action: 'CLEAR_HIGHLIGHTS',
      result: 'success',
      url: sanitizeUrlForLogging(ctx.url),
    });
    sendResponse({ success: true, clearedCount, visualCleared });
  } catch (error) {
    Logger.error('Phase 3: CLEAR_HIGHLIGHTS 失敗', {
      action: 'CLEAR_HIGHLIGHTS',
      result: 'failed',
      error,
    });
    sendResponse({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: '伺服器內部錯誤' },
    });
  }
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
  return {
    [RUNTIME_ACTIONS.SHOW_FLOATING_RAIL]: (req, sender, sendResponse) =>
      handleShowFloatingRail(services, req, sender, sendResponse),
    [RUNTIME_ACTIONS.USER_ACTIVATE_SHORTCUT]: (req, sender, sendResponse) =>
      handleUserActivateShortcut(services, req, sender, sendResponse),
    [RUNTIME_ACTIONS.START_HIGHLIGHT]: (req, sender, sendResponse) =>
      handleStartHighlight(services, req, sender, sendResponse),
    [RUNTIME_ACTIONS.UPDATE_REMOTE_HIGHLIGHTS]: (req, sender, sendResponse) =>
      handleUpdateRemoteHighlights(services, req, sender, sendResponse),
    [RUNTIME_ACTIONS.SYNC_HIGHLIGHTS]: (req, sender, sendResponse) =>
      handleSyncHighlights(services, req, sender, sendResponse),
    UPDATE_HIGHLIGHTS: (req, sender, sendResponse) =>
      handleUpdateHighlights(services, req, sender, sendResponse),
    [RUNTIME_ACTIONS.CLEAR_HIGHLIGHTS]: (req, sender, sendResponse) =>
      handleClearHighlights(services, req, sender, sendResponse),
  };
}
