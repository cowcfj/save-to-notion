/**
 * Migration Handlers
 *
 * 處理舊版標註數據遷移的所有操作。
 * 抽取自 actionHandlers.js，便於維護和未來整體移除。
 *
 * @module handlers/migrationHandlers
 */

/* global Logger */

import {
  validateInternalRequest,
  isValidUrl,
  sanitizeApiError,
  sanitizeUrlForLogging,
} from '../../utils/securityUtils.js';
import { ErrorHandler } from '../../utils/ErrorHandler.js';
import { ERROR_MESSAGES } from '../../config/messages.js';
import { computeStableUrl } from '../../utils/urlUtils.js';
import { hasNotionData, isSameNotionPage } from '../utils/migrationMetadataUtils.js';

/**
 * 轉換標註格式：對沒有 rangeInfo 的項目加上 needsRangeInfo 標記
 * 純函數，無副作用
 *
 * @param {Array} oldHighlights - 舊標註陣列
 * @returns {Array} 轉換後的標註陣列
 */
function _convertHighlightFormat(oldHighlights) {
  return oldHighlights.map(item => ({
    ...item,
    needsRangeInfo: !item.rangeInfo,
  }));
}

async function _setUrlAliasSafe(storageService, originalUrl, stableUrl) {
  if (typeof storageService.setUrlAlias !== 'function') {
    return;
  }
  await storageService.setUrlAlias(originalUrl, stableUrl).catch(error => {
    Logger.warn('設定 URL alias 失敗（不影響主流程）', {
      action: 'migration_batch',
      from: sanitizeUrlForLogging(originalUrl),
      to: sanitizeUrlForLogging(stableUrl),
      error: error?.message ?? String(error),
    });
  });
}

async function _supplementSavedMetadataForStableKey(storageService, originalUrl, stableUrl) {
  if (!stableUrl || stableUrl === originalUrl) {
    return false;
  }

  const [stableSavedData, legacySavedData] = await Promise.all([
    storageService.getSavedPageData(stableUrl),
    storageService.getSavedPageData(originalUrl),
  ]);

  const hasStableNotion = hasNotionData(stableSavedData);
  const hasLegacyNotion = hasNotionData(legacySavedData);

  if (
    !hasStableNotion &&
    hasLegacyNotion &&
    typeof storageService.setSavedPageData === 'function'
  ) {
    await storageService.setSavedPageData(stableUrl, legacySavedData);
    Logger.info('已補遷移 saved metadata 到穩定 URL', {
      action: 'migration_batch',
      from: sanitizeUrlForLogging(originalUrl),
      to: sanitizeUrlForLogging(stableUrl),
    });
    await _setUrlAliasSafe(storageService, originalUrl, stableUrl);
    return true;
  }

  if (hasStableNotion && hasLegacyNotion && !isSameNotionPage(stableSavedData, legacySavedData)) {
    Logger.warn('stable/legacy notion 衝突，保留 stable 資料', {
      action: 'migration_batch',
      stableUrl: sanitizeUrlForLogging(stableUrl),
      legacyUrl: sanitizeUrlForLogging(originalUrl),
    });
  }

  await _setUrlAliasSafe(storageService, originalUrl, stableUrl);
  return false;
}

function _normalizeHighlightsValue(data) {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === 'object' && Array.isArray(data.highlights)) {
    return data.highlights;
  }
  return [];
}

async function _buildStorageSnapshot(url, storageService) {
  const stableUrl = computeStableUrl(url);
  const hasStableUrl = Boolean(stableUrl && stableUrl !== url);
  const [legacyData, stableData] = await Promise.all([
    storageService.getHighlights(url),
    hasStableUrl ? storageService.getHighlights(stableUrl) : Promise.resolve(null),
  ]);
  const stableHighlights = _normalizeHighlightsValue(stableData);

  return {
    stableUrl,
    hasStableUrl,
    legacyData,
    shouldMigrateToStable: Boolean(hasStableUrl && stableHighlights.length === 0),
  };
}

