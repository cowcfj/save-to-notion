/**
 * Google Drive Sync Actions
 */

/**
 * @typedef {object} DriveSyncStatusUpdatedRequest
 * @property {'DRIVE_SYNC_STATUS_UPDATED'} action
 * @property {string | null} lastKnownRemoteUpdatedAt
 * @property {string | null} lastSuccessfulUploadAt
 */

/**
 * @typedef {object} DriveSyncStatusUpdatedResponse
 * @property {boolean} [success]
 */

/**
 * @typedef {object} DriveSyncManualUploadRequest
 * @property {'DRIVE_SYNC_MANUAL_UPLOAD'} action
 * @property {boolean} [force]
 */

/**
 * @typedef {object} DriveSyncManualUploadResponse
 * @property {boolean} success
 * @property {string} [error]
 * @property {string} [errorCode]
 * @property {string | null} [remoteUpdatedAt]
 * @property {string | null} [updatedAt]
 */

/**
 * @typedef {object} DriveSyncManualDownloadRequest
 * @property {'DRIVE_SYNC_MANUAL_DOWNLOAD'} action
 */

/**
 * @typedef {object} DriveSyncManualDownloadResponse
 * @property {boolean} success
 * @property {string} [error]
 * @property {number} [writtenKeys]
 */

/**
 * @typedef {object} DriveSyncConflictRequest
 * @property {'DRIVE_SYNC_CONFLICT'} action
 * @property {'REMOTE_SNAPSHOT_NEWER'} conflictType
 * @property {string} remoteUpdatedAt
 */

/**
 * @typedef {object} DriveSyncConflictResponse
 * @property {boolean} [success]
 */

/**
 * @typedef {object} DriveSyncScheduleUpdatedRequest
 * @property {'DRIVE_SYNC_SCHEDULE_UPDATED'} action
 * @property {'off' | 'daily' | 'weekly' | 'monthly'} frequency
 */

/**
 * @typedef {object} DriveSyncScheduleUpdatedResponse
 * @property {boolean} [success]
 */

export const DRIVE_SYNC_ACTIONS = {
  /**
   * Request: {@link DriveSyncStatusUpdatedRequest}
   * Response: {@link DriveSyncStatusUpdatedResponse}
   *
   * @type {DriveSyncStatusUpdatedRequest['action']}
   */
  DRIVE_SYNC_STATUS_UPDATED: 'DRIVE_SYNC_STATUS_UPDATED',
  /**
   * Request: {@link DriveSyncManualUploadRequest}
   * Response: {@link DriveSyncManualUploadResponse}
   *
   * @type {DriveSyncManualUploadRequest['action']}
   */
  DRIVE_SYNC_MANUAL_UPLOAD: 'DRIVE_SYNC_MANUAL_UPLOAD',
  /**
   * Request: {@link DriveSyncManualDownloadRequest}
   * Response: {@link DriveSyncManualDownloadResponse}
   *
   * @type {DriveSyncManualDownloadRequest['action']}
   */
  DRIVE_SYNC_MANUAL_DOWNLOAD: 'DRIVE_SYNC_MANUAL_DOWNLOAD',
  /**
   * Request: {@link DriveSyncConflictRequest}
   * Response: {@link DriveSyncConflictResponse}
   *
   * @type {DriveSyncConflictRequest['action']}
   */
  DRIVE_SYNC_CONFLICT: 'DRIVE_SYNC_CONFLICT',
  /**
   * Request: {@link DriveSyncScheduleUpdatedRequest}
   * Response: {@link DriveSyncScheduleUpdatedResponse}
   *
   * @type {DriveSyncScheduleUpdatedRequest['action']}
   */
  DRIVE_SYNC_SCHEDULE_UPDATED: 'DRIVE_SYNC_SCHEDULE_UPDATED',
};
