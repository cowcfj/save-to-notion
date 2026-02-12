import { Logger } from '../../utils/Logger.js';
import { sanitizeUrlForLogging } from '../../utils/urlUtils.js';

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
   * @param {object} sender - 發送者
   * @returns {Promise<object>} - 遷移結果
   */
  async executeContentMigration(request, sender) {
    // TODO: Implement content migration logic from migrationHandlers.js
    throw new Error('Not implemented yet');
  }
}
