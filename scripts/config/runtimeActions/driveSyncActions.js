/**
 * Drive Sync 專用 runtime actions.
 *
 * Wire values MUST stay aligned with scripts/background/handlers/driveSyncHandlers.js,
 * scripts/background/handlers/driveAutoSync.js, and options Drive Sync controllers.
 */
export const DRIVE_SYNC_ACTIONS = Object.freeze({
  DRIVE_SYNC_STATUS_UPDATED: 'DRIVE_SYNC_STATUS_UPDATED',
  DRIVE_SYNC_MANUAL_UPLOAD: 'DRIVE_SYNC_MANUAL_UPLOAD',
  DRIVE_SYNC_MANUAL_DOWNLOAD: 'DRIVE_SYNC_MANUAL_DOWNLOAD',
  DRIVE_SYNC_CONFLICT: 'DRIVE_SYNC_CONFLICT',
  DRIVE_SYNC_SCHEDULE_UPDATED: 'DRIVE_SYNC_SCHEDULE_UPDATED',
});
