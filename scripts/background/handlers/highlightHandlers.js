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
import { HANDLER_CONSTANTS } from '../../config/shared/core.js';
import { ERROR_MESSAGES, UI_MESSAGES } from '../../config/shared/messages.js';
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

  // Phase 2: 統一 URL 解析 + 自動遷移
  const {
    stableUrl: normUrl,
    originalUrl,
    migrated,
  } = await tabService.resolveTabUrl(activeTab.id, activeTab.url || '', migrationService);

  let savedData = await storageService.getSavedPageData(normUrl);
  const foundViaStableUrl = Boolean(savedData?.notionPageId);

  // 雙查安全網：遷移失敗時回退查詢原始 URL
  if (!foundViaStableUrl && !migrated && normUrl !== originalUrl) {
    savedData = await storageService.getSavedPageData(originalUrl);
  }

  if (!savedData?.notionPageId) {
    return {
      success: false,
      errorCode: 'PAGE_NOT_SAVED',
      error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.PAGE_NOT_SAVED),
    };
  }

  const resolvedUrl = foundViaStableUrl ? normUrl : originalUrl;

  // 轉換標記為 Blocks
  const highlightBlocks = buildHighlightBlocks(highlights);

  // 調用 NotionService 更新標記
  const result = await notionService.updateHighlightsSection(
    savedData.notionPageId,
    highlightBlocks,
    {
      apiKey,
    }
  );

  if (
    !result.success &&
    result.error === 'OBJECT_NOT_FOUND' &&
    result.details?.phase === 'fetch_blocks'
  ) {
    const deletionCheck = tabService.confirmRemotePageMissing(savedData.notionPageId);

    if (!deletionCheck.shouldDelete) {
      Logger.warn('同步標註時首次發現遠端頁面疑似已刪除，暫不清除本地 notion 綁定', {
        action: 'performHighlightUpdate',
        url: sanitizeUrlForLogging(resolvedUrl),
        pageId: savedData.notionPageId?.slice(0, 4) ?? 'unknown',
        result: 'pending',
      });

      return {
        ...result,
        errorCode: 'PAGE_DELETION_PENDING',
        error: UI_MESSAGES.POPUP.DELETION_PENDING,
      };
    }

    Logger.warn('同步標註時確認遠端頁面已刪除，清除本地 notion 綁定', {
      action: 'performHighlightUpdate',
      url: sanitizeUrlForLogging(resolvedUrl),
      pageId: savedData.notionPageId?.slice(0, 4) ?? 'unknown',
      result: 'confirmed_deleted',
    });

    const clearResult = await storageService.clearNotionStateWithRetry(resolvedUrl, {
      source: 'highlightHandlers.performHighlightUpdate',
      expectedPageId: savedData.notionPageId,
    });

    if (clearResult.skipped) {
      Logger.warn('清除本地 notion 綁定時偵測到 pageId 已變更，取消 PAGE_DELETED 狀態切換', {
        action: 'performHighlightUpdate',
        url: sanitizeUrlForLogging(resolvedUrl),
        pageId: savedData.notionPageId?.slice(0, 4) ?? 'unknown',
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
      });

      // Re-arm: 清除失敗，恢復 pending token 供下次 sync 立即重試清除
      tabService.confirmRemotePageMissing(savedData.notionPageId);
    }

    return {
      ...result,
      errorCode: 'PAGE_DELETED',
      error: UI_MESSAGES.POPUP.DELETED_PAGE,
    };
  }

  tabService.resetRemotePageMissingState(savedData.notionPageId);

  // 格式化失敗訊息為用戶友善格式（與 saveHandlers.sendErrorResponse 模式一致）
  // 建立新物件返回，避免直接修改 notionService 回傳的 result（防止副作用）
  if (!result.success && result.error) {
    return { ...result, error: ErrorHandler.formatUserMessage(result.error) };
  }

  return result;
}

