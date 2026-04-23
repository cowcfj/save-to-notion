/**
 * Notion Data API transport 與重試配置。
 *
 * 供 Background 與 extension pages 共用，
 * Content Scripts MUST NOT import 此模組。
 */

// 避免物件字面量內部的重複定義
const _NOTION_API_VERSION = '2025-09-03';
const _NOTION_MAX_RETRIES = 3;
const _NOTION_RETRY_DELAY = 1000;

export const NOTION_API = Object.freeze({
  // [Breaking Change] API 版本 2025-09-03 新增多資料來源資料庫支援。
  // 此版本為必要版本；使用舊版本將導致錯誤：
  // "Databases with multiple data sources are not supported in this API version"。
  VERSION: _NOTION_API_VERSION,
  BASE_URL: 'https://api.notion.com/v1',
  BLOCKS_PER_BATCH: 100,
  MAX_RETRIES: _NOTION_MAX_RETRIES,
  RETRY_DELAY: _NOTION_RETRY_DELAY,

  // 操作特定配置
  CHECK_RETRIES: 2,
  CHECK_DELAY: 500,
  CREATE_RETRIES: 3,
  CREATE_DELAY: 600,
  DELETE_RETRIES: 1,
  DELETE_DELAY: 300,

  // Notion API 限制：每秒最多 3 個請求（3 req/s = 333ms/req）
  // 使用 350ms 確保安全範圍
  RATE_LIMIT_DELAY: 350,

  // 批量刪除配置
  DELETE_CONCURRENCY: 3,
  DELETE_BATCH_DELAY_MS: 1000,

  PAGE_SIZE: 100,
  HIGHLIGHT_SECTION_HEADER: '📝 頁面標記',

  // ---- NotionService 別名（與主要欄位一致）----
  API_VERSION: _NOTION_API_VERSION,
  DEFAULT_MAX_RETRIES: _NOTION_MAX_RETRIES,
  DEFAULT_BASE_DELAY: _NOTION_RETRY_DELAY,
});
