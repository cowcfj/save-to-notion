import Logger from '../../utils/Logger.js';
import { sanitizeUrlForLogging } from '../../utils/securityUtils.js';
import { ERROR_MESSAGES } from '../../config/messages.js';

export class MigrationService {
  constructor(storageService, tabService, injectionService) {
    this.storageService = storageService;
    this.tabService = tabService;
    this.injectionService = injectionService;
  }

  /**
   * 遷移 Storage Key (原子操作)
   * 將數據從舊 URL Key 移動到新 Stable URL Key，並在成功後刪除舊 Key。
   *
   * @param {string} stableUrl - 新的穩定 URL (目標 Key)
   * @param {string} legacyUrl - 舊的 URL (來源 Key)
   * @returns {Promise<boolean>} - 是否執行了遷移
   */
  async migrateStorageKey(stableUrl, legacyUrl) {
    if (!stableUrl || !legacyUrl || stableUrl === legacyUrl) {
      return false;
    }

    try {
      const pageData = await this.storageService.getSavedPageData(legacyUrl);
      if (!pageData) {
        return false;
      }

      Logger.info('Migrating legacy data to stable URL', {
        legacy: sanitizeUrlForLogging(legacyUrl),
        stable: sanitizeUrlForLogging(stableUrl),
      });

      // 1. 寫入新 Key (Atomic Step 1)
      await this.storageService.setSavedPageData(stableUrl, pageData);

      // 2. 刪除舊 Key (Atomic Step 2)
      // 只有在 Step 1 成功後才執行
      await this.storageService.clearPageState(legacyUrl);

      Logger.info('Migration successful', {
        url: sanitizeUrlForLogging(stableUrl),
      });

      return true;
    } catch (error) {
      Logger.error('Migration failed', {
        error: error.message,
        legacy: sanitizeUrlForLogging(legacyUrl),
        stable: sanitizeUrlForLogging(stableUrl),
      });
      // 如果遷移失敗，保持舊數據不動，確保數據安全
      return false;
    }
  }

  /**
   * 執行內容遷移 (DOM)
   *
   * @param {object} request - 遷移請求
   * @param {object} _sender - 發送者 (unused)
   * @returns {Promise<object>} - 遷移結果
   */
  async executeContentMigration(request, _sender) {
    let createdTabId = null;

    try {
      const { url } = request;

      if (!url) {
        return { success: false, error: ERROR_MESSAGES.USER_MESSAGES.MISSING_URL };
      }

      Logger.log('Starting migration', {
        action: 'executeContentMigration',
        url: sanitizeUrlForLogging(url),
      });

      // 1. Check if data exists
      const data = await this.storageService.getHighlights(url);

      if (!data) {
        return { success: true, message: 'No data to migrate' };
      }

      // 2. Find or create tab
      // We need to use chrome.tabs directly as TabService doesn't expose "create background tab"
      const tabs = await chrome.tabs.query({ url });
      let targetTab = null;

      if (tabs.length > 0) {
        targetTab = tabs[0];
        Logger.log('Using existing tab', {
          action: 'executeContentMigration',
          tabId: targetTab.id,
        });
      } else {
        targetTab = await chrome.tabs.create({
          url,
          active: false,
        });
        createdTabId = targetTab.id;
        Logger.log('Created new tab', { action: 'executeContentMigration', tabId: targetTab.id });

        // Wait for tab to load
        await this._waitForTabLoad(targetTab.id);
      }

      // 3. Inject migration-executor.js using InjectionService
      // We rely on InjectionService to handle the injection details
      Logger.log('Injecting migration executor', {
        action: 'executeContentMigration',
        tabId: targetTab.id,
      });
      await this.injectionService.injectAndExecute(
        targetTab.id,
        ['dist/migration-executor.js'],
        null,
        { errorMessage: 'Failed to inject migration executor' }
      );

      // Wait for script readiness
      await this._waitForScriptReady(targetTab.id);

      // 4. Execute migration
      Logger.log('Executing DOM migration', {
        action: 'executeContentMigration',
        tabId: targetTab.id,
      });
      const migrationResult = await this.injectionService.injectWithResponse(
        targetTab.id,
        async (executorErrorMsg, managerErrorMsg) => {
          // Execute in page context
          if (!globalThis.MigrationExecutor) {
            return { error: executorErrorMsg };
          }

          if (!globalThis.HighlighterV2?.manager) {
            return { error: managerErrorMsg };
          }

          const executor = new globalThis.MigrationExecutor();
          const manager = globalThis.HighlighterV2.manager;

          const outcome = await executor.migrate(manager);
          const stats = executor.getStatistics();

          return {
            success: true,
            result: outcome,
            statistics: stats,
          };
        },
        [],
        [
          ERROR_MESSAGES.USER_MESSAGES.MIGRATION_EXECUTOR_NOT_LOADED,
          ERROR_MESSAGES.USER_MESSAGES.HIGHLIGHTER_MANAGER_NOT_INITIALIZED,
        ]
      );

      const execResult = migrationResult; // injectWithResponse returns the result directly

      if (execResult?.error) {
        throw new Error(execResult.error);
      }

      const stats = execResult?.statistics || {};
      Logger.log('Migration completed', {
        action: 'executeContentMigration',
        url: sanitizeUrlForLogging(url),
        ...stats,
      });

      return {
        success: true,
        count: stats.newHighlightsCreated || 0,
        message: `Successfully migrated ${stats.newHighlightsCreated || 0} highlights`,
        statistics: stats,
      };
    } catch (error) {
      const errorMsg = error?.message ?? String(error);
      Logger.error('Migration failed', { action: 'executeContentMigration', error: errorMsg });
      throw error; // Re-throw to let handler handle the error response format
    } finally {
      // 5. Cleanup
      if (createdTabId) {
        Logger.log('Closing tab', { action: 'executeContentMigration', tabId: createdTabId });
        await chrome.tabs.remove(createdTabId).catch(() => {});
      }
    }
  }

  /**
   * Helper: Wait for tab to complete loading
   * Private helper since TabService._waitForTabCompilation is private
   *
   * @param {number} tabId
   */
  async _waitForTabLoad(tabId) {
    return new Promise((resolve, reject) => {
      const TIMEOUT_MS = 15_000;
      let timeoutId = null;

      const listener = (tid, changeInfo) => {
        if (tid === tabId && changeInfo.status === 'complete') {
          cleanup();
          resolve();
        }
      };

      const cleanup = () => {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timeoutId);
      };

      chrome.tabs.onUpdated.addListener(listener);

      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Tab loading timed out (${TIMEOUT_MS}ms)`));
      }, TIMEOUT_MS);

      // Check current status
      chrome.tabs
        .get(tabId)
        .then(tab => {
          if (tab?.status === 'complete') {
            cleanup();
            resolve();
          }
        })
        .catch(() => {});
    });
  }

  /**
   * Helper: Wait for migration script to be ready
   *
   * @param {number} tabId
   * @returns {Promise<boolean>}
   */
  async _waitForScriptReady(tabId) {
    const maxRetries = 10;
    const retryDelay = 200;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await this.injectionService.injectWithResponse(
          tabId,
          () => ({
            ready:
              globalThis.MigrationExecutor !== undefined &&
              globalThis.HighlighterV2?.manager !== undefined,
          }),
          [],
          { returnResult: true }
        );

        if (result?.ready) {
          return true;
        }
      } catch {
        // Ignore errors during check
      }
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
    throw new Error('Migration executor script load timeout');
  }
}
