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
  // [Breaking Change] API 版本 2025-09-03 新增多資料來源資料庫支援。
  // 此版本為必要版本；使用舊版本將導致錯誤：
  // "Databases with multiple data sources are not supported in this API version"。
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
 * Notion OAuth 端點路徑
 * 僅定義靜態端點路徑，網域與機密由 BUILD_ENV 提供。
 *
 * @see scripts/config/env.js — BUILD_ENV（Single Source of Truth）
 * @see docs/specs/BUILD_ENVIRONMENT_STRATEGY_SPEC.md §3.3
 */
export const NOTION_OAUTH = {
  TOKEN_ENDPOINT: '/v1/oauth/notion/token',
  REFRESH_ENDPOINT: '/v1/oauth/notion/refresh',
};

// ==========================================
// Account API 相關常量（Cloudflare-native account system）
// ==========================================

/**
 * Cloudflare account flow 端點路徑
 *
 * 本計劃使用 BUILD_ENV.OAUTH_SERVER_URL 作為 base URL。
 * 所有端點皆在 /v1/account/* 命名空間下，與 Notion OAuth 完整隔離。
 *
 * @see docs/plans/2026-04-17-cloudflare-frontend-account-integration-plan.md §3.1
 * @see scripts/config/env.example.js — BUILD_ENV.OAUTH_SERVER_URL
 */
export const ACCOUNT_API = {
  /** 啟動 Google 登入流程；需附帶 ?ext_id=<chrome.runtime.id>&callback_mode=bridge */
  GOOGLE_START: '/v1/account/google/start',
  /** Google callback bridge fallback page */
  CALLBACK_BRIDGE: '/v1/account/callback-bridge',
  /** 以一次性 account_ticket 換取正式 session token */
  SESSION_EXCHANGE: '/v1/account/session/exchange',
  /** 取得最小帳號資訊（需 Bearer token） */
  ME: '/v1/account/me',
  /** Google Drive Sync Auth Flow */
  DRIVE_START: '/v1/drive/start',
  /** Google Drive Connection Management (GET/DELETE) */
  DRIVE_CONNECTION: '/v1/drive/connection',
  /** Google Drive Snapshot Status (GET) */
  DRIVE_SNAPSHOT_STATUS: '/v1/drive/snapshot/status',
  /** Google Drive Snapshot (GET/PUT) */
  DRIVE_SNAPSHOT: '/v1/drive/snapshot',
};
