/**
 * Migration Handlers
 *
 * 處理舊版標註數據遷移的所有操作。
 * 抽取自 actionHandlers.js，便於維護和未來整體移除。
 *
 * @module handlers/migrationHandlers
 */

/* global chrome, Logger */

import { validateInternalRequest, isValidUrl } from '../../utils/securityUtils.js';
import { ERROR_MESSAGES } from '../../config/constants.js';

/**
 * 創建遷移處理函數
 * 沿用工廠模式，保持與 actionHandlers 一致的依賴注入風格
 *
 * @param {Object} services - 服務實例集合（目前未使用，保留擴展性）
 * @returns {Object} 遷移處理函數映射
 */
// eslint-disable-next-line no-unused-vars
export function createMigrationHandlers(services) {
  // 輔助函數：驗證特權請求和 URL 安全性（使用共享驗證函數）
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

  // 輔助函數：清理錯誤訊息以安全回傳，移除路徑並限制長度
  const sanitizeError = error => {
    const message = error instanceof Error ? error.message : String(error);
    return message
      .replace(/(\/[a-zA-Z0-9._-]+)+/g, '[PATH]') // 遮蔽 Unix 風格路徑
      .replace(/([a-zA-Z]:\\[a-zA-Z0-9._\-\\]+)/g, '[PATH]') // 遮蔽 Windows 風格路徑
      .slice(0, 200); // 限制長度
  };

  return {
    /**
     * 執行標註數據遷移
     * 從選項頁面發起，將舊版標註升級為現代格式
     * 使用 Headless Tab 策略：在後台分頁中執行 DOM 感知的遷移
     */
    migration_execute: async (request, sender, sendResponse) => {
      let createdTabId = null;

      try {
        const { url } = request;

        // 安全性驗證
        const validationError = validatePrivilegedRequest(sender, url);
        if (validationError) {
          Logger.warn(`⚠️ [Migration] 安全性阻擋: ${validationError.error}`, { sender, url });
          sendResponse(validationError);
          return;
        }

        if (!url) {
          sendResponse({ success: false, error: ERROR_MESSAGES.USER_MESSAGES.MISSING_URL });
          return;
        }

        Logger.log(`🔄 [Migration] 開始遷移: ${url}`);

        // 1. 檢查數據是否存在
        const pageKey = `highlights_${url}`;
        const result = await chrome.storage.local.get(pageKey);
        const data = result[pageKey];

        if (!data) {
          sendResponse({ success: true, message: '無數據需要遷移' });
          return;
        }

        // 2. 查找或創建分頁
        const tabs = await chrome.tabs.query({ url });
        let targetTab = null;

        if (tabs.length > 0) {
          // 使用已存在的分頁
          targetTab = tabs[0];
          Logger.log(`📌 [Migration] 使用已存在的分頁: ${targetTab.id}`);
        } else {
          // 創建新的後台分頁（不激活）
          targetTab = await chrome.tabs.create({
            url,
            active: false,
          });
          createdTabId = targetTab.id;
          Logger.log(`🆕 [Migration] 創建新分頁: ${targetTab.id}`);

          // 等待分頁加載完成 (帶超時保護)
          await new Promise((resolve, reject) => {
            const TIMEOUT_MS = 15000;
            let timeoutId = null;
            let listener = null;

            /**
             * 清理監聽器和計時器
             */
            const cleanup = () => {
              if (listener && chrome.tabs.onUpdated.hasListener(listener)) {
                chrome.tabs.onUpdated.removeListener(listener);
              }
              if (timeoutId) {
                clearTimeout(timeoutId);
              }
            };

            /**
             * 監聽分頁更新狀態的回調函數
             * @param {number} tabId - 更新的分頁 ID
             * @param {object} changeInfo - 分頁變更信息
             */
            listener = (tabId, changeInfo) => {
              if (tabId === targetTab.id && changeInfo.status === 'complete') {
                cleanup();
                resolve();
              }
            };

            // 設置監聽器
            chrome.tabs.onUpdated.addListener(listener);

            // 設置超時
            timeoutId = setTimeout(() => {
              cleanup();
              reject(new Error(`分頁加載超時 (${TIMEOUT_MS}ms)`));
            }, TIMEOUT_MS);

            // 檢查分頁當前狀態 (處理競態條件)
            chrome.tabs
              .get(targetTab.id)
              .then(tab => {
                if (tab && tab.status === 'complete') {
                  cleanup();
                  resolve();
                }
              })
              .catch(error => {
                // 如果分頁無法獲取 (例如已關閉)，則報錯
                cleanup();
                reject(new Error(`無法獲取分頁狀態: ${error.message}`));
              });
          });
        }

        // 3. 注入 migration-executor.js
        Logger.log(`💉 [Migration] 注入遷移執行器到分頁: ${targetTab.id}`);
        await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          files: ['dist/migration-executor.js'],
        });

        // 等待腳本就緒（輪詢機制）
        const maxRetries = 10;
        const retryDelay = 200; // ms
        let scriptReady = false;

        for (let i = 0; i < maxRetries; i++) {
          try {
            const checkResult = await chrome.scripting.executeScript({
              target: { tabId: targetTab.id },
              func: () => {
                return {
                  ready:
                    typeof window.MigrationExecutor !== 'undefined' &&
                    typeof window.HighlighterV2?.manager !== 'undefined',
                };
              },
            });

            if (checkResult[0]?.result?.ready) {
              scriptReady = true;
              Logger.log(`[Migration] 腳本就緒（嘗試 ${i + 1} 次）`);
              break;
            }
          } catch (_checkError) {
            // 腳本還未就緒，繼續重試
          }

          if (i < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }

        if (!scriptReady) {
          throw new Error('遷移執行器腳本載入超時');
        }

        // 4. 執行遷移
        Logger.log('🚀 [Migration] 執行 DOM 遷移...');
        const migrationResult = await chrome.scripting.executeScript({
          target: { tabId: targetTab.id },
          func: async (executorErrorMsg, managerErrorMsg) => {
            // 在分頁上下文中執行
            if (!window.MigrationExecutor) {
              return { error: executorErrorMsg };
            }

            if (!window.HighlighterV2?.manager) {
              return { error: managerErrorMsg };
            }

            const executor = new window.MigrationExecutor();
            const manager = window.HighlighterV2.manager;

            // 執行遷移
            const outcome = await executor.migrate(manager);
            const stats = executor.getStatistics();

            return {
              success: true,
              result: outcome,
              statistics: stats,
            };
          },
          args: [
            ERROR_MESSAGES.USER_MESSAGES.MIGRATION_EXECUTOR_NOT_LOADED,
            ERROR_MESSAGES.USER_MESSAGES.HIGHLIGHTER_MANAGER_NOT_INITIALIZED,
          ],
        });

        const execResult = migrationResult[0]?.result;

        if (execResult?.error) {
          throw new Error(execResult.error);
        }

        // 5. 返回結果
        const stats = execResult?.statistics || {};
        Logger.log(`✅ [Migration] 遷移完成: ${url}`, stats);

        sendResponse({
          success: true,
          count: stats.newHighlightsCreated || 0,
          message: `成功遷移 ${stats.newHighlightsCreated || 0} 個標註`,
          statistics: stats,
        });
      } catch (error) {
        Logger.error('❌ [Migration] 遷移失敗:', error);
        sendResponse({ success: false, error: sanitizeError(error) });
      } finally {
        // 6. 清理創建的分頁（無論成功或失敗）
        if (createdTabId) {
          Logger.log(`🧹 [Migration] 關閉分頁: ${createdTabId}`);
          try {
            const tab = await chrome.tabs.get(createdTabId).catch(() => null);
            if (tab) {
              await chrome.tabs.remove(createdTabId);
            }
          } catch (cleanupError) {
            Logger.warn(
              `[Migration] 清理分頁 ${createdTabId} 失敗 (可能已關閉):`,
              cleanupError.message
            );
          } finally {
            createdTabId = null;
          }
        }
      }
    },

    /**
     * 刪除標註數據
     * 從選項頁面發起，刪除指定 URL 的所有標註
     */
    migration_delete: async (request, sender, sendResponse) => {
      try {
        const { url } = request;

        // 安全性驗證
        const validationError = validatePrivilegedRequest(sender, url);
        if (validationError) {
          Logger.warn(`⚠️ [Migration] 安全性阻擋: ${validationError.error}`, { sender, url });
          sendResponse(validationError);
          return;
        }

        if (!url) {
          sendResponse({ success: false, error: ERROR_MESSAGES.USER_MESSAGES.MISSING_URL });
          return;
        }

        Logger.log(`🗑️ [Migration] 開始刪除: ${url}`);

        const pageKey = `highlights_${url}`;

        // 檢查數據是否存在
        const result = await chrome.storage.local.get(pageKey);
        const data = result[pageKey];

        if (!data) {
          sendResponse({ success: true, message: '數據不存在，無需刪除' });
          return;
        }

        // 刪除數據
        await chrome.storage.local.remove(pageKey);

        Logger.log(`✅ [Migration] 刪除完成: ${url}`);
        sendResponse({
          success: true,
          message: '成功刪除標註數據',
        });
      } catch (error) {
        Logger.error('❌ [Migration] 刪除失敗:', error);
        sendResponse({ success: false, error: sanitizeError(error) });
      }
    },

    /**
     * 批量遷移標註數據
     * 直接在 Storage 中轉換格式，標記 needsRangeInfo
     * 用戶訪問頁面時會自動完成 rangeInfo 生成
     */
    migration_batch: async (request, sender, sendResponse) => {
      try {
        const { urls } = request;

        // 安全性驗證 (僅驗證來源，URL 在內部檢查)
        const validationError = validatePrivilegedRequest(sender);
        if (validationError) {
          Logger.warn(`⚠️ [Migration] 安全性阻擋: ${validationError.error}`, { sender });
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

        Logger.log(`📦 [Migration] 開始批量遷移: ${urls.length} 個頁面`);

        const results = {
          success: 0,
          failed: 0,
          details: [],
        };

        for (const url of urls) {
          try {
            const pageKey = `highlights_${url}`;
            const storageResult = await chrome.storage.local.get(pageKey);
            const data = storageResult[pageKey];

            if (!data) {
              results.details.push({ url, status: 'skipped', reason: '無數據' });
              continue;
            }

            // 提取標註數據（支持新舊格式）
            const oldHighlights = data.highlights || (Array.isArray(data) ? data : []);

            if (oldHighlights.length === 0) {
              results.details.push({ url, status: 'skipped', reason: '無標註' });
              continue;
            }

            // 轉換格式：對於沒有 rangeInfo 的項目添加 needsRangeInfo 標記
            const newHighlights = oldHighlights.map(item => ({
              ...item,
              needsRangeInfo: !item.rangeInfo,
            }));

            // 保存新格式數據
            await chrome.storage.local.set({
              [pageKey]: { url, highlights: newHighlights },
            });

            results.success++;
            results.details.push({
              url,
              status: 'success',
              count: newHighlights.length,
              pending: newHighlights.filter(highlight => highlight.needsRangeInfo).length,
            });

            Logger.log(`✅ [Migration] 批量遷移: ${url} (${newHighlights.length} 個標註)`);
          } catch (itemError) {
            results.failed++;
            results.details.push({ url, status: 'failed', reason: itemError.message });
            Logger.error(`❌ [Migration] 批量遷移失敗: ${url}`, itemError);
          }
        }

        Logger.log(`📦 [Migration] 批量遷移完成: 成功 ${results.success}, 失敗 ${results.failed}`);
        sendResponse({ success: true, results });
      } catch (error) {
        Logger.error('❌ [Migration] 批量遷移失敗:', error);
        sendResponse({ success: false, error: sanitizeError(error) });
      }
    },

    /**
     * 批量刪除標註數據
     * 一次性刪除多個 URL 的標註數據
     */
    migration_batch_delete: async (request, sender, sendResponse) => {
      try {
        const { urls } = request;

        // 安全性驗證
        const validationError = validatePrivilegedRequest(sender);
        if (validationError) {
          Logger.warn(`⚠️ [Migration] 安全性阻擋: ${validationError.error}`, { sender });
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

        Logger.log(`🗑️ [Migration] 開始批量刪除: ${urls.length} 個頁面`);

        const keysToRemove = urls.map(url => `highlights_${url}`);
        await chrome.storage.local.remove(keysToRemove);

        Logger.log(`✅ [Migration] 批量刪除完成: ${urls.length} 個頁面`);
        sendResponse({
          success: true,
          count: urls.length,
          message: `成功刪除 ${urls.length} 個頁面的標註數據`,
        });
      } catch (error) {
        Logger.error('❌ [Migration] 批量刪除失敗:', error);
        sendResponse({ success: false, error: sanitizeError(error) });
      }
    },

    /**
     * 獲取待完成 rangeInfo 的遷移項目
     * 返回待完成項目和失敗項目
     */
    migration_get_pending: async (request, sender, sendResponse) => {
      try {
        // 安全性驗證
        const validationError = validatePrivilegedRequest(sender);
        if (validationError) {
          Logger.warn(`⚠️ [Migration] 安全性阻擋: ${validationError.error}`, { sender });
          sendResponse(validationError);
          return;
        }

        const allData = await chrome.storage.local.get(null);
        const pendingItems = [];
        const failedItems = [];

        for (const [key, value] of Object.entries(allData)) {
          if (!key.startsWith('highlights_')) {
            continue;
          }

          const url = key.replace('highlights_', '');
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
            pendingItems.push({
              url,
              totalCount: highlights.length,
              pendingCount,
            });
          }

          if (failedCount > 0) {
            failedItems.push({
              url,
              totalCount: highlights.length,
              failedCount,
            });
          }
        }

        Logger.log(
          `📋 [Migration] 待完成: ${pendingItems.length} 頁, 失敗: ${failedItems.length} 頁`
        );
        sendResponse({
          success: true,
          items: pendingItems,
          failedItems,
          totalPages: pendingItems.length,
          totalPending: pendingItems.reduce((sum, item) => sum + item.pendingCount, 0),
          totalFailed: failedItems.reduce((sum, item) => sum + item.failedCount, 0),
        });
      } catch (error) {
        Logger.error('❌ [Migration] 獲取待完成項目失敗:', error);
        sendResponse({ success: false, error: sanitizeError(error) });
      }
    },

    /**
     * 刪除指定 URL 的失敗遷移標註
     */
    migration_delete_failed: async (request, sender, sendResponse) => {
      try {
        const { url } = request;

        // 安全性驗證
        const validationError = validatePrivilegedRequest(sender, url);
        if (validationError) {
          Logger.warn(`⚠️ [Migration] 安全性阻擋: ${validationError.error}`, { sender, url });
          sendResponse(validationError);
          return;
        }

        if (!url) {
          sendResponse({ success: false, error: ERROR_MESSAGES.USER_MESSAGES.MISSING_URL });
          return;
        }

        const key = `highlights_${url}`;
        const result = await chrome.storage.local.get(key);

        if (!result[key]) {
          sendResponse({ success: false, error: ERROR_MESSAGES.USER_MESSAGES.NO_HIGHLIGHT_DATA });
          return;
        }

        const data = result[key];
        const highlights = data.highlights || (Array.isArray(data) ? data : []);

        // 過濾掉失敗的標註
        const remainingHighlights = highlights.filter(highlight => !highlight.migrationFailed);

        const deletedCount = highlights.length - remainingHighlights.length;

        if (remainingHighlights.length === 0) {
          // 沒有剩餘標註，刪除整個 key
          await chrome.storage.local.remove(key);
        } else {
          // 更新數據：確保格式正確，避免舊數組格式导致鍵值污染
          const newData = Array.isArray(data)
            ? { url, highlights: remainingHighlights }
            : { ...data, highlights: remainingHighlights };

          await chrome.storage.local.set({
            [key]: newData,
          });
        }

        Logger.log(`🗑️ [Migration] 刪除失敗標註: ${url}, 數量: ${deletedCount}`);
        sendResponse({ success: true, deletedCount });
      } catch (error) {
        Logger.error('❌ [Migration] 刪除失敗標註失敗:', error);
        sendResponse({ success: false, error: sanitizeError(error) });
      }
    },
  };
}
