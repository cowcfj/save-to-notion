/**
 * 遠端 API 及 OAuth 配置模組
 *
 * 注意：此模組僅供 Background Service Worker 使用，
 * 不應被打包進 Content Script bundle。
 */

// ==========================================
// Notion API 相關常量
// ==========================================

// 避免物件字面量內部的重複定義
const _NOTION_API_VERSION = '2025-09-03';
const _NOTION_MAX_RETRIES = 3;
const _NOTION_RETRY_DELAY = 1000;

export const NOTION_API = {
  // [Breaking Change] API version 2025-09-03 adds multi-data-source database support.
  // This version is required; using older versions will fail with:
  // "Databases with multiple data sources are not supported in this API version".
  VERSION: _NOTION_API_VERSION,
  BASE_URL: 'https://api.notion.com/v1',
  BLOCKS_PER_BATCH: 100, // 每批次最多區塊數
  MAX_RETRIES: _NOTION_MAX_RETRIES, // 最大重試次數
  RETRY_DELAY: _NOTION_RETRY_DELAY, // 基礎重試延遲（ms）

  // 操作特定配置
  CHECK_RETRIES: 2, // 檢查操作重試次數
  CHECK_DELAY: 500, // 檢查操作延遲（ms）
  CREATE_RETRIES: 3, // 創建操作重試次數
  CREATE_DELAY: 600, // 創建操作延遲（ms）
  DELETE_RETRIES: 1, // 刪除操作重試次數
  DELETE_DELAY: 300, // 刪除操作延遲（ms）

  // 速率限制配置
  // Notion API 限制：每秒最多 3 個請求（3 req/s = 333ms/req）
  // 使用 350ms 確保安全範圍
  RATE_LIMIT_DELAY: 350,

  // 批量刪除配置
  DELETE_CONCURRENCY: 3, // 刪除操作並發數
  DELETE_BATCH_DELAY_MS: 1000, // 批次刪除間延遲（ms）

  PAGE_SIZE: 100, // 分頁大小
  HIGHLIGHT_SECTION_HEADER: '📝 頁面標記', // 高亮標記區域的標題

  // ---- NotionService 別名（與主要欄位一致）----
  API_VERSION: _NOTION_API_VERSION,
  DEFAULT_MAX_RETRIES: _NOTION_MAX_RETRIES,
  DEFAULT_BASE_DELAY: _NOTION_RETRY_DELAY,
};

/**
 * Notion 服務配置（已棄用，請直接使用 NOTION_API）
 *
 * @deprecated 請改用 NOTION_API，此別名將在未來版本移除
 */
export const NOTION_CONFIG = NOTION_API;

// ==========================================
// Notion OAuth 相關常量
// ==========================================

/** 認證模式枚舉 */
export const AuthMode = {
  OAUTH: 'oauth',
  MANUAL: 'manual',
};

/**
 * Notion OAuth 配置
 * NOTION_OAUTH_SERVER_URL: 後端 Token 代理伺服器位址
 * NOTION_CLIENT_ID: Notion Public Integration 的 Client ID（公開資訊，非 Secret）
 * EXTENSION_API_KEY: 用於驗證 /notion/refresh 請求的 API Key
 *   ⚠️  必須與伺服器端 Cloudflare Worker 的 EXTENSION_API_KEY binding 保持一致
 *   ⚠️  建議透過 CI/CD 建置時以 @rollup/plugin-replace 注入，而非硬編碼
 */
export const NOTION_OAUTH = {
  // 部署後端時需更新為實際的 Cloudflare Workers URL
  SERVER_URL: 'https://save-to-notion-api.bulldrive.workers.dev',
  CLIENT_ID: '319d872b-594c-8139-81d3-0037cd2c93bd',
  TOKEN_ENDPOINT: '/v1/oauth/notion/token',
  REFRESH_ENDPOINT: '/v1/oauth/notion/refresh',
  // 此值必須與 Cloudflare Worker 的 EXTENSION_API_KEY secret 相同
  EXTENSION_API_KEY: '__EXTENSION_API_KEY__',
};

// ==========================================
// Block 解析相關常量
// ==========================================

/**
 * 程式語言映射表 (用於 DomConverter.mapLanguage)
 * 將常見縮寫或別名映射至 Notion API 支援的語言名稱
 */
export const CODE_LANGUAGE_MAP = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  md: 'markdown',
  html: 'html',
  css: 'css',
  json: 'json',
  sh: 'bash',
  bash: 'bash',
  c: 'c',
  cpp: 'c++',
  java: 'java',
  go: 'go',
  rust: 'rust',
};

/**
 * 支持嵌套 Children 的 Block 類型 (Notion API 2025-09-03)
 */
export const BLOCKS_SUPPORTING_CHILDREN = [
  'bulleted_list_item',
  'numbered_list_item',
  'to_do',
  'toggle',
  'callout',
  'column_list',
  'column',
];

/**
 * 在列表項 (List Item) 中不安全、需要被扁平化 (Flatten) 的子 Blocks 類型
 * Notion API 對於列表內嵌套複雜 Block (如圖片、Code、Header) 往往校驗失敗。
 */
export const UNSAFE_LIST_CHILDREN_FOR_FLATTENING = [
  'code',
  'image',
  'bookmark',
  'embed',
  'video',
  'pdf',
  'file',
  'audio',
  'equation',
  'divider',
  'table',
  'callout',
  'quote',
  'heading_1',
  'heading_2',
  'heading_3',
];