function _extractLegacyHighlights(data, url) {
  if (!data) {
    return {
      skipResult: {
        status: 'skipped',
        reason: '無數據',
        url: sanitizeUrlForLogging(url),
      },
    };
  }

  const oldHighlights = _normalizeHighlightsValue(data);
  if (oldHighlights.length === 0) {
    return {
      skipResult: {
        status: 'skipped',
        reason: '無標註',
        url: sanitizeUrlForLogging(url),
      },
    };
  }

  return { oldHighlights };
}

async function _applyInPlaceConversion(storageService, url, oldHighlights) {
  const convertedHighlights = _convertHighlightFormat(oldHighlights);
  await storageService.updateHighlights(url, convertedHighlights);
}

async function _tryStableMigration({
  url,
  stableUrl,
  storageService,
  migrationService,
  oldHighlights,
}) {
  try {
    const migrated = await migrationService.migrateStorageKey(stableUrl, url, {
      convertFormat: true,
      formatConverter: _convertHighlightFormat,
    });

    if (migrated) {
      return stableUrl;
    }

    const supplemented = await _supplementSavedMetadataForStableKey(storageService, url, stableUrl);
    if (supplemented) {
      return stableUrl;
    }

    await _applyInPlaceConversion(storageService, url, oldHighlights);
    return url;
  } catch (error) {
    Logger.warn('遷移至穩定 URL 失敗，回退為原地轉換', {
      action: 'migration_batch',
      url: sanitizeUrlForLogging(url),
      error: error?.message ?? String(error),
    });
    await _applyInPlaceConversion(storageService, url, oldHighlights);
    return url;
  }
}

function _finalizeMigrationResult(reportUrl, oldHighlights) {
  return {
    status: 'success',
    url: sanitizeUrlForLogging(reportUrl),
    count: oldHighlights.length,
    pending: oldHighlights.filter(item => !item.rangeInfo).length,
  };
}

// Phase 4: _migrateUrlKey 已移除 — 邏輯合併進 MigrationService.migrateStorageKey

async function _migrateSingleUrl(url, storageService, migrationService) {
  const snapshot = await _buildStorageSnapshot(url, storageService);
  const extraction = _extractLegacyHighlights(snapshot.legacyData, url);
  if (extraction.skipResult) {
    return extraction.skipResult;
  }

  const { oldHighlights } = extraction;
  let reportUrl = url;

  if (snapshot.shouldMigrateToStable) {
    reportUrl = await _tryStableMigration({
      url,
      stableUrl: snapshot.stableUrl,
      storageService,
      migrationService,
      oldHighlights,
    });
  } else {
    // 原地格式轉換（就地更新現有 key）
    if (snapshot.hasStableUrl) {
      const supplemented = await _supplementSavedMetadataForStableKey(
        storageService,
        url,
        snapshot.stableUrl
      );
      if (supplemented) {
        reportUrl = snapshot.stableUrl;
      }
    }
    await _applyInPlaceConversion(storageService, url, oldHighlights);
  }

  return _finalizeMigrationResult(reportUrl, oldHighlights);
}

/**
 * 驗證特權請求和 URL 安全性（使用共享驗證函數）
 *
 * @param {object} sender - 請求發送者對象
 * @param {string|null} [url=null] - 相關 URL（可選）
 * @returns {object|null} 錯誤對象或 null（驗證通過）
 */
const validatePrivilegedRequest = (sender, url = null) => {
  // 1. 來源驗證：使用共享函數
  const senderError = validateInternalRequest(sender);
  if (senderError) {
    return senderError;
  }

  // 2. URL 驗證：如果提供了 URL，必須是有效的 http 或 https URL
  if (url && !isValidUrl(url)) {
    return { success: false, error: ERROR_MESSAGES.USER_MESSAGES.INVALID_URL_PROTOCOL };
  }

  return null; // 驗證通過
};

/**
 * 創建遷移處理函數
 * 沿用工廠模式，保持與 actionHandlers 一致的依賴注入風格
 *
 * @param {object} services - 服務實例集合
 * @returns {object} 遷移處理函數映射
 */
