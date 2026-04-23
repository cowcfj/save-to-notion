/**
 * Drive Sync known core error codes.
 *
 * Only error codes with frontend branching logic are centralized here.
 * Server-returned codes not listed here MUST remain raw string pass-throughs
 * and MUST NOT be forced into this constant.
 */
export const DRIVE_SYNC_ERROR_CODES = Object.freeze({
  REMOTE_SNAPSHOT_NEWER: 'REMOTE_SNAPSHOT_NEWER',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  NO_REMOTE_SNAPSHOT: 'NO_REMOTE_SNAPSHOT',
  UNKNOWN: 'UNKNOWN',
});
