/**
 * Drive Sync 已知核心錯誤碼。
 *
 * 此常量供 Background handlers 與 extension pages 共用；
 * Content Scripts MUST NOT import 此模組。
 *
 * 僅收斂前端有明確分支邏輯的 error code。
 * Server 回傳但前端無固定 enum 承諾的字串（如 RATE_LIMIT_EXCEEDED）
 * MUST 保持 raw string pass-through，MUST NOT 被硬塞進此常量。
 */
export const DRIVE_SYNC_ERROR_CODES = Object.freeze({
  REMOTE_SNAPSHOT_NEWER: 'REMOTE_SNAPSHOT_NEWER',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  NO_REMOTE_SNAPSHOT: 'NO_REMOTE_SNAPSHOT',
  UNKNOWN: 'UNKNOWN',
});
