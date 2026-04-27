/**
 * Drive Sync Background Handlers Tests
 */

import { RUNTIME_ACTIONS } from '../../scripts/config/shared/runtimeActions.js';
import { createDriveSyncHandlers } from '../../scripts/background/handlers/driveSyncHandlers.js';
import * as driveClient from '../../scripts/auth/driveClient.js';
import * as driveSnapshot from '../../scripts/sync/driveSnapshot.js';
import * as driveAlarmScheduler from '../../scripts/background/handlers/driveAlarmScheduler.js';
import Logger from '../../scripts/utils/Logger.js';
import { DRIVE_SYNC_ERROR_CODES } from '../../scripts/config/extension/driveSyncErrorCodes.js';

describe('Drive Sync Handlers', () => {
  let handlers;
  let mockSendMessage;

  beforeEach(() => {
    mockSendMessage = jest.fn().mockResolvedValue({});
    globalThis.chrome = {
      runtime: {
        sendMessage: mockSendMessage,
      },
    };
    globalThis.Logger = {
      debug: jest.fn(),
      start: jest.fn(),
      ready: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      success: jest.fn(),
    };

    jest
      .spyOn(driveClient, 'uploadDriveSnapshot')
      .mockResolvedValue({ success: true, updatedAt: 'x' });
    jest.spyOn(driveClient, 'downloadDriveSnapshot').mockResolvedValue({
      metadata: { updated_at: 'y' },
      payload: { highlights: [], saved_states: [] },
    });
    jest.spyOn(driveClient, 'getDriveSyncMetadata').mockResolvedValue({
      installationId: 'installation-123',
      profileId: 'profile-123',
      frequency: 'daily',
      dirtyRevision: 7,
      lastKnownRemoteUpdatedAt: '2026-04-20T00:00:00.000Z',
      lastSuccessfulUploadAt: null,
    });
    jest.spyOn(driveClient, 'updateDriveSyncRunMetadata').mockResolvedValue();
    jest.spyOn(driveClient, 'clearDriveDirty').mockResolvedValue();
    jest.spyOn(driveClient, 'setDriveFrequency').mockResolvedValue();
    jest.spyOn(driveAlarmScheduler, 'setupDriveAlarm').mockResolvedValue();
    jest.spyOn(Logger, 'warn').mockImplementation(() => {});

    jest.spyOn(driveSnapshot, 'buildUnifiedPageStateFromLocalStorage').mockResolvedValue({
      pages: new Map(),
      urlAliases: new Map(),
    });
    jest.spyOn(driveSnapshot, 'buildDriveSnapshot').mockResolvedValue({
      metadata: {
        updated_at: 'x',
        item_counts: { highlights: 0, saved_states: 0 },
      },
      payload: { highlights: [], saved_states: [], url_aliases: {} },
    });
    jest.spyOn(driveSnapshot, 'applyDriveSnapshotToLocalStorage').mockResolvedValue({
      writtenKeys: ['a', 'b'],
      removedKeys: ['c'],
    });

    handlers = createDriveSyncHandlers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete globalThis.chrome;
    delete globalThis.Logger;
  });

  describe('handleManualUpload', () => {
    it('should upload successfully and broadcast', async () => {
      const result = await handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD]({ force: false });

      expect(driveSnapshot.buildUnifiedPageStateFromLocalStorage).toHaveBeenCalled();
      expect(driveSnapshot.buildDriveSnapshot).toHaveBeenCalled();
      expect(driveClient.uploadDriveSnapshot).toHaveBeenCalledWith(
        {
          metadata: {
            updated_at: 'x',
            item_counts: { highlights: 0, saved_states: 0 },
          },
          payload: { highlights: [], saved_states: [], url_aliases: {} },
        },
        false,
        {
          lastKnownRemoteUpdatedAt: '2026-04-20T00:00:00.000Z',
          sourceInstallationId: 'installation-123',
          sourceProfileId: 'profile-123',
        }
      );

      expect(driveClient.updateDriveSyncRunMetadata).toHaveBeenCalledWith({
        type: 'upload',
        success: true,
        remoteUpdatedAt: 'x',
      });
      expect(driveClient.clearDriveDirty).toHaveBeenCalledWith({
        snapshotHash: expect.any(String),
        frequency: 'daily',
        expectedDirtyRevision: 7,
      });

      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED,
        lastKnownRemoteUpdatedAt: '2026-04-20T00:00:00.000Z',
        lastSuccessfulUploadAt: null,
      });

      expect(result.success).toBe(true);
    });

    it('should handle conflict gracefully', async () => {
      driveClient.uploadDriveSnapshot.mockResolvedValue({
        success: false,
        errorCode: DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER,
        message: 'Remote snapshot is newer',
        remoteUpdatedAt: '2026-04-21T01:02:03.000Z',
      });

      const result = await handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD]({});

      expect(driveClient.updateDriveSyncRunMetadata).toHaveBeenCalledWith({
        type: 'upload',
        success: false,
        errorCode: DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER,
        remoteUpdatedAt: '2026-04-21T01:02:03.000Z',
      });

      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED,
        lastKnownRemoteUpdatedAt: '2026-04-20T00:00:00.000Z',
        lastSuccessfulUploadAt: null,
      });
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_CONFLICT,
        conflictType: DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER,
        remoteUpdatedAt: '2026-04-21T01:02:03.000Z',
      });

      // CONFLICT 必須在 STATUS_UPDATED 之前送出，避免 UI 先收到通用狀態更新再被迫重繪為 conflict 視圖
      const conflictCallIndex = mockSendMessage.mock.calls.findIndex(
        ([payload]) => payload?.action === RUNTIME_ACTIONS.DRIVE_SYNC_CONFLICT
      );
      const statusUpdatedCallIndex = mockSendMessage.mock.calls.findIndex(
        ([payload]) => payload?.action === RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED
      );
      expect(conflictCallIndex).toBeGreaterThan(-1);
      expect(statusUpdatedCallIndex).toBeGreaterThan(-1);
      expect(conflictCallIndex).toBeLessThan(statusUpdatedCallIndex);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER);
      expect(result.remoteUpdatedAt).toBe('2026-04-21T01:02:03.000Z');
    });

    it('should ignore conflict broadcast if remoteUpdatedAt is invalid', async () => {
      driveClient.uploadDriveSnapshot.mockResolvedValue({
        success: false,
        errorCode: DRIVE_SYNC_ERROR_CODES.REMOTE_SNAPSHOT_NEWER,
        remoteUpdatedAt: 'Invalid Date',
      });

      const result = await handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD]({});

      expect(mockSendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: RUNTIME_ACTIONS.DRIVE_SYNC_CONFLICT })
      );
      expect(result.success).toBe(false);
    });

    it('should swallow errors when broadcastDriveSyncUpdate fails nicely', async () => {
      driveClient.getDriveSyncMetadata
        .mockResolvedValueOnce({ installationId: '1', profileId: '2' })
        .mockRejectedValue(new Error('metadata error'));

      const result = await handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD]({});
      expect(result.success).toBe(true);
    });

    it('should persist failed upload metadata and broadcast when snapshot build throws', async () => {
      driveSnapshot.buildUnifiedPageStateFromLocalStorage.mockRejectedValue(
        new Error('build failed')
      );

      const result = await handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_UPLOAD]({});

      expect(driveClient.updateDriveSyncRunMetadata).toHaveBeenCalledWith({
        type: 'upload',
        success: false,
        errorCode: DRIVE_SYNC_ERROR_CODES.UPLOAD_FAILED,
      });
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED,
        lastKnownRemoteUpdatedAt: '2026-04-20T00:00:00.000Z',
        lastSuccessfulUploadAt: null,
      });
      expect(result).toEqual({
        success: false,
        errorCode: DRIVE_SYNC_ERROR_CODES.UPLOAD_FAILED,
        error: 'build failed',
      });
    });
  });

  describe('handleManualDownload', () => {
    it('should download and apply successfully', async () => {
      const result = await handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_DOWNLOAD]({});

      expect(driveClient.downloadDriveSnapshot).toHaveBeenCalled();
      expect(driveSnapshot.applyDriveSnapshotToLocalStorage).toHaveBeenCalledWith({
        metadata: { updated_at: 'y' },
        payload: { highlights: [], saved_states: [] },
      });

      expect(driveClient.updateDriveSyncRunMetadata).toHaveBeenCalledWith({
        type: 'download',
        success: true,
        remoteUpdatedAt: 'y',
      });
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED,
        lastKnownRemoteUpdatedAt: '2026-04-20T00:00:00.000Z',
        lastSuccessfulUploadAt: null,
      });

      expect(result.success).toBe(true);
      expect(result.writtenKeys).toBe(2); // Since mock returns ['a', 'b']
    });

    it('should catch download errors and broadcast', async () => {
      const snapshotError = new Error('NO_REMOTE_SNAPSHOT');
      snapshotError.code = DRIVE_SYNC_ERROR_CODES.NO_REMOTE_SNAPSHOT;
      driveClient.downloadDriveSnapshot.mockRejectedValue(snapshotError);

      const result = await handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_DOWNLOAD]({});

      expect(driveClient.updateDriveSyncRunMetadata).toHaveBeenCalledWith({
        type: 'download',
        success: false,
        errorCode: DRIVE_SYNC_ERROR_CODES.NO_REMOTE_SNAPSHOT,
      });
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED,
        lastKnownRemoteUpdatedAt: '2026-04-20T00:00:00.000Z',
        lastSuccessfulUploadAt: null,
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(DRIVE_SYNC_ERROR_CODES.NO_REMOTE_SNAPSHOT);
      expect(result.error).toBe('NO_REMOTE_SNAPSHOT');
    });

    it('should persist failed download metadata and broadcast when apply throws', async () => {
      driveSnapshot.applyDriveSnapshotToLocalStorage.mockReturnValue(
        Promise.reject(new Error('apply failed'))
      );

      const result = await handlers[RUNTIME_ACTIONS.DRIVE_SYNC_MANUAL_DOWNLOAD]({});

      expect(driveClient.updateDriveSyncRunMetadata).toHaveBeenCalledWith({
        type: 'download',
        success: false,
        errorCode: DRIVE_SYNC_ERROR_CODES.DOWNLOAD_FAILED,
      });
      expect(mockSendMessage).toHaveBeenCalledWith({
        action: RUNTIME_ACTIONS.DRIVE_SYNC_STATUS_UPDATED,
        lastKnownRemoteUpdatedAt: '2026-04-20T00:00:00.000Z',
        lastSuccessfulUploadAt: null,
      });
      expect(result).toEqual({
        success: false,
        errorCode: DRIVE_SYNC_ERROR_CODES.DOWNLOAD_FAILED,
        error: 'apply failed',
      });
    });
  });

  describe('handler map boundaries', () => {
    it('should not expose DRIVE_SYNC_CONFLICT as a background request handler', () => {
      expect(handlers[RUNTIME_ACTIONS.DRIVE_SYNC_CONFLICT]).toBeUndefined();
    });
  });

  describe('handleScheduleUpdated', () => {
    it('should handle valid frequency and schedule alarm', async () => {
      const result = await handlers[RUNTIME_ACTIONS.DRIVE_SYNC_SCHEDULE_UPDATED]({
        frequency: 'daily',
      });
      expect(driveClient.setDriveFrequency).toHaveBeenCalledWith('daily');
      expect(driveAlarmScheduler.setupDriveAlarm).toHaveBeenCalledWith('daily');
      expect(result.success).toBe(true);
    });

    it('should fail cleanly on invalid frequency', async () => {
      const result = await handlers[RUNTIME_ACTIONS.DRIVE_SYNC_SCHEDULE_UPDATED]({
        frequency: 'hourly',
      });
      expect(driveClient.setDriveFrequency).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid frequency/);
    });

    it('should catch exceptions thrown during setup', async () => {
      driveClient.setDriveFrequency.mockRejectedValue(new Error('storage locked'));
      const result = await handlers[RUNTIME_ACTIONS.DRIVE_SYNC_SCHEDULE_UPDATED]({
        frequency: 'monthly',
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('storage locked');
    });
  });
});
