import Logger from '../../utils/Logger.js';
import { sanitizeUrlForLogging } from '../../utils/securityUtils.js';
import { isRootUrl, computeStableUrl } from '../../utils/urlUtils.js';
import { ERROR_MESSAGES } from '../../config/messages.js';
import { hasNotionData, isSameNotionPage } from '../utils/migrationMetadataUtils.js';

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
      const [pageData, legacyHighlightsRaw] = await Promise.all([
        this.storageService.getSavedPageData(legacyUrl),
        this.storageService.getHighlights(legacyUrl),
      ]);
      const legacyHighlights = this._normalizeHighlights(legacyHighlightsRaw);

      // 兩者皆無 → 不需遷移
      if (!pageData && legacyHighlights.length === 0) {
        return false;
      }

      // 防禦層 2：目標 key 已有資料時拒絕覆寫（防止不同文章頁的資料互相破壞）
      const [existingHighlightsRaw, existingPageData] = await Promise.all([
        this.storageService.getHighlights(stableUrl),
        this.storageService.getSavedPageData(stableUrl),
      ]);
      const existingHighlights = this._normalizeHighlights(existingHighlightsRaw);
      if (existingHighlights.length > 0 || existingPageData) {
        const supplementedNotion = await this._supplementStableNotionIfNeeded({
          stableUrl,
          legacyUrl,
          stableSavedData: existingPageData,
          legacySavedData: pageData,
        });

        await this._setUrlAliasSafe(legacyUrl, stableUrl);

        Logger.warn('Migration target already has data, skipping highlight overwrite', {
          stable: sanitizeUrlForLogging(stableUrl),
          legacy: sanitizeUrlForLogging(legacyUrl),
          existingHighlightsCount: existingHighlights.length,
          hasExistingPageData: Boolean(existingPageData),
          supplementedNotion,
        });
        return supplementedNotion;
      }

      const { migratedHighlights, formatConverted } = await this._resolveMigratedHighlights({
        highlights: legacyHighlights,
        convertFormat,
        formatConverter,
        stableUrl,
        legacyUrl,
      });

      Logger.info('Migrating legacy data to stable URL', {
        legacy: sanitizeUrlForLogging(legacyUrl),
        stable: sanitizeUrlForLogging(stableUrl),
        hasPageData: Boolean(pageData),
        hasHighlights: legacyHighlights.length > 0,
        formatConverted,
      });

      // 1. 原子寫入新 Key（全部成功後才刪除舊 key）
      await this.storageService.savePageDataAndHighlights(stableUrl, pageData, migratedHighlights);

      await this._setUrlAliasSafe(legacyUrl, stableUrl);

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
   * stable 已有 highlights 時，只補 notion metadata（不覆寫 highlights）
   *
   * @param {object} params
   * @param {string} params.stableUrl
   * @param {string} params.legacyUrl
   * @param {object|null} params.stableSavedData
   * @param {object|null} params.legacySavedData
   * @returns {Promise<boolean>} 是否有補遷移 saved metadata
   * @private
   */
  async _supplementStableNotionIfNeeded(params) {
    const { stableUrl, legacyUrl, stableSavedData, legacySavedData } = params;

    const hasStableNotion = hasNotionData(stableSavedData);
    const hasLegacyNotion = hasNotionData(legacySavedData);

    if (!hasStableNotion && hasLegacyNotion) {
      await this.storageService.setSavedPageData(stableUrl, legacySavedData);
      Logger.info('Supplemented notion metadata on stable URL', {
        stable: sanitizeUrlForLogging(stableUrl),
        legacy: sanitizeUrlForLogging(legacyUrl),
      });
      return true;
    }

    const samePage = isSameNotionPage(stableSavedData, legacySavedData);
    if (hasStableNotion && hasLegacyNotion && samePage === false) {
      Logger.warn('Stable/legacy notion metadata conflict, keeping stable data', {
        stable: sanitizeUrlForLogging(stableUrl),
        legacy: sanitizeUrlForLogging(legacyUrl),
      });
    }

    return false;
  }

  /**
   * 設定 url_alias（失敗不阻斷主流程）
   *
   * @param {string} legacyUrl
   * @param {string} stableUrl
   * @returns {Promise<void>}
   * @private
   */
  async _setUrlAliasSafe(legacyUrl, stableUrl) {
    if (typeof this.storageService.setUrlAlias !== 'function') {
      return;
    }
    await Promise.resolve(this.storageService.setUrlAlias(legacyUrl, stableUrl)).catch(error => {
      Logger.warn('Failed to set URL alias during migration', {
        legacy: sanitizeUrlForLogging(legacyUrl),
        stable: sanitizeUrlForLogging(stableUrl),
        error: error?.message ?? String(error),
      });
    });
  }

  /**
   * 將 highlights 讀取結果正規化為陣列。
   *
   * StorageService.getHighlights 在過渡期可能返回：
   * - page_*：陣列
   * - highlights_*：{ highlights: [...] } 或其他 legacy 形狀
   *
   * @param {any} value
   * @returns {Array}
   */
  _normalizeHighlights(value) {
    if (Array.isArray(value)) {
      return value;
    }
    if (value && typeof value === 'object' && Array.isArray(value.highlights)) {
      return value.highlights;
    }
    return [];
  }

  /**
   * 解析遷移時的 highlights（可選格式轉換）
   *
   * @param {object} params
   * @param {Array} params.highlights
   * @param {boolean} params.convertFormat
   * @param {Function|null} params.formatConverter
   * @param {string} params.stableUrl
   * @param {string} params.legacyUrl
   * @returns {Promise<{ migratedHighlights: Array, formatConverted: boolean }>}
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
      const migrationExecutionError = this._resolveMigrationExecutionError(migrationResult);
      if (migrationExecutionError) {
        throw new Error(migrationExecutionError);
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
   * 解析頁面端遷移結果中的明確失敗訊號。
   *
   * @param {object} migrationResult
   * @returns {string|null}
   * @private
   */
  _resolveMigrationExecutionError(migrationResult) {
    const outcome = migrationResult?.result;
    if (outcome?.error) {
      return outcome.error;
    }
    if (outcome?.rolledBack) {
      return outcome.reason ? `Migration rolled back: ${outcome.reason}` : 'Migration rolled back';
    }
    return null;
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

  // =====================================================
  // 批量遷移路徑（原 migrationHandlers helpers）
  // =====================================================

  /**
   * 遷移單一 URL 的批量遷移入口（供 migration_batch handler 呼叫）
   *
   * @param {string} url - 待遷移的 URL
   * @returns {Promise<object>} 遷移結果
   */
  async migrateBatchUrl(url) {
    const snapshot = await this._buildStorageSnapshot(url);
    const extraction = MigrationService._extractLegacyHighlights(snapshot.legacyData, url);
    if (extraction.skipResult) {
      return extraction.skipResult;
    }

    const { oldHighlights } = extraction;
    let reportUrl = url;

    if (snapshot.shouldMigrateToStable) {
      reportUrl = await this._tryBatchStableMigration({
        url,
        stableUrl: snapshot.stableUrl,
        oldHighlights,
      });
    } else {
      // 原地格式轉換（就地更新現有 key）
      if (snapshot.hasStableUrl) {
        const supplemented = await this._supplementBatchSavedMetadata(url, snapshot.stableUrl);
        if (supplemented) {
          reportUrl = snapshot.stableUrl;
        }
      }
      await this._applyInPlaceConversion(url, oldHighlights);
    }

    return MigrationService._finalizeBatchResult(reportUrl, oldHighlights);
  }

  /**
   * 建構 storage 快照：同時讀取 legacy key 和 stable key 的數據
   *
   * @param {string} url
   * @returns {Promise<object>}
   * @private
   */
  async _buildStorageSnapshot(url) {
    const stableUrl = computeStableUrl(url);
    const hasStableUrl = Boolean(stableUrl && stableUrl !== url);
    const [legacyData, stableData] = await Promise.all([
      this.storageService.getHighlights(url),
      hasStableUrl ? this.storageService.getHighlights(stableUrl) : Promise.resolve(null),
    ]);
    const stableHighlights = this._normalizeHighlights(stableData);

    return {
      stableUrl,
      hasStableUrl,
      legacyData,
      shouldMigrateToStable: Boolean(hasStableUrl && stableHighlights.length === 0),
    };
  }

  /**
   * 提取並驗證舊版 highlights
   *
   * @param {any} data
   * @param {string} url
   * @returns {{ skipResult?: object, oldHighlights?: Array }}
   * @private
   */
  static _extractLegacyHighlights(data, url) {
    if (!data) {
      return {
        skipResult: {
          status: 'skipped',
          reason: '無數據',
          url: sanitizeUrlForLogging(url),
        },
      };
    }

    let oldHighlights = [];
    if (Array.isArray(data)) {
      oldHighlights = data;
    } else if (Array.isArray(data?.highlights)) {
      oldHighlights = data.highlights;
    }

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

  /**
   * 對沒有 rangeInfo 的項目加上 needsRangeInfo 標記（純函數）
   *
   * @param {Array} highlights
   * @returns {Array}
   * @private
   */
  static _convertHighlightFormat(highlights) {
    return highlights.map(item => ({
      ...item,
      needsRangeInfo: !item.rangeInfo,
    }));
  }

  /**
   * 原地格式轉換（就地更新現有 key）
   *
   * @param {string} url
   * @param {Array} oldHighlights
   * @returns {Promise<void>}
   * @private
   */
  async _applyInPlaceConversion(url, oldHighlights) {
    const converted = MigrationService._convertHighlightFormat(oldHighlights);
    await this.storageService.updateHighlights(url, converted);
  }

  /**
   * 補遷移 Notion saved metadata 到穩定 URL（批量遷移路徑用）
   * 同時設定 URL alias
   *
   * @param {string} originalUrl
   * @param {string} stableUrl
   * @returns {Promise<boolean>} 是否已補遷移
   * @private
   */
  async _supplementBatchSavedMetadata(originalUrl, stableUrl) {
    if (!stableUrl || stableUrl === originalUrl) {
      return false;
    }

    const [stableSavedData, legacySavedData] = await Promise.all([
      this.storageService.getSavedPageData(stableUrl),
      this.storageService.getSavedPageData(originalUrl),
    ]);

    const hasStableNotion = hasNotionData(stableSavedData);
    const hasLegacyNotion = hasNotionData(legacySavedData);

    let supplemented = false;
    if (!hasStableNotion && hasLegacyNotion) {
      await this.storageService.setSavedPageData(stableUrl, legacySavedData);
      Logger.info('已補遷移 saved metadata 到穩定 URL', {
        action: 'migration_batch',
        from: sanitizeUrlForLogging(originalUrl),
        to: sanitizeUrlForLogging(stableUrl),
      });
      supplemented = true;
    } else if (hasStableNotion && hasLegacyNotion) {
      const samePage = isSameNotionPage(stableSavedData, legacySavedData);
      if (samePage === false) {
        Logger.warn('stable/legacy notion 衝突，保留 stable 資料', {
          action: 'migration_batch',
          stableUrl: sanitizeUrlForLogging(stableUrl),
          legacyUrl: sanitizeUrlForLogging(originalUrl),
        });
      }
    }

    // 無論是否補遷移都設定 alias
    await this._setUrlAliasSafe(originalUrl, stableUrl);
    return supplemented;
  }

  /**
   * 嘗試批量遷移至穩定 URL
   *
   * @param {object} params
   * @param {string} params.url
   * @param {string} params.stableUrl
   * @param {Array} params.oldHighlights
   * @returns {Promise<string>} 最終報告用的 URL
   * @private
   */
  async _tryBatchStableMigration({ url, stableUrl, oldHighlights }) {
    try {
      const migrated = await this.migrateStorageKey(stableUrl, url, {
        convertFormat: true,
        formatConverter: MigrationService._convertHighlightFormat,
      });

      if (migrated) {
        return stableUrl;
      }

      const supplemented = await this._supplementBatchSavedMetadata(url, stableUrl);
      if (supplemented) {
        return stableUrl;
      }

      await this._applyInPlaceConversion(url, oldHighlights);
      return url;
    } catch (error) {
      Logger.warn('遷移至穩定 URL 失敗，回退為原地轉換', {
        action: 'migration_batch',
        url: sanitizeUrlForLogging(url),
        error: error?.message ?? String(error),
      });
      await this._applyInPlaceConversion(url, oldHighlights);
      return url;
    }
  }

  /**
   * 組裝批量遷移結果物件（純函數）
   *
   * @param {string} reportUrl
   * @param {Array} oldHighlights
   * @returns {object}
   * @private
   */
  static _finalizeBatchResult(reportUrl, oldHighlights) {
    return {
      status: 'success',
      url: sanitizeUrlForLogging(reportUrl),
      count: oldHighlights.length,
      pending: oldHighlights.filter(item => !item.rangeInfo).length,
    };
  }
}