async function sendActionMessageToTab(tabId, action) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { action }, result => {
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

async function ensureBundleInjectedAndReady(injectionService, tabId, action) {
  try {
    await injectionService.ensureBundleInjected(tabId);
  } catch (injectionError) {
    Logger.error('Bundle 注入失敗', {
      action,
      error: injectionError.message,
      stack: injectionError.stack,
    });
    return { ok: false, reason: 'inject_failed', error: injectionError };
  }

  const bundleReady = await ensureBundleReady(tabId);
  if (!bundleReady) {
    return { ok: false, reason: 'timeout' };
  }

  return { ok: true };
}

// ============================================================================
// Handler 實作（module-level，由 factory 透過 services 綁定）
// ============================================================================

async function handleShowFloatingRail(services, request, sender, sendResponse) {
  const { injectionService } = services;
  try {
    const validationError = validateContentScriptRequest(sender);
    if (validationError) {
      sendGuardFailure(
        validationError,
        sendResponse,
        buildContentScriptGuardMeta({
          action: 'SHOW_FLOATING_RAIL',
          sender,
          validationError,
        })
      );
      return;
    }

    if (!sender.tab?.id) {
      Logger.warn('缺少標籤頁上下文', { action: 'SHOW_FLOATING_RAIL' });
      sendResponse({ success: false, error: '缺少標籤頁上下文' });
      return;
    }

    const tabId = sender.tab.id;
    const tabUrl = sender.tab.url;
    if (tabUrl && isRestrictedInjectionUrl(tabUrl)) {
      sendResponse({
        success: false,
        error: ERROR_MESSAGES.USER_MESSAGES.HIGHLIGHT_NOT_SUPPORTED,
      });
      return;
    }

    const injected = await injectionService.ensureBundleInjected(tabId);
    if (!injected) {
      sendResponse({ success: false, error: ERROR_MESSAGES.USER_MESSAGES.BUNDLE_INIT_TIMEOUT });
      return;
    }

    const bundleReady = await ensureBundleReady(tabId);
    if (!bundleReady) {
      sendResponse({ success: false, error: ERROR_MESSAGES.USER_MESSAGES.BUNDLE_INIT_TIMEOUT });
      return;
    }

    const response = await sendActionMessageToTab(tabId, CONTENT_BRIDGE_ACTIONS.SHOW_FLOATING_RAIL);
    const normalized = normalizeContentResponse(response);
    sendResponse(normalized.success ? { success: true } : normalized);
  } catch (error) {
    Logger.warn('顯示 Floating Rail 失敗', {
      action: 'SHOW_FLOATING_RAIL',
      error: error?.message ?? String(error),
    });
    const safeMessage = sanitizeApiError(error, 'show_floating_rail');
    sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
  }
}

async function handleUserActivateShortcut(services, request, sender, sendResponse) {
  const { injectionService } = services;
  try {
    const validationError = validateContentScriptRequest(sender);
    if (validationError) {
      sendGuardFailure(
        validationError,
        sendResponse,
        buildContentScriptGuardMeta({
          action: 'USER_ACTIVATE_SHORTCUT',
          sender,
          validationError,
        })
      );
      return;
    }

    if (!sender.tab?.id) {
      Logger.warn('缺少標籤頁上下文', { action: 'USER_ACTIVATE_SHORTCUT' });
      sendResponse({ success: false, error: '缺少標籤頁上下文' });
      return;
    }

    const tabId = sender.tab.id;
    const tabUrl = sender.tab.url;
    Logger.start('觸發快捷鍵激活', { action: 'USER_ACTIVATE_SHORTCUT', tabId });

    if (tabUrl && isRestrictedInjectionUrl(tabUrl)) {
      Logger.warn('受限頁面無法使用標註', {
        action: 'USER_ACTIVATE_SHORTCUT',
        url: sanitizeUrlForLogging(tabUrl),
        result: 'blocked',
        reason: 'restricted_url',
      });
      sendResponse({
        success: false,
        error: ERROR_MESSAGES.USER_MESSAGES.HIGHLIGHT_NOT_SUPPORTED,
      });
      return;
    }

    const prep = await ensureBundleInjectedAndReady(
      injectionService,
      tabId,
      'USER_ACTIVATE_SHORTCUT'
    );
    if (!prep.ok) {
      if (prep.reason === 'inject_failed') {
        const safeMessage = sanitizeApiError(prep.error, 'bundle_injection');
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
        return;
      }
      Logger.warn('Bundle 初始化超時', { action: 'USER_ACTIVATE_SHORTCUT', tabId });
      sendResponse({ success: false, error: ERROR_MESSAGES.USER_MESSAGES.BUNDLE_INIT_TIMEOUT });
      return;
    }

    try {
      const response = await sendActionMessageToTab(
        tabId,
        RUNTIME_ACTIONS.ACTIVATE_FLOATING_RAIL_HIGHLIGHT
      );
      if (response?.success === true) {
        Logger.success('成功啟動浮動側欄標註', { action: 'USER_ACTIVATE_SHORTCUT' });
        sendResponse({ success: true, response });
        return;
      }
      Logger.warn('啟動浮動側欄標註失敗', {
        action: 'USER_ACTIVATE_SHORTCUT',
        responseSuccess: response?.success,
        responseError: response?.error,
      });
      sendResponse({ success: false, response });
    } catch (error) {
      Logger.warn('啟動浮動側欄標註失敗', {
        action: 'USER_ACTIVATE_SHORTCUT',
        error: error.message,
      });
      const safeMessage = sanitizeApiError(error, 'activate_floating_rail_highlight');
      sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
    }
  } catch (error) {
    Logger.error('執行快捷鍵激活時發生意外錯誤', {
      action: 'USER_ACTIVATE_SHORTCUT',
      error: error.message,
    });
    const safeMessage = sanitizeApiError(error, 'user_activate_shortcut');
    sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
  }
}

async function handleStartHighlight(services, request, sender, sendResponse) {
  const { injectionService } = services;
  try {
    const validationError = validateInternalRequest(sender);
    if (validationError) {
      sendGuardFailure(
        validationError,
        sendResponse,
        buildInternalGuardMeta({
          action: 'startHighlight',
          sender,
          validationError,
        })
      );
      return;
    }

    const activeTab = await getActiveTab();
    if (isRestrictedInjectionUrl(activeTab.url)) {
      sendResponse({
        success: false,
        error: ERROR_MESSAGES.USER_MESSAGES.HIGHLIGHT_NOT_SUPPORTED,
      });
      return;
    }

    const prep = await ensureBundleInjectedAndReady(
      injectionService,
      activeTab.id,
      'startHighlight'
    );
    if (!prep.ok) {
      if (prep.reason === 'inject_failed') {
        const safeMessage = sanitizeApiError(prep.error, 'bundle_injection');
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
        return;
      }
      Logger.warn('Bundle 初始化超時', { action: 'startHighlight', tabId: activeTab.id });
      sendResponse({ success: false, error: ERROR_MESSAGES.USER_MESSAGES.BUNDLE_INIT_TIMEOUT });
      return;
    }

    try {
      const response = await sendActionMessageToTab(
        activeTab.id,
        RUNTIME_ACTIONS.ACTIVATE_FLOATING_RAIL_HIGHLIGHT
      );
      if (response?.success === true) {
        Logger.success('成功啟動浮動側欄標註', { action: 'startHighlight' });
        sendResponse({ success: true });
        return;
      }
      Logger.warn('啟動浮動側欄標註失敗', {
        action: 'startHighlight',
        responseSuccess: response?.success,
        responseError: response?.error,
      });
      sendResponse(normalizeContentResponse(response));
    } catch (error) {
      Logger.warn('啟動浮動側欄標註失敗', {
        action: 'startHighlight',
        error: error.message,
      });
      const safeMessage = sanitizeApiError(error, 'activate_floating_rail_highlight');
      sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
    }
  } catch (error) {
    Logger.error('啟動高亮工具時出錯', { action: 'startHighlight', error: error.message });
    const safeMessage = sanitizeApiError(error, 'start_highlight');
    sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
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

    const activeTab = await getActiveTab();
    const highlights = await injectionService.collectHighlights(activeTab.id);
    const result = await performHighlightUpdate(services, activeTab, highlights);

    if (result.success) {
      result.highlightsUpdated = true;
      result.highlightCount = highlights.length;
      Logger.success('成功更新標註', {
        action: 'updateHighlights',
        count: highlights.length,
      });
    }
    sendResponse(result);
  } catch (error) {
    Logger.error('更新標註時出錯', { action: 'updateHighlights', error: error.message });
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
    const validationError = validateContentScriptRequest(sender);
    if (validationError) {
      sendGuardFailure(
        validationError,
        sendResponse,
        buildContentScriptGuardMeta({
          action: 'syncHighlights',
          sender,
          validationError,
        })
      );
      return;
    }

    const activeTab = sender.tab;
    if (!activeTab?.id || !activeTab?.url) {
      Logger.warn('syncHighlights: 缺少標籤頁上下文', {
        action: 'syncHighlights',
        senderId: sender?.id,
      });
      sendResponse({
        success: false,
        error: ErrorHandler.formatUserMessage(ERROR_MESSAGES.TECHNICAL.NO_ACTIVE_TAB),
      });
      return;
    }

    const highlights = request.highlights || [];
    if (highlights.length === 0) {
      sendResponse({
        success: true,
        message: UI_MESSAGES.HIGHLIGHTS.NO_NEW_TO_SYNC,
        highlightCount: 0,
      });
      return;
    }

    const result = await performHighlightUpdate(services, activeTab, highlights);

    if (result.success) {
      Logger.success('成功同步標註', { action: 'syncHighlights', count: highlights.length });
      result.highlightCount = highlights.length;
      result.message = UI_MESSAGES.HIGHLIGHTS.SYNC_SUCCESS_COUNT(highlights.length);
    } else {
      Logger.error('同步標註失敗', { action: 'syncHighlights', error: result.error });
      const toastKey = classifyErrorForToast(result.errorCode);
      if (toastKey) {
        sendToastToTab(sender.tab.id, toastKey, 'error');
      }
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
      count: highlights.length,
    });
    sendResponse({ success: true });
  } catch (error) {
    Logger.error('Phase 3: UPDATE_HIGHLIGHTS 失敗', {
      action: 'UPDATE_HIGHLIGHTS',
      error: error.message,
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
      tabId: targetTabId,
      error,
    });
    return false;
  }
}

