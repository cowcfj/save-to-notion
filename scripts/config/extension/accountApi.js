/**
 * Account 與 Google Drive Sync endpoint paths。
 *
 * 供 Background 與 extension pages 共用，
 * Content Scripts MUST NOT import 此模組。
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
  DRIVE_START: '/v1/account/drive/start',
  /** Google Drive Sync Auth URL JSON endpoint */
  DRIVE_START_URL: '/v1/account/drive/start-url',
  /** Google Drive Connection Management (GET/DELETE) */
  DRIVE_CONNECTION: '/v1/account/drive/connection',
  /** Google Drive Snapshot Status (GET) */
  DRIVE_SNAPSHOT_STATUS: '/v1/account/drive/snapshot/status',
  /** Google Drive Snapshot (GET/PUT) */
  DRIVE_SNAPSHOT: '/v1/account/drive/snapshot',
};