export function createMigrationHandlers(services) {
  const { migrationService, storageService } = services;

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
    migration_execute: async (request, sender, sendResponse) => {
      try {
        const { url } = request;

        // 安全性驗證
        const validationError = validatePrivilegedRequest(sender, url);
        if (validationError) {
          Logger.warn('安全性阻擋', {
            action: 'migration_execute',
            senderId: sender?.id,
            url: sanitizeUrlForLogging(url),
            error: validationError.error,
          });
          sendResponse(validationError);
          return;
        }

        // 委託給 MigrationService 執行
        const result = await migrationService.executeContentMigration(request, sender);
        sendResponse(result);
      } catch (error) {
        const errorMsg = error?.message ?? String(error);
        Logger.error('遷移失敗', { action: 'migration_execute', error: errorMsg });
        const safeMessage = sanitizeApiError(error, 'migration_execute');
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
      }
    },

    /**
     * 刪除標註數據
     * 從選項頁面發起，刪除指定 URL 的所有標註
     *
     * @param {object} request - 請求對象
     * @param {string} request.url - 目標頁面 URL
     * @param {object} sender - 發送者信息
     * @param {Function} sendResponse - 回調函數
     */
    migration_delete: async (request, sender, sendResponse) => {
      try {
        const { url } = request;

        // 安全性驗證
        const validationError = validatePrivilegedRequest(sender, url);
        if (validationError) {
          Logger.warn('安全性阻擋', {
            action: 'migration_delete',
            senderId: sender?.id,
            url: sanitizeUrlForLogging(url),
            error: validationError.error,
          });
          sendResponse(validationError);
          return;
        }

        if (!url) {
          sendResponse({ success: false, error: ERROR_MESSAGES.USER_MESSAGES.MISSING_URL });
          return;
        }

        Logger.log('開始刪除', { action: 'migration_delete', url: sanitizeUrlForLogging(url) });

        // 同時檢查原始 URL 和穩定 URL 下的 highlights_ 與 saved_ 資料
        const resolvedUrl = computeStableUrl(url);
        const effectiveUrl = resolvedUrl && resolvedUrl !== url ? resolvedUrl : null;

        const [dataAtOriginal, savedAtOriginal] = await Promise.all([
          storageService.getHighlights(url),
          storageService.getSavedPageData(url),
        ]);
        const [dataAtStable, savedAtStable] = effectiveUrl
          ? await Promise.all([
              storageService.getHighlights(effectiveUrl),
              storageService.getSavedPageData(effectiveUrl),
            ])
          : [null, null];

        // 只要任一 key 有資料就視為「存在」
        const hasAnyData = dataAtOriginal || savedAtOriginal || dataAtStable || savedAtStable;
        if (!hasAnyData) {
          sendResponse({ success: true, message: '數據不存在，無需刪除' });
          return;
        }

        // 清理原始 URL 的 keys
        await storageService.clearLegacyKeys(url);
        // 若穩定 URL 不同，也清理穩定 URL 的 keys
        if (effectiveUrl) {
          await storageService.clearLegacyKeys(effectiveUrl);
        }

        Logger.log('刪除完成', { action: 'migration_delete', url: sanitizeUrlForLogging(url) });
        sendResponse({
          success: true,
          message: '成功刪除標註數據',
        });
      } catch (error) {
        const errorMsg = error?.message ?? String(error);
        Logger.error('刪除失敗', { action: 'migration_delete', error: errorMsg });
        const safeMessage = sanitizeApiError(error, 'migration_delete');
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
      }
    },

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
    migration_batch: async (request, sender, sendResponse) => {
      try {
        const { urls } = request;

        // 安全性驗證 (僅驗證來源，URL 在內部檢查)
        const validationError = validatePrivilegedRequest(sender);
        if (validationError) {
          Logger.warn('安全性阻擋', {
            action: 'migration_batch',
            senderId: sender?.id,
            error: validationError.error,
          });
          sendResponse(validationError);
          return;
        }

        if (!urls || !Array.isArray(urls) || urls.length === 0) {
          sendResponse({ success: false, error: ERROR_MESSAGES.USER_MESSAGES.MISSING_URL });
          return;
        }

        // 驗證 URLs 安全性
        const invalidUrls = urls.filter(urlItem => !isValidUrl(urlItem));
        if (invalidUrls.length > 0) {
          sendResponse({
            success: false,
            error: ERROR_MESSAGES.USER_MESSAGES.INVALID_URLS_IN_BATCH,
          });
          return;
        }

        Logger.log('開始批量遷移', { action: 'migration_batch', pageCount: urls.length });

        const results = {
          success: 0,
          failed: 0,
          details: [],
        };

        for (const url of urls) {
          try {
            const itemResult = await _migrateSingleUrl(url, storageService, migrationService);
            results.details.push(itemResult);

            if (itemResult.status === 'success') {
              results.success++;
              Logger.log('批量遷移成功', {
                action: 'migration_batch',
                url: itemResult.url,
                highlightCount: itemResult.count,
              });
            }
          } catch (itemError) {
            results.failed++;
            results.details.push({
              url: sanitizeUrlForLogging(url),
              status: 'failed',
              reason: itemError?.message ?? String(itemError),
            });
            Logger.error('批量遷移失敗', {
              action: 'migration_batch',
              url: sanitizeUrlForLogging(url),
              error: itemError?.message ?? String(itemError),
            });
          }
        }

        Logger.log('批量遷移完成', {
          action: 'migration_batch',
          successCount: results.success,
          failedCount: results.failed,
        });
        sendResponse({ success: true, results });
      } catch (error) {
        const errorMsg = error?.message ?? String(error);
        Logger.error('批量遷移失敗', { action: 'migration_batch', error: errorMsg });
        const safeMessage = sanitizeApiError(error, 'migration_batch');
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
      }
    },

    /**
     * 批量刪除標註數據
     * 一次性刪除多個 URL 的標註數據
     *
     * @param {object} request - 請求對象
     * @param {string[]} request.urls - 目標頁面 URL 列表
     * @param {object} sender - 發送者信息
     * @param {Function} sendResponse - 回調函數
     */
    migration_batch_delete: async (request, sender, sendResponse) => {
      try {
        const { urls } = request;

        // 安全性驗證
        const validationError = validatePrivilegedRequest(sender);
        if (validationError) {
          Logger.warn('安全性阻擋', {
            action: 'migration_batch_delete',
            senderId: sender?.id,
            error: validationError.error,
          });
          sendResponse(validationError);
          return;
        }

        if (!urls || !Array.isArray(urls) || urls.length === 0) {
          sendResponse({ success: false, error: ERROR_MESSAGES.USER_MESSAGES.MISSING_URL });
          return;
        }

        // 驗證 URLs 安全性
        const invalidUrls = urls.filter(urlItem => !isValidUrl(urlItem));
        if (invalidUrls.length > 0) {
          sendResponse({
            success: false,
            error: ERROR_MESSAGES.USER_MESSAGES.INVALID_URLS_IN_BATCH,
          });
          return;
        }

        Logger.log('開始批量刪除', { action: 'migration_batch_delete', pageCount: urls.length });

        // 使用 StorageService.clearLegacyKeys 安全刪除（同時清理 highlights_ + saved_）
        await Promise.all(
          urls.map(async urlItem => {
            const resolvedUrl = computeStableUrl(urlItem);
            await storageService.clearLegacyKeys(urlItem);
            if (resolvedUrl && resolvedUrl !== urlItem) {
              await storageService.clearLegacyKeys(resolvedUrl);
            }
          })
        );

        Logger.log('批量刪除完成', { action: 'migration_batch_delete', pageCount: urls.length });
        sendResponse({
          success: true,
          count: urls.length,
          message: `成功刪除 ${urls.length} 個頁面的標註數據`,
        });
      } catch (error) {
        const errorMsg = error?.message ?? String(error);
        Logger.error('批量刪除失敗', { action: 'migration_batch_delete', error: errorMsg });
        const safeMessage = sanitizeApiError(error, 'migration_batch_delete');
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
      }
    },

    /**
     * 獲取待完成 rangeInfo 的遷移項目
     * 返回待完成項目和失敗項目
     *
     * @param {object} request - 請求對象
     * @param {object} sender - 發送者信息
     * @param {Function} sendResponse - 回調函數
     */
    migration_get_pending: async (request, sender, sendResponse) => {
      try {
        // 安全性驗證
        const validationError = validatePrivilegedRequest(sender);
        if (validationError) {
          Logger.warn('安全性阻擋', {
            action: 'migration_get_pending',
            senderId: sender?.id,
            error: validationError.error,
          });
          sendResponse(validationError);
          return;
        }

        // 使用 StorageService.getAllHighlights() 取代直接操作 chrome.storage.local
        const allHighlights = await storageService.getAllHighlights();
        const pendingItems = [];
        const failedItems = [];

        for (const [url, value] of Object.entries(allHighlights)) {
          const highlights = value?.highlights || (Array.isArray(value) ? value : []);

          // 計算需要 rangeInfo 的標註數量
          const pendingCount = highlights.filter(
            highlight => highlight.needsRangeInfo === true && !highlight.migrationFailed
          ).length;

          // 計算遷移失敗的標註數量
          const failedCount = highlights.filter(
            highlight => highlight.migrationFailed === true
          ).length;

          if (pendingCount > 0) {
            pendingItems.push({ url, totalCount: highlights.length, pendingCount });
          }

          if (failedCount > 0) {
            failedItems.push({ url, totalCount: highlights.length, failedCount });
          }
        }

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
        const errorMsg = error?.message ?? String(error);
        Logger.error('獲取待完成項目失敗', {
          action: 'migration_get_pending',
          error: errorMsg,
        });
        const safeMessage = sanitizeApiError(error, 'migration_get_pending');
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
      }
    },

    /**
     * 刪除指定 URL 的失敗遷移標註
     *
     * @param {object} request - 請求對象
     * @param {string} request.url - 目標頁面 URL
     * @param {object} sender - 發送者信息
     * @param {Function} sendResponse - 回調函數
     */
    migration_delete_failed: async (request, sender, sendResponse) => {
      try {
        const { url } = request;

        // 安全性驗證
        const validationError = validatePrivilegedRequest(sender, url);
        if (validationError) {
          Logger.warn('安全性阻擋', {
            action: 'migration_delete_failed',
            senderId: sender?.id,
            url: sanitizeUrlForLogging(url),
            error: validationError.error,
          });
          sendResponse(validationError);
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

        const highlights = data.highlights || (Array.isArray(data) ? data : []);

        // 過濾掉失敗的標註
        const remainingHighlights = highlights.filter(highlight => !highlight.migrationFailed);
        const deletedCount = highlights.length - remainingHighlights.length;

        if (remainingHighlights.length === 0) {
          // 沒有剩餘標註，僅刪除 highlights_ key
          // 刻意不呼叫 clearLegacyKeys（會連 saved_ 頁面狀態一起刪）
          // 用空陣列更新讓 key 保持結構完整，由呼叫端或 migration_delete 負責後續清理
          await storageService.updateHighlights(url, []);
        } else {
          // 使用 StorageService.updateHighlights 更新（保留其他欄位）
          await storageService.updateHighlights(url, remainingHighlights);
        }

        Logger.log('刪除失敗標註', {
          action: 'migration_delete_failed',
          url: sanitizeUrlForLogging(url),
          deletedCount,
        });
        sendResponse({ success: true, deletedCount });
      } catch (error) {
        const errorMsg = error?.message ?? String(error);
        Logger.error('刪除失敗標註失敗', {
          action: 'migration_delete_failed',
          error: errorMsg,
        });
        const safeMessage = sanitizeApiError(error, 'migration_delete_failed');
        sendResponse({ success: false, error: ErrorHandler.formatUserMessage(safeMessage) });
      }
    },
  };
}
