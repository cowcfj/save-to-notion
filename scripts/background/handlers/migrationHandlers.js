/**
 * Migration Handlers
 *
 * 處理舊版標註數據遷移的所有操作。
 * 抽取自 actionHandlers.js，便於維護和未來整體移除。
 *
 * @module handlers/migrationHandlers
 */

/* global Logger */

import { sanitizeUrlForLogging } from '../../utils/LogSanitizer.js';
import { pMap } from '../../utils/concurrencyUtils.js';
import { ERROR_MESSAGES } from '../../config/messages/errorMessages.js';
import { BACKGROUND_MESSAGES } from '../../config/messages/backgroundMessages.js';
import { RUNTIME_ACTIONS } from '../../config/shared/runtimeActions.js';
import { computeStableUrl } from '../../utils/urlUtils.js';
import {
  buildMigrationGuardMeta,
  clearLegacyKeysWithStable,
  sendGuardFailure,
  sendStandardHandlerError,
  validateBatchUrls,
  validatePrivilegedRequest,
} from './handlerGuard.js';

const MIGRATION_BATCH_CONCURRENCY = 5;

function sanitizeBatchDeleteFailureReason(error) {
  const rawReason = error?.message ?? String(error);
  return String(rawReason).replaceAll(/https?:\/\/[^\s"',)]+/g, url => sanitizeUrlForLogging(url));
}

function sendMigrationGuardFailure({ validationError, sendResponse, action, sender, url }) {
  sendGuardFailure(
    validationError,
    sendResponse,
    buildMigrationGuardMeta({
      action,
      sender,
      validationError,
      url,
    })
  );
}

function resolveLegacyCleanupTargets(url) {
  const stableUrl = computeStableUrl(url);
  return stableUrl && stableUrl !== url ? [url, stableUrl] : [url];
}

async function hasLegacyMigrationData(storageService, targetUrls) {
  const targetPresence = [];

  for (const targetUrl of targetUrls) {
    const [highlightData, savedPageData] = await Promise.all([
      storageService.getHighlights(targetUrl),
      storageService.getSavedPageData(targetUrl),
    ]);
    targetPresence.push(Boolean(highlightData || savedPageData));
  }

  return targetPresence.some(Boolean);
}

async function clearLegacyMigrationTargets(storageService, targetUrls) {
  for (const targetUrl of targetUrls) {
    await storageService.clearLegacyKeys(targetUrl);
  }
}

function groupBatchMigrationUrls(urls) {
  const groups = new Map();

  for (const [originalIndex, url] of urls.entries()) {
    const key = computeStableUrl(url) || url;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push({ url, originalIndex });
  }

  return [...groups.values()];
}

async function migrateOneBatchUrl(migrationService, url) {
  try {
    const itemResult = await migrationService.migrateBatchUrl(url);
    if (itemResult.status === 'success') {
      Logger.log('批量遷移成功', {
        action: 'migration_batch',
        result: 'success',
        url: itemResult.url,
        highlightCount: itemResult.count,
      });
    }
    return itemResult;
  } catch (itemError) {
    Logger.error('批量遷移失敗', {
      action: 'migration_batch',
      result: 'failed',
      url: sanitizeUrlForLogging(url),
      error: itemError?.message ?? String(itemError),
    });
    return {
      url: sanitizeUrlForLogging(url),
      status: 'failed',
      reason: itemError?.message ?? String(itemError),
    };
  }
}

async function migrateBatchGroup(migrationService, groupEntries) {
  const groupResults = [];

  for (const { url, originalIndex } of groupEntries) {
    const result = await migrateOneBatchUrl(migrationService, url);
    groupResults.push({ originalIndex, result });
  }

  return groupResults;
}

function buildOrderedBatchDetails(urls, groupOutputs) {
  const resultsByOriginalIndex = new Map();

  for (const groupOutput of groupOutputs) {
    for (const { originalIndex, result } of groupOutput) {
      resultsByOriginalIndex.set(originalIndex, result);
    }
  }

  return urls.map((_, index) => resultsByOriginalIndex.get(index));
}

function buildBatchMigrationResults(details) {
  const successCount = details.filter(detail => detail.status === 'success').length;

  return {
    success: successCount,
    failed: details.length - successCount,
    details,
  };
}

async function deleteOneLegacyMigrationUrl(storageService, urlItem) {
  const safeUrl = sanitizeUrlForLogging(urlItem);

  try {
    await clearLegacyKeysWithStable(storageService, urlItem);
    return { status: 'success', url: safeUrl };
  } catch (error) {
    return {
      status: 'failed',
      url: safeUrl,
      reason: sanitizeBatchDeleteFailureReason(error),
    };
  }
}

function buildBatchDeleteMessage(successCount, failedCount) {
  return failedCount === 0
    ? BACKGROUND_MESSAGES.STORAGE.MIGRATION_BATCH_DELETE_SUCCESS(successCount)
    : BACKGROUND_MESSAGES.STORAGE.MIGRATION_BATCH_DELETE_PARTIAL(successCount, failedCount);
}

function resolveBatchDeleteResultLabel(successCount, failedCount) {
  if (failedCount === 0) {
    return 'success';
  }

  if (successCount === 0) {
    return 'failed';
  }

  return 'partial';
}

function buildBatchDeleteSummary(cleanupResults) {
  const successCount = cleanupResults.filter(result => result.status === 'success').length;
  const failedCount = cleanupResults.length - successCount;

  return {
    successCount,
    failedCount,
    message: buildBatchDeleteMessage(successCount, failedCount),
    result: resolveBatchDeleteResultLabel(successCount, failedCount),
  };
}

function normalizeStoredHighlights(value) {
  return value?.highlights || (Array.isArray(value) ? value : []);
}

function buildPendingMigrationLists(allHighlights) {
  const pendingItems = [];
  const failedItems = [];

  for (const [url, value] of Object.entries(allHighlights)) {
    const highlights = normalizeStoredHighlights(value);
    const pendingCount = highlights.filter(
      highlight => highlight.needsRangeInfo === true && !highlight.migrationFailed
    ).length;
    const failedCount = highlights.filter(highlight => highlight.migrationFailed === true).length;

    if (pendingCount > 0) {
      pendingItems.push({ url, totalCount: highlights.length, pendingCount });
    }

    if (failedCount > 0) {
      failedItems.push({ url, totalCount: highlights.length, failedCount });
    }
  }

  return { pendingItems, failedItems };
}

function createMigrationExecuteHandler({ migrationService }) {
  return async (request, sender, sendResponse) => {
    try {
      const { url } = request;
      const validationError = validatePrivilegedRequest(sender, url);
      if (validationError) {
        sendMigrationGuardFailure({
          validationError,
          sendResponse,
          action: 'migration_execute',
          sender,
          url,
        });
        return;
      }

      const result = await migrationService.executeContentMigration(request, sender);
      sendResponse(result);
    } catch (error) {
      sendStandardHandlerError({
        error,
        logMessage: '遷移失敗',
        action: 'migration_execute',
        sanitizeContext: 'migration_execute',
        sendResponse,
      });
    }
  };
}

function createMigrationDeleteHandler({ storageService }) {
  return async (request, sender, sendResponse) => {
    try {
      const { url } = request;
      const validationError = validatePrivilegedRequest(sender, url);
      if (validationError) {
        sendMigrationGuardFailure({
          validationError,
          sendResponse,
          action: 'migration_delete',
          sender,
          url,
        });
        return;
      }

      if (!url) {
        sendResponse({ success: false, error: ERROR_MESSAGES.USER_MESSAGES.MISSING_URL });
        return;
      }

      Logger.log('開始刪除', { action: 'migration_delete', url: sanitizeUrlForLogging(url) });

      const cleanupTargets = resolveLegacyCleanupTargets(url);
      const hasAnyData = await hasLegacyMigrationData(storageService, cleanupTargets);
      if (!hasAnyData) {
        sendResponse({ success: true, message: '數據不存在，無需刪除' });
        return;
      }

      await clearLegacyMigrationTargets(storageService, cleanupTargets);

      Logger.log('刪除完成', { action: 'migration_delete', url: sanitizeUrlForLogging(url) });
      sendResponse({
        success: true,
        message: '成功刪除標註數據',
      });
    } catch (error) {
      sendStandardHandlerError({
        error,
        logMessage: '刪除失敗',
        action: 'migration_delete',
        sanitizeContext: 'migration_delete',
        sendResponse,
      });
    }
  };
}

function createMigrationBatchHandler({ migrationService }) {
  return async (request, sender, sendResponse) => {
    try {
      const { urls } = request;
      const validationError = validatePrivilegedRequest(sender);
      if (validationError) {
        sendMigrationGuardFailure({
          validationError,
          sendResponse,
          action: 'migration_batch',
          sender,
        });
        return;
      }

      const batchValidationError = validateBatchUrls(urls);
      if (batchValidationError) {
        sendResponse(batchValidationError);
        return;
      }

      Logger.log('開始批量遷移', { action: 'migration_batch', pageCount: urls.length });

      const groupedUrls = groupBatchMigrationUrls(urls);
      const groupOutputs = await pMap(
        groupedUrls,
        groupEntries => migrateBatchGroup(migrationService, groupEntries),
        { concurrency: MIGRATION_BATCH_CONCURRENCY }
      );
      const details = buildOrderedBatchDetails(urls, groupOutputs);
      const results = buildBatchMigrationResults(details);

      Logger.log('批量遷移完成', {
        action: 'migration_batch',
        successCount: results.success,
        failedCount: results.failed,
      });
      sendResponse({ success: true, results });
    } catch (error) {
      sendStandardHandlerError({
        error,
        logMessage: '批量遷移失敗',
        action: 'migration_batch',
        sanitizeContext: 'migration_batch',
        sendResponse,
      });
    }
  };
}

function createMigrationBatchDeleteHandler({ storageService }) {
  return async (request, sender, sendResponse) => {
    try {
      const { urls } = request;
      const validationError = validatePrivilegedRequest(sender);
      if (validationError) {
        sendMigrationGuardFailure({
          validationError,
          sendResponse,
          action: 'migration_batch_delete',
          sender,
        });
        return;
      }

      const batchValidationError = validateBatchUrls(urls);
      if (batchValidationError) {
        sendResponse(batchValidationError);
        return;
      }

      Logger.log('開始批量刪除', { action: 'migration_batch_delete', pageCount: urls.length });

      const cleanupResults = await pMap(
        urls,
        urlItem => deleteOneLegacyMigrationUrl(storageService, urlItem),
        { concurrency: MIGRATION_BATCH_CONCURRENCY }
      );
      const { successCount, failedCount, message, result } =
        buildBatchDeleteSummary(cleanupResults);

      Logger.log('批量刪除完成', {
        action: 'migration_batch_delete',
        result,
        successCount,
        failedCount,
        pageCount: urls.length,
      });
      sendResponse({
        success: true,
        results: {
          success: successCount,
          failed: failedCount,
          total: cleanupResults.length,
          details: cleanupResults,
        },
        message,
      });
    } catch (error) {
      sendStandardHandlerError({
        error,
        logMessage: '批量刪除失敗',
        action: 'migration_batch_delete',
        sanitizeContext: 'migration_batch_delete',
        sendResponse,
      });
    }
  };
}

function createMigrationGetPendingHandler({ migrationScanner }) {
  return async (_request, sender, sendResponse) => {
    try {
      const validationError = validatePrivilegedRequest(sender);
      if (validationError) {
        sendMigrationGuardFailure({
          validationError,
          sendResponse,
          action: 'migration_get_pending',
          sender,
        });
        return;
      }

      const allHighlights = await migrationScanner.getAllHighlights();
      const { pendingItems, failedItems } = buildPendingMigrationLists(allHighlights);

      Logger.log('查詢待完成項目', {
        action: 'migration_get_pending',
        pendingPages: pendingItems.length,
        failedPages: failedItems.length,
      });
      sendResponse({
        success: true,
        items: pendingItems,
        failedItems,
        totalPages: pendingItems.length,
        totalPending: pendingItems.reduce((sum, item) => sum + item.pendingCount, 0),
        totalFailed: failedItems.reduce((sum, item) => sum + item.failedCount, 0),
      });
    } catch (error) {
      sendStandardHandlerError({
        error,
        logMessage: '獲取待完成項目失敗',
        action: 'migration_get_pending',
        sanitizeContext: 'migration_get_pending',
        sendResponse,
      });
    }
  };
}

function createMigrationDeleteFailedHandler({ storageService }) {
  return async (request, sender, sendResponse) => {
    try {
      const { url } = request;
      const validationError = validatePrivilegedRequest(sender, url);
      if (validationError) {
        sendMigrationGuardFailure({
          validationError,
          sendResponse,
          action: 'migration_delete_failed',
          sender,
          url,
        });
        return;
      }

      if (!url) {
        sendResponse({ success: false, error: ERROR_MESSAGES.USER_MESSAGES.MISSING_URL });
        return;
      }

      const data = await storageService.getHighlights(url);
      if (!data) {
        sendResponse({ success: false, error: ERROR_MESSAGES.USER_MESSAGES.NO_HIGHLIGHT_DATA });
        return;
      }

      const highlights = normalizeStoredHighlights(data);
      const remainingHighlights = highlights.filter(highlight => !highlight.migrationFailed);
      const deletedCount = highlights.length - remainingHighlights.length;

      await storageService.updateHighlights(url, remainingHighlights);

      Logger.log('刪除失敗標註', {
        action: 'migration_delete_failed',
        url: sanitizeUrlForLogging(url),
        deletedCount,
      });
      sendResponse({ success: true, deletedCount });
    } catch (error) {
      sendStandardHandlerError({
        error,
        logMessage: '刪除失敗標註失敗',
        action: 'migration_delete_failed',
        sanitizeContext: 'migration_delete_failed',
        sendResponse,
      });
    }
  };
}

/**
 * 創建遷移處理函數
 * 沿用工廠模式，保持與 actionHandlers 一致的依賴注入風格
 *
 * @param {object} services - 服務實例集合
 * @returns {object} 遷移處理函數映射
 */
export function createMigrationHandlers(services) {
  return {
    /**
     * 執行標註數據遷移
     * 從選項頁面發起，將舊版標註升級為現代格式
     * 使用 Headless Tab 策略：在後台分頁中執行 DOM 感知的遷移
     *
     * @param {object} request - 請求對象
     * @param {string} request.url - 目標頁面 URL
     * @param {object} sender - 發送者信息
     * @param {Function} sendResponse - 回調函數
     */
    [RUNTIME_ACTIONS.MIGRATION_EXECUTE]: createMigrationExecuteHandler(services),

    /**
     * 刪除標註數據
     * 從選項頁面發起，刪除指定 URL 的所有標註
     *
     * @param {object} request - 請求對象
     * @param {string} request.url - 目標頁面 URL
     * @param {object} sender - 發送者信息
     * @param {Function} sendResponse - 回調函數
     */
    [RUNTIME_ACTIONS.MIGRATION_DELETE]: createMigrationDeleteHandler(services),

    /**
     * 批量遷移標註數據
     * 直接在 Storage 中轉換格式，標記 needsRangeInfo
     * 用戶訪問頁面時會自動完成 rangeInfo 生成
     *
     * @param {object} request - 請求對象
     * @param {string[]} request.urls - 目標頁面 URL 列表
     * @param {object} sender - 發送者信息
     * @param {Function} sendResponse - 回調函數
     */
    [RUNTIME_ACTIONS.MIGRATION_BATCH]: createMigrationBatchHandler(services),

    /**
     * 批量刪除標註數據
     * 一次性刪除多個 URL 的標註數據
     *
     * @param {object} request - 請求對象
     * @param {string[]} request.urls - 目標頁面 URL 列表
     * @param {object} sender - 發送者信息
     * @param {Function} sendResponse - 回調函數
     */
    [RUNTIME_ACTIONS.MIGRATION_BATCH_DELETE]: createMigrationBatchDeleteHandler(services),

    /**
     * 獲取待完成 rangeInfo 的遷移項目
     * 返回待完成項目和失敗項目
     *
     * @param {object} request - 請求對象
     * @param {object} sender - 發送者信息
     * @param {Function} sendResponse - 回調函數
     */
    [RUNTIME_ACTIONS.MIGRATION_GET_PENDING]: createMigrationGetPendingHandler(services),

    /**
     * 刪除指定 URL 的失敗遷移標註
     *
     * @param {object} request - 請求對象
     * @param {string} request.url - 目標頁面 URL
     * @param {object} sender - 發送者信息
     * @param {Function} sendResponse - 回調函數
     */
    [RUNTIME_ACTIONS.MIGRATION_DELETE_FAILED]: createMigrationDeleteFailedHandler(services),
  };
}
