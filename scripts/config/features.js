/**
 * 功能開關配置模組
 * 支持漸進式發布和動態功能控制
 *
 * 功能開關的作用：
 * 1. 漸進式發布 - 新功能可以先設為停用，測試充分後再啟用
 * 2. A/B 測試 - 為不同用戶群體啟用不同功能組合
 * 3. 快速回滾 - 發現問題時只需改變配置即可停用功能
 * 4. 環境區分 - 開發和生產環境使用不同配置
 *
 * 注意：此模組必須為純 ES6 模組，不可依賴 window 或 document
 */

/**
 * 功能開關配置
 *
 * 使用範例：
 * ```javascript
 * import { FEATURE_FLAGS } from './config/features.js';
 *
 * if (FEATURE_FLAGS.ENABLE_NEW_HIGHLIGHTER) {
 *   // 使用新版標註系統
 * } else {
 *   // 使用舊版標註系統
 * }
 * ```
 */
export const FEATURE_FLAGS = {
  /**
   * 啟用新版標註系統（CSS Highlight API）
   * 設為 false 可回退到舊版實現
   */
  ENABLE_NEW_HIGHLIGHTER: true,

  /**
   * 使用批量處理優化圖片收集
   * 設為 false 將使用順序處理（更慢但更穩定）
   */
  USE_BATCH_PROCESSING: true,

  /**
   * 啟用圖片 URL 驗證緩存
   * 設為 false 將每次都進行完整驗證
   */
  ENABLE_IMAGE_VALIDATION_CACHE: true,

  /**
   * 預設日誌級別
   * 可選值：'DEBUG', 'LOG', 'INFO', 'WARN', 'ERROR'
   *
   * 開發環境建議：'DEBUG' 或 'LOG'
   * 生產環境建議：'WARN' 或 'ERROR'
   */
  DEFAULT_LOG_LEVEL: 'INFO',
};

/**
 * 性能優化開關
 */
export const PERFORMANCE_FLAGS = {
  /**
   * 啟用 DOM 查詢緩存
   */
  ENABLE_DOM_QUERY_CACHE: true,

  /**
   * 啟用性能指標記錄
   */
  ENABLE_PERFORMANCE_METRICS: true,

  /**
   * 圖片收集時使用重試機制
   */
  ENABLE_IMAGE_RETRY: true,
};

/**
 * 實驗性功能開關
 * 這些功能尚未完全測試，預設為停用
 */
export const EXPERIMENTAL_FLAGS = {
  /**
   * 啟用內容快取機制（規劃中）
   */
  ENABLE_CONTENT_CACHE: false,

  /**
   * 啟用圖片上傳功能（規劃中）
   */
  ENABLE_IMAGE_UPLOAD: false,
};