async function handleClearHighlights(services, request, sender, sendResponse) {
  const { storageService, injectionService } = services;
  try {
    const isContentScript = Boolean(sender?.tab);
    const validationError = isContentScript
      ? validateContentScriptRequest(sender)
      : validateInternalRequest(sender);
    if (validationError) {
      sendGuardFailure(
        validationError,
        sendResponse,
        buildSimpleGuardMeta({
          action: 'CLEAR_HIGHLIGHTS',
          reason: isContentScript ? 'invalid_content_script_request' : 'invalid_internal_request',
          validationError,
        })
      );
      return;
    }

    const { url } = request;
    if (!url) {
      sendResponse({
        success: false,
        error: { code: 'INVALID_REQUEST', message: '請求格式錯誤：缺少 url' },
      });
      return;
    }

    const currentHighlights = (await storageService.getHighlights(url)) || [];
    const clearedCount = Array.isArray(currentHighlights) ? currentHighlights.length : 0;
    await storageService.updateHighlights(url, []);

    const targetTabId = sender?.tab?.id || request.tabId;
    const visualCleared = await clearTabVisualHighlights(injectionService, targetTabId);

    Logger.log('Phase 3: CLEAR_HIGHLIGHTS 成功', {
      action: 'CLEAR_HIGHLIGHTS',
      url: sanitizeUrlForLogging(url),
    });
    sendResponse({ success: true, clearedCount, visualCleared });
  } catch (error) {
    Logger.error('Phase 3: CLEAR_HIGHLIGHTS 失敗', {
      action: 'CLEAR_HIGHLIGHTS',
      error: error.message,
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
