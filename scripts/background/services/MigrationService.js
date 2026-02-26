import Logger from '../../utils/Logger.js';
import { sanitizeUrlForLogging } from '../../utils/securityUtils.js';
import { isRootUrl } from '../../utils/urlUtils.js';
import { ERROR_MESSAGES } from '../../config/messages.js';

const MIGRATION_CONFIG = Object.freeze({
  SCRIPT_READY_MAX_RETRIES: 10,
  SCRIPT_READY_RETRY_DELAY: 200,
});

/**
 * Migration 服務
 * 負責處理跨版本升級的數據遷移與初始化
 */
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
   * @param {object} [options={}] - 遷移選項
   * @param {boolean} [options.convertFormat=false] - 是否在遷移時轉換 highlights 格式
   * @param {Function|null} [options.formatConverter=null] - highlights 格式轉換函式（可為 sync 或 async）
   * @returns {Promise<boolean>} - 是否執行了遷移
   */
  async migrateStorageKey(stableUrl, legacyUrl, options = {}) {
    const { convertFormat = false, formatConverter = null } = options;

    if (!stableUrl || !legacyUrl || stableUrl === legacyUrl) {
      return false;
    }

    // 防禦層 1：拒絕遷移到根路徑 URL（首頁），防止不同頁面資料被覆寫到同一 key
    if (isRootUrl(stableUrl)) {
      Logger.warn('Blocked migration to root URL', {
        stable: sanitizeUrlForLogging(stableUrl),
        legacy: sanitizeUrlForLogging(legacyUrl),
      });
      return false;
    }

    try {
      // 並行取得 saved 和 highlights 數據
      const [pageData, highlights] = await Promise.all([
        this.storageService.getSavedPageData(legacyUrl),
        this.storageService.getHighlights(legacyUrl),
      ]);

      // 兩者皆無 → 不需遷移
      if (!pageData && !highlights) {
        return false;
      }

      // 防禦層 2：目標 key 已有資料時拒絕覆寫（防止不同文章頁的資料互相破壞）
      const [existingHighlights, existingPageData] = await Promise.all([
        this.storageService.getHighlights(stableUrl),
        this.storageService.getSavedPageData(stableUrl),
      ]);
      if ((existingHighlights && existingHighlights.length > 0) || existingPageData) {
        Logger.warn('Migration target already has data, skipping to prevent overwrite', {
          stable: sanitizeUrlForLogging(stableUrl),
          legacy: sanitizeUrlForLogging(legacyUrl),
          existingHighlightsCount: existingHighlights?.length ?? 0,
          hasExistingPageData: Boolean(existingPageData),
        });
        return false;
      }

      const { migratedHighlights, formatConverted } = await this._resolveMigratedHighlights({
        highlights,
        convertFormat,
        formatConverter,
        stableUrl,
        legacyUrl,
      });

      Logger.info('Migrating legacy data to stable URL', {
        legacy: sanitizeUrlForLogging(legacyUrl),
        stable: sanitizeUrlForLogging(stableUrl),
        hasPageData: Boolean(pageData),
        hasHighlights: Boolean(highlights),
        formatConverted,
      });

      // 1. 原子寫入新 Key（全部成功後才刪除舊 key）
      await this.storageService.savePageDataAndHighlights(stableUrl, pageData, migratedHighlights);

      // 2. 刪除舊 Key（使用 clearLegacyKeys 避免誤刪新寫入的 stable URL key）
      // clearLegacyKeys 僅刪除 saved_<normalizedUrl> 和 highlights_<normalizedUrl>，
      // 不會呼叫 computeStableUrl，確保不會與新寫入的 stableUrl key 衝突
      await this.storageService.clearLegacyKeys(legacyUrl);

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
   * 解析遷移時的 highlights（可選格式轉換）
   *
   * @param {object} params
   * @param {Array|null} params.highlights
   * @param {boolean} params.convertFormat
   * @param {Function|null} params.formatConverter
   * @param {string} params.stableUrl
   * @param {string} params.legacyUrl
   * @returns {Promise<{ migratedHighlights: Array|null, formatConverted: boolean }>}
   */
  async _resolveMigratedHighlights({
    highlights,
    convertFormat,
    formatConverter,
    stableUrl,
    legacyUrl,
  }) {
    const canConvert = convertFormat && Array.isArray(highlights) && highlights.length > 0;
    if (!canConvert) {
      return { migratedHighlights: highlights, formatConverted: false };
    }

    if (typeof formatConverter !== 'function') {
      Logger.warn('convertFormat enabled without a valid formatConverter, skipping conversion', {
        stable: sanitizeUrlForLogging(stableUrl),
        legacy: sanitizeUrlForLogging(legacyUrl),
      });
      return { migratedHighlights: highlights, formatConverted: false };
    }

    const migratedHighlights = await formatConverter(highlights);
    if (!Array.isArray(migratedHighlights)) {
      throw new TypeError('formatConverter must return an array');
    }

    return { migratedHighlights, formatConverted: true };
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
      // 使用 queryTabs({}) 獲取所有 tabs 後手動過濾，避免 chrome.tabs.query({ url }) 的 match patterns 行為
      // 導致特殊字符 URL 匹配失敗或誤匹配
      const tabs = await this.tabService.queryTabs({});
      let targetTab = tabs.find(tab => tab.url === url);

      if (targetTab) {
        Logger.log('Using existing tab', {
          action: 'executeContentMigration',
          tabId: targetTab.id,
        });
      } else {
        targetTab = await this.tabService.createTab({
          url,
          active: false,
        });
        createdTabId = targetTab.id;
        Logger.log('Created new tab', { action: 'executeContentMigration', tabId: targetTab.id });

        // Wait for tab to load if not already complete
        // 即使 createTab 返回時 status 為 complete，仍建議確保其內容腳本環境準備就緒
        if (targetTab.status !== 'complete') {
          await this.tabService.waitForTabComplete(targetTab.id);
        }
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

      if (migrationResult?.error) {
        throw new Error(migrationResult.error);
      }

      const stats = migrationResult?.statistics || {};
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
        await this.tabService.removeTab(createdTabId).catch(() => {});
      }
    }
  }

  /**
   * Helper: Wait for migration script to be ready
   *
   * @param {number} tabId
   * @returns {Promise<boolean>}
   * @throws {Error} 當遷移執行腳本未能在配置的重試次數內載入時拋出包含 tabId 及重試次數之超時錯誤
   */
  async _waitForScriptReady(tabId) {
    const maxRetries = MIGRATION_CONFIG.SCRIPT_READY_MAX_RETRIES;
    const retryDelay = MIGRATION_CONFIG.SCRIPT_READY_RETRY_DELAY;

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
          []
        );

        if (result?.ready) {
          return true;
        }
      } catch {
        // Ignore errors during check
      }
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    throw new Error(
      `Migration executor script load timeout for tabId: ${tabId} after ${maxRetries} retries`
    );
  }
}
