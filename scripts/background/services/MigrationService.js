import Logger from '../../utils/Logger.js';
import { sanitizeUrlForLogging } from '../../utils/LogSanitizer.js';
import { isRootUrl, computeStableUrl } from '../../utils/urlUtils.js';
import { ERROR_MESSAGES } from '../../config/messages/errorMessages.js';
import { hasNotionData, isSameNotionPage } from '../utils/migrationMetadataUtils.js';

const MIGRATION_CONFIG = Object.freeze({
  SCRIPT_READY_MAX_RETRIES: 10,
  SCRIPT_READY_RETRY_DELAY: 200,
});

const MIGRATION_WRITE_RESULTS = Object.freeze({
  SUCCESS: 'success',
  CLEANUP_NEEDED: 'cleanup_needed',
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
   * @returns {Promise<boolean>} - 是否執行了遷移
   */
  async migrateStorageKey(stableUrl, legacyUrl, options = {}) {
    if (this._isInvalidMigrationTarget(stableUrl, legacyUrl)) {
      return false;
    }

    if (this._shouldBlockRootMigration(stableUrl, legacyUrl)) {
      return false;
    }

    try {
      const { pageData, legacyHighlights } = await this._loadLegacyMigrationData(legacyUrl);
      if (this._isNoDataToMigrate(pageData, legacyHighlights)) {
        return false;
      }

      return await this._migrateLoadedStorageData({
        stableUrl,
        legacyUrl,
        pageData,
        legacyHighlights,
        options,
      });
    } catch (error) {
      Logger.error('Migration failed', {
        action: 'migrate:storage-key',
        result: 'failure',
        error: error.message,
        legacy: sanitizeUrlForLogging(legacyUrl),
        stable: sanitizeUrlForLogging(stableUrl),
      });
      // 如果遷移失敗，保持舊數據不動，確保數據安全
      return false;
    }
  }

  /**
   * @param {string} stableUrl
   * @param {string} legacyUrl
   * @returns {boolean}
   * @private
   */
  _shouldBlockRootMigration(stableUrl, legacyUrl) {
    // 防禦層：拒絕遷移到根路徑 URL（首頁），防止不同頁面資料被覆寫到同一 key
    if (!isRootUrl(stableUrl)) {
      return false;
    }
    Logger.warn('Blocked migration to root URL', {
      action: 'migrate:validate-target',
      result: 'blocked',
      stable: sanitizeUrlForLogging(stableUrl),
      legacy: sanitizeUrlForLogging(legacyUrl),
    });
    return true;
  }

  /**
   * @param {string} legacyUrl
   * @returns {Promise<{ pageData: object|null, legacyHighlights: Array }>}
   * @private
   */
  async _loadLegacyMigrationData(legacyUrl) {
    const [pageData, legacyHighlightsRaw] = await Promise.all([
      this.storageService.getSavedPageData(legacyUrl),
      this.storageService.getHighlights(legacyUrl),
    ]);
    return {
      pageData,
      legacyHighlights: this._normalizeHighlights(legacyHighlightsRaw),
    };
  }

  /**
   * @param {object} params
   * @param {string} params.stableUrl
   * @param {string} params.legacyUrl
   * @param {object|null} params.pageData
   * @param {Array} params.legacyHighlights
   * @param {object} params.options
   * @returns {Promise<boolean>}
   * @private
   */
  async _migrateLoadedStorageData({ stableUrl, legacyUrl, pageData, legacyHighlights, options }) {
    const { existingHighlights, existingPageData } =
      await this._loadStableMigrationTarget(stableUrl);
    const { migratedHighlights, formatConverted } = await this._resolveMigratedHighlights({
      highlights: legacyHighlights,
      convertFormat: options.convertFormat,
      formatConverter: options.formatConverter,
      stableUrl,
      legacyUrl,
    });

    if (this._hasExistingHighlights(existingHighlights)) {
      return this._handleMigrationTargetConflict({
        stableUrl,
        legacyUrl,
        existingPageData,
        pageData,
        existingHighlights,
        migratedHighlights,
        existingHighlightsCount: existingHighlights.length,
      });
    }

    await this._writeMigrationData({
      stableUrl,
      legacyUrl,
      existingPageData,
      pageData,
      legacyHighlights,
      migratedHighlights,
      formatConverted,
    });
    return true;
  }

  /**
   * @param {string} stableUrl
   * @returns {Promise<{ existingHighlights: Array, existingPageData: object|null }>}
   * @private
   */
  async _loadStableMigrationTarget(stableUrl) {
    const [existingHighlightsRaw, existingPageData] = await Promise.all([
      this.storageService.getHighlights(stableUrl),
      this.storageService.getSavedPageData(stableUrl),
    ]);
    return {
      existingHighlights: this._normalizeHighlights(existingHighlightsRaw),
      existingPageData,
    };
  }

  /**
   * @param {object} params
   * @param {string} params.stableUrl
   * @param {string} params.legacyUrl
   * @param {object|null} params.existingPageData
   * @param {object|null} params.pageData
   * @param {Array} params.legacyHighlights
   * @param {Array} params.migratedHighlights
   * @param {boolean} params.formatConverted
   * @returns {Promise<void>}
   * @private
   */
  async _writeMigrationData({
    stableUrl,
    legacyUrl,
    existingPageData,
    pageData,
    legacyHighlights,
    migratedHighlights,
    formatConverted,
  }) {
    const pageDataToWrite = this._resolveMigrationPageData(existingPageData, pageData);
    this._logMigrationWriteStart({
      stableUrl,
      legacyUrl,
      pageDataToWrite,
      existingPageData,
      legacyHighlights,
      formatConverted,
    });
    await this._applyMigrationWriteAndCleanup(
      stableUrl,
      legacyUrl,
      pageDataToWrite,
      migratedHighlights
    );
  }

  /**
   * @param {object} params
   * @param {string} params.stableUrl
   * @param {string} params.legacyUrl
   * @param {object|null} params.pageDataToWrite
   * @param {object|null} params.existingPageData
   * @param {Array} params.legacyHighlights
   * @param {boolean} params.formatConverted
   * @returns {void}
   * @private
   */
  _logMigrationWriteStart({
    stableUrl,
    legacyUrl,
    pageDataToWrite,
    existingPageData,
    legacyHighlights,
    formatConverted,
  }) {
    Logger.start('Migrating legacy data to stable URL', {
      action: 'migrate:write-stable',
      result: 'started',
      legacy: sanitizeUrlForLogging(legacyUrl),
      stable: sanitizeUrlForLogging(stableUrl),
      hasPageData: Boolean(pageDataToWrite),
      hasExistingPageData: Boolean(existingPageData),
      hasHighlights: legacyHighlights.length > 0,
      formatConverted,
    });
  }

  /**
   * 判斷是否為無效的遷移目標
   *
   * @param {string} stableUrl - 目標穩定 URL
   * @param {string} legacyUrl - 來源舊版 URL
   * @returns {boolean} 是否無效
   * @private
   */
  _isInvalidMigrationTarget(stableUrl, legacyUrl) {
    if (!stableUrl) {
      return true;
    }
    if (!legacyUrl) {
      return true;
    }
    return stableUrl === legacyUrl;
  }

  /**
   * 判斷是否無數據需要遷移
   *
   * @param {object|null} pageData - 頁面數據
   * @param {Array} legacyHighlights - 標註數據
   * @returns {boolean} 是否無數據
   * @private
   */
  _isNoDataToMigrate(pageData, legacyHighlights) {
    if (pageData) {
      return false;
    }
    return legacyHighlights.length === 0;
  }

  /**
   * 判斷目標 key 是否已有 highlights
   *
   * @param {Array} existingHighlights - 目標已有標註
   * @returns {boolean} 是否已有標註
   * @private
   */
  _hasExistingHighlights(existingHighlights) {
    return existingHighlights.length > 0;
  }

  /**
   * stable side 只有 metadata 時，保留 stable metadata 並搬移 legacy highlights。
   *
   * @param {object|null} existingPageData - 目標已有頁面數據
   * @param {object|null} pageData - 來源頁面數據
   * @returns {object|null}
   * @private
   */
  _resolveMigrationPageData(existingPageData, pageData) {
    return existingPageData ?? pageData;
  }

  /**
   * 處理遷移目標已有數據之衝突（輔助函式）
   *
   * @param {object} params - 參數對象
   * @param {string} params.stableUrl - 目標穩定 URL
   * @param {string} params.legacyUrl - 來源舊版 URL
   * @param {object|null} params.existingPageData - 目標已有頁面數據
   * @param {object|null} params.pageData - 來源頁面數據
   * @param {Array} params.existingHighlights - 目標已有標註
   * @param {Array} params.migratedHighlights - 來源遷移後標註
   * @param {number} params.existingHighlightsCount - 目標已有標註數量
   * @returns {Promise<boolean>} 是否有補遷移 saved metadata
   * @private
   */
  async _handleMigrationTargetConflict({
    stableUrl,
    legacyUrl,
    existingPageData,
    pageData,
    existingHighlights,
    migratedHighlights,
    existingHighlightsCount,
  }) {
    if (this._areHighlightsEquivalent(existingHighlights, migratedHighlights)) {
      await this._setUrlAliasSafe(legacyUrl, stableUrl);
      const cleanupResult = await this._clearLegacyKeysForMigration(stableUrl, legacyUrl);
      Logger.info('Migration stable data already present; completed legacy cleanup', {
        action: 'migrate:cleanup-existing',
        result: cleanupResult === MIGRATION_WRITE_RESULTS.SUCCESS ? 'success' : 'cleanup_needed',
        stable: sanitizeUrlForLogging(stableUrl),
        legacy: sanitizeUrlForLogging(legacyUrl),
        existingHighlightsCount,
      });
      return true;
    }

    const supplementedNotion = await this._supplementStableNotionIfNeeded({
      stableUrl,
      legacyUrl,
      stableSavedData: existingPageData,
      legacySavedData: pageData,
    });

    await this._setUrlAliasSafe(legacyUrl, stableUrl);

    Logger.warn('Migration target already has data, skipping highlight overwrite', {
      action: 'migrate:skip-overwrite',
      result: 'skipped',
      stable: sanitizeUrlForLogging(stableUrl),
      legacy: sanitizeUrlForLogging(legacyUrl),
      existingHighlightsCount,
      hasExistingPageData: Boolean(existingPageData),
      supplementedNotion,
    });
    return supplementedNotion;
  }

  /**
   * 執行遷移數據寫入與清除舊 Key（輔助函式）
   *
   * @param {string} stableUrl - 目標穩定 URL
   * @param {string} legacyUrl - 來源舊版 URL
   * @param {object|null} pageData - 頁面數據
   * @param {Array} migratedHighlights - 遷移後標註
   * @returns {Promise<string>}
   * @private
   */
  async _applyMigrationWriteAndCleanup(stableUrl, legacyUrl, pageData, migratedHighlights) {
    // 1. 原子寫入新 Key（全部成功後才刪除舊 key）
    await this.storageService.savePageDataAndHighlights(stableUrl, pageData, migratedHighlights);

    await this._setUrlAliasSafe(legacyUrl, stableUrl);

    // 2. 刪除舊 Key（使用 clearLegacyKeys 避免誤刪新寫入的 stable URL key）
    // clearLegacyKeys 僅刪除 saved_<normalizedUrl> 和 highlights_<normalizedUrl>，
    // 不會呼叫 computeStableUrl，確保不會與新寫入的 stableUrl key 衝突
    const cleanupResult = await this._clearLegacyKeysForMigration(stableUrl, legacyUrl);
    this._logMigrationWriteResult(stableUrl, cleanupResult);
    return cleanupResult;
  }

  /**
   * @param {string} stableUrl
   * @param {string} cleanupResult
   * @returns {void}
   * @private
   */
  _logMigrationWriteResult(stableUrl, cleanupResult) {
    if (cleanupResult !== MIGRATION_WRITE_RESULTS.SUCCESS) {
      return;
    }
    Logger.success('Migration successful', {
      action: 'migrate:write-cleanup',
      result: 'success',
      url: sanitizeUrlForLogging(stableUrl),
    });
  }

  /**
   * 清理 legacy key；stable write 已成功時，cleanup 失敗只留下可重試的 partial state。
   *
   * @param {string} stableUrl
   * @param {string} legacyUrl
   * @returns {Promise<string>}
   * @private
   */
  async _clearLegacyKeysForMigration(stableUrl, legacyUrl) {
    try {
      await this.storageService.clearLegacyKeys(legacyUrl);
      return MIGRATION_WRITE_RESULTS.SUCCESS;
    } catch (error) {
      Logger.warn('Migration stable write completed but legacy cleanup failed', {
        action: 'migrate:clear-legacy',
        result: 'failure',
        stable: sanitizeUrlForLogging(stableUrl),
        legacy: sanitizeUrlForLogging(legacyUrl),
        error: error?.message ?? String(error),
      });
      return MIGRATION_WRITE_RESULTS.CLEANUP_NEEDED;
    }
  }

  /**
   * 判斷 stable highlights 是否已是本次遷移結果，用於 retry cleanup。
   *
   * @param {Array} existingHighlights
   * @param {Array} migratedHighlights
   * @returns {boolean}
   * @private
   */
  _areHighlightsEquivalent(existingHighlights, migratedHighlights) {
    if (
      existingHighlights.length === 0 ||
      existingHighlights.length !== migratedHighlights.length
    ) {
      return false;
    }

    const existingIds = this._extractHighlightIds(existingHighlights);
    const migratedIds = this._extractHighlightIds(migratedHighlights);
    if (existingIds && migratedIds) {
      return this._haveSameHighlightIds(existingIds, migratedIds);
    }

    try {
      return JSON.stringify(existingHighlights) === JSON.stringify(migratedHighlights);
    } catch {
      return false;
    }
  }

  /**
   * @param {Array} highlights
   * @returns {string[]|null}
   * @private
   */
  _extractHighlightIds(highlights) {
    const ids = highlights.map(highlight => highlight?.id);
    if (ids.every(id => typeof id === 'string' && id.length > 0)) {
      return ids;
    }
    return null;
  }

  /**
   * @param {string[]} firstIds
   * @param {string[]} secondIds
   * @returns {boolean}
   * @private
   */
  _haveSameHighlightIds(firstIds, secondIds) {
    const secondSet = new Set(secondIds);
    if (secondSet.size !== firstIds.length) {
      return false;
    }
    return firstIds.every(id => secondSet.has(id));
  }

  /**
   * stable 已有 highlights 時，只補 notion metadata（不覆寫 highlights）
   *
   * @param {object} params - 參數對象
   * @param {string} params.stableUrl - 目標穩定 URL
   * @param {string} params.legacyUrl - 來源舊版 URL
   * @param {object|null} params.stableSavedData - 目標頁面數據
   * @param {object|null} params.legacySavedData - 來源頁面數據
   * @param {object} [options={}] - 其他選項
   * @param {object} [options.logContext={}] - 額外日志上下文
   * @param {object} [options.logMessages={}] - 自訂日志文案
   * @param {string} [options.logMessages.supplemented] - 補遷移成功文案
   * @param {string} [options.logMessages.conflict] - metadata 衝突文案
   * @returns {Promise<boolean>} 是否有補遷移 saved metadata
   * @private
   */
  async _supplementStableNotionIfNeeded(params, options = {}) {
    const { stableUrl, legacyUrl, stableSavedData, legacySavedData } = params;
    const { logContext = {}, logMessages = {} } = options;

    const hasStableNotion = hasNotionData(stableSavedData);
    const hasLegacyNotion = hasNotionData(legacySavedData);

    if (this._shouldSupplement(hasStableNotion, hasLegacyNotion)) {
      await this.storageService.setSavedPageData(stableUrl, legacySavedData);
      Logger.info(logMessages.supplemented ?? 'Supplemented notion metadata on stable URL', {
        action: logContext.action ?? 'migrate:supplement-notion',
        result: 'success',
        stable: sanitizeUrlForLogging(stableUrl),
        legacy: sanitizeUrlForLogging(legacyUrl),
        ...logContext,
      });
      return true;
    }

    const samePage = isSameNotionPage(stableSavedData, legacySavedData);
    if (this._hasConflict(hasStableNotion, hasLegacyNotion, samePage)) {
      Logger.warn(
        logMessages.conflict ?? 'Stable/legacy notion metadata conflict, keeping stable data',
        {
          action: logContext.action ?? 'migrate:supplement-notion',
          result: 'skipped',
          reason: 'notion_conflict',
          stable: sanitizeUrlForLogging(stableUrl),
          legacy: sanitizeUrlForLogging(legacyUrl),
          ...logContext,
        }
      );
    }

    return false;
  }

  /**
   * 判斷是否需要補 Notion 詮釋數據
   *
   * @param {boolean} hasStable - 目標是否有 Notion 數據
   * @param {boolean} hasLegacy - 來源是否有 Notion 數據
   * @returns {boolean} 是否需要補詮釋數據
   * @private
   */
  _shouldSupplement(hasStable, hasLegacy) {
    if (hasStable) {
      return false;
    }
    return hasLegacy;
  }

  /**
   * 判斷 Notion 詮釋數據是否衝突
   *
   * @param {boolean} hasStable - 目標是否有 Notion 數據
   * @param {boolean} hasLegacy - 來源是否有 Notion 數據
   * @param {boolean} samePage - 是否為相同頁面
   * @returns {boolean} 是否衝突
   * @private
   */
  _hasConflict(hasStable, hasLegacy, samePage) {
    if (!hasStable) {
      return false;
    }
    if (!hasLegacy) {
      return false;
    }
    return samePage === false;
  }

  /**
   * 設定 url_alias（失敗不阻斷主流程）
   *
   * @param {string} legacyUrl - 來源舊版 URL
   * @param {string} stableUrl - 目標穩定 URL
   * @returns {Promise<void>}
   * @private
   */
  async _setUrlAliasSafe(legacyUrl, stableUrl) {
    if (typeof this.storageService.setUrlAlias !== 'function') {
      return;
    }
    await Promise.resolve(this.storageService.setUrlAlias(legacyUrl, stableUrl))
      .then(() => {
        Logger.info('Set URL alias during migration', {
          action: 'migrate:set-alias',
          result: 'success',
          legacy: sanitizeUrlForLogging(legacyUrl),
          stable: sanitizeUrlForLogging(stableUrl),
        });
      })
      .catch(error => {
        Logger.warn('Failed to set URL alias during migration', {
          action: 'migrate:set-alias',
          result: 'failure',
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
    if (!value) {
      return [];
    }
    if (typeof value !== 'object') {
      return [];
    }
    if (Array.isArray(value.highlights)) {
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
    if (!this._hasHighlightsToConvert(convertFormat, highlights)) {
      return { migratedHighlights: highlights, formatConverted: false };
    }

    if (typeof formatConverter !== 'function') {
      Logger.warn('convertFormat enabled without a valid formatConverter, skipping conversion', {
        action: 'migrate:convert-format',
        result: 'skipped',
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
   * 判斷是否有 highlights 需要格式轉換。
   *
   * @param {boolean} convertFormat - 是否啟用格式轉換
   * @param {Array} highlights - 待遷移標註
   * @returns {boolean} 是否需要轉換
   * @private
   */
  _hasHighlightsToConvert(convertFormat, highlights) {
    if (!convertFormat) {
      return false;
    }
    if (!Array.isArray(highlights)) {
      return false;
    }
    return highlights.length > 0;
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

      Logger.start('Starting migration', {
        action: 'executeContentMigration',
        result: 'started',
        url: sanitizeUrlForLogging(url),
      });

      // 1. Check if data exists
      const data = await this.storageService.getHighlights(url);

      if (!data) {
        return { success: true, message: 'No data to migrate' };
      }

      // 2. Find or create tab
      const tabResolution = await this._resolveMigrationTab(url);
      const targetTab = tabResolution.tab;
      createdTabId = tabResolution.createdTabId;

      // 3. Inject migration-executor.js and wait for readiness
      await this._injectAndVerifyExecutor(targetTab.id);

      // 4. Execute migration
      const stats = await this._runPageMigration(targetTab.id);

      return this._formatMigrationSuccessResponse(url, stats);
    } catch (error) {
      const errorMsg = error?.message ?? String(error);
      Logger.error('Migration failed', {
        action: 'executeContentMigration',
        result: 'failure',
        error: errorMsg,
      });
      throw error; // Re-throw to let handler handle the error response format
    } finally {
      // 5. Cleanup
      await this._cleanupMigrationTabSafe(createdTabId);
    }
  }

  /**
   * 取得或建立用於遷移的分頁（輔助函式）
   *
   * @param {string} url - 目標遷移網址
   * @returns {Promise<{ tab: object, createdTabId: number|null }>} 包含分頁對象與新建分頁 ID
   * @private
   */
  async _resolveMigrationTab(url) {
    // 使用 queryTabs({}) 獲取所有 tabs 後手動過濾，避免 chrome.tabs.query({ url }) 的 match patterns 行為
    // 導致特殊字符 URL 匹配失敗或誤匹配
    const tabs = await this.tabService.queryTabs({});
    const existingTab = tabs.find(tab => tab.url === url);

    if (existingTab) {
      Logger.info('Using existing tab', {
        action: 'executeContentMigration',
        result: 'success',
        tabId: existingTab.id,
      });
      if (existingTab.status !== 'complete') {
        await this.tabService.waitForTabComplete(existingTab.id);
      }
      return { tab: existingTab, createdTabId: null };
    }

    const newTab = await this.tabService.createTab({
      url,
      active: false,
    });
    Logger.info('Created new tab', {
      action: 'executeContentMigration',
      result: 'success',
      tabId: newTab.id,
    });

    // Wait for tab to load if not already complete
    // 即使 createTab 返回時 status 為 complete，仍建議確保其內容腳本環境準備就緒
    if (newTab.status !== 'complete') {
      await this.tabService.waitForTabComplete(newTab.id);
    }

    return { tab: newTab, createdTabId: newTab.id };
  }

  /**
   * 注入並驗證 migration-executor（輔助函式）
   *
   * @param {number} tabId - 分頁 ID
   * @returns {Promise<void>}
   * @private
   */
  async _injectAndVerifyExecutor(tabId) {
    Logger.start('Injecting migration executor', {
      action: 'executeContentMigration',
      result: 'started',
      tabId,
    });
    await this.injectionService.injectAndExecute(tabId, ['dist/migration-executor.js'], null, {
      errorMessage: 'Failed to inject migration executor',
    });

    // Wait for script readiness
    await this._waitForScriptReady(tabId);
  }

  /**
   * 在頁面端執行 DOM 遷移（輔助函式）
   *
   * @param {number} tabId - 分頁 ID
   * @returns {Promise<object>} 頁面端返回之統計數據
   * @private
   */
  async _runPageMigration(tabId) {
    Logger.start('Executing DOM migration', {
      action: 'executeContentMigration',
      result: 'started',
      tabId,
    });
    const migrationResult = await this.injectionService.injectWithResponse(
      tabId,
      MigrationService._executeMigrationInPage,
      [],
      [
        ERROR_MESSAGES.USER_MESSAGES.MIGRATION_EXECUTOR_NOT_LOADED,
        ERROR_MESSAGES.USER_MESSAGES.HIGHLIGHTER_MANAGER_NOT_INITIALIZED,
      ]
    );

    return this._extractSuccessfulMigrationStats(migrationResult);
  }

  /**
   * 在頁面 context 中執行 DOM 遷移。此函式會被 chrome scripting 序列化，必須保持自足。
   *
   * @param {string} executorErrorMsg - executor 未載入時的錯誤訊息
   * @param {string} managerErrorMsg - highlighter manager 未初始化時的錯誤訊息
   * @returns {Promise<object>} 頁面端遷移結果
   * @private
   */
  static async _executeMigrationInPage(executorErrorMsg, managerErrorMsg) {
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
  }

  /**
   * 驗證頁面端遷移結果並取出統計數據。
   *
   * @param {object} migrationResult - 頁面端遷移結果
   * @returns {object} 遷移統計數據
   * @throws {Error} 當頁面端回傳錯誤或 rollback 結果時拋出
   * @private
   */
  _extractSuccessfulMigrationStats(migrationResult) {
    if (migrationResult?.error) {
      throw new Error(migrationResult.error);
    }
    const migrationExecutionError = this._resolveMigrationExecutionError(migrationResult);
    if (migrationExecutionError) {
      throw new Error(migrationExecutionError);
    }

    return migrationResult?.statistics ?? {};
  }

  /**
   * 格式化成功的遷移響應結果（輔助函式）
   *
   * @param {string} url - 遷移目標網址
   * @param {object} stats - 遷移統計數據
   * @returns {object} 響應結果
   * @private
   */
  _formatMigrationSuccessResponse(url, stats) {
    Logger.success('Migration completed', {
      action: 'executeContentMigration',
      result: 'success',
      url: sanitizeUrlForLogging(url),
      ...stats,
    });

    return {
      success: true,
      count: stats.newHighlightsCreated ?? 0,
      message: `Successfully migrated ${stats.newHighlightsCreated ?? 0} highlights`,
      statistics: stats,
    };
  }

  /**
   * 安全關閉為遷移而建立的分頁（輔助函式）
   *
   * @param {number|null} createdTabId - 建立的分頁 ID
   * @returns {Promise<void>}
   * @private
   */
  async _cleanupMigrationTabSafe(createdTabId) {
    if (createdTabId) {
      Logger.info('Closing tab', {
        action: 'executeContentMigration',
        result: 'success',
        tabId: createdTabId,
      });
      await this.tabService.removeTab(createdTabId).catch(() => {});
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
    const extraction = this._extractLegacyHighlights(snapshot.legacyData, url);
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
    const hasStableUrl = this._hasStableUrlCandidate(url, stableUrl);
    const [legacyData, stableData, stableSavedData] = await Promise.all([
      this.storageService.getHighlights(url),
      hasStableUrl ? this.storageService.getHighlights(stableUrl) : Promise.resolve(null),
      hasStableUrl ? this.storageService.getSavedPageData(stableUrl) : Promise.resolve(null),
    ]);
    const shouldMigrateToStable = this._shouldMigrateSnapshotToStable(
      hasStableUrl,
      stableData,
      stableSavedData
    );

    return {
      stableUrl,
      hasStableUrl,
      legacyData,
      // stable key 不存在，或 stable side 只有 saved metadata 且無 highlights 時才遷移。
      shouldMigrateToStable,
    };
  }

  /**
   * 判斷 URL 是否有不同於原始 URL 的 stable URL 候選。
   *
   * @param {string} originalUrl
   * @param {string} stableUrl
   * @returns {boolean}
   * @private
   */
  _hasStableUrlCandidate(originalUrl, stableUrl) {
    if (!stableUrl) {
      return false;
    }
    return stableUrl !== originalUrl;
  }

  /**
   * 判斷 storage snapshot 是否應遷移到 stable URL。
   *
   * @param {boolean} hasStableUrl
   * @param {any} stableData
   * @param {object|null} stableSavedData
   * @returns {boolean}
   * @private
   */
  _shouldMigrateSnapshotToStable(hasStableUrl, stableData, stableSavedData = null) {
    if (!hasStableUrl) {
      return false;
    }
    if (stableData == null) {
      return true;
    }
    const stableHighlights = this._normalizeHighlights(stableData);
    return stableHighlights.length === 0 && Boolean(stableSavedData);
  }

  /**
   * 提取並驗證舊版 highlights
   *
   * @param {any} data
   * @param {string} url
   * @returns {{ skipResult?: object, oldHighlights?: Array }}
   * @private
   */
  _extractLegacyHighlights(data, url) {
    if (!data) {
      return {
        skipResult: {
          status: 'skipped',
          reason: '無數據',
          url: sanitizeUrlForLogging(url),
        },
      };
    }

    const oldHighlights = this._normalizeHighlights(data);

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
   * 檢查 stable URL 是否可用於補遷移與 alias
   * 條件需與 migrateStorageKey 的 root URL 防護一致
   *
   * @param {string} originalUrl
   * @param {string} stableUrl
   * @returns {boolean}
   * @private
   */
  _isValidStableAliasTarget(originalUrl, stableUrl) {
    if (!stableUrl) {
      return false;
    }
    if (stableUrl === originalUrl) {
      return false;
    }
    return !isRootUrl(stableUrl);
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
    const canUseStableTarget = this._isValidStableAliasTarget(originalUrl, stableUrl);
    if (!canUseStableTarget) {
      return false;
    }

    let supplemented = false;
    try {
      const [stableSavedData, legacySavedData] = await Promise.all([
        this.storageService.getSavedPageData(stableUrl),
        this.storageService.getSavedPageData(originalUrl),
      ]);

      supplemented = await this._supplementStableNotionIfNeeded(
        {
          stableUrl,
          legacyUrl: originalUrl,
          stableSavedData,
          legacySavedData,
        },
        {
          logContext: { action: 'migration_batch' },
          logMessages: {
            supplemented: '已補遷移 saved metadata 到穩定 URL',
            conflict: 'stable/legacy notion 衝突，保留 stable 資料',
          },
        }
      );

      return supplemented;
    } finally {
      // 僅對合法 stable 目標設定 alias，避免 root URL 目標繞過防護
      if (canUseStableTarget) {
        await this._setUrlAliasSafe(originalUrl, stableUrl);
      }
    }
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
        result: 'failure',
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
